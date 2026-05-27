import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  fromMock,
  getBrainAuthContextMock,
  isBrainExecutiveRoleMock,
  buildLegalOperatorMissionSnapshotsMock,
  buildBrainMissionControlSnapshotsMock,
  selects,
  schemaState,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getBrainAuthContextMock: vi.fn(),
  isBrainExecutiveRoleMock: vi.fn(),
  buildLegalOperatorMissionSnapshotsMock: vi.fn(() => [{ id: "legal-mission-1" }]),
  buildBrainMissionControlSnapshotsMock: vi.fn((params: any) => [{
    id: "mission-control-1",
    runs: params.runs.length,
    steps: params.steps.length,
  }]),
  selects: [] as Array<{ table: string; columns: string }>,
  schemaState: { legacy: false },
}));

vi.mock("@/lib/brain/server", () => ({
  brainAdminSupabase: { from: fromMock },
  getBrainAuthContext: getBrainAuthContextMock,
}));

vi.mock("@/lib/brain/roles", () => ({
  isBrainExecutiveRole: isBrainExecutiveRoleMock,
}));

vi.mock("@/lib/brain/legal-operator-missions", () => ({
  buildLegalOperatorMissionSnapshots: buildLegalOperatorMissionSnapshotsMock,
}));

vi.mock("@/lib/brain/mission-control", () => ({
  buildBrainMissionControlSnapshots: buildBrainMissionControlSnapshotsMock,
}));

import { GET } from "./route";

function makeQuery(table: string) {
  const filters: Array<{ column: string; value: unknown }> = [];
  const notEqualFilters: Array<{ column: string; value: unknown }> = [];
  const query: any = {
    selectedColumns: "",
    selectOptions: null as Record<string, unknown> | null,
    select: vi.fn((columns: string, options?: Record<string, unknown>) => {
      query.selectedColumns = columns;
      query.selectOptions = options || null;
      selects.push({ table, columns });
      return query;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push({ column, value });
      return query;
    }),
    neq: vi.fn((column: string, value: unknown) => {
      notEqualFilters.push({ column, value });
      return query;
    }),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    in: vi.fn(() => query),
    then: (resolve: any) => resolve(resolveQuery(table, query, filters, notEqualFilters)),
  };
  return query;
}

function resolveQuery(
  table: string,
  query: any,
  filters: Array<{ column: string; value: unknown }>,
  notEqualFilters: Array<{ column: string; value: unknown }>
) {
  if (table === "brain_approvals") {
    if (query.selectOptions?.head) {
      return { count: 1, error: null };
    }
    if (filters.some((filter) => filter.column === "status" && filter.value === "pending")) {
      return {
        data: [{
          id: "approval-1",
          task_id: "task-1",
          step_id: "step-1",
          status: "pending",
          risk_level: "medium",
          created_at: "2026-05-27T10:00:00.000Z",
          updated_at: "2026-05-27T10:00:00.000Z",
          approved_at: null,
          decision_notes: null,
          approval_context: { awaiting_payload: { piece: "manifestacao" } },
        }],
        error: null,
      };
    }
    if (notEqualFilters.some((filter) => filter.column === "status" && filter.value === "pending")) {
      return { data: [], error: null };
    }
  }

  if (table === "brain_tasks") {
    return {
      data: [{
        id: "task-1",
        title: "Revisar movimentacao",
        goal: "Interpretar movimentacao nova",
        module: "legal_ops",
        channel: "brain",
        status: "awaiting_approval",
        created_at: "2026-05-27T10:00:00.000Z",
        updated_at: "2026-05-27T10:01:00.000Z",
        started_at: "2026-05-27T10:00:10.000Z",
        result_summary: null,
        error_message: null,
        task_input: {},
        task_context: {},
        policy_snapshot: {},
      }],
      error: null,
    };
  }

  if (table === "brain_runs") {
    if (schemaState.legacy && query.selectedColumns.includes("output_payload")) {
      return { data: null, error: { code: "42703", message: "column brain_runs.output_payload does not exist" } };
    }
    return {
      data: [{
        id: "run-1",
        task_id: "task-1",
        status: "completed",
        attempt_number: 1,
        created_at: "2026-05-27T10:00:00.000Z",
        updated_at: "2026-05-27T10:01:00.000Z",
        started_at: "2026-05-27T10:00:10.000Z",
        completed_at: "2026-05-27T10:01:00.000Z",
        error_message: null,
        ...(schemaState.legacy
          ? { summary: "Contexto juridico montado pelo schema legado." }
          : { output_payload: { summary: "Contexto juridico montado." } }),
      }],
      error: null,
    };
  }

  if (table === "brain_steps") {
    if (schemaState.legacy && query.selectedColumns.includes("error_message")) {
      return { data: null, error: { code: "42703", message: "column brain_steps.error_message does not exist" } };
    }
    return {
      data: [{
        id: "step-1",
        task_id: "task-1",
        run_id: "run-1",
        order_index: 1,
        step_key: "case_brain",
        title: "Case Brain 2.0",
        status: "completed",
        step_type: "analysis",
        capability_name: "legal_process_mission_plan",
        handler_type: "lex",
        input_payload: {},
        output_payload: { risks: ["prazo"] },
        ...(schemaState.legacy
          ? { error_payload: { message: "Falha textual herdada." } }
          : { error_message: null }),
        created_at: "2026-05-27T10:00:00.000Z",
        updated_at: "2026-05-27T10:01:00.000Z",
        started_at: "2026-05-27T10:00:10.000Z",
        completed_at: "2026-05-27T10:01:00.000Z",
      }],
      error: null,
    };
  }

  if (table === "brain_artifacts" || table === "learning_events" || table === "brain_memories") {
    return { data: [], error: null };
  }

  return { data: [], error: null };
}

describe("GET /api/brain/inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selects.length = 0;
    schemaState.legacy = false;
    getBrainAuthContextMock.mockResolvedValue({
      ok: true,
      context: { userId: "user-1", tenantId: "tenant-1", userRole: "mayus_admin" },
    });
    isBrainExecutiveRoleMock.mockReturnValue(true);
    fromMock.mockImplementation((table: string) => makeQuery(table));
  });

  it("carrega o inbox com as colunas runtime usadas em producao", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/brain/inbox"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({
      pending_count: 1,
      pending_approvals: [expect.objectContaining({
        id: "approval-1",
        task: expect.objectContaining({ id: "task-1" }),
        step: expect.objectContaining({ id: "step-1" }),
      })],
      mission_control_snapshots: [expect.objectContaining({ runs: 1, steps: 1 })],
    }));

    const runSelect = selects.find((entry) => entry.table === "brain_runs")?.columns || "";
    const stepSelect = selects.find((entry) => entry.table === "brain_steps")?.columns || "";
    expect(runSelect).toContain("output_payload");
    expect(stepSelect).toContain("error_message");
  });

  it("mantem o inbox visivel em schema legado ate a migration remota ser aplicada", async () => {
    schemaState.legacy = true;

    const response = await GET(new NextRequest("http://localhost:3000/api/brain/inbox"));

    expect(response.status).toBe(200);
    expect(buildBrainMissionControlSnapshotsMock).toHaveBeenCalledWith(expect.objectContaining({
      runs: [expect.objectContaining({
        output_payload: { summary: "Contexto juridico montado pelo schema legado." },
      })],
      steps: [expect.objectContaining({
        error_message: "Falha textual herdada.",
      })],
    }));
    expect(selects.filter((entry) => entry.table === "brain_runs").map((entry) => entry.columns)).toEqual([
      expect.stringContaining("output_payload"),
      expect.stringContaining("summary"),
    ]);
    expect(selects.filter((entry) => entry.table === "brain_steps").map((entry) => entry.columns)).toEqual([
      expect.stringContaining("error_message"),
      expect.stringContaining("error_payload"),
    ]);
  });
});
