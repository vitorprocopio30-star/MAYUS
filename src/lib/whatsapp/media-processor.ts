import type { SupabaseClient } from "@supabase/supabase-js";
import { listTenantIntegrationsResolved } from "@/lib/integrations/server";
import { prepareWhatsAppSalesReplyForContact } from "@/lib/growth/whatsapp-sales-reply-runtime";
import {
  buildUnsupportedMediaRecord,
  processEvolutionMedia,
  processMetaCloudMedia,
  type WhatsAppStoredMedia,
} from "@/lib/whatsapp/media";

type PendingWhatsAppMediaMessage = {
  id: string;
  tenant_id: string;
  contact_id: string;
  direction: "inbound" | "outbound";
  message_type: string | null;
  content: string | null;
  media_filename: string | null;
  media_provider: string | null;
  media_processing_status: string | null;
  metadata: Record<string, any> | null;
  message_id_from_evolution: string | null;
  created_at?: string | null;
};

type ProcessWhatsAppMediaBatchParams = {
  supabase: SupabaseClient;
  limit?: number;
  messageId?: string | null;
};

type ProcessedMediaResult = {
  message_id: string;
  status: WhatsAppStoredMedia["media_processing_status"];
  reply_prepared: boolean;
  provider: string | null;
  kind: string;
  duration_ms: number;
  size_bytes?: number | null;
  mime_type?: string | null;
  has_storage_path?: boolean;
  error?: string;
};

function normalizeLimit(value: number | null | undefined) {
  const parsed = Number(value || 5);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(Math.floor(parsed), 1), 10);
}

function mediaKind(row: PendingWhatsAppMediaMessage) {
  return String(row.metadata?.media_kind || row.message_type || "document");
}

function webhookTrigger(row: PendingWhatsAppMediaMessage): "meta_webhook" | "evolution_webhook" {
  if (row.metadata?.webhook_trigger === "meta_webhook") return "meta_webhook";
  return row.media_provider === "meta_cloud" ? "meta_webhook" : "evolution_webhook";
}

function pruneMetadataAfterSuccess(metadata: Record<string, any>, mediaRecord: WhatsAppStoredMedia) {
  const next: Record<string, any> = {
    ...metadata,
    ...mediaRecord.metadata,
    media_processed_at: new Date().toISOString(),
  };

  if (mediaRecord.media_processing_status === "processed") {
    delete next.evolution_message_envelope;
    delete next.evolution_message_payload;
  }

  return next;
}

function truncateError(value: string | null | undefined) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 500) : null;
}

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function shouldPromoteSalesPlaybook(row: PendingWhatsAppMediaMessage, mediaRecord: WhatsAppStoredMedia) {
  if (mediaRecord.media_processing_status !== "processed" || !mediaRecord.media_text) return false;
  const haystack = normalizeText([
    row.content,
    row.media_filename,
    mediaRecord.media_filename,
    mediaRecord.media_summary,
    mediaRecord.media_text.slice(0, 3000),
  ].filter(Boolean).join(" "));

  const hasSalesSignal = /documento de vendas|playbook|comercial|vendas|sdr|closer|qualificacao|qualificar|proposta|oferta|cliente ideal|funil|lead/.test(haystack);
  const hasLegalIntakeSignal = /contracheque|desconto|consignado|beneficio|inss|aposentadoria|diagnostico|triagem/.test(haystack);
  return hasSalesSignal && hasLegalIntakeSignal;
}

async function promoteSalesPlaybookIfRelevant(params: {
  supabase: SupabaseClient;
  row: PendingWhatsAppMediaMessage;
  mediaRecord: WhatsAppStoredMedia;
}) {
  if (!shouldPromoteSalesPlaybook(params.row, params.mediaRecord)) return false;

  const { data } = await params.supabase
    .from("tenant_settings")
    .select("ai_features")
    .eq("tenant_id", params.row.tenant_id)
    .maybeSingle<{ ai_features: Record<string, any> | null }>();
  const aiFeatures = data?.ai_features && typeof data.ai_features === "object" ? data.ai_features : {};
  const mediaText = String(params.mediaRecord.media_text || "").replace(/\s+/g, " ").trim();
  const summary = String(params.mediaRecord.media_summary || mediaText).replace(/\s+/g, " ").trim();
  const nextAiFeatures = {
    ...aiFeatures,
    sales_playbook_context: mediaText.slice(0, 6000),
    sales_document_summary: summary.slice(0, 1200),
    sales_playbook_source: {
      channel: "whatsapp",
      message_id: params.row.id,
      media_filename: params.mediaRecord.media_filename || params.row.media_filename || null,
      promoted_at: new Date().toISOString(),
    },
  };

  const { error } = await params.supabase
    .from("tenant_settings")
    .update({ ai_features: nextAiFeatures })
    .eq("tenant_id", params.row.tenant_id);
  if (error) throw error;

  await params.supabase.from("system_event_logs").insert({
    tenant_id: params.row.tenant_id,
    user_id: null,
    source: "whatsapp",
    provider: "mayus",
    event_name: "whatsapp_sales_playbook_promoted",
    status: "ok",
    payload: {
      message_id: params.row.id,
      contact_id: params.row.contact_id,
      media_filename: params.mediaRecord.media_filename || params.row.media_filename || null,
      source: "whatsapp_media_document",
    },
    created_at: new Date().toISOString(),
  });

  return true;
}

async function insertDedupedNotification(params: {
  supabase: SupabaseClient;
  tenantId: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}) {
  try {
    const message = params.message.slice(0, 180);
    const existingQuery = params.supabase.from("notifications").select("id");
    if (typeof (existingQuery as any).eq !== "function") return;

    const { data: existing } = await existingQuery
      .eq("tenant_id", params.tenantId)
      .eq("title", params.title)
      .eq("message", message)
      .limit(1);

    if (existing?.length) return;

    await params.supabase.from("notifications").insert({
      tenant_id: params.tenantId,
      user_id: null,
      title: params.title,
      message,
      type: params.type,
      link_url: "/dashboard/conversas/whatsapp",
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[whatsapp-media-processor] Erro ao registrar alerta:", error);
  }
}

async function alertFailedMedia(params: {
  supabase: SupabaseClient;
  tenantId: string;
  row: PendingWhatsAppMediaMessage;
  error?: string | null;
}) {
  await insertDedupedNotification({
    supabase: params.supabase,
    tenantId: params.tenantId,
    title: "WhatsApp: falha ao processar midia",
    message: [
      `Mensagem ${params.row.id}`,
      `provider ${params.row.media_provider || "desconhecido"}`,
      `tipo ${mediaKind(params.row)}`,
      truncateError(params.error) || "erro nao informado",
    ].join(" - "),
    type: "error",
  });
}

async function alertFailedBatch(params: {
  supabase: SupabaseClient;
  tenantId: string;
  failed: number;
  picked: number;
}) {
  await insertDedupedNotification({
    supabase: params.supabase,
    tenantId: params.tenantId,
    title: "WhatsApp: batch de midia com falha",
    message: `Batch processou ${params.picked} midia(s) e encontrou ${params.failed} falha(s). Verifique o painel de observabilidade.`,
    type: "error",
  });
}

async function recordMediaEvent(params: {
  supabase: SupabaseClient;
  tenantId: string;
  row: PendingWhatsAppMediaMessage;
  eventName: "whatsapp_media_processed" | "whatsapp_media_failed";
  status: WhatsAppStoredMedia["media_processing_status"];
  replyPrepared: boolean;
  durationMs: number;
  mediaRecord?: WhatsAppStoredMedia | null;
  error?: string | null;
}) {
  try {
    await params.supabase.from("system_event_logs").insert({
      tenant_id: params.tenantId,
      user_id: null,
      source: "whatsapp",
      provider: params.mediaRecord?.media_provider || params.row.media_provider || null,
      event_name: params.eventName,
      status: params.status === "failed" ? "error" : "ok",
      payload: {
        message_id: params.row.id,
        contact_id: params.row.contact_id,
        provider: params.mediaRecord?.media_provider || params.row.media_provider || null,
        kind: mediaKind(params.row),
        status: params.status,
        duration_ms: params.durationMs,
        mime_type: params.mediaRecord?.media_mime_type || null,
        size_bytes: params.mediaRecord?.media_size_bytes ?? null,
        has_storage_path: Boolean(params.mediaRecord?.media_storage_path),
        reply_prepared: params.replyPrepared,
        error: truncateError(params.error),
      },
      created_at: new Date().toISOString(),
    });

    if (params.status === "failed") {
      await alertFailedMedia({
        supabase: params.supabase,
        tenantId: params.tenantId,
        row: params.row,
        error: params.error,
      });
    }
  } catch (error) {
    console.error("[whatsapp-media-processor] Erro ao registrar observabilidade:", error);
  }
}

async function recordBatchEvent(params: {
  supabase: SupabaseClient;
  durationMs: number;
  limit?: number;
  messageId?: string | null;
  rows: PendingWhatsAppMediaMessage[];
  results: ProcessedMediaResult[];
}) {
  const tenantIds = Array.from(new Set(params.rows.map((row) => row.tenant_id).filter(Boolean)));
  const failed = params.results.filter((result) => result.status === "failed").length;
  try {
    await params.supabase.from("system_event_logs").insert({
      tenant_id: tenantIds.length === 1 ? tenantIds[0] : null,
      user_id: null,
      source: "whatsapp",
      provider: "mayus",
      event_name: "whatsapp_media_batch_processed",
      status: failed > 0 ? "error" : "ok",
      payload: {
        duration_ms: params.durationMs,
        limit: normalizeLimit(params.limit),
        message_id: params.messageId || null,
        picked: params.results.length,
        processed: params.results.filter((result) => result.status === "processed").length,
        unsupported: params.results.filter((result) => result.status === "unsupported").length,
        failed,
        replies_prepared: params.results.filter((result) => result.reply_prepared).length,
      },
      created_at: new Date().toISOString(),
    });

    if (tenantIds.length === 1 && failed > 0) {
      await alertFailedBatch({
        supabase: params.supabase,
        tenantId: tenantIds[0],
        failed,
        picked: params.results.length,
      });
    }
  } catch (error) {
    console.error("[whatsapp-media-processor] Erro ao registrar batch:", error);
  }
}

async function prepareReplyAfterProcessing(params: {
  supabase: SupabaseClient;
  row: PendingWhatsAppMediaMessage;
}) {
  if (params.row.direction !== "inbound") return false;
  if (await hasNewerInboundMessage(params)) {
    await params.supabase.from("system_event_logs").insert({
      tenant_id: params.row.tenant_id,
      user_id: null,
      source: "whatsapp",
      provider: "mayus",
      event_name: "whatsapp_media_reply_suppressed_stale",
      status: "ok",
      payload: {
        message_id: params.row.id,
        contact_id: params.row.contact_id,
        reason: "newer_inbound_message_exists",
      },
      created_at: new Date().toISOString(),
    });
    return false;
  }

  try {
    await prepareWhatsAppSalesReplyForContact({
      supabase: params.supabase,
      tenantId: params.row.tenant_id,
      contactId: params.row.contact_id,
      trigger: webhookTrigger(params.row),
      notify: true,
      autoSendFirstResponse: true,
    });
    return true;
  } catch (error) {
    console.error("[whatsapp-media-processor] Erro ao preparar resposta MAYUS:", error);
    return false;
  }
}

async function hasNewerInboundMessage(params: {
  supabase: SupabaseClient;
  row: PendingWhatsAppMediaMessage;
}) {
  if (!params.row.created_at) return false;

  try {
    const query = params.supabase.from("whatsapp_messages").select("id");
    if (typeof (query as any).eq !== "function") return false;
    const { data, error } = await query
      .eq("tenant_id", params.row.tenant_id)
      .eq("contact_id", params.row.contact_id)
      .eq("direction", "inbound")
      .gt("created_at", params.row.created_at)
      .neq("id", params.row.id)
      .limit(1);

    if (error) return false;
    return Boolean(data?.length);
  } catch {
    return false;
  }
}

async function processMetaPendingMedia(params: {
  supabase: SupabaseClient;
  row: PendingWhatsAppMediaMessage;
}) {
  const metadata = params.row.metadata || {};
  const providerMediaId = String(metadata.provider_media_id || "").trim();
  if (!providerMediaId) throw new Error("Mensagem Meta sem provider_media_id.");

  const integrations = await listTenantIntegrationsResolved(params.row.tenant_id, ["meta_cloud"]);
  const phoneNumberId = String(metadata.meta_phone_number_id || "").trim();
  const provider = integrations.find((integration) => phoneNumberId && integration.instance_name?.split("|")[0] === phoneNumberId)
    || integrations.find((integration) => integration.provider === "meta_cloud");
  const token = String(provider?.api_key || "").trim();
  if (!token) throw new Error("Token Meta Cloud indisponivel para processar midia.");

  return processMetaCloudMedia({
    supabase: params.supabase,
    tenantId: params.row.tenant_id,
    contactId: params.row.contact_id,
    mediaId: providerMediaId,
    token,
    kind: mediaKind(params.row),
    caption: params.row.content,
    filename: params.row.media_filename || metadata.original_filename || null,
  });
}

async function processEvolutionPendingMedia(params: {
  supabase: SupabaseClient;
  row: PendingWhatsAppMediaMessage;
}) {
  const metadata = params.row.metadata || {};
  const instanceName = String(metadata.evolution_instance || "").trim();
  const messageEnvelope = metadata.evolution_message_envelope;
  const messagePayload = metadata.evolution_message_payload || messageEnvelope?.message;
  if (!instanceName || !messageEnvelope || !messagePayload) {
    throw new Error("Mensagem Evolution sem payload suficiente para processar midia.");
  }

  const integrations = await listTenantIntegrationsResolved(params.row.tenant_id, ["evolution"]);
  const provider = integrations.find((item) => item.instance_name?.split("|")[1] === instanceName)
    || integrations.find((item) => item.provider === "evolution");
  const [baseUrlRaw] = String(provider?.instance_name || "").split("|");
  const baseUrl = String(baseUrlRaw || "").replace(/\/$/, "");
  const apiKey = String(provider?.api_key || "").trim();
  if (!baseUrl || !apiKey) throw new Error("Integracao Evolution incompleta para processar midia.");

  const mediaRecord = await processEvolutionMedia({
    supabase: params.supabase,
    tenantId: params.row.tenant_id,
    contactId: params.row.contact_id,
    baseUrl,
    instanceName,
    apiKey,
    messageEnvelope,
    messagePayload,
    kind: mediaKind(params.row),
    caption: params.row.content,
  });

  return mediaRecord || buildUnsupportedMediaRecord({
    provider: "evolution",
    kind: mediaKind(params.row),
    providerMediaId: params.row.message_id_from_evolution,
    reason: "Evolution nao enviou bytes/base64 da midia e o download automatico falhou.",
  });
}

async function processOnePendingMedia(params: {
  supabase: SupabaseClient;
  row: PendingWhatsAppMediaMessage;
}): Promise<ProcessedMediaResult> {
  const metadata = params.row.metadata || {};
  const startedAt = Date.now();

  try {
    const mediaRecord = params.row.media_provider === "meta_cloud"
      ? await processMetaPendingMedia(params)
      : await processEvolutionPendingMedia(params);

    const { error: updateError } = await params.supabase
      .from("whatsapp_messages")
      .update({
        media_url: null,
        media_mime_type: mediaRecord.media_mime_type,
        media_filename: mediaRecord.media_filename || params.row.media_filename || null,
        media_size_bytes: mediaRecord.media_size_bytes,
        media_storage_path: mediaRecord.media_storage_path,
        media_provider: mediaRecord.media_provider || params.row.media_provider,
        media_processing_status: mediaRecord.media_processing_status,
        media_text: mediaRecord.media_text,
        media_summary: mediaRecord.media_summary,
        metadata: pruneMetadataAfterSuccess(metadata, mediaRecord),
      })
      .eq("id", params.row.id);

    if (updateError) throw updateError;

    try {
      await promoteSalesPlaybookIfRelevant({
        supabase: params.supabase,
        row: params.row,
        mediaRecord,
      });
    } catch (promotionError) {
      console.error("[whatsapp-media-processor] Erro ao promover documento de vendas:", promotionError);
    }

    const replyPrepared = await prepareReplyAfterProcessing(params);
    const durationMs = Date.now() - startedAt;
    await recordMediaEvent({
      supabase: params.supabase,
      tenantId: params.row.tenant_id,
      row: params.row,
      eventName: "whatsapp_media_processed",
      status: mediaRecord.media_processing_status,
      replyPrepared,
      durationMs,
      mediaRecord,
    });

    return {
      message_id: params.row.id,
      status: mediaRecord.media_processing_status,
      reply_prepared: replyPrepared,
      provider: mediaRecord.media_provider || params.row.media_provider || null,
      kind: mediaKind(params.row),
      duration_ms: durationMs,
      size_bytes: mediaRecord.media_size_bytes,
      mime_type: mediaRecord.media_mime_type,
      has_storage_path: Boolean(mediaRecord.media_storage_path),
    };
  } catch (error: any) {
    const message = error?.message || "Falha ao processar midia WhatsApp.";
    await params.supabase
      .from("whatsapp_messages")
      .update({
        media_url: null,
        media_processing_status: "failed",
        media_summary: message.slice(0, 500),
        metadata: {
          ...metadata,
          media_processing_error: message,
          media_failed_at: new Date().toISOString(),
        },
      })
      .eq("id", params.row.id);

    const replyPrepared = await prepareReplyAfterProcessing(params);
    const durationMs = Date.now() - startedAt;
    await recordMediaEvent({
      supabase: params.supabase,
      tenantId: params.row.tenant_id,
      row: params.row,
      eventName: "whatsapp_media_failed",
      status: "failed",
      replyPrepared,
      durationMs,
      error: message,
    });

    return {
      message_id: params.row.id,
      status: "failed",
      reply_prepared: replyPrepared,
      provider: params.row.media_provider || null,
      kind: mediaKind(params.row),
      duration_ms: durationMs,
      has_storage_path: false,
      error: message,
    };
  }
}

export async function processPendingWhatsAppMediaBatch(params: ProcessWhatsAppMediaBatchParams) {
  const startedAt = Date.now();
  let query = params.supabase
    .from("whatsapp_messages")
    .select("id, tenant_id, contact_id, direction, message_type, content, media_filename, media_provider, media_processing_status, metadata, message_id_from_evolution, created_at")
    .eq("media_processing_status", "pending")
    .order("created_at", { ascending: true })
    .limit(normalizeLimit(params.limit));

  if (params.messageId) {
    query = query.eq("id", params.messageId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as PendingWhatsAppMediaMessage[];
  const results: ProcessedMediaResult[] = [];

  for (const row of rows) {
    results.push(await processOnePendingMedia({ supabase: params.supabase, row }));
  }

  await recordBatchEvent({
    supabase: params.supabase,
    durationMs: Date.now() - startedAt,
    limit: params.limit,
    messageId: params.messageId,
    rows,
    results,
  });

  return {
    picked: rows.length,
    processed: results.filter((result) => result.status === "processed").length,
    unsupported: results.filter((result) => result.status === "unsupported").length,
    failed: results.filter((result) => result.status === "failed").length,
    replies_prepared: results.filter((result) => result.reply_prepared).length,
    results,
  };
}
