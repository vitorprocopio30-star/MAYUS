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

import { POST } from "./route";

function buildRequest(body: unknown, token = "token-1") {
  return new NextRequest("http://localhost:3000/api/admin/support/grants", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

function query(result: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    single: vi.fn(async () => result),
  };
  return chain;
}

describe("/api/admin/support/grants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;
    getUserMock.mockResolvedValue({ data: { user: { id: "superadmin-1" } }, error: null });
    isSuperadminMock.mockResolvedValue(true);
  });

  it("cria grant temporario com motivo, escopo permitido e auditoria", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "tenants") {
        return query({ data: { id: "11111111-1111-4111-8111-111111111111", name: "Dutra" }, error: null });
      }

      if (table === "admin_support_grants") {
        const chain = query({
          data: {
            id: "grant-1",
            tenant_id: "11111111-1111-4111-8111-111111111111",
            requested_by: "superadmin-1",
            reason: "Atendimento solicitado pelo cliente no WhatsApp.",
            scope: ["tenant_sensitive_readonly", "support_case"],
            status: "active",
            expires_at: "2026-05-02T11:00:00.000Z",
            created_at: "2026-05-02T10:00:00.000Z",
            revoked_at: null,
          },
          error: null,
        });
        chain.insert = vi.fn(() => chain);
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

      throw new Error(`unexpected table ${table}`);
    });

    const response = await POST(buildRequest({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reason: "Atendimento solicitado pelo cliente no WhatsApp.",
      durationMinutes: 60,
      scope: ["tenant_sensitive_readonly", "support_case", "invalid_scope"],
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.grant).toEqual(expect.objectContaining({
      id: "grant-1",
      tenant_id: "11111111-1111-4111-8111-111111111111",
      scope: ["tenant_sensitive_readonly", "support_case"],
      status: "active",
    }));
    expect(inserts).toEqual([
      expect.objectContaining({
        tenant_id: "11111111-1111-4111-8111-111111111111",
        user_id: "superadmin-1",
        event_name: "support_grant_created",
        source: "admin_support_grants",
        payload: expect.objectContaining({
          sensitive_data_included: false,
          scope: ["tenant_sensitive_readonly", "support_case"],
        }),
      }),
    ]);
  });

  it("exige motivo minimo", async () => {
    const response = await POST(buildRequest({
      tenantId: "11111111-1111-4111-8111-111111111111",
      reason: "curto",
    }));

    expect(response.status).toBe(422);
  });
});

