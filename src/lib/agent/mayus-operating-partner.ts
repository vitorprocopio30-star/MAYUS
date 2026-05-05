import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHeaders, getLLMClient } from "@/lib/llm-router";
import type { SalesLlmTestbenchConfig } from "@/lib/growth/sales-llm-reply";
import type { WhatsAppSalesMessage } from "@/lib/growth/whatsapp-sales-reply";

export type MayusOperatingPartnerAutonomyMode = "draft_only" | "supervised" | "high_supervised";

export type MayusOperatingPartnerIntent =
  | "sales_qualification"
  | "sales_closing"
  | "client_support"
  | "process_status"
  | "legal_triage"
  | "billing"
  | "setup_help"
  | "unknown";

export type MayusOperatingPartnerActionType =
  | "ask_discovery_question"
  | "answer_support"
  | "create_crm_lead"
  | "update_crm_stage"
  | "create_task"
  | "add_internal_note"
  | "handoff_human"
  | "request_document"
  | "mark_ready_for_closing"
  | "recommend_handoff"
  | "prepare_proposal"
  | "none";

export type MayusOperatingPartnerAction = {
  type: MayusOperatingPartnerActionType;
  title: string;
  payload?: Record<string, unknown> | null;
  requires_approval?: boolean;
};

export type MayusOperatingPartnerConfig = {
  enabled: boolean;
  autonomy_mode: MayusOperatingPartnerAutonomyMode;
  confidence_thresholds: {
    auto_send: number;
    auto_execute: number;
    approval: number;
  };
  active_modules: {
    setup: boolean;
    sales: boolean;
    client_support: boolean;
    legal_triage: boolean;
    crm: boolean;
    tasks: boolean;
  };
};

export type MayusConversationStage =
  | "new"
  | "discovery"
  | "qualification"
  | "value_building"
  | "objection"
  | "closing"
  | "client_support"
  | "handoff";

export type MayusConversationState = {
  stage: MayusConversationStage;
  facts_known: string[];
  missing_information: string[];
  objections: string[];
  urgency: "none" | "low" | "medium" | "high";
  decision_maker: "unknown" | "lead" | "shared";
  documents_requested: string[];
  last_customer_message: string | null;
  last_mayus_message: string | null;
  next_action: string;
  has_mayus_introduced: boolean;
  conversation_summary: string;
};

export type MayusClosingReadiness = {
  score: number;
  status: "not_ready" | "warming" | "ready_for_human_close" | "blocked";
  reasons: string[];
};

export type MayusSupportSummary = {
  is_existing_client: boolean;
  issue_type: "process_status" | "documents" | "billing" | "support" | "none";
  verified_case_reference: boolean;
  summary: string;
};

export type MayusOperatingPartnerCrmContext = {
  crm_task_id?: string | null;
  title?: string | null;
  description?: string | null;
  stage_id?: string | null;
  stage_name?: string | null;
  tags?: string[] | null;
  source?: string | null;
  lead_scoring?: number | null;
  value?: number | null;
  last_movement_at?: string | null;
};

export type MayusOfficeKnowledgeProfile = {
  officeName?: string | null;
  practiceAreas?: string[] | null;
  triageRules?: string[] | null;
  humanHandoffRules?: string[] | null;
  communicationTone?: string | null;
  requiredDocumentsByCase?: string[] | null;
  forbiddenClaims?: string[] | null;
  pricingPolicy?: string | null;
  responseSla?: string | null;
  departments?: string[] | null;
};

export type MayusPreviousConversationEvent = {
  created_at?: string | null;
  reply_source?: string | null;
  conversation_state?: Partial<MayusConversationState> | null;
  closing_readiness?: Partial<MayusClosingReadiness> | null;
  next_action?: string | null;
  intent?: string | null;
};

export type MayusOperatingPartnerDecision = {
  reply: string;
  intent: MayusOperatingPartnerIntent;
  confidence: number;
  risk_flags: string[];
  next_action: string;
  conversation_state: MayusConversationState;
  closing_readiness: MayusClosingReadiness;
  support_summary: MayusSupportSummary;
  reasoning_summary_for_team: string;
  actions_to_execute: MayusOperatingPartnerAction[];
  requires_approval: boolean;
  should_auto_send: boolean;
  model_used: string;
  provider: string;
  expected_outcome: string;
};

export type MayusOperatingPartnerInput = {
  supabase: SupabaseClient;
  tenantId: string;
  channel: "whatsapp" | "chat" | "setup";
  contactName?: string | null;
  phoneNumber?: string | null;
  messages: WhatsAppSalesMessage[];
  salesProfile?: {
    idealClient?: string | null;
    coreSolution?: string | null;
    uniqueValueProposition?: string | null;
    valuePillars?: string[] | null;
    positioningSummary?: string | null;
    salesPlaybookContext?: string | null;
    salesDocumentSummary?: string | null;
    salesRules?: string[] | null;
    qualificationQuestions?: string[] | null;
    offerPositioning?: string | null;
    forbiddenClaims?: string[] | null;
  } | null;
  officeKnowledgeProfile?: MayusOfficeKnowledgeProfile | null;
  crmContext?: MayusOperatingPartnerCrmContext | null;
  previousMayusEvent?: MayusPreviousConversationEvent | null;
  operatingPartner?: Partial<MayusOperatingPartnerConfig> | null;
  salesTestbench?: Partial<SalesLlmTestbenchConfig> | null;
  fetcher?: typeof fetch;
};

const HIGH_RISK_FLAGS = [
  "case_status_unverified",
  "legal_result_risk",
  "legal_urgency",
  "billing_or_contract",
  "closing_requires_human",
  "sensitive_legal_advice",
  "low_confidence",
  "out_of_scope",
];

export const DEFAULT_MAYUS_OPERATING_PARTNER: MayusOperatingPartnerConfig = {
  enabled: true,
  autonomy_mode: "high_supervised",
  confidence_thresholds: {
    auto_send: 0.78,
    auto_execute: 0.82,
    approval: 0.65,
  },
  active_modules: {
    setup: true,
    sales: true,
    client_support: true,
    legal_triage: true,
    crm: true,
    tasks: true,
  },
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

function clamp01(value: unknown, fallback = 0.5) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
}

function uniqueStrings(values: unknown) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((item) => cleanText(String(item))).filter(Boolean))) as string[];
}

function messageTextWithMedia(message: WhatsAppSalesMessage) {
  const content = cleanText(message.content) || `[${message.message_type || "mensagem"}]`;
  const mediaContext = [message.media_summary, message.media_text]
    .map((item) => cleanText(item))
    .filter(Boolean)
    .join(" | ");

  return mediaContext ? `${content} | midia: ${mediaContext}` : content;
}

function normalizeModules(value: unknown) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    ...DEFAULT_MAYUS_OPERATING_PARTNER.active_modules,
    setup: raw.setup !== false,
    sales: raw.sales !== false,
    client_support: raw.client_support !== false,
    legal_triage: raw.legal_triage !== false,
    crm: raw.crm !== false,
    tasks: raw.tasks !== false,
  };
}

export function normalizeMayusOperatingPartnerConfig(config?: Partial<MayusOperatingPartnerConfig> | null): MayusOperatingPartnerConfig {
  const thresholds = config?.confidence_thresholds && typeof config.confidence_thresholds === "object"
    ? config.confidence_thresholds as Partial<MayusOperatingPartnerConfig["confidence_thresholds"]>
    : {};
  const autonomy = config?.autonomy_mode === "draft_only" || config?.autonomy_mode === "supervised"
    ? config.autonomy_mode
    : "high_supervised";

  return {
    enabled: config?.enabled !== false,
    autonomy_mode: autonomy,
    confidence_thresholds: {
      auto_send: clamp01(thresholds.auto_send, DEFAULT_MAYUS_OPERATING_PARTNER.confidence_thresholds.auto_send),
      auto_execute: clamp01(thresholds.auto_execute, DEFAULT_MAYUS_OPERATING_PARTNER.confidence_thresholds.auto_execute),
      approval: clamp01(thresholds.approval, DEFAULT_MAYUS_OPERATING_PARTNER.confidence_thresholds.approval),
    },
    active_modules: normalizeModules(config?.active_modules),
  };
}

function summarizeMessages(messages: WhatsAppSalesMessage[]) {
  return messages
    .slice(-16)
    .map((message) => `${message.direction === "inbound" ? "cliente" : "mayus"}: ${messageTextWithMedia(message)}`)
    .join("\n");
}

function getLastInbound(messages: WhatsAppSalesMessage[]) {
  return [...messages].reverse().find((message) => message.direction === "inbound" && cleanText(message.content)) || null;
}

function getLastOutbound(messages: WhatsAppSalesMessage[]) {
  return [...messages].reverse().find((message) => message.direction === "outbound" && cleanText(message.content)) || null;
}

function hasMayusIntroduced(messages: WhatsAppSalesMessage[]) {
  return messages.some((message) => {
    if (message.direction !== "outbound") return false;
    const normalized = normalizeText(message.content);
    return /aqui (e|sou) o mayus|sou o mayus|mayus, assistente/.test(normalized);
  });
}

function buildMessageDigest(messages: WhatsAppSalesMessage[]) {
  const inbound = messages.filter((message) => message.direction === "inbound").map((message) => cleanText(messageTextWithMedia(message))).filter(Boolean) as string[];
  const lastInboundMessage = getLastInbound(messages);
  const lastOutboundMessage = getLastOutbound(messages);
  const lastInbound = lastInboundMessage ? cleanText(messageTextWithMedia(lastInboundMessage)) : null;
  const lastOutbound = lastOutboundMessage ? cleanText(messageTextWithMedia(lastOutboundMessage)) : null;

  return {
    inbound,
    lastInbound,
    lastOutbound,
    normalized: normalizeText(inbound.join(" ")),
  };
}

function inferConversationState(input: MayusOperatingPartnerInput, deterministicIntent: MayusOperatingPartnerIntent): MayusConversationState {
  const digest = buildMessageDigest(input.messages);
  const previous = input.previousMayusEvent?.conversation_state || {};
  const facts = new Set<string>();
  const missing = new Set<string>();
  const objections = new Set<string>();
  const documents = new Set<string>();
  const text = digest.normalized;
  const hasCrm = Boolean(input.crmContext?.crm_task_id);
  const hasIntroduced = hasMayusIntroduced(input.messages) || previous.has_mayus_introduced === true;

  if (digest.lastInbound) facts.add(`ultima mensagem do cliente: ${digest.lastInbound}`);
  if (hasCrm) facts.add(`lead/cliente localizado no CRM: ${input.crmContext?.title || input.crmContext?.crm_task_id}`);
  if (/contracheque|holerite|folha/.test(text)) facts.add("assunto envolve desconto em contracheque/folha");
  if (/beneficio|inss|aposentadoria|bpc|loas/.test(text)) facts.add("assunto envolve beneficio/INSS");
  if (/negado|indeferido|nao aprovado/.test(text)) facts.add("cliente citou negativa/indeferimento");
  if (/quero fechar|contratar|fechar|assinar|vamos seguir|gostei/.test(text)) facts.add("cliente sinalizou vontade de avancar");
  if (/caro|preco|valor|honorario|honorarios/.test(text)) objections.add("valor/preco");
  if (/vou pensar|depois|mais tarde|sem tempo/.test(text)) objections.add("tempo/adiamento");
  if (/conjuge|esposa|marido|socio|familia|familia/.test(text)) objections.add("decisor compartilhado");

  if (/contracheque|holerite|folha|desconto|consignado/.test(text)) {
    documents.add("print do trecho do desconto");
    missing.add("nome exato do desconto");
    missing.add("mes em que o desconto comecou");
  }
  if (/beneficio|inss|aposentadoria|indeferido|negado/.test(text)) {
    documents.add("comunicado ou print do INSS");
    missing.add("data da decisao/indeferimento");
  }
  if (!/urgente|urgencia|prazo|hoje|amanha|audiencia|bloqueio|liminar/.test(text)) missing.add("urgencia ou prazo");
  if (!/conjuge|esposa|marido|socio|familia|decido sozinho|decido sozinha/.test(text)) missing.add("quem participa da decisao");

  const urgency: MayusConversationState["urgency"] = /prazo fatal|audiencia|bloqueio|prisao|liminar|hoje/.test(text)
    ? "high"
    : /urgente|urgencia|amanha|prazo/.test(text)
      ? "medium"
      : "none";
  const decisionMaker: MayusConversationState["decision_maker"] = /conjuge|esposa|marido|socio|familia/.test(text)
    ? "shared"
    : /decido sozinho|decido sozinha|sou eu que decido/.test(text)
      ? "lead"
      : "unknown";

  let stage: MayusConversationStage = "discovery";
  if (digest.inbound.length <= 1 && !hasCrm) stage = "new";
  if (facts.size >= 3 || hasCrm) stage = "qualification";
  if (/caro|preco|valor|vou pensar|depois|sem tempo/.test(text)) stage = "objection";
  if (/quero fechar|contratar|fechar|assinar|vamos seguir|pagar entrada/.test(text)) stage = "closing";
  if (deterministicIntent === "client_support" || (/ja sou cliente|meu atendimento|meu caso|suporte/.test(text) && hasCrm)) stage = "client_support";
  if (deterministicIntent === "process_status") stage = "handoff";
  if (previous.stage && stage === "discovery") stage = previous.stage as MayusConversationStage;

  const nextAction = stage === "closing"
    ? "organizar fechamento humano com resumo do contexto"
    : stage === "objection"
      ? "isolar a objecao real antes de rebater"
      : stage === "client_support" || stage === "handoff"
        ? "organizar suporte seguro com identificador minimo"
        : "fazer a proxima pergunta de qualificacao";

  return {
    stage,
    facts_known: Array.from(facts).slice(0, 8),
    missing_information: Array.from(missing).slice(0, 6),
    objections: Array.from(objections).slice(0, 4),
    urgency,
    decision_maker: decisionMaker,
    documents_requested: Array.from(documents).slice(0, 5),
    last_customer_message: digest.lastInbound,
    last_mayus_message: digest.lastOutbound,
    next_action: cleanText(input.previousMayusEvent?.next_action) || nextAction,
    has_mayus_introduced: hasIntroduced,
    conversation_summary: summarizeMessages(input.messages).slice(0, 1200),
  };
}

function inferClosingReadiness(state: MayusConversationState, deterministicIntent: MayusOperatingPartnerIntent): MayusClosingReadiness {
  const reasons: string[] = [];
  let score = 0;

  if (state.facts_known.length > 0) {
    score += 25;
    reasons.push("ha contexto declarado pelo cliente");
  }
  if (state.urgency !== "none") {
    score += 15;
    reasons.push("urgencia/prazo presente");
  }
  if (state.decision_maker !== "unknown") {
    score += 15;
    reasons.push("decisor identificado");
  }
  if (state.objections.length > 0) {
    score += 10;
    reasons.push("objecao verbalizada");
  }
  if (state.stage === "closing" || deterministicIntent === "sales_closing") {
    score += 35;
    reasons.push("cliente sinalizou avanco/fechamento");
  }
  if (state.stage === "handoff" || deterministicIntent === "process_status") {
    return { score: Math.min(score, 35), status: "blocked", reasons: ["pedido exige suporte humano/base confirmada"] };
  }

  const status: MayusClosingReadiness["status"] = score >= 75
    ? "ready_for_human_close"
    : score >= 45
      ? "warming"
      : "not_ready";

  return { score: Math.min(100, score), status, reasons };
}

function inferSupportSummary(input: MayusOperatingPartnerInput, state: MayusConversationState, deterministicIntent: MayusOperatingPartnerIntent): MayusSupportSummary {
  const text = normalizeText(state.conversation_summary);
  const issueType: MayusSupportSummary["issue_type"] = deterministicIntent === "process_status"
    ? "process_status"
    : /documento|print|anexo|enviei/.test(text)
      ? "documents"
      : /boleto|pagamento|cobranca|contrato|honorario/.test(text)
        ? "billing"
        : state.stage === "client_support" || state.stage === "handoff"
          ? "support"
          : "none";

  return {
    is_existing_client: Boolean(input.crmContext?.crm_task_id) || /ja sou cliente|meu caso|meu processo|meu atendimento/.test(text),
    issue_type: issueType,
    verified_case_reference: /cnj|processo|numero do processo/.test(text) && Boolean(input.crmContext?.crm_task_id),
    summary: issueType === "none"
      ? "Conversa ainda em contexto comercial/qualificacao."
      : `Suporte identificado: ${issueType}. Validar base antes de informar dado sensivel.`,
  };
}

function detectDeterministicIntentAndRisk(messages: WhatsAppSalesMessage[]) {
  const lastInbound = normalizeText(getLastInbound(messages)?.content);
  const riskFlags: string[] = [];
  let intent: MayusOperatingPartnerIntent = "unknown";

  if (/andamento|status|meu processo|numero do processo|cnj|movimentacao|movimentacao/.test(lastInbound)) {
    intent = "process_status";
    riskFlags.push("case_status_unverified");
  } else if (/contracheque|desconto|beneficio|aposentadoria|inss|negado|indeferido|consignado|bpc|loas/.test(lastInbound)) {
    intent = "legal_triage";
  } else if (/preco|valor|caro|honorario|boleto|pix|pagamento|contrato|entrada|cobranca/.test(lastInbound)) {
    intent = "billing";
    riskFlags.push("billing_or_contract");
  } else if (/quero fechar|contratar|fechar|assinar|vamos seguir|gostei/.test(lastInbound)) {
    intent = "sales_closing";
    riskFlags.push("closing_requires_human");
  } else if (/ja sou cliente|meu atendimento|meu caso|suporte|falar com suporte/.test(lastInbound)) {
    intent = "client_support";
  } else if (/oi|ola|preciso|atendem|consulta|advogado|duvida|problema|ajuda/.test(lastInbound)) {
    intent = "sales_qualification";
  }

  if (/garantia|garantido|causa ganha|ganhar|promete|chance de ganhar/.test(lastInbound)) riskFlags.push("legal_result_risk");
  if (/urgente|liminar|audiencia|bloqueio|prisao|despejo|prazo fatal|hoje/.test(lastInbound)) riskFlags.push("legal_urgency");
  if (/o que devo fazer juridicamente|posso processar|qual tese|qual recurso|me oriente juridicamente/.test(lastInbound)) riskFlags.push("sensitive_legal_advice");

  return { intent, riskFlags };
}

function chooseModel(input: MayusOperatingPartnerInput) {
  const defaultModel = cleanText(input.salesTestbench?.default_model);
  return defaultModel || "deepseek/deepseek-v4-pro";
}

function buildPrompt(input: MayusOperatingPartnerInput, config: MayusOperatingPartnerConfig, model: string, deterministicIntent: MayusOperatingPartnerIntent, state: MayusConversationState, closingReadiness: MayusClosingReadiness, supportSummary: MayusSupportSummary) {
  const profile = input.salesProfile || {};
  const officeProfile = input.officeKnowledgeProfile || {};
  const pillars = Array.isArray(profile.valuePillars) ? profile.valuePillars.filter(Boolean).join(", ") : "";
  const salesRules = Array.isArray(profile.salesRules) ? profile.salesRules.filter(Boolean).join("; ") : "";
  const qualificationQuestions = Array.isArray(profile.qualificationQuestions) ? profile.qualificationQuestions.filter(Boolean).join("; ") : "";
  const forbiddenClaims = Array.isArray(profile.forbiddenClaims) ? profile.forbiddenClaims.filter(Boolean).join("; ") : "";
  const officePracticeAreas = Array.isArray(officeProfile.practiceAreas) ? officeProfile.practiceAreas.filter(Boolean).join(", ") : "";
  const officeTriageRules = Array.isArray(officeProfile.triageRules) ? officeProfile.triageRules.filter(Boolean).join("; ") : "";
  const officeHandoffRules = Array.isArray(officeProfile.humanHandoffRules) ? officeProfile.humanHandoffRules.filter(Boolean).join("; ") : "";
  const officeDocuments = Array.isArray(officeProfile.requiredDocumentsByCase) ? officeProfile.requiredDocumentsByCase.filter(Boolean).join("; ") : "";
  const officeForbiddenClaims = Array.isArray(officeProfile.forbiddenClaims) ? officeProfile.forbiddenClaims.filter(Boolean).join("; ") : "";
  const officeDepartments = Array.isArray(officeProfile.departments) ? officeProfile.departments.filter(Boolean).join(", ") : "";

  return [
    "Voce e o MAYUS, socio virtual operacional de um escritorio de advocacia brasileiro.",
    "Sua funcao e conduzir a conversa inteira: vender, qualificar, dar suporte, organizar proximos passos e acionar humano quando houver risco.",
    "Nao aja como chatbot aleatorio. Use o historico, nao presuma que o cliente pediu status de processo se ele nao pediu.",
    "Nunca invente andamento de processo, valor, contrato, cobranca, prazo, documento ou promessa juridica.",
    "Se o cliente pedir status de processo sem base confirmada, diga que vai tratar com seguranca e peca identificador minimo ou escale.",
    "Se for venda, conduza com DEF: descubra dor, qualifique, encante com diagnostico e so feche quando houver sinais suficientes.",
    "Se o cliente estiver pronto para fechar, organize o fechamento humano/comercial; nao envie contrato, preco fechado, cobranca ou promessa juridica sozinho.",
    "Se for suporte, responda curto e util, com a proxima acao concreta.",
    "Se faltar configuracao do escritorio para decidir a conversa, nao invente. Faca uma pergunta curta de alinhamento operacional ao dono/equipe no reasoning_summary_for_team e responda o cliente com seguranca sem prometer.",
    "O objetivo nao e responder generico: conduza a conversa usando o produto, a solucao, o playbook, o estado e o documento do cliente.",
    "Use no maximo 2 blocos curtos. Nao mande discurso institucional nem explique a metodologia.",
    "Nunca repita apresentacao se o estado indicar que o MAYUS ja se apresentou.",
    "Reconheca o assunto especifico do cliente antes de perguntar. Se ele falou contracheque, desconto, consignado, folha, beneficio ou INSS, trate como triagem juridica/suporte qualificado.",
    "Para desconto em contracheque/beneficio, nao diga se a pessoa tem direito. Pergunte o nome do desconto, quando comecou, se houve autorizacao/emprestimo e peca print apenas do trecho do desconto.",
    "Responda em portugues do Brasil, natural para WhatsApp, em no maximo 2 blocos curtos e uma pergunta por vez.",
    "Avalie comportamento, nao frase exata: seja simpatico, especifique o assunto e conduza a proxima jogada.",
    "",
    `Canal: ${input.channel}`,
    `Modelo: ${model}`,
    `Autonomia MAYUS: ${config.autonomy_mode}`,
    `Intencao deterministica inicial: ${deterministicIntent}`,
    `Lead/cliente: ${cleanText(input.contactName) || cleanText(input.phoneNumber) || "Contato WhatsApp"}`,
    `Cliente ideal: ${cleanText(profile.idealClient) || "nao configurado"}`,
    `Solucao central: ${cleanText(profile.coreSolution) || "nao configurada"}`,
    `PUV: ${cleanText(profile.uniqueValueProposition) || "nao configurada"}`,
    `Pilares: ${pillars || "nao configurados"}`,
    `Posicionamento: ${cleanText(profile.positioningSummary) || "nao configurado"}`,
    `Documento/playbook de vendas: ${cleanText(profile.salesPlaybookContext)?.slice(0, 2200) || "nao configurado"}`,
    `Resumo do documento de vendas: ${cleanText(profile.salesDocumentSummary)?.slice(0, 900) || "nao configurado"}`,
    `Posicionamento/oferta do playbook: ${cleanText(profile.offerPositioning)?.slice(0, 700) || "nao configurado"}`,
    `Regras comerciais do playbook: ${salesRules || "nao configuradas"}`,
    `Perguntas de qualificacao do playbook: ${qualificationQuestions || "nao configuradas"}`,
    `Claims/promessas proibidas: ${forbiddenClaims || "nao configurados"}`,
    "",
    "Perfil operacional do escritorio:",
    `Nome do escritorio: ${cleanText(officeProfile.officeName) || "nao configurado"}`,
    `Areas atendidas: ${officePracticeAreas || "nao configuradas"}`,
    `Regras de triagem: ${officeTriageRules || "nao configuradas"}`,
    `Quando escalar humano: ${officeHandoffRules || "nao configurado"}`,
    `Tom de comunicacao: ${cleanText(officeProfile.communicationTone) || "nao configurado"}`,
    `Documentos por tipo de caso: ${officeDocuments || "nao configurados"}`,
    `Promessas proibidas do escritorio: ${officeForbiddenClaims || "nao configuradas"}`,
    `Politica de preco/cobranca: ${cleanText(officeProfile.pricingPolicy) || "nao configurada"}`,
    `SLA de resposta: ${cleanText(officeProfile.responseSla) || "nao configurado"}`,
    `Departamentos/responsaveis: ${officeDepartments || "nao configurados"}`,
    "",
    "Estado conversacional MAYUS reconstruido:",
    JSON.stringify(state),
    "",
    "Prontidao de fechamento:",
    JSON.stringify(closingReadiness),
    "",
    "Resumo de suporte:",
    JSON.stringify(supportSummary),
    "",
    "Contexto CRM do contato:",
    JSON.stringify(input.crmContext || null),
    "",
    "Ultimo evento MAYUS para este contato:",
    JSON.stringify(input.previousMayusEvent || null),
    "",
    "Historico recente:",
    summarizeMessages(input.messages) || "Sem historico.",
    "",
    "Retorne somente JSON valido:",
    JSON.stringify({
      reply: "mensagem curta para WhatsApp",
      intent: "sales_qualification",
      confidence: 0.86,
      risk_flags: [],
      next_action: "qualificar dor",
      conversation_state: {
        stage: "discovery",
        facts_known: ["assunto declarado pelo cliente"],
        missing_information: ["urgencia", "decisor"],
        objections: [],
        urgency: "none",
        decision_maker: "unknown",
        documents_requested: [],
        last_customer_message: "ultima mensagem do cliente",
        last_mayus_message: "ultima mensagem do MAYUS ou null",
        next_action: "fazer uma pergunta estrategica",
        has_mayus_introduced: true,
        conversation_summary: "resumo curto do que ja aconteceu",
      },
      closing_readiness: { score: 30, status: "not_ready", reasons: ["descoberta incompleta"] },
      support_summary: { is_existing_client: false, issue_type: "none", verified_case_reference: false, summary: "sem demanda de suporte" },
      reasoning_summary_for_team: "por que esta resposta e a proxima melhor jogada",
      actions_to_execute: [
        { type: "create_crm_lead", title: "Registrar lead no CRM", payload: { reason: "lead qualificado pelo WhatsApp" }, requires_approval: false },
      ],
      requires_approval: false,
      should_auto_send: true,
      expected_outcome: "cliente responde com contexto suficiente para proximo passo",
    }),
  ].join("\n");
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Resposta do MAYUS nao trouxe JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}

function normalizeIntent(value: unknown, fallback: MayusOperatingPartnerIntent): MayusOperatingPartnerIntent {
  const text = normalizeText(String(value || ""));
  if ([
    "sales_qualification",
    "sales_closing",
    "client_support",
    "process_status",
    "legal_triage",
    "billing",
    "setup_help",
    "unknown",
  ].includes(text)) {
    return text as MayusOperatingPartnerIntent;
  }
  return fallback;
}

function normalizeActions(values: unknown): MayusOperatingPartnerAction[] {
  if (!Array.isArray(values)) return [];
  return values.slice(0, 4).map((item) => {
    const raw = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const type = normalizeText(String(raw.type || ""));
    const normalizedType = [
      "ask_discovery_question",
      "answer_support",
      "create_crm_lead",
      "update_crm_stage",
      "create_task",
      "add_internal_note",
      "handoff_human",
      "request_document",
      "mark_ready_for_closing",
      "recommend_handoff",
      "prepare_proposal",
      "none",
    ].includes(type) ? type as MayusOperatingPartnerActionType : "add_internal_note";

    return {
      type: normalizedType,
      title: cleanText(String(raw.title || "")) || "Acao operacional MAYUS",
      payload: raw.payload && typeof raw.payload === "object" && !Array.isArray(raw.payload) ? raw.payload as Record<string, unknown> : null,
      requires_approval: raw.requires_approval === true,
    };
  });
}

function normalizeConversationStage(value: unknown, fallback: MayusConversationStage): MayusConversationStage {
  const text = normalizeText(String(value || ""));
  if (["new", "discovery", "qualification", "value_building", "objection", "closing", "client_support", "handoff"].includes(text)) {
    return text as MayusConversationStage;
  }
  return fallback;
}

function normalizeUrgency(value: unknown, fallback: MayusConversationState["urgency"]): MayusConversationState["urgency"] {
  const text = normalizeText(String(value || ""));
  if (["none", "low", "medium", "high"].includes(text)) return text as MayusConversationState["urgency"];
  return fallback;
}

function normalizeDecisionMaker(value: unknown, fallback: MayusConversationState["decision_maker"]): MayusConversationState["decision_maker"] {
  const text = normalizeText(String(value || ""));
  if (["unknown", "lead", "shared"].includes(text)) return text as MayusConversationState["decision_maker"];
  return fallback;
}

function normalizeConversationState(value: unknown, fallback: MayusConversationState): MayusConversationState {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    stage: normalizeConversationStage(raw.stage, fallback.stage),
    facts_known: uniqueStrings(raw.facts_known).length ? uniqueStrings(raw.facts_known).slice(0, 10) : fallback.facts_known,
    missing_information: uniqueStrings(raw.missing_information).length ? uniqueStrings(raw.missing_information).slice(0, 10) : fallback.missing_information,
    objections: uniqueStrings(raw.objections).length ? uniqueStrings(raw.objections).slice(0, 6) : fallback.objections,
    urgency: normalizeUrgency(raw.urgency, fallback.urgency),
    decision_maker: normalizeDecisionMaker(raw.decision_maker, fallback.decision_maker),
    documents_requested: uniqueStrings(raw.documents_requested).length ? uniqueStrings(raw.documents_requested).slice(0, 8) : fallback.documents_requested,
    last_customer_message: cleanText(String(raw.last_customer_message || "")) || fallback.last_customer_message,
    last_mayus_message: cleanText(String(raw.last_mayus_message || "")) || fallback.last_mayus_message,
    next_action: cleanText(String(raw.next_action || "")) || fallback.next_action,
    has_mayus_introduced: raw.has_mayus_introduced === true || fallback.has_mayus_introduced,
    conversation_summary: cleanText(String(raw.conversation_summary || ""))?.slice(0, 1200) || fallback.conversation_summary,
  };
}

function normalizeClosingReadiness(value: unknown, fallback: MayusClosingReadiness): MayusClosingReadiness {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const status = normalizeText(String(raw.status || ""));
  const normalizedStatus = ["not_ready", "warming", "ready_for_human_close", "blocked"].includes(status)
    ? status as MayusClosingReadiness["status"]
    : fallback.status;
  const rawScore = typeof raw.score === "number" ? raw.score : Number(raw.score);
  const score = Number.isFinite(rawScore)
    ? Math.max(0, Math.min(100, rawScore <= 1 ? rawScore * 100 : rawScore))
    : fallback.score;
  return {
    score: Math.round(score),
    status: normalizedStatus,
    reasons: uniqueStrings(raw.reasons).length ? uniqueStrings(raw.reasons).slice(0, 8) : fallback.reasons,
  };
}

function normalizeSupportSummary(value: unknown, fallback: MayusSupportSummary): MayusSupportSummary {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const issue = normalizeText(String(raw.issue_type || ""));
  const issueType = ["process_status", "documents", "billing", "support", "none"].includes(issue)
    ? issue as MayusSupportSummary["issue_type"]
    : fallback.issue_type;
  return {
    is_existing_client: raw.is_existing_client === true || fallback.is_existing_client,
    issue_type: issueType,
    verified_case_reference: raw.verified_case_reference === true || fallback.verified_case_reference,
    summary: cleanText(String(raw.summary || "")) || fallback.summary,
  };
}

function sanitizeReplyForConversation(reply: string | null, state: MayusConversationState) {
  let text = cleanText(reply) || "Entendi. Me diga so o ponto principal para eu organizar o proximo passo certo.";
  if (state.has_mayus_introduced) {
    text = text
      .replace(/^oi,\s*[^.?!]{0,60}\.\s*aqui (?:e|sou) o mayus[^.?!]*[.?!]\s*/i, "")
      .replace(/^aqui (?:e|sou) o mayus[^.?!]*[.?!]\s*/i, "")
      .trim();
  }
  text = text
    .replace(/o escritorio conduz[^.?!]*[.?!]\s*/ig, "")
    .replace(/metodo def[^.?!]*[.?!]\s*/ig, "")
    .trim();
  return text || "Entendi. Qual e o ponto principal que voce quer resolver agora?";
}

function buildDefaultActions(params: {
  state: MayusConversationState;
  intent: MayusOperatingPartnerIntent;
  closingReadiness: MayusClosingReadiness;
  supportSummary: MayusSupportSummary;
}) {
  if (params.state.stage === "closing" || params.closingReadiness.status === "ready_for_human_close") {
    return [
      { type: "mark_ready_for_closing" as const, title: "Marcar lead pronto para fechamento humano", requires_approval: true },
      { type: "create_task" as const, title: "Follow-up de fechamento com humano", payload: { urgency: "ATENCAO" }, requires_approval: false },
    ];
  }

  if (params.state.stage === "client_support" || params.state.stage === "handoff" || params.supportSummary.issue_type !== "none") {
    return [
      { type: "recommend_handoff" as const, title: "Recomendar handoff com resumo do contexto", requires_approval: true },
      { type: "add_internal_note" as const, title: "Registrar resumo do suporte MAYUS", requires_approval: false },
    ];
  }

  if (params.intent === "sales_qualification" || params.intent === "legal_triage") {
    return [
      { type: "create_crm_lead" as const, title: "Registrar ou atualizar lead no CRM", requires_approval: false },
      { type: "add_internal_note" as const, title: "Registrar estado conversacional MAYUS", requires_approval: false },
    ];
  }

  return [{ type: "add_internal_note" as const, title: "Registrar proximo passo MAYUS", requires_approval: false }];
}

function guardAutoExecuteActions(actions: MayusOperatingPartnerAction[], confidence: number, threshold: number) {
  const sideEffectActions: MayusOperatingPartnerActionType[] = ["create_crm_lead", "update_crm_stage", "create_task"];
  if (confidence >= threshold) return actions;

  return actions.map((action) => sideEffectActions.includes(action.type)
    ? {
      ...action,
      requires_approval: true,
      payload: {
        ...(action.payload || {}),
        auto_execute_blocked_reason: "confidence_below_threshold",
        auto_execute_threshold: threshold,
      },
    }
    : action);
}

function normalizeDecision(parsed: any, params: {
  config: MayusOperatingPartnerConfig;
  provider: string;
  model: string;
  deterministicIntent: MayusOperatingPartnerIntent;
  deterministicRisks: string[];
  fallbackState: MayusConversationState;
  fallbackClosingReadiness: MayusClosingReadiness;
  fallbackSupportSummary: MayusSupportSummary;
}): MayusOperatingPartnerDecision {
  const confidence = clamp01(parsed?.confidence);
  const riskFlags = Array.from(new Set([
    ...uniqueStrings(parsed?.risk_flags),
    ...params.deterministicRisks,
  ]));

  if (confidence < params.config.confidence_thresholds.approval) {
    riskFlags.push("low_confidence");
  }

  let intent = normalizeIntent(parsed?.intent, params.deterministicIntent);
  if (params.deterministicIntent === "legal_triage" && intent === "sales_qualification") {
    intent = "legal_triage";
  }
  const conversationState = normalizeConversationState(parsed?.conversation_state, params.fallbackState);
  const closingReadiness = normalizeClosingReadiness(parsed?.closing_readiness, params.fallbackClosingReadiness);
  const supportSummary = normalizeSupportSummary(parsed?.support_summary, params.fallbackSupportSummary);
  const actions = normalizeActions(parsed?.actions_to_execute);
  const effectiveActions = guardAutoExecuteActions(actions.length ? actions : buildDefaultActions({
    state: conversationState,
    intent,
    closingReadiness,
    supportSummary,
  }), confidence, params.config.confidence_thresholds.auto_execute);
  const hasHighRisk = riskFlags.some((flag) => HIGH_RISK_FLAGS.includes(flag));
  const requiresApproval = parsed?.requires_approval === true
    || hasHighRisk
    || closingReadiness.status === "ready_for_human_close"
    || closingReadiness.status === "blocked"
    || effectiveActions.some((action) => (
      action.requires_approval === true
      || action.type === "prepare_proposal"
      || action.type === "mark_ready_for_closing"
      || action.type === "handoff_human"
      || action.type === "recommend_handoff"
    ));

  const shouldAutoSend = params.config.enabled
    && params.config.autonomy_mode !== "draft_only"
    && confidence >= params.config.confidence_thresholds.auto_send
    && !requiresApproval
    && parsed?.should_auto_send !== false;

  return {
    reply: sanitizeReplyForConversation(parsed?.reply, conversationState),
    intent,
    confidence,
    risk_flags: Array.from(new Set(riskFlags)),
    next_action: cleanText(parsed?.next_action) || "organizar proximo passo com seguranca",
    conversation_state: conversationState,
    closing_readiness: closingReadiness,
    support_summary: supportSummary,
    reasoning_summary_for_team: cleanText(parsed?.reasoning_summary_for_team) || `Estado ${conversationState.stage}; proxima acao: ${conversationState.next_action}.`,
    actions_to_execute: effectiveActions,
    requires_approval: requiresApproval,
    should_auto_send: shouldAutoSend,
    model_used: params.model,
    provider: params.provider,
    expected_outcome: cleanText(parsed?.expected_outcome) || "avancar atendimento sem inventar informacao",
  };
}

export async function buildMayusOperatingPartnerDecision(input: MayusOperatingPartnerInput): Promise<MayusOperatingPartnerDecision> {
  const config = normalizeMayusOperatingPartnerConfig(input.operatingPartner);
  const selectedModel = chooseModel(input);
  const deterministic = detectDeterministicIntentAndRisk(input.messages);
  const fallbackState = inferConversationState(input, deterministic.intent);
  const fallbackClosingReadiness = inferClosingReadiness(fallbackState, deterministic.intent);
  const fallbackSupportSummary = inferSupportSummary(input, fallbackState, deterministic.intent);
  const llm = await getLLMClient(input.supabase, input.tenantId, "sdr_whatsapp", {
    preferredProvider: "openrouter",
    modelOverride: selectedModel,
  });
  const fetcher = input.fetcher || fetch;
  const response = await fetcher(llm.endpoint, {
    method: "POST",
    headers: buildHeaders(llm),
    body: JSON.stringify({
      model: llm.model,
      temperature: 0.28,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Voce e o MAYUS socio virtual. Retorne apenas JSON valido e respeite os limites juridicos/comerciais." },
        { role: "user", content: buildPrompt(input, config, llm.model, deterministic.intent, fallbackState, fallbackClosingReadiness, fallbackSupportSummary) },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao chamar MAYUS socio virtual: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = extractJsonObject(String(content || ""));

  return normalizeDecision(parsed, {
    config,
    provider: llm.provider,
    model: llm.model,
    deterministicIntent: deterministic.intent,
    deterministicRisks: deterministic.riskFlags,
    fallbackState,
    fallbackClosingReadiness,
    fallbackSupportSummary,
  });
}
