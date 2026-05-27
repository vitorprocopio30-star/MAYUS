import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantIntegrationResolved, requireTenantApiKey } from "@/lib/integrations/server";

const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";
const WHATSAPP_AUDIO_SIGNED_URL_TTL_SECONDS = 60 * 60;

export type WhatsAppReplyAudioResult = {
  audioUrl: string;
  storagePath: string;
  provider: "openai" | "elevenlabs";
  ttsProvider: "openai" | "elevenlabs";
  voiceProfile: string | null;
  voiceIdSource: "tenant_integration" | "env_fallback" | null;
  mimeType: "audio/mpeg";
  filename: string;
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizeStorageSegment(value: string) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

async function loadVoiceSettings(supabase: SupabaseClient, tenantId: string) {
  const { data } = await supabase
    .from("tenant_settings")
    .select("ai_features")
    .eq("tenant_id", tenantId)
    .maybeSingle<{ ai_features: Record<string, any> | null }>();

  const features = data?.ai_features && typeof data.ai_features === "object" ? data.ai_features : {};
  return {
    provider: features.voice_provider === "elevenlabs" ? "elevenlabs" as const : "openai" as const,
    openAiVoice: cleanText(features.openai_voice) || "nova",
    voiceProfile: cleanText(features.voice_profile) || (features.voice_provider === "elevenlabs" ? "mayusorb" : null),
  };
}

async function synthesizeOpenAi(params: {
  tenantId: string;
  text: string;
  voice: string;
  fetcher: typeof fetch;
}) {
  const { apiKey } = await requireTenantApiKey(params.tenantId, "openai");
  if (!apiKey) throw new Error("OpenAI API Key nao configurada para audio WhatsApp.");

  const response = await params.fetcher("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      input: params.text,
      voice: params.voice,
      speed: 1.12,
    }),
  });

  if (!response.ok) throw new Error(`Falha ao gerar audio OpenAI: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function synthesizeElevenLabs(params: {
  tenantId: string;
  text: string;
  fetcher: typeof fetch;
}) {
  const integration = await getTenantIntegrationResolved(params.tenantId, "elevenlabs");
  const tenantApiKey = cleanText(integration?.api_key);
  const tenantVoiceId = cleanText(integration?.instance_name);
  const envApiKey = cleanText(process.env.ELEVENLABS_API_KEY);
  const envVoiceId = cleanText(process.env.ELEVENLABS_VOICE_ID);
  const apiKey = tenantApiKey || envApiKey || "";
  const useEnvFallback = !integration && Boolean(envVoiceId);
  const voiceId = tenantVoiceId || (useEnvFallback ? envVoiceId : "");
  const voiceIdSource = tenantVoiceId ? "tenant_integration" as const : useEnvFallback ? "env_fallback" as const : null;

  if (!apiKey || !voiceId) {
    throw new Error("ElevenLabs API Key ou Voice ID da MAYUSOrb ausentes para audio WhatsApp.");
  }

  const response = await params.fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: params.text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.48,
        similarity_boost: 0.78,
      },
    }),
  });

  if (!response.ok) throw new Error(`Falha ao gerar audio ElevenLabs: ${response.status}`);
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    voiceIdSource,
  };
}

export async function synthesizeWhatsAppReplyAudio(params: {
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
  text: string;
  fetcher?: typeof fetch;
}): Promise<WhatsAppReplyAudioResult> {
  const text = cleanText(params.text);
  if (!text) throw new Error("Texto vazio para audio WhatsApp.");

  const fetcher = params.fetcher || fetch;
  const settings = await loadVoiceSettings(params.supabase, params.tenantId);
  const input = text.slice(0, 1400);
  const provider = settings.provider;
  let voiceIdSource: WhatsAppReplyAudioResult["voiceIdSource"] = null;
  const audio = provider === "elevenlabs"
    ? await synthesizeElevenLabs({ tenantId: params.tenantId, text: input, fetcher })
    : { bytes: await synthesizeOpenAi({ tenantId: params.tenantId, text: input, voice: settings.openAiVoice, fetcher }), voiceIdSource: null };
  voiceIdSource = audio.voiceIdSource;

  const filename = `mayus-reply-${Date.now()}.mp3`;
  const storagePath = [
    normalizeStorageSegment(params.tenantId),
    normalizeStorageSegment(params.contactId),
    "outbound-audio",
    filename,
  ].join("/");

  const { error: uploadError } = await params.supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(storagePath, audio.bytes, {
      contentType: "audio/mpeg",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data: signedData, error: signedError } = await params.supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .createSignedUrl(storagePath, WHATSAPP_AUDIO_SIGNED_URL_TTL_SECONDS);
  if (signedError || !signedData?.signedUrl) throw signedError || new Error("Nao foi possivel assinar audio WhatsApp.");

  return {
    audioUrl: signedData.signedUrl,
    storagePath,
    provider,
    ttsProvider: provider,
    voiceProfile: settings.voiceProfile || (provider === "elevenlabs" ? "mayusorb" : settings.openAiVoice),
    voiceIdSource,
    mimeType: "audio/mpeg",
    filename,
  };
}
