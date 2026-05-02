import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTenantSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: getTenantSessionMock,
}));

import { POST } from "./route";

function buildRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/integrations/evolution", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/integrations/evolution", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getTenantSessionMock.mockReset();
    getTenantSessionMock.mockResolvedValue({ tenantId: "tenant-1" });
  });

  it("consulta status da Evolution por proxy", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ instance: { state: "open" } }), { status: 200 })) as any;

    const response = await POST(buildRequest({
      action: "status",
      url: "http://187.77.240.109:32768",
      name: "mayus-dutra",
      key: "api-key",
    }));

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://187.77.240.109:32768/instance/connectionState/mayus-dutra",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("cria e conecta instancia por proxy", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Instance created" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ base64: "qr-image" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: true }), { status: 201 }));
    global.fetch = fetchMock as any;

    const response = await POST(buildRequest({
      action: "connect",
      url: "http://187.77.240.109:32768",
      name: "mayus-dutra",
      key: "api-key",
    }));

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.connectData.base64).toBe("qr-image");
    expect(body.webhookData.enabled).toBe(true);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://187.77.240.109:32768/instance/create",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://187.77.240.109:32768/instance/connect/mayus-dutra",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://187.77.240.109:32768/webhook/set/mayus-dutra",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("MESSAGES_UPSERT"),
      }),
    );
  });

  it("segue para connect quando a Evolution diz que o nome ja existe", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "This name \"mayus-dutra\" is already in use." }), { status: 400 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ base64: "qr-image" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: true }), { status: 201 }));
    global.fetch = fetchMock as any;

    const response = await POST(buildRequest({
      action: "connect",
      url: "http://187.77.240.109:32768",
      name: "mayus-dutra",
      key: "api-key",
    }));

    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.connectData.base64).toBe("qr-image");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falha explicitamente quando nao consegue configurar webhook", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Instance created" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ base64: "qr-image" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "Webhook refused" }), { status: 400 }));
    global.fetch = fetchMock as any;

    const response = await POST(buildRequest({
      action: "connect",
      url: "http://187.77.240.109:32768",
      name: "mayus-dutra",
      key: "api-key",
    }));

    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body.ok).toBe(false);
    expect(body.stage).toBe("webhook");
    expect(body.error).toBe("Webhook refused");
  });
});
