import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/integrations/server", () => ({
  requireTenantApiKey: vi.fn(),
}));

vi.mock("@/lib/llm-fallback", () => ({
  callLLMWithFallback: vi.fn(),
}));

vi.mock("@/lib/agenda/userTasks", () => ({
  buildAgendaPayloadFromProcessTask: vi.fn(),
  syncAgendaTaskBySource: vi.fn(),
}));

import { POST } from "./route";
import { createClient as createCookieSupabaseClient } from "@/lib/supabase/server";
import { callLLMWithFallback } from "@/lib/llm-fallback";
import { requireTenantApiKey } from "@/lib/integrations/server";

const createCookieSupabaseClientMock = vi.mocked(createCookieSupabaseClient);
const callLLMWithFallbackMock = vi.mocked(callLLMWithFallback);
const requireTenantApiKeyMock = vi.mocked(requireTenantApiKey);

function createSupabaseMock() {
  const supabase = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: "user-1" } } })),
    },
    from: vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        single: vi.fn(async () => {
          if (table === "monitored_processes") {
            return {
              data: {
                id: "process-1",
                tenant_id: "tenant-1",
                linked_task_id: "task-1",
                numero_processo: "0000001-11.2024.8.19.0001",
                tribunal: "TJRJ",
                partes: { polo_ativo: "Cliente", polo_passivo: "Parte contraria" },
                movimentacoes: [{ data: "2026-04-28", texto: "Concluso para despacho" }],
              },
              error: null,
            };
          }
          return { data: null, error: null };
        }),
        maybeSingle: vi.fn(async () => {
          if (table === "process_tasks") {
            return { data: { pipeline_id: "pipeline-1", title: "Caso", description: "", client_name: "Cliente" }, error: null };
          }
          return { data: null, error: null };
        }),
        in: vi.fn(async () => ({
          data: [{ id: "lawyer-1", full_name: "Dra. Mayus", role: "advogado" }],
          error: null,
        })),
        order: vi.fn(() => {
          if (table === "process_stages") {
            return Promise.resolve({
              data: [
                { id: "stage-1", name: "Recolher documentos", order_index: 1 },
                { id: "stage-2", name: "Fazer inicial", order_index: 2 },
              ],
              error: null,
            });
          }
          return chain;
        }),
      };
      return chain;
    }),
  };

  return supabase;
}

describe("POST /api/agent/processos/organizar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createCookieSupabaseClientMock.mockReturnValue(createSupabaseMock() as any);
    requireTenantApiKeyMock.mockResolvedValue({ apiKey: null } as any);
    callLLMWithFallbackMock.mockResolvedValue({
      ok: false,
      failureKind: "insufficient_quota",
      fallbackTrace: [],
      notice: {
        code: "ai_credit_or_limit_issue",
        severity: "warning",
        message: "Seu provedor de IA esta sem credito ou limite disponivel. Configure uma alternativa para continuar.",
      },
    });
  });

  it("returns a sanitized ai_notice when every configured LLM candidate fails", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/agent/processos/organizar", {
      method: "POST",
      body: JSON.stringify({ processo_id: "process-1" }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Seu provedor de IA esta sem credito ou limite disponivel. Configure uma alternativa para continuar.",
      ai_notice: {
        code: "ai_credit_or_limit_issue",
        severity: "warning",
        message: "Seu provedor de IA esta sem credito ou limite disponivel. Configure uma alternativa para continuar.",
      },
    });
    expect(callLLMWithFallbackMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      useCase: "organizar_processo",
      request: expect.objectContaining({ max_tokens: 1500 }),
    }));
  });
});
