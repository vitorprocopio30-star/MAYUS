import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHeaders, getLLMClient } from "@/lib/llm-router";
import type { SalesLlmTestbenchConfig } from "@/lib/growth/sales-llm-reply";
import type { WhatsAppSalesMessage } from "@/lib/growth/whatsapp-sales-reply";
import { summarizeOfficePlaybookForPrompt, type OfficePlaybookProfile } from "@/lib/growth/office-playbook-profile";
import type { WhatsAppProcessStatusContext } from "@/lib/whatsapp/process-status-context";

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
  conversation_role: "seller" | "support" | "case_status" | "billing" | "legal_triage" | "handoff";
  conversation_goal: string;
  customer_temperature: "cold" | "interested" | "warm" | "hot" | "irritated" | "existing_client";
  stage: MayusConversationStage;
  facts_known: string[];
  missing_information: string[];
  objections: string[];
  urgency: "none" | "low" | "medium" | "high";
  decision_maker: "unknown" | "lead" | "shared";
  documents_requested: string[];
  last_customer_message: string | null;
  last_mayus_message: string | null;
  last_commitment: string | null;
  next_action: string;
  has_mayus_introduced: boolean;
  conversation_summary: string;
  last_process_candidates?: Array<{
    processTaskId: string | null;
    clientName: string | null;
    processNumber: string | null;
    title: string | null;
    opposingParty?: string | null;
    summary?: string | null;
    currentStage: string | null;
    lastMovementAt: string | null;
    lastMovementText?: string | null;
  }>;
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
  assistantName?: string | null;
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
  reply_blocks?: string[];
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
  officePlaybookProfile?: OfficePlaybookProfile | null;
  crmContext?: MayusOperatingPartnerCrmContext | null;
  processStatusContext?: WhatsAppProcessStatusContext | null;
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

function normalizeProcessCandidateMemory(value: unknown): NonNullable<MayusConversationState["last_process_candidates"]> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      processTaskId: cleanText(String(raw.processTaskId || "")),
      clientName: cleanText(String(raw.clientName || "")),
      processNumber: cleanText(String(raw.processNumber || "")),
      title: cleanText(String(raw.title || "")),
      opposingParty: cleanText(String(raw.opposingParty || "")),
      summary: cleanText(String(raw.summary || "")),
      currentStage: cleanText(String(raw.currentStage || "")),
      lastMovementAt: cleanText(String(raw.lastMovementAt || "")),
      lastMovementText: cleanText(String(raw.lastMovementText || "")),
    };
  }).filter((item) => item.processTaskId || item.processNumber || item.title || item.opposingParty).slice(0, 6);
}

function normalizeReplyBlocks(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => cleanText(String(item || ""))).filter(Boolean).slice(0, 6) as string[];
}

function truncateForPrompt(value: string | null | undefined, maxLength: number) {
  const text = cleanText(value);
  if (!text || text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function messageTextWithMedia(message: WhatsAppSalesMessage) {
  const content = cleanText(message.content) || `[${message.message_type || "mensagem"}]`;
  const mediaContext = [
    truncateForPrompt(message.media_summary, 700),
    truncateForPrompt(message.media_text, 700),
  ]
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
    .slice(-12)
    .map((message) => `${message.direction === "inbound" ? "cliente" : "mayus"}: ${messageTextWithMedia(message)}`)
    .join("\n");
}

function getLastInbound(messages: WhatsAppSalesMessage[]) {
  return [...messages].reverse().find((message) => message.direction === "inbound" && cleanText(message.content)) || null;
}

function getLastOutbound(messages: WhatsAppSalesMessage[]) {
  return [...messages].reverse().find((message) => message.direction === "outbound" && cleanText(message.content)) || null;
}

function isPureGreeting(value?: string | null) {
  return /^(oi|ola|ol[aá]|bom dia|boa tarde|boa noite|tudo bem|boa)$/i.test(normalizeText(value));
}

function looksLikeFullName(value?: string | null) {
  const text = cleanText(value) || "";
  const normalized = normalizeText(text);
  if (!normalized || isPureGreeting(text)) return false;
  if (/\d|@|processo|cnj|cpf|cnpj|boa noite|bom dia|boa tarde|oi|ola/.test(normalized)) return false;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length >= 2 && words.length <= 8 && words.every((word) => /^[A-Za-zÀ-ÿ'’-]{2,}$/.test(word));
}

function isRecentMessage(message: WhatsAppSalesMessage, referenceTime: number, windowMs: number) {
  const createdAt = new Date(message.created_at || "").getTime();
  if (!Number.isFinite(createdAt)) return false;
  return Math.abs(referenceTime - createdAt) <= windowMs;
}

function hasMayusIntroduced(messages: WhatsAppSalesMessage[]) {
  return messages.some((message) => {
    if (message.direction !== "outbound") return false;
    const normalized = normalizeText(message.content);
    return /aqui (e|sou) o mayus|sou o mayus|mayus, assistente|aqui (e|sou) a maya|sou a maya|maya, assistente/.test(normalized);
  });
}

function hasMayusIntroducedRecently(messages: WhatsAppSalesMessage[], windowMs = 12 * 60 * 60 * 1000) {
  const lastInbound = getLastInbound(messages);
  const referenceTime = new Date(lastInbound?.created_at || "").getTime();
  const now = Number.isFinite(referenceTime) ? referenceTime : Date.now();
  return messages.some((message) => {
    if (message.direction !== "outbound" || !isRecentMessage(message, now, windowMs)) return false;
    const normalized = normalizeText(message.content);
    return /aqui (e|sou) o mayus|sou o mayus|mayus, assistente|aqui (e|sou) a maya|sou a maya|maya, assistente/.test(normalized);
  });
}

function isPreviousMayusEventRecent(event?: MayusPreviousConversationEvent | null, windowMs = 12 * 60 * 60 * 1000) {
  const createdAt = new Date(event?.created_at || "").getTime();
  if (!Number.isFinite(createdAt)) return false;
  return Date.now() - createdAt <= windowMs;
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
  const hasVerifiedProcessStatus = input.processStatusContext?.verified === true;
  const hasIntroduced = hasMayusIntroducedRecently(input.messages);
  const hasDocumentContext = input.messages.some((message) => Boolean(cleanText(message.media_summary) || cleanText(message.media_text) || /documento|imagem|pdf|contracheque/i.test(String(message.content || ""))));
  const processCandidates = normalizeProcessCandidateMemory(input.processStatusContext?.candidateProcesses || previous.last_process_candidates);

  if (digest.lastInbound) facts.add(`ultima mensagem do cliente: ${digest.lastInbound}`);
  if (hasCrm) facts.add(`lead/cliente localizado no CRM: ${input.crmContext?.title || input.crmContext?.crm_task_id}`);
  if (hasVerifiedProcessStatus) {
    facts.add(`processo verificado: ${input.processStatusContext?.processNumber || input.processStatusContext?.title || input.processStatusContext?.processTaskId || "dossie processual"}`);
    const limitedCandidates = processCandidates.slice(0, 5);
    for (let index = 0; index < limitedCandidates.length; index += 1) {
      const candidate = limitedCandidates[index];
      facts.add(`processo ${index + 1}: ${[candidate.opposingParty, candidate.currentStage, candidate.summary].filter(Boolean).join(" - ")}`);
    }
  }
  if (/contracheque|holerite|folha/.test(text)) facts.add("assunto envolve desconto em contracheque/folha");
  if (/credcesta/.test(text)) facts.add("cliente citou Credcesta como possivel desconto/assunto da folha");
  if (/beneficio|inss|aposentadoria|bpc|loas/.test(text)) facts.add("assunto envolve beneficio/INSS");
  if (/negado|indeferido|nao aprovado/.test(text)) facts.add("cliente citou negativa/indeferimento");
  if (/quero fechar|contratar|fechar|assinar|vamos seguir|gostei/.test(text)) facts.add("cliente sinalizou vontade de avancar");
  if (hasDocumentContext) facts.add("ha documento/midia no historico que deve orientar a conversa");
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

  const isSupportLike = deterministicIntent === "client_support" || /ja sou cliente|meu atendimento|meu caso|suporte|reclamacao|problema no atendimento/.test(text);
  const role: MayusConversationState["conversation_role"] = deterministicIntent === "process_status"
    ? "case_status"
    : deterministicIntent === "billing"
      ? "billing"
      : deterministicIntent === "legal_triage"
        ? "legal_triage"
        : isSupportLike
          ? "support"
          : "seller";
  const temperature: MayusConversationState["customer_temperature"] = /irritado|absurdo|demora|ninguem responde|reclamacao|problema/.test(text)
    ? "irritated"
    : isSupportLike || hasCrm
      ? "existing_client"
      : /quero fechar|contratar|assinar|vamos seguir|pagar entrada/.test(text)
        ? "hot"
        : /preco|valor|caro|vou pensar|gostei|me interessa/.test(text)
          ? "warm"
          : digest.inbound.length > 1 || facts.size >= 2 || hasDocumentContext
            ? "interested"
            : "cold";

  let stage: MayusConversationStage = "discovery";
  if (digest.inbound.length <= 1 && !hasCrm) stage = "new";
  if (facts.size >= 3 || hasCrm) stage = "qualification";
  if (/caro|preco|valor|vou pensar|depois|sem tempo/.test(text)) stage = "objection";
  if (/quero fechar|contratar|fechar|assinar|vamos seguir|pagar entrada/.test(text)) stage = "closing";
  if (deterministicIntent === "client_support" || (/ja sou cliente|meu atendimento|meu caso|suporte/.test(text) && hasCrm)) stage = "client_support";
  if (deterministicIntent === "process_status") stage = hasVerifiedProcessStatus ? "client_support" : "handoff";
  if (previous.stage && stage === "discovery") stage = previous.stage as MayusConversationStage;

  const nextAction = stage === "closing"
    ? "organizar fechamento humano com resumo do contexto"
    : stage === "objection"
      ? "isolar a objecao real antes de rebater"
      : stage === "client_support" || stage === "handoff"
        ? "organizar suporte seguro com identificador minimo"
        : "fazer a proxima pergunta de qualificacao";
  const conversationGoal = role === "seller"
    ? "qualificar dor, criar valor e avancar para proximo passo comercial seguro"
    : role === "support"
      ? "entender o problema, acolher e organizar resolucao ou handoff sem perder contexto"
      : role === "case_status"
        ? hasVerifiedProcessStatus
          ? "responder status processual com base verificada, linguagem simples e sem promessa juridica"
          : "localizar identificador minimo e escalar/verificar base antes de informar status"
        : role === "billing"
          ? "entender duvida de valor/cobranca e encaminhar com seguranca humana quando necessario"
          : role === "legal_triage"
            ? "entender fatos/documentos, separar risco juridico e conduzir triagem segura"
            : "organizar handoff humano com resumo completo";

  return {
    conversation_role: role,
    conversation_goal: cleanText(String(previous.conversation_goal || "")) || conversationGoal,
    customer_temperature: temperature,
    stage,
    facts_known: Array.from(facts).slice(0, 8),
    missing_information: Array.from(missing).slice(0, 6),
    objections: Array.from(objections).slice(0, 4),
    urgency,
    decision_maker: decisionMaker,
    documents_requested: Array.from(documents).slice(0, 5),
    last_customer_message: digest.lastInbound,
    last_mayus_message: digest.lastOutbound,
    last_commitment: cleanText(String(previous.last_commitment || "")) || null,
    next_action: cleanText(input.previousMayusEvent?.next_action) || nextAction,
    has_mayus_introduced: hasIntroduced,
    conversation_summary: summarizeMessages(input.messages).slice(0, 1200),
    last_process_candidates: processCandidates.length ? processCandidates : undefined,
  };
}

function inferClosingReadiness(state: MayusConversationState, deterministicIntent: MayusOperatingPartnerIntent, processStatusContext?: WhatsAppProcessStatusContext | null): MayusClosingReadiness {
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
  if (deterministicIntent === "process_status" && processStatusContext?.verified === true) {
    return { score: 0, status: "not_ready", reasons: ["pedido de suporte processual com base verificada, nao e conversa de fechamento"] };
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
    is_existing_client: Boolean(input.crmContext?.crm_task_id) || input.processStatusContext?.verified === true || /ja sou cliente|meu caso|meu processo|meu atendimento/.test(text),
    issue_type: issueType,
    verified_case_reference: input.processStatusContext?.verified === true || (/cnj|processo|numero do processo/.test(text) && Boolean(input.crmContext?.crm_task_id)),
    summary: issueType === "none"
      ? "Conversa ainda em contexto comercial/qualificacao."
      : `Suporte identificado: ${issueType}. Validar base antes de informar dado sensivel.`,
  };
}

function detectDeterministicIntentAndRisk(messages: WhatsAppSalesMessage[], processStatusContext?: WhatsAppProcessStatusContext | null) {
  const lastInbound = normalizeText(getLastInbound(messages)?.content);
  const rawLastInbound = cleanText(getLastInbound(messages)?.content);
  const riskFlags: string[] = [];
  let intent: MayusOperatingPartnerIntent = "unknown";

  if (isPureGreeting(rawLastInbound)) {
    intent = "client_support";
  } else if (isCommercialTriageMessage(rawLastInbound)) {
    intent = "legal_triage";
  } else if (/andamento|status|meu processo|meu caso|processos? d[aeo]|casos? d[aeo]|gostaria de saber (sobre |de )?(o |um )?processo|queria saber (sobre |de )?(o |um )?processo|saber (sobre |de )?(o |um )?processo|atualizacao do processo|atualizacao do caso|novidade no processo|numero do processo|cnj|movimentacao|movimentacao/.test(lastInbound) || (looksLikeFullName(rawLastInbound) && processStatusContext)) {
    intent = "process_status";
    if (processStatusContext?.verified !== true) riskFlags.push("case_status_unverified");
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
  if (processStatusContext?.riskFlags?.length) riskFlags.push(...processStatusContext.riskFlags);

  return { intent, riskFlags: Array.from(new Set(riskFlags)) };
}

function chooseModel(input: MayusOperatingPartnerInput) {
  const defaultModel = cleanText(input.salesTestbench?.default_model);
  return defaultModel || "deepseek/deepseek-v4-pro";
}

function buildPrompt(input: MayusOperatingPartnerInput, config: MayusOperatingPartnerConfig, model: string, deterministicIntent: MayusOperatingPartnerIntent, state: MayusConversationState, closingReadiness: MayusClosingReadiness, supportSummary: MayusSupportSummary) {
  const profile = input.salesProfile || {};
  const officeProfile = input.officeKnowledgeProfile || {};
  const officePlaybookSummary = summarizeOfficePlaybookForPrompt(input.officePlaybookProfile || null);
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
  const assistantName = cleanText(officeProfile.assistantName) || "MAYUS";

  return [
    `Voce e ${assistantName}, assistente virtual operacional de um escritorio de advocacia brasileiro. O motor interno e o MAYUS, mas no WhatsApp use o nome configurado da assistente.`,
    "Sua funcao e conduzir a conversa inteira: vender, qualificar, dar suporte, organizar proximos passos e acionar humano quando houver risco.",
    "Nao responda a mensagem isolada. Voce e responsavel pela continuidade da conversa, como vendedor consultivo e suporte do escritorio.",
    "Sempre escolha primeiro o papel da conversa: seller, support, case_status, billing, legal_triage ou handoff. A resposta deve cumprir esse papel.",
    "Nao aja como chatbot aleatorio. Use o historico, nao presuma que o cliente pediu status de processo se ele nao pediu.",
    "Se a ultima mensagem do cliente for apenas saudacao (bom dia, boa tarde, boa noite, oi/ola), responda so com saudacao, apresentacao breve se necessario e pergunta aberta. Nao retome processo ou peca dados processuais so pelo historico.",
    "Nunca invente andamento de processo, valor, contrato, cobranca, prazo, documento ou promessa juridica.",
    "Se o cliente pedir status de processo sem base confirmada, diga que vai tratar com seguranca e peca identificador minimo ou escale.",
    "Se houver Contexto processual verificado, responda o status em linguagem simples: fase atual, ultima movimentacao, significado pratico, proximo passo e pendencia do cliente. Nao use juridiques e nao prometa resultado.",
    "Contexto processual verificado e fonte de fatos, nao texto para copiar. Ignore clientReply se aparecer; use candidateProcesses, resumo, parte contraria, fase, ultima movimentacao e fontes para redigir como atendente humano.",
    "Se houver varios candidateProcesses verificados para o mesmo cliente, responda todos diretamente em blocos curtos. Nao pergunte se o cliente quer resumo, nao pergunte se prefere um especifico, nao adie a resposta.",
    "Se houver um unico processo verificado, responda direto o que foi encontrado e o que significa em termos simples. Nao termine com 'quer que eu detalhe?' quando ja ha fatos suficientes.",
    "Use CNJ apenas como identificador secundario quando indispensavel; a resposta principal deve ser por parte contraria/assunto e situacao.",
    "Quando a resposta tiver mais de uma parte, retorne reply_blocks com blocos independentes e curtos para WhatsApp. Cada bloco deve ter no maximo 3 frases.",
    "Se houver prazo critico, audiencia, liminar, irritacao grave ou pergunta sobre chance de ganhar, nao autoenvie: responda com cuidado e recomende humano.",
    "Se for venda, conduza com DEF: descubra dor, qualifique, encante com diagnostico e so feche quando houver sinais suficientes.",
    "Como vendedor: reconheca a dor, mostre que entendeu, avance uma etapa e faca a pergunta que aumenta qualificacao ou compromisso. Nao fique so pedindo dados mecanicamente.",
    "Se o cliente estiver pronto para fechar, organize o fechamento humano/comercial; nao envie contrato, preco fechado, cobranca ou promessa juridica sozinho.",
    "Se for suporte, responda util e humano, com a proxima acao concreta.",
    "Como suporte: acolha, identifique o problema, diga o que vai organizar, peca o dado minimo necessario e evite fazer o cliente repetir contexto ja presente no historico.",
    "Se faltar configuracao do escritorio para decidir a conversa, nao invente. Faca uma pergunta curta de alinhamento operacional ao dono/equipe no reasoning_summary_for_team e responda o cliente com seguranca sem prometer.",
    "Cada escritorio tem sua propria tese, oferta e jeito de vender. Use o playbook do tenant quando existir; RMC/Credcesta e apenas uma tese especifica do Dutra, nao uma regra global para todos os escritorios.",
    "O objetivo nao e velocidade nem resposta generica: conduza a conversa como o melhor funcionario do escritorio, usando historico, documento recebido, CRM, playbook, estado conversacional e o que o cliente acabou de dizer.",
    "Antes de responder, reconstrua mentalmente o contexto: o que ja foi recebido, o que o cliente quer agora, o que falta, qual risco existe e qual e a proxima melhor jogada.",
    "A resposta pode ter contexto suficiente para parecer humana, mas deve continuar natural para WhatsApp: sem textao institucional, sem lista burocratica e sem explicar a metodologia interna.",
    "Nunca repita apresentacao se o estado indicar que o MAYUS ja se apresentou.",
    `Se for a primeira resposta ao contato, apresente-se de forma breve como ${assistantName}. Exemplo: \"Bom dia, Joao. Aqui e a ${assistantName}, assistente do escritorio.\" Se ja houve apresentacao, nao repita.`,
    "Se o contato nao estiver identificado com seguranca, peca nome completo antes de falar de processo, mas continue prestativo e pergunte o assunto em uma frase. Se o cliente acabou de enviar um nome completo, trate como dado recebido e tente localizar; nao peca o mesmo nome de novo.",
    "Nem todo cliente pergunta apenas de processo. Se a demanda for outra ou estiver ambigua, acolha, peca para adiantar o assunto e diga que vai organizar o resumo para o advogado responsavel retornar.",
    "Quando for suporte, outra demanda ou pedido de advogado, inclua uma acao create_task para o advogado/equipe atender o cliente, com resumo, proximo passo e ideias de encaminhamento. A mensagem ao cliente deve ser simpatica e prestativa.",
    "Reconheca o assunto especifico do cliente antes de perguntar. Se ele falou contracheque, desconto, consignado, folha, beneficio ou INSS, trate como triagem juridica/suporte qualificado.",
    "Para desconto em contracheque/beneficio, nao diga se a pessoa tem direito. Se ja houver documento ou midia no historico, conecte sua resposta a ele. Pergunte o nome do desconto, quando comecou, se houve autorizacao/emprestimo e peca print apenas do trecho do desconto quando ainda faltar evidencia.",
    "Em RMC, Credcesta, cartao beneficio, especie IV, RCC ou reserva de margem: se ha contracheque/desconto atual no historico, nao pergunte se o cliente ainda esta pagando. Avance para contrato, autorizacao, valor liberado, tempo de desconto e objetivo pratico.",
    "Se o cliente perguntar como parar de pagar, nao mande parar. Explique que nao da para orientar suspender sem analise, mas que e possivel verificar contrato, autorizacao, saldo/quitacao, desconto em folha e melhor encaminhamento humano.",
    "Se o cliente estiver irritado, confuso ou apontar que voce esqueceu contexto, peca desculpa de forma curta, reconheca o fato ja informado e responda direto sem nova pergunta generica.",
    "Se o cliente disser apenas algo curto como 'O credcesta', use o historico para entender que ele esta apontando o desconto/assunto, nao trate como mensagem isolada.",
    "Responda exclusivamente em portugues do Brasil, natural para WhatsApp, com uma pergunta estrategica por vez. Qualquer palavra em ingles, espanhol, chines, japones, coreano, indonesio ou outro idioma torna a resposta invalida.",
    "Avalie comportamento, nao frase exata: seja simpatico, especifique o assunto, demonstre que entendeu e conduza a proxima jogada.",
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
    "Playbook especifico deste escritorio:",
    officePlaybookSummary || "nao configurado; se isso impedir venda segura, registre no reasoning_summary_for_team quais perguntas o dono precisa responder.",
    "",
    "Perfil operacional do escritorio:",
    `Nome da assistente no WhatsApp: ${assistantName}`,
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
    "Contexto processual verificado:",
    JSON.stringify(input.processStatusContext || null),
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
      reply_blocks: ["bloco 1 curto", "bloco 2 curto se necessario"],
      intent: "sales_qualification",
      confidence: 0.86,
      risk_flags: [],
      next_action: "qualificar dor",
      conversation_state: {
        conversation_role: "seller",
        conversation_goal: "qualificar e avancar o atendimento",
        customer_temperature: "interested",
        stage: "discovery",
        facts_known: ["assunto declarado pelo cliente"],
        missing_information: ["urgencia", "decisor"],
        objections: [],
        urgency: "none",
        decision_maker: "unknown",
        documents_requested: [],
        last_customer_message: "ultima mensagem do cliente",
        last_mayus_message: "ultima mensagem do MAYUS ou null",
        last_commitment: "ultimo combinado ou null",
        next_action: "fazer uma pergunta estrategica",
        has_mayus_introduced: true,
        conversation_summary: "resumo curto do que ja aconteceu",
        last_process_candidates: [],
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

function normalizeConversationRole(value: unknown, fallback: MayusConversationState["conversation_role"]): MayusConversationState["conversation_role"] {
  const text = normalizeText(String(value || ""));
  if (["seller", "support", "case_status", "billing", "legal_triage", "handoff"].includes(text)) return text as MayusConversationState["conversation_role"];
  return fallback;
}

function normalizeCustomerTemperature(value: unknown, fallback: MayusConversationState["customer_temperature"]): MayusConversationState["customer_temperature"] {
  const text = normalizeText(String(value || ""));
  if (["cold", "interested", "warm", "hot", "irritated", "existing_client"].includes(text)) return text as MayusConversationState["customer_temperature"];
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
  const rawProcessCandidates = normalizeProcessCandidateMemory(raw.last_process_candidates);
  return {
    conversation_role: normalizeConversationRole(raw.conversation_role, fallback.conversation_role),
    conversation_goal: cleanText(String(raw.conversation_goal || "")) || fallback.conversation_goal,
    customer_temperature: normalizeCustomerTemperature(raw.customer_temperature, fallback.customer_temperature),
    stage: normalizeConversationStage(raw.stage, fallback.stage),
    facts_known: uniqueStrings(raw.facts_known).length ? uniqueStrings(raw.facts_known).slice(0, 10) : fallback.facts_known,
    missing_information: uniqueStrings(raw.missing_information).length ? uniqueStrings(raw.missing_information).slice(0, 10) : fallback.missing_information,
    objections: uniqueStrings(raw.objections).length ? uniqueStrings(raw.objections).slice(0, 6) : fallback.objections,
    urgency: normalizeUrgency(raw.urgency, fallback.urgency),
    decision_maker: normalizeDecisionMaker(raw.decision_maker, fallback.decision_maker),
    documents_requested: uniqueStrings(raw.documents_requested).length ? uniqueStrings(raw.documents_requested).slice(0, 8) : fallback.documents_requested,
    last_customer_message: cleanText(String(raw.last_customer_message || "")) || fallback.last_customer_message,
    last_mayus_message: cleanText(String(raw.last_mayus_message || "")) || fallback.last_mayus_message,
    last_commitment: cleanText(String(raw.last_commitment || "")) || fallback.last_commitment,
    next_action: cleanText(String(raw.next_action || "")) || fallback.next_action,
    has_mayus_introduced: raw.has_mayus_introduced === true || fallback.has_mayus_introduced,
    conversation_summary: cleanText(String(raw.conversation_summary || ""))?.slice(0, 1200) || fallback.conversation_summary,
    last_process_candidates: rawProcessCandidates.length ? rawProcessCandidates : fallback.last_process_candidates,
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

function isGenericConversationReply(reply: string | null | undefined) {
  const text = normalizeText(reply);
  if (!text) return true;
  const compact = text.replace(/[?.!,\s]/g, "");
  if (compact.length < 35) return true;
  return [
    /^entendi\.?( me diga| qual e| como posso)/,
    /^certo\.?( me diga| qual e| como posso)/,
    /^ola,? como posso ajudar/,
    /^em que posso ajudar/,
    /^me diga mais sobre isso/,
  ].some((pattern) => pattern.test(text));
}

function hasForeignLanguageLeak(reply: string | null | undefined) {
  const raw = String(reply || "");
  const text = normalizeText(raw);
  if (!text) return false;
  if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(raw)) return true;

  return [
    /\bpaying consistently\b/,
    /\bthe fact that\b/,
    /\bare you worried\b/,
    /\bi need to know\b/,
    /\bon your payslip\b/,
    /\bstop these deductions\b/,
    /\bwhat outcome you're looking for\b/,
    /\bmemang\b/,
    /\bme llama\b/,
  ].some((pattern) => pattern.test(text));
}

function asksKnownPaymentStatus(reply: string | null | undefined, state: MayusConversationState) {
  const answer = normalizeText(reply);
  if (!/ainda (esta|ta|voce esta) pagando|continua pagando|desconto ainda esta ativo|esta ativo e voce ainda esta pagando/.test(answer)) return false;

  const context = normalizeText([
    state.conversation_summary,
    state.last_customer_message,
    state.last_mayus_message,
    ...state.facts_known,
  ].filter(Boolean).join(" "));

  return /contracheque|holerite|desconta|desconto|ainda estou pagando|estou pagando|folha/.test(context);
}

function asksUnnecessaryProcessSummaryChoice(reply: string | null | undefined, processStatusContext?: WhatsAppProcessStatusContext | null) {
  if (processStatusContext?.verified !== true || !(processStatusContext.candidateProcesses?.length)) return false;
  const text = normalizeText(reply);
  return /quer (que eu )?(te )?(passe|envie|mande|faca)? ?(um )?resumo|prefere (ver|que eu veja|um deles|algum deles)|quer (que eu )?(detalhe|explique)|quer ver um|qual (desses|deles|processo|caso)|me diga (so )?qual (desses|deles)|qual .*voce quer (acompanhar|ver|detalhar)|se (voce )?nao souber.*(numero do processo|foto do documento)/.test(text);
}

function isSafeProcessIdentifierRequest(reply: string | null | undefined) {
  const text = normalizeText(reply);
  if (!/nome completo|cnj|numero do processo|identificador|localizar com seguranca|confirmar.*nome|confirme.*nome|qual e o seu nome/.test(text)) return false;
  return !/fase de|ultima movimentacao|prazo|sentenca|replica|contestacao juntada|liminar|audiencia|decisao saiu|ganhar/.test(text);
}

function isGenericProcessStatusRequestWithoutReference(value?: string | null) {
  const text = normalizeText(value);
  if (!/processo|caso|andamento|status|atualizacao|novidade/.test(text)) return false;
  if (/\d{7}-\d{2}|cnj|cpf|cnpj|processos? d[aeo]\s+[a-z]{2,}|casos? d[aeo]\s+[a-z]{2,}|nome completo\s+(e|eh)/.test(text)) return false;
  return /um processo|sobre um processo|saber sobre um processo|gostaria de saber (sobre |de )?(o |um )?processo|queria saber (sobre |de )?(o |um )?processo/.test(text);
}

function isCommercialTriageMessage(value?: string | null) {
  const text = normalizeText(value);
  return /contracheque|holerite|folha|desconto|descontando|consignado|credcesta|rmc|rcc|cartao beneficio|cartao consignado|beneficio|beneficio do inss|inss|aposentadoria|bpc|loas/.test(text);
}

function safeGenericProcessIdentifierReply(processStatusContext?: WhatsAppProcessStatusContext | null) {
  return processStatusContext?.senderPhoneAuthorized === true
    ? "Claro. Para eu localizar com segurança, me mande o nome completo do cliente ou o número do processo."
    : "Claro. Para eu localizar com segurança, me confirme seu nome completo ou o número do processo.";
}

function previousAskedForProcessIdentifier(messages: WhatsAppSalesMessage[]) {
  const lastInbound = getLastInbound(messages);
  const lastInboundIndex = lastInbound ? messages.lastIndexOf(lastInbound) : -1;
  const previous = (lastInboundIndex >= 0 ? messages.slice(0, lastInboundIndex) : messages).slice(-6);
  const text = normalizeText(previous.map((message) => message.content || "").join(" "));
  return /processo|status|andamento|nome completo|cnj|numero do processo|cpf|cnpj|identificador|localizar com seguranca/.test(text);
}

function isShortProcessNudge(messages: WhatsAppSalesMessage[], processStatusContext?: WhatsAppProcessStatusContext | null) {
  const lastInbound = normalizeText(getLastInbound(messages)?.content);
  if (!/^(cade|e ai|e agora|alguma novidade|conseguiu|viu|tem retorno|ta vendo|esta vendo)\??$/.test(lastInbound)) return false;
  return Boolean(processStatusContext || previousAskedForProcessIdentifier(messages));
}

function hasFirstResponseIntroduction(state: MayusConversationState) {
  return state.has_mayus_introduced || /aqui (e|sou) (a|o) |assistente/.test(normalizeText(state.last_mayus_message));
}

function withFirstResponseIntroduction(reply: string, state: MayusConversationState, params?: { assistantName?: string | null; officeName?: string | null; contactName?: string | null }) {
  if (hasFirstResponseIntroduction(state)) return reply;
  const assistant = cleanText(params?.assistantName) || "Maya";
  const office = visibleOfficeName(params?.officeName);
  const name = cleanText(params?.contactName);
  const intro = `${name ? `${name}, ` : ""}aqui é a ${assistant}, assistente${office ? ` do ${office}` : " do escritório"}.`;
  return `${intro} ${reply}`;
}

function processFallbackReply(processStatusContext?: WhatsAppProcessStatusContext | null) {
  const missingSignals = processStatusContext?.grounding?.missingSignals || [];
  const candidates = processStatusContext?.candidateProcesses || [];
  if (missingSignals.includes("mais de um processo possivel") && candidates.length > 0) {
    const clientName = cleanText(candidates.find((candidate) => candidate.clientName)?.clientName);
    const options = candidates.slice(0, 3).map((candidate, index) => {
      const ref = cleanText(candidate.processNumber) || cleanText(candidate.title) || `opção ${index + 1}`;
      const detail = cleanText(candidate.currentStage) || cleanText(candidate.title);
      return `${index + 1}. ${ref}${detail ? ` - ${detail}` : ""}`;
    }).join("\n");
    return `${clientName ? `Encontrei mais de um processo para ${clientName}.` : "Encontrei mais de um processo possível."} Me diga qual deles você quer que eu detalhe:\n\n${options}`;
  }
  if (missingSignals.includes("processo nao localizado")) {
    return processStatusContext?.senderPhoneAuthorized === true
      ? "Não localizei com segurança só por esse dado. Me mande o nome completo do cliente, número do processo/CNJ ou CPF/CNPJ para eu confirmar."
      : "Não localizei com segurança só por esse dado. Me confirme seu nome completo, número do processo/CNJ ou CPF/CNPJ para eu confirmar.";
  }
  if (missingSignals.includes("mais de um processo possivel")) {
    return "Encontrei mais de uma possibilidade. Me mande o número do processo/CNJ ou CPF/CNPJ para eu confirmar o processo certo.";
  }
  return safeGenericProcessIdentifierReply(processStatusContext);
}

function visibleOfficeName(value?: string | null) {
  const text = cleanText(value);
  if (!text || /^mayus$/i.test(text)) return null;
  return text;
}

function greetingLabel(value?: string | null) {
  const text = normalizeText(value);
  if (/bom dia/.test(text)) return "Bom dia";
  if (/boa tarde/.test(text)) return "Boa tarde";
  if (/boa noite/.test(text)) return "Boa noite";
  return "Olá";
}

function sanitizeReplyForConversation(reply: string | null, state: MayusConversationState, params?: { assistantName?: string | null; officeName?: string | null; contactName?: string | null }) {
  const lastMessage = cleanText(state.last_customer_message);
  if (isPureGreeting(lastMessage)) {
    const name = cleanText(params?.contactName);
    const greeting = `${greetingLabel(lastMessage)}${name ? `, ${name}` : ""}.`;
    if (state.has_mayus_introduced) return `${greeting} Como posso te ajudar?`;
    const assistant = cleanText(params?.assistantName) || "Maya";
    const office = visibleOfficeName(params?.officeName);
    return `${greeting} Aqui é a ${assistant}, assistente${office ? ` do ${office}` : " do escritório"}. Como posso te ajudar?`;
  }

  let text = cleanText(reply) || "Entendi. Me diga so o ponto principal para eu organizar o proximo passo certo.";
  if (state.has_mayus_introduced) {
    text = text
      .replace(/^oi,\s*[^.?!]{0,60}\.\s*aqui (?:e|sou) o mayus[^.?!]*[.?!]\s*/i, "")
      .replace(/^aqui (?:e|sou) o mayus[^.?!]*[.?!]\s*/i, "")
      .replace(/^oi,\s*[^.?!]{0,60}\.\s*aqui (?:e|sou) a maya[^.?!]*[.?!]\s*/i, "")
      .replace(/^aqui (?:e|sou) a maya[^.?!]*[.?!]\s*/i, "")
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
  processStatusContext?: WhatsAppProcessStatusContext | null;
}) {
  if (params.state.stage === "closing" || params.closingReadiness.status === "ready_for_human_close") {
    return [
      { type: "mark_ready_for_closing" as const, title: "Marcar lead pronto para fechamento humano", requires_approval: true },
      { type: "create_task" as const, title: "Follow-up de fechamento com humano", payload: { urgency: "ATENCAO" }, requires_approval: false },
    ];
  }

  if (params.intent === "process_status" && params.processStatusContext?.verified === true) {
    return [
      { type: "answer_support" as const, title: "Responder status processual verificado ao cliente", payload: { process_task_id: params.processStatusContext.processTaskId }, requires_approval: false },
      { type: "add_internal_note" as const, title: "Registrar status processual MAYUS", requires_approval: false },
    ];
  }

  if (params.state.stage === "client_support" || params.state.stage === "handoff" || params.supportSummary.issue_type !== "none") {
    return [
      {
        type: "create_task" as const,
        title: "Atender cliente WhatsApp com retorno humano",
        payload: {
          urgency: "ATENCAO",
          description: [
            "Cliente entrou pelo WhatsApp e precisa de retorno humano.",
            `Resumo: ${params.supportSummary.summary || params.state.conversation_summary || "demanda de suporte/atendimento a confirmar"}`,
            `Proximo passo sugerido: ${params.state.next_action || "confirmar demanda principal e retornar ao cliente"}`,
            "Ideias de encaminhamento: confirmar assunto principal, verificar processo/CRM, checar prazo ou documento pendente e responder sem promessa de resultado.",
          ].join("\n"),
        },
        requires_approval: false,
      },
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

function buildDeterministicDecision(params: {
  config: MayusOperatingPartnerConfig;
  reply: string;
  intent: MayusOperatingPartnerIntent;
  confidence: number;
  state: MayusConversationState;
  closingReadiness: MayusClosingReadiness;
  supportSummary: MayusSupportSummary;
  riskFlags?: string[];
  nextAction: string;
  actions?: MayusOperatingPartnerAction[];
  requiresApproval?: boolean;
  expectedOutcome: string;
  reasoning: string;
  assistantName?: string | null;
  officeName?: string | null;
  contactName?: string | null;
  introduceIfNeeded?: boolean;
}): MayusOperatingPartnerDecision {
  const riskFlags = Array.from(new Set(params.riskFlags || []));
  const highRisk = riskFlags.some((flag) => HIGH_RISK_FLAGS.includes(flag));
  const requiresApproval = params.requiresApproval === true || highRisk;
  const conversationState = {
    ...params.state,
    next_action: params.nextAction,
    has_mayus_introduced: params.introduceIfNeeded ? true : params.state.has_mayus_introduced,
  };
  const rawReply = params.introduceIfNeeded
    ? withFirstResponseIntroduction(params.reply, params.state, {
      assistantName: params.assistantName,
      officeName: params.officeName,
      contactName: params.contactName,
    })
    : params.reply;

  return {
    reply: sanitizeReplyForConversation(rawReply, conversationState, {
      assistantName: params.assistantName,
      officeName: params.officeName,
      contactName: params.contactName,
    }),
    intent: params.intent,
    confidence: params.confidence,
    risk_flags: riskFlags,
    next_action: params.nextAction,
    conversation_state: conversationState,
    closing_readiness: params.closingReadiness,
    support_summary: params.supportSummary,
    reasoning_summary_for_team: params.reasoning,
    actions_to_execute: params.actions?.length ? params.actions : buildDefaultActions({
      state: conversationState,
      intent: params.intent,
      closingReadiness: params.closingReadiness,
      supportSummary: params.supportSummary,
      processStatusContext: null,
    }),
    requires_approval: requiresApproval,
    should_auto_send: params.config.enabled
      && params.config.autonomy_mode !== "draft_only"
      && params.confidence >= params.config.confidence_thresholds.auto_send
      && !requiresApproval,
    model_used: "deterministic",
    provider: "mayus",
    expected_outcome: params.expectedOutcome,
  };
}

function buildFastPathDecision(input: MayusOperatingPartnerInput, params: {
  config: MayusOperatingPartnerConfig;
  deterministicIntent: MayusOperatingPartnerIntent;
  deterministicRisks: string[];
  fallbackState: MayusConversationState;
  fallbackClosingReadiness: MayusClosingReadiness;
  fallbackSupportSummary: MayusSupportSummary;
}): MayusOperatingPartnerDecision | null {
  const lastMessage = cleanText(getLastInbound(input.messages)?.content);
  const assistantName = input.officeKnowledgeProfile?.assistantName;
  const officeName = input.officeKnowledgeProfile?.officeName;
  const introduceIfNeeded = !hasFirstResponseIntroduction(params.fallbackState);

  if (isPureGreeting(lastMessage)) {
    return buildDeterministicDecision({
      config: params.config,
      reply: `${greetingLabel(lastMessage)}${cleanText(input.contactName) ? `, ${cleanText(input.contactName)}` : ""}. Aqui é a ${cleanText(assistantName) || "Maya"}, assistente${visibleOfficeName(officeName) ? ` do ${visibleOfficeName(officeName)}` : " do escritório"}. Como posso te ajudar?`,
      intent: "client_support",
      confidence: 0.98,
      state: params.fallbackState,
      closingReadiness: params.fallbackClosingReadiness,
      supportSummary: params.fallbackSupportSummary,
      nextAction: "perguntar como ajudar sem retomar processo antigo",
      actions: [{ type: "add_internal_note", title: "Registrar saudacao inicial no WhatsApp", requires_approval: false }],
      expectedOutcome: "cliente informa o assunto principal",
      reasoning: "Saudacao pura deve ser acolhida sem reutilizar historico de processo.",
      assistantName,
      officeName,
      contactName: input.contactName,
    });
  }

  if (isGenericProcessStatusRequestWithoutReference(lastMessage)) {
    return buildDeterministicDecision({
      config: params.config,
      reply: safeGenericProcessIdentifierReply(input.processStatusContext),
      intent: "process_status",
      confidence: 0.98,
      state: {
        ...params.fallbackState,
        conversation_role: "case_status",
        conversation_goal: "identificar de qual cliente ou processo o contato quer falar antes de consultar status",
        facts_known: Array.from(new Set([...(params.fallbackState.facts_known || []), "pedido generico de processo sem identificador na ultima mensagem"])),
      },
      closingReadiness: { ...params.fallbackClosingReadiness, status: "not_ready" },
      supportSummary: { ...params.fallbackSupportSummary, issue_type: "process_status", verified_case_reference: false },
      nextAction: "pedir nome completo do cliente ou numero do processo",
      actions: [{ type: "ask_discovery_question", title: "Pedir identificador antes de consultar processo", requires_approval: false }],
      expectedOutcome: "cliente informa nome completo ou CNJ do processo desejado",
      reasoning: "A ultima mensagem pediu um processo sem referencia; contexto antigo nao pode ser reutilizado.",
      assistantName,
      officeName,
      contactName: input.contactName,
      introduceIfNeeded,
    });
  }

  if (isShortProcessNudge(input.messages, input.processStatusContext)) {
    return buildDeterministicDecision({
      config: params.config,
      reply: "Estou localizando com segurança. Se tiver o número do processo/CNJ, me mande que eu confirmo mais rápido.",
      intent: "process_status",
      confidence: 0.96,
      state: params.fallbackState,
      closingReadiness: params.fallbackClosingReadiness,
      supportSummary: params.fallbackSupportSummary,
      nextAction: "aguardar identificador ou conclusao da localizacao segura",
      actions: [{ type: "ask_discovery_question", title: "Pedir CNJ se o cliente tiver", requires_approval: false }],
      expectedOutcome: "cliente envia CNJ ou aguarda localizacao",
      reasoning: "Cobranca curta apos pedido processual nao precisa de LLM e nao deve travar em fila/modelo.",
      assistantName,
      officeName,
      contactName: input.contactName,
      introduceIfNeeded,
    });
  }

  const hasHighDeterministicRisk = params.deterministicRisks.some((flag) => HIGH_RISK_FLAGS.includes(flag) && flag !== "case_status_unverified");

  if (isCommercialTriageMessage(lastMessage) && (input.processStatusContext || previousAskedForProcessIdentifier(input.messages))) {
    return buildDeterministicDecision({
      config: params.config,
      reply: "Entendi. Isso agora é sobre o desconto no contracheque/benefício, não sobre andamento de processo. Me diga: aparece com qual nome no contracheque?",
      intent: "legal_triage",
      confidence: 0.95,
      state: {
        ...params.fallbackState,
        conversation_role: "legal_triage",
        conversation_goal: "entender o desconto atual e organizar triagem segura",
        stage: "new",
        facts_known: Array.from(new Set([...params.fallbackState.facts_known, "cliente mudou o assunto para desconto em contracheque/beneficio"])),
        missing_information: ["nome do desconto", "quando comecou", "se houve autorizacao/emprestimo"],
      },
      closingReadiness: { ...params.fallbackClosingReadiness, status: "not_ready" },
      supportSummary: { ...params.fallbackSupportSummary, issue_type: "none", verified_case_reference: false, summary: "Triagem comercial/juridica sobre desconto em folha ou beneficio." },
      nextAction: "perguntar nome do desconto e qualificar triagem",
      actions: [
        { type: "create_crm_lead", title: "Registrar triagem de desconto em contracheque", requires_approval: false },
        { type: "add_internal_note", title: "Registrar mudanca de assunto para triagem comercial", requires_approval: false },
      ],
      expectedOutcome: "cliente informa o nome do desconto para qualificacao segura",
      reasoning: "Ultima mensagem mudou explicitamente de status processual para desconto/beneficio; contexto antigo de processo nao deve contaminar a resposta.",
      assistantName,
      officeName,
      contactName: input.contactName,
      introduceIfNeeded,
    });
  }

  if ((params.deterministicIntent === "process_status" || isGenericProcessStatusRequestWithoutReference(lastMessage)) && input.processStatusContext?.verified !== true) {
    return buildDeterministicDecision({
      config: params.config,
      reply: processFallbackReply(input.processStatusContext),
      intent: "process_status",
      confidence: 0.95,
      state: params.fallbackState,
      closingReadiness: { ...params.fallbackClosingReadiness, status: "not_ready" },
      supportSummary: params.fallbackSupportSummary,
      nextAction: "pedir identificador minimo do processo",
      actions: [{ type: "ask_discovery_question", title: "Pedir nome completo, CNJ ou documento para localizar processo", requires_approval: false }],
      expectedOutcome: "cliente envia identificador seguro do processo",
      reasoning: "Pedido processual sem base verificada deve pedir identificador minimo e nunca perguntar tema/assunto.",
      assistantName,
      officeName,
      contactName: input.contactName,
      introduceIfNeeded,
    });
  }

  return null;
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
  processStatusContext?: WhatsAppProcessStatusContext | null;
  assistantName?: string | null;
  officeName?: string | null;
  contactName?: string | null;
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
  const genericProcessWithoutReference = intent === "process_status"
    && params.processStatusContext?.verified !== true
    && isGenericProcessStatusRequestWithoutReference(conversationState.last_customer_message);
  const modelReplyBlocks = normalizeReplyBlocks(parsed?.reply_blocks);
  const modelReply = modelReplyBlocks.length ? modelReplyBlocks.join("\n\n") : parsed?.reply;
  const replyForValidation = genericProcessWithoutReference ? safeGenericProcessIdentifierReply() : modelReply;
  const actions = normalizeActions(parsed?.actions_to_execute);
  const effectiveActions = guardAutoExecuteActions(actions.length ? actions : buildDefaultActions({
    state: conversationState,
    intent,
    closingReadiness,
    supportSummary,
    processStatusContext: params.processStatusContext,
  }), confidence, params.config.confidence_thresholds.auto_execute);
  if (isGenericConversationReply(replyForValidation)) {
    riskFlags.push("generic_reply_not_conversational");
  }
  if (hasForeignLanguageLeak(replyForValidation)) {
    riskFlags.push("foreign_language_leak");
  }
  if (asksKnownPaymentStatus(replyForValidation, conversationState)) {
    riskFlags.push("asks_already_known_payment_status");
  }
  if (asksUnnecessaryProcessSummaryChoice(replyForValidation, params.processStatusContext)) {
    riskFlags.push("scripted_process_followup_question");
  }
  const lacksConversationControl = !conversationState.conversation_role
    || !conversationState.conversation_goal
    || !conversationState.next_action
    || !cleanText(parsed?.next_action)
    || !cleanText(parsed?.reasoning_summary_for_team);
  if (lacksConversationControl) {
    riskFlags.push("incomplete_conversation_control");
  }
  const safeUnverifiedProcessStatusReply = intent === "process_status"
    && params.processStatusContext?.verified !== true
    && isSafeProcessIdentifierRequest(replyForValidation);
  const effectiveRiskFlags = safeUnverifiedProcessStatusReply
    ? riskFlags.filter((flag) => flag !== "case_status_unverified")
    : riskFlags;
  const hasHighRisk = effectiveRiskFlags.some((flag) => HIGH_RISK_FLAGS.includes(flag));
  const mustHonorModelApproval = parsed?.requires_approval === true && (
    hasHighRisk
    || (intent === "process_status" && params.processStatusContext?.verified !== true && !safeUnverifiedProcessStatusReply)
    || intent === "billing"
    || closingReadiness.status === "ready_for_human_close"
    || closingReadiness.status === "blocked"
  );
  const requiresApproval = mustHonorModelApproval
    || hasHighRisk
    || riskFlags.includes("generic_reply_not_conversational")
    || riskFlags.includes("foreign_language_leak")
    || riskFlags.includes("asks_already_known_payment_status")
    || riskFlags.includes("scripted_process_followup_question")
    || riskFlags.includes("incomplete_conversation_control")
    || closingReadiness.status === "ready_for_human_close"
    || closingReadiness.status === "blocked"
    || effectiveActions.some((action) => (
      (action.requires_approval === true && action.type !== "recommend_handoff")
      || action.type === "prepare_proposal"
      || action.type === "mark_ready_for_closing"
      || action.type === "handoff_human"
    ));

  const shouldAutoSend = params.config.enabled
    && params.config.autonomy_mode !== "draft_only"
    && confidence >= params.config.confidence_thresholds.auto_send
    && !requiresApproval
    && parsed?.should_auto_send !== false;

  const sanitizedReply = sanitizeReplyForConversation(replyForValidation, conversationState, {
    assistantName: params.assistantName,
    officeName: params.officeName,
    contactName: params.contactName,
  });
  const sanitizedBlocks = modelReplyBlocks.length && !genericProcessWithoutReference
    ? modelReplyBlocks.map((block) => cleanText(block)).filter(Boolean) as string[]
    : undefined;

  return {
    reply: sanitizedReply,
    reply_blocks: sanitizedBlocks,
    intent,
    confidence,
    risk_flags: Array.from(new Set(effectiveRiskFlags)),
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

const REPAIRABLE_RISK_FLAGS = ["foreign_language_leak", "asks_already_known_payment_status", "scripted_process_followup_question"];

function needsReplyRepair(decision: MayusOperatingPartnerDecision) {
  return decision.risk_flags.some((flag) => REPAIRABLE_RISK_FLAGS.includes(flag));
}

async function callOperatingPartnerJson(params: {
  fetcher: typeof fetch;
  endpoint: string;
  headers: Record<string, string>;
  model: string;
  prompt: string;
}) {
  const response = await params.fetcher(params.endpoint, {
    method: "POST",
    headers: params.headers,
    body: JSON.stringify({
      model: params.model,
      temperature: 0.24,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Voce e o MAYUS socio virtual. Retorne apenas JSON valido e respeite os limites juridicos/comerciais." },
        { role: "user", content: params.prompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao chamar MAYUS socio virtual: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  return extractJsonObject(String(content || ""));
}

function buildRepairPrompt(params: {
  originalPrompt: string;
  invalidDecision: MayusOperatingPartnerDecision;
}) {
  return [
    params.originalPrompt,
    "",
    "REPARO OBRIGATORIO ANTES DO ENVIO:",
    "A resposta anterior foi considerada invalida pelos validadores do MAYUS.",
    `Flags de invalidacao: ${params.invalidDecision.risk_flags.join(", ")}`,
    "Gere uma nova resposta corrigida, ainda em JSON valido no mesmo formato solicitado.",
    "Regras absolutas do reparo:",
    "- responder 100% em portugues do Brasil; nenhuma palavra em ingles, espanhol, chines, japones, coreano, indonesio ou outro idioma;",
    "- nao perguntar se o cliente ainda esta pagando quando ha contracheque, desconto em folha ou afirmacao de pagamento/desconto no historico;",
    "- se ha processos verificados/candidateProcesses, responder os fatos disponiveis diretamente; nao perguntar se quer resumo, se prefere ver um especifico ou se quer que detalhe;",
    "- para varios processos verificados, usar reply_blocks e cobrir todos os processos principais de forma curta;",
    "- se o cliente quer parar de pagar, nao orientar suspender pagamento; conduzir para analise de contrato/autorizacao/saldo com humano;",
    "- uma pergunta estrategica por vez;",
    "- manter should_auto_send true somente se a resposta corrigida cumprir todas as regras.",
    "Resposta invalida anterior:",
    JSON.stringify({
      reply: params.invalidDecision.reply,
      risk_flags: params.invalidDecision.risk_flags,
      conversation_state: params.invalidDecision.conversation_state,
      next_action: params.invalidDecision.next_action,
    }),
  ].join("\n");
}

async function recordReplyRepairEvent(params: {
  supabase: SupabaseClient;
  tenantId: string;
  status: "ok" | "warning" | "error";
  invalidDecision: MayusOperatingPartnerDecision;
  repairedDecision?: MayusOperatingPartnerDecision | null;
  durationMs: number;
  error?: string | null;
}) {
  try {
    const query = params.supabase.from("system_event_logs");
    if (typeof (query as any).insert !== "function") return;

    await query.insert({
      tenant_id: params.tenantId,
      user_id: null,
      source: "whatsapp",
      provider: "mayus",
      event_name: "mayus_operating_partner_reply_repaired",
      status: params.status,
      payload: {
        original_risk_flags: params.invalidDecision.risk_flags,
        repaired_risk_flags: params.repairedDecision?.risk_flags || null,
        original_should_auto_send: params.invalidDecision.should_auto_send,
        repaired_should_auto_send: params.repairedDecision?.should_auto_send ?? null,
        original_requires_approval: params.invalidDecision.requires_approval,
        repaired_requires_approval: params.repairedDecision?.requires_approval ?? null,
        original_intent: params.invalidDecision.intent,
        repaired_intent: params.repairedDecision?.intent || null,
        original_model_used: params.invalidDecision.model_used,
        repaired_model_used: params.repairedDecision?.model_used || null,
        duration_ms: params.durationMs,
        error: params.error ? String(params.error).slice(0, 500) : null,
      },
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[mayus-operating-partner][reply-repair-event]", error);
  }
}

export async function buildMayusOperatingPartnerDecision(input: MayusOperatingPartnerInput): Promise<MayusOperatingPartnerDecision> {
  const config = normalizeMayusOperatingPartnerConfig(input.operatingPartner);
  const selectedModel = chooseModel(input);
  const deterministic = detectDeterministicIntentAndRisk(input.messages, input.processStatusContext);
  const fallbackState = inferConversationState(input, deterministic.intent);
  const fallbackClosingReadiness = inferClosingReadiness(fallbackState, deterministic.intent, input.processStatusContext);
  const fallbackSupportSummary = inferSupportSummary(input, fallbackState, deterministic.intent);
  const fastPathDecision = buildFastPathDecision(input, {
    config,
    deterministicIntent: deterministic.intent,
    deterministicRisks: deterministic.riskFlags,
    fallbackState,
    fallbackClosingReadiness,
    fallbackSupportSummary,
  });
  if (fastPathDecision) return fastPathDecision;

  const llm = await getLLMClient(input.supabase, input.tenantId, "sdr_whatsapp", {
    preferredProvider: "openrouter",
    modelOverride: selectedModel,
  });
  const fetcher = input.fetcher || fetch;
  const headers = buildHeaders(llm);
  const originalPrompt = buildPrompt(input, config, llm.model, deterministic.intent, fallbackState, fallbackClosingReadiness, fallbackSupportSummary);
  const normalizationParams = {
    config,
    provider: llm.provider,
    model: llm.model,
    deterministicIntent: deterministic.intent,
    deterministicRisks: deterministic.riskFlags,
    fallbackState,
    fallbackClosingReadiness,
    fallbackSupportSummary,
    processStatusContext: input.processStatusContext,
    assistantName: input.officeKnowledgeProfile?.assistantName,
    officeName: input.officeKnowledgeProfile?.officeName,
    contactName: input.contactName,
  };
  const parsed = await callOperatingPartnerJson({
    fetcher,
    endpoint: llm.endpoint,
    headers,
    model: llm.model,
    prompt: originalPrompt,
  });
  const decision = normalizeDecision(parsed, normalizationParams);

  if (!needsReplyRepair(decision)) return decision;

  const repairStartedAt = Date.now();
  let repairedDecision: MayusOperatingPartnerDecision | null = null;

  try {
    const repairedParsed = await callOperatingPartnerJson({
      fetcher,
      endpoint: llm.endpoint,
      headers,
      model: llm.model,
      prompt: buildRepairPrompt({ originalPrompt, invalidDecision: decision }),
    });
    repairedDecision = normalizeDecision(repairedParsed, normalizationParams);
    await recordReplyRepairEvent({
      supabase: input.supabase,
      tenantId: input.tenantId,
      status: needsReplyRepair(repairedDecision) ? "warning" : "ok",
      invalidDecision: decision,
      repairedDecision,
      durationMs: Date.now() - repairStartedAt,
    });
    return repairedDecision;
  } catch (error) {
    await recordReplyRepairEvent({
      supabase: input.supabase,
      tenantId: input.tenantId,
      status: "error",
      invalidDecision: decision,
      repairedDecision: null,
      durationMs: Date.now() - repairStartedAt,
      error: error instanceof Error ? error.message : String(error || "Falha no reparo"),
    });
    return decision;
  }
}
