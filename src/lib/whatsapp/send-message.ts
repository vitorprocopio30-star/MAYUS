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
  if (!input.tenantId || !input.contactId || !input.phoneNumber || (!input.text && !input.audioUrl)) {
    throw new Error("Faltam parametros para enviar WhatsApp");
  }
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

  const cleanPhone = input.phoneNumber.split("@")[0];
  const isAudio = Boolean(input.audioUrl);
  const url = isAudio
    ? `${baseUrl}/message/sendWhatsAppAudio/${instanceName}`
    : `${baseUrl}/message/sendText/${instanceName}`;
  const payload = isAudio
    ? { number: cleanPhone, audio: input.audioUrl }
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
  };
  const { error: dbError } = await input.supabase.from("whatsapp_messages").insert([{
    tenant_id: input.tenantId,
    contact_id: input.contactId,
    direction: "outbound",
    content: input.audioUrl ? "[Audio Enviado]" : input.text,
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
