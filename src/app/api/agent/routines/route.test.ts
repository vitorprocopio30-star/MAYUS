import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  brainAdminSupabaseMock,
  getBrainAuthContextMock,
  listMayusAgenticRoutinesMock,
  runMayusRoutineHeartbeatMock,
} = vi.hoisted(() => ({
  brainAdminSupabaseMock: { from: vi.fn() },
  getBrainAuthContextMock: vi.fn(),
  listMayusAgenticRoutinesMock: vi.fn(),
  runMayusRoutineHeartbeatMock: vi.fn(),
}));

vi.mock("@/lib/brain/server", () => ({
  brainAdminSupabase: brainAdminSupabaseMock,
  getBrainAuthContext: getBrainAuthContextMock,
}));

vi.mock("@/lib/agent/runtime/routines", () => ({
  listMayusAgenticRoutines: listMayusAgenticRoutinesMock,
  runMayusRoutineHeartbeat: runMayusRoutineHeartbeatMock,
}));

import { GET, POST } from "./route";

function postRequest(body: Record<string, unknown>, headers?: Record<string, string>) {
  return new NextRequest("http://localhost:3000/api/agent/routines", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    body: JSON.stringify(body),
  });
}

function makeSystemEventsQuery(rows: Array<Record<string, unknown>> = []) {
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  return query;
}

function makeEmptyBrainReadQuery() {
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.neq = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn().mockResolvedValue({ data: [], error: null });
  query.in = vi.fn().mockResolvedValue({ data: [], error: null });
  return query;
}

function mockSchedulerSupabase(params: {
  settingsRows: Array<Record<string, unknown>>;
  eventRows?: Array<Record<string, unknown>>;
}) {
  const tenantSettingsQuery = {
    select: vi.fn().mockResolvedValue({ data: params.settingsRows, error: null }),
  };
  const systemEventsQuery = makeSystemEventsQuery(params.eventRows || []);

  brainAdminSupabaseMock.from.mockImplementation((table: string) => {
    if (table === "tenant_settings") return tenantSettingsQuery;
    if (table === "system_event_logs") return systemEventsQuery;
    throw new Error(`Unexpected table: ${table}`);
  });

  return { tenantSettingsQuery, systemEventsQuery };
}

function enabledRoutine(overrides: Record<string, unknown> = {}) {
  return {
    id: "finance-daily-review",
    label: "Revisao financeira diaria",
    source: "paperclip",
    agentId: "finance_agent",
    module: "finance",
    capabilityName: "finance_daily_review",
    goalTemplate: "Revisar financeiro.",
    enabled: true,
    paused: false,
    riskLevel: "low",
    schedule: { kind: "daily", label: "Diaria" },
    executionMode: "plan_only",
    wakeReason: "Rotina diaria.",
    ...overrides,
  };
}

describe("/api/agent/routines", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    brainAdminSupabaseMock.from.mockReset();
    delete process.env.CRON_SECRET;
    getBrainAuthContextMock.mockResolvedValue({
      ok: true,
      context: {
        userId: "user-1",
        tenantId: "tenant-session",
        userRole: "administrador",
      },
    });
    listMayusAgenticRoutinesMock.mockResolvedValue([
      enabledRoutine(),
    ]);
    runMayusRoutineHeartbeatMock.mockResolvedValue({
      status: "dry_run",
      routineId: "finance-daily-review",
      reason: "Dry-run preparado.",
      missionCreated: false,
      eventName: "agentic_routine_dry_run",
      trajectory: [],
    });
    brainAdminSupabaseMock.from.mockImplementation(() => makeEmptyBrainReadQuery());
  });

  it("GET exige perfil executivo", async () => {
    getBrainAuthContextMock.mockResolvedValueOnce({
      ok: true,
      context: {
        userId: "user-1",
        tenantId: "tenant-session",
        userRole: "operador",
      },
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("executivo");
    expect(listMayusAgenticRoutinesMock).not.toHaveBeenCalled();
  });

  it("GET lista rotinas do tenant da sessao", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.routines).toHaveLength(1);
    expect(body.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "finance_agent",
        health: expect.objectContaining({ status: "ready" }),
      }),
    ]));
    expect(body.summary).toEqual(expect.objectContaining({
      totalAgents: 7,
      readyAgents: 1,
      policyPrecedence: ["global", "tenant", "module", "agent", "tool", "channel"],
    }));
    expect(body.mission_control_snapshots).toEqual([]);
    expect(body.control_plane.agents).toEqual(body.agents);
    expect(listMayusAgenticRoutinesMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-session",
    }));
  });

  it("POST usa tenant da sessao e ignora tenantId do body", async () => {
    const response = await POST(postRequest({
      tenantId: "tenant-body",
      routineId: "finance-daily-review",
      dryRun: true,
      force: true,
    }));

    expect(response.status).toBe(200);
    expect(runMayusRoutineHeartbeatMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-session",
      actorId: "user-1",
      routineId: "finance-daily-review",
      dryRun: true,
      force: true,
    }));
  });

  it("POST com credencial cron invalida nao cai no fluxo executivo", async () => {
    process.env.CRON_SECRET = "cron-secret";

    const response = await POST(postRequest(
      {},
      { Authorization: "Bearer wrong-secret" },
    ));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Unauthorized");
    expect(getBrainAuthContextMock).not.toHaveBeenCalled();
    expect(runMayusRoutineHeartbeatMock).not.toHaveBeenCalled();
  });

  it("POST com cron secret permite heartbeat interno controlado", async () => {
    process.env.CRON_SECRET = "cron-secret";

    const response = await POST(postRequest(
      { tenantId: "tenant-cron", routineId: "monitoring-oab-review" },
      { "x-cron-secret": "cron-secret" },
    ));

    expect(response.status).toBe(200);
    expect(getBrainAuthContextMock).not.toHaveBeenCalled();
    expect(runMayusRoutineHeartbeatMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-cron",
      actorId: "system",
      routineId: "monitoring-oab-review",
    }));
  });

  it("POST scheduler global retorna claro quando nenhum tenant tem rotina habilitada", async () => {
    process.env.CRON_SECRET = "cron-secret";
    mockSchedulerSupabase({
      settingsRows: [
        {
          tenant_id: "tenant-disabled",
          ai_features: {
            mayus_agentic_routines: {
              routines: [{ id: "finance-daily-review", enabled: false }],
            },
          },
        },
      ],
    });

    const response = await POST(postRequest(
      { limit: 3 },
      { Authorization: "Bearer cron-secret" },
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toContain("Nenhum tenant");
    expect(body.processed).toEqual([]);
    expect(body.skipped).toEqual([]);
    expect(body.blocked).toEqual([]);
    expect(body.errors).toEqual([]);
    expect(body.summary).toEqual(expect.objectContaining({
      processed: 0,
      skipped: 0,
      blocked: 0,
      errors: 0,
    }));
    expect(listMayusAgenticRoutinesMock).not.toHaveBeenCalled();
    expect(runMayusRoutineHeartbeatMock).not.toHaveBeenCalled();
  });

  it("POST scheduler global descobre tenant habilitado e chama heartbeat", async () => {
    process.env.CRON_SECRET = "cron-secret";
    mockSchedulerSupabase({
      settingsRows: [
        {
          tenant_id: "tenant-enabled",
          ai_features: {
            mayus_agentic_routines: {
              routines: [{ id: "finance-daily-review", enabled: true }],
            },
          },
        },
      ],
      eventRows: [],
    });
    listMayusAgenticRoutinesMock.mockResolvedValueOnce([enabledRoutine()]);
    runMayusRoutineHeartbeatMock.mockResolvedValueOnce({
      status: "woken",
      routineId: "finance-daily-review",
      reason: "Rotina acordada como missao reconstruivel.",
      missionCreated: true,
      taskId: "task-1",
      artifactId: "artifact-1",
      eventName: "agentic_routine_woken",
      trajectory: [],
    });

    const response = await POST(postRequest(
      { limit: 5 },
      { Authorization: "Bearer cron-secret" },
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getBrainAuthContextMock).not.toHaveBeenCalled();
    expect(listMayusAgenticRoutinesMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-enabled",
    }));
    expect(runMayusRoutineHeartbeatMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-enabled",
      actorId: "system",
      routineId: "finance-daily-review",
      dryRun: false,
    }));
    expect(body.processed).toEqual([
      expect.objectContaining({
        tenantId: "tenant-enabled",
        routineId: "finance-daily-review",
        status: "woken",
        missionCreated: true,
        taskId: "task-1",
        artifactId: "artifact-1",
      }),
    ]);
    expect(body.summary).toEqual(expect.objectContaining({
      tenants_enabled: 1,
      routines_eligible: 1,
      processed: 1,
      skipped: 0,
      blocked: 0,
      errors: 0,
    }));
  });

  it("POST nao vaza erro bruto", async () => {
    runMayusRoutineHeartbeatMock.mockRejectedValueOnce(new Error("service-role-key leaked"));

    const response = await POST(postRequest({ routineId: "finance-daily-review" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Nao foi possivel acionar rotina agentica.");
    expect(JSON.stringify(body)).not.toContain("service-role-key");
  });
});
