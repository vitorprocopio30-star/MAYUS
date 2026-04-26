import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  buildGoogleDriveFolderUrlMock,
  extractGoogleDriveFolderIdMock,
  fetchGoogleDriveFolderMock,
  getGoogleDriveIntegrationMetadataMock,
  getTenantIntegrationResolvedMock,
  getTenantSessionMock,
  isGoogleDriveConfiguredMock,
  mergeGoogleDriveMetadataMock,
  needsGoogleDriveTokenRefreshMock,
  refreshGoogleDriveAccessTokenMock,
  revokeGoogleDriveRefreshTokenMock,
  sanitizeGoogleDriveStateMock,
  supabaseFromMock,
  upsertTenantIntegrationSecureMock,
} = vi.hoisted(() => ({
  buildGoogleDriveFolderUrlMock: vi.fn((folderId: string) => `https://drive.google.com/drive/folders/${folderId}`),
  extractGoogleDriveFolderIdMock: vi.fn((value: string) => value || null),
  fetchGoogleDriveFolderMock: vi.fn(),
  getGoogleDriveIntegrationMetadataMock: vi.fn((integration: any) => integration?.metadata || {}),
  getTenantIntegrationResolvedMock: vi.fn(),
  getTenantSessionMock: vi.fn(),
  isGoogleDriveConfiguredMock: vi.fn(),
  mergeGoogleDriveMetadataMock: vi.fn((current: any, next: any) => ({ ...(current || {}), ...next })),
  needsGoogleDriveTokenRefreshMock: vi.fn(),
  refreshGoogleDriveAccessTokenMock: vi.fn(),
  revokeGoogleDriveRefreshTokenMock: vi.fn(),
  sanitizeGoogleDriveStateMock: vi.fn((integration: any) => ({
    available: true,
    connected: integration?.status === "connected" && Boolean(integration?.api_key),
    status: integration?.status || "disconnected",
    connectedEmail: integration?.metadata?.connected_email || null,
    rootFolderId: integration?.metadata?.drive_root_folder_id || null,
    rootFolderName: integration?.metadata?.drive_root_folder_name || null,
    rootFolderUrl: integration?.metadata?.drive_root_folder_url || null,
  })),
  supabaseFromMock: vi.fn(),
  upsertTenantIntegrationSecureMock: vi.fn(),
}));

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: getTenantSessionMock,
}));

vi.mock("@/lib/integrations/server", () => ({
  getTenantIntegrationResolved: getTenantIntegrationResolvedMock,
  upsertTenantIntegrationSecure: upsertTenantIntegrationSecureMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: supabaseFromMock,
  },
}));

vi.mock("@/lib/services/google-drive", () => ({
  buildGoogleDriveFolderUrl: buildGoogleDriveFolderUrlMock,
  extractGoogleDriveFolderId: extractGoogleDriveFolderIdMock,
  fetchGoogleDriveFolder: fetchGoogleDriveFolderMock,
  getGoogleDriveIntegrationMetadata: getGoogleDriveIntegrationMetadataMock,
  GOOGLE_DRIVE_PROVIDER: "google_drive",
  isGoogleDriveConfigured: isGoogleDriveConfiguredMock,
  mergeGoogleDriveMetadata: mergeGoogleDriveMetadataMock,
  needsGoogleDriveTokenRefresh: needsGoogleDriveTokenRefreshMock,
  refreshGoogleDriveAccessToken: refreshGoogleDriveAccessTokenMock,
  revokeGoogleDriveRefreshToken: revokeGoogleDriveRefreshTokenMock,
  sanitizeGoogleDriveState: sanitizeGoogleDriveStateMock,
}));

import { DELETE, GET, PATCH } from "./route";

const rootDir = resolve(__dirname, "../../../../..");

function readRepoFile(path: string) {
  return readFileSync(resolve(rootDir, path), "utf8");
}

function buildPatchRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/integrations/google-drive", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function mockTenantSession() {
  getTenantSessionMock.mockResolvedValueOnce({
    userId: "user-1",
    tenantId: "tenant-1",
    role: "admin",
    isSuperadmin: false,
    hasFullAccess: true,
  });
}

function mockMetadataUpdate() {
  const query: any = {
    update: vi.fn(() => query),
    eq: vi.fn(async () => ({ error: null })),
  };
  supabaseFromMock.mockReturnValueOnce(query);
  return query;
}

describe("integration security static checks", () => {
  it("keeps the Google Drive route wired to supabaseAdmin for metadata updates", () => {
    const source = readRepoFile("src/app/api/integrations/google-drive/route.ts");

    expect(source).toContain('import { supabaseAdmin } from "@/lib/supabase/admin";');
    expect(source).toContain("supabaseAdmin");
  });

  it("does not resolve Escavador tenants through plaintext integration secrets", () => {
    const source = readRepoFile("src/app/api/webhooks/escavador/route.ts");

    expect(source).not.toContain(".eq('api_key'");
    expect(source).not.toContain('.eq("api_key"');
    expect(source).not.toContain(".eq('webhook_secret'");
    expect(source).not.toContain('.eq("webhook_secret"');
  });

  it("keeps non-agentic Asaas webhook audit events in system_event_logs", () => {
    const source = readRepoFile("src/app/api/webhooks/asaas/route.ts");

    expect(source).toContain("system_event_logs");
    expect(source).not.toContain("agent_audit_logs");
  });

  it("keeps tenant integration access centralized through secure RPCs", () => {
    const source = readRepoFile("src/lib/integrations/server.ts");

    expect(source).toContain('"get_tenant_integration_resolved"');
    expect(source).toContain('"list_tenant_integrations_resolved"');
    expect(source).toContain('"upsert_tenant_integration_secure"');
    expect(source).not.toContain(".from(\"tenant_integrations\")");
    expect(source).not.toContain(".from('tenant_integrations')");
  });
});

describe("/api/integrations/google-drive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isGoogleDriveConfiguredMock.mockReturnValue(true);
    needsGoogleDriveTokenRefreshMock.mockReturnValue(false);
  });

  it("GET retorna estado indisponivel quando Google Drive nao esta configurado", async () => {
    mockTenantSession();
    isGoogleDriveConfiguredMock.mockReturnValueOnce(false);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      available: false,
      connected: false,
      status: "unavailable",
      connectedEmail: null,
      rootFolderId: null,
      rootFolderName: null,
      rootFolderUrl: null,
    });
    expect(getTenantIntegrationResolvedMock).not.toHaveBeenCalled();
  });

  it("GET retorna estado sanitizado da integracao conectada", async () => {
    mockTenantSession();
    getTenantIntegrationResolvedMock.mockResolvedValueOnce({
      id: "integration-1",
      status: "connected",
      api_key: "refresh-token",
      metadata: { connected_email: "drive@example.test" },
    });

    const response = await GET();

    expect(getTenantSessionMock).toHaveBeenCalledWith({ requireFullAccess: true });
    expect(getTenantIntegrationResolvedMock).toHaveBeenCalledWith("tenant-1", "google_drive");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      available: true,
      connected: true,
      status: "connected",
      connectedEmail: "drive@example.test",
    }));
  });

  it("GET mapeia Forbidden para 403", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new Error("Forbidden"));

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Acesso restrito." });
  });

  it("PATCH limpa pasta raiz quando rootFolder vem vazio", async () => {
    mockTenantSession();
    const integration = {
      id: "integration-1",
      status: "connected",
      api_key: "refresh-token",
      metadata: {
        access_token: "access-token",
        drive_root_folder_id: "root-1",
        drive_root_folder_name: "Root",
      },
    };
    getTenantIntegrationResolvedMock.mockResolvedValueOnce(integration);
    const query = mockMetadataUpdate();

    const response = await PATCH(buildPatchRequest({ rootFolder: "" }));

    expect(query.update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        drive_root_folder_id: null,
        drive_root_folder_name: null,
        drive_root_folder_url: null,
      }),
    });
    expect(query.eq).toHaveBeenCalledWith("id", "integration-1");
    expect(fetchGoogleDriveFolderMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      connected: true,
      rootFolderId: null,
    }));
  });

  it("PATCH atualiza pasta raiz valida e usa refresh quando token expirou", async () => {
    mockTenantSession();
    getTenantIntegrationResolvedMock.mockResolvedValueOnce({
      id: "integration-1",
      status: "connected",
      api_key: "refresh-token",
      metadata: { access_token: "old-access", expires_at: "2020-01-01T00:00:00.000Z" },
    });
    extractGoogleDriveFolderIdMock.mockReturnValueOnce("folder-123");
    needsGoogleDriveTokenRefreshMock.mockReturnValueOnce(true);
    refreshGoogleDriveAccessTokenMock.mockResolvedValueOnce({
      accessToken: "new-access",
      expiresAt: "2026-04-26T12:00:00.000Z",
      scope: "drive",
      tokenType: "Bearer",
    });
    fetchGoogleDriveFolderMock.mockResolvedValueOnce({
      id: "folder-123",
      name: "MAYUS Root",
      webViewLink: "https://drive.example/folder-123",
    });
    const query = mockMetadataUpdate();

    const response = await PATCH(buildPatchRequest({ rootFolder: "https://drive.google.com/drive/folders/folder-123" }));

    expect(refreshGoogleDriveAccessTokenMock).toHaveBeenCalledWith(expect.any(NextRequest), "refresh-token");
    expect(fetchGoogleDriveFolderMock).toHaveBeenCalledWith("new-access", "folder-123");
    expect(query.update).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        access_token: "new-access",
        drive_root_folder_id: "folder-123",
        drive_root_folder_name: "MAYUS Root",
        drive_root_folder_url: "https://drive.example/folder-123",
      }),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      rootFolderId: "folder-123",
      rootFolderName: "MAYUS Root",
    }));
  });

  it("PATCH rejeita integracao desconectada", async () => {
    mockTenantSession();
    getTenantIntegrationResolvedMock.mockResolvedValueOnce({
      id: "integration-1",
      status: "disconnected",
      api_key: null,
      metadata: {},
    });

    const response = await PATCH(buildPatchRequest({ rootFolder: "folder-123" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Google Drive desconectado. Reconecte a conta primeiro." });
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it("PATCH rejeita folder invalido", async () => {
    mockTenantSession();
    getTenantIntegrationResolvedMock.mockResolvedValueOnce({
      id: "integration-1",
      status: "connected",
      api_key: "refresh-token",
      metadata: { access_token: "access-token" },
    });
    extractGoogleDriveFolderIdMock.mockReturnValueOnce(null);

    const response = await PATCH(buildPatchRequest({ rootFolder: "not a folder" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Informe um link ou ID válido de pasta do Google Drive." });
  });

  it("DELETE desconecta integracao via Vault e revoga token", async () => {
    mockTenantSession();
    getTenantIntegrationResolvedMock.mockResolvedValueOnce({
      id: "integration-1",
      status: "connected",
      api_key: "refresh-token",
      metadata: { access_token: "access-token", connected_email: "drive@example.test" },
    });

    const response = await DELETE();

    expect(revokeGoogleDriveRefreshTokenMock).toHaveBeenCalledWith("refresh-token");
    expect(upsertTenantIntegrationSecureMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      provider: "google_drive",
      status: "disconnected",
      clearApiKey: true,
      metadata: expect.objectContaining({
        access_token: null,
        connected_email: null,
      }),
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("DELETE e idempotente quando integracao nao existe", async () => {
    mockTenantSession();
    getTenantIntegrationResolvedMock.mockResolvedValueOnce(null);

    const response = await DELETE();

    expect(revokeGoogleDriveRefreshTokenMock).not.toHaveBeenCalled();
    expect(upsertTenantIntegrationSecureMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
