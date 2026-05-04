import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { prepareWhatsAppSalesReplyForContact } from "@/lib/growth/whatsapp-sales-reply-runtime";
import { handleWhatsAppInternalCommand } from "@/lib/mayus/whatsapp-command-runtime";
import { listTenantIntegrationsResolved } from "@/lib/integrations/server";
import {
  buildUnsupportedMediaRecord,
  processEvolutionMedia,
  type WhatsAppStoredMedia,
} from "@/lib/whatsapp/media";

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

function cleanWhatsAppNumber(value: string | null | undefined) {
  return String(value || "").split("@")[0].replace(/\D/g, "");
}

async function fetchEvolutionProfilePicture(params: {
  tenantId: string;
  instanceName: string;
  remoteJid: string;
}) {
  try {
    const integrations = await listTenantIntegrationsResolved(params.tenantId, ["evolution"]);
    const provider = integrations.find((item) => item.provider === "evolution");
    const [baseUrlRaw] = String(provider?.instance_name || "").split("|");
    const apiKey = String(provider?.api_key || "").trim();
    const baseUrl = String(baseUrlRaw || "").replace(/\/$/, "");
    const number = cleanWhatsAppNumber(params.remoteJid);

    if (!baseUrl || !apiKey || !number) return null;

    const response = await fetch(`${baseUrl}/chat/fetchProfilePictureUrl/${encodeURIComponent(params.instanceName)}`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number }),
    });

    const data = await response.json().catch(() => null);
    const url = typeof data?.profilePictureUrl === "string"
      ? data.profilePictureUrl
      : typeof data?.profilePicture === "string"
        ? data.profilePicture
        : typeof data?.url === "string"
          ? data.url
          : null;

    return response.ok && url ? url : null;
  } catch (error) {
    console.warn("[Evolution Webhook] Nao foi possivel buscar foto do contato:", error);
    return null;
  }
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
      let messageType = "text";
      if (messagePayload?.conversation) {
        content = messagePayload.conversation;
      } else if (messagePayload?.extendedTextMessage?.text) {
        content = messagePayload.extendedTextMessage.text;
      } else if (messagePayload?.imageMessage?.caption) {
        messageType = "image";
        content = messagePayload.imageMessage.caption || "[Imagem recebida]";
      } else if (messagePayload?.imageMessage) {
        messageType = "image";
        content = "[Imagem recebida]";
      } else if (messagePayload?.audioMessage) {
        messageType = "audio";
        content = "[Áudio recebido]";
      } else if (messagePayload?.documentMessage) {
        messageType = "document";
        content = messagePayload.documentMessage.caption || `[Documento: ${messagePayload.documentMessage.fileName || "arquivo"}]`;
      } else if (messagePayload?.videoMessage) {
        messageType = "video";
        content = messagePayload.videoMessage.caption || "[Vídeo recebido]";
      } else if (messagePayload?.stickerMessage) {
        messageType = "sticker";
        content = "[Figurinha recebida]";
      } else {
        content = "[Mensagem não suportada/Mídia]";
        messageType = "unsupported";
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
      if (eventName === "messages.update") {
        const updateStatus = payload.data?.status || messageEnvelope?.status || payload.data?.update?.status || "delivered";
        if (messageId) {
          await supabase
            .from("whatsapp_messages")
            .update({ status: updateStatus })
            .eq("tenant_id", tenantId)
            .eq("message_id_from_evolution", messageId);
        }
        return NextResponse.json({ success: true, updated: Boolean(messageId) });
      }

      if (messageId) {
        const { data: existingMessage } = await supabase
          .from("whatsapp_messages")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("message_id_from_evolution", messageId)
          .maybeSingle();

        if (existingMessage?.id) {
          return NextResponse.json({ success: true, duplicate: true });
        }
      }

      const avatarUrl = await fetchEvolutionProfilePicture({
        tenantId,
        instanceName,
        remoteJid,
      });

      // 2. Verificar/Criar o Contato (Lead/Cliente)
      let { data: contact } = await supabase
        .from("whatsapp_contacts")
        .select("id, profile_pic_url")
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
             name: pushName,
             profile_pic_url: avatarUrl,
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
            unread_count: fromMe ? 0 : 1, // Se foi do cliente, marca 1 (simplificado)
            ...(avatarUrl && !contact?.profile_pic_url ? { profile_pic_url: avatarUrl } : {}),
          }).eq("id", contactId);
      }

      let mediaRecord: WhatsAppStoredMedia | null = null;
      if (["image", "audio", "video", "document", "sticker"].includes(messageType)) {
        try {
          const resolved = await listTenantIntegrationsResolved(tenantId, ["evolution"]);
          const provider = resolved.find((item) => item.instance_name?.split("|")[1] === instanceName)
            || resolved.find((item) => item.provider === "evolution");
          const [baseUrlRaw] = String(provider?.instance_name || "").split("|");
          const baseUrl = String(baseUrlRaw || "").replace(/\/$/, "");
          const apiKey = String(provider?.api_key || "").trim();

          if (!baseUrl || !apiKey || !instanceName) throw new Error("Integracao Evolution incompleta para baixar midia.");

          mediaRecord = await processEvolutionMedia({
            supabase,
            tenantId,
            contactId,
            baseUrl,
            instanceName,
            apiKey,
            messageEnvelope,
            messagePayload,
            kind: messageType,
            caption: content,
          });

          if (!mediaRecord) {
            mediaRecord = buildUnsupportedMediaRecord({
              provider: "evolution",
              kind: messageType,
              providerMediaId: messageId,
              reason: "Evolution nao enviou bytes/base64 da midia e o download automatico falhou.",
            });
          }
        } catch (mediaError) {
          console.error("[Evolution Webhook] Erro ao processar midia:", mediaError);
          mediaRecord = buildUnsupportedMediaRecord({
            provider: "evolution",
            kind: messageType,
            providerMediaId: messageId,
            reason: mediaError instanceof Error ? mediaError.message : "Falha ao processar midia Evolution.",
          });
        }
      }

      // 3. Salvar a Mensagem
      const { error: msgErr } = await supabase
        .from("whatsapp_messages")
        .insert([{
           tenant_id: tenantId,
            contact_id: contactId,
            direction: fromMe ? 'outbound' : 'inbound',
            message_type: messageType,
            content: content,
            media_url: mediaRecord?.media_url || null,
            media_mime_type: mediaRecord?.media_mime_type || null,
            media_filename: mediaRecord?.media_filename || null,
            media_size_bytes: mediaRecord?.media_size_bytes || null,
            media_storage_path: mediaRecord?.media_storage_path || null,
            media_provider: mediaRecord?.media_provider || (["image", "audio", "video", "document", "sticker"].includes(messageType) ? "evolution" : null),
            media_processing_status: mediaRecord?.media_processing_status || (["image", "audio", "video", "document", "sticker"].includes(messageType) ? "unsupported" : "none"),
            media_text: mediaRecord?.media_text || null,
            media_summary: mediaRecord?.media_summary || null,
            metadata: mediaRecord?.metadata || {},
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
            autoSendFirstResponse: true,
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
