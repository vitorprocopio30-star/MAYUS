import type { TenantFinanceSummary } from "@/lib/finance/tenant-finance-summary";

export type ManagementDataReadinessStatus = "blocked" | "partial" | "ready";
export type ManagementDataReadinessConfidence = "none" | "low" | "medium" | "high";

export type ManagementDataReadiness = {
  artifactType: "management_data_readiness";
  tenantId: string;
  generatedAt: string;
  status: ManagementDataReadinessStatus;
  confidence: ManagementDataReadinessConfidence;
  canUseRealData: boolean;
  canGenerateManagementBrief: boolean;
  availableDataSources: string[];
  missingDataSources: string[];
  blockers: string[];
  warnings: string[];
  allowedOutputs: string[];
  blockedOutputs: string[];
  nextOrganizationChecklist: string[];
  metrics: {
    revenueReceived: number;
    openCharges: number;
    overdue: number;
    delinquencyRate: number;
    forecast: number;
    commercialPipeline: number;
    closedContracts: number;
    topOpportunities: number;
    unitEconomicsCases: number;
    reconciliationMatched: number;
  };
};

export type BuildManagementDataReadinessInput = {
  tenantId: string;
  generatedAt?: string;
  financeSummary?: TenantFinanceSummary | null;
  dataErrors?: string[];
};

function money(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function pushIf(target: string[], condition: boolean, value: string) {
  if (condition && !target.includes(value)) target.push(value);
}

export function buildManagementDataReadiness(input: BuildManagementDataReadinessInput): ManagementDataReadiness {
  const summary = input.financeSummary || null;
  const metrics = {
    revenueReceived: money(summary?.financials.received.amount),
    openCharges: money(summary?.financials.openCharges.amount),
    overdue: money(summary?.financials.overdue.amount),
    delinquencyRate: money(summary?.financials.delinquency.rate),
    forecast: money(summary?.financials.forecast.amount),
    commercialPipeline: money(summary?.commercialForecast.pipelineAmount),
    closedContracts: money(summary?.commercialForecast.closedContracts.amount),
    topOpportunities: count(summary?.commercialForecast.topOpportunities.length),
    unitEconomicsCases: count(summary?.unitEconomics.byCase.length),
    reconciliationMatched: count(summary?.revenueReconciliation.report.totals.matched),
  };

  const hasFinancialSignal =
    metrics.revenueReceived > 0 ||
    metrics.openCharges > 0 ||
    metrics.overdue > 0 ||
    metrics.forecast > 0 ||
    money(summary?.financials.expenses.fixed.amount) > 0 ||
    money(summary?.financials.expenses.marketing.amount) > 0;
  const hasCrmSignal =
    summary?.commercialForecast.available === true &&
    (metrics.commercialPipeline > 0 ||
      metrics.closedContracts > 0 ||
      metrics.topOpportunities > 0 ||
      (summary?.commercialForecast.byStage.length || 0) > 0);
  const hasProcessSignal = metrics.unitEconomicsCases > 0;
  const hasReconciliationSignal =
    summary?.revenueReconciliation.available === true &&
    ((summary?.revenueReconciliation.report.items.length || 0) > 0 || metrics.reconciliationMatched > 0);

  const availableDataSources: string[] = [];
  pushIf(availableDataSources, hasFinancialSignal, "financials");
  pushIf(availableDataSources, hasCrmSignal, "crm_tasks/sales");
  pushIf(availableDataSources, hasProcessSignal, "process_tasks");
  pushIf(availableDataSources, hasReconciliationSignal, "financials+brain_artifacts+process_tasks");
  pushIf(availableDataSources, metrics.reconciliationMatched > 0, "asaas_billing_artifacts");

  const missingDataSources: string[] = [];
  pushIf(missingDataSources, !hasFinancialSignal, "financials/Asaas com receita, aberto, vencido e despesas");
  pushIf(missingDataSources, !hasCrmSignal, "CRM com etapas, origem, valores e status de fechamento");
  pushIf(missingDataSources, !hasProcessSignal, "processos/tarefas com area, responsavel, valor e carga operacional");
  pushIf(missingDataSources, !hasReconciliationSignal, "reconciliacao entre cobranca, contrato, pagamento e caso");

  const blockers = [...(input.dataErrors || [])];
  pushIf(blockers, !hasFinancialSignal && !hasCrmSignal, "Sem financeiro/CRM confiavel, o MAYUS deve organizar dados antes de analisar gestao.");
  pushIf(blockers, !hasFinancialSignal, "Sem base financeira, nao da para calcular margem, inadimplencia, forecast ou ROI com seguranca.");
  pushIf(blockers, !hasCrmSignal, "Sem CRM consistente, nao da para ler conversao, pipeline, CAC ou origem de oportunidades.");

  const warnings: string[] = [];
  pushIf(warnings, hasFinancialSignal && !hasReconciliationSignal, "Ha sinais financeiros, mas a reconciliacao com cobrancas/contratos/casos ainda esta incompleta.");
  pushIf(warnings, hasCrmSignal && !hasFinancialSignal, "Ha sinais comerciais, mas eles ainda nao devem virar conclusao financeira.");
  pushIf(warnings, hasFinancialSignal && !hasProcessSignal, "Ha sinais financeiros, mas falta carga operacional por caso/area para leitura de produtividade e tese lucrativa.");

  let status: ManagementDataReadinessStatus = "blocked";
  let confidence: ManagementDataReadinessConfidence = "none";

  if (hasFinancialSignal && hasCrmSignal && (hasReconciliationSignal || hasProcessSignal)) {
    status = "ready";
    confidence = hasReconciliationSignal && hasProcessSignal ? "high" : "medium";
  } else if (hasFinancialSignal || hasCrmSignal || hasProcessSignal) {
    status = "partial";
    confidence = "low";
  }

  const allowedOutputs = status === "blocked"
    ? ["glossario de gestao", "checklist de organizacao", "perguntas de diagnostico"]
    : status === "partial"
      ? ["brief com baixa confianca", "mapa de lacunas", "perguntas para o dono", "cenarios sem ordem executiva"]
      : ["management_intelligence_brief", "diagnostico com dados usados", "cenarios de decisao", "perguntas estruturadas para o dono"];

  return {
    artifactType: "management_data_readiness",
    tenantId: input.tenantId,
    generatedAt: input.generatedAt || new Date().toISOString(),
    status,
    confidence,
    canUseRealData: status !== "blocked",
    canGenerateManagementBrief: true,
    availableDataSources,
    missingDataSources,
    blockers,
    warnings,
    allowedOutputs,
    blockedOutputs: [
      "ordem para contratar, demitir, expandir, cortar equipe ou mudar preco",
      "decisao empresarial automatica",
      "publicacao ou campanha externa automatica",
      "promessa de resultado financeiro ou juridico",
    ],
    nextOrganizationChecklist: [
      !hasFinancialSignal ? "Conectar ou revisar Asaas/financials com recebido, aberto, vencido e despesas." : null,
      !hasCrmSignal ? "Padronizar CRM com origem, etapa, valor, responsavel e motivo de perda/ganho." : null,
      !hasProcessSignal ? "Vincular processos/tarefas a area, cliente, responsavel, valor e status operacional." : null,
      !hasReconciliationSignal ? "Reconciliar proposta, contrato, cobranca, pagamento e caso aberto." : null,
    ].filter((item): item is string => Boolean(item)),
    metrics,
  };
}
