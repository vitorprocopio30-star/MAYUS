import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, callLLMWithFallbackMock, prepareProactiveMovementDraftMock, upserts } = vi.hoisted(() => {
  return {
    createClientMock: vi.fn(),
    callLLMWithFallbackMock: vi.fn(),
    prepareProactiveMovementDraftMock: vi.fn(),
    upserts: [] as Array<{ table: string; payload: any }>,
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/llm-fallback", () => ({
  callLLMWithFallback: callLLMWithFallbackMock,
}));

vi.mock("@/lib/lex/proactive-movement-draft", () => ({
  prepareProactiveMovementDraft: prepareProactiveMovementDraftMock,
}));

vi.mock("@/lib/juridico/process-pipeline-resolver", () => ({
  chooseSemanticLegalStage: vi.fn(() => "stage-1"),
  resolveProcessPipelineContext: vi.fn(async () => ({
    pipelineId: "pipeline-1",
    linkedTaskContext: null,
    stages: [{ id: "stage-1", name: "Sentenca", order_index: 1 }],
    visibleStages: [{ id: "stage-1", name: "Sentenca", order_index: 1 }],
    fallbackStageId: "stage-1",
  })),
}));

function createChain(table: string): any {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(async () => ({ data: [] })),
    order: vi.fn(() => chain),
    limit: vi.fn((limit: number) => {
      if (table === "process_tasks") return Promise.resolve({ data: [] });
      if (table === "process_prazos" && limit === 1) return Promise.resolve({ data: [] });
      return chain;
    }),
    single: vi.fn(async () => {
      if (table === "monitored_processes") {
        return {
          data: {
            numero_processo: "0000001-11.2026.8.26.0100",
            resumo_curto: "Processo em fase de sentenca",
            cliente_nome: "Cliente Teste",
            tribunal: "TJSP",
            classe_processual: "Procedimento comum",
            partes: { polo_ativo: "Cliente Teste", polo_passivo: "Parte Contraria" },
            movimentacoes: [],
            advogado_responsavel_id: null,
            linked_task_id: null,
          },
          error: null,
        };
      }
      if (table === "prazos_processuais") {
        return {
          data: {
            tipo_evento: "SENTENCA",
            dias_uteis: 15,
            descricao: "Avaliar recurso contra sentenca",
            prioridade: "ALTA",
            tipo_tarefa: "Prazo recursal",
          },
          error: null,
        };
      }
      return { data: { id: "task-1" }, error: null };
    }),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    update: vi.fn(() => chain),
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: "task-1" }, error: null })),
      })),
    })),
    upsert: vi.fn(async (payload: any) => {
      upserts.push({ table, payload });
      return { data: null, error: null };
    }),
  };

  return chain;
}

describe("analisarMovimentacao", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    upserts.length = 0;
    createClientMock.mockReturnValue({
      from: vi.fn((table: string) => createChain(table)),
    });
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: "isso nao e json" } }],
      },
      usedClient: { provider: "openai", model: "test", endpoint: "https://example.test", source: "env" },
      fallbackTrace: [],
    });
    prepareProactiveMovementDraftMock.mockResolvedValue({ status: "skipped" });
  });

  it("usa callLLMWithFallback e preserva heuristica quando a IA nao retorna JSON valido", async () => {
    const { analisarMovimentacao } = await import("./analisador");

    await analisarMovimentacao({
      processo_id: "process-1",
      numero_cnj: "0000001-11.2026.8.26.0100",
      tenant_id: "tenant-1",
      movimentacao: {
        id: "mov-1",
        conteudo: "Sentenca publicada com abertura de prazo recursal",
        data: "2026-04-29",
      },
      advogado_id: "lawyer-1",
      escavador_movimentacao_id: "mov-1",
    });

    expect(callLLMWithFallbackMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      useCase: "classificar_movimentacao",
      request: expect.objectContaining({ max_tokens: 400 }),
    }));
    expect(upserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_prazos",
        payload: expect.objectContaining({
          tenant_id: "tenant-1",
          monitored_process_id: "process-1",
          tipo: "prazo",
          descricao: "Avaliar recurso contra sentenca",
          prioridade: "alta",
          criado_por_ia: true,
        }),
      }),
    ]));
  });
});
