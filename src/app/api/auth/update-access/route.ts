import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { memberId, role, permissions, departmentId } = await req.json();
    const supabase = createClient();

    // 1. Verificar se o solicitante é um Admin autenticado
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const requesterRole = user.app_metadata?.role;
    const tenantId = user.app_metadata?.tenant_id;

    if (requesterRole !== "Administrador" && requesterRole !== "mayus_admin" && requesterRole !== "admin") {
      return NextResponse.json({ error: "Apenas Administradores podem alterar acessos." }, { status: 403 });
    }

    if (!tenantId || !memberId) {
      return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
    }

    // 2. Garante que o membro a ser editado pertence ao mesmo tenant
    const { data: memberProfile } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id")
      .eq("id", memberId)
      .single();

    if (!memberProfile || memberProfile.tenant_id !== tenantId) {
       return NextResponse.json({ error: "Membro não encontrado neste escritório." }, { status: 404 });
    }

    // 3. Atualiza os metadados do Auth no Supabase (JWT)
    // Isso garante que o Middleware bloqueará o acesso instantaneamente.
    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(memberId, {
      app_metadata: {
        custom_permissions: permissions,
        role: role,
        department_id: departmentId
      }
    });

    if (updateAuthError) {
      console.error("Erro ao atualizar metadados do auth:", updateAuthError);
      return NextResponse.json({ error: "Erro ao sincronizar segurança JWT do usuário." }, { status: 500 });
    }

    // 4. Atualiza a tabela pública (profiles) para exibição nativa
    const { error: updateProfileError } = await supabaseAdmin
      .from("profiles")
      .update({ role, custom_permissions: permissions, department_id: departmentId })
      .eq("id", memberId);

    if (updateProfileError) {
         console.error("Erro ao atualizar tabela profile:", updateProfileError);
    }

    // 5. Grava Auditoria
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_id: user.id,
      action: "UPDATE_ACCESS",
      entity: "auth",
      new_data: { member_id: memberId, role_assigned: role, permissions },
    });

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error("Erro na rota update-access:", err);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
