import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: vi.fn(),
}));

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsSafe: vi.fn(),
  upsertTenantIntegrationSecure: vi.fn(),
}));

import { GET, POST } from "./route";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { listTenantIntegrationsSafe, upsertTenantIntegrationSecure } from "@/lib/integrations/server";

const getTenantSessionMock = vi.mocked(getTenantSession);
const listTenantIntegrationsSafeMock = vi.mocked(listTenantIntegrationsSafe);
const upsertTenantIntegrationSecureMock = vi.mocked(upsertTenantIntegrationSecure);

function buildPostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/integrations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/integrations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista integracoes com providers deduplicados e sem expor segredos plaintext", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    listTenantIntegrationsSafeMock.mockResolvedValueOnce([
      {
        id: "integration-1",
        tenant_id: "tenant-1",
        provider: "google_drive",
        status: "connected",
        instance_name: "drive-instance",
        display_name: "Google Drive",
        webhook_url: null,
        updated_at: "2026-04-25T00:00:00.000Z",
        has_api_key: true,
        has_webhook_secret: false,
      },
    ] as any);

    const response = await GET(new NextRequest("http://localhost:3000/api/integrations?providers=google_drive,zapsign,google_drive"));

    expect(getTenantSessionMock).toHaveBeenCalledWith();
    expect(listTenantIntegrationsSafeMock).toHaveBeenCalledWith("tenant-1", ["google_drive", "zapsign"]);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      integrations: [
        {
          id: "integration-1",
          tenant_id: "tenant-1",
          provider: "google_drive",
          status: "connected",
          instance_name: "drive-instance",
          display_name: "Google Drive",
          webhook_url: null,
          updated_at: "2026-04-25T00:00:00.000Z",
          has_api_key: true,
          has_webhook_secret: false,
        },
      ],
    });
  });

  it("retorna 401 quando GET nao tem sessao", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const response = await GET(new NextRequest("http://localhost:3000/api/integrations"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Nao autenticado." });
    expect(listTenantIntegrationsSafeMock).not.toHaveBeenCalled();
  });

  it("salva integracao via Vault RPC e retorna apenas flags seguras", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    upsertTenantIntegrationSecureMock.mockResolvedValueOnce({
      id: "integration-2",
      tenant_id: "tenant-1",
      provider: "zapsign",
      status: "connected",
      instance_name: "zapsign-main",
      display_name: "ZapSign",
      webhook_url: "https://example.test/webhook",
      updated_at: "2026-04-25T00:05:00.000Z",
      api_key: null,
      webhook_secret: null,
      api_key_secret_id: "secret-api-key",
      webhook_secret_secret_id: "secret-webhook",
    } as any);

    const response = await POST(buildPostRequest({
      provider: "zapsign",
      apiKey: "plain-api-key-input",
      webhookSecret: "plain-webhook-input",
      instanceName: "zapsign-main",
      status: "connected",
      displayName: "ZapSign",
      webhookUrl: "https://example.test/webhook",
      metadata: { region: "br" },
      clearApiKey: false,
      clearWebhookSecret: false,
    }));

    expect(getTenantSessionMock).toHaveBeenCalledWith({ requireFullAccess: true });
    expect(upsertTenantIntegrationSecureMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      provider: "zapsign",
      apiKey: "plain-api-key-input",
      webhookSecret: "plain-webhook-input",
      instanceName: "zapsign-main",
      status: "connected",
      displayName: "ZapSign",
      webhookUrl: "https://example.test/webhook",
      metadata: { region: "br" },
      clearApiKey: false,
      clearWebhookSecret: false,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      integration: {
        id: "integration-2",
        tenant_id: "tenant-1",
        provider: "zapsign",
        status: "connected",
        instance_name: "zapsign-main",
        display_name: "ZapSign",
        webhook_url: "https://example.test/webhook",
        updated_at: "2026-04-25T00:05:00.000Z",
        has_api_key: true,
        has_webhook_secret: true,
      },
    });
  });

  it("rejeita POST sem provider", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });

    const response = await POST(buildPostRequest({ apiKey: "secret" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Provider invalido." });
    expect(upsertTenantIntegrationSecureMock).not.toHaveBeenCalled();
  });

  it("retorna 403 quando POST nao tem acesso total", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new Error("Forbidden"));

    const response = await POST(buildPostRequest({ provider: "openrouter" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Acesso restrito." });
    expect(upsertTenantIntegrationSecureMock).not.toHaveBeenCalled();
  });
});
