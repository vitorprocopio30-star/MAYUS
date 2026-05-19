export type MayusBudgetScope =
  | "tenant"
  | "agent"
  | "module"
  | "escavador"
  | "provider";

export type MayusBudgetPolicy = {
  id: string;
  scope: MayusBudgetScope;
  label: string;
  limitCents: number;
  spentCents: number;
  warnAtRatio?: number;
  hardStop?: boolean;
};

export type MayusBudgetDecision = {
  status: "ok" | "warning" | "blocked";
  remainingCents: number;
  projectedCents: number;
  reasons: string[];
};

export type MayusActivityEvent = {
  tenantId: string;
  actorId?: string | null;
  source: "operating_partner" | "setup_doctor" | "runtime_governance";
  eventName: string;
  status: "ok" | "warning" | "blocked";
  payload: Record<string, unknown>;
};

export type MayusHeartbeatRoutine = {
  id: string;
  agentId: string;
  module: string;
  enabled: boolean;
  paused?: boolean;
  budgetPolicyId?: string | null;
  wakeReason: string;
};

const SECRET_KEY_PATTERN = /(api[_-]?key|token|secret|password|senha|authorization|bearer)/i;
const SECRET_VALUE_PATTERN = /(bearer\s+[a-z0-9._~+/-]+=*|sk-[a-z0-9_-]{5,}|(?:api[_-]?key|token|secret|password|senha|authorization)\s*[:=]\s*[^\s,;]+)/i;

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === "string" && SECRET_VALUE_PATTERN.test(value)) return "[redacted]";
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeValue(item),
    ]),
  );
}

export function sanitizeMayusPayload(value: unknown): unknown {
  return sanitizeValue(value);
}

export function evaluateMayusBudget(params: {
  estimatedCostCents?: number | null;
  policies: MayusBudgetPolicy[];
}): MayusBudgetDecision {
  const estimatedCostCents = Math.max(0, Math.round(params.estimatedCostCents || 0));
  const reasons: string[] = [];
  let status: MayusBudgetDecision["status"] = "ok";
  let remainingCents = Number.POSITIVE_INFINITY;
  let projectedCents = 0;

  for (const policy of params.policies) {
    const limitCents = Math.max(0, Math.round(policy.limitCents || 0));
    const spentCents = Math.max(0, Math.round(policy.spentCents || 0));
    const projected = spentCents + estimatedCostCents;
    const remaining = Math.max(0, limitCents - projected);
    const warnAtRatio = typeof policy.warnAtRatio === "number" ? policy.warnAtRatio : 0.8;

    projectedCents = Math.max(projectedCents, projected);
    remainingCents = Math.min(remainingCents, remaining);

    if (limitCents <= 0 && estimatedCostCents > 0) {
      status = "blocked";
      reasons.push(`${policy.label}: sem orcamento aprovado para custo pago.`);
      continue;
    }

    if (projected > limitCents && policy.hardStop !== false) {
      status = "blocked";
      reasons.push(`${policy.label}: custo projetado ultrapassa o limite aprovado.`);
      continue;
    }

    if (projected >= limitCents * warnAtRatio && status !== "blocked") {
      status = "warning";
      reasons.push(`${policy.label}: custo projetado chegou ao limite de alerta.`);
    }
  }

  return {
    status,
    remainingCents: Number.isFinite(remainingCents) ? remainingCents : 0,
    projectedCents,
    reasons,
  };
}

export function buildMayusActivityEvent(input: MayusActivityEvent): MayusActivityEvent {
  return {
    ...input,
    payload: sanitizeValue(input.payload) as Record<string, unknown>,
  };
}

export function shouldWakeMayusRoutine(params: {
  routine: MayusHeartbeatRoutine;
  budgetDecision?: MayusBudgetDecision | null;
}) {
  if (!params.routine.enabled || params.routine.paused) {
    return {
      shouldWake: false,
      reason: "Rotina pausada ou desativada.",
    };
  }

  if (params.budgetDecision?.status === "blocked") {
    return {
      shouldWake: false,
      reason: params.budgetDecision.reasons[0] || "Budget bloqueou a rotina.",
    };
  }

  return {
    shouldWake: true,
    reason: params.routine.wakeReason,
  };
}

export const DEFAULT_ESCAVADOR_BUDGET_POLICY = {
  enabled: true,
  cache_first: true,
  require_paid_search_confirmation: true,
  monthly_limit_cents: 0,
  warn_at_ratio: 0.8,
  hard_stop: true,
};
