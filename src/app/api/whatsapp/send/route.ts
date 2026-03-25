import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

// Rota Segura (Server-Side) de Disparo do MAYUS
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenant_id, contact_id, phone_number, text } = body;

    if (!tenant_id || !contact_id || !phone_number || !text) {
      return NextResponse.json({ error: "Faltam parâmetros" }, { status: 400 });
    }

    // Usar a chave SERVICE_ROLE para acessar dados seguros
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. Procurar Integração (Prioriza meta_cloud, depois evolution)
    const { data: integrations, error: intErr } = await supabase
      .from("tenant_integrations")
      .select("*")
      .eq("tenant_id", tenant_id)
      .in("provider", ["meta_cloud", "evolution"]);

    if (intErr || !integrations || integrations.length === 0) {
      return NextResponse.json({ error: "Nenhuma integração de WhatsApp encontrada" }, { status: 404 });
    }

    // Priorizar Oficial se existir, senão Evolution
    let provider = integrations.find(i => i.provider === "meta_cloud");
    if (!provider) {
       provider = integrations.find(i => i.provider === "evolution");
    }

    // 2. Disparar Mensagem de acordo com o Motor Encontrado
    let apiResponse = null;

    if (provider.provider === "meta_cloud") {
       // MOTOR OFICIAL DA META CLOUD API
       const [phoneId] = provider.instance_name.split('|');
       const token = provider.api_key;
       
       // Formatar número (Remover @s.whatsapp.net e garantir apenas DDI+DDD+Numero)
       const cleanPhone = phone_number.replace(/\D/g, '');

       const url = `https://graph.facebook.com/v22.0/${phoneId}/messages`;
       const fbController = new AbortController();
       const fbTimeout = setTimeout(() => fbController.abort(), 10000);
       const fbRes = await fetch(url, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
             messaging_product: "whatsapp",
             recipient_type: "individual",
             to: cleanPhone,
             type: "text",
             text: { body: text }
          }),
          signal: fbController.signal,
       });
       clearTimeout(fbTimeout);
       apiResponse = await fbRes.json();
       if (!fbRes.ok) throw new Error("Erro Meta Web API: " + JSON.stringify(apiResponse));

    } else if (provider.provider === "evolution") {
       // MOTOR EVOLUTION API (BAILEYS)
       const parts = provider.instance_name.split('|');
       const baseUrl = parts[0].replace(/\/$/, '');
       const instanceName = parts[1];
       validateUrl(baseUrl);
       const cleanPhone = phone_number.split('@')[0]; // Pode ser com o sufixo ou nao
       
       const evoController = new AbortController();
       const evoTimeout = setTimeout(() => evoController.abort(), 10000);
       const evoRes = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: { 'apikey': provider.api_key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ number: cleanPhone, text: text }),
          signal: evoController.signal,
       });
       clearTimeout(evoTimeout);
       apiResponse = await evoRes.json();
       if (!evoRes.ok) throw new Error("Erro Evolution API: " + JSON.stringify(apiResponse));
    }

    // 3. Salvar Fisicamente no Banco (Histórico do Cliente)
    const { error: dbError } = await supabase.from("whatsapp_messages").insert([{
      tenant_id: tenant_id,
      contact_id: contact_id,
      direction: "outbound",
      content: text,
      status: "sent"
    }]);

    if (dbError) throw dbError;

    return NextResponse.json({ success: true, motor: provider.provider, apiResponse });

  } catch (err: any) {
    console.error("Erro no Envio de WhatsApp:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
