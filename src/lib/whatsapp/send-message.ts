import type { SupabaseClient } from "@supabase/supabase-js";
import { listTenantIntegrationsResolved, type ResolvedTenantIntegration } from "@/lib/integrations/server";
import { sendEvolutionPresence } from "@/lib/whatsapp/evolution-presence";

const PRIVATE_IP = /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/;

export type WhatsAppSendProvider = "meta_cloud" | "evolution";

export type SendWhatsAppMessageInput = {
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
  phoneNumber: string;
  preferredProvider?: WhatsAppSendProvider | null;
  text?: string | null;
  audioUrl?: string | null;
  mediaUrl?: string | null;
  mediaType?: "image" | "audio" | "video" | "document" | string | null;
  mediaFilename?: string | null;
  mediaMimeType?: string | null;
  mediaStoragePath?: string | null;
  metadata?: Record<string, unknown> | null;
  humanizeDelivery?: boolean | null;
  fetcher?: typeof fetch;
};

export type SendWhatsAppMessageResult = {
  provider: WhatsAppSendProvider;
  apiResponse: unknown;
  messageId: string | null;
};

function extractProviderMessageId(provider: WhatsAppSendProvider, apiResponse: unknown) {
  if (!apiResponse || typeof apiResponse !== "object") return null;
  const data = apiResponse as Record<string, any>;

  if (provider === "meta_cloud") {
    return typeof data.messages?.[0]?.id === "string" ? data.messages[0].id : null;
  }

  return [
    data.key?.id,
    data.message?.key?.id,
    data.data?.key?.id,
    data.response?.key?.id,
    data.id,
  ].find((value) => typeof value === "string" && value.trim()) || null;
}

function validateEvolutionUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new Error("Protocolo invalido");
    }
    if (PRIVATE_IP.test(parsed.hostname)) {
      throw new Error("URL aponta para rede interna");
    }
  } catch {
    throw new Error("URL da integracao Evolution invalida ou nao permitida");
  }
}

function pickProvider(integrations: ResolvedTenantIntegration[], preferredProvider?: WhatsAppSendProvider | null) {
  if (preferredProvider) {
    return integrations.find((integration) => integration.provider === preferredProvider) || null;
  }

  return integrations.find((integration) => integration.provider === "evolution")
    || integrations.find((integration) => integration.provider === "meta_cloud")
    || null;
}

function assertSendInput(input: SendWhatsAppMessageInput) {
  if (!input.tenantId || !input.contactId || !input.phoneNumber || (!input.text && !input.audioUrl && !input.mediaUrl)) {
    throw new Error("Faltam parametros para enviar WhatsApp");
  }
  if (String(input.phoneNumber).toLowerCase().includes("@g.us")) {
    throw new Error("Envio WhatsApp para grupos esta bloqueado");
  }
}

function getOutgoingMessageType(input: SendWhatsAppMessageInput) {
  if (input.audioUrl) return "audio";
  if (input.mediaUrl) return input.mediaType || "document";
  return "text";
}

async function parseApiResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function sendViaMetaCloud(input: SendWhatsAppMessageInput, provider: ResolvedTenantIntegration) {
  const fetcher = input.fetcher || fetch;
  const [phoneId] = String(provider.instance_name || "").split("|");
  const token = provider.api_key;

  if (!phoneId || !token) {
    throw new Error("Integracao Meta Cloud incompleta");
  }

  const cleanPhone = input.phoneNumber.replace(/\D/g, "");
  const payload: Record<string, unknown> = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: cleanPhone,
  };

  if (input.audioUrl) {
    payload.type = "audio";
    payload.audio = { link: input.audioUrl };
  } else if (input.mediaUrl) {
    const mediaType = getOutgoingMessageType(input);
    payload.type = mediaType;
    if (mediaType === "image") {
      payload.image = { link: input.mediaUrl, ...(input.text ? { caption: input.text } : {}) };
    } else if (mediaType === "video") {
      payload.video = { link: input.mediaUrl, ...(input.text ? { caption: input.text } : {}) };
    } else {
      payload.type = "document";
      payload.document = {
        link: input.mediaUrl,
        filename: input.mediaFilename || "documento",
        ...(input.text ? { caption: input.text } : {}),
      };
    }
  } else {
    payload.type = "text";
    payload.text = { body: input.text };
  }

  const response = await fetcher(`https://graph.facebook.com/v22.0/${phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const apiResponse = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(`Erro Meta Web API: ${JSON.stringify(apiResponse)}`);
  }

  return apiResponse;
}

async function sendViaEvolution(input: SendWhatsAppMessageInput, provider: ResolvedTenantIntegration) {
  const fetcher = input.fetcher || fetch;
  const [baseUrlRaw, instanceName] = String(provider.instance_name || "").split("|");
  const baseUrl = String(baseUrlRaw || "").replace(/\/$/, "");

  if (!baseUrl || !instanceName || !provider.api_key) {
    throw new Error("Integracao Evolution incompleta");
  }

  validateEvolutionUrl(baseUrl);

  const cleanPhone = input.phoneNumber.split("@")[0].replace(/\D/g, "");
  const isAudio = Boolean(input.audioUrl);
  const isMedia = Boolean(input.mediaUrl);
  const url = isAudio
    ? `${baseUrl}/message/sendWhatsAppAudio/${instanceName}`
    : isMedia
      ? `${baseUrl}/message/sendMedia/${instanceName}`
    : `${baseUrl}/message/sendText/${instanceName}`;
  const payload = isAudio
    ? { number: cleanPhone, audio: input.audioUrl }
    : isMedia
      ? {
        number: cleanPhone,
        mediatype: getOutgoingMessageType(input) === "video" ? "video" : getOutgoingMessageType(input) === "image" ? "image" : "document",
        media: input.mediaUrl,
        caption: input.text || "",
        fileName: input.mediaFilename || "documento",
      }
    : { number: cleanPhone, text: input.text };

  const response = await fetcher(url, {
    method: "POST",
    headers: { apikey: provider.api_key, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const apiResponse = await parseApiResponse(response);

  if (!response.ok) {
    throw new Error(`Erro Evolution API: ${JSON.stringify(apiResponse)}`);
  }

  return apiResponse;
}

function getHumanizedDelayMs(text?: string | null) {
  if (process.env.NODE_ENV === "test") return 0;
  const length = String(text || "").trim().length;
  if (length <= 0) return 0;
  return Math.min(10000, Math.max(2600, 1500 + length * 22));
}

async function sleep(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendEvolutionTypingPulse(input: SendWhatsAppMessageInput, delayMs: number) {
  await sendEvolutionPresence({
    tenantId: input.tenantId,
    remoteJid: input.phoneNumber,
    presence: "composing",
    delayMs: Math.min(Math.max(delayMs, 1000), 10000),
    supabase: input.supabase,
    fetcher: input.fetcher,
  });

  let elapsed = 0;
  while (elapsed + 3500 < delayMs) {
    await sleep(3500);
    elapsed += 3500;
    await sendEvolutionPresence({
      tenantId: input.tenantId,
      remoteJid: input.phoneNumber,
      presence: "composing",
      delayMs: Math.min(Math.max(delayMs - elapsed, 1000), 10000),
      supabase: input.supabase,
      fetcher: input.fetcher,
    });
  }

  await sleep(delayMs - elapsed);
}

async function sendViaEvolutionHumanized(input: SendWhatsAppMessageInput, provider: ResolvedTenantIntegration) {
  const shouldHumanize = Boolean(input.humanizeDelivery && input.text && !input.audioUrl && !input.mediaUrl);
  if (!shouldHumanize) return sendViaEvolution(input, provider);

  try {
    await sendEvolutionTypingPulse(input, getHumanizedDelayMs(input.text));
    return await sendViaEvolution(input, provider);
  } finally {
    await sendEvolutionPresence({
      tenantId: input.tenantId,
      remoteJid: input.phoneNumber,
      presence: "paused",
      supabase: input.supabase,
      fetcher: input.fetcher,
    });
  }
}

export async function sendWhatsAppMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult> {
  assertSendInput(input);

  const integrations = await listTenantIntegrationsResolved(input.tenantId, ["meta_cloud", "evolution"]);
  const provider = pickProvider(integrations, input.preferredProvider);

  if (!provider) {
    throw new Error(input.preferredProvider
      ? `Integracao WhatsApp ${input.preferredProvider} nao encontrada`
      : "Nenhuma integracao de WhatsApp encontrada");
  }

  let apiResponse: unknown = null;
  if (provider.provider === "meta_cloud") {
    apiResponse = await sendViaMetaCloud(input, provider);
  } else if (provider.provider === "evolution") {
    apiResponse = await sendViaEvolutionHumanized(input, provider);
  } else {
    throw new Error("Integracao de WhatsApp nao suportada");
  }

  const messageId = extractProviderMessageId(provider.provider as WhatsAppSendProvider, apiResponse);

  const metadata = {
    ...(input.metadata || {}),
    ...(input.audioUrl && !input.mediaStoragePath ? { audio_url: input.audioUrl } : {}),
    ...(input.mediaUrl && !input.mediaStoragePath ? { media_url: input.mediaUrl, media_type: getOutgoingMessageType(input) } : {}),
    ...(input.mediaStoragePath ? { media_storage_path: input.mediaStoragePath, media_type: getOutgoingMessageType(input) } : {}),
  };
  const messageType = getOutgoingMessageType(input);
  const { error: dbError } = await input.supabase.from("whatsapp_messages").insert([{
    tenant_id: input.tenantId,
    contact_id: input.contactId,
    direction: "outbound",
    message_type: messageType,
    content: input.audioUrl
      ? "[Audio Enviado]"
      : input.mediaUrl
        ? input.text || `[${messageType}]`
        : input.text,
    media_url: input.mediaStoragePath ? null : input.audioUrl || input.mediaUrl || null,
    media_mime_type: input.mediaMimeType || null,
    media_filename: input.mediaFilename || null,
    media_storage_path: input.mediaStoragePath || null,
    media_provider: provider.provider,
    media_processing_status: input.audioUrl || input.mediaUrl ? "none" : "none",
    message_id_from_evolution: provider.provider === "evolution" ? messageId : null,
    status: "sent",
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
  }]);

  if (dbError) {
    throw dbError;
  }

  return {
    provider: provider.provider as WhatsAppSendProvider,
    apiResponse,
    messageId,
  };
}
