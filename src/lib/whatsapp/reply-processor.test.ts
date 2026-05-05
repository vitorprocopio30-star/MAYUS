import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prepareWhatsAppSalesReplyForContact: vi.fn(),
}));

vi.mock("@/lib/growth/whatsapp-sales-reply-runtime", () => ({
  prepareWhatsAppSalesReplyForContact: mocks.prepareWhatsAppSalesReplyForContact,
}));

import { enqueueWhatsAppReply, processPendingWhatsAppRepliesBatch } from "./reply-processor";

function makeSupabase(row: any) {
  const updates: Array<{ table: string; payload: any }> = [];
  const inserts: Array<{ table: string; payload: any }> = [];
  const supabase: any = {
    from: vi.fn((table: string) => {
      if (table === "whatsapp_messages") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({ data: row ? [row] : [], error: null })),
                })),
                maybeSingle: vi.fn(async () => ({ data: row ? { metadata: row.metadata || null } : null, error: null })),
              })),
              maybeSingle: vi.fn(async () => ({ data: row ? { metadata: row.metadata || null } : null, error: null })),
            })),
          })),
          update: vi.fn((payload: any) => {
            updates.push({ table, payload });
            return { eq: vi.fn(async () => ({ error: null })) };
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
});
