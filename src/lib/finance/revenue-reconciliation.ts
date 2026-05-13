export type RevenueReconciliationStatus = "matched" | "partial" | "blocked" | "unmatched";

export type RevenueFinancialRow = {
  id: string;
  external_id?: string | null;
  status?: string | null;
  type?: string | null;
  description?: string | null;
  reference_date?: string | null;
  amount?: number | string | null;
  value?: number | string | null;
  metadata?: Record<string, unknown> | null;
};

export type RevenueArtifactRow = {
  id: string;
  artifact_type: string;
  title?: string | null;
  task_id?: string | null;
  step_id?: string | null;
  storage_url?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type RevenueProcessTaskRow = {
  id: string;
  title?: string | null;
  client_name?: string | null;
  value?: number | string | null;
  tags?: string[] | null;
  source?: string | null;
  client_id?: string | null;
  case_id?: string | null;
  task_context?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type RevenueReconciliationInput = {
  financials?: RevenueFinancialRow[] | null;
  artifacts?: RevenueArtifactRow[] | null;
  processTasks?: RevenueProcessTaskRow[] | null;
  generatedAt?: string | null;
};

export type RevenueReconciliationItem = {
  key: string;
  status: RevenueReconciliationStatus;
  label: string;
  clientName: string | null;
  amount: number | null;
  paymentId: string | null;
  crmTaskId: string | null;
  financialId: string | null;
  billingArtifactId: string | null;
  revenueArtifactId: string | null;
  revenuePlanArtifactId: string | null;
  processTaskId: string | null;
  caseId: string | null;
  evidence: string[];
  warnings: string[];
  nextBestAction: string;
};

export type RevenueReconciliationReport = {
  generatedAt: string;
  totals: {
    financialCount: number;
    billingArtifactCount: number;
    revenueArtifactCount: number;
    processTaskCount: number;
    matched: number;
    partial: number;
    blocked: number;
    unmatched: number;
    receivedRevenue: number;
    openedCaseRevenue: number;
  };
  items: RevenueReconciliationItem[];
  nextBestActions: string[];
};

type ReconciliationBucket = {
  key: string;
  financials: RevenueFinancialRow[];
  billingArtifacts: RevenueArtifactRow[];
  revenueArtifacts: RevenueArtifactRow[];
  revenuePlanArtifacts: RevenueArtifactRow[];
  processTasks: RevenueProcessTaskRow[];
};

const PAID_STATUS_PATTERN = /paid|pago|recebido|received|confirmed|confirmado|settled/i;
const REVENUE_ARTIFACT_TYPES = new Set(["revenue_case_opening"]);
const REVENUE_PLAN_ARTIFACT_TYPES = new Set(["revenue_flow_plan", "revenue_to_case_plan"]);

function cleanText(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizeText(value: unknown) {
  return cleanText(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase() || "";
}

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const raw = value.replace(/[R$\s]/g, "").trim();
    const lastDot = raw.lastIndexOf(".");
    const lastComma = raw.lastIndexOf(",");
    const normalized = lastDot >= 0 && lastComma >= 0
      ? lastComma > lastDot
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.replace(/,/g, "")
      : lastComma >= 0
        ? raw.replace(/\./g, "").replace(",", ".")
        : /^\d{1,3}(?:\.\d{3})+$/.test(raw)
          ? raw.replace(/\./g, "")
          : raw;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getMetadataValue(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (value !== undefined && value !== null && cleanText(value)) return cleanText(value);
  }
  return null;
}

function getMetadataNumber(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = getNumber(metadata?.[key]);
    if (value !== null) return value;
  }
  return null;
}

function isPaidFinancial(row: RevenueFinancialRow) {
  const status = normalizeText(row.status);
  const type = normalizeText(row.type);
  if (type && !/receita|revenue|income|entrada/.test(type)) return false;
  return PAID_STATUS_PATTERN.test(status);
}

function getFinancialPaymentId(row: RevenueFinancialRow) {
  return cleanText(row.external_id) || getMetadataValue(row.metadata, [
    "payment_id",
    "cobranca_id",
    "billing_id",
    "asaas_payment_id",
    "external_id",
  ]);
}

function getArtifactPaymentId(row: RevenueArtifactRow) {
  return getMetadataValue(row.metadata, [
    "payment_id",
    "cobranca_id",
    "billing_id",
    "asaas_payment_id",
    "external_id",
  ]);
}

function getCrmTaskId(metadata: Record<string, unknown> | null | undefined) {
  return getMetadataValue(metadata, ["crm_task_id", "crmTaskId", "task_id"]);
}

function getProcessTaskId(metadata: Record<string, unknown> | null | undefined) {
  return getMetadataValue(metadata, ["process_task_id", "processTaskId"]);
}

function getCaseId(metadata: Record<string, unknown> | null | undefined) {
  return getMetadataValue(metadata, ["case_id", "caseId"]);
}

function getClientNameFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  return getMetadataValue(metadata, [
    "client_name",
    "nome_cliente",
    "customer_name",
    "lead_name",
    "signer_name",
  ]);
}

function getArtifactAmount(row: RevenueArtifactRow) {
  return getMetadataNumber(row.metadata, ["valor", "amount", "value", "payment_value", "total_value"]);
}

function getFinancialAmount(row: RevenueFinancialRow) {
  return getNumber(row.amount) ?? getNumber(row.value) ?? getMetadataNumber(row.metadata, ["valor", "amount", "value"]);
}

function getProcessAmount(row: RevenueProcessTaskRow) {
  return getNumber(row.value) ?? getMetadataNumber(row.metadata, ["valor", "amount", "value"]);
}

function compactKey(parts: Array<string | null>) {
  const cleaned = parts.map((part) => normalizeText(part)).filter(Boolean);
  return cleaned.length > 0 ? cleaned.join(":") : null;
}

function getFallbackEntityKey(params: {
  clientName: string | null;
  amount: number | null;
  fallbackId: string;
}) {
  return compactKey([
    params.clientName,
    params.amount === null ? null : params.amount.toFixed(2),
  ]) || params.fallbackId;
}

function getFinancialKeys(row: RevenueFinancialRow) {
  const paymentId = getFinancialPaymentId(row);
  const crmTaskId = getCrmTaskId(row.metadata);
  const clientName = getClientNameFromMetadata(row.metadata) || cleanText(row.description);
  const amount = getFinancialAmount(row);
  return uniqueStrings([
    compactKey([paymentId]),
    compactKey([crmTaskId]),
    getFallbackEntityKey({
      clientName,
      amount,
      fallbackId: `financial:${row.id}`,
    }),
  ]);
}

function getArtifactKeys(row: RevenueArtifactRow) {
  const paymentId = getArtifactPaymentId(row);
  const crmTaskId = getCrmTaskId(row.metadata);
  const processTaskId = getProcessTaskId(row.metadata);
  const clientName = getClientNameFromMetadata(row.metadata) || cleanText(row.title);
  const amount = getArtifactAmount(row);
  return uniqueStrings([
    compactKey([paymentId]),
    compactKey([crmTaskId]),
    compactKey([processTaskId]),
    getFallbackEntityKey({
      clientName,
      amount,
      fallbackId: `artifact:${row.id}`,
    }),
  ]);
}

function getProcessTaskKeys(row: RevenueProcessTaskRow) {
  const crmTaskId = getCrmTaskId(row.task_context) || getCrmTaskId(row.metadata);
  const paymentId = getMetadataValue(row.task_context, ["payment_id", "cobranca_id"]) ||
    getMetadataValue(row.metadata, ["payment_id", "cobranca_id"]);
  const amount = getProcessAmount(row);
  return uniqueStrings([
    compactKey([paymentId]),
    compactKey([crmTaskId]),
    getFallbackEntityKey({
      clientName: cleanText(row.client_name) || cleanText(row.title),
      amount,
      fallbackId: `process:${row.id}`,
    }),
  ]);
}

function ensureBucket(buckets: Map<string, ReconciliationBucket>, key: string) {
  const existing = buckets.get(key);
  if (existing) return existing;
  const bucket: ReconciliationBucket = {
    key,
    financials: [],
    billingArtifacts: [],
    revenueArtifacts: [],
    revenuePlanArtifacts: [],
    processTasks: [],
  };
  buckets.set(key, bucket);
  return bucket;
}

function mergeBuckets(
  buckets: Map<string, ReconciliationBucket>,
  aliases: Map<string, string>,
  targetKey: string,
  sourceKey: string
) {
  if (targetKey === sourceKey) return;
  const source = buckets.get(sourceKey);
  if (!source) return;
  const target = ensureBucket(buckets, targetKey);
  target.financials.push(...source.financials);
  target.billingArtifacts.push(...source.billingArtifacts);
  target.revenueArtifacts.push(...source.revenueArtifacts);
  target.revenuePlanArtifacts.push(...source.revenuePlanArtifacts);
  target.processTasks.push(...source.processTasks);
  buckets.delete(sourceKey);

  for (const [alias, mappedKey] of Array.from(aliases.entries())) {
    if (mappedKey === sourceKey) aliases.set(alias, targetKey);
  }
}

function addToBucket(
  buckets: Map<string, ReconciliationBucket>,
  aliases: Map<string, string>,
  keys: string[],
  apply: (bucket: ReconciliationBucket) => void
) {
  const usableKeys = uniqueStrings(keys);
  const primaryKey = usableKeys.map((key) => aliases.get(key)).find(Boolean) || usableKeys[0];
  if (!primaryKey) return;

  for (const key of usableKeys) {
    const mappedKey = aliases.get(key);
    if (mappedKey && mappedKey !== primaryKey) {
      mergeBuckets(buckets, aliases, primaryKey, mappedKey);
    }
  }

  for (const key of usableKeys) {
    aliases.set(key, primaryKey);
  }

  apply(ensureBucket(buckets, primaryKey));
}

function firstValue<T>(items: T[], getter: (item: T) => string | null) {
  for (const item of items) {
    const value = getter(item);
    if (value) return value;
  }
  return null;
}

function firstNumber<T>(items: T[], getter: (item: T) => number | null) {
  for (const item of items) {
    const value = getter(item);
    if (value !== null) return value;
  }
  return null;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(cleanText(value)))));
}

function summarizeBucket(bucket: ReconciliationBucket): RevenueReconciliationItem {
  const financial = bucket.financials[0] || null;
  const billingArtifact = bucket.billingArtifacts[0] || null;
  const revenueArtifact = bucket.revenueArtifacts[0] || null;
  const revenuePlanArtifact = bucket.revenuePlanArtifacts[0] || null;
  const processTask = bucket.processTasks[0] || null;
  const paymentId = firstValue(bucket.financials, getFinancialPaymentId) ||
    firstValue([...bucket.billingArtifacts, ...bucket.revenueArtifacts], getArtifactPaymentId);
  const crmTaskId = firstValue(bucket.billingArtifacts, (row) => getCrmTaskId(row.metadata)) ||
    firstValue(bucket.revenuePlanArtifacts, (row) => getCrmTaskId(row.metadata)) ||
    firstValue(bucket.financials, (row) => getCrmTaskId(row.metadata)) ||
    firstValue(bucket.processTasks, (row) => getCrmTaskId(row.task_context) || getCrmTaskId(row.metadata));
  const clientName = firstValue(bucket.billingArtifacts, (row) => getClientNameFromMetadata(row.metadata)) ||
    firstValue(bucket.revenuePlanArtifacts, (row) => getClientNameFromMetadata(row.metadata)) ||
    firstValue(bucket.revenueArtifacts, (row) => getClientNameFromMetadata(row.metadata)) ||
    firstValue(bucket.financials, (row) => getClientNameFromMetadata(row.metadata)) ||
    cleanText(processTask?.client_name) ||
    cleanText(processTask?.title) ||
    null;
  const amount = firstNumber(bucket.financials, getFinancialAmount) ??
    firstNumber(bucket.billingArtifacts, getArtifactAmount) ??
    firstNumber(bucket.revenuePlanArtifacts, getArtifactAmount) ??
    firstNumber(bucket.processTasks, getProcessAmount);
  const caseId = getCaseId(revenueArtifact?.metadata) || cleanText(processTask?.case_id) || cleanText(processTask?.client_id);
  const hasConfirmedRevenue = bucket.financials.some(isPaidFinancial);
  const hasBilling = bucket.billingArtifacts.length > 0;
  const hasCaseLink = bucket.revenueArtifacts.length > 0 || bucket.processTasks.length > 0;

  const evidence = uniqueStrings([
    financial ? "financials" : null,
    hasConfirmedRevenue ? "financials:paid" : null,
    billingArtifact ? "brain_artifacts:asaas_billing" : null,
    revenuePlanArtifact ? "brain_artifacts:revenue_flow_plan" : null,
    revenueArtifact ? "brain_artifacts:revenue_case_opening" : null,
    processTask ? "process_tasks" : null,
  ]);

  const warnings = uniqueStrings([
    hasConfirmedRevenue && !hasBilling ? "Pagamento confirmado sem artifact asaas_billing relacionado." : null,
    hasConfirmedRevenue && hasBilling && !hasCaseLink ? "Pagamento confirmado sem process_task/caso vinculado." : null,
    hasBilling && !financial ? "Artifact de cobranca sem lancamento financials correspondente nesta amostra." : null,
    hasBilling && financial && !hasConfirmedRevenue ? "Lancamento financeiro ainda nao esta marcado como recebido/confirmado." : null,
  ]);

  let status: RevenueReconciliationStatus = "unmatched";
  if (hasConfirmedRevenue && hasBilling && hasCaseLink) {
    status = "matched";
  } else if (hasConfirmedRevenue && hasBilling && !hasCaseLink) {
    status = "blocked";
  } else if (evidence.length >= 2) {
    status = "partial";
  }

  const nextBestAction = status === "matched"
    ? "Manter trilha auditavel e validar checklist documental do caso."
    : status === "blocked"
      ? "Abrir/reparar o caso vinculado ao pagamento confirmado antes de marcar o ciclo como concluido."
      : status === "partial"
        ? "Completar o elo faltante entre financials, artifact Asaas e process_tasks."
        : "Investigar origem do registro antes de automatizar abertura de caso.";

  return {
    key: bucket.key,
    status,
    label: "revenue-to-case",
    clientName,
    amount,
    paymentId,
    crmTaskId,
    financialId: financial?.id || null,
    billingArtifactId: billingArtifact?.id || null,
    revenueArtifactId: revenueArtifact?.id || null,
    revenuePlanArtifactId: revenuePlanArtifact?.id || null,
    processTaskId: getProcessTaskId(revenueArtifact?.metadata) || processTask?.id || null,
    caseId,
    evidence,
    warnings,
    nextBestAction,
  };
}

export function buildRevenueReconciliationReport(input: RevenueReconciliationInput): RevenueReconciliationReport {
  const financials = Array.isArray(input.financials) ? input.financials : [];
  const artifacts = Array.isArray(input.artifacts) ? input.artifacts : [];
  const processTasks = Array.isArray(input.processTasks) ? input.processTasks : [];
  const buckets = new Map<string, ReconciliationBucket>();
  const aliases = new Map<string, string>();

  for (const financial of financials) {
    addToBucket(buckets, aliases, getFinancialKeys(financial), (bucket) => {
      bucket.financials.push(financial);
    });
  }

  for (const artifact of artifacts) {
    if (artifact.artifact_type === "asaas_billing") {
      addToBucket(buckets, aliases, getArtifactKeys(artifact), (bucket) => {
        bucket.billingArtifacts.push(artifact);
      });
    } else if (REVENUE_ARTIFACT_TYPES.has(artifact.artifact_type)) {
      addToBucket(buckets, aliases, getArtifactKeys(artifact), (bucket) => {
        bucket.revenueArtifacts.push(artifact);
      });
    } else if (REVENUE_PLAN_ARTIFACT_TYPES.has(artifact.artifact_type)) {
      addToBucket(buckets, aliases, getArtifactKeys(artifact), (bucket) => {
        bucket.revenuePlanArtifacts.push(artifact);
      });
    }
  }

  for (const processTask of processTasks) {
    addToBucket(buckets, aliases, getProcessTaskKeys(processTask), (bucket) => {
      bucket.processTasks.push(processTask);
    });
  }

  const items = Array.from(buckets.values())
    .map(summarizeBucket)
    .sort((a, b) => {
      const priority: Record<RevenueReconciliationStatus, number> = {
        blocked: 0,
        partial: 1,
        unmatched: 2,
        matched: 3,
      };
      return priority[a.status] - priority[b.status] || a.key.localeCompare(b.key);
    });

  const totals = {
    financialCount: financials.length,
    billingArtifactCount: artifacts.filter((artifact) => artifact.artifact_type === "asaas_billing").length,
    revenueArtifactCount: artifacts.filter((artifact) => REVENUE_ARTIFACT_TYPES.has(artifact.artifact_type)).length,
    processTaskCount: processTasks.length,
    matched: items.filter((item) => item.status === "matched").length,
    partial: items.filter((item) => item.status === "partial").length,
    blocked: items.filter((item) => item.status === "blocked").length,
    unmatched: items.filter((item) => item.status === "unmatched").length,
    receivedRevenue: financials.filter(isPaidFinancial).reduce((sum, row) => sum + (getFinancialAmount(row) ?? 0), 0),
    openedCaseRevenue: items
      .filter((item) => item.status === "matched")
      .reduce((sum, item) => sum + (item.amount ?? 0), 0),
  };

  const nextBestActions = uniqueStrings(items
    .filter((item) => item.status !== "matched")
    .slice(0, 5)
    .map((item) => item.nextBestAction));

  return {
    generatedAt: input.generatedAt || new Date().toISOString(),
    totals,
    items,
    nextBestActions,
  };
}

export function buildRevenueReconciliationArtifactMetadata(report: RevenueReconciliationReport) {
  return {
    summary: `Reconciliacao revenue-to-case: ${report.totals.matched} casado(s), ${report.totals.blocked} bloqueado(s), ${report.totals.partial} parcial(is).`,
    generated_at: report.generatedAt,
    totals: report.totals,
    blocked_items: report.items
      .filter((item) => item.status === "blocked")
      .map((item) => ({
        client_name: item.clientName,
        amount: item.amount,
        payment_id: item.paymentId,
        financial_id: item.financialId,
        billing_artifact_id: item.billingArtifactId,
        next_best_action: item.nextBestAction,
        warnings: item.warnings,
      })),
    next_best_actions: report.nextBestActions,
    requires_human_action: report.totals.blocked > 0 || report.totals.partial > 0,
    human_actions: report.nextBestActions,
  };
}
