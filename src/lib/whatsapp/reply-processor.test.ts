import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareWhatsAppSalesReplyForContact: vi.fn(),
}));

vi.mock("@/lib/growth/whatsapp-sales-reply-runtime", () => ({
  prepareWhatsAppSalesReplyForContact: mocks.prepareWhatsAppSalesReplyForContact,
}));

import { enqueueWhatsAppReply, processPendingWhatsAppRepliesBatch } from "./reply-processor";

function makeSupabase(row: any, options: { newerMessage?: boolean } = {}) {
  const updates: Array<{ table: string; payload: any }> = [];
  const inserts: Array<{ table: string; payload: any }> = [];
  const makeSelectQuery = () => {
    const filters: Array<[string, unknown]> = [];
    let hasCreatedAtGreaterThan = false;
    const query: any = {
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      }),
      gt: vi.fn((column: string) => {
        if (column === "created_at") hasCreatedAtGreaterThan = true;
        return query;
      }),
      order: vi.fn(() => query),
      limit: vi.fn(async () => {
        if (hasCreatedAtGreaterThan) {
          return { data: options.newerMessage ? [{ id: "newer-message" }] : [], error: null };
        }
        if (row) {
          const statusFilter = filters.find(([column]) => column === "metadata->>reply_processing_status")?.[1];
          if (statusFilter && row.metadata?.reply_processing_status !== statusFilter) return { data: [], error: null };
          return { data: [row], error: null };
        }
        return { data: [], error: null };
      }),
      maybeSingle: vi.fn(async () => ({ data: row ? { metadata: row.metadata || null } : null, error: null })),
    };
    return query;
  };
  const supabase: any = {
    from: vi.fn((table: string) => {
      if (table === "whatsapp_messages") {
        return {
          select: vi.fn(() => makeSelectQuery()),
          update: vi.fn((payload: any) => {
            updates.push({ table, payload });
            const query: any = {
              eq: vi.fn(() => query),
              select: vi.fn(() => query),
              maybeSingle: vi.fn(async () => ({
                data: row?.claimPending === false ? null : { id: row?.id || "message-1", metadata: payload.metadata || null },
                error: null,
              })),
            };
            return query;
          }),
        };
      }

      if (table === "system_event_logs" || table === "notifications") {
        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  limit: vi.fn(async () => ({ data: [], error: null })),
                })),
              })),
            })),
          })),
        };
      }

      return {};
    }),
  };

  return { supabase, updates, inserts };
}

describe("whatsapp reply processor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enfileira resposta preservando metadata existente", async () => {
    const row = { metadata: { source: "webhook" } };
    const { supabase, updates } = makeSupabase(row);

    await enqueueWhatsAppReply({ supabase, messageId: "message-1", trigger: "meta_webhook" });

    expect(updates[0].payload.metadata).toEqual(expect.objectContaining({
      source: "webhook",
      reply_processing_status: "pending",
      reply_trigger: "meta_webhook",
      reply_preferred_provider: null,
    }));
  });

  it("enfileira provider preferido para preservar canal de resposta", async () => {
    const row = { metadata: {} };
    const { supabase, updates } = makeSupabase(row);

    await enqueueWhatsAppReply({
      supabase,
      messageId: "message-1",
      trigger: "meta_webhook",
      preferredProvider: "meta_cloud",
    });

    expect(updates[0].payload.metadata).toEqual(expect.objectContaining({
      reply_trigger: "meta_webhook",
      reply_preferred_provider: "meta_cloud",
    }));
  });

  it("processa resposta pendente fora do webhook", async () => {
    const row = {
      id: "message-1",
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      direction: "inbound",
      media_processing_status: "none",
      created_at: new Date().toISOString(),
      metadata: { reply_processing_status: "pending", reply_trigger: "evolution_webhook", reply_preferred_provider: "evolution" },
    };
    const { supabase, updates, inserts } = makeSupabase(row);
    mocks.prepareWhatsAppSalesReplyForContact.mockResolvedValueOnce({
      autoSendResult: { status: "sent" },
    });

    const result = await processPendingWhatsAppRepliesBatch({ supabase, limit: 1 });

    expect(result).toMatchObject({ picked: 1, processed: 1, failed: 0, auto_sent: 1 });
    expect(mocks.prepareWhatsAppSalesReplyForContact).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "evolution_webhook",
      preferredProvider: "evolution",
      autoSendFirstResponse: true,
    }));
    expect(updates.some((item) => item.payload.metadata?.reply_processing_status === "processing")).toBe(true);
    expect(updates.some((item) => item.payload.metadata?.reply_processing_status === "processed")).toBe(true);
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "system_event_logs",
      payload: expect.objectContaining({
        event_name: "whatsapp_reply_processed",
        status: "ok",
      }),
    }));
  });

  it("registra falha sanitizada ao preparar resposta", async () => {
    const row = {
      id: "message-failed",
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      direction: "inbound",
      media_processing_status: "none",
      created_at: new Date().toISOString(),
      metadata: { reply_processing_status: "pending", reply_trigger: "meta_webhook" },
    };
    const { supabase, updates, inserts } = makeSupabase(row);
    mocks.prepareWhatsAppSalesReplyForContact.mockRejectedValueOnce(new Error("token secreto abc falhou"));

    const result = await processPendingWhatsAppRepliesBatch({ supabase, limit: 1 });

    expect(result).toMatchObject({ picked: 1, processed: 0, failed: 1 });
    expect(updates.some((item) => item.payload.metadata?.reply_processing_status === "failed")).toBe(true);
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "system_event_logs",
      payload: expect.objectContaining({
        event_name: "whatsapp_reply_failed",
        status: "error",
      }),
    }));
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "notifications",
      payload: expect.objectContaining({
        title: "WhatsApp: falha ao preparar resposta",
        type: "error",
      }),
    }));
  });

  it("pula processamento quando outra execucao ja claimou a resposta", async () => {
    const row = {
      id: "message-claimed",
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      direction: "inbound",
      media_processing_status: "none",
      created_at: new Date().toISOString(),
      claimPending: false,
      metadata: { reply_processing_status: "pending", reply_trigger: "evolution_webhook" },
    };
    const { supabase, updates, inserts } = makeSupabase(row);

    const result = await processPendingWhatsAppRepliesBatch({ supabase, limit: 1 });

    expect(result).toMatchObject({ picked: 1, processed: 0, failed: 0, skipped: 1, auto_sent: 0 });
    expect(result.results[0]).toEqual(expect.objectContaining({
      message_id: "message-claimed",
      status: "skipped",
      skipped_reason: "already_claimed",
    }));
    expect(mocks.prepareWhatsAppSalesReplyForContact).not.toHaveBeenCalled();
    expect(updates.some((item) => item.payload.metadata?.reply_processing_status === "processing")).toBe(true);
    expect(updates.some((item) => item.payload.metadata?.reply_processing_status === "processed")).toBe(false);
    expect(inserts).toEqual([]);
  });

  it("recupera resposta travada em processing e reprocessa quando nao houve outbound mais novo", async () => {
    const row = {
      id: "message-stale-processing",
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      direction: "inbound",
      media_processing_status: "none",
      created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      metadata: {
        reply_processing_status: "processing",
        reply_processing_started_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
        reply_trigger: "evolution_webhook",
        reply_preferred_provider: "evolution",
      },
    };
    const { supabase, updates, inserts } = makeSupabase(row, { newerMessage: false });
    mocks.prepareWhatsAppSalesReplyForContact.mockResolvedValueOnce({
      autoSendResult: { status: "sent" },
    });

    const result = await processPendingWhatsAppRepliesBatch({ supabase, limit: 1 });

    expect(result).toMatchObject({ picked: 1, processed: 1, failed: 0, auto_sent: 1 });
    expect(mocks.prepareWhatsAppSalesReplyForContact).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      contactId: "contact-1",
      preferredProvider: "evolution",
    }));
    expect(updates.some((item) => item.payload.metadata?.reply_processing_recovery_attempts === 1)).toBe(true);
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "system_event_logs",
      payload: expect.objectContaining({
        event_name: "whatsapp_reply_stale_processing_recovered",
        status: "warning",
      }),
    }));
  });

  it("marca processing antigo como processado sem reenviar quando ja existe mensagem mais nova", async () => {
    const row = {
      id: "message-stale-with-outbound",
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      direction: "inbound",
      media_processing_status: "none",
      created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      metadata: {
        reply_processing_status: "processing",
        reply_processing_started_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
        reply_trigger: "evolution_webhook",
      },
    };
    const { supabase, updates, inserts } = makeSupabase(row, { newerMessage: true });

    const result = await processPendingWhatsAppRepliesBatch({ supabase, limit: 1 });

    expect(result).toMatchObject({ picked: 1, processed: 1, failed: 0, auto_sent: 0 });
    expect(mocks.prepareWhatsAppSalesReplyForContact).not.toHaveBeenCalled();
    expect(updates.some((item) => item.payload.metadata?.reply_processing_recovery_reason === "newer_message_exists")).toBe(true);
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "system_event_logs",
      payload: expect.objectContaining({
        event_name: "whatsapp_reply_stale_processing_suppressed",
        status: "warning",
      }),
    }));
  });

  it("suprime processing antigo demais para evitar resposta atrasada", async () => {
    const row = {
      id: "message-too-old",
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      direction: "inbound",
      media_processing_status: "none",
      created_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
      metadata: {
        reply_processing_status: "processing",
        reply_processing_started_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
        reply_trigger: "evolution_webhook",
      },
    };
    const { supabase, updates } = makeSupabase(row, { newerMessage: false });

    const result = await processPendingWhatsAppRepliesBatch({ supabase, limit: 1 });

    expect(result).toMatchObject({ picked: 1, processed: 1, failed: 0, auto_sent: 0 });
    expect(mocks.prepareWhatsAppSalesReplyForContact).not.toHaveBeenCalled();
    expect(updates.some((item) => item.payload.metadata?.reply_processing_recovery_reason === "stale_processing_too_old")).toBe(true);
  });
});
