import type {
  OfficeOperationalMethodology,
  OfficeOperationalMethodologyStatus,
} from "@/lib/setup/office-setup-conversation";

export type TenantOperationalMethodologyActivation =
  | "active_internal"
  | "supervised_suggestion"
  | "rejected"
  | "missing";

export type TenantOperationalAreaMethod = {
  area: string;
  intakeQuestions: string[];
  requiredDocuments: string[];
  phases: string[];
  documentStructure: string[];
  ownerTeam: string | null;
  validationStatus: "needs_area_review" | "validated";
  nextReviewQuestion: string | null;
};

export type TenantOperationalMethodologyContext = {
  source: "tenant_settings.ai_features.operational_methodology";
  status: OfficeOperationalMethodologyStatus | "missing";
  activation: TenantOperationalMethodologyActivation;
  officeName: string | null;
  practiceAreas: string[];
  methodologyBaseUsed: boolean;
  defaultRequiredDocuments: string[];
  areaMethods: TenantOperationalAreaMethod[];
  pendingImprovementRules: Array<{
    id: string;
    title: string;
    suggestion: string;
    source: string;
    requiresApproval: boolean;
  }>;
  internetPolicy: {
    enabled: boolean;
    noAutoActivation: boolean;
    usage: string | null;
    allowedSources: string[];
  };
  canGuideInternalDecisions: boolean;
  requiresHumanReview: boolean;
  reviewReasons: string[];
};

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function cleanText(value: unknown) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.map(cleanText).filter(Boolean) as string[]
    : [];
}

function uniqueList(values: string[]) {
  return Array.from(new Set(values.map((item) => item.trim()).filter(Boolean)));
}

function resolveActivation(status: TenantOperationalMethodologyContext["status"]): TenantOperationalMethodologyActivation {
  if (status === "approved") return "active_internal";
  if (status === "draft" || status === "recommended") return "supervised_suggestion";
  if (status === "rejected") return "rejected";
  return "missing";
}

function normalizeAreaMethod(value: unknown): TenantOperationalAreaMethod | null {
  const record = asRecord(value);
  const area = cleanText(record?.area);
  if (!record || !area) return null;

  return {
    area,
    intakeQuestions: stringList(record.intake_questions),
    requiredDocuments: stringList(record.required_documents),
    phases: stringList(record.phases),
    documentStructure: stringList(record.document_structure),
    ownerTeam: cleanText(record.owner_team),
    validationStatus: record.validation_status === "validated" ? "validated" : "needs_area_review",
    nextReviewQuestion: cleanText(record.next_review_question),
  };
}

function buildReviewReasons(params: {
  status: TenantOperationalMethodologyContext["status"];
  areaMethods: TenantOperationalAreaMethod[];
  pendingRules: TenantOperationalMethodologyContext["pendingImprovementRules"];
  methodologyBaseUsed: boolean;
}) {
  const reasons = [
    params.status === "missing" ? "operational_methodology_missing" : null,
    params.status === "draft" ? "methodology_still_draft" : null,
    params.status === "recommended" ? "methodology_recommended_not_approved" : null,
    params.status === "rejected" ? "methodology_rejected" : null,
    params.methodologyBaseUsed && params.status !== "approved" ? "methodology_base_requires_tenant_validation" : null,
    params.areaMethods.some((item) => item.validationStatus !== "validated")
      ? "area_methods_need_review"
      : null,
    params.pendingRules.some((item) => item.requiresApproval)
      ? "methodology_improvement_requires_approval"
      : null,
  ];

  return uniqueList(reasons.filter(Boolean) as string[]);
}

export function buildTenantOperationalMethodologyContext(
  methodology?: OfficeOperationalMethodology | null,
): TenantOperationalMethodologyContext {
  const record = asRecord(methodology);
  const status = record?.status === "approved"
    || record?.status === "recommended"
    || record?.status === "draft"
    || record?.status === "rejected"
    ? record.status as OfficeOperationalMethodologyStatus
    : "missing";
  const identity = asRecord(record?.identity);
  const intake = asRecord(record?.intake);
  const internetPolicy = asRecord(record?.internet_policy);
  const areaMethods = Array.isArray(record?.area_methods)
    ? record.area_methods.map(normalizeAreaMethod).filter(Boolean) as TenantOperationalAreaMethod[]
    : [];
  const pendingImprovementRules = Array.isArray(record?.improvement_rules)
    ? record.improvement_rules
      .map((item: unknown) => {
        const rule = asRecord(item);
        if (!rule || rule.status === "approved" || rule.status === "rejected") return null;
        const id = cleanText(rule.id);
        const title = cleanText(rule.title);
        const suggestion = cleanText(rule.suggestion);
        if (!id || !title || !suggestion) return null;
        return {
          id,
          title,
          suggestion,
          source: cleanText(rule.source) || "tenant_methodology",
          requiresApproval: rule.requires_approval !== false,
        };
      })
      .filter(Boolean) as TenantOperationalMethodologyContext["pendingImprovementRules"]
    : [];
  const methodologyBaseUsed = intake?.methodology_base_used === true;
  const reviewReasons = buildReviewReasons({
    status,
    areaMethods,
    pendingRules: pendingImprovementRules,
    methodologyBaseUsed,
  });
  const activation = resolveActivation(status);

  return {
    source: "tenant_settings.ai_features.operational_methodology",
    status,
    activation,
    officeName: cleanText(identity?.office_name),
    practiceAreas: stringList(identity?.practice_areas),
    methodologyBaseUsed,
    defaultRequiredDocuments: stringList(intake?.required_documents_by_case),
    areaMethods,
    pendingImprovementRules,
    internetPolicy: {
      enabled: internetPolicy?.enabled === true,
      noAutoActivation: internetPolicy?.no_auto_activation !== false,
      usage: cleanText(internetPolicy?.usage),
      allowedSources: stringList(internetPolicy?.allowed_sources),
    },
    canGuideInternalDecisions: activation === "active_internal",
    requiresHumanReview: reviewReasons.length > 0 || activation !== "active_internal",
    reviewReasons,
  };
}

function normalizeArea(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findTenantOperationalAreaMethod(
  context: TenantOperationalMethodologyContext,
  area?: string | null,
) {
  const target = normalizeArea(String(area || ""));
  if (!target) return null;

  return context.areaMethods.find((method) => {
    const normalized = normalizeArea(method.area);
    return normalized === target || normalized.includes(target) || target.includes(normalized);
  }) || null;
}

export function summarizeTenantOperationalMethodologyContext(
  context: TenantOperationalMethodologyContext,
  params?: { area?: string | null; maxDocuments?: number },
) {
  if (context.status === "missing") return "";

  const areaMethod = findTenantOperationalAreaMethod(context, params?.area);
  const documents = uniqueList([
    ...(areaMethod?.requiredDocuments || []),
    ...context.defaultRequiredDocuments,
  ]).slice(0, params?.maxDocuments || 8);
  const phases = areaMethod?.phases?.slice(0, 6) || [];
  const parts = [
    `status=${context.status}`,
    `ativacao=${context.activation}`,
    context.officeName ? `escritorio=${context.officeName}` : null,
    context.practiceAreas.length ? `areas=${context.practiceAreas.join(", ")}` : null,
    areaMethod ? `area_metodo=${areaMethod.area}` : null,
    documents.length ? `documentos=${documents.join(", ")}` : null,
    phases.length ? `fases=${phases.join(" > ")}` : null,
    context.internetPolicy.noAutoActivation ? "internet apenas auditavel, sem ativacao automatica" : null,
    context.reviewReasons.length ? `revisao=${context.reviewReasons.join(", ")}` : null,
  ];

  return parts.filter(Boolean).join(" | ");
}
