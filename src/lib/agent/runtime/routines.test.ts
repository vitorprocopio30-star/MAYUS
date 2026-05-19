import { beforeEach, describe, expect, it, vi } from "vitest";

const { runSelfImprovementReviewMock } = vi.hoisted(() => ({
  runSelfImprovementReviewMock: vi.fn(),
}));

vi.mock("@/lib/agent/runtime/self-improvement-review", () => ({
  runSelfImprovementReview: runSelfImprovementReviewMock,
}));

import { RECOMMENDED_MAYUS_AGENTIC_ROUTINES, runMayusRoutineHeartbeat } from "./routines";

const ROUTINE_ID = "paperclip_daily_playbook_review";
const SELF_IMPROVEMENT_ROUTINE_ID = "mayus-self-improvement-review";

function createSupabaseMock(settings: unknown) {
  const inserts: Array<{ table: string; payload: any }> = [];
  const deletes: Array<{ table: string; id: string }> = [];
  const ids: Record<string, string> = {
    brain_tasks: "task-1",
    brain_runs: "run-1",
    brain_steps: "step-1",
    brain_artifacts: "artifact-1",
  };

  return {
    inserts,
    deletes,
    client: {
      from(table: string) {
        if (table === "tenant_settings") {
          return {
            select() {
              return {
                eq() {
                  return {
                    maybeSingle: async () => ({
                      data: { ai_features: { mayus_agentic_routines: settings } },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        }

        return {
          insert(payload: any) {
            inserts.push({ table, payload });
            return {
              select() {
                return {
                  single: async () => ({ data: { id: ids[table] || `${table}-1` }, error: null }),
                };
              },
              then(resolve: any, reject: any) {
                return Promise.resolve({ data: null, error: null }).then(resolve, reject);
              },
            };
          },
          delete() {
            return {
              eq(_column: string, id: string) {
                deletes.push({ table, id });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      },
    },
  };
}

function routineSettings(overrides: Record<string, unknown>) {
  return {
    routines: [{
      id: ROUTINE_ID,
      enabled: true,
      ...overrides,
    }],
  };
}

describe("Paperclip routine heartbeat", () => {
  beforeEach(() => {
    runSelfImprovementReviewMock.mockReset();
  });

  it("mantem o catalogo recomendado desativado por padrao", () => {
    expect(RECOMMENDED_MAYUS_AGENTIC_ROUTINES.length).toBeGreaterThan(0);
    expect(RECOMMENDED_MAYUS_AGENTIC_ROUTINES.every((routine) => routine.enabled === false)).toBe(true);
  });

  it("inclui a rotina de auto-aprendizado desabilitada, diaria e low risk", () => {
    const routine = RECOMMENDED_MAYUS_AGENTIC_ROUTINES.find((item) => item.id === SELF_IMPROVEMENT_ROUTINE_ID);

    expect(routine).toEqual(expect.objectContaining({
      agentId: "mayus_self_improvement",
      module: "core",
      capabilityName: "self_improvement_review",
      enabled: false,
      riskLevel: "low",
      executionMode: "plan_only",
      schedule: expect.objectContaining({ kind: "daily" }),
    }));
  });

  it("nao acorda rotina pausada", async () => {
    const { client, inserts } = createSupabaseMock(routineSettings({ paused: true }));

    const result = await runMayusRoutineHeartbeat({
      tenantId: "tenant-1",
      actorId: "user-1",
      routineId: ROUTINE_ID,
      client,
    });

    expect(result.status).toBe("skipped");
    expect(result.missionCreated).toBe(false);
    expect(result.eventName).toBeNull();
    expect(inserts).toHaveLength(0);
  });

  it("permite revisao manual forçada da rotina de auto-aprendizado mesmo desabilitada no scheduler", async () => {
    const review = {
      proposalsCreated: 0,
      patternsDetected: [],
    };
    runSelfImprovementReviewMock.mockResolvedValue(review);
    const { client, inserts } = createSupabaseMock({
      routines: [{
        id: SELF_IMPROVEMENT_ROUTINE_ID,
        enabled: false,
        paused: true,
      }],
    });

    const result = await runMayusRoutineHeartbeat({
      tenantId: "tenant-1",
      actorId: "user-1",
      routineId: SELF_IMPROVEMENT_ROUTINE_ID,
      force: true,
      client,
    });

    expect(result.status).toBe("woken");
    expect(result.executionResult).toEqual({ self_improvement_review: review });
    expect(result.trajectory.some((step) => step.stage === "manual_force")).toBe(true);
    expect(runSelfImprovementReviewMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      actorId: "user-1",
    }));
    expect(inserts.map((item) => item.table)).toEqual([
      "brain_tasks",
      "brain_runs",
      "brain_steps",
      "brain_artifacts",
      "learning_events",
      "system_event_logs",
    ]);
  });

  it("cria task, run, step, artifact e eventos quando a rotina esta ativa", async () => {
    const { client, inserts } = createSupabaseMock(routineSettings({ paused: false }));

    const result = await runMayusRoutineHeartbeat({
      tenantId: "tenant-1",
      actorId: "user-1",
      routineId: ROUTINE_ID,
      client,
    });

    expect(result.status).toBe("woken");
    expect(result.missionCreated).toBe(true);
    expect(result.brainTrace).toEqual(expect.objectContaining({
      taskId: "task-1",
      runId: "run-1",
      stepId: "step-1",
      artifactId: "artifact-1",
      learningEventCreated: true,
      systemEventCreated: true,
    }));
    expect(inserts.map((item) => item.table)).toEqual([
      "brain_tasks",
      "brain_runs",
      "brain_steps",
      "brain_artifacts",
      "learning_events",
      "system_event_logs",
    ]);
    expect(inserts.find((item) => item.table === "brain_artifacts")?.payload).toEqual(expect.objectContaining({
      artifact_type: "routine_wakeup_plan",
    }));
    expect(inserts.find((item) => item.table === "learning_events")?.payload).toEqual(expect.objectContaining({
      event_type: "agentic_routine_heartbeat",
    }));
    expect(inserts.find((item) => item.table === "system_event_logs")?.payload).toEqual(expect.objectContaining({
      event_name: "agentic_routine_woken",
    }));
  });

  it("executa o review de auto-aprendizado quando a rotina dedicada acorda", async () => {
    const review = {
      proposalsCreated: 2,
      patternsDetected: [{
        patternKind: "lead_lost_motivo_preco_alto",
        category: "comercial",
        eventType: "lead_outcome_recorded",
        count: 3,
        evidenceEventIds: ["evt-1", "evt-2", "evt-3"],
        suggestedText: "Ajustar abordagem comercial quando preco alto se repetir.",
      }],
    };
    runSelfImprovementReviewMock.mockResolvedValue(review);
    const { client, inserts } = createSupabaseMock({
      routines: [{
        id: SELF_IMPROVEMENT_ROUTINE_ID,
        enabled: true,
        paused: false,
      }],
    });

    const result = await runMayusRoutineHeartbeat({
      tenantId: "tenant-1",
      actorId: "user-1",
      routineId: SELF_IMPROVEMENT_ROUTINE_ID,
      client,
    });

    expect(result.status).toBe("woken");
    expect(runSelfImprovementReviewMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      actorId: "user-1",
      brainContext: expect.objectContaining({
        taskId: "task-1",
        runId: "run-1",
        stepId: "step-1",
      }),
    }));
    expect(result.executionResult).toEqual({ self_improvement_review: review });
    expect(result.trajectory.some((step) => step.stage === "self_improvement_review")).toBe(true);
    expect(inserts.map((item) => item.table)).toEqual([
      "brain_tasks",
      "brain_runs",
      "brain_steps",
      "brain_artifacts",
      "learning_events",
      "system_event_logs",
    ]);
  });

  it("dry-run nao grava nada", async () => {
    const { client, inserts } = createSupabaseMock(routineSettings({ paused: false }));

    const result = await runMayusRoutineHeartbeat({
      tenantId: "tenant-1",
      actorId: "user-1",
      routineId: ROUTINE_ID,
      dryRun: true,
      client,
    });

    expect(result.status).toBe("dry_run");
    expect(result.eventName).toBe("agentic_routine_dry_run");
    expect(result.missionCreated).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it("budget bloqueia antes de criar missao", async () => {
    const { client, inserts } = createSupabaseMock(routineSettings({
      paused: false,
      estimatedCostCents: 200,
      budgetPolicy: {
        id: "paperclip-budget",
        scope: "agent",
        label: "Paperclip",
        limitCents: 100,
        spentCents: 0,
        hardStop: true,
      },
    }));

    const result = await runMayusRoutineHeartbeat({
      tenantId: "tenant-1",
      actorId: "user-1",
      routineId: ROUTINE_ID,
      client,
    });

    expect(result.status).toBe("blocked");
    expect(result.missionCreated).toBe(false);
    expect(inserts.map((item) => item.table)).toEqual(["system_event_logs"]);
    expect(inserts[0]?.payload).toEqual(expect.objectContaining({
      event_name: "agentic_routine_blocked",
      status: "blocked",
    }));
  });

  it("sanitiza segredos em payloads persistidos", async () => {
    const { client, inserts } = createSupabaseMock(routineSettings({
      paused: false,
      payload: {
        api_key: "sk-secret",
        nested: {
          authorization: "Bearer abc123",
        },
        note: "Bearer token-que-nao-deve-vazar",
      },
    }));

    await runMayusRoutineHeartbeat({
      tenantId: "tenant-1",
      actorId: "user-1",
      routineId: ROUTINE_ID,
      client,
    });

    const serialized = JSON.stringify(inserts);
    expect(serialized).not.toContain("sk-secret");
    expect(serialized).not.toContain("Bearer abc123");
    expect(serialized).not.toContain("token-que-nao-deve-vazar");
    expect(serialized).toContain("[redacted]");
  });
});
