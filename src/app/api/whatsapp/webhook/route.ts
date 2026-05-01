import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { prepareWhatsAppSalesReplyForContact } from "@/lib/growth/whatsapp-sales-reply-runtime";
import { handleWhatsAppInternalCommand } from "@/lib/mayus/whatsapp-command-runtime";

// ==============================================================================
// 🚀 MAYUS - WEBHOOK OFICIAL META CLOUD API (WhatsApp Business Platform)
// ==============================================================================
// Esta rota recebe:
//   GET  → Verificação do Webhook pela Meta (Challenge/Handshake)
//   POST → Mensagens recebidas dos clientes em tempo real
// ==============================================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ==============================================================================
// GET — Verificação do Webhook (Meta envia na hora de cadastrar a URL)
// ==============================================================================
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!VERIFY_TOKEN) {
    console.error("[Meta Webhook] WHATSAPP_VERIFY_TOKEN não definido no .env.local");
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[Meta Webhook] ✅ Verificação bem-sucedida!");
    // A Meta espera receber o challenge como texto puro (não JSON)
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn("[Meta Webhook] ❌ Token de verificação inválido.");
  return new NextResponse("Forbidden", { status: 403 });
}

// ==============================================================================
// POST — Recebimento de Mensagens em Tempo Real
// ==============================================================================
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // A Meta envia objetos do tipo "whatsapp_business_account"
    const entry = body?.entry?.[0];
    if (!entry) {
      return NextResponse.json({ success: true, reason: "No entry" });
    }

    const changes = entry.changes;
    if (!changes || changes.length === 0) {
      return NextResponse.json({ success: true, reason: "No changes" });
    }

    for (const change of changes) {
      // Só processa mensagens (ignora statuses, errors, etc inicialmente)
      if (change.field !== "messages") continue;

      const value = change.value;
      if (!value) continue;

      // Metadata do número de telefone Business (Phone Number ID)
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // =====================================================================
      // PARTE A: Processar STATUS de mensagens enviadas (delivered, read, etc)
      // =====================================================================
      if (value.statuses && value.statuses.length > 0) {
        for (const statusUpdate of value.statuses) {
          const recipientPhone = statusUpdate.recipient_id; // Telefone do destinatário
          const newStatus = statusUpdate.status; // "sent", "delivered", "read", "failed"
          const messageIdFromMeta = statusUpdate.id;

          // Atualiza status da mensagem no banco se existir
          if (messageIdFromMeta && newStatus) {
            await supabase
              .from("whatsapp_messages")
              .update({ status: newStatus })
              .eq("message_id_from_evolution", messageIdFromMeta);
          }
        }
        continue; // Não precisa processar mais nada para statuses
      }

      // =====================================================================
      // PARTE B: Processar MENSAGENS recebidas (inbound)
      // =====================================================================
      const messages = value.messages;
      const contacts = value.contacts;

      if (!messages || messages.length === 0) continue;

      // 1. Descobrir o tenant_id baseado no Phone Number ID
      const { data: integrations, error: intErr } = await supabase
        .from("tenant_integrations")
        .select("tenant_id, instance_name")
        .eq("provider", "meta_cloud");

      if (intErr || !integrations || integrations.length === 0) {
        console.warn("[Meta Webhook] Nenhuma integração meta_cloud encontrada.");
        continue;
      }

      // O instance_name salvo é no formato: "PHONE_NUMBER_ID|WABA_ID"
      const matched = integrations.find(
        (i) => i.instance_name?.split("|")[0] === phoneNumberId
      );

      if (!matched) {
        console.warn(`[Meta Webhook] Phone Number ID ${phoneNumberId} não encontrado no banco.`);
        continue;
      }

      const tenantId = matched.tenant_id;

      // 2. Processar cada mensagem
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const contactInfo = contacts?.[i] || contacts?.[0];

        const senderPhone = msg.from; // Ex: "5511999999999"
        const messageType = msg.type || "text"; // text, image, audio, document, video, sticker, location, contacts
        const messageIdFromMeta = msg.id;
        const pushName = contactInfo?.profile?.name || "Desconhecido";

        // Extrair conteúdo baseado no tipo
        let content = "";
        let mediaUrl = "";

        switch (messageType) {
          case "text":
            content = msg.text?.body || "";
            break;
          case "image":
            content = msg.image?.caption || "[Imagem recebida]";
            mediaUrl = msg.image?.id || ""; // Media ID (precisaria de download via API)
            break;
          case "audio":
            content = "[Áudio recebido]";
            mediaUrl = msg.audio?.id || "";
            break;
          case "video":
            content = msg.video?.caption || "[Vídeo recebido]";
            mediaUrl = msg.video?.id || "";
            break;
          case "document":
            content = msg.document?.caption || `[Documento: ${msg.document?.filename || "arquivo"}]`;
            mediaUrl = msg.document?.id || "";
            break;
          case "sticker":
            content = "[Figurinha recebida]";
            break;
          case "location":
            content = `[Localização: ${msg.location?.latitude}, ${msg.location?.longitude}]`;
            break;
          case "contacts":
            content = `[Contato compartilhado: ${msg.contacts?.[0]?.name?.formatted_name || "Desconhecido"}]`;
            break;
          case "reaction":
            content = `[Reação: ${msg.reaction?.emoji || "👍"}]`;
            break;
          case "button":
            content = msg.button?.text || "[Botão clicado]";
            break;
          case "interactive":
            content = msg.interactive?.button_reply?.title || 
                       msg.interactive?.list_reply?.title || 
                       "[Resposta interativa]";
            break;
          default:
            content = `[${messageType}]`;
        }

        // 3. Verificar/Criar Contato
        let { data: existingContact } = await supabase
          .from("whatsapp_contacts")
          .select("id, unread_count, department_id")
          .eq("tenant_id", tenantId)
          .eq("phone_number", senderPhone)
          .single();

        let contactId = existingContact?.id;

        if (!contactId) {
          // Buscar departamento padrão de triagem
          const { data: settings } = await supabase
            .from("tenant_settings")
            .select("ai_features")
            .eq("tenant_id", tenantId)
            .single();
          
          let defaultDeptId = settings?.ai_features?.default_department_id;

          // Fallback: Se não houver configuração, usa o primeiro departamento criado
          if (!defaultDeptId) {
            const { data: firstDept } = await supabase
              .from("departments")
              .select("id")
              .eq("tenant_id", tenantId)
              .order("created_at", { ascending: true })
              .limit(1)
              .single();
            if (firstDept) defaultDeptId = firstDept.id;
          }

          // Criar contato novo
          const { data: newContact, error: insertErr } = await supabase
            .from("whatsapp_contacts")
            .insert([{
              tenant_id: tenantId,
              phone_number: senderPhone,
              name: pushName,
              department_id: defaultDeptId
            }])
            .select("id")
            .single();

          if (insertErr) {
            console.error("[Meta Webhook] Erro ao criar contato:", insertErr);
            continue;
          }
          contactId = newContact.id;
        } else {
          // Atualizar contato existente
          const currentUnread = existingContact?.unread_count || 0;
          await supabase
            .from("whatsapp_contacts")
            .update({
              name: pushName,
              last_message_at: new Date().toISOString(),
              unread_count: currentUnread + 1,
            })
            .eq("id", contactId);
        }

        // 4. Salvar Mensagem no Banco
        const { error: msgErr } = await supabase
          .from("whatsapp_messages")
          .insert([{
            tenant_id: tenantId,
            contact_id: contactId,
            direction: "inbound",
            message_type: messageType,
            content: content,
            media_url: mediaUrl || null,
            message_id_from_evolution: messageIdFromMeta, // Reutilizamos o campo para o ID da Meta
            status: "delivered",
          }]);

        if (msgErr) {
          console.error("[Meta Webhook] Erro ao salvar mensagem:", msgErr);
          continue;
        }

        console.log(`[Meta Webhook] ✅ Mensagem de ${senderPhone} (${pushName}) salva no tenant ${tenantId}`);

        try {
          const internalCommand = await handleWhatsAppInternalCommand({
            supabase,
            tenantId,
            senderPhone,
            content,
            contactId,
            source: "meta_webhook",
          });

          if (internalCommand.handled) {
            console.log("[Meta Webhook] Comando interno MAYUS processado:", {
              tenantId,
              intent: internalCommand.intent,
              sent: internalCommand.sent,
            });
            continue;
          }
        } catch (commandError) {
          console.error("[Meta Webhook] Erro ao processar comando interno MAYUS:", commandError);
        }

        // 5. Disparar Notificação Interna no MAYUS
        await supabase.from("notifications").insert([{
          tenant_id: tenantId,
          user_id: null, // Vai para todos do tenant
          title: `WhatsApp: ${pushName}`,
          message: content.substring(0, 100),
          type: "info",
          link_url: "/dashboard/conversas/whatsapp",
        }]);

        try {
          await prepareWhatsAppSalesReplyForContact({
            supabase,
            tenantId,
            contactId,
            trigger: "meta_webhook",
            notify: true,
            autoSendFirstResponse: true,
          });
        } catch (replyError) {
          console.error("[Meta Webhook] Erro ao preparar resposta MAYUS:", replyError);
        }
      }
    }

    // A Meta EXIGE resposta 200 rápida, senão ela reenvia
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Meta Webhook] Erro Fatal:", error);
    // Retornamos 200 mesmo em erro, para a Meta não ficar reenviando infinitamente
    return NextResponse.json({ success: false, error: error.message });
  }
}
