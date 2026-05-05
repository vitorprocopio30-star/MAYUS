import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const ADMIN_ROLES = new Set(["Administrador", "mayus_admin", "Sócio"]);
const MEDIA_EVENT_NAMES = [
  "whatsapp_media_processed",
  "whatsapp_media_failed",
  "whatsapp_media_batch_processed",
];

type EventPayload = Record<string, any> | null;

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

  if (!ADMIN_ROLES.has(String(profile.role || ""))) {
    return { error: "Acesso restrito a administradores.", status: 403 as const };
  }

  return { profile };
}

function toNumber(value: unknown) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function sanitizeEvent(row: {
  event_name: string;
  status: string;
  provider: string | null;
  payload: EventPayload;
  created_at: string;
}) {
  const payload = row.payload || {};
  return {
    event_name: row.event_name,
    status: row.status,
    provider: row.provider || payload.provider || null,
    created_at: row.created_at,
    message_id: payload.message_id || null,
    contact_id: payload.contact_id || null,
    kind: payload.kind || null,
    media_status: payload.status || null,
    duration_ms: toNumber(payload.duration_ms),
    picked: payload.picked == null ? null : toNumber(payload.picked),
    processed: payload.processed == null ? null : toNumber(payload.processed),
    failed: payload.failed == null ? null : toNumber(payload.failed),
    replies_prepared: payload.replies_prepared == null ? null : toNumber(payload.replies_prepared),
    has_storage_path: Boolean(payload.has_storage_path),
    error: typeof payload.error === "string" ? payload.error.slice(0, 240) : null,
  };
}

export async function GET() {
  try {
    const auth = await getAuthenticatedProfile();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const tenantId = auth.profile.tenant_id!;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [eventsResult, pendingResult, failedMediaResult] = await Promise.all([
      adminSupabase
        .from("system_event_logs")
        .select("event_name, status, provider, payload, created_at")
        .eq("tenant_id", tenantId)
        .in("event_name", MEDIA_EVENT_NAMES)
        .order("created_at", { ascending: false })
        .limit(40),
      adminSupabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("media_processing_status", "pending"),
      adminSupabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("media_processing_status", "failed"),
    ]);

    if (eventsResult.error) throw eventsResult.error;
    if (pendingResult.error) throw pendingResult.error;
    if (failedMediaResult.error) throw failedMediaResult.error;

    const events = (eventsResult.data || []).map(sanitizeEvent);
    const recentEvents = events.filter((event) => event.created_at >= since);
    const mediaEvents = recentEvents.filter((event) => event.event_name !== "whatsapp_media_batch_processed");
    const batchEvents = recentEvents.filter((event) => event.event_name === "whatsapp_media_batch_processed");
    const durations = mediaEvents.map((event) => event.duration_ms).filter((value) => value > 0);
    const lastBatch = batchEvents[0] || null;

    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      window_hours: 24,
      metrics: {
        pending_media: pendingResult.count || 0,
        failed_media_total: failedMediaResult.count || 0,
        events_24h: recentEvents.length,
        media_processed_24h: mediaEvents.filter((event) => event.event_name === "whatsapp_media_processed").length,
        media_failed_24h: mediaEvents.filter((event) => event.event_name === "whatsapp_media_failed").length,
        batches_24h: batchEvents.length,
        avg_media_duration_ms: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
        last_batch: lastBatch ? {
          created_at: lastBatch.created_at,
          picked: lastBatch.picked || 0,
          processed: lastBatch.processed || 0,
          failed: lastBatch.failed || 0,
          duration_ms: lastBatch.duration_ms,
        } : null,
      },
      events: events.slice(0, 12),
    });
  } catch (error: any) {
    console.error("[whatsapp-media-observability]", error);
    return NextResponse.json(
      { error: error?.message || "Erro ao carregar observabilidade WhatsApp." },
      { status: 500 },
    );
  }
}
