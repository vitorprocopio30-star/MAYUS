import {
  buildMarketingAttribution,
  buildMarketingAttributionDescription,
  type MarketingAttribution,
} from "@/lib/marketing/marketing-attribution";

export type LeadUrgency = "low" | "medium" | "high";
export type LeadKind = "new_lead" | "referral" | "case_status_request" | "needs_context";

export type LeadIntakeInput = {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  origin?: string | null;
  channel?: string | null;
  campaign?: string | null;
  contentId?: string | null;
  contentTitle?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  content_id?: string | null;
  content_title?: string | null;
  landing_page?: string | null;
  legalArea?: string | null;
  city?: string | null;
  state?: string | null;
  urgency?: string | null;
  pain?: string | null;
  notes?: string | null;
  referredBy?: string | null;
  referralRelationship?: string | null;
};

export type NormalizedLeadIntake = {
  name: string;
  phone: string | null;
  email: string | null;
  origin: string | null;
  channel: string | null;
  campaign: string | null;
  contentId: string | null;
  contentTitle: string | null;
  landingPage: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  marketingAttribution: MarketingAttribution;
  legalArea: string | null;
  city: string | null;
  state: string | null;
  urgency: LeadUrgency;
  pain: string | null;
  notes: string | null;
  referredBy: string | null;
  referralRelationship: string | null;
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

export type LeadIntakeBrainTrace = {
  taskId: string;
  runId: string;
  stepId: string;
  artifactId: string | null;
  eventType: "referral_intake_artifact_created";
};

type GrowthSupabase = {
  from: (table: string) => any;
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

const REFERRAL_KEYWORDS = [
  "indicacao",
  "indicacao de",
  "indicação",
  "indicação de",
  "indicado",
  "indicada",
  "me indicou",
  "fui indicado",
  "foi indicado",
  "recomendacao",
  "recomendação",
  "recomendado",
  "recomendada",
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

function normalizeForMatch(value: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function normalizeLeadInput(input: LeadIntakeInput): NormalizedLeadIntake {
  const pain = cleanText(input.pain);
  const marketingAttribution = buildMarketingAttribution(input);

  return {
    name: cleanText(input.name) || "Lead sem nome",
    phone: normalizePhone(input.phone),
    email: cleanText(input.email),
    origin: marketingAttribution.origin,
    channel: marketingAttribution.channel,
    campaign: marketingAttribution.campaign,
    contentId: marketingAttribution.contentId,
    contentTitle: marketingAttribution.contentTitle,
    landingPage: marketingAttribution.landingPage,
    referrer: marketingAttribution.referrer,
    utmSource: marketingAttribution.utmSource,
    utmMedium: marketingAttribution.utmMedium,
    utmCampaign: marketingAttribution.utmCampaign,
    utmTerm: marketingAttribution.utmTerm,
    utmContent: marketingAttribution.utmContent,
    marketingAttribution,
    legalArea: cleanText(input.legalArea),
    city: cleanText(input.city),
    state: cleanText(input.state)?.toUpperCase() || null,
    urgency: normalizeUrgency(input.urgency, pain),
    pain,
    notes: cleanText(input.notes),
    referredBy: cleanText(input.referredBy),
    referralRelationship: cleanText(input.referralRelationship),
  };
}

export function classifyLead(input: NormalizedLeadIntake): LeadKind {
  const combined = normalizeForMatch(`${input.origin || ""} ${input.channel || ""} ${input.pain || ""} ${input.notes || ""} ${input.referredBy || ""} ${input.referralRelationship || ""}`);

  if (STATUS_KEYWORDS.some((keyword) => combined.includes(normalizeForMatch(keyword))) && !input.legalArea) {
    return "case_status_request";
  }

  const hasReferralSignal = Boolean(input.referredBy) || REFERRAL_KEYWORDS.some((keyword) => combined.includes(normalizeForMatch(keyword)));
  if (hasReferralSignal && input.phone && input.pain) {
    return "referral";
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

  if (kind === "referral") {
    score += 10;
    reasons.push("lead veio por indicacao");
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
  input.marketingAttribution.tags.forEach((tag) => tags.add(tag));
  if (input.urgency === "high") tags.add("urgente");
  if (score >= 75) tags.add("lead-quente");
  if (kind === "referral") tags.add("indicacao");
  if (input.referredBy) tags.add(`indicado-por:${input.referredBy.toLowerCase()}`);
  if (kind === "case_status_request") tags.add("status-caso");
  if (kind === "needs_context") tags.add("precisa-contexto");

  return Array.from(tags).slice(0, 10);
}

export function suggestNextStep(input: NormalizedLeadIntake, kind: LeadKind, score: number) {
  if (kind === "case_status_request") {
    return "Encaminhar para atendimento de status do caso antes de tratar como nova oportunidade.";
  }

  if (kind === "needs_context") {
    return "Coletar telefone, area juridica e resumo da dor antes de qualificar comercialmente.";
  }

  if (kind === "referral") {
    return "Encaminhar para SDR confirmar consentimento do indicado, vinculo com quem indicou e melhor horario de contato.";
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
    normalized.campaign ? `Campanha: ${normalized.campaign}` : null,
    normalized.contentTitle ? `Conteudo: ${normalized.contentTitle}` : null,
    normalized.referredBy ? `Indicado por: ${normalized.referredBy}` : null,
    normalized.referralRelationship ? `Relacionamento com indicador: ${normalized.referralRelationship}` : null,
    normalized.pain ? `Dor principal: ${normalized.pain}` : null,
    normalized.notes ? `Observacoes: ${normalized.notes}` : null,
    buildMarketingAttributionDescription(normalized.marketingAttribution),
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
    source: result.kind === "referral" ? result.normalized.origin || "indicacao" : result.normalized.marketingAttribution.source || "growth_intake",
    lead_scoring: result.score,
    data_ultima_movimentacao: new Date().toISOString(),
  };
}

export function buildLeadIntakeEventPayload(params: {
  crmTaskId: string;
  result: LeadIntakeResult;
}) {
  const { result } = params;

  return {
    crm_task_id: params.crmTaskId,
    kind: result.kind,
    score: result.score,
    tags: result.tags,
    needs_human_handoff: result.needsHumanHandoff,
    next_step: result.nextStep,
    lead_name: result.normalized.name,
    phone_present: Boolean(result.normalized.phone),
    legal_area: result.normalized.legalArea,
    origin: result.kind === "referral" ? result.normalized.origin || "indicacao" : result.normalized.origin,
    channel: result.normalized.channel,
    campaign: result.normalized.campaign,
    content_id: result.normalized.contentId,
    content_title: result.normalized.contentTitle,
    landing_page: result.normalized.landingPage,
    referrer: result.normalized.referrer,
    utm_source: result.normalized.utmSource,
    utm_medium: result.normalized.utmMedium,
    utm_campaign: result.normalized.utmCampaign,
    utm_term: result.normalized.utmTerm,
    utm_content: result.normalized.utmContent,
    has_marketing_attribution: result.normalized.marketingAttribution.hasTrackedSource,
    referred_by: result.normalized.referredBy,
    referral_relationship: result.normalized.referralRelationship,
  };
}

export function buildReferralIntakeArtifactMetadata(params: {
  crmTaskId: string;
  result: LeadIntakeResult;
}) {
  const { result } = params;

  return {
    summary: `Indicacao registrada no CRM para ${result.normalized.name}. Proximo passo: ${result.nextStep}`,
    crm_task_id: params.crmTaskId,
    kind: result.kind,
    score: result.score,
    score_reason: result.scoreReason,
    tags: result.tags,
    next_step: result.nextStep,
    needs_human_handoff: result.needsHumanHandoff,
    lead_name: result.normalized.name,
    phone_present: Boolean(result.normalized.phone),
    email_present: Boolean(result.normalized.email),
    legal_area: result.normalized.legalArea,
    urgency: result.normalized.urgency,
    origin: result.normalized.origin || "indicacao",
    channel: result.normalized.channel,
    campaign: result.normalized.campaign,
    content_id: result.normalized.contentId,
    content_title: result.normalized.contentTitle,
    has_marketing_attribution: result.normalized.marketingAttribution.hasTrackedSource,
    referred_by: result.normalized.referredBy,
    referral_relationship: result.normalized.referralRelationship,
    requires_human_action: true,
    human_actions: [result.nextStep],
  };
}

export async function registerReferralIntakeBrainArtifact(params: {
  tenantId: string;
  userId: string | null;
  crmTaskId: string;
  result: LeadIntakeResult;
  supabase: GrowthSupabase;
}): Promise<LeadIntakeBrainTrace | null> {
  if (params.result.kind !== "referral") return null;

  const now = new Date().toISOString();
  const metadata = buildReferralIntakeArtifactMetadata({
    crmTaskId: params.crmTaskId,
    result: params.result,
  });
  let createdTaskId: string | null = null;

  try {
    const { data: task, error: taskError } = await params.supabase
      .from("brain_tasks")
      .insert({
        tenant_id: params.tenantId,
        created_by: params.userId,
        channel: "crm",
        module: "growth",
        status: "completed_with_warnings",
        title: `Indicacao - ${params.result.normalized.name}`,
        goal: "Registrar indicacao comercial e acionar proximo passo humano supervisionado.",
        task_input: {
          source: "api.growth.lead-intake",
          kind: params.result.kind,
          crm_task_id: params.crmTaskId,
        },
        task_context: {
          artifact_type: "referral_intake",
          tags: params.result.tags,
        },
        policy_snapshot: {
          external_side_effects: false,
          secrets_allowed: false,
          human_handoff_required: true,
        },
        result_summary: metadata.summary,
        started_at: now,
        completed_at: now,
      })
      .select("id")
      .single();

    if (taskError || !task?.id) throw taskError || new Error("brain_task_missing");
    createdTaskId = task.id;

    const { data: run, error: runError } = await params.supabase
      .from("brain_runs")
      .insert({
        task_id: task.id,
        tenant_id: params.tenantId,
        attempt_number: 1,
        status: "completed_with_warnings",
        summary: metadata.summary,
        started_at: now,
        completed_at: now,
      })
      .select("id")
      .single();

    if (runError || !run?.id) throw runError || new Error("brain_run_missing");

    const { data: step, error: stepError } = await params.supabase
      .from("brain_steps")
      .insert({
        task_id: task.id,
        run_id: run.id,
        tenant_id: params.tenantId,
        order_index: 1,
        step_key: "referral_intake",
        title: "Registrar indicacao e handoff comercial",
        step_type: "operation",
        capability_name: "referral_intake",
        handler_type: "growth_referral_intake",
        status: "completed",
        input_payload: {
          crm_task_id: params.crmTaskId,
          kind: params.result.kind,
        },
        output_payload: {
          score: params.result.score,
          next_step: params.result.nextStep,
          needs_human_handoff: params.result.needsHumanHandoff,
        },
        started_at: now,
        completed_at: now,
      })
      .select("id")
      .single();

    if (stepError || !step?.id) throw stepError || new Error("brain_step_missing");

    const { data: artifact, error: artifactError } = await params.supabase
      .from("brain_artifacts")
      .insert({
        tenant_id: params.tenantId,
        task_id: task.id,
        run_id: run.id,
        step_id: step.id,
        artifact_type: "referral_intake",
        title: `Indicacao registrada - ${params.result.normalized.name}`,
        mime_type: "application/json",
        source_module: "growth",
        metadata,
      })
      .select("id")
      .single();

    if (artifactError) throw artifactError;

    const { error: learningError } = await params.supabase
      .from("learning_events")
      .insert({
        tenant_id: params.tenantId,
        task_id: task.id,
        run_id: run.id,
        step_id: step.id,
        event_type: "referral_intake_artifact_created",
        source_module: "growth",
        payload: {
          summary: metadata.summary,
          crm_task_id: params.crmTaskId,
          artifact_id: artifact?.id || null,
          score: params.result.score,
          next_step: params.result.nextStep,
          needs_human_handoff: params.result.needsHumanHandoff,
        },
        created_by: params.userId,
      });

    if (learningError) {
      console.error("[growth][lead-intake][brain-event]", learningError.message);
    }

    return {
      taskId: task.id,
      runId: run.id,
      stepId: step.id,
      artifactId: artifact?.id || null,
      eventType: "referral_intake_artifact_created",
    };
  } catch (error) {
    console.error("[growth][lead-intake][brain-artifact]", error);
    if (createdTaskId) {
      await params.supabase.from("brain_tasks").delete().eq("id", createdTaskId);
    }
    return null;
  }
}
