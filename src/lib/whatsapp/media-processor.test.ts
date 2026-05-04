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
  const supabase: any = {
    from: vi.fn((table: string) => {
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

  return { supabase, updates };
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
    const { supabase, updates } = makeSupabase(row);
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
  });
});
