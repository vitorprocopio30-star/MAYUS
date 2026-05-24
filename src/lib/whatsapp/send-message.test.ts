import { beforeEach, describe, expect, it, vi } from "vitest";

const { listTenantIntegrationsResolvedMock, sendEvolutionPresenceMock } = vi.hoisted(() => ({
  listTenantIntegrationsResolvedMock: vi.fn(),
  sendEvolutionPresenceMock: vi.fn(),
}));

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsResolved: listTenantIntegrationsResolvedMock,
}));

vi.mock("@/lib/whatsapp/evolution-presence", () => ({
  sendEvolutionPresence: sendEvolutionPresenceMock,
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
    sendEvolutionPresenceMock.mockReset();
    sendEvolutionPresenceMock.mockResolvedValue({ ok: true });
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
    expect(result.messageId).toBe("msg-1");
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
          message_id_from_evolution: "msg-1",
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

  it("usa Meta Cloud quando provider preferido e informado", async () => {
    const { supabase, inserts } = makeSupabase();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: "meta-msg-1" }] }), { status: 200 }));
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
      phoneNumber: "+55 (11) 99999-9999",
      text: "Oi pela Meta",
      preferredProvider: "meta_cloud",
      fetcher: fetcher as any,
    });

    expect(result.provider).toBe("meta_cloud");
    expect(result.messageId).toBe("meta-msg-1");
    expect(fetcher).toHaveBeenCalledWith(
      "https://graph.facebook.com/v22.0/phone-id/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer meta-token" }),
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: "5511999999999",
          type: "text",
          text: { body: "Oi pela Meta" },
        }),
      }),
    );
    expect(inserts[0].payload[0]).toEqual(expect.objectContaining({
      media_provider: "meta_cloud",
      message_id_from_evolution: null,
      content: "Oi pela Meta",
    }));
  });

  it("sinaliza digitando e pausado quando envio Evolution e humanizado", async () => {
    const { supabase } = makeSupabase();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ key: { id: "msg-humanized-1" } }), { status: 200 }));
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
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

    await sendWhatsAppMessage({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      phoneNumber: "5511999999999@s.whatsapp.net",
      text: "Resposta humana do MAYUS",
      humanizeDelivery: true,
      fetcher: fetcher as any,
    });

    expect(sendEvolutionPresenceMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      remoteJid: "5511999999999@s.whatsapp.net",
      presence: "composing",
    }));
    expect(sendEvolutionPresenceMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      remoteJid: "5511999999999@s.whatsapp.net",
      presence: "paused",
    }));
    expect(fetcher).toHaveBeenCalledWith(
      "https://evolution.example.com/message/sendText/mayus",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("envia audio por Evolution, pulsa presenca curta e salva texto auditavel no metadata", async () => {
    const { supabase, inserts } = makeSupabase();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ key: { id: "msg-audio-1" } }), { status: 200 }));
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
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
      phoneNumber: "5511999999999@s.whatsapp.net",
      audioUrl: "https://storage.example.com/audio.mp3",
      mediaStoragePath: "tenant-1/contact-1/outbound-audio/audio.mp3",
      mediaMimeType: "audio/mpeg",
      mediaFilename: "audio.mp3",
      humanizeDelivery: true,
      metadata: {
        source: "mayus_operating_partner_auto_reply",
        reply_modality: "audio",
        reply_text: "Resumo do processo para auditoria.",
      },
      fetcher: fetcher as any,
    });

    expect(result.provider).toBe("evolution");
    expect(result.messageId).toBe("msg-audio-1");
    expect(sendEvolutionPresenceMock).toHaveBeenCalledWith(expect.objectContaining({
      presence: "composing",
    }));
    expect(sendEvolutionPresenceMock).toHaveBeenCalledWith(expect.objectContaining({
      presence: "paused",
    }));
    expect(fetcher).toHaveBeenCalledWith(
      "https://evolution.example.com/message/sendWhatsAppAudio/mayus",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "evo-key" }),
        body: JSON.stringify({ number: "5511999999999", audio: "https://storage.example.com/audio.mp3" }),
      }),
    );
    expect(inserts[0].payload[0]).toEqual(expect.objectContaining({
      message_type: "audio",
      content: "[Audio Enviado]",
      media_storage_path: "tenant-1/contact-1/outbound-audio/audio.mp3",
      media_mime_type: "audio/mpeg",
      media_filename: "audio.mp3",
      metadata: expect.objectContaining({
        reply_modality: "audio",
        reply_text: "Resumo do processo para auditoria.",
        media_storage_path: "tenant-1/contact-1/outbound-audio/audio.mp3",
        media_type: "audio",
      }),
    }));
  });

  it("falha sem fallback quando provider preferido nao existe", async () => {
    const { supabase } = makeSupabase();
    listTenantIntegrationsResolvedMock.mockResolvedValueOnce([
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

    await expect(sendWhatsAppMessage({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-1",
      phoneNumber: "5511999999999",
      text: "Oi",
      preferredProvider: "meta_cloud",
      fetcher: vi.fn() as any,
    })).rejects.toThrow("Integracao WhatsApp meta_cloud nao encontrada");
  });

  it("bloqueia envio para grupos WhatsApp", async () => {
    const { supabase } = makeSupabase();

    await expect(sendWhatsAppMessage({
      supabase,
      tenantId: "tenant-1",
      contactId: "contact-group",
      phoneNumber: "120363401234567890@g.us",
      text: "Nao pode enviar para grupo",
      fetcher: vi.fn() as any,
    })).rejects.toThrow("Envio WhatsApp para grupos esta bloqueado");

    expect(listTenantIntegrationsResolvedMock).not.toHaveBeenCalled();
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
