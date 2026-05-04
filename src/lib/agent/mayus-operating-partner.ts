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

export type MayusOperatingPartnerDecision = {
  reply: string;
  intent: MayusOperatingPartnerIntent;
  confidence: number;
  risk_flags: string[];
  next_action: string;
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
  } | null;
  operatingPartner?: Partial<MayusOperatingPartnerConfig> | null;
  salesTestbench?: Partial<SalesLlmTestbenchConfig> | null;
  fetcher?: typeof fetch;
};

const HIGH_RISK_FLAGS = [
  "case_status_unverified",
  "legal_result_risk",
  "legal_urgency",
  "billing_or_contract",
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
    .map((message) => `${message.direction === "inbound" ? "cliente" : "mayus"}: ${cleanText(message.content) || `[${message.message_type || "mensagem"}]`}`)
    .join("\n");
}

function getLastInbound(messages: WhatsAppSalesMessage[]) {
  return [...messages].reverse().find((message) => message.direction === "inbound" && cleanText(message.content)) || null;
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

function buildPrompt(input: MayusOperatingPartnerInput, config: MayusOperatingPartnerConfig, model: string, deterministicIntent: MayusOperatingPartnerIntent) {
  const profile = input.salesProfile || {};
  const pillars = Array.isArray(profile.valuePillars) ? profile.valuePillars.filter(Boolean).join(", ") : "";

  return [
    "Voce e o MAYUS, socio virtual operacional de um escritorio de advocacia brasileiro.",
    "Sua funcao e vender, qualificar, dar suporte, organizar proximos passos e acionar humano quando houver risco.",
    "Nao aja como chatbot aleatorio. Use o historico, nao presuma que o cliente pediu status de processo se ele nao pediu.",
    "Nunca invente andamento de processo, valor, contrato, cobranca, prazo, documento ou promessa juridica.",
    "Se o cliente pedir status de processo sem base confirmada, diga que vai tratar com seguranca e peca identificador minimo ou escale.",
    "Se for venda, conduza com DEF: descubra dor, qualifique, encante com diagnostico e so feche quando houver sinais suficientes.",
    "Se for suporte, responda curto e util, com a proxima acao concreta.",
    "Responda em portugues do Brasil, natural para WhatsApp, em no maximo 2 blocos curtos e uma pergunta por vez.",
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

function normalizeDecision(parsed: any, params: {
  config: MayusOperatingPartnerConfig;
  provider: string;
  model: string;
  deterministicIntent: MayusOperatingPartnerIntent;
  deterministicRisks: string[];
}): MayusOperatingPartnerDecision {
  const confidence = clamp01(parsed?.confidence);
  const riskFlags = Array.from(new Set([
    ...uniqueStrings(parsed?.risk_flags),
    ...params.deterministicRisks,
  ]));

  if (confidence < params.config.confidence_thresholds.approval) {
    riskFlags.push("low_confidence");
  }

  const intent = normalizeIntent(parsed?.intent, params.deterministicIntent);
  const actions = normalizeActions(parsed?.actions_to_execute);
  const hasHighRisk = riskFlags.some((flag) => HIGH_RISK_FLAGS.includes(flag));
  const requiresApproval = parsed?.requires_approval === true
    || hasHighRisk
    || actions.some((action) => action.requires_approval === true || action.type === "prepare_proposal");

  const shouldAutoSend = params.config.enabled
    && params.config.autonomy_mode !== "draft_only"
    && confidence >= params.config.confidence_thresholds.auto_send
    && !requiresApproval
    && parsed?.should_auto_send !== false;

  return {
    reply: cleanText(parsed?.reply) || "Entendi. Para eu te ajudar sem chute, me diga em uma frase o que aconteceu e qual resultado voce procura agora.",
    intent,
    confidence,
    risk_flags: Array.from(new Set(riskFlags)),
    next_action: cleanText(parsed?.next_action) || "organizar proximo passo com seguranca",
    actions_to_execute: actions.length ? actions : [{ type: "add_internal_note", title: "Registrar proximo passo MAYUS", requires_approval: false }],
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
        { role: "user", content: buildPrompt(input, config, llm.model, deterministic.intent) },
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
  });
}
