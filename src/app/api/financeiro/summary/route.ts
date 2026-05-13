import { NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { loadTenantFinanceSummary } from "@/lib/finance/tenant-finance-summary";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function statusFromSessionError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Unauthorized") return 401;
  if (message === "Forbidden") return 403;
  return 400;
}

function messageFromSessionStatus(status: number) {
  if (status === 401) return "Nao autenticado.";
  if (status === 403) return "Acesso negado.";
  return "Tenant nao encontrado.";
}

export async function GET() {
  try {
    let session: Awaited<ReturnType<typeof getTenantSession>>;
    try {
      session = await getTenantSession();
    } catch (error) {
      const status = statusFromSessionError(error);
      return NextResponse.json({ error: messageFromSessionStatus(status) }, { status });
    }

    const summary = await loadTenantFinanceSummary({
      supabase: supabaseAdmin,
      tenantId: session.tenantId,
    });

    return NextResponse.json({
      ok: true,
      summary,
      metadata: {
        source: "financials",
        tenantScoped: true,
        collectionsFollowupSource: "brain_artifacts",
      },
    });
  } catch (error: any) {
    console.error("[financeiro/summary]", error?.message || error);
    return NextResponse.json({ error: "Nao foi possivel carregar o resumo financeiro." }, { status: 500 });
  }
}
