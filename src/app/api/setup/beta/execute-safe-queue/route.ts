import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { executeTenantBetaSafeQueue } from "@/lib/setup/tenant-doctor";

const BodySchema = z.object({
  taskId: z.string().trim().min(1).optional(),
  maxSteps: z.number().int().min(1).max(20).optional(),
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

  console.error("[setup][beta][execute-safe-queue]", error);
  return NextResponse.json({ error: message || "Nao foi possivel executar a fila segura do beta." }, { status: 500 });
}

export async function POST(request: NextRequest) {
  try {
    const session = await getTenantSession({ requireFullAccess: true });
    const body = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos.", details: parsed.error.flatten().fieldErrors }, { status: 422 });
    }

    const result = await executeTenantBetaSafeQueue({
      tenantId: session.tenantId,
      userId: session.userId,
      taskId: parsed.data?.taskId || null,
      maxSteps: parsed.data?.maxSteps,
    });

    return NextResponse.json({ success: true, result });
  } catch (error) {
    return errorResponse(error);
  }
}
