// src/app/api/ai/conversations/route.ts
//
// Endpoint para gestão de conversas do MAYUS AI
// GET  → Lista conversas do usuário logado (ordenadas por updated_at)
// POST → Cria uma nova conversa

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Helper para pegar a sessão e o client do Supabase
 */
async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
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
}

// ─── GET: LISTAR CONVERSAS ────────────────────────────────────────────────────

export async function GET() {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("mayus_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", session.user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[Conversations GET]", error.message);
    return NextResponse.json({ error: "Erro ao buscar conversas." }, { status: 500 });
  }

  return NextResponse.json({ conversations: data });
}

// ─── POST: CRIAR CONVERSA ─────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  // Pegamos o tenant_id do profile do usuário
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", session.user.id)
    .single();

  if (!profile?.tenant_id) {
    return NextResponse.json({ error: "Perfil ou Tenant não encontrados." }, { status: 403 });
  }

  const { title } = await req.json().catch(() => ({}));

  const { data, error } = await supabase
    .from("mayus_conversations")
    .insert({
      tenant_id: profile.tenant_id,
      user_id:   session.user.id,
      title:     title || "Nova Conversa",
    })
    .select("id, title, created_at, updated_at")
    .single();

  if (error) {
    console.error("[Conversations POST]", error.message);
    return NextResponse.json({ error: "Erro ao criar conversa." }, { status: 500 });
  }

  return NextResponse.json({ conversation: data }, { status: 201 });
}
