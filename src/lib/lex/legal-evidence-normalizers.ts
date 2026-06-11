export type SourceEvidenceItem = {
  label: string;
  href: string | null;
};

export type DraftEvidenceVersion = {
  metadata?: Record<string, unknown> | null;
  source_case_brain_task_id?: string | null;
} | null;

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

function getNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = Number(value);
    if (Number.isFinite(normalized)) return normalized;
  }
  return fallback;
}

function labelFromSourceRecord(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!isRecord(value)) return "";
  return (
    getString(value, "name") ||
    getString(value, "title") ||
    getString(value, "citation") ||
    getString(value, "label") ||
    getString(value, "source_url") ||
    getString(value, "url") ||
    ""
  );
}

function hrefFromSourceRecord(value: unknown) {
  if (!isRecord(value)) return null;
  return (
    getString(value, "webViewLink") ||
    getString(value, "web_view_link") ||
    getString(value, "drive_link") ||
    getString(value, "source_url") ||
    getString(value, "url")
  );
}

export function uniqueSourceItems(values: unknown[]): SourceEvidenceItem[] {
  const seen = new Set<string>();
  return values
    .map((value) => {
      const label = labelFromSourceRecord(value).replace(/\s+/g, " ").trim();
      if (!label) return null;
      const href = hrefFromSourceRecord(value);
      const key = `${label}:${href || ""}`;
      if (seen.has(key)) return null;
      seen.add(key);
      return { label, href };
    })
    .filter((item): item is SourceEvidenceItem => Boolean(item));
}

export function buildDraftSourceEvidence(version: DraftEvidenceVersion) {
  const metadata = isRecord(version?.metadata) ? version.metadata : {};
  const sourcePack = isRecord(metadata.source_pack) ? metadata.source_pack : {};
  const citationChecklist = isRecord(metadata.citation_checklist) ? metadata.citation_checklist : {};
  const validatedExternalSources = isRecord(sourcePack.validated_external_sources)
    ? sourcePack.validated_external_sources
    : {};

  return {
    documents: uniqueSourceItems(Array.isArray(metadata.used_documents) ? metadata.used_documents : []),
    missingDocuments: uniqueSourceItems(getStringArray(metadata.missing_documents)),
    pendingValidations: uniqueSourceItems([
      ...getStringArray(metadata.pending_validations),
      ...getStringArray(citationChecklist.pending_validations),
    ]),
    externalGaps: uniqueSourceItems([
      ...getStringArray(metadata.external_validation_gaps),
      ...getStringArray(sourcePack.external_validation_gaps),
    ]),
    lawReferences: uniqueSourceItems([
      ...(Array.isArray(metadata.validated_law_references) ? metadata.validated_law_references : []),
      ...(Array.isArray(validatedExternalSources.law_references) ? validatedExternalSources.law_references : []),
    ]),
    caseLawReferences: uniqueSourceItems([
      ...(Array.isArray(metadata.validated_case_law_references) ? metadata.validated_case_law_references : []),
      ...(Array.isArray(validatedExternalSources.case_law_references) ? validatedExternalSources.case_law_references : []),
    ]),
    relevantUnusedDocuments: uniqueSourceItems([
      ...(Array.isArray(metadata.relevant_unused_documents) ? metadata.relevant_unused_documents : []),
      ...(Array.isArray(metadata.documents_not_used) ? metadata.documents_not_used : []),
    ]),
  };
}

export function buildDraftCaseBrainEvidence(version: DraftEvidenceVersion, currentCaseBrainTaskId?: string | null) {
  const metadata = isRecord(version?.metadata) ? version.metadata : {};
  const snapshot = isRecord(metadata.case_brain_snapshot)
    ? metadata.case_brain_snapshot
    : isRecord(metadata.caseBrainSnapshot)
      ? metadata.caseBrainSnapshot
      : isRecord(metadata.case_brain)
        ? metadata.case_brain
        : isRecord(metadata.caseBrain)
          ? metadata.caseBrain
          : null;
  const legalSourceGate = isRecord(metadata.legal_source_gate) ? metadata.legal_source_gate : null;
  const premiumGate = isRecord(metadata.legal_source_gate_premium_publish)
    ? metadata.legal_source_gate_premium_publish
    : isRecord(metadata.premium_publish)
      ? metadata.premium_publish
      : null;
  const sourceCaseBrainTaskId = version?.source_case_brain_task_id
    || getString(metadata, "source_case_brain_task_id")
    || getString(metadata, "case_brain_task_id")
    || null;

  return {
    currentCaseBrainTaskId: currentCaseBrainTaskId || null,
    sourceCaseBrainTaskId,
    hasSnapshot: Boolean(snapshot),
    summary: getString(snapshot, "summary") || getString(snapshot, "resumo"),
    highRiskCount: getNumber(snapshot?.high_risk_count ?? snapshot?.risk_count ?? snapshot?.risks_count, 0),
    highContradictionCount: getNumber(snapshot?.high_contradiction_count ?? snapshot?.contradiction_count ?? snapshot?.contradictions_count, 0),
    groundingGapCount: getNumber(snapshot?.grounding_gap_count ?? snapshot?.gap_count ?? snapshot?.gaps_count, 0),
    risks: uniqueSourceItems(Array.isArray(snapshot?.risks) ? snapshot.risks : Array.isArray(snapshot?.riscos) ? snapshot.riscos : []),
    contradictions: uniqueSourceItems(Array.isArray(snapshot?.contradictions) ? snapshot.contradictions : Array.isArray(snapshot?.contradicoes) ? snapshot.contradicoes : []),
    gaps: uniqueSourceItems(Array.isArray(snapshot?.gaps) ? snapshot.gaps : Array.isArray(snapshot?.grounding_gaps) ? snapshot.grounding_gaps : []),
    missingDocuments: uniqueSourceItems(Array.isArray(snapshot?.missing_documents) ? snapshot.missing_documents : []),
    relevantUnusedDocuments: uniqueSourceItems([
      ...(Array.isArray(snapshot?.relevant_unused_documents) ? snapshot.relevant_unused_documents : []),
      ...(Array.isArray(snapshot?.documents_not_used) ? snapshot.documents_not_used : []),
    ]),
    sourceGateStatus: getString(legalSourceGate, "status") || getString(legalSourceGate, "action"),
    sourceGateAction: getString(legalSourceGate, "action"),
    premiumOverrideReason: getString(premiumGate, "override_reason")
      || getString(premiumGate, "source_gate_override_reason")
      || getString(premiumGate, "reason"),
    premiumOverrideActor: getString(premiumGate, "overridden_by")
      || getString(premiumGate, "actor_id")
      || getString(premiumGate, "publishedBy"),
  };
}
