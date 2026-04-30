import { beforeEach, describe, expect, it, vi } from "vitest";

const { listTenantIntegrationsResolvedMock } = vi.hoisted(() => ({
  listTenantIntegrationsResolvedMock: vi.fn(),
}));

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsResolved: listTenantIntegrationsResolvedMock,
}));

import { buildHeaders, getLLMClient, getLLMClientCandidates, normalizeLLMProvider } from "./llm-router";

describe("llm-router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("normaliza aliases de provedores", () => {
    expect(normalizeLLMProvider("gemini")).toBe("google");
    expect(normalizeLLMProvider("grok")).toBe("groq");
    expect(normalizeLLMProvider(" OPENROUTER ")).toBe("openrouter");
    expect(normalizeLLMProvider("unknown")).toBeNull();
  });

  it("prioriza OpenRouter resolvido via Vault", async () => {
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
      { provider: "openai", api_key: "openai-key", status: "connected" },
      { provider: "openrouter", api_key: "openrouter-key", status: "connected", instance_name: "custom/model" },
    ]);

    const client = await getLLMClient({} as any, "tenant-1", "chat_geral");

    expect(listTenantIntegrationsResolvedMock).toHaveBeenCalledWith("tenant-1", [
      "openrouter",
      "anthropic",
      "openai",
      "google",
      "gemini",
      "groq",
      "grok",
    ]);
    expect(client).toEqual(expect.objectContaining({
      provider: "openrouter",
      apiKey: "openrouter-key",
      model: "custom/model",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
    }));
  });

  it("ignora integracoes sem api_key ou desconectadas", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "env-openrouter-key");
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
      { provider: "openrouter", api_key: "", status: "connected" },
      { provider: "openai", api_key: "openai-key", status: "disconnected" },
    ]);

    const client = await getLLMClient({} as any, "tenant-1", "task_manager");

    expect(client.provider).toBe("openrouter");
    expect(client.apiKey).toBe("env-openrouter-key");
  });

  it("respeita preferredProvider com alias quando disponivel", async () => {
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
      { provider: "gemini", api_key: "google-key", status: "connected" },
      { provider: "openrouter", api_key: "openrouter-key", status: "connected" },
    ]);

    const client = await getLLMClient({} as any, "tenant-1", "resumo_juridico", {
      preferredProvider: "gemini",
    });

    expect(client.provider).toBe("google");
    expect(client.apiKey).toBe("google-key");
  });

  it("bloqueia Anthropic por padrao quando exige compatibilidade OpenAI", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "anthropic-env-key");
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
      { provider: "anthropic", api_key: "anthropic-key", status: "connected" },
    ]);

    await expect(getLLMClient({} as any, "tenant-1", "gerar_peca")).rejects.toThrow(
      "Nenhuma chave de IA configurada"
    );
  });

  it("permite Anthropic quando allowNonOpenAICompatible esta ativo", async () => {
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
      { provider: "anthropic", api_key: "anthropic-key", status: "connected" },
    ]);

    const client = await getLLMClient({} as any, "tenant-1", "gerar_peca", {
      allowNonOpenAICompatible: true,
    });

    expect(client.provider).toBe("anthropic");
    expect(buildHeaders(client)).toEqual({
      "x-api-key": "anthropic-key",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    });
  });

  it("monta headers OpenAI-compatible com extras do OpenRouter", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
      { provider: "openrouter", api_key: "openrouter-key", status: "connected" },
    ]);

    const client = await getLLMClient({} as any, "tenant-1", "chat_geral");

    expect(buildHeaders(client)).toEqual({
      Authorization: "Bearer openrouter-key",
      "Content-Type": "application/json",
      "HTTP-Referer": "https://example.test",
      "X-Title": "MAYUS",
    });
  });

  it("lista candidatos para fallback sem alterar o cliente principal", async () => {
    vi.stubEnv("OPENAI_API_KEY", "env-openai-key");
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
      { provider: "openrouter", api_key: "openrouter-key", status: "connected", instance_name: "custom/openrouter" },
      { provider: "groq", api_key: "groq-key", status: "connected" },
    ]);

    const candidates = await getLLMClientCandidates({} as any, "tenant-1", "chat_geral", {
      preferredProvider: "groq",
    });

    expect(candidates.map((candidate) => ({
      provider: candidate.provider,
      source: candidate.source,
      model: candidate.model,
      isPreferred: candidate.isPreferred,
    }))).toEqual([
      { provider: "groq", source: "tenant", model: "llama-3.3-70b-versatile", isPreferred: true },
      { provider: "openrouter", source: "tenant", model: "custom/openrouter", isPreferred: false },
      { provider: "openai", source: "env", model: "gpt-5.4-nano", isPreferred: false },
    ]);
  });
});
