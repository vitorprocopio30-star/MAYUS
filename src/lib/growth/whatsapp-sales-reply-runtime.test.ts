import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildSalesLlmReplyMock,
  buildMayusOperatingPartnerDecisionMock,
  executeMayusOperatingPartnerActionsMock,
  loadEnforcedInstitutionalMemoryMock,
  sendWhatsAppMessageMock,
} = vi.hoisted(() => ({
  buildSalesLlmReplyMock: vi.fn(),
  buildMayusOperatingPartnerDecisionMock: vi.fn(),
  executeMayusOperatingPartnerActionsMock: vi.fn(),
  loadEnforcedInstitutionalMemoryMock: vi.fn(),
  sendWhatsAppMessageMock: vi.fn(),
}));

vi.mock("./sales-llm-reply", () => ({
  buildSalesLlmReply: buildSalesLlmReplyMock,
  normalizeSalesLlmTestbenchConfig: vi.fn((config) => ({
    enabled: config?.enabled !== false,
    default_model: config?.default_model || "deepseek/deepseek-v4-pro",
    candidate_models: config?.candidate_models || ["deepseek/deepseek-v4-pro"],
    routing_mode: config?.routing_mode || "fixed",
  })),
}));

vi.mock("@/lib/whatsapp/send-message", () => ({
  sendWhatsAppMessage: sendWhatsAppMessageMock,
}));

vi.mock("@/lib/agent/mayus-operating-partner", () => ({
  buildMayusOperatingPartnerDecision: buildMayusOperatingPartnerDecisionMock,
  normalizeMayusOperatingPartnerConfig: vi.fn((config) => ({
    enabled: config?.enabled !== false,
    autonomy_mode: config?.autonomy_mode || "high_supervised",
    confidence_thresholds: config?.confidence_thresholds || { auto_send: 0.78, auto_execute: 0.82, approval: 0.65 },
    active_modules: config?.active_modules || {
      setup: true,
      sales: true,
      client_support: true,
      legal_triage: true,
      crm: true,
      tasks: true,
    },
  })),
}));

vi.mock("@/lib/agent/mayus-operating-partner-actions", () => ({
  executeMayusOperatingPartnerActions: executeMayusOperatingPartnerActionsMock,
}));

vi.mock("@/lib/agent/memory/institutional", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/memory/institutional")>();
  return {
    ...actual,
    loadEnforcedInstitutionalMemory: loadEnforcedInstitutionalMemoryMock,
  };
});

import { DEFAULT_INSTITUTIONAL_MEMORY_PROMPT_CAP } from "@/lib/agent/memory/institutional";
import { prepareWhatsAppSalesReplyForContact } from "./whatsapp-sales-reply-runtime";

function makeSelectQuery(result: any) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    ilike: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  };
  return query;
}

function makeInstitutionalMemoryEntries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `memory-${index + 1}`,
    key: `regra_${index + 1}`,
    text: `Regra institucional aprovada ${index + 1}`,
    category: "atendimento",
    source: "office_institutional_memory" as const,
    sourceLabel: null,
    confidence: null,
  }));
}

describe("prepareWhatsAppSalesReplyForContact", () => {
  beforeEach(() => {
    buildSalesLlmReplyMock.mockReset();
    buildMayusOperatingPartnerDecisionMock.mockReset();
    executeMayusOperatingPartnerActionsMock.mockReset();
    executeMayusOperatingPartnerActionsMock.mockResolvedValue([]);
    loadEnforcedInstitutionalMemoryMock.mockReset();
    loadEnforcedInstitutionalMemoryMock.mockResolvedValue([]);
    sendWhatsAppMessageMock.mockReset();
  });

  it("prepara resposta, audita evento e notifica sem enviar WhatsApp", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeSelectQuery({
            data: { id: "contact-1", name: "Maria Silva", phone_number: "5511999999999", assigned_user_id: null },
            error: null,
          });
        }

        if (table === "tenant_settings") {
          return makeSelectQuery({
            data: {
              ai_features: {
                mayus_operating_partner: { enabled: false },
                sales_llm_testbench: { enabled: false },
                sales_consultation_profile: {
                  ideal_client: "beneficiarios do INSS com negativa recente",
                  core_solution: "entender chance real e documentos faltantes",
                  unique_value_proposition: "Diagnostico previdenciario consultivo",
                  value_pillars: ["Diagnostico", "Provas", "Plano"],
                  positioning_summary: "Atendimento previdenciario consultivo",
                },
              },
            },
            error: null,
          });
        }

        if (table === "whatsapp_messages") {
          return makeSelectQuery({
            data: [
              { direction: "inbound", content: "Meu beneficio foi negado.", message_type: "text", created_at: "2026-04-28T10:00:00.000Z" },
            ],
            error: null,
          });
        }

        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
        };
      }),
    };

    const prepared = await prepareWhatsAppSalesReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "meta_webhook",
      notify: true,
    });

    expect(prepared.metadata.mode).toBe("suggested_reply");
    expect(prepared.metadata.reply_source).toBe("deterministic_fallback");
    expect(prepared.metadata.model_used).toBe("deterministic");
    expect(prepared.metadata.external_side_effects_blocked).toBe(false);
    expect(prepared.metadata.auto_sent).toBe(false);
    expect(prepared.autoSendResult).toEqual({ attempted: false, status: "skipped" });
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    expect(buildMayusOperatingPartnerDecisionMock).not.toHaveBeenCalled();
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_sales_reply_prepared",
            payload: expect.objectContaining({
              contact_id: "contact-1",
              trigger: "meta_webhook",
              may_auto_send: true,
              reply_source: "deterministic_fallback",
              model_used: "deterministic",
              first_response_policy: expect.objectContaining({
                enabled: false,
                can_auto_send: false,
            }),
          }),
        }),
      }),
      expect.objectContaining({
        table: "notifications",
        payload: expect.objectContaining({
          tenant_id: "tenant-1",
          link_url: "/dashboard/conversas/whatsapp",
        }),
      }),
    ]));
  });

  it("mantem fallback deterministico especifico para desconto no contracheque quando LLM esta desabilitada", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeSelectQuery({
            data: { id: "contact-1", name: "Vitor", phone_number: "5511999999999", assigned_user_id: null },
            error: null,
          });
        }

        if (table === "tenant_settings") {
          return makeSelectQuery({
            data: {
              ai_features: {
                mayus_operating_partner: { enabled: false },
                sales_llm_testbench: { enabled: false },
              },
            },
            error: null,
          });
        }

        if (table === "whatsapp_messages") {
          return makeSelectQuery({
            data: [
              { direction: "inbound", content: "Quero saber se tenho direito ao desconto do meu contracheque", message_type: "text", created_at: "2026-05-04T13:15:00.000Z" },
            ],
            error: null,
          });
        }

        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
        };
      }),
    };

    const prepared = await prepareWhatsAppSalesReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "manual",
    });

    expect(buildMayusOperatingPartnerDecisionMock).not.toHaveBeenCalled();
    expect(buildSalesLlmReplyMock).not.toHaveBeenCalled();
    expect(prepared.metadata.reply_source).toBe("deterministic_fallback");
    expect(prepared.metadata.lead_topic).toBe("payroll_discount");
    expect(prepared.metadata.suggested_reply).toContain("qual nome no contracheque");
    expect(prepared.metadata.suggested_reply).toContain("comecou em que mes");
    expect(prepared.metadata.suggested_reply).toContain("print so da parte do desconto");
    expect(prepared.metadata.suggested_reply).not.toContain("O Escritorio conduz");
    expect(prepared.metadata.suggested_reply).not.toContain("Esse atendimento e de qual area");
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          payload: expect.objectContaining({
            reply_source: "deterministic_fallback",
            model_used: "deterministic",
            lead_topic: "payroll_discount",
          }),
        }),
      }),
    ]));
  });

  it("envia automaticamente quando a LLM libera should_auto_send e politica permite", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    buildSalesLlmReplyMock.mockResolvedValueOnce({
      provider: "openrouter",
      model_used: "deepseek/deepseek-v4-pro",
      reply: "Entendi. Esse desconto aparece com qual nome no contracheque?",
      lead_stage: "discovery",
      intent: "sales_discovery",
      confidence: 0.86,
      risk_flags: [],
      next_action: "perguntar origem do desconto",
      should_auto_send: true,
      expected_outcome: "lead responde com detalhe do desconto",
    });
    sendWhatsAppMessageMock.mockResolvedValueOnce({
      provider: "evolution",
      apiResponse: { ok: true },
    });

    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeSelectQuery({
            data: { id: "contact-1", name: "Vitor", phone_number: "5511999999999", assigned_user_id: null },
            error: null,
          });
        }

        if (table === "tenant_settings") {
          return makeSelectQuery({
            data: {
              ai_features: {
                mayus_operating_partner: {
                  enabled: false,
                },
                sales_llm_testbench: {
                  enabled: true,
                  default_model: "deepseek/deepseek-v4-pro",
                  candidate_models: ["deepseek/deepseek-v4-pro"],
                  routing_mode: "fixed",
                },
                whatsapp_agent: {
                  autonomy_mode: "auto_respond",
                },
              },
            },
            error: null,
          });
        }

        if (table === "whatsapp_messages") {
          return makeSelectQuery({
            data: [
              { direction: "inbound", content: "Quero saber sobre um desconto no contracheque", message_type: "text", created_at: "2026-05-04T10:21:00.000Z" },
            ],
            error: null,
          });
        }

        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
        };
      }),
    };

    const prepared = await prepareWhatsAppSalesReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      autoSendFirstResponse: true,
    });

    expect(prepared.llmReply?.model_used).toBe("deepseek/deepseek-v4-pro");
    expect(prepared.metadata.reply_source).toBe("sales_llm");
    expect(prepared.metadata.model_used).toBe("deepseek/deepseek-v4-pro");
    expect(prepared.autoSendResult).toEqual({ attempted: false, status: "skipped" });
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_sales_reply_prepared",
          payload: expect.objectContaining({
            first_response_policy: expect.objectContaining({
              can_auto_send: false,
              blocked_reason: "non_agentic_reply_source",
            }),
          }),
        }),
      }),
    ]));
  });

  it("usa fallback deterministico so como rascunho quando a LLM falha", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    buildSalesLlmReplyMock.mockRejectedValueOnce(new Error("Timeout ao chamar LLM de vendas apos 9000ms."));
    sendWhatsAppMessageMock.mockResolvedValueOnce({
      provider: "evolution",
      apiResponse: { ok: true },
    });

    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeSelectQuery({
            data: { id: "contact-1", name: "Vitor", phone_number: "5511999999999", assigned_user_id: null },
            error: null,
          });
        }

        if (table === "tenant_settings") {
          return makeSelectQuery({
            data: {
              ai_features: {
                mayus_operating_partner: { enabled: false },
                sales_llm_testbench: {
                  enabled: true,
                  default_model: "deepseek/deepseek-v4-pro",
                  candidate_models: ["deepseek/deepseek-v4-pro"],
                  routing_mode: "fixed",
                },
                whatsapp_agent: {
                  autonomy_mode: "auto_respond",
                },
              },
            },
            error: null,
          });
        }

        if (table === "whatsapp_messages") {
          return makeSelectQuery({
            data: [
              { direction: "inbound", content: "Posso mandar meu contracheque para analise?", message_type: "text", created_at: "2026-05-05T19:00:00.000Z" },
            ],
            error: null,
          });
        }

        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
        };
      }),
    };

    const prepared = await prepareWhatsAppSalesReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      autoSendFirstResponse: true,
      preferredProvider: "evolution",
    });

    expect(prepared.metadata.reply_source).toBe("deterministic_fallback");
    expect(prepared.metadata.fallback_reason).toBe("sales_llm:provider_timeout");
    expect(prepared.metadata.lead_topic).toBe("payroll_discount");
    expect(prepared.autoSendResult).toEqual({ attempted: false, status: "skipped" });
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_sales_reply_prepared",
          payload: expect.objectContaining({
            first_response_policy: expect.objectContaining({
              can_auto_send: false,
              blocked_reason: "deterministic_fallback_not_agentic",
            }),
          }),
        }),
      }),
    ]));
  });

  it("nao autoenvia resposta da Sales LLM mesmo quando contato atribuido permite autonomia", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    buildSalesLlmReplyMock.mockResolvedValueOnce({
      provider: "openrouter",
      model_used: "deepseek/deepseek-v4-pro",
      reply: "Boa tarde. Como posso te ajudar hoje?",
      lead_stage: "new",
      intent: "new_lead",
      confidence: 0.9,
      risk_flags: [],
      next_action: "entender demanda inicial",
      should_auto_send: true,
      expected_outcome: "cliente informa a demanda",
    });
    sendWhatsAppMessageMock.mockResolvedValueOnce({
      provider: "evolution",
      apiResponse: { ok: true },
    });

    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeSelectQuery({
            data: { id: "contact-1", name: "Vitor", phone_number: "5511999999999", assigned_user_id: "user-1" },
            error: null,
          });
        }

        if (table === "tenant_settings") {
          return makeSelectQuery({
            data: {
              ai_features: {
                mayus_operating_partner: { enabled: false },
                sales_llm_testbench: {
                  enabled: true,
                  default_model: "deepseek/deepseek-v4-pro",
                  candidate_models: ["deepseek/deepseek-v4-pro"],
                  routing_mode: "fixed",
                },
                whatsapp_agent: {
                  autonomy_mode: "auto_respond_assigned",
                },
              },
            },
            error: null,
          });
        }

        if (table === "whatsapp_messages") {
          return makeSelectQuery({
            data: [
              { direction: "inbound", content: "Boa tarde", message_type: "text", created_at: "2026-05-05T18:37:51.000Z" },
            ],
            error: null,
          });
        }

        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
        };
      }),
    };

    const prepared = await prepareWhatsAppSalesReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      autoSendFirstResponse: true,
    });

    expect(prepared.autoSendResult).toEqual({ attempted: false, status: "skipped" });
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_sales_reply_prepared",
          payload: expect.objectContaining({
            first_response_policy: expect.objectContaining({
              can_auto_send: false,
              assigned_contact_auto_send: true,
              blocked_reason: "non_agentic_reply_source",
            }),
          }),
        }),
      }),
    ]));
  });

  it("mantem revisao humana quando a LLM nao libera envio", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    buildSalesLlmReplyMock.mockResolvedValueOnce({
      provider: "openrouter",
      model_used: "deepseek/deepseek-v4-pro",
      reply: "Consigo te ajudar, mas preciso entender qual desconto aparece no contracheque.",
      lead_stage: "discovery",
      intent: "sales_discovery",
      confidence: 0.64,
      risk_flags: ["low_confidence"],
      next_action: "pedir detalhe do desconto",
      should_auto_send: false,
      expected_outcome: "operador revisa antes de enviar",
    });

    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeSelectQuery({
            data: { id: "contact-1", name: "Vitor", phone_number: "5511999999999", assigned_user_id: null },
            error: null,
          });
        }

        if (table === "tenant_settings") {
          return makeSelectQuery({
            data: {
              ai_features: {
                mayus_operating_partner: {
                  enabled: false,
                },
                sales_llm_testbench: {
                  enabled: true,
                  default_model: "deepseek/deepseek-v4-pro",
                  candidate_models: ["deepseek/deepseek-v4-pro"],
                  routing_mode: "fixed",
                },
              },
            },
            error: null,
          });
        }

        if (table === "whatsapp_messages") {
          return makeSelectQuery({
            data: [
              { direction: "inbound", content: "Me passa status do processo", message_type: "text", created_at: "2026-05-04T10:21:00.000Z" },
            ],
            error: null,
          });
        }

        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
        };
      }),
    };

    const prepared = await prepareWhatsAppSalesReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "meta_webhook",
      autoSendFirstResponse: true,
    });

    expect(prepared.autoSendResult).toEqual({ attempted: false, status: "skipped" });
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    expect(prepared.metadata.requires_human_review).toBe(true);
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_sales_reply_prepared",
          payload: expect.objectContaining({
            first_response_policy: expect.objectContaining({
              can_auto_send: false,
              blocked_reason: "reply_not_marked_auto_send",
            }),
          }),
        }),
      }),
    ]));
    expect(inserts.filter((insert) => insert.table === "system_event_logs")).toHaveLength(1);
  });

  it("usa o Operating Partner MAYUS para conduzir WhatsApp e executar acoes simples", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const institutionalMemory = [
      {
        id: "memory-self-improvement",
        key: "self_improvement:correction_failed_operating_partner_reply_repair_timeout",
        text: "Quando a auto-correcao operating_partner_reply_repair falhar por timeout, bloquear autoenvio e pedir revisao humana.",
        category: "compliance",
        source: "brain_memory_promoted" as const,
        sourceLabel: "MAYUS detectou padrao",
        confidence: 0.6,
      },
      ...makeInstitutionalMemoryEntries(DEFAULT_INSTITUTIONAL_MEMORY_PROMPT_CAP + 1),
    ];
    loadEnforcedInstitutionalMemoryMock.mockResolvedValueOnce(institutionalMemory);
    buildMayusOperatingPartnerDecisionMock.mockResolvedValueOnce({
      provider: "openrouter",
      model_used: "deepseek/deepseek-v4-pro",
      reply: "Entendi. Esse desconto aparece com qual nome no contracheque?",
      intent: "legal_triage",
      confidence: 0.91,
      risk_flags: [],
      next_action: "qualificar dor do desconto",
      actions_to_execute: [
        { type: "create_crm_lead", title: "Registrar lead do WhatsApp", requires_approval: false },
      ],
      requires_approval: false,
      should_auto_send: true,
      expected_outcome: "cliente informa origem do desconto",
      conversation_classification: {
        class: "commercial",
        surface: "external_message",
        owner: "MAYUS Operating Partner",
        confidence: 0.91,
        requires_human_review: false,
        next_action: "qualificar dor do desconto",
        reason: "conversa comercial/triagem deve conduzir proxima pergunta sem promessa de fechamento",
      },
      agentic_governance: {
        paperclip_mission: {
          mission: "whatsapp_conversation",
          owner: "MAYUS Operating Partner",
          routine: "whatsapp_agentic_beta",
          budget: "single_message",
          next_action: "qualificar dor do desconto",
          pending_approval: false,
          reconstructable: true,
          trace_required: true,
        },
        openclaw_policy: {
          surface: "external_message",
          outcome: "allowed",
          requires_approval: false,
          can_execute_now: true,
          blocked_layer: null,
          reason: "conversa comercial/triagem deve conduzir proxima pergunta sem promessa de fechamento",
        },
        hermes_trajectory: {
          status: "ready",
          tenant_learning_scope: "tenant_only",
          events: [{ type: "decision", summary: "qualificar dor do desconto" }],
        },
      },
    });
    executeMayusOperatingPartnerActionsMock.mockResolvedValueOnce([
      { type: "create_crm_lead", status: "executed", detail: "Lead criado no CRM.", record_id: "crm-1" },
    ]);
    sendWhatsAppMessageMock.mockResolvedValueOnce({
      provider: "evolution",
      apiResponse: { ok: true },
    });

    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeSelectQuery({
            data: { id: "contact-1", name: "Vitor", phone_number: "5511999999999", assigned_user_id: null },
            error: null,
          });
        }

        if (table === "tenant_settings") {
          return makeSelectQuery({
            data: {
              ai_features: {
                sales_llm_testbench: {
                  enabled: true,
                  default_model: "deepseek/deepseek-v4-pro",
                  candidate_models: ["deepseek/deepseek-v4-pro"],
                  routing_mode: "fixed",
                },
                mayus_operating_partner: {
                  enabled: true,
                  autonomy_mode: "high_supervised",
                },
                whatsapp_agent: {
                  assistant_name: "Maya",
                  autonomy_mode: "auto_respond",
                },
                office_knowledge_profile: {
                  office_name: "Dutra Advocacia",
                  practice_areas: ["bancario"],
                  triage_rules: ["Perguntar nome do desconto antes de falar em acao."],
                  human_handoff_rules: ["Preco, contrato e urgencia juridica exigem humano."],
                  communication_tone: "curto e seguro",
                  required_documents_by_case: ["contracheque com trecho do desconto"],
                  forbidden_claims: ["resultado garantido"],
                  pricing_policy: "Nao informar honorarios sem humano.",
                  response_sla: "ate 5 minutos",
                  departments: ["Comercial"],
                  permission_policy: "Socio aprova contrato, cobranca e envio externo.",
                  calendar_policy: "Consulta pode ser sugerida, confirmacao externa exige humano.",
                  finance_policy: "Cobrancas e renegociacoes ficam supervisionadas.",
                  playbook_notes: "Usar roteiro consultivo curto.",
                  practice_area_playbooks: [{
                    area: "bancario",
                    intake_questions: ["Qual desconto aparece no documento?"],
                    required_documents: ["contracheque"],
                    handoff_triggers: ["Contrato exige humano."],
                    default_pipeline: ["Triagem do desconto/contrato", "Coleta documental"],
                    document_structure: ["00-bancario-intake-e-resumo"],
                    owner_team: "Comercial",
                    validation_status: "needs_area_review",
                    next_review_question: "Validar playbook bancario?",
                  }],
                },
                operational_methodology: {
                  status: "approved",
                  identity: {
                    office_name: "Dutra Advocacia",
                    practice_areas: ["bancario"],
                    unique_value_proposition: "prova organizada antes da promessa",
                    forbidden_claims: ["resultado garantido"],
                  },
                  intake: {
                    methodology_base_used: false,
                    rules: ["Perguntar nome do desconto antes de falar em acao."],
                    required_documents_by_case: ["contracheque com trecho do desconto"],
                    human_handoff_rules: ["Preco, contrato e urgencia juridica exigem humano."],
                  },
                  case_flow: {
                    phases: [{ name: "Triagem do desconto/contrato" }, { name: "Coleta documental" }],
                    departments: ["Comercial"],
                    permission_policy: "Socio aprova contrato, cobranca e envio externo.",
                    calendar_policy: "Consulta pode ser sugerida, confirmacao externa exige humano.",
                    finance_policy: "Cobrancas e renegociacoes ficam supervisionadas.",
                  },
                  area_methods: [{
                    area: "bancario",
                    intake_questions: ["Qual desconto aparece no documento?"],
                    required_documents: ["contracheque"],
                    phases: ["Triagem do desconto/contrato", "Coleta documental"],
                    document_structure: ["00-bancario-intake-e-resumo"],
                    owner_team: "Comercial",
                    validation_status: "needs_area_review",
                  }],
                  internet_policy: { no_auto_activation: true },
                },
                office_playbook_profile: {
                  status: "active",
                  office_name: "Dutra Advocacia",
                  main_legal_areas: ["bancario"],
                  thesis_by_area: [{ area: "bancario", thesis: "desconto em folha sem clareza de origem" }],
                  ideal_client: "aposentados com desconto que nao entenderam a contratacao",
                  common_pains: ["desconto alto", "nao sabe quando contratou"],
                  offer_positioning: "triagem segura de desconto em folha sem promessa de resultado",
                  qualification_questions: ["Voce tem contrato ou comprovante do valor liberado?"],
                  required_documents: ["contracheque atual"],
                  forbidden_claims: ["garantir suspensao do desconto"],
                  handoff_rules: ["Escalar humano antes de falar em suspender desconto."],
                  objection_handling: [{ objection: "quero parar agora", response: "Nao orientar suspender sem analise.", next_question: "Voce tem contrato?" }],
                  next_best_actions: ["pedir contrato ou comprovante"],
                },
              },
            },
            error: null,
          });
        }

        if (table === "whatsapp_messages") {
          return makeSelectQuery({
            data: [
              { direction: "inbound", content: "Quero saber sobre um desconto no contracheque", message_type: "text", created_at: "2026-05-04T10:21:00.000Z" },
            ],
            error: null,
          });
        }

        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
        };
      }),
    };

    const prepared = await prepareWhatsAppSalesReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      autoSendFirstResponse: true,
    });

    expect(prepared.operatingPartnerDecision?.intent).toBe("legal_triage");
    expect(prepared.metadata.reply_source).toBe("operating_partner");
    expect(prepared.metadata.model_used).toBe("deepseek/deepseek-v4-pro");
    expect(prepared.metadata.institutional_memory_loaded).toBe(DEFAULT_INSTITUTIONAL_MEMORY_PROMPT_CAP + 2);
    expect(prepared.metadata.institutional_memory_applied).toBe(DEFAULT_INSTITUTIONAL_MEMORY_PROMPT_CAP);
    expect(prepared.metadata.mayus_operating_partner).toEqual(expect.objectContaining({
      institutional_memory_loaded: DEFAULT_INSTITUTIONAL_MEMORY_PROMPT_CAP + 2,
      institutional_memory_applied: DEFAULT_INSTITUTIONAL_MEMORY_PROMPT_CAP,
      conversation_classification: expect.objectContaining({
        class: "commercial",
        surface: "external_message",
      }),
      openclaw_policy: expect.objectContaining({
        surface: "external_message",
        outcome: "allowed",
      }),
      hermes_trajectory: expect.objectContaining({
        tenant_learning_scope: "tenant_only",
      }),
      paperclip_mission: expect.objectContaining({
        mission: "whatsapp_conversation",
        owner: "MAYUS Operating Partner",
      }),
    }));
    expect(prepared.metadata.conversation_classification).toEqual(expect.objectContaining({
      class: "commercial",
      surface: "external_message",
    }));
    expect(prepared.metadata.agentic_governance?.openclaw_policy).toEqual(expect.objectContaining({
      outcome: "allowed",
    }));
    expect(prepared.operatingPartnerActionResults).toEqual([
      { type: "create_crm_lead", status: "executed", detail: "Lead criado no CRM.", record_id: "crm-1" },
    ]);
    expect(buildSalesLlmReplyMock).not.toHaveBeenCalled();
    expect(loadEnforcedInstitutionalMemoryMock).toHaveBeenCalledWith(supabase, "tenant-1", { limit: 12 });
    expect(buildMayusOperatingPartnerDecisionMock).toHaveBeenCalledWith(expect.objectContaining({
      institutionalMemory,
    }));
    expect(buildMayusOperatingPartnerDecisionMock).toHaveBeenCalledWith(expect.objectContaining({
      institutionalMemory: expect.arrayContaining([
        expect.objectContaining({
          key: "self_improvement:correction_failed_operating_partner_reply_repair_timeout",
          source: "brain_memory_promoted",
          sourceLabel: "MAYUS detectou padrao",
        }),
      ]),
      officeKnowledgeProfile: expect.objectContaining({
        assistantName: "Maya",
        officeName: "Dutra Advocacia",
        practiceAreas: ["bancario"],
        pricingPolicy: "Nao informar honorarios sem humano.",
        permissionPolicy: "Socio aprova contrato, cobranca e envio externo.",
        calendarPolicy: "Consulta pode ser sugerida, confirmacao externa exige humano.",
        financePolicy: "Cobrancas e renegociacoes ficam supervisionadas.",
        operationalMethodologyStatus: "approved",
        operationalMethodologySummary: expect.stringContaining("internet apenas auditavel"),
        playbookNotes: "Usar roteiro consultivo curto.",
        practiceAreaPlaybooks: expect.arrayContaining([
          expect.objectContaining({
            area: "bancario",
            default_pipeline: ["Triagem do desconto/contrato", "Coleta documental"],
          }),
        ]),
      }),
      officePlaybookProfile: expect.objectContaining({
        main_legal_areas: ["bancario"],
        thesis_by_area: [{ area: "bancario", thesis: "desconto em folha sem clareza de origem" }],
        qualification_questions: ["Voce tem contrato ou comprovante do valor liberado?"],
      }),
    }));
    expect(executeMayusOperatingPartnerActionsMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      contact: expect.objectContaining({ id: "contact-1" }),
      decision: expect.objectContaining({ intent: "legal_triage" }),
    }));
    expect(sendWhatsAppMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      text: "Entendi. Esse desconto aparece com qual nome no contracheque?",
      metadata: expect.objectContaining({
        source: "mayus_operating_partner_auto_reply",
        intent: "legal_triage",
      }),
    }));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_mayus_operating_partner_auto_sent",
        }),
      }),
    ]));
  });

  it("nao autoenvia fallback quando o Operating Partner expira em desconto no contracheque", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    buildMayusOperatingPartnerDecisionMock.mockRejectedValueOnce(new Error("Timeout em MAYUS Operating Partner."));
    sendWhatsAppMessageMock.mockResolvedValueOnce({
      provider: "evolution",
      apiResponse: { ok: true },
    });

    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeSelectQuery({
            data: { id: "contact-1", name: "Vitor", phone_number: "5511999999999", assigned_user_id: null },
            error: null,
          });
        }

        if (table === "tenant_settings") {
          return makeSelectQuery({
            data: {
              ai_features: {
                sales_llm_testbench: {
                  enabled: true,
                  default_model: "deepseek/deepseek-v4-pro",
                  candidate_models: ["deepseek/deepseek-v4-pro"],
                  routing_mode: "fixed",
                },
                mayus_operating_partner: {
                  enabled: true,
                  autonomy_mode: "high_supervised",
                },
                whatsapp_agent: {
                  autonomy_mode: "auto_respond",
                },
              },
            },
            error: null,
          });
        }

        if (table === "whatsapp_messages") {
          return makeSelectQuery({
            data: [
              { direction: "inbound", content: "Quero saber sobre um desconto no contracheque", message_type: "text", created_at: "2026-05-05T18:37:51.000Z" },
            ],
            error: null,
          });
        }

        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
        };
      }),
    };

    const prepared = await prepareWhatsAppSalesReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      autoSendFirstResponse: true,
      preferredProvider: "evolution",
    });

    expect(buildSalesLlmReplyMock).not.toHaveBeenCalled();
    expect(prepared.metadata.reply_source).toBe("deterministic_fallback");
    expect(prepared.metadata.fallback_reason).toBe("operating_partner:provider_timeout");
    expect(prepared.autoSendResult).toEqual({ attempted: false, status: "skipped" });
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_sales_reply_prepared",
          payload: expect.objectContaining({
            mayus_operating_partner: expect.objectContaining({
              failed: true,
              fallback: "deterministic_whatsapp_sales_reply",
            }),
            first_response_policy: expect.objectContaining({
              can_auto_send: false,
              blocked_reason: "operating_partner_timeout_no_agentic_answer",
            }),
          }),
        }),
      }),
    ]));
  });

  it("classifica Credcesta como desconto em folha mas aguarda resposta agentica", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    buildMayusOperatingPartnerDecisionMock.mockRejectedValueOnce(new Error("Timeout em MAYUS Operating Partner apos 8000ms."));

    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeSelectQuery({
            data: { id: "contact-1", name: "Vitor", phone_number: "5511999999999", assigned_user_id: null },
            error: null,
          });
        }

        if (table === "tenant_settings") {
          return makeSelectQuery({
            data: {
              ai_features: {
                sales_llm_testbench: { enabled: true },
                mayus_operating_partner: { enabled: true },
                whatsapp_agent: { autonomy_mode: "auto_respond" },
              },
            },
            error: null,
          });
        }

        if (table === "whatsapp_messages") {
          return makeSelectQuery({
            data: [
              { direction: "inbound", content: "O credcesta", message_type: "text", created_at: "2026-05-05T18:37:51.000Z" },
            ],
            error: null,
          });
        }

        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
        };
      }),
    };

    sendWhatsAppMessageMock.mockResolvedValueOnce({ provider: "evolution", apiResponse: { ok: true } });

    const prepared = await prepareWhatsAppSalesReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      autoSendFirstResponse: true,
      preferredProvider: "evolution",
    });

    expect(prepared.metadata.lead_topic).toBe("payroll_discount");
    expect(prepared.autoSendResult).toEqual({ attempted: false, status: "skipped" });
    expect(sendWhatsAppMessageMock).not.toHaveBeenCalled();
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_sales_reply_prepared",
          payload: expect.objectContaining({
            lead_topic: "payroll_discount",
            first_response_policy: expect.objectContaining({
              can_auto_send: false,
              blocked_reason: "operating_partner_timeout_no_agentic_answer",
            }),
          }),
        }),
      }),
    ]));
  });

  it("injeta playbook RMC quando template do tenant esta ativo", async () => {
    buildMayusOperatingPartnerDecisionMock.mockResolvedValueOnce({
      provider: "openrouter",
      model_used: "minimax/minimax-m2.7",
      reply: "Entendi. Como ja existe desconto no contracheque, nao vou orientar parar sem analise. Voce tem contrato ou comprovante do valor liberado?",
      intent: "legal_triage",
      confidence: 0.91,
      risk_flags: [],
      next_action: "pedir contrato ou comprovante",
      should_auto_send: true,
      requires_approval: false,
      actions_to_execute: [],
      conversation_state: { stage: "qualification" },
      closing_readiness: { score: 45, status: "warming", reasons: [] },
      support_summary: { is_existing_client: false, issue_type: "documents", verified_case_reference: false, summary: "triagem" },
      reasoning_summary_for_team: "Usou playbook RMC.",
      expected_outcome: "cliente envia contrato",
    });

    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeSelectQuery({ data: { id: "contact-1", name: "Vitor", phone_number: "5511999999999", assigned_user_id: null }, error: null });
        }
        if (table === "tenant_settings") {
          return makeSelectQuery({
            data: {
              ai_features: {
                sales_playbook_template: "rmc_dutra",
                sales_llm_testbench: { enabled: true, default_model: "minimax/minimax-m2.7" },
                mayus_operating_partner: { enabled: true },
                whatsapp_agent: { autonomy_mode: "auto_respond" },
                sales_consultation_profile: { ideal_client: "clientes com desconto em folha" },
              },
            },
            error: null,
          });
        }
        if (table === "whatsapp_messages") {
          return makeSelectQuery({ data: [{ direction: "inbound", content: "Quero parar de pagar Credcesta", message_type: "text", created_at: "2026-05-05T18:37:51.000Z" }], error: null });
        }
        return { insert: vi.fn(async () => ({ error: null })) };
      }),
    };

    sendWhatsAppMessageMock.mockResolvedValueOnce({ provider: "evolution", apiResponse: { ok: true } });

    await prepareWhatsAppSalesReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      autoSendFirstResponse: true,
      preferredProvider: "evolution",
    });

    expect(buildMayusOperatingPartnerDecisionMock).toHaveBeenCalledWith(expect.objectContaining({
      salesProfile: expect.objectContaining({
        salesPlaybookContext: expect.stringContaining("Playbook RMC/Credcesta"),
        salesRules: expect.arrayContaining([expect.stringContaining("Nao perguntar se ainda esta pagando")]),
        qualificationQuestions: expect.arrayContaining([expect.stringContaining("contrato")]),
        forbiddenClaims: expect.arrayContaining([expect.stringContaining("orientar parar de pagar")]),
      }),
    }));
  });

  it("limpa case_status_unverified do metadata quando o processo foi verificado", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    buildMayusOperatingPartnerDecisionMock.mockResolvedValueOnce({
      provider: "openrouter",
      model_used: "openai/gpt-5.4-nano",
      reply: "Oi, Maria. Verifiquei aqui com segurança. Seu processo está na fase de réplica. Última movimentação: contestação juntada. Próximo passo: a equipe revisar a defesa. No momento, não vi pendência sua registrada.",
      intent: "process_status",
      confidence: 0.91,
      risk_flags: [],
      next_action: "responder status processual verificado",
      should_auto_send: true,
      requires_approval: false,
      actions_to_execute: [{ type: "answer_support", title: "Responder status", requires_approval: false }],
      conversation_state: { stage: "client_support", conversation_role: "case_status", conversation_goal: "responder status", customer_temperature: "existing_client" },
      closing_readiness: { score: 0, status: "not_ready", reasons: [] },
      support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "status verificado" },
      reasoning_summary_for_team: "Processo verificado.",
      expected_outcome: "cliente entende status",
    });
    sendWhatsAppMessageMock.mockResolvedValueOnce({ provider: "evolution", apiResponse: { ok: true } });

    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeSelectQuery({ data: { id: "contact-1", name: "Maria", phone_number: "5511999999999@s.whatsapp.net", assigned_user_id: null }, error: null });
        }
        if (table === "tenant_settings") {
          return makeSelectQuery({ data: { ai_features: { mayus_operating_partner: { enabled: true }, whatsapp_agent: { autonomy_mode: "auto_respond" } } }, error: null });
        }
        if (table === "whatsapp_messages") {
          return makeSelectQuery({ data: [{ direction: "inbound", content: "Como está meu processo 1234567-89.2024.8.26.0100?", message_type: "text", created_at: "2026-05-05T18:37:51.000Z" }], error: null });
        }
        if (table === "clients") return makeSelectQuery({ data: null, error: null });
        if (table === "process_tasks") {
          return makeSelectQuery({
            data: [{
              id: "process-1",
              title: "Maria x Banco",
              description: "Contestação recebida.",
              phone: "11999999999",
              client_name: "Maria Silva",
              process_number: "1234567-89.2024.8.26.0100",
              processo_1grau: null,
              processo_2grau: null,
              andamento_1grau: "Contestação juntada",
              andamento_2grau: null,
              orgao_julgador: null,
              tutela_urgencia: null,
              sentenca: null,
              prazo_fatal: null,
              liminar_deferida: false,
              data_ultima_movimentacao: "2026-05-02T00:00:00.000Z",
              tags: [],
              urgency: "ROTINA",
              process_stages: { name: "Réplica" },
            }],
            error: null,
          });
        }
        if (table === "process_movimentacoes_inbox") {
          return makeSelectQuery({ data: { latest_data: "2026-05-02", latest_conteudo: "Contestação juntada.", latest_created_at: null, quantidade_eventos: 1 }, error: null });
        }
        return { insert: vi.fn(async (payload: any) => { inserts.push({ table, payload }); return { error: null }; }) };
      }),
    };

    const prepared = await prepareWhatsAppSalesReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      autoSendFirstResponse: true,
      preferredProvider: "evolution",
    });

    expect(buildMayusOperatingPartnerDecisionMock).toHaveBeenCalledWith(expect.objectContaining({
      processStatusContext: expect.objectContaining({ verified: true, processTaskId: "process-1" }),
    }));
    expect(prepared.metadata.risk_flags).not.toContain("case_status_unverified");
    expect(prepared.metadata.risk_flags).toContain("case_status_verified");
    expect(prepared.metadata.process_status_context).toEqual(expect.objectContaining({ verified: true }));
    expect(prepared.autoSendResult.status).toBe("sent");
  });

  it("numero autorizado recebe escopo tenant_authorized para consultar processo por nome", async () => {
    buildMayusOperatingPartnerDecisionMock.mockResolvedValueOnce({
      provider: "openrouter",
      model_used: "openai/gpt-5.4-nano",
      reply: "Verifiquei o processo da Camila com segurança.",
      intent: "process_status",
      confidence: 0.9,
      risk_flags: [],
      next_action: "responder status processual verificado",
      should_auto_send: false,
      requires_approval: false,
      actions_to_execute: [],
      conversation_state: { stage: "client_support", conversation_role: "case_status", conversation_goal: "responder status", customer_temperature: "existing_client" },
      closing_readiness: { score: 0, status: "not_ready", reasons: [] },
      support_summary: { is_existing_client: true, issue_type: "process_status", verified_case_reference: true, summary: "status verificado" },
      reasoning_summary_for_team: "Número autorizado consultou processo do tenant.",
      expected_outcome: "dono recebe status",
    });

    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeSelectQuery({ data: { id: "contact-owner", name: "Dono", phone_number: "5521999990000@s.whatsapp.net", assigned_user_id: null }, error: null });
        }
        if (table === "tenant_settings") {
          return makeSelectQuery({ data: { ai_features: { daily_playbook: { authorizedPhones: ["5521999990000"] }, mayus_operating_partner: { enabled: true } } }, error: null });
        }
        if (table === "whatsapp_messages") {
          return makeSelectQuery({ data: [{ direction: "inbound", content: "Como está o processo da Camila Autorizada?", message_type: "text", created_at: "2026-05-05T18:37:51.000Z" }], error: null });
        }
        if (table === "clients") return makeSelectQuery({ data: null, error: null });
        if (table === "process_tasks") {
          return makeSelectQuery({
            data: [{
              id: "process-owner-1",
              title: "Camila Autorizada x Banco",
              description: "Contestação recebida.",
              phone: "5511888877777",
              client_name: "Camila Autorizada",
              process_number: "2222222-22.2024.8.26.0100",
              processo_1grau: null,
              processo_2grau: null,
              andamento_1grau: "Contestação juntada",
              andamento_2grau: null,
              orgao_julgador: null,
              tutela_urgencia: null,
              sentenca: null,
              prazo_fatal: null,
              liminar_deferida: false,
              data_ultima_movimentacao: "2026-05-02T00:00:00.000Z",
              tags: [],
              urgency: "ROTINA",
              process_stages: { name: "Réplica" },
            }],
            error: null,
          });
        }
        if (table === "process_movimentacoes_inbox") return makeSelectQuery({ data: null, error: null });
        return { insert: vi.fn(async () => ({ error: null })) };
      }),
    };

    const prepared = await prepareWhatsAppSalesReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-owner",
      trigger: "manual",
      autoSendFirstResponse: false,
      preferredProvider: "evolution",
    });

    expect(buildMayusOperatingPartnerDecisionMock).toHaveBeenCalledWith(expect.objectContaining({
      processStatusContext: expect.objectContaining({
        verified: true,
        accessScope: "tenant_authorized",
        senderPhoneAuthorized: true,
        processTaskId: "process-owner-1",
      }),
    }));
    expect(prepared.metadata.process_status_context).toEqual(expect.objectContaining({
      accessScope: "tenant_authorized",
      senderPhoneAuthorized: true,
    }));
  });

  it("autoenvia resposta segura em contato atribuido quando cria tarefa para advogado", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    buildMayusOperatingPartnerDecisionMock.mockResolvedValueOnce({
      provider: "openrouter",
      model_used: "openai/gpt-5.4-nano",
      reply: "Boa tarde, Ana. Aqui é a Maya, assistente do Dutra. Me adianta em poucas palavras o assunto para eu organizar certinho e passar ao advogado responsável.",
      intent: "client_support",
      confidence: 0.91,
      risk_flags: [],
      next_action: "criar tarefa para advogado responsavel",
      actions_to_execute: [{ type: "create_task", title: "Atender cliente WhatsApp - Ana", payload: { urgency: "ATENCAO" }, requires_approval: false }],
      requires_approval: false,
      should_auto_send: true,
      conversation_state: { stage: "client_support" },
      closing_readiness: { score: 0, status: "not_ready", reasons: [] },
      support_summary: { is_existing_client: true, issue_type: "support", verified_case_reference: false, summary: "outra demanda" },
      reasoning_summary_for_team: "Cliente precisa de retorno humano.",
      expected_outcome: "advogado recebe tarefa e cliente adianta assunto",
    });
    executeMayusOperatingPartnerActionsMock.mockResolvedValueOnce([
      { type: "create_task", status: "executed", detail: "Tarefa de follow-up criada.", record_id: "task-1" },
    ]);
    sendWhatsAppMessageMock.mockResolvedValueOnce({ provider: "evolution", apiResponse: { ok: true } });

    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeSelectQuery({ data: { id: "contact-1", name: "Ana", phone_number: "5511999999999", assigned_user_id: "lawyer-1" }, error: null });
        }
        if (table === "tenant_settings") {
          return makeSelectQuery({ data: { ai_features: { mayus_operating_partner: { enabled: true }, whatsapp_agent: { assistant_name: "Maya", autonomy_mode: "auto_respond" } } }, error: null });
        }
        if (table === "whatsapp_messages") {
          return makeSelectQuery({ data: [{ direction: "inbound", content: "Boa tarde, queria falar sobre outra demanda", message_type: "text", created_at: "2026-05-07T18:00:00.000Z" }], error: null });
        }
        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
        };
      }),
    };

    const prepared = await prepareWhatsAppSalesReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      autoSendFirstResponse: true,
      preferredProvider: "evolution",
    });

    expect(sendWhatsAppMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("Maya"),
      phoneNumber: "5511999999999",
    }));
    expect(prepared.autoSendResult).toEqual({ attempted: true, status: "sent", provider: "evolution" });
    expect(prepared.operatingPartnerActionResults).toEqual([
      { type: "create_task", status: "executed", detail: "Tarefa de follow-up criada.", record_id: "task-1" },
    ]);
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_sales_reply_prepared",
          payload: expect.objectContaining({
            first_response_policy: expect.objectContaining({
              can_auto_send: true,
              blocked_reason: null,
              assigned_contact_safe_auto_send: true,
            }),
          }),
        }),
      }),
    ]));
  });

  it("quebra resposta automatica longa em blocos de WhatsApp", async () => {
    const longReply = [
      "Boa tarde, Ana. Aqui é a Maya, assistente do Dutra. Encontrei o contexto e vou te explicar de forma simples.",
      "O primeiro ponto é que eu preciso confirmar o assunto certo antes de passar qualquer detalhe sensível do processo para não misturar informações.",
      "Se for sobre andamento processual, me mande o nome completo do cliente ou o número do processo. Se for outro assunto, me diga em uma frase que eu organizo para o advogado responsável.",
      "Assim eu consigo te responder com segurança, sem reaproveitar conversa antiga e sem te mandar um texto enorme de uma vez.",
    ].join(" ");
    buildMayusOperatingPartnerDecisionMock.mockResolvedValueOnce({
      provider: "openrouter",
      model_used: "openai/gpt-5.4-nano",
      reply: longReply.repeat(3),
      intent: "client_support",
      confidence: 0.92,
      risk_flags: [],
      next_action: "pedir identificador seguro",
      actions_to_execute: [],
      requires_approval: false,
      should_auto_send: true,
      conversation_state: { stage: "client_support" },
      closing_readiness: { score: 0, status: "not_ready", reasons: [] },
      support_summary: { is_existing_client: true, issue_type: "support", verified_case_reference: false, summary: "suporte" },
      reasoning_summary_for_team: "Resposta longa precisa ser enviada em blocos.",
      expected_outcome: "cliente responde com identificador",
    });
    sendWhatsAppMessageMock.mockResolvedValue({ provider: "evolution", apiResponse: { ok: true } });

    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") return makeSelectQuery({ data: { id: "contact-1", name: "Ana", phone_number: "5511999999999", assigned_user_id: null }, error: null });
        if (table === "tenant_settings") return makeSelectQuery({ data: { ai_features: { mayus_operating_partner: { enabled: true }, whatsapp_agent: { assistant_name: "Maya", autonomy_mode: "auto_respond" } } }, error: null });
        if (table === "whatsapp_messages") return makeSelectQuery({ data: [{ direction: "inbound", content: "Boa tarde", message_type: "text", created_at: "2026-05-08T18:00:00.000Z" }], error: null });
        return { insert: vi.fn(async () => ({ error: null })) };
      }),
    };

    await prepareWhatsAppSalesReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      autoSendFirstResponse: true,
      preferredProvider: "evolution",
    });

    expect(sendWhatsAppMessageMock.mock.calls.length).toBeGreaterThan(1);
    for (const call of sendWhatsAppMessageMock.mock.calls) {
      expect(call[0].text.length).toBeLessThanOrEqual(650);
      expect(call[0].metadata.reply_block_count).toBeGreaterThan(1);
    }
  });
});
