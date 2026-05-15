import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  executeBrainTurnMock,
  getBrainAuthContextMock,
  normalizeBrainMissionKindMock,
  normalizeChatHistoryMock,
} = vi.hoisted(() => ({
  executeBrainTurnMock: vi.fn(),
  getBrainAuthContextMock: vi.fn(),
  normalizeBrainMissionKindMock: vi.fn((value: unknown) => {
    const allowed = new Set(["case_status", "process_mission_plan", "process_execute_next", "general_brain"]);
    return typeof value === "string" && allowed.has(value) ? value : "general_brain";
  }),
  normalizeChatHistoryMock: vi.fn(() => [{ role: "user", content: "historico" }]),
}));

vi.mock("@/lib/brain/server", () => ({
  getBrainAuthContext: getBrainAuthContextMock,
}));

vi.mock("@/lib/brain/turn", () => ({
  executeBrainTurn: executeBrainTurnMock,
  normalizeBrainMissionKind: normalizeBrainMissionKindMock,
  normalizeChatHistory: normalizeChatHistoryMock,
}));

import { POST } from "./route";

function request(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost:3000/api/agent/voice/brain-bridge", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: "session=abc",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/agent/voice/brain-bridge", () => {
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
    executeBrainTurnMock.mockResolvedValue({
      reply: "Resposta longa registrada no chat.",
      voiceReply: "Resposta curta para voz.",
      missionKind: "process_execute_next",
      approvalRequired: false,
      approvalId: null,
      kernel: { status: "executed", missionKind: "process_execute_next" },
      taskId: "task-1",
      runId: "run-1",
      stepId: "step-1",
      responseStatus: 200,
      orb: null,
    });
  });

  it("encaminha OpenAI Realtime como canal de voz com source e missionKind", async () => {
    const response = await POST(request({
      toolName: "consultar_cerebro_mayus",
      prompt: "Mayus, execute o proximo passo seguro.",
      toolPayload: {
        provider: "openai_realtime",
        missionKind: "process_execute_next",
      },
      history: [{ role: "user", content: "execute" }],
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      reply: "Resposta longa registrada no chat.",
      voiceReply: "Resposta curta para voz.",
      missionKind: "process_execute_next",
      approvalRequired: false,
      approvalId: null,
    });
    expect(executeBrainTurnMock).toHaveBeenCalledWith(expect.objectContaining({
      goal: "Mayus, execute o proximo passo seguro.",
      module: "voice",
      channel: "voice",
      learningEventType: "voice_turn_processed",
      taskContext: expect.objectContaining({
        source: "openai_realtime_voice",
        provider: "openai_realtime",
        missionKind: "process_execute_next",
      }),
    }));
  });

  it("mantem ElevenLabs como casca conversacional e propaga aprovacao", async () => {
    executeBrainTurnMock.mockResolvedValueOnce({
      reply: "Antes de executar, preciso de aprovacao.",
      voiceReply: "Antes de executar, preciso da sua aprovacao.",
      missionKind: "process_execute_next",
      approvalRequired: true,
      approvalId: "approval-1",
      kernel: {
        status: "awaiting_approval",
        auditLogId: "audit-1",
        awaitingPayload: { riskLevel: "high" },
      },
      taskId: "task-2",
      runId: "run-2",
      stepId: "step-2",
      responseStatus: 200,
      orb: null,
    });

    const response = await POST(request({
      prompt: "Mayus, envie isso para o cliente.",
      toolPayload: { provider: "elevenlabs" },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.approvalRequired).toBe(true);
    expect(json.approvalId).toBe("approval-1");
    expect(executeBrainTurnMock).toHaveBeenCalledWith(expect.objectContaining({
      channel: "voice",
      taskContext: expect.objectContaining({
        source: "elevenlabs_voice",
        provider: "elevenlabs",
        missionKind: "general_brain",
      }),
    }));
  });
});
