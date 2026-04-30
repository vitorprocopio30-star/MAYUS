import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(),
}));

vi.mock("@/lib/llm-fallback", () => ({
  callLLMWithFallback: vi.fn(),
}));

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { callLLMWithFallback } from "@/lib/llm-fallback";
import { POST } from "./route";

const cookiesMock = vi.mocked(cookies);
const createServerClientMock = vi.mocked(createServerClient);
const callLLMWithFallbackMock = vi.mocked(callLLMWithFallback);

function createSupabaseMock() {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(async () => ({ data: { tenant_id: "tenant-1" }, error: null })),
  };

  return {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
    },
    from: vi.fn(() => chain),
  };
}

function request(body: unknown) {
  return new NextRequest("http://localhost:3000/api/monitoramento/resumir", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/monitoramento/resumir", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesMock.mockResolvedValue({
      getAll: vi.fn(() => []),
      set: vi.fn(),
    } as any);
    createServerClientMock.mockReturnValue(createSupabaseMock() as any);
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [
          {
            message: {
              content: "- Prazo critico identificado.\n- Beneficio em analise.\n- Proximo passo: revisar documentos.",
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
        isPreferred: false,
      },
      fallbackTrace: [],
    } as any);
  });

  it("uses the LLM fallback wrapper for legal movement summaries", async () => {
    const response = await POST(request({
      numero_processo: "0000001-11.2024.8.26.0100",
      movimentacoes: [{ data: "2026-04-28", titulo: "Intimacao publicada" }],
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      resumo: "- Prazo critico identificado.\n- Beneficio em analise.\n- Proximo passo: revisar documentos.",
      ai_notice: null,
    });
    expect(callLLMWithFallbackMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      useCase: "resumo_juridico",
      request: expect.objectContaining({
        temperature: 0.3,
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({ role: "user" }),
        ]),
      }),
    }));
  });

  it("returns a sanitized AI notice when no candidate can complete the summary", async () => {
    callLLMWithFallbackMock.mockResolvedValue({
      ok: false,
      failureKind: "insufficient_quota",
      fallbackTrace: [],
      notice: {
        code: "ai_credit_or_limit_issue",
        severity: "warning",
        message: "Nao consegui usar o modelo principal porque a integracao de IA precisa de credito ou limite disponivel. Posso continuar em modo limitado quando a tarefa permitir.",
      },
    } as any);

    const response = await POST(request({
      numero_processo: "0000001-11.2024.8.26.0100",
      movimentacoes: [{ texto: "Movimentacao recente" }],
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Nao consegui usar o modelo principal porque a integracao de IA precisa de credito ou limite disponivel. Posso continuar em modo limitado quando a tarefa permitir.",
      ai_notice: {
        code: "ai_credit_or_limit_issue",
        severity: "warning",
        message: "Nao consegui usar o modelo principal porque a integracao de IA precisa de credito ou limite disponivel. Posso continuar em modo limitado quando a tarefa permitir.",
      },
    });
  });
});
