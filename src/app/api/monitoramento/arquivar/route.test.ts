import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  adminFromMock,
  cookiesMock,
  createClientMock,
  createServerClientMock,
  getUserMock,
  requireTenantApiKeyMock,
  cancelarMonitoramentoProcessoMock,
} = vi.hoisted(() => ({
  adminFromMock: vi.fn(),
  cookiesMock: vi.fn(),
  createClientMock: vi.fn(() => ({ from: vi.fn((table: string) => adminFromMock(table)) })),
  createServerClientMock: vi.fn(),
  getUserMock: vi.fn(),
  requireTenantApiKeyMock: vi.fn(),
  cancelarMonitoramentoProcessoMock: vi.fn(),
}));

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
  cancelarMonitoramentoProcesso: cancelarMonitoramentoProcessoMock,
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/monitoramento/arquivar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function query(data: any = null) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => ({ data, error: null })),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    insert: vi.fn(async () => ({ error: null })),
    update: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
  };
  return builder;
}

describe("POST /api/monitoramento/arquivar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesMock.mockResolvedValue({ getAll: () => [], set: vi.fn() });
    createServerClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    requireTenantApiKeyMock.mockResolvedValue({ apiKey: "escavador-key" });
    cancelarMonitoramentoProcessoMock.mockResolvedValue({ ok: false, error: "Escavador fora do ar" });
  });

  it("bloqueia arquivamento local quando cancelamento externo falha", async () => {
    const profileQuery = query({ tenant_id: "tenant-1" });
    const monitoredQuery = query({
      id: "11111111-1111-1111-1111-111111111111",
      numero_processo: "0001",
      escavador_monitoramento_id: "mon-1",
      monitoramento_ativo: true,
    });
    const eventsQuery = query();

    adminFromMock.mockImplementation((table: string) => {
      if (table === "profiles") return profileQuery;
      if (table === "monitored_processes") return monitoredQuery;
      if (table === "system_event_logs") return eventsQuery;
      return query();
    });

    const response = await POST(buildRequest({
      processo_id: "11111111-1111-1111-1111-111111111111",
    }));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error).toBe("Falha ao cancelar monitoramento no Escavador.");
    expect(cancelarMonitoramentoProcessoMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      monitoramentoId: "mon-1",
    }));
    expect(eventsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_name: "escavador_monitoring_cancel_failed",
      status: "error",
      payload: expect.objectContaining({
        action: "arquivar_monitoramento",
        escavador_monitoramento_id: "mon-1",
      }),
    }));
    expect(monitoredQuery.update).not.toHaveBeenCalled();
    expect(monitoredQuery.upsert).not.toHaveBeenCalled();
    expect(JSON.stringify(eventsQuery.insert.mock.calls)).not.toContain("escavador-key");
  });
});
