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
  "inadimplente",
  "inadimplencia",
  "delinquent",
  "delinquency",
]);

export type TenantFinanceFinancialRow = {
  id?: string | null;
  case_id?: string | null;
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

export type TenantFinanceForecastBuckets = {
  dueIn7Days: TenantFinanceBucket;
  dueIn30Days: TenantFinanceBucket;
  future: TenantFinanceBucket;
  noDueDate: TenantFinanceBucket;
};

export type TenantFinanceOverdueAging = {
  days1To7: TenantFinanceBucket;
  days8To14: TenantFinanceBucket;
  days15To30: TenantFinanceBucket;
  days31Plus: TenantFinanceBucket;
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

export type TenantFinanceRiskItem = {
  key: string;
  label: string;
  clientName: string | null;
  caseId: string | null;
  openAmount: number;
  overdueAmount: number;
  forecastAmount: number;
  openCount: number;
  overdueCount: number;
  maxDaysOverdue: number;
  oldestDueDate: string | null;
  riskLevel: "low" | "medium" | "high";
  nextBestAction: string;
};

export type TenantFinanceSalesRow = {
  id?: string | null;
  client_name?: string | null;
  ticket_total?: number | string | null;
  installments?: number | string | null;
  contract_date?: string | null;
  status?: string | null;
  professional_id?: string | null;
  professional_name?: string | null;
  commission_value?: number | string | null;
  fixed_salary?: number | string | null;
  estimated_earnings?: number | string | null;
  created_at?: string | null;
};

export type TenantFinanceCrmTaskRow = {
  id?: string | null;
  title?: string | null;
  value?: number | string | null;
  source?: string | null;
  stage_id?: string | null;
  created_at?: string | null;
  data_ultima_movimentacao?: string | null;
};

export type TenantFinanceCrmStageRow = {
  id?: string | null;
  name?: string | null;
  is_win?: boolean | null;
  is_loss?: boolean | null;
};

export type TenantFinanceCommercialStage = {
  stageId: string;
  stageName: string;
  amount: number;
  count: number;
  isWin: boolean;
  isLoss: boolean;
};

export type TenantFinanceCommercialOpportunity = {
  id: string;
  kind: "sale" | "crm";
  label: string;
  amount: number;
  stage: string;
  source: string | null;
  expectedDate: string | null;
  nextBestAction: string;
};

export type TenantFinanceProcessTaskRow = RevenueProcessTaskRow & {
  valor_causa?: number | string | null;
  demanda?: string | null;
  sector?: string | null;
  assigned_to?: string | null;
};

export type TenantFinanceUnitEconomicsConfidence = "high" | "medium" | "low";

export type TenantFinanceUnitEconomicsCase = {
  caseId: string;
  label: string;
  legalArea: string | null;
  receivedRevenue: number;
  openRevenue: number;
  directCosts: number;
  commissionCost: number;
  estimatedProfit: number;
  marginRate: number;
  confidence: TenantFinanceUnitEconomicsConfidence;
};

export type TenantFinanceUnitEconomicsLegalArea = {
  legalArea: string;
  caseCount: number;
  receivedRevenue: number;
  openRevenue: number;
  directCosts: number;
  commissionCost: number;
  estimatedProfit: number;
  marginRate: number;
};

export type TenantFinanceCommissionGroup = {
  label: string;
  amount: number;
  revenue: number;
  count: number;
  share: number;
};

export type TenantFinanceUnitEconomics = {
  grossRevenue: number;
  directCosts: number;
  commissions: number;
  estimatedProfit: number;
  estimatedMarginRate: number;
  byCase: TenantFinanceUnitEconomicsCase[];
  byLegalArea: TenantFinanceUnitEconomicsLegalArea[];
  commissionsBreakdown: {
    byOwner: TenantFinanceCommissionGroup[];
    byOrigin: TenantFinanceCommissionGroup[];
  };
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
    forecastBuckets: TenantFinanceForecastBuckets;
    overdueAging: TenantFinanceOverdueAging;
    riskItems: TenantFinanceRiskItem[];
    expenses: {
      fixed: TenantFinanceBucket;
      marketing: TenantFinanceBucket;
    };
  };
  commercialForecast: {
    source: "sales+crm_tasks";
    available: boolean;
    pipelineAmount: number;
    pendingContracts: TenantFinanceBucket;
    closedContracts: TenantFinanceBucket;
    lostAmount: number;
    byStage: TenantFinanceCommercialStage[];
    topOpportunities: TenantFinanceCommercialOpportunity[];
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
  unitEconomics: TenantFinanceUnitEconomics;
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

function daysBetween(from: Date, to: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = startOfLocalDay(from);
  const end = startOfLocalDay(to);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / msPerDay));
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

function metadataFor(row: TenantFinanceFinancialRow) {
  return row.metadata && typeof row.metadata === "object" ? row.metadata : {};
}

function metadataText(row: TenantFinanceFinancialRow, keys: string[]) {
  const metadata = metadataFor(row);
  for (const key of keys) {
    const value = compactText(metadata[key], "");
    if (value) return value;
  }
  return "";
}

function rowCaseId(row: TenantFinanceFinancialRow) {
  return compactText(row.case_id, "") || metadataText(row, ["case_id", "caseId"]) || null;
}

function rowClientId(row: TenantFinanceFinancialRow) {
  return metadataText(row, ["client_id", "clientId", "customer_id", "customerId"]) || null;
}

function rowClientName(row: TenantFinanceFinancialRow) {
  return metadataText(row, ["client_name", "nome_cliente", "customer_name", "lead_name", "signer_name"]) ||
    compactText(row.description, "") ||
    null;
}

function rowRiskKey(row: TenantFinanceFinancialRow) {
  return rowCaseId(row) ||
    rowClientId(row) ||
    rowClientName(row) ||
    compactText(row.external_id, "") ||
    compactText(row.id, "") ||
    "risco-sem-identificador";
}

function buildForecastBuckets(rows: TenantFinanceFinancialRow[], today: Date): TenantFinanceForecastBuckets {
  const dueIn7Days: TenantFinanceFinancialRow[] = [];
  const dueIn30Days: TenantFinanceFinancialRow[] = [];
  const future: TenantFinanceFinancialRow[] = [];
  const noDueDate: TenantFinanceFinancialRow[] = [];

  for (const row of rows) {
    const dueDate = parseLocalDate(row.due_date);
    if (!dueDate) {
      noDueDate.push(row);
      continue;
    }

    const daysUntilDue = daysBetween(today, dueDate);
    if (daysUntilDue <= 7) {
      dueIn7Days.push(row);
    } else if (daysUntilDue <= 30) {
      dueIn30Days.push(row);
    } else {
      future.push(row);
    }
  }

  return {
    dueIn7Days: bucketFromRows(dueIn7Days),
    dueIn30Days: bucketFromRows(dueIn30Days),
    future: bucketFromRows(future),
    noDueDate: bucketFromRows(noDueDate),
  };
}

function buildOverdueAging(rows: TenantFinanceFinancialRow[], today: Date): TenantFinanceOverdueAging {
  const days1To7: TenantFinanceFinancialRow[] = [];
  const days8To14: TenantFinanceFinancialRow[] = [];
  const days15To30: TenantFinanceFinancialRow[] = [];
  const days31Plus: TenantFinanceFinancialRow[] = [];

  for (const row of rows) {
    const dueDate = parseLocalDate(row.due_date);
    if (!dueDate) continue;

    const daysOverdue = daysBetween(dueDate, today);
    if (daysOverdue <= 7) {
      days1To7.push(row);
    } else if (daysOverdue <= 14) {
      days8To14.push(row);
    } else if (daysOverdue <= 30) {
      days15To30.push(row);
    } else {
      days31Plus.push(row);
    }
  }

  return {
    days1To7: bucketFromRows(days1To7),
    days8To14: bucketFromRows(days8To14),
    days15To30: bucketFromRows(days15To30),
    days31Plus: bucketFromRows(days31Plus),
  };
}

function resolveRiskLevel(params: { overdueAmount: number; openAmount: number; maxDaysOverdue: number }) {
  if (params.maxDaysOverdue >= 15 || params.overdueAmount >= 5000) return "high";
  if (params.maxDaysOverdue > 0 || params.overdueAmount > 0 || params.openAmount >= 2500) return "medium";
  return "low";
}

function resolveRiskAction(item: Pick<TenantFinanceRiskItem, "overdueAmount" | "maxDaysOverdue" | "forecastAmount" | "riskLevel">) {
  if (item.riskLevel === "high") return "Priorizar plano de cobranca supervisionado e revisar abertura/continuidade do caso.";
  if (item.overdueAmount > 0) return "Confirmar pagamento ou preparar renegociacao antes de novo envio externo.";
  if (item.forecastAmount > 0) return "Acompanhar vencimento e deixar follow-up pronto para aprovacao humana.";
  return "Revisar cadastro financeiro antes de qualquer automacao.";
}

function buildRiskItems(rows: TenantFinanceFinancialRow[], today: Date): TenantFinanceRiskItem[] {
  const groups = new Map<string, TenantFinanceFinancialRow[]>();

  for (const row of rows) {
    const key = rowRiskKey(row);
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  return Array.from(groups.entries())
    .map(([key, groupRows]) => {
      const dueDates = groupRows
        .map((row) => parseLocalDate(row.due_date))
        .filter((date): date is Date => Boolean(date));
      const overdueRows = groupRows.filter((row) => {
        const dueDate = parseLocalDate(row.due_date);
        return Boolean(dueDate && dueDate < today);
      });
      const forecastRows = groupRows.filter((row) => !overdueRows.includes(row));
      const overdueAmount = bucketFromRows(overdueRows).amount;
      const forecastAmount = bucketFromRows(forecastRows).amount;
      const openAmount = bucketFromRows(groupRows).amount;
      const maxDaysOverdue = overdueRows.reduce((max, row) => {
        const dueDate = parseLocalDate(row.due_date);
        return dueDate ? Math.max(max, daysBetween(dueDate, today)) : max;
      }, 0);
      const oldestDueDate = dueDates.length > 0
        ? new Date(Math.min(...dueDates.map((date) => date.getTime()))).toISOString().slice(0, 10)
        : null;
      const riskLevel = resolveRiskLevel({ overdueAmount, openAmount, maxDaysOverdue });
      const clientName = groupRows.map(rowClientName).find(Boolean) || null;
      const caseId = groupRows.map(rowCaseId).find(Boolean) || null;
      const item: TenantFinanceRiskItem = {
        key,
        label: clientName || compactText(groupRows[0]?.description, "Risco financeiro"),
        clientName,
        caseId,
        openAmount,
        overdueAmount,
        forecastAmount,
        openCount: groupRows.length,
        overdueCount: overdueRows.length,
        maxDaysOverdue,
        oldestDueDate,
        riskLevel,
        nextBestAction: "",
      };
      return {
        ...item,
        nextBestAction: resolveRiskAction(item),
      };
    })
    .filter((item) => item.openAmount > 0)
    .sort((a, b) => {
      const priority = { high: 0, medium: 1, low: 2 };
      return priority[a.riskLevel] - priority[b.riskLevel] ||
        b.overdueAmount - a.overdueAmount ||
        b.openAmount - a.openAmount ||
        a.label.localeCompare(b.label);
    })
    .slice(0, 8);
}

function salesStatusKind(status: unknown): "pending" | "closed" | "lost" {
  const normalized = normalizeText(status);
  if (/(perdid|lost|cancelad|rejeitad)/.test(normalized)) return "lost";
  if (/(fechad|ganh|won|closed|pago|paid|assinado|signed)/.test(normalized)) return "closed";
  return "pending";
}

function commercialStageName(stage?: TenantFinanceCrmStageRow | null) {
  return compactText(stage?.name, "Sem etapa");
}

function commercialOpportunityAction(params: { kind: "sale" | "crm"; stage: string; isLoss?: boolean; isWin?: boolean }) {
  if (params.isLoss) return "Revisar motivo de perda antes de reativar oportunidade.";
  if (params.isWin) return "Conferir se contrato fechado ja virou financeiro recebido ou cobranca aberta.";
  if (params.kind === "sale") return "Confirmar assinatura/pagamento antes de tratar como receita recebida.";
  const stage = normalizeText(params.stage);
  if (/(proposta|contrato|negociacao|negociacao)/.test(stage)) return "Priorizar follow-up humano e confirmar proximo compromisso.";
  return "Qualificar valor, etapa e probabilidade antes de entrar no forecast firme.";
}

function commercialStagePriority(stage: Pick<TenantFinanceCommercialStage, "isWin" | "isLoss">) {
  if (stage.isLoss) return 2;
  if (stage.isWin) return 1;
  return 0;
}

function buildCommercialForecast(input: {
  salesRows?: TenantFinanceSalesRow[] | null;
  crmTasks?: TenantFinanceCrmTaskRow[] | null;
  crmStages?: TenantFinanceCrmStageRow[] | null;
  salesAvailable?: boolean;
  crmAvailable?: boolean;
}) {
  const salesRows = Array.isArray(input.salesRows) ? input.salesRows : [];
  const crmTasks = Array.isArray(input.crmTasks) ? input.crmTasks : [];
  const stageMap = new Map(
    (input.crmStages || [])
      .filter((stage) => stage.id)
      .map((stage) => [String(stage.id), stage])
  );

  const pendingSales = salesRows.filter((sale) => salesStatusKind(sale.status) === "pending");
  const closedSales = salesRows.filter((sale) => salesStatusKind(sale.status) === "closed");
  const lostSales = salesRows.filter((sale) => salesStatusKind(sale.status) === "lost");
  const stageGroups = new Map<string, TenantFinanceCommercialStage>();

  for (const task of crmTasks) {
    const stage = stageMap.get(String(task.stage_id || "")) || null;
    const stageName = commercialStageName(stage);
    const key = compactText(stage?.id, "") || `stage:${stageName}`;
    const current = stageGroups.get(key) || {
      stageId: key,
      stageName,
      amount: 0,
      count: 0,
      isWin: stage?.is_win === true,
      isLoss: stage?.is_loss === true,
    };
    current.amount = roundMoney(current.amount + money(task.value));
    current.count += 1;
    stageGroups.set(key, current);
  }

  const openCrmTasks = crmTasks.filter((task) => {
    const stage = stageMap.get(String(task.stage_id || ""));
    return stage?.is_win !== true && stage?.is_loss !== true;
  });
  const wonCrmTasks = crmTasks.filter((task) => stageMap.get(String(task.stage_id || ""))?.is_win === true);
  const lostCrmTasks = crmTasks.filter((task) => stageMap.get(String(task.stage_id || ""))?.is_loss === true);
  const openCrmBucket = bucketFromRows(openCrmTasks.map((task) => ({ amount: task.value })));
  const pendingSalesBucket = bucketFromRows(pendingSales.map((sale) => ({ amount: sale.ticket_total })));
  const closedSalesBucket = bucketFromRows(closedSales.map((sale) => ({ amount: sale.ticket_total })));
  const wonCrmBucket = bucketFromRows(wonCrmTasks.map((task) => ({ amount: task.value })));
  const lostSalesAmount = bucketFromRows(lostSales.map((sale) => ({ amount: sale.ticket_total }))).amount;
  const lostCrmAmount = bucketFromRows(lostCrmTasks.map((task) => ({ amount: task.value }))).amount;
  const topOpportunities: TenantFinanceCommercialOpportunity[] = [
    ...pendingSales.map((sale) => ({
      id: `sale:${compactText(sale.id, compactText(sale.client_name, "sem-id"))}`,
      kind: "sale" as const,
      label: compactText(sale.client_name, "Contrato pendente"),
      amount: roundMoney(money(sale.ticket_total)),
      stage: compactText(sale.status, "Pendente"),
      source: "sales",
      expectedDate: sale.contract_date || sale.created_at || null,
      nextBestAction: commercialOpportunityAction({ kind: "sale", stage: compactText(sale.status, "Pendente") }),
    })),
    ...openCrmTasks.map((task) => {
      const stage = stageMap.get(String(task.stage_id || ""));
      const stageName = commercialStageName(stage);
      return {
        id: `crm:${compactText(task.id, compactText(task.title, "sem-id"))}`,
        kind: "crm" as const,
        label: compactText(task.title, "Oportunidade comercial"),
        amount: roundMoney(money(task.value)),
        stage: stageName,
        source: compactText(task.source, "") || null,
        expectedDate: task.data_ultima_movimentacao || task.created_at || null,
        nextBestAction: commercialOpportunityAction({ kind: "crm", stage: stageName }),
      };
    }),
  ]
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
    .slice(0, 8);

  return {
    source: "sales+crm_tasks" as const,
    available: input.salesAvailable !== false || input.crmAvailable !== false,
    pipelineAmount: roundMoney(pendingSalesBucket.amount + openCrmBucket.amount),
    pendingContracts: {
      amount: roundMoney(pendingSalesBucket.amount),
      count: pendingSalesBucket.count,
    },
    closedContracts: {
      amount: roundMoney(closedSalesBucket.amount + wonCrmBucket.amount),
      count: closedSalesBucket.count + wonCrmBucket.count,
    },
    lostAmount: roundMoney(lostSalesAmount + lostCrmAmount),
    byStage: Array.from(stageGroups.values())
      .sort((a, b) => commercialStagePriority(a) - commercialStagePriority(b) || b.amount - a.amount)
      .slice(0, 8),
    topOpportunities,
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

type UnitEconomicsCaseBucket = {
  key: string;
  caseId: string | null;
  label: string | null;
  legalArea: string | null;
  financialReceivedRevenue: number;
  salesRevenue: number;
  openRevenue: number;
  directCosts: number;
  commissionCost: number;
  hasExactCaseId: boolean;
};

function unitMetadataValue(metadata: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = compactText(metadata?.[key], "");
    if (value) return value;
  }
  return null;
}

function entityKey(prefix: string, value: unknown) {
  const normalized = normalizeText(value);
  return normalized ? `${prefix}:${normalized}` : null;
}

function uniqueKeys(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function financialUnitKeys(row: TenantFinanceFinancialRow) {
  const metadata = metadataFor(row);
  const caseId = rowCaseId(row) || unitMetadataValue(metadata, ["process_task_id", "processTaskId"]);
  const clientName = unitMetadataValue(metadata, ["client_name", "nome_cliente", "customer_name", "lead_name", "signer_name"]) ||
    (isExpenseRow(row) ? null : rowClientName(row));
  return uniqueKeys([
    entityKey("case", caseId),
    entityKey("client", clientName),
    isExpenseRow(row) ? null : entityKey("external", row.external_id),
  ]);
}

function processUnitKeys(row: TenantFinanceProcessTaskRow) {
  return uniqueKeys([
    entityKey("case", row.client_id || row.case_id),
    entityKey("process", row.id),
    entityKey("client", row.client_name),
    entityKey("client", row.title),
  ]);
}

function saleUnitKeys(row: TenantFinanceSalesRow) {
  return uniqueKeys([
    entityKey("sale", row.id),
    entityKey("client", row.client_name),
  ]);
}

function processLegalArea(row: TenantFinanceProcessTaskRow) {
  return compactText(row.demanda, "") ||
    compactText(row.sector, "") ||
    compactText(row.tags?.[0], "") ||
    null;
}

function financialLegalArea(row: TenantFinanceFinancialRow) {
  const metadata = metadataFor(row);
  return unitMetadataValue(metadata, ["legal_area", "legalArea", "area", "demanda", "sector"]) ||
    null;
}

function mergeUnitCaseBuckets(
  buckets: Map<string, UnitEconomicsCaseBucket>,
  aliases: Map<string, string>,
  targetKey: string,
  sourceKey: string
) {
  if (targetKey === sourceKey) return;
  const source = buckets.get(sourceKey);
  if (!source) return;
  const target = ensureUnitCaseBucket(buckets, targetKey);
  target.caseId = target.caseId || source.caseId;
  target.label = target.label || source.label;
  target.legalArea = target.legalArea || source.legalArea;
  target.financialReceivedRevenue = roundMoney(target.financialReceivedRevenue + source.financialReceivedRevenue);
  target.salesRevenue = roundMoney(target.salesRevenue + source.salesRevenue);
  target.openRevenue = roundMoney(target.openRevenue + source.openRevenue);
  target.directCosts = roundMoney(target.directCosts + source.directCosts);
  target.commissionCost = roundMoney(target.commissionCost + source.commissionCost);
  target.hasExactCaseId = target.hasExactCaseId || source.hasExactCaseId;
  buckets.delete(sourceKey);

  for (const [alias, mappedKey] of Array.from(aliases.entries())) {
    if (mappedKey === sourceKey) aliases.set(alias, targetKey);
  }
}

function ensureUnitCaseBucket(buckets: Map<string, UnitEconomicsCaseBucket>, key: string) {
  const existing = buckets.get(key);
  if (existing) return existing;
  const bucket: UnitEconomicsCaseBucket = {
    key,
    caseId: null,
    label: null,
    legalArea: null,
    financialReceivedRevenue: 0,
    salesRevenue: 0,
    openRevenue: 0,
    directCosts: 0,
    commissionCost: 0,
    hasExactCaseId: false,
  };
  buckets.set(key, bucket);
  return bucket;
}

function applyUnitCaseUpdate(
  buckets: Map<string, UnitEconomicsCaseBucket>,
  aliases: Map<string, string>,
  keys: string[],
  apply: (bucket: UnitEconomicsCaseBucket) => void
) {
  const usableKeys = uniqueKeys(keys);
  if (usableKeys.length === 0) return false;
  const primaryKey = usableKeys.map((key) => aliases.get(key)).find(Boolean) || usableKeys[0];

  for (const key of usableKeys) {
    const mappedKey = aliases.get(key);
    if (mappedKey && mappedKey !== primaryKey) {
      mergeUnitCaseBuckets(buckets, aliases, primaryKey, mappedKey);
    }
  }

  for (const key of usableKeys) {
    aliases.set(key, primaryKey);
  }

  apply(ensureUnitCaseBucket(buckets, primaryKey));
  return true;
}

function marginRateFor(params: { revenue: number; profit: number }) {
  return params.revenue > 0 ? roundRate((params.profit / params.revenue) * 100) : 0;
}

function confidenceFor(bucket: UnitEconomicsCaseBucket): TenantFinanceUnitEconomicsConfidence {
  if (bucket.directCosts <= 0) return "low";
  return bucket.hasExactCaseId ? "high" : "medium";
}

function addCommissionGroup(
  groups: Map<string, TenantFinanceCommissionGroup>,
  label: string,
  amount: number,
  revenue: number
) {
  const safeLabel = compactText(label, "Sem origem");
  const current = groups.get(safeLabel) || {
    label: safeLabel,
    amount: 0,
    revenue: 0,
    count: 0,
    share: 0,
  };
  current.amount = roundMoney(current.amount + amount);
  current.revenue = roundMoney(current.revenue + revenue);
  current.count += 1;
  groups.set(safeLabel, current);
}

function normalizeGroupShare(groups: Map<string, TenantFinanceCommissionGroup>, total: number) {
  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      share: total > 0 ? roundRate((group.amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
    .slice(0, 8);
}

function findSaleOrigin(sale: TenantFinanceSalesRow, crmTasks: TenantFinanceCrmTaskRow[]) {
  const saleName = normalizeText(sale.client_name);
  if (!saleName) return "Sem origem";

  const match = crmTasks.find((task) => {
    const title = normalizeText(task.title);
    return Boolean(title && (title.includes(saleName) || saleName.includes(title)));
  });

  return compactText(match?.source, "Sem origem");
}

function buildUnitEconomics(input: {
  financialRows: TenantFinanceFinancialRow[];
  processTasks?: TenantFinanceProcessTaskRow[] | null;
  salesRows?: TenantFinanceSalesRow[] | null;
  crmTasks?: TenantFinanceCrmTaskRow[] | null;
}): TenantFinanceUnitEconomics {
  const buckets = new Map<string, UnitEconomicsCaseBucket>();
  const aliases = new Map<string, string>();
  const processTasks = Array.isArray(input.processTasks) ? input.processTasks : [];
  const salesRows = Array.isArray(input.salesRows) ? input.salesRows : [];
  const crmTasks = Array.isArray(input.crmTasks) ? input.crmTasks : [];
  const ownerGroups = new Map<string, TenantFinanceCommissionGroup>();
  const originGroups = new Map<string, TenantFinanceCommissionGroup>();

  for (const task of processTasks) {
    applyUnitCaseUpdate(buckets, aliases, processUnitKeys(task), (bucket) => {
      bucket.caseId = bucket.caseId || compactText(task.client_id || task.case_id || task.id, "");
      bucket.label = bucket.label || compactText(task.client_name, "") || compactText(task.title, "");
      bucket.legalArea = bucket.legalArea || processLegalArea(task);
      bucket.hasExactCaseId = bucket.hasExactCaseId || Boolean(compactText(task.client_id || task.case_id, ""));
    });
  }

  for (const row of input.financialRows) {
    const keys = financialUnitKeys(row);
    const related = applyUnitCaseUpdate(buckets, aliases, keys, (bucket) => {
      const metadata = metadataFor(row);
      const caseId = rowCaseId(row) || unitMetadataValue(metadata, ["process_task_id", "processTaskId"]);
      const clientName = rowClientName(row);
      bucket.caseId = bucket.caseId || caseId || null;
      bucket.label = bucket.label || clientName || compactText(row.description, "");
      bucket.legalArea = bucket.legalArea || financialLegalArea(row);
      bucket.hasExactCaseId = bucket.hasExactCaseId || Boolean(caseId);
      if (isExpenseRow(row)) {
        bucket.directCosts = roundMoney(bucket.directCosts + Math.abs(money(row.amount)));
      } else if (isPaidRevenue(row)) {
        bucket.financialReceivedRevenue = roundMoney(bucket.financialReceivedRevenue + money(row.amount));
      } else {
        bucket.openRevenue = roundMoney(bucket.openRevenue + money(row.amount));
      }
    });

    if (!related && isPaidRevenue(row)) {
      applyUnitCaseUpdate(buckets, aliases, [entityKey("financial", row.id) || ""], (bucket) => {
        bucket.label = bucket.label || compactText(row.description, "Receita sem caso");
        bucket.financialReceivedRevenue = roundMoney(bucket.financialReceivedRevenue + money(row.amount));
      });
    }
  }

  const closedSales = salesRows.filter((sale) => salesStatusKind(sale.status) === "closed");
  for (const sale of closedSales) {
    const revenue = money(sale.ticket_total);
    const commission = money(sale.commission_value);
    const owner = compactText(sale.professional_name, "Sem responsavel");
    const origin = findSaleOrigin(sale, crmTasks);
    addCommissionGroup(ownerGroups, owner, commission, revenue);
    addCommissionGroup(originGroups, origin, commission, revenue);

    applyUnitCaseUpdate(buckets, aliases, saleUnitKeys(sale), (bucket) => {
      bucket.label = bucket.label || compactText(sale.client_name, "Venda sem cliente");
      bucket.salesRevenue = roundMoney(bucket.salesRevenue + revenue);
      bucket.commissionCost = roundMoney(bucket.commissionCost + commission);
    });
  }

  const byCase = Array.from(buckets.values())
    .map<TenantFinanceUnitEconomicsCase>((bucket) => {
      const receivedRevenue = bucket.financialReceivedRevenue > 0 ? bucket.financialReceivedRevenue : bucket.salesRevenue;
      const revenueBase = receivedRevenue > 0 ? receivedRevenue : roundMoney(receivedRevenue + bucket.openRevenue);
      const estimatedProfit = roundMoney(receivedRevenue - bucket.directCosts - bucket.commissionCost);
      return {
        caseId: bucket.caseId || bucket.key,
        label: bucket.label || "Caso sem identificacao",
        legalArea: bucket.legalArea,
        receivedRevenue,
        openRevenue: bucket.openRevenue,
        directCosts: bucket.directCosts,
        commissionCost: bucket.commissionCost,
        estimatedProfit,
        marginRate: marginRateFor({ revenue: revenueBase, profit: estimatedProfit }),
        confidence: confidenceFor(bucket),
      };
    })
    .filter((item) => item.receivedRevenue > 0 || item.openRevenue > 0 || item.directCosts > 0 || item.commissionCost > 0)
    .sort((a, b) => b.estimatedProfit - a.estimatedProfit || a.label.localeCompare(b.label))
    .slice(0, 8);

  const legalAreaGroups = new Map<string, TenantFinanceUnitEconomicsLegalArea>();
  for (const item of byCase) {
    const legalArea = compactText(item.legalArea, "Sem area");
    const current = legalAreaGroups.get(legalArea) || {
      legalArea,
      caseCount: 0,
      receivedRevenue: 0,
      openRevenue: 0,
      directCosts: 0,
      commissionCost: 0,
      estimatedProfit: 0,
      marginRate: 0,
    };
    current.caseCount += 1;
    current.receivedRevenue = roundMoney(current.receivedRevenue + item.receivedRevenue);
    current.openRevenue = roundMoney(current.openRevenue + item.openRevenue);
    current.directCosts = roundMoney(current.directCosts + item.directCosts);
    current.commissionCost = roundMoney(current.commissionCost + item.commissionCost);
    current.estimatedProfit = roundMoney(current.estimatedProfit + item.estimatedProfit);
    current.marginRate = marginRateFor({ revenue: current.receivedRevenue, profit: current.estimatedProfit });
    legalAreaGroups.set(legalArea, current);
  }

  const grossRevenue = roundMoney(byCase.reduce((sum, item) => sum + item.receivedRevenue, 0));
  const directCosts = roundMoney(byCase.reduce((sum, item) => sum + item.directCosts, 0));
  const commissions = roundMoney(byCase.reduce((sum, item) => sum + item.commissionCost, 0));
  const estimatedProfit = roundMoney(grossRevenue - directCosts - commissions);

  return {
    grossRevenue,
    directCosts,
    commissions,
    estimatedProfit,
    estimatedMarginRate: marginRateFor({ revenue: grossRevenue, profit: estimatedProfit }),
    byCase,
    byLegalArea: Array.from(legalAreaGroups.values())
      .sort((a, b) => b.receivedRevenue - a.receivedRevenue || a.legalArea.localeCompare(b.legalArea))
      .slice(0, 8),
    commissionsBreakdown: {
      byOwner: normalizeGroupShare(ownerGroups, commissions),
      byOrigin: normalizeGroupShare(originGroups, commissions),
    },
  };
}

export function buildTenantFinanceSummaryFromRows(input: {
  tenantId: string;
  financialRows?: TenantFinanceFinancialRow[] | null;
  brainArtifacts?: TenantFinanceBrainArtifactRow[] | null;
  processTasks?: RevenueProcessTaskRow[] | null;
  unitProcessTasks?: TenantFinanceProcessTaskRow[] | null;
  salesRows?: TenantFinanceSalesRow[] | null;
  crmTasks?: TenantFinanceCrmTaskRow[] | null;
  crmStages?: TenantFinanceCrmStageRow[] | null;
  brainArtifactsAvailable?: boolean;
  processTasksAvailable?: boolean;
  salesAvailable?: boolean;
  crmAvailable?: boolean;
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
  const forecastBuckets = buildForecastBuckets(forecastRows, today);
  const overdueAging = buildOverdueAging(overdueRows, today);
  const riskItems = buildRiskItems(openRows, today);
  const commercialForecast = buildCommercialForecast({
    salesRows: input.salesRows,
    crmTasks: input.crmTasks,
    crmStages: input.crmStages,
    salesAvailable: input.salesAvailable,
    crmAvailable: input.crmAvailable,
  });
  const unitEconomics = buildUnitEconomics({
    financialRows,
    processTasks: input.unitProcessTasks || input.processTasks as TenantFinanceProcessTaskRow[] | null | undefined,
    salesRows: input.salesRows,
    crmTasks: input.crmTasks,
  });

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
      forecastBuckets,
      overdueAging,
      riskItems,
      expenses: {
        fixed: bucketFromRows(fixedExpenseRows, (row) => Math.abs(money(row.amount))),
        marketing: bucketFromRows(marketingExpenseRows, (row) => Math.abs(money(row.amount))),
      },
    },
    commercialForecast,
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
    unitEconomics,
  };
}

export async function loadTenantFinanceSummary(input: LoadTenantFinanceSummaryInput) {
  const [financialResult, artifactsResult, processTasksResult, unitProcessTasksResult, salesResult, crmTasksResult, crmPipelinesResult] = await Promise.all([
    input.supabase
      .from("financials")
      .select("id, case_id, amount, status, due_date, type, description, source, reference_date, external_id, metadata")
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
    input.supabase
      .from("process_tasks")
      .select("id, title, client_name, value, valor_causa, tags, source, client_id, assigned_to, demanda, sector, created_at")
      .eq("tenant_id", input.tenantId)
      .order("created_at", { ascending: false })
      .limit(200),
    input.supabase
      .from("sales")
      .select("id, client_name, ticket_total, installments, contract_date, status, professional_id, professional_name, commission_value, fixed_salary, estimated_earnings, created_at")
      .eq("tenant_id", input.tenantId)
      .order("contract_date", { ascending: false })
      .limit(100),
    input.supabase
      .from("crm_tasks")
      .select("id, title, value, source, stage_id, created_at, data_ultima_movimentacao")
      .eq("tenant_id", input.tenantId)
      .order("data_ultima_movimentacao", { ascending: false })
      .limit(100),
    input.supabase
      .from("crm_pipelines")
      .select("id")
      .eq("tenant_id", input.tenantId),
  ]);

  if (financialResult.error) {
    throw financialResult.error;
  }

  const pipelineIds = !crmPipelinesResult.error && Array.isArray(crmPipelinesResult.data)
    ? crmPipelinesResult.data
      .map((pipeline: { id?: unknown }) => compactText(pipeline.id, ""))
      .filter(Boolean)
    : [];
  const crmStagesResult = pipelineIds.length > 0
    ? await input.supabase
      .from("crm_stages")
      .select("id, name, is_win, is_loss")
      .in("pipeline_id", pipelineIds)
    : { data: [], error: null };
  const crmAvailable = !crmTasksResult.error && !crmPipelinesResult.error && !crmStagesResult.error;

  return buildTenantFinanceSummaryFromRows({
    tenantId: input.tenantId,
    financialRows: financialResult.data as TenantFinanceFinancialRow[] | null,
    brainArtifacts: artifactsResult.error ? [] : artifactsResult.data as TenantFinanceBrainArtifactRow[] | null,
    processTasks: processTasksResult.error ? [] : processTasksResult.data as RevenueProcessTaskRow[] | null,
    unitProcessTasks: unitProcessTasksResult.error ? [] : unitProcessTasksResult.data as TenantFinanceProcessTaskRow[] | null,
    salesRows: salesResult.error ? [] : salesResult.data as TenantFinanceSalesRow[] | null,
    crmTasks: crmTasksResult.error ? [] : crmTasksResult.data as TenantFinanceCrmTaskRow[] | null,
    crmStages: crmStagesResult.error ? [] : crmStagesResult.data as TenantFinanceCrmStageRow[] | null,
    brainArtifactsAvailable: !artifactsResult.error,
    processTasksAvailable: !processTasksResult.error,
    salesAvailable: !salesResult.error,
    crmAvailable,
    now: input.now,
  });
}
