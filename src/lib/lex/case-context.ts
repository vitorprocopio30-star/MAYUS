import { supabaseAdmin } from "@/lib/supabase/admin";

type ProcessTaskCaseRow = {
  id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  client_name: string | null;
  process_number: string | null;
  demanda: string | null;
  description: string | null;
  created_at: string;
};

type ProcessStageRow = {
  id: string;
  name: string;
};

type ProcessPipelineRow = {
  id: string;
  name: string;
};

type ProcessDocumentMemoryCaseRow = {
  process_task_id: string;
  summary_master?: string | null;
  missing_documents?: string[] | null;
  current_phase?: string | null;
  document_count?: number | null;
  sync_status?: string | null;
  last_synced_at?: string | null;
  case_brain_task_id?: string | null;
  draft_plan_summary?: Record<string, unknown> | null;
  first_draft_status?: string | null;
  first_draft_task_id?: string | null;
  first_draft_artifact_id?: string | null;
  first_draft_case_brain_task_id?: string | null;
  first_draft_summary?: string | null;
  first_draft_error?: string | null;
  first_draft_generated_at?: string | null;
};

type BrainTaskCaseRow = {
  id: string;
  task_context: Record<string, unknown> | null;
};

type BrainMemoryRow = {
  id: string;
  memory_type: string;
  value: unknown;
  created_at: string;
};

type BrainArtifactDraftRow = {
  id: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

export type LegalCaseContextSnapshot = {
  processTask: {
    id: string;
    title: string;
    clientName: string | null;
    processNumber: string | null;
    legalArea: string | null;
    description: string | null;
    pipelineName: string | null;
    stageName: string | null;
    createdAt: string;
  };
  caseBrain: {
    taskId: string | null;
    caseId: string | null;
    summaryMaster: string | null;
    currentPhase: string | null;
    queriesCount: number;
    keyFactsCount: number;
    recommendedPieceInput: string | null;
    recommendedPieceLabel: string | null;
    firstActions: string[];
    missingDocuments: string[];
    validatedInternalSourcesCount: number;
    validatedLawReferencesCount: number;
    validatedCaseLawReferencesCount: number;
    externalValidationGapCount: number;
    pendingValidationCount: number;
    readyForFactCitations: boolean;
    readyForLawCitations: boolean;
    readyForCaseLawCitations: boolean;
  };
  documentMemory: {
    documentCount: number;
    syncStatus: string | null;
    lastSyncedAt: string | null;
    summaryMaster: string | null;
    currentPhase: string | null;
    missingDocuments: string[];
    freshness: "fresh" | "stale" | "missing";
  };
  firstDraft: {
    status: "idle" | "queued" | "running" | "completed" | "failed";
    isStale: boolean;
    artifactId: string | null;
    taskId: string | null;
    caseBrainTaskId: string | null;
    summary: string | null;
    error: string | null;
    generatedAt: string | null;
    pieceType: string | null;
    pieceLabel: string | null;
    recommendedPieceInput: string | null;
    recommendedPieceLabel: string | null;
    practiceArea: string | null;
    requiresHumanReview: boolean;
    warningCount: number;
  };
};

export type SupportCaseStatusResponseMode = "answer" | "handoff";

export type SupportCaseStatusConfidence = "high" | "medium" | "low";

export type SupportCaseStatusHandoffReason = "case_not_identified" | "ambiguous_case_match" | "insufficient_case_grounding";

export type SupportCaseStatusGrounding = {
  factualSources: string[];
  inferenceNotes: string[];
  missingSignals: string[];
};

export type SupportCaseStatusContract = {
  responseMode: SupportCaseStatusResponseMode;
  confidence: SupportCaseStatusConfidence;
  processTaskId: string;
  processLabel: string;
  clientLabel: string | null;
  statusHeadline: string;
  progressSummary: string | null;
  currentPhase: string | null;
  nextStep: string | null;
  pendingItems: string[];
  summary: string | null;
  grounding: SupportCaseStatusGrounding;
  handoffReason: SupportCaseStatusHandoffReason | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: Record<string, unknown> | null | undefined, key: string) {
  const item = value?.[key];
  return typeof item === "string" && item.trim().length > 0 ? item.trim() : null;
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function getBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function getNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = Number(value);
    if (Number.isFinite(normalized)) return normalized;
  }
  return fallback;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function resolveDocumentMemoryFreshness(memory: ProcessDocumentMemoryCaseRow | null) {
  if (!memory?.last_synced_at || !memory?.sync_status) {
    return "missing" as const;
  }

  const syncedAt = new Date(memory.last_synced_at).getTime();
  if (!Number.isFinite(syncedAt)) {
    return "stale" as const;
  }

  const ageMs = Date.now() - syncedAt;
  const staleThresholdMs = 1000 * 60 * 60 * 24 * 7;
  return ageMs <= staleThresholdMs && memory.sync_status === "synced" ? "fresh" as const : "stale" as const;
}

function formatDateTimeLabel(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("pt-BR");
}

function normalizeFirstDraftStatus(value?: string | null) {
  switch (value) {
    case "queued":
    case "running":
    case "completed":
    case "failed":
      return value;
    default:
      return "idle" as const;
  }
}

function latestMemoryByType(memories: BrainMemoryRow[]) {
  return memories.reduce<Record<string, BrainMemoryRow>>((acc, memory) => {
    acc[memory.memory_type] = memory;
    return acc;
  }, {});
}

function sanitizeReference(value: string) {
  return value.replace(/[,%()]/g, " ").replace(/\s+/g, " ").trim();
}

function pickFirstString(entities: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = String(entities[key] || "").trim();
    if (value) return value;
  }
  return null;
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

async function resolveProcessTaskById(tenantId: string, processTaskId: string) {
  const { data, error } = await supabaseAdmin
    .from("process_tasks")
    .select("id, pipeline_id, stage_id, title, client_name, process_number, demanda, description, created_at")
    .eq("tenant_id", tenantId)
    .eq("id", processTaskId)
    .maybeSingle<ProcessTaskCaseRow>();

  if (error) throw error;
  return data || null;
}

async function resolveProcessTaskByProcessNumber(tenantId: string, processNumber: string) {
  const normalized = processNumber.trim();
  if (!normalized) return null;

  let { data, error } = await supabaseAdmin
    .from("process_tasks")
    .select("id, pipeline_id, stage_id, title, client_name, process_number, demanda, description, created_at")
    .eq("tenant_id", tenantId)
    .eq("process_number", normalized)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ProcessTaskCaseRow>();

  if (error) throw error;
  if (data) return data;

  ({ data, error } = await supabaseAdmin
    .from("process_tasks")
    .select("id, pipeline_id, stage_id, title, client_name, process_number, demanda, description, created_at")
    .eq("tenant_id", tenantId)
    .ilike("process_number", `%${sanitizeReference(normalized)}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ProcessTaskCaseRow>());

  if (error) throw error;
  return data || null;
}

async function resolveProcessTaskByReference(tenantId: string, reference: string) {
  const normalized = sanitizeReference(reference);
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from("process_tasks")
    .select("id, pipeline_id, stage_id, title, client_name, process_number, demanda, description, created_at")
    .eq("tenant_id", tenantId)
    .or(`client_name.ilike.%${normalized}%,title.ilike.%${normalized}%,process_number.ilike.%${normalized}%`)
    .order("created_at", { ascending: false })
    .limit(2);

  if (error) throw error;
  const matches = (data || []) as ProcessTaskCaseRow[];
  if (matches.length > 1) {
    throw new Error("Encontrei mais de um processo juridico para essa referencia. Informe o numero do processo ou o ID interno.");
  }

  return matches[0] || null;
}

export async function resolveLegalProcessTask(params: { tenantId: string; entities: Record<string, string> }) {
  const processTaskId = pickFirstString(params.entities, ["process_task_id", "task_id"]);
  const processTaskIdFallback = processTaskId && !looksLikeUuid(processTaskId) ? processTaskId : null;

  if (processTaskId && !processTaskIdFallback) {
    const byId = await resolveProcessTaskById(params.tenantId, processTaskId);
    if (byId) return byId;
  }

  const processNumber = pickFirstString(params.entities, ["process_number", "numero_processo", "numero_cnj"]) || processTaskIdFallback;
  if (processNumber) {
    const byNumber = await resolveProcessTaskByProcessNumber(params.tenantId, processNumber);
    if (byNumber) return byNumber;
  }

  const reference = pickFirstString(params.entities, ["process_reference", "client_name", "process_title", "title", "case_reference"]) || processTaskIdFallback;
  if (reference) {
    const byReference = await resolveProcessTaskByReference(params.tenantId, reference);
    if (byReference) return byReference;
  }

  throw new Error("Nao consegui identificar qual processo juridico voce quer consultar. Informe o numero do processo, o cliente ou o ID interno.");
}

async function loadDocumentMemory(tenantId: string, processTaskId: string) {
  const { data, error } = await supabaseAdmin
    .from("process_document_memory")
    .select("process_task_id, summary_master, missing_documents, current_phase, document_count, sync_status, last_synced_at, case_brain_task_id, draft_plan_summary, first_draft_status, first_draft_task_id, first_draft_artifact_id, first_draft_case_brain_task_id, first_draft_summary, first_draft_error, first_draft_generated_at")
    .eq("tenant_id", tenantId)
    .eq("process_task_id", processTaskId)
    .maybeSingle<ProcessDocumentMemoryCaseRow>();

  if (error) throw error;
  return data || null;
}

async function loadStageAndPipeline(processTask: ProcessTaskCaseRow) {
  const [{ data: stage, error: stageError }, { data: pipeline, error: pipelineError }] = await Promise.all([
    supabaseAdmin
      .from("process_stages")
      .select("id, name")
      .eq("id", processTask.stage_id)
      .maybeSingle<ProcessStageRow>(),
    supabaseAdmin
      .from("process_pipelines")
      .select("id, name")
      .eq("id", processTask.pipeline_id)
      .maybeSingle<ProcessPipelineRow>(),
  ]);

  if (stageError) throw stageError;
  if (pipelineError) throw pipelineError;

  return {
    stageName: stage?.name || null,
    pipelineName: pipeline?.name || null,
  };
}

async function loadCaseBrainTask(tenantId: string, caseBrainTaskId: string | null | undefined) {
  if (!caseBrainTaskId) return null;

  const { data, error } = await supabaseAdmin
    .from("brain_tasks")
    .select("id, task_context")
    .eq("tenant_id", tenantId)
    .eq("id", caseBrainTaskId)
    .maybeSingle<BrainTaskCaseRow>();

  if (error) throw error;
  return data || null;
}

async function loadCaseBrainMemories(tenantId: string, caseBrainTaskId: string | null | undefined) {
  if (!caseBrainTaskId) return [] as BrainMemoryRow[];

  const { data, error } = await supabaseAdmin
    .from("brain_memories")
    .select("id, memory_type, value, created_at")
    .eq("tenant_id", tenantId)
    .eq("task_id", caseBrainTaskId)
    .in("memory_type", ["draft_plan", "legal_research_pack", "validated_source_pack"])
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as BrainMemoryRow[];
}

async function loadDraftArtifact(tenantId: string, artifactId: string | null | undefined) {
  if (!artifactId) return null;

  const { data, error } = await supabaseAdmin
    .from("brain_artifacts")
    .select("id, metadata, created_at")
    .eq("tenant_id", tenantId)
    .eq("id", artifactId)
    .maybeSingle<BrainArtifactDraftRow>();

  if (error) throw error;
  return data || null;
}

function isFirstDraftStale(documentMemory: ProcessDocumentMemoryCaseRow | null, currentCaseBrainTaskId: string | null) {
  const artifactId = documentMemory?.first_draft_artifact_id || null;
  if (!artifactId || !currentCaseBrainTaskId) {
    return false;
  }

  const sourceCaseBrainTaskId = documentMemory?.first_draft_case_brain_task_id || null;
  if (!sourceCaseBrainTaskId) {
    return true;
  }

  return sourceCaseBrainTaskId !== currentCaseBrainTaskId;
}

export async function getLegalCaseContextSnapshot(params: { tenantId: string; entities: Record<string, string> }): Promise<LegalCaseContextSnapshot> {
  const processTask = await resolveLegalProcessTask(params);
  const documentMemory = await loadDocumentMemory(params.tenantId, processTask.id);
  const [{ stageName, pipelineName }, caseBrainTask, draftArtifact] = await Promise.all([
    loadStageAndPipeline(processTask),
    loadCaseBrainTask(params.tenantId, documentMemory?.case_brain_task_id || null),
    loadDraftArtifact(params.tenantId, documentMemory?.first_draft_artifact_id || null),
  ]);
  const memories = await loadCaseBrainMemories(params.tenantId, documentMemory?.case_brain_task_id || null);
  const latestMemories = latestMemoryByType(memories);
  const draftPlanMemory = isRecord(latestMemories.draft_plan?.value) ? latestMemories.draft_plan.value : null;
  const researchPackMemory = isRecord(latestMemories.legal_research_pack?.value) ? latestMemories.legal_research_pack.value : null;
  const validatedSourcePackMemory = isRecord(latestMemories.validated_source_pack?.value) ? latestMemories.validated_source_pack.value : null;
  const sourcePack = isRecord(validatedSourcePackMemory?.source_pack) ? validatedSourcePackMemory.source_pack : null;
  const citationChecklist = isRecord(validatedSourcePackMemory?.citation_checklist) ? validatedSourcePackMemory.citation_checklist : null;
  const validatedExternalSources = isRecord(sourcePack?.validated_external_sources) ? sourcePack.validated_external_sources : null;
  const draftArtifactMetadata = isRecord(draftArtifact?.metadata) ? draftArtifact.metadata : null;
  const currentCaseBrainTaskId = documentMemory?.case_brain_task_id || null;
  const firstDraftStale = isFirstDraftStale(documentMemory, currentCaseBrainTaskId);

  return {
    processTask: {
      id: processTask.id,
      title: processTask.title,
      clientName: processTask.client_name || null,
      processNumber: processTask.process_number || null,
      legalArea: processTask.demanda || null,
      description: processTask.description || null,
      pipelineName,
      stageName,
      createdAt: processTask.created_at,
    },
    caseBrain: {
      taskId: currentCaseBrainTaskId,
      caseId: getString(caseBrainTask?.task_context, "case_id"),
      summaryMaster: getString(researchPackMemory, "summary_master") || getString(sourcePack?.internal_context as Record<string, unknown> | null, "summary_master") || documentMemory?.summary_master || null,
      currentPhase: getString(researchPackMemory, "current_phase") || getString(sourcePack?.internal_context as Record<string, unknown> | null, "current_phase") || documentMemory?.current_phase || null,
      queriesCount: getStringArray(researchPackMemory?.queries).length,
      keyFactsCount: Array.isArray(researchPackMemory?.key_facts) ? researchPackMemory.key_facts.length : 0,
      recommendedPieceInput: getString(draftPlanMemory, "recommended_piece_input") || getString(documentMemory?.draft_plan_summary || null, "recommended_piece_input"),
      recommendedPieceLabel: getString(draftPlanMemory, "recommended_piece_label") || getString(documentMemory?.draft_plan_summary || null, "recommended_piece_label"),
      firstActions: getStringArray(draftPlanMemory?.first_actions || documentMemory?.draft_plan_summary?.first_actions),
      missingDocuments: getStringArray(draftPlanMemory?.missing_documents || documentMemory?.draft_plan_summary?.missing_documents || documentMemory?.missing_documents),
      validatedInternalSourcesCount: Array.isArray(sourcePack?.validated_internal_sources) ? sourcePack.validated_internal_sources.length : 0,
      validatedLawReferencesCount: Array.isArray(validatedExternalSources?.law_references) ? validatedExternalSources.law_references.length : 0,
      validatedCaseLawReferencesCount: Array.isArray(validatedExternalSources?.case_law_references) ? validatedExternalSources.case_law_references.length : 0,
      externalValidationGapCount: getStringArray(sourcePack?.external_validation_gaps).length,
      pendingValidationCount: getStringArray(citationChecklist?.pending_validations).length,
      readyForFactCitations: getBoolean(citationChecklist?.ready_for_fact_citations),
      readyForLawCitations: getBoolean(citationChecklist?.ready_for_law_citations),
      readyForCaseLawCitations: getBoolean(citationChecklist?.ready_for_case_law_citations),
    },
    documentMemory: {
      documentCount: getNumber(documentMemory?.document_count),
      syncStatus: documentMemory?.sync_status || null,
      lastSyncedAt: documentMemory?.last_synced_at || null,
      summaryMaster: documentMemory?.summary_master || null,
      currentPhase: documentMemory?.current_phase || null,
      missingDocuments: getStringArray(documentMemory?.missing_documents),
      freshness: resolveDocumentMemoryFreshness(documentMemory),
    },
    firstDraft: {
      status: normalizeFirstDraftStatus(documentMemory?.first_draft_status),
      isStale: firstDraftStale,
      artifactId: documentMemory?.first_draft_artifact_id || null,
      taskId: documentMemory?.first_draft_task_id || null,
      caseBrainTaskId: documentMemory?.first_draft_case_brain_task_id || null,
      summary: documentMemory?.first_draft_summary || null,
      error: documentMemory?.first_draft_error || null,
      generatedAt: documentMemory?.first_draft_generated_at || draftArtifact?.created_at || null,
      pieceType: getString(draftArtifactMetadata, "piece_type"),
      pieceLabel: getString(draftArtifactMetadata, "piece_label"),
      recommendedPieceInput: getString(draftArtifactMetadata, "recommended_piece_input") || getString(documentMemory?.draft_plan_summary || null, "recommended_piece_input"),
      recommendedPieceLabel: getString(draftArtifactMetadata, "recommended_piece_label") || getString(documentMemory?.draft_plan_summary || null, "recommended_piece_label"),
      practiceArea: getString(draftArtifactMetadata, "practice_area"),
      requiresHumanReview: getBoolean(draftArtifactMetadata?.requires_human_review, true),
      warningCount: getStringArray(draftArtifactMetadata?.warnings).length,
    },
  };
}

function describeFirstDraftStatus(snapshot: LegalCaseContextSnapshot) {
  switch (snapshot.firstDraft.status) {
    case "queued":
      return snapshot.firstDraft.isStale && snapshot.firstDraft.artifactId
        ? "Atualizacao da minuta enfileirada"
        : "Primeira minuta enfileirada";
    case "running":
      return snapshot.firstDraft.isStale && snapshot.firstDraft.artifactId
        ? "Atualizacao da minuta em andamento"
        : "Primeira minuta em geracao";
    case "completed":
      return snapshot.firstDraft.isStale
        ? "Existe minuta anterior, mas ela esta desatualizada"
        : "Primeira minuta pronta";
    case "failed":
      return snapshot.firstDraft.isStale && snapshot.firstDraft.artifactId
        ? "Atualizacao da minuta falhou; ainda existe uma versao anterior"
        : "Ultima tentativa da minuta falhou";
    default:
      return snapshot.caseBrain.recommendedPieceInput
        ? "Draft plan pronto, mas a primeira minuta ainda nao foi gerada"
        : "Case Brain ainda nao preparou a primeira minuta sugerida";
  }
}

function resolveSupportCasePhase(snapshot: LegalCaseContextSnapshot) {
  return snapshot.caseBrain.currentPhase
    || snapshot.documentMemory.currentPhase
    || snapshot.processTask.stageName
    || null;
}

function resolveSupportCaseProgressSummary(snapshot: LegalCaseContextSnapshot) {
  return snapshot.caseBrain.summaryMaster
    || snapshot.documentMemory.summaryMaster
    || snapshot.processTask.description
    || null;
}

function resolveSupportCaseSummary(snapshot: LegalCaseContextSnapshot) {
  return snapshot.caseBrain.summaryMaster
    || snapshot.documentMemory.summaryMaster
    || null;
}

function resolveSupportCasePendingItems(snapshot: LegalCaseContextSnapshot) {
  return uniqueStrings([
    ...snapshot.caseBrain.missingDocuments,
    ...snapshot.documentMemory.missingDocuments,
  ]).slice(0, 3);
}

function resolveSupportCaseNextStep(snapshot: LegalCaseContextSnapshot, pendingItems: string[]) {
  if (snapshot.caseBrain.firstActions[0]) {
    return snapshot.caseBrain.firstActions[0];
  }

  if (pendingItems.length > 0) {
    return `Confirmar e organizar a pendencia documental "${pendingItems[0]}" antes do proximo movimento relevante.`;
  }

  return null;
}

function resolveSupportCaseGrounding(params: {
  snapshot: LegalCaseContextSnapshot;
  progressSummary: string | null;
  currentPhase: string | null;
  nextStep: string | null;
  pendingItems: string[];
}) {
  const { snapshot, progressSummary, currentPhase, nextStep, pendingItems } = params;
  const factualSources = uniqueStrings([
    snapshot.caseBrain.taskId && snapshot.caseBrain.summaryMaster ? "resumo do Case Brain" : null,
    snapshot.caseBrain.taskId && snapshot.caseBrain.currentPhase ? "fase do Case Brain" : null,
    snapshot.documentMemory.freshness === "fresh" && snapshot.documentMemory.summaryMaster ? "memoria documental sincronizada" : null,
    snapshot.documentMemory.freshness === "stale" && snapshot.documentMemory.summaryMaster ? "memoria documental desatualizada" : null,
    snapshot.documentMemory.freshness === "fresh" && snapshot.documentMemory.currentPhase ? "fase da memoria documental" : null,
    snapshot.documentMemory.freshness === "stale" && snapshot.documentMemory.currentPhase ? "fase de memoria documental desatualizada" : null,
    snapshot.processTask.stageName ? "etapa operacional do processo" : null,
    snapshot.caseBrain.firstActions.length > 0 ? "acoes iniciais do Case Brain" : null,
    pendingItems.length > 0 ? "lacunas documentais registradas" : null,
  ]);

  const inferenceNotes = uniqueStrings([
    !snapshot.caseBrain.firstActions[0] && pendingItems.length > 0 && nextStep
      ? "proximo passo inferido a partir da primeira pendencia documental"
      : null,
    !snapshot.caseBrain.summaryMaster && !snapshot.documentMemory.summaryMaster && snapshot.processTask.description && progressSummary
      ? "andamento resumido a partir da descricao operacional do processo"
      : null,
  ]);

  const missingSignals = uniqueStrings([
    !progressSummary ? "andamento consolidado" : null,
    !currentPhase ? "fase atual" : null,
    !nextStep ? "proximo passo" : null,
    pendingItems.length === 0 ? "pendencias documentais registradas" : null,
    snapshot.documentMemory.freshness === "missing" ? "memoria documental sincronizada" : null,
  ]);

  return {
    factualSources,
    inferenceNotes,
    missingSignals,
  };
}

function resolveSupportCaseStatusHeadline(params: {
  currentPhase: string | null;
  summary: string | null;
}) {
  if (params.currentPhase && params.summary) {
    return `${params.summary} Fase atual: ${params.currentPhase}.`;
  }

  if (params.currentPhase) {
    return `O caso esta atualmente na fase ${params.currentPhase}.`;
  }

  if (params.summary) {
    return params.summary;
  }

  return "Base minima de status ainda nao consolidada para resposta automatica.";
}

export function buildSupportCaseStatusContract(snapshot: LegalCaseContextSnapshot): SupportCaseStatusContract {
  const processLabel = snapshot.processTask.processNumber || snapshot.processTask.title;
  const currentPhase = resolveSupportCasePhase(snapshot);
  const progressSummary = resolveSupportCaseProgressSummary(snapshot);
  const summary = resolveSupportCaseSummary(snapshot);
  const pendingItems = resolveSupportCasePendingItems(snapshot);
  const nextStep = resolveSupportCaseNextStep(snapshot, pendingItems);
  const grounding = resolveSupportCaseGrounding({
    snapshot,
    progressSummary,
    currentPhase,
    nextStep,
    pendingItems,
  });
  const hasCaseGrounding = Boolean(snapshot.caseBrain.taskId)
    || snapshot.documentMemory.freshness !== "missing"
    || Boolean(snapshot.processTask.stageName);
  const signalCount = [progressSummary, currentPhase, nextStep, pendingItems.length > 0 ? "pending" : null]
    .filter(Boolean)
    .length;

  const confidence = hasCaseGrounding && currentPhase && (progressSummary || nextStep)
    ? "high"
    : hasCaseGrounding && signalCount >= 2
      ? "medium"
      : "low";
  const responseMode = confidence === "low" ? "handoff" : "answer";

  return {
    responseMode,
    confidence,
    processTaskId: snapshot.processTask.id,
    processLabel,
    clientLabel: snapshot.processTask.clientName || null,
    statusHeadline: resolveSupportCaseStatusHeadline({ currentPhase, summary: progressSummary }),
    progressSummary,
    currentPhase,
    nextStep,
    pendingItems,
    summary,
    grounding,
    handoffReason: responseMode === "handoff" ? "insufficient_case_grounding" : null,
  };
}

export function buildSupportCaseStatusReply(contract: SupportCaseStatusContract) {
  if (contract.responseMode === "handoff") {
    return [
      "## Status do caso",
      `- Processo: ${contract.processLabel}`,
      contract.clientLabel ? `- Cliente: ${contract.clientLabel}` : null,
      "- Nao encontrei base segura suficiente para responder este status automaticamente.",
      contract.grounding.factualSources.length > 0
        ? `- Base confirmada: ${contract.grounding.factualSources.join("; ")}`
        : null,
      contract.grounding.missingSignals.length > 0
        ? `- Sinais faltantes: ${contract.grounding.missingSignals.join("; ")}`
        : null,
      "- Encaminhamento: handoff humano recomendado antes de atualizar o cliente.",
      contract.handoffReason === "insufficient_case_grounding"
        ? "- Motivo: o contexto atual do caso ainda esta incompleto para uma resposta curta e segura."
        : null,
    ].filter(Boolean).join("\n");
  }

  return [
    "## Status do caso",
    `- Processo: ${contract.processLabel}`,
    contract.clientLabel ? `- Cliente: ${contract.clientLabel}` : null,
    `- Andamento: ${contract.progressSummary || contract.statusHeadline}`,
    contract.currentPhase ? `- Fase atual: ${contract.currentPhase}` : null,
    contract.nextStep ? `- Proximo passo: ${contract.nextStep}` : null,
    contract.pendingItems.length > 0
      ? `- Pendencias: ${contract.pendingItems.join("; ")}`
      : "- Pendencias: nenhuma pendencia critica registrada",
    contract.grounding.factualSources.length > 0
      ? `- Base confirmada: ${contract.grounding.factualSources.join("; ")}`
      : null,
    contract.grounding.inferenceNotes.length > 0
      ? `- Inferencias: ${contract.grounding.inferenceNotes.join("; ")}`
      : "- Inferencias: sem inferencias relevantes",
  ].filter(Boolean).join("\n");
}

export function buildLegalCaseContextReply(snapshot: LegalCaseContextSnapshot) {
  const processLabel = snapshot.processTask.processNumber || snapshot.processTask.title;
  const clientLabel = snapshot.processTask.clientName || "Cliente nao identificado";
  const memoryStatusLabel = snapshot.documentMemory.freshness === "fresh"
    ? `sincronizada em ${formatDateTimeLabel(snapshot.documentMemory.lastSyncedAt) || "data nao informada"}`
    : snapshot.documentMemory.freshness === "stale"
      ? `disponivel, mas ja pode estar desatualizada desde ${formatDateTimeLabel(snapshot.documentMemory.lastSyncedAt) || "data nao informada"}`
      : "ainda nao sincronizada pelo repositorio documental";
  const citationStatus = [
    `fatos ${snapshot.caseBrain.readyForFactCitations ? "ok" : "pendente"}`,
    `lei ${snapshot.caseBrain.readyForLawCitations ? "ok" : "pendente"}`,
    `jurisprudencia ${snapshot.caseBrain.readyForCaseLawCitations ? "ok" : "pendente"}`,
  ].join(" | ");

  return [
    `## Contexto juridico do processo`,
    `- Processo: ${processLabel}`,
    `- Cliente: ${clientLabel}`,
    snapshot.processTask.pipelineName || snapshot.processTask.stageName
      ? `- Pipeline/etapa: ${snapshot.processTask.pipelineName || "Pipeline nao identificado"} / ${snapshot.processTask.stageName || "Etapa nao identificada"}`
      : null,
    snapshot.processTask.legalArea ? `- Area juridica: ${snapshot.processTask.legalArea}` : null,
    snapshot.caseBrain.summaryMaster
      ? `- Resumo mestre: ${snapshot.caseBrain.summaryMaster}`
      : snapshot.documentMemory.summaryMaster
        ? `- Resumo documental: ${snapshot.documentMemory.summaryMaster}`
        : `- Resumo mestre: ainda nao consolidado`,
    snapshot.caseBrain.currentPhase || snapshot.documentMemory.currentPhase
      ? `- Fase atual: ${snapshot.caseBrain.currentPhase || snapshot.documentMemory.currentPhase}`
      : null,
    `- Memoria documental: ${memoryStatusLabel}`,
    `- Documentos sincronizados: ${snapshot.documentMemory.documentCount}`,
    snapshot.caseBrain.recommendedPieceInput
      ? `- Peca sugerida: ${snapshot.caseBrain.recommendedPieceLabel || snapshot.caseBrain.recommendedPieceInput}`
      : `- Peca sugerida: ainda nao definida pelo Case Brain`,
    snapshot.caseBrain.firstActions[0] ? `- Proxima acao sugerida: ${snapshot.caseBrain.firstActions[0]}` : null,
    snapshot.caseBrain.missingDocuments.length > 0
      ? `- Pendencias documentais: ${snapshot.caseBrain.missingDocuments.join("; ")}`
      : `- Pendencias documentais: nenhuma pendencia critica registrada`,
    snapshot.documentMemory.missingDocuments.length > 0
      ? `- Pendencias documentais da memoria: ${snapshot.documentMemory.missingDocuments.join("; ")}`
      : null,
    `- Fontes internas validadas: ${snapshot.caseBrain.validatedInternalSourcesCount}`,
    `- Base normativa validada: ${snapshot.caseBrain.validatedLawReferencesCount}`,
    `- Jurisprudencia validada: ${snapshot.caseBrain.validatedCaseLawReferencesCount}`,
    snapshot.caseBrain.externalValidationGapCount + snapshot.caseBrain.pendingValidationCount > 0
      ? `- Validacoes externas pendentes: ${snapshot.caseBrain.externalValidationGapCount + snapshot.caseBrain.pendingValidationCount}`
      : `- Validacoes externas pendentes: nenhuma pendencia registrada`,
    `- Citações seguras: ${citationStatus}`,
    `- Status da primeira minuta: ${describeFirstDraftStatus(snapshot)}`,
    snapshot.firstDraft.pieceLabel
      ? `- Minuta atual: ${snapshot.firstDraft.pieceLabel}`
      : null,
    snapshot.firstDraft.summary ? `- Resumo da minuta: ${snapshot.firstDraft.summary}` : null,
    snapshot.firstDraft.error ? `- Erro atual da minuta: ${snapshot.firstDraft.error}` : null,
    snapshot.firstDraft.requiresHumanReview ? `- Revisao humana: obrigatoria antes de qualquer protocolo` : null,
  ].filter(Boolean).join("\n");
}
