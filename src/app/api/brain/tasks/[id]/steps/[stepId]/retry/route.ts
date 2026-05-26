import { NextRequest, NextResponse } from "next/server";
import { isBrainExecutiveRole } from "@/lib/brain/roles";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";
import { BrainStepControlError, normalizeBrainStepControlReason, retryBrainStep } from "@/lib/brain/step-control";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { id: string; stepId: string } }) {
  try {
    const auth = await getBrainAuthContext();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!isBrainExecutiveRole(auth.context.userRole)) {
      return NextResponse.json({ error: "Apenas perfis executivos podem reabrir etapas." }, { status: 403 });
    }

    const taskId = String(params.id || "").trim();
    const stepId = String(params.stepId || "").trim();
    if (!taskId || !stepId) {
      return NextResponse.json({ error: "task id ou step id invalido." }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const reason = normalizeBrainStepControlReason(body?.reason);
    if (!reason) {
      return NextResponse.json({ error: "Informe um motivo valido para reabrir a etapa." }, { status: 400 });
    }

    const result = await retryBrainStep({
      client: brainAdminSupabase,
      tenantId: auth.context.tenantId,
      actorId: auth.context.userId,
      taskId,
      stepId,
      reason,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof BrainStepControlError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[brain/tasks/:id/steps/:stepId/retry] fatal", error);
    return NextResponse.json({ error: "Erro interno ao reabrir etapa." }, { status: 500 });
  }
}
