import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send-message";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
    },
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

// Rota segura server-side de disparo do MAYUS.
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedTenant();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const {
      contact_id,
      text,
      audio_url,
      media_url,
      media_type,
      media_filename,
      media_mime_type,
      media_storage_path,
    } = body;

    const contactId = typeof contact_id === "string" && contact_id.trim() ? contact_id.trim() : null;
    if (!contactId) {
      return NextResponse.json({ error: "contact_id obrigatorio." }, { status: 400 });
    }

    const { data: contact, error: contactError } = await adminSupabase
      .from("whatsapp_contacts")
      .select("id, phone_number")
      .eq("tenant_id", auth.tenantId)
      .eq("id", contactId)
      .maybeSingle<{ id: string; phone_number: string | null }>();

    if (contactError) throw contactError;
    if (!contact?.phone_number) {
      return NextResponse.json({ error: "Contato nao encontrado." }, { status: 404 });
    }

    const result = await sendWhatsAppMessage({
      supabase: adminSupabase,
      tenantId: auth.tenantId,
      contactId,
      phoneNumber: contact.phone_number,
      text,
      audioUrl: audio_url,
      mediaUrl: media_url,
      mediaType: media_type,
      mediaFilename: media_filename,
      mediaMimeType: media_mime_type,
      mediaStoragePath: media_storage_path,
      metadata: audio_url
        ? { source: "manual_audio_send" }
        : media_url
          ? { source: "manual_media_send" }
          : { source: "manual_whatsapp_send" },
    });

    return NextResponse.json({
      success: true,
      motor: result.provider,
      apiResponse: result.apiResponse,
    });
  } catch (err: any) {
    const message = err?.message || "Erro no envio de WhatsApp";
    console.error("Erro no Envio de WhatsApp:", err);
    const status = message.includes("Faltam parametros") ? 400 : message.includes("Nenhuma integracao") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
