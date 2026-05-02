import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { DEMO_SEED_TAG } from "@/lib/demo/demo-oab-flow";

export const dynamic = "force-dynamic";

function normalizeText(value: unknown) {
  return String(value || "").trim();
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function firstName(value: unknown) {
  const name = normalizeText(value);
  return name.split(/\s+/)[0] || "cliente";
}

async function getAuthenticatedTenant() {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {}
        },
      },
    }
  );

  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return { error: "Nao autorizado.", status: 401 as const };

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("tenant_id, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile?.tenant_id) return { error: "Perfil ou tenant nao vinculados.", status: 403 as const };

  return {
    tenantId: String(profile.tenant_id),
    userId: user.id,
    actorName: String(profile.full_name || ""),
  };
}

async function findLatestDraft(tenantId: string, contactId: string) {
  const { data: event } = await supabaseAdmin
    .from("system_event_logs")
    .select("id, payload, created_at")
    .eq("tenant_id", tenantId)
    .in("event_name", ["whatsapp_mayus_reply_prepared", "whatsapp_sales_reply_prepared"])
    .eq("payload->>contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = event?.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : null;
  const suggestedReply = normalizeText(payload?.suggested_reply);
  return suggestedReply ? { eventId: event.id, suggestedReply } : null;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedTenant();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const contactId = normalizeText(body?.contact_id);
    const providedText = normalizeText(body?.text);

    if (!contactId) {
      return NextResponse.json({ error: "contact_id obrigatorio." }, { status: 400 });
    }

    const { data: contact, error: contactError } = await supabaseAdmin
      .from("whatsapp_contacts")
      .select("id, tenant_id, phone_number, name, lead_tags, unread_count")
      .eq("tenant_id", auth.tenantId)
      .eq("id", contactId)
      .maybeSingle();

    if (contactError) throw contactError;
    if (!contact) {
      return NextResponse.json({ error: "Contato nao encontrado." }, { status: 404 });
    }

    const tags = normalizeTags((contact as any).lead_tags);
    const isDemoContact = tags.includes(DEMO_SEED_TAG);
    if (!isDemoContact) {
      return NextResponse.json(
        {
          error: "Execucao automatica bloqueada para contato real. Use envio humano supervisionado.",
          requires_human_send: true,
        },
        { status: 409 }
      );
    }

    const latestDraft = providedText ? null : await findLatestDraft(auth.tenantId, contactId);
    const text = providedText
      || latestDraft?.suggestedReply
      || `Oi, ${firstName((contact as any).name)}. O MAYUS organizou o atendimento demo, registrou a providencia e deixou o proximo passo pronto para revisao humana.`;

    const now = new Date().toISOString();
    const { data: message, error: messageError } = await supabaseAdmin
      .from("whatsapp_messages")
      .insert([{
        tenant_id: auth.tenantId,
        contact_id: contactId,
        direction: "outbound",
        message_type: "text",
        content: text,
        status: "sent",
        created_at: now,
        metadata: {
          demo_seed: DEMO_SEED_TAG,
          simulated: true,
          source: "whatsapp_execute_reply",
          executed_by: auth.userId,
          latest_draft_event_id: latestDraft?.eventId || null,
          external_side_effects_blocked: true,
        },
      }])
      .select("*")
      .single();

    if (messageError) throw messageError;

    await supabaseAdmin
      .from("whatsapp_contacts")
      .update({
        last_message_at: message?.created_at || now,
        unread_count: 0,
        updated_at: message?.created_at || now,
      })
      .eq("tenant_id", auth.tenantId)
      .eq("id", contactId);

    await supabaseAdmin.from("system_event_logs").insert({
      tenant_id: auth.tenantId,
      user_id: auth.userId,
      event_name: "whatsapp_demo_reply_executed",
      source: "whatsapp_execute_reply",
      status: "completed",
      payload: {
        contact_id: contactId,
        message_id: message?.id || null,
        demo_seed: DEMO_SEED_TAG,
        simulated: true,
        external_side_effects_blocked: true,
      },
    });

    return NextResponse.json({
      success: true,
      demo: true,
      simulated: true,
      message,
    });
  } catch (error) {
    console.error("[whatsapp/execute-reply] fatal", error);
    return NextResponse.json({ error: "Erro interno ao executar resposta WhatsApp." }, { status: 500 });
  }
}
