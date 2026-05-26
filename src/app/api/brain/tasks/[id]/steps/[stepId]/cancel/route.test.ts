import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  brainAdminSupabaseMock,
  getBrainAuthContextMock,
  cancelBrainStepMock,
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
    cancelBrainStepMock: vi.fn(),
    BrainStepControlErrorMock: MockBrainStepControlError,
  };
});

vi.mock("@/lib/brain/server", () => ({
  brainAdminSupabase: brainAdminSupabaseMock,
  getBrainAuthContext: getBrainAuthContextMock,
}));

vi.mock("@/lib/brain/step-control", () => ({
  BrainStepControlError: BrainStepControlErrorMock,
  cancelBrainStep: cancelBrainStepMock,
  normalizeBrainStepControlReason: (value: unknown) => {
    if (typeof value !== "string") return null;
    const reason = value.trim();
    return reason.length >= 3 ? reason : null;
  },
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/brain/tasks/task-1/steps/step-1/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/brain/tasks/[id]/steps/[stepId]/cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBrainAuthContextMock.mockResolvedValue({
      ok: true,
      context: {
        userId: "user-session",
        tenantId: "tenant-session",
        userRole: "administrador",
      },
    });
    cancelBrainStepMock.mockResolvedValue({
      status: "cancelled",
      taskId: "task-1",
      stepId: "step-1",
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
    expect(cancelBrainStepMock).not.toHaveBeenCalled();
  });

  it("usa ator e tenant da sessao, ignorando body", async () => {
    const response = await POST(
      request({ reason: "Cancelar apos revisao", actorId: "body-user", tenantId: "body-tenant" }),
      { params: { id: "task-1", stepId: "step-1" } },
    );

    expect(response.status).toBe(200);
    expect(cancelBrainStepMock).toHaveBeenCalledWith(expect.objectContaining({
      client: brainAdminSupabaseMock,
      tenantId: "tenant-session",
      actorId: "user-session",
      taskId: "task-1",
      stepId: "step-1",
      reason: "Cancelar apos revisao",
    }));
  });

  it("rejeita motivo invalido antes de tocar no controle", async () => {
    const response = await POST(request({ reason: "  " }), { params: { id: "task-1", stepId: "step-1" } });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("motivo");
    expect(cancelBrainStepMock).not.toHaveBeenCalled();
  });

  it("propaga erro operacional seguro", async () => {
    cancelBrainStepMock.mockRejectedValueOnce(new BrainStepControlErrorMock(404, "Etapa nao encontrada."));

    const response = await POST(request({ reason: "Motivo valido" }), { params: { id: "task-1", stepId: "step-1" } });
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe("Etapa nao encontrada.");
  });
});
