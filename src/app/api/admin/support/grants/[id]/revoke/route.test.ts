import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserMock,
  isSuperadminMock,
  fromMock,
  updates,
  inserts,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  isSuperadminMock: vi.fn(),
  fromMock: vi.fn(),
  updates: [] as any[],
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

function buildRequest(token = "token-1") {
  return new NextRequest("http://localhost:3000/api/admin/support/grants/grant-1/revoke", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}

function query(result: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    update: vi.fn((payload: any) => {
      updates.push(payload);
      return chain;
    }),
    then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
  };
  return chain;
}

describe("/api/admin/support/grants/[id]/revoke", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    inserts.length = 0;
    getUserMock.mockResolvedValue({ data: { user: { id: "superadmin-1" } }, error: null });
    isSuperadminMock.mockResolvedValue(true);
  });

  it("revoga grant ativo e audita", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_support_grants") {
        return query({ data: { id: "grant-1", tenant_id: "tenant-1", status: "active" }, error: null });
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

    const response = await POST(buildRequest(), { params: { id: "grant-1" } });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, grant_id: "grant-1", status: "revoked" });
    expect(updates[0]).toEqual(expect.objectContaining({
      status: "revoked",
      revoked_by: "superadmin-1",
    }));
    expect(inserts).toEqual([
      expect.objectContaining({
        tenant_id: "tenant-1",
        user_id: "superadmin-1",
        event_name: "support_grant_revoked",
      }),
    ]);
  });

  it("bloqueia grant encerrado", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "admin_support_grants") {
        return query({ data: { id: "grant-1", tenant_id: "tenant-1", status: "revoked" }, error: null });
      }
      throw new Error(`unexpected table ${table}`);
    });

    const response = await POST(buildRequest(), { params: { id: "grant-1" } });

    expect(response.status).toBe(409);
  });
});

