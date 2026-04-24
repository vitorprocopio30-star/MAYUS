export type LeadUrgency = "low" | "medium" | "high";
export type LeadKind = "new_lead" | "case_status_request" | "needs_context";

export type LeadIntakeInput = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  origin?: string | null;
  channel?: string | null;
  legalArea?: string | null;
  city?: string | null;
  state?: string | null;
  urgency?: string | null;
  pain?: string | null;
  notes?: string | null;
};

export type NormalizedLeadIntake = {
  name: string;
  phone: string | null;
  email: string | null;
  origin: string | null;
  channel: string | null;
  legalArea: string | null;
  city: string | null;
  state: string | null;
  urgency: LeadUrgency;
  pain: string | null;
  notes: string | null;
};

export type LeadIntakeResult = {
  kind: LeadKind;
  score: number;
  scoreReason: string;
  tags: string[];
  nextStep: string;
  needsHumanHandoff: boolean;
  normalized: NormalizedLeadIntake;
  description: string;
};

const STATUS_KEYWORDS = [
  "andamento",
  "status",
  "meu processo",
  "processo",
  "prazo",
  "audiencia",
  "audiência",
  "movimentacao",
  "movimentação",
];

const HIGH_URGENCY_KEYWORDS = [
  "hoje",
  "amanha",
  "amanhã",
  "urgente",
  "liminar",
  "bloqueio",
  "prisao",
  "prisão",
  "despejo",
  "prazo",
  "audiencia",
  "audiência",
];

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizePhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || null;
}

function normalizeUrgency(value?: string | null, pain?: string | null): LeadUrgency {
  const raw = String(value || "").trim().toLowerCase();
  const painText = String(pain || "").toLowerCase();

  if (["alta", "high", "urgente"].includes(raw) || HIGH_URGENCY_KEYWORDS.some((keyword) => painText.includes(keyword))) {
    return "high";
  }

  if (["baixa", "low"].includes(raw)) {
    return "low";
  }

  return "medium";
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function normalizeLeadInput(input: LeadIntakeInput): NormalizedLeadIntake {
  const pain = cleanText(input.pain);

  return {
    name: cleanText(input.name) || "Lead sem nome",
    phone: normalizePhone(input.phone),
    email: cleanText(input.email),
    origin: cleanText(input.origin),
    channel: cleanText(input.channel),
    legalArea: cleanText(input.legalArea),
    city: cleanText(input.city),
    state: cleanText(input.state)?.toUpperCase() || null,
    urgency: normalizeUrgency(input.urgency, pain),
    pain,
    notes: cleanText(input.notes),
  };
}

export function classifyLead(input: NormalizedLeadIntake): LeadKind {
  const combined = `${input.pain || ""} ${input.notes || ""}`.toLowerCase();

  if (STATUS_KEYWORDS.some((keyword) => combined.includes(keyword)) && !input.legalArea) {
    return "case_status_request";
  }

  if (!input.phone || !input.legalArea || !input.pain) {
    return "needs_context";
  }

  return "new_lead";
}

export function scoreLead(input: NormalizedLeadIntake, kind: LeadKind) {
  let score = 35;
  const reasons: string[] = [];

  if (input.phone) {
    score += 18;
    reasons.push("telefone informado");
  } else {
    score -= 15;
    reasons.push("telefone ausente");
  }

  if (input.legalArea) {
    score += 15;
    reasons.push("area juridica definida");
  } else {
    score -= 10;
    reasons.push("area juridica ausente");
  }

  if (input.pain && input.pain.length >= 24) {
    score += 12;
    reasons.push("dor descrita com contexto");
  }

  if (input.urgency === "high") {
    score += 20;
    reasons.push("urgencia alta");
  } else if (input.urgency === "low") {
    score -= 5;
    reasons.push("urgencia baixa");
  }

  if (input.origin) {
    score += 5;
    reasons.push("origem rastreada");
  }

  if (input.channel) {
    score += 3;
    reasons.push("canal informado");
  }

  if (kind === "case_status_request") {
    score = Math.min(score, 35);
    reasons.push("parece pedido de status de caso, nao lead comercial direto");
  }

  if (kind === "needs_context") {
    score = Math.min(score, 55);
    reasons.push("faltam dados minimos para qualificar");
  }

  return {
    score: clampScore(score),
    scoreReason: reasons.join("; "),
  };
}

export function buildLeadTags(input: NormalizedLeadIntake, kind: LeadKind, score: number) {
  const tags = new Set<string>(["lead-intake"]);

  if (input.legalArea) tags.add(input.legalArea.toLowerCase());
  if (input.origin) tags.add(`origem:${input.origin.toLowerCase()}`);
  if (input.channel) tags.add(`canal:${input.channel.toLowerCase()}`);
  if (input.urgency === "high") tags.add("urgente");
  if (score >= 75) tags.add("lead-quente");
  if (kind === "case_status_request") tags.add("status-caso");
  if (kind === "needs_context") tags.add("precisa-contexto");

  return Array.from(tags).slice(0, 8);
}

export function suggestNextStep(input: NormalizedLeadIntake, kind: LeadKind, score: number) {
  if (kind === "case_status_request") {
    return "Encaminhar para atendimento de status do caso antes de tratar como nova oportunidade.";
  }

  if (kind === "needs_context") {
    return "Coletar telefone, area juridica e resumo da dor antes de qualificar comercialmente.";
  }

  if (score >= 75) {
    return "Priorizar contato humano hoje, confirmar documentos minimos e agendar consulta.";
  }

  return "Fazer contato inicial, validar aderencia da tese e registrar proximo retorno.";
}

export function buildLeadDescription(result: Omit<LeadIntakeResult, "description">) {
  const { normalized, kind, score, scoreReason, nextStep } = result;
  return [
    `Classificacao: ${kind}`,
    `Score inicial: ${score}/100 (${scoreReason})`,
    normalized.legalArea ? `Area juridica: ${normalized.legalArea}` : "Area juridica: nao informada",
    normalized.city || normalized.state ? `Localidade: ${[normalized.city, normalized.state].filter(Boolean).join("/")}` : null,
    normalized.origin ? `Origem: ${normalized.origin}` : null,
    normalized.channel ? `Canal: ${normalized.channel}` : null,
    normalized.pain ? `Dor principal: ${normalized.pain}` : null,
    normalized.notes ? `Observacoes: ${normalized.notes}` : null,
    `Proximo passo recomendado: ${nextStep}`,
  ].filter(Boolean).join("\n");
}

export function analyzeLeadIntake(input: LeadIntakeInput): LeadIntakeResult {
  const normalized = normalizeLeadInput(input);
  const kind = classifyLead(normalized);
  const { score, scoreReason } = scoreLead(normalized, kind);
  const tags = buildLeadTags(normalized, kind, score);
  const nextStep = suggestNextStep(normalized, kind, score);
  const needsHumanHandoff = kind === "case_status_request" || normalized.urgency === "high" || score >= 75;
  const partial = { kind, score, scoreReason, tags, nextStep, needsHumanHandoff, normalized };

  return {
    ...partial,
    description: buildLeadDescription(partial),
  };
}

export function buildCrmTaskPayload(params: {
  tenantId: string;
  pipelineId: string;
  stageId: string;
  result: LeadIntakeResult;
  assignedTo?: string | null;
}) {
  const { result } = params;
  const title = result.normalized.name === "Lead sem nome"
    ? `Lead ${result.normalized.phone || "sem nome"}`
    : result.normalized.name;

  return {
    tenant_id: params.tenantId,
    pipeline_id: params.pipelineId,
    stage_id: params.stageId,
    title,
    description: result.description,
    position_index: 0,
    assigned_to: params.assignedTo || null,
    tags: result.tags,
    phone: result.normalized.phone,
    sector: result.normalized.legalArea,
    source: result.normalized.origin || "growth_intake",
    lead_scoring: result.score,
    data_ultima_movimentacao: new Date().toISOString(),
  };
}
