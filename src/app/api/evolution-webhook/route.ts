import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Usamos a Service Role Key para garantir permissão de escrita no webhook
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Precisamos da role key no .env ou usar a ANON se as RLS permitirem anônimo para certas instâncias (o que não é ideal).
// Vamos usar anon para teste caso service_role não exista, mas O IDEAL é service_role.
const supabase = createClient(supabaseUrl, supabaseKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log("Evolution Webhook Recebido:", JSON.stringify(payload, null, 2));

    // A Evolution dispara vários eventos. Só nos importamos com novas mensagens.
    if (payload.event === "messages.upsert" || payload.event === "messages.update") {
      const messageData = payload.data?.message || payload.data?.messages?.[0];
      if (!messageData) return NextResponse.json({ success: true, reason: "No message data" });

      const remoteJid = payload.data?.key?.remoteJid || messageData?.key?.remoteJid;
      const fromMe = payload.data?.key?.fromMe || messageData?.key?.fromMe;
      const messageId = payload.data?.key?.id || messageData?.key?.id;
      const pushName = payload.data?.pushName || messageData?.pushName || "Desconhecido";
      
      // Ignoring status broadcasts
      if (remoteJid === "status@broadcast") {
        return NextResponse.json({ success: true });
      }

      // Extrair o conteúdo em texto (Seja texto puro, extended text, etc)
      let content = "";
      if (messageData?.message?.conversation) {
        content = messageData.message.conversation;
      } else if (messageData?.message?.extendedTextMessage?.text) {
        content = messageData.message.extendedTextMessage.text;
      } else if (messageData?.message?.imageMessage?.caption) {
        content = messageData.message.imageMessage.caption || "[Imagem enviada]";
      } else if (messageData?.message?.audioMessage) {
        content = "[Áudio enviado]";
      } else {
        content = "[Mensagem não suportada/Mídia]";
      }

      const instanceName = payload.instance;

      // 1. Descobrir qual o tenant_id dono desta instância
      // O instanceName salva no bd é do tipo: "https://url.com|NomeInstancia"
      const { data: integrations, error: intErr } = await supabase
        .from("tenant_integrations")
        .select("tenant_id")
        .eq("provider", "evolution")
        .ilike("instance_name", `%|${instanceName}`);

      if (intErr || !integrations || integrations.length === 0) {
         console.warn(`Instância ${instanceName} não localizada no banco.`);
         return NextResponse.json({ success: false, error: "Tenant not found for instance" });
      }

      const tenantId = integrations[0].tenant_id;

      // 2. Verificar/Criar o Contato (Lead/Cliente)
      let { data: contact, error: contactErr } = await supabase
        .from("whatsapp_contacts")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("phone_number", remoteJid)
        .single();

      let contactId = contact?.id;

      if (!contactId) {
        // Criar o contato novo
        const { data: newContact, error: insertErr } = await supabase
          .from("whatsapp_contacts")
          .insert([{ 
             tenant_id: tenantId, 
             phone_number: remoteJid, 
             name: pushName 
          }])
          .select("id")
          .single();
          
        if (insertErr) {
           console.error("Erro ao criar contato:", insertErr);
           return NextResponse.json({ success: false, error: insertErr.message });
        }
        contactId = newContact.id;
      } else {
         // Atualizar data da última mensagem
         await supabase.from("whatsapp_contacts").update({
            last_message_at: new Date().toISOString(),
            unread_count: fromMe ? 0 : 1 // Se foi do cliente, marca 1 (simplificado)
         }).eq("id", contactId);
      }

      // 3. Salvar a Mensagem
      const { error: msgErr } = await supabase
        .from("whatsapp_messages")
        .insert([{
           tenant_id: tenantId,
           contact_id: contactId,
           direction: fromMe ? 'outbound' : 'inbound',
           content: content,
           message_id_from_evolution: messageId,
           status: 'delivered'
        }]);

      if (msgErr) {
         console.error("Erro ao salvar mensagem:", msgErr);
         return NextResponse.json({ success: false, error: msgErr.message });
      }

      console.log(`[Webhook] Mensagem de ${remoteJid} salva com sucesso no tenant ${tenantId}`);
      
      // Como o Supabase Realtime escuta a tabela 'whatsapp_messages', 
      // o Frontend dos clientes do tenant vão se atualizar sozinhos automaticamente! 🚀
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro no Webhook Evolution", error);
    return NextResponse.json({ success: false, error: "Internal Error" }, { status: 500 });
  }
}
