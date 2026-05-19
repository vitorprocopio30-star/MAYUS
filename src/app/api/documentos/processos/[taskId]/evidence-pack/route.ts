import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { buildDocumentEvidencePack, persistDocumentEvidencePack } from "@/lib/services/document-evidence-pack";

export const runtime = "nodejs";

function normalizeTaskId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getSafeError(error: any, fallback: string) {
  if (error?.message === "Unauthorized") return { error: "Nao autenticado.", status: 401 };
  if (error?.message === "TenantNotFound") return { error: "Tenant nao encontrado para a sessao atual.", status: 403 };
  if (error?.message === "Forbidden") return { error: "Apenas usuarios com acesso completo podem persistir o pacote de evidencias.", status: 403 };
  if (error?.message === "Processo nao encontrado.") return { error: error.message, status: 404 };
  return { error: error?.message || fallback, status: 500 };
}

export async function GET(_request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const { tenantId } = await getTenantSession();
    const taskId = normalizeTaskId(params?.taskId);

    if (!taskId) {
      return NextResponse.json({ error: "Processo invalido para montar pacote de evidencias." }, { status: 400 });
    }

    const pack = await buildDocumentEvidencePack({ tenantId, processTaskId: taskId });
    return NextResponse.json({ pack });
  } catch (error: any) {
    const safeError = getSafeError(error, "Erro ao montar pacote de evidencias documentais.");
    return NextResponse.json({ error: safeError.error }, { status: safeError.status });
  }
}

export async function POST(_request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const { tenantId, userId } = await getTenantSession({ requireFullAccess: true });
    const taskId = normalizeTaskId(params?.taskId);

    if (!taskId) {
      return NextResponse.json({ error: "Processo invalido para persistir pacote de evidencias." }, { status: 400 });
    }

    const result = await persistDocumentEvidencePack({ tenantId, processTaskId: taskId, userId });
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    const safeError = getSafeError(error, "Erro ao persistir pacote de evidencias documentais.");
    return NextResponse.json({ error: safeError.error }, { status: safeError.status });
  }
}
