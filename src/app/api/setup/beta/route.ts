import { NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { startTenantBetaWorkMode } from "@/lib/setup/tenant-doctor";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno.";

  if (message === "Unauthorized") {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  if (message === "Forbidden") {
    return NextResponse.json({ error: "Sem permissao para iniciar o beta do tenant." }, { status: 403 });
  }

  if (message === "TenantNotFound") {
    return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
  }

  console.error("[setup][beta]", error);
  return NextResponse.json({ error: message || "Nao foi possivel iniciar o beta MAYUS." }, { status: 500 });
}

export async function POST() {
  try {
    const session = await getTenantSession({ requireFullAccess: true });
    const beta = await startTenantBetaWorkMode({
      tenantId: session.tenantId,
      userId: session.userId,
    });

    return NextResponse.json({ success: true, beta });
  } catch (error) {
    return errorResponse(error);
  }
}
