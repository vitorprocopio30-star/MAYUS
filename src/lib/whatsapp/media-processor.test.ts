import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listTenantIntegrationsResolved: vi.fn(),
  processMetaCloudMedia: vi.fn(),
  processEvolutionMedia: vi.fn(),
  buildUnsupportedMediaRecord: vi.fn(),
  prepareWhatsAppSalesReplyForContact: vi.fn(),
}));

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsResolved: mocks.listTenantIntegrationsResolved,
}));

vi.mock("@/lib/growth/whatsapp-sales-reply-runtime", () => ({
  prepareWhatsAppSalesReplyForContact: mocks.prepareWhatsAppSalesReplyForContact,
}));

vi.mock("@/lib/whatsapp/media", () => ({
  processMetaCloudMedia: mocks.processMetaCloudMedia,
  processEvolutionMedia: mocks.processEvolutionMedia,
  buildUnsupportedMediaRecord: mocks.buildUnsupportedMediaRecord,
}));

import { processPendingWhatsAppMediaBatch } from "./media-processor";

function makeSupabase(row: any) {
  const updates: any[] = [];
  const settingsUpdates: any[] = [];
  const eventInserts: any[] = [];
  const notificationInserts: any[] = [];
  const supabase: any = {
    from: vi.fn((table: string) => {
      if (table === "system_event_logs") {
        return {
          insert: vi.fn(async (values: any) => {
            eventInserts.push(values);
            return { error: null };
          }),
        };
      }

      if (table === "notifications") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  limit: vi.fn(async () => ({ data: [], error: null })),
                })),
              })),
            })),
          })),
          insert: vi.fn(async (values: any) => {
            notificationInserts.push(values);
            return { error: null };
          }),
        };
      }

      if (table === "tenant_settings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { ai_features: row?.ai_features || {} }, error: null })),
            })),
          })),
          update: vi.fn((values: any) => {
            settingsUpdates.push(values);
            return { eq: vi.fn(async () => ({ error: null })) };
          }),
        };
      }

      if (table !== "whatsapp_messages") return {};
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(async () => ({ data: row ? [row] : [], error: null })),
            })),
          })),
        })),
        update: vi.fn((values: any) => {
          updates.push(values);
          return { eq: vi.fn(async () => ({ error: null })) };
        }),
      };
    }),
  };

  return { supabase, updates, settingsUpdates, eventInserts, notificationInserts };
}

describe("processPendingWhatsAppMediaBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareWhatsAppSalesReplyForContact.mockResolvedValue({});
  });

  it("processa midia Meta pending, atualiza storage_path e prepara resposta", async () => {
    const row = {
      id: "message-1",
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      direction: "inbound",
      message_type: "image",
      content: "Imagem do cliente",
      media_filename: "foto.jpg",
      media_provider: "meta_cloud",
      media_processing_status: "pending",
      message_id_from_evolution: "meta-msg-1",
      metadata: {
        provider_media_id: "meta-media-1",
        media_kind: "image",
        meta_phone_number_id: "phone-1",
        webhook_trigger: "meta_webhook",
      },
    };
    const { supabase, updates, eventInserts, notificationInserts } = makeSupabase(row);
    mocks.listTenantIntegrationsResolved.mockResolvedValueOnce([
      { provider: "meta_cloud", api_key: "meta-token", instance_name: "phone-1|waba-1" },
    ]);
    mocks.processMetaCloudMedia.mockResolvedValueOnce({
      media_url: null,
      media_storage_path: "tenant-1/contact-1/foto.jpg",
      media_mime_type: "image/jpeg",
      media_filename: "foto.jpg",
      media_size_bytes: 123,
      media_provider: "meta_cloud",
      media_processing_status: "processed",
      media_text: "Foto com documento",
      media_summary: "Foto com documento",
      metadata: { provider_media_id: "meta-media-1", media_kind: "image" },
    });

    const result = await processPendingWhatsAppMediaBatch({ supabase, limit: 1 });

    expect(result).toMatchObject({ picked: 1, processed: 1, failed: 0, replies_prepared: 1 });
    expect(mocks.processMetaCloudMedia).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      contactId: "contact-1",
      mediaId: "meta-media-1",
      token: "meta-token",
      kind: "image",
      filename: "foto.jpg",
    }));
    expect(updates[0]).toEqual(expect.objectContaining({
      media_url: null,
      media_storage_path: "tenant-1/contact-1/foto.jpg",
      media_processing_status: "processed",
      media_summary: "Foto com documento",
    }));
    expect(mocks.prepareWhatsAppSalesReplyForContact).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      contactId: "contact-1",
      trigger: "meta_webhook",
      autoSendFirstResponse: true,
    }));
    expect(eventInserts).toHaveLength(2);
    expect(eventInserts[0]).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      source: "whatsapp",
      provider: "meta_cloud",
      event_name: "whatsapp_media_processed",
      status: "ok",
      payload: expect.objectContaining({
        message_id: "message-1",
        contact_id: "contact-1",
        provider: "meta_cloud",
        kind: "image",
        status: "processed",
        mime_type: "image/jpeg",
        size_bytes: 123,
        has_storage_path: true,
        reply_prepared: true,
      }),
    }));
    expect(eventInserts[0].payload).not.toHaveProperty("media_text");
    expect(eventInserts[0].payload).not.toHaveProperty("media_url");
    expect(eventInserts[1]).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      source: "whatsapp",
      provider: "mayus",
      event_name: "whatsapp_media_batch_processed",
      status: "ok",
      payload: expect.objectContaining({
        picked: 1,
        processed: 1,
        failed: 0,
        replies_prepared: 1,
      }),
    }));
    expect(notificationInserts).toHaveLength(0);
  });

  it("registra evento sanitizado quando processamento falha", async () => {
    const row = {
      id: "message-failed",
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      direction: "inbound",
      message_type: "document",
      content: "Documento do cliente",
      media_filename: "contrato.pdf",
      media_provider: "meta_cloud",
      media_processing_status: "pending",
      message_id_from_evolution: null,
      metadata: {
        provider_media_id: "meta-media-1",
        media_kind: "document",
        webhook_trigger: "meta_webhook",
      },
    };
    const { supabase, updates, eventInserts, notificationInserts } = makeSupabase(row);
    mocks.listTenantIntegrationsResolved.mockResolvedValueOnce([]);

    const result = await processPendingWhatsAppMediaBatch({ supabase, limit: 1 });

    expect(result).toMatchObject({ picked: 1, processed: 0, failed: 1, replies_prepared: 1 });
    expect(updates[0]).toEqual(expect.objectContaining({
      media_url: null,
      media_processing_status: "failed",
    }));
    expect(eventInserts[0]).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      source: "whatsapp",
      provider: "meta_cloud",
      event_name: "whatsapp_media_failed",
      status: "error",
      payload: expect.objectContaining({
        message_id: "message-failed",
        contact_id: "contact-1",
        provider: "meta_cloud",
        kind: "document",
        status: "failed",
        has_storage_path: false,
        reply_prepared: true,
      }),
    }));
    expect(eventInserts[0].payload.error).toContain("Token Meta Cloud indisponivel");
    expect(eventInserts[0].payload).not.toHaveProperty("media_text");
    expect(eventInserts[0].payload).not.toHaveProperty("media_url");
    expect(eventInserts[1]).toEqual(expect.objectContaining({
      event_name: "whatsapp_media_batch_processed",
      status: "error",
      payload: expect.objectContaining({
        picked: 1,
        processed: 0,
        failed: 1,
        replies_prepared: 1,
      }),
    }));
    expect(notificationInserts).toHaveLength(2);
    expect(notificationInserts[0]).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      user_id: null,
      title: "WhatsApp: falha ao processar midia",
      type: "error",
      link_url: "/dashboard/conversas/whatsapp",
    }));
    expect(notificationInserts[0].message).toContain("message-failed");
    expect(notificationInserts[0].message).toContain("meta_cloud");
    expect(notificationInserts[0].message).not.toContain("provider_media_id");
    expect(notificationInserts[1]).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      user_id: null,
      title: "WhatsApp: batch de midia com falha",
      type: "error",
      link_url: "/dashboard/conversas/whatsapp",
    }));
  });

  it("promove documento de vendas processado para contexto comercial do tenant", async () => {
    const row = {
      id: "message-sales-doc",
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      direction: "inbound",
      message_type: "document",
      content: "Documento de vendas do escritorio",
      media_filename: "playbook-vendas-contracheque.pdf",
      media_provider: "evolution",
      media_processing_status: "pending",
      message_id_from_evolution: "evo-msg-1",
      metadata: {
        provider_media_id: "evo-msg-1",
        media_kind: "document",
        webhook_trigger: "evolution_webhook",
        evolution_instance: "mayus-dutra",
        evolution_message_envelope: { key: { id: "evo-msg-1" }, message: { documentMessage: {} } },
        evolution_message_payload: { documentMessage: {} },
      },
    };
    const { supabase, settingsUpdates, eventInserts } = makeSupabase(row);
    mocks.listTenantIntegrationsResolved.mockResolvedValueOnce([
      { provider: "evolution", api_key: "evolution-key", instance_name: "https://evolution.example|mayus-dutra" },
    ]);
    mocks.processEvolutionMedia.mockResolvedValueOnce({
      media_url: null,
      media_storage_path: "tenant-1/contact-1/playbook.pdf",
      media_mime_type: "application/pdf",
      media_filename: "playbook-vendas-contracheque.pdf",
      media_size_bytes: 456,
      media_provider: "evolution",
      media_processing_status: "processed",
      media_text: "Documento de vendas: qualificar leads de contracheque, desconto consignado e beneficio INSS. Perguntar uma coisa por vez e nao prometer resultado.",
      media_summary: "Playbook comercial para triagem de contracheque.",
      metadata: { provider_media_id: "evo-msg-1", media_kind: "document" },
    });

    const result = await processPendingWhatsAppMediaBatch({ supabase, limit: 1 });

    expect(result).toMatchObject({ picked: 1, processed: 1, failed: 0 });
    expect(settingsUpdates[0].ai_features).toEqual(expect.objectContaining({
      sales_playbook_context: expect.stringContaining("Documento de vendas"),
      sales_document_summary: expect.stringContaining("Playbook comercial"),
      sales_playbook_source: expect.objectContaining({
        message_id: "message-sales-doc",
        media_filename: "playbook-vendas-contracheque.pdf",
      }),
    }));
    expect(eventInserts).toContainEqual(expect.objectContaining({
      event_name: "whatsapp_sales_playbook_promoted",
      status: "ok",
      payload: expect.objectContaining({
        message_id: "message-sales-doc",
        source: "whatsapp_media_document",
      }),
    }));
  });
});
