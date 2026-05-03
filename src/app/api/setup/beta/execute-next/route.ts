import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { executeNextTenantBetaStep } from "@/lib/setup/tenant-doctor";

const BodySchema = z.object({
  taskId: z.string().trim().min(1).optional(),
}).optional().nullable();

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno.";

  if (message === "Unauthorized") {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  if (message === "Forbidden") {
    return NextResponse.json({ error: "Sem permissao para executar o beta do tenant." }, { status: 403 });
  }

  if (message === "TenantNotFound") {
    return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
  }

  console.error("[setup][beta][execute-next]", error);
  return NextResponse.json({ error: message || "Nao foi possivel executar o proximo item beta." }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getTenantSession({ requireFullAccess: true });
    const body = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos.", details: parsed.error.flatten().fieldErrors }, { status: 422 });
    }

    const execution = await executeNextTenantBetaStep({
      tenantId: session.tenantId,
      userId: session.userId,
      taskId: parsed.data?.taskId || null,
    });

    if (!execution) {
      return NextResponse.json({ success: true, execution: null, message: "Nenhum item seguro em fila para executar." });
    }

    return NextResponse.json({ success: true, execution });
  } catch (error) {
    return errorResponse(error);
  }
}
