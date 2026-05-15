import { describe, expect, it } from "vitest";
import {
  MAYUS_ORB_VISUAL_CHANGE_MESSAGE,
  buildMayusOrbPresentingEvent,
  buildMayusOrbWorkingEvent,
  withMayusOrbEvent,
} from "./orb-events";

describe("mayus orb events", () => {
  it("cria o sinal working para o frontend trocar o visual durante a execucao", () => {
    const event = buildMayusOrbWorkingEvent({
      taskId: "task-1",
      runId: "run-1",
      stepId: "step-1",
      capabilityName: "legal_case_context",
      handlerType: "case_context",
      sourceModule: "mayus",
      createdAt: "2026-05-08T12:00:00.000Z",
    });

    expect(event).toEqual({
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
    });
  });

  it("mantem o payload original e anexa o evento do Orb para brain_steps", () => {
    const event = buildMayusOrbPresentingEvent({
      status: "awaiting_approval",
      taskId: "task-1",
      stepId: "step-1",
      createdAt: "2026-05-08T12:01:00.000Z",
    });

    expect(withMayusOrbEvent({ tool_name: "asaas_cobrar" }, event)).toMatchObject({
      tool_name: "asaas_cobrar",
      mayus_orb: {
        state: "presenting",
        status: "awaiting_approval",
        message: "O MAYUS preparou a acao e vai pedir aprovacao.",
        taskId: "task-1",
        stepId: "step-1",
      },
    });
  });
});
