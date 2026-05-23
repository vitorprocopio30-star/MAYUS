import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  adminFromMock,
  adminRpcMock,
  createClientMock,
  getUserMock,
  escavadorFetchMock,
  requireTenantApiKeyMock,
  criarMonitoramentoProcessoMock,
  solicitarResumoProcessoMock,
} = vi.hoisted(() => {
  const localFromMock = vi.fn();
  const localRpcMock = vi.fn();
  const localGetUserMock = vi.fn();

  return {
    adminFromMock: localFromMock,
    adminRpcMock: localRpcMock,
    createClientMock: vi.fn((_url: string, _key: string, options?: Record<string, unknown>) => {
      if (options && "global" in options) {
        return { auth: { getUser: localGetUserMock } };
      }
      return { from: localFromMock, rpc: localRpcMock };
    }),
    getUserMock: localGetUserMock,
    escavadorFetchMock: vi.fn(),
    requireTenantApiKeyMock: vi.fn(),
    criarMonitoramentoProcessoMock: vi.fn(),
    solicitarResumoProcessoMock: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/services/escavador-client", () => ({
  escavadorFetch: escavadorFetchMock,
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
  return new NextRequest("http://localhost:3000/api/processos/ativar-monitoramento", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer session-token",
    },
    body: JSON.stringify(body),
  });
}

function chain(data: any = null) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    ilike: vi.fn(() => query),
    single: vi.fn(async () => ({ data, error: null })),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    insert: vi.fn(async () => ({ error: null })),
    upsert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(async () => ({ data: { id: "process-1" }, error: null })),
      })),
    })),
    delete: vi.fn(() => query),
    then(resolve: (value: any) => void) {
      resolve({ data: Array.isArray(data) ? data : [], error: null });
    },
  };
  return query;
}

function mockDb(
  monthlyLimitCents = 10000,
  capacityOverrides: Record<string, unknown> = {},
  tenantOverrides: Record<string, unknown> = {},
) {
  const profileQuery = chain({ tenant_id: "tenant-1" });
  const monitoredQuery = chain(null);
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
        monthly_limit_cents: monthlyLimitCents,
        warn_at_ratio: 0.8,
        hard_stop: true,
      },
    },
  });
  const usageQuery = chain([]);
  const genericQuery = chain();

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
    if (table === "monitored_processes") return monitoredQuery;
    if (table === "tenants") return tenantQuery;
    if (table === "tenant_settings") return tenantSettingsQuery;
    if (table === "api_usage_log") return usageQuery;
    return genericQuery;
  });
}

describe("POST /api/processos/ativar-monitoramento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    requireTenantApiKeyMock.mockResolvedValue({ apiKey: "escavador-key" });
    escavadorFetchMock.mockResolvedValue({ partes: [], fontes: [] });
    criarMonitoramentoProcessoMock.mockResolvedValue({ ok: true, monitoramentoId: "mon-1" });
    solicitarResumoProcessoMock.mockResolvedValue(true);
    mockDb();
  });

  it("exige preview de custo antes de ativar monitoramento individual excedente", async () => {
    const response = await POST(buildRequest({ numero_cnj: "0000001-11.2026.8.26.0100" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      requer_confirmacao: true,
      monitoring_overage: expect.objectContaining({
        included_limit: 100,
        current_monitored_count: 100,
        free_slots: 0,
        overage_count: 1,
        unit_price_cents: 97,
        estimated_monthly_cost_cents: 97,
      }),
    }));
    expect(requireTenantApiKeyMock).not.toHaveBeenCalled();
    expect(escavadorFetchMock).not.toHaveBeenCalled();
    expect(criarMonitoramentoProcessoMock).not.toHaveBeenCalled();
  });

  it("bloqueia ativacao individual antes do Escavador quando budget esta zerado", async () => {
    mockDb(0, { total_monitorados: 98, disponivel_sem_custo: 2 });

    const response = await POST(buildRequest({
      numero_cnj: "0000001-11.2026.8.26.0100",
      confirmar_custo: true,
    }));
    const payload = await response.json();

    expect(response.status).toBe(402);
    expect(payload.error).toContain("budget");
    expect(requireTenantApiKeyMock).not.toHaveBeenCalled();
    expect(escavadorFetchMock).not.toHaveBeenCalled();
    expect(criarMonitoramentoProcessoMock).not.toHaveBeenCalled();
  });

  it("bloqueia ativacao individual excedente sem aceite explicito e informa endpoint de aceite", async () => {
    mockDb(10000, {}, {
      monitoring_overage_status: "excedente_bloqueado",
      monitoring_payment_method_status: "cartao_pendente",
      monitoring_overage_terms_accepted_at: null,
      asaas_customer_id: null,
      asaas_subscription_id: null,
    });

    const response = await POST(buildRequest({
      numero_cnj: "0000001-11.2026.8.26.0100",
      confirmar_custo: true,
    }));
    const payload = await response.json();

    expect(response.status).toBe(402);
    expect(payload.code).toBe("monitoring_overage_terms_required");
    expect(payload.monitoring_overage).toEqual(expect.objectContaining({
      included_limit: 100,
      current_monitored_count: 100,
      free_slots: 0,
      overage_count: 1,
      unit_price_cents: 97,
      estimated_monthly_cost_cents: 97,
      blocked_reason: "monitoring_overage_terms_required",
      terms_acceptance_required: true,
      terms_acceptance_endpoint: "/api/monitoramento/overage-terms",
    }));
    expect(requireTenantApiKeyMock).not.toHaveBeenCalled();
    expect(escavadorFetchMock).not.toHaveBeenCalled();
    expect(criarMonitoramentoProcessoMock).not.toHaveBeenCalled();
  });
});
