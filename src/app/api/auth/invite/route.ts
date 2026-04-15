import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolvePublicAppUrl } from "@/lib/url/resolve-public-app-url";
import { isFullAccessRole, isStandardAccessRole, normalizeAccessRole } from "@/lib/permissions";

function sanitizePermissions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((item) => typeof item === "string");
}

async function upsertMemberProfile(params: {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  permissions: string[];
  departmentId?: string | null;
  fullName?: string | null;
}) {
  const fallbackName = params.email.split("@")[0] || "Membro Convidado";
  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert(
      {
        id: params.userId,
        tenant_id: params.tenantId,
        full_name: params.fullName || fallbackName,
        role: params.role,
        is_active: true,
        custom_permissions: params.permissions,
        department_id: params.departmentId || null,
        email_corporativo: params.email,
      },
      { onConflict: "id" }
    );

  if (error) throw error;
}

async function syncAuthMetadata(params: {
  userId: string;
  tenantId: string;
  role: string;
  permissions: string[];
  departmentId?: string | null;
}) {
  const { data: authUserData, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(params.userId);
  if (authUserError || !authUserData.user) throw authUserError || new Error("Usuario do auth nao encontrado.");

  const existingAppMetadata = authUserData.user.app_metadata || {};

  const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(params.userId, {
    app_metadata: {
      ...existingAppMetadata,
      tenant_id: params.tenantId,
      role: params.role,
      custom_permissions: params.permissions,
      department_id: params.departmentId || null,
    },
  });

  if (updateAuthError) throw updateAuthError;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const role = normalizeAccessRole(body.role);
    const department_id = body.department_id ? String(body.department_id) : null;
    const incomingPermissions = sanitizePermissions(body.permissions);
    const permissions = isFullAccessRole(role) ? ["ALL"] : incomingPermissions;
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

    const requesterRole = (requesterProfile?.role || user.app_metadata?.role) as string | undefined;
    const tenantId = (requesterProfile?.tenant_id || user.app_metadata?.tenant_id) as string | undefined;
    const isSuperadmin = requesterProfile?.is_superadmin === true;

    console.log("[Invite API] Solicitante:", user.email, "Role:", requesterRole, "TenantID:", tenantId);

    if (!isFullAccessRole(requesterRole) && !isSuperadmin) {
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

    if (!isStandardAccessRole(role)) {
      return NextResponse.json({ error: "Nivel de acesso invalido. Escolha um perfil padronizado." }, { status: 400 });
    }

    const appUrl = resolvePublicAppUrl(req);

    // 3. Convidar via Supabase Admin API (gera token real + e-mail nativo)
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        // user_metadata para uso em onboarding
        tenant_id: tenantId,
        role: role,
        department_id: department_id,
        custom_permissions: permissions,
      },
      redirectTo: `${appUrl}/auth/callback?next=/dashboard`,
    });

    if (inviteError) {
      if (inviteError.message.includes("already been registered") || inviteError.message.includes("already exists")) {
        // Se usuario ja existe no auth, sincroniza metadata/permissoes e garante profile no tenant.
        const { data: usersPage } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const users = ((usersPage as any)?.users || []) as Array<any>;
        const existingUser = users.find((u) => String(u?.email || "").toLowerCase() === email);

        if (!existingUser?.id) {
          return NextResponse.json({ error: "Este e-mail ja esta cadastrado, mas nao foi possivel sincronizar automaticamente." }, { status: 409 });
        }

        await syncAuthMetadata({
          userId: existingUser.id,
          tenantId,
          role,
          permissions,
          departmentId: department_id,
        });

        await upsertMemberProfile({
          userId: existingUser.id,
          tenantId,
          email,
          role,
          permissions,
          departmentId: department_id,
          fullName: existingUser.user_metadata?.full_name || null,
        });

        const { error: inviteInsertError } = await supabase.from("invites").insert({
          tenant_id: tenantId,
          email,
          invited_by: user.id,
          role,
          department_id,
          custom_permissions: permissions,
          accepted: true,
        });

        if (inviteInsertError) {
          console.warn("Falha ao registrar invite de usuario existente:", inviteInsertError.message);
        }

        await supabase.from("audit_logs").insert({
          tenant_id: tenantId,
          actor_id: user.id,
          action: "INVITE_REUSED_EXISTING_USER",
          entity: "auth",
          new_data: { invitee_email: email, role_assigned: role, department_id, permissions },
        });

        return NextResponse.json({ success: true, reused_existing_user: true });
      }
      console.error("Erro no convite Supabase:", inviteError.message);
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    const invitedUserId = inviteData?.user?.id;
    if (invitedUserId) {
      await syncAuthMetadata({
        userId: invitedUserId,
        tenantId,
        role,
        permissions,
        departmentId: department_id,
      });

      await upsertMemberProfile({
        userId: invitedUserId,
        tenantId,
        email,
        role,
        permissions,
        departmentId: department_id,
        fullName: inviteData.user?.user_metadata?.full_name || null,
      });
    }

    // 4. Registra o convite na tabela de convites (para tracking)
    await supabase.from("invites").insert({
      tenant_id: tenantId,
      email,
      invited_by: user.id,
      role,
      department_id,
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
