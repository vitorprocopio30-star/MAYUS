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

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/escavador/sincronizar-oab", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function validBody(overrides?: Record<string, unknown>) {
  return {
    oab_estado: "SP",
    oab_numero: "123456",
    source: "monitoramento_ui_sync_button",
    allow_paid_search: true,
    ...overrides,
  };
}

function chain(data: any = null) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    gte: vi.fn(() => query),
    ilike: vi.fn(() => query),
    single: vi.fn(async () => ({ data, error: null })),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    insert: vi.fn(async () => ({ error: null })),
    upsert: vi.fn(async () => ({ error: null })),
    then(resolve: (value: any) => void) {
      resolve({ data: Array.isArray(data) ? data : [], error: null });
    },
  };
  return query;
}

function mockDb(monthlyLimitCents = 10000, cache: any = null) {
  const profileQuery = chain({ tenant_id: "tenant-1" });
  const usageQuery = chain([]);
  const cacheQuery = chain(cache);
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

  adminRpcMock.mockReturnValue({
    single: vi.fn(async () => ({
      data: { total_monitorados: 2, gratuitos: 100, disponivel_sem_custo: 98, preco_extra: 0.97 },
      error: null,
    })),
  });

  adminFromMock.mockImplementation((table: string) => {
    if (table === "profiles") return profileQuery;
    if (table === "processos_cache") return cacheQuery;
    if (table === "tenant_settings") return tenantSettingsQuery;
    if (table === "api_usage_log") return usageQuery;
    if (table === "system_event_logs") return eventsQuery;
    return genericQuery;
  });

  return { eventsQuery, usageQuery };
}

describe("POST /api/escavador/sincronizar-oab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    cookiesMock.mockResolvedValue({ getAll: () => [], set: vi.fn() });
    createServerClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    requireTenantApiKeyMock.mockResolvedValue({ apiKey: "escavador-key" });
    mockDb();
  });

  it("bloqueia sem confirmacao explicita antes de resolver chave", async () => {
    const response = await POST(buildRequest(validBody({ allow_paid_search: false })));

    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(requireTenantApiKeyMock).not.toHaveBeenCalled();
  });

  it("bloqueia pelo budget antes de chamar Escavador", async () => {
    mockDb(0);

    const response = await POST(buildRequest(validBody()));
    const payload = await response.json();

    expect(response.status).toBe(402);
    expect(payload.error).toContain("budget");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(requireTenantApiKeyMock).not.toHaveBeenCalled();
  });

  it("retorna cache full fresco antes de exigir custo ou chave", async () => {
    mockDb(0, {
      processos: [{ numero_processo: "0001", status: "ATIVO" }],
      total: 1,
      advogado: { nome: "Dra. Maria" },
      total_paginas: 3,
      updated_at: new Date().toISOString(),
    });

    const response = await POST(buildRequest(validBody({ allow_paid_search: false })));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(expect.objectContaining({
      cached: true,
      fonte: "cache",
      total: 1,
      paginas_buscadas: 3,
    }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(requireTenantApiKeyMock).not.toHaveBeenCalled();
  });

  it("sincroniza quando ha budget aprovado", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      items: [],
      advogado_encontrado: { nome: "Dra. Maria", quantidade_processos: 0 },
      links: { next: null },
    }), {
      status: 200,
      headers: { "Creditos-Utilizados": "1" },
    }) as any);

    const response = await POST(buildRequest(validBody()));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(requireTenantApiKeyMock).toHaveBeenCalledWith("tenant-1", "escavador");
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/advogado/processos"), expect.any(Object));
    expect(payload).toEqual(expect.objectContaining({
      fonte: "escavador",
      total_retornado: 0,
      paginas_buscadas: 1,
    }));
  });
});
