import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/llm-router", () => ({
  buildHeaders: vi.fn((client: any) => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${client.apiKey}`,
    ...client.extraHeaders,
  })),
  getDefaultModelForUseCase: vi.fn((provider: string) => {
    if (provider === "openai") return "gpt-5.4-nano";
    if (provider === "google") return "gemini-2.0-flash";
    return "qwen/qwen3.6-plus";
  }),
  normalizeLLMProvider: vi.fn((provider: string | null | undefined) => {
    if (provider === "gemini") return "google";
    return provider || null;
  }),
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost:3000/api/ai/ping", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/ai/ping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("pings a manual OpenAI key through the safe provider helper", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "PONG" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request({ provider: "openai", apiKey: "sk-test-secret" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Conexão com OpenAI (ChatGPT) estabelecida!",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test-secret",
        }),
      })
    );
  });

  it("returns a sanitized failure without leaking key, endpoint query, or raw provider text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "invalid_api_key: sk-test-secret is wrong" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(request({ provider: "gemini", apiKey: "gemini-secret" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: "A integracao de IA precisa ser configurada antes de executar esta tarefa.",
      ai_notice: {
        code: "ai_configuration_required",
        severity: "error",
        message: "A integracao de IA precisa ser configurada antes de executar esta tarefa.",
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/sk-test-secret|gemini-secret|invalid_api_key/i);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("?key=");
  });
});
