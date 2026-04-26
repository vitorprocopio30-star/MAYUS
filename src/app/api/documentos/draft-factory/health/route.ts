import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { getDraftFactoryQueueHealth } from "@/lib/lex/draft-factory-health";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function normalizeMinutes(value: string | null, fallback: number) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), 5), 240);
}

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantSession();
    const { searchParams } = new URL(request.url);
    const stuckRunningMinutes = normalizeMinutes(searchParams.get("stuck_running_minutes"), 20);

    const health = await getDraftFactoryQueueHealth({
      tenantId,
      stuckRunningMinutes,
    });

    return NextResponse.json({ ok: true, health });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error?.message || "Erro ao carregar a saude da fila da Draft Factory." },
      { status: 500 }
    );
  }
}
