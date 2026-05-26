import type { LegalCaseContextSnapshot } from "@/lib/lex/case-context";
import {
  findTenantOperationalAreaMethod,
  type TenantOperationalAreaMethod,
  type TenantOperationalMethodologyContext,
} from "@/lib/setup/tenant-operational-methodology";

export type ProcessMissionConfidence = "high" | "medium" | "low";

export type ProcessMissionRecommendedAction =
  | "refresh_document_memory"
  | "generate_first_draft"
  | "review_existing_draft"
  | "collect_missing_documents"
  | "build_case_context"
  | "human_review";

export type BuildProcessMissionContextOptions = {
  operationalMethodology?: TenantOperationalMethodologyContext | null;
};

export type ProcessMissionMethodologyContext = {
  provided: boolean;
  source: TenantOperationalMethodologyContext["source"] | "not_provided";
  status: TenantOperationalMethodologyContext["status"] | "not_provided";
  activation: TenantOperationalMethodologyContext["activation"] | "not_provided";
  canGuideInternalDecisions: boolean;
  requiresHumanReview: boolean;
  areaMethod: TenantOperationalAreaMethod | null;
  expectedDocuments: string[];
  missingExpectedDocuments: string[];
  expectedPhases: string[];
  expectedDocumentStructure: string[];
  expectedIntakeQuestions: string[];
  ownerTeam: string | null;
  areaNeedsReview: boolean;
  nextReviewQuestion: string | null;
  reviewReasons: string[];
  reviewCriteria: string[];
  blockers: string[];
};

export type LegalOperatorStatus =
  | "ready_internal_action"
  | "awaiting_human_approval"
  | "awaiting_supervision"
  | "blocked";

export type LegalMissionCoordination = {
  owner: {
    front: "front_a";
    label: "Frente A - Juridico/Lex";
    domain: "juridico_lex";
  };
  crossFrontBoundary: {
    ownedScope: "legal_mission_context";
    handoffRequiredFor: string[];
    rule: string;
  };
  sideEffectGuardrail: {
    approvalGate: "humanGate";
    requiresHumanApprovalForLegalSideEffects: true;
    blocksExternalSideEffectsUntilHumanApproval: true;
    protectedSideEffects: string[];
  };
};

export type LegalOperatorState = {
  phase: string | null;
  status: LegalOperatorStatus;
  // Optional for persisted states created before front ownership was explicit.
  coordination?: LegalMissionCoordination;
  safeNextAction: {
    action: ProcessMissionRecommendedAction;
    label: string;
    canAutoExecute: boolean;
    requiresApproval: boolean;
    externalSideEffectsBlocked: boolean;
  };
  humanGate: {
    required: boolean;
    reason: string;
    blocksExternalAction: boolean;
  };
  blockers: string[];
  evidenceSummary: {
    confidence: ProcessMissionConfidence;
    factualSources: string[];
    inferenceNotes: string[];
    missingSignals: string[];
    documentFreshness: ProcessMissionContext["documents"]["freshness"];
    documentCount: number;
    draftStatus: ProcessMissionContext["draft"]["status"];
    methodologyStatus: ProcessMissionContext["methodology"]["status"];
    methodologyActivation: ProcessMissionContext["methodology"]["activation"];
    methodologyReviewReasons: string[];
  };
};

export type ProcessMissionOperationalThesis = {
  thesis: string;
  rationale: string[];
  sourcesUsed: string[];
  gaps: string[];
  blockers: string[];
  nextActionBeforeDraftFactory: string;
  openClawReason: string;
};

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
  methodology: ProcessMissionMethodologyContext;
  confidence: ProcessMissionConfidence;
  recommendedAction: ProcessMissionRecommendedAction;
  missionGoal: string;
  operationalThesis: ProcessMissionOperationalThesis;
};

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function normalizeComparable(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function resolveMissingExpectedDocuments(expectedDocuments: string[], pendingItems: string[]) {
  const normalizedPendingItems = pendingItems.map(normalizeComparable).filter(Boolean);

  return expectedDocuments.filter((documentName) => {
    const normalizedDocument = normalizeComparable(documentName);
    if (!normalizedDocument) return false;
    return normalizedPendingItems.some((pendingItem) => (
      pendingItem.includes(normalizedDocument) || normalizedDocument.includes(pendingItem)
    ));
  });
}

function buildMethodologyReviewCriteria(params: {
  methodology: TenantOperationalMethodologyContext;
  areaMethod: TenantOperationalAreaMethod | null;
}) {
  return uniqueStrings([
    `status:${params.methodology.status}`,
    `activation:${params.methodology.activation}`,
    `can_guide_internal_decisions:${params.methodology.canGuideInternalDecisions}`,
    `requires_human_review:${params.methodology.requiresHumanReview}`,
    params.areaMethod
      ? `area_method_validation:${params.areaMethod.validationStatus}`
      : "area_method:not_found",
  ]);
}

function resolveMethodologyBlockers(params: {
  methodology: TenantOperationalMethodologyContext;
  areaMethod: TenantOperationalAreaMethod | null;
  legalArea: string | null;
}) {
  const { methodology, areaMethod, legalArea } = params;

  return uniqueStrings([
    methodology.status === "missing" ? "operational_methodology_missing" : null,
    methodology.status === "rejected" ? "operational_methodology_rejected" : null,
    methodology.activation !== "active_internal" ? "methodology_not_approved" : null,
    methodology.requiresHumanReview ? "methodology_requires_human_review" : null,
    legalArea && !areaMethod ? "methodology_area_method_missing" : null,
    areaMethod && areaMethod.validationStatus !== "validated" ? "methodology_area_needs_review" : null,
    ...methodology.reviewReasons.map((reason) => `methodology:${reason}`),
  ]);
}

function resolveMethodologyContext(params: {
  methodology?: TenantOperationalMethodologyContext | null;
  legalArea: string | null;
  pendingItems: string[];
}): ProcessMissionMethodologyContext {
  const { methodology, legalArea, pendingItems } = params;
  if (!methodology) {
    return {
      provided: false,
      source: "not_provided",
      status: "not_provided",
      activation: "not_provided",
      canGuideInternalDecisions: false,
      requiresHumanReview: false,
      areaMethod: null,
      expectedDocuments: [],
      missingExpectedDocuments: [],
      expectedPhases: [],
      expectedDocumentStructure: [],
      expectedIntakeQuestions: [],
      ownerTeam: null,
      areaNeedsReview: false,
      nextReviewQuestion: null,
      reviewReasons: [],
      reviewCriteria: [],
      blockers: [],
    };
  }

  const areaMethod = findTenantOperationalAreaMethod(methodology, legalArea);
  const expectedDocuments = uniqueStrings([
    ...(areaMethod?.requiredDocuments || []),
    ...methodology.defaultRequiredDocuments,
  ]);
  const blockers = resolveMethodologyBlockers({ methodology, areaMethod, legalArea });

  return {
    provided: true,
    source: methodology.source,
    status: methodology.status,
    activation: methodology.activation,
    canGuideInternalDecisions: methodology.canGuideInternalDecisions,
    requiresHumanReview: methodology.requiresHumanReview || blockers.length > 0,
    areaMethod,
    expectedDocuments,
    missingExpectedDocuments: resolveMissingExpectedDocuments(expectedDocuments, pendingItems),
    expectedPhases: areaMethod?.phases || [],
    expectedDocumentStructure: areaMethod?.documentStructure || [],
    expectedIntakeQuestions: areaMethod?.intakeQuestions || [],
    ownerTeam: areaMethod?.ownerTeam || null,
    areaNeedsReview: Boolean(areaMethod && areaMethod.validationStatus !== "validated"),
    nextReviewQuestion: areaMethod?.nextReviewQuestion || null,
    reviewReasons: methodology.reviewReasons,
    reviewCriteria: buildMethodologyReviewCriteria({ methodology, areaMethod }),
    blockers,
  };
}

function resolveProgressSummary(snapshot: LegalCaseContextSnapshot) {
  return snapshot.caseBrain.summaryMaster
    || snapshot.documentMemory.summaryMaster
    || snapshot.processTask.description
    || null;
}

function resolveCurrentPhase(
  snapshot: LegalCaseContextSnapshot,
  methodology: ProcessMissionMethodologyContext,
) {
  return snapshot.caseBrain.currentPhase
    || snapshot.documentMemory.currentPhase
    || snapshot.processTask.stageName
    || methodology.expectedPhases[0]
    || null;
}

function resolvePendingItems(snapshot: LegalCaseContextSnapshot) {
  return uniqueStrings([
    ...stringArray(snapshot.caseBrain.missingDocuments),
    ...stringArray(snapshot.documentMemory.missingDocuments),
  ]).slice(0, 5);
}

function resolveNextStep(
  snapshot: LegalCaseContextSnapshot,
  pendingItems: string[],
  methodology: ProcessMissionMethodologyContext,
) {
  const firstActions = stringArray(snapshot.caseBrain.firstActions);
  if (firstActions[0]) return firstActions[0];
  if (methodology.missingExpectedDocuments[0]) {
    return `Confirmar documento esperado pela metodologia do escritorio: ${methodology.missingExpectedDocuments[0]}.`;
  }
  if (pendingItems[0]) return `Confirmar e organizar a pendencia documental "${pendingItems[0]}" antes do proximo movimento relevante.`;
  if (methodology.provided && !methodology.canGuideInternalDecisions && methodology.reviewReasons[0]) {
    return "Submeter a metodologia operacional do tenant a revisao humana antes de orientar a proxima providencia juridica.";
  }
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
  methodology: ProcessMissionMethodologyContext;
}) {
  const { snapshot, progressSummary, currentPhase, nextStep, pendingItems, methodology } = params;
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
    methodology.provided ? "tenant_operational_methodology" : null,
    methodology.areaMethod ? "tenant_operational_area_method" : null,
  ]);

  const inferenceNotes = uniqueStrings([
    !stringArray(snapshot.caseBrain.firstActions)[0] && pendingItems.length > 0 && nextStep ? "next_step_inferred_from_document_gap" : null,
    !snapshot.caseBrain.summaryMaster && !snapshot.documentMemory.summaryMaster && snapshot.processTask.description && progressSummary ? "progress_from_process_task_description" : null,
    snapshot.documentMemory.freshness === "stale" ? "document_memory_may_be_stale" : null,
    methodology.provided && methodology.expectedPhases[0] && currentPhase === methodology.expectedPhases[0] ? "phase_inferred_from_tenant_methodology" : null,
    methodology.provided && methodology.blockers.length > 0 ? "tenant_methodology_requires_review" : null,
  ]);

  const missingSignals = uniqueStrings([
    !progressSummary ? "progress_summary" : null,
    !currentPhase ? "current_phase" : null,
    !nextStep ? "next_step" : null,
    pendingItems.length === 0 ? "document_gaps" : null,
    snapshot.documentMemory.freshness === "missing" ? "document_memory" : null,
    !snapshot.caseBrain.taskId ? "case_brain_task" : null,
    methodology.provided && snapshot.processTask.legalArea && !methodology.areaMethod ? "tenant_area_method" : null,
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

export function formatProcessMissionActionLabel(action: ProcessMissionRecommendedAction) {
  switch (action) {
    case "refresh_document_memory":
      return "Atualizar memoria documental";
    case "generate_first_draft":
      return "Pedir aprovacao para gerar primeira minuta";
    case "review_existing_draft":
      return "Revisar minuta existente";
    case "collect_missing_documents":
      return "Organizar pendencias documentais";
    case "human_review":
      return "Encaminhar para revisao humana";
    default:
      return "Consolidar contexto do caso";
  }
}

function resolveLegalOperatorStatus(context: ProcessMissionContext): LegalOperatorStatus {
  if (context.confidence === "low" || context.recommendedAction === "human_review") return "blocked";
  if (context.methodology.requiresHumanReview && context.recommendedAction === "generate_first_draft") return "awaiting_human_approval";
  if (context.methodology.requiresHumanReview) return "awaiting_supervision";
  if (context.recommendedAction === "refresh_document_memory") return "ready_internal_action";
  if (context.recommendedAction === "generate_first_draft") return "awaiting_human_approval";
  return "awaiting_supervision";
}

function resolveLegalOperatorHumanGate(context: ProcessMissionContext) {
  const action = context.recommendedAction;
  const needsApproval = action !== "refresh_document_memory" || context.confidence === "low";

  if (context.methodology.requiresHumanReview && context.methodology.blockers.length > 0) {
    return {
      required: true,
      reason: "Metodologia operacional do tenant ainda exige revisao humana antes de orientar execucao juridica sensivel.",
      blocksExternalAction: true,
    };
  }

  if (context.confidence === "low" || action === "human_review") {
    return {
      required: true,
      reason: "Base juridica insuficiente para execucao automatica.",
      blocksExternalAction: true,
    };
  }

  if (action === "generate_first_draft") {
    return {
      required: true,
      reason: "Geracao de minuta juridica exige aprovacao humana antes de acionar a Draft Factory.",
      blocksExternalAction: true,
    };
  }

  if (needsApproval) {
    return {
      required: true,
      reason: "A proxima providencia juridica ainda precisa de supervisao explicita.",
      blocksExternalAction: true,
    };
  }

  return {
    required: false,
    reason: "Acao interna de baixo risco; nenhum envio, protocolo ou publicacao externa sera executado.",
    blocksExternalAction: true,
  };
}

function resolveLegalOperatorBlockers(context: ProcessMissionContext) {
  return uniqueStrings([
    context.confidence === "low" ? "low_confidence_process_mission" : null,
    ...context.grounding.missingSignals.map((signal) => `missing:${signal}`),
    ...context.methodology.blockers,
    context.methodology.missingExpectedDocuments.length > 0 ? "methodology_expected_documents_missing" : null,
    context.documents.freshness === "missing" ? "missing_document_memory" : null,
    context.documents.freshness === "stale" ? "stale_document_memory" : null,
    context.draft.isStale ? "stale_first_draft" : null,
    context.status.pendingItems.length > 0 ? "pending_documents" : null,
  ]);
}

function resolveOperationalThesis(params: {
  contextCore: Omit<ProcessMissionContext, "operationalThesis">;
}) : ProcessMissionOperationalThesis {
  const context = params.contextCore;
  const processLabel = context.process.processNumber || context.process.title;
  const sourcesUsed = uniqueStrings([
    ...context.grounding.factualSources,
    context.documents.summary ? "document_memory_summary" : null,
    context.methodology.provided ? "tenant_operational_methodology" : null,
  ]);
  const gaps = uniqueStrings([
    ...context.grounding.missingSignals,
    ...context.status.pendingItems,
    ...context.documents.missingDocuments,
    ...context.methodology.missingExpectedDocuments,
  ]);
  const blockers = resolveLegalOperatorBlockers(context as ProcessMissionContext);
  const pieceLabel = context.draft.recommendedPiece || "primeira minuta juridica";
  const nextActionBeforeDraftFactory = context.recommendedAction === "generate_first_draft"
    ? `Pedir approval humano com fontes, lacunas e tese antes de chamar a Draft Factory para ${pieceLabel}.`
    : formatProcessMissionActionLabel(context.recommendedAction);
  const openClawReason = context.recommendedAction === "generate_first_draft"
    ? "OpenClaw: geracao de minuta juridica e superficie legal sensivel; exige approval humano antes da Draft Factory."
    : context.confidence === "low"
      ? "OpenClaw: contexto processual insuficiente bloqueia execucao automatica."
      : context.methodology.requiresHumanReview
        ? "OpenClaw: metodologia operacional do tenant exige supervisao antes de orientar ato juridico sensivel."
        : "OpenClaw: apenas acao interna segura pode prosseguir; efeitos externos seguem bloqueados.";

  return {
    thesis: `Para ${processLabel}, a tese operacional atual e ${context.missionGoal}`,
    rationale: uniqueStrings([
      context.status.currentPhase ? `Fase atual: ${context.status.currentPhase}` : null,
      context.status.progressSummary ? `Resumo: ${context.status.progressSummary}` : null,
      context.status.nextStep ? `Proximo passo: ${context.status.nextStep}` : null,
      context.draft.recommendedPiece ? `Peca sugerida: ${context.draft.recommendedPiece}` : null,
      `Confianca: ${context.confidence}`,
    ]),
    sourcesUsed,
    gaps,
    blockers,
    nextActionBeforeDraftFactory,
    openClawReason,
  };
}

function buildLegalMissionCoordination(): LegalMissionCoordination {
  return {
    owner: {
      front: "front_a",
      label: "Frente A - Juridico/Lex",
      domain: "juridico_lex",
    },
    crossFrontBoundary: {
      ownedScope: "legal_mission_context",
      handoffRequiredFor: [
        "front_b",
        "growth_marketing",
        "dispatcher",
        "control_plane",
        "routines",
        "agent_profiles",
        "dashboard",
        "docs",
        "migrations",
      ],
      rule: "Missao juridica pertence a Frente A; qualquer mutacao fora de Juridico/Lex exige handoff explicito.",
    },
    sideEffectGuardrail: {
      approvalGate: "humanGate",
      requiresHumanApprovalForLegalSideEffects: true,
      blocksExternalSideEffectsUntilHumanApproval: true,
      protectedSideEffects: [
        "draft_factory_generation",
        "process_state_mutation",
        "client_or_court_message",
        "protocol_filing",
        "cross_front_mutation",
      ],
    },
  };
}

export function buildLegalOperatorState(context: ProcessMissionContext): LegalOperatorState {
  const status = resolveLegalOperatorStatus(context);
  const humanGate = resolveLegalOperatorHumanGate(context);

  return {
    phase: context.status.currentPhase || context.process.stageName || null,
    status,
    coordination: buildLegalMissionCoordination(),
    safeNextAction: {
      action: context.recommendedAction,
      label: formatProcessMissionActionLabel(context.recommendedAction),
      canAutoExecute: context.recommendedAction === "refresh_document_memory"
        && context.confidence !== "low"
        && !humanGate.required,
      requiresApproval: humanGate.required,
      externalSideEffectsBlocked: true,
    },
    humanGate,
    blockers: resolveLegalOperatorBlockers(context),
    evidenceSummary: {
      confidence: context.confidence,
      factualSources: context.grounding.factualSources,
      inferenceNotes: context.grounding.inferenceNotes,
      missingSignals: context.grounding.missingSignals,
      documentFreshness: context.documents.freshness,
      documentCount: context.documents.count,
      draftStatus: context.draft.status,
      methodologyStatus: context.methodology.status,
      methodologyActivation: context.methodology.activation,
      methodologyReviewReasons: context.methodology.reviewReasons,
    },
  };
}

export function buildProcessMissionContext(
  snapshot: LegalCaseContextSnapshot,
  options: BuildProcessMissionContextOptions = {},
): ProcessMissionContext {
  const progressSummary = resolveProgressSummary(snapshot);
  const pendingItems = resolvePendingItems(snapshot);
  const methodology = resolveMethodologyContext({
    methodology: options.operationalMethodology,
    legalArea: snapshot.processTask.legalArea,
    pendingItems,
  });
  const currentPhase = resolveCurrentPhase(snapshot, methodology);
  const nextStep = resolveNextStep(snapshot, pendingItems, methodology);
  const confidence = resolveConfidence({ snapshot, progressSummary, currentPhase, nextStep, pendingItems });
  const recommendedAction = resolveRecommendedAction({ snapshot, confidence, pendingItems });
  const grounding = resolveGrounding({ snapshot, progressSummary, currentPhase, nextStep, pendingItems, methodology });

  const contextCore: Omit<ProcessMissionContext, "operationalThesis"> = {
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
    grounding,
    methodology,
    confidence,
    recommendedAction,
    missionGoal: buildMissionGoal({ snapshot, recommendedAction }),
  };

  return {
    ...contextCore,
    operationalThesis: resolveOperationalThesis({ contextCore }),
  };
}
