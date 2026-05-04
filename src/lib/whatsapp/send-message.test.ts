import { beforeEach, describe, expect, it, vi } from "vitest";

const { listTenantIntegrationsResolvedMock } = vi.hoisted(() => ({
  listTenantIntegrationsResolvedMock: vi.fn(),
}));

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsResolved: listTenantIntegrationsResolvedMock,
}));

import { sendWhatsAppMessage } from "./send-message";

function makeSupabase() {
  const inserts: Array<{ table: string; payload: any }> = [];
  const supabase: any = {
    from: vi.fn((table: string) => ({
      insert: vi.fn(async (payload: any) => {
        inserts.push({ table, payload });
        return { error: null };
      }),
    })),
  };

  return { supabase, inserts };
}

describe("sendWhatsAppMessage", () => {
  beforeEach(() => {
    listTenantIntegrationsResolvedMock.mockReset();
  });

  it("envia por Evolution, salva historico e preserva metadados", async () => {
    const { supabase, inserts } = makeSupabase();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ key: { id: "msg-1" } }), { status: 200 }));
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
      {
        id: "int-1",
        tenant_id: "tenant-1",
        provider: "evolution",
        api_key: "evo-key",
        webhook_secret: null,
        webhook_url: null,
        instance_name: "https://evolution.example.com|mayus",
        status: "active",
        metadata: null,
        display_name: "Evolution",
      },
    ]);

    const result = await sendWhatsAppMessage({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      phoneNumber: "5511999999999@s.whatsapp.net",
      text: "Mensagem de teste",
      metadata: { source: "sales_llm_auto_reply" },
      fetcher: fetcher as any,
    });

    expect(result.provider).toBe("evolution");
    expect(fetcher).toHaveBeenCalledWith(
      "https://evolution.example.com/message/sendText/mayus",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "evo-key" }),
        body: JSON.stringify({ number: "5511999999999", text: "Mensagem de teste" }),
      }),
    );
    expect(inserts).toEqual([
      {
        table: "whatsapp_messages",
        payload: [expect.objectContaining({
          tenant_id: "tenant-1",
          contact_id: "contact-1",
          direction: "outbound",
          message_type: "text",
          content: "Mensagem de teste",
          status: "sent",
          metadata: { source: "sales_llm_auto_reply" },
        })],
      },
    ]);
  });

  it("prefere Evolution quando Meta tambem esta configurada", async () => {
    const { supabase } = makeSupabase();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
      {
        id: "meta-1",
        tenant_id: "tenant-1",
        provider: "meta_cloud",
        api_key: "meta-token",
        webhook_secret: null,
        webhook_url: null,
        instance_name: "phone-id|business-id",
        status: "active",
        metadata: null,
        display_name: "Meta",
      },
      {
        id: "evo-1",
        tenant_id: "tenant-1",
        provider: "evolution",
        api_key: "evo-key",
        webhook_secret: null,
        webhook_url: null,
        instance_name: "https://evolution.example.com|mayus",
        status: "active",
        metadata: null,
        display_name: "Evolution",
      },
    ]);

    const result = await sendWhatsAppMessage({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      phoneNumber: "5511999999999",
      text: "Oi",
      fetcher: fetcher as any,
    });

    expect(result.provider).toBe("evolution");
  });

  it("bloqueia Evolution apontando para rede interna", async () => {
    const { supabase } = makeSupabase();
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
      {
        id: "int-1",
        tenant_id: "tenant-1",
        provider: "evolution",
        api_key: "evo-key",
        webhook_secret: null,
        webhook_url: null,
        instance_name: "http://127.0.0.1:8080|mayus",
        status: "active",
        metadata: null,
        display_name: "Evolution",
      },
    ]);

    await expect(sendWhatsAppMessage({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      phoneNumber: "5511999999999",
      text: "Oi",
      fetcher: vi.fn() as any,
    })).rejects.toThrow("URL da integracao Evolution invalida ou nao permitida");
  });
});
