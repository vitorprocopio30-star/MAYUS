import type { MayusActionRisk, MayusActionSurface } from "@/lib/agent/runtime/policy";

export const MAYUS_AGENT_PROFILE_SURFACES = [
  "internal",
  "external_message",
  "financial",
  "legal_decision",
  "permission",
  "publication",
  "escavador_paid_search",
] as const;

export type MayusAgentProfileSurface = typeof MAYUS_AGENT_PROFILE_SURFACES[number];

type SurfaceListToken = MayusAgentProfileSurface | "*";

export type MayusAgentProfileAccessList = {
  agents?: string[];
  modules?: string[];
  channels?: string[];
  tools?: string[];
  surfaces?: Array<MayusAgentProfileSurface | MayusActionSurface | string>;
};

export type MayusAgentProfileSurfaceRule = {
  allow_tools?: string[];
  deny_tools?: string[];
  require_approval?: boolean;
  blocked_reason?: string;
};

export type MayusAgentProfileRule = {
  id?: string;
  label?: string;
  enabled?: boolean;
  allow?: MayusAgentProfileAccessList;
  deny?: MayusAgentProfileAccessList;
  require_approval?: boolean;
  require_approval_surfaces?: Array<MayusAgentProfileSurface | MayusActionSurface | string>;
  blocked_reason?: string;
  surface_matrix?: Partial<Record<MayusAgentProfileSurface, MayusAgentProfileSurfaceRule>>;
};

export type MayusAgentProfilesConfig = {
  version?: string;
  global?: MayusAgentProfileRule;
  tenant?: MayusAgentProfileRule;
  modules?: Record<string, MayusAgentProfileRule>;
  agents?: Record<string, MayusAgentProfileRule>;
  tools?: Record<string, MayusAgentProfileRule>;
  channels?: Record<string, MayusAgentProfileRule>;
};

export type TenantAiFeaturesAgentProfilesSchema = {
  agent_profiles?: MayusAgentProfilesConfig | null;
};

type NormalizedAccessList = {
  agents?: string[];
  modules?: string[];
  channels?: string[];
  tools?: string[];
  surfaces?: SurfaceListToken[];
};

type NormalizedSurfaceRule = {
  allow_tools?: string[];
  deny_tools?: string[];
  require_approval?: boolean;
  blocked_reason?: string;
};

type NormalizedAgentProfileRule = {
  id?: string;
  label?: string;
  enabled?: boolean;
  allow?: NormalizedAccessList;
  deny?: NormalizedAccessList;
  require_approval?: boolean;
  require_approval_surfaces?: SurfaceListToken[];
  blocked_reason?: string;
  surface_matrix?: Partial<Record<MayusAgentProfileSurface, NormalizedSurfaceRule>>;
};

export type NormalizedMayusAgentProfilesConfig = {
  version?: string;
  global?: NormalizedAgentProfileRule;
  tenant?: NormalizedAgentProfileRule;
  modules?: Record<string, NormalizedAgentProfileRule>;
  agents?: Record<string, NormalizedAgentProfileRule>;
  tools?: Record<string, NormalizedAgentProfileRule>;
  channels?: Record<string, NormalizedAgentProfileRule>;
};

export type MayusAgentProfileSubjectInput = {
  agentId?: string | null;
  module?: string | null;
  channel?: string | null;
  tool?: string | null;
  toolName?: string | null;
  surface?: MayusActionSurface | MayusAgentProfileSurface | string | null;
  handlerType?: string | null;
};

export type NormalizedMayusAgentProfileSubject = {
  agentId?: string;
  module?: string;
  channel?: string;
  tool?: string;
  surface: MayusAgentProfileSurface;
};

export type MayusAgentProfileLayerScope = "global" | "tenant" | "module" | "agent" | "tool" | "channel";

export type MayusAgentProfileAppliedLayer = {
  precedence: number;
  scope: MayusAgentProfileLayerScope;
  key: string;
  profileId?: string;
  enabled: boolean;
  hasAllow: boolean;
  hasDeny: boolean;
  requiresApproval: boolean;
  hasSurfaceMatrix: boolean;
};

export type MayusAgentProfileBlockCode =
  | "profile_disabled"
  | "agent_denied"
  | "agent_not_allowed"
  | "module_denied"
  | "module_not_allowed"
  | "tool_denied"
  | "tool_not_allowed"
  | "channel_denied"
  | "channel_not_allowed"
  | "surface_denied"
  | "surface_not_allowed"
  | "surface_tool_denied"
  | "surface_tool_not_allowed";

export type MayusAgentProfileBlockedReason = {
  code: MayusAgentProfileBlockCode;
  message: string;
  layer: MayusAgentProfileLayerScope | "surface_matrix";
  source: "tenant_settings.ai_features.agent_profiles";
  detail?: string;
};

export type MayusAgentProfileSurfaceMatrixEntry = {
  surface: MayusAgentProfileSurface;
  risk: MayusActionRisk;
  externalSideEffect: boolean;
  defaultRequiresApproval: boolean;
  defaultDenyTools: string[];
};

export type MayusAgentProfileResolution = {
  subject: NormalizedMayusAgentProfileSubject;
  profiles: NormalizedMayusAgentProfilesConfig;
  appliedLayers: MayusAgentProfileAppliedLayer[];
};

export type MayusAgentProfileDecision = MayusAgentProfileResolution & {
  allowed: boolean;
  requiresApproval: boolean;
  canExecuteNow: boolean;
  blockedReason?: MayusAgentProfileBlockedReason;
  blockedReasons: MayusAgentProfileBlockedReason[];
  surfaceMatrix: MayusAgentProfileSurfaceMatrixEntry;
};

export type MayusAgentProfileRuntimeExplanation = {
  allowed: boolean;
  requires_approval: boolean;
  can_execute_now: boolean;
  blocked_reason?: MayusAgentProfileBlockedReason;
  subject: NormalizedMayusAgentProfileSubject;
  applied_layers: MayusAgentProfileAppliedLayer[];
  surface_matrix: {
    surface: MayusAgentProfileSurface;
    risk: MayusActionRisk;
    external_side_effect: boolean;
    default_requires_approval: boolean;
    default_deny_tools: string[];
  };
  source: "tenant_settings.ai_features.agent_profiles";
};

type LayerWithRule = MayusAgentProfileAppliedLayer & {
  rule: NormalizedAgentProfileRule;
};

const SECRET_REDACTION = "[redacted-secret]";

const BLOCK_MESSAGES: Record<MayusAgentProfileBlockCode, string> = {
  profile_disabled: "Perfil do agente bloqueou esta execucao.",
  agent_denied: "Agente bloqueado pelo perfil operacional.",
  agent_not_allowed: "Agente fora da allowlist do perfil operacional.",
  module_denied: "Modulo bloqueado pelo perfil operacional.",
  module_not_allowed: "Modulo fora da allowlist do perfil operacional.",
  tool_denied: "Ferramenta bloqueada pelo perfil operacional.",
  tool_not_allowed: "Ferramenta fora da allowlist do perfil operacional.",
  channel_denied: "Canal bloqueado pelo perfil operacional.",
  channel_not_allowed: "Canal fora da allowlist do perfil operacional.",
  surface_denied: "Superficie bloqueada pelo perfil operacional.",
  surface_not_allowed: "Superficie fora da allowlist do perfil operacional.",
  surface_tool_denied: "Ferramenta bloqueada para esta superficie.",
  surface_tool_not_allowed: "Ferramenta fora da matriz permitida para esta superficie.",
};

export const MAYUS_AGENT_PROFILE_SURFACE_MATRIX: Record<MayusAgentProfileSurface, MayusAgentProfileSurfaceMatrixEntry> = {
  internal: {
    surface: "internal",
    risk: "low",
    externalSideEffect: false,
    defaultRequiresApproval: false,
    defaultDenyTools: ["store_raw_secret_in_prompt"],
  },
  external_message: {
    surface: "external_message",
    risk: "high",
    externalSideEffect: true,
    defaultRequiresApproval: true,
    defaultDenyTools: ["publish_external", "send_message_without_approval"],
  },
  financial: {
    surface: "financial",
    risk: "critical",
    externalSideEffect: true,
    defaultRequiresApproval: true,
    defaultDenyTools: ["send_charge_without_approval", "move_money_without_approval"],
  },
  legal_decision: {
    surface: "legal_decision",
    risk: "critical",
    externalSideEffect: true,
    defaultRequiresApproval: true,
    defaultDenyTools: ["execute_legal_strategy_without_review"],
  },
  permission: {
    surface: "permission",
    risk: "critical",
    externalSideEffect: true,
    defaultRequiresApproval: true,
    defaultDenyTools: ["change_permissions_without_approval", "admin_support_without_grant"],
  },
  publication: {
    surface: "publication",
    risk: "critical",
    externalSideEffect: true,
    defaultRequiresApproval: true,
    defaultDenyTools: ["publish_external", "file_without_approval"],
  },
  escavador_paid_search: {
    surface: "escavador_paid_search",
    risk: "high",
    externalSideEffect: true,
    defaultRequiresApproval: true,
    defaultDenyTools: ["escavador_paid_search_without_budget", "paid_search_without_confirmation"],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeMayusAgentProfileText(value: unknown): string {
  const text = String(value ?? "");

  return text
    .replace(/\bsk-[a-z0-9_-]+/gi, SECRET_REDACTION)
    .replace(/\bBearer\s+[a-z0-9._-]+/gi, `Bearer ${SECRET_REDACTION}`)
    .replace(/\beyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/gi, SECRET_REDACTION)
    .replace(
      /\b(api[_-]?key|token|secret|password|senha|service[_-]?role|authorization)\b\s*[:=]\s*["']?[^"',\s)]+/gi,
      (_match, key: string) => `${key}=${SECRET_REDACTION}`,
    )
    .slice(0, 500);
}

function normalizeKey(value: unknown, allowWildcard = false): string | undefined {
  const sanitized = sanitizeMayusAgentProfileText(value).trim().toLowerCase();
  if (!sanitized) return undefined;
  if (allowWildcard && sanitized === "*") return "*";
  if (sanitized.includes(SECRET_REDACTION)) return "redacted-secret";

  const normalized = sanitized
    .replace(/[^a-z0-9*_.:/-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);

  if (!normalized || (!allowWildcard && normalized === "*")) return undefined;
  return normalized;
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const normalized = value
    .map((item) => normalizeKey(item, true))
    .filter((item): item is string => Boolean(item));

  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

function normalizeSurfaceToken(value: unknown): SurfaceListToken | undefined {
  if (String(value ?? "").trim() === "*") return "*";
  return normalizeMayusAgentProfileSurface(value) ?? undefined;
}

function normalizeSurfaceList(value: unknown): SurfaceListToken[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const normalized = value
    .map(normalizeSurfaceToken)
    .filter((item): item is SurfaceListToken => Boolean(item));

  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

function normalizeAccessList(value: unknown): NormalizedAccessList | undefined {
  if (!isRecord(value)) return undefined;

  const accessList: NormalizedAccessList = {
    agents: normalizeStringList(value.agents),
    modules: normalizeStringList(value.modules),
    channels: normalizeStringList(value.channels),
    tools: normalizeStringList(value.tools),
    surfaces: normalizeSurfaceList(value.surfaces),
  };

  return Object.values(accessList).some((item) => Array.isArray(item) && item.length > 0)
    ? accessList
    : undefined;
}

function normalizeSurfaceRule(value: unknown): NormalizedSurfaceRule | undefined {
  if (!isRecord(value)) return undefined;

  const rule: NormalizedSurfaceRule = {
    allow_tools: normalizeStringList(value.allow_tools),
    deny_tools: normalizeStringList(value.deny_tools),
    require_approval: value.require_approval === true,
    blocked_reason: value.blocked_reason ? sanitizeMayusAgentProfileText(value.blocked_reason) : undefined,
  };

  return rule.allow_tools || rule.deny_tools || rule.require_approval || rule.blocked_reason
    ? rule
    : undefined;
}

function normalizeSurfaceMatrix(value: unknown): Partial<Record<MayusAgentProfileSurface, NormalizedSurfaceRule>> | undefined {
  if (!isRecord(value)) return undefined;

  const matrix: Partial<Record<MayusAgentProfileSurface, NormalizedSurfaceRule>> = {};

  for (const [rawSurface, rawRule] of Object.entries(value)) {
    const surface = normalizeMayusAgentProfileSurface(rawSurface);
    const rule = normalizeSurfaceRule(rawRule);
    if (surface && rule) {
      matrix[surface] = rule;
    }
  }

  return Object.keys(matrix).length > 0 ? matrix : undefined;
}

function normalizeProfileRule(value: unknown): NormalizedAgentProfileRule | undefined {
  if (!isRecord(value)) return undefined;

  const rule: NormalizedAgentProfileRule = {
    id: normalizeKey(value.id),
    label: value.label ? sanitizeMayusAgentProfileText(value.label) : undefined,
    enabled: typeof value.enabled === "boolean" ? value.enabled : undefined,
    allow: normalizeAccessList(value.allow),
    deny: normalizeAccessList(value.deny),
    require_approval: value.require_approval === true,
    require_approval_surfaces: normalizeSurfaceList(value.require_approval_surfaces),
    blocked_reason: value.blocked_reason ? sanitizeMayusAgentProfileText(value.blocked_reason) : undefined,
    surface_matrix: normalizeSurfaceMatrix(value.surface_matrix),
  };

  return hasRuleContent(rule) ? rule : undefined;
}

function hasRuleContent(rule: NormalizedAgentProfileRule): boolean {
  return Boolean(
    rule.id
      || rule.label
      || typeof rule.enabled === "boolean"
      || rule.allow
      || rule.deny
      || rule.require_approval
      || rule.require_approval_surfaces
      || rule.blocked_reason
      || rule.surface_matrix,
  );
}

function normalizeRuleRecord(value: unknown): Record<string, NormalizedAgentProfileRule> | undefined {
  if (!isRecord(value)) return undefined;

  const record: Record<string, NormalizedAgentProfileRule> = {};
  for (const [rawKey, rawRule] of Object.entries(value)) {
    const key = normalizeKey(rawKey, true);
    const rule = normalizeProfileRule(rawRule);
    if (key && rule) {
      record[key] = rule;
    }
  }

  return Object.keys(record).length > 0 ? record : undefined;
}

export function normalizeMayusAgentProfiles(value: unknown): NormalizedMayusAgentProfilesConfig {
  if (!isRecord(value)) return {};

  return {
    version: value.version ? sanitizeMayusAgentProfileText(value.version) : undefined,
    global: normalizeProfileRule(value.global),
    tenant: normalizeProfileRule(value.tenant),
    modules: normalizeRuleRecord(value.modules),
    agents: normalizeRuleRecord(value.agents),
    tools: normalizeRuleRecord(value.tools),
    channels: normalizeRuleRecord(value.channels),
  };
}

export function normalizeMayusAgentProfileSurface(value: unknown): MayusAgentProfileSurface | null {
  const normalized = normalizeKey(value);
  if (!normalized) return null;

  if ((MAYUS_AGENT_PROFILE_SURFACES as readonly string[]).includes(normalized)) {
    return normalized as MayusAgentProfileSurface;
  }

  if (normalized === "credential" || normalized === "credentials" || normalized === "admin") return "permission";
  if (["external", "external_action", "external-message", "message", "whatsapp"].includes(normalized)) return "external_message";
  if (["finance", "billing", "collections", "cobranca"].includes(normalized)) return "financial";
  if (["legal", "legal_ops", "juridico", "juridical", "petition"].includes(normalized)) return "legal_decision";
  if (["permissions", "user_role", "access"].includes(normalized)) return "permission";
  if (["publish", "filing", "protocol"].includes(normalized)) return "publication";
  if (["escavador", "paid_search", "monitoramento_pago"].includes(normalized)) return "escavador_paid_search";

  return null;
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}

export function classifyMayusAgentProfileSurface(input: MayusAgentProfileSubjectInput): MayusAgentProfileSurface {
  const explicitSurface = normalizeMayusAgentProfileSurface(input.surface);
  if (explicitSurface) return explicitSurface;

  const combined = [
    input.agentId,
    input.module,
    input.channel,
    input.tool,
    input.toolName,
    input.handlerType,
  ]
    .map((item) => normalizeKey(item))
    .filter(Boolean)
    .join(" ");

  if (includesAny(combined, ["escavador", "monitoramento_pago", "paid_search"])) return "escavador_paid_search";
  if (includesAny(combined, ["billing", "asaas", "collections", "finance", "cobranca", "revenue"])) return "financial";
  if (includesAny(combined, ["whatsapp_send", "send_message", "external_action", "zapsign", "contract_send"])) return "external_message";
  if (includesAny(combined, ["publish", "publicacao", "exportar_peca", "filing", "protocol"])) return "publication";
  if (includesAny(combined, ["permission", "admin_support", "tenant_status", "user_role"])) return "permission";
  if (includesAny(combined, ["legal_first_draft_generate", "generate_first_draft", "draft_factory", "execute_next", "peticao", "petition", "juridico"])) return "legal_decision";

  return "internal";
}

export function normalizeMayusAgentProfileSubject(input: MayusAgentProfileSubjectInput): NormalizedMayusAgentProfileSubject {
  return {
    agentId: normalizeKey(input.agentId),
    module: normalizeKey(input.module),
    channel: normalizeKey(input.channel),
    tool: normalizeKey(input.tool ?? input.toolName),
    surface: classifyMayusAgentProfileSurface(input),
  };
}

function hasAccessList(value: NormalizedAccessList | undefined): boolean {
  return Boolean(value && Object.values(value).some((list) => Array.isArray(list) && list.length > 0));
}

function summarizeLayer(
  precedence: number,
  scope: MayusAgentProfileLayerScope,
  key: string,
  rule: NormalizedAgentProfileRule,
): LayerWithRule {
  return {
    precedence,
    scope,
    key,
    profileId: rule.id,
    enabled: rule.enabled !== false,
    hasAllow: hasAccessList(rule.allow),
    hasDeny: hasAccessList(rule.deny),
    requiresApproval: rule.require_approval === true || Boolean(rule.require_approval_surfaces?.length),
    hasSurfaceMatrix: Boolean(rule.surface_matrix && Object.keys(rule.surface_matrix).length > 0),
    rule,
  };
}

function getRecordRule(
  record: Record<string, NormalizedAgentProfileRule> | undefined,
  key: string | undefined,
): { key: string; rule: NormalizedAgentProfileRule } | undefined {
  if (!record) return undefined;
  if (key && record[key]) return { key, rule: record[key] };
  if (record["*"]) return { key: "*", rule: record["*"] };
  return undefined;
}

function collectLayers(
  profiles: NormalizedMayusAgentProfilesConfig,
  subject: NormalizedMayusAgentProfileSubject,
): LayerWithRule[] {
  const layers: LayerWithRule[] = [];
  let precedence = 0;

  if (profiles.global) {
    layers.push(summarizeLayer(precedence, "global", "global", profiles.global));
  }
  precedence += 1;

  if (profiles.tenant) {
    layers.push(summarizeLayer(precedence, "tenant", "tenant", profiles.tenant));
  }
  precedence += 1;

  const moduleRule = getRecordRule(profiles.modules, subject.module);
  if (moduleRule) {
    layers.push(summarizeLayer(precedence, "module", moduleRule.key, moduleRule.rule));
  }
  precedence += 1;

  const agentRule = getRecordRule(profiles.agents, subject.agentId);
  if (agentRule) {
    layers.push(summarizeLayer(precedence, "agent", agentRule.key, agentRule.rule));
  }
  precedence += 1;

  const toolRule = getRecordRule(profiles.tools, subject.tool);
  if (toolRule) {
    layers.push(summarizeLayer(precedence, "tool", toolRule.key, toolRule.rule));
  }
  precedence += 1;

  const channelRule = getRecordRule(profiles.channels, subject.channel);
  if (channelRule) {
    layers.push(summarizeLayer(precedence, "channel", channelRule.key, channelRule.rule));
  }

  return layers;
}

export function resolveMayusAgentProfile(params: {
  profiles?: MayusAgentProfilesConfig | NormalizedMayusAgentProfilesConfig | null;
  agentProfiles?: MayusAgentProfilesConfig | NormalizedMayusAgentProfilesConfig | null;
  aiFeatures?: TenantAiFeaturesAgentProfilesSchema | null;
} & MayusAgentProfileSubjectInput): MayusAgentProfileResolution {
  const profiles = normalizeMayusAgentProfiles(params.profiles ?? params.agentProfiles ?? params.aiFeatures?.agent_profiles);
  const subject = normalizeMayusAgentProfileSubject(params);
  const layers = collectLayers(profiles, subject);

  return {
    subject,
    profiles,
    appliedLayers: layers.map(({ rule: _rule, ...layer }) => layer),
  };
}

function listIncludes(value: string | undefined, list: string[] | SurfaceListToken[] | undefined): boolean {
  if (!list || list.length === 0) return false;
  if (list.includes("*")) return true;
  if (!value) return false;
  return (list as readonly string[]).includes(value);
}

function isAllowedByList(value: string | undefined, list: string[] | SurfaceListToken[] | undefined): boolean {
  if (!list || list.length === 0) return true;
  if (list.includes("*")) return true;
  if (!value) return false;
  return (list as readonly string[]).includes(value);
}

function buildBlockedReason(
  code: MayusAgentProfileBlockCode,
  layer: MayusAgentProfileLayerScope | "surface_matrix",
  customReason?: string,
): MayusAgentProfileBlockedReason {
  const detail = customReason ? sanitizeMayusAgentProfileText(customReason) : undefined;

  return {
    code,
    message: BLOCK_MESSAGES[code],
    layer,
    source: "tenant_settings.ai_features.agent_profiles",
    detail,
  };
}

function collectLayerBlocks(
  layer: LayerWithRule,
  subject: NormalizedMayusAgentProfileSubject,
): MayusAgentProfileBlockedReason[] {
  const rule = layer.rule;
  const blocks: MayusAgentProfileBlockedReason[] = [];

  if (rule.enabled === false) {
    blocks.push(buildBlockedReason("profile_disabled", layer.scope, rule.blocked_reason));
  }

  const checks: Array<{
    value: string | undefined;
    denyList: string[] | SurfaceListToken[] | undefined;
    allowList: string[] | SurfaceListToken[] | undefined;
    denyCode: MayusAgentProfileBlockCode;
    allowCode: MayusAgentProfileBlockCode;
  }> = [
    {
      value: subject.agentId,
      denyList: rule.deny?.agents,
      allowList: rule.allow?.agents,
      denyCode: "agent_denied",
      allowCode: "agent_not_allowed",
    },
    {
      value: subject.module,
      denyList: rule.deny?.modules,
      allowList: rule.allow?.modules,
      denyCode: "module_denied",
      allowCode: "module_not_allowed",
    },
    {
      value: subject.tool,
      denyList: rule.deny?.tools,
      allowList: rule.allow?.tools,
      denyCode: "tool_denied",
      allowCode: "tool_not_allowed",
    },
    {
      value: subject.channel,
      denyList: rule.deny?.channels,
      allowList: rule.allow?.channels,
      denyCode: "channel_denied",
      allowCode: "channel_not_allowed",
    },
    {
      value: subject.surface,
      denyList: rule.deny?.surfaces,
      allowList: rule.allow?.surfaces,
      denyCode: "surface_denied",
      allowCode: "surface_not_allowed",
    },
  ];

  for (const check of checks) {
    if (listIncludes(check.value, check.denyList)) {
      blocks.push(buildBlockedReason(check.denyCode, layer.scope, rule.blocked_reason));
    }

    if (!isAllowedByList(check.value, check.allowList)) {
      blocks.push(buildBlockedReason(check.allowCode, layer.scope, rule.blocked_reason));
    }
  }

  const surfaceRule = rule.surface_matrix?.[subject.surface];
  if (surfaceRule) {
    if (listIncludes(subject.tool, surfaceRule.deny_tools)) {
      blocks.push(buildBlockedReason("surface_tool_denied", layer.scope, surfaceRule.blocked_reason || rule.blocked_reason));
    }

    if (!isAllowedByList(subject.tool, surfaceRule.allow_tools)) {
      blocks.push(buildBlockedReason("surface_tool_not_allowed", layer.scope, surfaceRule.blocked_reason || rule.blocked_reason));
    }
  }

  return blocks;
}

function layerRequiresApproval(layer: LayerWithRule, subject: NormalizedMayusAgentProfileSubject): boolean {
  const rule = layer.rule;
  const surfaceRule = rule.surface_matrix?.[subject.surface];

  return rule.require_approval === true
    || listIncludes(subject.surface, rule.require_approval_surfaces)
    || surfaceRule?.require_approval === true;
}

export function evaluateMayusAgentProfile(params: {
  profiles?: MayusAgentProfilesConfig | NormalizedMayusAgentProfilesConfig | null;
  agentProfiles?: MayusAgentProfilesConfig | NormalizedMayusAgentProfilesConfig | null;
  aiFeatures?: TenantAiFeaturesAgentProfilesSchema | null;
} & MayusAgentProfileSubjectInput): MayusAgentProfileDecision {
  const profiles = normalizeMayusAgentProfiles(params.profiles ?? params.agentProfiles ?? params.aiFeatures?.agent_profiles);
  const subject = normalizeMayusAgentProfileSubject(params);
  const layers = collectLayers(profiles, subject);
  const matrix = MAYUS_AGENT_PROFILE_SURFACE_MATRIX[subject.surface];
  const blockedReasons: MayusAgentProfileBlockedReason[] = [];

  if (listIncludes(subject.tool, matrix.defaultDenyTools)) {
    blockedReasons.push(buildBlockedReason("surface_tool_denied", "surface_matrix"));
  }

  for (const layer of layers) {
    blockedReasons.push(...collectLayerBlocks(layer, subject));
  }

  const allowed = blockedReasons.length === 0;
  const requiresApproval = matrix.defaultRequiresApproval || layers.some((layer) => layerRequiresApproval(layer, subject));

  return {
    subject,
    profiles,
    appliedLayers: layers.map(({ rule: _rule, ...layer }) => layer),
    allowed,
    requiresApproval,
    canExecuteNow: allowed && !requiresApproval,
    blockedReason: blockedReasons[0],
    blockedReasons,
    surfaceMatrix: matrix,
  };
}

export function buildMayusAgentProfileExplanation(
  decision: MayusAgentProfileDecision,
): MayusAgentProfileRuntimeExplanation {
  return {
    allowed: decision.allowed,
    requires_approval: decision.requiresApproval,
    can_execute_now: decision.canExecuteNow,
    blocked_reason: decision.blockedReason,
    subject: decision.subject,
    applied_layers: decision.appliedLayers,
    surface_matrix: {
      surface: decision.surfaceMatrix.surface,
      risk: decision.surfaceMatrix.risk,
      external_side_effect: decision.surfaceMatrix.externalSideEffect,
      default_requires_approval: decision.surfaceMatrix.defaultRequiresApproval,
      default_deny_tools: decision.surfaceMatrix.defaultDenyTools,
    },
    source: "tenant_settings.ai_features.agent_profiles",
  };
}
