import type { SupabaseClient } from "@supabase/supabase-js";
import { listTenantIntegrationsResolved } from "@/lib/integrations/server";
import {
  buildWhatsAppSalesReply,
  buildWhatsAppSalesReplyMetadata,
  type WhatsAppSalesReply,
} from "./whatsapp-sales-reply";

const PRIVATE_IP = /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/;

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function validateIntegrationUrl(url: string): void {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Protocolo invalido");
  if (PRIVATE_IP.test(parsed.hostname)) throw new Error("URL aponta para rede interna");
}

function cleanPhoneForProvider(phoneNumber: string) {
  return String(phoneNumber || "").split("@")[0].replace(/\D/g, "");
}

async function loadSalesProfile(params: {
  supabase: SupabaseClient;
  tenantId: string;
}) {
  const { data } = await params.supabase
    .from("tenant_settings")
    .select("ai_features")
    .eq("tenant_id", params.tenantId)
    .maybeSingle<{ ai_features: Record<string, any> | null }>();

  const profile = data?.ai_features?.sales_consultation_profile;
  if (!profile || typeof profile !== "object") return null;

  return {
    firmName: getStringValue(data?.ai_features?.firm_name) || getStringValue(profile.firm_name),
    idealClient: getStringValue(profile.ideal_client),
    coreSolution: getStringValue(profile.core_solution),
    uniqueValueProposition: getStringValue(profile.unique_value_proposition),
    valuePillars: Array.isArray(profile.value_pillars)
      ? profile.value_pillars.map((item: unknown) => getStringValue(item)).filter((item): item is string => Boolean(item))
      : [],
    positioningSummary: getStringValue(profile.positioning_summary),
  };
}

function buildNotification(reply: WhatsAppSalesReply, contactName: string | null) {
  const contactLabel = contactName || "lead WhatsApp";

  if (reply.mode === "internal_setup_required") {
    return {
      title: "MAYUS precisa configurar vendas",
      message: `${contactLabel}: ${reply.internalNote}`.slice(0, 180),
      type: "warning",
    };
  }

  if (reply.mode === "human_review_required") {
    return {
      title: "Resposta WhatsApp pronta para revisar",
      message: `${contactLabel}: revisar antes de enviar por haver risco comercial/juridico.`.slice(0, 180),
      type: "warning",
    };
  }

  return {
    title: "Resposta WhatsApp preparada",
    message: `${contactLabel}: MAYUS montou uma resposta consultiva para o atendimento.`.slice(0, 180),
    type: "info",
  };
}

async function sendFrontdeskWhatsAppReply(params: {
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
  phoneNumber: string;
  text: string;
}) {
  const integrations = await listTenantIntegrationsResolved(params.tenantId, ["meta_cloud", "evolution"]);
  const provider = integrations.find((item) => item.provider === "evolution")
    || integrations.find((item) => item.provider === "meta_cloud");

  if (!provider?.api_key || !provider.instance_name) {
    return { sent: false, reason: "missing_whatsapp_integration" as const };
  }

  let apiResponse: unknown = null;

  if (provider.provider === "meta_cloud") {
    const [phoneId] = provider.instance_name.split("|");
    const response = await fetch(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanPhoneForProvider(params.phoneNumber),
        type: "text",
        text: { body: params.text },
      }),
    });

    apiResponse = await response.json().catch(() => null);
    if (!response.ok) throw new Error("Erro Meta Web API: " + JSON.stringify(apiResponse));
  }

  if (provider.provider === "evolution") {
    const [baseUrlRaw, instanceName] = String(provider.instance_name || "").split("|");
    const baseUrl = String(baseUrlRaw || "").replace(/\/$/, "");
    validateIntegrationUrl(baseUrl);

    const response = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: {
        apikey: provider.api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        number: cleanPhoneForProvider(params.phoneNumber),
        text: params.text,
      }),
    });

    apiResponse = await response.json().catch(() => null);
    if (!response.ok) throw new Error("Erro Evolution API: " + JSON.stringify(apiResponse));
  }

  await params.supabase.from("whatsapp_messages").insert([{
    tenant_id: params.tenantId,
    contact_id: params.contactId,
    direction: "outbound",
    message_type: "text",
    content: params.text,
    status: "sent",
  }]);

  return { sent: true, provider: provider.provider, apiResponse };
}

export async function prepareWhatsAppSalesReplyForContact(params: {
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
  actorUserId?: string | null;
  trigger: "manual" | "meta_webhook" | "evolution_webhook";
  notify?: boolean;
  autoSendFirstResponse?: boolean;
}) {
  const { data: contact, error: contactError } = await params.supabase
    .from("whatsapp_contacts")
    .select("id, name, phone_number, assigned_user_id")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.contactId)
    .maybeSingle<{ id: string; name: string | null; phone_number: string | null; assigned_user_id?: string | null }>();

  if (contactError || !contact) {
    throw new Error("Contato nao encontrado.");
  }

  const { data: messages } = await params.supabase
    .from("whatsapp_messages")
    .select("direction, content, message_type, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const reply = buildWhatsAppSalesReply({
    contactName: contact.name,
    phoneNumber: contact.phone_number,
    messages: (messages || []).reverse(),
    salesProfile: await loadSalesProfile({
      supabase: params.supabase,
      tenantId: params.tenantId,
    }),
  });
  const metadata = buildWhatsAppSalesReplyMetadata(reply);
  let autoDelivery: Awaited<ReturnType<typeof sendFrontdeskWhatsAppReply>> | null = null;
  let autoSendError: string | null = null;
  const canAutoSend = Boolean(
    params.autoSendFirstResponse
    && params.trigger !== "manual"
    && !contact.assigned_user_id
    && contact.phone_number
    && reply.suggestedReply
    && reply.mayAutoSend
  );

  await params.supabase.from("system_event_logs").insert({
    tenant_id: params.tenantId,
    user_id: params.actorUserId || null,
    source: "whatsapp",
    provider: "mayus",
    event_name: "whatsapp_sales_reply_prepared",
    status: "ok",
    payload: {
      contact_id: contact.id,
      trigger: params.trigger,
      ...metadata,
      first_response_policy: {
        enabled: params.autoSendFirstResponse === true,
        sla_minutes: reply.firstResponseSlaMinutes,
        can_auto_send: canAutoSend,
      },
    },
    created_at: new Date().toISOString(),
  });

  if (canAutoSend && reply.suggestedReply && contact.phone_number) {
    try {
      autoDelivery = await sendFrontdeskWhatsAppReply({
        supabase: params.supabase,
        tenantId: params.tenantId,
        contactId: contact.id,
        phoneNumber: contact.phone_number,
        text: reply.suggestedReply,
      });

      await params.supabase.from("system_event_logs").insert({
        tenant_id: params.tenantId,
        user_id: params.actorUserId || null,
        source: "whatsapp",
        provider: "mayus",
        event_name: "whatsapp_sales_reply_auto_sent",
        status: autoDelivery.sent ? "ok" : "warning",
        payload: {
          contact_id: contact.id,
          trigger: params.trigger,
          sent: autoDelivery.sent,
          reason: "reason" in autoDelivery ? autoDelivery.reason : null,
          provider: "provider" in autoDelivery ? autoDelivery.provider : null,
          first_response_sla_minutes: reply.firstResponseSlaMinutes,
          handoff_recommended: reply.handoffRecommended,
        },
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      autoSendError = error instanceof Error ? error.message : "auto_send_failed";
      await params.supabase.from("system_event_logs").insert({
        tenant_id: params.tenantId,
        user_id: params.actorUserId || null,
        source: "whatsapp",
        provider: "mayus",
        event_name: "whatsapp_sales_reply_auto_send_failed",
        status: "error",
        payload: {
          contact_id: contact.id,
          trigger: params.trigger,
          error: autoSendError,
          first_response_sla_minutes: reply.firstResponseSlaMinutes,
        },
        created_at: new Date().toISOString(),
      });
    }
  }

  if (params.notify) {
    const notification = buildNotification(reply, contact.name);
    await params.supabase.from("notifications").insert({
      tenant_id: params.tenantId,
      user_id: null,
      title: autoDelivery?.sent ? "MAYUS respondeu o lead" : notification.title,
      message: autoDelivery?.sent
        ? `${contact.name || "lead WhatsApp"}: primeira resposta enviada pelo MAYUS.`.slice(0, 180)
        : autoSendError
          ? `${contact.name || "lead WhatsApp"}: resposta pronta, mas autoenvio falhou.`.slice(0, 180)
          : notification.message,
      type: autoDelivery?.sent ? "success" : notification.type,
      link_url: "/dashboard/conversas/whatsapp",
      created_at: new Date().toISOString(),
    });
  }

  return {
    contact,
    reply,
    metadata: {
      ...metadata,
      auto_sent: autoDelivery?.sent === true,
      auto_send_error: autoSendError,
    },
  };
}
