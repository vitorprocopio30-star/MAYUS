import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  adminFromMock,
  adminRpcMock,
  cookiesMock,
  createClientMock,
  createServerClientMock,
  getUserMock,
  requireTenantApiKeyMock,
  criarMonitoramentoProcessoMock,
  solicitarResumoProcessoMock,
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
    requireTenantApiKeyMock: vi.fn(),
    criarMonitoramentoProcessoMock: vi.fn(),
    solicitarResumoProcessoMock: vi.fn(),
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

vi.mock("@/lib/integrations/server", () => ({
  requireTenantApiKey: requireTenantApiKeyMock,
}));

vi.mock("@/lib/services/monitoramento-processos", () => ({
  criarMonitoramentoProcesso: criarMonitoramentoProcessoMock,
  solicitarResumoProcesso: solicitarResumoProcessoMock,
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/monitoramento/importar-lote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function processRows() {
  return [
    { numero_processo: "0001", tribunal: "TJSP", assunto: "Beneficio", fase_atual: "CONHECIMENTO" },
    { numero_processo: "0002", tribunal: "TJSP", assunto: "Beneficio", fase_atual: "CONHECIMENTO" },
  ];
}

function chain(data: any = null) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(async () => ({ data: Array.isArray(data) ? data : [], error: null })),
    gte: vi.fn(() => query),
    ilike: vi.fn(() => query),
    single: vi.fn(async () => ({ data, error: null })),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    insert: vi.fn(async () => ({ error: null })),
    upsert: vi.fn(async () => ({ error: null })),
    delete: vi.fn(() => query),
    then(resolve: (value: any) => void) {
      resolve({ data: Array.isArray(data) ? data : [], error: null });
    },
  };
  return query;
}

function mockDb(
  monthlyLimitCents = 10000,
  tenantOverrides: Record<string, unknown> = {},
  capacityOverrides: Record<string, unknown> = {},
) {
  const profileQuery = chain({ tenant_id: "tenant-1" });
  const existingProcessesQuery = chain([]);
  const usageQuery = chain([]);
  const tenantQuery = chain({
    monitoring_included_process_limit: 100,
    monitoring_extra_process_price_cents: 97,
    monitoring_overage_status: "excedente_liberado",
    monitoring_payment_method_status: "metodo_valido",
    monitoring_overage_terms_accepted_at: "2026-05-15T00:00:00.000Z",
    asaas_customer_id: "cus_1",
    asaas_subscription_id: "sub_1",
    status: "ativo",
    ...tenantOverrides,
  });
  const tenantSettingsQuery = chain({
    ai_features: {
      escavador_budget_policy: {
        enabled: true,
        cache_first: true,
        require_paid_search_confirmation: true,
        monthly_limit_cents: monthlyLimitCents,
        warn_at_ratio: 0.8,
        hard_stop: true,
      },
    },
  });
  const eventsQuery = chain();
  const genericQuery = chain();

  adminRpcMock.mockImplementation((fn: string) => {
    if (fn === "check_monitoramento_capacity") {
      return {
        single: vi.fn(async () => ({
          data: {
            total_monitorados: 100,
            gratuitos: 100,
            disponivel_sem_custo: 0,
            preco_extra: 1,
            preco_extra_centavos: 97,
            ...capacityOverrides,
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
    if (table === "monitored_processes") return existingProcessesQuery;
    if (table === "tenant_settings") return tenantSettingsQuery;
    if (table === "api_usage_log") return usageQuery;
    if (table === "system_event_logs") return eventsQuery;
    return genericQuery;
  });

  return { eventsQuery };
}

describe("POST /api/monitoramento/importar-lote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesMock.mockResolvedValue({ getAll: () => [], set: vi.fn() });
    createServerClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    requireTenantApiKeyMock.mockResolvedValue({ apiKey: "escavador-key" });
    criarMonitoramentoProcessoMock.mockResolvedValue({ ok: true, monitoramentoId: "mon-1" });
    solicitarResumoProcessoMock.mockResolvedValue(true);
    mockDb();
  });

  it("exige confirmacao antes de gerar custo excedente", async () => {
    const response = await POST(buildRequest({ processos: processRows(), confirmar_custo: false }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      requer_confirmacao: true,
      excedente: 2,
      custo_mensal: 1.94,
      custo_mensal_centavos: 194,
      preco_por_extra_centavos: 97,
      monitoring_overage: expect.objectContaining({
        included_limit: 100,
        current_monitored_count: 100,
        free_slots: 0,
        overage_count: 2,
        unit_price_cents: 97,
        estimated_monthly_cost_cents: 194,
        blocked_reason: null,
      }),
    }));
    expect(requireTenantApiKeyMock).not.toHaveBeenCalled();
  });

  it("importa dentro dos 100 inclusos sem custo excedente", async () => {
    mockDb(10000, {}, {
      total_monitorados: 98,
      disponivel_sem_custo: 2,
    });

    const response = await POST(buildRequest({ processos: processRows(), confirmar_custo: false }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      importados: 2,
      excedente_cobrado: 0,
      custo_gerado: 0,
    }));
    expect(requireTenantApiKeyMock).toHaveBeenCalledWith("tenant-1", "escavador");
    expect(criarMonitoramentoProcessoMock).toHaveBeenCalledTimes(2);
  });

  it("bloqueia importacao dentro dos inclusos quando budget do Escavador esta zerado", async () => {
    mockDb(0, {}, {
      total_monitorados: 98,
      disponivel_sem_custo: 2,
    });

    const response = await POST(buildRequest({ processos: processRows(), confirmar_custo: false }));
    const payload = await response.json();

    expect(response.status).toBe(402);
    expect(payload.error).toContain("budget");
    expect(requireTenantApiKeyMock).not.toHaveBeenCalled();
    expect(criarMonitoramentoProcessoMock).not.toHaveBeenCalled();
  });

  it("bloqueia importacao excedente quando budget do Escavador esta zerado", async () => {
    const { eventsQuery } = mockDb(0);

    const response = await POST(buildRequest({ processos: processRows(), confirmar_custo: true }));
    const payload = await response.json();

    expect(response.status).toBe(402);
    expect(payload.error).toContain("budget");
    expect(requireTenantApiKeyMock).not.toHaveBeenCalled();
    expect(criarMonitoramentoProcessoMock).not.toHaveBeenCalled();
    expect(eventsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_name: "escavador_budget_blocked",
      payload: expect.objectContaining({
        action: "importar_lote_monitoramento",
      }),
    }));
    expect(JSON.stringify(eventsQuery.insert.mock.calls)).not.toContain("escavador-key");
  });

  it("bloqueia importacao excedente sem aceite e metodo de pagamento da plataforma", async () => {
    const { eventsQuery } = mockDb(10000, {
      monitoring_overage_status: "excedente_bloqueado",
      monitoring_payment_method_status: "cartao_pendente",
      monitoring_overage_terms_accepted_at: null,
      asaas_customer_id: null,
      asaas_subscription_id: null,
    });

    const response = await POST(buildRequest({ processos: processRows(), confirmar_custo: true }));
    const payload = await response.json();

    expect(response.status).toBe(402);
    expect(payload.code).toBe("monitoring_overage_terms_required");
    expect(payload.monitoring_overage).toEqual(expect.objectContaining({
      included_limit: 100,
      current_monitored_count: 100,
      free_slots: 0,
      overage_count: 2,
      unit_price_cents: 97,
      estimated_monthly_cost_cents: 194,
      blocked_reason: "monitoring_overage_terms_required",
      terms_acceptance_required: true,
      terms_acceptance_endpoint: "/api/monitoramento/overage-terms",
    }));
    expect(requireTenantApiKeyMock).not.toHaveBeenCalled();
    expect(criarMonitoramentoProcessoMock).not.toHaveBeenCalled();
    expect(eventsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_name: "monitoring_overage_blocked",
      status: "blocked",
    }));
    expect(eventsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_name: "monitoring_overage_terms_required",
      status: "blocked",
    }));
  });

  it("bloqueia importacao excedente com aceite mas sem metodo valido da plataforma", async () => {
    const { eventsQuery } = mockDb(10000, {
      monitoring_overage_status: "excedente_bloqueado",
      monitoring_payment_method_status: "cartao_pendente",
      monitoring_overage_terms_accepted_at: "2026-05-15T00:00:00.000Z",
      asaas_customer_id: null,
      asaas_subscription_id: null,
    });

    const response = await POST(buildRequest({ processos: processRows(), confirmar_custo: true }));
    const payload = await response.json();

    expect(response.status).toBe(402);
    expect(payload.code).toBe("monitoring_payment_method_required");
    expect(requireTenantApiKeyMock).not.toHaveBeenCalled();
    expect(criarMonitoramentoProcessoMock).not.toHaveBeenCalled();
    expect(eventsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_name: "monitoring_overage_blocked",
      status: "blocked",
    }));
  });
});
