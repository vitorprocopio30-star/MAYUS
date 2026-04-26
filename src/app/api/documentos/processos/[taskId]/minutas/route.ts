import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import {
  createHumanReviewedProcessDraftVersion,
  listProcessDraftVersions,
} from "@/lib/lex/draft-versions";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const { tenantId } = await getTenantSession();
    const taskId = String(params?.taskId || "").trim();

    if (!taskId) {
      return NextResponse.json({ error: "Processo invalido para listar minutas." }, { status: 400 });
    }

    const versions = await listProcessDraftVersions({
      tenantId,
      processTaskId: taskId,
    });

    return NextResponse.json({ versions });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error?.message || "Erro ao carregar o historico de minutas." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const { tenantId, userId } = await getTenantSession({ requireFullAccess: true });
    const taskId = String(params?.taskId || "").trim();
    const body = await request.json().catch(() => null);
    const baseVersionId = String(body?.baseVersionId || body?.versionId || "").trim();
    const draftMarkdown = typeof body?.draftMarkdown === "string" ? body.draftMarkdown : "";

    if (!taskId) {
      return NextResponse.json({ error: "Processo invalido para registrar a revisao humana." }, { status: 400 });
    }

    if (!baseVersionId) {
      return NextResponse.json({ error: "Informe a versao base da minuta para criar uma nova revisao humana." }, { status: 400 });
    }

    if (!String(draftMarkdown || "").trim()) {
      return NextResponse.json({ error: "Nao foi possivel salvar a revisao humana sem conteudo." }, { status: 400 });
    }

    const version = await createHumanReviewedProcessDraftVersion({
      tenantId,
      processTaskId: taskId,
      baseVersionId,
      draftMarkdown,
      actorId: userId,
      surface: "documentos",
    });

    return NextResponse.json({ success: true, version });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    if (error.message === "Forbidden") {
      return NextResponse.json({ error: "Apenas administradores ou socios podem salvar uma nova versao formal da minuta." }, { status: 403 });
    }

    if (error?.message === "Versao da minuta nao encontrada.") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (
      error?.message === "Selecione a versao atual da minuta antes de salvar uma nova revisao humana."
      || error?.message === "A versao selecionada esta desatualizada em relacao ao Case Brain atual e nao pode originar nova versao formal."
      || error?.message === "Nenhuma alteracao material foi detectada para criar uma nova versao formal."
      || error?.message === "A versao base da minuta nao e mais a atual. Recarregue antes de salvar nova revisao."
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error?.message === "Nao foi possivel salvar a revisao humana sem conteudo.") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: error?.message || "Erro ao registrar a revisao humana da minuta." },
      { status: 500 }
    );
  }
}
