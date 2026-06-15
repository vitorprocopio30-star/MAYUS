import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, callLLMWithFallbackMock, prepareProactiveMovementDraftMock, inserts, upserts, updates, duplicatePrazoByMovement, processTaskInsertError, missingPrazoRuleForEvent, pipelineContextMock } = vi.hoisted(() => {
  return {
    createClientMock: vi.fn(),
    callLLMWithFallbackMock: vi.fn(),
    prepareProactiveMovementDraftMock: vi.fn(),
    inserts: [] as Array<{ table: string; payload: any }>,
    upserts: [] as Array<{ table: string; payload: any }>,
    updates: [] as Array<{ table: string; payload: any }>,
    duplicatePrazoByMovement: { value: false },
    processTaskInsertError: { value: null as Error | null },
    missingPrazoRuleForEvent: { value: null as string | null },
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
        if (missingPrazoRuleForEvent.value === filters.tipo_evento) {
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
    missingPrazoRuleForEvent.value = null;
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
          analise_json: expect.objectContaining({
            agentic_governance: expect.objectContaining({
              openclaw_policy: expect.objectContaining({
                requires_approval: true,
                subject: expect.objectContaining({ surface: "legal_decision" }),
              }),
              hermes_trajectory: expect.objectContaining({
                status: "waiting_approval",
              }),
            }),
          }),
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
          analise_json: expect.objectContaining({
            origem: "deterministica",
            polo_representado: "autor",
            obrigacao_de_quem: "escritorio",
            confidence: "alta",
            confidence_reason: expect.stringContaining("polo representado"),
            review_required: false,
            agentic_governance: expect.objectContaining({
              openclaw_policy: expect.objectContaining({
                can_execute_now: true,
                subject: expect.objectContaining({ surface: "internal" }),
              }),
              hermes_trajectory: expect.objectContaining({
                status: "completed",
              }),
            }),
          }),
        }),
      }),
    ]));
  });

  it("nao cria prazo de contestacao quando o escritorio representa o autor e a citacao e do reu", async () => {
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({ gerar: false, motivo: "Obrigacao da parte contraria" }) } }],
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
        id: "mov-citacao-reu",
        conteudo: "Cite-se a parte re para apresentar contestacao no prazo de 15 dias uteis.",
        data: "2026-05-13",
      },
      advogado_id: "lawyer-1",
      escavador_movimentacao_id: "mov-citacao-reu",
      process_movimentacao_id: "pm-citacao-reu",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(result).toEqual(expect.objectContaining({
      automation_status: "none",
      requires_human_review: false,
      requer_acao: false,
      polo_representado: "autor",
      obrigacao_de_quem: "parte_contraria",
      review_required: false,
    }));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          tipo_evento: "PRAZO",
          requer_acao: false,
          analise_json: expect.objectContaining({
            polo_representado: "autor",
            obrigacao_de_quem: "parte_contraria",
            confidence: "alta",
            confidence_reason: expect.stringContaining("polo contrario"),
            evidencia: expect.stringContaining("prazo de 15 dias"),
            review_required: false,
          }),
        }),
      }),
    ]));
  });

  it("nao cria prazo de contrarrazoes quando o recurso foi interposto pelo proprio polo representado", async () => {
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({ gerar: false, motivo: "Recurso ja interposto pelo cliente" }) } }],
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
        id: "mov-recurso-proprio",
        conteudo: "Recurso de apelacao interposto pela parte autora.",
        data: "2026-05-13",
      },
      advogado_id: "lawyer-1",
      escavador_movimentacao_id: "mov-recurso-proprio",
      process_movimentacao_id: "pm-recurso-proprio",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "legal_movement_auto_create_blocked",
          status: "blocked",
          payload: expect.objectContaining({ block_reason: "opposite_party_obligation" }),
        }),
      }),
    ]));
    expect(prepareProactiveMovementDraftMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      automation_status: "none",
      requires_human_review: false,
      tipo_evento: "RECURSO",
      requer_acao: false,
      polo_representado: "autor",
      obrigacao_de_quem: "parte_contraria",
      review_required: false,
    }));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          tipo_evento: "RECURSO",
          requer_acao: false,
          analise_json: expect.objectContaining({
            motivo: expect.stringContaining("parte contraria"),
            polo_representado: "autor",
            obrigacao_de_quem: "parte_contraria",
            confidence: "alta",
            review_required: false,
          }),
        }),
      }),
    ]));
  });

  it("nao cria card ou draft para agravo proprio mesmo sem regra de prazo recursal", async () => {
    missingPrazoRuleForEvent.value = "RECURSO";
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({ gerar: false, motivo: "Agravo ja interposto pelo cliente" }) } }],
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
        id: "mov-agravo-proprio",
        conteudo: "Agravo de instrumento interposto pela parte autora.",
        data: "2026-05-13",
      },
      advogado_id: "lawyer-1",
      escavador_movimentacao_id: "mov-agravo-proprio",
      process_movimentacao_id: "pm-agravo-proprio",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);
    expect(prepareProactiveMovementDraftMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      automation_status: "none",
      tipo_evento: "RECURSO",
      requer_acao: false,
      polo_representado: "autor",
      obrigacao_de_quem: "parte_contraria",
    }));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          tipo_evento: "RECURSO",
          requer_acao: false,
          analise_json: expect.objectContaining({
            polo_representado: "autor",
            obrigacao_de_quem: "parte_contraria",
            confidence: "alta",
            review_required: false,
          }),
        }),
      }),
    ]));
  });

  it("reconhece papel recursal apelante do polo representado como ato proprio", async () => {
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({ gerar: false, motivo: "Autor consta como apelante" }) } }],
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
        id: "mov-apelante-proprio",
        conteudo: "Classe alterada para Apelacao. Parte autora apelante. Vista a parte apelada para contrarrazoes.",
        data: "2026-05-13",
      },
      advogado_id: "lawyer-1",
      escavador_movimentacao_id: "mov-apelante-proprio",
      process_movimentacao_id: "pm-apelante-proprio",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);
    expect(prepareProactiveMovementDraftMock).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      automation_status: "none",
      tipo_evento: "CONTRARRAZOES",
      requer_acao: false,
      obrigacao_de_quem: "parte_contraria",
      confidence: "alta",
    }));
  });

  it("mantem prazo de contrarrazoes quando o polo representado aparece como apelado", async () => {
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({ gerar: false, motivo: "Autor consta como apelado" }) } }],
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
        id: "mov-apelado-proprio",
        conteudo: "Classe alterada para Apelacao. Parte autora apelada. Prazo de 15 dias uteis para apresentar contrarrazoes.",
        data: "2026-05-13",
      },
      advogado_id: "lawyer-1",
      escavador_movimentacao_id: "mov-apelado-proprio",
      process_movimentacao_id: "pm-apelado-proprio",
    });

    expect(result).toEqual(expect.objectContaining({
      automation_status: "deadline_card_created",
      tipo_evento: "PRAZO",
      requer_acao: true,
      polo_representado: "autor",
      obrigacao_de_quem: "escritorio",
      confidence: "alta",
    }));
    expect(upserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_prazos",
        payload: expect.objectContaining({
          descricao: expect.stringContaining("Apresentar contrarrazoes"),
          escavador_movimentacao_id: "mov-apelado-proprio",
        }),
      }),
    ]));
    expect(prepareProactiveMovementDraftMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "PRAZO",
      metadata: expect.objectContaining({
        obrigacao_de_quem: "escritorio",
        polo_representado: "autor",
        confidence: "alta",
      }),
    }));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_movimentacoes",
        payload: expect.objectContaining({
          tipo_evento: "PRAZO",
          requer_acao: true,
          analise_json: expect.objectContaining({
            polo_representado: "autor",
            obrigacao_de_quem: "escritorio",
            confidence_reason: expect.stringContaining("parte recorrida"),
            review_required: false,
          }),
        }),
      }),
    ]));
  });

  it("mantem prazo de contrarrazoes quando o recurso foi interposto pela parte contraria", async () => {
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({ gerar: false, motivo: "Recurso da parte contraria" }) } }],
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
        id: "mov-recurso-contrario",
        conteudo: "Recurso de apelacao interposto pela parte re. Prazo de 15 dias uteis para apresentar contrarrazoes.",
        data: "2026-05-13",
      },
      advogado_id: "lawyer-1",
      escavador_movimentacao_id: "mov-recurso-contrario",
      process_movimentacao_id: "pm-recurso-contrario",
    });

    expect(upserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "process_prazos",
        payload: expect.objectContaining({
          tipo: "prazo",
          descricao: expect.stringContaining("Apresentar contrarrazoes"),
          escavador_movimentacao_id: "mov-recurso-contrario",
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
          analise_json: expect.objectContaining({
            polo_representado: "autor",
            obrigacao_de_quem: "escritorio",
            confidence: "alta",
            review_required: false,
          }),
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

  it("nao cria tarefa para concluso/remessa/protocolo sem providencia concreta", async () => {
    const { analisarMovimentacao } = await import("./analisador");

    const result = await analisarMovimentacao({
      processo_id: "process-1",
      numero_cnj: "0000001-11.2026.8.26.0100",
      tenant_id: "tenant-1",
      movimentacao: {
        id: "mov-concluso",
        conteudo: "Conclusos para despacho. Remessa interna e protocolo certificado.",
        data: "2026-05-13",
      },
      escavador_movimentacao_id: "mov-concluso",
      process_movimentacao_id: "pm-concluso",
    });

    expect(result).toEqual(expect.objectContaining({
      automation_status: "none",
      requires_human_review: false,
      requer_acao: false,
    }));
    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);
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
      confianca_analise: "baixa",
      paid_summary_recommended: false,
    }));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({ event_name: "legal_movement_review_required" }),
      }),
    ]));
  });

  it("envia prazo explicito sem polo destinatario para revisao humana", async () => {
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
        id: "mov-prazo-ambiguo",
        conteudo: "Intime-se. Prazo de 5 dias para apresentar documentos.",
        data: "2026-05-13",
      },
      advogado_id: "lawyer-1",
      escavador_movimentacao_id: "mov-prazo-ambiguo",
      process_movimentacao_id: "pm-prazo-ambiguo",
    });

    expect(result).toEqual(expect.objectContaining({
      automation_status: "review_required",
      requires_human_review: true,
      confianca_analise: "baixa",
      obrigacao_de_quem: "indeterminada",
    }));
    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "legal_movement_auto_create_blocked",
          status: "blocked",
          payload: expect.objectContaining({ block_reason: "duty_indeterminate" }),
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
  });

  describe("calibragem juridica com fixtures anonimizadas", () => {
    it.each([
      {
        id: "fixture-intimacao-ambigua",
        conteudo: "Intime-se. Prazo de 10 dias para manifestacao sobre documentos.",
        expectedStatus: "review_required",
        expectedReason: "duty_indeterminate",
      },
      {
        id: "fixture-juntada-certidao",
        conteudo: "Juntada de certidao de objeto e pe. Nada mais.",
        expectedStatus: "none",
        expectedReason: null,
      },
      {
        id: "fixture-concluso-remessa",
        conteudo: "Conclusos para despacho. Remessa interna certificada.",
        expectedStatus: "none",
        expectedReason: null,
      },
      {
        id: "fixture-protocolo-decurso",
        conteudo: "Certificado o protocolo da peticao e o decurso de prazo anterior.",
        expectedStatus: "none",
        expectedReason: null,
      },
      {
        id: "fixture-obrigacao-parte-contraria",
        conteudo: "Intime-se a parte re para apresentar contestacao no prazo de 15 dias uteis.",
        expectedStatus: "none",
        expectedReason: "opposite_party_obligation",
      },
    ])("nao cria tarefa indevida para $id", async ({ id, conteudo, expectedStatus, expectedReason }) => {
      callLLMWithFallbackMock.mockResolvedValue({
        ok: true,
        data: {
          choices: [{ message: { content: JSON.stringify({ gerar: false, motivo: "Fixture anonima sem acao automatica segura" }) } }],
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
          id,
          conteudo,
          data: "2026-05-13",
        },
        advogado_id: "lawyer-1",
        escavador_movimentacao_id: id,
        process_movimentacao_id: `pm-${id}`,
      });

      expect(result).toEqual(expect.objectContaining({
        automation_status: expectedStatus,
      }));
      expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
      expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);

      if (expectedReason) {
        expect(inserts).toEqual(expect.arrayContaining([
          expect.objectContaining({
            table: "system_event_logs",
            payload: expect.objectContaining({
              event_name: "legal_movement_auto_create_blocked",
              status: "blocked",
              payload: expect.objectContaining({ block_reason: expectedReason }),
            }),
          }),
        ]));
      }
    });

    it.each([
      {
        tipo: "CITACAO",
        conteudo: "Carta de citacao expedida sem comprovante de ciencia e sem prazo fatal confirmado.",
        llmTipo: "citacao",
      },
      {
        tipo: "SENTENCA",
        conteudo: "Sentenca publicada. Ciencia pendente de confirmacao no diario oficial.",
        llmTipo: "sentenca",
      },
      {
        tipo: "RECURSO",
        conteudo: "Recurso mencionado nos autos sem identificar recorrente, recorrido ou prazo fatal.",
        llmTipo: "recurso",
      },
      {
        tipo: "AUDIENCIA",
        conteudo: "Audiencia designada, aguardando confirmacao de pauta e forma de comparecimento.",
        llmTipo: "audiencia",
      },
    ])("exige revisao para $tipo sem prazo operacional seguro", async ({ tipo, conteudo, llmTipo }) => {
      missingPrazoRuleForEvent.value = tipo;
      callLLMWithFallbackMock.mockResolvedValue({
        ok: true,
        data: {
          choices: [{ message: { content: JSON.stringify({ gerar: true, tipo: llmTipo, descricao: `Revisar ${tipo}`, motivo: "Fixture anonima sem prazo seguro" }) } }],
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
          id: `fixture-${tipo.toLowerCase()}`,
          conteudo,
          data: "2026-05-13",
        },
        advogado_id: "lawyer-1",
        escavador_movimentacao_id: `fixture-${tipo.toLowerCase()}`,
        process_movimentacao_id: `pm-fixture-${tipo.toLowerCase()}`,
      });

      expect(result).toEqual(expect.objectContaining({
        automation_status: "review_required",
        requires_human_review: true,
        tipo_evento: tipo,
        review_required: true,
      }));
      expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
      expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);
    });
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

  it("envia extincao para revisao humana sem encerrar automaticamente", async () => {
    const { analisarMovimentacao } = await import("./analisador");

    const result = await analisarMovimentacao({
      processo_id: "process-1",
      numero_cnj: "0000001-11.2026.8.26.0100",
      tenant_id: "tenant-1",
      movimentacao: {
        id: "mov-extincao",
        conteudo: "Processo extinto sem resolucao do merito.",
        data: "2026-05-13",
      },
      escavador_movimentacao_id: "mov-extincao",
      process_movimentacao_id: "pm-extincao",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(result).toEqual(expect.objectContaining({
      automation_status: "review_required",
      requires_human_review: true,
      tipo_evento: "EXTINCAO",
    }));
    expect(updates.some((item) => item.table === "monitored_processes")).toBe(false);
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

  it("envia cumprimento sem regra operacional para revisao humana", async () => {
    missingPrazoRuleForEvent.value = "CUMPRIMENTO";
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({ gerar: true, tipo: "cumprimento", descricao: "Revisar cumprimento", motivo: "Cumprimento detectado" }) } }],
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
        id: "mov-cumprimento",
        conteudo: "Iniciado o cumprimento de sentenca. Intime-se para providencias.",
        data: "2026-05-13",
      },
      escavador_movimentacao_id: "mov-cumprimento",
      process_movimentacao_id: "pm-cumprimento",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);
    expect(result).toEqual(expect.objectContaining({
      automation_status: "review_required",
      requires_human_review: true,
      tipo_evento: "CUMPRIMENTO",
      requer_acao: true,
      review_required: true,
    }));
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

  it("envia audiencia futura sem regra operacional para revisao humana", async () => {
    missingPrazoRuleForEvent.value = "AUDIENCIA";
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({ gerar: true, tipo: "audiencia", descricao: "Preparar audiencia", motivo: "Audiencia futura designada" }) } }],
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
        id: "mov-audiencia-sem-regra",
        conteudo: "Designada audiencia de instrucao. Intime-se a parte autora para comparecimento.",
        data: "2026-05-13",
      },
      escavador_movimentacao_id: "mov-audiencia-sem-regra",
      process_movimentacao_id: "pm-audiencia-sem-regra",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);
    expect(result).toEqual(expect.objectContaining({
      automation_status: "review_required",
      requires_human_review: true,
      tipo_evento: "AUDIENCIA",
      review_required: true,
    }));
  });

  it("envia sentenca sem regra operacional para revisao humana", async () => {
    missingPrazoRuleForEvent.value = "SENTENCA";
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({ gerar: true, tipo: "sentenca", descricao: "Avaliar sentenca", motivo: "Sentenca publicada sem prazo confiavel" }) } }],
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
        id: "mov-sentenca-sem-regra",
        conteudo: "Sentenca publicada. Julgo improcedente o pedido.",
        data: "2026-05-13",
      },
      escavador_movimentacao_id: "mov-sentenca-sem-regra",
      process_movimentacao_id: "pm-sentenca-sem-regra",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);
    expect(result).toEqual(expect.objectContaining({
      automation_status: "review_required",
      requires_human_review: true,
      tipo_evento: "SENTENCA",
      review_required: true,
    }));
  });

  it("envia citacao direcionada ao cliente para revisao sem regra operacional", async () => {
    missingPrazoRuleForEvent.value = "CITACAO";
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({ gerar: true, tipo: "citacao", descricao: "Revisar citacao", motivo: "Citacao direcionada ao polo representado" }) } }],
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
        id: "mov-citacao-cliente",
        conteudo: "Parte autora citada para apresentar manifestacao nos autos.",
        data: "2026-05-13",
      },
      escavador_movimentacao_id: "mov-citacao-cliente",
      process_movimentacao_id: "pm-citacao-cliente",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);
    expect(result).toEqual(expect.objectContaining({
      automation_status: "review_required",
      requires_human_review: true,
      tipo_evento: "CITACAO",
      polo_representado: "autor",
      obrigacao_de_quem: "escritorio",
      review_required: true,
    }));
  });

  it("envia contrarrazoes sem regra operacional para revisao humana", async () => {
    missingPrazoRuleForEvent.value = "CONTRARRAZOES";
    callLLMWithFallbackMock.mockResolvedValue({
      ok: true,
      data: {
        choices: [{ message: { content: JSON.stringify({ gerar: true, tipo: "contrarrazoes", descricao: "Preparar contrarrazoes", motivo: "Parte representada consta como apelada" }) } }],
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
        id: "mov-contrarrazoes-sem-regra",
        conteudo: "Parte autora apelada. Vista para apresentar contrarrazoes.",
        data: "2026-05-13",
      },
      escavador_movimentacao_id: "mov-contrarrazoes-sem-regra",
      process_movimentacao_id: "pm-contrarrazoes-sem-regra",
    });

    expect(upserts.filter((item) => item.table === "process_prazos")).toHaveLength(0);
    expect(inserts.filter((item) => item.table === "process_tasks")).toHaveLength(0);
    expect(result).toEqual(expect.objectContaining({
      automation_status: "review_required",
      requires_human_review: true,
      tipo_evento: "CONTRARRAZOES",
      polo_representado: "autor",
      obrigacao_de_quem: "escritorio",
      review_required: true,
    }));
  });

  it("interpreta prazo por extenso e com numero entre parenteses", async () => {
    const { analisarMovimentacao } = await import("./analisador");

    await analisarMovimentacao({
      processo_id: "process-1",
      numero_cnj: "0000001-11.2026.8.26.0100",
      tenant_id: "tenant-1",
      movimentacao: {
        id: "mov-quinze-dias",
        conteudo: "Intime-se a parte autora. Prazo de 15 (quinze) dias úteis para apresentar réplica.",
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
