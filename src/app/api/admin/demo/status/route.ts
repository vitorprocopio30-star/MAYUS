import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/is-superadmin";
import {
  GOOGLE_DRIVE_PROVIDER,
  getGoogleDriveIntegrationMetadata,
  isGoogleDriveConfigured,
} from "@/lib/services/google-drive";
import { isDemoModeEnabled } from "@/lib/demo/demo-mode";

export const dynamic = "force-dynamic";

type DemoStatusBody = {
  tenantId?: unknown;
  demoMode?: unknown;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeFeatures(value: unknown) {
  return isRecord(value) ? value : {};
}

function buildDriveReadiness(integration: unknown) {
  const record = isRecord(integration) ? integration : {};
  const metadata = getGoogleDriveIntegrationMetadata(record);
  const connected = record.status === "connected" && typeof record.api_key === "string" && record.api_key.trim().length > 0;

  return {
    available: isGoogleDriveConfigured(),
    connected,
    status: typeof record.status === "string" ? record.status : "disconnected",
    connected_email: metadata.connected_email || null,
    root_folder_configured: Boolean(metadata.drive_root_folder_id),
    root_folder_name: metadata.drive_root_folder_name || null,
    root_folder_url: metadata.drive_root_folder_url || null,
  };
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

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateSuperadmin(req);
    if (auth.error) return auth.error;

    const [
      { data: tenants, error: tenantsError },
      { data: settings, error: settingsError },
      { data: driveIntegrations, error: driveIntegrationsError },
    ] = await Promise.all([
      supabaseAdmin
        .from("tenants")
        .select("id, name, status, plan_type, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("tenant_settings")
        .select("tenant_id, ai_features"),
      supabaseAdmin
        .from("tenant_integrations")
        .select("id, tenant_id, provider, status, api_key, metadata")
        .eq("provider", GOOGLE_DRIVE_PROVIDER),
    ]);

    if (tenantsError || settingsError || driveIntegrationsError) {
      return NextResponse.json({ error: "Erro interno ao carregar tenants demo." }, { status: 500 });
    }

    const settingsByTenant = new Map((settings || []).map((item: any) => [String(item.tenant_id), item]));
    const driveByTenant = new Map((driveIntegrations || []).map((item: any) => [String(item.tenant_id), item]));
    const demoTenants = (tenants || []).map((tenant: any) => {
      const features = normalizeFeatures(settingsByTenant.get(String(tenant.id))?.ai_features);
      const demo = isRecord(features.demo) ? features.demo : {};
      const driveReadiness = buildDriveReadiness(driveByTenant.get(String(tenant.id)) || null);
      return {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        plan_type: tenant.plan_type,
        created_at: tenant.created_at,
        demo_mode: isDemoModeEnabled(features),
        drive_mode: typeof demo.drive_mode === "string" ? demo.drive_mode : null,
        whatsapp_mode: typeof demo.whatsapp_mode === "string" ? demo.whatsapp_mode : null,
        escavador_mode: typeof demo.escavador_mode === "string" ? demo.escavador_mode : null,
        updated_at: typeof demo.updated_at === "string" ? demo.updated_at : null,
        drive_readiness: driveReadiness,
      };
    });

    return NextResponse.json({ tenants: demoTenants });
  } catch (error) {
    console.error("[admin/demo/status][GET] fatal", error);
    return NextResponse.json({ error: "Erro interno ao carregar status demo." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateSuperadmin(req);
    if (auth.error) return auth.error;

    const body = (await req.json().catch(() => ({}))) as DemoStatusBody;
    const tenantId = normalizeString(body.tenantId);
    const demoMode = body.demoMode === true;

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId e obrigatorio." }, { status: 400 });
    }

    if (typeof body.demoMode !== "boolean") {
      return NextResponse.json({ error: "demoMode deve ser booleano." }, { status: 400 });
    }

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id, name, status, plan_type, created_at")
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantError) throw tenantError;
    if (!tenant) {
      return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
    }

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("tenant_settings")
      .select("ai_features")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (settingsError) throw settingsError;

    const now = new Date().toISOString();
    const currentFeatures = normalizeFeatures((settings as any)?.ai_features);
    const currentDemo = isRecord(currentFeatures.demo) ? currentFeatures.demo : {};
    const nextFeatures = {
      ...currentFeatures,
      demo_mode: demoMode,
      demo: {
        ...currentDemo,
        enabled: demoMode,
        drive_mode: "real_demo_account",
        whatsapp_mode: "simulator",
        escavador_mode: "synthetic_oab",
        data_policy: "synthetic_only",
        updated_at: now,
        updated_by: auth.user.id,
      },
    };

    const { error: upsertError } = await supabaseAdmin
      .from("tenant_settings")
      .upsert({
        tenant_id: tenantId,
        ai_features: nextFeatures,
        updated_at: now,
      }, { onConflict: "tenant_id" });

    if (upsertError) throw upsertError;

    await supabaseAdmin.from("system_event_logs").insert({
      tenant_id: tenantId,
      user_id: auth.user.id,
      event_name: "demo_tenant_status_updated",
      source: "admin_demo_status",
      status: "completed",
      payload: {
        tenant_id: tenantId,
        demo_mode: demoMode,
        drive_mode: "real_demo_account",
        whatsapp_mode: "simulator",
        escavador_mode: "synthetic_oab",
      },
    });

    const { data: driveIntegration } = await supabaseAdmin
      .from("tenant_integrations")
      .select("id, tenant_id, provider, status, api_key, metadata")
      .eq("tenant_id", tenantId)
      .eq("provider", GOOGLE_DRIVE_PROVIDER)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      tenant: {
        ...tenant,
        demo_mode: demoMode,
        drive_mode: "real_demo_account",
        whatsapp_mode: "simulator",
        escavador_mode: "synthetic_oab",
        updated_at: now,
        drive_readiness: buildDriveReadiness(driveIntegration || null),
      },
    });
  } catch (error) {
    console.error("[admin/demo/status][PATCH] fatal", error);
    return NextResponse.json({ error: "Erro interno ao atualizar status demo." }, { status: 500 });
  }
}
