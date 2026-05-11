import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock, fromMock, getTenantIntegrationResolvedMock } = vi.hoisted(() => {
  const localFromMock = vi.fn();
  return {
    createClientMock: vi.fn(() => ({ from: localFromMock })),
    fromMock: localFromMock,
    getTenantIntegrationResolvedMock: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/integrations/server", () => ({
  getTenantIntegrationResolved: getTenantIntegrationResolvedMock,
}));

import { GET, POST } from "./route";

function chain(data: any = null, error: any = null) {
  const query: any = {
    select: vi.fn(() => query),
    in: vi.fn(async () => ({ data, error })),
    eq: vi.fn(() => query),
    insert: vi.fn(async () => ({ data, error })),
    update: vi.fn(() => query),
    then: (resolve: any) => Promise.resolve({ data, error }).then(resolve),
  };
  return query;
}

function buildWebhookRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/instagram/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("instagram webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.META_APP_SECRET;
    delete process.env.INSTAGRAM_APP_SECRET;
    process.env.INSTAGRAM_VERIFY_TOKEN = "verify-token";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    getTenantIntegrationResolvedMock.mockResolvedValue({ api_key: "meta-token" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
  });

  it("responde challenge de verificacao", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/instagram/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=abc"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("abc");
  });

  it("aciona automacao por palavra-chave e envia comentario mais direct com link", async () => {
    const integrations = [{
      tenant_id: "tenant-1",
      provider: "instagram",
      instance_name: "ig-business-1",
      metadata: { instagram_business_account_id: "ig-business-1" },
    }];
    const automations = [{
      id: "auto-1",
      keyword: "mayus",
      response_text: "Te enviei no direct.",
      direct_message: "Aqui esta o prompt.",
      file_url: "https://mayus.test/prompt.pdf",
    }];
    const eventsChain = chain(null, null);
    const automationsChain = chain(automations, null);
    const integrationsChain = chain(integrations, null);

    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_integrations") return integrationsChain;
      if (table === "instagram_automations") return automationsChain;
      if (table === "instagram_webhook_events") return eventsChain;
      return chain();
    });

    const response = await POST(buildWebhookRequest({
      entry: [{
        id: "ig-business-1",
        changes: [{
          field: "comments",
          value: {
            id: "comment-1",
            text: "Quero o mayus",
            from: { id: "ig-user-1", username: "maria" },
          },
        }],
      }],
    }));

    expect(response.status).toBe(200);
    expect(getTenantIntegrationResolvedMock).toHaveBeenCalledWith("tenant-1", "instagram");
    expect(eventsChain.insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      provider_event_id: "comment-1",
      status: "received",
    }));
    expect(fetch).toHaveBeenCalledWith("https://graph.facebook.com/v21.0/comment-1/replies", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("Te enviei no direct."),
    }));
    expect(fetch).toHaveBeenCalledWith("https://graph.facebook.com/v21.0/ig-business-1/messages", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("https://mayus.test/prompt.pdf"),
    }));
    expect(eventsChain.update).toHaveBeenCalledWith(expect.objectContaining({
      status: "sent",
      automation_id: "auto-1",
    }));
  });

  it("resolve integracao quando entry.id corresponde ao Page ID salvo em metadata", async () => {
    const integrations = [{
      tenant_id: "tenant-1",
      provider: "instagram",
      instance_name: "ig-business-1|page-1",
      metadata: {
        instagram_business_account_id: "ig-business-1",
        page_id: "page-1",
      },
    }];
    const automations = [{
      id: "auto-1",
      keyword: "prompt",
      response_text: "Te enviei no direct.",
      direct_message: "Aqui esta.",
      file_url: "https://mayus.test/prompt.pdf",
    }];
    const eventsChain = chain(null, null);

    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_integrations") return chain(integrations, null);
      if (table === "instagram_automations") return chain(automations, null);
      if (table === "instagram_webhook_events") return eventsChain;
      return chain();
    });

    const response = await POST(buildWebhookRequest({
      entry: [{
        id: "page-1",
        changes: [{
          field: "comments",
          value: {
            id: "comment-page-1",
            text: "manda o prompt",
            from: { id: "ig-user-1", username: "maria" },
          },
        }],
      }],
    }));

    expect(response.status).toBe(200);
    expect(getTenantIntegrationResolvedMock).toHaveBeenCalledWith("tenant-1", "instagram");
    expect(fetch).toHaveBeenCalledWith("https://graph.facebook.com/v21.0/ig-business-1/messages", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("https://mayus.test/prompt.pdf"),
    }));
  });
});
