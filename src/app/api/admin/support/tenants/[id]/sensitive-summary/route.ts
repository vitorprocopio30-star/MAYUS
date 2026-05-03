import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/is-superadmin";
import { getActiveSupportGrant } from "@/lib/admin/support-grants";

export const dynamic = "force-dynamic";

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

function normalizeTenantId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function countByStatus(items: any[] | null | undefined) {
  const counts: Record<string, number> = {};
  for (const item of items || []) {
    const status = typeof item?.status === "string" && item.status.trim() ? item.status.trim() : "unknown";
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function countByRole(items: any[] | null | undefined) {
  const counts: Record<string, number> = {};
  for (const item of items || []) {
    const role = typeof item?.role === "string" && item.role.trim() ? item.role.trim() : "sem_role";
    counts[role] = (counts[role] || 0) + 1;
  }
  return counts;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateSuperadmin(req);
    if (auth.error) return auth.error;

    const tenantId = normalizeTenantId(params.id);
    if (!tenantId) {
      return NextResponse.json({ error: "tenantId e obrigatorio." }, { status: 400 });
    }

    const grant = await getActiveSupportGrant({
      supabase: supabaseAdmin,
      tenantId,
      requiredScope: "tenant_sensitive_readonly",
    });

    if (!grant) {
      return NextResponse.json({
        error: "Grant ativo com escopo tenant_sensitive_readonly e obrigatorio.",
        grant_required: true,
      }, { status: 403 });
    }

    const [
      { data: tenant, error: tenantError },
      { data: profiles, error: profilesError },
      { data: integrations, error: integrationsError },
      { data: recentEvents, error: eventsError },
    ] = await Promise.all([
      supabaseAdmin.from("tenants").select("id, name, status, plan_type, created_at").eq("id", tenantId).maybeSingle(),
      supabaseAdmin.from("profiles").select("role, is_active").eq("tenant_id", tenantId),
      supabaseAdmin.from("tenant_integrations").select("provider, status").eq("tenant_id", tenantId),
      supabaseAdmin
        .from("system_event_logs")
        .select("event_name, status, source, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    if (tenantError || profilesError || integrationsError || eventsError) {
      return NextResponse.json({ error: "Erro interno ao carregar resumo sensivel." }, { status: 500 });
    }

    if (!tenant) {
      return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
    }

    await supabaseAdmin.from("system_event_logs").insert({
      tenant_id: tenantId,
      user_id: auth.user.id,
      event_name: "support_access_viewed",
      source: "admin_support_sensitive_summary",
      status: "completed",
      payload: {
        grant_id: grant.id,
        tenant_id: tenantId,
        scope: grant.scope,
        summary_type: "redacted_sensitive_summary",
        sensitive_data_included: false,
      },
    });

    return NextResponse.json({
      tenant,
      grant: {
        id: grant.id,
        scope: grant.scope,
        expires_at: grant.expires_at,
      },
      summary: {
        raw_data_included: false,
        active_users: (profiles || []).filter((profile: any) => profile?.is_active !== false).length,
        users_by_role: countByRole(profiles),
        integrations_by_status: countByStatus(integrations),
        recent_events: (recentEvents || []).map((event: any) => ({
          event_name: event.event_name,
          status: event.status,
          source: event.source,
          created_at: event.created_at,
        })),
      },
    });
  } catch (error) {
    console.error("[admin/support/tenants/sensitive-summary][GET] fatal", error);
    return NextResponse.json({ error: "Erro interno ao carregar resumo sensivel." }, { status: 500 });
  }
}

