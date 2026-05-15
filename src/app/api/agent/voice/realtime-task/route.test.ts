import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  buildAgendaPayloadFromManualTaskMock,
  getBrainAuthContextMock,
  syncAgendaTaskBySourceMock,
} = vi.hoisted(() => ({
  buildAgendaPayloadFromManualTaskMock: vi.fn(),
  getBrainAuthContextMock: vi.fn(),
  syncAgendaTaskBySourceMock: vi.fn(),
}));

vi.mock("@/lib/brain/server", () => ({
  brainAdminSupabase: { from: vi.fn() },
  getBrainAuthContext: getBrainAuthContextMock,
}));

vi.mock("@/lib/agenda/userTasks", () => ({
  buildAgendaPayloadFromManualTask: buildAgendaPayloadFromManualTaskMock,
  syncAgendaTaskBySource: syncAgendaTaskBySourceMock,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/agent/voice/realtime-task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/agent/voice/realtime-task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBrainAuthContextMock.mockResolvedValue({
      ok: true,
      context: {
        userId: "user-1",
        tenantId: "tenant-1",
        userRole: "Administrador",
      },
    });
    buildAgendaPayloadFromManualTaskMock.mockImplementation((params: any) => ({
      title: params.title,
      description: params.description,
      scheduled_for: params.scheduledFor,
      assigned_to: params.assignedTo,
      created_by: params.createdBy,
      urgency: params.urgency,
      status: "Pendente",
      source_table: "manual_admin",
      source_id: "manual-1",
      tags: params.tags,
    }));
    syncAgendaTaskBySourceMock.mockResolvedValue("task-1");
  });

  it("cria tarefa interna reversivel pelo realtime", async () => {
    const response = await POST(request({
      title: "Revisar contrato",
      description: "Checar clausula de multa",
      due_text: "amanha",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      requiresApproval: false,
      task: { id: "task-1", title: "Revisar contrato" },
    });
    const payload = syncAgendaTaskBySourceMock.mock.calls[0]?.[1];
    expect(payload).toEqual(expect.objectContaining({
      source_table: "openai_realtime",
      created_by_agent: "mayus_realtime",
      assigned_to: "user-1",
    }));
  });

  it("marca pendencia sensivel para revisao humana", async () => {
    const response = await POST(request({
      title: "Enviar contrato ao cliente",
      description: "Enviar pelo WhatsApp",
      requires_external_action: true,
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.requiresApproval).toBe(true);
    const payload = syncAgendaTaskBySourceMock.mock.calls[0]?.[1];
    expect(payload.title).toContain("Revisar/aprovar");
    expect(payload.tags).toContain("requires_human_review");
  });
});
