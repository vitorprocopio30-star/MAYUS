import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildSalesLlmReplyMock,
  buildMayusOperatingPartnerDecisionMock,
  executeMayusOperatingPartnerActionsMock,
  sendWhatsAppMessageMock,
} = vi.hoisted(() => ({
  buildSalesLlmReplyMock: vi.fn(),
  buildMayusOperatingPartnerDecisionMock: vi.fn(),
  executeMayusOperatingPartnerActionsMock: vi.fn(),
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

import { prepareWhatsAppSalesReplyForContact } from "./whatsapp-sales-reply-runtime";

function makeSelectQuery(result: any) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  };
  return query;
}

describe("prepareWhatsAppSalesReplyForContact", () => {
  beforeEach(() => {
    buildSalesLlmReplyMock.mockReset();
    buildMayusOperatingPartnerDecisionMock.mockReset();
    executeMayusOperatingPartnerActionsMock.mockReset();
    executeMayusOperatingPartnerActionsMock.mockResolvedValue([]);
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
    expect(prepared.autoSendResult).toEqual({
      attempted: true,
      status: "sent",
      provider: "evolution",
    });
    expect(sendWhatsAppMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      contactId: "contact-1",
      phoneNumber: "5511999999999",
      text: "Entendi. Esse desconto aparece com qual nome no contracheque?",
      metadata: expect.objectContaining({
        source: "sales_llm_auto_reply",
        model_used: "deepseek/deepseek-v4-pro",
        lead_stage: "discovery",
      }),
    }));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_sales_reply_prepared",
          payload: expect.objectContaining({
            first_response_policy: expect.objectContaining({ can_auto_send: true }),
          }),
        }),
      }),
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_sales_llm_auto_sent",
          payload: expect.objectContaining({
            send_provider: "evolution",
          }),
        }),
      }),
    ]));
  });

  it("usa fallback deterministico seguro e autoenvia para contracheque quando a LLM falha", async () => {
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
    expect(prepared.autoSendResult).toEqual({ attempted: true, status: "sent", provider: "evolution" });
    expect(sendWhatsAppMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      preferredProvider: "evolution",
      text: expect.stringContaining("print so da parte do desconto"),
      metadata: expect.objectContaining({
        source: "deterministic_whatsapp_auto_reply",
        model_used: "deterministic",
      }),
    }));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_sales_reply_auto_sent",
        }),
      }),
    ]));
  });

  it("envia automaticamente para contato atribuido quando autonomia permite atribuidos", async () => {
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

    expect(prepared.autoSendResult).toEqual({
      attempted: true,
      status: "sent",
      provider: "evolution",
    });
    expect(sendWhatsAppMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      text: "Boa tarde. Como posso te ajudar hoje?",
    }));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_sales_reply_prepared",
          payload: expect.objectContaining({
            first_response_policy: expect.objectContaining({
              can_auto_send: true,
              assigned_contact_auto_send: true,
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
    expect(inserts.filter((insert) => insert.table === "system_event_logs")).toHaveLength(1);
  });

  it("usa o socio virtual MAYUS para conduzir WhatsApp e executar acoes simples", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
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
    expect(prepared.operatingPartnerActionResults).toEqual([
      { type: "create_crm_lead", status: "executed", detail: "Lead criado no CRM.", record_id: "crm-1" },
    ]);
    expect(buildSalesLlmReplyMock).not.toHaveBeenCalled();
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

  it("nao empilha Sales LLM quando o socio virtual expira no webhook", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    buildMayusOperatingPartnerDecisionMock.mockRejectedValueOnce(new Error("Timeout em MAYUS Operating Partner apos 8000ms."));
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
          }),
        }),
      }),
    ]));
  });
});
