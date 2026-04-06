// src/app/api/agent/memory/route.ts
//
// CRUD da Memória Institucional do Escritório
// GET    → lista entradas do tenant
// POST   → cria nova entrada
// PATCH  → edita key, value, category ou enforced
// DELETE → remove entrada (via query param ?id=)
//
// Acesso: apenas admin/socio
// Isolamento: tenant_id em todas as queries

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const ALLOWED_ROLES = ["admin", "socio", "Administrador", "Sócio"];

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Service Client (singleton no módulo) ────────────────────────────────────

async function getAuthSession() {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { }
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

async function authGuard() {
  const { data: { session } } = await getAuthSession();
  if (!session) return { error: "Nao autenticado.", status: 401, session: null, profile: null };

  const profile = await getProfile(session.user.id);
  if (!profile?.role || !profile?.tenant_id) {
    return { error: "Perfil nao encontrado.", status: 403, session, profile: null };
  }
  if (!ALLOWED_ROLES.includes(profile.role as typeof ALLOWED_ROLES[number])) {
    return { error: "Sem permissao.", status: 403, session, profile: null };
  }

  return { error: null, status: 200, session, profile };
}

// ─── Serialização de value (JSONB) ────────────────────────────────────────────

/** Frontend envia string → banco armazena como { text: "..." } */
function serializeValue(text: string): object {
  return { text: text.trim() };
}

/** Banco retorna { text: "..." } → frontend recebe string */
function deserializeValue(jsonb: unknown): string {
  if (typeof jsonb === "object" && jsonb !== null && "text" in jsonb) {
    return (jsonb as { text: string }).text;
  }
  return String(jsonb ?? "");
}

// ─── GET /api/agent/memory ────────────────────────────────────────────────────

export async function GET() {
  const auth = await authGuard();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await serviceClient
    .from("office_institutional_memory")
    .select("id, category, key, value, enforced, created_by, created_at")
    .eq("tenant_id", auth.profile!.tenant_id)
    .order("category", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Memory GET]", error.message);
    return NextResponse.json({ error: "Erro ao buscar memória." }, { status: 500 });
  }

  const entries = (data ?? []).map(e => ({
    ...e,
    value: deserializeValue(e.value),
  }));

  return NextResponse.json({ entries });
}

// ─── POST /api/agent/memory ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await authGuard();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { key, value, category } = await req.json();

  if (!key || typeof key !== "string" || key.trim().length === 0) {
    return NextResponse.json({ error: "key invalida ou ausente." }, { status: 400 });
  }
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    return NextResponse.json({ error: "value invalido ou ausente." }, { status: 400 });
  }
  if (!category || typeof category !== "string" || category.trim().length === 0) {
    return NextResponse.json({ error: "category invalida ou ausente." }, { status: 400 });
  }

  const { data, error } = await serviceClient
    .from("office_institutional_memory")
    .insert({
      tenant_id:  auth.profile!.tenant_id,
      key:        key.trim(),
      value:      serializeValue(value),
      category:   category.trim().toLowerCase(),
      enforced:   true,
      created_by: auth.session!.user.id,
    })
    .select("id, category, key, value, enforced, created_at")
    .single();

  if (error) {
    console.error("[Memory POST]", error.message);
    return NextResponse.json({ error: "Erro ao criar entrada." }, { status: 500 });
  }

  return NextResponse.json(
    { entry: { ...data, value: deserializeValue(data.value) } },
    { status: 201 }
  );
}

// ─── PATCH /api/agent/memory ──────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await authGuard();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { entryId, key, value, category, enforced } = await req.json();

  if (!entryId || typeof entryId !== "string") {
    return NextResponse.json({ error: "entryId invalido ou ausente." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (key      !== undefined) updates.key      = String(key).trim();
  if (value    !== undefined) updates.value    = serializeValue(String(value));
  if (category !== undefined) updates.category = String(category).trim().toLowerCase();
  if (enforced !== undefined && typeof enforced === "boolean") updates.enforced = enforced;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar." }, { status: 400 });
  }

  const { data, error } = await serviceClient
    .from("office_institutional_memory")
    .update(updates)
    .eq("id", entryId)
    .eq("tenant_id", auth.profile!.tenant_id) // isolamento de tenant
    .select("id, category, key, value, enforced")
    .single();

  if (error || !data) {
    console.error("[Memory PATCH]", error?.message);
    return NextResponse.json({ error: "Entrada nao encontrada ou erro ao atualizar." }, { status: 404 });
  }

  return NextResponse.json({ entry: { ...data, value: deserializeValue(data.value) } });
}

// ─── DELETE /api/agent/memory?id= ────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await authGuard();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const entryId = req.nextUrl.searchParams.get("id");

  if (!entryId) {
    return NextResponse.json({ error: "Query param ?id= ausente." }, { status: 400 });
  }

  const { error } = await serviceClient
    .from("office_institutional_memory")
    .delete()
    .eq("id", entryId)
    .eq("tenant_id", auth.profile!.tenant_id); // isolamento de tenant

  if (error) {
    console.error("[Memory DELETE]", error.message);
    return NextResponse.json({ error: "Erro ao deletar entrada." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
