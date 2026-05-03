import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserMock,
  isSuperadminMock,
  fromMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  isSuperadminMock: vi.fn(),
  fromMock: vi.fn(),
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
  return new NextRequest("http://localhost:3000/api/admin/support/inbox", {
    headers: { authorization: `Bearer ${token}` },
  });
}

function query(result: any) {
  const chain: any = {
    select: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => result),
  };
  return chain;
}

describe("/api/admin/support/inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "superadmin-1" } }, error: null });
    isSuperadminMock.mockResolvedValue(true);
  });

  it("lista eventos de suporte com payload redigido", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "system_event_logs") {
        return query({
          data: [
            {
              id: "event-1",
              tenant_id: "tenant-1",
              user_id: "superadmin-1",
              event_name: "support_access_viewed",
              source: "admin_support_sensitive_summary",
              status: "completed",
              created_at: "2026-05-03T10:00:00.000Z",
              payload: {
                tenant_id: "tenant-1",
                grant_id: "grant-1",
                scope: ["tenant_sensitive_readonly"],
                secret: "never",
                sensitive_data_included: false,
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
    expect(json.items).toEqual([
      expect.objectContaining({
        id: "event-1",
        event_name: "support_access_viewed",
        payload: expect.objectContaining({
          tenant_id: "tenant-1",
          grant_id: "grant-1",
          scope: ["tenant_sensitive_readonly"],
          sensitive_data_included: false,
        }),
      }),
    ]);
    expect(JSON.stringify(json)).not.toContain("never");
    expect(json.metadata).toEqual(expect.objectContaining({
      raw_payload_included: false,
      sensitive_data_included: false,
    }));
  });

  it("bloqueia usuario sem superadmin", async () => {
    isSuperadminMock.mockResolvedValueOnce(false);

    const response = await GET(buildRequest());

    expect(response.status).toBe(403);
  });
});

