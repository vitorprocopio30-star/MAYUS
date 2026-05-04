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
      intent: "sales_qualification",
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

    expect(prepared.operatingPartnerDecision?.intent).toBe("sales_qualification");
    expect(prepared.operatingPartnerActionResults).toEqual([
      { type: "create_crm_lead", status: "executed", detail: "Lead criado no CRM.", record_id: "crm-1" },
    ]);
    expect(buildSalesLlmReplyMock).not.toHaveBeenCalled();
    expect(executeMayusOperatingPartnerActionsMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      contact: expect.objectContaining({ id: "contact-1" }),
      decision: expect.objectContaining({ intent: "sales_qualification" }),
    }));
    expect(sendWhatsAppMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      text: "Entendi. Esse desconto aparece com qual nome no contracheque?",
      metadata: expect.objectContaining({
        source: "mayus_operating_partner_auto_reply",
        intent: "sales_qualification",
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
});
