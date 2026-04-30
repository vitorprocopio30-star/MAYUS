import { describe, expect, it, vi, beforeEach } from "vitest";

const handleWhatsAppInternalCommandMock = vi.hoisted(() => vi.fn());
const prepareWhatsAppSalesReplyForContactMock = vi.hoisted(() => vi.fn());
const createClientMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mayus/whatsapp-command-runtime", () => ({
  handleWhatsAppInternalCommand: handleWhatsAppInternalCommandMock,
}));

vi.mock("@/lib/growth/whatsapp-sales-reply-runtime", () => ({
  prepareWhatsAppSalesReplyForContact: prepareWhatsAppSalesReplyForContactMock,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

function buildSupabaseMock() {
  const messageInserts: unknown[] = [];
  return {
    messageInserts,
    from: vi.fn((table: string) => {
      if (table === "tenant_integrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: [{ tenant_id: "tenant-1", instance_name: "http://evolution.local|mayus-dutra" }],
              error: null,
            })),
          })),
        };
      }

      if (table === "whatsapp_contacts") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({ data: null })),
              })),
            })),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({ data: { id: "contact-1" }, error: null })),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }

      if (table === "whatsapp_messages") {
        return {
          insert: vi.fn(async (rows: unknown[]) => {
            messageInserts.push(...rows);
            return { error: null };
          }),
        };
      }

      return {};
    }),
  };
}

describe("/api/evolution-webhook", () => {
  let supabaseMock: ReturnType<typeof buildSupabaseMock>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.EVOLUTION_WEBHOOK_SECRET;
    supabaseMock = buildSupabaseMock();
    createClientMock.mockReturnValue(supabaseMock);
    handleWhatsAppInternalCommandMock.mockResolvedValue({ handled: true, sent: true, intent: "daily_playbook" });
  });

  it("processa mensagens da Evolution em formato MESSAGES_UPSERT", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/evolution-webhook", {
      method: "POST",
      body: JSON.stringify({
        event: "MESSAGES_UPSERT",
        instance: "mayus-dutra",
        data: {
          key: {
            remoteJid: "5521999990000@s.whatsapp.net",
            fromMe: false,
            id: "msg-1",
          },
          pushName: "Cliente Teste",
          message: {
            conversation: "Mayus, relatorio do escritorio",
          },
        },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, internal_command: true });
    expect(handleWhatsAppInternalCommandMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      senderPhone: "5521999990000@s.whatsapp.net",
      content: "Mayus, relatorio do escritorio",
      contactId: "contact-1",
      source: "evolution_webhook",
    }));
    expect(supabaseMock.messageInserts).toEqual([
      expect.objectContaining({
        tenant_id: "tenant-1",
        contact_id: "contact-1",
        direction: "inbound",
        content: "Mayus, relatorio do escritorio",
        message_id_from_evolution: "msg-1",
        status: "delivered",
      }),
    ]);
    expect(prepareWhatsAppSalesReplyForContactMock).not.toHaveBeenCalled();
  });
});
