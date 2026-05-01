import { buildCommercialPlaybookModel } from "./commercial-playbook-template";

export type CallCommercialAnalysisInput = {
  crmTaskId?: string | null;
  leadName?: string | null;
  legalArea?: string | null;
  transcript?: string | null;
  notes?: string | null;
  currentStage?: string | null;
  currentScore?: number | string | null;
};

export type CallInterestLevel = "low" | "medium" | "high";

export type CrmUpdateHint = {
  field: string;
  value: string | number | string[] | null;
  reason: string;
};

export type CallCommercialAnalysis = {
  mvpLabel: "MVP upload/analysis - text transcript/notes only";
  leadName: string;
  legalArea: string | null;
  summary: string;
  pain: string;
  interestLevel: CallInterestLevel;
  objections: string[];
  strengths: string[];
  weaknesses: string[];
  missedOpportunities: string[];
  commercialPlaybookMethod: string;
  playbookChecklist: string[];
  playbookGaps: string[];
  recommendedNextStep: string;
  suggestedFollowUp: string;
  advancementProbability: number;
  crmUpdateHints: CrmUpdateHint[];
  requiresHumanReview: true;
  externalSideEffectsBlocked: true;
};

type GrowthSupabase = {
  from: (table: string) => any;
};

export type CallAnalysisBrainTrace = {
  taskId: string;
  runId: string;
  stepId: string;
  artifactId: string | null;
  eventType: "call_analysis_artifact_created";
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

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function combineText(input: CallCommercialAnalysisInput) {
  return [input.transcript, input.notes].map((item) => cleanText(item)).filter(Boolean).join(" ");
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => cleanText(sentence))
    .filter(Boolean) as string[];
}

function firstMatchingSentence(sentences: string[], pattern: RegExp) {
  return sentences.find((sentence) => pattern.test(normalizeText(sentence))) || null;
}

function uniq(items: Array<string | null | false | undefined>) {
  return Array.from(new Set(items.filter(Boolean).map((item) => cleanText(String(item))).filter(Boolean))) as string[];
}

function detectPain(sentences: string[], fallbackArea: string | null) {
  const painSentence = firstMatchingSentence(sentences, /dor|problema|aconteceu|preciso|quero|medo|preocup|negad|prazo|audiencia|bloqueio|rescis|alimentos|divorcio|inss|beneficio/);
  if (painSentence) return painSentence.slice(0, 240);
  return fallbackArea ? `Dor comercial ainda pouco explorada em ${fallbackArea}.` : "Dor comercial ainda pouco explorada na call.";
}

function detectObjections(sentences: string[]) {
  return uniq([
    firstMatchingSentence(sentences, /caro|preco|valor|orcamento|parcel|condicao|sem dinheiro/),
    firstMatchingSentence(sentences, /vou pensar|pensar melhor|nao sei|duvida|insegur/),
    firstMatchingSentence(sentences, /falar com|conversar com|marido|esposa|socio|familia|decisor/),
    firstMatchingSentence(sentences, /sem tempo|depois|mais pra frente|agora nao|nao posso/),
    firstMatchingSentence(sentences, /outro advogado|concorrente|ja estou vendo|segunda opiniao/),
  ]).slice(0, 5);
}

function hasAny(normalizedText: string, pattern: RegExp) {
  return pattern.test(normalizedText);
}

function buildStrengths(params: { normalized: string; pain: string; objections: string[] }) {
  return uniq([
    params.pain && !params.pain.includes("pouco explorada") ? "Dor principal foi capturada com contexto suficiente para orientar o proximo contato." : null,
    hasAny(params.normalized, /prazo|urgente|urgencia|audiencia|bloqueio|hoje|amanha/) ? "Call identificou urgencia ou risco temporal." : null,
    hasAny(params.normalized, /documento|contrato|carta|prova|mensagem|laudo|cnis/) ? "Foram citados documentos ou provas que ajudam a qualificar o caso." : null,
    hasAny(params.normalized, /quero avancar|pode mandar|vamos seguir|fechar|contratar|gostei|faz sentido/) ? "Lead demonstrou sinal explicito de avanco." : null,
    params.objections.length > 0 ? "Objecoes foram verbalizadas e podem ser trabalhadas no follow-up." : null,
  ]);
}

function buildWeaknesses(params: { normalized: string; objections: string[] }) {
  return uniq([
    !hasAny(params.normalized, /valor|preco|investimento|honorario|parcel|condicao/) ? "Investimento e condicoes nao ficaram claros." : null,
    !hasAny(params.normalized, /prazo|urgente|urgencia|audiencia|bloqueio|data/) ? "Urgencia e prazos nao foram validados." : null,
    !hasAny(params.normalized, /quem decide|decisor|marido|esposa|socio|familia|decido/) ? "Decisor e processo de decisao nao foram mapeados." : null,
    params.objections.length === 0 ? "Nenhuma objecao foi isolada; pode haver resistencia oculta." : null,
  ]);
}

function buildMissedOpportunities(normalized: string) {
  return uniq([
    !hasAny(normalized, /proximo passo|agend|reuniao|retorno marcado|retornar (hoje|amanha)|combinamos|ficou combinado/) ? "Definir proximo passo com data, canal e responsavel." : null,
    !hasAny(normalized, /valor|preco|investimento|honorario|parcel|condicao/) ? "Ancorar valor percebido antes de discutir honorarios." : null,
    !hasAny(normalized, /medo|preocup|tranquil|seguranca|risco/) ? "Explorar impacto emocional e custo de nao agir." : null,
    !hasAny(normalized, /documento|prova|contrato|mensagem|carta|laudo|cnis/) ? "Pedir documentos minimos para reduzir incerteza do caso." : null,
  ]);
}

function buildPlaybookGaps(normalized: string) {
  return uniq([
    !hasAny(normalized, /respondeu|primeira resposta|5 minutos|cinco minutos/) ? "SLA de primeiro atendimento nao foi evidenciado na call." : null,
    !hasAny(normalized, /quem decide|decisor|marido|esposa|socio|familia|decido/) ? "Decisor e influenciadores nao foram confirmados." : null,
    !hasAny(normalized, /se esse ponto|se isso fosse|se isso resolvesse|estaria pronto|isol/) ? "Objecao nao foi isolada antes da resposta comercial." : null,
    !hasAny(normalized, /proximo passo|agend|reuniao|retorno marcado|combinamos|ficou combinado/) ? "Proximo passo saiu sem data, canal ou responsavel claro." : null,
  ]);
}

function calculateAdvancementProbability(params: {
  normalized: string;
  objections: string[];
  weaknesses: string[];
  currentScore: number | null;
}) {
  let probability = params.currentScore !== null ? Math.max(0, Math.min(100, Math.round(params.currentScore))) : 45;

  if (hasAny(params.normalized, /quero avancar|pode mandar|vamos seguir|fechar|contratar|gostei|faz sentido/)) probability += 22;
  if (hasAny(params.normalized, /prazo|urgente|urgencia|audiencia|bloqueio|hoje|amanha/)) probability += 12;
  if (hasAny(params.normalized, /documento|contrato|carta|prova|mensagem|laudo|cnis/)) probability += 8;
  if (hasAny(params.normalized, /valor|preco|investimento|honorario|parcel|condicao/)) probability += 4;
  if (params.objections.length > 0) probability -= Math.min(18, params.objections.length * 6);
  if (params.weaknesses.length >= 3) probability -= 10;
  if (hasAny(params.normalized, /nao tenho interesse|nao quero|desisti|contratei outro|ja resolvi/)) probability -= 30;

  return Math.max(5, Math.min(95, probability));
}

function interestFromProbability(probability: number): CallInterestLevel {
  if (probability >= 70) return "high";
  if (probability >= 40) return "medium";
  return "low";
}

export function buildCallCommercialAnalysis(input: CallCommercialAnalysisInput): CallCommercialAnalysis {
  const leadName = cleanText(input.leadName) || "Lead sem nome";
  const legalArea = cleanText(input.legalArea);
  const text = combineText(input);
  const sentences = splitSentences(text);
  const normalized = normalizeText(text);
  const currentScore = numberOrNull(input.currentScore);
  const pain = detectPain(sentences, legalArea);
  const objections = detectObjections(sentences);
  const strengths = buildStrengths({ normalized, pain, objections });
  const weaknesses = buildWeaknesses({ normalized, objections });
  const missedOpportunities = buildMissedOpportunities(normalized);
  const playbook = buildCommercialPlaybookModel({ legalArea });
  const playbookGaps = buildPlaybookGaps(normalized);
  const advancementProbability = calculateAdvancementProbability({ normalized, objections, weaknesses, currentScore });
  const interestLevel = interestFromProbability(advancementProbability);
  const nextStep = interestLevel === "high"
    ? "SDR deve revisar a call e propor avanco humano com prazo definido, sem envio automatico."
    : interestLevel === "medium"
      ? "SDR deve esclarecer objecao principal, confirmar decisor e combinar retorno objetivo."
      : "SDR deve retomar descoberta, validar dor real e decidir se o lead permanece no pipeline.";
  const suggestedFollowUp = interestLevel === "high"
    ? `Ola, ${leadName.split(/\s+/)[0]}. Revendo nossa conversa, o ponto central foi: ${pain} Posso te chamar para alinharmos o proximo passo e os documentos necessarios?`
    : `Ola, ${leadName.split(/\s+/)[0]}. Fiquei com um ponto importante da nossa conversa para confirmar: ${pain} O que mais pesa para voce decidir o proximo passo agora?`;
  const tags = uniq([
    "call_analisada_mvp",
    `interesse_${interestLevel}`,
    objections.length > 0 ? "objecao_mapeada" : null,
    hasAny(normalized, /prazo|urgente|urgencia|audiencia|bloqueio|hoje|amanha/) ? "urgencia" : null,
  ]);

  return {
    mvpLabel: "MVP upload/analysis - text transcript/notes only",
    leadName,
    legalArea,
    summary: `Analise deterministica de call para ${leadName}${legalArea ? ` em ${legalArea}` : ""}: interesse ${interestLevel}, probabilidade ${advancementProbability}% e ${objections.length} objecao(oes) mapeada(s).`,
    pain,
    interestLevel,
    objections,
    strengths,
    weaknesses,
    missedOpportunities: uniq([...missedOpportunities, ...playbookGaps]).slice(0, 8),
    commercialPlaybookMethod: playbook.methodName,
    playbookChecklist: playbook.callAnalysisChecklist,
    playbookGaps,
    recommendedNextStep: nextStep,
    suggestedFollowUp,
    advancementProbability,
    crmUpdateHints: [
      { field: "score", value: advancementProbability, reason: "Probabilidade comercial calculada a partir dos sinais da call." },
      { field: "tags", value: tags, reason: "Tags sugeridas para segmentacao e fila de follow-up." },
      { field: "stage", value: interestLevel === "high" ? "Proxima acao comercial" : cleanText(input.currentStage) || "Qualificacao", reason: "Estagio sugerido sem mover automaticamente o card." },
      { field: "next_action", value: nextStep, reason: "Acao humana recomendada antes de qualquer contato externo." },
      { field: "last_call_summary", value: pain, reason: "Resumo curto para historico do CRM." },
    ],
    requiresHumanReview: true,
    externalSideEffectsBlocked: true,
  };
}

export function buildCallCommercialAnalysisArtifactMetadata(params: {
  crmTaskId?: string | null;
  analysis: CallCommercialAnalysis;
}) {
  const safeCrmUpdateHints = params.analysis.crmUpdateHints.filter((hint) => hint.field !== "last_call_summary");

  return {
    summary: params.analysis.summary,
    crm_task_id: params.crmTaskId || null,
    mvp_label: params.analysis.mvpLabel,
    lead_name: params.analysis.leadName,
    legal_area: params.analysis.legalArea,
    interest_level: params.analysis.interestLevel,
    strengths: params.analysis.strengths,
    weaknesses: params.analysis.weaknesses,
    missed_opportunities: params.analysis.missedOpportunities,
    recommended_next_step: params.analysis.recommendedNextStep,
    commercial_playbook_method: params.analysis.commercialPlaybookMethod,
    playbook_gap_count: params.analysis.playbookGaps.length,
    playbook_gaps: params.analysis.playbookGaps,
    playbook_checklist_count: params.analysis.playbookChecklist.length,
    advancement_probability: params.analysis.advancementProbability,
    crm_update_hints: safeCrmUpdateHints,
    requires_human_review: true,
    requires_human_action: true,
    external_side_effects_blocked: true,
    human_actions: [params.analysis.recommendedNextStep],
  };
}

export function buildCallCommercialAnalysisSystemEventPayload(params: {
  crmTaskId: string;
  analysis: CallCommercialAnalysis;
}) {
  const metadata = buildCallCommercialAnalysisArtifactMetadata({
    crmTaskId: params.crmTaskId,
    analysis: params.analysis,
  });

  return {
    ...metadata,
    persistence: "system_event_logs",
  };
}

export async function registerCallCommercialAnalysisBrainArtifact(params: {
  tenantId: string;
  userId: string | null;
  crmTaskId: string;
  analysis: CallCommercialAnalysis;
  supabase: GrowthSupabase;
}): Promise<CallAnalysisBrainTrace | null> {
  const now = new Date().toISOString();
  const metadata = buildCallCommercialAnalysisArtifactMetadata({
    crmTaskId: params.crmTaskId,
    analysis: params.analysis,
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
        title: `Analise de call - ${params.analysis.leadName}`,
        goal: "Registrar analise comercial segura da call e orientar proxima acao humana supervisionada.",
        task_input: {
          source: "api.growth.call-analysis",
          crm_task_id: params.crmTaskId,
        },
        task_context: {
          artifact_type: "call_commercial_analysis",
          interest_level: params.analysis.interestLevel,
        },
        policy_snapshot: {
          external_side_effects: false,
          secrets_allowed: false,
          human_handoff_required: true,
          raw_transcript_allowed: false,
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
        step_key: "call_commercial_analysis",
        title: "Registrar analise comercial da call",
        step_type: "operation",
        capability_name: "call_commercial_analysis",
        handler_type: "growth_call_analysis",
        status: "completed",
        input_payload: {
          crm_task_id: params.crmTaskId,
        },
        output_payload: {
          interest_level: params.analysis.interestLevel,
          advancement_probability: params.analysis.advancementProbability,
          commercial_playbook_method: params.analysis.commercialPlaybookMethod,
          playbook_gap_count: params.analysis.playbookGaps.length,
          requires_human_review: true,
          external_side_effects_blocked: true,
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
        artifact_type: "call_commercial_analysis",
        title: `Analise de call - ${params.analysis.leadName}`,
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
        event_type: "call_analysis_artifact_created",
        source_module: "growth",
        payload: {
          summary: metadata.summary,
          crm_task_id: params.crmTaskId,
          artifact_id: artifact?.id || null,
          interest_level: params.analysis.interestLevel,
          advancement_probability: params.analysis.advancementProbability,
          commercial_playbook_method: params.analysis.commercialPlaybookMethod,
          playbook_gap_count: params.analysis.playbookGaps.length,
          requires_human_review: true,
          external_side_effects_blocked: true,
        },
        created_by: params.userId,
      });

    if (learningError) {
      console.error("[growth][call-analysis][brain-event]", learningError.message);
    }

    return {
      taskId: task.id,
      runId: run.id,
      stepId: step.id,
      artifactId: artifact?.id || null,
      eventType: "call_analysis_artifact_created",
    };
  } catch (error) {
    console.error("[growth][call-analysis][brain-artifact]", error);
    if (createdTaskId) {
      await params.supabase.from("brain_tasks").delete().eq("id", createdTaskId);
    }
    return null;
  }
}
