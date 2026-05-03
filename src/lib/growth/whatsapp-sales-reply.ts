import {
  buildSalesConsultationPlan,
  type SalesConsultationInput,
  type SalesConsultationPlan,
} from "./sales-consultation";
import {
  buildCommercialFirstReply,
  buildCommercialPlaybookModel,
  resolveCommercialAttendantIdentity,
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
    attendantName?: string | null;
    attendantRole?: string | null;
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

function hasRecentPublicIntroduction(messages: WhatsAppSalesMessage[]) {
  return messages
    .slice(-8)
    .some((message) => (
      message.direction === "outbound"
      && /meu nome e|vou cuidar do seu atendimento|sou .*responsavel pelo seu atendimento/i.test(normalizeText(message.content))
    ));
}

function getLeadFirstName(value?: string | null) {
  return cleanText(value)?.split(/\s+/)[0] || "tudo bem";
}

function buildPublicOpening(input: WhatsAppSalesReplyInput, leadFirstName: string) {
  const identity = resolveCommercialAttendantIdentity({
    attendantName: input.salesProfile?.attendantName,
    attendantRole: input.salesProfile?.attendantRole,
  });

  return `Ola, ${leadFirstName}. Meu nome e ${identity.attendantName}, sou ${identity.attendantRole}. Vou cuidar do seu atendimento.`;
}

function withOptionalOpening(blocks: string[], input: WhatsAppSalesReplyInput, leadFirstName: string) {
  return [
    ...(hasRecentPublicIntroduction(input.messages) ? [] : [buildPublicOpening(input, leadFirstName)]),
    ...blocks,
  ].join("\n\n");
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
      attendantName: input.salesProfile?.attendantName,
      attendantRole: input.salesProfile?.attendantRole,
      idealClient: input.salesProfile?.idealClient,
      coreSolution: input.salesProfile?.coreSolution,
      uniqueValueProposition: input.salesProfile?.uniqueValueProposition,
      valuePillars: input.salesProfile?.valuePillars,
      positioningSummary: input.salesProfile?.positioningSummary,
    },
    suppressIntroduction: hasRecentPublicIntroduction(input.messages),
  });
  const blocks = firstReply.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return blocks.slice(0, 3).join("\n\n");
}

function buildSuggestedReply(plan: SalesConsultationPlan, lastInboundText: string | null, input: WhatsAppSalesReplyInput) {
  const leadFirstName = getLeadFirstName(plan.leadName);
  const normalized = normalizeText(lastInboundText);

  if (/reuni[aã]o|agenda|agendar|marcar|call|liga[cç][aã]o|me\s+liga|ligar|telefone|chamada/.test(normalized)) {
    return withOptionalOpening([
      `Perfeito, ${leadFirstName}. Vou te ajudar a avancar sem enrolacao.`,
      "Para marcar certo: esse atendimento e para diagnostico inicial, revisao de beneficio/contrato, suporte de caso em andamento ou fechamento de proposta?",
      "Se quiser, ja me envie tambem o melhor periodo hoje: manha, tarde ou noite.",
    ], input, leadFirstName);
  }

  if (/garantia|garantido|chance|ganhar|resultado|causa ganha|promete/.test(normalized)) {
    return withOptionalOpening([
      `Entendi, ${leadFirstName}. Eu nao vou te prometer resultado, porque isso seria irresponsavel.`,
      "O que eu consigo fazer agora e separar risco, documentos e caminho provavel para voce decidir com clareza.",
      "Me diga: voce ja tem decisao, negativa, contrato, cobranca ou documento principal do caso?",
    ], input, leadFirstName);
  }

  if (/urgente|liminar|audiencia|prazo|bloqueio|prisao|ameaca/.test(normalized)) {
    return withOptionalOpening([
      `Entendi a urgencia, ${leadFirstName}. Vamos priorizar o que pode mudar o risco agora.`,
      "Me responda em uma linha: qual e o prazo ou data critica, e qual documento/prova voce ja tem em maos?",
      "Com isso eu organizo o proximo passo e, se for caso de reuniao, encaminho para agenda sem perder contexto.",
    ], input, leadFirstName);
  }

  if (/caro|preco|valor|custa|custo|honorario|honorarios/.test(normalized)) {
    return withOptionalOpening([
      `Entendi, ${leadFirstName}. Consigo te ajudar com valor, mas primeiro preciso separar preco de risco para nao te orientar errado.`,
      "Me responde rapidinho: voce quer entender preco, forma de pagamento, seguranca do caminho ou prioridade de resolver isso agora?",
    ], input, leadFirstName);
  }

  if (/vou pensar|depois|mais tarde|sem tempo/.test(normalized)) {
    return withOptionalOpening([
      `Claro, ${leadFirstName}. Sem pressa artificial; so nao quero te deixar com uma duvida solta.`,
      "O que ainda falta para voce decidir: seguranca, valor, prazo, falar com outra pessoa ou entender se esse caminho serve para voce?",
    ], input, leadFirstName);
  }

  if (/humano|atendente|advogado|doutor|doutora|responsavel|falar com|conjuge|esposa|marido|socio|familia/.test(normalized)) {
    return withOptionalOpening([
      `Faz sentido, ${leadFirstName}. Eu vou organizar isso para a pessoa certa pegar o contexto sem voce repetir tudo.`,
      "Antes de eu encaminhar: o ponto principal e urgencia, documentos, valor, estrategia do caso ou falar com alguem especifico?",
    ], input, leadFirstName);
  }

  return buildDiscoveryReply(plan, leadFirstName, input);
}

function hasAutoSendBlockingRisk(flags: string[]) {
  return flags.some((flag) => flag === "human_requested");
}

export function buildWhatsAppSalesReply(input: WhatsAppSalesReplyInput): WhatsAppSalesReply {
  const lastInbound = getLastInbound(input.messages);
  const lastInboundText = cleanText(lastInbound?.content);
  const leadName = cleanText(input.contactName) || cleanText(input.phoneNumber) || "Lead WhatsApp";
  const profile = input.salesProfile || null;
  const playbook = buildCommercialPlaybookModel({
    firmName: profile?.firmName,
    attendantName: profile?.attendantName,
    attendantRole: profile?.attendantRole,
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
  const internalNote = requiresHumanReview
    ? handoffRecommended
      ? "Lead pediu atendimento humano. MAYUS preparou handoff com contexto para a equipe assumir."
      : "Resposta preparada para revisao humana antes de envio pelo WhatsApp."
    : plan.firmProfile.missingSignals.length > 0
      ? `Resposta inicial preparada pelo MAYUS com base na mensagem do lead. Depois refine o perfil do escritorio: ${plan.firmProfile.nextPositioningQuestion}`
      : "Resposta consultiva preparada para o atendimento WhatsApp.";

  return {
    mode: requiresHumanReview ? "human_review_required" : "suggested_reply",
    suggestedReply,
    internalNote,
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
