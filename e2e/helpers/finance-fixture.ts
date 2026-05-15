import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export type PlaywrightFinanceFixtureInfo = {
  tenantId: string;
  userIsSuperadmin: boolean;
  dashboard: {
    receivedRevenue: number;
    forecastRevenue: number;
    overdueRevenue: number;
    openCharges: number;
    highRiskClient: string;
    commercialPipeline: number;
    commercialPendingContracts: number;
    commercialClosedContracts: number;
    commercialLostAmount: number;
    commercialProposalStage: string;
    commercialTopOpportunity: string;
  };
  admin: {
    platformReady: boolean;
    platformBlocker: string | null;
    activeTenantName: string;
    delinquentTenantName: string;
    monthlyMrr: number;
    delinquentDaysOverdue: number;
  };
};

const FIXTURE_IDS = {
  caseMatched: "22222222-2222-4222-8222-222222222101",
  caseOverdueHigh: "22222222-2222-4222-8222-222222222102",
  caseForecast: "22222222-2222-4222-8222-222222222103",
  caseBlocked: "22222222-2222-4222-8222-222222222104",
  financialMatched: "22222222-2222-4222-8222-222222222201",
  financialBlocked: "22222222-2222-4222-8222-222222222202",
  financialDue7: "22222222-2222-4222-8222-222222222203",
  financialDue30: "22222222-2222-4222-8222-222222222204",
  financialFuture: "22222222-2222-4222-8222-222222222205",
  financialNoDueDate: "22222222-2222-4222-8222-222222222206",
  financialOverdue3: "22222222-2222-4222-8222-222222222207",
  financialOverdue10: "22222222-2222-4222-8222-222222222208",
  financialOverdue20: "22222222-2222-4222-8222-222222222209",
  financialOverdue40: "22222222-2222-4222-8222-222222222210",
  financialFixedCost: "22222222-2222-4222-8222-222222222211",
  financialMarketingCost: "22222222-2222-4222-8222-222222222212",
  pipelineId: "22222222-2222-4222-8222-222222222301",
  stageId: "22222222-2222-4222-8222-222222222302",
  processTaskMatched: "22222222-2222-4222-8222-222222222303",
  brainTaskId: "22222222-2222-4222-8222-222222222401",
  brainRunId: "22222222-2222-4222-8222-222222222402",
  brainStepId: "22222222-2222-4222-8222-222222222403",
  collectionArtifact: "22222222-2222-4222-8222-222222222501",
  asaasMatchedArtifact: "22222222-2222-4222-8222-222222222502",
  revenueCaseArtifact: "22222222-2222-4222-8222-222222222503",
  asaasBlockedArtifact: "22222222-2222-4222-8222-222222222504",
  asaasPartialArtifact: "22222222-2222-4222-8222-222222222505",
  revenuePlanPartialArtifact: "22222222-2222-4222-8222-222222222506",
  crmPipelineCommercial: "22222222-2222-4222-8222-222222222801",
  crmStageProposal: "22222222-2222-4222-8222-222222222802",
  crmStageWon: "22222222-2222-4222-8222-222222222803",
  crmStageLost: "22222222-2222-4222-8222-222222222804",
  crmTaskProposal: "22222222-2222-4222-8222-222222222805",
  crmTaskWon: "22222222-2222-4222-8222-222222222806",
  crmTaskLost: "22222222-2222-4222-8222-222222222807",
  salePending: "22222222-2222-4222-8222-222222222901",
  saleClosed: "22222222-2222-4222-8222-222222222902",
  saleLost: "22222222-2222-4222-8222-222222222903",
  platformActiveTenant: "22222222-2222-4222-8222-222222222601",
  platformAnnualTenant: "22222222-2222-4222-8222-222222222602",
  platformTrialTenant: "22222222-2222-4222-8222-222222222603",
  platformDelinquentTenant: "22222222-2222-4222-8222-222222222604",
  platformCanceledTenant: "22222222-2222-4222-8222-222222222605",
  platformPaidEventMonthly: "22222222-2222-4222-8222-222222222701",
  platformPaidEventAnnual: "22222222-2222-4222-8222-222222222702",
  platformOverdueEvent: "22222222-2222-4222-8222-222222222703",
} as const;

export const PLAYWRIGHT_FINANCE_FIXTURE_LABELS = {
  matchedClient: "Cliente Financeiro E2E Alpha",
  blockedClient: "Cliente Financeiro E2E Bloqueado",
  forecastClient: "Cliente Financeiro E2E Beta",
  highRiskClient: "Cliente Financeiro E2E Delta",
  partialClient: "Cliente Financeiro E2E Parcial",
  commercialPendingClient: "Cliente Financeiro E2E Contrato",
  commercialProposalClient: "Cliente Financeiro E2E Proposta",
  commercialClosedClient: "Cliente Financeiro E2E Fechado",
  commercialLostClient: "Cliente Financeiro E2E Perdido",
  commercialProposalStage: "Proposta enviada E2E",
  activeTenantName: "Escritorio Financeiro E2E Ativo",
  annualTenantName: "Escritorio Financeiro E2E Anual",
  trialTenantName: "Escritorio Financeiro E2E Trial",
  delinquentTenantName: "Escritorio Financeiro E2E Inadimplente",
  canceledTenantName: "Escritorio Financeiro E2E Cancelado",
} as const;

const FINANCE_EXPECTATIONS = {
  receivedRevenue: 4600,
  forecastRevenue: 8000,
  overdueRevenue: 17500,
  openCharges: 25500,
  commercialPipeline: 10000,
  commercialPendingContracts: 3000,
  commercialClosedContracts: 13000,
  commercialLostAmount: 2100,
  monthlyMrr: 1144,
  delinquentDaysOverdue: 12,
};

function loadEnvFile() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {} as Record<string, string>;

  return Object.fromEntries(
    fs.readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function iso(date: Date) {
  return date.toISOString();
}

async function resolvePlaywrightUser(supabase: any, email: string) {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;

  const users = Array.isArray(data?.users) ? data.users : [];
  return users.find((user: { email?: string | null }) => user.email?.toLowerCase() === email.toLowerCase()) || null;
}

async function resolveFixtureTenantId(supabase: any, env: Record<string, string>, user: any) {
  const envTenantId = env.PLAYWRIGHT_TENANT_ID?.trim();
  if (envTenantId) return envTenantId;

  const metadataTenant = user?.app_metadata?.tenant_id || user?.user_metadata?.tenant_id;
  if (typeof metadataTenant === "string" && metadataTenant.trim()) return metadataTenant.trim();

  if (user?.id) {
    const { data, error } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (typeof data?.tenant_id === "string" && data.tenant_id.trim()) return data.tenant_id.trim();
  }

  throw new Error("Nao foi possivel resolver o tenant E2E. Configure PLAYWRIGHT_TENANT_ID ou metadados/profile do PLAYWRIGHT_EMAIL.");
}

async function resolveProfile(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, tenant_id, full_name, role, is_superadmin")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function ensureUserTenantMetadata(supabase: any, user: any, tenantId: string, profile: any) {
  const appMetadata = {
    ...(user.app_metadata || {}),
    tenant_id: tenantId,
    role: profile?.role || user.app_metadata?.role || "Administrador",
  };
  const userMetadata = {
    ...(user.user_metadata || {}),
    tenant_id: tenantId,
    tenantId,
    full_name: profile?.full_name || user.user_metadata?.full_name || "Playwright E2E",
  };

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    app_metadata: appMetadata,
    user_metadata: userMetadata,
  });

  if (error) {
    throw new Error(`Falha ao alinhar metadata do usuario E2E financeiro: ${error.message}`);
  }
}

function buildFinancialRows(tenantId: string, now: Date) {
  const paymentId = "pay-e2e-fin-matched";
  const blockedPaymentId = "pay-e2e-fin-blocked";

  return [
    {
      id: FIXTURE_IDS.financialMatched,
      tenant_id: tenantId,
      case_id: FIXTURE_IDS.caseMatched,
      amount: 3200,
      status: "recebido",
      due_date: dateOnly(addDays(now, -8)),
      type: "receita",
      description: `Honorarios - ${PLAYWRIGHT_FINANCE_FIXTURE_LABELS.matchedClient}`,
      source: "asaas",
      external_id: paymentId,
      reference_date: iso(addDays(now, -7)),
      metadata: {
        fixture: "finance-e2e",
        payment_id: paymentId,
        client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.matchedClient,
        case_id: FIXTURE_IDS.caseMatched,
        crm_task_id: "crm-e2e-fin-matched",
      },
    },
    {
      id: FIXTURE_IDS.financialBlocked,
      tenant_id: tenantId,
      case_id: FIXTURE_IDS.caseBlocked,
      amount: 1400,
      status: "recebido",
      due_date: dateOnly(addDays(now, -4)),
      type: "receita",
      description: `Entrada sem caso - ${PLAYWRIGHT_FINANCE_FIXTURE_LABELS.blockedClient}`,
      source: "asaas",
      external_id: blockedPaymentId,
      reference_date: iso(addDays(now, -3)),
      metadata: {
        fixture: "finance-e2e",
        payment_id: blockedPaymentId,
        client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.blockedClient,
      },
    },
    {
      id: FIXTURE_IDS.financialDue7,
      tenant_id: tenantId,
      case_id: FIXTURE_IDS.caseForecast,
      amount: 1800,
      status: "pendente",
      due_date: dateOnly(addDays(now, 5)),
      type: "receita",
      description: `Parcela 7 dias - ${PLAYWRIGHT_FINANCE_FIXTURE_LABELS.forecastClient}`,
      source: "fixture",
      external_id: "fin-e2e-due-7",
      reference_date: iso(now),
      metadata: { fixture: "finance-e2e", client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.forecastClient, case_id: FIXTURE_IDS.caseForecast },
    },
    {
      id: FIXTURE_IDS.financialDue30,
      tenant_id: tenantId,
      case_id: FIXTURE_IDS.caseForecast,
      amount: 2200,
      status: "pendente",
      due_date: dateOnly(addDays(now, 20)),
      type: "receita",
      description: `Parcela 30 dias - ${PLAYWRIGHT_FINANCE_FIXTURE_LABELS.forecastClient}`,
      source: "fixture",
      external_id: "fin-e2e-due-30",
      reference_date: iso(now),
      metadata: { fixture: "finance-e2e", client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.forecastClient, case_id: FIXTURE_IDS.caseForecast },
    },
    {
      id: FIXTURE_IDS.financialFuture,
      tenant_id: tenantId,
      case_id: FIXTURE_IDS.caseForecast,
      amount: 3100,
      status: "pendente",
      due_date: dateOnly(addDays(now, 45)),
      type: "receita",
      description: "Parcela futura E2E",
      source: "fixture",
      external_id: "fin-e2e-future",
      reference_date: iso(now),
      metadata: { fixture: "finance-e2e", client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.forecastClient, case_id: FIXTURE_IDS.caseForecast },
    },
    {
      id: FIXTURE_IDS.financialNoDueDate,
      tenant_id: tenantId,
      case_id: FIXTURE_IDS.caseForecast,
      amount: 900,
      status: "pendente",
      due_date: null,
      type: "receita",
      description: "Receita sem vencimento E2E",
      source: "fixture",
      external_id: "fin-e2e-no-date",
      reference_date: iso(now),
      metadata: { fixture: "finance-e2e", client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.forecastClient, case_id: FIXTURE_IDS.caseForecast },
    },
    {
      id: FIXTURE_IDS.financialOverdue3,
      tenant_id: tenantId,
      case_id: FIXTURE_IDS.caseOverdueHigh,
      amount: 1200,
      status: "vencido",
      due_date: dateOnly(addDays(now, -3)),
      type: "receita",
      description: "Vencido 3 dias E2E",
      source: "fixture",
      external_id: "fin-e2e-overdue-3",
      reference_date: iso(addDays(now, -3)),
      metadata: { fixture: "finance-e2e", client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.highRiskClient, case_id: FIXTURE_IDS.caseOverdueHigh },
    },
    {
      id: FIXTURE_IDS.financialOverdue10,
      tenant_id: tenantId,
      case_id: FIXTURE_IDS.caseOverdueHigh,
      amount: 2500,
      status: "vencido",
      due_date: dateOnly(addDays(now, -10)),
      type: "receita",
      description: "Vencido 10 dias E2E",
      source: "fixture",
      external_id: "fin-e2e-overdue-10",
      reference_date: iso(addDays(now, -10)),
      metadata: { fixture: "finance-e2e", client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.highRiskClient, case_id: FIXTURE_IDS.caseOverdueHigh },
    },
    {
      id: FIXTURE_IDS.financialOverdue20,
      tenant_id: tenantId,
      case_id: FIXTURE_IDS.caseOverdueHigh,
      amount: 5300,
      status: "inadimplente",
      due_date: dateOnly(addDays(now, -20)),
      type: "receita",
      description: "Vencido 20 dias E2E",
      source: "fixture",
      external_id: "fin-e2e-overdue-20",
      reference_date: iso(addDays(now, -20)),
      metadata: { fixture: "finance-e2e", client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.highRiskClient, case_id: FIXTURE_IDS.caseOverdueHigh },
    },
    {
      id: FIXTURE_IDS.financialOverdue40,
      tenant_id: tenantId,
      case_id: FIXTURE_IDS.caseOverdueHigh,
      amount: 8500,
      status: "inadimplente",
      due_date: dateOnly(addDays(now, -40)),
      type: "receita",
      description: `Vencido critico - ${PLAYWRIGHT_FINANCE_FIXTURE_LABELS.highRiskClient}`,
      source: "fixture",
      external_id: "fin-e2e-overdue-40",
      reference_date: iso(addDays(now, -40)),
      metadata: { fixture: "finance-e2e", client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.highRiskClient, case_id: FIXTURE_IDS.caseOverdueHigh },
    },
    {
      id: FIXTURE_IDS.financialFixedCost,
      tenant_id: tenantId,
      case_id: null,
      amount: -700,
      status: "pago",
      due_date: dateOnly(addDays(now, -2)),
      type: "despesa",
      description: "Custo fixo E2E",
      source: "fixture",
      external_id: "fin-e2e-fixed-cost",
      reference_date: iso(addDays(now, -2)),
      metadata: { fixture: "finance-e2e" },
    },
    {
      id: FIXTURE_IDS.financialMarketingCost,
      tenant_id: tenantId,
      case_id: null,
      amount: -400,
      status: "pago",
      due_date: dateOnly(addDays(now, -2)),
      type: "despesa",
      description: "Marketing Ads E2E",
      source: "fixture",
      external_id: "fin-e2e-marketing-cost",
      reference_date: iso(addDays(now, -2)),
      metadata: { fixture: "finance-e2e", category: "marketing" },
    },
  ];
}

function buildPlatformTenants(now: Date) {
  return [
    {
      id: FIXTURE_IDS.platformActiveTenant,
      name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.activeTenantName,
      cnpj: "00.000.000/0001-61",
      plan_type: "beta",
      status: "ativo",
      billing_cycle: "mensal",
      billing_cycle_start: iso(addDays(now, -3)),
      billing_cycle_end: iso(addDays(now, 27)),
      max_processos: 100,
      asaas_customer_id: "cus-e2e-active",
      asaas_subscription_id: "sub-e2e-active",
      platform_billing_amount_cents: 64700,
      platform_billing_currency: "BRL",
      platform_billing_last_event_at: iso(addDays(now, -3)),
      last_payment_at: iso(addDays(now, -3)),
      last_payment_value: 647,
      last_payment_id: "platform-pay-e2e-active",
    },
    {
      id: FIXTURE_IDS.platformAnnualTenant,
      name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.annualTenantName,
      cnpj: "00.000.000/0001-62",
      plan_type: "beta",
      status: "ativo",
      billing_cycle: "anual",
      billing_cycle_start: iso(addDays(now, -2)),
      billing_cycle_end: iso(addDays(now, 363)),
      max_processos: 250,
      asaas_customer_id: "cus-e2e-annual",
      asaas_subscription_id: "sub-e2e-annual",
      platform_billing_amount_cents: 596400,
      platform_billing_currency: "BRL",
      platform_billing_last_event_at: iso(addDays(now, -2)),
      last_payment_at: iso(addDays(now, -2)),
      last_payment_value: 5964,
      last_payment_id: "platform-pay-e2e-annual",
    },
    {
      id: FIXTURE_IDS.platformTrialTenant,
      name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.trialTenantName,
      cnpj: "00.000.000/0001-63",
      plan_type: "beta",
      status: "trial",
      billing_cycle: "mensal",
      billing_cycle_start: iso(addDays(now, -9)),
      billing_cycle_end: iso(addDays(now, 5)),
      max_processos: 50,
      asaas_customer_id: "cus-e2e-trial",
      asaas_subscription_id: "sub-e2e-trial",
      platform_billing_amount_cents: 64700,
      platform_billing_currency: "BRL",
      platform_billing_last_event_at: iso(addDays(now, -9)),
      last_payment_at: null,
      last_payment_value: null,
      last_payment_id: null,
    },
    {
      id: FIXTURE_IDS.platformDelinquentTenant,
      name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.delinquentTenantName,
      cnpj: "00.000.000/0001-64",
      plan_type: "beta",
      status: "inadimplente",
      billing_cycle: "mensal",
      billing_cycle_start: iso(addDays(now, -42)),
      billing_cycle_end: iso(addDays(now, -FINANCE_EXPECTATIONS.delinquentDaysOverdue)),
      max_processos: 100,
      asaas_customer_id: "cus-e2e-delinquent",
      asaas_subscription_id: "sub-e2e-delinquent",
      platform_billing_amount_cents: 64700,
      platform_billing_currency: "BRL",
      platform_billing_last_event_at: iso(addDays(now, -FINANCE_EXPECTATIONS.delinquentDaysOverdue)),
      last_payment_at: iso(addDays(now, -45)),
      last_payment_value: 647,
      last_payment_id: "platform-pay-e2e-old",
    },
    {
      id: FIXTURE_IDS.platformCanceledTenant,
      name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.canceledTenantName,
      cnpj: "00.000.000/0001-65",
      plan_type: "beta",
      status: "cancelado",
      billing_cycle: "mensal",
      billing_cycle_start: iso(addDays(now, -80)),
      billing_cycle_end: iso(addDays(now, -50)),
      max_processos: 30,
      asaas_customer_id: "cus-e2e-canceled",
      asaas_subscription_id: "sub-e2e-canceled",
      platform_billing_amount_cents: 64700,
      platform_billing_currency: "BRL",
      platform_billing_last_event_at: iso(addDays(now, -50)),
      last_payment_at: iso(addDays(now, -80)),
      last_payment_value: 647,
      last_payment_id: "platform-pay-e2e-canceled",
    },
  ];
}

function buildSalesRows(tenantId: string, now: Date) {
  return [
    {
      id: FIXTURE_IDS.salePending,
      tenant_id: tenantId,
      client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.commercialPendingClient,
      professional_name: "Closer E2E",
      ticket_total: FINANCE_EXPECTATIONS.commercialPendingContracts,
      installments: 3,
      contract_date: dateOnly(addDays(now, 8)),
      status: "Pendente",
      commission_value: 0,
      fixed_salary: 0,
      estimated_earnings: 0,
      sale_number_month: 1,
    },
    {
      id: FIXTURE_IDS.saleClosed,
      tenant_id: tenantId,
      client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.commercialClosedClient,
      professional_name: "Closer E2E",
      ticket_total: 8000,
      installments: 4,
      contract_date: dateOnly(addDays(now, -6)),
      status: "Fechado",
      commission_value: 500,
      fixed_salary: 0,
      estimated_earnings: 8000,
      sale_number_month: 2,
    },
    {
      id: FIXTURE_IDS.saleLost,
      tenant_id: tenantId,
      client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.commercialLostClient,
      professional_name: "Closer E2E",
      ticket_total: 1200,
      installments: 1,
      contract_date: dateOnly(addDays(now, -4)),
      status: "Perdido",
      commission_value: 0,
      fixed_salary: 0,
      estimated_earnings: 0,
      sale_number_month: 3,
    },
  ];
}

function buildCrmCommercialRows(tenantId: string, now: Date) {
  return {
    pipeline: {
      id: FIXTURE_IDS.crmPipelineCommercial,
      tenant_id: tenantId,
      name: "Comercial Financeiro E2E",
      description: "Fixture forecast comercial financeiro",
      tags: ["finance-e2e"],
      sectors: ["Financeiro"],
    },
    stages: [
      {
        id: FIXTURE_IDS.crmStageProposal,
        pipeline_id: FIXTURE_IDS.crmPipelineCommercial,
        name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.commercialProposalStage,
        color: "#22d3ee",
        order_index: 1,
        is_win: false,
        is_loss: false,
      },
      {
        id: FIXTURE_IDS.crmStageWon,
        pipeline_id: FIXTURE_IDS.crmPipelineCommercial,
        name: "Fechado E2E",
        color: "#4ade80",
        order_index: 2,
        is_win: true,
        is_loss: false,
      },
      {
        id: FIXTURE_IDS.crmStageLost,
        pipeline_id: FIXTURE_IDS.crmPipelineCommercial,
        name: "Perdido E2E",
        color: "#f87171",
        order_index: 3,
        is_win: false,
        is_loss: true,
      },
    ],
    tasks: [
      {
        id: FIXTURE_IDS.crmTaskProposal,
        tenant_id: tenantId,
        pipeline_id: FIXTURE_IDS.crmPipelineCommercial,
        stage_id: FIXTURE_IDS.crmStageProposal,
        title: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.commercialProposalClient,
        description: "Oportunidade aberta para validar forecast comercial financeiro.",
        position_index: 1,
        value: 7000,
        tags: ["finance-e2e", "proposta"],
        source: "indicacao",
        data_ultima_movimentacao: iso(addDays(now, -1)),
      },
      {
        id: FIXTURE_IDS.crmTaskWon,
        tenant_id: tenantId,
        pipeline_id: FIXTURE_IDS.crmPipelineCommercial,
        stage_id: FIXTURE_IDS.crmStageWon,
        title: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.commercialClosedClient,
        description: "Oportunidade ganha para validar contratos fechados.",
        position_index: 2,
        value: 5000,
        tags: ["finance-e2e", "fechado"],
        source: "google",
        data_ultima_movimentacao: iso(addDays(now, -2)),
      },
      {
        id: FIXTURE_IDS.crmTaskLost,
        tenant_id: tenantId,
        pipeline_id: FIXTURE_IDS.crmPipelineCommercial,
        stage_id: FIXTURE_IDS.crmStageLost,
        title: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.commercialLostClient,
        description: "Oportunidade perdida para validar exclusao da projecao.",
        position_index: 3,
        value: 900,
        tags: ["finance-e2e", "perdido"],
        source: "instagram",
        motivo_perda: "Fixture E2E",
        data_ultima_movimentacao: iso(addDays(now, -3)),
      },
    ],
  };
}

function buildPlatformEvents(now: Date) {
  return [
    {
      id: FIXTURE_IDS.platformPaidEventMonthly,
      tenant_id: FIXTURE_IDS.platformActiveTenant,
      provider: "asaas",
      event_name: "PAYMENT_CONFIRMED",
      external_id: "platform-pay-e2e-active",
      customer_id: "cus-e2e-active",
      subscription_id: "sub-e2e-active",
      payment_id: "platform-pay-e2e-active",
      asaas_event: "PAYMENT_CONFIRMED",
      event_type: "received",
      billing_status: "received",
      amount_cents: 64700,
      currency: "BRL",
      gross_amount: 647,
      net_amount: 647,
      status: "CONFIRMED",
      due_date: dateOnly(addDays(now, -3)),
      paid_at: iso(addDays(now, -3)),
      occurred_at: iso(addDays(now, -3)),
      metadata: { fixture: "finance-e2e" },
      raw_payload: { fixture: "finance-e2e", redacted: true },
    },
    {
      id: FIXTURE_IDS.platformPaidEventAnnual,
      tenant_id: FIXTURE_IDS.platformAnnualTenant,
      provider: "asaas",
      event_name: "PAYMENT_RECEIVED",
      external_id: "platform-pay-e2e-annual",
      customer_id: "cus-e2e-annual",
      subscription_id: "sub-e2e-annual",
      payment_id: "platform-pay-e2e-annual",
      asaas_event: "PAYMENT_RECEIVED",
      event_type: "received",
      billing_status: "received",
      amount_cents: 596400,
      currency: "BRL",
      gross_amount: 5964,
      net_amount: 5964,
      status: "RECEIVED",
      due_date: dateOnly(addDays(now, -2)),
      paid_at: iso(addDays(now, -2)),
      occurred_at: iso(addDays(now, -2)),
      metadata: { fixture: "finance-e2e" },
      raw_payload: { fixture: "finance-e2e", redacted: true },
    },
    {
      id: FIXTURE_IDS.platformOverdueEvent,
      tenant_id: FIXTURE_IDS.platformDelinquentTenant,
      provider: "asaas",
      event_name: "PAYMENT_OVERDUE",
      external_id: "platform-pay-e2e-delinquent",
      customer_id: "cus-e2e-delinquent",
      subscription_id: "sub-e2e-delinquent",
      payment_id: "platform-pay-e2e-delinquent",
      asaas_event: "PAYMENT_OVERDUE",
      event_type: "overdue",
      billing_status: "overdue",
      amount_cents: 64700,
      currency: "BRL",
      gross_amount: 647,
      net_amount: 647,
      status: "OVERDUE",
      due_date: dateOnly(addDays(now, -FINANCE_EXPECTATIONS.delinquentDaysOverdue)),
      paid_at: null,
      occurred_at: iso(addDays(now, -FINANCE_EXPECTATIONS.delinquentDaysOverdue)),
      metadata: { fixture: "finance-e2e" },
      raw_payload: { fixture: "finance-e2e", redacted: true },
    },
  ];
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Erro desconhecido");
}

async function upsertOrThrow(supabase: any, table: string, rows: unknown | unknown[], onConflict = "id") {
  const { error } = await supabase.from(table).upsert(rows, { onConflict });
  if (error) throw new Error(`Falha ao preparar fixture E2E em ${table}: ${error.message}`);
}

async function deleteFixtureRowsByMetadata(supabase: any, table: string, tenantId: string) {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq("tenant_id", tenantId)
    .contains("metadata", { fixture: "finance-e2e" });

  if (error) throw new Error(`Falha ao limpar fixture E2E em ${table}: ${error.message}`);
}

export async function ensurePlaywrightFinanceFixture(params: { now?: Date } = {}): Promise<PlaywrightFinanceFixtureInfo> {
  const env = { ...loadEnvFile(), ...process.env };
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const email = env.PLAYWRIGHT_EMAIL?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios para a fixture financeira E2E.");
  }

  if (!email) {
    throw new Error("PLAYWRIGHT_EMAIL e obrigatorio para resolver o tenant da fixture financeira E2E.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = params.now || new Date();
  const user = await resolvePlaywrightUser(supabase, email);
  if (!user?.id) {
    throw new Error("PLAYWRIGHT_EMAIL nao foi encontrado no Supabase auth para a fixture financeira E2E.");
  }

  const tenantId = await resolveFixtureTenantId(supabase, env, user);
  const profile = await resolveProfile(supabase, user.id);
  await ensureUserTenantMetadata(supabase, user, tenantId, profile);

  await deleteFixtureRowsByMetadata(supabase, "brain_artifacts", tenantId);
  await deleteFixtureRowsByMetadata(supabase, "financials", tenantId);

  await upsertOrThrow(supabase, "cases", [
    { id: FIXTURE_IDS.caseMatched, tenant_id: tenantId, client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.matchedClient, case_number: "FIN-E2E-0001", status: "Ativo" },
    { id: FIXTURE_IDS.caseOverdueHigh, tenant_id: tenantId, client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.highRiskClient, case_number: "FIN-E2E-0002", status: "Ativo" },
    { id: FIXTURE_IDS.caseForecast, tenant_id: tenantId, client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.forecastClient, case_number: "FIN-E2E-0003", status: "Ativo" },
    { id: FIXTURE_IDS.caseBlocked, tenant_id: tenantId, client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.blockedClient, case_number: "FIN-E2E-0004", status: "Analise" },
  ]);

  await upsertOrThrow(supabase, "financials", buildFinancialRows(tenantId, now));
  await upsertOrThrow(supabase, "sales", buildSalesRows(tenantId, now));
  const commercialCrm = buildCrmCommercialRows(tenantId, now);
  await upsertOrThrow(supabase, "crm_pipelines", commercialCrm.pipeline);
  await upsertOrThrow(supabase, "crm_stages", commercialCrm.stages);
  await upsertOrThrow(supabase, "crm_tasks", commercialCrm.tasks);
  await upsertOrThrow(supabase, "process_pipelines", {
    id: FIXTURE_IDS.pipelineId,
    tenant_id: tenantId,
    name: "Pipeline Financeiro E2E",
    description: "Fixture financeira E2E",
    tags: ["finance-e2e"],
    sectors: ["Financeiro"],
  });
  await upsertOrThrow(supabase, "process_stages", {
    id: FIXTURE_IDS.stageId,
    pipeline_id: FIXTURE_IDS.pipelineId,
    name: "Revenue-to-case E2E",
    color: "#CCA761",
    order_index: 1,
    is_win: false,
    is_loss: false,
  });
  await upsertOrThrow(supabase, "process_tasks", {
    id: FIXTURE_IDS.processTaskMatched,
    tenant_id: tenantId,
    pipeline_id: FIXTURE_IDS.pipelineId,
    stage_id: FIXTURE_IDS.stageId,
    client_id: null,
    title: `Caso aberto - ${PLAYWRIGHT_FINANCE_FIXTURE_LABELS.matchedClient}`,
    description: "Pagamento confirmado virou caso/tarefa juridica na fixture financeira.",
    position_index: 1,
    value: 3200,
    tags: ["revenue_to_case", "finance-e2e"],
    source: "revenue_to_case",
    client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.matchedClient,
    sector: "Financeiro",
    demanda: "Revenue-to-case",
    data_ultima_movimentacao: iso(now),
  });

  await upsertOrThrow(supabase, "brain_tasks", {
    id: FIXTURE_IDS.brainTaskId,
    tenant_id: tenantId,
    channel: "e2e",
    module: "finance",
    status: "completed",
    title: "Financeiro E2E",
    goal: "Validar smoke financeiro autenticado",
    task_input: { fixture: "finance-e2e" },
    task_context: { fixture: "finance-e2e" },
    policy_snapshot: { supervised: true },
    result_summary: "Fixture financeira E2E preparada.",
    started_at: iso(addDays(now, -1)),
    completed_at: iso(now),
  });
  await upsertOrThrow(supabase, "brain_runs", {
    id: FIXTURE_IDS.brainRunId,
    task_id: FIXTURE_IDS.brainTaskId,
    tenant_id: tenantId,
    attempt_number: 1,
    status: "completed",
    summary: "Fixture financeira E2E preparada.",
    started_at: iso(addDays(now, -1)),
    completed_at: iso(now),
  });
  await upsertOrThrow(supabase, "brain_steps", {
    id: FIXTURE_IDS.brainStepId,
    task_id: FIXTURE_IDS.brainTaskId,
    run_id: FIXTURE_IDS.brainRunId,
    tenant_id: tenantId,
    order_index: 1,
    step_key: "finance-e2e",
    title: "Preparar fixture financeira",
    step_type: "operation",
    capability_name: "financeiro_beta_smoke",
    handler_type: "fixture",
    approval_policy: "human_review",
    status: "completed",
    input_payload: { fixture: "finance-e2e" },
    output_payload: { fixture: "finance-e2e" },
  });
  await upsertOrThrow(supabase, "brain_artifacts", [
    {
      id: FIXTURE_IDS.collectionArtifact,
      task_id: FIXTURE_IDS.brainTaskId,
      run_id: FIXTURE_IDS.brainRunId,
      step_id: FIXTURE_IDS.brainStepId,
      tenant_id: tenantId,
      artifact_type: "collections_followup_plan",
      title: "Plano de cobranca E2E",
      storage_url: null,
      mime_type: "application/json",
      source_module: "finance",
      metadata: {
        fixture: "finance-e2e",
        client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.highRiskClient,
        amount: 8500,
        days_overdue: 40,
        due_date: dateOnly(addDays(now, -40)),
        collection_stage: "delinquency",
        collection_priority: "high",
        next_best_action: "Revisar cobranca supervisionada antes de novo contato.",
        requires_human_approval: true,
        external_side_effects_blocked: true,
      },
    },
    {
      id: FIXTURE_IDS.asaasMatchedArtifact,
      task_id: FIXTURE_IDS.brainTaskId,
      run_id: FIXTURE_IDS.brainRunId,
      step_id: FIXTURE_IDS.brainStepId,
      tenant_id: tenantId,
      artifact_type: "asaas_billing",
      title: "Pagamento Asaas E2E casado",
      storage_url: null,
      mime_type: "application/json",
      source_module: "finance",
      metadata: {
        fixture: "finance-e2e",
        payment_id: "pay-e2e-fin-matched",
        crm_task_id: "crm-e2e-fin-matched",
        client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.matchedClient,
        amount: 3200,
      },
    },
    {
      id: FIXTURE_IDS.revenueCaseArtifact,
      task_id: FIXTURE_IDS.brainTaskId,
      run_id: FIXTURE_IDS.brainRunId,
      step_id: FIXTURE_IDS.brainStepId,
      tenant_id: tenantId,
      artifact_type: "revenue_case_opening",
      title: "Revenue-to-case E2E casado",
      storage_url: null,
      mime_type: "application/json",
      source_module: "finance",
      metadata: {
        fixture: "finance-e2e",
        payment_id: "pay-e2e-fin-matched",
        crm_task_id: "crm-e2e-fin-matched",
        client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.matchedClient,
        amount: 3200,
        case_id: FIXTURE_IDS.caseMatched,
        process_task_id: FIXTURE_IDS.processTaskMatched,
      },
    },
    {
      id: FIXTURE_IDS.asaasBlockedArtifact,
      task_id: FIXTURE_IDS.brainTaskId,
      run_id: FIXTURE_IDS.brainRunId,
      step_id: FIXTURE_IDS.brainStepId,
      tenant_id: tenantId,
      artifact_type: "asaas_billing",
      title: "Pagamento Asaas E2E bloqueado",
      storage_url: null,
      mime_type: "application/json",
      source_module: "finance",
      metadata: {
        fixture: "finance-e2e",
        payment_id: "pay-e2e-fin-blocked",
        client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.blockedClient,
        amount: 1400,
      },
    },
    {
      id: FIXTURE_IDS.asaasPartialArtifact,
      task_id: FIXTURE_IDS.brainTaskId,
      run_id: FIXTURE_IDS.brainRunId,
      step_id: FIXTURE_IDS.brainStepId,
      tenant_id: tenantId,
      artifact_type: "asaas_billing",
      title: "Pagamento Asaas E2E parcial",
      storage_url: null,
      mime_type: "application/json",
      source_module: "finance",
      metadata: {
        fixture: "finance-e2e",
        payment_id: "pay-e2e-fin-partial",
        client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.partialClient,
        amount: 2100,
      },
    },
    {
      id: FIXTURE_IDS.revenuePlanPartialArtifact,
      task_id: FIXTURE_IDS.brainTaskId,
      run_id: FIXTURE_IDS.brainRunId,
      step_id: FIXTURE_IDS.brainStepId,
      tenant_id: tenantId,
      artifact_type: "revenue_flow_plan",
      title: "Plano revenue-to-case E2E parcial",
      storage_url: null,
      mime_type: "application/json",
      source_module: "finance",
      metadata: {
        fixture: "finance-e2e",
        payment_id: "pay-e2e-fin-partial",
        client_name: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.partialClient,
        amount: 2100,
      },
    },
  ]);

  let platformReady = true;
  let platformBlocker: string | null = null;
  try {
    await upsertOrThrow(supabase, "tenants", buildPlatformTenants(now));
    await upsertOrThrow(supabase, "platform_billing_events", buildPlatformEvents(now));
  } catch (error) {
    platformReady = false;
    platformBlocker = safeErrorMessage(error);
  }

  return {
    tenantId,
    userIsSuperadmin: profile?.is_superadmin === true,
    dashboard: {
      receivedRevenue: FINANCE_EXPECTATIONS.receivedRevenue,
      forecastRevenue: FINANCE_EXPECTATIONS.forecastRevenue,
      overdueRevenue: FINANCE_EXPECTATIONS.overdueRevenue,
      openCharges: FINANCE_EXPECTATIONS.openCharges,
      highRiskClient: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.highRiskClient,
      commercialPipeline: FINANCE_EXPECTATIONS.commercialPipeline,
      commercialPendingContracts: FINANCE_EXPECTATIONS.commercialPendingContracts,
      commercialClosedContracts: FINANCE_EXPECTATIONS.commercialClosedContracts,
      commercialLostAmount: FINANCE_EXPECTATIONS.commercialLostAmount,
      commercialProposalStage: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.commercialProposalStage,
      commercialTopOpportunity: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.commercialProposalClient,
    },
    admin: {
      platformReady,
      platformBlocker,
      activeTenantName: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.activeTenantName,
      delinquentTenantName: PLAYWRIGHT_FINANCE_FIXTURE_LABELS.delinquentTenantName,
      monthlyMrr: FINANCE_EXPECTATIONS.monthlyMrr,
      delinquentDaysOverdue: FINANCE_EXPECTATIONS.delinquentDaysOverdue,
    },
  };
}

export const PLAYWRIGHT_FINANCE_FIXTURE_IDS = FIXTURE_IDS;
