import { describe, expect, it, vi, beforeEach } from "vitest";

const prepareWhatsAppSalesReplyForContactMock = vi.hoisted(() => vi.fn());
const sendFrontdeskWhatsAppReplyMock = vi.hoisted(() => vi.fn());
const getLegalCaseContextSnapshotMock = vi.hoisted(() => vi.fn());
const buildSupportCaseStatusContractMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/growth/whatsapp-sales-reply-runtime", () => ({
  prepareWhatsAppSalesReplyForContact: prepareWhatsAppSalesReplyForContactMock,
  sendFrontdeskWhatsAppReply: sendFrontdeskWhatsAppReplyMock,
}));

vi.mock("@/lib/lex/case-context", () => ({
  getLegalCaseContextSnapshot: getLegalCaseContextSnapshotMock,
  buildSupportCaseStatusContract: buildSupportCaseStatusContractMock,
}));

import {
  inferWhatsAppMayusAgentRole,
  inferWhatsAppMayusIntent,
  prepareWhatsAppMayusReplyForContact,
} from "./whatsapp-agent-runtime";

function makeQuery(result: any, onInsert?: (payload: any) => void) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    insert: vi.fn(async (payload: any) => {
      onInsert?.(payload);
      return { error: null };
    }),
  };
  return query;
}

describe("whatsapp MAYUS agent runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendFrontdeskWhatsAppReplyMock.mockResolvedValue({
      sent: true,
      provider: "evolution",
      apiResponse: { key: { id: "msg-1" } },
      blockCount: 1,
      typingPresenceUsed: true,
    });
    buildSupportCaseStatusContractMock.mockReturnValue({
      responseMode: "answer",
      confidence: "high",
      processTaskId: "process-task-1",
      processLabel: "0000001-00.2026.8.26.0000",
      clientLabel: "Maria Silva",
      statusHeadline: "Caso em fase de contestacao.",
      progressSummary: "O caso segue em contestacao com contexto consolidado.",
      currentPhase: "Contestacao",
      nextStep: "Aguardar juntada de documento complementar.",
      pendingItems: ["Comprovante de residencia"],
      summary: "O caso segue em contestacao.",
      grounding: { factualSources: ["resumo do Case Brain"], inferenceNotes: [], missingSignals: [] },
      handoffReason: null,
    });
    getLegalCaseContextSnapshotMock.mockResolvedValue({ processTask: { id: "process-task-1" } });
  });

  it("classifica suporte, SDR e closer pela conversa", () => {
    const supportMessages = [{ direction: "inbound", content: "Qual o andamento do meu processo?", message_type: "text", created_at: null }];
    const salesMessages = [{ direction: "inbound", content: "Preciso de ajuda com uma negativa do INSS", message_type: "text", created_at: null }];
    const closerMessages = [{ direction: "inbound", content: "Qual o valor dos honorarios?", message_type: "text", created_at: null }];
    const humanMessages = [{ direction: "inbound", content: "Prefiro falar com uma pessoa da equipe", message_type: "text", created_at: null }];
    const proposalMessages = [{ direction: "inbound", content: "Pode mandar a proposta e forma de pagamento?", message_type: "text", created_at: null }];
    const meetingMessages = [{ direction: "inbound", content: "Quero marcar uma reuniao ou ligacao sobre RMC", message_type: "text", created_at: null }];

    expect(inferWhatsAppMayusIntent({ messages: supportMessages })).toBe("support");
    expect(inferWhatsAppMayusIntent({ messages: salesMessages })).toBe("sales");
    expect(inferWhatsAppMayusIntent({ messages: humanMessages })).toBe("human_handoff");
    expect(inferWhatsAppMayusIntent({ messages: meetingMessages })).toBe("sales");
    expect(inferWhatsAppMayusIntent({ messages: salesMessages, contact: { lead_tags: ["Suporte"] } })).toBe("support");
    expect(inferWhatsAppMayusAgentRole({ intent: "sales", messages: salesMessages })).toBe("sdr");
    expect(inferWhatsAppMayusAgentRole({ intent: "sales", messages: closerMessages })).toBe("closer");
    expect(inferWhatsAppMayusAgentRole({ intent: "sales", messages: proposalMessages })).toBe("closer");
    expect(inferWhatsAppMayusAgentRole({ intent: "sales", messages: meetingMessages })).toBe("closer");
  });

  it("prioriza handoff humano mesmo quando a mensagem menciona processo", () => {
    const messages = [{ direction: "inbound", content: "Quero falar com um advogado sobre o meu processo", message_type: "text", created_at: null }];

    expect(inferWhatsAppMayusIntent({ messages })).toBe("human_handoff");
  });

  it("mantem lead novo em vendas quando processo e contexto comercial", () => {
    const messages = [{ direction: "inbound", content: "Preciso abrir um processo contra o INSS", message_type: "text", created_at: null }];

    expect(inferWhatsAppMayusIntent({ messages })).toBe("sales");
  });

  it("usa IA operando como padrao quando o escritorio nao escolheu somente rascunho", async () => {
    prepareWhatsAppSalesReplyForContactMock.mockResolvedValue({
      contact: { id: "contact-1" },
      metadata: { mode: "suggested_reply", suggested_reply: "Oi", may_auto_send: true, auto_sent: true },
    });
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeQuery({ data: { id: "contact-1", name: "Lead", phone_number: "5511999999999", assigned_user_id: null, lead_tags: [] }, error: null });
        }
        if (table === "whatsapp_messages") {
          return makeQuery({ data: [{ direction: "inbound", content: "Quero marcar uma reuniao sobre RMC", message_type: "text", created_at: null }], error: null });
        }
        if (table === "tenant_settings") {
          return makeQuery({ data: { ai_features: {} }, error: null });
        }
        return { insert: vi.fn(async () => ({ error: null })) };
      }),
    };

    const prepared = await prepareWhatsAppMayusReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      autoSendFirstResponse: true,
    });

    expect(prepared.intent).toBe("sales");
    expect(prepared.agentRole).toBe("closer");
    expect(prepared.metadata.governance_mode).toBe("ia_only");
    expect(prepareWhatsAppSalesReplyForContactMock).toHaveBeenCalledWith(expect.objectContaining({
      autoSendFirstResponse: true,
    }));
  });

  it("autoenvia suporte quando identifica caso com base segura", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeQuery({
            data: { id: "contact-1", name: "Maria Silva", phone_number: "5511999999999", assigned_user_id: null, lead_tags: [] },
            error: null,
          });
        }

        if (table === "whatsapp_messages") {
          return makeQuery({
            data: [{ direction: "inbound", content: "Oi, qual o andamento do meu processo?", message_type: "text", created_at: "2026-05-01T10:00:00.000Z" }],
            error: null,
          });
        }

        if (table === "tenant_settings") {
          return makeQuery({ data: { ai_features: { contract_flow_mode: "hybrid" } }, error: null });
        }

        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
        };
      }),
    };

    const prepared = await prepareWhatsAppMayusReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      notify: true,
      autoSendFirstResponse: true,
    });

    expect(prepared.intent).toBe("support");
    expect(prepared.agentRole).toBe("support");
    expect(prepared.metadata.auto_sent).toBe(true);
    expect(prepared.metadata.decision_status).toBe("auto_sent");
    expect(prepared.metadata.next_action).toBe("no_action");
    expect(prepared.metadata.decision_stage).toBe("support_status");
    expect(prepared.metadata.latest_inbound_at).toBe("2026-05-01T10:00:00.000Z");
    expect(sendFrontdeskWhatsAppReplyMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      contactId: "contact-1",
      phoneNumber: "5511999999999",
      text: expect.stringContaining("Andamento:"),
    }));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_mayus_reply_prepared",
          payload: expect.objectContaining({ intent: "support", may_auto_send: true }),
        }),
      }),
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({ event_name: "whatsapp_mayus_reply_auto_sent" }),
      }),
    ]));
  });

  it("responde suporte pedindo identificacao quando ainda nao achou o caso", async () => {
    getLegalCaseContextSnapshotMock.mockRejectedValueOnce(new Error("case_not_identified"));
    const inserts: Array<{ table: string; payload: any }> = [];
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeQuery({
            data: { id: "contact-1", name: "Maria Silva", phone_number: "5511999999999", assigned_user_id: null, lead_tags: [] },
            error: null,
          });
        }

        if (table === "whatsapp_messages") {
          return makeQuery({
            data: [{ direction: "inbound", content: "Oi, quero suporte do meu caso", message_type: "text", created_at: "2026-05-01T10:00:00.000Z" }],
            error: null,
          });
        }

        if (table === "tenant_settings") {
          return makeQuery({ data: { ai_features: {} }, error: null });
        }

        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
        };
      }),
    };

    const prepared = await prepareWhatsAppMayusReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      notify: true,
      autoSendFirstResponse: true,
    });

    expect(prepared.intent).toBe("support");
    expect(prepared.metadata.governance_mode).toBe("ia_only");
    expect(prepared.metadata.auto_sent).toBe(true);
    expect((prepared.metadata as any).requires_human_review).toBe(false);
    expect(sendFrontdeskWhatsAppReplyMock).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("confirme o processo correto"),
    }));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_mayus_reply_prepared",
          payload: expect.objectContaining({ intent: "support", may_auto_send: true }),
        }),
      }),
    ]));
  });

  it("prepara handoff sem autoenvio quando o lead pede humano", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeQuery({
            data: { id: "contact-1", name: "Ana Paula", phone_number: "5511999999999", assigned_user_id: null, lead_tags: [] },
            error: null,
          });
        }

        if (table === "whatsapp_messages") {
          return makeQuery({
            data: [{ direction: "inbound", content: "Quero falar com um advogado responsavel.", message_type: "text", created_at: "2026-05-01T10:00:00.000Z" }],
            error: null,
          });
        }

        if (table === "tenant_settings") {
          return makeQuery({ data: { ai_features: { contract_flow_mode: "hybrid" } }, error: null });
        }

        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
        };
      }),
    };

    const prepared = await prepareWhatsAppMayusReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      notify: true,
      autoSendFirstResponse: true,
    });

    expect(prepared.intent).toBe("human_handoff");
    expect(prepared.agentRole).toBe("human");
    expect(prepared.metadata.auto_sent).toBe(false);
    expect(prepared.metadata.decision_status).toBe("human_review_required");
    expect(prepared.metadata.next_action).toBe("notify_human");
    expect(prepared.metadata.handoff_reason).toBe("human_requested");
    expect(prepareWhatsAppSalesReplyForContactMock).not.toHaveBeenCalled();
    expect(sendFrontdeskWhatsAppReplyMock).not.toHaveBeenCalled();
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_mayus_reply_prepared",
          payload: expect.objectContaining({ intent: "human_handoff", may_auto_send: false }),
        }),
      }),
    ]));
  });

  it("suprime reprocessamento do mesmo inbound antes de autoenviar de novo", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const latestInboundAt = "2026-05-01T10:00:00.000Z";
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeQuery({ data: { id: "contact-1", name: "Lead", phone_number: "5511999999999", assigned_user_id: null, lead_tags: [] }, error: null });
        }
        if (table === "whatsapp_messages") {
          return makeQuery({ data: [{ direction: "inbound", content: "Preciso de ajuda com aposentadoria", message_type: "text", created_at: latestInboundAt }], error: null });
        }
        if (table === "tenant_settings") {
          return makeQuery({ data: { ai_features: { contract_flow_mode: "hybrid" } }, error: null });
        }
        if (table === "system_event_logs") {
          return makeQuery({
            data: {
              id: "event-1",
              created_at: "2026-05-01T10:00:03.000Z",
              payload: { contact_id: "contact-1", latest_inbound_at: latestInboundAt, decision_status: "prepared" },
            },
            error: null,
          }, (payload) => inserts.push({ table, payload }));
        }
        return { insert: vi.fn(async (payload: any) => { inserts.push({ table, payload }); return { error: null }; }) };
      }),
    };

    const prepared = await prepareWhatsAppMayusReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      notify: true,
      autoSendFirstResponse: true,
    });

    expect(prepared.intent).toBe("sales");
    expect(prepared.metadata.decision_status).toBe("duplicate_suppressed");
    expect(prepared.metadata.next_action).toBe("skip_duplicate");
    expect(prepared.metadata.latest_inbound_at).toBe(latestInboundAt);
    expect(prepareWhatsAppSalesReplyForContactMock).not.toHaveBeenCalled();
    expect(sendFrontdeskWhatsAppReplyMock).not.toHaveBeenCalled();
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "whatsapp_mayus_reply_duplicate_suppressed",
          payload: expect.objectContaining({
            decision_status: "duplicate_suppressed",
            duplicate_of_event_id: "event-1",
          }),
        }),
      }),
    ]));
  });

  it("respeita human_only ao rotear venda para rascunho", async () => {
    prepareWhatsAppSalesReplyForContactMock.mockResolvedValue({
      contact: { id: "contact-1" },
      metadata: { mode: "suggested_reply", suggested_reply: "Oi", may_auto_send: false, auto_sent: false },
    });
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeQuery({ data: { id: "contact-1", name: "Lead", phone_number: "5511999999999", assigned_user_id: null, lead_tags: [] }, error: null });
        }
        if (table === "whatsapp_messages") {
          return makeQuery({ data: [{ direction: "inbound", content: "Preciso de ajuda com aposentadoria", message_type: "text", created_at: null }], error: null });
        }
        if (table === "tenant_settings") {
          return makeQuery({ data: { ai_features: { contract_flow_mode: "human_only" } }, error: null });
        }
        return { insert: vi.fn(async () => ({ error: null })) };
      }),
    };

    await prepareWhatsAppMayusReplyForContact({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "meta_webhook",
      autoSendFirstResponse: true,
    });

    expect(prepareWhatsAppSalesReplyForContactMock).toHaveBeenCalledWith(expect.objectContaining({
      autoSendFirstResponse: false,
    }));
  });
});
