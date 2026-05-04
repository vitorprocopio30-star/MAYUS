import type { SupabaseClient } from "@supabase/supabase-js";
import { listTenantIntegrationsResolved, type ResolvedTenantIntegration } from "@/lib/integrations/server";

const PRIVATE_IP = /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/;

export type WhatsAppSendProvider = "meta_cloud" | "evolution";

export type SendWhatsAppMessageInput = {
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
  phoneNumber: string;
  text?: string | null;
  audioUrl?: string | null;
  mediaUrl?: string | null;
  mediaType?: "image" | "audio" | "video" | "document" | string | null;
  mediaFilename?: string | null;
  mediaMimeType?: string | null;
  mediaStoragePath?: string | null;
  metadata?: Record<string, unknown> | null;
  fetcher?: typeof fetch;
};

export type SendWhatsAppMessageResult = {
  provider: WhatsAppSendProvider;
  apiResponse: unknown;
};

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

function pickProvider(integrations: ResolvedTenantIntegration[]) {
  return integrations.find((integration) => integration.provider === "evolution")
    || integrations.find((integration) => integration.provider === "meta_cloud")
    || null;
}

function assertSendInput(input: SendWhatsAppMessageInput) {
  if (!input.tenantId || !input.contactId || !input.phoneNumber || (!input.text && !input.audioUrl && !input.mediaUrl)) {
    throw new Error("Faltam parametros para enviar WhatsApp");
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

export async function sendWhatsAppMessage(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult> {
  assertSendInput(input);

  const integrations = await listTenantIntegrationsResolved(input.tenantId, ["meta_cloud", "evolution"]);
  const provider = pickProvider(integrations);

  if (!provider) {
    throw new Error("Nenhuma integracao de WhatsApp encontrada");
  }

  let apiResponse: unknown = null;
  if (provider.provider === "meta_cloud") {
    apiResponse = await sendViaMetaCloud(input, provider);
  } else if (provider.provider === "evolution") {
    apiResponse = await sendViaEvolution(input, provider);
  } else {
    throw new Error("Integracao de WhatsApp nao suportada");
  }

  const metadata = {
    ...(input.metadata || {}),
    ...(input.audioUrl ? { audio_url: input.audioUrl } : {}),
    ...(input.mediaUrl ? { media_url: input.mediaUrl, media_type: getOutgoingMessageType(input) } : {}),
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
    media_url: input.audioUrl || input.mediaUrl || null,
    media_mime_type: input.mediaMimeType || null,
    media_filename: input.mediaFilename || null,
    media_storage_path: input.mediaStoragePath || null,
    media_provider: provider.provider,
    media_processing_status: input.audioUrl || input.mediaUrl ? "none" : "none",
    status: "sent",
    metadata: Object.keys(metadata).length > 0 ? metadata : null,
  }]);

  if (dbError) {
    throw dbError;
  }

  return {
    provider: provider.provider as WhatsAppSendProvider,
    apiResponse,
  };
}
