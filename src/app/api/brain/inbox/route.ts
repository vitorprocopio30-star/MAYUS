import { NextRequest, NextResponse } from "next/server";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";
import { isBrainExecutiveRole } from "@/lib/brain/roles";
import { buildLegalOperatorMissionSnapshots } from "@/lib/brain/legal-operator-missions";
import { buildBrainMissionControlSnapshots } from "@/lib/brain/mission-control";

export const dynamic = "force-dynamic";

type ApprovalRow = {
  id: string;
  task_id: string;
  step_id: string | null;
  status: string;
  risk_level: string | null;
  created_at: string;
  updated_at?: string | null;
  approved_at: string | null;
  decision_notes: string | null;
  approval_context: Record<string, unknown> | null;
};

type TaskRow = {
  id: string;
  title: string | null;
  goal: string;
  module: string;
  channel: string;
  status: string;
  created_at: string;
  updated_at: string;
  result_summary: string | null;
  error_message: string | null;
  started_at?: string | null;
  task_input?: Record<string, unknown> | null;
  task_context?: Record<string, unknown> | null;
  policy_snapshot?: Record<string, unknown> | null;
};

type StepRow = {
  id: string;
  task_id?: string | null;
  run_id?: string | null;
  order_index?: number | null;
  step_key?: string | null;
  title: string;
  status: string;
  step_type: string;
  capability_name: string | null;
  handler_type: string | null;
  input_payload?: Record<string, unknown> | null;
  output_payload?: Record<string, unknown> | null;
  error_message?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

type RunRow = {
  id: string;
  task_id: string;
  status: string | null;
  attempt_number: number | null;
  created_at: string | null;
  updated_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  output_payload: Record<string, unknown> | null;
};

type LegacyRunRow = Omit<RunRow, "output_payload"> & {
  summary?: string | null;
  output_payload?: Record<string, unknown> | null;
};

type LegacyStepRow = StepRow & {
  error_payload?: Record<string, unknown> | null;
};

type ArtifactRow = {
  id: string;
  task_id: string;
  artifact_type: string;
  title: string | null;
  storage_url: string | null;
  mime_type: string | null;
  source_module: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type LearningEventRow = {
  id: string;
  task_id: string | null;
  step_id: string | null;
  event_type: string;
  source_module: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type MemoryRow = {
  id: string;
  task_id: string | null;
  memory_key: string | null;
  value: Record<string, unknown> | null;
  source: string | null;
  confidence: number | string | null;
  promoted: boolean | null;
  created_at: string | null;
  updated_at: string | null;
};

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}

function normalizeLimit(value: string | null, fallback: number, max: number) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function isMissingColumnError(error: unknown, column: string) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String((error as { message?: unknown }).message || "") : "";
  const code = "code" in error ? String((error as { code?: unknown }).code || "") : "";
  return code === "42703" || message.includes(column);
}

function normalizeRunRows(rows: LegacyRunRow[] | null) {
  return (rows || []).map((run) => ({
    ...run,
    output_payload: run.output_payload && typeof run.output_payload === "object"
      ? run.output_payload
      : run.summary
        ? { summary: run.summary }
        : {},
  })) as RunRow[];
}

function errorMessageFromPayload(payload: Record<string, unknown> | null | undefined) {
  if (!payload || typeof payload !== "object") return null;
  const message = payload.error_message || payload.message || payload.error;
  return typeof message === "string" && message.trim() ? message.trim() : null;
}

function normalizeStepRows(rows: LegacyStepRow[] | null) {
  return (rows || []).map((step) => ({
    ...step,
    error_message: step.error_message || errorMessageFromPayload(step.error_payload),
  })) as StepRow[];
}

async function loadRunRows(tenantId: string, taskIds: string[]) {
  if (taskIds.length === 0) return { data: [] as RunRow[], error: null };

  const result = await brainAdminSupabase
    .from("brain_runs")
    .select("id, task_id, status, attempt_number, created_at, updated_at, started_at, completed_at, error_message, output_payload")
    .eq("tenant_id", tenantId)
    .in("task_id", taskIds);

  if (!isMissingColumnError(result.error, "output_payload")) {
    return { data: normalizeRunRows(result.data as LegacyRunRow[] | null), error: result.error };
  }

  const legacyResult = await brainAdminSupabase
    .from("brain_runs")
    .select("id, task_id, status, attempt_number, created_at, updated_at, started_at, completed_at, error_message, summary")
    .eq("tenant_id", tenantId)
    .in("task_id", taskIds);

  return { data: normalizeRunRows(legacyResult.data as LegacyRunRow[] | null), error: legacyResult.error };
}

async function loadStepRows(tenantId: string, taskIds: string[], stepIds: string[]) {
  if (taskIds.length === 0 && stepIds.length === 0) return { data: [] as StepRow[], error: null };

  const scopedCurrentQuery = brainAdminSupabase
    .from("brain_steps")
    .select("id, task_id, run_id, order_index, step_key, title, status, step_type, capability_name, handler_type, input_payload, output_payload, error_message, created_at, updated_at, started_at, completed_at")
    .eq("tenant_id", tenantId);
  const result = await (taskIds.length > 0
    ? scopedCurrentQuery.in("task_id", taskIds)
    : scopedCurrentQuery.in("id", stepIds));

  if (!isMissingColumnError(result.error, "error_message")) {
    return { data: normalizeStepRows(result.data as LegacyStepRow[] | null), error: result.error };
  }

  const scopedLegacyQuery = brainAdminSupabase
    .from("brain_steps")
    .select("id, task_id, run_id, order_index, step_key, title, status, step_type, capability_name, handler_type, input_payload, output_payload, error_payload, created_at, updated_at, started_at, completed_at")
    .eq("tenant_id", tenantId);
  const legacyResult = await (taskIds.length > 0
    ? scopedLegacyQuery.in("task_id", taskIds)
    : scopedLegacyQuery.in("id", stepIds));

  return { data: normalizeStepRows(legacyResult.data as LegacyStepRow[] | null), error: legacyResult.error };
}

function normalizeApprovalRow(
  approval: ApprovalRow,
  tasksMap: Record<string, TaskRow>,
  stepsMap: Record<string, StepRow>
) {
  const context = approval.approval_context && typeof approval.approval_context === "object"
    ? approval.approval_context
    : {};
  const awaitingPayload = context.awaiting_payload && typeof context.awaiting_payload === "object"
    ? context.awaiting_payload as Record<string, unknown>
    : null;

  return {
    id: approval.id,
    status: approval.status,
    risk_level: approval.risk_level,
    created_at: approval.created_at,
    approved_at: approval.approved_at,
    updated_at: approval.updated_at ?? null,
    decision_notes: approval.decision_notes,
    audit_log_id: typeof context.audit_log_id === "string" ? context.audit_log_id : null,
    approval_context: context,
    awaiting_payload: awaitingPayload,
    task: tasksMap[approval.task_id] || null,
    step: approval.step_id ? stepsMap[approval.step_id] || null : null,
  };
}

function normalizeArtifactRow(
  artifact: ArtifactRow,
  tasksMap: Record<string, TaskRow>
) {
  return {
    id: artifact.id,
    artifact_type: artifact.artifact_type,
    title: artifact.title,
    storage_url: artifact.storage_url,
    mime_type: artifact.mime_type,
    source_module: artifact.source_module,
    metadata: artifact.metadata,
    created_at: artifact.created_at,
    task: tasksMap[artifact.task_id] || null,
  };
}

function normalizeLearningEventRow(
  event: LearningEventRow,
  tasksMap: Record<string, TaskRow>,
  stepsMap: Record<string, StepRow>
) {
  return {
    id: event.id,
    event_type: event.event_type,
    source_module: event.source_module,
    payload: event.payload,
    created_at: event.created_at,
    task: event.task_id ? tasksMap[event.task_id] || null : null,
    step: event.step_id ? stepsMap[event.step_id] || null : null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getBrainAuthContext();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    if (!isBrainExecutiveRole(auth.context.userRole)) {
      return NextResponse.json({ error: "Acesso restrito ao nivel executivo." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const pendingLimit = normalizeLimit(searchParams.get("pending_limit"), 10, 50);
    const recentLimit = normalizeLimit(searchParams.get("recent_limit"), 10, 50);
    const activityLimit = normalizeLimit(searchParams.get("activity_limit"), 12, 50);
    const artifactLimit = normalizeLimit(searchParams.get("artifact_limit"), 12, 50);
    const eventLimit = normalizeLimit(searchParams.get("event_limit"), 16, 60);
    const includeActivity = searchParams.get("include_activity") === "true";

    const [{ count: pendingCount, error: countError }, { data: pendingApprovals, error: pendingError }, { data: recentApprovals, error: recentError }, { data: recentTasks, error: tasksError }, { data: recentArtifacts, error: artifactsError }, { data: recentEvents, error: eventsError }] = await Promise.all([
      brainAdminSupabase
        .from("brain_approvals")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", auth.context.tenantId)
        .eq("status", "pending"),
      brainAdminSupabase
        .from("brain_approvals")
        .select("id, task_id, step_id, status, risk_level, created_at, updated_at, approved_at, decision_notes, approval_context")
        .eq("tenant_id", auth.context.tenantId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(pendingLimit),
      brainAdminSupabase
        .from("brain_approvals")
        .select("id, task_id, step_id, status, risk_level, created_at, updated_at, approved_at, decision_notes, approval_context")
        .eq("tenant_id", auth.context.tenantId)
        .neq("status", "pending")
        .order("updated_at", { ascending: false })
        .limit(recentLimit),
      includeActivity
        ? brainAdminSupabase
            .from("brain_tasks")
            .select("id, title, goal, module, channel, status, created_at, updated_at, started_at, result_summary, error_message, task_input, task_context, policy_snapshot")
            .eq("tenant_id", auth.context.tenantId)
            .order("updated_at", { ascending: false })
            .limit(activityLimit)
        : Promise.resolve({ data: [], error: null } as { data: TaskRow[]; error: null }),
      brainAdminSupabase
        .from("brain_artifacts")
        .select("id, task_id, artifact_type, title, storage_url, mime_type, source_module, metadata, created_at")
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: false })
        .limit(artifactLimit),
      brainAdminSupabase
        .from("learning_events")
        .select("id, task_id, step_id, event_type, source_module, payload, created_at")
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: false })
        .limit(eventLimit),
    ]);

    if (countError || pendingError || recentError || tasksError || artifactsError || eventsError) {
      console.error("[brain/inbox] load", {
        countError: countError?.message,
        pendingError: pendingError?.message,
        recentError: recentError?.message,
        tasksError: tasksError?.message,
        artifactsError: artifactsError?.message,
        eventsError: eventsError?.message,
      });
      return NextResponse.json({ error: "Nao foi possivel carregar o inbox do cerebro." }, { status: 500 });
    }

    const allApprovals = [...(pendingApprovals || []), ...(recentApprovals || [])] as ApprovalRow[];
    const taskIds = uniqueIds([
      ...(recentTasks || []).map((task) => task.id),
      ...allApprovals.map((approval) => approval.task_id),
      ...(recentArtifacts || []).map((artifact) => artifact.task_id),
      ...(recentEvents || []).map((event) => event.task_id),
    ]);
    const stepIds = uniqueIds([
      ...allApprovals.map((approval) => approval.step_id),
      ...(recentEvents || []).map((event) => event.step_id),
    ]);

    const [
      { data: taskRows, error: taskRowsError },
      { data: runRows, error: runRowsError },
      { data: stepRows, error: stepRowsError },
      { data: memoryRows, error: memoryRowsError },
    ] = await Promise.all([
      taskIds.length > 0
        ? brainAdminSupabase
            .from("brain_tasks")
            .select("id, title, goal, module, channel, status, created_at, updated_at, started_at, result_summary, error_message, task_input, task_context, policy_snapshot")
            .eq("tenant_id", auth.context.tenantId)
            .in("id", taskIds)
        : Promise.resolve({ data: [], error: null } as { data: TaskRow[]; error: null }),
      loadRunRows(auth.context.tenantId, taskIds),
      loadStepRows(auth.context.tenantId, taskIds, stepIds),
      taskIds.length > 0
        ? brainAdminSupabase
            .from("brain_memories")
            .select("id, task_id, memory_key, value, source, confidence, promoted, created_at, updated_at")
            .eq("tenant_id", auth.context.tenantId)
            .in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null } as { data: MemoryRow[]; error: null }),
    ]);

    if (taskRowsError || runRowsError || stepRowsError || memoryRowsError) {
      console.error("[brain/inbox] relation load", {
        taskRowsError: taskRowsError?.message,
        runRowsError: runRowsError?.message,
        stepRowsError: stepRowsError?.message,
        memoryRowsError: memoryRowsError?.message,
      });
      return NextResponse.json({ error: "Nao foi possivel carregar detalhes do inbox do cerebro." }, { status: 500 });
    }

    const tasksMap = Object.fromEntries((taskRows || []).map((task) => [task.id, task])) as Record<string, TaskRow>;
    const stepsMap = Object.fromEntries((stepRows || []).map((step) => [step.id, step])) as Record<string, StepRow>;
    const normalizedPendingApprovals = (pendingApprovals || []).map((approval) => normalizeApprovalRow(approval as ApprovalRow, tasksMap, stepsMap));
    const normalizedRecentApprovals = (recentApprovals || []).map((approval) => normalizeApprovalRow(approval as ApprovalRow, tasksMap, stepsMap));
    const normalizedRecentArtifacts = (recentArtifacts || []).map((artifact) => normalizeArtifactRow(artifact as ArtifactRow, tasksMap));
    const normalizedRecentEvents = (recentEvents || []).map((event) => normalizeLearningEventRow(event as LearningEventRow, tasksMap, stepsMap));
    const legalOperatorMissions = buildLegalOperatorMissionSnapshots({
      approvals: [...normalizedPendingApprovals, ...normalizedRecentApprovals],
      artifacts: normalizedRecentArtifacts,
      events: normalizedRecentEvents,
    });
    const missionControlSnapshots = buildBrainMissionControlSnapshots({
      tasks: [...(taskRows || []), ...(recentTasks || [])],
      runs: runRows || [],
      steps: stepRows || [],
      approvals: [...normalizedPendingApprovals, ...normalizedRecentApprovals],
      artifacts: normalizedRecentArtifacts,
      events: normalizedRecentEvents,
      memories: memoryRows || [],
      legalOperatorMissions,
    });

    return NextResponse.json({
      pending_count: pendingCount || 0,
      pending_approvals: normalizedPendingApprovals,
      recent_approvals: normalizedRecentApprovals,
      recent_tasks: includeActivity ? (recentTasks || []) : [],
      recent_artifacts: normalizedRecentArtifacts,
      recent_events: normalizedRecentEvents,
      legal_operator_missions: legalOperatorMissions,
      mission_control_snapshots: missionControlSnapshots,
    });
  } catch (error) {
    console.error("[brain/inbox] fatal", error);
    return NextResponse.json({ error: "Erro interno ao carregar o inbox do cerebro." }, { status: 500 });
  }
}
