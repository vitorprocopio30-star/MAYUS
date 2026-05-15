import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  executeBrainTurnMock,
  getBrainAuthContextMock,
  normalizeChatHistoryMock,
} = vi.hoisted(() => ({
  executeBrainTurnMock: vi.fn(),
  getBrainAuthContextMock: vi.fn(),
  normalizeChatHistoryMock: vi.fn(() => []),
}));

vi.mock("@/lib/brain/server", () => ({
  getBrainAuthContext: getBrainAuthContextMock,
}));

vi.mock("@/lib/brain/turn", () => ({
  executeBrainTurn: executeBrainTurnMock,
  normalizeChatHistory: normalizeChatHistoryMock,
}));

import { POST } from "./route";

function request(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost:3000/api/brain/chat-turn", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: "session=abc",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/brain/chat-turn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBrainAuthContextMock.mockResolvedValue({
      ok: true,
      context: {
        userId: "user-1",
        tenantId: "tenant-1",
        userRole: "admin",
      },
    });
    executeBrainTurnMock.mockResolvedValue({
      reply: "Resposta operacional.",
      voiceReply: "Resposta curta.",
      missionKind: "process_mission_plan",
      approvalRequired: false,
      approvalId: null,
      kernel: { status: "success", missionKind: "process_mission_plan" },
      taskId: "task-1",
      runId: "run-1",
      stepId: "step-1",
      responseStatus: 200,
      orb: null,
    });
  });

  it("responde saudacao simples sem abrir missao no Brain", async () => {
    const response = await POST(request({ message: "olá mayus" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      reply: "Olá, Doutor. Estou pronto. Como posso ajudar?",
      voiceReply: "Olá, Doutor. Estou pronto. Como posso ajudar?",
      missionKind: "general_brain",
      approvalRequired: false,
      approvalId: null,
      kernel: {
        status: "success",
        fastPath: "simple_greeting",
      },
      orb: null,
    });
    expect(executeBrainTurnMock).not.toHaveBeenCalled();
  });

  it("mantem pedidos operacionais no Brain", async () => {
    const response = await POST(request({
      message: "Mayus, veja o próximo passo desse processo.",
      provider: "openrouter",
      model: "deepseek/deepseek-v4-p",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.reply).toBe("Resposta operacional.");
    expect(json.voiceReply).toBe("Resposta curta.");
    expect(json.missionKind).toBe("process_mission_plan");
    expect(json.approvalRequired).toBe(false);
    expect(json.approvalId).toBeNull();
    expect(executeBrainTurnMock).toHaveBeenCalledWith(expect.objectContaining({
      goal: "Mayus, veja o próximo passo desse processo.",
      channel: "chat",
      preferredProvider: "openrouter",
      model: "deepseek/deepseek-v4-p",
    }));
  });
});
