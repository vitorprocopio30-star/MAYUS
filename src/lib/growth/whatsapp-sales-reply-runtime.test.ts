import { describe, expect, it, vi } from "vitest";

const listTenantIntegrationsResolvedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsResolved: listTenantIntegrationsResolvedMock,
}));

import { prepareWhatsAppSalesReplyForContact, splitWhatsAppReplyBlocks } from "./whatsapp-sales-reply-runtime";

function makeSelectQuery(result: any, onInsert?: (payload: any) => void) {
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

describe("prepareWhatsAppSalesReplyForContact", () => {
  it("divide resposta em blocos curtos para WhatsApp", () => {
    const blocks = splitWhatsAppReplyBlocks([
      "Oi, Maria. Aqui e o MAYUS.",
      "Vou entender seu caso antes de te responder no escuro.",
      "Me diga qual e a urgencia agora e se existe prazo.",
    ].join("\n\n"), 80, 3);

    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((block) => block.length <= 80)).toBe(true);
  });

  it("prepara resposta, audita evento e notifica sem enviar WhatsApp", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    listTenantIntegrationsResolvedMock.mockResolvedValue([]);
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "whatsapp_contacts") {
          return makeSelectQuery({
            data: { id: "contact-1", name: "Maria Silva", phone_number: "5511999999999" },
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

  it("autoenvia resposta pela Evolution em blocos com presenca de digitando", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/chat/sendPresence/")) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      return new Response(JSON.stringify({ key: { id: "msg-sent" } }), { status: 200 });
    });
    global.fetch = fetchMock as any;
    listTenantIntegrationsResolvedMock.mockResolvedValue([{
      provider: "evolution",
      api_key: "evolution-key",
      instance_name: "http://187.77.240.109:32768|mayus-dutra",
    }]);

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
                firm_name: "Dutra Advocacia",
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
              { direction: "inbound", content: "Oi, preciso de ajuda com meu beneficio negado.", message_type: "text", created_at: "2026-04-28T10:00:00.000Z" },
            ],
            error: null,
          }, (payload) => {
            inserts.push({ table, payload });
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
      notify: true,
      autoSendFirstResponse: true,
    });

    expect(prepared.metadata.auto_sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://187.77.240.109:32768/chat/sendPresence/mayus-dutra",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("composing"),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "http://187.77.240.109:32768/message/sendText/mayus-dutra",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"presence\":\"composing\""),
      }),
    );
    expect(inserts.some((item) => item.table === "whatsapp_messages" && Array.isArray(item.payload))).toBe(true);
    expect(inserts.some((item) => (
      item.table === "system_event_logs"
      && item.payload.event_name === "whatsapp_sales_reply_auto_sent"
      && item.payload.payload.typing_presence_used === true
    ))).toBe(true);
  });
});
