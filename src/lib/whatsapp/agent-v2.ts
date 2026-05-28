import type { MayusWhatsAppActorContext, MayusWhatsAppContextPolicy } from "@/lib/agent/mayus-operating-partner";
import type { WhatsAppProcessStatusContext } from "@/lib/whatsapp/process-status-context";

export type WhatsAppInputModality = "text" | "audio" | "image" | "document" | "video" | "sticker" | "unknown";
export type WhatsAppOutputModality = "text" | "audio";
export type WhatsAppMediaIntent =
  | "audio_transcript"
  | "payroll_or_benefit"
  | "process_or_court_document"
  | "payment_receipt"
  | "contract_or_power_of_attorney"
  | "identity_document"
  | "generic_media"
  | "unreadable_media";

export type WhatsAppMediaContext = {
  kind: WhatsAppInputModality;
  status: "none" | "pending" | "processed" | "unsupported" | "failed" | string;
  intent: WhatsAppMediaIntent;
  text: string | null;
  summary: string | null;
  filename: string | null;
  mimeType: string | null;
  confidence: "high" | "medium" | "low";
  transcriptionSource: string | null;
  visionSource: string | null;
};

export type WhatsAppDeliveryPolicy = {
  profile: "office_operator_instant" | "external_humanized" | "external_audio" | "unknown_light" | "instant_text";
  humanizeDelivery: boolean;
  humanizeDeliveryMode: "none" | "blocking" | "bounded";
  typingDelayMs: number;
  maxBlockingDelayMs: number | null;
  replyBlockGapMs: number;
  reason: string;
};

export type WhatsAppAgentTurn = {
  agentVersion: "whatsapp_v2";
  inputModalities: WhatsAppInputModality[];
  mediaContexts: WhatsAppMediaContext[];
  latestMediaContext: WhatsAppMediaContext | null;
  outputModality: WhatsAppOutputModality;
  outputModalityPolicy: "mirror_audio" | "requested_audio" | "text_default";
  outputModalityReason: string;
  deliveryPolicy: WhatsAppDeliveryPolicy;
};

export type WhatsAppTurnRuntimeContext = {
  version: "whatsapp_turn_context_v1";
  input_text: string | null;
  input_modality: WhatsAppInputModality;
  transcription_status: string | null;
  transcription_confidence: WhatsAppMediaContext["confidence"] | null;
  current_user_request: string | null;
  allowed_context: {
    scope: MayusWhatsAppContextPolicy["scope"] | null;
    reset_reason: string | null;
    continuation_reason: string | null;
    allowed_previous_event: boolean;
    allowed_process_candidates: boolean;
    prompt_message_count: number;
    raw_message_count: number;
  };
  target_process_reference: {
    verified: boolean;
    confidence: WhatsAppProcessStatusContext["confidence"] | null;
    access_scope: WhatsAppProcessStatusContext["accessScope"] | null;
    process_task_id: string | null;
    process_number: string | null;
    client_name: string | null;
    title: string | null;
    current_stage: string | null;
    last_movement_at: string | null;
    candidate_count: number;
  } | null;
  conversation_filesystem_manifest: {
    version: "whatsapp_case_filesystem_v1";
    storage: "supabase_storage";
    item_count: number;
    items: Array<{
      index: number;
      direction: string | null;
      kind: WhatsAppInputModality;
      content_preview: string | null;
      media_status: string | null;
      media_intent: WhatsAppMediaIntent | null;
      media_text_preview: string | null;
      media_summary_preview: string | null;
      filename: string | null;
      mime_type: string | null;
    }>;
  };
};

type WhatsAppAgentMessage = {
  content?: string | null;
  direction?: string | null;
  message_type?: string | null;
  media_text?: string | null;
  media_summary?: string | null;
  media_filename?: string | null;
  media_mime_type?: string | null;
  media_processing_status?: string | null;
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizeText(value?: string | null) {
  return cleanText(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase() || "";
}

function uniqueModalities(values: WhatsAppInputModality[]): WhatsAppInputModality[] {
  const result: WhatsAppInputModality[] = [];
  for (const value of values) {
    if (!result.includes(value)) result.push(value);
  }
  return result.length ? result : ["text"];
}

function normalizeMessageKind(value?: string | null): WhatsAppInputModality {
  const kind = normalizeText(value);
  if (kind === "text" || !kind) return "text";
  if (["audio", "image", "document", "video", "sticker"].includes(kind)) return kind as WhatsAppInputModality;
  return "unknown";
}

function mediaStatus(message: WhatsAppAgentMessage) {
  return cleanText(message.media_processing_status) || "none";
}

function mediaHaystack(message: WhatsAppAgentMessage) {
  return normalizeText([
    message.content,
    message.media_text,
    message.media_summary,
    message.media_filename,
    message.media_mime_type,
  ].filter(Boolean).join(" "));
}

function inferMediaIntent(kind: WhatsAppInputModality, status: string, haystack: string): WhatsAppMediaIntent {
  if (status === "failed" || status === "unsupported") return "unreadable_media";
  if (kind === "audio") return haystack ? "audio_transcript" : "unreadable_media";
  if (/contracheque|holerite|folha|desconto|consignado|beneficio|inss|aposentadoria|rmc|rcc|credcesta/.test(haystack)) {
    return "payroll_or_benefit";
  }
  if (/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}|processo|cnj|intimacao|intima[cç][aã]o|audiencia|audi[eê]ncia|sentenca|senten[cç]a|despacho|decisao|decis[aã]o|prazo|reu|r[eé]u|polo|parte contraria|parte contr[aá]ria/.test(haystack)) {
    return "process_or_court_document";
  }
  if (/comprovante|pix|boleto|pagamento|recibo|transferencia|transfer[eê]ncia/.test(haystack)) {
    return "payment_receipt";
  }
  if (/contrato|procuracao|procura[cç][aã]o|honorarios|honor[aá]rios|termo|assinatura/.test(haystack)) {
    return "contract_or_power_of_attorney";
  }
  if (/\brg\b|\bcpf\b|cnh|identidade|documento pessoal/.test(haystack)) {
    return "identity_document";
  }
  return "generic_media";
}

function mediaConfidence(status: string, text?: string | null, summary?: string | null): WhatsAppMediaContext["confidence"] {
  if (status !== "processed") return "low";
  const size = `${text || ""} ${summary || ""}`.trim().length;
  if (size >= 40) return "high";
  if (size > 0) return "medium";
  return "low";
}

export function buildWhatsAppMediaContexts(messages: WhatsAppAgentMessage[]): WhatsAppMediaContext[] {
  return messages
    .filter((message) => message.direction === "inbound")
    .map((message) => {
      const kind = normalizeMessageKind(message.message_type);
      if (kind === "text") return null;
      const status = mediaStatus(message);
      const text = cleanText(message.media_text);
      const summary = cleanText(message.media_summary);
      const haystack = mediaHaystack(message);
      const intent = inferMediaIntent(kind, status, haystack);
      return {
        kind,
        status,
        intent,
        text,
        summary,
        filename: cleanText(message.media_filename),
        mimeType: cleanText(message.media_mime_type),
        confidence: mediaConfidence(status, text, summary),
        transcriptionSource: kind === "audio" && text ? "whatsapp_media_pipeline" : null,
        visionSource: kind === "image" && summary ? "whatsapp_media_pipeline" : null,
      } satisfies WhatsAppMediaContext;
    })
    .filter(Boolean) as WhatsAppMediaContext[];
}

function latestInbound(messages: WhatsAppAgentMessage[]) {
  return [...messages].reverse().find((message) => message.direction === "inbound") || null;
}

function messageTextForModality(message: WhatsAppAgentMessage | null) {
  if (!message) return "";
  return [
    message.media_text,
    message.content,
    message.media_summary,
  ].map((value) => cleanText(value)).filter(Boolean).join(" ");
}

function truncatePreview(value?: string | null, maxLength = 220) {
  const text = cleanText(value);
  return text ? text.slice(0, maxLength) : null;
}

export function wantsAudioReply(text?: string | null) {
  const value = normalizeText(text);
  if (!value) return false;
  return /\b(manda|mande|responde|responda|envia|envie|fala|fale)\b.{0,48}\b(audio|voz)\b/.test(value)
    || /\b(por|em)\s+(audio|voz)\b/.test(value)
    || /\bresposta\s+(em|por)\s+(audio|voz)\b/.test(value);
}

export function estimateWhatsAppTypingDelayMs(text?: string | null) {
  const length = String(text || "").trim().length;
  if (length <= 0) return 0;
  return Math.min(6500, Math.max(700, 420 + length * 14));
}

function resolveOutputModality(messages: WhatsAppAgentMessage[], latestMedia: WhatsAppMediaContext | null) {
  const latest = latestInbound(messages);
  const latestText = messageTextForModality(latest);
  if (latest?.message_type === "audio" && latestMedia?.kind === "audio" && (latestMedia.status === "processed" || latestMedia.text)) {
    return { modality: "audio" as const, policy: "mirror_audio" as const, reason: "last_inbound_audio_transcribed" };
  }
  if (wantsAudioReply(latestText)) {
    return { modality: "audio" as const, policy: "requested_audio" as const, reason: "user_requested_audio_reply" };
  }
  return { modality: "text" as const, policy: "text_default" as const, reason: "text_turn" };
}

export function resolveWhatsAppDeliveryPolicy(params: {
  actorContext?: MayusWhatsAppActorContext | null;
  outputModality: WhatsAppOutputModality;
  trigger?: string | null;
  replyText?: string | null;
}): WhatsAppDeliveryPolicy {
  const role = params.actorContext?.role || "unknown";
  const typingDelayMs = estimateWhatsAppTypingDelayMs(params.replyText);

  if (role === "office_operator") {
    return {
      profile: "office_operator_instant",
      humanizeDelivery: false,
      humanizeDeliveryMode: "none",
      typingDelayMs: 0,
      maxBlockingDelayMs: 0,
      replyBlockGapMs: 0,
      reason: "authorized_office_operator",
    };
  }

  if (params.outputModality === "audio") {
    return {
      profile: "external_audio",
      humanizeDelivery: false,
      humanizeDeliveryMode: "none",
      typingDelayMs: 0,
      maxBlockingDelayMs: 0,
      replyBlockGapMs: 0,
      reason: "audio_reply_has_generation_latency",
    };
  }

  const isWebhook = params.trigger === "evolution_webhook" || params.trigger === "webhook";
  if (role === "lead" || role === "external_client") {
    return {
      profile: "external_humanized",
      humanizeDelivery: true,
      humanizeDeliveryMode: isWebhook ? "bounded" : "blocking",
      typingDelayMs,
      maxBlockingDelayMs: isWebhook ? 1400 : null,
      replyBlockGapMs: isWebhook ? 350 : 700,
      reason: "external_contact_humanized_typing",
    };
  }

  return {
    profile: "unknown_light",
    humanizeDelivery: true,
    humanizeDeliveryMode: isWebhook ? "bounded" : "blocking",
    typingDelayMs,
    maxBlockingDelayMs: isWebhook ? 900 : 1800,
    replyBlockGapMs: isWebhook ? 250 : 500,
    reason: "unknown_contact_light_typing",
  };
}

export function buildWhatsAppAgentTurnV2(params: {
  messages: WhatsAppAgentMessage[];
  actorContext?: MayusWhatsAppActorContext | null;
  trigger?: string | null;
  replyText?: string | null;
}): WhatsAppAgentTurn {
  const mediaContexts = buildWhatsAppMediaContexts(params.messages);
  const latestMediaContext = mediaContexts.length ? mediaContexts[mediaContexts.length - 1] : null;
  const inputModalities = uniqueModalities(params.messages
    .filter((message) => message.direction === "inbound")
    .map((message) => normalizeMessageKind(message.message_type)));
  const output = resolveOutputModality(params.messages, latestMediaContext);
  const deliveryPolicy = resolveWhatsAppDeliveryPolicy({
    actorContext: params.actorContext,
    outputModality: output.modality,
    trigger: params.trigger,
    replyText: params.replyText,
  });

  return {
    agentVersion: "whatsapp_v2",
    inputModalities,
    mediaContexts,
    latestMediaContext,
    outputModality: output.modality,
    outputModalityPolicy: output.policy,
    outputModalityReason: output.reason,
    deliveryPolicy,
  };
}

export function buildWhatsAppTurnRuntimeContext(params: {
  messages: WhatsAppAgentMessage[];
  promptMessages?: WhatsAppAgentMessage[];
  contextPolicy?: MayusWhatsAppContextPolicy | null;
  processStatusContext?: WhatsAppProcessStatusContext | null;
  agentTurn?: WhatsAppAgentTurn | null;
}): WhatsAppTurnRuntimeContext {
  const rawMessages = params.messages || [];
  const promptMessages = params.promptMessages || rawMessages;
  const agentTurn = params.agentTurn || buildWhatsAppAgentTurnV2({ messages: promptMessages });
  const latest = latestInbound(rawMessages) || latestInbound(promptMessages);
  const inputModality = normalizeMessageKind(latest?.message_type);
  const rawLatestMedia = latest ? buildWhatsAppMediaContexts([latest])[0] || null : null;
  const latestMedia = rawLatestMedia
    || (agentTurn.latestMediaContext && agentTurn.latestMediaContext.kind === inputModality
      ? agentTurn.latestMediaContext
      : null);
  const inputText = truncatePreview(messageTextForModality(latest), 1400);
  const currentUserRequest = inputModality === "audio"
    ? truncatePreview(latestMedia?.text || latest?.media_text || latest?.content, 1400)
    : inputText;
  const contextPolicy = params.contextPolicy || null;
  const processStatus = params.processStatusContext || null;

  return {
    version: "whatsapp_turn_context_v1",
    input_text: inputText,
    input_modality: inputModality,
    transcription_status: inputModality === "audio" ? (latestMedia?.status || mediaStatus(latest || {})) : null,
    transcription_confidence: inputModality === "audio" ? (latestMedia?.confidence || null) : null,
    current_user_request: currentUserRequest,
    allowed_context: {
      scope: contextPolicy?.scope || null,
      reset_reason: contextPolicy?.reset_reason || null,
      continuation_reason: contextPolicy?.continuation_reason || null,
      allowed_previous_event: contextPolicy?.allowed_previous_event === true,
      allowed_process_candidates: contextPolicy?.allowed_process_candidates === true,
      prompt_message_count: promptMessages.length,
      raw_message_count: rawMessages.length,
    },
    target_process_reference: processStatus
      ? {
        verified: processStatus.verified === true,
        confidence: processStatus.confidence || null,
        access_scope: processStatus.accessScope || null,
        process_task_id: processStatus.processTaskId || null,
        process_number: processStatus.processNumber || null,
        client_name: processStatus.clientName || null,
        title: processStatus.title || null,
        current_stage: processStatus.currentStage || null,
        last_movement_at: processStatus.lastMovementAt || null,
        candidate_count: processStatus.candidateProcesses?.length || 0,
      }
      : null,
    conversation_filesystem_manifest: {
      version: "whatsapp_case_filesystem_v1",
      storage: "supabase_storage",
      item_count: rawMessages.length,
      items: rawMessages.slice(-20).map((message, index) => {
        const kind = normalizeMessageKind(message.message_type);
        const context = buildWhatsAppMediaContexts([message])[0] || null;
        return {
          index,
          direction: cleanText(message.direction) || null,
          kind,
          content_preview: truncatePreview(message.content),
          media_status: context?.status || cleanText(message.media_processing_status),
          media_intent: context?.intent || null,
          media_text_preview: truncatePreview(message.media_text),
          media_summary_preview: truncatePreview(message.media_summary),
          filename: cleanText(message.media_filename),
          mime_type: cleanText(message.media_mime_type),
        };
      }),
    },
  };
}
