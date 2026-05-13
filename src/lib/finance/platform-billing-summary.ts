import type { SupabaseClient } from "@supabase/supabase-js";

const ACTIVE_STATUS = "ativo";
const TRIAL_STATUS = "trial";
const DELINQUENT_STATUS = "inadimplente";
const CANCELED_STATUS = "cancelado";

const PAID_EVENTS = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_RECEIVED_IN_CASH"]);

const PLAN_PRICES = {
  mensal: {
    billingAmount: 647,
    monthlyEquivalent: 647,
    annualEquivalent: 647 * 12,
  },
  anual: {
    billingAmount: 5964,
    monthlyEquivalent: 497,
    annualEquivalent: 5964,
  },
} as const;

export type PlatformTenantBillingRow = {
  id: string;
  name: string | null;
  plan_type: string | null;
  status: string | null;
  billing_cycle: string | null;
  billing_cycle_start?: string | null;
  billing_cycle_end?: string | null;
  created_at: string | null;
  max_processos: number | null;
  asaas_customer_id?: string | null;
  asaas_subscription_id?: string | null;
  last_payment_at?: string | null;
  last_payment_value?: number | string | null;
  last_payment_id?: string | null;
  platform_billing_amount_cents?: number | string | null;
  platform_billing_currency?: string | null;
};

export type PlatformBillingEventRow = {
  id?: string | null;
  tenant_id: string | null;
  provider?: string | null;
  event_name?: string | null;
  external_id?: string | null;
  customer_id?: string | null;
  subscription_id?: string | null;
  payment_id?: string | null;
  asaas_event?: string | null;
  event_type?: string | null;
  billing_status?: string | null;
  amount_cents?: number | string | null;
  currency?: string | null;
  due_date?: string | null;
  paid_at?: string | null;
  gross_amount?: number | string | null;
  net_amount?: number | string | null;
  status?: string | null;
  raw_payload?: Record<string, unknown> | null;
  occurred_at?: string | null;
  created_at?: string | null;
};

export type NormalizedPlatformBillingEvent = {
  eventType: "pending" | "received" | "overdue" | "canceled";
  billingStatus: "pending" | "received" | "overdue" | "canceled";
  tenantStatus: "ativo" | "inadimplente" | "cancelado" | null;
};

export function amountToCents(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100);
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
  }
  return null;
}

export function normalizePlatformBillingEvent(event?: string | null): NormalizedPlatformBillingEvent | null {
  switch (event) {
    case "PAYMENT_CREATED":
    case "PAYMENT_UPDATED":
    case "PAYMENT_RESTORED":
      return { eventType: "pending", billingStatus: "pending", tenantStatus: null };
    case "PAYMENT_CONFIRMED":
    case "PAYMENT_RECEIVED":
    case "PAYMENT_RECEIVED_IN_CASH":
      return { eventType: "received", billingStatus: "received", tenantStatus: ACTIVE_STATUS };
    case "PAYMENT_OVERDUE":
      return { eventType: "overdue", billingStatus: "overdue", tenantStatus: DELINQUENT_STATUS };
    case "PAYMENT_DELETED":
    case "SUBSCRIPTION_DELETED":
    case "SUBSCRIPTION_INACTIVATED":
      return { eventType: "canceled", billingStatus: "canceled", tenantStatus: CANCELED_STATUS };
    default:
      return null;
  }
}

export type PlatformFinanceTenant = {
  id: string;
  name: string;
  planType: string | null;
  status: string;
  billingCycle: string | null;
  createdAt: string | null;
  billingCycleStart: string | null;
  billingCycleEnd: string | null;
  maxProcessos: number | null;
  asaasCustomerId: string | null;
  asaasSubscriptionId: string | null;
  lastPaymentAt: string | null;
  lastPaymentValue: number;
  lastPaymentId: string | null;
  expectedBillingAmount: number;
  expectedMonthlyValue: number;
  expectedAnnualValue: number;
  daysOverdue: number;
};

export type PlatformFinanceSummary = {
  generatedAt: string;
  totals: {
    tenants: number;
    active: number;
    trial: number;
    delinquent: number;
    canceled: number;
    mrr: number;
    arr: number;
    atRiskMrr: number;
    receivedTotal: number;
    receivedThisMonth: number;
    overdueExpectedAmount: number;
    trialEndingSoon: number;
  };
  tenants: PlatformFinanceTenant[];
};

type LoadPlatformFinanceSummaryInput = {
  supabase: SupabaseClient;
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

function money(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function daysBetween(from: Date, to: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const start = new Date(from);
  const end = new Date(to);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / msPerDay));
}

function pricingForCycle(cycle?: string | null) {
  const normalized = normalizeText(cycle);
  if (normalized.includes("anual") || normalized.includes("year")) return PLAN_PRICES.anual;
  return PLAN_PRICES.mensal;
}

function pricingForTenant(tenant: PlatformTenantBillingRow) {
  const base = pricingForCycle(tenant.billing_cycle);
  const configuredAmount = money(tenant.platform_billing_amount_cents) / 100;
  if (!configuredAmount) return base;

  const normalizedCycle = normalizeText(tenant.billing_cycle);
  const isAnnual = normalizedCycle.includes("anual") || normalizedCycle.includes("year");
  return {
    billingAmount: roundMoney(configuredAmount),
    monthlyEquivalent: roundMoney(isAnnual ? configuredAmount / 12 : configuredAmount),
    annualEquivalent: roundMoney(isAnnual ? configuredAmount : configuredAmount * 12),
  };
}

function statusKey(status?: string | null) {
  const normalized = normalizeText(status);
  if (normalized.includes("inadimpl")) return DELINQUENT_STATUS;
  if (normalized.includes("cancel")) return CANCELED_STATUS;
  if (normalized.includes("trial")) return TRIAL_STATUS;
  if (normalized.includes("ativo") || normalized.includes("active")) return ACTIVE_STATUS;
  return normalized || "desconhecido";
}

function paidAmountFromEvents(events: PlatformBillingEventRow[], now: Date) {
  const monthStart = startOfMonth(now);
  const paidByExternalId = new Map<string, PlatformBillingEventRow>();

  for (const event of events) {
    const eventName = String(event.event_name || "");
    const externalId = compactText(event.external_id, "");
    if (!externalId || !PAID_EVENTS.has(eventName)) continue;

    const current = paidByExternalId.get(externalId);
    const currentDate = parseDate(current?.occurred_at || current?.created_at)?.getTime() || 0;
    const nextDate = parseDate(event.occurred_at || event.created_at)?.getTime() || 0;
    if (!current || nextDate >= currentDate) {
      paidByExternalId.set(externalId, event);
    }
  }

  let receivedTotal = 0;
  let receivedThisMonth = 0;
  paidByExternalId.forEach((event) => {
    const amount = money(event.net_amount) || money(event.gross_amount) || (money(event.amount_cents) / 100);
    const occurredAt = parseDate(event.occurred_at || event.created_at);
    receivedTotal += amount;
    if (occurredAt && occurredAt >= monthStart && occurredAt <= now) {
      receivedThisMonth += amount;
    }
  });

  return {
    receivedTotal: roundMoney(receivedTotal),
    receivedThisMonth: roundMoney(receivedThisMonth),
  };
}

export function buildPlatformFinanceSummaryFromRows(input: {
  tenants?: PlatformTenantBillingRow[] | null;
  events?: PlatformBillingEventRow[] | null;
  now?: Date;
}): PlatformFinanceSummary {
  const now = input.now || new Date();
  const tenants = Array.isArray(input.tenants) ? input.tenants : [];
  const events = Array.isArray(input.events) ? input.events : [];
  const trialCutoff = addDays(now, 7);

  const tenantSummaries = tenants.map<PlatformFinanceTenant>((tenant) => {
    const pricing = pricingForTenant(tenant);
    const status = statusKey(tenant.status);
    const cycleEnd = parseDate(tenant.billing_cycle_end || null);

    return {
      id: tenant.id,
      name: compactText(tenant.name, "Escritorio sem nome"),
      planType: tenant.plan_type || null,
      status,
      billingCycle: tenant.billing_cycle || null,
      createdAt: tenant.created_at || null,
      billingCycleStart: tenant.billing_cycle_start || null,
      billingCycleEnd: tenant.billing_cycle_end || null,
      maxProcessos: tenant.max_processos ?? null,
      asaasCustomerId: tenant.asaas_customer_id || null,
      asaasSubscriptionId: tenant.asaas_subscription_id || null,
      lastPaymentAt: tenant.last_payment_at || null,
      lastPaymentValue: roundMoney(money(tenant.last_payment_value)),
      lastPaymentId: tenant.last_payment_id || null,
      expectedBillingAmount: pricing.billingAmount,
      expectedMonthlyValue: pricing.monthlyEquivalent,
      expectedAnnualValue: pricing.annualEquivalent,
      daysOverdue: status === DELINQUENT_STATUS && cycleEnd ? daysBetween(cycleEnd, now) : 0,
    };
  });

  const activeTenants = tenantSummaries.filter((tenant) => tenant.status === ACTIVE_STATUS);
  const delinquentTenants = tenantSummaries.filter((tenant) => tenant.status === DELINQUENT_STATUS);
  const paid = paidAmountFromEvents(events, now);

  return {
    generatedAt: now.toISOString(),
    totals: {
      tenants: tenantSummaries.length,
      active: activeTenants.length,
      trial: tenantSummaries.filter((tenant) => tenant.status === TRIAL_STATUS).length,
      delinquent: delinquentTenants.length,
      canceled: tenantSummaries.filter((tenant) => tenant.status === CANCELED_STATUS).length,
      mrr: roundMoney(activeTenants.reduce((sum, tenant) => sum + tenant.expectedMonthlyValue, 0)),
      arr: roundMoney(activeTenants.reduce((sum, tenant) => sum + tenant.expectedAnnualValue, 0)),
      atRiskMrr: roundMoney(delinquentTenants.reduce((sum, tenant) => sum + tenant.expectedMonthlyValue, 0)),
      receivedTotal: paid.receivedTotal,
      receivedThisMonth: paid.receivedThisMonth,
      overdueExpectedAmount: roundMoney(delinquentTenants.reduce((sum, tenant) => sum + tenant.expectedBillingAmount, 0)),
      trialEndingSoon: tenantSummaries.filter((tenant) => {
        const end = parseDate(tenant.billingCycleEnd);
        return tenant.status === TRIAL_STATUS && Boolean(end && end >= now && end <= trialCutoff);
      }).length,
    },
    tenants: tenantSummaries,
  };
}

export async function loadPlatformFinanceSummary(input: LoadPlatformFinanceSummaryInput) {
  const [tenantResult, billingEventsResult] = await Promise.all([
    input.supabase
      .from("tenants")
      .select("id, name, plan_type, status, billing_cycle, billing_cycle_start, billing_cycle_end, created_at, max_processos, asaas_customer_id, asaas_subscription_id, last_payment_at, last_payment_value, last_payment_id, platform_billing_amount_cents, platform_billing_currency")
      .order("created_at", { ascending: false }),
    input.supabase
      .from("platform_billing_events")
      .select("id, tenant_id, provider, event_name, external_id, customer_id, subscription_id, payment_id, asaas_event, event_type, billing_status, amount_cents, currency, due_date, paid_at, gross_amount, net_amount, status, occurred_at, created_at")
      .order("occurred_at", { ascending: false })
      .limit(1000),
  ]);

  if (tenantResult.error) {
    throw tenantResult.error;
  }

  if (billingEventsResult.error) {
    throw billingEventsResult.error;
  }

  return buildPlatformFinanceSummaryFromRows({
    tenants: tenantResult.data as PlatformTenantBillingRow[] | null,
    events: billingEventsResult.data as PlatformBillingEventRow[] | null,
    now: input.now,
  });
}
