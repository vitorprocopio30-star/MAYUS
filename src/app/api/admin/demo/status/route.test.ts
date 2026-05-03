import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserMock,
  isSuperadminMock,
  isGoogleDriveConfiguredMock,
  fromMock,
  upserts,
  inserts,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  isSuperadminMock: vi.fn(),
  isGoogleDriveConfiguredMock: vi.fn(),
  fromMock: vi.fn(),
  upserts: [] as any[],
  inserts: [] as any[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    auth: {
      getUser: getUserMock,
    },
    from: fromMock,
  },
}));

vi.mock("@/lib/auth/is-superadmin", () => ({
  isSuperadmin: isSuperadminMock,
}));

vi.mock("@/lib/services/google-drive", () => ({
  GOOGLE_DRIVE_PROVIDER: "google_drive",
  getGoogleDriveIntegrationMetadata: (record: any) => record?.metadata || {},
  isGoogleDriveConfigured: isGoogleDriveConfiguredMock,
}));

import { GET, PATCH } from "./route";

function buildRequest(body?: unknown, token = "token-1") {
  return new NextRequest("http://localhost:3000/api/admin/demo/status", {
    method: body ? "PATCH" : "GET",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function query(result: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

describe("/api/admin/demo/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upserts.length = 0;
    inserts.length = 0;
    getUserMock.mockResolvedValue({ data: { user: { id: "superadmin-1" } }, error: null });
    isSuperadminMock.mockResolvedValue(true);
    isGoogleDriveConfiguredMock.mockReturnValue(true);
  });

  it("lista tenants com flags demo", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "tenants") {
        return query({
          data: [
            { id: "tenant-demo", name: "MAYUS Demo", status: "ativo", plan_type: "demo", created_at: "2026-05-02T10:00:00.000Z" },
            { id: "tenant-real", name: "Dutra", status: "ativo", plan_type: "pro", created_at: "2026-05-01T10:00:00.000Z" },
          ],
          error: null,
        });
      }

      if (table === "tenant_settings") {
        return query({
          data: [
            { tenant_id: "tenant-demo", ai_features: { demo_mode: true, demo: { drive_mode: "real_demo_account" } } },
          ],
          error: null,
        });
      }

      if (table === "tenant_integrations") {
        return query({
          data: [
            {
              id: "drive-1",
              tenant_id: "tenant-demo",
              provider: "google_drive",
              status: "connected",
              api_key: "refresh-token-secret",
              metadata: {
                connected_email: "drive-demo@mayus.test",
                access_token: "access-token-secret",
                drive_root_folder_id: "root-folder-1",
                drive_root_folder_name: "MAYUS Demo",
                drive_root_folder_url: "https://drive.google.com/drive/folders/root-folder-1",
              },
            },
          ],
          error: null,
        });
      }

      throw new Error(`unexpected table ${table}`);
    });

    const response = await GET(buildRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tenants).toEqual([
      expect.objectContaining({
        id: "tenant-demo",
        demo_mode: true,
        drive_mode: "real_demo_account",
        drive_readiness: expect.objectContaining({
          available: true,
          connected: true,
          status: "connected",
          connected_email: "drive-demo@mayus.test",
          root_folder_configured: true,
          root_folder_name: "MAYUS Demo",
        }),
      }),
      expect.objectContaining({
        id: "tenant-real",
        demo_mode: false,
        drive_readiness: expect.objectContaining({
          connected: false,
          root_folder_configured: false,
        }),
      }),
    ]);
    expect(JSON.stringify(json)).not.toContain("refresh-token-secret");
    expect(JSON.stringify(json)).not.toContain("access-token-secret");
  });

  it("marca tenant como demo e preserva ai_features existentes", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "tenants") {
        return query({
          data: { id: "tenant-demo", name: "MAYUS Demo", status: "ativo", plan_type: "demo", created_at: "2026-05-02T10:00:00.000Z" },
          error: null,
        });
      }

      if (table === "tenant_settings") {
        const chain = query({
          data: { ai_features: { contract_flow_mode: "hybrid", demo: { old_flag: true } } },
          error: null,
        });
        chain.upsert = vi.fn(async (payload: any, options: any) => {
          upserts.push({ payload, options });
          return { error: null };
        });
        return chain;
      }

      if (table === "system_event_logs") {
        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push(payload);
            return { error: null };
          }),
        };
      }

      if (table === "tenant_integrations") {
        return query({
          data: {
            id: "drive-1",
            tenant_id: "tenant-demo",
            provider: "google_drive",
            status: "connected",
            api_key: "refresh-token-secret",
            metadata: {
              connected_email: "drive-demo@mayus.test",
              drive_root_folder_id: "root-folder-1",
              drive_root_folder_name: "MAYUS Demo",
              drive_root_folder_url: "https://drive.google.com/drive/folders/root-folder-1",
            },
          },
          error: null,
        });
      }

      throw new Error(`unexpected table ${table}`);
    });

    const response = await PATCH(buildRequest({ tenantId: "tenant-demo", demoMode: true }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.tenant).toEqual(expect.objectContaining({
      id: "tenant-demo",
      demo_mode: true,
      drive_mode: "real_demo_account",
      drive_readiness: expect.objectContaining({
        connected: true,
        connected_email: "drive-demo@mayus.test",
        root_folder_configured: true,
      }),
    }));
    expect(JSON.stringify(json)).not.toContain("refresh-token-secret");
    expect(upserts).toEqual([
      expect.objectContaining({
        options: { onConflict: "tenant_id" },
        payload: expect.objectContaining({
          tenant_id: "tenant-demo",
          ai_features: expect.objectContaining({
            contract_flow_mode: "hybrid",
            demo_mode: true,
            demo: expect.objectContaining({
              old_flag: true,
              enabled: true,
              drive_mode: "real_demo_account",
              whatsapp_mode: "simulator",
              escavador_mode: "synthetic_oab",
              data_policy: "synthetic_only",
              updated_by: "superadmin-1",
            }),
          }),
        }),
      }),
    ]);
    expect(inserts).toEqual([
      expect.objectContaining({
        tenant_id: "tenant-demo",
        user_id: "superadmin-1",
        event_name: "demo_tenant_status_updated",
        source: "admin_demo_status",
      }),
    ]);
  });
});
