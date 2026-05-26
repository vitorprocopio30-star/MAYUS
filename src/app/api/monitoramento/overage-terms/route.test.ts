import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  adminFromMock,
  adminRpcMock,
  cookiesMock,
  createClientMock,
  createServerClientMock,
  getUserMock,
} = vi.hoisted(() => {
  const localFromMock = vi.fn();
  const localRpcMock = vi.fn();

  return {
    adminFromMock: localFromMock,
    adminRpcMock: localRpcMock,
    cookiesMock: vi.fn(),
    createClientMock: vi.fn(() => ({ from: localFromMock, rpc: localRpcMock })),
    createServerClientMock: vi.fn(),
    getUserMock: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/monitoramento/overage-terms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function chain(data: any = null) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    single: vi.fn(async () => ({ data, error: null })),
    update: vi.fn(() => query),
    insert: vi.fn(async () => ({ error: null })),
  };
  return query;
}

function mockDb(tenantOverrides: Record<string, unknown> = {}) {
  const profileQuery = chain({ tenant_id: "tenant-1" });
  const tenantQuery = chain({
    monitoring_included_process_limit: 100,
    monitoring_extra_process_price_cents: 97,
    monitoring_overage_status: "excedente_bloqueado",
    monitoring_payment_method_status: "metodo_valido",
    monitoring_overage_terms_accepted_at: null,
    asaas_customer_id: "cus_1",
    asaas_subscription_id: "sub_1",
    status: "ativo",
    ...tenantOverrides,
  });
  const eventsQuery = chain();

  adminRpcMock.mockImplementation((fn: string) => {
    if (fn === "check_monitoramento_capacity") {
      return {
        single: vi.fn(async () => ({
          data: {
            total_monitorados: 100,
            gratuitos: 100,
            disponivel_sem_custo: 0,
            preco_extra: 0.97,
            preco_extra_centavos: 97,
          },
          error: null,
        })),
      };
    }
    return chain();
  });

  adminFromMock.mockImplementation((table: string) => {
    if (table === "profiles") return profileQuery;
    if (table === "tenants") return tenantQuery;
    if (table === "system_event_logs") return eventsQuery;
    return chain();
  });

  return { tenantQuery, eventsQuery };
}

describe("POST /api/monitoramento/overage-terms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesMock.mockResolvedValue({ getAll: () => [], set: vi.fn() });
    createServerClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  });

  it("grava aceite explicito e libera excedente quando metodo MAYUS esta valido", async () => {
    const { tenantQuery, eventsQuery } = mockDb();

    const response = await POST(buildRequest({ accept_terms: true, incoming_count: 2 }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      ok: true,
      overage_status: "excedente_liberado",
      payment_ready: true,
      monitoring_overage: expect.objectContaining({
        included_limit: 100,
        current_monitored_count: 100,
        overage_count: 2,
        unit_price_cents: 97,
        estimated_monthly_cost_cents: 194,
        blocked_reason: null,
      }),
    }));
    expect(tenantQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      monitoring_overage_terms_accepted_by: "user-1",
      monitoring_overage_status: "excedente_liberado",
      monitoring_overage_blocked_reason: null,
    }));
    expect(eventsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_name: "monitoring_overage_terms_accepted",
      status: "ok",
      payload: expect.objectContaining({
        overage_status: "excedente_liberado",
      }),
    }));
    expect(JSON.stringify(eventsQuery.insert.mock.calls)).not.toContain("sub_1");
  });

  it("aceita termos mas mantem pendente quando metodo de pagamento nao esta pronto", async () => {
    const { tenantQuery, eventsQuery } = mockDb({
      monitoring_payment_method_status: "cartao_pendente",
      asaas_customer_id: null,
      asaas_subscription_id: null,
    });

    const response = await POST(buildRequest({ accept_terms: true, incoming_count: 1 }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      overage_status: "cartao_pendente",
      payment_ready: false,
      monitoring_overage: expect.objectContaining({
        blocked_reason: "platform_payment_method_required",
      }),
    }));
    expect(tenantQuery.update).toHaveBeenCalledWith(expect.objectContaining({
      monitoring_overage_status: "cartao_pendente",
      monitoring_overage_blocked_reason: "platform_payment_method_required",
    }));
    expect(eventsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_name: "monitoring_overage_terms_accepted",
      status: "pending_payment_method",
    }));
  });

  it("exige aceite explicito no corpo da requisicao", async () => {
    mockDb();

    const response = await POST(buildRequest({ accept_terms: false }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Aceite explicito");
  });
});
