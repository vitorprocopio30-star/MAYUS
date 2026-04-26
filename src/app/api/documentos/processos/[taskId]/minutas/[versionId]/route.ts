import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { updateProcessDraftVersionWorkflow } from "@/lib/lex/draft-versions";

export const runtime = "nodejs";

export async function PATCH(request: NextRequest, { params }: { params: { taskId: string; versionId: string } }) {
  try {
    const { tenantId, userId } = await getTenantSession({ requireFullAccess: true });
    const taskId = String(params?.taskId || "").trim();
    const versionId = String(params?.versionId || "").trim();
    const body = await request.json().catch(() => null);
    const action = body?.action === "publish" ? "publish" : body?.action === "approve" ? "approve" : null;

    if (!taskId || !versionId) {
      return NextResponse.json({ error: "Referencia invalida da minuta." }, { status: 400 });
    }

    if (!action) {
      return NextResponse.json({ error: "Acao invalida para workflow da minuta." }, { status: 400 });
    }

    const version = await updateProcessDraftVersionWorkflow({
      tenantId,
      processTaskId: taskId,
      versionId,
      action,
      actorId: userId,
    });

    return NextResponse.json({ success: true, version });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    if (error.message === "Forbidden") {
      return NextResponse.json({ error: "Apenas administradores ou socios podem revisar formalmente a minuta." }, { status: 403 });
    }

    if (error?.message === "Versao da minuta nao encontrada.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (
      error?.message === "A versao precisa ser aprovada antes da publicacao."
      || error?.message === "A versao da minuta esta desatualizada em relacao ao Case Brain atual."
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error?.message || "Erro ao atualizar o workflow da minuta." },
      { status: 500 }
    );
  }
}
