import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_MAYUS_AGENTIC_POLICY,
  decideMayusAutonomy,
  type MayusActionRisk,
  type MayusActionSurface,
  type MayusAutonomyMode,
  type MayusPolicyDecision,
  type MayusToolPolicy,
} from "@/lib/agent/runtime/policy";
import {
  buildMayusAgentProfileExplanation,
  evaluateMayusAgentProfile,
  type MayusAgentProfileDecision,
  type MayusAgentProfileRuntimeExplanation,
  type MayusAgentProfilesConfig,
  type TenantAiFeaturesAgentProfilesSchema,
} from "@/lib/agent/runtime/agent-profiles";
import { listTenantIntegrationsSafe } from "@/lib/integrations/server";

type TenantPolicyClient = {
  from: (table: string) => any;
};

export type MayusAgenticPolicyConfig = {
  autonomy_mode?: MayusAutonomyMode | string;
  module_modes?: Record<string, MayusAutonomyMode | string>;
  tool_policy?: MayusToolPolicy;
  sensitive_actions_require_approval?: boolean;
  agent_profiles?: MayusAgentProfilesConfig | null;
};

export type SkillPolicySubject = {
  name: string;
  handler_type?: string | null;
  risk_level?: MayusActionRisk | string | null;
  requires_human_confirmation?: boolean | null;
};

type SafeTenantIntegration = {
  provider?: string | null;
  status?: string | null;
  has_api_key?: boolean | null;
};

type TenantAiFeaturesRuntimePolicy = TenantAiFeaturesAgentProfilesSchema & {
  mayus_agentic_policy?: MayusAgenticPolicyConfig | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizePolicy(value: unknown): MayusAgenticPolicyConfig {
  if (!value || typeof value !== "object") return DEFAULT_MAYUS_AGENTIC_POLICY;

  const policy = value as MayusAgenticPolicyConfig;
  return {
    ...DEFAULT_MAYUS_AGENTIC_POLICY,
    ...policy,
    module_modes: {
      ...DEFAULT_MAYUS_AGENTIC_POLICY.module_modes,
      ...(policy.module_modes || {}),
    },
    tool_policy: {
      ...DEFAULT_MAYUS_AGENTIC_POLICY.tool_policy,
      ...(policy.tool_policy || {}),
    },
    agent_profiles: policy.agent_profiles || undefined,
  };
}

export async function getTenantAgenticPolicy(params: {
  tenantId: string;
  client?: TenantPolicyClient;
}): Promise<MayusAgenticPolicyConfig> {
  const client = params.client || supabaseAdmin;

  try {
    const { data, error } = await client
      .from("tenant_settings")
      .select("ai_features")
      .eq("tenant_id", params.tenantId)
      .maybeSingle();

    if (error) throw error;

    const aiFeatures: TenantAiFeaturesRuntimePolicy = isRecord(data?.ai_features)
      ? data.ai_features as TenantAiFeaturesRuntimePolicy
      : {};
    const rawPolicy = isRecord(aiFeatures.mayus_agentic_policy)
      ? aiFeatures.mayus_agentic_policy
      : {};

    return normalizePolicy({
      ...rawPolicy,
      agent_profiles: aiFeatures.agent_profiles || rawPolicy.agent_profiles,
    });
  } catch (error) {
    console.error("[agentic-policy] fallback", error);
    return DEFAULT_MAYUS_AGENTIC_POLICY;
  }
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

export function classifyMayusSkillSurface(skill: SkillPolicySubject): MayusActionSurface {
  const name = String(skill.name || "").toLowerCase();
  const handler = String(skill.handler_type || "").toLowerCase();
  const combined = `${name} ${handler}`;

  if (includesAny(combined, ["escavador", "monitoramento_pago", "paid_search"])) return "escavador_paid_search";
  if (includesAny(combined, ["billing", "asaas", "collections", "finance", "cobranca", "revenue"])) return "financial";
  if (includesAny(combined, ["whatsapp_send", "send_message", "external_action", "zapsign", "contract_send"])) return "external_message";
  if (includesAny(combined, ["publish", "publicacao", "exportar_peca", "filing", "protocol"])) return "publication";
  if (includesAny(combined, ["permission", "admin_support", "tenant_status", "user_role"])) return "permission";
  if (includesAny(combined, ["legal_first_draft_generate", "generate_first_draft", "draft_factory", "execute_next", "peticao", "petition"])) return "legal_decision";

  return "internal";
}

export function classifyMayusSkillModule(skill: SkillPolicySubject) {
  const name = String(skill.name || "").toLowerCase();
  const handler = String(skill.handler_type || "").toLowerCase();
  const combined = `${name} ${handler}`;

  if (includesAny(combined, ["setup", "profile_setup", "doctor", "autoconfig"])) return "setup";
  if (includesAny(combined, ["billing", "asaas", "collections", "finance", "revenue"])) return "finance";
  if (includesAny(combined, ["escavador", "monitoramento"])) return "monitoring";
  if (includesAny(combined, ["whatsapp", "support", "status"])) return "client_service";
  if (includesAny(combined, ["lead", "sales", "growth", "marketing", "crm"])) return "growth";
  if (includesAny(combined, ["document", "drive", "draft", "minuta", "peca"])) return "documents";
  if (includesAny(combined, ["legal", "juridico", "case", "process"])) return "legal_ops";

  return "setup";
}

export function getMayusRequiredCredentialProviders(skill: SkillPolicySubject): string[] {
  const name = String(skill.name || "").toLowerCase();
  const handler = String(skill.handler_type || "").toLowerCase();
  const combined = `${name} ${handler}`;
  const providers = new Set<string>();

  if (includesAny(combined, ["escavador", "monitoramento_pago", "paid_search"])) {
    providers.add("escavador");
  }

  if (includesAny(combined, ["asaas_cobrar", "billing_create", "send_charge", "cobranca"])) {
    providers.add("asaas");
  }

  if (includesAny(combined, ["zapsign", "contract_send"])) {
    providers.add("zapsign");
  }

  if (includesAny(combined, ["whatsapp_send", "send_message"])) {
    providers.add("evolution");
    providers.add("meta_cloud");
  }

  if (includesAny(combined, ["google_drive", "drive_document", "document_drive"])) {
    providers.add("google_drive");
  }

  return Array.from(providers);
}

function integrationHasCredential(integration: SafeTenantIntegration | null | undefined) {
  const status = String(integration?.status || "").toLowerCase();
  return integration?.has_api_key === true && status !== "disconnected" && status !== "inactive";
}

export async function getMayusSkillCredentialAvailability(params: {
  tenantId: string;
  skill: SkillPolicySubject;
  listIntegrations?: typeof listTenantIntegrationsSafe;
}): Promise<{ hasCredential: boolean; requiredProviders: string[] }> {
  const requiredProviders = getMayusRequiredCredentialProviders(params.skill);
  if (requiredProviders.length === 0) {
    return { hasCredential: true, requiredProviders };
  }

  const listIntegrations = params.listIntegrations || listTenantIntegrationsSafe;

  try {
    const integrations = await listIntegrations(params.tenantId, requiredProviders);
    const hasCredential = requiredProviders.some((provider) =>
      integrations.some((integration: SafeTenantIntegration) =>
        integration.provider === provider && integrationHasCredential(integration)
      )
    );

    return { hasCredential, requiredProviders };
  } catch (error) {
    console.error("[agentic-policy] credential availability fallback", error);
    return { hasCredential: false, requiredProviders };
  }
}

export function decideMayusSkillAutonomy(params: {
  policy: MayusAgenticPolicyConfig;
  skill: SkillPolicySubject;
  agentId?: string | null;
  channel?: string | null;
  module?: string | null;
  surface?: MayusActionSurface | string | null;
  toolName?: string | null;
  hasCredential?: boolean;
  estimatedCostCents?: number | null;
}): MayusPolicyDecision & {
  surface: MayusActionSurface;
  module: string;
  autonomyMode: string;
  profileDecision: MayusAgentProfileDecision;
  profileExplanation: MayusAgentProfileRuntimeExplanation;
} {
  const surface = (params.surface || classifyMayusSkillSurface(params.skill)) as MayusActionSurface;
  const agentModule = params.module || classifyMayusSkillModule(params.skill);
  const toolName = params.toolName || params.skill.name;
  const autonomyMode = params.policy.module_modes?.[agentModule] || params.policy.autonomy_mode || "supervised";
  const requiredCredentialProviders = getMayusRequiredCredentialProviders(params.skill);
  const profileDecision = evaluateMayusAgentProfile({
    profiles: params.policy.agent_profiles,
    agentId: params.agentId || params.skill.handler_type || params.skill.name,
    module: agentModule,
    channel: params.channel,
    tool: toolName,
    surface,
    handlerType: params.skill.handler_type,
  });
  const profileExplanation = buildMayusAgentProfileExplanation(profileDecision);

  if (!profileDecision.allowed) {
    return {
      outcome: "blocked_needs_credentials",
      requiresApproval: false,
      canExecuteNow: false,
      reason: profileDecision.blockedReason?.message || "Perfil do agente bloqueou esta execucao.",
      surface,
      module: agentModule,
      autonomyMode: String(autonomyMode),
      profileDecision,
      profileExplanation,
    };
  }

  const decision = decideMayusAutonomy({
    autonomyMode,
    risk: params.skill.risk_level || "medium",
    surface,
    toolName,
    requiresCredential: requiredCredentialProviders.length > 0
      || surface === "external_message"
      || surface === "financial"
      || surface === "escavador_paid_search",
    hasCredential: params.hasCredential ?? true,
    externalSideEffect: surface !== "internal",
    estimatedCostCents: params.estimatedCostCents || null,
    toolPolicy: params.policy.tool_policy,
  });

  if (profileDecision.requiresApproval && decision.canExecuteNow) {
    return {
      outcome: "requires_approval",
      requiresApproval: true,
      canExecuteNow: false,
      reason: "Perfil do agente exige aprovacao humana para esta superficie.",
      surface,
      module: agentModule,
      autonomyMode: String(autonomyMode),
      profileDecision,
      profileExplanation,
    };
  }

  return {
    ...decision,
    surface,
    module: agentModule,
    autonomyMode: String(autonomyMode),
    profileDecision,
    profileExplanation,
  };
}
