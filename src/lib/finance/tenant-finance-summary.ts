import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRevenueReconciliationReport,
  type RevenueReconciliationReport,
  type RevenueProcessTaskRow,
} from "./revenue-reconciliation";

const PAID_STATUS_TEXTS = new Set([
  "pago",
  "paga",
  "recebido",
  "recebida",
  "confirmado",
  "confirmada",
  "paid",
  "received",
  "confirmed",
  "payment_received",
  "payment_confirmed",
  "received_in_cash",
]);

const OPEN_STATUS_TEXTS = new Set([
  "pendente",
  "pending",
  "aguardando",
  "aberto",
  "aberta",
  "open",
  "overdue",
  "vencido",
  "vencida",
]);

export type TenantFinanceFinancialRow = {
  id?: string | null;
  external_id?: string | null;
  amount?: number | string | null;
  status?: string | null;
  due_date?: string | null;
  type?: string | null;
  description?: string | null;
  source?: string | null;
  reference_date?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type TenantFinanceBrainArtifactRow = {
  id?: string | null;
  artifact_type?: string | null;
  title?: string | null;
  task_id?: string | null;
  step_id?: string | null;
  storage_url?: string | null;
  source_module?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
};

export type TenantFinanceBucket = {
  amount: number;
  count: number;
};

export type TenantFinanceCollectionPlan = {
  id: string;
  title: string;
  createdAt: string | null;
  clientName: string | null;
  amount: number | null;
  daysOverdue: number | null;
  dueDate: string | null;
  stage: string | null;
  priority: string | null;
  nextBestAction: string | null;
  requiresHumanApproval: boolean;
  externalSideEffectsBlocked: boolean;
};

export type TenantFinanceSummary = {
  tenantId: string;
  generatedAt: string;
  financials: {
    received: TenantFinanceBucket;
    forecast: TenantFinanceBucket;
    overdue: TenantFinanceBucket;
    delinquency: TenantFinanceBucket & {
      rate: number;
    };
    openCharges: TenantFinanceBucket;
    expenses: {
      fixed: TenantFinanceBucket;
      marketing: TenantFinanceBucket;
    };
  };
  collectionsFollowup: {
    source: "brain_artifacts";
    available: boolean;
    totalPlans: number;
    highPriorityPlans: number;
    recentPlans: TenantFinanceCollectionPlan[];
  };
  revenueReconciliation: {
    source: "financials+brain_artifacts+process_tasks";
    available: boolean;
    report: RevenueReconciliationReport;
  };
};

type LoadTenantFinanceSummaryInput = {
  supabase: SupabaseClient;
  tenantId: string;
  now?: Date;
};

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function compactText(value: unknown, fallback = "") {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 240) : fallback;
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function money(value: unknown) {
  return numberOrNull(value) ?? 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRate(value: number) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function parseLocalDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function rowText(row: TenantFinanceFinancialRow) {
  return normalizeText(`${row.type || ""} ${row.description || ""} ${row.source || ""} ${JSON.stringify(row.metadata || {})}`);
}

function isExpenseRow(row: TenantFinanceFinancialRow) {
  const type = normalizeText(row.type);
  return ["despesa", "expense", "saida", "custo", "cost"].some((keyword) => type.includes(keyword)) || money(row.amount) < 0;
}

function isMarketingExpense(row: TenantFinanceFinancialRow) {
  return isExpenseRow(row) && /(marketing|ads|meta|facebook|instagram|google|trafego|campanha|anuncio)/.test(rowText(row));
}

function isPaidRevenue(row: TenantFinanceFinancialRow) {
  if (isExpenseRow(row)) return false;

  const status = normalizeText(row.status);
  if (PAID_STATUS_TEXTS.has(status)) return true;
  if (OPEN_STATUS_TEXTS.has(status)) return false;

  const type = normalizeText(row.type);
  const source = normalizeText(row.source);
  return type.includes("receita") && Boolean(row.reference_date || source.includes("asaas"));
}

function isOpenRevenue(row: TenantFinanceFinancialRow) {
  return !isExpenseRow(row) && !isPaidRevenue(row);
}

function bucketFromRows(rows: TenantFinanceFinancialRow[], amountMapper = (row: TenantFinanceFinancialRow) => money(row.amount)): TenantFinanceBucket {
  return {
    amount: roundMoney(rows.reduce((sum, row) => sum + amountMapper(row), 0)),
    count: rows.length,
  };
}

function isCollectionsFollowupArtifact(row: TenantFinanceBrainArtifactRow) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const artifactType = normalizeText(row.artifact_type);
  const sourceModule = normalizeText(row.source_module);

  return (
    /(collections?|cobranca|cobrancas|inadimplencia).*(followup|follow_up|follow-up|plano)/.test(artifactType) ||
    artifactType === "collections_followup" ||
    artifactType === "collection_followup" ||
    (sourceModule.includes("finance") && Boolean(metadata.collection_stage || metadata.collection_priority || metadata.next_best_action))
  );
}

function normalizeCollectionPlan(row: TenantFinanceBrainArtifactRow): TenantFinanceCollectionPlan {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};

  return {
    id: compactText(row.id, "artifact-sem-id"),
    title: compactText(row.title, "Plano de cobranca"),
    createdAt: row.created_at || null,
    clientName: compactText(metadata.client_name, "") || null,
    amount: numberOrNull(metadata.amount),
    daysOverdue: numberOrNull(metadata.days_overdue),
    dueDate: compactText(metadata.due_date, "") || null,
    stage: compactText(metadata.collection_stage, "") || null,
    priority: compactText(metadata.collection_priority, "") || null,
    nextBestAction: compactText(metadata.next_best_action, "") || null,
    requiresHumanApproval: metadata.requires_human_approval === true || metadata.requires_human_action === true,
    externalSideEffectsBlocked: metadata.external_side_effects_blocked !== false,
  };
}

export function buildTenantFinanceSummaryFromRows(input: {
  tenantId: string;
  financialRows?: TenantFinanceFinancialRow[] | null;
  brainArtifacts?: TenantFinanceBrainArtifactRow[] | null;
  processTasks?: RevenueProcessTaskRow[] | null;
  brainArtifactsAvailable?: boolean;
  processTasksAvailable?: boolean;
  now?: Date;
}): TenantFinanceSummary {
  const now = input.now || new Date();
  const today = startOfLocalDay(now);
  const financialRows = Array.isArray(input.financialRows) ? input.financialRows : [];

  const receivedRows = financialRows.filter(isPaidRevenue);
  const openRows = financialRows.filter(isOpenRevenue);
  const overdueRows = openRows.filter((row) => {
    const dueDate = parseLocalDate(row.due_date);
    return Boolean(dueDate && dueDate < today);
  });
  const forecastRows = openRows.filter((row) => {
    const dueDate = parseLocalDate(row.due_date);
    return !dueDate || dueDate >= today;
  });
  const marketingExpenseRows = financialRows.filter(isMarketingExpense);
  const fixedExpenseRows = financialRows.filter((row) => isExpenseRow(row) && !isMarketingExpense(row));
  const openCharges = bucketFromRows(openRows);
  const overdue = bucketFromRows(overdueRows);
  const delinquencyRate = openCharges.amount > 0 ? roundRate((overdue.amount / openCharges.amount) * 100) : 0;

  const collectionPlans = (input.brainArtifacts || [])
    .filter(isCollectionsFollowupArtifact)
    .map(normalizeCollectionPlan);
  const reconciliationReport = buildRevenueReconciliationReport({
    generatedAt: now.toISOString(),
    financials: financialRows
      .filter((row) => row.id)
      .map((row) => ({
        id: String(row.id),
        external_id: row.external_id,
        status: row.status,
        type: row.type,
        description: row.description,
        reference_date: row.reference_date,
        amount: row.amount,
        metadata: row.metadata,
      })),
    artifacts: (input.brainArtifacts || [])
      .filter((row) => row.id && row.artifact_type)
      .map((row) => ({
        id: String(row.id),
        artifact_type: String(row.artifact_type),
        title: row.title,
        task_id: row.task_id,
        step_id: row.step_id,
        storage_url: row.storage_url,
        metadata: row.metadata,
        created_at: row.created_at,
      })),
    processTasks: input.processTasks || [],
  });

  return {
    tenantId: input.tenantId,
    generatedAt: now.toISOString(),
    financials: {
      received: bucketFromRows(receivedRows),
      forecast: bucketFromRows(forecastRows),
      overdue,
      delinquency: {
        ...overdue,
        rate: delinquencyRate,
      },
      openCharges,
      expenses: {
        fixed: bucketFromRows(fixedExpenseRows, (row) => Math.abs(money(row.amount))),
        marketing: bucketFromRows(marketingExpenseRows, (row) => Math.abs(money(row.amount))),
      },
    },
    collectionsFollowup: {
      source: "brain_artifacts",
      available: input.brainArtifactsAvailable !== false,
      totalPlans: collectionPlans.length,
      highPriorityPlans: collectionPlans.filter((plan) => normalizeText(plan.priority) === "high").length,
      recentPlans: collectionPlans.slice(0, 5),
    },
    revenueReconciliation: {
      source: "financials+brain_artifacts+process_tasks",
      available: input.brainArtifactsAvailable !== false && input.processTasksAvailable !== false,
      report: reconciliationReport,
    },
  };
}

export async function loadTenantFinanceSummary(input: LoadTenantFinanceSummaryInput) {
  const [financialResult, artifactsResult, processTasksResult] = await Promise.all([
    input.supabase
      .from("financials")
      .select("id, amount, status, due_date, type, description, source, reference_date, external_id, metadata")
      .eq("tenant_id", input.tenantId),
    input.supabase
      .from("brain_artifacts")
      .select("id, artifact_type, title, task_id, step_id, storage_url, source_module, metadata, created_at")
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .limit(50),
    input.supabase
      .from("process_tasks")
      .select("id, title, client_name, value, tags, source, client_id, created_at")
      .eq("tenant_id", input.tenantId)
      .or("source.eq.revenue_to_case,tags.cs.{revenue_to_case}")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (financialResult.error) {
    throw financialResult.error;
  }

  return buildTenantFinanceSummaryFromRows({
    tenantId: input.tenantId,
    financialRows: financialResult.data as TenantFinanceFinancialRow[] | null,
    brainArtifacts: artifactsResult.error ? [] : artifactsResult.data as TenantFinanceBrainArtifactRow[] | null,
    processTasks: processTasksResult.error ? [] : processTasksResult.data as RevenueProcessTaskRow[] | null,
    brainArtifactsAvailable: !artifactsResult.error,
    processTasksAvailable: !processTasksResult.error,
    now: input.now,
  });
}
