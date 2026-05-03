import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/is-superadmin";

export const dynamic = "force-dynamic";

const ALLOWED_SCOPES = new Set([
  "setup_diagnostics",
  "tenant_sensitive_readonly",
  "support_case",
  "integration_health",
]);

const CreateGrantSchema = z.object({
  tenantId: z.string().uuid(),
  reason: z.string().trim().min(8).max(500),
  durationMinutes: z.number().int().min(15).max(240).optional(),
  scope: z.array(z.string().trim().min(1)).min(1).max(6).optional(),
});

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

function sanitizeScope(scope: string[] | undefined) {
  const requested = scope?.length ? scope : ["setup_diagnostics"];
  return Array.from(new Set(requested.filter((item) => ALLOWED_SCOPES.has(item))));
}

function serializeGrant(grant: any) {
  return {
    id: grant.id,
    tenant_id: grant.tenant_id,
    requested_by: grant.requested_by,
    reason: grant.reason,
    scope: Array.isArray(grant.scope) ? grant.scope : [],
    status: grant.status,
    expires_at: grant.expires_at,
    created_at: grant.created_at,
    revoked_at: grant.revoked_at || null,
  };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateSuperadmin(req);
    if (auth.error) return auth.error;

    const parsed = CreateGrantSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos.", details: parsed.error.flatten().fieldErrors }, { status: 422 });
    }

    const scope = sanitizeScope(parsed.data.scope);
    if (scope.length === 0) {
      return NextResponse.json({ error: "Escopo de suporte invalido." }, { status: 422 });
    }

    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .select("id, name")
      .eq("id", parsed.data.tenantId)
      .maybeSingle();

    if (tenantError) throw tenantError;
    if (!tenant) {
      return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
    }

    const now = new Date();
    const durationMinutes = parsed.data.durationMinutes || 60;
    const expiresAt = new Date(now.getTime() + durationMinutes * 60_000).toISOString();

    const { data: grant, error: insertError } = await supabaseAdmin
      .from("admin_support_grants")
      .insert({
        tenant_id: parsed.data.tenantId,
        requested_by: auth.user.id,
        reason: parsed.data.reason,
        scope,
        status: "active",
        expires_at: expiresAt,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .select("id, tenant_id, requested_by, reason, scope, status, expires_at, created_at, revoked_at")
      .single();

    if (insertError) throw insertError;

    await supabaseAdmin.from("system_event_logs").insert({
      tenant_id: parsed.data.tenantId,
      user_id: auth.user.id,
      event_name: "support_grant_created",
      source: "admin_support_grants",
      status: "completed",
      payload: {
        grant_id: grant.id,
        tenant_id: parsed.data.tenantId,
        duration_minutes: durationMinutes,
        scope,
        reason: parsed.data.reason,
        sensitive_data_included: false,
      },
    });

    return NextResponse.json({ success: true, grant: serializeGrant(grant), tenant_name: tenant.name || null });
  } catch (error) {
    console.error("[admin/support/grants][POST] fatal", error);
    return NextResponse.json({ error: "Erro interno ao criar grant de suporte." }, { status: 500 });
  }
}

