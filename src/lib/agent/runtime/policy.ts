export type MayusAutonomyMode = "draft_only" | "supervised" | "high_supervised" | "auto_low_risk" | "blocked";

export type MayusActionRisk = "low" | "medium" | "high" | "critical";

export type MayusActionSurface =
  | "internal"
  | "external_message"
  | "financial"
  | "credential"
  | "legal_decision"
  | "escavador_paid_search"
  | "publication"
  | "permission";

export type MayusPolicyOutcome =
  | "auto_execute"
  | "prepare_artifact"
  | "requires_approval"
  | "blocked_needs_credentials";

export type MayusToolPolicy = {
  allow?: string[];
  deny?: string[];
};

export type MayusPolicyInput = {
  autonomyMode?: MayusAutonomyMode | string | null;
  risk?: MayusActionRisk | string | null;
  surface?: MayusActionSurface | string | null;
  toolName?: string | null;
  requiresCredential?: boolean;
  hasCredential?: boolean;
  externalSideEffect?: boolean;
  estimatedCostCents?: number | null;
  toolPolicy?: MayusToolPolicy | null;
};

export type MayusPolicyDecision = {
  outcome: MayusPolicyOutcome;
  requiresApproval: boolean;
  canExecuteNow: boolean;
  reason: string;
};

const SENSITIVE_SURFACES = new Set<string>([
  "external_message",
  "financial",
  "credential",
  "legal_decision",
  "escavador_paid_search",
  "publication",
  "permission",
]);

function normalizeAutonomyMode(mode: MayusPolicyInput["autonomyMode"]): MayusAutonomyMode {
  if (mode === "auto_low_risk" || mode === "draft_only" || mode === "supervised" || mode === "blocked") {
    return mode;
  }

  if (mode === "high_supervised") return "supervised";

  return "supervised";
}

function normalizeRisk(risk: MayusPolicyInput["risk"]): MayusActionRisk {
  if (risk === "low" || risk === "medium" || risk === "high" || risk === "critical") return risk;
  return "medium";
}

function listIncludes(value: string | null | undefined, list?: string[]) {
  if (!value || !Array.isArray(list)) return false;
  return list.includes(value) || list.includes("*");
}

export function evaluateMayusToolPolicy(input: MayusPolicyInput): MayusPolicyDecision | null {
  const toolName = input.toolName || null;
  if (!toolName || !input.toolPolicy) return null;

  if (listIncludes(toolName, input.toolPolicy.deny)) {
    return {
      outcome: "blocked_needs_credentials",
      requiresApproval: false,
      canExecuteNow: false,
      reason: `Ferramenta ${toolName} bloqueada pela policy do tenant.`,
    };
  }

  if (Array.isArray(input.toolPolicy.allow) && input.toolPolicy.allow.length > 0 && !listIncludes(toolName, input.toolPolicy.allow)) {
    return {
      outcome: "blocked_needs_credentials",
      requiresApproval: false,
      canExecuteNow: false,
      reason: `Ferramenta ${toolName} nao esta na allowlist do tenant.`,
    };
  }

  return null;
}

export function decideMayusAutonomy(input: MayusPolicyInput): MayusPolicyDecision {
  const toolDecision = evaluateMayusToolPolicy(input);
  if (toolDecision) return toolDecision;

  const autonomyMode = normalizeAutonomyMode(input.autonomyMode);
  const risk = normalizeRisk(input.risk);
  const surface = String(input.surface || "internal");
  const hasCost = typeof input.estimatedCostCents === "number" && input.estimatedCostCents > 0;
  const isSensitive = SENSITIVE_SURFACES.has(surface) || input.externalSideEffect === true || hasCost;

  if (autonomyMode === "blocked") {
    return {
      outcome: "blocked_needs_credentials",
      requiresApproval: false,
      canExecuteNow: false,
      reason: "Modulo bloqueado ate o humano liberar a politica de autonomia.",
    };
  }

  if (input.requiresCredential && !input.hasCredential) {
    return {
      outcome: "blocked_needs_credentials",
      requiresApproval: false,
      canExecuteNow: false,
      reason: "Acao depende de credencial, OAuth ou chave configurada pelo usuario.",
    };
  }

  if (risk === "critical" || risk === "high" || isSensitive) {
    return {
      outcome: "requires_approval",
      requiresApproval: true,
      canExecuteNow: false,
      reason: "Acao sensivel exige aprovacao humana antes de executar.",
    };
  }

  if (autonomyMode === "draft_only") {
    return {
      outcome: "prepare_artifact",
      requiresApproval: false,
      canExecuteNow: false,
      reason: "Modo draft_only: MAYUS prepara o artifact e nao executa.",
    };
  }

  if (autonomyMode === "auto_low_risk" && risk === "low" && surface === "internal") {
    return {
      outcome: "auto_execute",
      requiresApproval: false,
      canExecuteNow: true,
      reason: "Acao interna de baixo risco liberada para execucao automatica.",
    };
  }

  return {
    outcome: "prepare_artifact",
    requiresApproval: false,
    canExecuteNow: false,
    reason: "Modo supervisionado: MAYUS organiza e prepara antes de execucao humana.",
  };
}

export const DEFAULT_MAYUS_AGENTIC_POLICY = {
  autonomy_mode: "supervised" as MayusAutonomyMode,
  module_modes: {
    core: "auto_low_risk",
    setup: "auto_low_risk",
    legal_ops: "supervised",
    monitoring: "supervised",
    client_service: "supervised",
    growth: "supervised",
    finance: "supervised",
    documents: "supervised",
  },
  tool_policy: {
    allow: ["*"],
    deny: [
      "publish_external",
      "send_charge_without_approval",
      "change_permissions_without_approval",
      "store_raw_secret_in_prompt",
    ],
  },
  sensitive_actions_require_approval: true,
};
