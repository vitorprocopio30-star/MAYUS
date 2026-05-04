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

async function prepareReplyAfterProcessing(params: {
  supabase: SupabaseClient;
  row: PendingWhatsAppMediaMessage;
}) {
  if (params.row.direction !== "inbound") return false;

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

    const replyPrepared = await prepareReplyAfterProcessing(params);
    return {
      message_id: params.row.id,
      status: mediaRecord.media_processing_status,
      reply_prepared: replyPrepared,
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
    return {
      message_id: params.row.id,
      status: "failed",
      reply_prepared: replyPrepared,
      error: message,
    };
  }
}

export async function processPendingWhatsAppMediaBatch(params: ProcessWhatsAppMediaBatchParams) {
  let query = params.supabase
    .from("whatsapp_messages")
    .select("id, tenant_id, contact_id, direction, message_type, content, media_filename, media_provider, media_processing_status, metadata, message_id_from_evolution")
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

  return {
    picked: rows.length,
    processed: results.filter((result) => result.status === "processed").length,
    unsupported: results.filter((result) => result.status === "unsupported").length,
    failed: results.filter((result) => result.status === "failed").length,
    replies_prepared: results.filter((result) => result.reply_prepared).length,
    results,
  };
}
