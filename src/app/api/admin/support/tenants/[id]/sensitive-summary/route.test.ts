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
  return new NextRequest("http://localhost:3000/api/admin/support/tenants/tenant-1/sensitive-summary", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function query(result: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

describe("/api/admin/support/tenants/[id]/sensitive-summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;
    getUserMock.mockResolvedValue({ data: { user: { id: "superadmin-1" } }, error: null });
    isSuperadminMock.mockResolvedValue(true);
  });

  it("bloqueia sem grant ativo com escopo sensivel", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_support_grants") {
        return query({ data: [], error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const response = await GET(buildRequest(), { params: { id: "tenant-1" } });
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.grant_required).toBe(true);
  });

  it("retorna resumo redigido e audita visualizacao com grant ativo", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_support_grants") {
        return query({
          data: [
            {
              id: "grant-1",
              tenant_id: "tenant-1",
              requested_by: "superadmin-1",
              scope: ["tenant_sensitive_readonly"],
              status: "active",
              expires_at: "2099-05-02T10:00:00.000Z",
              created_at: "2026-05-02T09:00:00.000Z",
            },
          ],
          error: null,
        });
      }

      if (table === "tenants") {
        return query({
          data: { id: "tenant-1", name: "Dutra", status: "ativo", plan_type: "pro", created_at: "2026-05-01T10:00:00.000Z" },
          error: null,
        });
      }

      if (table === "profiles") {
        return query({
          data: [
            { role: "admin", is_active: true },
            { role: "advogado", is_active: true },
            { role: "financeiro", is_active: false },
          ],
          error: null,
        });
      }

      if (table === "tenant_integrations") {
        return query({
          data: [
            { provider: "google_drive", status: "connected", api_key: "drive-secret" },
            { provider: "asaas", status: "disconnected", api_key: "asaas-secret" },
          ],
          error: null,
        });
      }

      if (table === "system_event_logs") {
        const chain = query({
          data: [
            { event_name: "tenant_setup_doctor_report_created", status: "completed", source: "setup_doctor", created_at: "2026-05-02T10:00:00.000Z", payload: { secret: "nope" } },
          ],
          error: null,
        });
        chain.insert = vi.fn(async (payload: any) => {
          inserts.push(payload);
          return { error: null };
        });
        return chain;
      }

      throw new Error(`unexpected table ${table}`);
    });

    const response = await GET(buildRequest(), { params: { id: "tenant-1" } });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.summary).toEqual(expect.objectContaining({
      raw_data_included: false,
      active_users: 2,
      users_by_role: expect.objectContaining({ admin: 1, advogado: 1, financeiro: 1 }),
      integrations_by_status: expect.objectContaining({ connected: 1, disconnected: 1 }),
    }));
    expect(json.summary.recent_events[0]).toEqual({
      event_name: "tenant_setup_doctor_report_created",
      status: "completed",
      source: "setup_doctor",
      created_at: "2026-05-02T10:00:00.000Z",
    });
    expect(JSON.stringify(json)).not.toContain("drive-secret");
    expect(JSON.stringify(json)).not.toContain("asaas-secret");
    expect(JSON.stringify(json)).not.toContain("nope");
    expect(inserts).toEqual([
      expect.objectContaining({
        tenant_id: "tenant-1",
        user_id: "superadmin-1",
        event_name: "support_access_viewed",
        payload: expect.objectContaining({
          grant_id: "grant-1",
          sensitive_data_included: false,
        }),
      }),
    ]);
  });
});

