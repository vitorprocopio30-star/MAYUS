import { describe, expect, it, vi, beforeEach } from "vitest";

const handleWhatsAppInternalCommandMock = vi.hoisted(() => vi.fn());
const prepareWhatsAppSalesReplyForContactMock = vi.hoisted(() => vi.fn());
const createClientMock = vi.hoisted(() => vi.fn());
const listTenantIntegrationsResolvedMock = vi.hoisted(() => vi.fn());
const enqueueWhatsAppReplyMock = vi.hoisted(() => vi.fn());
const processPendingWhatsAppRepliesBatchMock = vi.hoisted(() => vi.fn());
const sendWhatsAppMessageMock = vi.hoisted(() => vi.fn());
const processPendingWhatsAppMediaBatchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mayus/whatsapp-command-runtime", () => ({
  handleWhatsAppInternalCommand: handleWhatsAppInternalCommandMock,
}));

vi.mock("@/lib/growth/whatsapp-sales-reply-runtime", () => ({
  prepareWhatsAppSalesReplyForContact: prepareWhatsAppSalesReplyForContactMock,
}));

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsResolved: listTenantIntegrationsResolvedMock,
}));

vi.mock("@/lib/whatsapp/reply-processor", () => ({
  enqueueWhatsAppReply: enqueueWhatsAppReplyMock,
  processPendingWhatsAppRepliesBatch: processPendingWhatsAppRepliesBatchMock,
}));

vi.mock("@/lib/whatsapp/media-processor", () => ({
  processPendingWhatsAppMediaBatch: processPendingWhatsAppMediaBatchMock,
}));

vi.mock("@/lib/whatsapp/send-message", () => ({
  sendWhatsAppMessage: sendWhatsAppMessageMock,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

function buildSupabaseMock() {
  const messageInserts: unknown[] = [];
  const contactInserts: unknown[] = [];
  const messageUpdates: unknown[] = [];
  const notificationInserts: unknown[] = [];
  return {
    messageInserts,
    contactInserts,
    messageUpdates,
    notificationInserts,
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
              single: vi.fn(async () => {
                contactInserts.push({ tenant_id: "tenant-1", phone_number: "5521999990000@s.whatsapp.net" });
                return { data: { id: "contact-1" }, error: null };
              }),
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
          update: vi.fn((values: unknown) => {
            messageUpdates.push(values);
            return { eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })) };
          }),
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

      if (table === "notifications" || table === "system_event_logs") {
        return {
          insert: vi.fn(async (rows: unknown[] | unknown) => {
            notificationInserts.push(...(Array.isArray(rows) ? rows : [rows]));
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
    listTenantIntegrationsResolvedMock.mockResolvedValue([{
      provider: "evolution",
      api_key: "evolution-key",
      instance_name: "http://evolution.local|mayus-dutra",
    }]);
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ profilePictureUrl: "https://cdn.example/avatar.jpg" }), { status: 200 })) as any;
    handleWhatsAppInternalCommandMock.mockResolvedValue({ handled: true, sent: true, intent: "daily_playbook" });
    enqueueWhatsAppReplyMock.mockResolvedValue(undefined);
    processPendingWhatsAppRepliesBatchMock.mockResolvedValue({ picked: 1, processed: 1, failed: 0, auto_sent: 1, results: [] });
    processPendingWhatsAppMediaBatchMock.mockResolvedValue({ picked: 1, processed: 1, failed: 0, replies_prepared: 1, results: [] });
    sendWhatsAppMessageMock.mockResolvedValue({ provider: "evolution", apiResponse: { ok: true } });
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
    expect(global.fetch).toHaveBeenCalledWith(
      "http://evolution.local/chat/fetchProfilePictureUrl/mayus-dutra",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ number: "5521999990000" }),
      }),
    );
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
    expect(enqueueWhatsAppReplyMock).not.toHaveBeenCalled();
  });

  it("atualiza messages.update sem inserir mensagem duplicada", async () => {
    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/evolution-webhook", {
      method: "POST",
      body: JSON.stringify({
        event: "MESSAGES_UPDATE",
        instance: "mayus-dutra",
        data: {
          status: "read",
          key: {
            remoteJid: "5521999990000@s.whatsapp.net",
            fromMe: false,
            id: "msg-1",
          },
          message: {
            conversation: "Mayus, relatorio do escritorio",
          },
        },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, updated: true });
    expect(supabaseMock.messageUpdates).toEqual([{ status: "read" }]);
    expect(supabaseMock.messageInserts).toEqual([]);
  });

  it("salva midia Evolution como pending, confirma recebimento e tenta processar por mensagem", async () => {
    handleWhatsAppInternalCommandMock.mockResolvedValue({ handled: false });
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
            id: "msg-media-1",
          },
          pushName: "Cliente Teste",
          message: {
            imageMessage: {
              caption: "Veja o comprovante",
              mimetype: "image/jpeg",
              fileName: "comprovante.jpg",
              mediaKey: "media-key",
            },
          },
        },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, pending_media: true });
    expect(supabaseMock.messageInserts).toEqual([
      expect.objectContaining({
        tenant_id: "tenant-1",
        contact_id: "contact-1",
        direction: "inbound",
        message_type: "image",
        content: "Veja o comprovante",
        media_url: null,
        media_provider: "evolution",
        media_processing_status: "pending",
        metadata: expect.objectContaining({
          provider_media_id: "msg-media-1",
          media_kind: "image",
          evolution_instance: "mayus-dutra",
        }),
      }),
    ]);
    expect(sendWhatsAppMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      contactId: "contact-1",
      phoneNumber: "5521999990000@s.whatsapp.net",
      preferredProvider: "evolution",
      text: expect.stringContaining("Recebi a imagem"),
      metadata: expect.objectContaining({
        source: "immediate_media_ack",
        model_used: "deterministic",
      }),
    }));
    expect(supabaseMock.messageUpdates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.objectContaining({
          media_ack_sent: true,
          media_ack_source: "immediate_media_ack",
          reply_processing_status: "waiting_media_processing",
        }),
      }),
    ]));
    expect(processPendingWhatsAppMediaBatchMock).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "message-1",
      limit: 1,
    }));
    expect(prepareWhatsAppSalesReplyForContactMock).not.toHaveBeenCalled();
    expect(enqueueWhatsAppReplyMock).not.toHaveBeenCalled();
    expect(processPendingWhatsAppRepliesBatchMock).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("confirma PDF de contracheque com texto especifico", async () => {
    handleWhatsAppInternalCommandMock.mockResolvedValue({ handled: false });
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
            id: "msg-pdf-1",
          },
          pushName: "Cliente Teste",
          message: {
            documentMessage: {
              mimetype: "application/pdf",
              fileName: "contracheque.pdf",
              mediaKey: "media-key",
            },
          },
        },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(sendWhatsAppMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining("Recebi o contracheque"),
    }));
    expect(processPendingWhatsAppMediaBatchMock).toHaveBeenCalledWith(expect.objectContaining({ messageId: "message-1" }));
  });

  it("enfileira e processa resposta de texto Evolution imediatamente preservando provider", async () => {
    handleWhatsAppInternalCommandMock.mockResolvedValue({ handled: false });
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
            id: "msg-text-2",
          },
          pushName: "Cliente Teste",
          message: {
            conversation: "Quero falar com o escritorio",
          },
        },
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(enqueueWhatsAppReplyMock).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "message-1",
      trigger: "evolution_webhook",
      preferredProvider: "evolution",
    }));
    expect(processPendingWhatsAppRepliesBatchMock).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "message-1",
      limit: 1,
    }));
    expect(prepareWhatsAppSalesReplyForContactMock).not.toHaveBeenCalled();
  });

  it("responde contracheque por fast-path seguro sem esperar LLM", async () => {
    handleWhatsAppInternalCommandMock.mockResolvedValue({ handled: false });
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
            id: "msg-contracheque-1",
          },
          pushName: "Cliente Teste",
          message: {
            conversation: "Posso mandar meu contracheque para analise?",
          },
        },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, immediate_reply: true });
    expect(sendWhatsAppMessageMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      contactId: "contact-1",
      phoneNumber: "5521999990000@s.whatsapp.net",
      preferredProvider: "evolution",
      text: expect.stringContaining("Pode mandar sim"),
      metadata: expect.objectContaining({
        source: "immediate_safe_deterministic_reply",
        model_used: "deterministic",
      }),
    }));
    expect(enqueueWhatsAppReplyMock).not.toHaveBeenCalled();
    expect(processPendingWhatsAppRepliesBatchMock).not.toHaveBeenCalled();
    expect(supabaseMock.messageUpdates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.objectContaining({
          reply_processing_status: "processed",
          reply_auto_sent: true,
          reply_source: "immediate_safe_deterministic_reply",
        }),
      }),
    ]));
  });

  it("mantem webhook Evolution 200 quando processamento imediato falha", async () => {
    handleWhatsAppInternalCommandMock.mockResolvedValue({ handled: false });
    processPendingWhatsAppRepliesBatchMock.mockRejectedValueOnce(new Error("processor indisponivel"));
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
            id: "msg-text-3",
          },
          pushName: "Cliente Teste",
          message: {
            conversation: "Quero falar com o escritorio",
          },
        },
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true });
    expect(enqueueWhatsAppReplyMock).toHaveBeenCalledWith(expect.objectContaining({ messageId: "message-1" }));
    expect(processPendingWhatsAppRepliesBatchMock).toHaveBeenCalledWith(expect.objectContaining({ messageId: "message-1" }));
  });
});
