export type LegalDraftSourceGateAction = "approve" | "publish" | "premium_publish";

export type LegalDraftSourceGateOverride = {
  approved: boolean;
  reason?: string | null;
  actorId?: string | null;
};

export type LegalDraftSourceGateDecision = {
  action: LegalDraftSourceGateAction;
  allowed: boolean;
  requiresOverride: boolean;
  overridden: boolean;
  blockedReasons: string[];
  warnings: string[];
  sourceSummary: {
    usedDocumentCount: number;
    missingDocumentCount: number;
    pendingValidationCount: number;
    externalValidationGapCount: number;
    validatedLawReferenceCount: number;
    validatedCaseLawReferenceCount: number;
    requiresHumanReview: boolean;
  };
  override: {
    approved: boolean;
    reason: string | null;
    actorId: string | null;
  } | null;
};

export class LegalDraftSourceGateError extends Error {
  decision: LegalDraftSourceGateDecision;

  constructor(decision: LegalDraftSourceGateDecision) {
    super(buildLegalDraftSourceGateMessage(decision));
    this.name = "LegalDraftSourceGateError";
    this.decision = decision;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRecord(value: unknown) {
  return isRecord(value) ? value : {};
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getStringArray(value: unknown) {
  return getArray(value)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function getNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function countReferences(value: unknown) {
  return getArray(value).filter((item) => {
    if (typeof item === "string") return item.trim().length > 0;
    if (!isRecord(item)) return false;
    return Boolean(item.citation || item.title || item.source_url || item.url);
  }).length;
}

function normalizeReason(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractSourceSummary(metadata: Record<string, unknown> | null | undefined) {
  const safeMetadata = getRecord(metadata);
  const sourcePack = getRecord(safeMetadata.source_pack);
  const citationChecklist = getRecord(safeMetadata.citation_checklist);
  const validatedExternalSources = getRecord(sourcePack.validated_external_sources);
  const pendingValidationCount = Math.max(
    getNumber(safeMetadata.pending_validation_count),
    getStringArray(safeMetadata.pending_validations).length,
    getStringArray(citationChecklist.pending_validations).length,
  );
  const externalValidationGapCount = Math.max(
    getNumber(safeMetadata.external_validation_gap_count),
    getStringArray(safeMetadata.external_validation_gaps).length,
    getStringArray(sourcePack.external_validation_gaps).length,
  );

  return {
    usedDocumentCount: getArray(safeMetadata.used_documents).length,
    missingDocumentCount: getStringArray(safeMetadata.missing_documents).length,
    pendingValidationCount,
    externalValidationGapCount,
    validatedLawReferenceCount: Math.max(
      countReferences(safeMetadata.validated_law_references),
      countReferences(validatedExternalSources.law_references),
    ),
    validatedCaseLawReferenceCount: Math.max(
      countReferences(safeMetadata.validated_case_law_references),
      countReferences(validatedExternalSources.case_law_references),
    ),
    requiresHumanReview: getBoolean(safeMetadata.requires_human_review, false),
  };
}

function warningSignals(metadata: Record<string, unknown> | null | undefined) {
  const safeMetadata = getRecord(metadata);
  return getStringArray(safeMetadata.warnings)
    .filter((warning) => /validac|fonte|precedente|jurisprud|sumula|s[uú]mula|lei|documento|pendente|sem base/i.test(warning))
    .slice(0, 8);
}

function buildReasons(params: {
  action: LegalDraftSourceGateAction;
  summary: ReturnType<typeof extractSourceSummary>;
  warnings: string[];
}) {
  const reasons: string[] = [];

  if (params.summary.pendingValidationCount > 0) {
    reasons.push(`Existem ${params.summary.pendingValidationCount} validacao(oes) externa(s) pendente(s).`);
  }

  if (params.summary.externalValidationGapCount > 0) {
    reasons.push(`Existem ${params.summary.externalValidationGapCount} lacuna(s) externa(s) de fonte.`);
  }

  if (params.action !== "approve" && params.summary.missingDocumentCount > 0) {
    reasons.push(`Existem ${params.summary.missingDocumentCount} documento(s) faltante(s) para a peca final.`);
  }

  if (params.action !== "approve" && params.summary.requiresHumanReview) {
    reasons.push("A minuta ainda esta marcada como exigindo revisao humana.");
  }

  if (params.action !== "approve" && params.warnings.length > 0) {
    reasons.push("A minuta contem alerta de fonte, precedente ou documento pendente.");
  }

  return reasons;
}

export function buildLegalDraftSourceGateMessage(decision: LegalDraftSourceGateDecision) {
  const actionLabel = decision.action === "approve"
    ? "aprovar"
    : decision.action === "publish"
      ? "publicar"
      : "publicar no Drive";
  const reasons = decision.blockedReasons.length > 0
    ? decision.blockedReasons.join(" ")
    : "Fontes juridicas ainda nao estao prontas.";
  return `Nao foi possivel ${actionLabel} a peca: ${reasons} Use override explicito com justificativa humana para prosseguir.`;
}

export function evaluateLegalDraftSourceGate(params: {
  action: LegalDraftSourceGateAction;
  metadata?: Record<string, unknown> | null;
  override?: LegalDraftSourceGateOverride | null;
}): LegalDraftSourceGateDecision {
  const sourceSummary = extractSourceSummary(params.metadata);
  const warnings = warningSignals(params.metadata);
  const blockedReasons = buildReasons({
    action: params.action,
    summary: sourceSummary,
    warnings,
  });
  const overrideReason = normalizeReason(params.override?.reason);
  const overrideApproved = params.override?.approved === true && overrideReason.length >= 8;
  const requiresOverride = blockedReasons.length > 0;
  const allowed = !requiresOverride || overrideApproved;

  return {
    action: params.action,
    allowed,
    requiresOverride,
    overridden: requiresOverride && overrideApproved,
    blockedReasons,
    warnings,
    sourceSummary,
    override: params.override?.approved
      ? {
          approved: overrideApproved,
          reason: overrideReason || null,
          actorId: params.override.actorId || null,
        }
      : null,
  };
}

export function assertLegalDraftSourceGate(params: {
  action: LegalDraftSourceGateAction;
  metadata?: Record<string, unknown> | null;
  override?: LegalDraftSourceGateOverride | null;
}) {
  const decision = evaluateLegalDraftSourceGate(params);
  if (!decision.allowed) {
    throw new LegalDraftSourceGateError(decision);
  }
  return decision;
}
