import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserMock,
  isSuperadminMock,
  fromMock,
  inserts,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  isSuperadminMock: vi.fn(),
  fromMock: vi.fn(),
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

import { GET } from "./route";

function buildRequest(token = "token-1") {
  return new NextRequest("http://localhost:3000/api/admin/support/tenants", {
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}

function query(result: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(async () => result),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

describe("/api/admin/support/tenants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;
    getUserMock.mockResolvedValue({ data: { user: { id: "superadmin-1" } }, error: null });
    isSuperadminMock.mockResolvedValue(true);
  });

  it("lista tenants para suporte sem expor segredos", async () => {
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
            { tenant_id: "tenant-demo", ai_features: { demo_mode: true } },
            { tenant_id: "tenant-real", ai_features: { demo_mode: false } },
          ],
          error: null,
        });
      }

      if (table === "profiles") {
        return query({
          data: [
            { tenant_id: "tenant-demo", is_active: true },
            { tenant_id: "tenant-demo", is_active: false },
            { tenant_id: "tenant-real", is_active: true },
            { tenant_id: "tenant-real", is_active: true },
          ],
          error: null,
        });
      }

      if (table === "tenant_integrations") {
        return query({
          data: [
            { tenant_id: "tenant-demo", provider: "google_drive", status: "connected", api_key: "drive-secret" },
            { tenant_id: "tenant-demo", provider: "evolution", status: "connected", api_key: "whatsapp-secret" },
            { tenant_id: "tenant-real", provider: "asaas", status: "connected", api_key: "asaas-secret" },
            { tenant_id: "tenant-real", provider: "zapsign", status: "disconnected", api_key: "zapsign-secret" },
          ],
          error: null,
        });
      }

      if (table === "admin_support_grants") {
        return query({
          data: [
            {
              id: "grant-1",
              tenant_id: "tenant-real",
              requested_by: "superadmin-1",
              scope: ["tenant_sensitive_readonly"],
              status: "active",
              expires_at: "2099-05-02T10:00:00.000Z",
              created_at: "2026-05-02T10:00:00.000Z",
            },
          ],
          error: null,
        });
      }

      if (table === "system_event_logs") {
        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push(payload);
            return { error: null };
          }),
        };
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
        active_users: 1,
        integrations: expect.objectContaining({
          connected: 2,
          drive_connected: true,
          whatsapp_connected: true,
        }),
        support: expect.objectContaining({
          requires_grant_for_sensitive_access: true,
          grant_status: "not_requested",
          active_grant: null,
        }),
      }),
      expect.objectContaining({
        id: "tenant-real",
        demo_mode: false,
        active_users: 2,
        integrations: expect.objectContaining({
          connected: 1,
          pending: 1,
          billing_connected: true,
          signature_connected: false,
        }),
        support: expect.objectContaining({
          grant_status: "active",
          active_grant: expect.objectContaining({
            id: "grant-1",
            scope: ["tenant_sensitive_readonly"],
          }),
        }),
      }),
    ]);
    expect(JSON.stringify(json)).not.toContain("drive-secret");
    expect(JSON.stringify(json)).not.toContain("whatsapp-secret");
    expect(JSON.stringify(json)).not.toContain("asaas-secret");
    expect(inserts).toEqual([
      expect.objectContaining({
        tenant_id: null,
        user_id: "superadmin-1",
        event_name: "support_tenants_list_viewed",
        source: "admin_support_tenants",
      }),
    ]);
  });

  it("bloqueia usuario sem superadmin", async () => {
    isSuperadminMock.mockResolvedValueOnce(false);

    const response = await GET(buildRequest());
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toBe("Acesso negado.");
  });
});
