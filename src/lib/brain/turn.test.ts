import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  fromMock,
  createBrainArtifactMock,
  listTenantIntegrationsResolvedMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  createBrainArtifactMock: vi.fn(),
  listTenantIntegrationsResolvedMock: vi.fn(),
}));

vi.mock("@/lib/brain/server", () => ({
  brainAdminSupabase: { from: fromMock },
}));

vi.mock("@/lib/brain/artifacts", () => ({
  createBrainArtifact: createBrainArtifactMock,
}));

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsResolved: listTenantIntegrationsResolvedMock,
}));

import { executeBrainTurn } from "./turn";

const updates: Array<{ table: string; payload: Record<string, unknown>; id?: string }> = [];
const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];

function tableChain(table: string, data: unknown = null) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: unknown) => {
      if (column === "id") chain.__id = String(value);
      return chain;
    }),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    update: vi.fn((payload: Record<string, unknown>) => {
      updates.push({ table, payload, id: chain.__id });
      return chain;
    }),
    insert: vi.fn((payload: Record<string, unknown>) => {
      inserts.push({ table, payload });
      return Promise.resolve({ error: null });
    }),
  };
  return chain;
}

describe("executeBrainTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    inserts.length = 0;

    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_settings") {
        return tableChain(table, { ai_features: { brain_provider: "openrouter" } });
      }
      return tableChain(table);
    });
    listTenantIntegrationsResolvedMock.mockResolvedValue([
      { provider: "openrouter", api_key: "sk-test", status: "connected" },
    ]);
    createBrainArtifactMock.mockResolvedValue({ id: "artifact-1" });
  });

  it("abre missao, chama o chat com task/run/step e persiste resultado da capability", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input.toString();
      const body = JSON.parse(String(init?.body || "{}"));

      if (url.endsWith("/api/brain/dispatch")) {
        expect(body).toEqual(expect.objectContaining({
          goal: "Mayus, execute o proximo passo seguro da missao do processo 1234567-89.2024.8.26.0100.",
          module: "mayus",
          channel: "chat",
        }));
        return new Response(JSON.stringify({
          task: { id: "brain-task-1" },
          run: { id: "brain-run-1" },
          step: { id: "brain-step-1", input_payload: { goal: body.goal } },
        }), { status: 200 });
      }

      if (url.endsWith("/api/ai/chat")) {
        expect(body).toEqual(expect.objectContaining({
          message: "Mayus, execute o proximo passo seguro da missao do processo 1234567-89.2024.8.26.0100.",
          provider: "openrouter",
          taskId: "brain-task-1",
          runId: "brain-run-1",
          stepId: "brain-step-1",
        }));
        return new Response(JSON.stringify({
          reply: "## Execucao da missao processual",
          kernel: {
            status: "executed",
            capabilityName: "legal_process_mission_execute_next",
            handlerType: "lex_process_mission_execute_next",
            outputPayload: { step_status: "executed" },
          },
        }), { status: 200 });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeBrainTurn({
      authContext: {
        userId: "user-1",
        tenantId: "tenant-1",
        userRole: "admin",
      },
      baseUrl: "http://localhost:3000/api/brain/chat-turn",
      cookieHeader: "session=abc",
      goal: "Mayus, execute o proximo passo seguro da missao do processo 1234567-89.2024.8.26.0100.",
      module: "mayus",
      channel: "chat",
      learningEventType: "chat_turn_processed",
    });

    expect(result.kernel).toEqual(expect.objectContaining({
      status: "executed",
      taskId: "brain-task-1",
      runId: "brain-run-1",
      stepId: "brain-step-1",
      capabilityName: "legal_process_mission_execute_next",
      handlerType: "lex_process_mission_execute_next",
    }));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "brain_tasks", payload: expect.objectContaining({ status: "completed" }) }),
      expect.objectContaining({ table: "brain_runs", payload: expect.objectContaining({ status: "completed" }) }),
      expect.objectContaining({
        table: "brain_steps",
        payload: expect.objectContaining({
          status: "completed",
          output_payload: expect.objectContaining({
            reply: "## Execucao da missao processual",
          }),
        }),
      }),
    ]));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "learning_events",
        payload: expect.objectContaining({
          event_type: "chat_turn_processed",
          task_id: "brain-task-1",
          step_id: "brain-step-1",
        }),
      }),
    ]));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-1",
      runId: "brain-run-1",
      stepId: "brain-step-1",
      artifactType: "mission_result",
      metadata: expect.objectContaining({ status: "completed" }),
    }));
  });
});
