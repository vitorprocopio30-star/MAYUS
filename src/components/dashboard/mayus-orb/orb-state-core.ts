import {
  MAYUS_ORB_VISUAL_CHANGE_MESSAGE,
  type MayusOrbEvent,
  type MayusOrbState,
  type MayusOrbStatus,
} from "@/lib/brain/orb-events";

export type OrbStage = MayusOrbState;
export type OrbEventSource = "voice" | "chat" | "brain_realtime" | "local_fallback";

export interface OrbState {
  stage: OrbStage;
  source: OrbEventSource;
  status: MayusOrbStatus | null;
  message: string | null;
  taskId: string | null;
  runId: string | null;
  stepId: string | null;
  capabilityName: string | null;
  handlerType: string | null;
  sourceModule: string | null;
  targetSelector: string | null;
  updatedAt: string;
  event: MayusOrbEvent | null;
}

export type OrbTransitionOptions = {
  source?: OrbEventSource;
  event?: unknown;
  message?: string | null;
  updatedAt?: string;
};

export type OrbReducerAction =
  | ({ type: "summon" } & OrbTransitionOptions)
  | ({ type: "start_working" } & OrbTransitionOptions)
  | ({ type: "present" } & OrbTransitionOptions)
  | { type: "dismiss"; updatedAt?: string }
  | { type: "reset"; updatedAt?: string }
  | {
      type: "settle_presentation";
      nextStage: Extract<OrbStage, "idle" | "summoned">;
      updatedAt?: string;
    };

const EMPTY_UPDATED_AT = "1970-01-01T00:00:00.000Z";
const VALID_STAGES: readonly OrbStage[] = ["idle", "summoned", "working", "presenting"];
const VALID_STATUSES: readonly MayusOrbStatus[] = [
  "executing",
  "completed",
  "awaiting_approval",
  "failed",
  "completed_with_warnings",
];

export const initialOrbState: OrbState = {
  stage: "idle",
  source: "local_fallback",
  status: null,
  message: null,
  taskId: null,
  runId: null,
  stepId: null,
  capabilityName: null,
  handlerType: null,
  sourceModule: null,
  targetSelector: null,
  updatedAt: EMPTY_UPDATED_AT,
  event: null,
};

function nowIso() {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isOrbStage(value: unknown): value is OrbStage {
  return typeof value === "string" && VALID_STAGES.includes(value as OrbStage);
}

function isOrbStatus(value: unknown): value is MayusOrbStatus {
  return typeof value === "string" && VALID_STATUSES.includes(value as MayusOrbStatus);
}

function defaultMessageFor(stage: OrbStage, status: MayusOrbStatus | null) {
  if (stage === "working" || status === "executing") {
    return MAYUS_ORB_VISUAL_CHANGE_MESSAGE;
  }

  if (stage === "presenting") {
    if (status === "awaiting_approval") return "O MAYUS preparou a acao e vai pedir aprovacao.";
    if (status === "failed") return "O MAYUS encontrou um bloqueio e vai mostrar o que aconteceu.";
    if (status === "completed_with_warnings") return "O MAYUS concluiu com avisos e vai apresentar o resumo.";
    return "O MAYUS terminou a execucao e vai apresentar o resultado.";
  }

  return null;
}

export function parseMayusOrbEvent(value: unknown): MayusOrbEvent | null {
  if (!isRecord(value)) return null;
  if (value.schemaVersion !== "mayus_orb_state.v1") return null;
  if (!isOrbStage(value.state) || !isOrbStatus(value.status)) return null;

  const message = cleanString(value.message) || defaultMessageFor(value.state, value.status);
  if (!message) return null;

  return {
    schemaVersion: "mayus_orb_state.v1",
    state: value.state,
    status: value.status,
    message,
    taskId: cleanString(value.taskId),
    runId: cleanString(value.runId),
    stepId: cleanString(value.stepId),
    capabilityName: cleanString(value.capabilityName),
    handlerType: cleanString(value.handlerType),
    sourceModule: cleanString(value.sourceModule),
    targetSelector: cleanString(value.targetSelector),
    createdAt: cleanString(value.createdAt) || nowIso(),
  };
}

export function extractMayusOrbEventFromBrainStep(row: unknown): MayusOrbEvent | null {
  if (!isRecord(row)) return null;

  const outputPayload = isRecord(row.output_payload) ? row.output_payload : null;
  const inputPayload = isRecord(row.input_payload) ? row.input_payload : null;

  return (
    parseMayusOrbEvent(outputPayload?.mayus_orb) ||
    parseMayusOrbEvent(inputPayload?.mayus_orb)
  );
}

export function shouldShowWorkingOrb(state: Pick<OrbState, "stage" | "source">) {
  return state.stage === "working" && state.source === "voice";
}

function sameExecution(state: OrbState, event: MayusOrbEvent | null) {
  if (!event) return false;
  if (event.stepId && state.stepId && event.stepId === state.stepId) return true;
  if (event.runId && state.runId && event.runId === state.runId) return true;
  if (event.taskId && state.taskId && event.taskId === state.taskId) return true;
  return false;
}

function resolveSource(state: OrbState, source: OrbEventSource, event: MayusOrbEvent | null) {
  if (
    source === "brain_realtime" &&
    (state.source === "voice" || state.source === "chat") &&
    sameExecution(state, event)
  ) {
    return state.source;
  }

  return source;
}

function buildState(
  current: OrbState,
  stage: OrbStage,
  options: OrbTransitionOptions
): OrbState {
  const event = parseMayusOrbEvent(options.event);
  const status = event?.status ?? (stage === "working" ? "executing" : null);
  const source = resolveSource(current, options.source || "local_fallback", event);
  const finalStage = stage;

  return {
    stage: finalStage,
    source,
    status,
    message: cleanString(options.message) || event?.message || defaultMessageFor(finalStage, status),
    taskId: event?.taskId ?? null,
    runId: event?.runId ?? null,
    stepId: event?.stepId ?? null,
    capabilityName: event?.capabilityName ?? null,
    handlerType: event?.handlerType ?? null,
    sourceModule: event?.sourceModule ?? null,
    targetSelector: event?.targetSelector ?? null,
    updatedAt: event?.createdAt || options.updatedAt || nowIso(),
    event,
  };
}

function closedState(updatedAt?: string): OrbState {
  return {
    ...initialOrbState,
    updatedAt: updatedAt || nowIso(),
  };
}

export function orbStateReducer(state: OrbState, action: OrbReducerAction): OrbState {
  switch (action.type) {
    case "summon":
      return buildState(state, "summoned", action);
    case "start_working":
      return buildState(state, "working", action);
    case "present":
      return buildState(state, "presenting", action);
    case "dismiss":
    case "reset":
      return closedState(action.updatedAt);
    case "settle_presentation":
      if (state.stage !== "presenting") return state;
      if (action.nextStage === "idle") return closedState(action.updatedAt);
      return {
        ...state,
        stage: "summoned",
        status: null,
        message: null,
        updatedAt: action.updatedAt || nowIso(),
      };
    default:
      return state;
  }
}
