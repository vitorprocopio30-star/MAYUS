import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send-message";

// Rota segura server-side de disparo do MAYUS.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant_id, contact_id, phone_number, text, audio_url } = body;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const result = await sendWhatsAppMessage({
      supabase,
      tenantId: tenant_id,
      contactId: contact_id,
      phoneNumber: phone_number,
      text,
      audioUrl: audio_url,
      metadata: audio_url ? { source: "manual_audio_send" } : { source: "manual_whatsapp_send" },
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
