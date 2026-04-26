import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: fromMock,
  },
}));

import { getDraftFactoryQueueHealth } from "./draft-factory-health";

function createMemoryQuery(rows: unknown[]) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };

  return query;
}

function createFailureEventsQuery(rows: unknown[]) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    gte: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };

  return query;
}

function createTasksQuery(rows: unknown[]) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };

  return query;
}

describe("draft-factory-health", () => {
  beforeEach(() => {
    fromMock.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T15:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("agrega backlog, stuck running, stale e falhas repetidas", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "process_document_memory") {
        return createMemoryQuery([
          {
            process_task_id: "task-queued",
            first_draft_status: "queued",
            first_draft_error: null,
            updated_at: "2026-04-20T14:20:00.000Z",
            case_brain_task_id: "cb-1",
            first_draft_case_brain_task_id: "cb-1",
          },
          {
            process_task_id: "task-running",
            first_draft_status: "running",
            first_draft_error: null,
            updated_at: "2026-04-20T14:10:00.000Z",
            case_brain_task_id: "cb-2",
            first_draft_case_brain_task_id: "cb-2",
          },
          {
            process_task_id: "task-stale",
            first_draft_status: "completed",
            first_draft_error: null,
            updated_at: "2026-04-20T14:50:00.000Z",
            case_brain_task_id: "cb-new",
            first_draft_case_brain_task_id: "cb-old",
          },
          {
            process_task_id: "task-failed",
            first_draft_status: "failed",
            first_draft_error: "timeout",
            updated_at: "2026-04-20T14:55:00.000Z",
            case_brain_task_id: "cb-3",
            first_draft_case_brain_task_id: "cb-3",
          },
        ]);
      }

      if (table === "learning_events") {
        return createFailureEventsQuery([
          { created_at: "2026-04-20T14:56:00.000Z", payload: { process_task_id: "task-failed" } },
          { created_at: "2026-04-20T14:40:00.000Z", payload: { process_task_id: "task-failed" } },
        ]);
      }

      if (table === "process_tasks") {
        return createTasksQuery([
          { id: "task-running", title: "Execucao Travada", client_name: "Cliente A" },
          { id: "task-failed", title: "Falha Repetida", client_name: "Cliente B" },
        ]);
      }

      throw new Error(`Tabela nao mockada: ${table}`);
    });

    const result = await getDraftFactoryQueueHealth({ tenantId: "tenant-1", stuckRunningMinutes: 20 });

    expect(result.counts).toEqual({
      queued: 1,
      running: 1,
      completed: 1,
      failed: 1,
      staleCompleted: 1,
    });
    expect(result.oldestQueuedMinutes).toBe(40);
    expect(result.oldestRunningMinutes).toBe(50);
    expect(result.stuckRunningCount).toBe(1);
    expect(result.repeatedFailureCount).toBe(1);
    expect(result.alerts.map((alert) => alert.code)).toEqual(
      expect.arrayContaining(["queued_backlog", "stuck_running", "repeated_failures", "stale_completed_versions"])
    );
    expect(result.recentFailures[0]).toMatchObject({
      processTaskId: "task-failed",
      title: "Falha Repetida",
      clientName: "Cliente B",
      failuresLast24h: 2,
    });
  });

  it("nao consulta process_tasks quando nao ha tasks relevantes", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "process_document_memory") {
        return createMemoryQuery([]);
      }

      if (table === "learning_events") {
        return createFailureEventsQuery([]);
      }

      if (table === "process_tasks") {
        return createTasksQuery([]);
      }

      throw new Error(`Tabela nao mockada: ${table}`);
    });

    const result = await getDraftFactoryQueueHealth({ tenantId: "tenant-1" });

    expect(fromMock).toHaveBeenCalledTimes(2);
    expect(result.counts).toEqual({ queued: 0, running: 0, completed: 0, failed: 0, staleCompleted: 0 });
    expect(result.alerts).toEqual([]);
    expect(result.recentFailures).toEqual([]);
  });
});
