import { beforeEach, describe, expect, it, vi } from "vitest";

const { listTenantIntegrationsResolvedMock } = vi.hoisted(() => ({
  listTenantIntegrationsResolvedMock: vi.fn(),
}));

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsResolved: listTenantIntegrationsResolvedMock,
}));

import { callLLMWithFallback } from "./llm-fallback";
import { buildAINoticeForFailure, classifyLLMFailure } from "./llm-errors";

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("llm fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("classifies quota and rate limit errors without exposing raw provider text", () => {
    expect(classifyLLMFailure({ status: 402, body: { error: { message: "insufficient_quota: buy credits" } } })).toBe("insufficient_quota");
    expect(classifyLLMFailure({ status: 429, body: { error: { message: "rate limit exceeded" } } })).toBe("rate_limited");

    const notice = buildAINoticeForFailure("insufficient_quota", false);
    expect(notice.message).not.toMatch(/insufficient_quota|buy credits|402/i);
    expect(notice.code).toBe("ai_credit_or_limit_issue");
  });

  it("returns configuration notice when no candidate exists", async () => {
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([]);

    const result = await callLLMWithFallback({
      supabase: {} as any,
      tenantId: "tenant-1",
      useCase: "chat_geral",
      request: { messages: [] },
      fetchImpl: vi.fn() as any,
    });

    expect(result).toEqual(expect.objectContaining({
      ok: false,
      failureKind: "missing_key",
      notice: expect.objectContaining({ code: "ai_configuration_required" }),
    }));
  });

  it("falls back to the second provider and returns a friendly notice", async () => {
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
      { provider: "openrouter", api_key: "openrouter-key", status: "connected" },
      { provider: "openai", api_key: "openai-key", status: "connected" },
    ]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(402, { error: { message: "insufficient_quota raw provider text" } }))
      .mockResolvedValueOnce(response(200, { choices: [{ message: { content: "ok" } }] }));

    const result = await callLLMWithFallback({
      supabase: {} as any,
      tenantId: "tenant-1",
      useCase: "chat_geral",
      request: { messages: [{ role: "user", content: "oi" }] },
      fetchImpl: fetchMock as any,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.usedClient.provider).toBe("openai");
      expect(result.usedClient).not.toHaveProperty("apiKey");
      expect(result.fallbackTrace).toEqual([
        expect.objectContaining({ provider: "openrouter", failureKind: "insufficient_quota" }),
      ]);
      expect(result.notice).toEqual(expect.objectContaining({ code: "ai_fallback_used" }));
      expect(result.notice?.message).not.toMatch(/insufficient_quota|raw provider text|openrouter-key/i);
    }
  });

  it("returns sanitized unavailable notice when every provider fails", async () => {
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
      { provider: "openrouter", api_key: "openrouter-key", status: "connected" },
      { provider: "openai", api_key: "openai-key", status: "connected" },
    ]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(404, { error: { message: "model does not exist" } }))
      .mockResolvedValueOnce(response(500, { error: { message: "provider exploded" } }));

    const result = await callLLMWithFallback({
      supabase: {} as any,
      tenantId: "tenant-1",
      useCase: "resumo_juridico",
      request: { messages: [] },
      fetchImpl: fetchMock as any,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fallbackTrace).toHaveLength(2);
      expect(result.notice.message).not.toMatch(/provider exploded|model does not exist|openai-key/i);
    }
  });
});
