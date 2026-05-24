import type { SupabaseClient } from "@supabase/supabase-js";
import { prepareWhatsAppSalesReplyForContact } from "@/lib/growth/whatsapp-sales-reply-runtime";
import type { WhatsAppSendProvider } from "@/lib/whatsapp/send-message";
import { sendEvolutionPresenceForContact } from "@/lib/whatsapp/evolution-presence";

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
const MAX_AGENT_TIMEOUT_ATTEMPTS = 3;
const MAX_NON_AGENTIC_REPLY_ATTEMPTS = 3;
const EVOLUTION_TYPING_PULSE_MS = 8_000;

function truncateError(value: string | null | undefined) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 500) : null;
}

function replyTrigger(row: PendingWhatsAppReplyMessage): WhatsAppReplyTrigger {
  return row.metadata?.reply_trigger === "meta_webhook" ? "meta_webhook" : "evolution_webhook";
}

async function runWithEvolutionTypingPulse<T>(params: {
  enabled: boolean;
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
  task: () => Promise<T>;
}) {
  if (!params.enabled) return params.task();

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const pulse = async () => {
    await sendEvolutionPresenceForContact({
      supabase: params.supabase,
      tenantId: params.tenantId,
      contactId: params.contactId,
      presence: "composing",
      delayMs: EVOLUTION_TYPING_PULSE_MS,
    });
  };

  const schedule = () => {
    if (process.env.NODE_ENV === "test" || stopped) return;
    timer = setTimeout(() => {
      void pulse().finally(schedule);
    }, EVOLUTION_TYPING_PULSE_MS);
  };

  try {
    await pulse();
    schedule();
    return await params.task();
  } finally {
    stopped = true;
    if (timer) clearTimeout(timer);
    await sendEvolutionPresenceForContact({
      supabase: params.supabase,
      tenantId: params.tenantId,
      contactId: params.contactId,
      presence: "paused",
    });
  }
}

function mergeMetadata(row: PendingWhatsAppReplyMessage, patch: Record<string, any>) {
  return {
    ...(row.metadata || {}),
    ...patch,
  };
}

type WhatsAppBrainTrace = {
  taskId: string | null;
  runId: string | null;
  stepId: string | null;
  error?: string | null;
};

function inferWhatsAppBrainRoute(metadata?: Record<string, any> | null) {
  const operatingPartner = metadata?.mayus_operating_partner || {};
  const classification = metadata?.conversation_classification || operatingPartner.conversation_classification || {};
  const processStatus = metadata?.process_status_context || operatingPartner.process_status_context || null;
  const intent = String(operatingPartner.intent || metadata?.intent || classification.class || "").trim();
  const route = String(classification.class || intent || metadata?.reply_source || "unknown").trim() || "unknown";
  let skill = "mayus_operating_partner";

  if (processStatus || route === "process_status" || intent === "process_status") {
    skill = processStatus?.verified === true ? "support_case_status" : "whatsapp_process_query";
  } else if (route === "commercial" || intent === "sales_qualification" || intent === "sales_closing") {
    skill = "lead_qualify";
  } else if (route === "legal_triage" || intent === "legal_triage") {
    skill = "lead_intake";
  }

  return {
    route,
    skill,
    actorContext: metadata?.whatsapp_actor_context || operatingPartner.whatsapp_actor_context || null,
    turnResolution: metadata?.conversation_frame?.resolution_type || operatingPartner.conversation_frame?.resolution_type || null,
  };
}

async function createWhatsAppBrainTrace(params: {
  supabase: SupabaseClient;
  row: PendingWhatsAppReplyMessage;
}): Promise<WhatsAppBrainTrace> {
  const now = new Date().toISOString();
  try {
    const { data: task, error: taskError } = await params.supabase
      .from("brain_tasks")
      .insert({
        tenant_id: params.row.tenant_id,
        created_by: null,
        channel: "whatsapp",
        module: "whatsapp",
        status: "executing",
        title: "Atendimento WhatsApp",
        goal: "Responder turno de WhatsApp com roteamento agentico supervisionado.",
        task_input: {
          source: "whatsapp.reply_processor",
          inbound_message_id: params.row.id,
          contact_id: params.row.contact_id,
          trigger: replyTrigger(params.row),
        },
        task_context: {
          media_processing_status: params.row.media_processing_status,
          reply_target_message_id: params.row.id,
          reply_target_created_at: params.row.created_at,
        },
        policy_snapshot: {
          tenant_only: true,
          auto_send_guarded: true,
          external_side_effects: "whatsapp_reply_only",
          sensitive_legal_actions_allowed: false,
        },
        started_at: now,
      })
      .select("id")
      .single<{ id: string }>();

    if (taskError || !task?.id) throw taskError || new Error("brain_task_missing");

    const { data: run, error: runError } = await params.supabase
      .from("brain_runs")
      .insert({
        task_id: task.id,
        tenant_id: params.row.tenant_id,
        attempt_number: 1,
        status: "executing",
        summary: "Preparando resposta WhatsApp supervisionada.",
        started_at: now,
      })
      .select("id")
      .single<{ id: string }>();

    if (runError || !run?.id) throw runError || new Error("brain_run_missing");

    const { data: step, error: stepError } = await params.supabase
      .from("brain_steps")
      .insert({
        task_id: task.id,
        run_id: run.id,
        tenant_id: params.row.tenant_id,
        order_index: 1,
        step_key: "whatsapp_reply",
        title: "Preparar resposta WhatsApp",
        step_type: "capability",
        capability_name: "mayus_operating_partner",
        handler_type: "whatsapp_reply_processor",
        status: "running",
        input_payload: {
          inbound_message_id: params.row.id,
          contact_id: params.row.contact_id,
          trigger: replyTrigger(params.row),
        },
        started_at: now,
      })
      .select("id")
      .single<{ id: string }>();

    if (stepError || !step?.id) throw stepError || new Error("brain_step_missing");

    return { taskId: task.id, runId: run.id, stepId: step.id };
  } catch (error) {
    return {
      taskId: null,
      runId: null,
      stepId: null,
      error: truncateError(error instanceof Error ? error.message : String(error)),
    };
  }
}

async function finishWhatsAppBrainTrace(params: {
  supabase: SupabaseClient;
  trace: WhatsAppBrainTrace | null;
  metadata?: Record<string, any> | null;
  nextStatus: "processed" | "pending" | "failed";
  autoSent?: boolean;
  durationMs?: number;
  error?: string | null;
}) {
  const inferred = inferWhatsAppBrainRoute(params.metadata);
  const completedAt = new Date().toISOString();
  const traceStatus = params.nextStatus === "failed"
    ? "failed"
    : params.nextStatus === "pending"
      ? "completed_with_warnings"
      : "completed";
  const stepStatus = params.nextStatus === "failed" ? "failed" : "completed";
  const traceMetadata = {
    brain_task_id: params.trace?.taskId || null,
    brain_run_id: params.trace?.runId || null,
    brain_step_id: params.trace?.stepId || null,
    skill: inferred.skill,
    route: inferred.route,
    actor_context: inferred.actorContext,
    turn_resolution: inferred.turnResolution,
    brain_trace_status: traceStatus,
    brain_trace_error: params.error || params.trace?.error || null,
  };

  if (!params.trace?.taskId || !params.trace.runId || !params.trace.stepId) {
    return traceMetadata;
  }

  await Promise.all([
    params.supabase
      .from("brain_steps")
      .update({
        status: stepStatus,
        capability_name: inferred.skill,
        handler_type: "whatsapp_agentic_reply",
        output_payload: {
          route: inferred.route,
          skill: inferred.skill,
          actor_context: inferred.actorContext,
          turn_resolution: inferred.turnResolution,
          auto_sent: params.autoSent === true,
          reply_processing_status: params.nextStatus,
          duration_ms: params.durationMs || null,
        },
        error_payload: params.error ? { error: params.error } : {},
        completed_at: completedAt,
      })
      .eq("id", params.trace.stepId),
    params.supabase
      .from("brain_runs")
      .update({
        status: traceStatus,
        summary: params.error || `${inferred.route} via ${inferred.skill}`,
        error_message: params.error || null,
        completed_at: completedAt,
      })
      .eq("id", params.trace.runId),
    params.supabase
      .from("brain_tasks")
      .update({
        status: traceStatus,
        result_summary: params.error || `${inferred.route} via ${inferred.skill}`,
        error_message: params.error || null,
        completed_at: completedAt,
      })
      .eq("id", params.trace.taskId),
  ]);

  return traceMetadata;
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
  eventName: "whatsapp_reply_processed" | "whatsapp_reply_failed" | "whatsapp_reply_stale_pending" | "whatsapp_reply_stale_processing_recovered" | "whatsapp_reply_stale_processing_suppressed" | "whatsapp_reply_superseded_by_newer_message";
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

function getAgentTimeoutAttempts(row: PendingWhatsAppReplyMessage) {
  const attempts = Number(row.metadata?.reply_agent_timeout_attempts || 0);
  return Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0;
}

function getNonAgenticReplyAttempts(row: PendingWhatsAppReplyMessage) {
  const attempts = Number(row.metadata?.reply_non_agentic_attempts || 0);
  return Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0;
}

function getAgenticRetryReason(preparedMetadata: Record<string, any>) {
  const blockedReason = preparedMetadata?.first_response_policy?.blocked_reason;
  if (blockedReason === "operating_partner_timeout_no_agentic_answer") return blockedReason;
  if (blockedReason === "non_agentic_reply_source") return blockedReason;
  if (blockedReason === "deterministic_fallback_not_agentic") return blockedReason;
  return null;
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
  let brainTrace: WhatsAppBrainTrace | null = null;
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

    if (currentStatus !== "processing" && await hasNewerMessageThan({ supabase: params.supabase, row: params.row })) {
      const supersededAt = new Date().toISOString();
      await params.supabase
        .from("whatsapp_messages")
        .update({
          metadata: mergeMetadata(params.row, {
            reply_processing_status: "processed",
            reply_processed_at: supersededAt,
            reply_auto_sent: false,
            reply_skipped_reason: "newer_message_exists",
            reply_superseded_at: supersededAt,
          }),
        })
        .eq("id", params.row.id)
        .eq("metadata->>reply_processing_status", "pending");

      await recordReplyEvent({
        supabase: params.supabase,
        row: params.row,
        eventName: "whatsapp_reply_superseded_by_newer_message",
        status: "warning",
        durationMs: Date.now() - startedAt,
        extraPayload: { reason: "newer_message_exists" },
      });

      return {
        message_id: params.row.id,
        status: "processed" as const,
        auto_sent: false,
        duration_ms: Date.now() - startedAt,
        skipped_reason: "newer_message_exists",
      };
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

    brainTrace = await createWhatsAppBrainTrace({
      supabase: params.supabase,
      row: params.row,
    });
    const startedBrainMetadata = mergeMetadata(params.row, {
      brain_task_id: brainTrace.taskId,
      brain_run_id: brainTrace.runId,
      brain_step_id: brainTrace.stepId,
      brain_trace_status: brainTrace.error ? "unavailable" : "running",
      brain_trace_error: brainTrace.error || null,
    });
    await params.supabase
      .from("whatsapp_messages")
      .update({ metadata: startedBrainMetadata })
      .eq("id", params.row.id);
    params.row.metadata = startedBrainMetadata;

    const preferredProvider = params.row.metadata?.reply_preferred_provider === "meta_cloud" || params.row.metadata?.reply_preferred_provider === "evolution"
      ? params.row.metadata.reply_preferred_provider
      : null;
    const shouldSignalEvolutionTyping = replyTrigger(params.row) === "evolution_webhook" && preferredProvider !== "meta_cloud";

    let prepared: Awaited<ReturnType<typeof prepareWhatsAppSalesReplyForContact>>;
    prepared = await runWithEvolutionTypingPulse({
      enabled: shouldSignalEvolutionTyping,
      supabase: params.supabase,
      tenantId: params.row.tenant_id,
      contactId: params.row.contact_id,
      task: () => prepareWhatsAppSalesReplyForContact({
        supabase: params.supabase,
        tenantId: params.row.tenant_id,
        contactId: params.row.contact_id,
        trigger: replyTrigger(params.row),
        notify: true,
        autoSendFirstResponse: true,
        preferredProvider,
        replyTargetMessageId: params.row.id,
        replyTargetCreatedAt: params.row.created_at,
        brainTrace,
      }),
    });
    const durationMs = Date.now() - startedAt;
    const agenticRetryReason = getAgenticRetryReason(prepared.metadata);
    const agentTimeoutAttempts = getAgentTimeoutAttempts(params.row) + 1;
    const nonAgenticAttempts = getNonAgenticReplyAttempts(params.row) + 1;
    const retryLimit = agenticRetryReason === "operating_partner_timeout_no_agentic_answer"
      ? MAX_AGENT_TIMEOUT_ATTEMPTS
      : MAX_NON_AGENTIC_REPLY_ATTEMPTS;
    const retryAttempts = agenticRetryReason === "operating_partner_timeout_no_agentic_answer"
      ? agentTimeoutAttempts
      : nonAgenticAttempts;
    const nextStatus = agenticRetryReason && retryAttempts < retryLimit ? "pending" : "processed";
    const brainTraceMetadata = await finishWhatsAppBrainTrace({
      supabase: params.supabase,
      trace: brainTrace,
      metadata: prepared.metadata,
      nextStatus,
      autoSent: prepared.autoSendResult.status === "sent",
      durationMs,
    });

    await params.supabase
      .from("whatsapp_messages")
      .update({
        metadata: mergeMetadata(params.row, {
          reply_processing_status: nextStatus,
          reply_processed_at: new Date().toISOString(),
          reply_auto_sent: prepared.autoSendResult.status === "sent",
          reply_agentic_retry_reason: agenticRetryReason,
          reply_agentic_retry_at: agenticRetryReason ? new Date().toISOString() : params.row.metadata?.reply_agentic_retry_at || null,
          reply_agentic_retry_exhausted_at: agenticRetryReason && nextStatus !== "pending" ? new Date().toISOString() : null,
          reply_agent_timeout_at: agenticRetryReason === "operating_partner_timeout_no_agentic_answer" ? new Date().toISOString() : params.row.metadata?.reply_agent_timeout_at || null,
          reply_agent_timeout_attempts: agenticRetryReason === "operating_partner_timeout_no_agentic_answer" ? agentTimeoutAttempts : params.row.metadata?.reply_agent_timeout_attempts || null,
          reply_non_agentic_attempts: agenticRetryReason && agenticRetryReason !== "operating_partner_timeout_no_agentic_answer" ? nonAgenticAttempts : params.row.metadata?.reply_non_agentic_attempts || null,
          reply_blocked_reason: prepared.metadata?.first_response_policy?.blocked_reason || null,
          reply_target_message_id: prepared.metadata?.reply_target_message_id || params.row.id,
          reply_target_created_at: prepared.metadata?.reply_target_created_at || params.row.created_at || null,
          latest_inbound_message_id_at_decision: prepared.metadata?.latest_inbound_message_id_at_decision || null,
          latest_inbound_message_id_at_send: prepared.metadata?.latest_inbound_message_id_at_send || null,
          reply_aborted_reason: prepared.metadata?.reply_aborted_reason || null,
          ...brainTraceMetadata,
        }),
      })
      .eq("id", params.row.id);

    await recordReplyEvent({
      supabase: params.supabase,
      row: params.row,
      eventName: "whatsapp_reply_processed",
      status: "ok",
      durationMs,
      extraPayload: {
        reply_processing_status: nextStatus,
        blocked_reason: prepared.metadata?.first_response_policy?.blocked_reason || null,
        agentic_retry_reason: agenticRetryReason,
        agent_timeout_attempts: agenticRetryReason === "operating_partner_timeout_no_agentic_answer" ? agentTimeoutAttempts : null,
        non_agentic_attempts: agenticRetryReason && agenticRetryReason !== "operating_partner_timeout_no_agentic_answer" ? nonAgenticAttempts : null,
      },
    });

    return {
      message_id: params.row.id,
      status: nextStatus === "pending" ? "skipped" as const : "processed" as const,
      auto_sent: prepared.autoSendResult.status === "sent",
      duration_ms: durationMs,
      reply_processing_status: nextStatus,
      skipped_reason: nextStatus === "pending" ? "agentic_retry_scheduled" : undefined,
    };
  } catch (error: any) {
    const message = error?.message || "Falha ao preparar resposta WhatsApp.";
    const durationMs = Date.now() - startedAt;
    const brainTraceMetadata = await finishWhatsAppBrainTrace({
      supabase: params.supabase,
      trace: brainTrace,
      metadata: params.row.metadata,
      nextStatus: "failed",
      autoSent: false,
      durationMs,
      error: message,
    });
    await params.supabase
      .from("whatsapp_messages")
      .update({
        metadata: mergeMetadata(params.row, {
          reply_processing_status: "failed",
          reply_failed_at: new Date().toISOString(),
          reply_processing_error: message,
          ...brainTraceMetadata,
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
