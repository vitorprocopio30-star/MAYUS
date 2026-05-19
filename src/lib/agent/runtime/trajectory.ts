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
