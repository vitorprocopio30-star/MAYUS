// src/app/api/agent/skills/route.ts
//
// API do Skill Registry
// GET   → lista skills do tenant autenticado
// PATCH → ativa/desativa uma skill (is_active)
//
// Segurança:
// - userId via sessão JWT (@supabase/ssr) — nunca do body
// - Apenas admin/socio podem acessar
// - Vínculo tenant_id na query (isolamento obrigatório)
// - service_role nunca exposto no frontend

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// ─── Constantes ───────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ["admin", "socio", "Administrador", "Sócio"];

// ─── Cliente Supabase Server (Service Role) ────────────────────────────────────

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAuthSession() {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* Route Handler — ignorar */ }
        },
      },
    }
  );
  return authClient.auth.getSession();
}

async function getProfile(userId: string) {
  const { data } = await serviceClient
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", userId)
    .single();
  return data;
}

// ─── GET /api/agent/skills ────────────────────────────────────────────────────
// Lista todas as skills do tenant autenticado.

export async function GET() {
  try {
    const { data: { session } } = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    const profile = await getProfile(session.user.id);
    if (!profile?.role || !profile?.tenant_id) {
      return NextResponse.json({ error: "Perfil nao encontrado." }, { status: 403 });
    }
    if (!ALLOWED_ROLES.includes(profile.role as typeof ALLOWED_ROLES[number])) {
      return NextResponse.json({ error: "Sem permissao para acessar o Skill Registry." }, { status: 403 });
    }

    const { data: skills, error } = await serviceClient
      .from("agent_skills")
      .select("id, name, description, risk_level, is_active, allowed_roles, allowed_channels, schema_version, requires_human_confirmation, created_at")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[Skills GET] Erro ao buscar skills:", error.message);
      return NextResponse.json({ error: "Erro ao buscar skills." }, { status: 500 });
    }

    return NextResponse.json({ skills: skills ?? [] });

  } catch (error: any) {
    console.error("[Skills GET] Erro interno:", error);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}

// ─── PATCH /api/agent/skills ──────────────────────────────────────────────────
// Ativa ou desativa uma skill.
// Body: { skillId: string, isActive: boolean }
//
// Apenas is_active pode ser alterado via este endpoint.
// Criação e edição estrutural de skills requerem migration.

export async function PATCH(req: NextRequest) {
  try {
    const { data: { session } } = await getAuthSession();
    if (!session) {
      return NextResponse.json({ error: "Nao autenticado." }, { status: 401 });
    }

    const { skillId, isActive } = await req.json();

    if (!skillId || typeof skillId !== "string") {
      return NextResponse.json({ error: "skillId invalido ou ausente." }, { status: 400 });
    }
    if (typeof isActive !== "boolean") {
      return NextResponse.json({ error: "isActive deve ser boolean." }, { status: 400 });
    }

    const profile = await getProfile(session.user.id);
    if (!profile?.role || !profile?.tenant_id) {
      return NextResponse.json({ error: "Perfil nao encontrado." }, { status: 403 });
    }
    if (!ALLOWED_ROLES.includes(profile.role as typeof ALLOWED_ROLES[number])) {
      return NextResponse.json({ error: "Apenas Admin e Socio podem alterar skills." }, { status: 403 });
    }

    // Update com tenant_id na query — impossibilita alterar skills de outro tenant
    const { data: updated, error: updateError } = await serviceClient
      .from("agent_skills")
      .update({ is_active: isActive })
      .eq("id", skillId)
      .eq("tenant_id", profile.tenant_id) // isolamento de tenant
      .select("id, name, is_active")
      .single();

    if (updateError || !updated) {
      console.error("[Skills PATCH] Falha ao atualizar:", updateError?.message);
      return NextResponse.json({ error: "Skill nao encontrada ou erro ao atualizar." }, { status: 404 });
    }

    return NextResponse.json({ success: true, skill: updated });

  } catch (error: any) {
    console.error("[Skills PATCH] Erro interno:", error);
    return NextResponse.json({ error: "Erro interno." }, { status: 500 });
  }
}
