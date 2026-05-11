import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function normalizeText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function serializeAutomation(row: any) {
  return {
    id: String(row.id || ""),
    keyword: String(row.keyword || ""),
    response_text: row.response_text || "",
    direct_message: row.direct_message || "",
    file_url: row.file_url || "",
    is_active: row.is_active !== false,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

export async function GET() {
  try {
    const { tenantId } = await getTenantSession();
    const { data, error } = await supabaseAdmin
      .from("instagram_automations")
      .select("id, keyword, response_text, direct_message, file_url, is_active, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      automations: (data || []).map(serializeAutomation),
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    if (error.message === "TenantNotFound") return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
    return NextResponse.json({ error: "Nao foi possivel carregar as automacoes do Instagram." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getTenantSession({ requireFullAccess: true });
    const body = await request.json().catch(() => null);
    const keyword = normalizeText(body?.keyword, 80).toLowerCase();
    const responseText = normalizeText(body?.response_text, 500);
    const directMessage = normalizeText(body?.direct_message, 1500);
    const fileUrl = normalizeText(body?.file_url, 1000);

    if (!keyword) {
      return NextResponse.json({ error: "Palavra-chave obrigatoria." }, { status: 400 });
    }

    if (!responseText && !directMessage && !fileUrl) {
      return NextResponse.json({ error: "Configure ao menos resposta publica, mensagem no direct ou link de entrega." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("instagram_automations")
      .upsert({
        tenant_id: session.tenantId,
        keyword,
        response_text: responseText || null,
        direct_message: directMessage || null,
        file_url: fileUrl || null,
        is_active: body?.is_active !== false,
        created_by: session.userId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "tenant_id,keyword" })
      .select("id, keyword, response_text, direct_message, file_url, is_active, created_at, updated_at")
      .single();

    if (error) throw error;

    return NextResponse.json({ automation: serializeAutomation(data) });
  } catch (error: any) {
    if (error.message === "Unauthorized") return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    if (error.message === "Forbidden") return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
    if (error.message === "TenantNotFound") return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });
    return NextResponse.json({ error: error?.message || "Nao foi possivel salvar a automacao do Instagram." }, { status: 500 });
  }
}
