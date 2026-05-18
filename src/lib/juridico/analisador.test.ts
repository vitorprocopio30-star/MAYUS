import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, callLLMWithFallbackMock, prepareProactiveMovementDraftMock, inserts, upserts, updates, duplicatePrazoByMovement, processTaskInsertError, pipelineContextMock } = vi.hoisted(() => {
  return {
    createClientMock: vi.fn(),
    callLLMWithFallbackMock: vi.fn(),
    prepareProactiveMovementDraftMock: vi.fn(),
    inserts: [] as Array<{ table: string; payload: any }>,
    upserts: [] as Array<{ table: string; payload: any }>,
    updates: [] as Array<{ table: string; payload: any }>,
    duplicatePrazoByMovement: { value: false },
    processTaskInsertError: { value: null as Error | null },
    pipelineContextMock: {
      value: {
        pipelineId: "pipeline-1",
        linkedTaskContext: null,
        stages: [{ id: "stage-1", name: "Sentenca", order_index: 1 }],
        visibleStages: [{ id: "stage-1", name: "Sentenca", order_index: 1 }],
        fallbackStageId: "stage-1",
      } as any,
    },
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
  resolveProcessPipelineContext: vi.fn(async () => pipelineContextMock.value),
}));

function createChain(table: string): any {
  const filters: Record<string, any> = {};
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn((column: string, value: any) => {
      filters[column] = value;
      return chain;
    }),
    gte: vi.fn(() => chain),
    lte: vi.fn(async () => ({ data: [] })),
    order: vi.fn(() => chain),
    limit: vi.fn((limit: number) => {
      if (table === "process_tasks") return Promise.resolve({ data: [] });
      if (table === "process_prazos" && limit === 1) {
        return Promise.resolve({ data: duplicatePrazoByMovement.value ? [{ id: "prazo-duplicado" }] : [] });
      }
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
        if (filters.tipo_evento === "PRAZO") {
          return { data: null, error: null };
        }

        return {
          data: {
            tipo_evento: filters.tipo_evento || "SENTENCA",
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
    update: vi.fn((payload: any) => {
      updates.push({ table, payload });
      return chain;
    }),
    insert: vi.fn((payload: any) => {
      inserts.push({ table, payload });
      return {
        select: vi.fn(() => ({
          single: vi.fn(async () => table === "process_tasks" && processTaskInsertError.value
            ? { data: null, error: processTaskInsertError.value }
            : { data: { id: "task-1" }, error: null }),
        })),
      };
    }),
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
    inserts.length = 0;
    upserts.length = 0;
    updates.length = 0;
    duplicatePrazoByMovement.value = false;
    processTaskInsertError.value = null;
    pipelineContextMock.value = {
      pipelineId: "pipeline-1",
      linkedTaskContext: null,
      stages: [{ id: "stage-1", name: "Sentenca", order_index: 1 }],
      visibleStages: [{ id: "stage-1", name: "Sentenca", order_index: 1 }],
      fallbackStageId: "stage-1",
    };
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

  it("envia heuristica de baixa confianca para revisao humana quando a IA nao retorna JSON valido", async () => {
    const { analisarMovimentacao } = await import("./analisador");

    const result = await analisarMovimentacao({
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
    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(result).toEqual(expect.objectContaining({
      automation_status: "review_required",
      requires_human_review: true,
      confianca_analise: "baixa",
    }));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          tipo_evento: "SENTENCA",
          requer_acao: true,
          confianca_analise: "baixa",
        }),
      }),
    ]));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "legal_movement_review_required",
          status: "review_required",
        }),
      }),
    ]));
  });

  it("cria prazo explicito de 5 dias para apresentar documentos sem depender do catalogo", async () => {
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({ gerar: false, motivo: "Sem analise acionavel" }) } }],
      },
      usedClient: { provider: "openai", model: "test", endpoint: "https://example.test", source: "env" },
      fallbackTrace: [],
    });
    const { analisarMovimentacao } = await import("./analisador");

    await analisarMovimentacao({
      processo_id: "process-1",
      numero_cnj: "0000001-11.2026.8.26.0100",
      tenant_id: "tenant-1",
      movimentacao: {
        id: "mov-prazo-1",
        conteudo: "Intime-se a parte autora. Prazo de 5 dias para apresentar documentos.",
        data: "2026-05-13",
      },
      advogado_id: "lawyer-1",
      escavador_movimentacao_id: "mov-prazo-1",
      process_movimentacao_id: "pm-1",
    });

    expect(upserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_prazos",
        payload: expect.objectContaining({
          tenant_id: "tenant-1",
          monitored_process_id: "process-1",
          tipo: "prazo",
          descricao: "Cumprir determinação: Apresentar documentos",
          prioridade: "media",
          escavador_movimentacao_id: "mov-prazo-1",
          criado_por_ia: true,
        }),
      }),
    ]));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          tipo_evento: "PRAZO",
          requer_acao: true,
          acao_sugerida: "Cumprir determinação: Apresentar documentos",
          prazo_extraido_dias: 5,
          confianca_analise: "alta",
          analise_json: expect.objectContaining({ origem: "deterministica" }),
        }),
      }),
    ]));
  });

  it("envia alta confianca para revisao humana quando a criacao automatica falha", async () => {
    processTaskInsertError.value = new Error("insert denied");
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({ gerar: false, motivo: "Sem analise acionavel" }) } }],
      },
      usedClient: { provider: "openai", model: "test", endpoint: "https://example.test", source: "env" },
      fallbackTrace: [],
    });
    const { analisarMovimentacao } = await import("./analisador");

    const result = await analisarMovimentacao({
      processo_id: "process-1",
      numero_cnj: "0000001-11.2026.8.26.0100",
      tenant_id: "tenant-1",
      movimentacao: {
        id: "mov-falha-auto",
        conteudo: "Intime-se a parte autora. Prazo de 5 dias para apresentar documentos.",
        data: "2026-05-13",
      },
      advogado_id: "lawyer-1",
      escavador_movimentacao_id: "mov-falha-auto",
      process_movimentacao_id: "pm-falha-auto",
    });

    expect(result).toEqual(expect.objectContaining({
      automation_status: "review_required",
      requires_human_review: true,
      confianca_analise: "alta",
    }));
    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "legal_movement_auto_create_failed",
          status: "failed",
        }),
      }),
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "legal_movement_review_required",
          status: "review_required",
        }),
      }),
    ]));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          analise_json: expect.objectContaining({
            motivo: expect.stringContaining("Falha ao criar card processual"),
          }),
        }),
      }),
    ]));
  });

  it("envia alta confianca para revisao humana quando nao ha pipeline juridica", async () => {
    pipelineContextMock.value = {
      pipelineId: null,
      linkedTaskContext: null,
      stages: [],
      visibleStages: [],
      fallbackStageId: null,
    };
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({ gerar: false, motivo: "Sem analise acionavel" }) } }],
      },
      usedClient: { provider: "openai", model: "test", endpoint: "https://example.test", source: "env" },
      fallbackTrace: [],
    });
    const { analisarMovimentacao } = await import("./analisador");

    const result = await analisarMovimentacao({
      processo_id: "process-1",
      numero_cnj: "0000001-11.2026.8.26.0100",
      tenant_id: "tenant-1",
      movimentacao: {
        id: "mov-sem-pipeline",
        conteudo: "Intime-se a parte autora. Prazo de 5 dias para apresentar documentos.",
        data: "2026-05-13",
      },
      advogado_id: "lawyer-1",
      escavador_movimentacao_id: "mov-sem-pipeline",
      process_movimentacao_id: "pm-sem-pipeline",
    });

    expect(result).toEqual(expect.objectContaining({
      automation_status: "review_required",
      requires_human_review: true,
      confianca_analise: "alta",
    }));
    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({ event_name: "legal_movement_auto_create_failed" }),
      }),
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({ event_name: "legal_movement_review_required" }),
      }),
    ]));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          analise_json: expect.objectContaining({
            motivo: expect.stringContaining("Pipeline juridica"),
          }),
        }),
      }),
    ]));
  });

  it("nao recria prazo quando a movimentacao do Escavador ja foi processada", async () => {
    duplicatePrazoByMovement.value = true;
    const { analisarMovimentacao } = await import("./analisador");

    await analisarMovimentacao({
      processo_id: "process-1",
      numero_cnj: "0000001-11.2026.8.26.0100",
      tenant_id: "tenant-1",
      movimentacao: {
        id: "mov-duplicado",
        conteudo: "Prazo de 5 dias para apresentar documentos.",
        data: "2026-05-13",
      },
      escavador_movimentacao_id: "mov-duplicado",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          tipo_evento: "PRAZO",
          requer_acao: true,
          analise_json: expect.objectContaining({
            motivo: expect.stringContaining("duplicado"),
          }),
        }),
      }),
    ]));
  });

  it("nao cria prazo para despacho generico sem comando concreto", async () => {
    const { analisarMovimentacao } = await import("./analisador");

    await analisarMovimentacao({
      processo_id: "process-1",
      numero_cnj: "0000001-11.2026.8.26.0100",
      tenant_id: "tenant-1",
      movimentacao: {
        id: "mov-despacho",
        conteudo: "Despacho de mero expediente. Verificar cumprimento.",
        data: "2026-05-13",
      },
      escavador_movimentacao_id: "mov-despacho",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          requer_acao: false,
          confianca_analise: "alta",
        }),
      }),
    ]));
  });

  it("nao cria prazo automatico quando a IA indica prazo sem vencimento confiavel", async () => {
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({
          gerar: true,
          tipo: "prazo",
          descricao: "Manifestar-se sobre a peticao",
          urgencia: "media",
          motivo: "Ha indicio de prazo, mas sem data expressa",
        }) } }],
      },
      usedClient: { provider: "openai", model: "test", endpoint: "https://example.test", source: "env" },
      fallbackTrace: [],
    });
    const { analisarMovimentacao } = await import("./analisador");

    await analisarMovimentacao({
      processo_id: "process-1",
      numero_cnj: "0000001-11.2026.8.26.0100",
      tenant_id: "tenant-1",
      movimentacao: {
        id: "mov-prazo-sem-data",
        conteudo: "Intimacao para manifestacao da parte autora.",
        data: "2026-05-13",
      },
      escavador_movimentacao_id: "mov-prazo-sem-data",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          tipo_evento: "PRAZO",
          requer_acao: true,
          acao_sugerida: "Manifestar-se sobre a peticao",
          data_vencimento_extraida: null,
          confianca_analise: "baixa",
          analise_json: expect.objectContaining({
            motivo: expect.stringContaining("sem vencimento confiavel"),
          }),
        }),
      }),
    ]));
  });

  it("envia prazo inferido por IA para revisao mesmo com vencimento em beta", async () => {
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({
          gerar: true,
          tipo: "prazo",
          descricao: "Manifestar-se sobre a peticao da parte contraria",
          data_vencimento: "2026-05-20",
          urgencia: "media",
          motivo: "A movimentacao indica obrigacao de manifestacao",
        }) } }],
      },
      usedClient: { provider: "openai", model: "test", endpoint: "https://example.test", source: "env" },
      fallbackTrace: [],
    });
    const { analisarMovimentacao } = await import("./analisador");

    const result = await analisarMovimentacao({
      processo_id: "process-1",
      numero_cnj: "0000001-11.2026.8.26.0100",
      tenant_id: "tenant-1",
      movimentacao: {
        id: "mov-prazo-ia-com-data",
        conteudo: "Intimacao para manifestacao sobre peticao da parte contraria.",
        data: "2026-05-13",
      },
      escavador_movimentacao_id: "mov-prazo-ia-com-data",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(result).toEqual(expect.objectContaining({
      automation_status: "review_required",
      requires_human_review: true,
      confianca_analise: "media",
      paid_summary_recommended: true,
    }));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({ event_name: "legal_movement_review_required" }),
      }),
    ]));
  });

  it("envia arquivamento para revisao humana sem inativar automaticamente em beta", async () => {
    const { analisarMovimentacao } = await import("./analisador");

    const result = await analisarMovimentacao({
      processo_id: "process-1",
      numero_cnj: "0000001-11.2026.8.26.0100",
      tenant_id: "tenant-1",
      movimentacao: {
        id: "mov-arquivamento",
        conteudo: "Processo arquivado com baixa definitiva.",
        data: "2026-05-13",
      },
      escavador_movimentacao_id: "mov-arquivamento",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(result).toEqual(expect.objectContaining({
      automation_status: "review_required",
      requires_human_review: true,
    }));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          tipo_evento: "ARQUIVAMENTO",
          requer_acao: true,
          analise_json: expect.objectContaining({
            motivo: expect.stringContaining("revisao humana"),
          }),
        }),
      }),
    ]));
    expect(updates.some((item) => item.table === "monitored_processes")).toBe(false);
  });

  it("interpreta prazo por extenso e com numero entre parenteses", async () => {
    const { analisarMovimentacao } = await import("./analisador");

    await analisarMovimentacao({
      processo_id: "process-1",
      numero_cnj: "0000001-11.2026.8.26.0100",
      tenant_id: "tenant-1",
      movimentacao: {
        id: "mov-quinze-dias",
        conteudo: "Intime-se. Prazo de 15 (quinze) dias úteis para apresentar réplica.",
        data: "2026-05-13",
      },
      escavador_movimentacao_id: "mov-quinze-dias",
    });

    expect(upserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_prazos",
        payload: expect.objectContaining({
          tipo: "prazo",
          descricao: "Cumprir determinação: Apresentar réplica",
          prioridade: "media",
        }),
      }),
    ]));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          tipo_evento: "PRAZO",
          prazo_extraido_dias: 15,
          confianca_analise: "alta",
        }),
      }),
    ]));
  });

  it("interpreta prazo no formato em 05 dias para emendar a inicial", async () => {
    const { analisarMovimentacao } = await import("./analisador");

    await analisarMovimentacao({
      processo_id: "process-1",
      numero_cnj: "0000001-11.2026.8.26.0100",
      tenant_id: "tenant-1",
      movimentacao: {
        id: "mov-emendar-inicial",
        conteudo: "Determino que a parte autora, em 05 dias, para emendar a inicial.",
        data: "2026-05-13",
      },
      escavador_movimentacao_id: "mov-emendar-inicial",
    });

    expect(upserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_prazos",
        payload: expect.objectContaining({
          tipo: "prazo",
          descricao: "Cumprir determinação: Emendar a inicial",
          prioridade: "media",
        }),
      }),
    ]));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          tipo_evento: "PRAZO",
          prazo_extraido_dias: 5,
          confianca_analise: "alta",
        }),
      }),
    ]));
  });
});
