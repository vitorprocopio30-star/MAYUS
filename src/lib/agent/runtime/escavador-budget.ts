import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildMayusActivityEvent, DEFAULT_ESCAVADOR_BUDGET_POLICY, evaluateMayusBudget } from "@/lib/agent/runtime/governance";

type EscavadorBudgetClient = {
  from: (table: string) => any;
};

export type EscavadorBudgetPolicy = {
  enabled?: boolean;
  cache_first?: boolean;
  require_paid_search_confirmation?: boolean;
  monthly_limit_cents?: number;
  credit_cost_cents?: number;
  warn_at_ratio?: number;
  hard_stop?: boolean;
};

export type EscavadorBudgetCheck = {
  allowed: boolean;
  policy: Required<EscavadorBudgetPolicy>;
  decision: ReturnType<typeof evaluateMayusBudget>;
  spentCredits: number;
  spentCostCents: number;
};

function normalizePolicy(value: unknown): Required<EscavadorBudgetPolicy> {
  const policy = value && typeof value === "object" ? value as EscavadorBudgetPolicy : {};
  return {
    enabled: policy.enabled !== false,
    cache_first: policy.cache_first !== false,
    require_paid_search_confirmation: policy.require_paid_search_confirmation !== false,
    monthly_limit_cents: typeof policy.monthly_limit_cents === "number"
      ? policy.monthly_limit_cents
      : DEFAULT_ESCAVADOR_BUDGET_POLICY.monthly_limit_cents,
    credit_cost_cents: typeof policy.credit_cost_cents === "number"
      ? Math.max(1, Math.round(policy.credit_cost_cents))
      : 100,
    warn_at_ratio: typeof policy.warn_at_ratio === "number"
      ? policy.warn_at_ratio
      : DEFAULT_ESCAVADOR_BUDGET_POLICY.warn_at_ratio,
    hard_stop: policy.hard_stop !== false,
  };
}

export async function getEscavadorBudgetPolicy(params: {
  tenantId: string;
  client?: EscavadorBudgetClient;
}) {
  const client = params.client || supabaseAdmin;

  try {
    const { data, error } = await client
      .from("tenant_settings")
      .select("ai_features")
      .eq("tenant_id", params.tenantId)
      .maybeSingle();

    if (error) throw error;
    return normalizePolicy(data?.ai_features?.escavador_budget_policy);
  } catch (error) {
    console.error("[escavador-budget] fallback", error);
    return normalizePolicy(null);
  }
}

async function getCurrentMonthEscavadorUsage(params: {
  tenantId: string;
  client: EscavadorBudgetClient;
  creditCostCents: number;
}) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  try {
    let query = params.client
      .from("api_usage_log")
      .select("creditos")
      .eq("tenant_id", params.tenantId)
      .gte("created_at", start.toISOString());

    if (typeof query.ilike === "function") {
      query = query.ilike("endpoint", "%escavador%");
    }

    const { data, error } = await query;
    if (error) throw error;

    const spentCredits = (data || []).reduce((sum: number, row: { creditos?: number | string | null }) => {
      const credits = Number(row.creditos || 0);
      return sum + Math.max(0, Math.round(credits));
    }, 0);
    return {
      spentCredits,
      spentCostCents: spentCredits * params.creditCostCents,
    };
  } catch (error) {
    console.error("[escavador-budget] usage", error);
    return {
      spentCredits: 0,
      spentCostCents: 0,
    };
  }
}

export async function evaluateEscavadorBudget(params: {
  tenantId: string;
  estimatedCostCents: number;
  client?: EscavadorBudgetClient;
}): Promise<EscavadorBudgetCheck> {
  const client = params.client || supabaseAdmin;
  const policy = await getEscavadorBudgetPolicy({ tenantId: params.tenantId, client });
  const usage = await getCurrentMonthEscavadorUsage({
    tenantId: params.tenantId,
    client,
    creditCostCents: policy.credit_cost_cents,
  });
  const decision = evaluateMayusBudget({
    estimatedCostCents: params.estimatedCostCents,
    policies: [{
      id: "escavador_monthly",
      scope: "escavador",
      label: "Escavador",
      limitCents: policy.enabled ? policy.monthly_limit_cents : 0,
      spentCents: usage.spentCostCents,
      warnAtRatio: policy.warn_at_ratio,
      hardStop: policy.hard_stop,
    }],
  });

  return {
    allowed: policy.enabled && decision.status !== "blocked",
    policy,
    decision,
    spentCredits: usage.spentCredits,
    spentCostCents: usage.spentCostCents,
  };
}

export async function registerEscavadorBudgetEvent(params: {
  tenantId: string;
  userId?: string | null;
  action: string;
  source: string;
  status: "ok" | "warning" | "blocked";
  estimatedCostCents: number;
  decision: EscavadorBudgetCheck["decision"];
  client?: EscavadorBudgetClient;
}) {
  const client = params.client || supabaseAdmin;
  const event = buildMayusActivityEvent({
    tenantId: params.tenantId,
    actorId: params.userId || null,
    source: "runtime_governance",
    eventName: `escavador_budget_${params.status}`,
    status: params.status,
    payload: {
      action: params.action,
      source: params.source,
      estimated_cost_cents: params.estimatedCostCents,
      projected_cents: params.decision.projectedCents,
      remaining_cents: params.decision.remainingCents,
      reasons: params.decision.reasons,
      agent_control: {
        primary_agent_id: "monitoring_agent",
        billing_agent_id: "finance_agent",
        approval_required: true,
        paid_external_action: true,
      },
    },
  });

  try {
    await client.from("system_event_logs").insert({
      tenant_id: event.tenantId,
      user_id: event.actorId,
      source: "escavador",
      provider: "mayus",
      event_name: event.eventName,
      status: event.status,
      payload: event.payload,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[escavador-budget] event", error);
  }
}

export function buildEscavadorBudgetBlockedPayload(check: EscavadorBudgetCheck) {
  return {
    error: "Busca paga do Escavador bloqueada pela policy de budget do MAYUS.",
    budget: {
      status: check.decision.status,
      remaining_cents: check.decision.remainingCents,
      projected_cents: check.decision.projectedCents,
      spent_credits: check.spentCredits,
      spent_cost_cents: check.spentCostCents,
      credit_cost_cents: check.policy.credit_cost_cents,
      reasons: check.decision.reasons,
    },
    agent_control: {
      primary_agent_id: "monitoring_agent",
      billing_agent_id: "finance_agent",
      approval_required: true,
      paid_external_action: true,
    },
  };
}
