import type { LegalCaseContextSnapshot } from "@/lib/lex/case-context";

export type ProcessMissionConfidence = "high" | "medium" | "low";

export type ProcessMissionRecommendedAction =
  | "refresh_document_memory"
  | "generate_first_draft"
  | "review_existing_draft"
  | "collect_missing_documents"
  | "build_case_context"
  | "human_review";

export type ProcessMissionContext = {
  process: {
    processTaskId: string;
    title: string;
    clientName: string | null;
    processNumber: string | null;
    legalArea: string | null;
    pipelineName: string | null;
    stageName: string | null;
  };
  status: {
    currentPhase: string | null;
    progressSummary: string | null;
    nextStep: string | null;
    pendingItems: string[];
  };
  documents: {
    count: number;
    freshness: "fresh" | "stale" | "missing";
    syncStatus: string | null;
    lastSyncedAt: string | null;
    summary: string | null;
    missingDocuments: string[];
  };
  draft: {
    status: LegalCaseContextSnapshot["firstDraft"]["status"];
    isStale: boolean;
    artifactId: string | null;
    recommendedPiece: string | null;
    requiresHumanReview: boolean;
  };
  grounding: {
    factualSources: string[];
    inferenceNotes: string[];
    missingSignals: string[];
  };
  confidence: ProcessMissionConfidence;
  recommendedAction: ProcessMissionRecommendedAction;
  missionGoal: string;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function resolveProgressSummary(snapshot: LegalCaseContextSnapshot) {
  return snapshot.caseBrain.summaryMaster
    || snapshot.documentMemory.summaryMaster
    || snapshot.processTask.description
    || null;
}

function resolveCurrentPhase(snapshot: LegalCaseContextSnapshot) {
  return snapshot.caseBrain.currentPhase
    || snapshot.documentMemory.currentPhase
    || snapshot.processTask.stageName
    || null;
}

function resolvePendingItems(snapshot: LegalCaseContextSnapshot) {
  return uniqueStrings([
    ...stringArray(snapshot.caseBrain.missingDocuments),
    ...stringArray(snapshot.documentMemory.missingDocuments),
  ]).slice(0, 5);
}

function resolveNextStep(snapshot: LegalCaseContextSnapshot, pendingItems: string[]) {
  const firstActions = stringArray(snapshot.caseBrain.firstActions);
  if (firstActions[0]) return firstActions[0];
  if (pendingItems[0]) return `Confirmar e organizar a pendencia documental "${pendingItems[0]}" antes do proximo movimento relevante.`;
  if (snapshot.caseBrain.recommendedPieceInput && snapshot.firstDraft.status === "idle") return "Gerar a primeira minuta juridica com base no Case Brain.";
  if (snapshot.firstDraft.status === "completed") return "Revisar a minuta existente antes de qualquer aprovacao ou publicacao.";
  return null;
}

function resolveGrounding(params: {
  snapshot: LegalCaseContextSnapshot;
  progressSummary: string | null;
  currentPhase: string | null;
  nextStep: string | null;
  pendingItems: string[];
}) {
  const { snapshot, progressSummary, currentPhase, nextStep, pendingItems } = params;
  const factualSources = uniqueStrings([
    snapshot.caseBrain.taskId ? "case_brain" : null,
    snapshot.caseBrain.summaryMaster ? "case_brain_summary" : null,
    snapshot.caseBrain.currentPhase ? "case_brain_phase" : null,
    snapshot.documentMemory.freshness !== "missing" ? "process_document_memory" : null,
    snapshot.documentMemory.freshness === "fresh" ? "fresh_document_memory" : null,
    snapshot.documentMemory.summaryMaster ? "document_memory_summary" : null,
    snapshot.processTask.stageName ? "process_stage" : null,
    snapshot.processTask.description && progressSummary === snapshot.processTask.description ? "process_task_description" : null,
    stringArray(snapshot.caseBrain.firstActions).length > 0 ? "case_brain_first_actions" : null,
    pendingItems.length > 0 ? "document_gaps" : null,
    snapshot.firstDraft.artifactId ? "first_draft_artifact" : null,
  ]);

  const inferenceNotes = uniqueStrings([
    !stringArray(snapshot.caseBrain.firstActions)[0] && pendingItems.length > 0 && nextStep ? "next_step_inferred_from_document_gap" : null,
    !snapshot.caseBrain.summaryMaster && !snapshot.documentMemory.summaryMaster && snapshot.processTask.description && progressSummary ? "progress_from_process_task_description" : null,
    snapshot.documentMemory.freshness === "stale" ? "document_memory_may_be_stale" : null,
  ]);

  const missingSignals = uniqueStrings([
    !progressSummary ? "progress_summary" : null,
    !currentPhase ? "current_phase" : null,
    !nextStep ? "next_step" : null,
    pendingItems.length === 0 ? "document_gaps" : null,
    snapshot.documentMemory.freshness === "missing" ? "document_memory" : null,
    !snapshot.caseBrain.taskId ? "case_brain_task" : null,
  ]);

  return { factualSources, inferenceNotes, missingSignals };
}

function resolveConfidence(params: {
  snapshot: LegalCaseContextSnapshot;
  progressSummary: string | null;
  currentPhase: string | null;
  nextStep: string | null;
  pendingItems: string[];
}) : ProcessMissionConfidence {
  const { snapshot, progressSummary, currentPhase, nextStep, pendingItems } = params;
  const hasGrounding = Boolean(snapshot.caseBrain.taskId)
    || snapshot.documentMemory.freshness !== "missing"
    || Boolean(snapshot.processTask.stageName);
  const signalCount = [progressSummary, currentPhase, nextStep, pendingItems.length > 0 ? "pending" : null].filter(Boolean).length;

  if (hasGrounding && currentPhase && (progressSummary || nextStep)) return "high";
  if (hasGrounding && signalCount >= 2) return "medium";
  return "low";
}

function resolveRecommendedAction(params: {
  snapshot: LegalCaseContextSnapshot;
  confidence: ProcessMissionConfidence;
  pendingItems: string[];
}) : ProcessMissionRecommendedAction {
  const { snapshot, confidence, pendingItems } = params;
  if (confidence === "low") return "human_review";
  if (snapshot.documentMemory.freshness !== "fresh") return "refresh_document_memory";
  if (pendingItems.length > 0) return "collect_missing_documents";
  if (snapshot.caseBrain.recommendedPieceInput && (snapshot.firstDraft.status === "idle" || snapshot.firstDraft.status === "failed")) return "generate_first_draft";
  if (snapshot.firstDraft.status === "completed" || snapshot.firstDraft.isStale) return "review_existing_draft";
  return "build_case_context";
}

function buildMissionGoal(params: {
  snapshot: LegalCaseContextSnapshot;
  recommendedAction: ProcessMissionRecommendedAction;
}) {
  const label = params.snapshot.processTask.processNumber || params.snapshot.processTask.title;
  switch (params.recommendedAction) {
    case "refresh_document_memory":
      return `Atualizar memoria documental do processo ${label} antes de decidir o proximo ato.`;
    case "generate_first_draft":
      return `Gerar primeira minuta do processo ${label} com base no Case Brain e no acervo sincronizado.`;
    case "review_existing_draft":
      return `Revisar a minuta existente do processo ${label} antes de qualquer aprovacao ou publicacao.`;
    case "collect_missing_documents":
      return `Organizar pendencias documentais do processo ${label} antes do proximo movimento.`;
    case "human_review":
      return `Encaminhar o processo ${label} para revisao humana porque a base agentica ainda e insuficiente.`;
    default:
      return `Consolidar contexto operacional do processo ${label} e preparar a proxima decisao segura.`;
  }
}

export function buildProcessMissionContext(snapshot: LegalCaseContextSnapshot): ProcessMissionContext {
  const progressSummary = resolveProgressSummary(snapshot);
  const currentPhase = resolveCurrentPhase(snapshot);
  const pendingItems = resolvePendingItems(snapshot);
  const nextStep = resolveNextStep(snapshot, pendingItems);
  const confidence = resolveConfidence({ snapshot, progressSummary, currentPhase, nextStep, pendingItems });
  const recommendedAction = resolveRecommendedAction({ snapshot, confidence, pendingItems });

  return {
    process: {
      processTaskId: snapshot.processTask.id,
      title: snapshot.processTask.title,
      clientName: snapshot.processTask.clientName,
      processNumber: snapshot.processTask.processNumber,
      legalArea: snapshot.processTask.legalArea,
      pipelineName: snapshot.processTask.pipelineName,
      stageName: snapshot.processTask.stageName,
    },
    status: {
      currentPhase,
      progressSummary,
      nextStep,
      pendingItems,
    },
    documents: {
      count: snapshot.documentMemory.documentCount,
      freshness: snapshot.documentMemory.freshness,
      syncStatus: snapshot.documentMemory.syncStatus,
      lastSyncedAt: snapshot.documentMemory.lastSyncedAt,
      summary: snapshot.documentMemory.summaryMaster,
      missingDocuments: stringArray(snapshot.documentMemory.missingDocuments),
    },
    draft: {
      status: snapshot.firstDraft.status,
      isStale: snapshot.firstDraft.isStale,
      artifactId: snapshot.firstDraft.artifactId,
      recommendedPiece: snapshot.firstDraft.recommendedPieceLabel
        || snapshot.caseBrain.recommendedPieceLabel
        || snapshot.firstDraft.recommendedPieceInput
        || snapshot.caseBrain.recommendedPieceInput,
      requiresHumanReview: snapshot.firstDraft.requiresHumanReview,
    },
    grounding: resolveGrounding({ snapshot, progressSummary, currentPhase, nextStep, pendingItems }),
    confidence,
    recommendedAction,
    missionGoal: buildMissionGoal({ snapshot, recommendedAction }),
  };
}
