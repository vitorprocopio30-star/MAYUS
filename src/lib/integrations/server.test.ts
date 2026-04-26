import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    rpc: rpcMock,
  },
}));

import {
  getTenantIntegrationResolved,
  listTenantIntegrationsSafe,
  upsertTenantIntegrationSecure,
} from "./server";

describe("tenant integration Vault helpers", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("resolve integracao por RPC segura", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{
        id: "integration-1",
        tenant_id: "tenant-1",
        provider: "openrouter",
        api_key: "resolved-api-key",
        webhook_secret: null,
        webhook_url: null,
        instance_name: "openrouter/auto",
        status: "connected",
        metadata: { model: "openrouter/auto" },
        display_name: "OpenRouter",
        api_key_secret_id: "secret-api-key",
      }],
      error: null,
    });

    const result = await getTenantIntegrationResolved("tenant-1", "openrouter");

    expect(rpcMock).toHaveBeenCalledWith("get_tenant_integration_resolved", {
      p_tenant_id: "tenant-1",
      p_provider: "openrouter",
    });
    expect(result).toEqual(expect.objectContaining({
      id: "integration-1",
      provider: "openrouter",
      api_key: "resolved-api-key",
      api_key_secret_id: "secret-api-key",
    }));
  });

  it("lista integracoes safe sem expor api_key ou webhook_secret", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{
        id: "integration-2",
        tenant_id: "tenant-1",
        provider: "google_drive",
        status: "connected",
        instance_name: null,
        display_name: "Google Drive",
        webhook_url: null,
        updated_at: "2026-04-25T00:00:00.000Z",
        api_key: "resolved-refresh-token",
        webhook_secret: "resolved-webhook",
        api_key_secret_id: null,
        webhook_secret_secret_id: null,
      }],
      error: null,
    });

    const result = await listTenantIntegrationsSafe("tenant-1", ["google_drive"]);

    expect(rpcMock).toHaveBeenCalledWith("list_tenant_integrations_resolved", {
      p_tenant_id: "tenant-1",
      p_providers: ["google_drive"],
    });
    expect(result).toEqual([{
      id: "integration-2",
      tenant_id: "tenant-1",
      provider: "google_drive",
      status: "connected",
      instance_name: null,
      display_name: "Google Drive",
      webhook_url: null,
      updated_at: "2026-04-25T00:00:00.000Z",
      has_api_key: true,
      has_webhook_secret: true,
    }]);
    expect(result[0]).not.toHaveProperty("api_key");
    expect(result[0]).not.toHaveProperty("webhook_secret");
  });

  it("salva integracao chamando upsert seguro com flags de limpeza", async () => {
    rpcMock.mockResolvedValueOnce({
      data: [{ id: "integration-3", provider: "zapsign" }],
      error: null,
    });

    const result = await upsertTenantIntegrationSecure({
      tenantId: "tenant-1",
      provider: "zapsign",
      apiKey: "api-key-input",
      webhookSecret: null,
      instanceName: "zapsign-main",
      status: "connected",
      displayName: "ZapSign",
      webhookUrl: "https://example.test/webhook",
      metadata: { enabled: true },
      clearApiKey: false,
      clearWebhookSecret: true,
    });

    expect(rpcMock).toHaveBeenCalledWith("upsert_tenant_integration_secure", {
      p_tenant_id: "tenant-1",
      p_provider: "zapsign",
      p_api_key: "api-key-input",
      p_webhook_secret: null,
      p_instance_name: "zapsign-main",
      p_status: "connected",
      p_display_name: "ZapSign",
      p_webhook_url: "https://example.test/webhook",
      p_metadata: { enabled: true },
      p_clear_api_key: false,
      p_clear_webhook_secret: true,
    });
    expect(result).toEqual({ id: "integration-3", provider: "zapsign" });
  });

  it("propaga erro de RPC", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error("rpc failed") });

    await expect(getTenantIntegrationResolved("tenant-1", "asaas")).rejects.toThrow("rpc failed");
  });
});
