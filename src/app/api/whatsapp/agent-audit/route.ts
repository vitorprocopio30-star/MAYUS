import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { isBrainExecutiveRole } from "@/lib/brain/roles";
import { processPendingWhatsAppMediaBatch } from "@/lib/whatsapp/media-processor";
import { processPendingWhatsAppRepliesBatch } from "@/lib/whatsapp/reply-processor";

export const dynamic = "force-dynamic";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const AUDIT_EVENT_NAMES = [
  "whatsapp_sales_reply_prepared",
  "mayus_operating_partner_reply_repaired",
  "whatsapp_reply_aborted_by_newer_message",
  "whatsapp_reply_processed",
  "whatsapp_reply_failed",
  "whatsapp_reply_stale_pending",
  "whatsapp_reply_stale_processing_suppressed",
  "whatsapp_mayus_operating_partner_auto_sent",
  "whatsapp_mayus_operating_partner_auto_send_failed",
];

type AuditEventRow = {
  id: string;
  event_name: string;
  status: string | null;
  source?: string | null;
  provider?: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type WhatsAppMessageAuditRow = {
  id: string;
  direction: string | null;
  message_type: string | null;
  status: string | null;
  media_processing_status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

async function getAuthenticatedProfile() {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {}
        },
      },
    },
  );

  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return { error: "Nao autorizado.", status: 401 as const };

  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("id, tenant_id, role")
    .eq("id", user.id)
    .maybeSingle<{ id: string; tenant_id: string | null; role: string | null }>();

  if (profileError || !profile?.tenant_id) {
    return { error: "Perfil ou tenant nao vinculados.", status: 403 as const };
  }

  if (!isBrainExecutiveRole(profile.role)) {
    return { error: "Acesso restrito a administradores e socios.", status: 403 as const };
  }

  return { profile, userId: user.id };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maxLength = 700) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function textList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item, 160)).filter(Boolean) as string[];
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function countBy<T>(values: T[], predicate: (value: T) => boolean) {
  return values.reduce((total, value) => total + (predicate(value) ? 1 : 0), 0);
}

function latestDate(values: Array<string | null | undefined>) {
  return values
    .map((value) => text(value, 120))
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function oldestDate(values: Array<string | null | undefined>) {
  return values
    .map((value) => text(value, 120))
    .filter(Boolean)
    .sort()
    .at(0) || null;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const normalized = text(value, 180);
    if (normalized) return normalized;
  }
  return null;
}

function firstRecord(...values: unknown[]) {
  for (const value of values) {
    const record = asRecord(value);
    if (record) return record;
  }
  return null;
}

function extractActorContext(payload: Record<string, unknown>, mayus: Record<string, unknown> | null) {
  return firstRecord(
    payload.actor_context,
    payload.whatsapp_actor_context,
    mayus?.actor_context,
    mayus?.whatsapp_actor_context,
    asRecord(payload.conversation_frame)?.actor_context,
    asRecord(mayus?.conversation_frame)?.actor_context,
  );
}

function extractConversationResolution(payload: Record<string, unknown>, mayus: Record<string, unknown> | null) {
  const resolution = firstRecord(payload.conversation_resolution, mayus?.conversation_resolution);
  if (resolution) {
    return {
      type: text(resolution.type) || text(resolution.resolution_type),
      quality_status: text(resolution.quality_status),
      final_response_source: text(resolution.final_response_source),
    };
  }
  const frame = firstRecord(payload.conversation_frame, mayus?.conversation_frame);
  return frame
    ? {
      type: text(frame.resolution_type),
      quality_status: null,
      final_response_source: null,
    }
    : null;
}

function extractQualityCheck(payload: Record<string, unknown>, mayus: Record<string, unknown> | null) {
  return firstRecord(payload.quality_check, mayus?.quality_check);
}

function extractContextPolicy(payload: Record<string, unknown>, mayus: Record<string, unknown> | null) {
  return firstRecord(
    payload.context_policy,
    mayus?.context_policy,
    asRecord(payload.conversation_frame)?.context_policy,
    asRecord(mayus?.conversation_frame)?.context_policy,
  );
}

function sanitizeAuditEvent(row: AuditEventRow) {
  const payload = row.payload || {};
  const mayus = asRecord(payload.mayus_operating_partner);
  const actor = extractActorContext(payload, mayus);
  const resolution = extractConversationResolution(payload, mayus);
  const quality = extractQualityCheck(payload, mayus);
  const contextPolicy = extractContextPolicy(payload, mayus);
  const qualityFlags = unique([
    ...textList(quality?.flags),
    ...textList(payload.risk_flags),
    ...textList(payload.original_risk_flags),
    ...textList(payload.repaired_risk_flags),
  ]);
  const qualityReasons = textList(quality?.reasons);
  const finalResponseSource = text(payload.final_response_source)
    || text(mayus?.final_response_source)
    || resolution?.final_response_source
    || null;
  const originalPreview = text(payload.original_reply_preview, 900);
  const finalPreview = text(payload.final_reply_preview, 900)
    || text(payload.repaired_reply_preview, 900)
    || text(payload.reply_text, 900)
    || text(payload.suggested_reply, 900);
  const qualityStatus = text(quality?.status) || resolution?.quality_status || null;
  const mode = text(payload.mode);
  const repaired = row.event_name === "mayus_operating_partner_reply_repaired"
    || finalResponseSource === "llm_repaired";
  const blocked = row.status === "error"
    || row.status === "warning"
    || qualityStatus === "block"
    || mode === "human_review_required"
    || payload.requires_human_review === true
    || payload.may_auto_send === false
    || Boolean(payload.reply_aborted_reason);
  const reason = text(payload.error)
    || text(payload.reason)
    || text(payload.reply_aborted_reason)
    || (qualityReasons.length ? qualityReasons.join(", ") : null)
    || (qualityFlags.length ? qualityFlags.join(", ") : null);

  return {
    id: row.id,
    created_at: row.created_at,
    event_name: row.event_name,
    status: row.status || "unknown",
    source: row.source || "whatsapp",
    provider: row.provider || "mayus",
    contact_id: text(payload.contact_id),
    brain_run_id: text(payload.brain_run_id),
    skill: text(payload.skill),
    route: text(payload.route),
    actor_role: text(actor?.role),
    actor_reason: text(actor?.reason),
    conversation_type: resolution?.type || null,
    quality_status: qualityStatus,
    quality_flags: qualityFlags,
    risk_flags: unique([
      ...textList(payload.risk_flags),
      ...textList(payload.original_risk_flags),
      ...textList(payload.repaired_risk_flags),
    ]),
    final_response_source: finalResponseSource,
    mode,
    blocked,
    repaired,
    reason,
    context_policy_scope: text(contextPolicy?.scope, 80),
    context_reset_reason: text(contextPolicy?.reset_reason, 120),
    context_allowed_previous_event: contextPolicy?.allowed_previous_event === true,
    context_allowed_process_candidates: contextPolicy?.allowed_process_candidates === true,
    context_prompt_message_count: typeof contextPolicy?.prompt_message_count === "number" ? contextPolicy.prompt_message_count : null,
    original_reply_preview: originalPreview,
    final_reply_preview: finalPreview,
  };
}

function messageReplyStatus(row: WhatsAppMessageAuditRow) {
  return text(row.metadata?.reply_processing_status, 80);
}

function messageConversationClass(row: WhatsAppMessageAuditRow) {
  const metadata = row.metadata || {};
  const mayus = asRecord(metadata.mayus_operating_partner);
  const classification = firstRecord(metadata.conversation_classification, mayus?.conversation_classification);
  return text(classification?.class, 120) || text(metadata.route, 120) || text(metadata.intent, 120);
}

function messageOpenClawReason(row: WhatsAppMessageAuditRow) {
  const metadata = row.metadata || {};
  const mayus = asRecord(metadata.mayus_operating_partner);
  const governance = firstRecord(metadata.agentic_governance, mayus?.agentic_governance);
  const openclaw = firstRecord(metadata.openclaw_policy, governance?.openclaw_policy, mayus?.openclaw_policy);
  return firstText(
    openclaw?.reason,
    openclaw?.blocked_reason,
    metadata.reply_aborted_reason,
    metadata.reply_processing_recovery_reason,
    metadata.reply_processing_error,
  );
}

function messageBrainRunId(row: WhatsAppMessageAuditRow) {
  const brainTrace = asRecord(row.metadata?.brain_trace);
  const mayus = asRecord(row.metadata?.mayus_operating_partner);
  return firstText(
    row.metadata?.brain_run_id,
    brainTrace?.brain_run_id,
    mayus?.brain_run_id,
  );
}

function messageContextPolicy(row: WhatsAppMessageAuditRow) {
  const metadata = row.metadata || {};
  const mayus = asRecord(metadata.mayus_operating_partner);
  return firstRecord(
    metadata.context_policy,
    mayus?.context_policy,
    asRecord(metadata.conversation_frame)?.context_policy,
    asRecord(mayus?.conversation_frame)?.context_policy,
  );
}

function buildTopFlags(entries: ReturnType<typeof sanitizeAuditEvent>[]) {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const flag of unique([...entry.quality_flags, ...entry.risk_flags])) {
      counts.set(flag, (counts.get(flag) || 0) + 1);
    }
    if (entry.context_policy_scope) counts.set(`context:${entry.context_policy_scope}`, (counts.get(`context:${entry.context_policy_scope}`) || 0) + 1);
    if (entry.blocked && entry.reason) counts.set(`blocked:${entry.reason}`, (counts.get(`blocked:${entry.reason}`) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([flag, count]) => ({ flag, count }));
}

async function buildWhatsAppAgentHealth(params: {
  tenantId: string;
  entries: ReturnType<typeof sanitizeAuditEvent>[];
}) {
  const { data, error } = await adminSupabase
    .from("whatsapp_messages")
    .select("id, direction, message_type, status, media_processing_status, metadata, created_at")
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;

  const messages = (data || []) as WhatsAppMessageAuditRow[];
  const pendingReplies = countBy(messages, (row) => row.direction === "inbound" && messageReplyStatus(row) === "pending");
  const processingReplies = countBy(messages, (row) => row.direction === "inbound" && messageReplyStatus(row) === "processing");
  const failedReplies = countBy(messages, (row) => row.direction === "inbound" && messageReplyStatus(row) === "failed");
  const pendingMedia = countBy(messages, (row) => row.media_processing_status === "pending");
  const processingMedia = countBy(messages, (row) => row.media_processing_status === "processing");
  const failedMedia = countBy(messages, (row) => row.media_processing_status === "failed");
  const inbound = messages.filter((row) => row.direction === "inbound");
  const outbound = messages.filter((row) => row.direction === "outbound");
  const latestMessageWithAgentMetadata = messages.find((row) => (
    row.metadata?.mayus_operating_partner
    || row.metadata?.conversation_classification
    || row.metadata?.agentic_governance
    || row.metadata?.model_used
  ));
  const latestEntry = params.entries[0] || null;
  const blockedEntries = params.entries.filter((entry) => entry.blocked);
  const repairedEntries = params.entries.filter((entry) => entry.repaired);
  const warningEntries = params.entries.filter((entry) => entry.status === "warning" || entry.status === "error");
  const queueTotal = pendingReplies + processingReplies + pendingMedia + processingMedia;
  const status = failedReplies > 0 || failedMedia > 0 || params.entries.some((entry) => entry.status === "error")
    ? "blocked"
    : queueTotal > 0 || warningEntries.length > 0 || blockedEntries.length > 0
      ? "needs_attention"
      : "working";
  const latestClass = messageConversationClass(latestMessageWithAgentMetadata || messages[0] || {} as WhatsAppMessageAuditRow)
    || latestEntry?.conversation_type
    || null;
  const latestModel = firstText(
    latestMessageWithAgentMetadata?.metadata?.model_used,
    latestMessageWithAgentMetadata?.metadata?.mayus_operating_partner && asRecord(latestMessageWithAgentMetadata.metadata.mayus_operating_partner)?.model_used,
    latestEntry?.provider,
  );
  const latestOpenClawReason = messageOpenClawReason(latestMessageWithAgentMetadata || messages[0] || {} as WhatsAppMessageAuditRow)
    || latestEntry?.reason
    || null;
  const latestMessageContextPolicy = messageContextPolicy(latestMessageWithAgentMetadata || messages[0] || {} as WhatsAppMessageAuditRow);
  const topFlags = buildTopFlags(params.entries);

  return {
    status,
    label: "WhatsApp Operating Partner",
    owner: "Paperclip / OpenClaw / Hermes",
    generated_at: new Date().toISOString(),
    queue: {
      pending_replies: pendingReplies,
      processing_replies: processingReplies,
      failed_replies: failedReplies,
      pending_media: pendingMedia,
      processing_media: processingMedia,
      failed_media: failedMedia,
      recent_messages: messages.length,
      inbound: inbound.length,
      outbound: outbound.length,
      oldest_pending_at: oldestDate(messages
        .filter((row) => messageReplyStatus(row) === "pending" || row.media_processing_status === "pending")
        .map((row) => row.created_at)),
    },
    latest: {
      inbound_at: latestDate(inbound.map((row) => row.created_at)),
      reply_at: latestDate(outbound.map((row) => row.created_at)),
      event_at: latestEntry?.created_at || null,
      event_name: latestEntry?.event_name || null,
      model_used: latestModel,
      final_response_source: latestEntry?.final_response_source || firstText(latestMessageWithAgentMetadata?.metadata?.final_response_source),
      conversation_class: latestClass,
      openclaw_reason: latestOpenClawReason,
      brain_run_id: messageBrainRunId(latestMessageWithAgentMetadata || messages[0] || {} as WhatsAppMessageAuditRow) || latestEntry?.brain_run_id || null,
      context_policy_scope: latestEntry?.context_policy_scope || text(latestMessageContextPolicy?.scope, 80),
      context_reset_reason: latestEntry?.context_reset_reason || text(latestMessageContextPolicy?.reset_reason, 120),
      context_prompt_message_count: latestEntry?.context_prompt_message_count ?? (typeof latestMessageContextPolicy?.prompt_message_count === "number" ? latestMessageContextPolicy.prompt_message_count : null),
    },
    governance: {
      paperclip_owner: "WhatsApp Operating Partner",
      openclaw_state: status === "blocked" ? "blocked" : status === "needs_attention" ? "needs_attention" : "working",
      openclaw_reason: latestOpenClawReason || (status === "working" ? "low_risk_supervised_channel" : "verificar pendencias e warnings"),
      hermes_trajectory: latestEntry?.brain_run_id ? "brain_trace_linked" : "event_log_only",
      auto_send_policy: "low_risk_only",
      sensitive_actions: "human_approval_required",
    },
    audit: {
      blocked: blockedEntries.length,
      repaired: repairedEntries.length,
      warnings: warningEntries.length,
      top_flags: topFlags,
    },
    next_action: status === "blocked"
      ? "Abrir auditoria, resolver falhas e manter autoenvio bloqueado para casos sensiveis."
      : status === "needs_attention"
        ? "Processar pendentes, revisar flags e executar smoke real Evolution controlado."
        : "Executar a matriz de smoke real e manter GitHub Actions como scheduler ate upgrade Pro.",
  };
}

function normalizeManualProcessLimit(value: unknown) {
  const parsed = Number(value || 5);
  if (!Number.isFinite(parsed)) return 5;
  return Math.min(Math.max(Math.floor(parsed), 1), 10);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedProfile();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const limitParam = Number(req.nextUrl.searchParams.get("limit") || 24);
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(50, Math.trunc(limitParam))) : 24;

    const { data, error } = await adminSupabase
      .from("system_event_logs")
      .select("id, event_name, status, source, provider, payload, created_at")
      .eq("tenant_id", auth.profile.tenant_id!)
      .in("event_name", AUDIT_EVENT_NAMES)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const entries = ((data || []) as AuditEventRow[]).map(sanitizeAuditEvent);
    const metrics = {
      total: entries.length,
      blocked: entries.filter((entry) => entry.blocked).length,
      repaired: entries.filter((entry) => entry.repaired).length,
      safe_fallback: entries.filter((entry) => entry.final_response_source === "safe_fallback").length,
      llm_repaired: entries.filter((entry) => entry.final_response_source === "llm_repaired").length,
      warnings: entries.filter((entry) => entry.status === "warning").length,
      errors: entries.filter((entry) => entry.status === "error").length,
      quality_blocks: entries.filter((entry) => entry.quality_status === "block").length,
    };

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      event_names: AUDIT_EVENT_NAMES,
      metrics,
      health: await buildWhatsAppAgentHealth({ tenantId: auth.profile.tenant_id!, entries }),
      entries,
    });
  } catch (error: any) {
    console.error("[whatsapp-agent-audit]", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao carregar auditoria do WhatsApp MAYUS." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedProfile();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => ({}));
    const action = text(asRecord(body)?.action, 80) || "process_pending";
    if (action !== "process_pending") {
      return NextResponse.json({ error: "Acao de auditoria WhatsApp nao suportada." }, { status: 400 });
    }

    const limit = normalizeManualProcessLimit(asRecord(body)?.limit);
    const startedAt = Date.now();
    const media = await processPendingWhatsAppMediaBatch({ supabase: adminSupabase, limit, tenantId: auth.profile.tenant_id! });
    const replies = await processPendingWhatsAppRepliesBatch({ supabase: adminSupabase, limit, tenantId: auth.profile.tenant_id! });

    const { data, error } = await adminSupabase
      .from("system_event_logs")
      .select("id, event_name, status, source, provider, payload, created_at")
      .eq("tenant_id", auth.profile.tenant_id!)
      .in("event_name", AUDIT_EVENT_NAMES)
      .order("created_at", { ascending: false })
      .limit(24);

    if (error) throw error;

    const entries = ((data || []) as AuditEventRow[]).map(sanitizeAuditEvent);

    return NextResponse.json({
      ok: true,
      action,
      limit,
      duration_ms: Date.now() - startedAt,
      media,
      replies,
      health: await buildWhatsAppAgentHealth({ tenantId: auth.profile.tenant_id!, entries }),
    });
  } catch (error: any) {
    console.error("[whatsapp-agent-audit:post]", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao processar pendencias WhatsApp." },
      { status: 500 },
    );
  }
}
