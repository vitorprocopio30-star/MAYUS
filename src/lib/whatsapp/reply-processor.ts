import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareWhatsAppSalesReplyForContact } from "@/lib/growth/whatsapp-sales-reply-runtime";
import type { WhatsAppSendProvider } from "@/lib/whatsapp/send-message";

type WhatsAppReplyTrigger = "meta_webhook" | "evolution_webhook";

type PendingWhatsAppReplyMessage = {
  id: string;
  tenant_id: string;
  contact_id: string;
  direction: "inbound" | "outbound";
  media_processing_status: string | null;
  metadata: Record<string, any> | null;
  created_at: string | null;
};

type ReplyProcessingStatus = "pending" | "processing" | string | null;

type ProcessWhatsAppReplyBatchParams = {
  supabase: SupabaseClient;
  limit?: number;
  messageId?: string | null;
};

function normalizeLimit(value: number | null | undefined) {
  const parsed = Number(value || 5);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(Math.floor(parsed), 1), 10);
}

const STALE_PROCESSING_MS = 2 * 60 * 1000;
const MAX_AUTO_RECOVERY_AGE_MS = 10 * 60 * 1000;
const MAX_PROCESSING_RECOVERY_ATTEMPTS = 2;

function truncateError(value: string | null | undefined) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 500) : null;
}

function replyTrigger(row: PendingWhatsAppReplyMessage): WhatsAppReplyTrigger {
  return row.metadata?.reply_trigger === "meta_webhook" ? "meta_webhook" : "evolution_webhook";
}

function mergeMetadata(row: PendingWhatsAppReplyMessage, patch: Record<string, any>) {
  return {
    ...(row.metadata || {}),
    ...patch,
  };
}

export async function enqueueWhatsAppReply(params: {
  supabase: SupabaseClient;
  messageId: string;
  trigger: WhatsAppReplyTrigger;
  preferredProvider?: WhatsAppSendProvider | null;
}) {
  const { data: row } = await params.supabase
    .from("whatsapp_messages")
    .select("metadata")
    .eq("id", params.messageId)
    .maybeSingle<{ metadata: Record<string, any> | null }>();

  await params.supabase
    .from("whatsapp_messages")
    .update({
      metadata: {
        ...(row?.metadata || {}),
        reply_processing_status: "pending",
        reply_trigger: params.trigger,
        reply_preferred_provider: params.preferredProvider || null,
        reply_enqueued_at: new Date().toISOString(),
      },
    })
    .eq("id", params.messageId);
}

async function recordReplyEvent(params: {
  supabase: SupabaseClient;
  row: PendingWhatsAppReplyMessage;
  eventName: "whatsapp_reply_processed" | "whatsapp_reply_failed" | "whatsapp_reply_stale_pending" | "whatsapp_reply_stale_processing_recovered" | "whatsapp_reply_stale_processing_suppressed";
  status: "ok" | "error" | "warning";
  durationMs?: number;
  error?: string | null;
  extraPayload?: Record<string, unknown>;
}) {
  await params.supabase.from("system_event_logs").insert({
    tenant_id: params.row.tenant_id,
    user_id: null,
    source: "whatsapp",
    provider: "mayus",
    event_name: params.eventName,
    status: params.status,
    payload: {
      message_id: params.row.id,
      contact_id: params.row.contact_id,
      trigger: replyTrigger(params.row),
      duration_ms: params.durationMs || 0,
      error: truncateError(params.error),
      ...(params.extraPayload || {}),
    },
    created_at: new Date().toISOString(),
  });
}

function getReplyProcessingStatus(row: PendingWhatsAppReplyMessage): ReplyProcessingStatus {
  return row.metadata?.reply_processing_status || null;
}

function getProcessingStartedAt(row: PendingWhatsAppReplyMessage) {
  return typeof row.metadata?.reply_processing_started_at === "string"
    ? row.metadata.reply_processing_started_at
    : row.created_at;
}

function isStaleProcessingReply(row: PendingWhatsAppReplyMessage) {
  if (getReplyProcessingStatus(row) !== "processing") return false;
  const startedAt = getProcessingStartedAt(row);
  if (!startedAt) return false;
  const startedMs = new Date(startedAt).getTime();
  return Number.isFinite(startedMs) && Date.now() - startedMs > STALE_PROCESSING_MS;
}

function getRecoveryAttempts(row: PendingWhatsAppReplyMessage) {
  const attempts = Number(row.metadata?.reply_processing_recovery_attempts || 0);
  return Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0;
}

async function hasNewerMessageThan(params: {
  supabase: SupabaseClient;
  row: PendingWhatsAppReplyMessage;
}) {
  if (!params.row.created_at) return false;
  const { data, error } = await params.supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("tenant_id", params.row.tenant_id)
    .eq("contact_id", params.row.contact_id)
    .gt("created_at", params.row.created_at)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return Boolean(data?.length);
}

async function insertDedupedNotification(params: {
  supabase: SupabaseClient;
  tenantId: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
}) {
  const message = params.message.slice(0, 180);
  const { data: existing } = await params.supabase
    .from("notifications")
    .select("id")
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
}

async function claimReply(params: {
  supabase: SupabaseClient;
  row: PendingWhatsAppReplyMessage;
}) {
  const currentStatus = getReplyProcessingStatus(params.row);
  const recoveryAttempts = currentStatus === "processing" ? getRecoveryAttempts(params.row) + 1 : 0;
  const metadata = mergeMetadata(params.row, {
    reply_processing_status: "processing",
    reply_processing_started_at: new Date().toISOString(),
    ...(currentStatus === "processing" ? {
      reply_processing_recovered_at: new Date().toISOString(),
      reply_processing_recovery_attempts: recoveryAttempts,
    } : {}),
  });
  let query = params.supabase
    .from("whatsapp_messages")
    .update({ metadata })
    .eq("id", params.row.id)

  if (currentStatus === "processing") {
    query = query.eq("metadata->>reply_processing_status", "processing");
  } else {
    query = query.eq("metadata->>reply_processing_status", "pending");
  }

  const { data, error } = await query
    .select("id, metadata")
    .maybeSingle<{ id: string; metadata: Record<string, any> | null }>();

  if (error) throw error;
  if (!data?.id) return false;
  params.row.metadata = data.metadata || metadata;
  return true;
}

async function processOneReply(params: {
  supabase: SupabaseClient;
  row: PendingWhatsAppReplyMessage;
}) {
  const startedAt = Date.now();
  const staleMs = params.row.created_at ? Date.now() - new Date(params.row.created_at).getTime() : 0;
  const currentStatus = getReplyProcessingStatus(params.row);

  if (staleMs > 10 * 60 * 1000 && !params.row.metadata?.reply_stale_alerted_at) {
    await recordReplyEvent({
      supabase: params.supabase,
      row: params.row,
      eventName: "whatsapp_reply_stale_pending",
      status: "warning",
    });
    await insertDedupedNotification({
      supabase: params.supabase,
      tenantId: params.row.tenant_id,
      title: "WhatsApp: resposta pendente atrasada",
      message: `Mensagem ${params.row.id} ficou mais de 10 minutos aguardando resposta automatica.`,
      type: "warning",
    });
    await params.supabase
      .from("whatsapp_messages")
      .update({ metadata: mergeMetadata(params.row, { reply_stale_alerted_at: new Date().toISOString() }) })
      .eq("id", params.row.id);
    params.row.metadata = mergeMetadata(params.row, { reply_stale_alerted_at: new Date().toISOString() });
  }

  try {
    if (currentStatus === "processing") {
      if (!isStaleProcessingReply(params.row)) {
        return {
          message_id: params.row.id,
          status: "skipped" as const,
          auto_sent: false,
          duration_ms: Date.now() - startedAt,
          skipped_reason: "processing_not_stale",
        };
      }

      const shouldSuppressStaleProcessing = staleMs > MAX_AUTO_RECOVERY_AGE_MS
        ? "stale_processing_too_old"
        : await hasNewerMessageThan({ supabase: params.supabase, row: params.row })
          ? "newer_message_exists"
          : null;

      if (shouldSuppressStaleProcessing) {
        await params.supabase
          .from("whatsapp_messages")
          .update({
            metadata: mergeMetadata(params.row, {
              reply_processing_status: "processed",
              reply_processed_at: new Date().toISOString(),
              reply_auto_sent: false,
              reply_processing_recovery_suppressed_at: new Date().toISOString(),
              reply_processing_recovery_reason: shouldSuppressStaleProcessing,
            }),
          })
          .eq("id", params.row.id);

        await recordReplyEvent({
          supabase: params.supabase,
          row: params.row,
          eventName: "whatsapp_reply_stale_processing_suppressed",
          status: "warning",
          durationMs: Date.now() - startedAt,
          extraPayload: { reason: shouldSuppressStaleProcessing },
        });

        return {
          message_id: params.row.id,
          status: "processed" as const,
          auto_sent: false,
          duration_ms: Date.now() - startedAt,
          recovered_reason: shouldSuppressStaleProcessing,
        };
      }

      if (getRecoveryAttempts(params.row) >= MAX_PROCESSING_RECOVERY_ATTEMPTS) {
        throw new Error("stale_processing_retry_limit");
      }

      await recordReplyEvent({
        supabase: params.supabase,
        row: params.row,
        eventName: "whatsapp_reply_stale_processing_recovered",
        status: "warning",
        durationMs: Date.now() - startedAt,
        extraPayload: { recovery_attempt: getRecoveryAttempts(params.row) + 1 },
      });
    }

    const claimed = await claimReply({
      supabase: params.supabase,
      row: params.row,
    });

    if (!claimed) {
      return {
        message_id: params.row.id,
        status: "skipped" as const,
        auto_sent: false,
        duration_ms: Date.now() - startedAt,
        skipped_reason: "already_claimed",
      };
    }

    const prepared = await prepareWhatsAppSalesReplyForContact({
      supabase: params.supabase,
      tenantId: params.row.tenant_id,
      contactId: params.row.contact_id,
      trigger: replyTrigger(params.row),
      notify: true,
      autoSendFirstResponse: true,
      preferredProvider: params.row.metadata?.reply_preferred_provider === "meta_cloud" || params.row.metadata?.reply_preferred_provider === "evolution"
        ? params.row.metadata.reply_preferred_provider
        : null,
    });
    const durationMs = Date.now() - startedAt;

    await params.supabase
      .from("whatsapp_messages")
      .update({
        metadata: mergeMetadata(params.row, {
          reply_processing_status: "processed",
          reply_processed_at: new Date().toISOString(),
          reply_auto_sent: prepared.autoSendResult.status === "sent",
        }),
      })
      .eq("id", params.row.id);

    await recordReplyEvent({
      supabase: params.supabase,
      row: params.row,
      eventName: "whatsapp_reply_processed",
      status: "ok",
      durationMs,
    });

    return {
      message_id: params.row.id,
      status: "processed" as const,
      auto_sent: prepared.autoSendResult.status === "sent",
      duration_ms: durationMs,
    };
  } catch (error: any) {
    const message = error?.message || "Falha ao preparar resposta WhatsApp.";
    const durationMs = Date.now() - startedAt;
    await params.supabase
      .from("whatsapp_messages")
      .update({
        metadata: mergeMetadata(params.row, {
          reply_processing_status: "failed",
          reply_failed_at: new Date().toISOString(),
          reply_processing_error: message,
        }),
      })
      .eq("id", params.row.id);

    await recordReplyEvent({
      supabase: params.supabase,
      row: params.row,
      eventName: "whatsapp_reply_failed",
      status: "error",
      durationMs,
      error: message,
    });
    await insertDedupedNotification({
      supabase: params.supabase,
      tenantId: params.row.tenant_id,
      title: "WhatsApp: falha ao preparar resposta",
      message: `Mensagem ${params.row.id} - ${truncateError(message) || "erro nao informado"}`,
      type: "error",
    });

    return {
      message_id: params.row.id,
      status: "failed" as const,
      auto_sent: false,
      duration_ms: durationMs,
      error: message,
    };
  }
}

export async function processPendingWhatsAppRepliesBatch(params: ProcessWhatsAppReplyBatchParams) {
  let query = params.supabase
    .from("whatsapp_messages")
    .select("id, tenant_id, contact_id, direction, media_processing_status, metadata, created_at")
    .eq("direction", "inbound")
    .eq("metadata->>reply_processing_status", "pending")
    .order("created_at", { ascending: true })
    .limit(normalizeLimit(params.limit));

  if (params.messageId) {
    query = query.eq("id", params.messageId);
  }

  const { data, error } = await query;
  if (error) throw error;

  let staleProcessingRows: PendingWhatsAppReplyMessage[] = [];
  if (!params.messageId) {
    const { data: processingData, error: processingError } = await params.supabase
      .from("whatsapp_messages")
      .select("id, tenant_id, contact_id, direction, media_processing_status, metadata, created_at")
      .eq("direction", "inbound")
      .eq("metadata->>reply_processing_status", "processing")
      .order("created_at", { ascending: true })
      .limit(normalizeLimit(params.limit));

    if (processingError) throw processingError;
    staleProcessingRows = ((processingData || []) as PendingWhatsAppReplyMessage[])
      .filter((row) => row.media_processing_status !== "pending")
      .filter(isStaleProcessingReply);
  } else if (!data?.length) {
    const { data: processingData, error: processingError } = await params.supabase
      .from("whatsapp_messages")
      .select("id, tenant_id, contact_id, direction, media_processing_status, metadata, created_at")
      .eq("id", params.messageId)
      .eq("direction", "inbound")
      .eq("metadata->>reply_processing_status", "processing")
      .limit(1);

    if (processingError) throw processingError;
    staleProcessingRows = ((processingData || []) as PendingWhatsAppReplyMessage[])
      .filter((row) => row.media_processing_status !== "pending")
      .filter(isStaleProcessingReply);
  }

  const rows = [
    ...((data || []) as PendingWhatsAppReplyMessage[])
      .filter((row) => row.media_processing_status !== "pending"),
    ...staleProcessingRows,
  ].slice(0, normalizeLimit(params.limit));
  const results = [];

  for (const row of rows) {
    results.push(await processOneReply({ supabase: params.supabase, row }));
  }

  return {
    picked: rows.length,
    processed: results.filter((result) => result.status === "processed").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    auto_sent: results.filter((result) => result.auto_sent).length,
    results,
  };
}
