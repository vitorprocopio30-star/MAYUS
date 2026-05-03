import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/is-superadmin";

export const dynamic = "force-dynamic";

const SUPPORT_EVENT_NAMES = [
  "support_grant_created",
  "support_grant_revoked",
  "support_access_viewed",
  "support_tenants_list_viewed",
  "demo_tenant_status_updated",
  "demo_tenant_reset",
] as const;

async function authenticateSuperadmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { error: NextResponse.json({ error: "Nao autenticado." }, { status: 401 }) };
  }

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Nao autenticado." }, { status: 401 }) };
  }

  const ok = await isSuperadmin(user.id);
  if (!ok) {
    return { error: NextResponse.json({ error: "Acesso negado." }, { status: 403 }) };
  }

  return { user };
}

function sanitizePayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const record = payload as Record<string, unknown>;
  return {
    tenant_id: typeof record.tenant_id === "string" ? record.tenant_id : null,
    grant_id: typeof record.grant_id === "string" ? record.grant_id : null,
    scope: Array.isArray(record.scope) ? record.scope.filter((item) => typeof item === "string") : [],
    duration_minutes: typeof record.duration_minutes === "number" ? record.duration_minutes : null,
    summary_type: typeof record.summary_type === "string" ? record.summary_type : null,
    sensitive_data_included: record.sensitive_data_included === true,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateSuperadmin(req);
    if (auth.error) return auth.error;

    const { data: events, error } = await supabaseAdmin
      .from("system_event_logs")
      .select("id, tenant_id, user_id, event_name, source, status, payload, created_at")
      .in("event_name", SUPPORT_EVENT_NAMES)
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) {
      return NextResponse.json({ error: "Erro interno ao carregar inbox de suporte." }, { status: 500 });
    }

    const items = (events || []).map((event: any) => ({
      id: event.id,
      tenant_id: event.tenant_id || null,
      user_id: event.user_id || null,
      event_name: event.event_name,
      source: event.source || null,
      status: event.status || null,
      created_at: event.created_at,
      payload: sanitizePayload(event.payload),
    }));

    return NextResponse.json({
      items,
      metadata: {
        count: items.length,
        raw_payload_included: false,
        sensitive_data_included: false,
      },
    });
  } catch (error) {
    console.error("[admin/support/inbox][GET] fatal", error);
    return NextResponse.json({ error: "Erro interno ao carregar inbox de suporte." }, { status: 500 });
  }
}

