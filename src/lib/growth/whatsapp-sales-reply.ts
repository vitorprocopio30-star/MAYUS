import {
  buildSalesConsultationPlan,
  type SalesConsultationInput,
  type SalesConsultationPlan,
} from "./sales-consultation";

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

function buildConversationSummary(messages: WhatsAppSalesMessage[]) {
  return messages
    .slice(-12)
    .map((message) => `${message.direction === "inbound" ? "lead" : "atendente"}: ${cleanText(message.content) || `[${message.message_type || "mensagem"}]`}`)
    .join("\n");
}

function detectRiskFlags(lastInboundText: string | null, plan: SalesConsultationPlan) {
  const normalized = normalizeText(lastInboundText);
  const flags: string[] = [];

  if (/contrato|assin|proposta|honorario|honorarios|valor|preco|preço|custa|custo|pix|boleto|pagamento|cobranca|cobrança/.test(normalized)) {
    flags.push("commercial_commitment");
  }

  if (/garantia|garantido|chance|ganhar|resultado|causa ganha|promete/.test(normalized)) {
    flags.push("legal_result_risk");
  }

  if (/urgente|liminar|audiencia|audiência|prazo|bloqueio|prisao|prisão|ameaça|ameaca/.test(normalized)) {
    flags.push("legal_urgency");
  }

  if (plan.firmProfile.missingSignals.length > 0) {
    flags.push("missing_firm_profile");
  }

  if (plan.missingSignals.length >= 6) {
    flags.push("early_discovery");
  }

  return flags;
}

function buildDiscoveryReply(plan: SalesConsultationPlan, leadFirstName: string) {
  const question = plan.nextDiscoveryQuestion || plan.discoveryQuestions[1];
  return [
    `Oi, ${leadFirstName}. Antes de te indicar qualquer caminho, quero entender se isso realmente faz sentido para o seu caso.`,
    question,
  ].filter(Boolean).join("\n\n");
}

function buildSuggestedReply(plan: SalesConsultationPlan, lastInboundText: string | null) {
  const leadFirstName = plan.leadName.split(/\s+/)[0] || "tudo bem";
  const normalized = normalizeText(lastInboundText);

  if (/caro|preco|preço|valor|custa|custo|honorario|honorarios/.test(normalized)) {
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

  if (/conjuge|esposa|marido|socio|sócio|familia/.test(normalized)) {
    return [
      `Faz sentido, ${leadFirstName}. Para essa decisao ficar segura, e melhor envolver quem realmente participa dela.`,
      "Essa pessoa precisa decidir junto desde agora ou voce quer primeiro entender o caminho para depois explicar com clareza?",
    ].join("\n\n");
  }

  return buildDiscoveryReply(plan, leadFirstName);
}

export function buildWhatsAppSalesReply(input: WhatsAppSalesReplyInput): WhatsAppSalesReply {
  const lastInbound = getLastInbound(input.messages);
  const lastInboundText = cleanText(lastInbound?.content);
  const leadName = cleanText(input.contactName) || cleanText(input.phoneNumber) || "Lead WhatsApp";
  const profile = input.salesProfile || null;
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

  if (plan.firmProfile.missingSignals.length > 0) {
    return {
      mode: "internal_setup_required",
      suggestedReply: null,
      internalNote: `Antes de responder o lead, configure o perfil comercial: ${plan.firmProfile.nextPositioningQuestion}`,
      plan,
      riskFlags,
      mayAutoSend: false,
      requiresHumanReview: true,
      externalSideEffectsBlocked: true,
    };
  }

  const suggestedReply = buildSuggestedReply(plan, lastInboundText);
  const requiresHumanReview = riskFlags.some((flag) => flag !== "early_discovery");

  return {
    mode: requiresHumanReview ? "human_review_required" : "suggested_reply",
    suggestedReply,
    internalNote: requiresHumanReview
      ? "Resposta preparada para revisao humana antes de envio pelo WhatsApp."
      : "Resposta consultiva preparada para o atendimento WhatsApp.",
    plan,
    riskFlags,
    mayAutoSend: false,
    requiresHumanReview: true,
    externalSideEffectsBlocked: true,
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
    consultation_phase: reply.plan.phase,
    customer_profile: reply.plan.customerProfile,
    discovery_completeness: reply.plan.discoveryCompleteness,
    missing_signal_count: reply.plan.missingSignals.length,
    firm_positioning_completeness: reply.plan.firmProfile.positioningCompleteness,
    firm_profile_missing_signal_count: reply.plan.firmProfile.missingSignals.length,
    next_best_action: reply.plan.nextBestAction,
  };
}
