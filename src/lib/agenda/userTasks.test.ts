import { describe, expect, it } from "vitest";
import {
  AGENDA_GLOBAL_PENDING_PERSON,
  AGENDA_GLOBAL_UNKNOWN_HERO_PERSON,
  formatDateKey,
  getAgendaGlobalDisplayPerson,
  getAgendaReminderWindowDateKeys,
  isAgendaTaskVisibleOnDate,
  deleteAgendaTaskBySource,
  syncAgendaTaskBySource,
  type AgendaTaskRecord,
} from "./userTasks";

function makeTask(overrides: Partial<AgendaTaskRecord>): AgendaTaskRecord {
  return {
    id: "task-1",
    tenant_id: "tenant-1",
    title: "Tarefa",
    status: "Pendente",
    scheduled_for: "2026-05-10T09:00:00.000Z",
    created_at: "2026-05-01T09:00:00.000Z",
    ...overrides,
  };
}

function createSyncSupabaseMock(existing: any) {
  const calls: any[] = [];

  return {
    calls,
    from(table: string) {
      const filters: Array<{ column: string; value: unknown }> = [];

      return {
        select(columns: string) {
          calls.push({ op: "select_start", table, columns });
          return this;
        },
        eq(column: string, value: unknown) {
          filters.push({ column, value });
          return this;
        },
        maybeSingle() {
          calls.push({ op: "select", table, filters: [...filters] });
          return Promise.resolve({ data: existing, error: null });
        },
        update(payload: Record<string, unknown>) {
          return {
            eq(column: string, value: unknown) {
              calls.push({ op: "update", table, payload, filters: [{ column, value }] });
              return Promise.resolve({ error: null });
            },
          };
        },
        insert(payload: Record<string, unknown>) {
          calls.push({ op: "insert", table, payload });
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: { id: "inserted-task" }, error: null });
                },
              };
            },
          };
        },
        delete() {
          return {
            eq(column: string, value: unknown) {
              filters.push({ column, value });
              calls.push({ op: "delete_eq", table, filters: [...filters] });
              return this;
            },
            then(resolve: (value: { error: null }) => void) {
              calls.push({ op: "delete", table, filters: [...filters] });
              resolve({ error: null });
            },
          };
        },
      };
    },
  };
}

describe("agenda user tasks", () => {
  it("formats date keys with local date parts", () => {
    expect(formatDateKey(new Date(2026, 4, 1, 23, 30))).toBe("2026-05-01");
  });

  it("builds reminder window ending on the scheduled day", () => {
    const task = makeTask({ show_only_on_date: true, reminder_days_before: 2 });

    expect(getAgendaReminderWindowDateKeys(task)).toEqual([
      "2026-05-08",
      "2026-05-09",
      "2026-05-10",
    ]);
  });

  it("shows reminder-only task only on scheduled day and configured days before", () => {
    const task = makeTask({ show_only_on_date: true, reminder_days_before: 2 });

    expect(isAgendaTaskVisibleOnDate(task, "2026-05-07")).toBe(false);
    expect(isAgendaTaskVisibleOnDate(task, "2026-05-08")).toBe(true);
    expect(isAgendaTaskVisibleOnDate(task, "2026-05-09")).toBe(true);
    expect(isAgendaTaskVisibleOnDate(task, "2026-05-10")).toBe(true);
    expect(isAgendaTaskVisibleOnDate(task, "2026-05-11")).toBe(false);
  });

  it("keeps normal open tasks visible as backlog", () => {
    const task = makeTask({ show_only_on_date: false, reminder_days_before: 0 });

    expect(isAgendaTaskVisibleOnDate(task, "2026-05-01")).toBe(true);
    expect(isAgendaTaskVisibleOnDate(task, "2026-05-20")).toBe(true);
  });

  it("does not expose assigned person for open global tasks", () => {
    const task = makeTask({ assigned_name_snapshot: "Responsavel Interno" });

    expect(getAgendaGlobalDisplayPerson(task)).toBe(AGENDA_GLOBAL_PENDING_PERSON);
  });

  it("uses the completion actor as global task hero", () => {
    const task = makeTask({
      status: "Concluído",
      assigned_name_snapshot: "Responsavel Interno",
      completed_by_name_snapshot: "Heroi Real",
    });

    expect(getAgendaGlobalDisplayPerson(task)).toBe("Heroi Real");
  });

  it("does not credit assigned person when completed task has no completion actor", () => {
    const task = makeTask({
      status: "Concluído",
      assigned_name_snapshot: "Responsavel Interno",
      completed_by_name_snapshot: null,
    });

    expect(getAgendaGlobalDisplayPerson(task)).toBe(AGENDA_GLOBAL_UNKNOWN_HERO_PERSON);
  });

  it("scopes source sync lookup by tenant", async () => {
    const supabase = createSyncSupabaseMock(null);

    await syncAgendaTaskBySource(supabase, {
      tenant_id: "tenant-1",
      source_table: "crm_tasks",
      source_id: "source-1",
      title: "Follow-up",
    });

    const selectCall = supabase.calls.find((call) => call.op === "select");
    expect(selectCall?.filters).toEqual(expect.arrayContaining([
      { column: "tenant_id", value: "tenant-1" },
      { column: "source_table", value: "crm_tasks" },
      { column: "source_id", value: "source-1" },
    ]));
  });

  it("preserves completion when an open source payload resyncs a completed task", async () => {
    const supabase = createSyncSupabaseMock({
      id: "task-1",
      status: "Concluído",
      completed_at: "2026-05-10T15:00:00.000Z",
      completed_by: "user-hero",
      completed_by_name_snapshot: "Heroi Real",
    });

    await syncAgendaTaskBySource(supabase, {
      tenant_id: "tenant-1",
      source_table: "crm_tasks",
      source_id: "source-1",
      title: "Follow-up atualizado",
      status: "Pendente",
      completed_at: null,
      completed_by: null,
      completed_by_name_snapshot: null,
    });

    const updateCall = supabase.calls.find((call) => call.op === "update");
    expect(updateCall?.payload).toEqual(expect.objectContaining({
      status: "Concluído",
      completed_at: "2026-05-10T15:00:00.000Z",
      completed_by: "user-hero",
      completed_by_name_snapshot: "Heroi Real",
    }));
  });

  it("requires tenant_id to sync by source", async () => {
    const supabase = createSyncSupabaseMock(null);

    await expect(syncAgendaTaskBySource(supabase, {
      source_table: "crm_tasks",
      source_id: "source-1",
    })).rejects.toThrow("tenant_id_required_for_agenda_sync");
  });

  it("scopes source delete by tenant", async () => {
    const supabase = createSyncSupabaseMock(null);

    await deleteAgendaTaskBySource(supabase, "tenant-1", "crm_tasks", "source-1");

    const deleteCall = supabase.calls.find((call) => call.op === "delete");
    expect(deleteCall?.filters).toEqual(expect.arrayContaining([
      { column: "tenant_id", value: "tenant-1" },
      { column: "source_table", value: "crm_tasks" },
      { column: "source_id", value: "source-1" },
    ]));
  });

  it("requires tenant_id to delete by source", async () => {
    const supabase = createSyncSupabaseMock(null);

    await expect(deleteAgendaTaskBySource(supabase, "", "crm_tasks", "source-1"))
      .rejects.toThrow("tenant_id_required_for_agenda_delete");
  });
});
