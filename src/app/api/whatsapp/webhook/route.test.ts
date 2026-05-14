import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const handleWhatsAppInternalCommandMock = vi.hoisted(() => vi.fn());
const enqueueWhatsAppReplyMock = vi.hoisted(() => vi.fn());
const processPendingWhatsAppRepliesBatchMock = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/mayus/whatsapp-command-runtime", () => ({
  handleWhatsAppInternalCommand: handleWhatsAppInternalCommandMock,
}));

vi.mock("@/lib/whatsapp/reply-processor", () => ({
  enqueueWhatsAppReply: enqueueWhatsAppReplyMock,
  processPendingWhatsAppRepliesBatch: processPendingWhatsAppRepliesBatchMock,
}));

function buildSupabaseMock() {
  const messageInserts: unknown[] = [];
  const notificationInserts: unknown[] = [];

  return {
    messageInserts,
    notificationInserts,
    from: vi.fn((table: string) => {
      if (table === "tenant_integrations") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(async () => ({
              data: [{ tenant_id: "tenant-1", instance_name: "phone-number-1|waba-1" }],
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
                single: vi.fn(async () => ({
                  data: { id: "contact-1", unread_count: 0, department_id: "dept-1" },
                  error: null,
                })),
              })),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
        };
      }

      if (table === "whatsapp_messages") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: null, error: null })),
              })),
            })),
          })),
          update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
          insert: vi.fn((rows: unknown[]) => {
            messageInserts.push(...rows);
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { id: "message-1" }, error: null })),
              })),
            };
          }),
        };
      }

      if (table === "notifications") {
        return {
          insert: vi.fn(async (rows: unknown[]) => {
            notificationInserts.push(...rows);
            return { error: null };
          }),
        };
      }

      return {};
    }),
  };
}

function signMetaBody(body: string, secret: string) {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("/api/whatsapp/webhook", () => {
  let supabaseMock: ReturnType<typeof buildSupabaseMock>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    supabaseMock = buildSupabaseMock();
    createClientMock.mockReturnValue(supabaseMock);
    handleWhatsAppInternalCommandMock.mockResolvedValue({ handled: false });
    enqueueWhatsAppReplyMock.mockResolvedValue(undefined);
    processPendingWhatsAppRepliesBatchMock.mockResolvedValue({ picked: 1, processed: 1, failed: 0, auto_sent: 1, results: [] });
    delete process.env.META_APP_SECRET;
    delete process.env.WHATSAPP_APP_SECRET;
  });

  it("enfileira e aciona resposta agentica de texto Meta preservando provider", async () => {
    const { POST } = await import("./route");
    process.env.WHATSAPP_APP_SECRET = "whatsapp-secret";
    const body = JSON.stringify({
      entry: [{
        changes: [{
          field: "messages",
          value: {
            metadata: { phone_number_id: "phone-number-1" },
            contacts: [{ profile: { name: "Cliente Teste" } }],
            messages: [{
              id: "wamid-1",
              from: "5521999990000",
              type: "text",
              text: { body: "Posso mandar meu contracheque para analise?" },
            }],
          },
        }],
      }],
    });
    const request = new Request("http://localhost/api/whatsapp/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": signMetaBody(body, "whatsapp-secret") },
      body,
    });

    const response = await POST(request as any);
    const responseBody = await response.json();

    expect(response.status).toBe(200);
    expect(responseBody).toEqual({ success: true });
    expect(supabaseMock.messageInserts).toEqual([
      expect.objectContaining({
        tenant_id: "tenant-1",
        contact_id: "contact-1",
        direction: "inbound",
        message_type: "text",
        content: "Posso mandar meu contracheque para analise?",
        metadata: { reply_trigger: "meta_webhook" },
      }),
    ]);
    expect(enqueueWhatsAppReplyMock).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "message-1",
      trigger: "meta_webhook",
      preferredProvider: "meta_cloud",
    }));
    expect(processPendingWhatsAppRepliesBatchMock).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "message-1",
      limit: 1,
    }));
  });

  it("rejeita POST Meta com assinatura invalida quando app secret esta configurado", async () => {
    process.env.WHATSAPP_APP_SECRET = "whatsapp-secret";
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/whatsapp/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=assinatura-invalida" },
      body: JSON.stringify({ entry: [] }),
    }) as any);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ success: false, error: "invalid_signature" });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });
});
