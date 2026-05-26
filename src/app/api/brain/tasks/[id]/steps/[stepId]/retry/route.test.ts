import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  brainAdminSupabaseMock,
  getBrainAuthContextMock,
  retryBrainStepMock,
  BrainStepControlErrorMock,
} = vi.hoisted(() => {
  class MockBrainStepControlError extends Error {
    status: number;

    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }

  return {
    brainAdminSupabaseMock: { from: vi.fn() },
    getBrainAuthContextMock: vi.fn(),
    retryBrainStepMock: vi.fn(),
    BrainStepControlErrorMock: MockBrainStepControlError,
  };
});

vi.mock("@/lib/brain/server", () => ({
  brainAdminSupabase: brainAdminSupabaseMock,
  getBrainAuthContext: getBrainAuthContextMock,
}));

vi.mock("@/lib/brain/step-control", () => ({
  BrainStepControlError: BrainStepControlErrorMock,
  normalizeBrainStepControlReason: (value: unknown) => {
    if (typeof value !== "string") return null;
    const reason = value.trim();
    return reason.length >= 3 ? reason : null;
  },
  retryBrainStep: retryBrainStepMock,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/brain/tasks/task-1/steps/step-1/retry", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/brain/tasks/[id]/steps/[stepId]/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBrainAuthContextMock.mockResolvedValue({
      ok: true,
      context: {
        userId: "user-session",
        tenantId: "tenant-session",
        userRole: "socio",
      },
    });
    retryBrainStepMock.mockResolvedValue({
      status: "retry_queued",
      taskId: "task-1",
      stepId: "step-1",
      retryStepId: "step-retry-1",
      reason: "Motivo valido",
    });
  });

  it("exige perfil executivo", async () => {
    getBrainAuthContextMock.mockResolvedValueOnce({
      ok: true,
      context: {
        userId: "user-session",
        tenantId: "tenant-session",
        userRole: "operador",
      },
    });

    const response = await POST(request({ reason: "Motivo valido" }), { params: { id: "task-1", stepId: "step-1" } });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("executivos");
    expect(retryBrainStepMock).not.toHaveBeenCalled();
  });

  it("usa ator e tenant da sessao para criar retry", async () => {
    const response = await POST(
      request({ reason: "Reabrir apos revisar logs", actorId: "body-user" }),
      { params: { id: "task-1", stepId: "step-1" } },
    );

    expect(response.status).toBe(200);
    expect(retryBrainStepMock).toHaveBeenCalledWith(expect.objectContaining({
      client: brainAdminSupabaseMock,
      tenantId: "tenant-session",
      actorId: "user-session",
      taskId: "task-1",
      stepId: "step-1",
      reason: "Reabrir apos revisar logs",
    }));
  });

  it("rejeita motivo invalido", async () => {
    const response = await POST(request({ reason: "x" }), { params: { id: "task-1", stepId: "step-1" } });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("motivo");
    expect(retryBrainStepMock).not.toHaveBeenCalled();
  });

  it("propaga erro operacional seguro", async () => {
    retryBrainStepMock.mockRejectedValueOnce(new BrainStepControlErrorMock(409, "Esta etapa nao pode ser reaberta neste status."));

    const response = await POST(request({ reason: "Motivo valido" }), { params: { id: "task-1", stepId: "step-1" } });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain("status");
  });
});
