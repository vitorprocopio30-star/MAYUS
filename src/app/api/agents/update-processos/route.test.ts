import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  fromMock,
  escavadorFetchMock,
  requireTenantApiKeyMock,
  queueUpdates,
  monitoredUpdates,
  movementInserts,
  eventInserts,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  escavadorFetchMock: vi.fn(),
  requireTenantApiKeyMock: vi.fn(),
  queueUpdates: [] as any[],
  monitoredUpdates: [] as any[],
  movementInserts: [] as any[],
  eventInserts: [] as any[],
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ from: fromMock })),
}));

vi.mock("@/lib/services/escavador-client", () => ({
  escavadorFetch: escavadorFetchMock,
}));

vi.mock("@/lib/integrations/server", () => ({
  requireTenantApiKey: requireTenantApiKeyMock,
}));

import { GET } from "./route";

function makeQueueQuery() {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({
      data: [{
        id: "queue-1",
        numero_cnj: "3002575-03.2026.8.19.0000",
        tenant_id: "tenant-1",
        payload: { source: "webhook" },
      }],
      error: null,
    })),
    update: vi.fn((payload: any) => {
      queueUpdates.push(payload);
      return query;
    }),
    then: (resolve: any) => resolve({ data: null, error: null }),
  };
  return query;
}

function makeMonitoredQuery() {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    update: vi.fn((payload: any) => {
      monitoredUpdates.push(payload);
      return query;
    }),
    then: (resolve: any) => resolve({
      data: [{ id: "process-1", tenant_id: "tenant-1", numero_processo: "3002575-03.2026.8.19.0000" }],
      error: null,
    }),
  };
  return query;
}

function makeMovementsQuery() {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    insert: vi.fn((payload: any) => {
      movementInserts.push(payload);
      return {
        select: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: { id: "movement-1" }, error: null })),
        })),
      };
    }),
  };
  return query;
}

function makeSystemEventsQuery() {
  return {
    insert: vi.fn(async (payload: any) => {
      eventInserts.push(payload);
      return { data: null, error: null };
    }),
  };
}

describe("GET /api/agents/update-processos", () => {
  beforeEach(() => {
    queueUpdates.length = 0;
    monitoredUpdates.length = 0;
    movementInserts.length = 0;
    eventInserts.length = 0;
    fromMock.mockReset();
    escavadorFetchMock.mockReset();
    requireTenantApiKeyMock.mockReset();
    vi.stubEnv("CRON_SECRET", "cron-secret");

    fromMock.mockImplementation((table: string) => {
      if (table === "process_update_queue") return makeQueueQuery();
      if (table === "monitored_processes") return makeMonitoredQuery();
      if (table === "process_movimentacoes") return makeMovementsQuery();
      if (table === "system_event_logs") return makeSystemEventsQuery();
      return makeQueueQuery();
    });

    requireTenantApiKeyMock.mockResolvedValue({ apiKey: "escavador-key" });
    escavadorFetchMock.mockResolvedValue({
      unidade_origem: { tribunal_sigla: "TJRJ" },
      fontes: [{
        tribunal: { sigla: "TJRJ" },
        capa: {
          status_predito: "ATIVO",
          assunto_principal_normalizado: { nome: "Direito do consumidor" },
        },
        movimentacoes: [{
          id: "32337135062",
          data: "2026-05-25",
          conteudo: "Publicado despacho em 25/05/2026.",
        }],
      }],
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("bloqueia chamadas de producao sem segredo da Vercel", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await GET(new NextRequest("http://localhost:3000/api/agents/update-processos"));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Forbidden" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("aceita Authorization Bearer do Vercel Cron em producao", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await GET(new NextRequest("http://localhost:3000/api/agents/update-processos", {
      headers: { authorization: "Bearer cron-secret" },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ ok: true, processed: 1 }));
    expect(eventInserts.at(-1)).toEqual(expect.objectContaining({
      source: "monitoramento",
      event_name: "process_update_queue_processed",
      status: "completed",
      payload: expect.objectContaining({ auth_method: "authorization_bearer" }),
    }));
  });

  it("mantem compatibilidade com x-cron-secret em producao", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = await GET(new NextRequest("http://localhost:3000/api/agents/update-processos", {
      headers: { "x-cron-secret": "cron-secret" },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({ ok: true, processed: 1 }));
    expect(eventInserts.at(-1)?.payload).toEqual(expect.objectContaining({ auth_method: "x-cron-secret" }));
  });

  it("drena lote maior, atualiza ultima movimentacao e marca item como concluido", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/agents/update-processos?limit=75"));
    const body = await response.json();

    expect(body).toEqual(expect.objectContaining({
      ok: true,
      picked: 1,
      processed: 1,
      failed: 0,
      limit: 75,
    }));
    expect(escavadorFetchMock).toHaveBeenCalledWith(
      "/processos/numero_cnj/3002575-03.2026.8.19.0000",
      "escavador-key",
      "tenant-1",
    );
    expect(monitoredUpdates).toContainEqual(expect.objectContaining({
      data_ultima_movimentacao: expect.stringContaining("2026-05-25"),
      ultima_movimentacao_texto: "Publicado despacho em 25/05/2026.",
    }));
    expect(movementInserts).toContainEqual(expect.objectContaining({
      numero_cnj: "3002575-03.2026.8.19.0000",
      escavador_movimentacao_id: "32337135062",
      tipo_evento: "movimentacao",
    }));
    expect(queueUpdates.at(-1)).toEqual(expect.objectContaining({
      status: "CONCLUIDO",
      processed_at: expect.any(String),
      payload: expect.objectContaining({
        update_agent: expect.objectContaining({ status: "ok" }),
      }),
    }));
  });
});
