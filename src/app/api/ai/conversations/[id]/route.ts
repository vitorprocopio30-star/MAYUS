// src/app/api/ai/conversations/[id]/route.ts
//
// Endpoint para gestão de uma conversa específica e suas mensagens
// GET    → Retorna todas as mensagens da conversa
// POST   → Adiciona uma nova mensagem à conversa
// PATCH  → Atualiza o título da conversa
// DELETE → Remove a conversa

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

// ─── GET: BUSCAR MENSAGENS ───────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // Buscamos mensagens vinculadas à conversa (RLS cuidará da segurança)
  const { data, error } = await supabase
    .from("mayus_messages")
    .select("id, role, content, kernel, created_at")
    .eq("conversation_id", params.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[ConvID GET]", error.message);
    return NextResponse.json({ error: "Erro ao buscar mensagens." }, { status: 500 });
  }

  return NextResponse.json({ messages: data });
}

// ─── POST: ADICIONAR MENSAGEM ────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { role, content, kernel } = await req.json();

  if (!role || !content) {
    return NextResponse.json({ error: "Role e Content são obrigatórios." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("mayus_messages")
    .insert({
      conversation_id: params.id,
      role,
      content,
      kernel: kernel || {},
    })
    .select("id, role, content, kernel, created_at")
    .single();

  if (error) {
    console.error("[ConvID POST]", error.message);
    return NextResponse.json({ error: "Erro ao salvar mensagem." }, { status: 500 });
  }

  return NextResponse.json({ message: data }, { status: 201 });
}

// ─── PATCH: ATUALIZAR TÍTULO ─────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { title } = await req.json();

  if (!title) {
    return NextResponse.json({ error: "Título é obrigatório." }, { status: 400 });
  }

  const { error } = await supabase
    .from("mayus_conversations")
    .update({ title })
    .eq("id", params.id);

  if (error) {
    console.error("[ConvID PATCH]", error.message);
    return NextResponse.json({ error: "Erro ao atualizar título." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// ─── DELETE: REMOVER CONVERSA ────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await getSupabase();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { error } = await supabase
    .from("mayus_conversations")
    .delete()
    .eq("id", params.id);

  if (error) {
    console.error("[ConvID DELETE]", error.message);
    return NextResponse.json({ error: "Erro ao remover conversa." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
