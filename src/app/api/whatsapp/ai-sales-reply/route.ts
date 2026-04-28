import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { prepareWhatsAppSalesReplyForContact } from "@/lib/growth/whatsapp-sales-reply-runtime";

export const dynamic = "force-dynamic";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle<{ tenant_id: string | null }>();

  if (profileError || !profile?.tenant_id) {
    return { error: "Perfil ou tenant nao vinculados.", status: 403 as const };
  }

  return { tenantId: profile.tenant_id, userId: user.id };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedTenant();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const contactId = typeof body?.contact_id === "string" && body.contact_id.trim() ? body.contact_id.trim() : null;
    if (!contactId) {
      return NextResponse.json({ error: "contact_id obrigatorio." }, { status: 400 });
    }

    const prepared = await prepareWhatsAppSalesReplyForContact({
      supabase: adminSupabase,
      tenantId: auth.tenantId,
      contactId,
      actorUserId: auth.userId,
      trigger: "manual",
    });

    return NextResponse.json({
      ok: true,
      contact_id: prepared.contact.id,
      ...prepared.metadata,
    });
  } catch (error: any) {
    console.error("[whatsapp-ai-sales-reply]", error);
    return NextResponse.json({ error: error?.message || "Erro ao preparar resposta MAYUS." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedTenant();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const contactId = req.nextUrl.searchParams.get("contact_id")?.trim();
    if (!contactId) {
      return NextResponse.json({ error: "contact_id obrigatorio." }, { status: 400 });
    }

    const { data: contact } = await adminSupabase
      .from("whatsapp_contacts")
      .select("id")
      .eq("tenant_id", auth.tenantId)
      .eq("id", contactId)
      .maybeSingle<{ id: string }>();

    if (!contact) {
      return NextResponse.json({ error: "Contato nao encontrado." }, { status: 404 });
    }

    const { data: event } = await adminSupabase
      .from("system_event_logs")
      .select("id, payload, created_at")
      .eq("tenant_id", auth.tenantId)
      .eq("event_name", "whatsapp_sales_reply_prepared")
      .eq("payload->>contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; payload: Record<string, unknown> | null; created_at: string }>();

    if (!event?.payload) {
      return NextResponse.json({ ok: true, contact_id: contactId, draft: null });
    }

    return NextResponse.json({
      ok: true,
      contact_id: contactId,
      draft: {
        event_id: event.id,
        created_at: event.created_at,
        ...event.payload,
      },
    });
  } catch (error: any) {
    console.error("[whatsapp-ai-sales-reply][GET]", error);
    return NextResponse.json({ error: error?.message || "Erro ao buscar rascunho MAYUS." }, { status: 500 });
  }
}
