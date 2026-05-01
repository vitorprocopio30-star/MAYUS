import {
  buildSalesConsultationPlan,
  type SalesConsultationInput,
  type SalesConsultationPlan,
} from "./sales-consultation";
import {
  buildCommercialFirstReply,
  buildCommercialPlaybookModel,
} from "./commercial-playbook-template";

export type WhatsAppSalesMessage = {
  direction: "inbound" | "outbound" | string;
  content?: string | null;
  message_type?: string | null;
  created_at?: string | null;
};

export type WhatsAppSalesReplyInput = {
  contactName?: string | null;
  phoneNumber?: string | null;
  messages: WhatsAppSalesMessage[];
  salesProfile?: {
    firmName?: string | null;
    idealClient?: string | null;
    coreSolution?: string | null;
    uniqueValueProposition?: string | null;
    valuePillars?: string[] | null;
    positioningSummary?: string | null;
  } | null;
};

export type WhatsAppSalesReplyMode = "suggested_reply" | "internal_setup_required" | "human_review_required";

export type WhatsAppSalesReply = {
  mode: WhatsAppSalesReplyMode;
  suggestedReply: string | null;
  internalNote: string;
  plan: SalesConsultationPlan;
  riskFlags: string[];
  mayAutoSend: boolean;
  requiresHumanReview: boolean;
  externalSideEffectsBlocked: boolean;
  firstResponseSlaMinutes: number;
  handoffRecommended: boolean;
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

function getLastInbound(messages: WhatsAppSalesMessage[]) {
  return [...messages].reverse().find((message) => message.direction === "inbound" && cleanText(message.content)) || null;
}

function getLeadFirstName(value?: string | null) {
  return cleanText(value)?.split(/\s+/)[0] || "tudo bem";
}

function buildConversationSummary(messages: WhatsAppSalesMessage[]) {
  return messages
    .slice(-12)
    .map((message) => `${message.direction === "inbound" ? "lead" : "atendente"}: ${cleanText(message.content) || `[${message.message_type || "mensagem"}]`}`)
    .join("\n");
}

function detectRiskFlags(lastInboundText: string | null, plan: SalesConsultationPlan) {
  const normalized = normalizeText(lastInboundText);
  const flags: string[] = [];

  if (/contrato|assin|proposta|pix|boleto|pagamento|cobranca/.test(normalized)) {
    flags.push("commercial_commitment");
  }

  if (/valor|preco|custa|custo|honorario|honorarios|parcel/.test(normalized)) {
    flags.push("price_question");
  }

  if (/garantia|garantido|chance|ganhar|resultado|causa ganha|promete/.test(normalized)) {
    flags.push("legal_result_risk");
  }

  if (/urgente|liminar|audiencia|prazo|bloqueio|prisao|ameaca/.test(normalized)) {
    flags.push("legal_urgency");
  }

  if (/humano|atendente|advogado|doutor|doutora|responsavel|falar com/.test(normalized)) {
    flags.push("human_requested");
  }

  if (plan.firmProfile.missingSignals.length > 0) {
    flags.push("missing_firm_profile");
  }

  if (plan.missingSignals.length >= 6) {
    flags.push("early_discovery");
  }

  return flags;
}

function isPlaceholderMedia(content?: string | null) {
  return /^\[[^\]]+\]$/i.test(cleanText(content) || "");
}

function buildMediaAwareReply(plan: SalesConsultationPlan, lastInbound: WhatsAppSalesMessage | null) {
  const leadFirstName = getLeadFirstName(plan.leadName);
  const messageType = String(lastInbound?.message_type || "").toLowerCase();
  const content = cleanText(lastInbound?.content);

  if (messageType === "audio" && content && !isPlaceholderMedia(content)) {
    return [
      `Entendi o audio, ${leadFirstName}. Vou tratar isso como relato inicial do caso.`,
      "Para eu conduzir certo: qual e a urgencia agora e existe algum prazo ou documento que eu preciso considerar?",
    ].join("\n\n");
  }

  if (messageType === "audio") {
    return [
      `Recebi seu audio, ${leadFirstName}.`,
      "Para eu nao te responder no escuro, me mande em uma frase o ponto principal ou aguarde que eu encaminho o contexto para a equipe.",
    ].join("\n\n");
  }

  if (messageType === "image" && content && !isPlaceholderMedia(content)) {
    return [
      `Recebi a imagem e a legenda, ${leadFirstName}.`,
      "Me diga o que voce quer que eu observe nela: documento, prazo, valor, decisao ou prova do caso?",
    ].join("\n\n");
  }

  if (messageType === "image") {
    return [
      `Recebi a imagem, ${leadFirstName}.`,
      "Me diga em uma frase o que ela mostra e qual ajuda voce precisa agora.",
    ].join("\n\n");
  }

  return null;
}

function buildDiscoveryReply(plan: SalesConsultationPlan, leadFirstName: string, input: WhatsAppSalesReplyInput) {
  const mediaReply = buildMediaAwareReply(plan, getLastInbound(input.messages));
  if (mediaReply) return mediaReply;

  const firstReply = buildCommercialFirstReply({
    leadName: leadFirstName,
    lastInboundText: getLastInbound(input.messages)?.content,
    profile: {
      firmName: input.salesProfile?.firmName,
      idealClient: input.salesProfile?.idealClient,
      coreSolution: input.salesProfile?.coreSolution,
      uniqueValueProposition: input.salesProfile?.uniqueValueProposition,
      valuePillars: input.salesProfile?.valuePillars,
      positioningSummary: input.salesProfile?.positioningSummary,
    },
  });
  const blocks = firstReply.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return blocks.slice(0, 2).join("\n\n");
}

function buildSuggestedReply(plan: SalesConsultationPlan, lastInboundText: string | null, input: WhatsAppSalesReplyInput) {
  const leadFirstName = getLeadFirstName(plan.leadName);
  const normalized = normalizeText(lastInboundText);

  if (/caro|preco|valor|custa|custo|honorario|honorarios/.test(normalized)) {
    return [
      `Entendo, ${leadFirstName}. Quando voce fala em valor, quero separar bem as coisas para nao te responder de forma rasa.`,
      "Sua duvida principal e sobre preco, forma de pagamento, seguranca do caminho ou prioridade de resolver isso agora?",
    ].join("\n\n");
  }

  if (/vou pensar|depois|mais tarde|sem tempo/.test(normalized)) {
    return [
      `Claro, ${leadFirstName}. Antes de deixar isso em aberto, so quero entender uma coisa para nao te pressionar nem te abandonar no meio do caminho.`,
      "O que exatamente voce precisa pensar: seguranca, valor, prazo, decisao com outra pessoa ou se esse caminho serve para voce?",
    ].join("\n\n");
  }

  if (/humano|atendente|advogado|doutor|doutora|responsavel|falar com|conjuge|esposa|marido|socio|familia/.test(normalized)) {
    return [
      `Faz sentido, ${leadFirstName}. Eu vou organizar isso para a pessoa certa pegar o contexto sem voce repetir tudo.`,
      "Antes de eu encaminhar: o ponto principal e urgencia, documentos, valor, estrategia do caso ou falar com alguem especifico?",
    ].join("\n\n");
  }

  return buildDiscoveryReply(plan, leadFirstName, input);
}

function hasAutoSendBlockingRisk(flags: string[]) {
  return flags.some((flag) => (
    flag === "legal_result_risk"
    || flag === "legal_urgency"
    || flag === "commercial_commitment"
  ));
}

export function buildWhatsAppSalesReply(input: WhatsAppSalesReplyInput): WhatsAppSalesReply {
  const lastInbound = getLastInbound(input.messages);
  const lastInboundText = cleanText(lastInbound?.content);
  const leadName = cleanText(input.contactName) || cleanText(input.phoneNumber) || "Lead WhatsApp";
  const profile = input.salesProfile || null;
  const playbook = buildCommercialPlaybookModel({
    firmName: profile?.firmName,
    idealClient: profile?.idealClient,
    coreSolution: profile?.coreSolution,
    uniqueValueProposition: profile?.uniqueValueProposition,
    valuePillars: profile?.valuePillars,
    positioningSummary: profile?.positioningSummary,
  });
  const consultationInput: SalesConsultationInput = {
    leadName,
    channel: "WhatsApp",
    conversationSummary: buildConversationSummary(input.messages),
    conversationTurns: input.messages.slice(-12).map((message) => ({
      role: message.direction === "inbound" ? "user" : "assistant",
      content: cleanText(message.content) || `[${message.message_type || "mensagem"}]`,
    })),
    officeIdealClient: profile?.idealClient || null,
    officeSolution: profile?.coreSolution || null,
    officeUniqueValueProposition: profile?.uniqueValueProposition || null,
    officePillars: profile?.valuePillars || null,
    officePositioningSummary: profile?.positioningSummary || null,
  };
  const plan = buildSalesConsultationPlan(consultationInput);
  const riskFlags = detectRiskFlags(lastInboundText, plan);
  const suggestedReply = buildSuggestedReply(plan, lastInboundText, input);
  const blocksAutoSend = hasAutoSendBlockingRisk(riskFlags);
  const requiresHumanReview = blocksAutoSend;
  const mayAutoSend = Boolean(suggestedReply && !blocksAutoSend);
  const handoffRecommended = riskFlags.includes("human_requested");

  return {
    mode: requiresHumanReview ? "human_review_required" : "suggested_reply",
    suggestedReply,
    internalNote: requiresHumanReview
      ? "Resposta preparada para revisao humana antes de envio pelo WhatsApp."
      : plan.firmProfile.missingSignals.length > 0
        ? `Resposta inicial preparada pelo Front Desk MAYUS com playbook generico. Depois configure o escritorio: ${plan.firmProfile.nextPositioningQuestion}`
        : "Resposta consultiva preparada para o atendimento WhatsApp.",
    plan,
    riskFlags,
    mayAutoSend,
    requiresHumanReview,
    externalSideEffectsBlocked: !mayAutoSend,
    firstResponseSlaMinutes: playbook.firstResponseSlaMinutes,
    handoffRecommended,
  };
}

export function buildWhatsAppSalesReplyMetadata(reply: WhatsAppSalesReply) {
  return {
    mode: reply.mode,
    suggested_reply: reply.suggestedReply,
    internal_note: reply.internalNote,
    risk_flags: reply.riskFlags,
    may_auto_send: reply.mayAutoSend,
    requires_human_review: reply.requiresHumanReview,
    external_side_effects_blocked: reply.externalSideEffectsBlocked,
    first_response_sla_minutes: reply.firstResponseSlaMinutes,
    handoff_recommended: reply.handoffRecommended,
    consultation_phase: reply.plan.phase,
    customer_profile: reply.plan.customerProfile,
    discovery_completeness: reply.plan.discoveryCompleteness,
    missing_signal_count: reply.plan.missingSignals.length,
    firm_positioning_completeness: reply.plan.firmProfile.positioningCompleteness,
    firm_profile_missing_signal_count: reply.plan.firmProfile.missingSignals.length,
    next_best_action: reply.plan.nextBestAction,
  };
}
