import { createBrainArtifact } from "@/lib/brain/artifacts";
import { generateLegalPiece, type GeneratedLegalPiece } from "@/lib/juridico/generate-piece";
import { createProcessDraftVersion } from "@/lib/lex/draft-versions";
import { supabaseAdmin } from "@/lib/supabase/admin";

type BrainTaskRefRow = {
  id: string;
  task_context: Record<string, unknown> | null;
};

type BrainMemoryRow = {
  id: string;
  memory_type: string;
  value: unknown;
  created_at: string;
};

type ProcessTaskDraftRow = {
  id: string;
  title: string;
  client_name: string | null;
  demanda: string | null;
};

type ProcessDraftStateRow = {
  tenant_id?: string;
  process_task_id: string;
  case_brain_task_id: string | null;
  first_draft_status: string | null;
  first_draft_task_id: string | null;
  first_draft_artifact_id: string | null;
  first_draft_case_brain_task_id: string | null;
  first_draft_summary: string | null;
  first_draft_error: string | null;
};

type QueuedDraftFactoryRow = {
  tenant_id: string;
  process_task_id: string;
  case_brain_task_id: string | null;
  first_draft_status: string | null;
};

type BrainArtifactDraftRow = {
  id: string;
  task_id: string;
  metadata: Record<string, unknown> | null;
};

type DraftPlanMemory = {
  recommended_piece_input?: string | null;
  recommended_piece_label?: string | null;
  missing_documents?: string[] | null;
  first_actions?: string[] | null;
};

type LegalResearchPackMemory = {
  queries?: string[] | null;
  current_phase?: string | null;
  summary_master?: string | null;
  key_facts?: unknown;
};

type SourcePackMemory = {
  validated_internal_sources?: Array<{
    id?: string | null;
    title?: string | null;
    document_type?: string | null;
    status?: string | null;
  }> | null;
  validated_external_sources?: {
    law_references?: Array<{
      id?: string | null;
      citation?: string | null;
      title?: string | null;
      summary?: string | null;
      source_url?: string | null;
    }> | null;
    case_law_references?: Array<{
      id?: string | null;
      citation?: string | null;
      title?: string | null;
      summary?: string | null;
      source_url?: string | null;
    }> | null;
  } | null;
  external_validation_gaps?: string[] | null;
  internal_context?: {
    summary_master?: string | null;
    current_phase?: string | null;
    office_tone?: string | null;
    citation_style?: string | null;
  } | null;
};

type CitationChecklistMemory = {
  ready_for_fact_citations?: boolean | null;
  ready_for_law_citations?: boolean | null;
  ready_for_case_law_citations?: boolean | null;
  pending_validations?: string[] | null;
  fact_citation_basis?: string[] | null;
  law_citation_basis?: string[] | null;
  case_law_citation_basis?: string[] | null;
};

type ValidatedSourcePackMemory = {
  source_pack?: SourcePackMemory | null;
  citation_checklist?: CitationChecklistMemory | null;
};

type DraftFactoryMissionRefs = {
  taskId: string;
  runId: string;
  stepId: string;
};

type DraftFactoryTrigger = "manual_draft_factory" | "case_brain_auto_draft_factory" | "movement_auto_draft_factory";

type DraftPlanOverride = {
  recommendedPieceInput: string;
  recommendedPieceLabel?: string | null;
  reason?: string | null;
};

type CaseBrainContext = {
  taskId: string;
  caseId: string;
  legalArea: string | null;
  draftPlan: DraftPlanMemory;
  researchPack: LegalResearchPackMemory;
  sourcePack: SourcePackMemory;
  citationChecklist: CitationChecklistMemory;
  memoryRefs: Record<string, string>;
};

export type DraftFactoryExecutionResult = {
  draftFactoryTaskId: string;
  runId: string;
  stepId: string;
  artifactId: string;
  caseBrainTaskId: string;
  recommendedPieceInput: string;
  recommendedPieceLabel: string;
  result: GeneratedLegalPiece;
  alreadyExisting?: boolean;
};

export type DraftFactoryQueueRunResult = {
  scanned: number;
  processed: number;
  completed: string[];
  reused: string[];
  failed: Array<{ processTaskId: string; error: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function getNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = Number(value);
    if (Number.isFinite(normalized)) return normalized;
  }
  return fallback;
}

function isAutoDraftFactoryTrigger(trigger: DraftFactoryTrigger) {
  return trigger === "case_brain_auto_draft_factory" || trigger === "movement_auto_draft_factory";
}

function getBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function getLatestMemoryByType(memories: BrainMemoryRow[]) {
  return memories.reduce<Record<string, BrainMemoryRow>>((acc, memory) => {
    acc[memory.memory_type] = memory;
    return acc;
  }, {});
}

function parseDraftPlan(value: unknown): DraftPlanMemory {
  if (!isRecord(value)) return {};
  return {
    recommended_piece_input: getString(value, "recommended_piece_input"),
    recommended_piece_label: getString(value, "recommended_piece_label"),
    missing_documents: getStringArray(value.missing_documents),
    first_actions: getStringArray(value.first_actions),
  };
}

function parseResearchPack(value: unknown): LegalResearchPackMemory {
  if (!isRecord(value)) return {};
  return {
    queries: getStringArray(value.queries),
    current_phase: getString(value, "current_phase"),
    summary_master: getString(value, "summary_master"),
    key_facts: Array.isArray(value.key_facts) ? value.key_facts : [],
  };
}

function parseSourcePack(value: unknown): ValidatedSourcePackMemory {
  if (!isRecord(value)) return {};
  return {
    source_pack: isRecord(value.source_pack)
      ? {
          validated_internal_sources: Array.isArray(value.source_pack.validated_internal_sources)
            ? value.source_pack.validated_internal_sources
                .filter(isRecord)
                .map((item) => ({
                  id: getString(item, "id"),
                  title: getString(item, "title"),
                  document_type: getString(item, "document_type"),
                  status: getString(item, "status"),
                }))
            : [],
          validated_external_sources: isRecord(value.source_pack.validated_external_sources)
            ? {
                law_references: Array.isArray(value.source_pack.validated_external_sources.law_references)
                  ? value.source_pack.validated_external_sources.law_references
                      .filter(isRecord)
                      .map((item) => ({
                        id: getString(item, "id"),
                        citation: getString(item, "citation"),
                        title: getString(item, "title"),
                        summary: getString(item, "summary"),
                        source_url: getString(item, "source_url"),
                      }))
                  : [],
                case_law_references: Array.isArray(value.source_pack.validated_external_sources.case_law_references)
                  ? value.source_pack.validated_external_sources.case_law_references
                      .filter(isRecord)
                      .map((item) => ({
                        id: getString(item, "id"),
                        citation: getString(item, "citation"),
                        title: getString(item, "title"),
                        summary: getString(item, "summary"),
                        source_url: getString(item, "source_url"),
                      }))
                  : [],
              }
            : null,
          external_validation_gaps: getStringArray(value.source_pack.external_validation_gaps),
          internal_context: isRecord(value.source_pack.internal_context)
            ? {
                summary_master: getString(value.source_pack.internal_context, "summary_master"),
                current_phase: getString(value.source_pack.internal_context, "current_phase"),
                office_tone: getString(value.source_pack.internal_context, "office_tone"),
                citation_style: getString(value.source_pack.internal_context, "citation_style"),
              }
            : null,
        }
      : null,
    citation_checklist: isRecord(value.citation_checklist)
      ? {
          ready_for_fact_citations: getBoolean(value.citation_checklist.ready_for_fact_citations),
          ready_for_law_citations: getBoolean(value.citation_checklist.ready_for_law_citations),
          ready_for_case_law_citations: getBoolean(value.citation_checklist.ready_for_case_law_citations),
          pending_validations: getStringArray(value.citation_checklist.pending_validations),
          fact_citation_basis: getStringArray(value.citation_checklist.fact_citation_basis),
          law_citation_basis: getStringArray(value.citation_checklist.law_citation_basis),
          case_law_citation_basis: getStringArray(value.citation_checklist.case_law_citation_basis),
        }
      : null,
  };
}

function toNarrativeList(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (isRecord(item)) {
        return getString(item, "label") || getString(item, "title") || getString(item, "fact") || JSON.stringify(item);
      }
      return "";
    })
    .filter(Boolean);
}

function buildDraftPlanSummaryValue(draftPlan: DraftPlanMemory, options?: {
  sourcePack?: SourcePackMemory;
  citationChecklist?: CitationChecklistMemory;
}) {
  const lawReferences = Array.isArray(options?.sourcePack?.validated_external_sources?.law_references)
    ? options?.sourcePack?.validated_external_sources?.law_references
    : [];
  const caseLawReferences = Array.isArray(options?.sourcePack?.validated_external_sources?.case_law_references)
    ? options?.sourcePack?.validated_external_sources?.case_law_references
    : [];
  return {
    recommended_piece_input: draftPlan.recommended_piece_input || null,
    recommended_piece_label: draftPlan.recommended_piece_label || null,
    missing_documents: Array.isArray(draftPlan.missing_documents) ? draftPlan.missing_documents : [],
    first_actions: Array.isArray(draftPlan.first_actions) ? draftPlan.first_actions : [],
    ready_for_law_citations: options?.citationChecklist?.ready_for_law_citations === true,
    ready_for_case_law_citations: options?.citationChecklist?.ready_for_case_law_citations === true,
    validated_law_reference_count: lawReferences.length,
    validated_case_law_reference_count: caseLawReferences.length,
    pending_validation_count: Array.isArray(options?.citationChecklist?.pending_validations)
      ? options?.citationChecklist?.pending_validations.length
      : 0,
  };
}

function isDraftArtifactStale(state: Pick<ProcessDraftStateRow, "case_brain_task_id" | "first_draft_artifact_id" | "first_draft_case_brain_task_id"> | null | undefined, caseBrainTaskId: string) {
  if (!state?.first_draft_artifact_id) {
    return false;
  }

  const sourceCaseBrainTaskId = state.first_draft_case_brain_task_id;
  if (!sourceCaseBrainTaskId) {
    return true;
  }

  return sourceCaseBrainTaskId !== caseBrainTaskId;
}

function parseGeneratedPieceArtifact(artifact: BrainArtifactDraftRow): GeneratedLegalPiece {
  const metadata = isRecord(artifact.metadata) ? artifact.metadata : null;
  const draftMarkdown = getString(metadata, "reply");

  if (!metadata || !draftMarkdown) {
    throw new Error("Artifact da Draft Factory sem conteudo valido da minuta.");
  }

  const qualityMetrics = isRecord(metadata.quality_metrics) ? metadata.quality_metrics : null;
  const usedDocuments = Array.isArray(metadata.used_documents)
    ? metadata.used_documents
        .filter(isRecord)
        .map((document) => ({
          id: getString(document, "id") || `${artifact.id}:${getString(document, "name") || "document"}`,
          name: getString(document, "name") || "Documento interno",
          documentType: getString(document, "documentType") || getString(document, "document_type"),
          folderLabel: getString(document, "folderLabel") || getString(document, "folder_label"),
          webViewLink: getString(document, "webViewLink") || getString(document, "web_view_link"),
          modifiedAt: getString(document, "modifiedAt") || getString(document, "modified_at"),
        }))
    : [];

  return {
    pieceType: getString(metadata, "piece_type") || "peca_juridica",
    pieceLabel: getString(metadata, "piece_label") || getString(metadata, "recommended_piece_label") || "Peça Jurídica",
    pieceFamily: getString(metadata, "piece_family") || "peca_juridica",
    pieceFamilyLabel: getString(metadata, "piece_family_label") || getString(metadata, "piece_family") || "Peça Jurídica",
    practiceArea: getString(metadata, "practice_area"),
    outline: getStringArray(metadata.outline),
    draftMarkdown,
    usedDocuments,
    missingDocuments: getStringArray(metadata.missing_documents),
    warnings: getStringArray(metadata.warnings),
    confidenceNote: getString(metadata, "confidence_note") || "Primeira minuta carregada a partir do artifact da Draft Factory.",
    requiresHumanReview: getBoolean(metadata.requires_human_review, true),
    model: getString(metadata, "model") || "desconhecido",
    provider: getString(metadata, "provider") || "desconhecido",
    expansionApplied: getBoolean(metadata.expansion_applied),
    qualityMetrics: {
      charCount: getNumber(qualityMetrics?.charCount),
      wordCount: getNumber(qualityMetrics?.wordCount),
      paragraphCount: getNumber(qualityMetrics?.paragraphCount),
      sectionCount: getNumber(qualityMetrics?.sectionCount),
    },
  };
}

async function ensureProcessDraftStateRow(params: { tenantId: string; processTaskId: string; caseBrain: CaseBrainContext }) {
  const { error } = await supabaseAdmin
    .from("process_document_memory")
    .upsert(
      {
        tenant_id: params.tenantId,
        process_task_id: params.processTaskId,
        case_brain_task_id: params.caseBrain.taskId,
        draft_plan_summary: buildDraftPlanSummaryValue(params.caseBrain.draftPlan, {
          sourcePack: params.caseBrain.sourcePack,
          citationChecklist: params.caseBrain.citationChecklist,
        }),
      },
      { onConflict: "process_task_id" }
    );

  if (error) throw error;
}

async function loadProcessDraftState(params: { tenantId: string; processTaskId: string }) {
  const { data, error } = await supabaseAdmin
    .from("process_document_memory")
    .select("tenant_id, process_task_id, case_brain_task_id, first_draft_status, first_draft_task_id, first_draft_artifact_id, first_draft_case_brain_task_id, first_draft_summary, first_draft_error")
    .eq("tenant_id", params.tenantId)
    .eq("process_task_id", params.processTaskId)
    .maybeSingle<ProcessDraftStateRow>();

  if (error) throw error;
  return data || null;
}

async function listQueuedDraftFactoryRows(params: { limit: number; processTaskId?: string | null }) {
  let query = supabaseAdmin
    .from("process_document_memory")
    .select("tenant_id, process_task_id, case_brain_task_id, first_draft_status")
    .eq("first_draft_status", "queued")
    .order("updated_at", { ascending: true })
    .limit(params.limit);

  if (params.processTaskId) {
    query = query.eq("process_task_id", params.processTaskId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as QueuedDraftFactoryRow[];
}

async function loadDraftArtifactById(params: { tenantId: string; artifactId: string }) {
  const { data, error } = await supabaseAdmin
    .from("brain_artifacts")
    .select("id, task_id, metadata")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.artifactId)
    .maybeSingle<BrainArtifactDraftRow>();

  if (error) throw error;
  if (!data) {
    throw new Error("Artifact da primeira minuta nao encontrado.");
  }

  return data;
}

async function hydrateExistingDraftFactoryResult(params: {
  tenantId: string;
  processTaskId: string;
  caseBrain: CaseBrainContext;
  state: ProcessDraftStateRow;
}) {
  if (!params.state.first_draft_artifact_id) {
    return null;
  }

  if (isDraftArtifactStale(params.state, params.caseBrain.taskId)) {
    return null;
  }

  const artifact = await loadDraftArtifactById({
    tenantId: params.tenantId,
    artifactId: params.state.first_draft_artifact_id,
  });
  const result = parseGeneratedPieceArtifact(artifact);

  if (params.state.first_draft_status !== "completed") {
    await supabaseAdmin
      .from("process_document_memory")
      .update({
        first_draft_status: "completed",
        first_draft_task_id: artifact.task_id,
        first_draft_artifact_id: artifact.id,
        first_draft_case_brain_task_id: params.caseBrain.taskId,
        first_draft_error: null,
        first_draft_generated_at: new Date().toISOString(),
      })
      .eq("tenant_id", params.tenantId)
      .eq("process_task_id", params.processTaskId);
  }

  return {
    draftFactoryTaskId: artifact.task_id,
    runId: "",
    stepId: "",
    artifactId: artifact.id,
    caseBrainTaskId: params.caseBrain.taskId,
    recommendedPieceInput: params.caseBrain.draftPlan.recommended_piece_input || result.pieceType,
    recommendedPieceLabel: params.caseBrain.draftPlan.recommended_piece_label || result.pieceLabel,
    result,
    alreadyExisting: true,
  } satisfies DraftFactoryExecutionResult;
}

async function claimDraftFactoryExecution(params: {
  tenantId: string;
  processTaskId: string;
  caseBrain: CaseBrainContext;
  forceNewDraft?: boolean;
}) {
  const staleOrMissingArtifactCondition = [
    "first_draft_artifact_id.is.null",
    "first_draft_case_brain_task_id.is.null",
    `first_draft_case_brain_task_id.neq.${params.caseBrain.taskId}`,
  ].join(",");

  let query = supabaseAdmin
    .from("process_document_memory")
    .update({
      case_brain_task_id: params.caseBrain.taskId,
      draft_plan_summary: buildDraftPlanSummaryValue(params.caseBrain.draftPlan, {
        sourcePack: params.caseBrain.sourcePack,
        citationChecklist: params.caseBrain.citationChecklist,
      }),
      first_draft_status: "running",
      first_draft_error: null,
    })
    .eq("tenant_id", params.tenantId)
    .eq("process_task_id", params.processTaskId)
    .in("first_draft_status", ["idle", "queued", "failed", "completed"]);

  if (!params.forceNewDraft) {
    query = query.or(staleOrMissingArtifactCondition);
  }

  const { data, error } = await query
    .select("process_task_id")
    .maybeSingle<{ process_task_id: string }>();

  if (error) throw error;
  return Boolean(data?.process_task_id);
}

async function loadProcessTask(params: { tenantId: string; processTaskId: string }) {
  const { data, error } = await supabaseAdmin
    .from("process_tasks")
    .select("id, title, client_name, demanda")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.processTaskId)
    .maybeSingle<ProcessTaskDraftRow>();

  if (error) throw error;
  if (!data) throw new Error("Processo nao encontrado para Draft Factory.");

  return data;
}

async function loadCaseBrainContext(params: { tenantId: string; processTaskId: string }) {
  const { data: caseBrainTask, error: taskError } = await supabaseAdmin
    .from("brain_tasks")
    .select("id, task_context")
    .eq("tenant_id", params.tenantId)
    .eq("module", "lex")
    .eq("task_context->>process_task_id", params.processTaskId)
    .eq("task_context->>source", "revenue_to_case")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<BrainTaskRefRow>();

  if (taskError) throw taskError;
  if (!caseBrainTask?.id) {
    throw new Error("Case Brain ainda nao foi preparado para este processo.");
  }

  const { data: memories, error: memoryError } = await supabaseAdmin
    .from("brain_memories")
    .select("id, memory_type, value, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("task_id", caseBrainTask.id)
    .in("memory_type", ["draft_plan", "legal_research_pack", "validated_source_pack"])
    .order("created_at", { ascending: true });

  if (memoryError) throw memoryError;

  const latestMemories = getLatestMemoryByType((memories || []) as BrainMemoryRow[]);
  const draftPlanMemory = latestMemories.draft_plan;
  const researchPackMemory = latestMemories.legal_research_pack;
  const sourcePackMemory = latestMemories.validated_source_pack;

  if (!draftPlanMemory?.id || !researchPackMemory?.id || !sourcePackMemory?.id) {
    throw new Error("Case Brain encontrado, mas o pacote juridico inicial ainda esta incompleto.");
  }

  const draftPlan = parseDraftPlan(draftPlanMemory.value);
  const researchPack = parseResearchPack(researchPackMemory.value);
  const sourcePackMemoryValue = parseSourcePack(sourcePackMemory.value);
  const caseId = getString(caseBrainTask.task_context, "case_id");

  if (!caseId) {
    throw new Error("Case Brain encontrado sem case_id valido no contexto.");
  }

  if (!draftPlan.recommended_piece_input) {
    throw new Error("O draft plan do Case Brain ainda nao definiu a primeira peca sugerida.");
  }

  return {
    taskId: caseBrainTask.id,
    caseId,
    legalArea: getString(caseBrainTask.task_context, "legal_area"),
    draftPlan,
    researchPack,
    sourcePack: sourcePackMemoryValue.source_pack || {},
    citationChecklist: sourcePackMemoryValue.citation_checklist || {},
    memoryRefs: {
      draft_plan: draftPlanMemory.id,
      legal_research_pack: researchPackMemory.id,
      validated_source_pack: sourcePackMemory.id,
    },
  } satisfies CaseBrainContext;
}

async function createDraftFactoryMission(params: {
  tenantId: string;
  userId: string | null;
  processTask: ProcessTaskDraftRow;
  caseBrain: CaseBrainContext;
  trigger: DraftFactoryTrigger;
}) {
  const clientName = params.processTask.client_name || params.processTask.title;
  const recommendedPieceLabel = params.caseBrain.draftPlan.recommended_piece_label || params.caseBrain.draftPlan.recommended_piece_input || "Primeira minuta";
  const now = new Date().toISOString();
  const autoTrigger = isAutoDraftFactoryTrigger(params.trigger);

  const { data: task, error: taskError } = await supabaseAdmin
    .from("brain_tasks")
    .insert({
      tenant_id: params.tenantId,
      created_by: params.userId,
      channel: autoTrigger ? "system" : "dashboard",
      module: "lex",
      status: "queued",
      title: `${autoTrigger ? "Draft Factory Auto" : "Draft Factory"} - ${recommendedPieceLabel} - ${clientName}`,
      goal: `Gerar a primeira minuta juridica sugerida para ${clientName}, com base no Case Brain, documentos sincronizados e controles de fonte.`,
      task_input: {
        trigger: params.trigger,
        process_task_id: params.processTask.id,
        case_id: params.caseBrain.caseId,
        case_brain_task_id: params.caseBrain.taskId,
        recommended_piece_input: params.caseBrain.draftPlan.recommended_piece_input,
        recommended_piece_label: params.caseBrain.draftPlan.recommended_piece_label,
      },
      task_context: {
        source: "draft_factory",
        process_task_id: params.processTask.id,
        case_id: params.caseBrain.caseId,
        legal_area: params.caseBrain.legalArea || params.processTask.demanda || null,
        source_case_brain_task_id: params.caseBrain.taskId,
        recommended_piece_input: params.caseBrain.draftPlan.recommended_piece_input,
        recommended_piece_label: params.caseBrain.draftPlan.recommended_piece_label,
      },
      policy_snapshot: {
        requires_human_confirmation: false,
        requires_human_review: true,
        execution_mode: "manual_first",
      },
    })
    .select("id")
    .single<{ id: string }>();

  if (taskError || !task) {
    throw taskError || new Error("Nao foi possivel criar a missao da Draft Factory.");
  }

  const { data: run, error: runError } = await supabaseAdmin
    .from("brain_runs")
    .insert({
      task_id: task.id,
      tenant_id: params.tenantId,
      attempt_number: 1,
      status: "queued",
      started_at: null,
    })
    .select("id")
    .single<{ id: string }>();

  if (runError || !run) {
    throw runError || new Error("Nao foi possivel criar a execucao da Draft Factory.");
  }

  const { data: step, error: stepError } = await supabaseAdmin
    .from("brain_steps")
    .insert({
      task_id: task.id,
      run_id: run.id,
      tenant_id: params.tenantId,
      order_index: 1,
      step_key: "draft_factory_generate_first_draft",
      title: `Gerar primeira minuta sugerida: ${recommendedPieceLabel}`,
      step_type: "writer",
      status: "queued",
      input_payload: {
        trigger: params.trigger,
        process_task_id: params.processTask.id,
        case_id: params.caseBrain.caseId,
        source_case_brain_task_id: params.caseBrain.taskId,
        recommended_piece_input: params.caseBrain.draftPlan.recommended_piece_input,
      },
    })
    .select("id")
    .single<{ id: string }>();

  if (stepError || !step) {
    throw stepError || new Error("Nao foi possivel criar o step da Draft Factory.");
  }

  await supabaseAdmin.from("learning_events").insert({
    tenant_id: params.tenantId,
    task_id: task.id,
    run_id: run.id,
    step_id: step.id,
    event_type: "draft_factory_requested",
    source_module: "lex",
    payload: {
      trigger: params.trigger,
      process_task_id: params.processTask.id,
      case_id: params.caseBrain.caseId,
      source_case_brain_task_id: params.caseBrain.taskId,
      recommended_piece_input: params.caseBrain.draftPlan.recommended_piece_input,
      recommended_piece_label: params.caseBrain.draftPlan.recommended_piece_label,
      created_at: now,
    },
    created_by: params.userId,
  });

  return { taskId: task.id, runId: run.id, stepId: step.id } satisfies DraftFactoryMissionRefs;
}

function buildObjective(params: {
  processTask: ProcessTaskDraftRow;
  caseBrain: CaseBrainContext;
}) {
  const pieceLabel = params.caseBrain.draftPlan.recommended_piece_label || params.caseBrain.draftPlan.recommended_piece_input;
  const phaseText = params.caseBrain.researchPack.current_phase
    ? `Fase atual identificada: ${params.caseBrain.researchPack.current_phase}.`
    : null;

  return [
    `Gerar a primeira minuta juridica provavel do caso "${params.processTask.title}" como ${pieceLabel}.`,
    phaseText,
    "A minuta deve permanecer fiel ao acervo sincronizado e exigir revisao humana antes de qualquer protocolo.",
  ].filter(Boolean).join(" ");
}

function buildInstructions(params: {
  caseBrain: CaseBrainContext;
  processTask: ProcessTaskDraftRow;
}) {
  const validatedSources = (params.caseBrain.sourcePack.validated_internal_sources || []).map((source) => {
    const sourceLabel = source.title || "Documento interno";
    const typeLabel = source.document_type || "geral";
    return `${sourceLabel} (${typeLabel})`;
  });
  const keyFacts = toNarrativeList(params.caseBrain.researchPack.key_facts).slice(0, 8);
  const pendingDocuments = uniqueStrings(params.caseBrain.draftPlan.missing_documents || []);
  const validatedLawReferences = (params.caseBrain.sourcePack.validated_external_sources?.law_references || []).map((reference) => {
    const citation = reference.citation || reference.title || "Referencia normativa validada";
    return [citation, reference.summary, reference.source_url].filter(Boolean).join(" — ");
  });
  const validatedCaseLawReferences = (params.caseBrain.sourcePack.validated_external_sources?.case_law_references || []).map((reference) => {
    const citation = reference.citation || reference.title || "Jurisprudencia validada";
    return [citation, reference.summary, reference.source_url].filter(Boolean).join(" — ");
  });
  const pendingValidations = uniqueStrings([
    ...(params.caseBrain.sourcePack.external_validation_gaps || []),
    ...(params.caseBrain.citationChecklist.pending_validations || []),
  ]);
  const researchQueries = getStringArray(params.caseBrain.researchPack.queries).slice(0, 6);

  return [
    "REGRAS DA DRAFT FACTORY JURIDICA:",
    validatedSources.length > 0
      ? `- Fontes internas validadas: ${validatedSources.join("; ")}.`
      : "- Nao ha fonte interna validada suficiente; tratar a narrativa com cautela maxima.",
    params.caseBrain.researchPack.summary_master
      ? `- Resumo mestre do caso: ${params.caseBrain.researchPack.summary_master}`
      : null,
    params.caseBrain.sourcePack.internal_context?.summary_master
      ? `- Contexto interno consolidado: ${params.caseBrain.sourcePack.internal_context.summary_master}`
      : null,
    keyFacts.length > 0 ? `- Fatos-chave identificados: ${keyFacts.join("; ")}.` : null,
    validatedLawReferences.length > 0
      ? `- Fontes normativas externas validadas: ${validatedLawReferences.join("; ")}.`
      : null,
    validatedCaseLawReferences.length > 0
      ? `- Jurisprudencia externa validada: ${validatedCaseLawReferences.join("; ")}.`
      : null,
    pendingDocuments.length > 0
      ? `- Pendencias documentais atuais: ${pendingDocuments.join("; ")}.`
      : "- Sem pendencias documentais criticas apontadas pelo draft plan.",
    pendingValidations.length > 0
      ? `- Validacoes externas ainda pendentes: ${pendingValidations.join("; ")}.`
      : null,
    researchQueries.length > 0
      ? `- Trilhas de pesquisa a respeitar: ${researchQueries.join("; ")}.`
      : null,
    params.caseBrain.citationChecklist.ready_for_fact_citations
      ? `- Base fatica pode citar documentos internos sincronizados. Fundamento atual: ${getStringArray(params.caseBrain.citationChecklist.fact_citation_basis).join("; ") || "documentos internos validados"}.`
      : "- Base fatica ainda exige cautela porque nao ha sustentacao documental suficiente para citacao segura.",
    params.caseBrain.citationChecklist.ready_for_law_citations
      ? `- Citacoes normativas so podem usar a base validada: ${getStringArray(params.caseBrain.citationChecklist.law_citation_basis).join("; ")}.`
      : null,
    !params.caseBrain.citationChecklist.ready_for_law_citations
      ? "- Nao incluir numeros de artigos, leis, sumulas, precedentes ou julgados especificos sem validacao humana expressa."
      : null,
    params.caseBrain.citationChecklist.ready_for_case_law_citations
      ? `- Jurisprudencia so pode citar as referencias validadas: ${getStringArray(params.caseBrain.citationChecklist.case_law_citation_basis).join("; ")}.`
      : null,
    !params.caseBrain.citationChecklist.ready_for_case_law_citations
      ? "- Se precisar mencionar jurisprudencia, trate apenas de forma descritiva e sinalize a necessidade de validacao humana."
      : null,
    "- Nao invente fatos, datas, valores, nomes de partes, provas ou documentos ausentes.",
    "- Se houver lacuna relevante, deixe a dependencia documental explicitada de forma tecnica na minuta.",
    params.processTask.demanda ? `- Frente juridica informada no processo: ${params.processTask.demanda}.` : null,
  ].filter(Boolean).join("\n");
}

export async function executeDraftFactoryForProcessTask(params: {
  tenantId: string;
  userId: string | null;
  processTaskId: string;
  trigger?: DraftFactoryTrigger;
  draftPlanOverride?: DraftPlanOverride | null;
  forceNewDraft?: boolean;
}): Promise<DraftFactoryExecutionResult> {
  const processTask = await loadProcessTask({ tenantId: params.tenantId, processTaskId: params.processTaskId });
  const loadedCaseBrain = await loadCaseBrainContext({ tenantId: params.tenantId, processTaskId: params.processTaskId });
  const trigger = params.trigger || "manual_draft_factory";
  const caseBrain: CaseBrainContext = params.draftPlanOverride?.recommendedPieceInput
    ? {
        ...loadedCaseBrain,
        draftPlan: {
          ...loadedCaseBrain.draftPlan,
          recommended_piece_input: params.draftPlanOverride.recommendedPieceInput,
          recommended_piece_label: params.draftPlanOverride.recommendedPieceLabel || params.draftPlanOverride.recommendedPieceInput,
        },
      }
    : loadedCaseBrain;

  await ensureProcessDraftStateRow({
    tenantId: params.tenantId,
    processTaskId: params.processTaskId,
    caseBrain,
  });

  const currentState = await loadProcessDraftState({
    tenantId: params.tenantId,
    processTaskId: params.processTaskId,
  });

  if (!params.forceNewDraft && currentState?.first_draft_artifact_id) {
    const hydrated = await hydrateExistingDraftFactoryResult({
      tenantId: params.tenantId,
      processTaskId: params.processTaskId,
      caseBrain,
      state: currentState,
    });

    if (hydrated) {
      return hydrated as DraftFactoryExecutionResult;
    }
  }

  const claimed = await claimDraftFactoryExecution({
    tenantId: params.tenantId,
    processTaskId: params.processTaskId,
    caseBrain,
    forceNewDraft: params.forceNewDraft,
  });

  if (!claimed) {
    const latestState = await loadProcessDraftState({
      tenantId: params.tenantId,
      processTaskId: params.processTaskId,
    });

    if (!params.forceNewDraft && latestState?.first_draft_artifact_id) {
      const hydrated = await hydrateExistingDraftFactoryResult({
        tenantId: params.tenantId,
        processTaskId: params.processTaskId,
        caseBrain,
        state: latestState,
      });

      if (hydrated) {
        return hydrated as DraftFactoryExecutionResult;
      }
    }

    if (latestState?.first_draft_status === "running") {
      throw new Error("A Draft Factory juridica ja esta em execucao para este processo.");
    }

    throw new Error("Nao foi possivel reservar a execucao da Draft Factory para este processo.");
  }

  let refs: DraftFactoryMissionRefs | null = null;

  try {
    refs = await createDraftFactoryMission({
      tenantId: params.tenantId,
      userId: params.userId,
      processTask,
      caseBrain,
      trigger,
    });

    await supabaseAdmin
      .from("process_document_memory")
      .update({
        case_brain_task_id: caseBrain.taskId,
        draft_plan_summary: buildDraftPlanSummaryValue(caseBrain.draftPlan, {
          sourcePack: caseBrain.sourcePack,
          citationChecklist: caseBrain.citationChecklist,
        }),
        first_draft_status: "running",
        first_draft_task_id: refs.taskId,
        first_draft_error: null,
      })
      .eq("tenant_id", params.tenantId)
      .eq("process_task_id", params.processTaskId);

    const startedAt = new Date().toISOString();
    await Promise.all([
      supabaseAdmin.from("brain_tasks").update({ status: "executing", started_at: startedAt }).eq("id", refs.taskId),
      supabaseAdmin.from("brain_runs").update({ status: "executing", started_at: startedAt }).eq("id", refs.runId),
      supabaseAdmin.from("brain_steps").update({ status: "running", started_at: startedAt }).eq("id", refs.stepId),
    ]);

    const result = await generateLegalPiece({
      tenantId: params.tenantId,
      processTaskId: params.processTaskId,
      pieceType: caseBrain.draftPlan.recommended_piece_input || "Peticao Inicial",
      practiceArea: caseBrain.legalArea || processTask.demanda || "",
      objective: buildObjective({ processTask, caseBrain }),
      instructions: buildInstructions({ caseBrain, processTask }),
      documentIds: uniqueStrings((caseBrain.sourcePack.validated_internal_sources || []).map((source) => source.id || null)),
    });

    const artifact = await createBrainArtifact({
      tenantId: params.tenantId,
      taskId: refs.taskId,
      runId: refs.runId,
      stepId: refs.stepId,
      artifactType: "case_first_draft",
      title: `Primeira minuta - ${result.pieceLabel} - ${processTask.client_name || processTask.title}`,
      sourceModule: "lex",
      mimeType: "text/markdown",
      metadata: {
        reply: result.draftMarkdown,
        case_id: caseBrain.caseId,
        process_task_id: processTask.id,
        case_brain_task_id: caseBrain.taskId,
        recommended_piece_input: caseBrain.draftPlan.recommended_piece_input,
        recommended_piece_label: caseBrain.draftPlan.recommended_piece_label,
        draft_plan_override: params.draftPlanOverride
          ? {
              recommended_piece_input: params.draftPlanOverride.recommendedPieceInput,
              recommended_piece_label: params.draftPlanOverride.recommendedPieceLabel || null,
              reason: params.draftPlanOverride.reason || null,
            }
          : null,
        piece_type: result.pieceType,
        piece_label: result.pieceLabel,
        piece_family: result.pieceFamily,
        piece_family_label: result.pieceFamilyLabel,
        practice_area: result.practiceArea,
        outline: result.outline,
        used_documents: result.usedDocuments,
        validated_law_references: caseBrain.sourcePack.validated_external_sources?.law_references || [],
        validated_case_law_references: caseBrain.sourcePack.validated_external_sources?.case_law_references || [],
        missing_documents: result.missingDocuments,
        warnings: result.warnings,
        confidence_note: result.confidenceNote,
        requires_human_review: result.requiresHumanReview,
        expansion_applied: result.expansionApplied,
        quality_metrics: result.qualityMetrics,
        provider: result.provider,
        model: result.model,
        memory_refs: caseBrain.memoryRefs,
      },
    });

    const completedAt = new Date().toISOString();
    const resultSummary = `Primeira minuta ${result.pieceLabel} gerada para ${processTask.client_name || processTask.title} com ${result.usedDocuments.length} documento(s) aproveitado(s).`;

    const draftVersion = await createProcessDraftVersion({
      tenantId: params.tenantId,
      processTaskId: params.processTaskId,
      sourceArtifactId: artifact.id,
      sourceTaskId: refs.taskId,
      sourceCaseBrainTaskId: caseBrain.taskId,
      pieceType: result.pieceType,
      pieceLabel: result.pieceLabel,
      practiceArea: result.practiceArea,
      summary: resultSummary,
      draftMarkdown: result.draftMarkdown,
        metadata: {
          artifact_id: artifact.id,
          memory_refs: caseBrain.memoryRefs,
          recommended_piece_input: caseBrain.draftPlan.recommended_piece_input,
          recommended_piece_label: caseBrain.draftPlan.recommended_piece_label,
          validated_law_references: caseBrain.sourcePack.validated_external_sources?.law_references || [],
          validated_case_law_references: caseBrain.sourcePack.validated_external_sources?.case_law_references || [],
          warnings: result.warnings,
          missing_documents: result.missingDocuments,
        used_documents: result.usedDocuments,
        quality_metrics: result.qualityMetrics,
        provider: result.provider,
        model: result.model,
        requires_human_review: result.requiresHumanReview,
      },
      createdBy: params.userId,
    });

    await Promise.all([
      supabaseAdmin
        .from("brain_steps")
        .update({
          status: "completed",
          output_payload: {
            case_id: caseBrain.caseId,
            process_task_id: processTask.id,
            artifact_id: artifact.id,
            draft_version_id: draftVersion.id,
            source_case_brain_task_id: caseBrain.taskId,
            recommended_piece_input: caseBrain.draftPlan.recommended_piece_input,
            piece_label: result.pieceLabel,
            used_document_count: result.usedDocuments.length,
            warning_count: result.warnings.length,
            summary: resultSummary,
          },
          completed_at: completedAt,
        })
        .eq("id", refs.stepId),
      supabaseAdmin
        .from("brain_runs")
        .update({ status: "completed", summary: resultSummary, completed_at: completedAt })
        .eq("id", refs.runId),
      supabaseAdmin
        .from("brain_tasks")
        .update({ status: "completed", result_summary: resultSummary, completed_at: completedAt })
        .eq("id", refs.taskId),
      supabaseAdmin
        .from("process_document_memory")
        .update({
          case_brain_task_id: caseBrain.taskId,
          draft_plan_summary: buildDraftPlanSummaryValue(caseBrain.draftPlan, {
            sourcePack: caseBrain.sourcePack,
            citationChecklist: caseBrain.citationChecklist,
          }),
          first_draft_status: "completed",
          first_draft_task_id: refs.taskId,
          first_draft_artifact_id: artifact.id,
          first_draft_case_brain_task_id: caseBrain.taskId,
          first_draft_summary: resultSummary,
          first_draft_error: null,
          first_draft_generated_at: completedAt,
        })
        .eq("tenant_id", params.tenantId)
        .eq("process_task_id", params.processTaskId),
      supabaseAdmin.from("learning_events").insert({
        tenant_id: params.tenantId,
        task_id: refs.taskId,
        run_id: refs.runId,
        step_id: refs.stepId,
        event_type: "draft_factory_completed",
        source_module: "lex",
          payload: {
            trigger,
            case_id: caseBrain.caseId,
            process_task_id: processTask.id,
            artifact_id: artifact.id,
            draft_version_id: draftVersion.id,
            source_case_brain_task_id: caseBrain.taskId,
            recommended_piece_input: caseBrain.draftPlan.recommended_piece_input,
            recommended_piece_label: caseBrain.draftPlan.recommended_piece_label,
            draft_plan_override_reason: params.draftPlanOverride?.reason || null,
          piece_label: result.pieceLabel,
          piece_type: result.pieceType,
          used_document_count: result.usedDocuments.length,
          warning_count: result.warnings.length,
          summary: resultSummary,
        },
        created_by: params.userId,
      }),
    ]);

    return {
      draftFactoryTaskId: refs.taskId,
      runId: refs.runId,
      stepId: refs.stepId,
      artifactId: artifact.id,
      caseBrainTaskId: caseBrain.taskId,
      recommendedPieceInput: caseBrain.draftPlan.recommended_piece_input || result.pieceType,
      recommendedPieceLabel: caseBrain.draftPlan.recommended_piece_label || result.pieceLabel,
      result,
    } satisfies DraftFactoryExecutionResult;
  } catch (error: any) {
    const completedAt = new Date().toISOString();
    const errorMessage = error?.message || "Falha ao executar a Draft Factory juridica.";

    await supabaseAdmin
      .from("process_document_memory")
      .update({
        case_brain_task_id: caseBrain.taskId,
        draft_plan_summary: buildDraftPlanSummaryValue(caseBrain.draftPlan, {
          sourcePack: caseBrain.sourcePack,
          citationChecklist: caseBrain.citationChecklist,
        }),
        first_draft_status: "failed",
        first_draft_task_id: refs?.taskId || null,
        first_draft_error: errorMessage,
      })
      .eq("tenant_id", params.tenantId)
      .eq("process_task_id", params.processTaskId);

    if (refs) {
      await Promise.all([
        supabaseAdmin
          .from("brain_steps")
          .update({ status: "failed", error_payload: { error: errorMessage }, completed_at: completedAt })
          .eq("id", refs.stepId),
        supabaseAdmin
          .from("brain_runs")
          .update({ status: "failed", error_message: errorMessage, completed_at: completedAt })
          .eq("id", refs.runId),
        supabaseAdmin
          .from("brain_tasks")
          .update({ status: "failed", error_message: errorMessage, completed_at: completedAt })
          .eq("id", refs.taskId),
        supabaseAdmin.from("learning_events").insert({
          tenant_id: params.tenantId,
          task_id: refs.taskId,
          run_id: refs.runId,
          step_id: refs.stepId,
          event_type: "draft_factory_failed",
          source_module: "lex",
          payload: {
            trigger,
            process_task_id: processTask.id,
            case_id: caseBrain.caseId,
            source_case_brain_task_id: caseBrain.taskId,
            recommended_piece_input: caseBrain.draftPlan.recommended_piece_input,
            error: errorMessage,
          },
          created_by: params.userId,
        }),
      ]);
    }

    throw error;
  }
}

export async function runQueuedDraftFactoryBatch(params?: { limit?: number; processTaskId?: string | null }) {
  const limit = Math.min(Math.max(Math.floor(params?.limit || 3), 1), 10);
  const queuedRows = await listQueuedDraftFactoryRows({
    limit,
    processTaskId: params?.processTaskId || null,
  });

  const result: DraftFactoryQueueRunResult = {
    scanned: queuedRows.length,
    processed: 0,
    completed: [],
    reused: [],
    failed: [],
  };

  for (const row of queuedRows) {
    try {
      const execution = await executeDraftFactoryForProcessTask({
        tenantId: row.tenant_id,
        userId: null,
        processTaskId: row.process_task_id,
        trigger: "case_brain_auto_draft_factory",
      });

      result.processed += 1;
      if (execution.alreadyExisting) {
        result.reused.push(row.process_task_id);
      } else {
        result.completed.push(row.process_task_id);
      }
    } catch (error: any) {
      result.failed.push({
        processTaskId: row.process_task_id,
        error: error?.message || "Falha ao executar a Draft Factory headless.",
      });
    }
  }

  return result;
}
