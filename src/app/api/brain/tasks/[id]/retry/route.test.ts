import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  createServerClientMock,
  cookiesMock,
  getUserMock,
  fromMock,
  inserts,
  updates,
  deletes,
  state,
} = vi.hoisted(() => {
  const localFromMock = vi.fn();
  return {
    createClientMock: vi.fn(() => ({ from: localFromMock })),
    createServerClientMock: vi.fn(),
    cookiesMock: vi.fn(),
    getUserMock: vi.fn(),
    fromMock: localFromMock,
    inserts: [] as Array<{ table: string; payload: any }>,
    updates: [] as Array<{ table: string; payload: any }>,
    deletes: [] as Array<{ table: string; field: string; value: any }>,
    state: {
      taskStatus: "failed",
      sourceStepStatus: "failed",
      existingRetry: false,
    },
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

import { POST } from "./route";

function buildRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/brain/tasks/task-1/retry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildQuery(table: string) {
  const query: any = {
    table,
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    update: vi.fn((payload: any) => {
      updates.push({ table, payload });
      return query;
    }),
    delete: vi.fn(() => ({
      eq: vi.fn((field: string, value: any) => {
        deletes.push({ table, field, value });
        return Promise.resolve({ error: null });
      }),
    })),
    insert: vi.fn((payload: any) => {
      inserts.push({ table, payload });
      if (table === "learning_events") {
        return Promise.resolve({ error: null });
      }

      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: table === "brain_runs"
              ? { id: "retry-run-1", attempt_number: payload.attempt_number, status: payload.status }
              : { id: "retry-step-1", run_id: "retry-run-1", status: payload.status, input_payload: payload.input_payload },
            error: null,
          })),
        })),
      };
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "profiles") {
        return { data: { tenant_id: "tenant-1", role: "admin" }, error: null };
      }

      if (table === "brain_tasks") {
        return {
          data: { id: "task-1", tenant_id: "tenant-1", status: state.taskStatus, module: "core", title: "Missao teste" },
          error: null,
        };
      }

      if (table === "brain_steps") {
        return {
          data: {
            id: "step-1",
            task_id: "task-1",
            run_id: "run-1",
            tenant_id: "tenant-1",
            order_index: 2,
            step_key: "external_action_preview",
            title: "Preparar preview externo",
            step_type: "operation",
            capability_name: "external_action_preview",
            handler_type: "capability",
            approval_policy: "human_review",
            status: state.sourceStepStatus,
            input_payload: { target: "zapsign" },
            output_payload: { reply: "Falhou ao preparar preview" },
            error_payload: { error: "provider indisponivel" },
          },
          error: null,
        };
      }

      return { data: null, error: null };
    }),
    single: vi.fn(async () => ({ data: null, error: null })),
    then: (resolve: any) => {
      if (query.lastUpdate) {
        return Promise.resolve({ error: null }).then(resolve);
      }
      return Promise.resolve({ data: buildListResult(table), error: null }).then(resolve);
    },
  };

  return query;
}

function buildListResult(table: string) {
  if (table === "brain_runs") {
    const runs = [
      { id: "run-1", attempt_number: 1, status: "failed" },
    ];
    if (state.existingRetry) {
      runs.unshift({ id: "retry-run-existing", attempt_number: 2, status: "queued" });
    }
    return runs;
  }

  if (table === "brain_steps") {
    const steps = [
      { id: "step-1", run_id: "run-1", status: state.sourceStepStatus, input_payload: {}, created_at: "2026-05-01T10:00:00.000Z" },
    ];
    if (state.existingRetry) {
      steps.unshift({
        id: "retry-step-existing",
        run_id: "retry-run-existing",
        status: "queued",
        input_payload: {
          retry_metadata: {
            idempotency_key: "brain-retry:task-1:step-1",
          },
        },
        created_at: "2026-05-01T10:01:00.000Z",
      });
    }
    return steps;
  }

  return [];
}

describe("POST /api/brain/tasks/:id/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;
    updates.length = 0;
    deletes.length = 0;
    state.taskStatus = "failed";
    state.sourceStepStatus = "failed";
    state.existingRetry = false;

    createServerClientMock.mockReturnValue({
      auth: {
        getUser: getUserMock,
      },
    });

    cookiesMock.mockResolvedValue({
      getAll: () => [],
      set: vi.fn(),
    });

    getUserMock.mockResolvedValue({
      data: {
        user: { id: "user-1" },
      },
      error: null,
    });

    fromMock.mockImplementation((table: string) => buildQuery(table));
  });

  it("exige stepId", async () => {
    const response = await POST(buildRequest({ reason: "tentar de novo" }), { params: { id: "task-1" } });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "stepId e obrigatorio para tentar novamente." });
  });

  it("bloqueia retry para step que nao falhou nem foi cancelado", async () => {
    state.sourceStepStatus = "completed";

    const response = await POST(buildRequest({ stepId: "step-1", reason: "reprocessar" }), { params: { id: "task-1" } });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual({
      error: "Apenas steps com falha ou cancelados podem ser retomados por retry.",
      status: "completed",
    });
    expect(inserts).toHaveLength(0);
  });

  it("retorna retry ativo existente pela chave de idempotencia", async () => {
    state.existingRetry = true;

    const response = await POST(buildRequest({ stepId: "step-1", reason: "tentar de novo" }), { params: { id: "task-1" } });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.idempotent).toBe(true);
    expect(json.run.id).toBe("retry-run-existing");
    expect(json.step.id).toBe("retry-step-existing");
    expect(inserts).toHaveLength(0);
  });

  it("cria nova tentativa e step clonado com metadata de retry", async () => {
    const response = await POST(buildRequest({ stepId: "step-1", reason: "provider voltou" }), { params: { id: "task-1" } });
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.idempotent).toBe(false);

    const runInsert = inserts.find((item) => item.table === "brain_runs");
    expect(runInsert?.payload).toMatchObject({
      task_id: "task-1",
      tenant_id: "tenant-1",
      attempt_number: 2,
      status: "queued",
    });

    const stepInsert = inserts.find((item) => item.table === "brain_steps");
    expect(stepInsert?.payload).toMatchObject({
      task_id: "task-1",
      run_id: "retry-run-1",
      tenant_id: "tenant-1",
      order_index: 2,
      step_key: "external_action_preview",
      status: "queued",
      capability_name: "external_action_preview",
    });
    expect(stepInsert?.payload.input_payload.retry_metadata).toMatchObject({
      source_step_id: "step-1",
      source_run_id: "run-1",
      idempotency_key: "brain-retry:task-1:step-1",
      reason: "provider voltou",
      requested_by: "user-1",
      requested_by_role: "admin",
      source_status: "failed",
    });

    expect(updates).toContainEqual({
      table: "brain_tasks",
      payload: expect.objectContaining({ status: "queued", error_message: null, completed_at: null }),
    });
    expect(inserts).toContainEqual({
      table: "learning_events",
      payload: expect.objectContaining({
        tenant_id: "tenant-1",
        task_id: "task-1",
        run_id: "retry-run-1",
        step_id: "retry-step-1",
        event_type: "task_step_retry_requested",
      }),
    });
    expect(JSON.stringify(inserts)).toContain("external_side_effects_blocked");
  });
});
