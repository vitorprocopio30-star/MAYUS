import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { prepareWhatsAppSalesReplyForContact } from "@/lib/growth/whatsapp-sales-reply-runtime";
import { handleWhatsAppInternalCommand } from "@/lib/mayus/whatsapp-command-runtime";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function verifySignature(body: string, signature: string | null): boolean {
  const secret = process.env.EVOLUTION_WEBHOOK_SECRET;
  if (!secret) return true; // Se não configurado, permite (compatibilidade)
  if (!signature) return false;
  if (signature === secret) return true;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-evolution-signature")
      || req.headers.get("x-mayus-webhook-secret")
      || req.headers.get("apikey");

    if (!verifySignature(rawBody, signature)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const eventName = String(payload.event || "").toLowerCase().replace(/_/g, ".");
    console.log("Evolution Webhook:", { event: payload.event, instance: payload.instance });

    // A Evolution dispara vários eventos. Só nos importamos com novas mensagens.
    if (eventName === "messages.upsert" || eventName === "messages.update") {
      const messageEnvelope = payload.data?.messages?.[0] || payload.data;
      const messagePayload = messageEnvelope?.message || payload.data?.message;
      if (!messagePayload) return NextResponse.json({ success: true, reason: "No message data" });

      const remoteJid = messageEnvelope?.key?.remoteJid || payload.data?.key?.remoteJid;
      const fromMe = Boolean(messageEnvelope?.key?.fromMe || payload.data?.key?.fromMe);
      const messageId = messageEnvelope?.key?.id || payload.data?.key?.id;
      const pushName = messageEnvelope?.pushName || payload.data?.pushName || "Desconhecido";
      
      // Ignoring status broadcasts
      if (remoteJid === "status@broadcast") {
        return NextResponse.json({ success: true });
      }

      // Extrair o conteúdo em texto (Seja texto puro, extended text, etc)
      let content = "";
      if (messagePayload?.conversation) {
        content = messagePayload.conversation;
      } else if (messagePayload?.extendedTextMessage?.text) {
        content = messagePayload.extendedTextMessage.text;
      } else if (messagePayload?.imageMessage?.caption) {
        content = messagePayload.imageMessage.caption || "[Imagem enviada]";
      } else if (messagePayload?.audioMessage) {
        content = "[Áudio enviado]";
      } else {
        content = "[Mensagem não suportada/Mídia]";
      }

      const instanceName = payload.instance;

      // 1. Descobrir qual o tenant_id dono desta instância
      const { data: integrations, error: intErr } = await supabase
        .from("tenant_integrations")
        .select("tenant_id, instance_name")
        .eq("provider", "evolution");

      const matched = integrations?.find(i => i.instance_name?.split("|")[1] === instanceName);

      if (intErr || !matched) {
        console.warn(`Instância ${instanceName} não localizada no banco.`);
        return NextResponse.json({ success: false, error: "Tenant not found for instance" });
      }

      const tenantId = matched.tenant_id;

      // 2. Verificar/Criar o Contato (Lead/Cliente)
      let { data: contact } = await supabase
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

      if (!fromMe) {
        try {
          const internalCommand = await handleWhatsAppInternalCommand({
            supabase,
            tenantId,
            senderPhone: remoteJid,
            content,
            contactId,
            source: "evolution_webhook",
          });

          if (internalCommand.handled) {
            console.log("[Evolution Webhook] Comando interno MAYUS processado:", {
              tenantId,
              intent: internalCommand.intent,
              sent: internalCommand.sent,
            });
            return NextResponse.json({ success: true, internal_command: true });
          }
        } catch (commandError) {
          console.error("[Evolution Webhook] Erro ao processar comando interno MAYUS:", commandError);
        }

        try {
          await prepareWhatsAppSalesReplyForContact({
            supabase,
            tenantId,
            contactId,
            trigger: "evolution_webhook",
            notify: true,
          });
        } catch (replyError) {
          console.error("[Evolution Webhook] Erro ao preparar resposta MAYUS:", replyError);
        }
      }
      
      // Como o Supabase Realtime escuta a tabela 'whatsapp_messages', 
      // o Frontend dos clientes do tenant vão se atualizar sozinhos automaticamente! 🚀
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro no Webhook Evolution", error);
    return NextResponse.json({ success: false, error: "Internal Error" }, { status: 500 });
  }
}
