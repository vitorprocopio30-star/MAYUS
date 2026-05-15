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
              conversation_state: {
                conversation_role: "legal_triage",
                conversation_goal: "entender o desconto e avancar triagem comercial segura",
                customer_temperature: "interested",
                stage: "new",
                facts_known: ["cliente quer entender desconto no contracheque"],
                missing_information: ["nome do desconto", "inicio do desconto"],
                objections: [],
                urgency: "none",
                decision_maker: "unknown",
                documents_requested: ["contracheque ou print do desconto"],
                last_customer_message: "Quero saber sobre um desconto no meu contracheque",
                last_mayus_message: null,
                last_commitment: null,
                next_action: "qualificar dor do desconto",
                has_mayus_introduced: false,
                conversation_summary: "Lead iniciou triagem sobre desconto em contracheque.",
              },
              closing_readiness: { score: 30, status: "not_ready", reasons: ["descoberta incompleta"] },
              support_summary: { is_existing_client: false, issue_type: "none", verified_case_reference: false, summary: "sem suporte" },
              reasoning_summary_for_team: "Lead precisa ser qualificado como triagem de desconto em folha antes de qualquer promessa.",
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
                  conversation_role: "seller",
                  conversation_goal: "tratar objecao de valor e manter avanco comercial",
                  customer_temperature: "warm",
                  stage: "objection",
                  facts_known: ["lead entendeu proposta inicial"],
                  missing_information: ["decisor"],
                  objections: ["valor/preco"],
                  urgency: "none",
                  decision_maker: "unknown",
                  documents_requested: [],
                  last_customer_message: "Achei caro, vou pensar",
                  last_mayus_message: "Pelo que voce contou, faz sentido avancar para analise.",
                  last_commitment: null,
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
      officeKnowledgeProfile: {
        officeName: "Dutra Advocacia",
        practiceAreas: ["bancario", "previdenciario"],
        triageRules: ["em Credcesta, perguntar autorizacao e inicio do desconto"],
        humanHandoffRules: ["preco e contrato exigem humano"],
        communicationTone: "curto, seguro e consultivo",
        requiredDocumentsByCase: ["contracheque com trecho do desconto"],
        forbiddenClaims: ["resultado garantido"],
        pricingPolicy: "nao informar honorarios no WhatsApp sem humano",
        responseSla: "ate 5 minutos",
        departments: ["Comercial", "Juridico"],
      },
      crmContext: { crm_task_id: "crm-1", title: "Vitor", stage_name: "Qualificacao" },
      previousMayusEvent: { next_action: "tratar objecao de valor" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(prompt).toContain("Estado conversacional MAYUS reconstruido");
    expect(prompt).toContain("Contexto CRM do contato");
    expect(prompt).toContain("Documento/playbook de vendas");
    expect(prompt).toContain("Perfil operacional do escritorio");
    expect(prompt).toContain("Credcesta");
    expect(prompt).toContain("Dutra Advocacia");
    expect(prompt).toContain("preco e contrato exigem humano");
    expect(prompt).toContain("Se faltar configuracao do escritorio");
    expect(decision.conversation_state.stage).toBe("objection");
    expect(decision.reply).not.toContain("Aqui e o MAYUS");
    expect(decision.reasoning_summary_for_team).toContain("objecao");
  });

  it("autoenvia pedido seguro de identificacao para status sem base confirmada", async () => {
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
              conversation_state: {
                conversation_role: "case_status",
                conversation_goal: "localizar identificador minimo antes de verificar status",
                customer_temperature: "existing_client",
                stage: "handoff",
                facts_known: ["cliente pediu status do processo"],
                missing_information: ["CNJ ou nome completo"],
                objections: [],
                urgency: "none",
                decision_maker: "unknown",
                documents_requested: [],
                last_customer_message: "Qual o status do meu processo?",
                last_mayus_message: null,
                last_commitment: null,
                next_action: "pedir identificador minimo do processo",
                has_mayus_introduced: false,
                conversation_summary: "Cliente pediu status sem identificador confirmado.",
              },
              closing_readiness: { score: 0, status: "not_ready", reasons: ["suporte processual"] },
              support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: false, summary: "status sem base verificada" },
              reasoning_summary_for_team: "Pedido de status exige identificador e verificacao humana/base antes de informar qualquer andamento.",
              actions_to_execute: [
                { type: "ask_discovery_question", title: "Pedir nome completo ou CNJ para localizar com segurança", requires_approval: false },
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

    expect(decision.should_auto_send).toBe(true);
    expect(decision.requires_approval).toBe(false);
    expect(decision.risk_flags).not.toContain("case_status_unverified");
  });

  it("usa nome configuravel da assistente e cria tarefa para outra demanda de suporte", async () => {
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
                reply: "Boa tarde, Ana. Aqui é a Maya, assistente do Dutra. Claro, me adianta em poucas palavras o assunto para eu organizar certinho e passar ao advogado responsável.",
                intent: "client_support",
                confidence: 0.9,
                risk_flags: [],
                next_action: "pedir assunto e encaminhar para advogado responsavel",
                conversation_state: {
                  conversation_role: "support",
                  conversation_goal: "acolher demanda e organizar retorno humano",
                  customer_temperature: "existing_client",
                  stage: "client_support",
                  facts_known: ["cliente quer tratar outro assunto"],
                  missing_information: ["assunto principal"],
                  objections: [],
                  urgency: "none",
                  decision_maker: "unknown",
                  documents_requested: [],
                  last_customer_message: "Boa tarde, queria falar sobre outra demanda",
                  last_mayus_message: null,
                  last_commitment: null,
                  next_action: "criar tarefa para retorno humano",
                  has_mayus_introduced: true,
                  conversation_summary: "Cliente pediu atendimento sobre outra demanda.",
                },
                closing_readiness: { score: 0, status: "not_ready", reasons: ["suporte"] },
                support_summary: { is_existing_client: true, issue_type: "support", verified_case_reference: false, summary: "outra demanda de suporte" },
                reasoning_summary_for_team: "Cliente precisa de retorno humano com resumo da demanda.",
                actions_to_execute: [],
                requires_approval: false,
                should_auto_send: true,
                expected_outcome: "cliente adianta o assunto e advogado recebe tarefa",
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
      contactName: "Ana",
      messages: [{ direction: "inbound", content: "Boa tarde, queria falar sobre outra demanda" }],
      officeKnowledgeProfile: { assistantName: "Maya", officeName: "Dutra", communicationTone: "simpatico e prestativo" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(prompt).toContain("Nome da assistente no WhatsApp: Maya");
    expect(prompt).toContain("Nem todo cliente pergunta apenas de processo");
    expect(decision.reply).toContain("Maya");
    expect(decision.actions_to_execute).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "create_task", requires_approval: false }),
    ]));
    expect(decision.should_auto_send).toBe(true);
  });

  it("normaliza saudacao pura para apresentacao sem pedir dados de processo", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "Boa noite. Me mande o CNJ ou nome completo para eu consultar o processo.",
              intent: "process_status",
              confidence: 0.9,
              risk_flags: [],
              next_action: "cumprimentar e perguntar assunto",
              conversation_state: {
                conversation_role: "support",
                conversation_goal: "acolher saudacao e entender assunto",
                customer_temperature: "existing_client",
                stage: "client_support",
                facts_known: ["cliente saudou"],
                missing_information: ["assunto"],
                objections: [],
                urgency: "none",
                decision_maker: "unknown",
                documents_requested: [],
                last_customer_message: "Boa noite",
                last_mayus_message: null,
                last_commitment: null,
                next_action: "perguntar como ajudar",
                has_mayus_introduced: false,
                conversation_summary: "Cliente apenas saudou.",
              },
              closing_readiness: { score: 0, status: "not_ready", reasons: [] },
              support_summary: { is_existing_client: true, issue_type: "support", verified_case_reference: false, summary: "saudacao" },
              reasoning_summary_for_team: "Saudacao pura nao deve retomar processo pelo historico.",
              actions_to_execute: [],
              requires_approval: false,
              should_auto_send: true,
              expected_outcome: "cliente informa assunto",
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
      messages: [
        { direction: "inbound", content: "Como está o processo do Márcio?" },
        { direction: "outbound", content: "Me confirme o nome completo ou CNJ." },
        { direction: "inbound", content: "Boa noite" },
      ],
      officeKnowledgeProfile: { assistantName: "Maya", officeName: "Dutra" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.reply).toBe("Boa noite, Vitor. Aqui é a Maya, assistente do Dutra. Como posso te ajudar?");
    expect(decision.reply).not.toMatch(/cnj|processo|nome completo/i);
  });

  it("apresenta Maya mesmo se evento anterior dizia introduzido mas historico recente nao mostra apresentacao", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("LLM nao deveria ser chamada");
    }) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor Procópio",
      messages: [{ direction: "inbound", content: "Boa noite", created_at: "2026-05-07T21:40:00.000Z" }],
      previousMayusEvent: {
        created_at: new Date().toISOString(),
        conversation_state: { has_mayus_introduced: true },
      },
      officeKnowledgeProfile: { assistantName: "Maya", officeName: "Dutra" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(decision.reply).toBe("Boa noite, Vitor Procópio. Aqui é a Maya, assistente do Dutra. Como posso te ajudar?");
  });

  it("nao usa MAYUS como nome visivel do escritorio na apresentacao", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("LLM nao deveria ser chamada");
    }) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor Procópio",
      messages: [{ direction: "inbound", content: "Boa noite", created_at: "2026-05-07T22:04:00.000Z" }],
      officeKnowledgeProfile: { assistantName: "Maya", officeName: "MAYUS" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.reply).toBe("Boa noite, Vitor Procópio. Aqui é a Maya, assistente do escritório. Como posso te ajudar?");
    expect(decision.reply).not.toContain("assistente do MAYUS");
  });

  it("nao reutiliza nome antigo quando pedido de processo e generico", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "Boa noite, Vitor. Esse processo do Márcio é sobre benefício, consignado ou execução?",
              intent: "process_status",
              confidence: 0.9,
              risk_flags: [],
              next_action: "pedir identificador do processo",
              conversation_state: {
                conversation_role: "case_status",
                conversation_goal: "identificar processo antes de consultar status",
                customer_temperature: "existing_client",
                stage: "client_support",
                facts_known: ["cliente pediu genericamente um processo"],
                missing_information: ["nome completo ou numero do processo"],
                objections: [],
                urgency: "none",
                decision_maker: "unknown",
                documents_requested: [],
                last_customer_message: "Gostaria de saber sobre um processo",
                last_mayus_message: null,
                last_commitment: null,
                next_action: "pedir identificador seguro",
                has_mayus_introduced: true,
                conversation_summary: "Pedido generico de processo sem identificador.",
              },
              closing_readiness: { score: 0, status: "not_ready", reasons: [] },
              support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: false, summary: "status sem identificador" },
              reasoning_summary_for_team: "Nao reutilizar nome antigo sem referencia explicita.",
              actions_to_execute: [],
              requires_approval: false,
              should_auto_send: true,
              expected_outcome: "cliente envia identificador",
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
      messages: [
        { direction: "inbound", content: "Como está o processo do Márcio?", created_at: "2026-05-07T19:00:00.000Z" },
        { direction: "outbound", content: "Me confirme o nome completo ou CNJ.", created_at: "2026-05-07T19:01:00.000Z" },
        { direction: "inbound", content: "Gostaria de saber sobre um processo", created_at: "2026-05-07T20:35:00.000Z" },
      ],
      processStatusContext: { verified: false, confidence: "low", accessScope: "tenant_authorized", senderPhoneAuthorized: true, processTaskId: null, clientName: null, processNumber: null, title: null, currentStage: null, detectedPhase: "sem_fase_confiavel", detectedPhaseLabel: null, lastMovementAt: null, lastMovementText: null, deadlineAt: null, pendingItems: [], nextStep: null, riskFlags: ["case_status_unverified"], clientReply: null, grounding: { factualSources: [], inferenceNotes: [], missingSignals: ["authorized_process_access_needs_reference"] } },
      officeKnowledgeProfile: { assistantName: "Maya", officeName: "Dutra" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.reply).toBe("Vitor, aqui é a Maya, assistente do Dutra. Claro. Para eu localizar com segurança, me mande o nome completo do cliente ou o número do processo.");
    expect(decision.reply).not.toContain("Márcio");
    expect(decision.should_auto_send).toBe(true);
    expect(decision.requires_approval).toBe(false);
  });

  it("pedido generico de um processo sem contexto nao pergunta tema nem reutiliza processo antigo", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("LLM nao deveria ser chamada");
    }) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor Procópio",
      messages: [
        { direction: "inbound", content: "Como está o processo do Márcio da Silva Machado", created_at: "2026-05-07T19:00:00.000Z" },
        { direction: "outbound", content: "Me confirme o nome completo ou CNJ.", created_at: "2026-05-07T19:01:00.000Z" },
        { direction: "inbound", content: "Boa noite", created_at: "2026-05-07T21:40:00.000Z" },
        { direction: "outbound", content: "Boa noite, Vitor Procópio. Como posso te ajudar?", created_at: "2026-05-07T21:40:10.000Z" },
        { direction: "inbound", content: "Gostaria de saber sobre um processo", created_at: "2026-05-07T21:41:00.000Z" },
      ],
      officeKnowledgeProfile: { assistantName: "Maya", officeName: "Dutra" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(decision.reply).toBe("Vitor Procópio, aqui é a Maya, assistente do Dutra. Claro. Para eu localizar com segurança, me confirme seu nome completo ou o número do processo.");
    expect(decision.reply).not.toMatch(/M[áa]rcio|tema|assunto|banco|RMC|benef[ií]cio|execu[cç][aã]o|fam[ií]lia/i);
    expect(decision.should_auto_send).toBe(true);
    expect(decision.requires_approval).toBe(false);
  });

  it("responde cobranca curta de status sem chamar LLM", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("LLM nao deveria ser chamada");
    }) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Gostaria de saber sobre um processo", created_at: "2026-05-07T20:35:00.000Z" },
        { direction: "outbound", content: "Claro. Para eu localizar com segurança, me mande o nome completo do cliente ou o número do processo.", created_at: "2026-05-07T20:35:10.000Z" },
        { direction: "inbound", content: "Cadê?", created_at: "2026-05-07T20:36:00.000Z" },
      ],
      officeKnowledgeProfile: { assistantName: "Maya", officeName: "Dutra" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(decision.reply).toContain("Estou localizando com segurança");
    expect(decision.reply).toContain("número do processo/CNJ");
    expect(decision.reply).not.toMatch(/tema|assunto|banco|rmc/i);
    expect(decision.should_auto_send).toBe(true);
  });

  it("pede CNJ ou documento quando nome completo nao localiza processo", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("LLM nao deveria ser chamada");
    }) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Gostaria de saber sobre um processo" },
        { direction: "outbound", content: "Me mande o nome completo ou CNJ." },
        { direction: "inbound", content: "Márcio da Silva Machado" },
      ],
      processStatusContext: { verified: false, confidence: "low", accessScope: "tenant_authorized", senderPhoneAuthorized: true, processTaskId: null, clientName: null, processNumber: null, title: null, currentStage: null, detectedPhase: "sem_fase_confiavel", detectedPhaseLabel: null, lastMovementAt: null, lastMovementText: null, deadlineAt: null, pendingItems: [], nextStep: null, riskFlags: ["case_status_unverified"], clientReply: null, grounding: { factualSources: [], inferenceNotes: [], missingSignals: ["processo nao localizado"] } },
      officeKnowledgeProfile: { assistantName: "Maya", officeName: "Dutra" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(decision.reply).toContain("Não localizei com segurança");
    expect(decision.reply).toMatch(/processo\/CNJ|CPF\/CNPJ/);
    expect(decision.reply).not.toMatch(/tema|assunto|banco|rmc/i);
    expect(decision.should_auto_send).toBe(true);
    expect(decision.requires_approval).toBe(false);
  });

  it("lista processos encontrados em vez de dizer que nao localizou quando ha mais de um candidato", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("LLM nao deveria ser chamada");
    }) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Gostaria de saber sobre um processo" },
        { direction: "outbound", content: "Me mande o nome completo do cliente ou CNJ." },
        { direction: "inbound", content: "Márcio da Silva Machado" },
      ],
      processStatusContext: {
        verified: false,
        confidence: "low",
        accessScope: "tenant_authorized",
        senderPhoneAuthorized: true,
        processTaskId: null,
        clientName: null,
        processNumber: null,
        title: null,
        currentStage: null,
        detectedPhase: "sem_fase_confiavel",
        detectedPhaseLabel: null,
        lastMovementAt: null,
        lastMovementText: null,
        deadlineAt: null,
        pendingItems: [],
        nextStep: null,
        riskFlags: ["case_status_unverified"],
        clientReply: null,
        candidateProcesses: [
          { processTaskId: "monitored-1", clientName: "Márcio da Silva Machado", processNumber: "3333333-33.2024.8.26.0100", title: "Márcio x INSS", currentStage: "Réplica", lastMovementAt: "2026-05-02" },
          { processTaskId: "monitored-2", clientName: "Márcio da Silva Machado", processNumber: "4444444-44.2024.8.26.0100", title: "Márcio x Banco", currentStage: "Conhecimento", lastMovementAt: "2026-04-20" },
        ],
        grounding: { factualSources: [], inferenceNotes: [], missingSignals: ["mais de um processo possivel"] },
      },
      officeKnowledgeProfile: { assistantName: "Maya", officeName: "Dutra" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(decision.reply).toContain("Encontrei mais de um processo para Márcio da Silva Machado");
    expect(decision.reply).toContain("3333333-33.2024.8.26.0100");
    expect(decision.reply).toContain("4444444-44.2024.8.26.0100");
    expect(decision.reply).not.toContain("Não localizei");
  });

  it("troca contexto de processo para triagem de desconto sem chamar LLM", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("LLM nao deveria ser chamada");
    }) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Gostaria de saber sobre um processo" },
        { direction: "outbound", content: "Me mande o nome completo ou CNJ." },
        { direction: "inbound", content: "Tenho desconto no contracheque" },
      ],
      processStatusContext: { verified: false, confidence: "low", accessScope: "tenant_authorized", senderPhoneAuthorized: true, processTaskId: null, clientName: null, processNumber: null, title: null, currentStage: null, detectedPhase: "sem_fase_confiavel", detectedPhaseLabel: null, lastMovementAt: null, lastMovementText: null, deadlineAt: null, pendingItems: [], nextStep: null, riskFlags: ["case_status_unverified"], clientReply: null, grounding: { factualSources: [], inferenceNotes: [], missingSignals: ["authorized_process_access_needs_reference"] } },
      officeKnowledgeProfile: { assistantName: "Maya", officeName: "Dutra Advocacia" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(decision.intent).toBe("legal_triage");
    expect(decision.reply).toContain("desconto no contracheque");
    expect(decision.reply).toContain("aparece com qual nome");
    expect(decision.reply).not.toMatch(/processo\/CNJ|CPF\/CNPJ|fase/i);
    expect(decision.actions_to_execute.map((action) => action.type)).toContain("create_crm_lead");
  });

  it("permite resposta de suporte para status de processo com base verificada", async () => {
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
                reply: "Oi, Maria. Verifiquei aqui com segurança. Seu processo está na fase de réplica. Última movimentação: contestação juntada. Próximo passo: a equipe revisar a defesa da outra parte. No momento, não vi pendência sua registrada.",
                intent: "process_status",
                confidence: 0.9,
                risk_flags: [],
                next_action: "responder status processual verificado",
                conversation_state: {
                  conversation_role: "case_status",
                  conversation_goal: "responder status processual com base verificada, linguagem simples e sem promessa juridica",
                  customer_temperature: "existing_client",
                  stage: "client_support",
                  facts_known: ["processo verificado"],
                  missing_information: [],
                  objections: [],
                  urgency: "none",
                  decision_maker: "unknown",
                  documents_requested: [],
                  last_customer_message: "Como está meu processo?",
                  last_mayus_message: null,
                  last_commitment: null,
                  next_action: "responder status processual verificado",
                  has_mayus_introduced: false,
                  conversation_summary: "Cliente pediu status e processo foi verificado.",
                },
                closing_readiness: { score: 0, status: "not_ready", reasons: ["suporte processual"] },
                support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "status com base verificada" },
                reasoning_summary_for_team: "Base processual verificada, sem prazo critico ou promessa juridica.",
                actions_to_execute: [
                  { type: "answer_support", title: "Responder status processual verificado", requires_approval: false },
                ],
                requires_approval: false,
                should_auto_send: true,
                expected_outcome: "cliente entende fase e proximo passo",
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
      messages: [{ direction: "inbound", content: "Como está meu processo?" }],
      processStatusContext: {
        verified: true,
        confidence: "high",
        accessScope: "linked_contact",
        senderPhoneAuthorized: false,
        processTaskId: "process-1",
        clientName: "Maria Silva",
        processNumber: "1234567-89.2024.8.26.0100",
        title: "Maria x Banco",
        currentStage: "Réplica",
        detectedPhase: "replica",
        detectedPhaseLabel: "réplica",
        lastMovementAt: "2026-05-02",
        lastMovementText: "contestação juntada",
        deadlineAt: null,
        pendingItems: [],
        nextStep: "a equipe revisar a defesa da outra parte",
        riskFlags: [],
        clientReply: "Oi, Maria. Verifiquei aqui com segurança.",
        grounding: { factualSources: ["último andamento registrado", "etapa operacional do processo"], inferenceNotes: [], missingSignals: [] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(prompt).toContain("Contexto processual verificado e fonte de fatos");
    expect(prompt).toContain("Maria x Banco");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(decision.should_auto_send).toBe(true);
    expect(decision.requires_approval).toBe(false);
    expect(decision.risk_flags).not.toContain("case_status_unverified");
    expect(decision.actions_to_execute[0].type).toBe("answer_support");
    expect(decision.model_used).toBe("deepseek/deepseek-v4-pro");
  });

  it("classifica pedido plural de processo por nome como status processual", async () => {
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
                reply: "Oi, Marcio. Verifiquei aqui com segurança. Seu processo está na fase de réplica. Última movimentação: contestação juntada. Próximo passo: a equipe revisar a defesa da outra parte.",
                intent: "process_status",
                confidence: 0.9,
                risk_flags: [],
                next_action: "responder status processual verificado",
                conversation_state: {
                  conversation_role: "case_status",
                  conversation_goal: "responder status processual com base verificada",
                  customer_temperature: "existing_client",
                  stage: "client_support",
                  facts_known: ["processo verificado"],
                  missing_information: [],
                  objections: [],
                  urgency: "none",
                  decision_maker: "unknown",
                  documents_requested: [],
                  last_customer_message: "COMO ESTÁ O PROCESSOS DO MARCIO DA SILVA MACHADO",
                  last_mayus_message: null,
                  last_commitment: null,
                  next_action: "responder status processual verificado",
                  has_mayus_introduced: false,
                  conversation_summary: "Dono autorizado pediu status por nome.",
                },
                closing_readiness: { score: 0, status: "not_ready", reasons: ["suporte processual"] },
                support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "status com base verificada" },
                reasoning_summary_for_team: "Base processual verificada e pedido de status identificado.",
                actions_to_execute: [{ type: "answer_support", title: "Responder status processual verificado", requires_approval: false }],
                requires_approval: false,
                should_auto_send: true,
                expected_outcome: "cliente entende fase e proximo passo",
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
      messages: [{ direction: "inbound", content: "COMO ESTÁ O PROCESSOS DO MARCIO DA SILVA MACHADO" }],
      processStatusContext: {
        verified: true,
        confidence: "high",
        accessScope: "tenant_authorized",
        senderPhoneAuthorized: true,
        processTaskId: "process-marcio-1",
        clientName: "Marcio da Silva Machado",
        processNumber: "3333333-33.2024.8.26.0100",
        title: "Marcio da Silva Machado x INSS",
        currentStage: "Réplica",
        detectedPhase: "replica",
        detectedPhaseLabel: "réplica",
        lastMovementAt: "2026-05-02",
        lastMovementText: "contestação juntada",
        deadlineAt: null,
        pendingItems: [],
        nextStep: "a equipe revisar a defesa da outra parte",
        riskFlags: [],
        clientReply: "Oi, Marcio. Verifiquei aqui com segurança.",
        grounding: { factualSources: ["último andamento registrado", "etapa operacional do processo"], inferenceNotes: [], missingSignals: [] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(prompt).toContain("candidateProcesses");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(decision.intent).toBe("process_status");
    expect(decision.should_auto_send).toBe(true);
    expect(decision.requires_approval).toBe(false);
  });

  it("responde todos os processos verificados em blocos sem perguntar se quer resumo", async () => {
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
                reply: "Márcio, localizei três processos principais e vou te resumir por partes. No Banco Master, o ponto atual está ligado à gratuidade/custas em recurso. No Bradesco, o processo está em fase de conhecimento e aguarda movimentação do juízo. Na Caixa, o processo está mais antigo e sem movimentação recente na base.",
                reply_blocks: [
                  "Márcio, localizei três processos principais: Banco Master, Bradesco e Caixa. Vou te resumir por partes.",
                  "No Banco Master, o ponto atual está ligado à gratuidade/custas em recurso. Não vi movimentação nova desde 30/04, então segue na última situação registrada.",
                  "No Bradesco, o processo está em fase de conhecimento e aguarda movimentação do juízo. Na Caixa, o processo está mais antigo e sem movimentação recente na base.",
                ],
                intent: "process_status",
                confidence: 0.92,
                risk_flags: [],
                next_action: "responder os tres processos principais diretamente",
                conversation_state: {
                  conversation_role: "case_status",
                  conversation_goal: "responder status processual com base verificada",
                  customer_temperature: "existing_client",
                  stage: "client_support",
                  facts_known: ["cliente tem tres processos principais"],
                  missing_information: [],
                  objections: [],
                  urgency: "none",
                  decision_maker: "unknown",
                  documents_requested: [],
                  last_customer_message: "Márcio da Silva Machado",
                  last_mayus_message: null,
                  last_commitment: null,
                  next_action: "responder status dos tres processos",
                  has_mayus_introduced: true,
                  conversation_summary: "Cliente pediu processos de Márcio.",
                },
                closing_readiness: { score: 0, status: "not_ready", reasons: ["suporte processual"] },
                support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "dossie processual verificado" },
                reasoning_summary_for_team: "Havia tres processos verificados; respondi todos sem pergunta roteirizada.",
                actions_to_execute: [{ type: "answer_support", title: "Responder dossie processual", requires_approval: false }],
                requires_approval: false,
                should_auto_send: true,
                expected_outcome: "cliente entende os tres processos",
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
      messages: [
        { direction: "inbound", content: "Gostaria de saber de um processo" },
        { direction: "outbound", content: "Claro. Me mande o nome completo do cliente ou número do processo." },
        { direction: "inbound", content: "Márcio da Silva Machado" },
      ],
      processStatusContext: {
        verified: true,
        confidence: "high",
        accessScope: "tenant_authorized",
        senderPhoneAuthorized: true,
        processTaskId: null,
        clientName: "Márcio da Silva Machado",
        processNumber: null,
        title: "Dossiê processual do cliente",
        currentStage: null,
        detectedPhase: "sem_fase_confiavel",
        detectedPhaseLabel: null,
        lastMovementAt: null,
        lastMovementText: null,
        deadlineAt: null,
        pendingItems: [],
        nextStep: null,
        riskFlags: [],
        clientReply: null,
        candidateProcesses: [
          { processTaskId: "master", clientName: "Márcio da Silva Machado", processNumber: "3000144-50.2026.8.19.0213", title: "Márcio x Banco Master", opposingParty: "Banco Master", summary: "gratuidade/custas em recurso", currentStage: "Recurso", lastMovementAt: "2026-04-30", lastMovementText: "Sem decisão nova registrada" },
          { processTaskId: "bradesco", clientName: "Márcio da Silva Machado", processNumber: "3000141-95.2026.8.19.0213", title: "Márcio x Bradesco", opposingParty: "Bradesco", summary: "ação de indenização", currentStage: "Conhecimento", lastMovementAt: "2026-06-21", lastMovementText: "Aguardando andamento do juízo" },
          { processTaskId: "caixa", clientName: "Márcio da Silva Machado", processNumber: "5006349-29.2023.4.02.5110", title: "Márcio x Caixa", opposingParty: "Caixa", summary: "processo bancário antigo", currentStage: "Conhecimento", lastMovementAt: "2023-06-10", lastMovementText: null },
        ],
        grounding: { factualSources: ["processos monitorados no Escavador"], inferenceNotes: [], missingSignals: [] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(prompt).toContain("responda todos diretamente em blocos curtos");
    expect(decision.reply_blocks).toHaveLength(3);
    expect(decision.reply).toContain("Banco Master");
    expect(decision.reply).toContain("Bradesco");
    expect(decision.reply).toContain("Caixa");
    expect(decision.reply).not.toMatch(/quer.*resumo|prefere ver|quer que eu detalhe/i);
    expect(decision.conversation_state.last_process_candidates).toHaveLength(3);
    expect(decision.should_auto_send).toBe(true);
  });

  it("repara resposta roteirizada que pede escolha apesar de haver processos verificados", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({
          reply: "Boa tarde, Marcio. Para eu te passar o andamento certo, me diga só qual desses você quer acompanhar: o do Banco Bradesco ou o da Caixa (TRF2)?\n\nSe você não souber, me mande o número do processo (ou uma foto do documento que você tem).",
          intent: "process_status",
          confidence: 0.9,
          risk_flags: [],
          next_action: "perguntar qual processo quer acompanhar",
          conversation_state: { conversation_role: "case_status", conversation_goal: "responder status", customer_temperature: "existing_client", stage: "client_support", facts_known: ["três processos"], missing_information: [], objections: [], urgency: "none", decision_maker: "unknown", documents_requested: [], last_customer_message: "Márcio da Silva Machado", last_mayus_message: null, last_commitment: null, next_action: "perguntar qual processo quer acompanhar", has_mayus_introduced: true, conversation_summary: "pedido de status" },
          closing_readiness: { score: 0, status: "not_ready", reasons: [] },
          support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "status" },
          reasoning_summary_for_team: "perguntou qual processo apesar de haver candidatos verificados",
          actions_to_execute: [{ type: "answer_support", title: "Responder status", requires_approval: false }],
          requires_approval: false,
          should_auto_send: true,
          expected_outcome: "cliente escolhe",
        }) } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({
          reply: "Márcio, localizei três processos principais. No Banco Master, o ponto atual é gratuidade/custas em recurso. No Bradesco, segue em conhecimento aguardando movimentação. Na Caixa, não vi movimentação recente na base.",
          reply_blocks: ["Márcio, localizei três processos principais: Banco Master, Bradesco e Caixa.", "No Banco Master, o ponto atual é gratuidade/custas em recurso. No Bradesco, segue em conhecimento aguardando movimentação.", "Na Caixa, não vi movimentação recente na base."],
          intent: "process_status",
          confidence: 0.9,
          risk_flags: [],
          next_action: "responder status dos processos",
          conversation_state: { conversation_role: "case_status", conversation_goal: "responder status", customer_temperature: "existing_client", stage: "client_support", facts_known: ["três processos"], missing_information: [], objections: [], urgency: "none", decision_maker: "unknown", documents_requested: [], last_customer_message: "Márcio da Silva Machado", last_mayus_message: null, last_commitment: null, next_action: "responder status dos processos", has_mayus_introduced: true, conversation_summary: "pedido de status" },
          closing_readiness: { score: 0, status: "not_ready", reasons: [] },
          support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "status" },
          reasoning_summary_for_team: "corrigiu pergunta roteirizada e respondeu direto",
          actions_to_execute: [{ type: "answer_support", title: "Responder status", requires_approval: false }],
          requires_approval: false,
          should_auto_send: true,
          expected_outcome: "cliente entende status",
        }) } }] }),
      }) as any;

    const processStatusContext = {
      verified: true,
      confidence: "high" as const,
      accessScope: "tenant_authorized" as const,
      senderPhoneAuthorized: true,
      processTaskId: null,
      clientName: "Márcio da Silva Machado",
      processNumber: null,
      title: "Dossiê processual do cliente",
      currentStage: null,
      detectedPhase: "sem_fase_confiavel" as const,
      detectedPhaseLabel: null,
      lastMovementAt: null,
      lastMovementText: null,
      deadlineAt: null,
      pendingItems: [],
      nextStep: null,
      riskFlags: [],
      clientReply: null,
      candidateProcesses: [
        { processTaskId: "master", clientName: "Márcio", processNumber: "1", title: "Master", opposingParty: "Banco Master", summary: "gratuidade", currentStage: "Recurso", lastMovementAt: "2026-04-30" },
        { processTaskId: "bradesco", clientName: "Márcio", processNumber: "2", title: "Bradesco", opposingParty: "Bradesco", summary: "indenização", currentStage: "Conhecimento", lastMovementAt: "2026-06-21" },
        { processTaskId: "caixa", clientName: "Márcio", processNumber: "3", title: "Caixa", opposingParty: "Caixa", summary: "bancário", currentStage: "Conhecimento", lastMovementAt: "2023-06-10" },
      ],
      grounding: { factualSources: ["processos monitorados"], inferenceNotes: [], missingSignals: [] },
    };

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: { from: () => ({ insert: vi.fn(async () => ({ error: null })) }) } as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      messages: [{ direction: "inbound", content: "Márcio da Silva Machado" }],
      processStatusContext,
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(decision.risk_flags).not.toContain("scripted_process_followup_question");
    expect(decision.reply).not.toMatch(/quer.*resumo|prefere ver|quer que eu detalhe|qual desses|qual deles|quer acompanhar|se .*nao souber/i);
    expect(decision.reply_blocks).toHaveLength(3);
    expect(decision.should_auto_send).toBe(true);
  });

  it("bloqueia autoenvio quando cliente pergunta chance de ganhar mesmo com processo verificado", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "Maria, consigo te atualizar sobre o andamento, mas não posso prometer resultado. Para avaliar chance ou estratégia, vou deixar a equipe revisar com cuidado.",
              intent: "process_status",
              confidence: 0.9,
              risk_flags: [],
              next_action: "encaminhar pergunta de resultado para humano",
              conversation_state: {
                conversation_role: "case_status",
                conversation_goal: "responder sem promessa juridica",
                customer_temperature: "existing_client",
                stage: "client_support",
                facts_known: ["processo verificado", "cliente perguntou chance de ganhar"],
                missing_information: [],
                objections: [],
                urgency: "none",
                decision_maker: "unknown",
                documents_requested: [],
                last_customer_message: "Vou ganhar?",
                last_mayus_message: null,
                last_commitment: null,
                next_action: "encaminhar pergunta de resultado para humano",
                has_mayus_introduced: false,
                conversation_summary: "Cliente perguntou chance de ganhar.",
              },
              closing_readiness: { score: 0, status: "not_ready", reasons: ["suporte processual"] },
              support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "status verificado com pergunta de resultado" },
              reasoning_summary_for_team: "Pergunta sobre resultado exige humano.",
              actions_to_execute: [{ type: "recommend_handoff", title: "Encaminhar pergunta de resultado", requires_approval: true }],
              requires_approval: false,
              should_auto_send: true,
              expected_outcome: "humano avalia chance juridica",
            }),
          },
        }],
      }),
    })) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      messages: [{ direction: "inbound", content: "E aí, vou ganhar meu processo?" }],
      processStatusContext: {
        verified: true,
        confidence: "high",
        accessScope: "linked_contact",
        senderPhoneAuthorized: false,
        processTaskId: "process-1",
        clientName: "Maria Silva",
        processNumber: "1234567-89.2024.8.26.0100",
        title: "Maria x Banco",
        currentStage: "Réplica",
        detectedPhase: "replica",
        detectedPhaseLabel: "réplica",
        lastMovementAt: "2026-05-02",
        lastMovementText: "contestação juntada",
        deadlineAt: null,
        pendingItems: [],
        nextStep: "a equipe revisar a defesa da outra parte",
        riskFlags: [],
        clientReply: "Oi, Maria. Verifiquei aqui com segurança.",
        grounding: { factualSources: ["último andamento registrado", "etapa operacional do processo"], inferenceNotes: [], missingSignals: [] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.risk_flags).toContain("legal_result_risk");
    expect(decision.should_auto_send).toBe(false);
    expect(decision.requires_approval).toBe(true);
  });

  it("conduz conversa comercial multi-turn conectando documento, Credcesta e proxima pergunta", async () => {
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
                reply: "Entendi. Pelo que voce mandou, vamos tratar o Credcesta como o ponto central do desconto no contracheque, sem concluir nada antes de conferir a origem. Me diga uma coisa: esse desconto apareceu depois de algum cartao/emprestimo que voce lembra de ter autorizado ou surgiu sem explicacao?",
                intent: "legal_triage",
                confidence: 0.9,
                risk_flags: [],
                next_action: "qualificar autorizacao e origem do desconto Credcesta",
                conversation_state: {
                  conversation_role: "seller",
                  conversation_goal: "qualificar desconto Credcesta e avancar para analise comercial segura",
                  customer_temperature: "interested",
                  stage: "qualification",
                  facts_known: ["cliente enviou contracheque", "cliente apontou Credcesta como assunto"],
                  missing_information: ["autorizacao", "inicio do desconto"],
                  objections: [],
                  urgency: "none",
                  decision_maker: "unknown",
                  documents_requested: ["trecho do desconto Credcesta"],
                  last_customer_message: "O credcesta",
                  last_mayus_message: "Recebi o contracheque. Vou analisar a parte dos descontos com cuidado.",
                  last_commitment: "analisar descontos do contracheque",
                  next_action: "qualificar autorizacao e origem do desconto Credcesta",
                  has_mayus_introduced: true,
                  conversation_summary: "Cliente enviou contracheque e depois indicou Credcesta como ponto de duvida.",
                },
                closing_readiness: { score: 45, status: "warming", reasons: ["documento recebido", "dor especifica identificada"] },
                support_summary: { is_existing_client: false, issue_type: "documents", verified_case_reference: false, summary: "documento recebido para triagem comercial/juridica" },
                reasoning_summary_for_team: "A melhor jogada e conectar Credcesta ao contracheque recebido e qualificar autorizacao antes de prometer qualquer direito.",
                actions_to_execute: [
                  { type: "add_internal_note", title: "Registrar Credcesta como ponto central", requires_approval: false },
                ],
                requires_approval: false,
                should_auto_send: true,
                expected_outcome: "cliente informa se autorizou ou nao a origem do desconto",
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
      messages: [
        { direction: "inbound", content: "Posso mandar meu contracheque?" },
        { direction: "outbound", content: "Recebi o contracheque. Vou analisar a parte dos descontos com cuidado." },
        { direction: "inbound", content: "[Documento: contracheque.pdf]", message_type: "document", media_summary: "Contracheque com desconto Credcesta na folha" },
        { direction: "inbound", content: "O credcesta" },
      ],
      previousMayusEvent: { next_action: "analisar descontos do contracheque" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(prompt).toContain("Nao responda a mensagem isolada");
    expect(prompt).toContain("Sempre escolha primeiro o papel da conversa");
    expect(prompt).toContain("Como vendedor");
    expect(decision.conversation_state.conversation_role).toBe("seller");
    expect(decision.conversation_state.conversation_goal).toContain("Credcesta");
    expect(decision.reply).toContain("Credcesta");
    expect(decision.reply).toContain("contracheque");
    expect(decision.should_auto_send).toBe(true);
  });

  it("bloqueia autoenvio quando a resposta e generica e nao conduz suporte", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "Entendi. Como posso ajudar?",
              intent: "client_support",
              confidence: 0.92,
              risk_flags: [],
              next_action: "entender suporte",
              conversation_state: {
                conversation_role: "support",
                conversation_goal: "resolver problema de suporte sem perder contexto",
                customer_temperature: "irritated",
                stage: "client_support",
                facts_known: ["cliente esta irritado"],
                missing_information: ["problema especifico"],
                objections: [],
                urgency: "medium",
                decision_maker: "unknown",
                documents_requested: [],
                last_customer_message: "Ninguem me responde sobre meu atendimento",
                last_mayus_message: null,
                last_commitment: null,
                next_action: "entender suporte",
                has_mayus_introduced: false,
                conversation_summary: "Cliente reclama de falta de resposta.",
              },
              closing_readiness: { score: 20, status: "blocked", reasons: ["suporte exige resolucao"] },
              support_summary: { is_existing_client: true, issue_type: "support", verified_case_reference: false, summary: "cliente irritado com atendimento" },
              reasoning_summary_for_team: "Resposta generica demais para suporte.",
              actions_to_execute: [],
              requires_approval: false,
              should_auto_send: true,
              expected_outcome: "cliente explica problema",
            }),
          },
        }],
      }),
    })) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      messages: [{ direction: "inbound", content: "Ninguem me responde sobre meu atendimento" }],
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.conversation_state.conversation_role).toBe("support");
    expect(decision.should_auto_send).toBe(false);
    expect(decision.requires_approval).toBe(true);
    expect(decision.risk_flags).toEqual(expect.arrayContaining(["generic_reply_not_conversational"]));
  });

  it("permite autoenvio de resposta segura mesmo quando recomenda handoff interno", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "Entendo, Vitor. Se voce nao lembra de ter contratado, o melhor agora e separar se existe algum contrato, mensagem ou autorizacao vinculada ao Credcesta. Voce prefere procurar algum comprovante primeiro ou quer que eu organize uma conversa com um especialista para analisar isso com voce?",
              intent: "sales_qualification",
              confidence: 0.92,
              risk_flags: [],
              next_action: "oferecer investigacao ou agendamento com especialista",
              conversation_state: {
                conversation_role: "seller",
                conversation_goal: "qualificar desconto Credcesta e avancar atendimento comercial seguro",
                customer_temperature: "interested",
                stage: "discovery",
                facts_known: ["cliente nao lembra de contratar Credcesta"],
                missing_information: ["contrato ou autorizacao"],
                objections: [],
                urgency: "none",
                decision_maker: "unknown",
                documents_requested: ["contrato, mensagem ou autorizacao Credcesta"],
                last_customer_message: "Nao lembro",
                last_mayus_message: "Voce lembra se contratou algum cartao de beneficio ou emprestimo com eles?",
                last_commitment: null,
                next_action: "oferecer investigacao ou agendamento com especialista",
                has_mayus_introduced: true,
                conversation_summary: "Cliente nao lembra de contratar descontos Credcesta.",
              },
              closing_readiness: { score: 35, status: "not_ready", reasons: ["descoberta incompleta"] },
              support_summary: { is_existing_client: false, issue_type: "documents", verified_case_reference: false, summary: "documentos para triagem" },
              reasoning_summary_for_team: "Resposta segura conduz proximo passo sem promessa juridica; handoff e recomendacao interna, nao motivo para travar a mensagem.",
              actions_to_execute: [
                { type: "recommend_handoff", title: "Recomendar conversa com especialista", requires_approval: true },
                { type: "add_internal_note", title: "Registrar negativa de memoria sobre contratacao", requires_approval: false },
              ],
              requires_approval: true,
              should_auto_send: true,
              expected_outcome: "cliente escolhe procurar comprovante ou falar com especialista",
            }),
          },
        }],
      }),
    })) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      messages: [
        { direction: "outbound", content: "Voce lembra se contratou algum cartao de beneficio ou emprestimo com eles?" },
        { direction: "inbound", content: "Nao lembro" },
      ],
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.requires_approval).toBe(false);
    expect(decision.should_auto_send).toBe(true);
    expect(decision.actions_to_execute.find((action) => action.type === "recommend_handoff")?.requires_approval).toBe(true);
  });

  it("bloqueia autoenvio quando a resposta mistura outro idioma", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "Isso mesmo, Vitor. Mais de 5 anos paying consistently is significant. Are you worried about whether this was set up correctly?",
              intent: "legal_triage",
              confidence: 0.9,
              risk_flags: [],
              next_action: "corrigir idioma antes de enviar",
              conversation_state: {
                conversation_role: "seller",
                conversation_goal: "qualificar desconto Credcesta",
                customer_temperature: "interested",
                stage: "qualification",
                facts_known: ["cliente tem desconto Credcesta ha mais de 5 anos"],
                missing_information: ["contrato"],
                objections: [],
                urgency: "none",
                decision_maker: "unknown",
                documents_requested: ["contrato"],
                last_customer_message: "Ja tem mais de 5 anos",
                last_mayus_message: "Desde quando aparece?",
                last_commitment: null,
                next_action: "corrigir idioma antes de enviar",
                has_mayus_introduced: true,
                conversation_summary: "Cliente enviou contracheque Credcesta.",
              },
              closing_readiness: { score: 45, status: "warming", reasons: ["contexto claro"] },
              support_summary: { is_existing_client: false, issue_type: "documents", verified_case_reference: false, summary: "triagem de desconto" },
              reasoning_summary_for_team: "Resposta vazou idioma estrangeiro e nao deve ser enviada.",
              actions_to_execute: [{ type: "add_internal_note", title: "Bloquear resposta com idioma estrangeiro", requires_approval: false }],
              requires_approval: false,
              should_auto_send: true,
              expected_outcome: "regenerar em portugues",
            }),
          },
        }],
      }),
    })) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      messages: [{ direction: "inbound", content: "Ja tem mais de 5 anos" }],
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.should_auto_send).toBe(false);
    expect(decision.requires_approval).toBe(true);
    expect(decision.risk_flags).toEqual(expect.arrayContaining(["foreign_language_leak"]));
  });

  it("bloqueia pergunta que ignora pagamento ja evidente no contracheque", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "Entendi. Esse desconto ainda esta ativo e voce ainda esta pagando esse emprestimo?",
              intent: "legal_triage",
              confidence: 0.88,
              risk_flags: [],
              next_action: "perguntar status de pagamento",
              conversation_state: {
                conversation_role: "seller",
                conversation_goal: "qualificar desconto RMC/Credcesta",
                customer_temperature: "irritated",
                stage: "qualification",
                facts_known: ["cliente enviou contracheque", "cliente disse que desconta do contracheque"],
                missing_information: ["contrato"],
                objections: ["pergunta repetida"],
                urgency: "none",
                decision_maker: "unknown",
                documents_requested: ["contrato"],
                last_customer_message: "Se te mandei o contracheque e pq ainda estou pagando ne",
                last_mayus_message: "Voce ainda esta pagando?",
                last_commitment: null,
                next_action: "perguntar status de pagamento",
                has_mayus_introduced: true,
                conversation_summary: "Cliente enviou contracheque com desconto Credcesta e disse que ainda desconta em folha.",
              },
              closing_readiness: { score: 45, status: "warming", reasons: ["documento recebido"] },
              support_summary: { is_existing_client: false, issue_type: "documents", verified_case_reference: false, summary: "triagem de desconto" },
              reasoning_summary_for_team: "A pergunta repete algo ja evidente no contexto.",
              actions_to_execute: [{ type: "add_internal_note", title: "Corrigir pergunta repetida", requires_approval: false }],
              requires_approval: false,
              should_auto_send: true,
              expected_outcome: "regenerar sem pergunta obvia",
            }),
          },
        }],
      }),
    })) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      messages: [
        { direction: "inbound", content: "[Documento: contracheque.pdf]", message_type: "document", media_summary: "Contracheque com desconto Credcesta ativo" },
        { direction: "inbound", content: "Se te mandei o contracheque e pq ainda estou pagando ne" },
      ],
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.should_auto_send).toBe(false);
    expect(decision.requires_approval).toBe(true);
    expect(decision.risk_flags).toEqual(expect.arrayContaining(["asks_already_known_payment_status"]));
  });

  it("regenera resposta invalida e permite autoenvio quando o reparo fica seguro", async () => {
    const inserts: any[] = [];
    const supabase: any = {
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: any) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    };
    const invalidPayload = {
      reply: "Isso mesmo, Vitor. Mais de 5 anos paying consistently is significant. Are you worried about whether this was set up correctly?",
      intent: "legal_triage",
      confidence: 0.9,
      risk_flags: [],
      next_action: "corrigir idioma antes de enviar",
      conversation_state: {
        conversation_role: "seller",
        conversation_goal: "qualificar desconto Credcesta",
        customer_temperature: "interested",
        stage: "qualification",
        facts_known: ["cliente tem desconto Credcesta ha mais de 5 anos"],
        missing_information: ["contrato"],
        objections: [],
        urgency: "none",
        decision_maker: "unknown",
        documents_requested: ["contrato"],
        last_customer_message: "Ja tem mais de 5 anos",
        last_mayus_message: "Desde quando aparece?",
        last_commitment: null,
        next_action: "corrigir idioma antes de enviar",
        has_mayus_introduced: true,
        conversation_summary: "Cliente enviou contracheque Credcesta.",
      },
      closing_readiness: { score: 45, status: "warming", reasons: ["contexto claro"] },
      support_summary: { is_existing_client: false, issue_type: "documents", verified_case_reference: false, summary: "triagem de desconto" },
      reasoning_summary_for_team: "Resposta vazou idioma estrangeiro e precisa reparo.",
      actions_to_execute: [{ type: "add_internal_note", title: "Registrar reparo de idioma", requires_approval: false }],
      requires_approval: false,
      should_auto_send: true,
      expected_outcome: "regenerar em portugues",
    };
    const repairedPayload = {
      ...invalidPayload,
      reply: "Entendi, Vitor. Mais de 5 anos de desconto no contracheque e muita coisa, entao nao vou te orientar a parar sem uma analise. O proximo passo seguro e conferir contrato, autorizacao e valor liberado; voce tem algum contrato ou comprovante da Credcesta guardado?",
      next_action: "pedir contrato ou comprovante Credcesta",
      reasoning_summary_for_team: "Resposta reparada em portugues, conectando RMC/Credcesta ao contracheque sem promessa juridica.",
      expected_outcome: "cliente envia contrato ou comprovante",
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(invalidPayload) } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(repairedPayload) } }] }),
      }) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase,
      tenantId: "tenant-1",
      channel: "whatsapp",
      messages: [
        { direction: "inbound", content: "[Documento: contracheque.pdf]", message_type: "document", media_summary: "Contracheque com desconto Credcesta ativo" },
        { direction: "inbound", content: "Ja tem mais de 5 anos" },
      ],
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(decision.reply).toContain("Mais de 5 anos de desconto");
    expect(decision.risk_flags).not.toContain("foreign_language_leak");
    expect(decision.should_auto_send).toBe(true);
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "system_event_logs",
      payload: expect.objectContaining({
        event_name: "mayus_operating_partner_reply_repaired",
        status: "ok",
        payload: expect.objectContaining({
          original_risk_flags: expect.arrayContaining(["foreign_language_leak"]),
          repaired_should_auto_send: true,
        }),
      }),
    }));
  });

  it("mantem decisao invalida e audita falha quando reparo quebra", async () => {
    const inserts: any[] = [];
    const supabase: any = {
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: any) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    };
    const invalidPayload = {
      reply: "Isso mesmo, Vitor. Mais de 5 anos paying consistently is significant.",
      intent: "legal_triage",
      confidence: 0.9,
      risk_flags: [],
      next_action: "corrigir idioma antes de enviar",
      conversation_state: {
        conversation_role: "seller",
        conversation_goal: "qualificar desconto Credcesta",
        customer_temperature: "interested",
        stage: "qualification",
        facts_known: ["cliente tem desconto Credcesta ha mais de 5 anos"],
        missing_information: ["contrato"],
        objections: [],
        urgency: "none",
        decision_maker: "unknown",
        documents_requested: ["contrato"],
        last_customer_message: "Ja tem mais de 5 anos",
        last_mayus_message: "Desde quando aparece?",
        last_commitment: null,
        next_action: "corrigir idioma antes de enviar",
        has_mayus_introduced: true,
        conversation_summary: "Cliente enviou contracheque Credcesta.",
      },
      closing_readiness: { score: 45, status: "warming", reasons: ["contexto claro"] },
      support_summary: { is_existing_client: false, issue_type: "documents", verified_case_reference: false, summary: "triagem de desconto" },
      reasoning_summary_for_team: "Resposta vazou idioma estrangeiro e precisa reparo.",
      actions_to_execute: [{ type: "add_internal_note", title: "Registrar reparo de idioma", requires_approval: false }],
      requires_approval: false,
      should_auto_send: true,
      expected_outcome: "regenerar em portugues",
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(invalidPayload) } }] }),
      })
      .mockRejectedValueOnce(new Error("repair provider timeout")) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase,
      tenantId: "tenant-1",
      channel: "whatsapp",
      messages: [{ direction: "inbound", content: "Ja tem mais de 5 anos" }],
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(decision.should_auto_send).toBe(false);
    expect(decision.risk_flags).toEqual(expect.arrayContaining(["foreign_language_leak"]));
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "system_event_logs",
      payload: expect.objectContaining({
        event_name: "mayus_operating_partner_reply_repaired",
        status: "error",
        payload: expect.objectContaining({
          error: expect.stringContaining("repair provider timeout"),
        }),
      }),
    }));
  });
});
