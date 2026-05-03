import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/is-superadmin";

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

function normalizeGrantId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateSuperadmin(req);
    if (auth.error) return auth.error;

    const grantId = normalizeGrantId(params.id);
    if (!grantId) {
      return NextResponse.json({ error: "grantId e obrigatorio." }, { status: 400 });
    }

    const { data: grant, error: grantError } = await supabaseAdmin
      .from("admin_support_grants")
      .select("id, tenant_id, status")
      .eq("id", grantId)
      .maybeSingle();

    if (grantError) throw grantError;
    if (!grant) {
      return NextResponse.json({ error: "Grant nao encontrado." }, { status: 404 });
    }

    if (grant.status !== "active") {
      return NextResponse.json({ error: "Grant ja esta encerrado." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("admin_support_grants")
      .update({
        status: "revoked",
        revoked_at: now,
        revoked_by: auth.user.id,
        updated_at: now,
      })
      .eq("id", grantId);

    if (updateError) throw updateError;

    await supabaseAdmin.from("system_event_logs").insert({
      tenant_id: grant.tenant_id,
      user_id: auth.user.id,
      event_name: "support_grant_revoked",
      source: "admin_support_grants",
      status: "completed",
      payload: {
        grant_id: grantId,
        tenant_id: grant.tenant_id,
        sensitive_data_included: false,
      },
    });

    return NextResponse.json({ success: true, grant_id: grantId, status: "revoked" });
  } catch (error) {
    console.error("[admin/support/grants/revoke][POST] fatal", error);
    return NextResponse.json({ error: "Erro interno ao revogar grant de suporte." }, { status: 500 });
  }
}

