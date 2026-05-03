import { NextRequest, NextResponse } from "next/server";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";
import { isBrainExecutiveRole } from "@/lib/brain/roles";

export const dynamic = "force-dynamic";

const BRAIN_INBOX_QUERY_TIMEOUT_MS = 6500;

type BrainQueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
  count?: number | null;
};

function getErrorMessage(error: unknown) {
  if (!error) return null;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || "Erro desconhecido");
  return String(error);
}

function safeQuery<T>(query: PromiseLike<BrainQueryResult<T>>, label: string): Promise<BrainQueryResult<T>> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({ data: null, error: { message: `${label}: upstream request timeout` }, count: null });
    }, BRAIN_INBOX_QUERY_TIMEOUT_MS);

    Promise.resolve(query)
      .then(resolve, (error) => resolve({ data: null, error: { message: getErrorMessage(error) || `${label}: query failed` }, count: null }))
      .finally(() => clearTimeout(timeoutId));
  });
}

function warning(label: string, error: unknown) {
  const message = getErrorMessage(error);
  return message ? `${label}: ${message}` : null;
}

type ApprovalRow = {
  id: string;
  task_id: string;
  step_id: string | null;
  status: string;
  risk_level: string | null;
  created_at: string;
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
};

type StepRow = {
  id: string;
  title: string;
  status: string;
  step_type: string;
  capability_name: string | null;
  handler_type: string | null;
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

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}

function normalizeLimit(value: string | null, fallback: number, max: number) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function normalizeApprovalRow(
  approval: ApprovalRow,
  tasksMap: Record<string, TaskRow>,
  stepsMap: Record<string, StepRow>
) {
  const context = approval.approval_context && typeof approval.approval_context === "object"
    ? approval.approval_context
    : {};

  return {
    id: approval.id,
    status: approval.status,
    risk_level: approval.risk_level,
    created_at: approval.created_at,
    approved_at: approval.approved_at,
    decision_notes: approval.decision_notes,
    audit_log_id: typeof context.audit_log_id === "string" ? context.audit_log_id : null,
    awaiting_payload: context.awaiting_payload && typeof context.awaiting_payload === "object"
      ? context.awaiting_payload
      : null,
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

    const [pendingCountResult, pendingApprovalsResult, recentApprovalsResult, recentTasksResult, recentArtifactsResult, recentEventsResult] = await Promise.all([
      safeQuery<{ id: string }[]>(brainAdminSupabase
        .from("brain_approvals")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", auth.context.tenantId)
        .eq("status", "pending"), "pending_count"),
      safeQuery<ApprovalRow[]>(brainAdminSupabase
        .from("brain_approvals")
        .select("id, task_id, step_id, status, risk_level, created_at, approved_at, decision_notes, approval_context")
        .eq("tenant_id", auth.context.tenantId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(pendingLimit), "pending_approvals"),
      safeQuery<ApprovalRow[]>(brainAdminSupabase
        .from("brain_approvals")
        .select("id, task_id, step_id, status, risk_level, created_at, approved_at, decision_notes, approval_context")
        .eq("tenant_id", auth.context.tenantId)
        .neq("status", "pending")
        .order("updated_at", { ascending: false })
        .limit(recentLimit), "recent_approvals"),
      includeActivity
        ? safeQuery<TaskRow[]>(brainAdminSupabase
            .from("brain_tasks")
            .select("id, title, goal, module, channel, status, created_at, updated_at, result_summary, error_message")
            .eq("tenant_id", auth.context.tenantId)
            .order("updated_at", { ascending: false })
            .limit(activityLimit), "recent_tasks")
        : Promise.resolve({ data: [], error: null } as { data: TaskRow[]; error: null }),
      safeQuery<ArtifactRow[]>(brainAdminSupabase
        .from("brain_artifacts")
        .select("id, task_id, artifact_type, title, storage_url, mime_type, source_module, metadata, created_at")
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: false })
        .limit(artifactLimit), "recent_artifacts"),
      safeQuery<LearningEventRow[]>(brainAdminSupabase
        .from("learning_events")
        .select("id, task_id, step_id, event_type, source_module, payload, created_at")
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: false })
        .limit(eventLimit), "recent_events"),
    ]);

    const pendingCount = pendingCountResult.count || 0;
    const pendingApprovals = pendingApprovalsResult.data || [];
    const recentApprovals = recentApprovalsResult.data || [];
    const recentTasks = recentTasksResult.data || [];
    const recentArtifacts = recentArtifactsResult.data || [];
    const recentEvents = recentEventsResult.data || [];
    const warnings = [
      warning("pending_count", pendingCountResult.error),
      warning("pending_approvals", pendingApprovalsResult.error),
      warning("recent_approvals", recentApprovalsResult.error),
      warning("recent_tasks", recentTasksResult.error),
      warning("recent_artifacts", recentArtifactsResult.error),
      warning("recent_events", recentEventsResult.error),
    ].filter(Boolean) as string[];

    if (warnings.length > 0) {
      console.warn("[brain/inbox] partial", { warnings });
    }

    const allApprovals = [...(pendingApprovals || []), ...(recentApprovals || [])] as ApprovalRow[];
    const taskIds = uniqueIds([
      ...allApprovals.map((approval) => approval.task_id),
      ...(recentArtifacts || []).map((artifact) => artifact.task_id),
      ...(recentEvents || []).map((event) => event.task_id),
    ]);
    const stepIds = uniqueIds([
      ...allApprovals.map((approval) => approval.step_id),
      ...(recentEvents || []).map((event) => event.step_id),
    ]);

    const [taskRowsResult, stepRowsResult] = await Promise.all([
      taskIds.length > 0
        ? safeQuery<TaskRow[]>(brainAdminSupabase
            .from("brain_tasks")
            .select("id, title, goal, module, channel, status, created_at, updated_at, result_summary, error_message")
            .eq("tenant_id", auth.context.tenantId)
            .in("id", taskIds), "related_tasks")
        : Promise.resolve({ data: [], error: null } as { data: TaskRow[]; error: null }),
      stepIds.length > 0
        ? safeQuery<StepRow[]>(brainAdminSupabase
            .from("brain_steps")
            .select("id, title, status, step_type, capability_name, handler_type")
            .eq("tenant_id", auth.context.tenantId)
            .in("id", stepIds), "related_steps")
        : Promise.resolve({ data: [], error: null } as { data: StepRow[]; error: null }),
    ]);

    const relationWarnings = [
      warning("related_tasks", taskRowsResult.error),
      warning("related_steps", stepRowsResult.error),
    ].filter(Boolean) as string[];

    if (relationWarnings.length > 0) {
      warnings.push(...relationWarnings);
      console.warn("[brain/inbox] relation partial", { warnings: relationWarnings });
    }

    const taskRows = taskRowsResult.data || [];
    const stepRows = stepRowsResult.data || [];
    const tasksMap = Object.fromEntries((taskRows || []).map((task) => [task.id, task])) as Record<string, TaskRow>;
    const stepsMap = Object.fromEntries((stepRows || []).map((step) => [step.id, step])) as Record<string, StepRow>;

    return NextResponse.json({
      pending_count: pendingCount,
      partial: warnings.length > 0,
      warnings,
      pending_approvals: (pendingApprovals || []).map((approval) => normalizeApprovalRow(approval as ApprovalRow, tasksMap, stepsMap)),
      recent_approvals: (recentApprovals || []).map((approval) => normalizeApprovalRow(approval as ApprovalRow, tasksMap, stepsMap)),
      recent_tasks: includeActivity ? (recentTasks || []) : [],
      recent_artifacts: (recentArtifacts || []).map((artifact) => normalizeArtifactRow(artifact as ArtifactRow, tasksMap)),
      recent_events: (recentEvents || []).map((event) => normalizeLearningEventRow(event as LearningEventRow, tasksMap, stepsMap)),
    });
  } catch (error) {
    console.error("[brain/inbox] fatal", error);
    return NextResponse.json({ error: "Erro interno ao carregar o inbox do cerebro." }, { status: 500 });
  }
}
