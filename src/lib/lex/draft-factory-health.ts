import { supabaseAdmin } from "@/lib/supabase/admin";

type ProcessDraftHealthRow = {
  process_task_id: string;
  first_draft_status: string | null;
  first_draft_error: string | null;
  updated_at: string | null;
  case_brain_task_id: string | null;
  first_draft_case_brain_task_id: string | null;
};

type DraftFactoryFailedEventRow = {
  created_at: string;
  payload: Record<string, unknown> | null;
};

type ProcessTaskHealthRow = {
  id: string;
  title: string;
  client_name: string | null;
};

export type DraftFactoryQueueHealthAlert = {
  severity: "warning" | "critical";
  code: string;
  message: string;
  processTaskId?: string;
};

export type DraftFactoryQueueHealth = {
  generatedAt: string;
  counts: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    staleCompleted: number;
  };
  oldestQueuedMinutes: number | null;
  oldestRunningMinutes: number | null;
  stuckRunningCount: number;
  repeatedFailureCount: number;
  recentFailures: Array<{
    processTaskId: string;
    title: string;
    clientName: string | null;
    error: string | null;
    updatedAt: string | null;
    failuresLast24h: number;
  }>;
  alerts: DraftFactoryQueueHealthAlert[];
};

function getString(value: Record<string, unknown> | null | undefined, key: string) {
  const item = value?.[key];
  return typeof item === "string" && item.trim().length > 0 ? item.trim() : null;
}

function getMinutesSince(value?: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
}

function isCompletedDraftStale(row: Pick<ProcessDraftHealthRow, "first_draft_status" | "case_brain_task_id" | "first_draft_case_brain_task_id">) {
  if (row.first_draft_status !== "completed") return false;
  if (!row.case_brain_task_id) return false;
  return row.case_brain_task_id !== row.first_draft_case_brain_task_id;
}

export async function getDraftFactoryQueueHealth(params: { tenantId: string; stuckRunningMinutes?: number }) {
  const stuckRunningMinutes = Math.max(5, Math.floor(params.stuckRunningMinutes || 20));
  const failureWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: memoryRows, error: memoryError }, { data: failureEvents, error: failureEventsError }] = await Promise.all([
    supabaseAdmin
      .from("process_document_memory")
      .select("process_task_id, first_draft_status, first_draft_error, updated_at, case_brain_task_id, first_draft_case_brain_task_id")
      .eq("tenant_id", params.tenantId)
      .in("first_draft_status", ["queued", "running", "completed", "failed"]),
    supabaseAdmin
      .from("learning_events")
      .select("created_at, payload")
      .eq("tenant_id", params.tenantId)
      .eq("event_type", "draft_factory_failed")
      .gte("created_at", failureWindowStart)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (memoryError) throw memoryError;
  if (failureEventsError) throw failureEventsError;

  const rows = (memoryRows || []) as ProcessDraftHealthRow[];
  const failedEvents = (failureEvents || []) as DraftFactoryFailedEventRow[];

  const queuedRows = rows.filter((row) => row.first_draft_status === "queued");
  const runningRows = rows.filter((row) => row.first_draft_status === "running");
  const completedRows = rows.filter((row) => row.first_draft_status === "completed");
  const failedRows = rows.filter((row) => row.first_draft_status === "failed");
  const staleCompletedRows = completedRows.filter(isCompletedDraftStale);
  const stuckRunningRows = runningRows.filter((row) => {
    const minutes = getMinutesSince(row.updated_at);
    return minutes !== null && minutes >= stuckRunningMinutes;
  });

  const failureCountsByTask = new Map<string, number>();
  failedEvents.forEach((event) => {
    const processTaskId = getString(event.payload, "process_task_id");
    if (!processTaskId) return;
    failureCountsByTask.set(processTaskId, (failureCountsByTask.get(processTaskId) || 0) + 1);
  });

  const repeatedFailureTaskIds = Array.from(failureCountsByTask.entries())
    .filter(([, count]) => count >= 2)
    .map(([taskId]) => taskId);

  const relevantTaskIds = Array.from(new Set([
    ...failedRows.map((row) => row.process_task_id),
    ...stuckRunningRows.map((row) => row.process_task_id),
    ...repeatedFailureTaskIds,
  ]));

  const tasksById = new Map<string, ProcessTaskHealthRow>();
  if (relevantTaskIds.length > 0) {
    const { data: taskRows, error: taskError } = await supabaseAdmin
      .from("process_tasks")
      .select("id, title, client_name")
      .eq("tenant_id", params.tenantId)
      .in("id", relevantTaskIds);

    if (taskError) throw taskError;

    (taskRows || []).forEach((task) => {
      tasksById.set(task.id, task as ProcessTaskHealthRow);
    });
  }

  const alerts: DraftFactoryQueueHealthAlert[] = [];

  if (queuedRows.length > 0) {
    const oldestQueuedMinutes = queuedRows
      .map((row) => getMinutesSince(row.updated_at))
      .filter((value): value is number => value !== null)
      .sort((left, right) => right - left)[0] ?? null;

    if (oldestQueuedMinutes !== null && oldestQueuedMinutes >= 30) {
      alerts.push({
        severity: "warning",
        code: "queued_backlog",
        message: `A fila da Draft Factory tem item aguardando ha ${oldestQueuedMinutes} min.`,
      });
    }
  }

  stuckRunningRows.slice(0, 3).forEach((row) => {
    const task = tasksById.get(row.process_task_id);
    const minutes = getMinutesSince(row.updated_at);
    alerts.push({
      severity: "critical",
      code: "stuck_running",
      processTaskId: row.process_task_id,
      message: `${task?.title || "Processo"} esta em running ha ${minutes || 0} min.`,
    });
  });

  repeatedFailureTaskIds.slice(0, 3).forEach((taskId) => {
    const task = tasksById.get(taskId);
    alerts.push({
      severity: "warning",
      code: "repeated_failures",
      processTaskId: taskId,
      message: `${task?.title || "Processo"} falhou ${failureCountsByTask.get(taskId)} vez(es) nas ultimas 24h.`,
    });
  });

  if (staleCompletedRows.length > 0) {
    alerts.push({
      severity: "warning",
      code: "stale_completed_versions",
      message: `${staleCompletedRows.length} minuta(s) pronta(s) ficaram desatualizadas depois do novo Case Brain.`,
    });
  }

  const recentFailures = failedRows
    .slice()
    .sort((left, right) => (new Date(right.updated_at || 0).getTime()) - (new Date(left.updated_at || 0).getTime()))
    .slice(0, 5)
    .map((row) => {
      const task = tasksById.get(row.process_task_id);
      return {
        processTaskId: row.process_task_id,
        title: task?.title || "Processo sem titulo",
        clientName: task?.client_name || null,
        error: row.first_draft_error || null,
        updatedAt: row.updated_at || null,
        failuresLast24h: failureCountsByTask.get(row.process_task_id) || 0,
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      queued: queuedRows.length,
      running: runningRows.length,
      completed: completedRows.length,
      failed: failedRows.length,
      staleCompleted: staleCompletedRows.length,
    },
    oldestQueuedMinutes: queuedRows
      .map((row) => getMinutesSince(row.updated_at))
      .filter((value): value is number => value !== null)
      .sort((left, right) => right - left)[0] ?? null,
    oldestRunningMinutes: runningRows
      .map((row) => getMinutesSince(row.updated_at))
      .filter((value): value is number => value !== null)
      .sort((left, right) => right - left)[0] ?? null,
    stuckRunningCount: stuckRunningRows.length,
    repeatedFailureCount: repeatedFailureTaskIds.length,
    recentFailures,
    alerts,
  } satisfies DraftFactoryQueueHealth;
}
