import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { listTenantIntegrationsResolved } from "@/lib/integrations/server";

const PRIVATE_IP = /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/;

function validateUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Protocolo inválido");
    if (PRIVATE_IP.test(parsed.hostname)) throw new Error("URL aponta para rede interna (bloqueado)");
  } catch {
    throw new Error("URL da integração Evolution inválida ou não permitida");
  }
}

function cleanWhatsAppNumber(value: string) {
  return String(value || "").split("@")[0].replace(/\D/g, "");
}

function getTypingDelay(text?: string) {
  return Math.min(2200, Math.max(700, String(text || "").length * 15));
}

// Rota Segura (Server-Side) de Disparo do MAYUS
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant_id, contact_id, phone_number, text, audio_url } = body;

    if (!tenant_id || !contact_id || !phone_number || (!text && !audio_url)) {
      return NextResponse.json({ error: "Faltam parâmetros" }, { status: 400 });
    }

    // Usar a chave SERVICE_ROLE para acessar dados seguros
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Procurar Integração (Prioriza meta_cloud, depois evolution)
    const integrations = await listTenantIntegrationsResolved(tenant_id, ["meta_cloud", "evolution"]);
    const intErr = null;

    if (intErr || !integrations || integrations.length === 0) {
      return NextResponse.json({ error: "Nenhuma integração de WhatsApp encontrada" }, { status: 404 });
    }

    // Priorizar Evolution (Sem limites) se existir, senão Oficial Meta Cloud
    let provider = integrations.find(i => i.provider === "evolution");
    if (!provider) {
       provider = integrations.find(i => i.provider === "meta_cloud");
    }

    // 2. Disparar Mensagem de acordo com o Motor Encontrado
    let apiResponse = null;

    if (provider.provider === "meta_cloud") {
       // MOTOR OFICIAL DA META CLOUD API
       const [phoneId] = provider.instance_name.split('|');
       const token = provider.api_key;
       const cleanPhone = cleanWhatsAppNumber(phone_number);

       const url = `https://graph.facebook.com/v22.0/${phoneId}/messages`;
       const fbPayload: any = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: cleanPhone
       };

       if (audio_url) {
          fbPayload.type = "audio";
          fbPayload.audio = { link: audio_url };
       } else {
          fbPayload.type = "text";
          fbPayload.text = { body: text };
       }

       const fbRes = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(fbPayload)
       });
       apiResponse = await fbRes.json();
       if (!fbRes.ok) throw new Error("Erro Meta Web API: " + JSON.stringify(apiResponse));

    } else if (provider.provider === "evolution") {
       // MOTOR EVOLUTION API (BAILEYS)
       const [baseUrlRaw, instanceName] = provider.instance_name.split('|');
       const baseUrl = baseUrlRaw.replace(/\/$/, '');
       validateUrl(baseUrl);
       const cleanPhone = cleanWhatsAppNumber(phone_number);

       let evoUrl = `${baseUrl}/message/sendText/${instanceName}`;
       let evoPayload: any = { number: cleanPhone };

       if (audio_url) {
          evoUrl = `${baseUrl}/message/sendWhatsAppAudio/${instanceName}`;
          evoPayload.audio = audio_url;
       } else {
          const delay = getTypingDelay(text);
          await fetch(`${baseUrl}/chat/sendPresence/${instanceName}`, {
            method: 'POST',
            headers: { 'apikey': provider.api_key, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              number: cleanPhone,
              delay,
              presence: "composing",
              options: { delay, presence: "composing" },
            })
          }).catch(() => null);

          evoPayload.text = text;
          evoPayload.delay = delay;
          evoPayload.presence = "composing";
          evoPayload.linkPreview = false;
          evoPayload.options = { delay, presence: "composing", linkPreview: false };
       }
       
       const evoRes = await fetch(evoUrl, {
          method: 'POST',
          headers: { 'apikey': provider.api_key, 'Content-Type': 'application/json' },
          body: JSON.stringify(evoPayload)
       });
       apiResponse = await evoRes.json();
       if (!evoRes.ok) throw new Error("Erro Evolution API: " + JSON.stringify(apiResponse));
    }

    // 3. Salvar Fisicamente no Banco (Historico do Cliente)
    const insertedAt = new Date().toISOString();
    const { data: savedMessage, error: dbError } = await supabase.from("whatsapp_messages").insert([{
      tenant_id: tenant_id,
      contact_id: contact_id,
      direction: "outbound",
      content: audio_url ? "[Audio Enviado]" : text,
      status: "sent",
      metadata: audio_url ? { audio_url } : null,
      created_at: insertedAt,
    }]).select("*").single();

    if (dbError) throw dbError;

    await supabase
      .from("whatsapp_contacts")
      .update({
        last_message_at: savedMessage?.created_at || insertedAt,
        unread_count: 0,
        updated_at: savedMessage?.created_at || insertedAt,
      })
      .eq("tenant_id", tenant_id)
      .eq("id", contact_id);

    return NextResponse.json({ success: true, motor: provider.provider, apiResponse, message: savedMessage || null });

  } catch (err: any) {
    console.error("Erro no Envio de WhatsApp:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
