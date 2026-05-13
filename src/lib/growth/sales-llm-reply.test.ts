import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLLMClientMock, buildHeadersMock } = vi.hoisted(() => ({
  getLLMClientMock: vi.fn(),
  buildHeadersMock: vi.fn(),
}));

vi.mock("@/lib/llm-router", () => ({
  getLLMClient: getLLMClientMock,
  buildHeaders: buildHeadersMock,
}));

import {
  DEFAULT_SALES_LLM_TESTBENCH,
  SALES_LLM_TESTBENCH_MODELS,
  SALES_LLM_TEST_FIXTURES,
  buildSalesLlmReply,
  normalizeSalesLlmTestbenchConfig,
  scoreSalesLlmReply,
} from "./sales-llm-reply";

describe("sales-llm-reply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLLMClientMock.mockResolvedValue({
      provider: "openrouter",
      model: "deepseek/deepseek-v4-pro",
      endpoint: "https://openrouter.test/chat/completions",
      apiKey: "openrouter-key",
      extraHeaders: {},
    });
    buildHeadersMock.mockReturnValue({
      Authorization: "Bearer openrouter-key",
      "Content-Type": "application/json",
    });
  });

  it("normaliza bancada com modelo rapido e candidatos unicos", () => {
    const config = normalizeSalesLlmTestbenchConfig({
      enabled: true,
      default_model: "deepseek/deepseek-v4-pro",
      candidate_models: ["minimax/minimax-m2.7", "minimax/minimax-m2.7", "qwen/qwen3.6-plus"],
      routing_mode: "ab_test",
    });

    expect(config).toEqual({
      enabled: true,
      default_model: "deepseek/deepseek-v4-pro",
      candidate_models: ["deepseek/deepseek-v4-pro", "minimax/minimax-m2.7", "qwen/qwen3.6-plus"],
      routing_mode: "ab_test",
    });
    expect(DEFAULT_SALES_LLM_TESTBENCH.default_model).toBe("openai/gpt-5.4-nano");
    expect(SALES_LLM_TESTBENCH_MODELS).toContain("openai/gpt-5.4-nano");
    expect(SALES_LLM_TESTBENCH_MODELS).toContain("moonshotai/kimi-k2.6");
  });

  it("chama OpenRouter com override de modelo SDR e retorna JSON normalizado", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "Entendi. O que aconteceu ate aqui e o que voce mais quer evitar agora?",
              lead_stage: "discovery",
              intent: "sales_discovery",
              confidence: 0.88,
              risk_flags: [],
              next_action: "capturar dor concreta",
              should_auto_send: true,
              expected_outcome: "capturar situacao e motivacao",
            }),
          },
        }],
      }),
    })) as any;

    const reply = await buildSalesLlmReply({
      supabase: {} as any,
      tenantId: "tenant-1",
      contactName: "Maria",
      messages: [{ direction: "inbound", content: "Meu beneficio foi negado." }],
      salesProfile: {
        idealClient: "beneficiarios com negativa recente",
        coreSolution: "diagnostico previdenciario",
        uniqueValueProposition: "clareza antes de promessa",
        valuePillars: ["Diagnostico", "Provas", "Plano"],
      },
      testbench: { enabled: true, default_model: "minimax/minimax-m2.7", routing_mode: "fixed" },
      autonomyMode: "auto_respond",
      fetcher,
    });

    expect(getLLMClientMock).toHaveBeenCalledWith({} as any, "tenant-1", "sdr_whatsapp", {
      preferredProvider: "openrouter",
      modelOverride: "minimax/minimax-m2.7",
    });
    expect(fetcher).toHaveBeenCalledWith("https://openrouter.test/chat/completions", expect.objectContaining({
      method: "POST",
    }));
    expect(reply).toEqual(expect.objectContaining({
      reply: expect.stringContaining("Entendi"),
      intent: "sales_discovery",
      lead_stage: "discovery",
      should_auto_send: true,
      model_used: "deepseek/deepseek-v4-pro",
      provider: "openrouter",
    }));
  });

  it("bloqueia autoenvio quando ha risco juridico ou baixa confianca", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "Vou verificar com a equipe antes de falar do processo.",
              lead_stage: "handoff",
              intent: "case_status_request",
              confidence: 0.52,
              risk_flags: [],
              next_action: "encaminhar para suporte de caso",
              should_auto_send: true,
              expected_outcome: "handoff seguro",
            }),
          },
        }],
      }),
    })) as any;

    const reply = await buildSalesLlmReply({
      supabase: {} as any,
      tenantId: "tenant-1",
      messages: [{ direction: "inbound", content: "Qual o andamento do meu processo?" }],
      testbench: { enabled: true },
      autonomyMode: "auto_respond",
      fetcher,
    });

    expect(reply.should_auto_send).toBe(false);
    expect(reply.risk_flags).toEqual(expect.arrayContaining(["case_status_request", "low_confidence"]));
  });

  it("orienta a LLM a tratar desconto no contracheque com triagem especifica", async () => {
    let requestBody: any = null;
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      requestBody = JSON.parse(String(init?.body || "{}"));
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                reply: "Entendi. Esse desconto aparece com qual nome no contracheque e comecou em que mes?",
                lead_stage: "discovery",
                intent: "legal_question",
                confidence: 0.86,
                risk_flags: [],
                next_action: "pedir nome e inicio do desconto",
                should_auto_send: true,
                expected_outcome: "lead envia detalhes do desconto",
              }),
            },
          }],
        }),
      };
    }) as any;

    const reply = await buildSalesLlmReply({
      supabase: {} as any,
      tenantId: "tenant-1",
      contactName: "Vitor",
      messages: [{ direction: "inbound", content: "Quero saber se tenho direito ao desconto do meu contracheque" }],
      testbench: { enabled: true },
      autonomyMode: "auto_respond",
      fetcher,
    });

    expect(requestBody.messages[1].content).toContain("Se ele falou contracheque");
    expect(requestBody.messages[1].content).toContain("Pergunte o nome do desconto");
    expect(reply.risk_flags).toContain("legal_triage");
    expect(reply.should_auto_send).toBe(true);
  });

  it("inclui documento de vendas como fonte comercial principal no prompt", async () => {
    let requestBody: any = null;
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      requestBody = JSON.parse(String(init?.body || "{}"));
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                reply: "Perfeito. Antes de analisar, me diga qual desconto chamou sua atencao.",
                lead_stage: "discovery",
                intent: "sales_discovery",
                confidence: 0.86,
                risk_flags: [],
                next_action: "usar pergunta do playbook comercial",
                should_auto_send: true,
                expected_outcome: "cliente informa desconto principal",
              }),
            },
          }],
        }),
      };
    }) as any;

    await buildSalesLlmReply({
      supabase: {} as any,
      tenantId: "tenant-1",
      messages: [{ direction: "inbound", content: "Enviei meu contracheque." }],
      salesProfile: {
        salesPlaybookContext: "Playbook enviado: vender com diagnostico, pedir documento, conduzir sem promessa.",
        salesDocumentSummary: "Resumo: foco em descontos indevidos e triagem documental.",
        offerPositioning: "Diagnostico inicial seguro antes de proposta.",
        salesRules: ["uma pergunta por vez", "nao prometer resultado"],
        qualificationQuestions: ["qual desconto chamou atencao?"],
        forbiddenClaims: ["causa ganha", "indenizacao garantida"],
      },
      testbench: { enabled: true },
      autonomyMode: "auto_respond",
      fetcher,
    });

    const prompt = requestBody.messages[1].content;
    expect(prompt).toContain("Use o Documento de Vendas abaixo como fonte comercial principal");
    expect(prompt).toContain("Playbook enviado: vender com diagnostico");
    expect(prompt).toContain("qual desconto chamou atencao?");
    expect(prompt).toContain("causa ganha");
  });

  it("interrompe chamada lenta da LLM para permitir fallback operacional", async () => {
    const fetcher = vi.fn(() => new Promise<Response>(() => undefined)) as any;

    await expect(buildSalesLlmReply({
      supabase: {} as any,
      tenantId: "tenant-1",
      messages: [{ direction: "inbound", content: "Posso mandar meu contracheque?" }],
      testbench: { enabled: true },
      autonomyMode: "auto_respond",
      timeoutMs: 1,
      fetcher,
    })).rejects.toThrow(/Timeout ao chamar LLM de vendas/);
  });

  it("pontua fixtures de teste de vendas sem aceitar promessa juridica", () => {
    const fixture = SALES_LLM_TEST_FIXTURES.find((item) => item.id === "price-objection")!;
    const score = scoreSalesLlmReply({
      reply: "Entendi. Quando voce diz caro, sua duvida principal e valor, seguranca ou prioridade?",
      intent: "sales_objection",
      lead_stage: "objection",
      risk_flags: [],
      next_action: "investigar objecao real",
      should_auto_send: true,
    }, fixture);

    expect(score.total).toBeGreaterThanOrEqual(80);
    expect(score.notes).toEqual([]);
  });
});
