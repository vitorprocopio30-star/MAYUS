import type { SupabaseClient } from "@supabase/supabase-js";
import { buildHeaders, getLLMClient } from "@/lib/llm-router";
import type { WhatsAppSalesMessage } from "./whatsapp-sales-reply";

export const SALES_LLM_TESTBENCH_MODELS = [
  "deepseek/deepseek-v4-pro",
  "minimax/minimax-m2.7",
  "xiaomi/mimo-v2.5",
  "qwen/qwen3.6-plus",
  "moonshotai/kimi-k2.6",
] as const;

export type SalesLlmModelId = (typeof SALES_LLM_TESTBENCH_MODELS)[number] | string;

export type SalesLlmRoutingMode = "fixed" | "ab_test" | "stage_based";

export type SalesLlmTestbenchConfig = {
  enabled: boolean;
  default_model: SalesLlmModelId;
  candidate_models: SalesLlmModelId[];
  routing_mode: SalesLlmRoutingMode;
};

export type SalesLlmLeadStage =
  | "new"
  | "discovery"
  | "qualification"
  | "enchantment"
  | "objection"
  | "closing"
  | "accepted"
  | "lost"
  | "handoff";

export type SalesLlmIntent =
  | "new_lead"
  | "sales_discovery"
  | "sales_objection"
  | "sales_closing"
  | "case_status_request"
  | "legal_question"
  | "out_of_scope"
  | "unknown";

export type SalesLlmReply = {
  reply: string;
  lead_stage: SalesLlmLeadStage;
  intent: SalesLlmIntent;
  confidence: number;
  risk_flags: string[];
  next_action: string;
  should_auto_send: boolean;
  model_used: string;
  provider: string;
  expected_outcome: string;
};

export type SalesLlmReplyInput = {
  supabase: SupabaseClient;
  tenantId: string;
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
  testbench?: Partial<SalesLlmTestbenchConfig> | null;
  leadStage?: SalesLlmLeadStage | null;
  autonomyMode?: "auto_respond" | "supervised" | "draft_only" | string | null;
  timeoutMs?: number | null;
  fetcher?: typeof fetch;
};

export type SalesLlmFixture = {
  id: string;
  description: string;
  messages: WhatsAppSalesMessage[];
  expectedIntent: SalesLlmIntent;
  expectedStage: SalesLlmLeadStage;
};

export type SalesLlmScore = {
  total: number;
  def_adherence: number;
  clarity: number;
  next_question: number;
  legal_risk: number;
  conversion_potential: number;
  review_need: number;
  notes: string[];
};

const HIGH_RISK_FLAGS = [
  "legal_result_risk",
  "legal_urgency",
  "case_status_request",
  "contract_or_billing",
  "low_confidence",
  "out_of_scope",
];

const DEFAULT_SALES_LLM_TIMEOUT_MS = 9000;

export const DEFAULT_SALES_LLM_TESTBENCH: SalesLlmTestbenchConfig = {
  enabled: true,
  default_model: "deepseek/deepseek-v4-pro",
  candidate_models: [...SALES_LLM_TESTBENCH_MODELS],
  routing_mode: "fixed",
};

export const SALES_LLM_TEST_FIXTURES: SalesLlmFixture[] = [
  {
    id: "new-lead-no-context",
    description: "Lead novo sem contexto",
    messages: [{ direction: "inbound", content: "Oi, voces atendem previdenciario?" }],
    expectedIntent: "new_lead",
    expectedStage: "discovery",
  },
  {
    id: "clear-pain",
    description: "Lead com dor clara",
    messages: [{ direction: "inbound", content: "Meu beneficio foi negado e estou sem renda ha dois meses." }],
    expectedIntent: "sales_discovery",
    expectedStage: "qualification",
  },
  {
    id: "price-objection",
    description: "Objecao de preco",
    messages: [
      { direction: "outbound", content: "Conseguimos montar um diagnostico antes da proposta." },
      { direction: "inbound", content: "Achei caro, vou pensar." },
    ],
    expectedIntent: "sales_objection",
    expectedStage: "objection",
  },
  {
    id: "wants-to-close",
    description: "Lead querendo fechar",
    messages: [{ direction: "inbound", content: "Gostei. Quero contratar e pagar a entrada hoje." }],
    expectedIntent: "sales_closing",
    expectedStage: "closing",
  },
  {
    id: "payroll-discount",
    description: "Lead perguntando sobre desconto no contracheque",
    messages: [{ direction: "inbound", content: "Quero saber sobre um desconto no meu contracheque." }],
    expectedIntent: "legal_question",
    expectedStage: "discovery",
  },
  {
    id: "not-sales",
    description: "Pergunta fora de vendas",
    messages: [{ direction: "inbound", content: "Voces sabem me dizer o horario de funcionamento do forum?" }],
    expectedIntent: "out_of_scope",
    expectedStage: "handoff",
  },
  {
    id: "case-status",
    description: "Lead pedindo status de processo",
    messages: [{ direction: "inbound", content: "Qual o andamento do meu processo?" }],
    expectedIntent: "case_status_request",
    expectedStage: "handoff",
  },
];

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

function clampConfidence(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0, Math.min(1, numeric));
}

function uniqueStrings(values: unknown) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map((item) => cleanText(String(item))).filter(Boolean))) as string[];
}

export function normalizeSalesLlmTestbenchConfig(config?: Partial<SalesLlmTestbenchConfig> | null): SalesLlmTestbenchConfig {
  const candidates = Array.isArray(config?.candidate_models) && config?.candidate_models.length
    ? Array.from(new Set(config.candidate_models.map((item) => cleanText(String(item))).filter(Boolean))) as string[]
    : [...DEFAULT_SALES_LLM_TESTBENCH.candidate_models];

  const defaultModel = cleanText(config?.default_model) || DEFAULT_SALES_LLM_TESTBENCH.default_model;
  const routingMode = config?.routing_mode === "ab_test" || config?.routing_mode === "stage_based"
    ? config.routing_mode
    : "fixed";

  return {
    enabled: config?.enabled !== false,
    default_model: defaultModel,
    candidate_models: candidates.includes(defaultModel) ? candidates : [defaultModel, ...candidates],
    routing_mode: routingMode,
  };
}

function getLastInbound(messages: WhatsAppSalesMessage[]) {
  return [...messages].reverse().find((message) => message.direction === "inbound" && cleanText(message.content)) || null;
}

function summarizeMessages(messages: WhatsAppSalesMessage[]) {
  return messages
    .slice(-14)
    .map((message) => {
      const mediaContext = [message.media_summary, message.media_text].map((item) => cleanText(item)).filter(Boolean).join(" | ");
      const content = cleanText(message.content) || `[${message.message_type || "mensagem"}]`;
      return `${message.direction === "inbound" ? "lead" : "mayus"}: ${mediaContext ? `${content} | midia: ${mediaContext}` : content}`;
    })
    .join("\n");
}

function detectDeterministicRisk(messages: WhatsAppSalesMessage[]) {
  const lastInbound = normalizeText(getLastInbound(messages)?.content);
  const risks: string[] = [];

  if (/garantia|garantido|chance|ganhar|causa ganha|promete/.test(lastInbound)) risks.push("legal_result_risk");
  if (/urgente|liminar|audiencia|prazo|bloqueio|prisao|ameaca/.test(lastInbound)) risks.push("legal_urgency");
  if (/contrato|assin|boleto|pix|pagamento|entrada|cobranca|honorario|valor fechado/.test(lastInbound)) risks.push("contract_or_billing");
  if (/andamento|status|meu processo|processo|movimentacao|cnj/.test(lastInbound)) risks.push("case_status_request");
  if (/contracheque|holerite|folha|margem consignavel|consignado|desconto|beneficio|inss|aposentadoria/.test(lastInbound)) risks.push("legal_triage");

  return risks;
}

function chooseModel(config: SalesLlmTestbenchConfig, messages: WhatsAppSalesMessage[], leadStage?: string | null) {
  if (config.routing_mode === "stage_based") {
    if (leadStage === "closing" && config.candidate_models.includes("moonshotai/kimi-k2.6")) return "moonshotai/kimi-k2.6";
    if (leadStage === "objection" && config.candidate_models.includes("minimax/minimax-m2.7")) return "minimax/minimax-m2.7";
  }

  if (config.routing_mode === "ab_test" && config.candidate_models.length > 0) {
    const seed = summarizeMessages(messages).split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return config.candidate_models[seed % config.candidate_models.length];
  }

  return config.default_model;
}

function buildSalesLlmPrompt(input: SalesLlmReplyInput, model: string) {
  const profile = input.salesProfile || {};
  const pillars = Array.isArray(profile.valuePillars) ? profile.valuePillars.filter(Boolean).join(", ") : "";

  return [
    "Voce e o SDR/Closer agentico do MAYUS para WhatsApp juridico.",
    "Conduza o lead ate o fechamento com metodo DEF: descoberta antes da oferta, encantamento com diagnostico, fechamento sem pressao.",
    "Responda em portugues do Brasil, curto, natural e com uma pergunta por vez.",
    "Use no maximo 2 blocos curtos. Nao mande discurso institucional nem explique a metodologia.",
    "Reconheca o assunto especifico do lead antes de perguntar. Se ele falou contracheque, desconto, consignado, folha, beneficio ou INSS, responda sobre isso.",
    "Para desconto em contracheque/beneficio, nao diga se a pessoa tem direito. Pergunte o nome do desconto, quando comecou, se houve autorizacao/emprestimo e peca print apenas do trecho do desconto.",
    "Nunca invente status de processo, preco, contrato, cobranca, prazo, documento, jurisprudencia ou promessa de resultado juridico.",
    "Se o usuario pedir status de processo, pergunta juridica fora de venda, urgencia grave, contrato ou pagamento, sinalize risco e recomende handoff.",
    "Se a descoberta ainda estiver fraca, nao feche. Faca a proxima pergunta.",
    "",
    `Modelo em teste: ${model}`,
    `Autonomia configurada: ${cleanText(input.autonomyMode) || "auto_respond"}`,
    `Fase atual sugerida: ${cleanText(input.leadStage) || "new"}`,
    `Lead: ${cleanText(input.contactName) || cleanText(input.phoneNumber) || "Lead WhatsApp"}`,
    `Cliente ideal do escritorio: ${cleanText(profile.idealClient) || "nao configurado"}`,
    `Solucao central: ${cleanText(profile.coreSolution) || "nao configurada"}`,
    `PUV: ${cleanText(profile.uniqueValueProposition) || "nao configurada"}`,
    `Pilares: ${pillars || "nao configurados"}`,
    `Resumo de posicionamento: ${cleanText(profile.positioningSummary) || "nao configurado"}`,
    "",
    "Historico recente:",
    summarizeMessages(input.messages) || "Sem historico.",
    "",
    "Retorne somente JSON valido neste formato:",
    JSON.stringify({
      reply: "texto curto para WhatsApp",
      lead_stage: "discovery",
      intent: "sales_discovery",
      confidence: 0.82,
      risk_flags: [],
      next_action: "perguntar dor concreta",
      should_auto_send: true,
      expected_outcome: "capturar proximo sinal de descoberta",
    }),
  ].join("\n");
}

async function fetchWithTimeout(fetcher: typeof fetch, url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      fetcher(url, { ...init, signal: controller.signal }),
      new Promise<Response>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`Timeout ao chamar LLM de vendas apos ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function extractJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1] || text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Resposta da LLM nao trouxe JSON.");
  return JSON.parse(raw.slice(start, end + 1));
}

function normalizeLlmOutput(parsed: any, params: {
  model: string;
  provider: string;
  deterministicRisk: string[];
  autonomyMode?: string | null;
}): SalesLlmReply {
  const riskFlags = Array.from(new Set([
    ...uniqueStrings(parsed?.risk_flags),
    ...params.deterministicRisk,
  ]));
  const confidence = clampConfidence(parsed?.confidence);
  if (confidence < 0.6) riskFlags.push("low_confidence");

  const shouldBlockAutoSend = params.autonomyMode === "draft_only"
    || params.autonomyMode === "supervised"
    || confidence < 0.72
    || riskFlags.some((flag) => HIGH_RISK_FLAGS.includes(flag));

  return {
    reply: cleanText(parsed?.reply) || "Entendi. Para te responder sem chute, me diga em uma frase o que aconteceu e qual e sua principal duvida agora.",
    lead_stage: normalizeLeadStage(parsed?.lead_stage),
    intent: normalizeIntent(parsed?.intent),
    confidence,
    risk_flags: Array.from(new Set(riskFlags)),
    next_action: cleanText(parsed?.next_action) || "coletar mais contexto antes de propor",
    should_auto_send: shouldBlockAutoSend ? false : parsed?.should_auto_send !== false,
    model_used: params.model,
    provider: params.provider,
    expected_outcome: cleanText(parsed?.expected_outcome) || "avancar a conversa com seguranca",
  };
}

function normalizeLeadStage(value: unknown): SalesLlmLeadStage {
  const text = normalizeText(String(value || ""));
  if (["new", "discovery", "qualification", "enchantment", "objection", "closing", "accepted", "lost", "handoff"].includes(text)) {
    return text as SalesLlmLeadStage;
  }
  return "discovery";
}

function normalizeIntent(value: unknown): SalesLlmIntent {
  const text = normalizeText(String(value || ""));
  if ([
    "new_lead",
    "sales_discovery",
    "sales_objection",
    "sales_closing",
    "case_status_request",
    "legal_question",
    "out_of_scope",
    "unknown",
  ].includes(text)) {
    return text as SalesLlmIntent;
  }
  return "unknown";
}

export async function buildSalesLlmReply(input: SalesLlmReplyInput): Promise<SalesLlmReply> {
  const config = normalizeSalesLlmTestbenchConfig(input.testbench);
  const selectedModel = chooseModel(config, input.messages, input.leadStage);
  const llm = await getLLMClient(input.supabase, input.tenantId, "sdr_whatsapp", {
    preferredProvider: "openrouter",
    modelOverride: selectedModel,
  });
  const fetcher = input.fetcher || fetch;
  const timeoutMs = Math.min(Math.max(Number(input.timeoutMs || DEFAULT_SALES_LLM_TIMEOUT_MS), 1000), 30000);
  const response = await fetchWithTimeout(fetcher, llm.endpoint, {
    method: "POST",
    headers: buildHeaders(llm),
    body: JSON.stringify({
      model: llm.model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "Voce retorna apenas JSON valido e segue guardrails comerciais/juridicos do MAYUS." },
        { role: "user", content: buildSalesLlmPrompt(input, llm.model) },
      ],
    }),
  }, timeoutMs);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Falha ao chamar LLM de vendas: ${response.status} ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = extractJsonObject(String(content || ""));

  return normalizeLlmOutput(parsed, {
    model: llm.model,
    provider: llm.provider,
    deterministicRisk: detectDeterministicRisk(input.messages),
    autonomyMode: input.autonomyMode,
  });
}

export function scoreSalesLlmReply(reply: Pick<SalesLlmReply, "reply" | "intent" | "lead_stage" | "risk_flags" | "next_action" | "should_auto_send">, fixture: SalesLlmFixture): SalesLlmScore {
  const notes: string[] = [];
  const text = normalizeText(`${reply.reply} ${reply.next_action}`);
  const asksQuestion = /\?/.test(reply.reply);
  const forbidden = /garant|causa ganha|100%|com certeza voce ganha|processo esta|prazo final e|valor fechado e/.test(text);
  const matchesIntent = reply.intent === fixture.expectedIntent;
  const matchesStage = reply.lead_stage === fixture.expectedStage;
  const handoffExpected = fixture.expectedStage === "handoff";

  const def_adherence = matchesIntent && matchesStage ? 20 : matchesIntent || matchesStage ? 12 : 4;
  const clarity = reply.reply.length > 0 && reply.reply.length <= 420 ? 15 : 8;
  const next_question = asksQuestion || handoffExpected ? 15 : 6;
  const legal_risk = forbidden ? 0 : handoffExpected && !reply.should_auto_send ? 20 : 16;
  const conversion_potential = /dor|aconteceu|evitar|decidir|proximo|sentido|principal|contexto/.test(text) ? 15 : 8;
  const review_need = handoffExpected === !reply.should_auto_send ? 15 : 7;

  if (!matchesIntent) notes.push(`intent esperado ${fixture.expectedIntent}, recebido ${reply.intent}`);
  if (!matchesStage) notes.push(`fase esperada ${fixture.expectedStage}, recebida ${reply.lead_stage}`);
  if (forbidden) notes.push("resposta contem promessa/status/preco indevido");
  if (!asksQuestion && !handoffExpected) notes.push("resposta nao conduziu com pergunta curta");

  return {
    total: def_adherence + clarity + next_question + legal_risk + conversion_potential + review_need,
    def_adherence,
    clarity,
    next_question,
    legal_risk,
    conversion_potential,
    review_need,
    notes,
  };
}
