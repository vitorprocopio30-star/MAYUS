export type MayusOrbState = "idle" | "summoned" | "working" | "presenting";

export type MayusOrbStatus =
  | "executing"
  | "completed"
  | "awaiting_approval"
  | "failed"
  | "completed_with_warnings";

export interface MayusOrbEvent {
  schemaVersion: "mayus_orb_state.v1";
  state: MayusOrbState;
  status: MayusOrbStatus;
  message: string;
  taskId: string | null;
  runId: string | null;
  stepId: string | null;
  capabilityName: string | null;
  handlerType: string | null;
  sourceModule: string | null;
  targetSelector: string | null;
  createdAt: string;
}

export const MAYUS_ORB_VISUAL_CHANGE_MESSAGE =
  "O visual do MAYUS vai trocar para acompanhar a execucao.";

const PRESENTING_MESSAGES: Record<Exclude<MayusOrbStatus, "executing">, string> = {
  completed: "O MAYUS terminou a execucao e vai apresentar o resultado.",
  awaiting_approval: "O MAYUS preparou a acao e vai pedir aprovacao.",
  failed: "O MAYUS encontrou um bloqueio e vai mostrar o que aconteceu.",
  completed_with_warnings: "O MAYUS concluiu com avisos e vai apresentar o resumo.",
};

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function buildMayusOrbEvent(params: {
  state: MayusOrbState;
  status: MayusOrbStatus;
  message?: string | null;
  taskId?: unknown;
  runId?: unknown;
  stepId?: unknown;
  capabilityName?: unknown;
  handlerType?: unknown;
  sourceModule?: unknown;
  targetSelector?: unknown;
  createdAt?: string;
}): MayusOrbEvent {
  return {
    schemaVersion: "mayus_orb_state.v1",
    state: params.state,
    status: params.status,
    message:
      nullableString(params.message) ||
      (params.status === "executing"
        ? MAYUS_ORB_VISUAL_CHANGE_MESSAGE
        : PRESENTING_MESSAGES[params.status]),
    taskId: nullableString(params.taskId),
    runId: nullableString(params.runId),
    stepId: nullableString(params.stepId),
    capabilityName: nullableString(params.capabilityName),
    handlerType: nullableString(params.handlerType),
    sourceModule: nullableString(params.sourceModule),
    targetSelector: nullableString(params.targetSelector),
    createdAt: params.createdAt || new Date().toISOString(),
  };
}

export function buildMayusOrbWorkingEvent(params: {
  taskId?: unknown;
  runId?: unknown;
  stepId?: unknown;
  capabilityName?: unknown;
  handlerType?: unknown;
  sourceModule?: unknown;
  targetSelector?: unknown;
  message?: string | null;
  createdAt?: string;
}) {
  return buildMayusOrbEvent({
    ...params,
    state: "working",
    status: "executing",
  });
}

export function buildMayusOrbPresentingEvent(params: {
  status: Exclude<MayusOrbStatus, "executing">;
  taskId?: unknown;
  runId?: unknown;
  stepId?: unknown;
  capabilityName?: unknown;
  handlerType?: unknown;
  sourceModule?: unknown;
  targetSelector?: unknown;
  message?: string | null;
  createdAt?: string;
}) {
  return buildMayusOrbEvent({
    ...params,
    state: "presenting",
  });
}

export function withMayusOrbEvent(
  payload: unknown,
  orb: MayusOrbEvent
): Record<string, unknown> {
  return {
    ...(isRecord(payload) ? payload : {}),
    mayus_orb: orb,
  };
}
