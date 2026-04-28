import { NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { runTenantDoctor } from "@/lib/setup/tenant-doctor";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Erro interno.";

  if (message === "Unauthorized") {
    return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
  }

  if (message === "Forbidden") {
    return NextResponse.json({ error: "Sem permissao para executar o setup do tenant." }, { status: 403 });
  }

  if (message === "TenantNotFound") {
    return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
  }

  console.error("[setup][doctor]", error);
  return NextResponse.json({ error: message || "Nao foi possivel executar o doctor do tenant." }, { status: 500 });
}

export async function GET() {
  try {
    const session = await getTenantSession({ requireFullAccess: true });
    const report = await runTenantDoctor({
      tenantId: session.tenantId,
      userId: session.userId,
      autoFix: false,
    });

    return NextResponse.json({ success: true, report });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST() {
  try {
    const session = await getTenantSession({ requireFullAccess: true });
    const report = await runTenantDoctor({
      tenantId: session.tenantId,
      userId: session.userId,
      autoFix: true,
    });

    return NextResponse.json({ success: true, report });
  } catch (error) {
    return errorResponse(error);
  }
}
