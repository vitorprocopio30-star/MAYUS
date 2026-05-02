import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isSuperadmin } from "@/lib/auth/is-superadmin";
import { DEMO_RESET_CONFIRMATION, resetDemoTenant } from "@/lib/demo/demo-tenant-reset";

export const dynamic = "force-dynamic";

type ResetBody = {
  tenantId?: unknown;
  confirm?: unknown;
  dryRun?: unknown;
};

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

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateSuperadmin(req);
    if (auth.error) return auth.error;

    const body = (await req.json().catch(() => ({}))) as ResetBody;
    const tenantId = normalizeString(body.tenantId);
    const confirm = normalizeString(body.confirm);
    const dryRun = body.dryRun !== false;

    if (!tenantId) {
      return NextResponse.json({ error: "tenantId e obrigatorio." }, { status: 400 });
    }

    if (!dryRun && confirm !== DEMO_RESET_CONFIRMATION) {
      return NextResponse.json(
        {
          error: `Confirmacao obrigatoria para reset real. Envie confirm="${DEMO_RESET_CONFIRMATION}".`,
        },
        { status: 400 }
      );
    }

    const result = await resetDemoTenant({
      tenantId,
      actorUserId: auth.user.id,
      dryRun,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ErroInterno";
    if (message === "DemoTenantNotFound") {
      return NextResponse.json({ error: "Tenant demo nao encontrado." }, { status: 404 });
    }
    if (message === "TenantIsNotDemo") {
      return NextResponse.json(
        { error: "Reset bloqueado: tenant nao esta marcado como demo_mode." },
        { status: 409 }
      );
    }

    console.error("[admin/demo/reset] fatal", error);
    return NextResponse.json({ error: "Erro interno ao resetar tenant demo." }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
