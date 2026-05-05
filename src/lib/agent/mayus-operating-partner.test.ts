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
  DEFAULT_MAYUS_OPERATING_PARTNER,
  buildMayusOperatingPartnerDecision,
  normalizeMayusOperatingPartnerConfig,
} from "./mayus-operating-partner";

describe("mayus-operating-partner", () => {
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

  it("normaliza a configuracao do socio virtual com autonomia alta supervisionada", () => {
    const config = normalizeMayusOperatingPartnerConfig({
      enabled: true,
      autonomy_mode: "high_supervised",
      confidence_thresholds: { auto_send: 0.81, auto_execute: 0.9, approval: 0.7 },
      active_modules: { sales: true } as any,
    });

    expect(config).toEqual(expect.objectContaining({
      enabled: true,
      autonomy_mode: "high_supervised",
      confidence_thresholds: {
        auto_send: 0.81,
        auto_execute: 0.9,
        approval: 0.7,
      },
    }));
    expect(config.active_modules).toEqual(expect.objectContaining({
      setup: true,
      sales: true,
      client_support: true,
      legal_triage: true,
      crm: true,
      tasks: true,
    }));
    expect(DEFAULT_MAYUS_OPERATING_PARTNER.active_modules.client_support).toBe(true);
  });

  it("conduz venda com autoenvio e acao CRM quando nao ha risco", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "Entendi. Esse desconto aparece com qual nome no contracheque?",
              intent: "sales_qualification",
              confidence: 0.9,
              risk_flags: [],
              next_action: "qualificar dor do desconto",
              actions_to_execute: [
                { type: "create_crm_lead", title: "Registrar lead do WhatsApp", requires_approval: false },
              ],
              requires_approval: false,
              should_auto_send: true,
              expected_outcome: "cliente informa origem do desconto",
            }),
          },
        }],
      }),
    })) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      phoneNumber: "5511999999999",
      messages: [{ direction: "inbound", content: "Quero saber sobre um desconto no meu contracheque" }],
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      salesTestbench: { default_model: "deepseek/deepseek-v4-pro" },
      fetcher,
    });

    expect(getLLMClientMock).toHaveBeenCalledWith({} as any, "tenant-1", "sdr_whatsapp", {
      preferredProvider: "openrouter",
      modelOverride: "deepseek/deepseek-v4-pro",
    });
    expect(decision).toEqual(expect.objectContaining({
      intent: "legal_triage",
      should_auto_send: true,
      requires_approval: false,
      model_used: "deepseek/deepseek-v4-pro",
    }));
    expect(decision.conversation_state).toEqual(expect.objectContaining({
      stage: "new",
      has_mayus_introduced: false,
    }));
    expect(decision.support_summary.issue_type).toBe("none");
    expect(decision.actions_to_execute[0].type).toBe("create_crm_lead");
  });

  it("envia estado conversacional para a LLM e normaliza objecao sem texto gravado", async () => {
    let prompt = "";
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body || "{}"));
      prompt = body.messages[1].content;
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify({
                reply: "Faz sentido voce olhar valor com cuidado. Quando voce diz caro, pesa mais o investimento, a seguranca do caminho ou o momento de decidir?",
                intent: "sales_qualification",
                confidence: 0.88,
                risk_flags: [],
                next_action: "isolar objecao real",
                conversation_state: {
                  stage: "objection",
                  facts_known: ["lead entendeu proposta inicial"],
                  missing_information: ["decisor"],
                  objections: ["valor/preco"],
                  urgency: "none",
                  decision_maker: "unknown",
                  documents_requested: [],
                  last_customer_message: "Achei caro, vou pensar",
                  last_mayus_message: "Pelo que voce contou, faz sentido avancar para analise.",
                  next_action: "isolar objecao real",
                  has_mayus_introduced: true,
                  conversation_summary: "MAYUS ja se apresentou e o cliente objetou valor.",
                },
                closing_readiness: { score: 45, status: "warming", reasons: ["objecao verbalizada"] },
                support_summary: { is_existing_client: false, issue_type: "none", verified_case_reference: false, summary: "sem suporte" },
                reasoning_summary_for_team: "Lead esta em objecao de valor; precisa separar preco de seguranca.",
                actions_to_execute: [
                  { type: "add_internal_note", title: "Registrar objecao de valor", requires_approval: false },
                ],
                requires_approval: false,
                should_auto_send: true,
                expected_outcome: "cliente explica objecao real",
              }),
            },
          }],
        }),
      };
    }) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      phoneNumber: "5511999999999",
      messages: [
        { direction: "outbound", content: "Oi, Vitor. Aqui e o MAYUS, assistente do Escritorio." },
        { direction: "outbound", content: "Pelo que voce contou, faz sentido avancar para analise." },
        { direction: "inbound", content: "Achei caro, vou pensar" },
      ],
      salesProfile: {
        idealClient: "servidores com descontos em contracheque",
        coreSolution: "diagnostico de descontos indevidos com plano de provas",
        uniqueValueProposition: "triagem consultiva sem promessa",
        valuePillars: ["Diagnostico", "Provas", "Conducao"],
        positioningSummary: "Atendimento focado em desconto no contracheque.",
        salesPlaybookContext: "Playbook: em Credcesta, perguntar autorizacao, contrato e inicio do desconto antes de falar em acao.",
        qualificationQuestions: ["voce autorizou esse desconto?"],
        forbiddenClaims: ["causa ganha"],
      },
      crmContext: { crm_task_id: "crm-1", title: "Vitor", stage_name: "Qualificacao" },
      previousMayusEvent: { next_action: "tratar objecao de valor" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(prompt).toContain("Estado conversacional MAYUS reconstruido");
    expect(prompt).toContain("Contexto CRM do contato");
    expect(prompt).toContain("Documento/playbook de vendas");
    expect(prompt).toContain("Credcesta");
    expect(prompt).toContain("Se faltar configuracao do escritorio");
    expect(decision.conversation_state.stage).toBe("objection");
    expect(decision.reply).not.toContain("Aqui e o MAYUS");
    expect(decision.reasoning_summary_for_team).toContain("objecao");
  });

  it("bloqueia autoenvio para status de processo sem base confirmada", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "Para eu nao responder no escuro, me mande o CNJ ou nome completo do cliente.",
              intent: "process_status",
              confidence: 0.91,
              risk_flags: [],
              next_action: "pedir identificador minimo do processo",
              actions_to_execute: [
                { type: "handoff_human", title: "Encaminhar para suporte do caso", requires_approval: true },
              ],
              requires_approval: false,
              should_auto_send: true,
              expected_outcome: "suporte verifica base real",
            }),
          },
        }],
      }),
    })) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      messages: [{ direction: "inbound", content: "Qual o status do meu processo?" }],
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.should_auto_send).toBe(false);
    expect(decision.requires_approval).toBe(true);
    expect(decision.risk_flags).toEqual(expect.arrayContaining(["case_status_unverified"]));
  });
});
