export type HermesTrajectoryEventType =
  | "objective"
  | "step"
  | "decision"
  | "block"
  | "artifact"
  | "approval"
  | "result";

export type HermesMissionStatus =
  | "running"
  | "waiting_approval"
  | "blocked"
  | "completed"
  | "failed";

export type HermesPersistedScalar = string | number | boolean | null;
export type HermesPersistedValue =
  | HermesPersistedScalar
  | HermesPersistedValue[]
  | { [key: string]: HermesPersistedValue };
export type HermesPersistedRecord = Record<string, HermesPersistedValue>;

export type HermesTrajectoryActor = {
  id?: string | null;
  role: "agent" | "operator" | "system" | "user";
};

export type HermesTrajectoryEvent = {
  id: string;
  missionId: string;
  tenantId?: string | null;
  type: HermesTrajectoryEventType;
  label: string;
  summary: string;
  payload: HermesPersistedRecord;
  actor?: HermesTrajectoryActor;
  createdAt: string;
};

export type HermesMissionTrajectory = {
  missionId: string;
  tenantId?: string | null;
  objective: string;
  status: HermesMissionStatus;
  events: HermesTrajectoryEvent[];
  createdAt: string;
  updatedAt: string;
};

export type HermesMissionApprovalStatus =
  | "not_requested"
  | "requested"
  | "approved"
  | "rejected";

export type HermesMissionTrajectoryEvaluationEvent = {
  type: HermesTrajectoryEventType;
  summary?: unknown;
  payload?: Record<string, unknown> | null;
  createdAt?: string | null;
};

export type HermesMissionTrajectoryEvaluation = {
  minimumComplete: boolean;
  completionRatio: number;
  missingEventTypes: HermesTrajectoryEventType[];
  approvalStatus: HermesMissionApprovalStatus;
  nextSafeAction: string;
};

export type HermesTrajectoryEventInput = {
  type: HermesTrajectoryEventType;
  summary: unknown;
  label?: unknown;
  payload?: Record<string, unknown> | null;
  actor?: HermesTrajectoryActor;
  eventId?: string;
  at?: Date | string;
};

export const HERMES_MINIMUM_TRAJECTORY_TYPES: readonly HermesTrajectoryEventType[] = [
  "objective",
  "step",
  "decision",
  "block",
  "artifact",
  "approval",
  "result",
] as const;

const SECRET_KEY_PATTERN =
  /(api[_-]?key|token|secret|password|senha|authorization|bearer)/i;

const SECRET_TEXT_PATTERNS: readonly RegExp[] = [
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|bearer[_-]?token|service[_-]?role[_-]?key|token|secret|password|senha|authorization)\b\s*[:=]\s*["']?[^"'\s,;]+/gi,
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bsk-[A-Za-z0-9_-]{8,}\b/g,
];

const PII_TEXT_PATTERNS: readonly RegExp[] = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g,
  /\b(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?\d{4,5}[-\s]?\d{4}\b/g,
];

const EVENT_LABELS: Record<HermesTrajectoryEventType, string> = {
  objective: "Objetivo",
  step: "Etapa",
  decision: "Decisao",
  block: "Bloqueio",
  artifact: "Artifact",
  approval: "Approval",
  result: "Resultado",
};

const MISSING_EVENT_LABELS: Record<HermesTrajectoryEventType, string> = {
  objective: "objetivo",
  step: "etapa",
  decision: "decisao",
  block: "bloqueio/revisao",
  artifact: "artifact",
  approval: "approval humano",
  result: "resultado",
};

function toIsoDate(value?: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

function normalizeText(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.replace(/\s+/g, " ").trim();
}

export function sanitizeHermesPersistedText(value: unknown): string {
  let text = normalizeText(value);

  for (const pattern of SECRET_TEXT_PATTERNS) {
    text = text.replace(pattern, "[redacted]");
  }

  for (const pattern of PII_TEXT_PATTERNS) {
    text = text.replace(pattern, "[pii-redacted]");
  }

  return text.slice(0, 4000);
}

export function sanitizeHermesPersistedValue(
  value: unknown,
  keyHint = "",
): HermesPersistedValue {
  if (SECRET_KEY_PATTERN.test(keyHint)) return "[redacted]";
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "string") return sanitizeHermesPersistedText(value);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeHermesPersistedValue(item));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        sanitizeHermesPersistedValue(item, key),
      ]),
    ) as HermesPersistedRecord;
  }

  return sanitizeHermesPersistedText(String(value));
}

export function sanitizeHermesPersistedRecord(
  value?: Record<string, unknown> | null,
): HermesPersistedRecord {
  if (!value) return {};

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sanitizeHermesPersistedValue(item, key),
    ]),
  ) as HermesPersistedRecord;
}

export function buildHermesTrajectoryEvent(params: {
  missionId: string;
  tenantId?: string | null;
  sequence: number;
  input: HermesTrajectoryEventInput;
}): HermesTrajectoryEvent {
  const summary = sanitizeHermesPersistedText(params.input.summary);
  if (!params.missionId || !summary) {
    throw new Error("hermes_trajectory_requires_mission_and_summary");
  }

  const label =
    sanitizeHermesPersistedText(params.input.label) ||
    EVENT_LABELS[params.input.type];

  return {
    id:
      params.input.eventId ||
      `${params.missionId}:${params.input.type}:${params.sequence}`,
    missionId: params.missionId,
    tenantId: params.tenantId ?? null,
    type: params.input.type,
    label,
    summary,
    payload: sanitizeHermesPersistedRecord(params.input.payload),
    actor: params.input.actor,
    createdAt: toIsoDate(params.input.at),
  };
}

export function createHermesMissionTrajectory(input: {
  missionId: string;
  tenantId?: string | null;
  objective: unknown;
  actor?: HermesTrajectoryActor;
  at?: Date | string;
  payload?: Record<string, unknown> | null;
}): HermesMissionTrajectory {
  const objective = sanitizeHermesPersistedText(input.objective);
  if (!input.missionId || !objective) {
    throw new Error("hermes_trajectory_requires_mission_and_objective");
  }

  const createdAt = toIsoDate(input.at);
  const objectiveEvent = buildHermesTrajectoryEvent({
    missionId: input.missionId,
    tenantId: input.tenantId ?? null,
    sequence: 1,
    input: {
      type: "objective",
      summary: objective,
      payload: {
        objective,
        ...(input.payload ?? {}),
      },
      actor: input.actor,
      at: createdAt,
    },
  });

  return {
    missionId: input.missionId,
    tenantId: input.tenantId ?? null,
    objective,
    status: "running",
    events: [objectiveEvent],
    createdAt,
    updatedAt: createdAt,
  };
}

function statusAfterEvent(
  current: HermesMissionStatus,
  event: HermesTrajectoryEvent,
): HermesMissionStatus {
  if (event.type === "block") return "blocked";
  if (event.type === "approval") {
    if (event.payload.decision === "rejected") return "failed";
    if (event.payload.decision === "approved") return current;
    return "waiting_approval";
  }
  if (event.type === "result") return "completed";
  return current;
}

export function appendHermesTrajectoryEvent(
  trajectory: HermesMissionTrajectory,
  input: HermesTrajectoryEventInput,
): HermesMissionTrajectory {
  const event = buildHermesTrajectoryEvent({
    missionId: trajectory.missionId,
    tenantId: trajectory.tenantId ?? null,
    sequence: trajectory.events.length + 1,
    input,
  });

  return {
    ...trajectory,
    status: statusAfterEvent(trajectory.status, event),
    events: [...trajectory.events, event],
    updatedAt: event.createdAt,
  };
}

export function recordHermesMissionStep(
  trajectory: HermesMissionTrajectory,
  input: Omit<HermesTrajectoryEventInput, "type">,
): HermesMissionTrajectory {
  return appendHermesTrajectoryEvent(trajectory, { ...input, type: "step" });
}

export function recordHermesMissionDecision(
  trajectory: HermesMissionTrajectory,
  input: Omit<HermesTrajectoryEventInput, "type">,
): HermesMissionTrajectory {
  return appendHermesTrajectoryEvent(trajectory, { ...input, type: "decision" });
}

export function recordHermesMissionBlock(
  trajectory: HermesMissionTrajectory,
  input: Omit<HermesTrajectoryEventInput, "type">,
): HermesMissionTrajectory {
  return appendHermesTrajectoryEvent(trajectory, { ...input, type: "block" });
}

export function recordHermesMissionArtifact(
  trajectory: HermesMissionTrajectory,
  input: Omit<HermesTrajectoryEventInput, "type">,
): HermesMissionTrajectory {
  return appendHermesTrajectoryEvent(trajectory, { ...input, type: "artifact" });
}

export function recordHermesMissionApproval(
  trajectory: HermesMissionTrajectory,
  input: Omit<HermesTrajectoryEventInput, "type"> & {
    decision?: "requested" | "approved" | "rejected";
  },
): HermesMissionTrajectory {
  const { decision = "requested", payload, ...rest } = input;
  return appendHermesTrajectoryEvent(trajectory, {
    ...rest,
    type: "approval",
    payload: {
      ...(payload ?? {}),
      decision,
    },
  });
}

export function recordHermesMissionResult(
  trajectory: HermesMissionTrajectory,
  input: Omit<HermesTrajectoryEventInput, "type">,
): HermesMissionTrajectory {
  return appendHermesTrajectoryEvent(trajectory, { ...input, type: "result" });
}

export function getMissingHermesMissionTrajectoryTypes(
  trajectory: Pick<HermesMissionTrajectory, "events">,
): HermesTrajectoryEventType[] {
  const present = new Set(trajectory.events.map((event) => event.type));
  return HERMES_MINIMUM_TRAJECTORY_TYPES.filter((type) => !present.has(type));
}

export function hasHermesMinimumMissionTrajectory(
  trajectory: Pick<HermesMissionTrajectory, "events">,
): boolean {
  return getMissingHermesMissionTrajectoryTypes(trajectory).length === 0;
}

export function isApprovedHermesTrajectoryEvent(
  event: HermesTrajectoryEvent,
): boolean {
  return event.type === "approval" && event.payload.decision === "approved";
}

function latestEvaluationEvent(
  events: readonly HermesMissionTrajectoryEvaluationEvent[],
  type?: HermesTrajectoryEventType,
): HermesMissionTrajectoryEvaluationEvent | null {
  const filtered = type ? events.filter((event) => event.type === type) : [...events];
  return filtered.sort((left, right) => (
    Date.parse(String(right.createdAt || "")) - Date.parse(String(left.createdAt || ""))
  ))[0] || filtered[filtered.length - 1] || null;
}

function approvalStatusFromEvent(
  event: HermesMissionTrajectoryEvaluationEvent | null,
): HermesMissionApprovalStatus {
  if (!event) return "not_requested";
  const decision = sanitizeHermesPersistedText(event.payload?.decision);
  if (decision === "approved") return "approved";
  if (decision === "rejected") return "rejected";
  return "requested";
}

function buildHermesNextSafeAction(input: {
  status?: string | null;
  missingEventTypes: readonly HermesTrajectoryEventType[];
  approvalStatus: HermesMissionApprovalStatus;
  lastBlockSummary: string | null;
  hasResultEvent: boolean;
}) {
  if (input.approvalStatus === "requested") {
    return "Aguardar approval humano antes de promover memoria, skill ou procedimento.";
  }
  if (input.approvalStatus === "rejected") {
    return "Revisar rejeicao humana e abrir nova missao supervisionada antes de reutilizar o aprendizado.";
  }
  if (input.status === "blocked") {
    return input.lastBlockSummary || "Resolver bloqueio Hermes antes de qualquer efeito externo.";
  }
  if (input.missingEventTypes.length > 0) {
    const missing = input.missingEventTypes
      .map((type) => MISSING_EVENT_LABELS[type])
      .join(", ");
    return `Completar trajectory Hermes antes de reutilizar aprendizado: faltam ${missing}.`;
  }
  if (input.approvalStatus !== "approved") {
    return "Registrar approval humano antes de transformar a missao em memoria, skill ou procedimento.";
  }
  if (input.status === "completed" || input.hasResultEvent) {
    return "Manter artifact, memoria e auditoria vinculados; qualquer novo uso exige novo ciclo supervisionado.";
  }
  return "Registrar resultado final e manter a trilha Hermes auditavel.";
}

export function evaluateHermesMissionTrajectory(input: {
  status?: HermesMissionStatus | string | null;
  events: readonly HermesMissionTrajectoryEvaluationEvent[];
}): HermesMissionTrajectoryEvaluation {
  const events = input.events.filter((event) => (
    HERMES_MINIMUM_TRAJECTORY_TYPES.includes(event.type)
  ));
  const present = new Set(events.map((event) => event.type));
  const missingEventTypes = HERMES_MINIMUM_TRAJECTORY_TYPES.filter((type) => !present.has(type));
  const approvalStatus = approvalStatusFromEvent(latestEvaluationEvent(events, "approval"));
  const lastBlockSummary = sanitizeHermesPersistedText(
    latestEvaluationEvent(events, "block")?.summary,
  ) || null;
  const status = sanitizeHermesPersistedText(input.status).slice(0, 80) || null;

  return {
    minimumComplete: missingEventTypes.length === 0,
    completionRatio: Number(
      ((HERMES_MINIMUM_TRAJECTORY_TYPES.length - missingEventTypes.length)
        / HERMES_MINIMUM_TRAJECTORY_TYPES.length).toFixed(2),
    ),
    missingEventTypes,
    approvalStatus,
    nextSafeAction: buildHermesNextSafeAction({
      status,
      missingEventTypes,
      approvalStatus,
      lastBlockSummary,
      hasResultEvent: present.has("result"),
    }),
  };
}
