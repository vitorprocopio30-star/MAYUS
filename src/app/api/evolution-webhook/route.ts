import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { handleWhatsAppInternalCommand } from "@/lib/mayus/whatsapp-command-runtime";
import { listTenantIntegrationsResolved } from "@/lib/integrations/server";
import { processPendingWhatsAppMediaBatch } from "@/lib/whatsapp/media-processor";
import { enqueueWhatsAppReply, processPendingWhatsAppRepliesBatch } from "@/lib/whatsapp/reply-processor";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send-message";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const IMMEDIATE_REPLY_TIMEOUT_MS = 10000;
const IMMEDIATE_MEDIA_TIMEOUT_MS = 8000;

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

function isGroupJid(value: string | null | undefined) {
  return String(value || "").toLowerCase().endsWith("@g.us");
}

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildImmediateSafeReply(content: string) {
  const normalized = normalizeText(content);
  const asksToSend = /posso|pode|vou|mandar|enviar|analisa|analisar|olhar|verificar/.test(normalized);
  const hasPayroll = /contracheque|holerite|folha|desconto|consignado|beneficio|inss|aposentadoria/.test(normalized);

  if (!asksToSend || !hasPayroll) return null;

  return [
    "Pode mandar sim. Envie uma foto ou print apenas da parte do desconto no contracheque.",
    "Se puder, me diga também qual nome aparece no desconto e quando começou. Assim eu organizo a análise inicial com segurança, sem prometer resultado jurídico.",
  ].join("\n\n");
}

async function processImmediateReply(params: { messageId: string }) {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    await Promise.race([
      processPendingWhatsAppRepliesBatch({
        supabase,
        messageId: params.messageId,
        limit: 1,
      }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timeout ao processar resposta imediata apos ${IMMEDIATE_REPLY_TIMEOUT_MS}ms.`)), IMMEDIATE_REPLY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function processImmediateMedia(params: { messageId: string }) {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    await Promise.race([
      processPendingWhatsAppMediaBatch({
        supabase,
        messageId: params.messageId,
        limit: 1,
      }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timeout ao processar midia imediata apos ${IMMEDIATE_MEDIA_TIMEOUT_MS}ms.`)), IMMEDIATE_MEDIA_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function buildImmediateMediaAck(params: { messageType: string; content: string; filename: string | null }) {
  const normalized = normalizeText(`${params.content} ${params.filename || ""}`);
  const looksLikePayroll = /contracheque|holerite|folha|desconto|consignado|beneficio|inss|aposentadoria/.test(normalized);
  const genericReceipt = params.messageType === "image"
    ? "Recebi a imagem. Vou organizar a analise inicial com seguranca."
    : params.messageType === "document"
      ? "Recebi o documento. Vou organizar a analise inicial com seguranca."
      : "Recebi o arquivo. Vou organizar a analise inicial com seguranca.";

  if (looksLikePayroll) {
    return [
      "Recebi o contracheque. Vou analisar a parte dos descontos com cuidado.",
      "Se puder, me diga qual desconto chamou sua atencao ou qual valor/nome voce quer conferir.",
    ].join("\n\n");
  }

  return [
    genericReceipt,
    "Se tiver um ponto especifico para conferir, me diga em uma frase.",
  ].join("\n\n");
}

async function sendImmediateMediaAck(params: {
  tenantId: string;
  contactId: string;
  messageId: string;
  phoneNumber: string;
  messageType: string;
  content: string;
  filename: string | null;
  metadata: Record<string, any>;
}) {
  const text = buildImmediateMediaAck({
    messageType: params.messageType,
    content: params.content,
    filename: params.filename,
  });
  const sent = await sendWhatsAppMessage({
    supabase,
    tenantId: params.tenantId,
    contactId: params.contactId,
    phoneNumber: params.phoneNumber,
    preferredProvider: "evolution",
    text,
    metadata: {
      source: "immediate_media_ack",
      model_used: "deterministic",
      intent: "media_document_intake",
      lead_stage: "discovery",
      expected_outcome: "cliente confirma o desconto ou ponto do documento",
    },
  });

  await supabase
    .from("whatsapp_messages")
    .update({
      metadata: {
        ...params.metadata,
        media_ack_sent: true,
        media_ack_source: "immediate_media_ack",
        media_ack_sent_at: new Date().toISOString(),
        reply_processing_status: "waiting_media_processing",
      },
    })
    .eq("id", params.messageId);

  await supabase.from("system_event_logs").insert({
    tenant_id: params.tenantId,
    user_id: null,
    source: "whatsapp",
    provider: "mayus",
    event_name: "whatsapp_media_ack_auto_sent",
    status: "ok",
    payload: {
      contact_id: params.contactId,
      message_id: params.messageId,
      trigger: "evolution_webhook",
      model_used: "deterministic",
      send_provider: sent.provider,
      media_kind: params.messageType,
    },
    created_at: new Date().toISOString(),
  });
}

async function trySendImmediateSafeReply(params: {
  tenantId: string;
  contactId: string;
  messageId: string;
  phoneNumber: string;
  content: string;
}) {
  const reply = buildImmediateSafeReply(params.content);
  if (!reply) return false;

  const sent = await sendWhatsAppMessage({
    supabase,
    tenantId: params.tenantId,
    contactId: params.contactId,
    phoneNumber: params.phoneNumber,
    preferredProvider: "evolution",
    text: reply,
    metadata: {
      source: "immediate_safe_deterministic_reply",
      model_used: "deterministic",
      intent: "payroll_document_intake",
      lead_stage: "discovery",
      expected_outcome: "cliente envia contracheque ou detalha desconto",
    },
  });

  await supabase
    .from("whatsapp_messages")
    .update({
      metadata: {
        reply_trigger: "evolution_webhook",
        reply_processing_status: "processed",
        reply_processed_at: new Date().toISOString(),
        reply_auto_sent: true,
        reply_source: "immediate_safe_deterministic_reply",
      },
    })
    .eq("id", params.messageId);

  await supabase.from("system_event_logs").insert({
    tenant_id: params.tenantId,
    user_id: null,
    source: "whatsapp",
    provider: "mayus",
    event_name: "whatsapp_immediate_safe_reply_auto_sent",
    status: "ok",
    payload: {
      contact_id: params.contactId,
      message_id: params.messageId,
      trigger: "evolution_webhook",
      model_used: "deterministic",
      send_provider: sent.provider,
      intent: "payroll_document_intake",
    },
    created_at: new Date().toISOString(),
  });

  return true;
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

      // Nunca operar em grupos: evita criar contato, salvar mensagem ou auto responder em massa.
      if (isGroupJid(remoteJid)) {
        console.warn("[Evolution Webhook] Grupo ignorado sem persistencia ou resposta automatica.", {
          instance: payload.instance,
          message_id: messageId || null,
        });
        return NextResponse.json({ success: true, ignored: true, reason: "group_chat" });
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

      const mediaPayload = messagePayload?.imageMessage
        || messagePayload?.audioMessage
        || messagePayload?.documentMessage
        || messagePayload?.videoMessage
        || messagePayload?.stickerMessage
        || null;
      const mediaFilename = String(mediaPayload?.fileName || mediaPayload?.filename || "").trim() || null;
      const mediaMimeType = String(mediaPayload?.mimetype || mediaPayload?.mimeType || "").trim() || null;
      const shouldQueueMedia = ["image", "audio", "video", "document", "sticker"].includes(messageType);

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

      const messageMetadata = shouldQueueMedia ? {
        provider_media_id: messageId || null,
        media_kind: messageType,
        webhook_trigger: "evolution_webhook",
        evolution_instance: instanceName,
        evolution_message_envelope: messageEnvelope,
        evolution_message_payload: messagePayload,
      } : { reply_trigger: "evolution_webhook" };

      // 3. Salvar a Mensagem
      const { data: savedMessage, error: msgErr } = await supabase
        .from("whatsapp_messages")
        .insert([{
           tenant_id: tenantId,
            contact_id: contactId,
            direction: fromMe ? 'outbound' : 'inbound',
             message_type: messageType,
             content: content,
             media_url: null,
             media_mime_type: mediaMimeType,
             media_filename: mediaFilename,
             media_size_bytes: null,
             media_storage_path: null,
             media_provider: shouldQueueMedia ? "evolution" : null,
             media_processing_status: shouldQueueMedia ? "pending" : "none",
             media_text: null,
             media_summary: null,
              metadata: messageMetadata,
              message_id_from_evolution: messageId,
              status: 'delivered'
        }])
        .select("id")
        .single<{ id: string }>();

      if (msgErr) {
         console.error("Erro ao salvar mensagem:", msgErr);
         return NextResponse.json({ success: false, error: msgErr.message });
      }

      console.log(`[Webhook] Mensagem de ${remoteJid} salva com sucesso no tenant ${tenantId}`);

      if (!fromMe) {
        if (shouldQueueMedia) {
          if (savedMessage?.id) {
            try {
              await sendImmediateMediaAck({
                tenantId,
                contactId,
                messageId: savedMessage.id,
                phoneNumber: remoteJid,
                messageType,
                content,
                filename: mediaFilename,
                metadata: messageMetadata,
              });
            } catch (ackError) {
              console.error("[Evolution Webhook] Erro ao enviar confirmacao imediata de midia:", ackError);
            }

            try {
              await processImmediateMedia({ messageId: savedMessage.id });
            } catch (mediaError) {
              console.error("[Evolution Webhook] Erro ao processar midia imediata:", mediaError);
            }
          }

          await supabase.from("notifications").insert([{
            tenant_id: tenantId,
            user_id: null,
            title: `WhatsApp: ${pushName}`,
            message: `${content.substring(0, 100)} A midia sera processada em segundo plano.`.slice(0, 180),
            type: "info",
            link_url: "/dashboard/conversas/whatsapp",
          }]);
          return NextResponse.json({ success: true, pending_media: true });
        }

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

        if (savedMessage?.id) {
          try {
            const sentImmediate = await trySendImmediateSafeReply({
              tenantId,
              contactId,
              messageId: savedMessage.id,
              phoneNumber: remoteJid,
              content,
            });
            if (sentImmediate) {
              return NextResponse.json({ success: true, immediate_reply: true });
            }
          } catch (replyError) {
            console.error("[Evolution Webhook] Erro ao enviar resposta segura imediata:", replyError);
          }

          await enqueueWhatsAppReply({
            supabase,
            trigger: "evolution_webhook",
            messageId: savedMessage.id,
            preferredProvider: "evolution",
          });

          try {
            await processImmediateReply({ messageId: savedMessage.id });
          } catch (replyError) {
            console.error("[Evolution Webhook] Erro ao processar resposta imediata:", replyError);
          }
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
