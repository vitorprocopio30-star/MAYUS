import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  createServerClientMock,
  cookiesMock,
  getUserMock,
  fromMock,
  updates,
  inserts,
} = vi.hoisted(() => {
  const localFromMock = vi.fn();
  return {
    createClientMock: vi.fn(() => ({ from: localFromMock })),
    createServerClientMock: vi.fn(),
    cookiesMock: vi.fn(),
    getUserMock: vi.fn(),
    fromMock: localFromMock,
    updates: [] as Array<{ table: string; payload: any; filters: Array<[string, any]>; inFilters: Array<[string, any[]]> }>,
    inserts: [] as Array<{ table: string; payload: any }>,
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
  return new NextRequest("http://localhost:3000/api/brain/tasks/task-1/cancel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function buildQuery(config?: {
  maybeSingleResult?: { data: any; error: any };
  updateError?: any;
}) {
  const filters: Array<[string, any]> = [];
  const inFilters: Array<[string, any[]]> = [];
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn((field: string, value: any) => {
      filters.push([field, value]);
      return query;
    }),
    in: vi.fn((field: string, value: any[]) => {
      inFilters.push([field, value]);
      return query;
    }),
    maybeSingle: vi.fn(async () => config?.maybeSingleResult ?? { data: null, error: null }),
    update: vi.fn((payload: any) => {
      query.updatePayload = payload;
      return query;
    }),
    insert: vi.fn(async (payload: any) => {
      inserts.push({ table: query.table, payload });
      return { error: null };
    }),
    then: (resolve: any) => {
      updates.push({
        table: query.table,
        payload: query.updatePayload,
        filters: [...filters],
        inFilters: [...inFilters],
      });
      return Promise.resolve({ error: config?.updateError ?? null }).then(resolve);
    },
  };
  return query;
}

function configureServiceClient(taskStatus = "executing") {
  fromMock.mockImplementation((table: string) => {
    if (table === "profiles") {
      const query = buildQuery({
        maybeSingleResult: {
          data: { tenant_id: "tenant-1", role: "admin" },
          error: null,
        },
      });
      query.table = table;
      return query;
    }

    if (table === "brain_tasks") {
      const query = buildQuery({
        maybeSingleResult: {
          data: { id: "task-1", tenant_id: "tenant-1", status: taskStatus, module: "core", title: "Missao teste" },
          error: null,
        },
      });
      query.table = table;
      return query;
    }

    const query = buildQuery();
    query.table = table;
    return query;
  });
}

describe("POST /api/brain/tasks/:id/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    inserts.length = 0;

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

    configureServiceClient();
  });

  it("rejeita requisicao sem autenticacao", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });

    const response = await POST(buildRequest({ reason: "usuario pediu para parar" }), { params: { id: "task-1" } });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Nao autenticado." });
  });

  it("exige motivo de cancelamento", async () => {
    const response = await POST(buildRequest({ reason: "   " }), { params: { id: "task-1" } });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "reason e obrigatorio para cancelar a missao." });
  });

  it("nao cancela missao em estado final", async () => {
    configureServiceClient("completed");

    const response = await POST(buildRequest({ reason: "nao precisa mais" }), { params: { id: "task-1" } });
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual({ error: "Missao ja esta em estado final.", status: "completed" });
    expect(updates).toHaveLength(0);
  });

  it("cancela task, runs, steps, approvals pendentes e registra evento", async () => {
    const response = await POST(buildRequest({ reason: "cliente pediu pausa" }), { params: { id: "task-1" } });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.task.status).toBe("cancelled");

    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "brain_tasks", payload: expect.objectContaining({ status: "cancelled" }) }),
      expect.objectContaining({ table: "brain_runs", payload: expect.objectContaining({ status: "cancelled" }) }),
      expect.objectContaining({ table: "brain_steps", payload: expect.objectContaining({ status: "cancelled" }) }),
      expect.objectContaining({ table: "brain_approvals", payload: expect.objectContaining({ status: "cancelled" }) }),
    ]));

    const stepsUpdate = updates.find((item) => item.table === "brain_steps");
    expect(stepsUpdate?.payload.error_payload).toMatchObject({
      cancelled_by: "user-1",
      cancelled_by_role: "admin",
      reason: "cliente pediu pausa",
    });
    expect(stepsUpdate?.inFilters).toContainEqual([
      "status",
      ["queued", "running", "awaiting_input", "awaiting_approval"],
    ]);

    expect(inserts).toContainEqual({
      table: "learning_events",
      payload: expect.objectContaining({
        tenant_id: "tenant-1",
        task_id: "task-1",
        event_type: "task_cancelled",
        source_module: "core",
        created_by: "user-1",
      }),
    });
    expect(JSON.stringify(inserts)).not.toContain("SUPABASE");
  });
});
