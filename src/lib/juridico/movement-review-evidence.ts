export type MovementReviewEvidenceInput = {
  status?: string | null;
  origem?: string | null;
  review_note?: string | null;
  supervision_context?: Record<string, unknown> | null;
  contract?: Record<string, unknown> | null;
  human_decision?: Record<string, unknown> | null;
  side_effects?: Record<string, unknown> | null;
};

export type MovementReviewEvidence = {
  shouldRender: boolean;
  contractStatus: string | null;
  contractSource: string | null;
  decisionStatus: string | null;
  decisionActor: string | null;
  decisionReason: string | null;
  caseBrainSummary: string | null;
  riskCount: number | null;
  contradictionCount: number | null;
  gapCount: number | null;
  risks: string[];
  contradictions: string[];
  gaps: string[];
  missingDocuments: string[];
  unusedDocuments: string[];
  sources: string[];
  blockers: string[];
  protectedSideEffects: string[];
  sideEffectReason: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function firstRecord(...values: unknown[]) {
  for (const value of values) {
    const record = asRecord(value);
    if (record) return record;
  }
  return null;
}

function firstText(...values: Array<string | null | undefined>) {
  return values.find((value) => typeof value === "string" && value.trim().length > 0)?.trim() || null;
}

function getText(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "sim" : "nao";
  return null;
}

function getList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function getNumber(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = Number(value);
    if (Number.isFinite(normalized)) return normalized;
  }
  return null;
}

export function normalizeMovementReviewEvidence(review: MovementReviewEvidenceInput): MovementReviewEvidence {
  const supervision = asRecord(review.supervision_context);
  const contract = firstRecord(review.contract, supervision?.contract, supervision?.movement_contract);
  const contractHumanDecision = firstRecord(contract?.human_decision, contract?.humanDecision);
  const humanDecision = firstRecord(review.human_decision, supervision?.human_decision, supervision?.humanDecision, contractHumanDecision);
  const sideEffects = firstRecord(review.side_effects, supervision?.side_effects, supervision?.sideEffects);
  const caseBrain = firstRecord(
    supervision?.case_brain,
    supervision?.caseBrain,
    supervision?.case_brain_snapshot,
    supervision?.caseBrainSnapshot,
  );

  const contractStatus = firstText(
    getText(contract, "review_status"),
    getText(contract, "reviewStatus"),
    getText(contract, "status"),
    review.status,
  );
  const contractSource = firstText(getText(contract, "audit_source"), getText(contract, "auditSource"), review.origem);
  const decisionStatus = firstText(
    getText(humanDecision, "status"),
    getText(humanDecision, "decision"),
    getText(contract, "human_decision_status"),
  );
  const decisionActor = firstText(
    getText(humanDecision, "reviewed_by"),
    getText(humanDecision, "actor_id"),
    getText(humanDecision, "responsavel"),
    getText(contract, "reviewed_by"),
  );
  const decisionReason = firstText(
    getText(humanDecision, "justification"),
    getText(humanDecision, "reason"),
    getText(humanDecision, "note"),
    getText(contract, "review_note"),
    review.review_note,
  );

  const risks = getList(caseBrain?.risks || caseBrain?.riscos || supervision?.risks);
  const contradictions = getList(caseBrain?.contradictions || caseBrain?.contradicoes || supervision?.contradictions);
  const gaps = getList(caseBrain?.gaps || caseBrain?.grounding_gaps || supervision?.gaps);
  const missingDocuments = getList(caseBrain?.missing_documents || caseBrain?.documents_missing || supervision?.missing_documents);
  const unusedDocuments = getList(caseBrain?.relevant_unused_documents || caseBrain?.documents_not_used || supervision?.relevant_unused_documents);
  const sources = getList(supervision?.sources_used || caseBrain?.sources_used);
  const blockers = getList(supervision?.blockers || sideEffects?.blockers);
  const protectedSideEffects = getList(
    sideEffects?.protected_side_effects
      || sideEffects?.blocked_side_effects
      || supervision?.protected_side_effects
      || supervision?.blocked_side_effects,
  );
  const sideEffectReason = firstText(
    getText(sideEffects, "reason"),
    getText(sideEffects, "blocked_reason"),
    getText(supervision, "next_action_before_draft_factory"),
  );

  return {
    shouldRender: Boolean(
      supervision
        || contract
        || humanDecision
        || caseBrain
        || contractStatus
        || decisionStatus
        || protectedSideEffects.length > 0,
    ),
    contractStatus,
    contractSource,
    decisionStatus,
    decisionActor,
    decisionReason,
    caseBrainSummary: firstText(
      getText(caseBrain, "summary"),
      getText(caseBrain, "resumo"),
      getText(supervision, "operational_thesis"),
    ),
    riskCount: getNumber(caseBrain, "high_risk_count") ?? getNumber(caseBrain, "risks_count"),
    contradictionCount: getNumber(caseBrain, "high_contradiction_count") ?? getNumber(caseBrain, "contradictions_count"),
    gapCount: getNumber(caseBrain, "grounding_gap_count") ?? getNumber(caseBrain, "gaps_count"),
    risks,
    contradictions,
    gaps,
    missingDocuments,
    unusedDocuments,
    sources,
    blockers,
    protectedSideEffects,
    sideEffectReason,
  };
}
