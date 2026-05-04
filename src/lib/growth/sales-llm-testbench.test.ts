import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLLMClientMock, buildHeadersMock } = vi.hoisted(() => ({
  getLLMClientMock: vi.fn(),
  buildHeadersMock: vi.fn(),
}));

vi.mock("@/lib/llm-router", () => ({
  getLLMClient: getLLMClientMock,
  buildHeaders: buildHeadersMock,
}));

import { SALES_LLM_TEST_FIXTURES } from "./sales-llm-reply";
import { runSalesLlmTestbench } from "./sales-llm-testbench";

function responseForPrompt(prompt: string, model: string) {
  if (prompt.includes("Qual o andamento do meu processo")) {
    return {
      reply: "Para eu nao te passar status errado, me mande o CNJ ou confirme o nome completo do cliente.",
      lead_stage: "handoff",
      intent: "case_status_request",
      confidence: 0.9,
      risk_flags: ["case_status_request"],
      next_action: "encaminhar para suporte com identificador minimo",
      should_auto_send: false,
      expected_outcome: "evitar status inventado",
    };
  }

  if (model === "qwen/qwen3.6-plus") {
    return {
      reply: "Seu processo esta garantido e podemos fechar agora por valor fechado.",
      lead_stage: "closing",
      intent: "sales_closing",
      confidence: 0.91,
      risk_flags: [],
      next_action: "fechar",
      should_auto_send: true,
      expected_outcome: "fechar imediatamente",
    };
  }

  return {
    reply: "Entendi. Quando voce diz caro, sua duvida principal e valor, seguranca ou prioridade?",
    lead_stage: "objection",
    intent: "sales_objection",
    confidence: 0.88,
    risk_flags: [],
    next_action: "investigar objecao real",
    should_auto_send: true,
    expected_outcome: "descobrir a objecao principal",
  };
}

function createFetcher() {
  return vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body || "{}"));
    const prompt = String(body.messages?.[1]?.content || "");
    const model = String(body.model || "");

    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify(responseForPrompt(prompt, model)) } }],
      }),
    } as Response;
  });
}

function createSupabaseMock() {
  const inserts: Array<{ table: string; payload: any }> = [];
  const ids: Record<string, string> = {
    brain_tasks: "task-1",
    brain_runs: "run-1",
    brain_steps: "step-1",
    brain_artifacts: "artifact-1",
  };

  return {
    inserts,
    supabase: {
      from(table: string) {
        return {
          insert(payload: any) {
            inserts.push({ table, payload });
            return {
              select() {
                return {
                  single: async () => ({ data: { id: ids[table] || `${table}-1` }, error: null }),
                };
              },
              then(resolve: any) {
                return Promise.resolve({ data: null, error: null }).then(resolve);
              },
            };
          },
        };
      },
    },
  };
}

describe("sales-llm-testbench", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLLMClientMock.mockImplementation(async (_supabase, _tenantId, _useCase, options) => ({
      provider: "openrouter",
      model: options?.modelOverride || "deepseek/deepseek-v4-pro",
      endpoint: "https://openrouter.test/chat/completions",
      apiKey: "openrouter-key",
      extraHeaders: {},
    }));
    buildHeadersMock.mockReturnValue({
      Authorization: "Bearer openrouter-key",
      "Content-Type": "application/json",
    });
  });

  it("roda fixtures em modelos candidatos e recomenda o melhor score", async () => {
    const fetcher = createFetcher();
    const fixtures = SALES_LLM_TEST_FIXTURES.filter((fixture) => ["price-objection", "case-status"].includes(fixture.id));

    const report = await runSalesLlmTestbench({
      supabase: {} as any,
      tenantId: "tenant-1",
      models: ["deepseek/deepseek-v4-pro", "qwen/qwen3.6-plus"],
      fixtures,
      fetcher,
      persist: false,
    });

    expect(report.results).toHaveLength(4);
    expect(report.model_summaries).toHaveLength(2);
    expect(report.recommended_default_model).toBe("deepseek/deepseek-v4-pro");
    expect(report.best_model?.average_score).toBeGreaterThan(report.model_summaries[1].average_score);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(getLLMClientMock).toHaveBeenCalledWith({} as any, "tenant-1", "sdr_whatsapp", expect.objectContaining({
      preferredProvider: "openrouter",
      modelOverride: "deepseek/deepseek-v4-pro",
    }));
  });

  it("salva score em eventos e artifact do cerebro quando persist=true", async () => {
    const fetcher = createFetcher();
    const fixtures = SALES_LLM_TEST_FIXTURES.filter((fixture) => fixture.id === "price-objection");
    const { supabase, inserts } = createSupabaseMock();

    const report = await runSalesLlmTestbench({
      supabase: supabase as any,
      tenantId: "tenant-1",
      userId: "user-1",
      models: ["deepseek/deepseek-v4-pro"],
      fixtures,
      fetcher,
      persist: true,
    });

    expect(report.persisted).toBe(true);
    expect(report.brain_trace).toEqual(expect.objectContaining({
      task_id: "task-1",
      run_id: "run-1",
      step_id: "step-1",
      artifact_id: "artifact-1",
      system_event_created: true,
    }));
    expect(inserts.map((item) => item.table)).toEqual([
      "system_event_logs",
      "brain_tasks",
      "brain_runs",
      "brain_steps",
      "brain_artifacts",
      "learning_events",
    ]);
    expect(inserts.find((item) => item.table === "system_event_logs")?.payload).toEqual(expect.objectContaining({
      event_name: "sales_llm_testbench_run",
      payload: expect.objectContaining({
        recommended_default_model: "deepseek/deepseek-v4-pro",
        results: expect.any(Array),
      }),
    }));
  });
});
