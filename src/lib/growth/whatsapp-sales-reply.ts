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
  media_url?: string | null;
  media_filename?: string | null;
  media_mime_type?: string | null;
  media_text?: string | null;
  media_summary?: string | null;
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
  leadTopic: string;
  mayAutoSend: boolean;
  requiresHumanReview: boolean;
  externalSideEffectsBlocked: boolean;
  firstResponseSlaMinutes: number;
  handoffRecommended: boolean;
  repeatedOpenerBlocked: boolean;
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

function hasMayusIntroduced(messages: WhatsAppSalesMessage[]) {
  return messages.some((message) => {
    if (message.direction !== "outbound") return false;
    const normalized = normalizeText(message.content);
    return /aqui (e|sou) o mayus|sou o mayus|mayus, assistente/.test(normalized);
  });
}

function buildConversationSummary(messages: WhatsAppSalesMessage[]) {
  return messages
    .slice(-12)
    .map((message) => {
      const mediaContext = [message.media_summary, message.media_text].map((item) => cleanText(item)).filter(Boolean).join(" | ");
      const content = cleanText(message.content) || `[${message.message_type || "mensagem"}]`;
      return `${message.direction === "inbound" ? "lead" : "atendente"}: ${mediaContext ? `${content} | midia: ${mediaContext}` : content}`;
    })
    .join("\n");
}

function detectLeadTopic(lastInboundText: string | null) {
  const normalized = normalizeText(lastInboundText);

  if (/andamento|status|meu processo|numero do processo|cnj|movimentacao|processo/.test(normalized)) {
    return "process_status";
  }

  if (
    /contracheque|holerite|folha|margem consignavel|consignado|emprestimo consignado|rmc|rcc/.test(normalized)
    || (/desconto|descontando|descontaram|desconta/.test(normalized) && /salario|beneficio|inss|aposentadoria|contracheque|holerite|folha/.test(normalized))
  ) {
    return "payroll_discount";
  }

  if (/beneficio|aposentadoria|inss|bpc|loas|indeferido|negado|negativa/.test(normalized)) {
    return "benefit_or_inss";
  }

  if (/trabalhista|trabalho|rescisao|demissao|verbas|fgts|salario|patrao|empresa/.test(normalized)) {
    return "employment";
  }

  if (/familia|divorcio|pensao|guarda|alimentos|partilha|filho/.test(normalized)) {
    return "family";
  }

  if (/valor|preco|custa|custo|honorario|honorarios|parcel/.test(normalized)) {
    return "price_question";
  }

  if (/humano|atendente|advogado|doutor|doutora|responsavel|falar com/.test(normalized)) {
    return "human_request";
  }

  return "unknown";
}

function detectRiskFlags(lastInboundText: string | null, plan: SalesConsultationPlan) {
  const normalized = normalizeText(lastInboundText);
  const topic = detectLeadTopic(lastInboundText);
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

  if (topic === "process_status") {
    flags.push("case_status_unverified");
  }

  if (topic === "payroll_discount" || topic === "benefit_or_inss") {
    flags.push("legal_triage");
  }

  if (plan.firmProfile.missingSignals.length > 0) {
    flags.push("missing_firm_profile");
  }

  if (plan.missingSignals.length >= 6) {
    flags.push("early_discovery");
  }

  return flags;
}

function buildTopicSpecificReply(topic: string, leadFirstName: string) {
  if (topic === "payroll_discount") {
    return [
      `Entendi, ${leadFirstName}. Para eu te orientar sem chute: esse desconto aparece com qual nome no contracheque e comecou em que mes?`,
      "Se puder, envie um print so da parte do desconto.",
    ].join("\n\n");
  }

  if (topic === "benefit_or_inss") {
    return [
      `Entendi, ${leadFirstName}. Para eu te direcionar sem promessa: qual beneficio ou pedido foi negado e em que data saiu a decisao?`,
      "Se tiver o comunicado do INSS ou print do indeferimento, pode enviar aqui.",
    ].join("\n\n");
  }

  if (topic === "employment") {
    return [
      `Entendi, ${leadFirstName}. Para eu organizar isso certo: o problema e demissao, salario/verbas, FGTS, assedio ou outro ponto do trabalho?`,
      "Me diga tambem quando aconteceu, porque prazo pode mudar a prioridade.",
    ].join("\n\n");
  }

  if (topic === "family") {
    return [
      `Entendi, ${leadFirstName}. Tema de familia precisa de cuidado. O ponto principal e divorcio, pensao, guarda, alimentos ou partilha?`,
      "Me diga se existe alguma urgencia hoje para eu priorizar do jeito certo.",
    ].join("\n\n");
  }

  if (topic === "process_status") {
    return [
      `Entendi, ${leadFirstName}. Para eu nao te passar status errado, preciso localizar a base correta antes.`,
      "Me mande o CNJ, nome completo do cliente ou telefone cadastrado que eu organizo a verificacao com a equipe.",
    ].join("\n\n");
  }

  return null;
}

function buildDiscoveryReply(plan: SalesConsultationPlan, leadFirstName: string, input: WhatsAppSalesReplyInput) {
  const lastInboundText = getLastInbound(input.messages)?.content;
  const repeatedOpenerBlocked = hasMayusIntroduced(input.messages);
  const question = plan.nextDiscoveryQuestion || plan.discoveryQuestions[1];
  const firstReply = buildCommercialFirstReply({
    leadName: leadFirstName,
    lastInboundText,
    includeOpening: !repeatedOpenerBlocked,
    profile: {
      firmName: input.salesProfile?.firmName,
      idealClient: input.salesProfile?.idealClient,
      coreSolution: input.salesProfile?.coreSolution,
      uniqueValueProposition: input.salesProfile?.uniqueValueProposition,
      valuePillars: input.salesProfile?.valuePillars,
      positioningSummary: input.salesProfile?.positioningSummary,
    },
  });

  if (normalizeText(firstReply).includes(normalizeText(question))) {
    return firstReply;
  }

  return [firstReply, question].filter(Boolean).join("\n\n");
}

function buildSuggestedReply(plan: SalesConsultationPlan, lastInboundText: string | null, input: WhatsAppSalesReplyInput) {
  const leadFirstName = plan.leadName.split(/\s+/)[0] || "tudo bem";
  const normalized = normalizeText(lastInboundText);
  const topicReply = buildTopicSpecificReply(detectLeadTopic(lastInboundText), leadFirstName);

  if (topicReply) {
    return topicReply;
  }

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
    || flag === "case_status_unverified"
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
      content: [cleanText(message.content) || `[${message.message_type || "mensagem"}]`, message.media_summary, message.media_text]
        .map((item) => cleanText(item))
        .filter(Boolean)
        .join(" | "),
    })),
    officeIdealClient: profile?.idealClient || null,
    officeSolution: profile?.coreSolution || null,
    officeUniqueValueProposition: profile?.uniqueValueProposition || null,
    officePillars: profile?.valuePillars || null,
    officePositioningSummary: profile?.positioningSummary || null,
  };
  const plan = buildSalesConsultationPlan(consultationInput);
  const riskFlags = detectRiskFlags(lastInboundText, plan);
  const leadTopic = detectLeadTopic(lastInboundText);
  const repeatedOpenerBlocked = hasMayusIntroduced(input.messages);
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
        ? `Resposta segura preparada pelo MAYUS com fallback comercial. Depois refine o perfil do escritorio: ${plan.firmProfile.nextPositioningQuestion}`
        : "Resposta consultiva preparada para o atendimento WhatsApp.",
    plan,
    riskFlags,
    leadTopic,
    mayAutoSend,
    requiresHumanReview,
    externalSideEffectsBlocked: !mayAutoSend,
    firstResponseSlaMinutes: playbook.firstResponseSlaMinutes,
    handoffRecommended,
    repeatedOpenerBlocked,
  };
}

export function buildWhatsAppSalesReplyMetadata(reply: WhatsAppSalesReply) {
  return {
    mode: reply.mode,
    suggested_reply: reply.suggestedReply,
    internal_note: reply.internalNote,
    risk_flags: reply.riskFlags,
    lead_topic: reply.leadTopic,
    repeated_opener_blocked: reply.repeatedOpenerBlocked,
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
