import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/brain/server", () => ({
  brainAdminSupabase: { from: vi.fn() },
  getBrainAuthContext: vi.fn(),
}));

vi.mock("@/lib/llm-fallback", () => ({
  callLLMWithFallback: vi.fn(),
}));

vi.mock("@/lib/llm-router", () => ({
  normalizeLLMProvider: vi.fn((provider: string | null | undefined) => {
    if (!provider) return null;
    if (provider === "gemini") return "google";
    if (provider === "grok") return "groq";
    return provider;
  }),
}));

import { getBrainAuthContext } from "@/lib/brain/server";
import { callLLMWithFallback } from "@/lib/llm-fallback";
import { POST } from "./route";

const getBrainAuthContextMock = vi.mocked(getBrainAuthContext);
const callLLMWithFallbackMock = vi.mocked(callLLMWithFallback);

function request(body: unknown) {
  return new Request("http://localhost:3000/api/ai/mural-moderator", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/mural-moderator", () => {
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
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [
          {
            message: {
              content: '{"isApproved":true,"reason":"","sentiment":"positive"}',
            },
          },
        ],
      },
      usedClient: {
        provider: "openrouter",
        model: "qwen/qwen3.6-plus",
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        extraHeaders: {},
        source: "tenant",
        isPreferred: true,
      },
      fallbackTrace: [],
    } as any);
  });

  it("uses the LLM fallback wrapper and returns valid moderation JSON", async () => {
    const response = await POST(request({
      content: "Parabens ao time pelo atendimento.",
      provider: "openrouter",
      model: "ignored-by-fallback",
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      isApproved: true,
      reason: "",
      sentiment: "positive",
      ai_notice: null,
    });
    expect(callLLMWithFallbackMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      useCase: "task_manager",
      preferredProvider: "openrouter",
      allowNonOpenAICompatible: true,
      request: expect.objectContaining({
        response_format: { type: "json_object" },
        temperature: 0,
        max_tokens: 300,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({ role: "user", content: "Parabens ao time pelo atendimento." }),
        ]),
      }),
    }));
    expect(callLLMWithFallbackMock.mock.calls[0]?.[0]?.request).not.toHaveProperty("model");
  });

  it("returns a sanitized blocking error when every LLM candidate fails", async () => {
    callLLMWithFallbackMock.mockResolvedValue({
      ok: false,
      failureKind: "provider_unavailable",
      fallbackTrace: [],
      notice: {
        code: "ai_unavailable",
        severity: "error",
        message: "Nao consegui acessar um modelo de IA disponivel agora. Tente novamente em alguns instantes ou revise as integracoes.",
      },
    } as any);

    const response = await POST(request({
      content: "Mensagem para revisar.",
      provider: "anthropic",
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Nao consegui acessar um modelo de IA disponivel agora. Tente novamente em alguns instantes ou revise as integracoes.",
      ai_notice: {
        code: "ai_unavailable",
        severity: "error",
        message: "Nao consegui acessar um modelo de IA disponivel agora. Tente novamente em alguns instantes ou revise as integracoes.",
      },
    });
  });
});
