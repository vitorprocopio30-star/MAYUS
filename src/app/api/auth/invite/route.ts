import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  try {
    const { email, role, department_id, permissions = [] } = await req.json();
    const supabase = createClient();

    // 1. Verificar se o solicitante é um Admin autenticado
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const requesterRole = user.app_metadata?.role;
    const tenantId = user.app_metadata?.tenant_id;

    console.log("[Invite API] Solicitante:", user.email, "Role:", requesterRole, "TenantID:", tenantId);

    if (requesterRole !== "Administrador" && requesterRole !== "mayus_admin" && requesterRole !== "admin") {
      console.warn("[Invite API] Acesso Negado: Role insuficiente:", requesterRole);
      return NextResponse.json({ error: "Apenas Administradores podem convidar membros." }, { status: 403 });
    }

    if (!tenantId) {
      console.error("[Invite API] Erro: tenant_id não encontrado no JWT do usuário.");
      return NextResponse.json({ error: "Escritório (tenant) não identificado no seu perfil. Tente fazer logout e login novamente." }, { status: 400 });
    }

    if (!email || !role) {
      return NextResponse.json({ error: "E-mail e perfil são obrigatórios." }, { status: 400 });
    }

    // 2. Verificar se o e-mail já existe como membro
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("full_name", email) // fallback check
      .maybeSingle();

    // 3. Convidar via Supabase Admin API (gera token real + e-mail nativo)
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        // app_metadata: esses dados serão injetados no token do convite
        // e lidos pela trigger handle_new_user para criar o perfil
        tenant_id: tenantId,
        role: role,
        department_id: department_id,
        custom_permissions: permissions,
      },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://mayus-premium-pro.vercel.app'}/auth/callback?next=/dashboard`,
    });

    if (inviteError) {
      // Checa erros comuns
      if (inviteError.message.includes("already been registered") || inviteError.message.includes("already exists")) {
        return NextResponse.json({ error: "Este e-mail já está cadastrado no sistema." }, { status: 409 });
      }
      console.error("Erro no convite Supabase:", inviteError.message);
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    // 4. Registra o convite na tabela de convites (para tracking)
    await supabase.from("invites").insert({
      tenant_id: tenantId,
      email: email,
      invited_by: user.id,
      role: role,
      department_id: department_id,
      custom_permissions: permissions,
      accepted: false,
    });

    // 5. Grava Auditoria
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_id: user.id,
      action: "INVITE_SENT",
      entity: "auth",
      new_data: { invitee_email: email, role_assigned: role, department_id, permissions },
    });

    return NextResponse.json({ success: true, data: inviteData });

  } catch (err) {
    console.error("Erro na rota invite:", err);
    return NextResponse.json({ error: "Erro interno do servidor." }, { status: 500 });
  }
}
