import {
  buildMayusActivityEvent,
  evaluateMayusBudget,
  sanitizeMayusPayload,
  shouldWakeMayusRoutine,
  type MayusBudgetDecision,
  type MayusBudgetPolicy,
} from "@/lib/agent/runtime/governance";
import {
  DEFAULT_MAYUS_AGENTIC_POLICY,
  decideMayusAutonomy,
  type MayusActionRisk,
  type MayusAutonomyMode,
  type MayusPolicyDecision,
  type MayusToolPolicy,
} from "@/lib/agent/runtime/policy";
import {
  createHermesMissionTrajectory,
  recordHermesMissionApproval,
  recordHermesMissionArtifact,
  recordHermesMissionDecision,
  recordHermesMissionResult,
  recordHermesMissionStep,
  type HermesMissionTrajectory,
} from "@/lib/agent/runtime/trajectory";
import { runSelfImprovementReview } from "@/lib/agent/runtime/self-improvement-review";

type RoutineClient = {
  from: (table: string) => any;
};

type RoutineAgenticPolicyConfig = {
  autonomy_mode?: MayusAutonomyMode | string;
  module_modes?: Record<string, MayusAutonomyMode | string>;
  tool_policy?: MayusToolPolicy;
};

async function getDefaultClient(): Promise<RoutineClient> {
  const { supabaseAdmin } = await import("@/lib/supabase/admin");
  return supabaseAdmin;
}

export type MayusRoutineModule =
  | "core"
  | "setup"
  | "legal_ops"
  | "monitoring"
  | "client_service"
  | "growth"
  | "finance"
  | "documents";

export type MayusRoutineSchedule = {
  kind: "manual" | "daily" | "weekly" | "interval";
  label?: string;
};

export type MayusAgenticRoutine = {
  id: string;
  label: string;
  source: "paperclip" | "hermes" | "mayus";
  agentId: string;
  module: MayusRoutineModule;
  capabilityName: string;
  goalTemplate: string;
  enabled: boolean;
  paused?: boolean;
  riskLevel: MayusActionRisk;
  schedule: MayusRoutineSchedule;
  executionMode: "plan_only" | "approval_required" | "auto_low_risk";
  wakeReason: string;
  budgetPolicyId?: string | null;
  budgetPolicy?: MayusBudgetPolicy | null;
  budgetPolicies?: MayusBudgetPolicy[];
  estimatedCostCents?: number | null;
  payload?: Record<string, unknown>;
  status?: MayusRoutineHeartbeatResult["status"] | "ready";
  reason?: string | null;
  nextAction?: string | null;
  lastResult?: MayusRoutineHeartbeatResult | null;
};

export type MayusRoutineTrajectoryStep = {
  stage: string;
  status: "ok" | "warning" | "blocked";
  reason?: string | null;
  at: string;
};

export type MayusRoutineHeartbeatResult = {
  status: "woken" | "created" | "dry_run" | "skipped" | "awaiting_approval" | "blocked" | "not_found";
  routineId: string;
  reason: string;
  missionCreated?: boolean;
  taskId?: string | null;
  runId?: string | null;
  stepId?: string | null;
  artifactId?: string | null;
  approvalId?: string | null;
  eventName?: "agentic_routine_woken" | "agentic_routine_blocked" | "agentic_routine_dry_run" | null;
  policyDecision?: (MayusPolicyDecision & { surface?: string; module?: string; autonomyMode?: string }) | null;
  budgetDecision?: MayusBudgetDecision | null;
  trajectory: MayusRoutineTrajectoryStep[];
  hermesTrajectory?: HermesMissionTrajectory | null;
  brainTrace?: {
    taskId: string | null;
    runId: string | null;
    stepId: string | null;
    artifactId: string | null;
    learningEventCreated: boolean;
    systemEventCreated: boolean;
  } | null;
  executionResult?: Record<string, unknown> | null;
  results?: Array<{
    routineId: string;
    eventName: "agentic_routine_woken" | "agentic_routine_blocked" | "agentic_routine_dry_run";
    brainTrace?: {
      taskId: string | null;
      runId: string | null;
      stepId: string | null;
      artifactId: string | null;
      learningEventCreated: boolean;
      systemEventCreated: boolean;
    };
  }>;
};

export const RECOMMENDED_MAYUS_AGENTIC_ROUTINES: MayusAgenticRoutine[] = [
  {
    id: "mayus-self-improvement-review",
    label: "Revisao de auto-aprendizado MAYUS",
    source: "mayus",
    agentId: "mayus_self_improvement",
    module: "core",
    capabilityName: "self_improvement_review",
    goalTemplate: "Analisar ultimos 7 dias de learning_events e propor memorias institucionais para padroes repetidos.",
    enabled: false,
    riskLevel: "low",
    schedule: { kind: "daily", label: "Diaria" },
    executionMode: "plan_only",
    wakeReason: "Detectar padroes recorrentes e propor memoria supervisionada sem executar side effects externos.",
  },
  {
    id: "finance-daily-review",
    label: "Revisao financeira diaria",
    source: "paperclip",
    agentId: "finance_agent",
    module: "finance",
    capabilityName: "finance_daily_review",
    goalTemplate: "Revisar recebiveis, vencidos, riscos financeiros e preparar proximas acoes supervisionadas.",
    enabled: false,
    riskLevel: "low",
    schedule: { kind: "daily", label: "Diaria" },
    executionMode: "plan_only",
    wakeReason: "Rotina diaria para organizar financeiro sem cobrar nem enviar mensagem.",
  },
  {
    id: "monitoring-oab-review",
    label: "Revisao de monitoramento Escavador",
    source: "paperclip",
    agentId: "monitoring_agent",
    module: "monitoring",
    capabilityName: "monitoring_oab_review",
    goalTemplate: "Revisar eventos e pendencias do Escavador em cache, sem consulta paga automatica.",
    enabled: false,
    riskLevel: "low",
    schedule: { kind: "daily", label: "Diaria" },
    executionMode: "plan_only",
    wakeReason: "Rotina de monitoramento cache-first sem custo externo automatico.",
  },
  {
    id: "setup-readiness-review",
    label: "Revisao de prontidao AI First",
    source: "paperclip",
    agentId: "setup_agent",
    module: "setup",
    capabilityName: "setup_readiness_review",
    goalTemplate: "Revisar prontidao do escritorio, lacunas e proximas perguntas para o dono.",
    enabled: false,
    riskLevel: "low",
    schedule: { kind: "manual", label: "Manual" },
    executionMode: "auto_low_risk",
    wakeReason: "Rotina de setup segura para organizar pendencias internas.",
  },
  {
    id: "paperclip_daily_playbook_review",
    label: "Revisao diaria do playbook operacional",
    source: "paperclip",
    agentId: "paperclip",
    module: "legal_ops",
    capabilityName: "routine_wakeup_plan",
    goalTemplate: "Organizar prioridades, bloqueios e proximas acoes em um plano supervisionado.",
    enabled: false,
    riskLevel: "low",
    schedule: { kind: "daily", label: "Diaria" },
    executionMode: "plan_only",
    wakeReason: "Preparar revisao diaria sem executar side effects externos.",
  },
  {
    id: "paperclip_crm_next_step_sweep",
    label: "Varredura de proximos passos do CRM",
    source: "paperclip",
    agentId: "paperclip",
    module: "growth",
    capabilityName: "routine_wakeup_plan",
    goalTemplate: "Detectar leads sem proximo passo claro e preparar plano de acompanhamento supervisionado.",
    enabled: false,
    riskLevel: "low",
    schedule: { kind: "daily", label: "Diaria" },
    executionMode: "plan_only",
    wakeReason: "Organizar oportunidades paradas sem enviar mensagens automaticamente.",
  },
  {
    id: "paperclip_deadline_guardian",
    label: "Guardiao de prazos e rotinas juridicas",
    source: "paperclip",
    agentId: "paperclip",
    module: "legal_ops",
    capabilityName: "routine_wakeup_plan",
    goalTemplate: "Revisar riscos de prazo e pendencias juridicas para preparar checagem humana.",
    enabled: false,
    riskLevel: "low",
    schedule: { kind: "daily", label: "Diaria" },
    executionMode: "plan_only",
    wakeReason: "Preparar plano de checagem juridica sem protocolar, publicar ou enviar nada.",
  },
  {
    id: "paperclip_finance_collections_watch",
    label: "Monitor de cobrancas e receita",
    source: "paperclip",
    agentId: "paperclip",
    module: "finance",
    capabilityName: "routine_wakeup_plan",
    goalTemplate: "Revisar cobrancas, vencidos e receitas pendentes em modo plano supervisionado.",
    enabled: false,
    riskLevel: "low",
    schedule: { kind: "daily", label: "Diaria" },
    executionMode: "plan_only",
    wakeReason: "Preparar follow-up financeiro sem emitir cobranca ou mensagem externa.",
  },
  {
    id: "paperclip_drive_review_queue",
    label: "Fila de revisao de documentos",
    source: "paperclip",
    agentId: "paperclip",
    module: "documents",
    capabilityName: "routine_wakeup_plan",
    goalTemplate: "Preparar fila de documentos pendentes de revisao, classificacao ou organizacao.",
    enabled: false,
    riskLevel: "low",
    schedule: { kind: "daily", label: "Diaria" },
    executionMode: "plan_only",
    wakeReason: "Acordar revisao documental sem mover, renomear ou chamar provedor externo.",
  },
  {
    id: "paperclip_setup_doctor_recheck",
    label: "Recheck do Auto Setup Doctor",
    source: "paperclip",
    agentId: "paperclip",
    module: "setup",
    capabilityName: "routine_wakeup_plan",
    goalTemplate: "Revalidar configuracoes criticas, lacunas e guardrails do tenant.",
    enabled: false,
    riskLevel: "low",
    schedule: { kind: "weekly", label: "Semanal" },
    executionMode: "plan_only",
    wakeReason: "Preparar recheck seguro de setup sem alterar configuracao automaticamente.",
  },
];

export const DEFAULT_MAYUS_AGENTIC_ROUTINES = RECOMMENDED_MAYUS_AGENTIC_ROUTINES;

function nowIso() {
  return new Date().toISOString();
}

function sanitizeValue(value: unknown): unknown {
  return sanitizeMayusPayload(value);
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeAgenticPolicy(value: unknown): RoutineAgenticPolicyConfig {
  const policy = getRecord(value) as RoutineAgenticPolicyConfig;
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
  };
}

function normalizeRoutine(value: unknown): Partial<MayusAgenticRoutine> | null {
  const record = getRecord(value);
  const id = typeof record.id === "string" ? record.id.trim() : "";
  if (!id) return null;

  return {
    ...record,
    id,
    enabled: record.enabled === true,
    paused: record.paused === true,
    budgetPolicies: Array.isArray(record.budgetPolicies)
      ? record.budgetPolicies as MayusBudgetPolicy[]
      : record.budgetPolicy && typeof record.budgetPolicy === "object"
        ? [record.budgetPolicy as MayusBudgetPolicy]
        : Array.isArray(record.budget_policies)
          ? record.budget_policies as MayusBudgetPolicy[]
          : record.budget_policy && typeof record.budget_policy === "object"
            ? [record.budget_policy as MayusBudgetPolicy]
            : undefined,
    estimatedCostCents: typeof record.estimatedCostCents === "number"
      ? record.estimatedCostCents
      : typeof record.estimated_cost_cents === "number"
        ? record.estimated_cost_cents
        : undefined,
  } as Partial<MayusAgenticRoutine>;
}

function mergeRoutine(base: MayusAgenticRoutine, override?: Partial<MayusAgenticRoutine> | null): MayusAgenticRoutine {
  return {
    ...base,
    ...(override || {}),
    schedule: {
      ...base.schedule,
      ...(override?.schedule || {}),
    },
    budgetPolicy: override?.budgetPolicy || base.budgetPolicy || null,
    budgetPolicies: override?.budgetPolicies || (override?.budgetPolicy ? [override.budgetPolicy] : null) || base.budgetPolicies,
    payload: sanitizeValue(override?.payload || base.payload || {}) as Record<string, unknown>,
  };
}

async function loadTenantRoutineOverrides(params: {
  tenantId: string;
  client: RoutineClient;
}) {
  try {
    const { data, error } = await params.client
      .from("tenant_settings")
      .select("ai_features")
      .eq("tenant_id", params.tenantId)
      .maybeSingle();

    if (error) throw error;
    const aiFeatures = getRecord(data?.ai_features);
    const raw = aiFeatures.mayus_agentic_routines || aiFeatures.agentic_routines;
    if (Array.isArray(raw)) return raw.map(normalizeRoutine).filter(Boolean) as Partial<MayusAgenticRoutine>[];
    if (raw && typeof raw === "object") {
      const record = getRecord(raw);
      const nested = record.routines || record.overrides || record.routine_overrides;
      if (Array.isArray(nested)) return nested.map(normalizeRoutine).filter(Boolean) as Partial<MayusAgenticRoutine>[];
      return Object.values(record).map(normalizeRoutine).filter(Boolean) as Partial<MayusAgenticRoutine>[];
    }
  } catch (error) {
    console.error("[agentic-routines] settings fallback", error);
  }
  return [];
}

async function loadTenantAgenticPolicy(params: {
  tenantId: string;
  client: RoutineClient;
}): Promise<RoutineAgenticPolicyConfig> {
  try {
    const { data, error } = await params.client
      .from("tenant_settings")
      .select("ai_features")
      .eq("tenant_id", params.tenantId)
      .maybeSingle();

    if (error) throw error;
    return normalizeAgenticPolicy(getRecord(data?.ai_features).mayus_agentic_policy);
  } catch (error) {
    console.error("[agentic-routines] policy fallback", error);
    return normalizeAgenticPolicy(null);
  }
}

export async function listMayusAgenticRoutines(params: {
  tenantId: string;
  client?: RoutineClient;
}): Promise<MayusAgenticRoutine[]> {
  const client = params.client || await getDefaultClient();
  const overrides = await loadTenantRoutineOverrides({ tenantId: params.tenantId, client });
  const overrideById = new Map(overrides.map((routine) => [routine.id, routine]));
  const ids = new Set<string>();
  const routines: MayusAgenticRoutine[] = [];

  for (const base of DEFAULT_MAYUS_AGENTIC_ROUTINES) {
    ids.add(base.id);
    const routine = mergeRoutine(base, overrideById.get(base.id));
    routines.push({
      ...routine,
      status: routine.paused ? "skipped" : routine.enabled ? "ready" : "skipped",
      reason: routine.enabled ? routine.wakeReason : "Rotina recomendada, aguardando ativacao do tenant.",
      nextAction: routine.enabled ? "Pode rodar dry-run ou heartbeat manual." : "Ative a rotina para permitir heartbeat auditado.",
    });
  }

  for (const override of overrides) {
    if (!override.id || ids.has(override.id)) continue;
    const routine = mergeRoutine({
      id: override.id,
      label: override.label || override.id,
      source: override.source || "mayus",
      agentId: override.agentId || "operating_partner",
      module: override.module || "setup",
      capabilityName: override.capabilityName || override.id,
      goalTemplate: override.goalTemplate || "Organizar rotina operacional supervisionada.",
      enabled: override.enabled === true,
      paused: override.paused === true,
      riskLevel: override.riskLevel || "low",
      schedule: override.schedule || { kind: "manual", label: "Manual" },
      executionMode: override.executionMode || "plan_only",
      wakeReason: override.wakeReason || "Rotina operacional do MAYUS.",
    }, override);
    routines.push({
      ...routine,
      status: routine.paused ? "skipped" : routine.enabled ? "ready" : "skipped",
      reason: routine.enabled ? routine.wakeReason : "Rotina configurada, mas desativada.",
      nextAction: routine.enabled ? "Pode rodar dry-run ou heartbeat manual." : "Ative a rotina para permitir heartbeat auditado.",
    });
  }

  return routines;
}

function appendTrajectory(
  trajectory: MayusRoutineTrajectoryStep[],
  stage: string,
  status: MayusRoutineTrajectoryStep["status"],
  reason?: string | null,
) {
  trajectory.push({ stage, status, reason: reason || null, at: nowIso() });
}

async function insertSystemEvent(params: {
  client: RoutineClient;
  tenantId: string;
  actorId?: string | null;
  eventName: string;
  status: "ok" | "warning" | "blocked";
  payload: Record<string, unknown>;
}) {
  const event = buildMayusActivityEvent({
    tenantId: params.tenantId,
    actorId: params.actorId || null,
    source: "runtime_governance",
    eventName: params.eventName,
    status: params.status,
    payload: sanitizeValue(params.payload) as Record<string, unknown>,
  });

  const { error } = await params.client.from("system_event_logs").insert({
    tenant_id: params.tenantId,
    user_id: event.actorId,
    source: event.source,
    provider: "mayus",
    event_name: event.eventName,
    status: event.status,
    payload: event.payload,
  });
  if (error) throw error;
}

async function insertBlockedEvent(params: {
  client: RoutineClient;
  tenantId: string;
  actorId?: string | null;
  routine: MayusAgenticRoutine;
  result: MayusRoutineHeartbeatResult;
}) {
  await insertSystemEvent({
    client: params.client,
    tenantId: params.tenantId,
    actorId: params.actorId || null,
    eventName: "agentic_routine_blocked",
    status: "blocked",
    payload: {
      routine_id: params.routine.id,
      module: params.routine.module,
      reason: params.result.reason,
      status: params.result.status,
      trajectory: params.result.trajectory,
    },
  });
}

export async function runMayusRoutineHeartbeat(params: {
  tenantId: string;
  actorId?: string | null;
  routineId?: string;
  dryRun?: boolean;
  force?: boolean;
  client?: RoutineClient;
}): Promise<MayusRoutineHeartbeatResult> {
  const client = params.client || await getDefaultClient();
  const trajectory: MayusRoutineTrajectoryStep[] = [];
  const routines = await listMayusAgenticRoutines({ tenantId: params.tenantId, client });
  const routine = params.routineId
    ? routines.find((item) => item.id === params.routineId)
    : routines.find((item) => item.enabled && !item.paused);

  if (!routine) {
    appendTrajectory(trajectory, "routine_loaded", "blocked", "Rotina nao encontrada.");
    return {
      status: "not_found",
      routineId: params.routineId || "unknown",
      reason: "Rotina agentica nao encontrada para este tenant.",
      missionCreated: false,
      eventName: null,
      trajectory,
      hermesTrajectory: null,
      results: [],
    };
  }

  appendTrajectory(trajectory, "routine_loaded", "ok", routine.wakeReason);

  const budgetDecision = evaluateMayusBudget({
    estimatedCostCents: routine.estimatedCostCents || 0,
    policies: routine.budgetPolicies || [],
  });
  appendTrajectory(trajectory, "budget_checked", budgetDecision.status === "blocked" ? "blocked" : "ok", budgetDecision.reasons[0]);

  const wake = shouldWakeMayusRoutine({
    routine: {
      id: routine.id,
      agentId: routine.agentId,
      module: routine.module,
      enabled: params.force ? true : routine.enabled,
      paused: params.force ? false : routine.paused,
      budgetPolicyId: routine.budgetPolicyId,
      wakeReason: routine.wakeReason,
    },
    budgetDecision,
  });
  if (params.force && wake.shouldWake) {
    appendTrajectory(trajectory, "manual_force", "ok", "Rotina acionada manualmente por usuario autorizado.");
  }

  if (!wake.shouldWake) {
    const status = routine.paused || routine.enabled === false ? "skipped" : "blocked";
    const result: MayusRoutineHeartbeatResult = {
      status,
      routineId: routine.id,
      reason: wake.reason,
      missionCreated: false,
      eventName: status === "blocked" && params.dryRun ? "agentic_routine_dry_run" : status === "blocked" ? "agentic_routine_blocked" : null,
      budgetDecision,
      trajectory,
      hermesTrajectory: null,
      results: status === "blocked"
        ? [{ routineId: routine.id, eventName: params.dryRun ? "agentic_routine_dry_run" : "agentic_routine_blocked" }]
        : [],
    };
    if (status === "blocked" && !params.dryRun) {
      await insertBlockedEvent({ client, tenantId: params.tenantId, actorId: params.actorId || null, routine, result });
    }
    return result;
  }

  const tenantPolicy = await loadTenantAgenticPolicy({ tenantId: params.tenantId, client });
  const autonomyMode = tenantPolicy.module_modes?.[routine.module] || tenantPolicy.autonomy_mode || "supervised";
  const policyDecision = {
    ...decideMayusAutonomy({
      autonomyMode,
      risk: routine.riskLevel,
      surface: "internal",
      toolName: routine.capabilityName,
      requiresCredential: false,
      hasCredential: true,
      externalSideEffect: false,
      estimatedCostCents: routine.estimatedCostCents || 0,
      toolPolicy: tenantPolicy.tool_policy,
    }),
    surface: "internal",
    module: routine.module,
    autonomyMode: String(autonomyMode),
  };
  appendTrajectory(trajectory, "policy_checked", policyDecision.outcome === "blocked_needs_credentials" ? "blocked" : "ok", policyDecision.reason);

  if (policyDecision.outcome === "blocked_needs_credentials") {
    const result: MayusRoutineHeartbeatResult = {
      status: "blocked",
      routineId: routine.id,
      reason: policyDecision.reason,
      missionCreated: false,
      eventName: params.dryRun ? "agentic_routine_dry_run" : "agentic_routine_blocked",
      policyDecision,
      budgetDecision,
      trajectory,
      hermesTrajectory: null,
      results: [{ routineId: routine.id, eventName: params.dryRun ? "agentic_routine_dry_run" : "agentic_routine_blocked" }],
    };
    if (!params.dryRun) {
      await insertBlockedEvent({ client, tenantId: params.tenantId, actorId: params.actorId || null, routine, result });
    }
    return result;
  }

  if (params.dryRun) {
    appendTrajectory(trajectory, "dry_run", "ok", "Dry-run nao grava missao.");
    return {
      status: "dry_run",
      routineId: routine.id,
      reason: "Dry-run preparado sem gravar missao.",
      missionCreated: false,
      eventName: "agentic_routine_dry_run",
      policyDecision,
      budgetDecision,
      trajectory,
      hermesTrajectory: null,
      results: [{ routineId: routine.id, eventName: "agentic_routine_dry_run" }],
    };
  }

  const now = nowIso();
  const taskPayload = {
    tenant_id: params.tenantId,
    created_by: params.actorId || null,
    channel: "background_job",
    module: routine.module,
    status: policyDecision.outcome === "requires_approval" ? "awaiting_approval" : "planning",
    title: routine.label,
    goal: routine.goalTemplate,
    task_input: sanitizeValue({
      routine_id: routine.id,
      source: routine.source,
      capability_name: routine.capabilityName,
      payload: routine.payload || {},
    }),
    task_context: sanitizeValue({
      source: "agentic_routine",
      agent_id: routine.agentId,
      schedule: routine.schedule,
      wake_reason: routine.wakeReason,
    }),
    policy_snapshot: sanitizeValue({ policy_decision: policyDecision, budget_decision: budgetDecision }),
    started_at: now,
  };

  const { data: task, error: taskError } = await client
    .from("brain_tasks")
    .insert(taskPayload)
    .select("*")
    .single();
  if (taskError || !task) throw new Error("routine task insert failed");

  let hermesTrajectory = createHermesMissionTrajectory({
    missionId: String(task.id),
    tenantId: params.tenantId,
    objective: routine.goalTemplate,
    actor: { id: params.actorId || null, role: params.actorId ? "user" : "system" },
    payload: {
      routine_id: routine.id,
      source: routine.source,
      agent_id: routine.agentId,
    },
  });
  hermesTrajectory = recordHermesMissionStep(hermesTrajectory, {
    summary: "Rotina carregada e validada como heartbeat interno.",
    payload: { routine_id: routine.id, schedule: routine.schedule },
  });
  hermesTrajectory = recordHermesMissionDecision(hermesTrajectory, {
    summary: policyDecision.reason,
    payload: {
      policy_decision: policyDecision,
      budget_decision: budgetDecision,
    },
  });

  const { data: run, error: runError } = await client
    .from("brain_runs")
    .insert({
      task_id: task.id,
      tenant_id: params.tenantId,
      attempt_number: 1,
      status: policyDecision.outcome === "requires_approval" ? "awaiting_approval" : "planning",
      started_at: now,
    })
    .select("*")
    .single();
  if (runError || !run) throw new Error("routine run insert failed");

  const { data: step, error: stepError } = await client
    .from("brain_steps")
    .insert({
      task_id: task.id,
      run_id: run.id,
      tenant_id: params.tenantId,
      order_index: 1,
      step_key: "routine_wakeup",
      title: "Acordar rotina agentica",
      step_type: "routine",
      capability_name: routine.capabilityName,
      handler_type: "agentic_routine_heartbeat",
      approval_policy: policyDecision.requiresApproval ? "required" : "supervised",
      status: policyDecision.outcome === "requires_approval" ? "awaiting_approval" : "queued",
      input_payload: sanitizeValue({
        routine,
        policy_decision: policyDecision,
        budget_decision: budgetDecision,
        trajectory,
      }),
    })
    .select("*")
    .single();
  if (stepError || !step) throw new Error("routine step insert failed");

  const { data: artifact, error: artifactError } = await client
    .from("brain_artifacts")
    .insert({
      task_id: task.id,
      run_id: run.id,
      step_id: step.id,
      tenant_id: params.tenantId,
      artifact_type: "routine_wakeup_plan",
      title: routine.label,
      source_module: routine.module,
      mime_type: "application/json",
      metadata: sanitizeValue({
        routine_id: routine.id,
        goal: routine.goalTemplate,
        wake_reason: routine.wakeReason,
        policy_decision: policyDecision,
        budget_decision: budgetDecision,
        payload: routine.payload || {},
        external_side_effects_blocked: true,
      }),
    })
    .select("id")
    .single();
  if (artifactError || !artifact) throw new Error("routine artifact insert failed");
  hermesTrajectory = recordHermesMissionArtifact(hermesTrajectory, {
    summary: "Artifact de plano de wakeup criado.",
    payload: {
      artifact_id: artifact.id,
      artifact_type: "routine_wakeup_plan",
    },
  });

  let approvalId: string | null = null;
  if (policyDecision.outcome === "requires_approval") {
    const { data: approval } = await client
      .from("brain_approvals")
      .insert({
        task_id: task.id,
        run_id: run.id,
        step_id: step.id,
        tenant_id: params.tenantId,
        requested_by: params.actorId || null,
        status: "pending",
        risk_level: routine.riskLevel,
        approval_context: sanitizeValue({
          source: "agentic_routine",
          routine_id: routine.id,
          policy_decision: policyDecision,
        }),
      })
      .select("id")
      .maybeSingle();
    approvalId = typeof approval?.id === "string" ? approval.id : null;
    hermesTrajectory = recordHermesMissionApproval(hermesTrajectory, {
      summary: "Rotina aguardando aprovacao humana.",
      decision: "requested",
      payload: { approval_id: approvalId, routine_id: routine.id },
    });
  }

  if (!approvalId) {
    hermesTrajectory = recordHermesMissionResult(hermesTrajectory, {
      summary: "Rotina acordada como missao reconstruivel.",
      payload: { routine_id: routine.id, task_id: task.id },
    });
  }

  let executionResult: Record<string, unknown> | null = null;
  if (routine.id === "mayus-self-improvement-review") {
    const review = await runSelfImprovementReview({
      supabase: client,
      tenantId: params.tenantId,
      actorId: params.actorId || null,
      brainContext: {
        taskId: task.id,
        runId: run.id,
        stepId: step.id,
      },
    });
    executionResult = { self_improvement_review: review };
    appendTrajectory(
      trajectory,
      "self_improvement_review",
      "ok",
      `${review.proposalsCreated} proposta(s) de memoria criadas.`,
    );
  }

  const result: MayusRoutineHeartbeatResult = {
    status: "woken",
    routineId: routine.id,
    reason: policyDecision.outcome === "requires_approval"
      ? "Rotina preparada e aguardando aprovacao humana."
      : "Rotina acordada como missao reconstruivel.",
    missionCreated: true,
    taskId: task.id,
    runId: run.id,
    stepId: step.id,
    artifactId: artifact.id,
    approvalId,
    eventName: "agentic_routine_woken",
    policyDecision,
    budgetDecision,
    trajectory,
    hermesTrajectory,
    executionResult,
    brainTrace: {
      taskId: task.id,
      runId: run.id,
      stepId: step.id,
      artifactId: artifact.id,
      learningEventCreated: false,
      systemEventCreated: false,
    },
  };
  result.results = [{
    routineId: routine.id,
    eventName: "agentic_routine_woken",
    brainTrace: result.brainTrace || undefined,
  }];
  appendTrajectory(result.trajectory, approvalId ? "approval_created" : "mission_created", "ok", result.reason);

  const { error: learningError } = await client.from("learning_events").insert({
    tenant_id: params.tenantId,
    task_id: task.id,
    run_id: run.id,
    step_id: step.id,
    event_type: "agentic_routine_heartbeat",
    source_module: routine.module,
    payload: sanitizeValue(result),
    created_by: params.actorId || null,
  });
  if (learningError) throw learningError;
  if (result.brainTrace) result.brainTrace.learningEventCreated = true;

  await insertSystemEvent({
    client,
    tenantId: params.tenantId,
    actorId: params.actorId || null,
    eventName: "agentic_routine_woken",
    status: approvalId ? "warning" : "ok",
    payload: result,
  });
  if (result.brainTrace) result.brainTrace.systemEventCreated = true;

  return result;
}
