import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHeaders, getLLMClient } from "@/lib/llm-router";
import type { SalesLlmTestbenchConfig } from "@/lib/growth/sales-llm-reply";
import type { WhatsAppSalesMessage } from "@/lib/growth/whatsapp-sales-reply";
import { summarizeOfficePlaybookForPrompt, type OfficePlaybookProfile } from "@/lib/growth/office-playbook-profile";
import type { OfficePracticeAreaPlaybook } from "@/lib/setup/office-setup-conversation";
import type { WhatsAppProcessStatusContext } from "@/lib/whatsapp/process-status-context";
import {
  buildInstitutionalMemoryPromptBlock,
  DEFAULT_INSTITUTIONAL_MEMORY_PROMPT_CAP,
  type InstitutionalMemoryEntry,
} from "@/lib/agent/memory/institutional";
import { recordLearningEvent } from "@/lib/agent/memory/learning-events";
import { recordSelfCorrectionEvent } from "@/lib/agent/runtime/self-correction";

export const MAYUS_OPERATING_PARTNER_INSTITUTIONAL_MEMORY_CAP = DEFAULT_INSTITUTIONAL_MEMORY_PROMPT_CAP;

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

export type MayusOperatingPartnerConversationClass =
  | "commercial"
  | "support"
  | "process_status"
  | "documents"
  | "billing"
  | "owner_command"
  | "unclear";

export type MayusOperatingPartnerPolicySurface =
  | "external_message"
  | "crm_write"
  | "support_response"
  | "billing"
  | "legal_decision";

export type MayusWhatsAppActorRole = "office_operator" | "external_client" | "lead" | "unknown";

export type MayusWhatsAppActorContext = {
  role: MayusWhatsAppActorRole;
  sender_phone_authorized: boolean;
  reason?: string | null;
};

export type MayusWhatsAppConversationResolutionType =
  | "greeting"
  | "complaint"
  | "referenced_process"
  | "unmatched_process_reference"
  | "process_candidates"
  | "generic_process_request"
  | "owner_multi_intent"
  | "short_process_nudge"
  | "commercial_triage"
  | "unverified_process_status"
  | "open_llm";

export type MayusWhatsAppConversationFrame = {
  resolution_type: MayusWhatsAppConversationResolutionType;
  actor_context: MayusWhatsAppActorContext;
  last_message: string | null;
  recommended_intent: MayusOperatingPartnerIntent;
  writer_mode: "llm_natural" | "deterministic_guardrail";
  llm_writer_allowed: boolean;
  hard_guardrail_reason: string | null;
  conversation_goal: string;
  known_facts: string[];
  missing_data: string[];
  forbidden_moves: string[];
  response_guidance: string[];
  resolved_reference?: {
    kind: "process_candidate";
    label: string | null;
    processTaskId: string | null;
    processNumber: string | null;
    clientName: string | null;
    opposingParty?: string | null;
    summary?: string | null;
    currentStage?: string | null;
    lastMovementAt?: string | null;
    lastMovementText?: string | null;
  } | null;
  candidate_summaries?: Array<{
    label: string | null;
    processTaskId: string | null;
    processNumber: string | null;
    opposingParty?: string | null;
    summary?: string | null;
    currentStage?: string | null;
  }>;
  safe_fallback_reply: string;
};

export type MayusWhatsAppReplyQualityCheck = {
  status: "pass" | "repair" | "block";
  flags: string[];
  reasons: string[];
};

export type MayusOperatingPartnerConversationClassification = {
  class: MayusOperatingPartnerConversationClass;
  surface: MayusOperatingPartnerPolicySurface;
  owner: "MAYUS Operating Partner";
  confidence: number;
  requires_human_review: boolean;
  next_action: string;
  reason: string;
};

export type MayusOperatingPartnerAgenticGovernance = {
  paperclip_mission: {
    mission: "whatsapp_conversation";
    owner: "MAYUS Operating Partner";
    routine: "whatsapp_agentic_beta";
    budget: "single_message";
    next_action: string;
    pending_approval: boolean;
    reconstructable: true;
    trace_required: true;
  };
  openclaw_policy: {
    surface: MayusOperatingPartnerPolicySurface;
    outcome: "allowed" | "draft_only" | "requires_approval";
    requires_approval: boolean;
    can_execute_now: boolean;
    blocked_layer: string | null;
    reason: string;
  };
  hermes_trajectory: {
    status: "ready" | "drafted" | "awaiting_approval";
    tenant_learning_scope: "tenant_only";
    events: Array<{
      type: "objective" | "step" | "decision" | "block" | "artifact" | "result";
      summary: string;
      payload?: Record<string, unknown>;
    }>;
  };
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

export type MayusOwnerOfficeSnapshot = {
  sales_today?: {
    checked: boolean;
    date: string | null;
    source: "sales" | "crm_tasks" | "sales+crm_tasks" | "none";
    count: number;
    amount: number | null;
    highlights: Array<{
      title: string;
      value?: number | null;
      status?: string | null;
    }>;
    note?: string | null;
  } | null;
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
  permissionPolicy?: string | null;
  calendarPolicy?: string | null;
  financePolicy?: string | null;
  playbookNotes?: string | null;
  operationalMethodologyStatus?: string | null;
  operationalMethodologySummary?: string | null;
  practiceAreaPlaybooks?: OfficePracticeAreaPlaybook[] | null;
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
  whatsapp_actor_context?: MayusWhatsAppActorContext;
  conversation_frame?: MayusWhatsAppConversationFrame;
  quality_check?: MayusWhatsAppReplyQualityCheck;
  final_response_source?: "llm_natural" | "llm_repaired" | "safe_fallback" | "deterministic_guardrail";
  conversation_classification?: MayusOperatingPartnerConversationClassification;
  agentic_governance?: MayusOperatingPartnerAgenticGovernance;
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
  institutionalMemory?: InstitutionalMemoryEntry[] | null;
  crmContext?: MayusOperatingPartnerCrmContext | null;
  ownerOfficeSnapshot?: MayusOwnerOfficeSnapshot | null;
  processStatusContext?: WhatsAppProcessStatusContext | null;
  whatsappActorContext?: MayusWhatsAppActorContext | null;
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

function normalizeWhatsAppActorContext(input: MayusOperatingPartnerInput): MayusWhatsAppActorContext {
  const provided = input.whatsappActorContext;
  if (provided?.role) {
    return {
      role: provided.role,
      sender_phone_authorized: provided.sender_phone_authorized === true || input.processStatusContext?.senderPhoneAuthorized === true,
      reason: cleanText(provided.reason) || "provided_by_runtime",
    };
  }

  if (input.processStatusContext?.senderPhoneAuthorized === true) {
    return {
      role: "office_operator",
      sender_phone_authorized: true,
      reason: "process_status_context_authorized_phone",
    };
  }

  if (input.processStatusContext?.verified === true) {
    return {
      role: "external_client",
      sender_phone_authorized: false,
      reason: "verified_process_contact",
    };
  }

  if (input.crmContext?.crm_task_id) {
    return {
      role: "lead",
      sender_phone_authorized: false,
      reason: "crm_context",
    };
  }

  return {
    role: "unknown",
    sender_phone_authorized: false,
    reason: "no_actor_signal",
  };
}

function isOfficeOperatorActor(actorContext?: MayusWhatsAppActorContext | null, processStatusContext?: WhatsAppProcessStatusContext | null) {
  return actorContext?.role === "office_operator"
    || actorContext?.sender_phone_authorized === true
    || processStatusContext?.senderPhoneAuthorized === true;
}

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function previewReplyText(value?: string | null, maxLength = 1200) {
  const text = cleanText(value);
  return text ? text.slice(0, maxLength) : null;
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

type ProcessCandidateMemory = NonNullable<MayusConversationState["last_process_candidates"]>[number];

function processStatusContextAsCandidate(processStatusContext?: WhatsAppProcessStatusContext | null): ProcessCandidateMemory | null {
  if (processStatusContext?.verified !== true) return null;
  if ((processStatusContext.candidateProcesses || []).length > 0 && !processStatusContext.processTaskId && !processStatusContext.processNumber) return null;
  if (!processStatusContext.processTaskId && !processStatusContext.processNumber && !processStatusContext.title) return null;

  return {
    processTaskId: cleanText(processStatusContext.processTaskId),
    clientName: cleanText(processStatusContext.clientName),
    processNumber: cleanText(processStatusContext.processNumber),
    title: cleanText(processStatusContext.title),
    opposingParty: cleanText(processStatusContext.title),
    summary: cleanText(processStatusContext.clientReply || processStatusContext.nextStep),
    currentStage: cleanText(processStatusContext.currentStage || processStatusContext.detectedPhaseLabel),
    lastMovementAt: cleanText(processStatusContext.lastMovementAt),
    lastMovementText: cleanText(processStatusContext.lastMovementText),
  };
}

function formatShortDateLabel(value?: string | null) {
  const text = cleanText(value);
  if (!text) return null;
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return text;
  return date.toLocaleDateString("pt-BR");
}

function collectProcessCandidates(input: MayusOperatingPartnerInput, state: MayusConversationState) {
  if (isPureGreeting(getLastInbound(input.messages)?.content)) return [];

  const candidates = [
    processStatusContextAsCandidate(input.processStatusContext),
    ...normalizeProcessCandidateMemory(input.processStatusContext?.candidateProcesses || []),
    ...normalizeProcessCandidateMemory(input.previousMayusEvent?.conversation_state?.last_process_candidates || []),
    ...(state.last_process_candidates || []),
  ].filter(Boolean) as ProcessCandidateMemory[];
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = [
      normalizeText(candidate.processTaskId),
      normalizeText(candidate.processNumber),
      normalizeText(candidate.title),
      normalizeText(candidate.opposingParty),
    ].filter(Boolean).join("|");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

const PROCESS_REFERENCE_STOP_WORDS = new Set([
  "acao",
  "atualizacao",
  "banco",
  "caso",
  "cliente",
  "contra",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "processo",
  "sobre",
]);

function candidateReferenceWords(candidate: ProcessCandidateMemory) {
  const clientWords = new Set(normalizeText(candidate.clientName).split(/\s+/).filter(Boolean));
  return Array.from(new Set([
    ...normalizeText(candidate.opposingParty).split(/\s+/),
    ...normalizeText(candidate.title).split(/\s+/),
  ].filter((word) => word.length >= 4 && !clientWords.has(word) && !PROCESS_REFERENCE_STOP_WORDS.has(word))));
}

function scoreCandidateReference(message: string | null | undefined, candidate: ProcessCandidateMemory) {
  const text = normalizeText(message);
  if (!text) return 0;
  let score = 0;
  const strongRefs = [
    normalizeText(candidate.opposingParty),
    normalizeText(candidate.title),
    normalizeText(candidate.processNumber),
  ].filter((ref) => ref.length >= 4);

  for (const ref of strongRefs) {
    if (text.includes(ref)) score += 10;
  }
  for (const word of candidateReferenceWords(candidate)) {
    if (new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text)) score += 3;
  }
  return score;
}

function findReferencedProcessCandidate(message: string | null | undefined, candidates: ProcessCandidateMemory[]) {
  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreCandidateReference(message, candidate) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score === scored[1].score) return null;
  return scored[0].candidate;
}

function findLastAnsweredProcessCandidate(messages: WhatsAppSalesMessage[], candidates: ProcessCandidateMemory[]) {
  const lastOutbound = [...messages].reverse().find((message) => message.direction === "outbound" && cleanText(message.content))?.content;
  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreCandidateReference(lastOutbound, candidate) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length !== 1) return null;
  return scored[0].candidate;
}

function isOtherProcessReference(message: string | null | undefined) {
  const text = normalizeText(message);
  return /\b(outro processo|outro caso|o outro|a outra|outro|restante|demais)\b/.test(text);
}

function isResolvedProcessStatusFollowup(message: string | null | undefined) {
  const text = normalizeText(message);
  if (!text) return false;
  if (isPureGreeting(text) || isOtherProcessReference(text)) return false;

  return /\b(acompanhar|andamento|status|situacao|novidade|atualizacao|consulta mesmo|consultar mesmo|so saber|saber a situacao|saber da situacao|como esta|como anda)\b/.test(text)
    || (/\bprocesso\b/.test(text) && /\b(quero saber|saber|me fala|me diga|me passa|ver|olhar|consultar|porra)\b/.test(text));
}

function isConversationComplaint(message: string | null | undefined) {
  const text = normalizeText(message);
  return /\b(merda|ruim|pior|errado|nada a ver|nao foi isso|não foi isso|nem falei nada|nao falei nada|não falei nada|voce se confundiu|você se confundiu|que resposta|rob[oô]|burro|horrivel|horrível)\b/.test(text);
}

function extractExplicitProcessReference(message: string | null | undefined) {
  const text = normalizeText(message);
  if (!text) return null;
  const bankReference = text.match(/\b(?:banco\s+)?(?:master|bradesco|itau|ita[uú]|santander|pan|bmg|c6|safra|mercantil|daycoval|ole|ol[eé]|caixa)\b/);
  if (bankReference?.[0]) {
    const value = bankReference[0].replace(/^banco\s+/, "").trim();
    if (value === "caixa") return "Caixa";
    return `Banco ${value.split(/\s+/).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ")}`;
  }
  const entityReference = text.match(/\b(?:inss|fgts|previdencia|previdência)\b/);
  return entityReference?.[0] ? entityReference[0].toUpperCase() : null;
}

function isOwnerReplyNudge(value?: string | null) {
  const text = normalizeText(value).replace(/[?!.,;:]+/g, " ").replace(/\s+/g, " ").trim();
  return /^(pode me responder|me responde|me responda|responde|responder|me fala|me diga|cade|cad[eê]|e ai|e a[ií]|conseguiu|viu|retorna pra mim|retorno)\s*$/.test(text);
}

function getPreviousMeaningfulInbound(messages: WhatsAppSalesMessage[]) {
  const inbound = messages
    .filter((message) => message.direction === "inbound" && cleanText(message.content))
    .slice(0, -1)
    .reverse();

  return inbound.find((message) => {
    const content = cleanText(message.content);
    return content && !isPureGreeting(content) && !isOwnerReplyNudge(content);
  }) || null;
}

function isOwnerSalesTodayRequest(value?: string | null) {
  const text = normalizeText(value);
  if (!text) return false;
  const hasCommercialSignal = /\b(venda|vendas|contrato|contratos|fechou|fechamento|fechado|lead|leads|crm|comercial|sdr|closer)\b/.test(text);
  const hasTodaySignal = /\b(hoje|hj|dia|agora)\b/.test(text);
  return hasCommercialSignal && hasTodaySignal;
}

function isOwnerProcessRequest(value?: string | null) {
  const text = normalizeText(value);
  return /\b(processo|processos|caso|casos|andamento|status|situacao|situacao processual|cnj|movimentacao|cliente)\b/.test(text);
}

function hasExplicitCurrentProcessReference(value?: string | null) {
  const raw = cleanText(value);
  const text = normalizeText(raw);
  if (!text) return false;
  if (/\d{7}-\d{2}|\bcnj\b|\bcpf\b|\bcnpj\b|\bprocesso\s+\d/.test(text)) return true;
  if (extractExplicitProcessReference(raw)) return true;
  const nameMatch = raw?.match(/\b(?:processo|caso)\s+(?:da|do|de)\s+([A-Za-zÀ-ÿ'’-]{2,}(?:\s+[A-Za-zÀ-ÿ'’-]{2,}){1,7})/i);
  if (nameMatch?.[1] && looksLikeFullName(nameMatch[1])) return true;
  return looksLikeFullName(raw);
}

function buildOwnerSalesTodayLine(snapshot?: MayusOwnerOfficeSnapshot | null) {
  const salesToday = snapshot?.sales_today;
  if (!salesToday?.checked) {
    return "Sobre vendas hoje, eu ainda nao tenho uma leitura confiavel do comercial neste turno.";
  }

  if (salesToday.count > 0) {
    const amount = typeof salesToday.amount === "number" && Number.isFinite(salesToday.amount)
      ? `, somando R$ ${salesToday.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "";
    const highlights = salesToday.highlights?.length
      ? `: ${salesToday.highlights.slice(0, 3).map((item) => item.title).join("; ")}`
      : ".";
    return `Sobre vendas hoje, encontrei ${salesToday.count} registro(s) no MAYUS${amount}${highlights}`;
  }

  return "Sobre vendas hoje, nao encontrei venda registrada no MAYUS com seguranca agora.";
}

function buildOwnerMultiIntentFallback(params: {
  contactName?: string | null;
  hasExplicitProcessReference: boolean;
  snapshot?: MayusOwnerOfficeSnapshot | null;
}) {
  const salutation = cleanText(params.contactName) || "Vitor";
  const processLine = params.hasExplicitProcessReference
    ? "Sobre o processo, vou usar a referencia que voce acabou de mandar e conferir na base antes de afirmar andamento."
    : "Sobre o processo, me manda o nome do cliente ou o CNJ para eu nao misturar com contexto antigo.";
  return `${salutation}, entendi.\n\n${processLine}\n\n${buildOwnerSalesTodayLine(params.snapshot)}`;
}

function hasRecentProcessContext(input: MayusOperatingPartnerInput, state: MayusConversationState, candidates: ProcessCandidateMemory[]) {
  return candidates.length > 0
    || input.processStatusContext?.verified === true
    || input.previousMayusEvent?.intent === "process_status"
    || state.conversation_role === "case_status"
    || /processo|banco|bradesco|caixa|master|cnj/.test(normalizeText(state.conversation_summary));
}

function buildReferencedProcessCandidateReply(candidate: ProcessCandidateMemory) {
  const label = cleanText(candidate.opposingParty) || cleanText(candidate.title) || cleanText(candidate.processNumber) || "esse processo";
  const ref = cleanText(candidate.processNumber) ? ` (${candidate.processNumber})` : "";
  const details = [
    cleanText(candidate.currentStage) ? `está em ${candidate.currentStage}` : null,
    cleanText(candidate.summary),
    cleanText(candidate.lastMovementText)
      ? `último registro${formatShortDateLabel(candidate.lastMovementAt) ? ` em ${formatShortDateLabel(candidate.lastMovementAt)}` : ""}: ${candidate.lastMovementText}`
      : formatShortDateLabel(candidate.lastMovementAt)
        ? `último registro em ${formatShortDateLabel(candidate.lastMovementAt)}`
        : null,
  ].filter(Boolean);

  if (!details.length) {
    return `Processo do ${label}${ref}: achei na base, mas não vi resumo operacional suficiente para afirmar o andamento. Deixei como ponto de conferência.`;
  }

  return `Processo do ${label}${ref}: ${details.join(". ")}.`;
}

function buildProcessCandidatesReply(params: {
  candidates: ProcessCandidateMemory[];
  clientName?: string | null;
  actorContext?: MayusWhatsAppActorContext | null;
  processStatusContext?: WhatsAppProcessStatusContext | null;
}) {
  const candidates = params.candidates.slice(0, 5);
  const clientName = cleanText(params.clientName) || cleanText(candidates.find((candidate) => candidate.clientName)?.clientName);
  const total = candidates.length;
  const intro = `${isOfficeOperatorActor(params.actorContext, params.processStatusContext) ? "Encontrei" : "Localizei"} ${total} ${total === 1 ? "processo" : "processos"}${clientName ? ` para ${clientName}` : ""}.`;
  const lines = candidates.map((candidate, index) => {
    const label = processCandidateLabel(candidate) || `processo ${index + 1}`;
    const parts = [
      cleanText(candidate.currentStage),
      cleanText(candidate.summary),
      cleanText(candidate.lastMovementText)
        ? `ultimo registro${formatShortDateLabel(candidate.lastMovementAt) ? ` em ${formatShortDateLabel(candidate.lastMovementAt)}` : ""}: ${candidate.lastMovementText}`
        : null,
    ].filter(Boolean);
    return `${index + 1}. ${label}${parts.length ? ` - ${parts.join(" - ")}` : ""}`;
  });
  return [intro, ...lines].filter(Boolean).join("\n\n");
}

function processCandidateLabel(candidate: ProcessCandidateMemory) {
  return cleanText(candidate.opposingParty)
    || cleanText(candidate.title)
    || cleanText(candidate.processNumber)
    || cleanText(candidate.processTaskId)
    || null;
}

function processCandidateFrame(candidate: ProcessCandidateMemory): NonNullable<MayusWhatsAppConversationFrame["resolved_reference"]> {
  return {
    kind: "process_candidate",
    label: processCandidateLabel(candidate),
    processTaskId: cleanText(candidate.processTaskId),
    processNumber: cleanText(candidate.processNumber),
    clientName: cleanText(candidate.clientName),
    opposingParty: cleanText(candidate.opposingParty),
    summary: cleanText(candidate.summary),
    currentStage: cleanText(candidate.currentStage),
    lastMovementAt: cleanText(candidate.lastMovementAt),
    lastMovementText: cleanText(candidate.lastMovementText),
  };
}

function processCandidateSummaries(candidates: ProcessCandidateMemory[]): NonNullable<MayusWhatsAppConversationFrame["candidate_summaries"]> {
  return candidates.map((candidate) => ({
    label: processCandidateLabel(candidate),
    processTaskId: cleanText(candidate.processTaskId),
    processNumber: cleanText(candidate.processNumber),
    opposingParty: cleanText(candidate.opposingParty),
    summary: cleanText(candidate.summary),
    currentStage: cleanText(candidate.currentStage),
  })).filter((candidate) => candidate.label || candidate.processNumber || candidate.processTaskId).slice(0, 8);
}

function hardGuardrailReasonForResolution(resolutionType: MayusWhatsAppConversationResolutionType) {
  const reasons: Partial<Record<MayusWhatsAppConversationResolutionType, string>> = {
    greeting: "saudacao_limpa_sem_contexto_antigo",
    complaint: "recuperacao_de_erro_de_contexto",
    unmatched_process_reference: "referencia_explicita_nao_localizada_com_seguranca",
    generic_process_request: "pedido_generico_precisa_identificador_seguro",
    short_process_nudge: "cobranca_curta_sem_fonte_suficiente",
    unverified_process_status: "status_processual_sem_processo_verificado",
  };
  return reasons[resolutionType] || null;
}

function shouldUseFrameGuardrailReply(resolutionType: MayusWhatsAppConversationResolutionType) {
  return Boolean(hardGuardrailReasonForResolution(resolutionType));
}

function buildWhatsAppConversationFrame(input: MayusOperatingPartnerInput, params: {
  deterministicIntent: MayusOperatingPartnerIntent;
  fallbackState: MayusConversationState;
  fallbackSupportSummary: MayusSupportSummary;
  actorContext: MayusWhatsAppActorContext;
}): MayusWhatsAppConversationFrame {
  const rawLastInbound = cleanText(getLastInbound(input.messages)?.content);
  const nudgeSource = isOfficeOperatorActor(params.actorContext, input.processStatusContext) && isOwnerReplyNudge(rawLastInbound)
    ? getPreviousMeaningfulInbound(input.messages)
    : null;
  const lastMessage = cleanText(nudgeSource?.content) || rawLastInbound;
  const isOwnerNudgeContinuation = Boolean(nudgeSource);
  const candidates = collectProcessCandidates(input, params.fallbackState);
  const referencedCandidate = findReferencedProcessCandidate(lastMessage, candidates);
  const otherProcessReference = isOtherProcessReference(lastMessage);
  const lastAnsweredCandidate = findLastAnsweredProcessCandidate(input.messages, candidates);
  const genericProcessRequest = isGenericProcessStatusRequestWithoutReference(lastMessage);
  const singleVerifiedProcessCandidate = input.processStatusContext?.verified === true
    && normalizeProcessCandidateMemory(input.processStatusContext.candidateProcesses || []).length <= 1
    ? processStatusContextAsCandidate(input.processStatusContext)
    : null;
  const statusFollowupCandidate = isResolvedProcessStatusFollowup(lastMessage)
    && (lastAnsweredCandidate || !genericProcessRequest)
    ? (lastAnsweredCandidate || (candidates.length === 1 ? candidates[0] : null))
    : null;
  const remainingProcessCandidates = otherProcessReference && lastAnsweredCandidate
    ? candidates.filter((candidate) => {
        const candidateKey = normalizeText(candidate.processTaskId || candidate.processNumber || candidate.title || candidate.opposingParty);
        const answeredKey = normalizeText(lastAnsweredCandidate.processTaskId || lastAnsweredCandidate.processNumber || lastAnsweredCandidate.title || lastAnsweredCandidate.opposingParty);
        return candidateKey && candidateKey !== answeredKey;
      })
    : [];
  const explicitProcessReference = extractExplicitProcessReference(lastMessage);
  const shortProcessNudge = isShortProcessNudge(input.messages, input.processStatusContext);
  const commercialTriage = isCommercialTriageMessage(lastMessage) && (input.processStatusContext || previousAskedForProcessIdentifier(input.messages));
  const hasVerifiedProcessCandidates = input.processStatusContext?.verified === true
    && normalizeProcessCandidateMemory(input.processStatusContext.candidateProcesses || []).length > 1;
  const unverifiedProcessStatus = (params.deterministicIntent === "process_status" || genericProcessRequest)
    && input.processStatusContext?.verified !== true;
  const unmatchedProcessReference = !referencedCandidate
    && Boolean(explicitProcessReference)
    && hasRecentProcessContext(input, params.fallbackState, candidates);
  const ownerMultiIntentRequest = isOfficeOperatorActor(params.actorContext, input.processStatusContext)
    && isOwnerProcessRequest(lastMessage)
    && isOwnerSalesTodayRequest(lastMessage);
  const ownerMultiIntentHasExplicitProcessReference = hasExplicitCurrentProcessReference(lastMessage);

  let resolutionType: MayusWhatsAppConversationResolutionType = "open_llm";
  let recommendedIntent = params.deterministicIntent;
  let conversationGoal = params.fallbackState.conversation_goal || "responder com naturalidade e seguranca";
  let safeFallbackReply = "Entendi. Vou organizar isso com segurança e te retorno com o próximo passo.";
  const knownFacts = new Set(params.fallbackState.facts_known || []);
  const missingData = new Set(params.fallbackState.missing_information || []);
  const forbiddenMoves = new Set<string>([
    "nao inventar andamento, prazo, valor, contrato, custas ou resultado juridico",
    "nao expor metodologia, guardrails ou bastidores ao interlocutor",
    "nao responder como roteiro; escrever como pessoa atenta em WhatsApp",
  ]);
  const responseGuidance = new Set<string>([
    "responder em portugues do Brasil, curto e natural",
    "usar no maximo uma pergunta principal",
    "se faltar dado, assumir lacuna com clareza em vez de fingir certeza",
  ]);
  let resolvedReference: MayusWhatsAppConversationFrame["resolved_reference"] = null;

  if (isOfficeOperatorActor(params.actorContext, input.processStatusContext)) {
    forbiddenMoves.add("nao perguntar se o interlocutor e cliente ou escritorio");
    forbiddenMoves.add("nao tratar processo do cliente como 'seu processo' do operador");
    responseGuidance.add("falar como copiloto interno do escritorio");
  }

  if (isOwnerNudgeContinuation) {
    knownFacts.add(`ultima mensagem real do operador: ${rawLastInbound}`);
    knownFacts.add(`retomar solicitacao pendente anterior: ${lastMessage}`);
    responseGuidance.add("tratar cobranca curta do operador como pedido para responder a solicitacao anterior");
    forbiddenMoves.add("nao gerar assunto novo nem listar processo antigo so porque houve cobranca curta");
  }

  if (isPureGreeting(lastMessage)) {
    resolutionType = "greeting";
    recommendedIntent = "client_support";
    conversationGoal = "abrir conversa limpa sem puxar contexto antigo";
    responseGuidance.add("nao citar processo, custas, CRM, lead ou historico antigo");
    responseGuidance.add("apenas cumprimentar e perguntar como pode ajudar");
    forbiddenMoves.add("nao se reapresentar se a conversa ja existe");
    safeFallbackReply = buildNaturalGreetingReply(lastMessage, input.contactName);
  } else if (ownerMultiIntentRequest && !ownerMultiIntentHasExplicitProcessReference) {
    resolutionType = "owner_multi_intent";
    recommendedIntent = "client_support";
    conversationGoal = "responder pedido interno misto sem puxar processo antigo";
    knownFacts.add("pedido interno multi-intencao: processo + vendas/CRM de hoje");
    knownFacts.add(buildOwnerSalesTodayLine(input.ownerOfficeSnapshot));
    missingData.add("nome do cliente ou CNJ do processo");
    responseGuidance.add("responder em blocos naturais: processo e vendas/CRM");
    responseGuidance.add("para processo sem referencia segura, pedir apenas nome do cliente ou CNJ");
    responseGuidance.add("para vendas/CRM, usar o snapshot do MAYUS; se nao houver dado confiavel, assumir a lacuna");
    forbiddenMoves.add("nao reaproveitar Margarete, Michele, Bradesco ou qualquer processo antigo sem referencia segura no turno");
    forbiddenMoves.add("nao listar candidatos processuais antigos");
    forbiddenMoves.add("nao perguntar qual banco, tema, assunto ou objetivo");
    safeFallbackReply = buildOwnerMultiIntentFallback({
      contactName: input.contactName,
      hasExplicitProcessReference: false,
      snapshot: input.ownerOfficeSnapshot,
    });
  } else if (statusFollowupCandidate) {
    resolutionType = "referenced_process";
    recommendedIntent = "process_status";
    resolvedReference = processCandidateFrame(statusFollowupCandidate);
    conversationGoal = "responder a situacao do processo ja escolhido sem fazer nova triagem";
    knownFacts.add(`processo ja escolhido: ${resolvedReference.label || resolvedReference.processNumber || "processo"}`);
    if (resolvedReference.summary) knownFacts.add(`resumo do processo: ${resolvedReference.summary}`);
    if (resolvedReference.currentStage) knownFacts.add(`fase/status: ${resolvedReference.currentStage}`);
    if (resolvedReference.lastMovementText) knownFacts.add(`ultimo registro: ${resolvedReference.lastMovementText}`);
    responseGuidance.add("responder o andamento disponivel do processo ja escolhido");
    responseGuidance.add("nao perguntar objetivo, proximo passo, assunto, providencia ou se e consulta mesmo");
    forbiddenMoves.add("nao transformar pedido de status em entrevista");
    forbiddenMoves.add("nao perguntar se quer acompanhar, baixar, agir ou aproveitar movimentacao");
    safeFallbackReply = buildReferencedProcessCandidateReply(statusFollowupCandidate);
  } else if (isConversationComplaint(lastMessage)) {
    resolutionType = "complaint";
    recommendedIntent = "client_support";
    conversationGoal = "reconhecer erro de contexto e pedir o ponto atual sem insistir na resposta anterior";
    responseGuidance.add("pedir desculpa de forma curta e nao repetir a pergunta errada");
    forbiddenMoves.add("nao defender a resposta anterior");
    forbiddenMoves.add("nao retomar alternativas processuais antigas");
    safeFallbackReply = `${cleanText(input.contactName) || "Entendi"}, você tem razão. Eu me confundi no contexto. Me diga só o ponto que você quer ver agora que eu sigo por ele.`;
  } else if (singleVerifiedProcessCandidate && (params.deterministicIntent === "process_status" || input.processStatusContext?.verified === true)) {
    resolutionType = "referenced_process";
    recommendedIntent = "process_status";
    resolvedReference = processCandidateFrame(singleVerifiedProcessCandidate);
    conversationGoal = "responder o processo verificado sem transformar status em entrevista";
    knownFacts.add(`processo verificado: ${resolvedReference.label || resolvedReference.processNumber || "processo"}`);
    if (resolvedReference.processNumber) knownFacts.add(`numero do processo: ${resolvedReference.processNumber}`);
    if (resolvedReference.summary) knownFacts.add(`resumo do processo: ${resolvedReference.summary}`);
    if (resolvedReference.currentStage) knownFacts.add(`fase/status: ${resolvedReference.currentStage}`);
    if (resolvedReference.lastMovementText) knownFacts.add(`ultimo registro: ${resolvedReference.lastMovementText}`);
    responseGuidance.add("responder direto o status/resumo do processo localizado");
    responseGuidance.add("nao perguntar qual e a duvida, objetivo, providencia, categoria, custas ou audiencia");
    forbiddenMoves.add("nao transformar processo localizado em entrevista");
    forbiddenMoves.add("nao pedir nome completo ou numero do processo quando o processo ja esta verificado");
    safeFallbackReply = buildReferencedProcessCandidateReply(singleVerifiedProcessCandidate);
  } else if (remainingProcessCandidates.length > 0) {
    resolutionType = "process_candidates";
    recommendedIntent = "process_status";
    conversationGoal = "mostrar os outros processos disponiveis sem retomar pergunta antiga";
    knownFacts.add(`outros processos encontrados: ${remainingProcessCandidates.length}`);
    responseGuidance.add("listar apenas os outros processos candidatos");
    responseGuidance.add("nao perguntar objetivo juridico nem assunto principal");
    forbiddenMoves.add("nao repetir a pergunta anterior");
    forbiddenMoves.add("nao perguntar se quer indenizacao, desconto, FGTS ou assunto principal");
    safeFallbackReply = buildProcessCandidatesReply({
      candidates: remainingProcessCandidates,
      clientName: input.processStatusContext?.clientName || lastAnsweredCandidate?.clientName,
      actorContext: params.actorContext,
      processStatusContext: input.processStatusContext,
    });
  } else if (referencedCandidate) {
    resolutionType = "referenced_process";
    recommendedIntent = "process_status";
    resolvedReference = processCandidateFrame(referencedCandidate);
    conversationGoal = "responder o processo que acabou de ser referenciado";
    knownFacts.add(`referencia resolvida: ${resolvedReference.label || resolvedReference.processNumber || "processo"}`);
    if (resolvedReference.summary) knownFacts.add(`resumo do processo: ${resolvedReference.summary}`);
    if (resolvedReference.currentStage) knownFacts.add(`fase/status: ${resolvedReference.currentStage}`);
    if (resolvedReference.lastMovementText) knownFacts.add(`ultimo registro: ${resolvedReference.lastMovementText}`);
    responseGuidance.add("responder apenas o processo referenciado");
    responseGuidance.add("nao perguntar assunto principal nem oferecer outros processos");
    forbiddenMoves.add("nao misturar outros candidatos processuais na resposta");
    safeFallbackReply = buildReferencedProcessCandidateReply(referencedCandidate);
  } else if (unmatchedProcessReference) {
    resolutionType = "unmatched_process_reference";
    recommendedIntent = "process_status";
    conversationGoal = "aceitar a referencia explicita do usuario e nao encaixar em candidatos errados";
    knownFacts.add(`referencia explicita informada: ${explicitProcessReference}`);
    responseGuidance.add("reconhecer a correcao do usuario");
    responseGuidance.add("tratar a referencia como uma nova busca/conferencia");
    forbiddenMoves.add("nao perguntar se a referencia e algum candidato antigo");
    forbiddenMoves.add("nao oferecer Bradesco/Caixa se o usuario disse Banco Master");
    safeFallbackReply = isOfficeOperatorActor(params.actorContext, input.processStatusContext)
      ? `${cleanText(input.contactName) || "Entendi"}, você tem razão. Vou tratar como ${explicitProcessReference} mesmo, sem confundir com outro banco. Na base carregada agora eu não encontrei esse processo com segurança; deixei como conferência por ${explicitProcessReference}.`
      : `Entendi. Vou tratar como ${explicitProcessReference} mesmo. Para não te passar informação errada, vou conferir esse processo na base antes de afirmar o andamento.`;
  } else if (hasVerifiedProcessCandidates) {
    resolutionType = "process_candidates";
    recommendedIntent = "process_status";
    conversationGoal = "mostrar os processos encontrados para o nome informado sem pergunta roteirizada";
    knownFacts.add(`processos encontrados: ${candidates.length}`);
    responseGuidance.add("listar os candidatos encontrados em blocos curtos");
    responseGuidance.add("nao perguntar assunto juridico, banco provavel ou tipo de acao");
    forbiddenMoves.add("nao se reapresentar no meio da conversa");
    forbiddenMoves.add("nao perguntar se e danos morais, FGTS, INPC ou outro assunto");
    safeFallbackReply = buildProcessCandidatesReply({
      candidates,
      clientName: input.processStatusContext?.clientName,
      actorContext: params.actorContext,
      processStatusContext: input.processStatusContext,
    });
  } else if (genericProcessRequest) {
    resolutionType = "generic_process_request";
    recommendedIntent = "process_status";
    conversationGoal = "pedir identificador minimo do processo sem aproveitar processo antigo";
    missingData.add(isOfficeOperatorActor(params.actorContext, input.processStatusContext) ? "nome completo do cliente ou numero do processo" : "numero do processo/CNJ ou CPF");
    responseGuidance.add("pedir somente o identificador minimo");
    forbiddenMoves.add("nao perguntar tema juridico, banco, tipo de acao ou assunto principal");
    safeFallbackReply = safeGenericProcessIdentifierReply(input.processStatusContext, params.actorContext);
  } else if (shortProcessNudge) {
    resolutionType = "short_process_nudge";
    recommendedIntent = "process_status";
    conversationGoal = "responder cobranca curta mantendo localizacao segura";
    responseGuidance.add("ser direto e nao retomar processo sem fonte");
    safeFallbackReply = "Estou localizando com segurança. Se tiver o número do processo/CNJ, me mande que eu confirmo mais rápido.";
  } else if (commercialTriage) {
    resolutionType = "commercial_triage";
    recommendedIntent = "legal_triage";
    conversationGoal = "qualificar a nova demanda comercial/juridica sem contaminar com processo antigo";
    responseGuidance.add("reconhecer a mudanca de assunto e fazer uma pergunta consultiva");
    safeFallbackReply = "Entendi. Isso agora é sobre o desconto no contracheque/benefício. Me diga: aparece com qual nome no documento?";
  } else if (unverifiedProcessStatus) {
    resolutionType = "unverified_process_status";
    recommendedIntent = "process_status";
    conversationGoal = "pedir identificador seguro antes de informar andamento";
    responseGuidance.add("pedir o dado minimo para localizar com seguranca");
    safeFallbackReply = processFallbackReply(input.processStatusContext, params.actorContext);
  }

  const hardGuardrailReason = hardGuardrailReasonForResolution(resolutionType);

  return {
    resolution_type: resolutionType,
    actor_context: params.actorContext,
    last_message: lastMessage,
    recommended_intent: recommendedIntent,
    writer_mode: hardGuardrailReason ? "deterministic_guardrail" : "llm_natural",
    llm_writer_allowed: !hardGuardrailReason,
    hard_guardrail_reason: hardGuardrailReason,
    conversation_goal: conversationGoal,
    known_facts: Array.from(knownFacts).slice(0, 12),
    missing_data: Array.from(missingData).slice(0, 10),
    forbidden_moves: Array.from(forbiddenMoves),
    response_guidance: Array.from(responseGuidance),
    resolved_reference: resolvedReference,
    candidate_summaries: processCandidateSummaries(candidates),
    safe_fallback_reply: safeFallbackReply,
  };
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
  const text = normalizeText(value)
    .replace(/[?!.,;:]+/g, " ")
    .replace(/\b(mayus|maya)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return false;
  if (/processo|caso|cliente|cpf|cnj|andamento|status|atualizacao|novidade|documento|boleto|contrato|prazo/.test(text)) return false;
  return /^(oi|ola|bom dia|boa tarde|boa noite|boa|tudo bem|oi tudo bem|ola tudo bem|bom dia tudo bem|boa tarde tudo bem|boa noite tudo bem|tudo bem e vc|tudo bem e voce|oi tudo bem e vc|oi tudo bem e voce)$/.test(text);
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
    return /aqui (e|sou) o mayus|sou o mayus|eu sou o mayus|mayus, assistente|aqui (e|sou) a maya|sou a maya|eu sou a maya|maya, assistente/.test(normalized);
  });
}

function hasMayusIntroducedRecently(messages: WhatsAppSalesMessage[], windowMs = 12 * 60 * 60 * 1000) {
  const lastInbound = getLastInbound(messages);
  const referenceTime = new Date(lastInbound?.created_at || "").getTime();
  const now = Number.isFinite(referenceTime) ? referenceTime : Date.now();
  return messages.some((message) => {
    if (message.direction !== "outbound" || !isRecentMessage(message, now, windowMs)) return false;
    const normalized = normalizeText(message.content);
    return /aqui (e|sou) o mayus|sou o mayus|eu sou o mayus|mayus, assistente|aqui (e|sou) a maya|sou a maya|eu sou a maya|maya, assistente/.test(normalized);
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
  const turnStartsClean = isPureGreeting(digest.lastInbound);
  const previous = turnStartsClean ? {} : input.previousMayusEvent?.conversation_state || {};
  const facts = new Set<string>();
  const missing = new Set<string>();
  const objections = new Set<string>();
  const documents = new Set<string>();
  const text = digest.normalized;
  const hasCrm = !turnStartsClean && Boolean(input.crmContext?.crm_task_id);
  const hasVerifiedProcessStatus = !turnStartsClean && input.processStatusContext?.verified === true;
  const actorContext = normalizeWhatsAppActorContext(input);
  const hasIntroduced = hasMayusIntroducedRecently(input.messages);
  const hasDocumentContext = input.messages.some((message) => Boolean(cleanText(message.media_summary) || cleanText(message.media_text) || /documento|imagem|pdf|contracheque/i.test(String(message.content || ""))));
  const processCandidates = turnStartsClean
    ? []
    : normalizeProcessCandidateMemory(input.processStatusContext?.candidateProcesses || previous.last_process_candidates);

  if (digest.lastInbound) facts.add(`ultima mensagem do cliente: ${digest.lastInbound}`);
  if (isOfficeOperatorActor(actorContext, input.processStatusContext)) facts.add("interlocutor e dono/equipe autorizada do escritorio; tratar como pedido interno");
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

  if (turnStartsClean) {
    return {
      conversation_role: "support",
      conversation_goal: "abrir conversa limpa sem puxar contexto antigo",
      customer_temperature: "existing_client",
      stage: "new",
      facts_known: digest.lastInbound ? [`ultima mensagem do cliente: ${digest.lastInbound}`] : [],
      missing_information: [],
      objections: [],
      urgency: "none",
      decision_maker: "unknown",
      documents_requested: [],
      last_customer_message: digest.lastInbound,
      last_mayus_message: digest.lastOutbound,
      last_commitment: null,
      next_action: "abrir conversa limpa sem puxar contexto antigo",
      has_mayus_introduced: hasIntroduced,
      conversation_summary: summarizeMessages(input.messages).slice(0, 1200),
      last_process_candidates: undefined,
    };
  }

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
  } else if (/andamento|status|situacao|meu processo|meu caso|processos? d[aeo]|casos? d[aeo]|gostaria de saber (sobre |de )?(o |um )?processo|queria saber (sobre |de )?(o |um )?processo|saber (sobre |de )?(o |um )?processo|saber como esta (o |um )?processo|como esta (o |um )?processo|atualizacao do processo|atualizacao do caso|novidade no processo|numero do processo|cnj|movimentacao|movimentacao/.test(lastInbound) || (looksLikeFullName(rawLastInbound) && processStatusContext)) {
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
  if (/urgente|liminar|audiencia|bloqueio|prisao|despejo|prazo fatal|hoje/.test(lastInbound) && !isOwnerSalesTodayRequest(rawLastInbound)) riskFlags.push("legal_urgency");
  if (/o que devo fazer juridicamente|posso processar|qual tese|qual recurso|me oriente juridicamente/.test(lastInbound)) riskFlags.push("sensitive_legal_advice");
  if (processStatusContext?.riskFlags?.length) riskFlags.push(...processStatusContext.riskFlags);

  return { intent, riskFlags: Array.from(new Set(riskFlags)) };
}

function chooseModel(input: MayusOperatingPartnerInput) {
  const defaultModel = cleanText(input.salesTestbench?.default_model);
  return defaultModel || null;
}

function summarizePracticeAreaPlaybooks(playbooks?: OfficePracticeAreaPlaybook[] | null) {
  if (!playbooks?.length) return "";

  return playbooks
    .slice(0, 4)
    .map((playbook) => [
      `${playbook.area}:`,
      playbook.default_pipeline?.length ? `pipeline ${playbook.default_pipeline.join(" > ")}` : null,
      playbook.required_documents?.length ? `documentos ${playbook.required_documents.slice(0, 5).join(", ")}` : null,
      playbook.owner_team ? `responsavel ${playbook.owner_team}` : null,
      `status ${playbook.validation_status}`,
    ].filter(Boolean).join(" "))
    .join(" | ");
}

function buildPrompt(input: MayusOperatingPartnerInput, config: MayusOperatingPartnerConfig, model: string, deterministicIntent: MayusOperatingPartnerIntent, state: MayusConversationState, closingReadiness: MayusClosingReadiness, supportSummary: MayusSupportSummary, actorContext: MayusWhatsAppActorContext, conversationFrame: MayusWhatsAppConversationFrame) {
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
  const officePermissionPolicy = cleanText(officeProfile.permissionPolicy);
  const officeCalendarPolicy = cleanText(officeProfile.calendarPolicy);
  const officeFinancePolicy = cleanText(officeProfile.financePolicy);
  const officePlaybookNotes = cleanText(officeProfile.playbookNotes);
  const operationalMethodologyStatus = cleanText(officeProfile.operationalMethodologyStatus);
  const operationalMethodologySummary = cleanText(officeProfile.operationalMethodologySummary);
  const officeAreaPlaybooks = summarizePracticeAreaPlaybooks(officeProfile.practiceAreaPlaybooks);
  const assistantName = cleanText(officeProfile.assistantName) || "MAYUS";
  const institutionalMemory = buildInstitutionalMemoryPromptBlock(input.institutionalMemory ?? [], MAYUS_OPERATING_PARTNER_INSTITUTIONAL_MEMORY_CAP);

  return [
    `Voce e ${assistantName}, assistente virtual operacional de um escritorio de advocacia brasileiro. O motor interno e o MAYUS, mas no WhatsApp use o nome configurado da assistente.`,
    "Sua funcao e conduzir a conversa inteira: vender, qualificar, dar suporte, organizar proximos passos e acionar humano quando houver risco.",
    "Nao responda a mensagem isolada. Voce e responsavel pela continuidade da conversa, como vendedor consultivo e suporte do escritorio.",
    "O MAYUS ja montou um Conversation Brain Frame com ator, fatos, referencia resolvida, lacunas, proibicoes e objetivo. Use esse frame como fonte principal de contexto.",
    "Voce e o escritor natural da resposta: nao copie frase pronta, nao use template, nao exponha o frame, nao explique o bastidor. Escreva como uma pessoa atenta no WhatsApp.",
    "Se writer_mode for llm_natural, voce e o escritor principal: responda com naturalidade usando os fatos do frame, sem criar entrevista.",
    "Se houver processo verificado ou referencia processual resolvida, responda o resumo disponivel do processo. Nao pergunte objetivo, foco, providencia, urgencia, consulta mesmo ou o que a pessoa precisa decidir.",
    "Se o operador pedir para analisar e passar ao cliente, entregue um resumo claro que o operador possa encaminhar, com status, ultima movimentacao e lacunas, sem nova pergunta.",
    "Se o frame trouxer resolved_reference, responda esse item diretamente. Se o frame for greeting, responda so a saudacao limpa. Se o frame pedir identificador minimo, peca apenas esse dado.",
    "Sempre escolha primeiro o papel da conversa: seller, support, case_status, billing, legal_triage ou handoff. A resposta deve cumprir esse papel.",
    "Nao aja como chatbot aleatorio. Use o historico, nao presuma que o cliente pediu status de processo se ele nao pediu.",
    "Se a ultima mensagem do cliente for apenas saudacao (bom dia, boa tarde, boa noite, oi/ola, oi MAYUS, oi Maya), responda so de forma natural e curta: 'Oi, tudo bem? Como posso ajudar?'. Nao retome processo ou peca dados processuais so pelo historico.",
    "Nunca invente andamento de processo, valor, contrato, cobranca, prazo, documento ou promessa juridica.",
    "Se o cliente pedir status de processo sem base confirmada, diga que vai tratar com seguranca e peca identificador minimo ou escale.",
    "Se houver Contexto processual verificado, responda o status em linguagem simples: fase atual, ultima movimentacao, significado pratico, proximo passo e pendencia do cliente. Nao use juridiques e nao prometa resultado.",
    "Contexto processual verificado e fonte de fatos, nao texto para copiar. Ignore clientReply se aparecer; use candidateProcesses, resumo, parte contraria, fase, ultima movimentacao e fontes para redigir como atendente humano.",
    "Se houver varios candidateProcesses verificados para o mesmo cliente, responda todos diretamente em blocos curtos. Nao pergunte se o cliente quer resumo, nao pergunte se prefere um especifico, nao adie a resposta.",
    "Se houver um unico processo verificado, responda direto o que foi encontrado e o que significa em termos simples. Nao termine com 'quer que eu detalhe?' quando ja ha fatos suficientes.",
    "Se o interlocutor for office_operator, trate como dono/equipe autorizada do escritorio: fale como copiloto interno, nao como atendimento externo.",
    "Para office_operator, nunca pergunte se ele e cliente ou do escritorio; isso ja foi verificado pelo telefone autorizado.",
    "Para office_operator em pedido processual, use cliente, processo, base e ponto de conferencia. Nao use 'seu processo' nem pergunte 'voce pagou' custas/preparo/guia.",
    "Para office_operator em pedido misto, responda como copiloto interno em blocos naturais. Se ele perguntar processo e venda/CRM no mesmo turno, trate as duas partes; nao ignore a parte comercial.",
    "Para office_operator, mensagens como 'Pode me responder' retomam a ultima solicitacao pendente do proprio operador. Nao gere assunto aleatorio nem use processo antigo.",
    "Se o pedido processual do office_operator nao trouxer nome, CNJ ou referencia segura no turno, peca so esse identificador. Nao puxe Margarete, Michele, Bradesco ou outro processo antigo por memoria fraca.",
    "Se houver snapshot de vendas/CRM do escritorio, use-o como fonte. Se o snapshot nao trouxer venda confiavel hoje, diga isso com naturalidade em vez de inventar.",
    "Se custas, preparo, guia ou gratuidade nao estiverem confirmados na base, diga que nao consta confirmacao e deixe como ponto interno de conferencia.",
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
    `Nao se reapresente como ${assistantName} em saudacao simples ou conversa em andamento. So apresente a assistente se for absolutamente necessario para um primeiro contato externo e sem usar frase fixa.`,
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
    `Interlocutor WhatsApp: ${actorContext.role}`,
    `Telefone autorizado do escritorio: ${actorContext.sender_phone_authorized ? "sim" : "nao"}`,
    `Motivo do contexto do interlocutor: ${actorContext.reason || "nao informado"}`,
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
    `Politica de permissoes/aprovacoes: ${officePermissionPolicy || "nao configurada"}`,
    `Politica de agenda: ${officeCalendarPolicy || "nao configurada"}`,
    `Politica financeira operacional: ${officeFinancePolicy || "nao configurada"}`,
    `Metodologia operacional: ${operationalMethodologySummary || "nao configurada"}`,
    `Status da metodologia operacional: ${operationalMethodologyStatus || "nao configurado"}`,
    `Playbooks operacionais: ${officePlaybookNotes || "nao configurados"}`,
    `Playbooks por area juridica: ${officeAreaPlaybooks || "nao configurados"}`,
    institutionalMemory.block,
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
    "Snapshot operacional do escritorio para dono/equipe:",
    JSON.stringify(input.ownerOfficeSnapshot || null),
    "",
    "Contexto processual verificado:",
    JSON.stringify(input.processStatusContext || null),
    "",
    "Conversation Brain Frame do MAYUS:",
    JSON.stringify(conversationFrame),
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
  if (/qual .*banco|qual .*tema|banco\/tema|saude.*desconto|desconto\/rmc|danos morais/.test(text)) return true;
  return /quer (que eu )?(te )?(passe|envie|mande|faca)? ?(um )?resumo|prefere (ver|que eu veja|um deles|algum deles)|quer (que eu )?(detalhe|explique)|quer ver um|qual (desses|deles|processo|caso)|me diga (so )?qual (desses|deles)|qual .*voce quer (acompanhar|ver|detalhar)|foco agora|situacao geral|situa[cç][aã]o geral|providencia pratica|provid[eê]ncia pr[aá]tica|consulta mesmo|acompanhamento.*urgencia|urgencia.*acompanhamento|o que voce precisa decidir|responder algo|apresentar documento|evitar bloqueio|evitar pagamento|aproveitar alguma movimenta[cç][aã]o|se (voce )?nao souber.*(numero do processo|foto do documento)/.test(text);
}

function asksKnownOfficeIdentity(reply: string | null | undefined, actorContext?: MayusWhatsAppActorContext | null, processStatusContext?: WhatsAppProcessStatusContext | null) {
  if (!isOfficeOperatorActor(actorContext, processStatusContext)) return false;
  const text = normalizeText(reply);
  return /voce (e|eh|esta falando como).{0,80}(cliente|escritorio|advogado|dono|equipe)|cliente ou (do )?escritorio|escritorio ou cliente|voce faz parte do escritorio|e do escritorio ou/.test(text);
}

function asksInternalCostPayment(reply: string | null | undefined, actorContext?: MayusWhatsAppActorContext | null, processStatusContext?: WhatsAppProcessStatusContext | null) {
  if (!isOfficeOperatorActor(actorContext, processStatusContext)) return false;
  const text = normalizeText(reply);
  if (!/(custas|preparo|guia|gratuidade|taxa judiciaria)/.test(text)) return false;
  return /voce.{0,80}(pagou|pagaram|quitou|recolheu)|voces.{0,80}(pagaram|pagou|quitaram|recolheram)|cliente.{0,80}(pagou|quitou|recolheu)|confirme.{0,80}(pagamento|pagou|custas|preparo|guia)|me diga.{0,80}(pagou|custas|preparo|guia)|as custas foram pagas|custas.*\?|preparo.*\?|guia.*\?/.test(text);
}

function usesExternalProcessPossessiveForInternalActor(reply: string | null | undefined, actorContext?: MayusWhatsAppActorContext | null, processStatusContext?: WhatsAppProcessStatusContext | null) {
  if (!isOfficeOperatorActor(actorContext, processStatusContext)) return false;
  const text = normalizeText(reply);
  return /\b(seu|sua)\s+(processo|caso|acao|demanda)\b|\bdo seu cliente\b/.test(text);
}

function isSafeProcessIdentifierRequest(reply: string | null | undefined) {
  const text = normalizeText(reply);
  if (!/nome completo|nome do cliente|cnj|numero do processo|identificador|localizar com seguranca|confirmar.*nome|confirme.*nome|qual e o seu nome/.test(text)) return false;
  return !/fase de|ultima movimentacao|prazo|sentenca|replica|contestacao juntada|liminar|audiencia|decisao saiu|ganhar/.test(text);
}

function isGenericProcessStatusRequestWithoutReference(value?: string | null) {
  const text = normalizeText(value);
  if (!/processo|caso|andamento|status|situacao|atualizacao|novidade/.test(text)) return false;
  if (/\d{7}-\d{2}|cnj|cpf|cnpj|processos? d[aeo]\s+[a-z]{2,}|casos? d[aeo]\s+[a-z]{2,}|nome completo\s+(e|eh)/.test(text)) return false;
  return /um processo|sobre um processo|saber sobre um processo|situacao do processo|situacao do caso|me pass(a|e|ar).{0,30}situacao|gostaria de saber (sobre |de )?(o |um )?processo|queria saber (sobre |de )?(o |um )?processo|saber como esta (o |um )?processo|como esta (o |um )?processo/.test(text);
}

function isCommercialTriageMessage(value?: string | null) {
  const text = normalizeText(value);
  return /contracheque|holerite|folha|desconto|descontando|consignado|credcesta|rmc|rcc|cartao beneficio|cartao consignado|beneficio|beneficio do inss|inss|aposentadoria|bpc|loas/.test(text);
}

function safeGenericProcessIdentifierReply(processStatusContext?: WhatsAppProcessStatusContext | null, actorContext?: MayusWhatsAppActorContext | null) {
  return isOfficeOperatorActor(actorContext, processStatusContext)
    ? "Claro. Para eu localizar com segurança, me mande o nome completo do cliente ou o número do processo."
    : "Claro. Para eu localizar com segurança, me mande o número do processo/CNJ ou CPF.";
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

function processFallbackReply(processStatusContext?: WhatsAppProcessStatusContext | null, actorContext?: MayusWhatsAppActorContext | null) {
  const missingSignals = processStatusContext?.grounding?.missingSignals || [];
  const candidates = processStatusContext?.candidateProcesses || [];
  if (missingSignals.includes("mais de um processo possivel") && candidates.length > 0) {
    const clientName = cleanText(candidates.find((candidate) => candidate.clientName)?.clientName);
    const options = candidates.slice(0, 3).map((candidate, index) => {
      const ref = cleanText(candidate.processNumber) || cleanText(candidate.title) || `opção ${index + 1}`;
      const detail = cleanText(candidate.currentStage) || cleanText(candidate.title);
      return `${index + 1}. ${ref}${detail ? ` - ${detail}` : ""}`;
    }).join("\n");
    if (isOfficeOperatorActor(actorContext, processStatusContext)) {
      return `${clientName ? `Achei mais de um processo para ${clientName}.` : "Achei mais de um processo possível."}\n\n${options}\n\nQual você quer ver primeiro?`;
    }
    return `${clientName ? `Encontrei mais de um processo para ${clientName}.` : "Encontrei mais de um processo possível."} Me diga qual deles você quer que eu detalhe:\n\n${options}`;
  }
  if (missingSignals.includes("processo nao localizado") || missingSignals.includes("process_access_needs_strong_identifier")) {
    return isOfficeOperatorActor(actorContext, processStatusContext)
      ? "Não localizei com segurança só por esse dado. Me mande o nome completo do cliente, número do processo/CNJ ou CPF/CNPJ para eu confirmar."
      : "Não localizei com segurança só por esse dado. Me mande o número do processo/CNJ ou CPF para eu confirmar.";
  }
  if (missingSignals.includes("mais de um processo possivel")) {
    return "Encontrei mais de uma possibilidade. Me mande o número do processo/CNJ ou CPF/CNPJ para eu confirmar o processo certo.";
  }
  return safeGenericProcessIdentifierReply(processStatusContext, actorContext);
}

function visibleOfficeName(value?: string | null) {
  const text = cleanText(value);
  if (!text || /^mayus$/i.test(text)) return null;
  return text;
}

function greetingLabel(value?: string | null) {
  const text = normalizeText(value);
  if (/^(oi|ola)\b/.test(text)) return "Oi";
  if (/bom dia/.test(text)) return "Bom dia";
  if (/boa tarde/.test(text)) return "Boa tarde";
  if (/boa noite/.test(text)) return "Boa noite";
  return "Oi";
}

function buildNaturalGreetingReply(value?: string | null, contactName?: string | null) {
  const label = greetingLabel(value);
  const name = cleanText(contactName);
  if (label === "Oi") {
    return `Oi${name ? `, ${name}` : ""}, tudo bem? Como posso ajudar?`;
  }
  return `${label}${name ? `, ${name}` : ""}. Como posso ajudar?`;
}

function stripAssistantReintroduction(reply: string) {
  return reply
    .replace(/^\s*(oi|ola|olá|bom dia|boa tarde|boa noite)[,!.\s]*(?:[^.?!]{0,80}[,!.\s]*)?(?:eu sou|aqui (?:e|é|sou))\s+(?:a\s+)?(?:maya|mayus)[^.?!]*[.?!]\s*/i, "")
    .replace(/^\s*[^.?!]{1,80},\s*(?:eu sou|aqui (?:e|é|sou))\s+(?:a\s+)?(?:maya|mayus)[^.?!]*[.?!]\s*/i, "")
    .replace(/^\s*(?:eu sou|aqui (?:e|é|sou))\s+(?:a\s+)?(?:maya|mayus)[^.?!]*[.?!]\s*/i, "")
    .trim();
}

function sanitizeReplyForConversation(reply: string | null, state: MayusConversationState, params?: { assistantName?: string | null; officeName?: string | null; contactName?: string | null }) {
  const lastMessage = cleanText(state.last_customer_message);
  if (isPureGreeting(lastMessage)) {
    const greetingReply = stripAssistantReintroduction(cleanText(reply) || "");
    return greetingReply || buildNaturalGreetingReply(lastMessage, params?.contactName);
  }

  let text = cleanText(reply) || "Entendi. Me diga so o ponto principal para eu organizar o proximo passo certo.";
  text = stripAssistantReintroduction(text);
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

function normalizeProcessStatusReplyTone(reply: string, frame: MayusWhatsAppConversationFrame) {
  if (frame.resolution_type !== "referenced_process") return reply;
  return reply
    .replace(/^A do ([^:\n.]+):/i, "Processo do $1:")
    .replace(/^A do ([^:\n.]+) está/i, "Processo do $1 está")
    .replace(/^A do ([^:\n.]+) esta/i, "Processo do $1 esta");
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

function detectOwnerCommandSignal(message: string | null | undefined) {
  const normalized = normalizeText(message);
  if (!normalized) return false;
  return /\b(mayus|maya)\b/.test(normalized)
    && /\b(comando|relatorio|painel|dashboard|rotina|agente|configur|organize|resuma|analise)\b/.test(normalized);
}

function classifyOperatingPartnerConversation(decision: MayusOperatingPartnerDecision): MayusOperatingPartnerConversationClassification {
  const hasHighRisk = decision.risk_flags.some((flag) => HIGH_RISK_FLAGS.includes(flag));
  const lastMessage = decision.conversation_state.last_customer_message;
  const hasDocumentIntent = decision.support_summary.issue_type === "documents"
    || decision.actions_to_execute.some((action) => action.type === "request_document")
    || decision.conversation_state.documents_requested.length > 0;

  let conversationClass: MayusOperatingPartnerConversationClass = "unclear";
  if (detectOwnerCommandSignal(lastMessage)) {
    conversationClass = "owner_command";
  } else if (decision.intent === "billing" || decision.support_summary.issue_type === "billing") {
    conversationClass = "billing";
  } else if (decision.intent === "process_status" || decision.support_summary.issue_type === "process_status" || decision.conversation_state.conversation_role === "case_status") {
    conversationClass = "process_status";
  } else if (decision.intent === "sales_qualification" || decision.intent === "sales_closing" || decision.intent === "legal_triage") {
    conversationClass = "commercial";
  } else if (hasDocumentIntent) {
    conversationClass = "documents";
  } else if (decision.intent === "client_support" || decision.intent === "setup_help" || decision.conversation_state.conversation_role === "support") {
    conversationClass = "support";
  }

  const surface: MayusOperatingPartnerPolicySurface = conversationClass === "billing"
    ? "billing"
    : conversationClass === "support" || conversationClass === "process_status" || conversationClass === "documents" || conversationClass === "owner_command"
      ? "support_response"
      : "external_message";

  const requiresReview = decision.requires_approval || !decision.should_auto_send || hasHighRisk;
  const reasonByClass: Record<MayusOperatingPartnerConversationClass, string> = {
    commercial: "conversa comercial/triagem deve conduzir proxima pergunta sem promessa de fechamento",
    support: "atendimento de suporte precisa responder curto e manter handoff quando faltar base",
    process_status: "status processual exige processo verificado antes de informar andamento",
    documents: "pedido/documento precisa virar coleta segura sem conclusao juridica automatica",
    billing: "cobranca ou contrato fica supervisionado por politica financeira",
    owner_command: "comando do dono precisa deixar rastro operacional antes de agir",
    unclear: "classificacao incerta deve ficar como rascunho supervisionado",
  };

  return {
    class: conversationClass,
    surface,
    owner: "MAYUS Operating Partner",
    confidence: decision.confidence,
    requires_human_review: requiresReview,
    next_action: decision.next_action,
    reason: reasonByClass[conversationClass],
  };
}

function buildOperatingPartnerAgenticGovernance(
  decision: MayusOperatingPartnerDecision,
  classification: MayusOperatingPartnerConversationClassification,
): MayusOperatingPartnerAgenticGovernance {
  const outcome = decision.requires_approval
    ? "requires_approval"
    : decision.should_auto_send
      ? "allowed"
      : "draft_only";
  const blockedLayer = outcome === "requires_approval"
    ? "human_review"
    : outcome === "draft_only"
      ? "operator_review"
      : null;
  const status = outcome === "requires_approval"
    ? "awaiting_approval"
    : outcome === "allowed"
      ? "ready"
      : "drafted";

  return {
    paperclip_mission: {
      mission: "whatsapp_conversation",
      owner: "MAYUS Operating Partner",
      routine: "whatsapp_agentic_beta",
      budget: "single_message",
      next_action: decision.next_action,
      pending_approval: decision.requires_approval,
      reconstructable: true,
      trace_required: true,
    },
    openclaw_policy: {
      surface: classification.surface,
      outcome,
      requires_approval: decision.requires_approval,
      can_execute_now: decision.should_auto_send,
      blocked_layer: blockedLayer,
      reason: classification.reason,
    },
    hermes_trajectory: {
      status,
      tenant_learning_scope: "tenant_only",
      events: [
        {
          type: "objective",
          summary: `Conduzir conversa WhatsApp classificada como ${classification.class}.`,
          payload: {
            intent: decision.intent,
            surface: classification.surface,
            whatsapp_actor_role: decision.whatsapp_actor_context?.role || "unknown",
            sender_phone_authorized: decision.whatsapp_actor_context?.sender_phone_authorized === true,
          },
        },
        {
          type: "decision",
          summary: decision.next_action,
          payload: {
            confidence: decision.confidence,
            should_auto_send: decision.should_auto_send,
            requires_approval: decision.requires_approval,
            whatsapp_actor_role: decision.whatsapp_actor_context?.role || "unknown",
          },
        },
        decision.requires_approval
          ? {
            type: "block",
            summary: "Resposta fica aguardando revisao humana antes de envio externo.",
            payload: {
              risk_flags: decision.risk_flags,
              external_side_effects_blocked: true,
            },
          }
          : {
            type: "artifact",
            summary: "Rastro do rascunho/resposta registrado em system_event_logs.",
            payload: {
              trace_required: true,
              tenant_learning_scope: "tenant_only",
            },
          },
      ],
    },
  };
}

function withOperatingPartnerAgenticContext(decision: MayusOperatingPartnerDecision): MayusOperatingPartnerDecision {
  const classification = classifyOperatingPartnerConversation(decision);
  return {
    ...decision,
    conversation_classification: classification,
    agentic_governance: buildOperatingPartnerAgenticGovernance(decision, classification),
  };
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
  whatsappActorContext?: MayusWhatsAppActorContext;
  conversationFrame?: MayusWhatsAppConversationFrame;
  qualityCheck?: MayusWhatsAppReplyQualityCheck;
  finalResponseSource?: MayusOperatingPartnerDecision["final_response_source"];
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
  const sanitizedReply = sanitizeReplyForConversation(rawReply, conversationState, {
    assistantName: params.assistantName,
    officeName: params.officeName,
    contactName: params.contactName,
  });

  return withOperatingPartnerAgenticContext({
    reply: params.conversationFrame
      ? normalizeProcessStatusReplyTone(sanitizedReply, params.conversationFrame)
      : sanitizedReply,
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
    whatsapp_actor_context: params.whatsappActorContext,
    conversation_frame: params.conversationFrame,
    quality_check: params.qualityCheck,
    final_response_source: params.finalResponseSource || "deterministic_guardrail",
  });
}

function buildSafeFallbackDecisionFromFrame(params: {
  input: MayusOperatingPartnerInput;
  config: MayusOperatingPartnerConfig;
  conversationFrame: MayusWhatsAppConversationFrame;
  fallbackState: MayusConversationState;
  fallbackClosingReadiness: MayusClosingReadiness;
  fallbackSupportSummary: MayusSupportSummary;
  error?: unknown;
}): MayusOperatingPartnerDecision {
  const qualityCheck: MayusWhatsAppReplyQualityCheck = {
    status: "pass",
    flags: ["llm_unavailable_safe_fallback"],
    reasons: [params.error instanceof Error ? params.error.message : "LLM indisponivel; usando fallback seguro do frame."],
  };

  return buildDeterministicDecision({
    config: params.config,
    reply: params.conversationFrame.safe_fallback_reply,
    intent: params.conversationFrame.recommended_intent,
    confidence: params.conversationFrame.resolution_type === "open_llm" ? 0.62 : 0.86,
    state: {
      ...params.fallbackState,
      conversation_goal: params.conversationFrame.conversation_goal,
      next_action: params.conversationFrame.conversation_goal,
    },
    closingReadiness: params.fallbackClosingReadiness,
    supportSummary: params.fallbackSupportSummary,
    riskFlags: ["llm_unavailable_safe_fallback"],
    nextAction: params.conversationFrame.conversation_goal,
    actions: [{ type: "add_internal_note", title: "Registrar fallback seguro do WhatsApp Conversation Brain", requires_approval: false }],
    requiresApproval: params.conversationFrame.resolution_type === "open_llm",
    expectedOutcome: "responder de forma segura quando o provedor LLM falhar",
    reasoning: "Fallback usado apenas porque o LLM natural nao respondeu; o frame continua sendo a fonte de contexto.",
    assistantName: params.input.officeKnowledgeProfile?.assistantName,
    officeName: params.input.officeKnowledgeProfile?.officeName,
    contactName: params.input.contactName,
    whatsappActorContext: params.conversationFrame.actor_context,
    conversationFrame: params.conversationFrame,
    qualityCheck,
    finalResponseSource: "safe_fallback",
  });
}

function canUseFactualProcessFallback(decision: MayusOperatingPartnerDecision | null | undefined) {
  const resolutionType = decision?.conversation_frame?.resolution_type;
  const frameIntent = decision?.conversation_frame?.recommended_intent;
  return (decision?.intent === "process_status" || frameIntent === "process_status" || resolutionType === "greeting")
    && (resolutionType === "referenced_process" || resolutionType === "process_candidates" || resolutionType === "greeting")
    && Boolean(cleanText(decision?.conversation_frame?.safe_fallback_reply));
}

function buildFactualProcessFallbackDecision(decision: MayusOperatingPartnerDecision, reasonFlag: string): MayusOperatingPartnerDecision {
  const frame = decision.conversation_frame!;
  const qualityCheck: MayusWhatsAppReplyQualityCheck = {
    status: "pass",
    flags: [reasonFlag],
    reasons: ["O LLM tentou entrevistar ou falhou no reparo; MAYUS respondeu com o resumo factual do processo."],
  };
  const conversationState = {
    ...decision.conversation_state,
    conversation_goal: frame.conversation_goal,
    next_action: frame.conversation_goal,
  };

  return withOperatingPartnerAgenticContext({
    ...decision,
    reply: normalizeProcessStatusReplyTone(sanitizeReplyForConversation(frame.safe_fallback_reply, conversationState), frame),
    reply_blocks: frame.resolution_type === "process_candidates"
      ? frame.safe_fallback_reply.split(/\n{2,}/).map((block) => cleanText(block)).filter(Boolean) as string[]
      : undefined,
    risk_flags: decision.risk_flags.filter((flag) => !REPAIRABLE_RISK_FLAGS.includes(flag) && flag !== "reply_repair_still_unsafe" && flag !== "reply_repair_failed"),
    next_action: frame.conversation_goal,
    conversation_state: conversationState,
    reasoning_summary_for_team: "Fallback factual usado porque a resposta natural tentou fazer entrevista desnecessaria em status processual verificado.",
    actions_to_execute: decision.actions_to_execute.length ? decision.actions_to_execute : [{ type: "answer_support", title: "Responder resumo factual do processo", requires_approval: false }],
    requires_approval: false,
    should_auto_send: true,
    model_used: "deterministic",
    provider: "mayus",
    expected_outcome: "entregar resumo do processo sem nova pergunta",
    quality_check: qualityCheck,
    final_response_source: "safe_fallback",
  });
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

function includesAnyProcessCandidate(text: string, candidates: NonNullable<MayusWhatsAppConversationFrame["candidate_summaries"]>, exceptReferences?: Array<string | null | undefined>) {
  const normalized = normalizeText(text);
  const except = new Set((exceptReferences || []).map((value) => normalizeText(value)).filter(Boolean));
  return candidates.some((candidate) => {
    const refs = [candidate.label, candidate.opposingParty, candidate.processNumber]
      .map((value) => normalizeText(value))
      .filter((value) => value && !except.has(value) && value.length >= 4);
    return refs.some((ref) => normalized.includes(ref));
  });
}

function asksResolvedProcessInterviewQuestion(text: string) {
  if (/qual .*banco|qual .*tema|banco\/tema|saude.*desconto|desconto\/rmc|danos morais/.test(text)) return true;
  return /qual .*assunto principal|qual .*assunto|assunto principal|qual .*objetivo|objetivo principal|qual .*foco|foco agora|seu foco|qual .*duvida|confirmar (sua )?(duvida|d[uú]vida)|duvida principal|tratar desconto|desconto\/valores|desconto ou valores|andamento.{0,80}(ou|\/).{0,80}(desconto|valor|custas|pagamento)|desconto.{0,80}(ou|\/).{0,80}(andamento|processo)|consultar andamento.{0,80}(desconto|valor)|reduzir|cessar descontos|buscar indenizacao|buscar indenização|acompanhar como esta|providencia pratica|provid[eê]ncia pr[aá]tica|situacao geral|situa[cç][aã]o geral|consulta mesmo|acompanhamento.*urgencia|urgencia.*acompanhamento|risco\/medida|o que voce precisa decidir|o que precisa agora|responder algo|apresentar documento|evitar bloqueio|evitar pagamento|aproveitar alguma movimentacao|aproveitar alguma movimenta[cç][aã]o|qual desses|qual deles/.test(text);
}

function asksProcessCandidateInterviewQuestion(text: string) {
  if (/qual .*banco|qual .*tema|banco\/tema|saude.*desconto|desconto\/rmc|danos morais/.test(text)) return true;
  return /assunto principal|qual .*assunto|qual .*objetivo|objetivo principal|danos morais.*ou.*(fgts|inpc|caixa)|fgts.*ou.*bradesco|indenizacao.*ou.*atualizacao|qual desses|qual deles|qual outro|qual processo|tratar desconto|desconto\/valores|desconto ou valores|andamento.{0,80}(ou|\/).{0,80}(desconto|valor|custas|pagamento)|se (voce )?nao souber.*(numero do processo|foto do documento)/.test(text);
}

function buildReplyQualityCheck(params: {
  reply: string | null | undefined;
  frame: MayusWhatsAppConversationFrame;
  conversationState: MayusConversationState;
}): MayusWhatsAppReplyQualityCheck {
  const reply = cleanText(params.reply) || "";
  const text = normalizeText(reply);
  const flags: string[] = [];
  const reasons: string[] = [];

  if (params.frame.resolution_type === "greeting") {
    if (/processo|custas|preparo|cnj|banco|bradesco|caixa|master|contracheque|beneficio/.test(text)) {
      flags.push("stale_context_leak");
      reasons.push("Saudacao limpa puxou contexto antigo.");
    }
    if (/aqui (e|eh|sou)|eu sou|assistente/.test(text)) {
      flags.push("unnecessary_reintroduction");
      reasons.push("Saudacao simples se reapresentou como assistente.");
    }
  }

  if (params.frame.resolution_type === "complaint") {
    if (/bradesco|caixa|master|qual desses|qual deles|assunto principal|indenizacao|indenização|fgts/.test(text)) {
      flags.push("complaint_repeated_stale_context");
      reasons.push("Resposta a reclamacao repetiu o contexto antigo em vez de reconhecer o erro.");
    }
    if (!/desculp|razao|razão|me confundi|entendi/.test(text)) {
      flags.push("complaint_without_recovery");
      reasons.push("Resposta a reclamacao nao reconheceu a falha de contexto.");
    }
  }

  if (params.frame.resolution_type === "referenced_process" && params.frame.resolved_reference) {
    const targetReferences = [
      params.frame.resolved_reference.label,
      params.frame.resolved_reference.opposingParty,
      params.frame.resolved_reference.processNumber,
      params.frame.resolved_reference.processTaskId,
    ];
    if (includesAnyProcessCandidate(reply, params.frame.candidate_summaries || [], targetReferences)) {
      flags.push("mixed_process_candidates");
      reasons.push("Resposta misturou processo referenciado com outros candidatos.");
    }
    if (asksResolvedProcessInterviewQuestion(text) || /e .*bradesco.*ou.*caixa|e .*caixa.*ou.*bradesco/.test(text)) {
      flags.push("asks_unneeded_process_choice");
      reasons.push("Resposta pediu escolha/assunto apesar de a referencia ja estar resolvida.");
    }
  }

  if (params.frame.resolution_type === "referenced_process") {
    if (asksResolvedProcessInterviewQuestion(text) || /custas\/pagamento|andamento geral|proxima audiencia|pr[oó]xima audi[eê]ncia|me mande o nome completo|numero do processo|n[uú]mero do processo/.test(text)) {
      flags.push("asks_unneeded_process_choice");
      reasons.push("Resposta entrevistou o usuario apesar de o processo ja estar verificado.");
    }
  }

  if (params.frame.resolution_type === "unmatched_process_reference") {
    if (/\bbradesco\b|\bcaixa\b|qual desses|qual deles|assunto principal|indenizacao|indenização|\bfgts\b|\btjrj\b|\btrf2\b/.test(text)) {
      flags.push("forces_wrong_process_alternatives");
      reasons.push("Resposta tentou encaixar uma referencia explicita em candidatos errados.");
    }
    if (/banco master/.test(normalizeText(params.frame.known_facts.join(" "))) && !/master/.test(text)) {
      flags.push("missing_explicit_reference");
      reasons.push("Resposta ignorou a referencia explicita do usuario.");
    }
  }

  if (params.frame.resolution_type === "process_candidates") {
    if (/aqui (e|eh|sou)|eu sou|assistente do/.test(text)) {
      flags.push("unnecessary_reintroduction");
      reasons.push("Resposta com candidatos processuais se reapresentou no meio da conversa.");
    }
    if (asksProcessCandidateInterviewQuestion(text)) {
      flags.push("asks_unneeded_process_subject");
      reasons.push("Resposta com processos encontrados perguntou assunto/tipo de acao em vez de listar os candidatos.");
    }
  }

  if (params.frame.resolution_type === "process_candidates") {
    if (/confirmar (sua )?(duvida|d[uú]vida)|custas\/pagamento|andamento geral|proxima audiencia|pr[oó]xima audi[eê]ncia|me mande o nome completo|numero do processo|n[uú]mero do processo/.test(text)) {
      flags.push("asks_unneeded_process_subject");
      reasons.push("Resposta com processos encontrados fez entrevista em vez de resumir o que encontrou.");
    }
  }

  if (params.frame.resolution_type === "process_candidates" && /\b(cpf|cnj)\b/.test(text)) {
    flags.push("asks_unneeded_process_subject");
    reasons.push("Resposta com processos encontrados pediu CPF/CNJ em vez de usar os candidatos ja localizados.");
  }

  if (params.frame.resolution_type === "generic_process_request") {
    if (/assunto principal|qual .*assunto|tema|indenizacao|fgts|atualizacao|rmc|bancario|previdenciario|beneficio|consignado|execucao|familia|esse processo|processo d[ao]/.test(text)) {
      flags.push("asks_unneeded_process_subject");
      reasons.push("Pedido generico de processo pediu assunto juridico em vez de identificador minimo.");
    }
  }

  if (params.frame.resolution_type === "owner_multi_intent") {
    if (/margarete|bradesco|caixa|master|qual .*banco|qual .*tema|qual .*assunto|qual .*objetivo|como esta escrito na capa/.test(text)) {
      flags.push("owner_multi_intent_stale_or_scripted");
      reasons.push("Pedido interno misto reaproveitou contexto antigo ou pergunta de formulario.");
    }
    if (!/venda|crm|comercial|lead/.test(text)) {
      flags.push("owner_multi_intent_missing_sales_answer");
      reasons.push("Pedido interno misto nao respondeu a parte comercial.");
    }
  }

  if (params.conversationState.has_mayus_introduced && /aqui (e|eh|sou)|eu sou|assistente do/.test(text)) {
    flags.push("unnecessary_reintroduction");
    reasons.push("Conversa em andamento teve apresentacao repetida.");
  }

  if (/como uma ia|sou uma inteligencia artificial|como assistente virtual|nao tenho acesso/i.test(reply)) {
    flags.push("robotic_self_reference");
    reasons.push("Resposta soou como sistema/IA em vez de atendimento natural.");
  }

  const uniqueFlags = Array.from(new Set(flags));
  return {
    status: uniqueFlags.length ? "repair" : "pass",
    flags: uniqueFlags,
    reasons: Array.from(new Set(reasons)),
  };
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
  whatsappActorContext: MayusWhatsAppActorContext;
  conversationFrame: MayusWhatsAppConversationFrame;
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

  const useFrameGuardrailReply = shouldUseFrameGuardrailReply(params.conversationFrame.resolution_type);
  let intent = useFrameGuardrailReply
    ? params.conversationFrame.recommended_intent
    : normalizeIntent(parsed?.intent, params.deterministicIntent);
  if (params.deterministicIntent === "legal_triage" && intent === "sales_qualification") {
    intent = "legal_triage";
  }
  const conversationState = normalizeConversationState(parsed?.conversation_state, params.fallbackState);
  const closingReadiness = normalizeClosingReadiness(parsed?.closing_readiness, params.fallbackClosingReadiness);
  const supportSummary = normalizeSupportSummary(parsed?.support_summary, params.fallbackSupportSummary);
  const modelReplyBlocks = normalizeReplyBlocks(parsed?.reply_blocks);
  const modelReply = modelReplyBlocks.length ? modelReplyBlocks.join("\n\n") : parsed?.reply;
  const provisionalReply = useFrameGuardrailReply
    ? params.conversationFrame.safe_fallback_reply
    : cleanText(modelReply) || params.conversationFrame.safe_fallback_reply;
  const rawSanitizedReply = sanitizeReplyForConversation(provisionalReply, conversationState, {
    assistantName: params.assistantName,
    officeName: params.officeName,
    contactName: params.contactName,
  });
  const sanitizedReply = normalizeProcessStatusReplyTone(rawSanitizedReply, params.conversationFrame);
  const replyForValidation = sanitizedReply;
  const actions = normalizeActions(parsed?.actions_to_execute);
  const effectiveActions = guardAutoExecuteActions(actions.length ? actions : buildDefaultActions({
    state: conversationState,
    intent,
    closingReadiness,
    supportSummary,
    processStatusContext: params.processStatusContext,
  }), confidence, params.config.confidence_thresholds.auto_execute);
  if (params.conversationFrame.resolution_type !== "greeting" && isGenericConversationReply(replyForValidation)) {
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
  if (asksKnownOfficeIdentity(replyForValidation, params.whatsappActorContext, params.processStatusContext)) {
    riskFlags.push("asks_known_office_identity");
  }
  if (asksInternalCostPayment(replyForValidation, params.whatsappActorContext, params.processStatusContext)) {
    riskFlags.push("asks_internal_cost_payment");
  }
  if (usesExternalProcessPossessiveForInternalActor(replyForValidation, params.whatsappActorContext, params.processStatusContext)) {
    riskFlags.push("external_possessive_for_internal_actor");
  }
  const qualityCheck = buildReplyQualityCheck({
    reply: replyForValidation,
    frame: params.conversationFrame,
    conversationState,
  });
  for (const flag of qualityCheck.flags) riskFlags.push(flag);
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
  const safeOwnerMultiIntentIdentifierReply = params.conversationFrame.resolution_type === "owner_multi_intent"
    && isOfficeOperatorActor(params.whatsappActorContext, params.processStatusContext)
    && isSafeProcessIdentifierRequest(replyForValidation)
    && /venda|crm|comercial|lead/.test(normalizeText(replyForValidation));
  const effectiveRiskFlags = safeUnverifiedProcessStatusReply || safeOwnerMultiIntentIdentifierReply
    ? riskFlags.filter((flag) => flag !== "case_status_unverified")
    : riskFlags;
  const hasHighRisk = effectiveRiskFlags.some((flag) => HIGH_RISK_FLAGS.includes(flag));
  const safeOfficeOperatorProcessReply = isOfficeOperatorActor(params.whatsappActorContext, params.processStatusContext)
    && intent === "process_status"
    && (
      params.conversationFrame.resolution_type === "referenced_process"
      || params.conversationFrame.resolution_type === "process_candidates"
      || params.conversationFrame.resolution_type === "generic_process_request"
    )
    && qualityCheck.status === "pass"
    && !hasHighRisk
    && !riskFlags.includes("generic_reply_not_conversational")
    && !riskFlags.includes("foreign_language_leak");
  const safeOfficeOperatorOwnerMultiIntentReply = isOfficeOperatorActor(params.whatsappActorContext, params.processStatusContext)
    && params.conversationFrame.resolution_type === "owner_multi_intent"
    && qualityCheck.status === "pass"
    && !hasHighRisk
    && !riskFlags.includes("generic_reply_not_conversational")
    && !riskFlags.includes("foreign_language_leak");
  const mustHonorModelApproval = parsed?.requires_approval === true && (
    hasHighRisk
    || (intent === "process_status" && params.processStatusContext?.verified !== true && !safeUnverifiedProcessStatusReply)
    || intent === "billing"
    || closingReadiness.status === "ready_for_human_close"
    || closingReadiness.status === "blocked"
  );
  const baselineRequiresApproval = mustHonorModelApproval
    || hasHighRisk
    || riskFlags.includes("generic_reply_not_conversational")
    || riskFlags.includes("foreign_language_leak")
    || riskFlags.includes("asks_already_known_payment_status")
    || riskFlags.includes("scripted_process_followup_question")
    || riskFlags.includes("asks_known_office_identity")
    || riskFlags.includes("asks_internal_cost_payment")
    || riskFlags.includes("external_possessive_for_internal_actor")
    || qualityCheck.status !== "pass"
    || riskFlags.includes("incomplete_conversation_control")
    || closingReadiness.status === "ready_for_human_close"
    || closingReadiness.status === "blocked"
    || (!safeOfficeOperatorProcessReply && !safeOfficeOperatorOwnerMultiIntentReply && effectiveActions.some((action) => (
      (action.requires_approval === true && action.type !== "recommend_handoff")
      || action.type === "prepare_proposal"
      || action.type === "mark_ready_for_closing"
      || action.type === "handoff_human"
    )));
  const cleanGreetingResponse = params.conversationFrame.resolution_type === "greeting"
    && qualityCheck.status === "pass"
    && !riskFlags.includes("foreign_language_leak")
    && !riskFlags.includes("generic_reply_not_conversational");
  const requiresApproval = cleanGreetingResponse ? false : baselineRequiresApproval;

  const shouldAutoSend = params.config.enabled
    && params.config.autonomy_mode !== "draft_only"
    && confidence >= params.config.confidence_thresholds.auto_send
    && !requiresApproval
    && parsed?.should_auto_send !== false;
  const effectiveNextAction = useFrameGuardrailReply
    ? params.conversationFrame.conversation_goal
    : cleanText(parsed?.next_action) || "organizar proximo passo com seguranca";

  const frameReplyBlocks = useFrameGuardrailReply && params.conversationFrame.resolution_type === "process_candidates"
    ? params.conversationFrame.safe_fallback_reply.split(/\n{2,}/).map((block) => cleanText(block)).filter(Boolean) as string[]
    : [];
  const sanitizedBlocks = frameReplyBlocks.length
    ? frameReplyBlocks
    : modelReplyBlocks.length
    ? (cleanText(modelReply) === cleanText(sanitizedReply)
      ? modelReplyBlocks.map((block) => cleanText(block)).filter(Boolean) as string[]
      : sanitizedReply.split(/\n{2,}/).map((block) => cleanText(block)).filter(Boolean) as string[])
    : undefined;

  return withOperatingPartnerAgenticContext({
    reply: sanitizedReply,
    reply_blocks: sanitizedBlocks,
    intent,
    confidence,
    risk_flags: Array.from(new Set(effectiveRiskFlags)),
    next_action: effectiveNextAction,
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
    whatsapp_actor_context: params.whatsappActorContext,
    conversation_frame: params.conversationFrame,
    quality_check: qualityCheck,
    final_response_source: useFrameGuardrailReply ? "deterministic_guardrail" : "llm_natural",
  });
}

const REPAIRABLE_RISK_FLAGS = [
  "foreign_language_leak",
  "asks_already_known_payment_status",
  "scripted_process_followup_question",
  "asks_known_office_identity",
  "asks_internal_cost_payment",
  "external_possessive_for_internal_actor",
  "stale_context_leak",
  "unnecessary_reintroduction",
  "mixed_process_candidates",
  "complaint_repeated_stale_context",
  "complaint_without_recovery",
  "forces_wrong_process_alternatives",
  "missing_explicit_reference",
  "asks_unneeded_process_choice",
  "asks_unneeded_process_subject",
  "robotic_self_reference",
];

function needsReplyRepair(decision: MayusOperatingPartnerDecision) {
  return decision.risk_flags.some((flag) => REPAIRABLE_RISK_FLAGS.includes(flag));
}

function forceReplyManualReview(decision: MayusOperatingPartnerDecision, reasonFlag: string): MayusOperatingPartnerDecision {
  return withOperatingPartnerAgenticContext({
    ...decision,
    risk_flags: Array.from(new Set([...decision.risk_flags, reasonFlag])),
    requires_approval: true,
    should_auto_send: false,
  });
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
        { role: "system", content: "Voce e o MAYUS Operating Partner supervisionado. Retorne apenas JSON valido e respeite os limites juridicos/comerciais." },
        { role: "user", content: params.prompt },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao chamar MAYUS Operating Partner supervisionado: ${response.status} ${text.slice(0, 200)}`);
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
    "- se ha nome, referencia ou processo suficiente, nao perguntar banco/tema, assunto, objetivo, desconto/valores ou andamento/desconto;",
    "- se o interlocutor e office_operator/telefone autorizado, nunca perguntar se ele e cliente ou do escritorio;",
    "- se custas, preparo, guia ou gratuidade faltarem na base em conversa interna, transformar em ponto de conferencia interno; nao perguntar se o operador pagou;",
    "- se o interlocutor e interno, nao dizer 'seu processo' ou 'seu caso'; diga processo do cliente, processo localizado ou base do escritorio;",
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
    if (typeof (params.supabase as any)?.from !== "function") return;
    const originalReplyPreview = previewReplyText(params.invalidDecision.reply);
    const repairedReplyPreview = previewReplyText(params.repairedDecision?.reply);
    const finalResponseSource = params.status === "ok"
      ? "llm_repaired"
      : params.repairedDecision?.final_response_source || params.invalidDecision.final_response_source
      || null;
    const repairAuditMetadata = {
      original_reply_preview: originalReplyPreview,
      repaired_reply_preview: repairedReplyPreview,
      final_reply_preview: repairedReplyPreview || originalReplyPreview,
      final_response_source: finalResponseSource,
      original_conversation_resolution: params.invalidDecision.conversation_frame?.resolution_type || null,
      repaired_conversation_resolution: params.repairedDecision?.conversation_frame?.resolution_type || null,
      original_quality_check: params.invalidDecision.quality_check || null,
      repaired_quality_check: params.repairedDecision?.quality_check || null,
    };
    const query = params.supabase.from("system_event_logs");
    if (typeof (query as any).insert === "function") {
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
          ...repairAuditMetadata,
          duration_ms: params.durationMs,
          error: params.error ? String(params.error).slice(0, 500) : null,
        },
        created_at: new Date().toISOString(),
      });
    }

    const outcomeStatus = params.status === "ok"
      ? "corrected"
      : params.status === "warning"
        ? "requires_approval"
        : "failed";
    const repairedRiskFlags = params.repairedDecision?.risk_flags || [];
    const correctionMetadata = {
      original_risk_flags: params.invalidDecision.risk_flags,
      repaired_risk_flags: repairedRiskFlags,
      repair_succeeded: params.status === "ok",
      repaired_intent: params.repairedDecision?.intent || null,
      repaired_should_auto_send: params.repairedDecision?.should_auto_send ?? null,
      model_used: params.repairedDecision?.model_used || params.invalidDecision.model_used || null,
      ...repairAuditMetadata,
      duration_ms: params.durationMs,
    };

    await recordSelfCorrectionEvent({
      supabase: params.supabase,
      tenantId: params.tenantId,
      status: "attempted",
      sourceModule: "mayus_operating_partner",
      targetModule: "whatsapp_reply",
      correctionKind: "operating_partner_reply_repair",
      riskLevel: "low",
      sourceEventType: "mayus_operating_partner_repair_pattern",
      recommendedAction: "Regenerar a resposta antes de enviar; se o reparo continuar inseguro, exigir revisao humana.",
      reason: params.invalidDecision.risk_flags.join(", "),
      externalSideEffectsBlocked: true,
      metadata: {
        original_risk_flags: params.invalidDecision.risk_flags,
        model_used: params.invalidDecision.model_used || null,
        original_reply_preview: originalReplyPreview,
        original_conversation_resolution: params.invalidDecision.conversation_frame?.resolution_type || null,
        original_quality_check: params.invalidDecision.quality_check || null,
      },
    });

    await recordSelfCorrectionEvent({
      supabase: params.supabase,
      tenantId: params.tenantId,
      status: outcomeStatus,
      sourceModule: "mayus_operating_partner",
      targetModule: "whatsapp_reply",
      correctionKind: "operating_partner_reply_repair",
      riskLevel: "low",
      sourceEventType: "mayus_operating_partner_repair_pattern",
      recommendedAction: outcomeStatus === "corrected"
        ? "Aplicar resposta reparada somente porque os validadores ficaram seguros."
        : "Bloquear autoenvio e exigir revisao humana antes de responder o cliente.",
      reason: params.error || (outcomeStatus === "corrected" ? "reply_repair_validated" : "reply_repair_still_unsafe"),
      externalSideEffectsBlocked: outcomeStatus !== "corrected",
      metadata: correctionMetadata,
    });

    await recordLearningEvent({
      supabase: params.supabase,
      tenantId: params.tenantId,
      eventType: "mayus_operating_partner_repair_pattern",
      sourceModule: "mayus_operating_partner",
      payload: {
        original_risk_flags: params.invalidDecision.risk_flags,
        repaired_risk_flags: params.repairedDecision?.risk_flags || [],
        repair_succeeded: params.status === "ok",
        repaired_intent: params.repairedDecision?.intent || null,
        repaired_should_auto_send: params.repairedDecision?.should_auto_send ?? null,
        model_used: params.repairedDecision?.model_used || params.invalidDecision.model_used || null,
        ...repairAuditMetadata,
        duration_ms: params.durationMs,
      },
    });
  } catch (error) {
    console.warn("[mayus-operating-partner][reply-repair-event]", error);
  }
}

export async function buildMayusOperatingPartnerDecision(input: MayusOperatingPartnerInput): Promise<MayusOperatingPartnerDecision> {
  const config = normalizeMayusOperatingPartnerConfig(input.operatingPartner);
  const selectedModel = chooseModel(input);
  const whatsappActorContext = normalizeWhatsAppActorContext(input);
  const deterministic = detectDeterministicIntentAndRisk(input.messages, input.processStatusContext);
  const fallbackState = inferConversationState(input, deterministic.intent);
  const fallbackClosingReadiness = inferClosingReadiness(fallbackState, deterministic.intent, input.processStatusContext);
  const fallbackSupportSummary = inferSupportSummary(input, fallbackState, deterministic.intent);
  const conversationFrame = buildWhatsAppConversationFrame(input, {
    deterministicIntent: deterministic.intent,
    fallbackState,
    fallbackSupportSummary,
    actorContext: whatsappActorContext,
  });

  if (conversationFrame.resolution_type === "greeting") {
    const qualityCheck: MayusWhatsAppReplyQualityCheck = {
      status: "pass",
      flags: [],
      reasons: [],
    };

    return buildDeterministicDecision({
      config,
      reply: conversationFrame.safe_fallback_reply,
      intent: conversationFrame.recommended_intent,
      confidence: 0.94,
      state: {
        ...fallbackState,
        conversation_role: "support",
        conversation_goal: conversationFrame.conversation_goal,
        customer_temperature: fallbackState.customer_temperature || "existing_client",
        stage: "client_support",
        missing_information: [],
        next_action: "aguardar o assunto atual do interlocutor",
        last_process_candidates: undefined,
      },
      closingReadiness: fallbackClosingReadiness,
      supportSummary: {
        ...fallbackSupportSummary,
        issue_type: "support",
        verified_case_reference: false,
      },
      riskFlags: [],
      nextAction: "aguardar o assunto atual do interlocutor",
      actions: [{ type: "none", title: "Responder saudacao limpa sem consultar LLM", requires_approval: false }],
      requiresApproval: false,
      expectedOutcome: "abrir conversa limpa sem puxar processo, lead ou historico antigo",
      reasoning: "Saudacao pura detectada; MAYUS respondeu por guardrail deterministico e ignorou contexto processual antigo.",
      assistantName: input.officeKnowledgeProfile?.assistantName,
      officeName: input.officeKnowledgeProfile?.officeName,
      contactName: input.contactName,
      whatsappActorContext,
      conversationFrame,
      qualityCheck,
      finalResponseSource: "deterministic_guardrail",
    });
  }

  const llm = await getLLMClient(input.supabase, input.tenantId, "sdr_whatsapp", {
    preferredProvider: "openrouter",
    modelOverride: selectedModel,
  });
  const fetcher = input.fetcher || fetch;
  const headers = buildHeaders(llm);
  const originalPrompt = buildPrompt(input, config, llm.model, deterministic.intent, fallbackState, fallbackClosingReadiness, fallbackSupportSummary, whatsappActorContext, conversationFrame);
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
    whatsappActorContext,
    conversationFrame,
    assistantName: input.officeKnowledgeProfile?.assistantName,
    officeName: input.officeKnowledgeProfile?.officeName,
    contactName: input.contactName,
  };
  let parsed: any;
  try {
    parsed = await callOperatingPartnerJson({
      fetcher,
      endpoint: llm.endpoint,
      headers,
      model: llm.model,
      prompt: originalPrompt,
    });
  } catch (error) {
    return buildSafeFallbackDecisionFromFrame({
      input,
      config,
      conversationFrame,
      fallbackState,
      fallbackClosingReadiness,
      fallbackSupportSummary,
      error,
    });
  }
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
    const repairedStillUnsafe = needsReplyRepair(repairedDecision);
    await recordReplyRepairEvent({
      supabase: input.supabase,
      tenantId: input.tenantId,
      status: repairedStillUnsafe ? "warning" : "ok",
      invalidDecision: decision,
      repairedDecision,
      durationMs: Date.now() - repairStartedAt,
    });
    if (repairedStillUnsafe) {
      return canUseFactualProcessFallback(repairedDecision)
        ? buildFactualProcessFallbackDecision(repairedDecision, "reply_repair_still_unsafe")
        : forceReplyManualReview(repairedDecision, "reply_repair_still_unsafe");
    }
    return { ...repairedDecision, final_response_source: "llm_repaired" };
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
    return canUseFactualProcessFallback(decision)
      ? buildFactualProcessFallbackDecision(decision, "reply_repair_failed")
      : forceReplyManualReview(decision, "reply_repair_failed");
  }
}
