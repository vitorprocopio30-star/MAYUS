import { describe, expect, it } from "vitest";
import { MAYUS_ORB_VISUAL_CHANGE_MESSAGE, type MayusOrbEvent } from "@/lib/brain/orb-events";
import {
  extractMayusOrbEventFromBrainStep,
  initialOrbState,
  orbStateReducer,
  parseMayusOrbEvent,
  shouldShowWorkingOrb,
} from "./orb-state-core";

const workingEvent: MayusOrbEvent = {
  schemaVersion: "mayus_orb_state.v1",
  state: "working",
  status: "executing",
  message: MAYUS_ORB_VISUAL_CHANGE_MESSAGE,
  taskId: "task-1",
  runId: "run-1",
  stepId: "step-1",
  capabilityName: "legal_case_context",
  handlerType: "case_context",
  sourceModule: "mayus",
  targetSelector: null,
  createdAt: "2026-05-08T12:00:00.000Z",
};

const presentingEvent: MayusOrbEvent = {
  ...workingEvent,
  state: "presenting",
  status: "awaiting_approval",
  message: "O MAYUS preparou a acao e vai pedir aprovacao.",
  createdAt: "2026-05-08T12:01:00.000Z",
};

describe("orb state core", () => {
  it("move o Orb para working com fallback local quando o chat inicia execucao", () => {
    const state = orbStateReducer(initialOrbState, {
      type: "start_working",
      source: "chat",
      updatedAt: "2026-05-08T12:00:00.000Z",
    });

    expect(state).toMatchObject({
      stage: "working",
      source: "chat",
      status: "executing",
      message: MAYUS_ORB_VISUAL_CHANGE_MESSAGE,
      updatedAt: "2026-05-08T12:00:00.000Z",
    });
  });

  it("so mostra o mini-Orb de execucao para origem de voz", () => {
    const chatWorking = orbStateReducer(initialOrbState, {
      type: "start_working",
      source: "chat",
    });
    const voiceWorking = orbStateReducer(initialOrbState, {
      type: "start_working",
      source: "voice",
    });

    expect(shouldShowWorkingOrb(chatWorking)).toBe(false);
    expect(shouldShowWorkingOrb(voiceWorking)).toBe(true);
  });

  it("extrai mayus_orb de brain_steps preferindo output_payload final", () => {
    const event = extractMayusOrbEventFromBrainStep({
      input_payload: { mayus_orb: workingEvent },
      output_payload: { mayus_orb: presentingEvent },
    });

    expect(event).toMatchObject({
      state: "presenting",
      status: "awaiting_approval",
      stepId: "step-1",
    });
  });

  it("ignora payloads que nao seguem o schema publico do Orb", () => {
    expect(parseMayusOrbEvent({ state: "working", status: "executing" })).toBeNull();
    expect(parseMayusOrbEvent({ schemaVersion: "mayus_orb_state.v1", state: "bad", status: "executing" })).toBeNull();
  });

  it("volta de presenting para summoned sem encerrar a sessao de voz", () => {
    const presenting = orbStateReducer(initialOrbState, {
      type: "present",
      source: "voice",
      event: presentingEvent,
    });
    const settled = orbStateReducer(presenting, {
      type: "settle_presentation",
      nextStage: "summoned",
      updatedAt: "2026-05-08T12:02:00.000Z",
    });

    expect(settled).toMatchObject({
      stage: "summoned",
      source: "voice",
      status: null,
      message: null,
      taskId: "task-1",
    });
  });
});
