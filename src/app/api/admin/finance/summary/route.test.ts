import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { authGetUserMock, createClientMock, fromMock, isSuperadminMock } = vi.hoisted(() => {
  const authGetUser = vi.fn();
  const from = vi.fn();

  return {
    authGetUserMock: authGetUser,
    createClientMock: vi.fn(() => ({ auth: { getUser: authGetUser }, from })),
    fromMock: from,
    isSuperadminMock: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/auth/is-superadmin", () => ({
  isSuperadmin: isSuperadminMock,
}));

import { GET, POST } from "./route";

function buildRequest(token?: string) {
  return new NextRequest("http://localhost:3000/api/admin/finance/summary?from=2026-05-01&to=2026-05-31", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

function makeSelectQuery(result: { data: unknown[] | null; error: { message: string } | null }) {
  const query: any = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe("/api/admin/finance/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exige bearer token", async () => {
    const response = await GET(buildRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Nao autenticado." });
    expect(authGetUserMock).not.toHaveBeenCalled();
  });

  it("bloqueia usuario autenticado que nao e superadmin", async () => {
    authGetUserMock.mockResolvedValueOnce({ data: { user: { id: "user-1" } }, error: null });
    isSuperadminMock.mockResolvedValueOnce(false);

    const response = await GET(buildRequest("token"));

    expect(authGetUserMock).toHaveBeenCalledWith("token");
    expect(isSuperadminMock).toHaveBeenCalledWith("user-1");
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Acesso negado." });
  });

  it("retorna resumo financeiro SaaS sem expor payload bruto ou segredos", async () => {
    authGetUserMock.mockResolvedValueOnce({ data: { user: { id: "super-1" } }, error: null });
    isSuperadminMock.mockResolvedValueOnce(true);

    const tenantsQuery = makeSelectQuery({
      data: [
        {
          id: "tenant-1",
          name: "Dutra Advocacia",
          status: "ativo",
          plan_type: "scale",
          billing_cycle: "mensal",
          billing_cycle_start: "2026-05-01T00:00:00.000Z",
          billing_cycle_end: null,
          activated_at: "2026-05-01T00:00:00.000Z",
          created_at: "2026-05-01T00:00:00.000Z",
          max_processos: 100,
          asaas_customer_id: "cus-1",
          asaas_subscription_id: "sub-1",
          platform_billing_amount_cents: 64700,
          platform_billing_currency: "BRL",
        },
      ],
      error: null,
    });
    const eventsQuery = makeSelectQuery({
      data: [
        {
          id: "event-1",
          tenant_id: "tenant-1",
          provider: "asaas",
          event_name: "PAYMENT_CONFIRMED",
          external_id: "pay-1",
          customer_id: "cus-1",
          payment_id: "pay-1",
          subscription_id: "sub-1",
          asaas_event: "PAYMENT_CONFIRMED",
          event_type: "received",
          billing_status: "received",
          amount_cents: 64700,
          gross_amount: 647,
          net_amount: 647,
          status: "received",
          currency: "BRL",
          due_date: "2026-05-10",
          paid_at: "2026-05-10T10:00:00.000Z",
          occurred_at: "2026-05-10T10:00:00.000Z",
          raw_payload: { access_token: "secret" },
        },
      ],
      error: null,
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "tenants") return tenantsQuery;
      if (table === "platform_billing_events") return eventsQuery;
      throw new Error(`unexpected table ${table}`);
    });

    const response = await GET(buildRequest("token"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.summary.totals.mrr).toBe(647);
    expect(json.summary.totals.arr).toBe(7764);
    expect(json.summary.totals.receivedTotal).toBe(647);
    expect(JSON.stringify(json)).not.toContain("secret");
    expect(json.summary.tenants[0]).toMatchObject({
      id: "tenant-1",
      name: "Dutra Advocacia",
      status: "ativo",
    });
  });

  it("POST retorna 405", async () => {
    const response = await POST();

    expect(response.status).toBe(405);
  });
});
