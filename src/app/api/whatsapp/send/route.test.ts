import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const listTenantIntegrationsResolvedMock = vi.hoisted(() => vi.fn());

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsResolved: listTenantIntegrationsResolvedMock,
}));

import { POST } from "./route";

function buildRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/whatsapp/send", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/whatsapp/send", () => {
  const messageInserts: unknown[] = [];
  const contactUpdates: unknown[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    messageInserts.length = 0;
    contactUpdates.length = 0;
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ key: { id: "evo-msg-1" } }), { status: 200 })) as any;
    listTenantIntegrationsResolvedMock.mockResolvedValue([
      {
        provider: "evolution",
        api_key: "evolution-key",
        instance_name: "http://187.77.240.109:32768|mayus-dutra",
      },
    ]);
    createClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "whatsapp_messages") {
          return {
            insert: vi.fn((rows: any[]) => {
              messageInserts.push(...rows);
              return {
                select: vi.fn(() => ({
                  single: vi.fn(async () => ({ data: { id: "msg-1", ...rows[0] }, error: null })),
                })),
              };
            }),
          };
        }

        if (table === "whatsapp_contacts") {
          return {
            update: vi.fn((payload: unknown) => {
              contactUpdates.push(payload);
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(async () => ({ error: null })),
                })),
              };
            }),
          };
        }

        return {};
      }),
    });
  });

  it("envia resposta pela Evolution e registra outbound no MAYUS", async () => {
    const response = await POST(buildRequest({
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      phone_number: "5521999990000@s.whatsapp.net",
      text: "Mensagem teste MAYUS",
    }));

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.motor).toBe("evolution");
    expect(global.fetch).toHaveBeenCalledWith(
      "http://187.77.240.109:32768/chat/sendPresence/mayus-dutra",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "evolution-key" }),
        body: expect.stringContaining("\"presence\":\"composing\""),
      }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      "http://187.77.240.109:32768/message/sendText/mayus-dutra",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "evolution-key" }),
        body: expect.stringContaining("\"text\":\"Mensagem teste MAYUS\""),
      }),
    );
    expect(messageInserts).toEqual([
      expect.objectContaining({
        tenant_id: "tenant-1",
        contact_id: "contact-1",
        direction: "outbound",
        content: "Mensagem teste MAYUS",
        status: "sent",
      }),
    ]);
    expect(contactUpdates).toEqual([
      expect.objectContaining({
        unread_count: 0,
        last_message_at: expect.any(String),
      }),
    ]);
  });

  it("limpa mascara do telefone antes de enviar pela Evolution", async () => {
    await POST(buildRequest({
      tenant_id: "tenant-1",
      contact_id: "contact-1",
      phone_number: "+55 (21) 99999-0000",
      text: "Teste com mascara",
    }));

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining("\"number\":\"5521999990000\""),
      }),
    );
  });
});
