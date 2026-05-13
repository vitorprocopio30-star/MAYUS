import { NextRequest, NextResponse } from "next/server";
import { isSuperadmin } from "@/lib/auth/is-superadmin";
import { loadPlatformFinanceSummary } from "@/lib/finance/platform-billing-summary";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function authenticateSuperadmin(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: NextResponse.json({ error: "Nao autenticado." }, { status: 401 }) };

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return { error: NextResponse.json({ error: "Nao autenticado." }, { status: 401 }) };

  const ok = await isSuperadmin(user.id);
  if (!ok) return { error: NextResponse.json({ error: "Acesso negado." }, { status: 403 }) };

  return { user };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateSuperadmin(req);
    if (auth.error) return auth.error;

    const summary = await loadPlatformFinanceSummary({ supabase: supabaseAdmin });

    return NextResponse.json({
      ok: true,
      summary,
      metadata: {
        source: "tenants+platform_billing_events",
        platformScoped: true,
      },
    });
  } catch (error: any) {
    console.error("[admin/finance/summary]", error?.message || error);
    return NextResponse.json({ error: "Nao foi possivel carregar o financeiro da plataforma." }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
