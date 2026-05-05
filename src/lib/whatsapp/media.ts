import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHeaders, getLLMClientCandidates, type LLMClientCandidate } from "@/lib/llm-router";
import { listTenantIntegrationsResolved } from "@/lib/integrations/server";

export type WhatsAppMediaKind = "image" | "audio" | "video" | "document" | "sticker" | string;

export type WhatsAppStoredMedia = {
  media_url: string | null;
  media_storage_path: string | null;
  media_mime_type: string | null;
  media_filename: string | null;
  media_size_bytes: number | null;
  media_provider: string | null;
  media_processing_status: "none" | "pending" | "processed" | "unsupported" | "failed";
  media_text: string | null;
  media_summary: string | null;
  metadata: Record<string, unknown>;
};

type DownloadedMedia = {
  bytes: Uint8Array;
  mimeType: string | null;
  filename: string | null;
  sizeBytes: number | null;
  providerMediaId?: string | null;
  metadata?: Record<string, unknown>;
};

const WHATSAPP_MEDIA_BUCKET = "whatsapp-media";
const PRIVATE_IP = /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/;
const WHATSAPP_MEDIA_SIGNED_URL_TTL_SECONDS = 60 * 60;

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function getExtension(filename?: string | null, mimeType?: string | null) {
  const explicit = String(filename || "").toLowerCase().split(".").pop();
  if (explicit && explicit !== filename?.toLowerCase()) return explicit.replace(/[^a-z0-9]/g, "");

  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("jpeg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("wordprocessingml")) return "docx";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4")) return "mp4";
  if (mime.startsWith("text/")) return "txt";
  return "bin";
}

function safeFilename(value: string | null | undefined, fallback: string) {
  return (cleanText(value) || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || fallback;
}

function normalizeStorageSegment(value: string) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

function bytesFromArrayBuffer(buffer: ArrayBuffer) {
  return new Uint8Array(buffer);
}

function buildSummaryFromText(text: string | null) {
  const normalized = cleanText(text);
  if (!normalized) return null;
  return normalized.slice(0, 700);
}

function isTextLike(mimeType: string | null, filename: string | null) {
  const extension = getExtension(filename, mimeType);
  return String(mimeType || "").startsWith("text/") || ["txt", "md", "csv", "json"].includes(extension);
}

function getStorageContentType(mimeType: string | null, filename: string | null) {
  const normalized = String(mimeType || "").toLowerCase().trim();
  const extension = getExtension(filename, mimeType);

  if (extension === "docx") return "application/octet-stream";
  return normalized || "application/octet-stream";
}

async function extractDocumentText(params: {
  bytes: Uint8Array;
  mimeType: string | null;
  filename: string | null;
}) {
  const extension = getExtension(params.filename, params.mimeType);

  if (isTextLike(params.mimeType, params.filename)) {
    return cleanText(new TextDecoder("utf-8").decode(params.bytes));
  }

  if (String(params.mimeType || "") === "application/pdf" || extension === "pdf") {
    const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (buffer: Buffer) => Promise<{ text?: string }>;
    const parsed = await pdfParse(Buffer.from(params.bytes));
    return cleanText(parsed?.text || null);
  }

  if (
    String(params.mimeType || "") === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    || extension === "docx"
  ) {
    const mammothModule = await import("mammoth");
    const mammoth = (mammothModule as any).default || mammothModule;
    const parsed = await mammoth.extractRawText({ buffer: Buffer.from(params.bytes) });
    return cleanText(parsed?.value || null);
  }

  return null;
}

async function getOpenAiApiKeyForTenant(tenantId: string) {
  const integrations = await listTenantIntegrationsResolved(tenantId, ["openai"]);
  const tenantKey = integrations.find((integration) => {
    const status = String((integration as { status?: string | null }).status || "").toLowerCase();
    return integration.provider === "openai" && integration.api_key && (!status || status === "connected");
  })?.api_key;

  return String(tenantKey || process.env.OPENAI_API_KEY || "").trim() || null;
}

async function transcribeAudio(params: {
  tenantId: string;
  bytes: Uint8Array;
  mimeType: string | null;
  filename: string | null;
}) {
  const apiKey = await getOpenAiApiKeyForTenant(params.tenantId);
  if (!apiKey) return null;

  const filename = safeFilename(params.filename, `audio.${getExtension(params.filename, params.mimeType)}`);
  const blob = new Blob([Buffer.from(params.bytes)], { type: params.mimeType || "application/octet-stream" });
  const form = new FormData();
  form.append("model", "whisper-1");
  form.append("file", blob, filename);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Falha ao transcrever audio: ${JSON.stringify(data)}`);
  return cleanText(data?.text || null);
}

async function callVisionCandidate(params: {
  candidate: LLMClientCandidate;
  imageUrl: string;
  caption?: string | null;
}) {
  const response = await fetch(params.candidate.endpoint, {
    method: "POST",
    headers: buildHeaders(params.candidate),
    body: JSON.stringify({
      model: params.candidate.model,
      temperature: 0.1,
      max_tokens: 280,
      messages: [
        {
          role: "system",
          content: "Descreva a imagem recebida no WhatsApp de forma objetiva, em portugues do Brasil, sem inventar detalhes ilegíveis.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "Leia esta imagem para ajudar o atendimento WhatsApp.",
                params.caption ? `Legenda/mensagem do cliente: ${params.caption}` : null,
                "Retorne um resumo curto do que aparece e qualquer texto legivel.",
              ].filter(Boolean).join("\n"),
            },
            { type: "image_url", image_url: { url: params.imageUrl } },
          ],
        },
      ],
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Falha ao ler imagem: ${JSON.stringify(data)}`);
  return cleanText(data?.choices?.[0]?.message?.content || null);
}

async function describeImage(params: {
  supabase: SupabaseClient;
  tenantId: string;
  imageUrl: string;
  caption?: string | null;
}) {
  const candidates = await getLLMClientCandidates(params.supabase, params.tenantId, "sdr_whatsapp");
  const ordered = candidates.filter((candidate) => ["openai", "google", "openrouter"].includes(candidate.provider));

  for (const candidate of ordered) {
    try {
      const summary = await callVisionCandidate({
        candidate,
        imageUrl: params.imageUrl,
        caption: params.caption,
      });
      if (summary) return summary;
    } catch {
      // Try the next configured provider/model.
    }
  }

  return null;
}

function validateExternalUrl(url: string): void {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("URL de midia invalida");
  if (PRIVATE_IP.test(parsed.hostname)) throw new Error("URL de midia aponta para rede interna");
}

async function uploadAndAnalyzeMedia(params: {
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
  provider: string;
  kind: WhatsAppMediaKind;
  caption?: string | null;
  downloaded: DownloadedMedia;
}): Promise<WhatsAppStoredMedia> {
  const extension = getExtension(params.downloaded.filename, params.downloaded.mimeType);
  const filename = safeFilename(params.downloaded.filename, `${params.kind}-${Date.now()}.${extension}`);
  const storagePath = [
    normalizeStorageSegment(params.tenantId),
    normalizeStorageSegment(params.contactId),
    `${Date.now()}-${filename}`,
  ].join("/");

  const { error: uploadError } = await params.supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .upload(storagePath, Buffer.from(params.downloaded.bytes), {
      contentType: getStorageContentType(params.downloaded.mimeType, filename),
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data: signedData, error: signedError } = await params.supabase.storage
    .from(WHATSAPP_MEDIA_BUCKET)
    .createSignedUrl(storagePath, WHATSAPP_MEDIA_SIGNED_URL_TTL_SECONDS);
  if (signedError) throw signedError;

  const signedUrl = signedData.signedUrl;
  let mediaText: string | null = null;
  let mediaSummary: string | null = null;
  let status: WhatsAppStoredMedia["media_processing_status"] = "unsupported";

  try {
    if (params.kind === "audio") {
      mediaText = await transcribeAudio({
        tenantId: params.tenantId,
        bytes: params.downloaded.bytes,
        mimeType: params.downloaded.mimeType,
        filename,
      });
      mediaSummary = mediaText ? `Audio transcrito: ${buildSummaryFromText(mediaText)}` : null;
      status = mediaText ? "processed" : "unsupported";
    } else if (params.kind === "image") {
      mediaSummary = await describeImage({
        supabase: params.supabase,
        tenantId: params.tenantId,
        imageUrl: signedUrl,
        caption: params.caption,
      });
      mediaText = mediaSummary;
      status = mediaSummary ? "processed" : "unsupported";
    } else if (params.kind === "document") {
      mediaText = await extractDocumentText({
        bytes: params.downloaded.bytes,
        mimeType: params.downloaded.mimeType,
        filename,
      });
      mediaSummary = buildSummaryFromText(mediaText);
      status = mediaText ? "processed" : "unsupported";
    } else {
      status = "unsupported";
    }
  } catch (error) {
    status = "failed";
    mediaSummary = error instanceof Error ? error.message.slice(0, 500) : "Falha ao processar midia.";
  }

  return {
    media_url: null,
    media_storage_path: storagePath,
    media_mime_type: params.downloaded.mimeType,
    media_filename: filename,
    media_size_bytes: params.downloaded.sizeBytes ?? params.downloaded.bytes.byteLength,
    media_provider: params.provider,
    media_processing_status: status,
    media_text: mediaText,
    media_summary: mediaSummary,
    metadata: {
      ...(params.downloaded.metadata || {}),
      provider_media_id: params.downloaded.providerMediaId || null,
      original_filename: params.downloaded.filename || null,
      media_kind: params.kind,
    },
  };
}

export async function processUploadedWhatsAppMedia(params: {
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
  provider: string;
  kind: WhatsAppMediaKind;
  bytes: Uint8Array;
  mimeType: string | null;
  filename?: string | null;
  caption?: string | null;
  metadata?: Record<string, unknown>;
}) {
  return uploadAndAnalyzeMedia({
    supabase: params.supabase,
    tenantId: params.tenantId,
    contactId: params.contactId,
    provider: params.provider,
    kind: params.kind,
    caption: params.caption,
    downloaded: {
      bytes: params.bytes,
      mimeType: params.mimeType,
      filename: params.filename || null,
      sizeBytes: params.bytes.byteLength,
      metadata: params.metadata,
    },
  });
}

export async function downloadMetaCloudMedia(params: {
  mediaId: string;
  token: string;
  filename?: string | null;
}) {
  const metadataResponse = await fetch(`https://graph.facebook.com/v22.0/${encodeURIComponent(params.mediaId)}`, {
    headers: { Authorization: `Bearer ${params.token}` },
  });
  const metadata = await metadataResponse.json().catch(() => null);
  if (!metadataResponse.ok) throw new Error(`Falha ao buscar midia Meta: ${JSON.stringify(metadata)}`);

  const mediaUrl = String(metadata?.url || "");
  if (!mediaUrl) throw new Error("Midia Meta sem URL de download.");

  const fileResponse = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${params.token}` },
  });
  if (!fileResponse.ok) throw new Error("Falha ao baixar arquivo da Meta.");

  const bytes = bytesFromArrayBuffer(await fileResponse.arrayBuffer());
  return {
    bytes,
    mimeType: cleanText(metadata?.mime_type) || fileResponse.headers.get("content-type"),
    filename: params.filename || null,
    sizeBytes: Number(metadata?.file_size || bytes.byteLength) || bytes.byteLength,
    providerMediaId: params.mediaId,
    metadata: {
      meta_sha256: metadata?.sha256 || null,
      meta_messaging_product: metadata?.messaging_product || null,
    },
  } satisfies DownloadedMedia;
}

export async function processMetaCloudMedia(params: {
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
  mediaId: string;
  token: string;
  kind: WhatsAppMediaKind;
  caption?: string | null;
  filename?: string | null;
}) {
  const downloaded = await downloadMetaCloudMedia({
    mediaId: params.mediaId,
    token: params.token,
    filename: params.filename,
  });

  return uploadAndAnalyzeMedia({
    supabase: params.supabase,
    tenantId: params.tenantId,
    contactId: params.contactId,
    provider: "meta_cloud",
    kind: params.kind,
    caption: params.caption,
    downloaded,
  });
}

function pickEvolutionMediaPayload(messagePayload: any, kind: WhatsAppMediaKind) {
  if (kind === "image") return messagePayload?.imageMessage || null;
  if (kind === "audio") return messagePayload?.audioMessage || null;
  if (kind === "video") return messagePayload?.videoMessage || null;
  if (kind === "document") return messagePayload?.documentMessage || null;
  if (kind === "sticker") return messagePayload?.stickerMessage || null;
  return null;
}

function decodeBase64(value: unknown) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const base64 = raw.includes(",") ? raw.split(",").pop() || "" : raw;
  if (!base64) return null;
  return new Uint8Array(Buffer.from(base64, "base64"));
}

async function tryFetchEvolutionDirectUrl(url: string) {
  validateExternalUrl(url);
  const response = await fetch(url);
  if (!response.ok) return null;
  return {
    bytes: bytesFromArrayBuffer(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type"),
  };
}

async function tryFetchEvolutionBase64(params: {
  baseUrl: string;
  instanceName: string;
  apiKey: string;
  messageEnvelope: any;
}) {
  validateExternalUrl(params.baseUrl);
  const response = await fetch(`${params.baseUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${encodeURIComponent(params.instanceName)}`, {
    method: "POST",
    headers: { apikey: params.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ message: params.messageEnvelope, convertToMp4: false }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) return null;
  return decodeBase64(data?.base64 || data?.data?.base64 || data?.result?.base64 || data?.media?.base64);
}

export async function processEvolutionMedia(params: {
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
  baseUrl: string;
  instanceName: string;
  apiKey: string;
  messageEnvelope: any;
  messagePayload: any;
  kind: WhatsAppMediaKind;
  caption?: string | null;
}) {
  const mediaPayload = pickEvolutionMediaPayload(params.messagePayload, params.kind);
  const mimeType = cleanText(mediaPayload?.mimetype || mediaPayload?.mimeType || null);
  const filename = cleanText(mediaPayload?.fileName || mediaPayload?.filename || null);
  const providerMediaId = cleanText(params.messageEnvelope?.key?.id || null);
  const sizeBytes = Number(mediaPayload?.fileLength || mediaPayload?.file_size || 0) || null;
  let bytes = decodeBase64(
    mediaPayload?.base64
    || params.messageEnvelope?.base64
    || params.messageEnvelope?.message?.base64
    || params.messagePayload?.base64
  );

  if (!bytes) {
    bytes = await tryFetchEvolutionBase64({
      baseUrl: params.baseUrl,
      instanceName: params.instanceName,
      apiKey: params.apiKey,
      messageEnvelope: params.messageEnvelope,
    }).catch(() => null);
  }

  if (!bytes && typeof mediaPayload?.url === "string" && /^https?:\/\//.test(mediaPayload.url)) {
    const direct = await tryFetchEvolutionDirectUrl(mediaPayload.url).catch(() => null);
    bytes = direct?.bytes || null;
  }

  if (!bytes) return null;

  return uploadAndAnalyzeMedia({
    supabase: params.supabase,
    tenantId: params.tenantId,
    contactId: params.contactId,
    provider: "evolution",
    kind: params.kind,
    caption: params.caption,
    downloaded: {
      bytes,
      mimeType,
      filename,
      sizeBytes,
      providerMediaId,
      metadata: {
        evolution_media_key_present: Boolean(mediaPayload?.mediaKey),
        evolution_direct_path_present: Boolean(mediaPayload?.directPath),
      },
    },
  });
}

export function buildUnsupportedMediaRecord(params: {
  provider: string;
  kind: WhatsAppMediaKind;
  providerMediaId?: string | null;
  mimeType?: string | null;
  filename?: string | null;
  reason?: string | null;
}): WhatsAppStoredMedia {
  return {
    media_url: null,
    media_storage_path: null,
    media_mime_type: params.mimeType || null,
    media_filename: params.filename || null,
    media_size_bytes: null,
    media_provider: params.provider,
    media_processing_status: "unsupported",
    media_text: null,
    media_summary: params.reason || null,
    metadata: {
      provider_media_id: params.providerMediaId || null,
      media_kind: params.kind,
    },
  };
}
