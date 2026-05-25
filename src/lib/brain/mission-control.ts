import type { LegalOperatorMissionSnapshot } from "@/lib/brain/legal-operator-missions";
import {
  HERMES_MINIMUM_TRAJECTORY_TYPES,
  evaluateHermesMissionTrajectory,
  type HermesMissionApprovalStatus,
  type HermesMissionTrajectoryEvaluationEvent,
  type HermesTrajectoryEventType,
} from "@/lib/agent/runtime/trajectory";
import {
  resolveMayusInternalAgentForRoutine,
  summarizeMayusInternalAgent,
} from "@/lib/agent/runtime/control-plane";

type JsonRecord = Record<string, unknown>;

export type BrainMissionTaskInput = {
  id: string;
  title?: string | null;
  goal?: string | null;
  module?: string | null;
  channel?: string | null;
  status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  result_summary?: string | null;
  error_message?: string | null;
  task_input?: JsonRecord | null;
  task_context?: JsonRecord | null;
  policy_snapshot?: JsonRecord | null;
};

export type BrainMissionRunInput = {
  id: string;
  task_id?: string | null;
  status?: string | null;
  attempt_number?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
  output_payload?: JsonRecord | null;
};

export type BrainMissionStepInput = {
  id: string;
  task_id?: string | null;
  run_id?: string | null;
  order_index?: number | null;
  step_key?: string | null;
  title?: string | null;
  step_type?: string | null;
  status?: string | null;
  capability_name?: string | null;
  handler_type?: string | null;
  input_payload?: JsonRecord | null;
  output_payload?: JsonRecord | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

export type BrainMissionApprovalInput = {
  id: string;
  task_id?: string | null;
  step_id?: string | null;
  status?: string | null;
  risk_level?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  approved_at?: string | null;
  decision_notes?: string | null;
  audit_log_id?: string | null;
  approval_context?: JsonRecord | null;
  awaiting_payload?: JsonRecord | null;
  task?: BrainMissionTaskInput | null;
  step?: BrainMissionStepInput | null;
};

export type BrainMissionArtifactInput = {
  id: string;
  task_id?: string | null;
  artifact_type?: string | null;
  title?: string | null;
  source_module?: string | null;
  metadata?: JsonRecord | null;
  created_at?: string | null;
  task?: BrainMissionTaskInput | null;
};

export type BrainMissionEventInput = {
  id: string;
  task_id?: string | null;
  step_id?: string | null;
  event_type?: string | null;
  source_module?: string | null;
  payload?: JsonRecord | null;
  created_at?: string | null;
  task?: BrainMissionTaskInput | null;
  step?: BrainMissionStepInput | null;
};

export type BrainMissionMemoryInput = {
  id: string;
  task_id?: string | null;
  memory_key?: string | null;
  value?: JsonRecord | null;
  source?: string | null;
  confidence?: number | string | null;
  promoted?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type BrainMissionControlPolicySummary = {
  outcome: string | null;
  surface: string | null;
  module: string | null;
  requiresApproval: boolean | null;
  canExecuteNow: boolean | null;
  credentialGate: boolean;
  budgetGate: "ok" | "warning" | "blocked" | null;
  reason: string | null;
  source: string | null;
  debugger: {
    precedence: string[];
    blockedLayer: string | null;
    blockedReasonCode: string | null;
    lowerLayersCannotReopen: boolean;
    appliedLayers: Array<{
      scope: string | null;
      key: string | null;
      enabled: boolean | null;
      requiresApproval: boolean | null;
      hasAllow: boolean | null;
      hasDeny: boolean | null;
      hasSurfaceMatrix: boolean | null;
    }>;
  } | null;
};

export type BrainMissionControlTrajectorySummary = {
  status: string | null;
  eventsCount: number;
  lastEventType: string | null;
  lastEventSummary: string | null;
  minimumComplete: boolean;
  completionRatio: number;
  missingEventTypes: string[];
  approvalStatus: string | null;
  nextSafeAction: string | null;
  lifecycleStatus: string | null;
  lifecycleKind: string | null;
  latestMemoryId: string | null;
  latestMemoryKey: string | null;
  latestMemorySource: string | null;
  evaluation: {
    minimumComplete: boolean;
    completionRatio: number;
    missingEventTypes: string[];
    approvalStatus: string | null;
    latestLifecycleMemoryId: string | null;
    latestLifecycleMemoryKey: string | null;
    latestLifecycleStatus: string | null;
    latestLifecycleKind: string | null;
    nextSafeAction: string | null;
  };
};

export type BrainMissionControlRoutineSummary = {
  routineId: string | null;
  label: string | null;
  source: string | null;
  agentId: string | null;
  internalAgentId: string | null;
  internalAgentLabel: string | null;
  internalAgentRole: string | null;
  status: string | null;
  budgetStatus: string | null;
  owner: string | null;
};

export type BrainMissionControlTimelineItem = {
  id: string;
  source: "task" | "run" | "step" | "approval" | "artifact" | "event" | "memory";
  title: string | null;
  status: string | null;
  createdAt: string;
};

export type BrainMissionControlStepSummary = {
  id: string;
  title: string | null;
  status: string | null;
  stepType: string | null;
  capabilityName: string | null;
  handlerType: string | null;
};

export type BrainMissionControlPendingApproval = {
  id: string;
  auditLogId: string | null;
  riskLevel: string | null;
  skillName: string | null;
  createdAt: string | null;
};

export type BrainMissionControlSnapshot = {
  missionId: string;
  taskId: string;
  module: string | null;
  agentSource: string | null;
  owner: string | null;
  status: string | null;
  goal: string | null;
  currentStep: BrainMissionControlStepSummary | null;
  pendingApproval: BrainMissionControlPendingApproval | null;
  blockers: string[];
  policy: BrainMissionControlPolicySummary | null;
  trajectory: BrainMissionControlTrajectorySummary | null;
  routine: BrainMissionControlRoutineSummary | null;
  latestArtifactId: string | null;
  latestEventId: string | null;
  timeline: BrainMissionControlTimelineItem[];
  nextSafeAction: string | null;
  legalOperatorMission: LegalOperatorMissionSnapshot | null;
  lastUpdatedAt: string;
};

type MissionBucket = {
  task: BrainMissionTaskInput;
  runs: BrainMissionRunInput[];
  steps: BrainMissionStepInput[];
  approvals: BrainMissionApprovalInput[];
  artifacts: BrainMissionArtifactInput[];
  events: BrainMissionEventInput[];
  memories: BrainMissionMemoryInput[];
  legalOperatorMission: LegalOperatorMissionSnapshot | null;
};

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordValue(value: unknown): JsonRecord | null {
  return isRecord(value) ? value : null;
}

const SECRET_TEXT_PATTERNS: readonly RegExp[] = [
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|bearer[_-]?token|service[_-]?role[_-]?key|token|secret|password|senha|authorization)\b\s*[:=]\s*["']?[^"'\s,;]+/gi,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
];

function sanitizeText(value: string) {
  return SECRET_TEXT_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[redacted]"), value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? sanitizeText(value.trim()).slice(0, 500) : null;
}

function booleanValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

function summarizePolicyDebugger(
  profile: JsonRecord | null,
  policy: JsonRecord | null,
  blockedReason: JsonRecord | null,
): BrainMissionControlPolicySummary["debugger"] {
  const debuggerRecord = recordValue(profile?.debugger) || recordValue(policy?.debugger);
  const rawAppliedLayers = debuggerRecord?.applied_layers
    || debuggerRecord?.appliedLayers
    || profile?.applied_layers
    || profile?.appliedLayers;
  const rawPrecedence = debuggerRecord?.precedence;
  const appliedLayers = Array.isArray(rawAppliedLayers)
    ? rawAppliedLayers
        .filter(isRecord)
        .map((layer) => ({
          scope: stringValue(layer.scope),
          key: stringValue(layer.key),
          enabled: booleanValue(layer.enabled),
          requiresApproval: booleanValue(layer.requires_approval) ?? booleanValue(layer.requiresApproval),
          hasAllow: booleanValue(layer.has_allow) ?? booleanValue(layer.hasAllow),
          hasDeny: booleanValue(layer.has_deny) ?? booleanValue(layer.hasDeny),
          hasSurfaceMatrix: booleanValue(layer.has_surface_matrix) ?? booleanValue(layer.hasSurfaceMatrix),
        }))
        .slice(0, 8)
    : [];
  const precedence = Array.isArray(rawPrecedence)
    ? rawPrecedence
        .map((item) => stringValue(item))
        .filter((item): item is string => Boolean(item))
        .slice(0, 8)
    : ["global", "tenant", "module", "agent", "tool", "channel"];
  const blockedLayer = stringValue(debuggerRecord?.blocked_layer)
    || stringValue(debuggerRecord?.blockedLayer)
    || stringValue(blockedReason?.layer);
  const blockedReasonCode = stringValue(debuggerRecord?.blocked_reason_code)
    || stringValue(debuggerRecord?.blockedReasonCode)
    || stringValue(blockedReason?.code);

  if (!debuggerRecord && appliedLayers.length === 0 && !blockedLayer && !blockedReasonCode) {
    return null;
  }

  return {
    precedence,
    blockedLayer,
    blockedReasonCode,
    lowerLayersCannotReopen: booleanValue(debuggerRecord?.lower_layers_cannot_reopen)
      ?? booleanValue(debuggerRecord?.lowerLayersCannotReopen)
      ?? true,
    appliedLayers,
  };
}

function timestampValue(value: string | null | undefined) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function newerThan(left: string | null | undefined, right: string | null | undefined) {
  return timestampValue(left) > timestampValue(right);
}

function dateValue(...values: Array<string | null | undefined>) {
  return values.find((value) => timestampValue(value) > 0) || new Date(0).toISOString();
}

function getTaskId(input: {
  task_id?: string | null;
  task?: BrainMissionTaskInput | null;
}) {
  return stringValue(input.task_id) || stringValue(input.task?.id);
}

function ensureBucket(
  buckets: Map<string, MissionBucket>,
  task: BrainMissionTaskInput
) {
  const existing = buckets.get(task.id);
  if (existing) {
    existing.task = { ...existing.task, ...task };
    return existing;
  }

  const bucket: MissionBucket = {
    task,
    runs: [],
    steps: [],
    approvals: [],
    artifacts: [],
    events: [],
    memories: [],
    legalOperatorMission: null,
  };
  buckets.set(task.id, bucket);
  return bucket;
}

function ensureTaskFromItem(
  buckets: Map<string, MissionBucket>,
  item: { task_id?: string | null; task?: BrainMissionTaskInput | null }
) {
  const taskId = getTaskId(item);
  if (!taskId) return null;
  return ensureBucket(buckets, item.task?.id ? item.task : { id: taskId });
}

function latestByDate<T>(items: T[], getDate: (item: T) => string | null | undefined) {
  return [...items].sort((left, right) => timestampValue(getDate(right)) - timestampValue(getDate(left)))[0] || null;
}

function extractAwaitingPayload(approval: BrainMissionApprovalInput) {
  const context = recordValue(approval.approval_context);
  return recordValue(approval.awaiting_payload) || recordValue(context?.awaiting_payload);
}

function extractPolicyFromRecord(record: JsonRecord | null | undefined): JsonRecord | null {
  if (!record) return null;
  const governance = recordValue(record.agentic_governance);
  return recordValue(record.policy_decision)
    || recordValue(record.policyDecision)
    || recordValue(record.openclaw_policy)
    || recordValue(governance?.openclaw_policy)
    || recordValue(governance?.openclaw)
    || null;
}

function extractBudgetFromRecord(record: JsonRecord | null | undefined): JsonRecord | null {
  if (!record) return null;
  return recordValue(record.budget_decision)
    || recordValue(record.budgetDecision)
    || null;
}

function summarizePolicy(policy: JsonRecord | null, budget: JsonRecord | null): BrainMissionControlPolicySummary | null {
  if (!policy && !budget) return null;

  const profile = recordValue(policy?.profile_explanation);
  const subject = recordValue(profile?.subject);
  const surfaceMatrix = recordValue(profile?.surface_matrix) || recordValue(policy?.surface_matrix);
  const credentialProviders = Array.isArray(policy?.required_credential_providers)
    ? policy?.required_credential_providers
    : [];
  const budgetStatus = stringValue(budget?.status);
  const blockedReason = recordValue(profile?.blocked_reason);
  const debuggerSummary = summarizePolicyDebugger(profile, policy, blockedReason);

  return {
    outcome: stringValue(policy?.outcome) || stringValue(budget?.status),
    surface: stringValue(policy?.surface) || stringValue(subject?.surface) || stringValue(surfaceMatrix?.surface),
    module: stringValue(policy?.module) || stringValue(subject?.module),
    requiresApproval: booleanValue(policy?.requires_approval) ?? booleanValue(profile?.requires_approval),
    canExecuteNow: booleanValue(policy?.can_execute_now) ?? booleanValue(profile?.can_execute_now),
    credentialGate: credentialProviders.length > 0 || stringValue(policy?.outcome) === "blocked_needs_credentials",
    budgetGate: budgetStatus === "blocked" || budgetStatus === "warning" || budgetStatus === "ok"
      ? budgetStatus
      : null,
    reason: stringValue(policy?.reason)
      || stringValue(blockedReason?.message)
      || stringValue(Array.isArray(budget?.reasons) ? budget?.reasons[0] : null),
    source: stringValue(profile?.source) || (policy ? "openclaw_policy" : budget ? "paperclip_budget" : null),
    debugger: debuggerSummary,
  };
}

function findPolicy(bucket: MissionBucket) {
  const records: Array<JsonRecord | null | undefined> = [
    bucket.task.policy_snapshot,
    bucket.task.task_context,
    bucket.task.task_input,
    ...bucket.steps.flatMap((step) => [step.input_payload, step.output_payload]),
    ...bucket.approvals.flatMap((approval) => [approval.approval_context, extractAwaitingPayload(approval)]),
    ...bucket.artifacts.map((artifact) => artifact.metadata),
    ...bucket.events.map((event) => event.payload),
  ];

  for (const record of records) {
    const policy = extractPolicyFromRecord(record);
    const budget = extractBudgetFromRecord(record);
    if (policy || budget) return summarizePolicy(policy, budget);
  }

  return null;
}

function extractHermesTrajectoryFromRecord(record: JsonRecord | null | undefined): JsonRecord | null {
  if (!record) return null;
  const governance = recordValue(record.agentic_governance);
  return recordValue(record.hermesTrajectory)
    || recordValue(record.hermes_trajectory)
    || recordValue(governance?.hermes_trajectory)
    || recordValue(governance?.hermes)
    || null;
}

const HERMES_EVENT_TYPE_SET = new Set<string>(HERMES_MINIMUM_TRAJECTORY_TYPES);

function hermesEventType(value: unknown): HermesTrajectoryEventType | null {
  const type = stringValue(value);
  return type && HERMES_EVENT_TYPE_SET.has(type) ? type as HermesTrajectoryEventType : null;
}

function hermesEvaluationEventFromRecord(
  record: JsonRecord,
): HermesMissionTrajectoryEvaluationEvent | null {
  const type = hermesEventType(record.type);
  if (!type) return null;
  return {
    type,
    summary: stringValue(record.summary) || stringValue(record.label),
    payload: recordValue(record.payload),
    createdAt: stringValue(record.createdAt) || stringValue(record.created_at),
  };
}

function isHermesLifecycleMemory(memory: BrainMissionMemoryInput) {
  const value = recordValue(memory.value);
  const evidence = recordValue(value?.evidence);
  const lifecycle = recordValue(evidence?.hermes_lifecycle);
  const key = stringValue(memory.memory_key) || "";
  return memory.source === "hermes_lifecycle"
    || Boolean(lifecycle)
    || key.startsWith("skill:")
    || key.startsWith("memory:");
}

function summarizeLifecycleMemory(memory: BrainMissionMemoryInput | null) {
  const value = recordValue(memory?.value);
  const evidence = recordValue(value?.evidence);
  const lifecycle = recordValue(evidence?.hermes_lifecycle);
  const key = stringValue(memory?.memory_key);
  const kindFromKey = key?.startsWith("skill:")
    ? "skill"
    : key?.startsWith("memory:")
      ? "memory"
      : null;

  return {
    id: stringValue(memory?.id),
    key,
    source: stringValue(memory?.source),
    status: stringValue(lifecycle?.status) || stringValue(value?.status) || (memory?.promoted ? "approved" : null),
    kind: stringValue(lifecycle?.kind)
      || stringValue(value?.hermes_lifecycle_kind)
      || stringValue(value?.kind)
      || kindFromKey
      || stringValue(memory?.source),
  };
}

function isHermesLearningEvent(event: BrainMissionEventInput) {
  const payload = recordValue(event.payload);
  return Boolean(extractHermesTrajectoryFromRecord(payload))
    || String(event.event_type || "").startsWith("hermes_")
    || stringValue(payload?.hermes_lifecycle_id) !== null;
}

function approvalDecisionFromStatus(status: string | null): HermesMissionApprovalStatus {
  if (status === "approved" || status === "accepted") return "approved";
  if (status === "rejected" || status === "denied" || status === "cancelled") return "rejected";
  return "requested";
}

function pushHermesEvaluationEvent(
  events: HermesMissionTrajectoryEvaluationEvent[],
  type: HermesTrajectoryEventType,
  summary: unknown,
  createdAt: string | null | undefined,
  payload?: Record<string, unknown> | null,
) {
  events.push({
    type,
    summary: stringValue(summary) || undefined,
    payload: payload ?? null,
    createdAt: createdAt ?? null,
  });
}

function buildHermesEvaluationEvents(params: {
  bucket: MissionBucket;
  explicitEvents: HermesMissionTrajectoryEvaluationEvent[];
  latestMemory: BrainMissionMemoryInput | null;
}): HermesMissionTrajectoryEvaluationEvent[] {
  const { bucket, explicitEvents, latestMemory } = params;
  const events = [...explicitEvents];

  if (bucket.task.goal || bucket.task.title) {
    pushHermesEvaluationEvent(
      events,
      "objective",
      bucket.task.goal || bucket.task.title,
      bucket.task.started_at || bucket.task.created_at || bucket.task.updated_at,
    );
  }

  for (const step of bucket.steps) {
    pushHermesEvaluationEvent(
      events,
      "step",
      step.title || step.capability_name || step.step_key,
      step.started_at || step.created_at || step.updated_at,
    );
  }

  if (bucket.events.some(isHermesLearningEvent) || latestMemory) {
    const event = latestByDate(bucket.events.filter(isHermesLearningEvent), (item) => item.created_at);
    pushHermesEvaluationEvent(
      events,
      "decision",
      event?.event_type || "Lifecycle Hermes proposto para revisao.",
      event?.created_at || latestMemory?.created_at || latestMemory?.updated_at,
      recordValue(event?.payload),
    );
  }

  const blockedStep = latestByDate(
    bucket.steps.filter((step) => ["blocked", "failed", "cancelled", "awaiting_approval"].includes(String(step.status || ""))),
    (step) => step.updated_at || step.created_at,
  );
  const pendingApproval = bucket.approvals.some((approval) => approval.status === "pending");
  if (blockedStep || pendingApproval || bucket.task.status === "blocked" || bucket.task.status === "awaiting_approval") {
    pushHermesEvaluationEvent(
      events,
      "block",
      blockedStep?.error_message || blockedStep?.title || "Bloqueio/revisao humana exigida antes de efeito externo.",
      blockedStep?.updated_at || blockedStep?.created_at || bucket.task.updated_at || bucket.task.created_at,
      { reason: pendingApproval ? "human_approval_required" : "mission_blocked" },
    );
  }

  const artifact = latestByDate(bucket.artifacts, (item) => item.created_at);
  if (artifact) {
    pushHermesEvaluationEvent(
      events,
      "artifact",
      artifact.title || artifact.artifact_type,
      artifact.created_at,
      artifact.metadata,
    );
  }

  const approval = latestByDate(bucket.approvals, (item) => item.approved_at || item.updated_at || item.created_at);
  if (approval) {
    pushHermesEvaluationEvent(
      events,
      "approval",
      approval.decision_notes || approval.status || "Approval humano vinculado a missao.",
      approval.approved_at || approval.updated_at || approval.created_at,
      { decision: approvalDecisionFromStatus(stringValue(approval.status)) },
    );
  }

  const completedRun = latestByDate(
    bucket.runs.filter((run) => run.status === "completed"),
    (run) => run.completed_at || run.updated_at || run.created_at,
  );
  if (bucket.task.result_summary || bucket.task.status === "completed" || completedRun) {
    pushHermesEvaluationEvent(
      events,
      "result",
      bucket.task.result_summary || completedRun?.output_payload?.summary || "Resultado registrado na missao.",
      completedRun?.completed_at || bucket.task.updated_at || bucket.task.created_at,
      recordValue(completedRun?.output_payload),
    );
  }

  return events;
}

function summarizeTrajectory(bucket: MissionBucket): BrainMissionControlTrajectorySummary | null {
  const records: Array<JsonRecord | null | undefined> = [
    ...bucket.steps.flatMap((step) => [step.input_payload, step.output_payload]),
    ...bucket.artifacts.map((artifact) => artifact.metadata),
    ...bucket.events.map((event) => event.payload),
  ];
  const trajectory = records.map(extractHermesTrajectoryFromRecord).find(Boolean) || null;
  const explicitEvents = Array.isArray(trajectory?.events)
    ? trajectory.events.filter(isRecord).map(hermesEvaluationEventFromRecord).filter((event): event is HermesMissionTrajectoryEvaluationEvent => Boolean(event))
    : [];
  const latestMemory = latestByDate(
    bucket.memories.filter(isHermesLifecycleMemory),
    (memory) => memory.updated_at || memory.created_at,
  );
  const lifecycle = summarizeLifecycleMemory(latestMemory);
  const hasHermesSignal = Boolean(trajectory || latestMemory || bucket.events.some(isHermesLearningEvent));

  if (!hasHermesSignal) return null;

  const evaluationEvents = buildHermesEvaluationEvents({ bucket, explicitEvents, latestMemory });
  const evaluation = evaluateHermesMissionTrajectory({
    status: stringValue(trajectory?.status) || lifecycle.status || stringValue(bucket.task.status),
    events: evaluationEvents,
  });
  const summaryEvents = explicitEvents.length > 0 ? explicitEvents : evaluationEvents;
  const lastEvent = latestByDate(summaryEvents, (event) => event.createdAt);

  return {
    status: stringValue(trajectory?.status) || lifecycle.status || stringValue(bucket.task.status),
    eventsCount: summaryEvents.length,
    lastEventType: stringValue(lastEvent?.type),
    lastEventSummary: stringValue(lastEvent?.summary),
    minimumComplete: evaluation.minimumComplete,
    completionRatio: evaluation.completionRatio,
    missingEventTypes: evaluation.missingEventTypes,
    approvalStatus: evaluation.approvalStatus,
    nextSafeAction: evaluation.nextSafeAction,
    lifecycleStatus: lifecycle.status,
    lifecycleKind: lifecycle.kind,
    latestMemoryId: lifecycle.id,
    latestMemoryKey: lifecycle.key,
    latestMemorySource: lifecycle.source,
    evaluation: {
      minimumComplete: evaluation.minimumComplete,
      completionRatio: evaluation.completionRatio,
      missingEventTypes: evaluation.missingEventTypes,
      approvalStatus: evaluation.approvalStatus,
      latestLifecycleMemoryId: lifecycle.id,
      latestLifecycleMemoryKey: lifecycle.key,
      latestLifecycleStatus: lifecycle.status,
      latestLifecycleKind: lifecycle.kind,
      nextSafeAction: evaluation.nextSafeAction,
    },
  };
}

function extractRoutineFromRecord(record: JsonRecord | null | undefined): JsonRecord | null {
  if (!record) return null;
  const lastResult = recordValue(record.lastResult);
  return recordValue(record.routine)
    || recordValue(lastResult?.routine)
    || null;
}

function findRoutine(bucket: MissionBucket): BrainMissionControlRoutineSummary | null {
  const taskInput = bucket.task.task_input || {};
  const taskContext = bucket.task.task_context || {};
  const records: Array<JsonRecord | null | undefined> = [
    taskInput,
    taskContext,
    ...bucket.steps.flatMap((step) => [step.input_payload, step.output_payload]),
    ...bucket.artifacts.map((artifact) => artifact.metadata),
    ...bucket.events.map((event) => event.payload),
  ];
  const routineRecord = records.map(extractRoutineFromRecord).find(Boolean);
  const recordBudget = records.map(extractBudgetFromRecord).find(Boolean);
  const latestEventPayload = latestByDate(bucket.events, (event) => event.created_at)?.payload || null;
  const latestArtifactMetadata = latestByDate(bucket.artifacts, (artifact) => artifact.created_at)?.metadata || null;
  const budget = recordBudget
    || extractBudgetFromRecord(latestEventPayload)
    || extractBudgetFromRecord(latestArtifactMetadata)
    || extractBudgetFromRecord(bucket.task.policy_snapshot);

  const routineId = stringValue(routineRecord?.id)
    || stringValue(taskInput.routine_id)
    || stringValue(latestEventPayload?.routineId)
    || stringValue(latestArtifactMetadata?.routine_id);
  if (!routineId && !routineRecord) return null;
  const explicitInternalAgent = recordValue(routineRecord?.internalAgent)
    || recordValue(taskContext.agent_control);
  const agentId = stringValue(explicitInternalAgent?.id)
    || stringValue(taskContext.internal_agent_id)
    || stringValue(routineRecord?.agentId)
    || stringValue(taskContext.agent_id);
  const internalAgent = summarizeMayusInternalAgent(resolveMayusInternalAgentForRoutine({
    id: routineId || "unknown",
    agentId,
    module: stringValue(routineRecord?.module) || stringValue(bucket.task.module),
  }));

  return {
    routineId,
    label: stringValue(routineRecord?.label) || stringValue(bucket.task.title),
    source: stringValue(routineRecord?.source) || stringValue(taskInput.source) || "paperclip",
    agentId,
    internalAgentId: internalAgent.id,
    internalAgentLabel: internalAgent.label,
    internalAgentRole: internalAgent.role,
    status: stringValue(latestEventPayload?.status) || stringValue(bucket.task.status),
    budgetStatus: stringValue(budget?.status),
    owner: internalAgent.owner,
  };
}

function missionOwner(
  bucket: MissionBucket,
  routine: BrainMissionControlRoutineSummary | null,
) {
  if (routine?.owner) return routine.owner;

  const taskInput = bucket.task.task_input || {};
  const taskContext = bucket.task.task_context || {};
  const internalAgent = summarizeMayusInternalAgent(resolveMayusInternalAgentForRoutine({
    id: stringValue(taskInput.routine_id) || bucket.task.id,
    agentId: stringValue(taskContext.internal_agent_id)
      || stringValue(taskInput.internal_agent_id)
      || stringValue(taskContext.agent_id)
      || stringValue(taskInput.agent_id)
      || stringValue(bucket.task.channel)
      || stringValue(bucket.task.module),
    module: stringValue(bucket.task.module),
  }));

  return internalAgent.owner;
}

function currentStep(steps: BrainMissionStepInput[]): BrainMissionControlStepSummary | null {
  const activeStatus = new Set(["awaiting_approval", "running", "executing", "queued", "planning", "failed", "blocked", "cancelled"]);
  const sorted = [...steps].sort((left, right) => {
    const rightRetry = right.status === "queued" && Boolean(recordValue(right.input_payload)?.retry_of_step_id);
    const leftRetry = left.status === "queued" && Boolean(recordValue(left.input_payload)?.retry_of_step_id);
    const retryWeight = Number(rightRetry) - Number(leftRetry);
    if (retryWeight !== 0) return retryWeight;
    const statusWeight = Number(activeStatus.has(String(right.status || ""))) - Number(activeStatus.has(String(left.status || "")));
    if (statusWeight !== 0) return statusWeight;
    const orderDelta = Number(right.order_index || 0) - Number(left.order_index || 0);
    if (orderDelta !== 0) return orderDelta;
    return timestampValue(right.updated_at || right.created_at) - timestampValue(left.updated_at || left.created_at);
  });
  const step = sorted[0];
  if (!step) return null;

  return {
    id: step.id,
    title: stringValue(step.title),
    status: stringValue(step.status),
    stepType: stringValue(step.step_type),
    capabilityName: stringValue(step.capability_name),
    handlerType: stringValue(step.handler_type),
  };
}

function pendingApproval(bucket: MissionBucket): BrainMissionControlPendingApproval | null {
  const approval = bucket.approvals
    .filter((item) => item.status === "pending")
    .sort((left, right) => timestampValue(left.created_at) - timestampValue(right.created_at))[0];
  if (!approval) return null;

  const payload = extractAwaitingPayload(approval);
  const context = recordValue(approval.approval_context);
  return {
    id: approval.id,
    auditLogId: stringValue(approval.audit_log_id) || stringValue(context?.audit_log_id),
    riskLevel: stringValue(approval.risk_level) || stringValue(payload?.riskLevel),
    skillName: stringValue(payload?.skillName) || stringValue(approval.step?.capability_name),
    createdAt: approval.created_at || null,
  };
}

function findLatestArtifactId(bucket: MissionBucket) {
  return stringValue(latestByDate(bucket.artifacts, (artifact) => artifact.created_at)?.id);
}

function findLatestEventId(bucket: MissionBucket) {
  return stringValue(latestByDate(bucket.events, (event) => event.created_at)?.id);
}

function buildTimeline(bucket: MissionBucket): BrainMissionControlTimelineItem[] {
  const items: BrainMissionControlTimelineItem[] = [];
  const taskDate = dateValue(bucket.task.started_at, bucket.task.created_at, bucket.task.updated_at);
  items.push({
    id: bucket.task.id,
    source: "task",
    title: stringValue(bucket.task.title) || stringValue(bucket.task.goal),
    status: stringValue(bucket.task.status),
    createdAt: taskDate,
  });

  for (const run of bucket.runs) {
    items.push({
      id: run.id,
      source: "run",
      title: run.attempt_number ? `Tentativa ${run.attempt_number}` : "Run",
      status: stringValue(run.status),
      createdAt: dateValue(run.started_at, run.created_at, run.updated_at),
    });
  }

  for (const step of bucket.steps) {
    items.push({
      id: step.id,
      source: "step",
      title: stringValue(step.title) || stringValue(step.capability_name),
      status: stringValue(step.status),
      createdAt: dateValue(step.started_at, step.created_at, step.updated_at),
    });
  }

  for (const approval of bucket.approvals) {
    const payload = extractAwaitingPayload(approval);
    items.push({
      id: approval.id,
      source: "approval",
      title: stringValue(payload?.skillName) || stringValue(approval.step?.title) || "Approval",
      status: stringValue(approval.status),
      createdAt: dateValue(approval.created_at, approval.updated_at, approval.approved_at),
    });
  }

  for (const artifact of bucket.artifacts) {
    items.push({
      id: artifact.id,
      source: "artifact",
      title: stringValue(artifact.title) || stringValue(artifact.artifact_type),
      status: stringValue(artifact.metadata?.result_status),
      createdAt: dateValue(artifact.created_at),
    });
  }

  for (const event of bucket.events) {
    const eventTitle = event.event_type === "brain_step_cancelled"
      ? "Step cancelado"
      : event.event_type === "brain_step_retry_requested"
        ? "Retry solicitado"
        : stringValue(event.event_type);
    items.push({
      id: event.id,
      source: "event",
      title: eventTitle,
      status: stringValue(event.payload?.status)
        || stringValue(event.payload?.result_status)
        || stringValue(event.payload?.control_action),
      createdAt: dateValue(event.created_at),
    });
  }

  for (const memory of bucket.memories) {
    const value = recordValue(memory.value);
    items.push({
      id: memory.id,
      source: "memory",
      title: stringValue(memory.memory_key) || stringValue(memory.source),
      status: stringValue(value?.status) || (memory.promoted ? "approved" : "proposed"),
      createdAt: dateValue(memory.created_at, memory.updated_at),
    });
  }

  return items.sort((left, right) => timestampValue(right.createdAt) - timestampValue(left.createdAt)).slice(0, 12);
}

function collectBlockers(params: {
  bucket: MissionBucket;
  policy: BrainMissionControlPolicySummary | null;
  approval: BrainMissionControlPendingApproval | null;
  trajectory: BrainMissionControlTrajectorySummary | null;
  routine: BrainMissionControlRoutineSummary | null;
}) {
  const blockers = new Set<string>();
  const { bucket, policy, approval, trajectory, routine } = params;

  if (approval) blockers.add(`Approval humano pendente${approval.skillName ? `: ${approval.skillName}` : ""}`);
  const taskError = stringValue(bucket.task.error_message);
  if (taskError) blockers.add(taskError.slice(0, 200));
  for (const step of bucket.steps) {
    if ((step.status === "failed" || step.status === "blocked") && step.error_message) {
      const stepError = stringValue(step.error_message);
      if (stepError) blockers.add(stepError.slice(0, 200));
    }
    if (step.status === "cancelled") {
      blockers.add(`Step cancelado: ${stringValue(step.title) || stringValue(step.capability_name) || step.id}`);
    }
    if (step.status === "queued" && recordValue(step.input_payload)?.retry_of_step_id) {
      blockers.add(`Retry aguardando execucao: ${stringValue(step.title) || stringValue(step.capability_name) || step.id}`);
    }
  }
  if (policy?.outcome === "blocked_needs_credentials") blockers.add(policy.reason || "Credencial obrigatoria ausente.");
  if (policy?.budgetGate === "blocked") blockers.add(policy.reason || "Budget bloqueou a missao.");
  if (policy?.requiresApproval) blockers.add(policy.reason || "Policy exige approval humano.");
  if (trajectory?.status === "blocked") blockers.add(trajectory.lastEventSummary || "Trajectory Hermes bloqueada.");
  if (trajectory && !trajectory.minimumComplete) {
    blockers.add(`Trajectory Hermes incompleta: faltam ${trajectory.missingEventTypes.join(", ")}.`);
  }
  if (trajectory?.approvalStatus === "requested") {
    blockers.add("Approval Hermes pendente para memoria, skill ou procedimento.");
  }
  if (routine?.budgetStatus === "blocked") blockers.add("Budget da rotina bloqueado.");

  const legalBlockers = bucket.legalOperatorMission?.currentState.blockers;
  if (Array.isArray(legalBlockers)) {
    for (const blocker of legalBlockers) {
      const text = stringValue(blocker);
      if (text) blockers.add(text);
    }
  }

  return Array.from(blockers).slice(0, 6);
}

function nextSafeAction(params: {
  bucket: MissionBucket;
  current: BrainMissionControlStepSummary | null;
  approval: BrainMissionControlPendingApproval | null;
  policy: BrainMissionControlPolicySummary | null;
  routine: BrainMissionControlRoutineSummary | null;
  trajectory: BrainMissionControlTrajectorySummary | null;
}) {
  const { bucket, current, approval, policy, routine, trajectory } = params;
  const legalAction = recordValue(bucket.legalOperatorMission?.currentState.safeNextAction);
  if (approval) return `Aguardar approval humano${approval.skillName ? ` para ${approval.skillName}` : ""}.`;
  if (policy?.outcome === "blocked_needs_credentials") return policy.reason || "Configurar credencial antes de continuar.";
  if (policy?.budgetGate === "blocked") return policy.reason || "Revisar budget antes de continuar.";
  if (legalAction) return stringValue(legalAction.label) || stringValue(legalAction.action);
  if (trajectory?.nextSafeAction) return trajectory.nextSafeAction;
  if (current?.status === "cancelled") return `Revisar motivo do cancelamento antes de reabrir ${current.title || current.capabilityName || current.id}.`;
  if (current?.status === "queued") return `Executar etapa segura: ${current.title || current.capabilityName || current.id}.`;
  if (routine?.routineId) return "Revisar rotina acordada e manter side effects externos bloqueados.";
  return stringValue(bucket.task.result_summary) || "Revisar a missao e definir o proximo passo supervisionado.";
}

function agentSource(bucket: MissionBucket, routine: BrainMissionControlRoutineSummary | null, trajectory: BrainMissionControlTrajectorySummary | null) {
  if (routine?.source) return routine.source;
  if (trajectory) return "hermes";
  if (bucket.legalOperatorMission) return "legal_operator";
  const input = bucket.task.task_input || {};
  const context = bucket.task.task_context || {};
  return stringValue(input.source) || stringValue(context.source) || stringValue(bucket.task.module) || "mayus";
}

function lastUpdatedAt(bucket: MissionBucket, timeline: BrainMissionControlTimelineItem[]) {
  const latest = timeline[0]?.createdAt;
  if (latest && timestampValue(latest) > 0) return latest;
  return dateValue(bucket.task.updated_at, bucket.task.created_at, bucket.task.started_at);
}

export function buildBrainMissionControlSnapshots(input: {
  tasks?: BrainMissionTaskInput[];
  runs?: BrainMissionRunInput[];
  steps?: BrainMissionStepInput[];
  approvals?: BrainMissionApprovalInput[];
  artifacts?: BrainMissionArtifactInput[];
  events?: BrainMissionEventInput[];
  memories?: BrainMissionMemoryInput[];
  legalOperatorMissions?: LegalOperatorMissionSnapshot[];
}): BrainMissionControlSnapshot[] {
  const buckets = new Map<string, MissionBucket>();

  for (const task of input.tasks || []) {
    if (stringValue(task.id)) ensureBucket(buckets, task);
  }

  for (const run of input.runs || []) {
    const bucket = ensureTaskFromItem(buckets, run);
    if (bucket) bucket.runs.push(run);
  }

  for (const step of input.steps || []) {
    const bucket = ensureTaskFromItem(buckets, step);
    if (bucket) bucket.steps.push(step);
  }

  for (const approval of input.approvals || []) {
    const bucket = ensureTaskFromItem(buckets, approval);
    if (bucket) bucket.approvals.push(approval);
  }

  for (const artifact of input.artifacts || []) {
    const bucket = ensureTaskFromItem(buckets, artifact);
    if (bucket) bucket.artifacts.push(artifact);
  }

  for (const event of input.events || []) {
    const bucket = ensureTaskFromItem(buckets, event);
    if (bucket) bucket.events.push(event);
  }

  for (const memory of input.memories || []) {
    const bucket = ensureTaskFromItem(buckets, memory);
    if (bucket) bucket.memories.push(memory);
  }

  for (const legalMission of input.legalOperatorMissions || []) {
    if (!legalMission.taskId) continue;
    ensureBucket(buckets, { id: legalMission.taskId }).legalOperatorMission = legalMission;
  }

  return Array.from(buckets.values())
    .map((bucket) => {
      const policy = findPolicy(bucket);
      const trajectory = summarizeTrajectory(bucket);
      const routine = findRoutine(bucket);
      const current = currentStep(bucket.steps);
      const approval = pendingApproval(bucket);
      const timeline = buildTimeline(bucket);
      const blockers = collectBlockers({ bucket, policy, approval, trajectory, routine });

      return {
        missionId: bucket.task.id,
        taskId: bucket.task.id,
        module: stringValue(bucket.task.module),
        agentSource: agentSource(bucket, routine, trajectory),
        owner: missionOwner(bucket, routine),
        status: stringValue(bucket.task.status),
        goal: stringValue(bucket.task.goal) || stringValue(bucket.task.title),
        currentStep: current,
        pendingApproval: approval,
        blockers,
        policy,
        trajectory,
        routine,
        latestArtifactId: findLatestArtifactId(bucket),
        latestEventId: findLatestEventId(bucket),
        timeline,
        nextSafeAction: nextSafeAction({ bucket, current, approval, policy, routine, trajectory }),
        legalOperatorMission: bucket.legalOperatorMission,
        lastUpdatedAt: lastUpdatedAt(bucket, timeline),
      } satisfies BrainMissionControlSnapshot;
    })
    .sort((left, right) => timestampValue(right.lastUpdatedAt) - timestampValue(left.lastUpdatedAt));
}
