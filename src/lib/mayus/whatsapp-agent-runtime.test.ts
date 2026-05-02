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

function makeQuery(result: any) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
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

    expect(inferWhatsAppMayusIntent({ messages: supportMessages })).toBe("support");
    expect(inferWhatsAppMayusIntent({ messages: salesMessages })).toBe("sales");
    expect(inferWhatsAppMayusAgentRole({ intent: "sales", messages: salesMessages })).toBe("sdr");
    expect(inferWhatsAppMayusAgentRole({ intent: "sales", messages: closerMessages })).toBe("closer");
  });

  it("prioriza handoff humano mesmo quando a mensagem menciona processo", () => {
    const messages = [{ direction: "inbound", content: "Quero falar com um advogado sobre o meu processo", message_type: "text", created_at: null }];

    expect(inferWhatsAppMayusIntent({ messages })).toBe("human_handoff");
  });

  it("mantem lead novo em vendas quando processo e contexto comercial", () => {
    const messages = [{ direction: "inbound", content: "Preciso abrir um processo contra o INSS", message_type: "text", created_at: null }];

    expect(inferWhatsAppMayusIntent({ messages })).toBe("sales");
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
