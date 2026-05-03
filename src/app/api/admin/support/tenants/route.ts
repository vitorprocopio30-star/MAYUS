import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/is-superadmin";
import { isDemoModeEnabled } from "@/lib/demo/demo-mode";
import { isSupportGrantActive } from "@/lib/admin/support-grants";

export const dynamic = "force-dynamic";

const WHATSAPP_PROVIDERS = new Set(["meta_cloud", "evolution"]);

function isConnected(status: unknown) {
  return typeof status === "string" && status.toLowerCase() === "connected";
}

function countByTenant(items: any[] | null | undefined) {
  const counts = new Map<string, number>();
  for (const item of items || []) {
    const tenantId = item?.tenant_id ? String(item.tenant_id) : "";
    if (!tenantId) continue;
    counts.set(tenantId, (counts.get(tenantId) || 0) + 1);
  }
  return counts;
}

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

function buildIntegrationSummary(integrations: any[]) {
  const connected = integrations.filter((item) => isConnected(item.status));
  const connectedProviders = new Set(connected.map((item) => String(item.provider || "")));

  return {
    total: integrations.length,
    connected: connected.length,
    pending: Math.max(0, integrations.length - connected.length),
    drive_connected: connectedProviders.has("google_drive"),
    whatsapp_connected: connected.some((item) => WHATSAPP_PROVIDERS.has(String(item.provider || ""))),
    billing_connected: connectedProviders.has("asaas"),
    signature_connected: connectedProviders.has("zapsign"),
    escavador_connected: connectedProviders.has("escavador"),
  };
}

function serializeSupportGrant(grant: any | null) {
  if (!grant) return null;
  return {
    id: grant.id,
    scope: Array.isArray(grant.scope) ? grant.scope : [],
    status: grant.status,
    expires_at: grant.expires_at,
    requested_by: grant.requested_by || null,
    created_at: grant.created_at || null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateSuperadmin(req);
    if (auth.error) return auth.error;

    const [
      { data: tenants, error: tenantsError },
      { data: settings, error: settingsError },
      { data: profiles, error: profilesError },
      { data: integrations, error: integrationsError },
      { data: supportGrants, error: supportGrantsError },
    ] = await Promise.all([
      supabaseAdmin
        .from("tenants")
        .select("id, name, status, plan_type, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("tenant_settings").select("tenant_id, ai_features"),
      supabaseAdmin.from("profiles").select("tenant_id, is_active"),
      supabaseAdmin.from("tenant_integrations").select("tenant_id, provider, status"),
      supabaseAdmin
        .from("admin_support_grants")
        .select("id, tenant_id, requested_by, scope, status, expires_at, created_at")
        .eq("status", "active")
        .order("expires_at", { ascending: false }),
    ]);

    if (tenantsError || settingsError || profilesError || integrationsError || supportGrantsError) {
      return NextResponse.json({ error: "Erro interno ao carregar tenants de suporte." }, { status: 500 });
    }

    const activeProfiles = (profiles || []).filter((profile: any) => profile?.is_active !== false);
    const usersByTenant = countByTenant(activeProfiles);
    const settingsByTenant = new Map((settings || []).map((item: any) => [String(item.tenant_id), item]));
    const integrationsByTenant = new Map<string, any[]>();
    const activeGrantByTenant = new Map<string, any>();

    for (const integration of integrations || []) {
      const tenantId = integration?.tenant_id ? String(integration.tenant_id) : "";
      if (!tenantId) continue;
      const current = integrationsByTenant.get(tenantId) || [];
      current.push(integration);
      integrationsByTenant.set(tenantId, current);
    }

    for (const grant of supportGrants || []) {
      const tenantId = grant?.tenant_id ? String(grant.tenant_id) : "";
      if (!tenantId || !isSupportGrantActive(grant)) continue;
      if (!activeGrantByTenant.has(tenantId)) {
        activeGrantByTenant.set(tenantId, grant);
      }
    }

    const supportTenants = (tenants || []).map((tenant: any) => {
      const tenantId = String(tenant.id);
      const tenantIntegrations = integrationsByTenant.get(tenantId) || [];
      const activeGrant = activeGrantByTenant.get(tenantId) || null;

      return {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        plan_type: tenant.plan_type,
        created_at: tenant.created_at,
        demo_mode: isDemoModeEnabled(settingsByTenant.get(tenantId)?.ai_features),
        active_users: usersByTenant.get(tenantId) || 0,
        integrations: buildIntegrationSummary(tenantIntegrations),
        support: {
          can_view_setup_without_grant: true,
          requires_grant_for_sensitive_access: true,
          grant_status: activeGrant ? "active" : "not_requested",
          active_grant: serializeSupportGrant(activeGrant),
        },
      };
    });

    await supabaseAdmin.from("system_event_logs").insert({
      tenant_id: null,
      user_id: auth.user.id,
      event_name: "support_tenants_list_viewed",
      source: "admin_support_tenants",
      status: "completed",
      payload: {
        tenant_count: supportTenants.length,
        sensitive_data_included: false,
      },
    });

    return NextResponse.json({ tenants: supportTenants });
  } catch (error) {
    console.error("[admin/support/tenants][GET] fatal", error);
    return NextResponse.json({ error: "Erro interno ao carregar tenants de suporte." }, { status: 500 });
  }
}
