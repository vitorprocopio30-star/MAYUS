type JsonRecord = Record<string, unknown>;

type BrainStepControlClient = {
  from(table: string): any;
};

type BrainStepRecord = {
  id: string;
  task_id: string;
  run_id: string;
  tenant_id: string;
  order_index?: number | null;
  step_key?: string | null;
  title?: string | null;
  step_type?: string | null;
  capability_name?: string | null;
  handler_type?: string | null;
  approval_policy?: string | null;
  status?: string | null;
  input_payload?: JsonRecord | null;
  output_payload?: JsonRecord | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type BrainTaskRecord = {
  id: string;
  tenant_id: string;
  module?: string | null;
  title?: string | null;
  goal?: string | null;
};

export type BrainStepControlResult = {
  taskId: string;
  stepId: string;
  status: "cancelled" | "retry_queued";
  reason: string;
  retryStepId?: string | null;
};

export class BrainStepControlError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "BrainStepControlError";
    this.status = status;
  }
}

const CANCEL_ALLOWED_STATUSES = new Set(["queued", "planning", "failed"]);
const RETRY_ALLOWED_STATUSES = new Set(["failed", "cancelled"]);
const SECRET_KEY_PATTERN = /(api[_-]?key|access[_-]?token|refresh[_-]?token|bearer[_-]?token|service[_-]?role[_-]?key|token|secret|password|senha|authorization)/i;
const SECRET_TEXT_PATTERNS: readonly RegExp[] = [
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|bearer[_-]?token|service[_-]?role[_-]?key|token|secret|password|senha|authorization)\b\s*[:=]\s*["']?[^"'\s,;]+/gi,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
];

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeText(value: string, maxLength = 500) {
  const sanitized = SECRET_TEXT_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[redacted]"), value);
  return sanitized.trim().slice(0, maxLength);
}

function sanitizeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") return sanitizeText(value, 1000);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeJsonValue(item, depth + 1));
  if (!isRecord(value)) return null;

  return Object.fromEntries(
    Object.entries(value).slice(0, 100).map(([key, item]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeJsonValue(item, depth + 1),
    ])
  );
}

function recordValue(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

export function normalizeBrainStepControlReason(value: unknown) {
  if (typeof value !== "string") return null;
  const reason = sanitizeText(value, 500);
  return reason.length >= 3 ? reason : null;
}

async function loadTask(params: {
  client: BrainStepControlClient;
  tenantId: string;
  taskId: string;
}) {
  const { data, error } = await params.client
    .from("brain_tasks")
    .select("id, tenant_id, module, title, goal")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.taskId)
    .maybeSingle();

  if (error) throw new BrainStepControlError(500, "Nao foi possivel carregar a missao.");
  if (!data) throw new BrainStepControlError(404, "Missao nao encontrada.");
  return data as BrainTaskRecord;
}

async function loadStep(params: {
  client: BrainStepControlClient;
  tenantId: string;
  taskId: string;
  stepId: string;
}) {
  const { data, error } = await params.client
    .from("brain_steps")
    .select("id, task_id, run_id, tenant_id, order_index, step_key, title, step_type, capability_name, handler_type, approval_policy, status, input_payload, output_payload, created_at, updated_at")
    .eq("tenant_id", params.tenantId)
    .eq("task_id", params.taskId)
    .eq("id", params.stepId)
    .maybeSingle();

  if (error) throw new BrainStepControlError(500, "Nao foi possivel carregar a etapa.");
  if (!data) throw new BrainStepControlError(404, "Etapa nao encontrada.");
  return data as BrainStepRecord;
}

async function loadNextOrderIndex(params: {
  client: BrainStepControlClient;
  tenantId: string;
  runId: string;
}) {
  const { data, error } = await params.client
    .from("brain_steps")
    .select("order_index")
    .eq("tenant_id", params.tenantId)
    .eq("run_id", params.runId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new BrainStepControlError(500, "Nao foi possivel calcular a fila de retry.");
  const highest = typeof data?.order_index === "number" ? data.order_index : 0;
  return highest + 1;
}

async function insertLearningEvent(params: {
  client: BrainStepControlClient;
  tenantId: string;
  actorId: string;
  task: BrainTaskRecord;
  step: BrainStepRecord;
  eventType: "brain_step_cancelled" | "brain_step_retry_requested";
  payload: JsonRecord;
}) {
  const { error } = await params.client.from("learning_events").insert({
    tenant_id: params.tenantId,
    task_id: params.task.id,
    run_id: params.step.run_id,
    step_id: params.step.id,
    event_type: params.eventType,
    source_module: params.task.module || "brain",
    payload: params.payload,
    created_by: params.actorId,
  });

  if (error) throw new BrainStepControlError(500, "Nao foi possivel registrar auditoria da etapa.");
}

export async function cancelBrainStep(params: {
  client: BrainStepControlClient;
  tenantId: string;
  actorId: string;
  taskId: string;
  stepId: string;
  reason: string;
  now?: string;
}): Promise<BrainStepControlResult> {
  const reason = normalizeBrainStepControlReason(params.reason);
  if (!reason) throw new BrainStepControlError(400, "Informe um motivo valido para cancelar a etapa.");

  const task = await loadTask(params);
  const step = await loadStep(params);
  const previousStatus = String(step.status || "queued");
  if (!CANCEL_ALLOWED_STATUSES.has(previousStatus)) {
    throw new BrainStepControlError(409, "Esta etapa nao pode ser cancelada neste status.");
  }

  const cancelledAt = params.now || new Date().toISOString();
  const outputPayload = {
    ...recordValue(sanitizeJsonValue(step.output_payload)),
    control_action: "cancel",
    previous_status: previousStatus,
    cancelled_at: cancelledAt,
    cancelled_by: params.actorId,
    reason,
    cancel_reason: reason,
  };

  const { error: updateError } = await params.client
    .from("brain_steps")
    .update({
      status: "cancelled",
      output_payload: outputPayload,
      completed_at: cancelledAt,
    })
    .eq("tenant_id", params.tenantId)
    .eq("task_id", params.taskId)
    .eq("id", params.stepId);

  if (updateError) throw new BrainStepControlError(500, "Nao foi possivel cancelar a etapa.");

  await insertLearningEvent({
    client: params.client,
    tenantId: params.tenantId,
    actorId: params.actorId,
    task,
    step,
    eventType: "brain_step_cancelled",
    payload: {
      task_id: task.id,
      step_id: step.id,
      step_title: sanitizeText(step.title || step.step_key || step.id, 200),
      previous_status: previousStatus,
      reason,
      actor_id: params.actorId,
      control_action: "cancel",
      cancelled_at: cancelledAt,
    },
  });

  return {
    taskId: task.id,
    stepId: step.id,
    status: "cancelled",
    reason,
  };
}

export async function retryBrainStep(params: {
  client: BrainStepControlClient;
  tenantId: string;
  actorId: string;
  taskId: string;
  stepId: string;
  reason: string;
  now?: string;
}): Promise<BrainStepControlResult> {
  const reason = normalizeBrainStepControlReason(params.reason);
  if (!reason) throw new BrainStepControlError(400, "Informe um motivo valido para reabrir a etapa.");

  const task = await loadTask(params);
  const step = await loadStep(params);
  const previousStatus = String(step.status || "queued");
  if (!RETRY_ALLOWED_STATUSES.has(previousStatus)) {
    throw new BrainStepControlError(409, "Esta etapa nao pode ser reaberta neste status.");
  }

  const requestedAt = params.now || new Date().toISOString();
  const orderIndex = await loadNextOrderIndex({
    client: params.client,
    tenantId: params.tenantId,
    runId: step.run_id,
  });
  const safeInputPayload = recordValue(sanitizeJsonValue(step.input_payload));
  const retryInputPayload = {
    ...safeInputPayload,
    retry_of_step_id: step.id,
    retry_reason: reason,
    retry_requested_at: requestedAt,
    retry_requested_by: params.actorId,
    previous_status: previousStatus,
  };
  const baseKey = sanitizeText(step.step_key || step.id, 120) || "brain_step";
  const title = sanitizeText(step.title || step.step_key || step.id, 220);

  const { data: retryStep, error: insertError } = await params.client
    .from("brain_steps")
    .insert({
      tenant_id: params.tenantId,
      task_id: task.id,
      run_id: step.run_id,
      order_index: orderIndex,
      step_key: `${baseKey}:retry:${orderIndex}`,
      title: `Retry - ${title}`,
      step_type: step.step_type || "operation",
      capability_name: step.capability_name,
      handler_type: step.handler_type,
      approval_policy: step.approval_policy,
      status: "queued",
      input_payload: retryInputPayload,
      output_payload: {},
      error_payload: {},
    })
    .select("id")
    .single();

  if (insertError || !retryStep?.id) {
    throw new BrainStepControlError(500, "Nao foi possivel criar o retry da etapa.");
  }

  await insertLearningEvent({
    client: params.client,
    tenantId: params.tenantId,
    actorId: params.actorId,
    task,
    step,
    eventType: "brain_step_retry_requested",
    payload: {
      task_id: task.id,
      step_id: step.id,
      retry_step_id: retryStep.id,
      step_title: title,
      previous_status: previousStatus,
      reason,
      actor_id: params.actorId,
      control_action: "retry",
      retry_requested_at: requestedAt,
    },
  });

  return {
    taskId: task.id,
    stepId: step.id,
    retryStepId: retryStep.id,
    status: "retry_queued",
    reason,
  };
}
