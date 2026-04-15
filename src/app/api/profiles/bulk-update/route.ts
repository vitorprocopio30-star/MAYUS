import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

type ProfileUpdatePayload = {
  id: string;
  full_name: string;
  role: string;
  department_id: string | null;
  avatar_url: string | null;
  is_active: boolean;
};

function normalizeString(value: unknown): string {
  return String(value || "").trim();
}

function isPrivileged(role: string | null | undefined, isSuperadmin: boolean | null | undefined): boolean {
  return isSuperadmin === true || role === "Administrador" || role === "admin" || role === "mayus_admin" || role === "Sócio" || role === "socio";
}

export async function POST(req: Request) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
    }

    const { data: requesterProfile, error: requesterError } = await supabaseAdmin
      .from("profiles")
      .select("id, tenant_id, role, is_superadmin")
      .eq("id", user.id)
      .maybeSingle();

    if (requesterError || !requesterProfile) {
      return NextResponse.json({ error: "Perfil do solicitante nao encontrado." }, { status: 403 });
    }

    if (!isPrivileged(requesterProfile.role, requesterProfile.is_superadmin)) {
      return NextResponse.json({ error: "Permissao insuficiente para editar profissionais." }, { status: 403 });
    }

    const body = await req.json();
    const tenantId = normalizeString(body?.tenantId);
    const upserts = Array.isArray(body?.upserts) ? (body.upserts as ProfileUpdatePayload[]) : [];
    const removedIds = Array.isArray(body?.removedIds)
      ? body.removedIds.map((id: unknown) => normalizeString(id)).filter(Boolean)
      : [];

    if (!tenantId) {
      return NextResponse.json({ error: "Tenant obrigatorio." }, { status: 400 });
    }

    const requesterTenantId = normalizeString(requesterProfile.tenant_id);
    const requesterRole = requesterProfile.role;

    if (requesterRole !== "mayus_admin" && requesterProfile.is_superadmin !== true && requesterTenantId !== tenantId) {
      return NextResponse.json({ error: "Voce so pode editar profissionais do seu tenant." }, { status: 403 });
    }

    const sanitizedUpserts = upserts
      .map((entry) => ({
        id: normalizeString(entry.id),
        tenant_id: tenantId,
        full_name: normalizeString(entry.full_name),
        role: normalizeString(entry.role) || "Colaborador",
        department_id: normalizeString(entry.department_id) || null,
        avatar_url: normalizeString(entry.avatar_url) || null,
        is_active: entry.is_active !== false,
      }))
      .filter((entry) => entry.id && entry.full_name);

    const idsToValidate = sanitizedUpserts.map((entry) => entry.id);
    if (idsToValidate.length > 0) {
      const { data: existingProfiles, error: existingError } = await supabaseAdmin
        .from("profiles")
        .select("id, tenant_id")
        .in("id", idsToValidate);

      if (existingError) {
        return NextResponse.json({ error: "Falha ao validar profissionais." }, { status: 500 });
      }

      const invalidTenant = (existingProfiles || []).find((profile) => profile.tenant_id !== tenantId);
      if (invalidTenant) {
        return NextResponse.json({ error: "Foi detectado profissional fora do tenant informado." }, { status: 400 });
      }
    }

    if (sanitizedUpserts.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from("profiles")
        .upsert(sanitizedUpserts, { onConflict: "id" });

      if (upsertError) {
        return NextResponse.json({ error: upsertError.message || "Erro ao salvar profissionais." }, { status: 500 });
      }
    }

    if (removedIds.length > 0) {
      const { error: removeError } = await supabaseAdmin
        .from("profiles")
        .update({ is_active: false })
        .eq("tenant_id", tenantId)
        .in("id", removedIds);

      if (removeError) {
        return NextResponse.json({ error: removeError.message || "Erro ao desativar profissionais." }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, updatedCount: sanitizedUpserts.length, removedCount: removedIds.length });
  } catch (error: any) {
    console.error("[API profiles/bulk-update] erro:", error);
    return NextResponse.json({ error: error?.message || "Erro interno do servidor." }, { status: 500 });
  }
}
