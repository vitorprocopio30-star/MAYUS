import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { isFullAccessRole, isStandardAccessRole, toCanonicalAccessRole } from "@/lib/permissions";

export async function POST(req: Request) {
  try {
    const { memberId, role: rawRole, permissions, departmentId } = await req.json();
    const role = toCanonicalAccessRole(rawRole);
    const supabase = createClient();

    // 1. Verificar se o solicitante é um Admin autenticado
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const { data: requesterProfile } = await supabaseAdmin
      .from("profiles")
      .select("role, tenant_id, is_superadmin")
      .eq("id", user.id)
      .maybeSingle();

    const requesterRole = requesterProfile?.role || user.app_metadata?.role;
    const tenantId = requesterProfile?.tenant_id || user.app_metadata?.tenant_id;
    const isSuperadmin = requesterProfile?.is_superadmin === true;

    if (!isFullAccessRole(requesterRole) && !isSuperadmin) {
      return NextResponse.json({ error: "Apenas Administradores podem alterar acessos." }, { status: 403 });
    }

    if (!tenantId || !memberId) {
      return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
    }

    if (!isStandardAccessRole(role)) {
      return NextResponse.json({ error: "Nivel de acesso invalido. Use um perfil padronizado." }, { status: 400 });
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

    const requestedPermissions = Array.isArray(permissions) ? permissions : [];
    const normalizedPermissions = isFullAccessRole(role) ? ["ALL"] : requestedPermissions;

    // 3. Atualiza os metadados do Auth no Supabase (JWT)
    // Preserva campos existentes para nao perder tenant_id nem outros metadados.
    const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(memberId);
    if (authUserError || !authUserData.user) {
      console.error("Erro ao buscar usuario no auth:", authUserError);
      return NextResponse.json({ error: "Nao foi possivel localizar o usuario no Auth." }, { status: 500 });
    }

    const existingAppMetadata = authUserData.user.app_metadata || {};

    const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(memberId, {
      app_metadata: {
        ...existingAppMetadata,
        tenant_id: memberProfile.tenant_id,
        custom_permissions: normalizedPermissions,
        role: role,
        department_id: departmentId || null,
      }
    });

    if (updateAuthError) {
      console.error("Erro ao atualizar metadados do auth:", updateAuthError);
      return NextResponse.json({ error: "Erro ao sincronizar segurança JWT do usuário." }, { status: 500 });
    }

    // 4. Atualiza a tabela pública (profiles) para exibição nativa
    const { error: updateProfileError } = await supabaseAdmin
      .from("profiles")
      .update({ role, custom_permissions: normalizedPermissions, department_id: departmentId || null })
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
      new_data: { member_id: memberId, role_assigned: role, permissions: normalizedPermissions },
    });

    return NextResponse.json({ success: true });

  } catch (err) {
    console.error("Erro na rota update-access:", err);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
