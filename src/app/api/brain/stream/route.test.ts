import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getBrainAuthContextMock,
  isBrainExecutiveRoleMock,
  fromMock,
} = vi.hoisted(() => ({
  getBrainAuthContextMock: vi.fn(),
  isBrainExecutiveRoleMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/brain/server", () => ({
  getBrainAuthContext: getBrainAuthContextMock,
  brainAdminSupabase: {
    from: fromMock,
  },
}));

vi.mock("@/lib/brain/roles", () => ({
  isBrainExecutiveRole: isBrainExecutiveRoleMock,
}));

import { GET } from "./route";

function makeMaybeSingleQuery(result: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
  };
  return chain;
}

function makeCountQuery(result: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

async function readEvent(response: Response) {
  const reader = response.body!.getReader();
  const chunk = await reader.read();
  await reader.cancel();
  return new TextDecoder().decode(chunk.value);
}

async function readEvents(response: Response, count: number) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let output = "";

  for (let i = 0; i < count; i += 1) {
    const chunk = await reader.read();
    if (chunk.done) break;
    output += decoder.decode(chunk.value);
  }

  await reader.cancel();
  return output;
}

describe("GET /api/brain/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBrainAuthContextMock.mockResolvedValue({
      context: {
        tenantId: "tenant-1",
        userRole: "admin",
      },
    });
    isBrainExecutiveRoleMock.mockReturnValue(true);
  });

  it("bloqueia perfis nao executivos", async () => {
    isBrainExecutiveRoleMock.mockReturnValueOnce(false);

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("abre SSE autenticado e emite evento inicial", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "learning_events") {
        return makeMaybeSingleQuery({
          data: { id: "event-1", created_at: "2026-05-03T10:00:00.000Z" },
          error: null,
        });
      }

      if (table === "brain_tasks") {
        return makeMaybeSingleQuery({
          data: { id: "task-1", status: "executing", updated_at: "2026-05-03T10:00:01.000Z" },
          error: null,
        });
      }

      if (table === "brain_steps") {
        return makeMaybeSingleQuery({
          data: { id: "step-1", task_id: "task-1", title: "Executar beta", status: "running", updated_at: "2026-05-03T10:00:02.000Z" },
          error: null,
        });
      }

      if (table === "brain_approvals") {
        return makeCountQuery({ data: null, error: null, count: 2 });
      }

      throw new Error(`unexpected table ${table}`);
    });

    const response = await GET();
    const eventText = await readEvent(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(eventText).toContain("event: ready");
  });

  it("inclui estado granular do ultimo step alterado", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "learning_events") {
        return makeMaybeSingleQuery({
          data: { id: "event-1", task_id: "task-1", step_id: "step-1", event_type: "tenant_beta_step_completed", created_at: "2026-05-03T10:00:00.000Z" },
          error: null,
        });
      }

      if (table === "brain_tasks") {
        return makeMaybeSingleQuery({
          data: { id: "task-1", status: "executing", updated_at: "2026-05-03T10:00:01.000Z" },
          error: null,
        });
      }

      if (table === "brain_steps") {
        return makeMaybeSingleQuery({
          data: { id: "step-1", task_id: "task-1", title: "Executar beta", status: "completed", updated_at: "2026-05-03T10:00:02.000Z" },
          error: null,
        });
      }

      if (table === "brain_approvals") {
        return makeCountQuery({ data: null, error: null, count: 0 });
      }

      throw new Error(`unexpected table ${table}`);
    });

    const response = await GET();
    const eventText = await readEvents(response, 2);

    expect(eventText).toContain("event: brain_activity");
    expect(eventText).toContain('"latest_step_id":"step-1"');
    expect(eventText).toContain('"latest_step_status":"completed"');
  });
});
