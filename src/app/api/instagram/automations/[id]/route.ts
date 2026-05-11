import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }> | { id: string };
};

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { tenantId } = await getTenantSession({ requireFullAccess: true });
    const params = await context.params;
    const id = String(params.id || "").trim();

    if (!id) {
      return NextResponse.json({ error: "Automacao invalida." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("instagram_automations")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    if (error.message === "TenantNotFound") return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
    return NextResponse.json({ error: "Nao foi possivel remover a automacao do Instagram." }, { status: 500 });
  }
}
