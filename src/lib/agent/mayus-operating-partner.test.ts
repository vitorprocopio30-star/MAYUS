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
    getLLMClientMock.mockImplementation(async (_supabase, _tenantId, _useCase, options) => ({
      provider: "openrouter",
      model: options?.modelOverride || "openai/gpt-5.4-nano",
      endpoint: "https://openrouter.test/chat/completions",
      apiKey: "openrouter-key",
      extraHeaders: {},
    }));
    buildHeadersMock.mockReturnValue({
      Authorization: "Bearer openrouter-key",
      "Content-Type": "application/json",
    });
  });

  function operatingPartnerPayload(overrides: Record<string, any> = {}) {
    const conversationState = {
      conversation_role: "support",
      conversation_goal: "atender no WhatsApp com naturalidade e seguranca",
      customer_temperature: "existing_client",
      stage: "client_support",
      facts_known: [],
      missing_information: [],
      objections: [],
      urgency: "none",
      decision_maker: "unknown",
      documents_requested: [],
      last_customer_message: "",
      last_mayus_message: null,
      last_commitment: null,
      next_action: "responder com seguranca",
      has_mayus_introduced: true,
      conversation_summary: "Atendimento em andamento.",
      ...(overrides.conversation_state || {}),
    };

    return {
      reply: "Oi, tudo bem? Como posso ajudar?",
      intent: "client_support",
      confidence: 0.9,
      risk_flags: [],
      next_action: conversationState.next_action,
      closing_readiness: { score: 0, status: "not_ready", reasons: [] },
      support_summary: { is_existing_client: true, issue_type: "support", verified_case_reference: false, summary: "atendimento" },
      reasoning_summary_for_team: "Resposta natural gerada com contexto do Conversation Brain.",
      actions_to_execute: [],
      requires_approval: false,
      should_auto_send: true,
      expected_outcome: "avancar a conversa sem inventar informacao",
      ...overrides,
      conversation_state: {
        ...conversationState,
        ...(overrides.conversation_state || {}),
      },
    };
  }

  function operatingPartnerFetcher(payload: Record<string, any>) {
    return vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify(operatingPartnerPayload(payload)),
          },
        }],
      }),
    })) as any;
  }

  it("normaliza a configuracao do Operating Partner com autonomia alta supervisionada", () => {
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
    expect(decision.conversation_classification).toEqual(expect.objectContaining({
      class: "commercial",
      surface: "external_message",
      owner: "MAYUS Operating Partner",
    }));
    expect(decision.agentic_governance).toEqual(expect.objectContaining({
      paperclip_mission: expect.objectContaining({
        mission: "whatsapp_conversation",
        owner: "MAYUS Operating Partner",
        next_action: "qualificar dor do desconto",
      }),
      openclaw_policy: expect.objectContaining({
        surface: "external_message",
        outcome: "allowed",
        can_execute_now: true,
      }),
      hermes_trajectory: expect.objectContaining({
        tenant_learning_scope: "tenant_only",
        events: expect.any(Array),
      }),
    }));
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
        permissionPolicy: "socio aprova contrato, cobranca e envio externo",
        calendarPolicy: "confirmar consulta externa so com humano",
        financePolicy: "cobrancas e renegociacoes ficam supervisionadas",
        operationalMethodologyStatus: "approved",
        operationalMethodologySummary: "status approved | areas bancario, previdenciario | fases Triagem > Coleta documental > Analise juridica humana | internet apenas auditavel",
        playbookNotes: "roteiro consultivo curto com proximo passo claro",
        practiceAreaPlaybooks: [{
          area: "bancario",
          intake_questions: ["qual desconto aparece no documento?"],
          required_documents: ["contracheque"],
          handoff_triggers: ["contrato exige humano"],
          default_pipeline: ["Triagem do desconto/contrato", "Coleta documental", "Analise juridica humana"],
          document_structure: ["00-bancario-intake-e-resumo"],
          owner_team: "Juridico",
          validation_status: "needs_area_review",
          next_review_question: "Validar playbook bancario?",
        }],
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
    expect(prompt).toContain("socio aprova contrato");
    expect(prompt).toContain("Metodologia operacional");
    expect(prompt).toContain("status approved");
    expect(prompt).toContain("Status da metodologia operacional: approved");
    expect(prompt).toContain("roteiro consultivo curto");
    expect(prompt).toContain("Playbooks por area juridica");
    expect(prompt).toContain("Triagem do desconto/contrato");
    expect(prompt).toContain("Se faltar configuracao do escritorio");
    expect(decision.conversation_state.stage).toBe("objection");
    expect(decision.reply).not.toContain("Aqui e o MAYUS");
    expect(decision.reasoning_summary_for_team).toContain("objecao");
  });

  it("injeta bloco de memoria institucional aprovada no prompt quando passada", async () => {
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
                reply: "Sigo apenas dentro da politica do escritorio.",
                intent: "client_support",
                confidence: 0.8,
                risk_flags: [],
                next_action: "responder dentro da politica",
                conversation_state: {
                  conversation_role: "support",
                  conversation_goal: "responder dentro da politica",
                  customer_temperature: "interested",
                  stage: "client_support",
                  facts_known: [],
                  missing_information: [],
                  objections: [],
                  urgency: "none",
                  decision_maker: "unknown",
                  documents_requested: [],
                  last_customer_message: "ola",
                  last_mayus_message: null,
                  last_commitment: null,
                  next_action: "responder dentro da politica",
                  has_mayus_introduced: true,
                  conversation_summary: "saudacao",
                },
                closing_readiness: { score: 20, status: "not_ready", reasons: ["sem demanda"] },
                support_summary: { is_existing_client: false, issue_type: "none", verified_case_reference: false, summary: "sem suporte" },
                reasoning_summary_for_team: "memoria institucional aplicada",
                actions_to_execute: [],
                requires_approval: false,
                should_auto_send: true,
                expected_outcome: "ok",
              }),
            },
          }],
        }),
      };
    }) as any;

    await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Cliente",
      phoneNumber: "5511999999999",
      messages: [{ direction: "inbound", content: "Estou avaliando uma proposta de honorarios mas tenho duvida se o valor cobre o caso." }],
      institutionalMemory: [
        {
          id: "m1",
          key: "tom",
          text: "Atender sempre com tom cordial e curto.",
          category: "atendimento",
          source: "office_institutional_memory",
          sourceLabel: null,
          confidence: null,
        },
        {
          id: "m2",
          key: "promessa_proibida",
          text: "Nunca prometer vitoria juridica.",
          category: "compliance",
          source: "brain_memory_promoted",
          sourceLabel: "office_setup",
          confidence: 0.95,
        },
        {
          id: "m3",
          key: "self_improvement:correction_failed_operating_partner_reply_repair_timeout",
          text: "Quando a auto-correcao operating_partner_reply_repair falhar por timeout, bloquear autoenvio e pedir revisao humana.",
          category: "compliance",
          source: "brain_memory_promoted",
          sourceLabel: "MAYUS detectou padrao",
          confidence: 0.6,
        },
      ],
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(prompt).toContain("Memoria institucional aprovada");
    expect(prompt).toContain("[ATENDIMENTO]");
    expect(prompt).toContain("[COMPLIANCE]");
    expect(prompt).toContain("Atender sempre com tom cordial");
    expect(prompt).toContain("promessa_proibida (office_setup): Nunca prometer vitoria juridica.");
    expect(prompt).toContain("self_improvement:correction_failed_operating_partner_reply_repair_timeout (MAYUS detectou padrao)");
    expect(prompt).toContain("bloquear autoenvio e pedir revisao humana");
  });

  it("nao adiciona bloco de memoria institucional quando lista estiver vazia ou ausente", async () => {
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
                reply: "Ok.",
                intent: "client_support",
                confidence: 0.7,
                risk_flags: [],
                next_action: "responder",
                conversation_state: {
                  conversation_role: "support",
                  conversation_goal: "responder",
                  customer_temperature: "interested",
                  stage: "client_support",
                  facts_known: [],
                  missing_information: [],
                  objections: [],
                  urgency: "none",
                  decision_maker: "unknown",
                  documents_requested: [],
                  last_customer_message: "ola",
                  last_mayus_message: null,
                  last_commitment: null,
                  next_action: "responder",
                  has_mayus_introduced: true,
                  conversation_summary: "saudacao",
                },
                closing_readiness: { score: 20, status: "not_ready", reasons: [] },
                support_summary: { is_existing_client: false, issue_type: "none", verified_case_reference: false, summary: "sem suporte" },
                reasoning_summary_for_team: "ok",
                actions_to_execute: [],
                requires_approval: false,
                should_auto_send: true,
                expected_outcome: "ok",
              }),
            },
          }],
        }),
      };
    }) as any;

    await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Cliente",
      phoneNumber: "5511999999999",
      messages: [{ direction: "inbound", content: "Estou pensando em fechar mas preciso entender o escopo de honorarios e prazo." }],
      institutionalMemory: [],
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(prompt).not.toContain("Memoria institucional aprovada");
    expect(prompt.length).toBeGreaterThan(0);
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
    expect(decision.conversation_classification).toEqual(expect.objectContaining({
      class: "process_status",
      surface: "support_response",
    }));
    expect(decision.agentic_governance?.openclaw_policy).toEqual(expect.objectContaining({
      surface: "support_response",
      outcome: "allowed",
      can_execute_now: true,
    }));
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
    expect(decision.reply).toContain("me adianta em poucas palavras");
    expect(decision.reply).not.toMatch(/Aqui é a Maya|assistente do Dutra/i);
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
              reply: "Boa noite, Vitor. Como posso ajudar?",
              intent: "client_support",
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

    expect(fetcher).not.toHaveBeenCalled();
    expect(getLLMClientMock).not.toHaveBeenCalled();
    expect(decision.reply).toBe("Boa noite, Vitor. Como posso ajudar?");
    expect(decision.reply).not.toMatch(/cnj|processo|nome completo/i);
    expect(decision.conversation_state.last_process_candidates).toBeUndefined();
    expect(decision.conversation_frame?.resolution_type).toBe("greeting");
    expect(decision.conversation_frame?.llm_writer_allowed).toBe(false);
    expect(decision.quality_check).toEqual({ status: "pass", flags: [], reasons: [] });
    expect(decision.final_response_source).toBe("deterministic_guardrail");
  });

  it("responde saudacao pura sem depender de evento anterior", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Boa noite, Vitor Procópio. Como posso ajudar?",
      intent: "client_support",
      next_action: "perguntar como ajudar sem retomar processo antigo",
      conversation_state: {
        last_customer_message: "Boa noite",
        next_action: "perguntar como ajudar sem retomar processo antigo",
        conversation_summary: "Saudacao pura.",
      },
    });

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
    expect(getLLMClientMock).not.toHaveBeenCalled();
    expect(decision.reply).toBe("Boa noite, Vitor Procópio. Como posso ajudar?");
    expect(decision.conversation_frame?.resolution_type).toBe("greeting");
    expect(decision.conversation_frame?.llm_writer_allowed).toBe(false);
    expect(decision.final_response_source).toBe("deterministic_guardrail");
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

    expect(decision.reply).toBe("Boa noite, Vitor Procópio. Como posso ajudar?");
    expect(decision.reply).not.toContain("assistente do MAYUS");
    expect(fetcher).not.toHaveBeenCalled();
    expect(getLLMClientMock).not.toHaveBeenCalled();
  });

  it("nao reutiliza nome antigo quando pedido de processo e generico", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "Claro. Para eu localizar com segurança, me mande o nome completo do cliente ou o número do processo.",
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

    expect(decision.reply).toContain("nome completo do cliente");
    expect(decision.reply).toContain("processo");
    expect(decision.reply).not.toContain("Márcio");
    expect(decision.should_auto_send).toBe(true);
    expect(decision.requires_approval).toBe(false);
  });

  it("pedido generico de um processo sem contexto pede identificador sem roteiro nem contexto antigo", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Claro. Para eu localizar com segurança, me confirme seu nome completo ou o número do processo.",
      intent: "process_status",
      next_action: "pedir identificador minimo",
      conversation_state: {
        conversation_role: "case_status",
        conversation_goal: "localizar processo com identificador minimo",
        last_customer_message: "Gostaria de saber sobre um processo",
        next_action: "pedir identificador minimo",
        conversation_summary: "Pedido generico de processo sem referencia atual.",
      },
      support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: false, summary: "sem identificador" },
    });

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

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(decision.reply).toBe("Claro. Para eu localizar com segurança, me mande o número do processo/CNJ ou CPF.");
    expect(decision.reply).not.toMatch(/M[áa]rcio|tema|assunto|banco|RMC|benef[ií]cio|execu[cç][aã]o|fam[ií]lia/i);
    expect(decision.should_auto_send).toBe(true);
    expect(decision.requires_approval).toBe(false);
    expect(decision.conversation_frame?.resolution_type).toBe("generic_process_request");
  });

  it("depois de saudacao limpa, pedido generico de operador nao reutiliza Michele", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Claro. Para eu localizar com seguranca, me mande o nome completo do cliente ou o numero do processo.",
      intent: "process_status",
      next_action: "pedir nome completo ou numero do processo",
      conversation_state: {
        conversation_role: "case_status",
        conversation_goal: "pedir identificador minimo",
        last_customer_message: "GOSTARIA DE SABER SOBRE UM PROCESSO",
        next_action: "pedir nome completo ou numero do processo",
        conversation_summary: "Pedido generico sem identificador atual.",
      },
      support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: false, summary: "sem identificador" },
    });

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Quero saber do processo Michele Cristina Pinto Foppolos Santos", created_at: "2026-05-07T20:50:00.000Z" },
        { direction: "outbound", content: "Localizei o processo da Michele Cristina Pinto Foppolos Santos.", created_at: "2026-05-07T20:51:00.000Z" },
        { direction: "inbound", content: "BOA NOITE MAYUS", created_at: "2026-05-07T22:21:00.000Z" },
        { direction: "outbound", content: "Boa noite, Vitor. Como posso ajudar?", created_at: "2026-05-07T22:22:00.000Z" },
        { direction: "inbound", content: "GOSTARIA DE SABER SOBRE UM PROCESSO", created_at: "2026-05-07T22:23:00.000Z" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      previousMayusEvent: {
        created_at: new Date().toISOString(),
        intent: "process_status",
        next_action: "responder Michele",
        conversation_state: {
          conversation_role: "case_status",
          conversation_goal: "processo antigo da Michele",
          customer_temperature: "existing_client",
          stage: "client_support",
          facts_known: ["processo antigo da Michele"],
          missing_information: [],
          objections: [],
          urgency: "none",
          decision_maker: "unknown",
          documents_requested: [],
          last_customer_message: "Quero saber do processo Michele Cristina Pinto Foppolos Santos",
          last_mayus_message: "Localizei o processo da Michele Cristina Pinto Foppolos Santos.",
          last_commitment: null,
          next_action: "responder Michele",
          has_mayus_introduced: true,
          conversation_summary: "Contexto antigo de Michele.",
          last_process_candidates: [
            { processTaskId: "process-michele", clientName: "Michele Cristina Pinto Foppolos Santos", processNumber: "3002575-03.2026.8.19.0000", title: "Michele x Banco", opposingParty: "Banco", summary: "acompanhamento", currentStage: "Acompanhamento", lastMovementAt: "2026-05-25", lastMovementText: "Publicado despacho" },
          ],
        },
      },
      processStatusContext: { verified: false, confidence: "low", accessScope: "tenant_authorized", senderPhoneAuthorized: true, processTaskId: null, clientName: null, processNumber: null, title: null, currentStage: null, detectedPhase: "sem_fase_confiavel", detectedPhaseLabel: null, lastMovementAt: null, lastMovementText: null, deadlineAt: null, pendingItems: [], nextStep: null, riskFlags: ["case_status_unverified"], clientReply: null, grounding: { factualSources: [], inferenceNotes: [], missingSignals: ["authorized_process_access_needs_reference"] } },
      officeKnowledgeProfile: { assistantName: "Maya", officeName: "Dutra" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(decision.reply).toContain("nome completo do cliente");
    expect(decision.reply).toContain("processo");
    expect(decision.reply).not.toMatch(/Michele|banco|tema|saude|RMC|danos morais/i);
    expect(decision.conversation_frame?.resolution_type).toBe("generic_process_request");
    expect(decision.conversation_frame?.llm_writer_allowed).toBe(false);
    expect(decision.final_response_source).not.toBe("llm_natural");
    expect(decision.should_auto_send).toBe(true);
  });

  it("responde cobranca curta de status com LLM guiado pelo frame", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Estou localizando com segurança. Me manda o número do processo/CNJ ou o nome completo para eu conferir certinho.",
      intent: "process_status",
      next_action: "pedir identificador minimo",
      conversation_state: {
        conversation_role: "case_status",
        conversation_goal: "localizar processo com identificador minimo",
        last_customer_message: "Cadê?",
        next_action: "pedir identificador minimo",
        conversation_summary: "Cliente cobrou retorno depois de pedido generico de processo.",
      },
      support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: false, summary: "sem identificador" },
    });

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

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(decision.reply).toContain("Estou localizando com segurança");
    expect(decision.reply).toContain("número do processo/CNJ");
    expect(decision.reply).not.toMatch(/tema|assunto|banco|rmc/i);
    expect(decision.should_auto_send).toBe(true);
  });

  it("pede CNJ ou documento quando nome completo nao localiza processo", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Não localizei com segurança por esse nome. Me manda o número do processo/CNJ ou CPF/CNPJ para eu conferir na base.",
      intent: "process_status",
      next_action: "pedir identificador adicional",
      conversation_state: {
        conversation_role: "case_status",
        conversation_goal: "localizar processo sem inventar status",
        last_customer_message: "Márcio da Silva Machado",
        next_action: "pedir identificador adicional",
        conversation_summary: "Nome informado nao localizou processo com seguranca.",
      },
      support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: false, summary: "nome sem match confiavel" },
    });

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

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(decision.reply).toContain("Não localizei com segurança");
    expect(decision.reply).toMatch(/processo\/CNJ|CPF\/CNPJ/);
    expect(decision.reply).not.toMatch(/tema|assunto|banco|rmc/i);
    expect(decision.should_auto_send).toBe(true);
    expect(decision.requires_approval).toBe(false);
  });

  it("lista processos encontrados em vez de dizer que nao localizou quando ha mais de um candidato", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Achei mais de um processo para Márcio da Silva Machado: 3333333-33.2024.8.26.0100, em réplica, e 4444444-44.2024.8.26.0100, em conhecimento. Qual deles você quer que eu detalhe primeiro?",
      intent: "process_status",
      next_action: "pedir escolha entre candidatos encontrados",
      conversation_state: {
        conversation_role: "case_status",
        conversation_goal: "desambiguar processos encontrados",
        last_customer_message: "Márcio da Silva Machado",
        next_action: "pedir escolha entre candidatos encontrados",
        conversation_summary: "Mais de um processo encontrado para o cliente.",
      },
      support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: false, summary: "mais de um candidato" },
    });

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

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(decision.reply).toContain("Achei mais de um processo para Márcio da Silva Machado");
    expect(decision.reply).toContain("3333333-33.2024.8.26.0100");
    expect(decision.reply).toContain("4444444-44.2024.8.26.0100");
    expect(decision.reply).not.toContain("Não localizei");
  });

  it("responde oi mayus sem puxar contexto antigo ou se reapresentar", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Vitor, entendi: banco master é qual desses dois? Márcio contra o Banco Bradesco ou contra a Caixa?",
      intent: "process_status",
      next_action: "perguntar qual processo antigo",
      conversation_state: {
        last_customer_message: "Oi mayus",
        next_action: "perguntar qual processo antigo",
        conversation_summary: "Operador interno apenas saudou o MAYUS.",
      },
    });

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "E as custas?" },
        { direction: "outbound", content: "Não vi confirmação de custas na base. Deixei como ponto de conferência." },
        { direction: "inbound", content: "Oi mayus" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      processStatusContext: {
        verified: true,
        confidence: "medium",
        accessScope: "tenant_authorized",
        senderPhoneAuthorized: true,
        processTaskId: "process-1",
        clientName: "Maria Silva",
        processNumber: "1234567-89.2024.8.26.0100",
        title: "Maria x Banco",
        currentStage: "Recurso",
        detectedPhase: "recurso",
        detectedPhaseLabel: "recurso",
        lastMovementAt: "2026-05-20",
        lastMovementText: "Intimacao sobre custas/preparo",
        deadlineAt: null,
        pendingItems: ["confirmar custas/preparo"],
        nextStep: "conferir custas/preparo",
        riskFlags: [],
        clientReply: null,
        grounding: { factualSources: ["processo monitorado"], inferenceNotes: [], missingSignals: ["confirmacao de custas/preparo"] },
      },
      officeKnowledgeProfile: { assistantName: "Maya", officeName: "Dutra Advocacia" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(getLLMClientMock).not.toHaveBeenCalled();
    expect(decision.reply).toBe("Oi, Vitor, tudo bem? Como posso ajudar?");
    expect(decision.reply).not.toMatch(/custas|processo|Maya|assistente|Dutra/i);
    expect(decision.conversation_state.last_process_candidates).toBeUndefined();
    expect(decision.next_action).toBe("aguardar o assunto atual do interlocutor");
    expect(decision.requires_approval).toBe(false);
    expect(decision.conversation_frame?.resolution_type).toBe("greeting");
    expect(decision.conversation_frame?.llm_writer_allowed).toBe(false);
    expect(decision.quality_check).toEqual({ status: "pass", flags: [], reasons: [] });
    expect(decision.final_response_source).toBe("deterministic_guardrail");
  });

  it("ignora Michele/processo antigo quando o turno atual e saudacao pura em caixa alta", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Boa noite, Vitor. Sobre a Michele, preciso saber qual banco/tema do processo.",
      intent: "process_status",
      next_action: "perguntar banco ou tema",
      conversation_state: {
        conversation_role: "case_status",
        conversation_goal: "retomar processo antigo",
        last_customer_message: "BOA NOITE MAYUS",
        next_action: "perguntar banco ou tema",
        conversation_summary: "Resposta ruim com contexto antigo.",
      },
    });

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [{ direction: "inbound", content: "BOA NOITE MAYUS" }],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      previousMayusEvent: {
        created_at: new Date().toISOString(),
        intent: "process_status",
        next_action: "perguntar qual processo",
        conversation_state: {
          conversation_role: "case_status",
          conversation_goal: "retomar processo antigo",
          customer_temperature: "existing_client",
          stage: "client_support",
          facts_known: ["processos encontrados"],
          missing_information: [],
          objections: [],
          urgency: "none",
          decision_maker: "unknown",
          documents_requested: [],
          last_customer_message: "Quero saber do processo Michele Cristina Pinto Foppolos Santos",
          last_mayus_message: "Localizei Michele x Banco.",
          last_commitment: null,
          next_action: "perguntar qual processo",
          has_mayus_introduced: true,
          conversation_summary: "Contexto antigo de processos.",
          last_process_candidates: [
            { processTaskId: "process-michele", clientName: "Michele Cristina Pinto Foppolos Santos", processNumber: "3002575-03.2026.8.19.0000", title: "Michele x Banco", opposingParty: "Banco", summary: "acompanhamento", currentStage: "Acompanhamento", lastMovementAt: "2026-05-25", lastMovementText: "Publicado despacho" },
          ],
        },
      },
      processStatusContext: {
        verified: true,
        confidence: "high",
        accessScope: "tenant_authorized",
        senderPhoneAuthorized: true,
        processTaskId: "process-michele",
        clientName: "Michele Cristina Pinto Foppolos Santos",
        processNumber: "3002575-03.2026.8.19.0000",
        title: "Michele x Banco",
        currentStage: "Acompanhamento",
        detectedPhase: "sem_fase_confiavel",
        detectedPhaseLabel: null,
        lastMovementAt: "2026-05-25",
        lastMovementText: "Publicado despacho",
        deadlineAt: null,
        pendingItems: [],
        nextStep: "conferir despacho",
        riskFlags: [],
        clientReply: null,
        candidateProcesses: [
          { processTaskId: "process-michele", clientName: "Michele Cristina Pinto Foppolos Santos", processNumber: "3002575-03.2026.8.19.0000", title: "Michele x Banco", opposingParty: "Banco", summary: "acompanhamento", currentStage: "Acompanhamento", lastMovementAt: "2026-05-25", lastMovementText: "Publicado despacho" },
        ],
        grounding: { factualSources: ["processo monitorado"], inferenceNotes: [], missingSignals: [] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(getLLMClientMock).not.toHaveBeenCalled();
    expect(decision.reply).toBe("Boa noite, Vitor. Como posso ajudar?");
    expect(decision.reply).not.toMatch(/Michele|processo|banco|tema|assistente/i);
    expect(decision.conversation_state.last_process_candidates).toBeUndefined();
    expect(decision.conversation_frame?.candidate_summaries).toEqual([]);
    expect(decision.conversation_frame?.resolution_type).toBe("greeting");
    expect(decision.conversation_frame?.llm_writer_allowed).toBe(false);
    expect(decision.quality_check).toEqual({ status: "pass", flags: [], reasons: [] });
    expect(decision.final_response_source).toBe("deterministic_guardrail");
  });

  it("reconhece reclamacao sem repetir contexto antigo ou alternativas erradas", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Vitor, entendi sua situação. Pra eu localizar com segurança: no banco master é Bradesco (TJRJ) ou Caixa (TRF2)?",
      intent: "process_status",
      next_action: "perguntar qual processo antigo",
      conversation_state: {
        last_customer_message: "Que merda hein",
        next_action: "perguntar qual processo antigo",
        conversation_summary: "Operador reclamou de resposta ruim.",
      },
    });

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Oi mayus" },
        { direction: "outbound", content: "Vitor, entendi: banco master é qual desses dois? Márcio contra o Banco Bradesco (TJRJ) ou contra a Caixa (TRF2)?" },
        { direction: "inbound", content: "Que merda hein" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      officeKnowledgeProfile: { assistantName: "Maya", officeName: "Dutra Advocacia" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.reply).toContain("você tem razão");
    expect(decision.reply).toContain("me confundi");
    expect(decision.reply).not.toMatch(/Bradesco|Caixa|Banco Master|TJRJ|TRF2|qual desses/i);
    expect(decision.conversation_frame?.resolution_type).toBe("complaint");
    expect(decision.final_response_source).toBe("deterministic_guardrail");
    expect(decision.should_auto_send).toBe(true);
  });

  it("remove reapresentacao robotica quando operador envia nome do cliente", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "Oi, Vitor! Aqui é a Maya, assistente do Dutra Advocacia. Localizei o processo do cliente Marcio contra o Banco Bradesco. Ele está em fase de conhecimento e sem prazo crítico na base.",
              intent: "process_status",
              confidence: 0.91,
              risk_flags: [],
              next_action: "responder processo localizado",
              conversation_state: {
                conversation_role: "case_status",
                conversation_goal: "responder status processual para operador interno",
                customer_temperature: "existing_client",
                stage: "client_support",
                facts_known: ["operador informou nome do cliente", "processo verificado"],
                missing_information: [],
                objections: [],
                urgency: "none",
                decision_maker: "unknown",
                documents_requested: [],
                last_customer_message: "Marcio da Silva Machado",
                last_mayus_message: "Claro. Para eu localizar com segurança, me mande o nome completo do cliente ou o número do processo.",
                last_commitment: null,
                next_action: "responder processo localizado",
                has_mayus_introduced: true,
                conversation_summary: "Operador interno pediu processo por nome.",
              },
              closing_readiness: { score: 0, status: "not_ready", reasons: [] },
              support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "status processual" },
              reasoning_summary_for_team: "Processo verificado para operador autorizado.",
              actions_to_execute: [{ type: "answer_support", title: "Responder status processual", requires_approval: false }],
              requires_approval: false,
              should_auto_send: true,
              expected_outcome: "operador entende status",
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
        { direction: "inbound", content: "Quero saber sobre um processo" },
        { direction: "outbound", content: "Claro. Para eu localizar com segurança, me mande o nome completo do cliente ou o número do processo." },
        { direction: "inbound", content: "Marcio da Silva Machado" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      processStatusContext: {
        verified: true,
        confidence: "high",
        accessScope: "tenant_authorized",
        senderPhoneAuthorized: true,
        processTaskId: "process-marcio-1",
        clientName: "Marcio da Silva Machado",
        processNumber: "3333333-33.2024.8.26.0100",
        title: "Marcio x Banco Bradesco",
        currentStage: "Conhecimento",
        detectedPhase: "sem_fase_confiavel",
        detectedPhaseLabel: null,
        lastMovementAt: "2026-05-20",
        lastMovementText: "Aguardando movimentacao",
        deadlineAt: null,
        pendingItems: [],
        nextStep: "acompanhar movimentacao",
        riskFlags: [],
        clientReply: null,
        grounding: { factualSources: ["processo monitorado"], inferenceNotes: [], missingSignals: [] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(decision.reply).toContain("Localizei o processo do cliente Marcio");
    expect(decision.reply).not.toMatch(/Aqui é a Maya|assistente do Dutra|Oi, Vitor/i);
    expect(decision.should_auto_send).toBe(true);
  });

  it("troca contexto de processo para triagem de desconto com conversa natural", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Entendi. Agora é sobre o desconto no contracheque. Ele aparece com qual nome no documento?",
      intent: "legal_triage",
      next_action: "qualificar desconto no contracheque",
      conversation_state: {
        conversation_role: "legal_triage",
        conversation_goal: "qualificar nova demanda sem contaminar com processo antigo",
        last_customer_message: "Tenho desconto no contracheque",
        next_action: "qualificar desconto no contracheque",
        conversation_summary: "Interlocutor mudou de processo para triagem de desconto.",
        facts_known: ["desconto no contracheque"],
        missing_information: ["nome do desconto"],
      },
      support_summary: { is_existing_client: true, issue_type: "none", verified_case_reference: false, summary: "triagem comercial/juridica" },
      actions_to_execute: [{ type: "create_crm_lead", title: "Registrar triagem de desconto", requires_approval: false }],
    });

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

    expect(fetcher).toHaveBeenCalledTimes(1);
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
    expect(getLLMClientMock).toHaveBeenCalledWith({} as any, "tenant-1", "sdr_whatsapp", {
      preferredProvider: "openrouter",
      modelOverride: null,
    });
    expect(decision.model_used).toBe("openai/gpt-5.4-nano");
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
                reply: "Localizei o processo do cliente Marcio com seguranca. Ele esta na fase de replica. Ultima movimentacao: contestacao juntada. Proximo passo: a equipe revisar a defesa da outra parte.",
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

  it("responde processo unico verificado sem perguntar categoria, duvida ou objetivo", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify(operatingPartnerPayload({
          reply: "Marcio, tudo bem? Aqui e a Maya, assistente do Dutra Advocacia.\n\nEncontrei seu processo do Banco Bradesco e preciso confirmar sua duvida: e sobre custas/pagamento, andamento geral ou proxima audiencia?",
          intent: "process_status",
          confidence: 0.91,
          next_action: "confirmar duvida sobre o processo",
          conversation_state: {
            conversation_role: "case_status",
            conversation_goal: "confirmar duvida processual",
            last_customer_message: "Marcio da Silva Machado",
            next_action: "confirmar duvida sobre o processo",
            conversation_summary: "Operador informou nome de cliente e ha processo verificado.",
          },
          support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "processo verificado" },
          actions_to_execute: [{ type: "answer_support", title: "Responder status", requires_approval: false }],
        })) } }] }),
      })
      .mockRejectedValueOnce(new Error("repair provider unavailable")) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: { from: () => ({ insert: vi.fn(async () => ({ error: null })) }) } as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Marcio da Silva Machado" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      processStatusContext: {
        verified: true,
        confidence: "high",
        accessScope: "tenant_authorized",
        senderPhoneAuthorized: true,
        processTaskId: "bradesco",
        clientName: "Marcio da Silva Machado",
        processNumber: "3000141-95.2026.8.19.0213",
        title: "Banco Bradesco",
        currentStage: "Conhecimento",
        detectedPhase: "sem_fase_confiavel",
        detectedPhaseLabel: null,
        lastMovementAt: "2026-06-21",
        lastMovementText: "Aguardando andamento do juizo",
        deadlineAt: null,
        pendingItems: [],
        nextStep: null,
        riskFlags: [],
        clientReply: null,
        grounding: { factualSources: ["processos monitorados"], inferenceNotes: [], missingSignals: [] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.reply).toContain("Bradesco");
    expect(decision.reply).toContain("3000141-95.2026.8.19.0213");
    expect(decision.reply).toContain("Conhecimento");
    expect(decision.reply).toContain("Aguardando andamento do juizo");
    expect(decision.reply).not.toMatch(/confirmar sua duvida|custas\/pagamento|andamento geral|proxima audiencia|qual .*objetivo|qual .*duvida|me mande o nome completo/i);
    expect(decision.conversation_frame?.resolution_type).toBe("referenced_process");
    expect(decision.final_response_source).toBe("safe_fallback");
    expect(decision.should_auto_send).toBe(true);
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

  it("nao se reapresenta nem pergunta assunto quando nome localiza varios processos", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Bom dia, Vitor. Aqui e a Maya, assistente do Dutra Advocacia.\n\nPra eu te orientar com seguranca, qual e o assunto do processo: danos morais contra Bradesco ou atualizacao/FGTS/INPC contra a Caixa?",
      intent: "process_status",
      next_action: "perguntar assunto do processo",
      conversation_state: {
        conversation_role: "case_status",
        conversation_goal: "localizar processo",
        last_customer_message: "Marcio da Silva Machado",
        last_mayus_message: "Claro. Para eu localizar com seguranca, me mande o nome completo do cliente ou o numero do processo.",
        has_mayus_introduced: true,
        next_action: "perguntar assunto do processo",
        conversation_summary: "Operador pediu processo e enviou nome do cliente.",
      },
      support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "mais de um processo encontrado" },
      actions_to_execute: [{ type: "answer_support", title: "Responder candidatos processuais", requires_approval: false }],
    });

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Oi mayus" },
        { direction: "inbound", content: "Bom dia" },
        { direction: "outbound", content: "Bom dia, Vitor. Aqui e a Maya, assistente do Dutra Advocacia. Como posso te ajudar?" },
        { direction: "inbound", content: "Gostaria de saber sobre um processo" },
        { direction: "outbound", content: "Claro. Para eu localizar com seguranca, me mande o nome completo do cliente ou o numero do processo." },
        { direction: "inbound", content: "Marcio da Silva Machado" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      processStatusContext: {
        verified: true,
        confidence: "high",
        accessScope: "tenant_authorized",
        senderPhoneAuthorized: true,
        processTaskId: null,
        clientName: "Marcio da Silva Machado",
        processNumber: null,
        title: "Dossie processual do cliente",
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
          { processTaskId: "bradesco", clientName: "Marcio da Silva Machado", processNumber: "3000141-95.2026.8.19.0213", title: "Marcio x Bradesco", opposingParty: "Bradesco", summary: "danos morais", currentStage: "Conhecimento", lastMovementAt: "2026-06-21", lastMovementText: "Aguardando andamento do juizo" },
          { processTaskId: "caixa", clientName: "Marcio da Silva Machado", processNumber: "5006349-29.2023.4.02.5110", title: "Marcio x Caixa", opposingParty: "Caixa", summary: "atualizacao/FGTS/INPC", currentStage: "Conhecimento", lastMovementAt: "2023-06-10", lastMovementText: null },
        ],
        grounding: { factualSources: ["processos monitorados"], inferenceNotes: [], missingSignals: [] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(decision.conversation_frame?.resolution_type).toBe("process_candidates");
    expect(decision.final_response_source).toBe("safe_fallback");
    expect(decision.reply).toContain("Encontrei 2 processos para Marcio da Silva Machado");
    expect(decision.reply).toContain("Bradesco");
    expect(decision.reply).toContain("Caixa");
    expect(decision.reply).not.toMatch(/aqui (e|eh|sou)|assistente do|qual .*assunto|danos morais.*ou.*FGTS|qual desses|qual deles/i);
    expect(decision.reply_blocks).toHaveLength(3);
    expect(decision.should_auto_send).toBe(true);
  });

  it("responde referencia curta ao Banco Master sem perguntar assunto nem misturar outros processos", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "A do Banco Master está em Recurso. O ponto atual é gratuidade/custas em recurso e o último registro na base é: Sem decisão nova registrada.",
      intent: "process_status",
      next_action: "responder o candidato processual referenciado",
      conversation_state: {
        conversation_role: "case_status",
        conversation_goal: "acompanhar processos do cliente",
        last_customer_message: "E a do banco master ?",
        next_action: "responder o candidato processual referenciado",
        conversation_summary: "Operador pediu detalhe do candidato Banco Master.",
        facts_known: ["referencia ao Banco Master", "fase Recurso", "gratuidade/custas em recurso"],
        missing_information: [],
      },
      support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "referencia curta resolvida" },
      actions_to_execute: [{ type: "answer_support", title: "Responder processo referenciado", requires_approval: false }],
    });

    const lastProcessCandidates = [
      { processTaskId: "master", clientName: "Márcio da Silva Machado", processNumber: "3000144-50.2026.8.19.0213", title: "Márcio x Banco Master", opposingParty: "Banco Master", summary: "gratuidade/custas em recurso", currentStage: "Recurso", lastMovementAt: "2026-04-30", lastMovementText: "Sem decisão nova registrada" },
      { processTaskId: "bradesco", clientName: "Márcio da Silva Machado", processNumber: "3000141-95.2026.8.19.0213", title: "Márcio x Bradesco", opposingParty: "Bradesco", summary: "ação de indenização", currentStage: "Conhecimento", lastMovementAt: "2026-06-21", lastMovementText: "Aguardando andamento do juízo" },
      { processTaskId: "caixa", clientName: "Márcio da Silva Machado", processNumber: "5006349-29.2023.4.02.5110", title: "Márcio x Caixa", opposingParty: "Caixa", summary: "FGTS/atualização", currentStage: "Conhecimento", lastMovementAt: "2023-06-10", lastMovementText: null },
    ];

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Marcio da Silva Machado" },
        { direction: "outbound", content: "Márcio, localizei três processos principais: Banco Master, Bradesco e Caixa." },
        { direction: "inbound", content: "E a do banco master ?" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      previousMayusEvent: {
        intent: "process_status",
        next_action: "responder detalhes quando operador escolher um processo",
        conversation_state: {
          conversation_role: "case_status",
          conversation_goal: "acompanhar processos do cliente",
          last_process_candidates: lastProcessCandidates,
          has_mayus_introduced: true,
        },
      },
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
        candidateProcesses: lastProcessCandidates.slice(1),
        grounding: { factualSources: ["processos monitorados"], inferenceNotes: [], missingSignals: [] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(decision.reply).toContain("Processo do Banco Master");
    expect(decision.reply).toContain("Recurso");
    expect(decision.reply).toContain("gratuidade/custas em recurso");
    expect(decision.reply).toContain("Sem decisão nova registrada");
    expect(decision.reply).not.toMatch(/Bradesco|Caixa|indeniza[cç][aã]o|FGTS|qual .*assunto principal|localizar com seguran[cç]a/i);
    expect(decision.next_action).toBe("responder o candidato processual referenciado");
    expect(decision.should_auto_send).toBe(true);
    expect(decision.conversation_frame?.resolution_type).toBe("referenced_process");
    expect(decision.conversation_frame?.resolved_reference?.opposingParty).toBe("Banco Master");
  });

  it("responde Bradesco escolhido de forma deterministica sem perguntar objetivo principal", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Perfeito, Vitor. Então é o processo do Bradesco. Pra eu te dizer o andamento com segurança, qual é seu objetivo principal: reduzir descontos, buscar indenização ou só acompanhar?",
      intent: "process_status",
      next_action: "perguntar objetivo principal",
      conversation_state: {
        conversation_role: "case_status",
        conversation_goal: "acompanhar processos do cliente",
        last_customer_message: "Bradesco",
        next_action: "perguntar objetivo principal",
        conversation_summary: "Operador escolheu Bradesco.",
        facts_known: ["referencia ao Bradesco"],
        missing_information: [],
      },
      support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "referencia curta resolvida" },
      actions_to_execute: [{ type: "answer_support", title: "Responder processo referenciado", requires_approval: false }],
    });

    const lastProcessCandidates = [
      { processTaskId: "master", clientName: "Márcio da Silva Machado", processNumber: "3000144-50.2026.8.19.0213", title: "Márcio x Banco Master", opposingParty: "Banco Master", summary: "gratuidade/custas em recurso", currentStage: "Recurso", lastMovementAt: "2026-04-30", lastMovementText: "Sem decisão nova registrada" },
      { processTaskId: "bradesco", clientName: "Márcio da Silva Machado", processNumber: "3000141-95.2026.8.19.0213", title: "Márcio x Bradesco", opposingParty: "Bradesco", summary: "ação de indenização", currentStage: "Conhecimento", lastMovementAt: "2026-06-21", lastMovementText: "Aguardando andamento do juízo" },
      { processTaskId: "caixa", clientName: "Márcio da Silva Machado", processNumber: "5006349-29.2023.4.02.5110", title: "Márcio x Caixa", opposingParty: "Caixa", summary: "FGTS/atualização", currentStage: "Conhecimento", lastMovementAt: "2023-06-10", lastMovementText: null },
    ];

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Marcio da Silva Machado" },
        { direction: "outbound", content: "Márcio, localizei três processos principais: Banco Master, Bradesco e Caixa." },
        { direction: "inbound", content: "Bradesco" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      previousMayusEvent: {
        intent: "process_status",
        conversation_state: {
          conversation_role: "case_status",
          conversation_goal: "acompanhar processos do cliente",
          last_process_candidates: lastProcessCandidates,
          has_mayus_introduced: true,
        },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.reply).toContain("Processo do Bradesco");
    expect(decision.reply).toContain("3000141-95.2026.8.19.0213");
    expect(decision.reply).toContain("Aguardando andamento do juízo");
    expect(decision.reply).not.toMatch(/objetivo principal|reduzir|cessar descontos|buscar indeniza[cç][aã]o|s[oó] acompanhar/i);
    expect(decision.conversation_frame?.resolution_type).toBe("referenced_process");
    expect(decision.final_response_source).toBe("safe_fallback");
    expect(decision.should_auto_send).toBe(true);
  });

  it("responde pedido de situacao do processo ja escolhido sem nova entrevista", async () => {
    const badModelReply = "Pra eu te orientar no proximo passo: seu foco agora e saber so a situacao geral, ou e confirmar se tem algo a fazer na pratica?";
    const lastProcessCandidates = [
      { processTaskId: "master", clientName: "Marcio da Silva Machado", processNumber: "3000144-50.2026.8.19.0213", title: "Marcio x Banco Master", opposingParty: "Banco Master", summary: "gratuidade/custas em recurso", currentStage: "Recurso", lastMovementAt: "2026-04-30", lastMovementText: "Sem decisao nova registrada" },
      { processTaskId: "bradesco", clientName: "Marcio da Silva Machado", processNumber: "3000141-95.2026.8.19.0213", title: "Marcio x Bradesco", opposingParty: "Bradesco", summary: "acao de indenizacao", currentStage: "Conhecimento", lastMovementAt: "2026-06-21", lastMovementText: "Aguardando andamento do juizo" },
      { processTaskId: "caixa", clientName: "Marcio da Silva Machado", processNumber: "5006349-29.2023.4.02.5110", title: "Marcio x Caixa", opposingParty: "Caixa", summary: "FGTS/atualizacao", currentStage: "Conhecimento", lastMovementAt: "2023-06-10", lastMovementText: null },
    ];

    for (const message of ["Acompanhar como esta", "So saber a situacao", "Pode me passar a situacao do processo", "Quero saber da porra do processo"]) {
      const fetcher = operatingPartnerFetcher({
        reply: badModelReply,
        intent: "process_status",
        next_action: "perguntar objetivo de acompanhamento",
        conversation_state: {
          conversation_role: "case_status",
          conversation_goal: "acompanhar processos do cliente",
          last_customer_message: message,
          next_action: "perguntar objetivo de acompanhamento",
          conversation_summary: "Operador pediu situacao do processo do Bradesco.",
        },
        support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "pedido de situacao" },
      });

      const decision = await buildMayusOperatingPartnerDecision({
        supabase: {} as any,
        tenantId: "tenant-1",
        channel: "whatsapp",
        contactName: "Vitor",
        messages: [
          { direction: "inbound", content: "Bradesco" },
          { direction: "outbound", content: "A do Bradesco (3000141-95.2026.8.19.0213): esta em Conhecimento. ultimo registro em 21/06/2026: Aguardando andamento do juizo." },
          { direction: "inbound", content: message },
        ],
        whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
        previousMayusEvent: {
          intent: "process_status",
          conversation_state: {
            conversation_role: "case_status",
            conversation_goal: "acompanhar processos do cliente",
            last_process_candidates: lastProcessCandidates,
            has_mayus_introduced: true,
          },
        },
        operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
        fetcher,
      });

      expect(decision.reply).toContain("Processo do Bradesco");
      expect(decision.reply).toContain("3000141-95.2026.8.19.0213");
      expect(decision.reply).toContain("Aguardando andamento do juizo");
      expect(decision.reply).not.toMatch(/foco agora|situa[cç][aã]o geral|consulta mesmo|provid[eê]ncia|objetivo principal|reduzir|cessar|aproveitar alguma movimenta[cç][aã]o/i);
      expect(decision.conversation_frame?.resolution_type).toBe("referenced_process");
      expect(decision.final_response_source).toBe("safe_fallback");
      expect(decision.should_auto_send).toBe(true);
    }
  });

  it("usa fallback factual quando a LLM rotula processo resolvido como comercial e insiste em entrevista", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "No processo do Marcio contra o Bradesco, esta ativo. Pra eu direcionar: qual e seu objetivo principal, reduzir descontos, buscar indenizacao ou so acompanhar?",
      intent: "legal_triage",
      next_action: "perguntar assunto juridico",
      conversation_state: {
        conversation_role: "case_status",
        conversation_goal: "acompanhar processo do cliente",
        last_customer_message: "Pode me passar a situacao do processo",
        next_action: "perguntar assunto juridico",
        conversation_summary: "LLM confundiu processo resolvido com triagem comercial.",
      },
      support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "pedido de situacao" },
    });
    const lastProcessCandidates = [
      { processTaskId: "bradesco", clientName: "Marcio da Silva Machado", processNumber: "3000141-95.2026.8.19.0213", title: "Marcio x Bradesco", opposingParty: "Banco Bradesco S.A", summary: "acao de indenizacao", currentStage: "ATIVO", lastMovementAt: "2026-03-13", lastMovementText: "Aguardando andamento do juizo" },
    ];

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Marcio da Silva Machado" },
        { direction: "outbound", content: "Perfeito, e o processo do Banco Bradesco." },
        { direction: "inbound", content: "Pode me passar a situacao do processo" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      previousMayusEvent: {
        intent: "process_status",
        conversation_state: {
          conversation_role: "case_status",
          conversation_goal: "acompanhar processos do cliente",
          last_process_candidates: lastProcessCandidates,
          has_mayus_introduced: true,
        },
      },
      processStatusContext: {
        verified: true,
        confidence: "high",
        accessScope: "tenant_authorized",
        senderPhoneAuthorized: true,
        processTaskId: "bradesco",
        clientName: "Marcio da Silva Machado",
        processNumber: "3000141-95.2026.8.19.0213",
        title: "Marcio x Bradesco",
        currentStage: "ATIVO",
        detectedPhase: "sem_fase_confiavel",
        detectedPhaseLabel: "ATIVO",
        lastMovementAt: "2026-03-13",
        lastMovementText: "Aguardando andamento do juizo",
        deadlineAt: null,
        pendingItems: [],
        nextStep: null,
        riskFlags: [],
        clientReply: null,
        candidateProcesses: lastProcessCandidates,
        grounding: { factualSources: ["processos monitorados"], inferenceNotes: [], missingSignals: [] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(decision.reply).toContain("Bradesco");
    expect(decision.reply).toContain("3000141-95.2026.8.19.0213");
    expect(decision.reply).not.toMatch(/danos morais|desconto em folha|consignado|qual .*assunto|pra eu direcionar/i);
    expect(decision.conversation_frame?.resolution_type).toBe("referenced_process");
    expect(decision.final_response_source).toBe("safe_fallback");
    expect(decision.should_auto_send).toBe(true);
  });

  it("lista os outros processos quando operador pede outro processo apos detalhe", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Qual outro você quer: Bradesco ou Caixa?",
      intent: "process_status",
      next_action: "perguntar outro processo",
      conversation_state: {
        conversation_role: "case_status",
        conversation_goal: "acompanhar processos do cliente",
        last_customer_message: "Quero o outro processo",
        next_action: "perguntar outro processo",
        conversation_summary: "Operador pediu outro processo.",
      },
      support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "pedido por outro processo" },
    });

    const lastProcessCandidates = [
      { processTaskId: "master", clientName: "Márcio da Silva Machado", processNumber: "3000144-50.2026.8.19.0213", title: "Márcio x Banco Master", opposingParty: "Banco Master", summary: "gratuidade/custas em recurso", currentStage: "Recurso", lastMovementAt: "2026-04-30", lastMovementText: "Sem decisão nova registrada" },
      { processTaskId: "bradesco", clientName: "Márcio da Silva Machado", processNumber: "3000141-95.2026.8.19.0213", title: "Márcio x Bradesco", opposingParty: "Bradesco", summary: "ação de indenização", currentStage: "Conhecimento", lastMovementAt: "2026-06-21", lastMovementText: "Aguardando andamento do juízo" },
      { processTaskId: "caixa", clientName: "Márcio da Silva Machado", processNumber: "5006349-29.2023.4.02.5110", title: "Márcio x Caixa", opposingParty: "Caixa", summary: "FGTS/atualização", currentStage: "Conhecimento", lastMovementAt: "2023-06-10", lastMovementText: null },
    ];

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Bradesco" },
        { direction: "outbound", content: "A do Bradesco (3000141-95.2026.8.19.0213): está em Conhecimento. último registro em 21/06/2026: Aguardando andamento do juízo." },
        { direction: "inbound", content: "Quero o outro processo" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      previousMayusEvent: {
        intent: "process_status",
        conversation_state: {
          conversation_role: "case_status",
          conversation_goal: "acompanhar processos do cliente",
          last_process_candidates: lastProcessCandidates,
          has_mayus_introduced: true,
        },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.reply).toContain("Banco Master");
    expect(decision.reply).toContain("Caixa");
    expect(decision.reply).not.toContain("Bradesco (3000141-95.2026.8.19.0213)");
    expect(decision.conversation_frame?.resolution_type).toBe("process_candidates");
    expect(decision.final_response_source).toBe("safe_fallback");
    expect(decision.should_auto_send).toBe(true);
  });

  it("nao forca Banco Master em Bradesco ou Caixa quando a referencia nao esta nos candidatos", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Vitor, entendi. Só pra eu localizar com segurança: esse banco master é qual banco (Bradesco/TJRJ ou Caixa/TRF2)? E o assunto é indenização ou correção/FGTS?",
      intent: "process_status",
      next_action: "perguntar alternativa antiga",
      conversation_state: {
        conversation_role: "case_status",
        conversation_goal: "localizar processo",
        last_customer_message: "Banco master é banco master",
        next_action: "perguntar alternativa antiga",
        conversation_summary: "Operador corrigiu que a referencia e Banco Master.",
        facts_known: ["referencia ao Banco Master"],
        missing_information: [],
      },
      support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: false, summary: "referencia nao encontrada nos candidatos" },
    });

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Marcio da Silva Machado" },
        { direction: "outbound", content: "Márcio, localizei dois processos: Bradesco (TJRJ) e Caixa (TRF2)." },
        { direction: "inbound", content: "Banco master é banco master" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      previousMayusEvent: {
        intent: "process_status",
        conversation_state: {
          conversation_role: "case_status",
          conversation_goal: "acompanhar processos do cliente",
          last_process_candidates: [
            { processTaskId: "bradesco", clientName: "Márcio da Silva Machado", processNumber: "3000141-95.2026.8.19.0213", title: "Márcio x Bradesco", opposingParty: "Bradesco", summary: "ação de indenização", currentStage: "Conhecimento", lastMovementAt: "2026-06-21" },
            { processTaskId: "caixa", clientName: "Márcio da Silva Machado", processNumber: "5006349-29.2023.4.02.5110", title: "Márcio x Caixa", opposingParty: "Caixa", summary: "FGTS/atualização", currentStage: "Conhecimento", lastMovementAt: "2023-06-10" },
          ],
          has_mayus_introduced: true,
        },
      },
      processStatusContext: {
        verified: true,
        confidence: "medium",
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
          { processTaskId: "bradesco", clientName: "Márcio da Silva Machado", processNumber: "3000141-95.2026.8.19.0213", title: "Márcio x Bradesco", opposingParty: "Bradesco", summary: "ação de indenização", currentStage: "Conhecimento", lastMovementAt: "2026-06-21" },
          { processTaskId: "caixa", clientName: "Márcio da Silva Machado", processNumber: "5006349-29.2023.4.02.5110", title: "Márcio x Caixa", opposingParty: "Caixa", summary: "FGTS/atualização", currentStage: "Conhecimento", lastMovementAt: "2023-06-10" },
        ],
        grounding: { factualSources: ["processos monitorados"], inferenceNotes: [], missingSignals: ["Banco Master nao retornou nos candidatos atuais"] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.reply).toContain("Banco Master");
    expect(decision.reply).toContain("sem confundir com outro banco");
    expect(decision.reply).not.toMatch(/Bradesco|\bCaixa\b|TJRJ|TRF2|indeniza[cç][aã]o|FGTS|qual banco|qual desses|assunto/i);
    expect(decision.conversation_frame?.resolution_type).toBe("unmatched_process_reference");
    expect(decision.final_response_source).toBe("deterministic_guardrail");
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
    expect(decision.conversation_frame?.resolution_type).toBe("process_candidates");
    expect(decision.final_response_source).toBe("llm_repaired");
    expect(decision.should_auto_send).toBe(true);
  });

  it("autoenvia resposta processual segura para operador mesmo se acao interna exigir aprovacao", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Encontrei 2 processos ativos para Marcio da Silva Machado: Banco Bradesco S.A, no TJRJ 3000141-95.2026.8.19.0213, e Caixa Economica Federal, no TRF2 5006349-29.2023.4.02.5110.",
      intent: "process_status",
      confidence: 0.91,
      risk_flags: [],
      next_action: "listar processos encontrados por nome",
      conversation_state: {
        conversation_role: "case_status",
        conversation_goal: "mostrar processos encontrados por nome",
        customer_temperature: "existing_client",
        stage: "client_support",
        facts_known: ["operador autorizado pediu pelo nome"],
        missing_information: [],
        objections: [],
        urgency: "none",
        decision_maker: "unknown",
        documents_requested: [],
        last_customer_message: "pelo nome vc consegue",
        last_mayus_message: "Localizei os processos do Marcio.",
        last_commitment: null,
        next_action: "listar processos encontrados por nome",
        has_mayus_introduced: true,
        conversation_summary: "operador autorizado pediu busca processual por nome",
      },
      support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "processos encontrados por nome" },
      actions_to_execute: [
        { type: "create_crm_lead", title: "Registrar lead no CRM", requires_approval: true },
      ],
      requires_approval: false,
      should_auto_send: true,
    });

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Quero saber do processo Marcio da Silva Machado" },
        { direction: "outbound", content: "Encontrei 2 processos do Marcio da Silva Machado." },
        { direction: "inbound", content: "pelo nome vc consegue" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      processStatusContext: {
        verified: true,
        confidence: "high",
        accessScope: "tenant_authorized",
        senderPhoneAuthorized: true,
        processTaskId: null,
        clientName: "Marcio da Silva Machado",
        processNumber: null,
        title: "Dossie processual do cliente",
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
          { processTaskId: "bradesco", clientName: "Marcio da Silva Machado", processNumber: "3000141-95.2026.8.19.0213", title: "Marcio x Bradesco", opposingParty: "Banco Bradesco S.A", summary: "fase inicial", currentStage: "ATIVO", lastMovementAt: "2026-05-25" },
          { processTaskId: "caixa", clientName: "Marcio da Silva Machado", processNumber: "5006349-29.2023.4.02.5110", title: "Marcio x Caixa", opposingParty: "Caixa Economica Federal", summary: "ativo", currentStage: "ATIVO", lastMovementAt: null },
        ],
        grounding: { factualSources: ["processos monitorados"], inferenceNotes: [], missingSignals: [] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.conversation_frame?.resolution_type).toBe("process_candidates");
    expect(decision.requires_approval).toBe(false);
    expect(decision.should_auto_send).toBe(true);
    expect(decision.reply).toContain("Marcio da Silva Machado");
  });

  it("repara pergunta de banco ou tema quando operador ja deu nome suficiente", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({
          reply: "Vitor, consigo localizar, mas para acertar sem confusao: qual banco/tema desse processo da Michele (saude, desconto/RMC, danos morais)?",
          intent: "process_status",
          confidence: 0.9,
          risk_flags: [],
          next_action: "perguntar banco ou tema",
          conversation_state: { conversation_role: "case_status", conversation_goal: "localizar processo", customer_temperature: "existing_client", stage: "client_support", facts_known: ["nome Michele"], missing_information: [], objections: [], urgency: "none", decision_maker: "unknown", documents_requested: [], last_customer_message: "Pelo nome vc consegue", last_mayus_message: null, last_commitment: null, next_action: "perguntar banco ou tema", has_mayus_introduced: true, conversation_summary: "operador pediu processo por nome" },
          closing_readiness: { score: 0, status: "not_ready", reasons: [] },
          support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "processo localizado por nome" },
          reasoning_summary_for_team: "perguntou tema mesmo com processo verificado",
          actions_to_execute: [{ type: "answer_support", title: "Responder status", requires_approval: false }],
          requires_approval: false,
          should_auto_send: true,
          expected_outcome: "operador informa tema",
        }) } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({
          reply: "Vitor, localizei o processo da Michele Cristina Pinto Foppolos Santos. A ultima movimentacao registrada foi publicada em 25/05/2026; deixei como acompanhamento interno para conferir o despacho antes de qualquer proximo passo.",
          intent: "process_status",
          confidence: 0.91,
          risk_flags: [],
          next_action: "conferir despacho do processo da Michele",
          conversation_state: { conversation_role: "case_status", conversation_goal: "responder processo localizado", customer_temperature: "existing_client", stage: "client_support", facts_known: ["processo Michele localizado"], missing_information: [], objections: [], urgency: "none", decision_maker: "unknown", documents_requested: [], last_customer_message: "Pelo nome vc consegue", last_mayus_message: null, last_commitment: null, next_action: "conferir despacho do processo da Michele", has_mayus_introduced: true, conversation_summary: "processo localizado por nome" },
          closing_readiness: { score: 0, status: "not_ready", reasons: [] },
          support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "processo localizado por nome" },
          reasoning_summary_for_team: "respondeu com fatos do processo localizado",
          actions_to_execute: [{ type: "answer_support", title: "Responder status", requires_approval: false }],
          requires_approval: false,
          should_auto_send: true,
          expected_outcome: "operador recebe contexto do processo",
        }) } }] }),
      }) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: { from: () => ({ insert: vi.fn(async () => ({ error: null })) }) } as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "inbound", content: "Quero saber do processo Michele Cristina Pinto Foppolos Santos" },
        { direction: "outbound", content: "Me mande o numero do processo." },
        { direction: "inbound", content: "Pelo nome vc consegue" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      processStatusContext: {
        verified: true,
        confidence: "high",
        accessScope: "tenant_authorized",
        senderPhoneAuthorized: true,
        processTaskId: "process-michele",
        clientName: "Michele Cristina Pinto Foppolos Santos",
        processNumber: "3002575-03.2026.8.19.0000",
        title: "Michele x Banco",
        currentStage: "Acompanhamento",
        detectedPhase: "sem_fase_confiavel",
        detectedPhaseLabel: null,
        lastMovementAt: "2026-05-25",
        lastMovementText: "Publicado despacho",
        deadlineAt: null,
        pendingItems: [],
        nextStep: "conferir despacho",
        riskFlags: [],
        clientReply: null,
        candidateProcesses: [
          { processTaskId: "process-michele", clientName: "Michele Cristina Pinto Foppolos Santos", processNumber: "3002575-03.2026.8.19.0000", title: "Michele x Banco", opposingParty: "Banco", summary: "acompanhamento", currentStage: "Acompanhamento", lastMovementAt: "2026-05-25", lastMovementText: "Publicado despacho" },
        ],
        grounding: { factualSources: ["processo monitorado"], inferenceNotes: [], missingSignals: [] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(decision.risk_flags).not.toContain("asks_unneeded_process_choice");
    expect(decision.reply).not.toMatch(/banco\/tema|qual banco|qual tema|desconto\/RMC|danos morais/i);
    expect(decision.reply).toContain("Michele");
    expect(decision.final_response_source).toBe("llm_repaired");
    expect(decision.should_auto_send).toBe(true);
  });

  it("repara pergunta obvia sobre identidade quando o telefone e do escritorio", async () => {
    let repairPrompt = "";
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({
          reply: "Voce e cliente ou e do escritorio? Assim eu vejo como posso consultar esse processo.",
          intent: "process_status",
          confidence: 0.9,
          risk_flags: [],
          next_action: "confirmar identidade do interlocutor",
          conversation_state: {
            conversation_role: "case_status",
            conversation_goal: "localizar processo para operador interno",
            customer_temperature: "existing_client",
            stage: "client_support",
            facts_known: ["telefone autorizado do escritorio"],
            missing_information: ["cliente ou processo"],
            objections: [],
            urgency: "none",
            decision_maker: "unknown",
            documents_requested: [],
            last_customer_message: "Maya, veja o processo da Maria",
            last_mayus_message: null,
            last_commitment: null,
            next_action: "confirmar identidade do interlocutor",
            has_mayus_introduced: true,
            conversation_summary: "Operador autorizado pediu consulta de processo.",
          },
          closing_readiness: { score: 0, status: "not_ready", reasons: [] },
          support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: false, summary: "consulta interna de processo" },
          reasoning_summary_for_team: "Perguntou identidade mesmo com telefone autorizado.",
          actions_to_execute: [{ type: "ask_discovery_question", title: "Confirmar identidade", requires_approval: false }],
          requires_approval: false,
          should_auto_send: true,
          expected_outcome: "interlocutor confirma identidade",
        }) } }] }),
      })
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body || "{}"));
        repairPrompt = body.messages[1].content;
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { content: JSON.stringify({
            reply: "Claro. Como esse numero e autorizado do escritorio, vou tratar como pedido interno. Me mande o nome completo da cliente ou o CNJ para eu localizar na base com seguranca.",
            intent: "process_status",
            confidence: 0.91,
            risk_flags: [],
            next_action: "pedir identificador do cliente/processo",
            conversation_state: {
              conversation_role: "case_status",
              conversation_goal: "localizar processo para operador interno",
              customer_temperature: "existing_client",
              stage: "client_support",
              facts_known: ["telefone autorizado do escritorio"],
              missing_information: ["nome completo da cliente ou CNJ"],
              objections: [],
              urgency: "none",
              decision_maker: "unknown",
              documents_requested: [],
              last_customer_message: "Maya, veja o processo da Maria",
              last_mayus_message: null,
              last_commitment: null,
              next_action: "pedir identificador do cliente/processo",
              has_mayus_introduced: true,
              conversation_summary: "Operador autorizado pediu consulta de processo.",
            },
            closing_readiness: { score: 0, status: "not_ready", reasons: [] },
            support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: false, summary: "consulta interna de processo" },
            reasoning_summary_for_team: "Corrigiu a pergunta obvia e tratou como operador interno.",
            actions_to_execute: [{ type: "ask_discovery_question", title: "Pedir cliente ou CNJ", requires_approval: false }],
            requires_approval: false,
            should_auto_send: true,
            expected_outcome: "operador envia identificador seguro",
          }) } }] }),
        };
      }) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: { from: () => ({ insert: vi.fn(async () => ({ error: null })) }) } as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [{ direction: "inbound", content: "Maya, veja o processo da Maria" }],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      processStatusContext: {
        verified: true,
        confidence: "high",
        accessScope: "tenant_authorized",
        senderPhoneAuthorized: true,
        processTaskId: "process-maria",
        clientName: "Maria Silva",
        processNumber: "1234567-89.2024.8.26.0100",
        title: "Maria x Banco",
        currentStage: "Aguardando andamento",
        detectedPhase: "sem_fase_confiavel",
        detectedPhaseLabel: null,
        lastMovementAt: null,
        lastMovementText: null,
        deadlineAt: null,
        pendingItems: [],
        nextStep: null,
        riskFlags: [],
        clientReply: null,
        grounding: { factualSources: ["processo monitorado"], inferenceNotes: [], missingSignals: [] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(repairPrompt).toContain("office_operator");
    expect(decision.risk_flags).not.toContain("asks_known_office_identity");
    expect(decision.reply).not.toMatch(/cliente ou.*escrit[oó]rio|escrit[oó]rio ou cliente|voce e cliente/i);
    expect(decision.whatsapp_actor_context).toEqual(expect.objectContaining({ role: "office_operator", sender_phone_authorized: true }));
    expect(decision.agentic_governance?.hermes_trajectory.events[0].payload).toEqual(expect.objectContaining({
      whatsapp_actor_role: "office_operator",
      sender_phone_authorized: true,
    }));
    expect(decision.should_auto_send).toBe(true);
  });

  it("transforma lacuna de custas em ponto interno de conferencia para operador", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({
          reply: "Vitor, no seu processo, voce pagou as custas? Preciso saber para seguir.",
          intent: "process_status",
          confidence: 0.9,
          risk_flags: [],
          next_action: "perguntar pagamento de custas",
          conversation_state: {
            conversation_role: "case_status",
            conversation_goal: "informar status interno do processo",
            customer_temperature: "existing_client",
            stage: "client_support",
            facts_known: ["processo localizado", "custas aparecem como lacuna"],
            missing_information: ["confirmacao de custas"],
            objections: [],
            urgency: "none",
            decision_maker: "unknown",
            documents_requested: [],
            last_customer_message: "E as custas da Maria?",
            last_mayus_message: null,
            last_commitment: null,
            next_action: "perguntar pagamento de custas",
            has_mayus_introduced: true,
            conversation_summary: "Operador interno perguntou sobre custas.",
          },
          closing_readiness: { score: 0, status: "not_ready", reasons: [] },
          support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "status interno de custas" },
          reasoning_summary_for_team: "Perguntou ao operador se ele pagou custas.",
          actions_to_execute: [{ type: "answer_support", title: "Responder status interno", requires_approval: false }],
          requires_approval: false,
          should_auto_send: true,
          expected_outcome: "operador confirma pagamento",
        }) } }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: JSON.stringify({
          reply: "No processo da cliente Maria, nao vi confirmacao de pagamento de custas na base. Deixei esse ponto marcado para conferencia interna antes de qualquer proximo passo.",
          intent: "process_status",
          confidence: 0.91,
          risk_flags: [],
          next_action: "marcar custas como ponto de conferencia",
          conversation_state: {
            conversation_role: "case_status",
            conversation_goal: "informar status interno do processo",
            customer_temperature: "existing_client",
            stage: "client_support",
            facts_known: ["processo localizado", "custas sem confirmacao na base"],
            missing_information: ["confirmacao de custas"],
            objections: [],
            urgency: "none",
            decision_maker: "unknown",
            documents_requested: [],
            last_customer_message: "E as custas da Maria?",
            last_mayus_message: null,
            last_commitment: null,
            next_action: "marcar custas como ponto de conferencia",
            has_mayus_introduced: true,
            conversation_summary: "Operador interno perguntou sobre custas.",
          },
          closing_readiness: { score: 0, status: "not_ready", reasons: [] },
          support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "status interno de custas" },
          reasoning_summary_for_team: "Tratou custas como lacuna de base e ponto interno.",
          actions_to_execute: [{ type: "add_internal_note", title: "Marcar custas para conferencia", requires_approval: false }],
          requires_approval: false,
          should_auto_send: true,
          expected_outcome: "equipe confere custas na base",
        }) } }] }),
      }) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: { from: () => ({ insert: vi.fn(async () => ({ error: null })) }) } as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [{ direction: "inbound", content: "E as custas da Maria?" }],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      processStatusContext: {
        verified: true,
        confidence: "medium",
        accessScope: "tenant_authorized",
        senderPhoneAuthorized: true,
        processTaskId: "process-1",
        clientName: "Maria Silva",
        processNumber: "1234567-89.2024.8.26.0100",
        title: "Maria x Banco",
        currentStage: "Recurso",
        detectedPhase: "recurso",
        detectedPhaseLabel: "recurso",
        lastMovementAt: "2026-05-20",
        lastMovementText: "Intimacao para recolhimento de custas/preparo",
        deadlineAt: null,
        pendingItems: ["confirmar custas/preparo"],
        nextStep: "conferir custas/preparo na base",
        riskFlags: [],
        clientReply: null,
        grounding: { factualSources: ["processo monitorado"], inferenceNotes: [], missingSignals: ["confirmacao de custas/preparo"] },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(decision.risk_flags).not.toContain("asks_internal_cost_payment");
    expect(decision.risk_flags).not.toContain("external_possessive_for_internal_actor");
    expect(decision.reply).toMatch(/nao vi confirmacao|base/i);
    expect(decision.reply).toMatch(/ponto.*conferencia|conferencia interna/i);
    expect(decision.reply).not.toMatch(/voce pagou|pagou as custas|as custas foram pagas\?|seu processo/i);
    expect(decision.should_auto_send).toBe(true);
  });

  it("mantem triagem normal para lead externo sem contexto interno", async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: "Entendi. Para eu organizar melhor, esse desconto aparece com qual nome no contracheque?",
              intent: "legal_triage",
              confidence: 0.9,
              risk_flags: [],
              next_action: "qualificar desconto do lead",
              conversation_state: {
                conversation_role: "seller",
                conversation_goal: "qualificar lead com desconto em folha",
                customer_temperature: "interested",
                stage: "discovery",
                facts_known: ["lead perguntou sobre desconto"],
                missing_information: ["nome do desconto"],
                objections: [],
                urgency: "none",
                decision_maker: "unknown",
                documents_requested: ["trecho do contracheque"],
                last_customer_message: "Tenho desconto no beneficio",
                last_mayus_message: null,
                last_commitment: null,
                next_action: "qualificar desconto do lead",
                has_mayus_introduced: true,
                conversation_summary: "Lead externo quer entender desconto.",
              },
              closing_readiness: { score: 30, status: "not_ready", reasons: ["descoberta incompleta"] },
              support_summary: { is_existing_client: false, issue_type: "documents", verified_case_reference: false, summary: "triagem comercial" },
              reasoning_summary_for_team: "Lead externo deve receber triagem normal.",
              actions_to_execute: [{ type: "create_crm_lead", title: "Registrar lead", requires_approval: false }],
              requires_approval: false,
              should_auto_send: true,
              expected_outcome: "lead informa nome do desconto",
            }),
          },
        }],
      }),
    })) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: {} as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      messages: [{ direction: "inbound", content: "Tenho desconto no beneficio" }],
      whatsappActorContext: { role: "lead", sender_phone_authorized: false, reason: "crm_context" },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(decision.whatsapp_actor_context).toEqual(expect.objectContaining({ role: "lead", sender_phone_authorized: false }));
    expect(decision.reply).toContain("desconto");
    expect(decision.should_auto_send).toBe(true);
  });

  it("trata pedido misto do dono como conversa interna sem puxar processo antigo", async () => {
    let prompt = "";
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body || "{}"));
      prompt = body.messages[1].content;
      return {
        ok: true,
        json: async () => ({
          choices: [{
            message: {
              content: JSON.stringify(operatingPartnerPayload({
                reply: "Vitor, sobre o processo, me manda o nome do cliente ou o CNJ para eu nao misturar com contexto antigo.\n\nSobre venda hoje, encontrei 1 registro no MAYUS: Ana Souza.",
                reply_blocks: [
                  "Vitor, sobre o processo, me manda o nome do cliente ou o CNJ para eu nao misturar com contexto antigo.",
                  "Sobre venda hoje, encontrei 1 registro no MAYUS: Ana Souza.",
                ],
                intent: "client_support",
                confidence: 0.92,
                next_action: "aguardar identificador do processo e informar venda do dia",
                conversation_state: {
                  conversation_role: "support",
                  conversation_goal: "responder pedido interno misto",
                  next_action: "aguardar identificador do processo",
                  facts_known: ["dono pediu processo e vendas hoje"],
                  missing_information: ["nome do cliente ou CNJ"],
                },
                support_summary: { is_existing_client: true, issue_type: "support", verified_case_reference: false, summary: "pedido interno misto" },
                reasoning_summary_for_team: "Usei snapshot comercial e evitei reutilizar processo antigo sem referencia segura.",
                actions_to_execute: [],
              })),
            },
          }],
        }),
      };
    }) as any;

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: { from: () => ({ insert: vi.fn(async () => ({ error: null })) }) } as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "outbound", content: "Encontrei o processo da Margarete x Caixa." },
        { direction: "inbound", content: "Quero saber sobre o processo e se teve alguma venda hoje" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      ownerOfficeSnapshot: {
        sales_today: {
          checked: true,
          date: "2026-05-26",
          source: "sales",
          count: 1,
          amount: 1200,
          highlights: [{ title: "Ana Souza", value: 1200, status: "Fechado" }],
        },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(prompt).toContain("Snapshot operacional do escritorio para dono/equipe");
    expect(prompt).toContain("pedido interno multi-intencao");
    expect(decision.conversation_frame?.resolution_type).toBe("owner_multi_intent");
    expect(decision.conversation_frame?.candidate_summaries).toEqual([]);
    expect(decision.reply).toMatch(/nome do cliente|CNJ/i);
    expect(decision.reply).toMatch(/venda hoje|registro no MAYUS/i);
    expect(decision.reply).not.toMatch(/Margarete|Caixa|qual banco|qual tema|qual assunto|objetivo/i);
    expect(decision.quality_check?.status).toBe("pass");
    expect(decision.should_auto_send).toBe(true);
  });

  it("retoma a solicitacao pendente do dono quando ele cobra resposta curta", async () => {
    const fetcher = operatingPartnerFetcher({
      reply: "Vitor, vou separar: para o processo, preciso do nome do cliente ou CNJ; sobre vendas hoje, nao encontrei venda registrada no MAYUS com seguranca agora.",
      reply_blocks: [
        "Vitor, para o processo, preciso do nome do cliente ou CNJ.",
        "Sobre vendas hoje, nao encontrei venda registrada no MAYUS com seguranca agora.",
      ],
      intent: "client_support",
      confidence: 0.9,
      next_action: "aguardar identificador do processo",
      conversation_state: {
        conversation_role: "support",
        conversation_goal: "responder solicitacao pendente do dono",
        next_action: "aguardar nome ou CNJ",
        facts_known: ["dono cobrou resposta"],
        missing_information: ["identificador do processo"],
      },
      support_summary: { is_existing_client: true, issue_type: "support", verified_case_reference: false, summary: "cobranca interna" },
      reasoning_summary_for_team: "A mensagem curta retomou a solicitacao anterior.",
      actions_to_execute: [],
    });

    const decision = await buildMayusOperatingPartnerDecision({
      supabase: { from: () => ({ insert: vi.fn(async () => ({ error: null })) }) } as any,
      tenantId: "tenant-1",
      channel: "whatsapp",
      contactName: "Vitor",
      messages: [
        { direction: "outbound", content: "Encontrei processos para Margarete." },
        { direction: "inbound", content: "Quero saber sobre o processo e se teve alguma venda hoje" },
        { direction: "inbound", content: "Pode me responder" },
      ],
      whatsappActorContext: { role: "office_operator", sender_phone_authorized: true, reason: "daily_playbook_authorized_phone" },
      ownerOfficeSnapshot: {
        sales_today: {
          checked: true,
          date: "2026-05-26",
          source: "sales",
          count: 0,
          amount: 0,
          highlights: [],
        },
      },
      operatingPartner: { enabled: true, autonomy_mode: "high_supervised" },
      fetcher,
    });

    expect(decision.conversation_frame?.resolution_type).toBe("owner_multi_intent");
    expect(decision.conversation_frame?.known_facts.join(" ")).toContain("retomar solicitacao pendente anterior");
    expect(decision.reply).toMatch(/processo/i);
    expect(decision.reply).toMatch(/vendas hoje/i);
    expect(decision.reply).not.toMatch(/Margarete|qual banco|qual tema|qual assunto/i);
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
          original_reply_preview: expect.stringContaining("paying consistently"),
          repaired_reply_preview: expect.stringContaining("Mais de 5 anos de desconto"),
          final_reply_preview: expect.stringContaining("Mais de 5 anos de desconto"),
          final_response_source: "llm_repaired",
        }),
      }),
    }));
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "learning_events",
      payload: expect.objectContaining({
        event_type: "mayus_operating_partner_repair_pattern",
        source_module: "mayus_operating_partner",
        payload: expect.objectContaining({
          original_risk_flags: expect.arrayContaining(["foreign_language_leak"]),
          repaired_should_auto_send: true,
          repair_succeeded: true,
          final_response_source: "llm_repaired",
          final_reply_preview: expect.stringContaining("Mais de 5 anos de desconto"),
        }),
      }),
    }));
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "learning_events",
      payload: expect.objectContaining({
        event_type: "self_correction_attempted",
        source_module: "mayus_operating_partner",
        payload: expect.objectContaining({
          correction_status: "attempted",
          correction_kind: "operating_partner_reply_repair",
          metadata: expect.objectContaining({
            original_risk_flags: expect.arrayContaining(["foreign_language_leak"]),
          }),
        }),
      }),
    }));
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "learning_events",
      payload: expect.objectContaining({
        event_type: "self_correction_applied",
        source_module: "mayus_operating_partner",
        payload: expect.objectContaining({
          correction_status: "corrected",
          correction_kind: "operating_partner_reply_repair",
          metadata: expect.objectContaining({
            original_risk_flags: expect.arrayContaining(["foreign_language_leak"]),
            repaired_should_auto_send: true,
            repair_succeeded: true,
          }),
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
    expect(decision.risk_flags).toEqual(expect.arrayContaining(["reply_repair_failed"]));
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "system_event_logs",
      payload: expect.objectContaining({
        event_name: "mayus_operating_partner_reply_repaired",
        status: "error",
        payload: expect.objectContaining({
          error: expect.stringContaining("repair provider timeout"),
          original_reply_preview: expect.stringContaining("paying consistently"),
          final_reply_preview: expect.stringContaining("paying consistently"),
          final_response_source: "llm_natural",
        }),
      }),
    }));
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "learning_events",
      payload: expect.objectContaining({
        event_type: "self_correction_failed",
        source_module: "mayus_operating_partner",
        payload: expect.objectContaining({
          correction_status: "failed",
          correction_kind: "operating_partner_reply_repair",
          external_side_effects_blocked: true,
          metadata: expect.objectContaining({
            repair_succeeded: false,
          }),
        }),
      }),
    }));
  });
});
