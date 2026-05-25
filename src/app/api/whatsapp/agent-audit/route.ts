import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { isBrainExecutiveRole } from "@/lib/brain/roles";

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

function sanitizeAuditEvent(row: AuditEventRow) {
  const payload = row.payload || {};
  const mayus = asRecord(payload.mayus_operating_partner);
  const actor = extractActorContext(payload, mayus);
  const resolution = extractConversationResolution(payload, mayus);
  const quality = extractQualityCheck(payload, mayus);
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
    original_reply_preview: originalPreview,
    final_reply_preview: finalPreview,
  };
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
