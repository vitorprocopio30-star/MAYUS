import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserMock,
  fromMock,
  syncAgendaTaskBySourceMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  syncAgendaTaskBySourceMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    auth: { getUser: getUserMock },
    from: fromMock,
  },
}));

vi.mock("@/lib/agenda/userTasks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agenda/userTasks")>();
  return {
    ...actual,
    syncAgendaTaskBySource: syncAgendaTaskBySourceMock,
  };
});

import { POST } from "./route";

function buildRequest(body: unknown, token = "token-1") {
  return new NextRequest("http://localhost:3000/api/prazos/executar-agenda", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

function chain() {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    not: vi.fn(() => query),
    maybeSingle: vi.fn(),
    order: vi.fn(),
    insert: vi.fn(),
  };
  return query;
}

describe("POST /api/prazos/executar-agenda", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    syncAgendaTaskBySourceMock.mockResolvedValue("agenda-task-1");
  });

  it("exige bearer token", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/prazos/executar-agenda", {
      method: "POST",
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Nao autenticado." });
  });

  it("sincroniza prazos selecionados com agenda e registra evento", async () => {
    const profileQuery = chain();
    profileQuery.maybeSingle.mockResolvedValue({
      data: { tenant_id: "tenant-1", full_name: "Admin Demo" },
      error: null,
    });

    const prazosQuery = chain();
    prazosQuery.order.mockResolvedValue({
      data: [{
        id: "prazo-1",
        tenant_id: "tenant-1",
        tipo: "prazo",
        descricao: "Revisar intimacao demo",
        data_vencimento: "2026-05-10T12:00:00.000Z",
        responsavel_id: "lawyer-1",
        monitored_processes: {
          numero_processo: "000001-45.2026.8.26.1001",
          cliente_nome: "Ana Almeida",
          resumo_curto: "Resumo demo",
        },
        profiles: { id: "lawyer-1", full_name: "Dra. Mayus" },
      }],
      error: null,
    });

    const teamQuery = chain();
    teamQuery.eq
      .mockReturnValueOnce(teamQuery)
      .mockResolvedValueOnce({
        data: [{ id: "lawyer-1", full_name: "Dra. Mayus" }],
        error: null,
      });

    const eventsQuery = chain();
    eventsQuery.insert.mockResolvedValue({ error: null });

    let profilesCalls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "profiles") {
        profilesCalls += 1;
        return profilesCalls === 1 ? profileQuery : teamQuery;
      }
      if (table === "process_prazos") return prazosQuery;
      if (table === "system_event_logs") return eventsQuery;
      throw new Error(`unexpected table ${table}`);
    });

    const response = await POST(buildRequest({ prazoIds: ["prazo-1"] }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({
      success: true,
      executed_count: 1,
      failed_count: 0,
    }));
    expect(prazosQuery.in).toHaveBeenCalledWith("id", ["prazo-1"]);
    expect(syncAgendaTaskBySourceMock).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      tenant_id: "tenant-1",
      source_table: "process_prazos",
      source_id: "prazo-1",
      created_by_agent: "prazos_execute_button",
    }));
    expect(eventsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      event_name: "prazos_execute_agenda",
      source: "prazos_execute_button",
    }));
  });
});
