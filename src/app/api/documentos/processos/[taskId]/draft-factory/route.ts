import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { executeDraftFactoryForProcessTask } from "@/lib/lex/draft-factory";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const { tenantId, userId } = await getTenantSession();
    const taskId = String(params?.taskId || "").trim();
    const body = await request.json().catch(() => null);
    const trigger = body?.trigger === "case_brain_auto_draft_factory"
      ? "case_brain_auto_draft_factory"
      : "manual_draft_factory";

    if (!taskId) {
      return NextResponse.json({ error: "Processo invalido para Draft Factory." }, { status: 400 });
    }

    const execution = await executeDraftFactoryForProcessTask({
      tenantId,
      userId,
      processTaskId: taskId,
      trigger,
    });

    return NextResponse.json({ success: true, ...execution });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    if (error?.message === "A Draft Factory juridica ja esta em execucao para este processo.") {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error?.message || "Erro ao executar a Draft Factory juridica." },
      { status: 500 }
    );
  }
}
