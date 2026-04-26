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
  return new NextRequest("http://localhost:3000/api/escavador/buscar-completo", {
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

function makeSingleQuery(data: any, error: any = null) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(async () => ({ data, error })),
  };
  return query;
}

function makeCacheQuery(cache: any) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(async () => ({ data: cache, error: null })),
    upsert: vi.fn(async () => ({ error: null })),
  };
  return query;
}

function makeUpsertQuery() {
  return {
    insert: vi.fn(async () => ({ error: null })),
    upsert: vi.fn(async () => ({ error: null })),
  };
}

function makeMonitoradosQuery(data: any[] = []) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(async () => ({ data, error: null })),
  };
  return query;
}

function mockCommonDb(cache: any = null) {
  const profileQuery = makeSingleQuery({ tenant_id: "tenant-1" });
  const cacheQuery = makeCacheQuery(cache);
  const usageQuery = makeUpsertQuery();
  const oabsQuery = makeUpsertQuery();
  const monitoramentosQuery = makeUpsertQuery();
  const monitoradosQuery = makeMonitoradosQuery();

  adminRpcMock.mockReturnValue({
    single: vi.fn(async () => ({
      data: { total_monitorados: 2, gratuitos: 100, disponivel_sem_custo: 98, preco_extra: 0.97 },
      error: null,
    })),
  });

  adminFromMock.mockImplementation((table: string) => {
    if (table === "profiles") return profileQuery;
    if (table === "processos_cache") return cacheQuery;
    if (table === "api_usage_log") return usageQuery;
    if (table === "oabs_salvas") return oabsQuery;
    if (table === "tenant_oab_monitoramentos") return monitoramentosQuery;
    if (table === "monitored_processes") return monitoradosQuery;
    throw new Error(`unexpected table ${table}`);
  });

  return { cacheQuery, monitoradosQuery, usageQuery };
}

describe("POST /api/escavador/buscar-completo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
    cookiesMock.mockResolvedValue({ getAll: () => [], set: vi.fn() });
    createServerClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    requireTenantApiKeyMock.mockResolvedValue({ apiKey: "escavador-key" });
    mockCommonDb();
  });

  it("retorna 401 sem usuario autenticado", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });

    const response = await POST(buildRequest(validBody()));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("retorna 400 sem OAB valida", async () => {
    const response = await POST(buildRequest({ oab_estado: "SP" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "OAB inválida" });
  });

  it("bloqueia busca paga sem confirmacao explicita", async () => {
    const response = await POST(buildRequest(validBody({ allow_paid_search: false })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Busca completa de OAB bloqueada sem confirmação explícita." });
    expect(requireTenantApiKeyMock).not.toHaveBeenCalled();
  });

  it("retorna 400 quando Escavador nao esta configurado no Vault", async () => {
    requireTenantApiKeyMock.mockResolvedValueOnce({ apiKey: null });

    const response = await POST(buildRequest(validBody()));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Escavador não configurado" });
  });

  it("retorna cache hit sem chamar API externa", async () => {
    mockCommonDb({
      processos: [{ numero_processo: "0001", status: "ATIVO" }],
      total: 1,
      advogado: { nome: "Dra. Maria" },
      updated_at: new Date().toISOString(),
    });

    const response = await POST(buildRequest(validBody()));

    expect(global.fetch).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      cached: true,
      total: 1,
      advogado_nome: "Dra. Maria",
    }));
  });

  it("chama Escavador com api key resolvida e persiste cache", async () => {
    const { cacheQuery, usageQuery } = mockCommonDb(null);
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      items: [{
        id: 123,
        numero_cnj: "1234567-89.2024.8.26.0100",
        fontes: [{ processo_fonte_id: "fonte-1", capa: { assunto: "Beneficio" }, envolvidos: [], movimentacoes: [] }],
        advogado_encontrado: null,
      }],
      advogado_encontrado: { nome: "Dra. Maria", quantidade_processos: 1 },
      links: { next: null },
    }), {
      status: 200,
      headers: { "Creditos-Utilizados": "1" },
    }) as any);

    const response = await POST(buildRequest(validBody()));

    expect(requireTenantApiKeyMock).toHaveBeenCalledWith("tenant-1", "escavador");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.escavador.com/api/v2/advogado/processos?oab_numero=123456&oab_estado=SP",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer escavador-key" }),
      })
    );
    expect(usageQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ creditos: 1 }));
    expect(cacheQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: "tenant-1" }), { onConflict: "tenant_id,cache_key" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      total: 1,
      total_retornado: 1,
      advogado_nome: "Dra. Maria",
    }));
  });

  it("tenta URL fallback quando primeira chamada falha", async () => {
    mockCommonDb(null);
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(new Response("bad", { status: 500 }) as any)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        items: [],
        advogado_encontrado: { nome: "Dra. Maria", quantidade_processos: 0 },
      }), { status: 200 }) as any);

    const response = await POST(buildRequest(validBody()));

    expect(global.fetch).toHaveBeenNthCalledWith(2,
      "https://api.escavador.com/api/v2/advogado/processos?numero=123456&estado=SP",
      expect.any(Object)
    );
    expect(response.status).toBe(200);
  });
});
