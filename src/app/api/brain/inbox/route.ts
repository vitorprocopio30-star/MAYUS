import { NextRequest, NextResponse } from "next/server";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";
import { isBrainExecutiveRole } from "@/lib/brain/roles";
import type { BrainInboxOperationalSummary } from "@/lib/brain/inbox-types";

export const dynamic = "force-dynamic";

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

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function safeSummaryText(value: unknown, maxLength = 140) {
  const text = getString(value);
  if (!text) return null;
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, maxLength);
}

function incrementCounter(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function extractOperationalModule(event: LearningEventRow) {
  const payload = getRecord(event.payload);
  const metadata = getRecord(payload?.metadata);
  return getString(event.source_module)
    || getString(payload?.source_module)
    || getString(payload?.target_module)
    || getString(metadata?.module)
    || getString(metadata?.skill_name)
    || "core";
}

function extractInstitutionalMemoryTrace(payload: Record<string, unknown> | null | undefined) {
  const metadata = getRecord(payload?.metadata);
  const memory = getRecord(metadata?.institutional_memory) || getRecord(payload?.institutional_memory);
  if (!memory) return { appliedCount: 0, keys: [] as string[] };

  const appliedCount = getNumber(memory.applied_count);
  const keys = Array.isArray(memory.applied_entries)
    ? memory.applied_entries
      .map((entry) => safeSummaryText(getRecord(entry)?.key, 80))
      .filter((key): key is string => Boolean(key))
    : [];

  return { appliedCount, keys };
}

function buildOperationalSummary(events: LearningEventRow[]): BrainInboxOperationalSummary {
  const correctionCounts: BrainInboxOperationalSummary["correction_counts"] = {
    total: 0,
    attempted: 0,
    applied: 0,
    requires_approval: 0,
    blocked: 0,
    failed: 0,
    not_available: 0,
    repair_patterns: 0,
    improvement_proposals: 0,
  };
  const modules = new Map<string, number>();
  const memoryKeys = new Map<string, number>();
  const recentBlocked: BrainInboxOperationalSummary["recent_blocked"] = [];
  let memoryEvents = 0;
  let totalAppliedMemory = 0;

  for (const event of events) {
    const payload = getRecord(event.payload);
    const moduleName = extractOperationalModule(event);
    const memoryTrace = extractInstitutionalMemoryTrace(payload);

    if (memoryTrace.appliedCount > 0) {
      memoryEvents += 1;
      totalAppliedMemory += memoryTrace.appliedCount;
      incrementCounter(modules, moduleName);
      for (const key of memoryTrace.keys) {
        incrementCounter(memoryKeys, key);
      }
    }

    let isOperationalCorrection = false;
    switch (event.event_type) {
      case "self_correction_attempted":
        correctionCounts.attempted += 1;
        isOperationalCorrection = true;
        break;
      case "self_correction_applied":
        correctionCounts.applied += 1;
        isOperationalCorrection = true;
        break;
      case "self_correction_requires_approval":
        correctionCounts.requires_approval += 1;
        isOperationalCorrection = true;
        break;
      case "self_correction_blocked":
        correctionCounts.blocked += 1;
        isOperationalCorrection = true;
        break;
      case "self_correction_failed":
        correctionCounts.failed += 1;
        isOperationalCorrection = true;
        break;
      case "self_correction_not_available":
      case "self_correction_no_correction_available":
        correctionCounts.not_available += 1;
        isOperationalCorrection = true;
        break;
      case "mayus_operating_partner_repair_pattern":
        correctionCounts.repair_patterns += 1;
        isOperationalCorrection = true;
        break;
      case "self_improvement_proposals_created":
        correctionCounts.improvement_proposals += 1;
        isOperationalCorrection = true;
        break;
      default:
        break;
    }

    if (isOperationalCorrection) {
      correctionCounts.total += 1;
      incrementCounter(modules, moduleName);
    }

    if (
      recentBlocked.length < 5
      && (
        event.event_type === "self_correction_blocked"
        || event.event_type === "self_correction_failed"
        || event.event_type === "self_correction_requires_approval"
      )
    ) {
      recentBlocked.push({
        id: event.id,
        event_type: event.event_type,
        source_module: event.source_module,
        correction_kind: safeSummaryText(payload?.correction_kind, 80),
        reason: safeSummaryText(payload?.reason),
        recommended_action: safeSummaryText(payload?.recommended_action, 180),
        created_at: event.created_at,
      });
    }
  }

  return {
    correction_counts: correctionCounts,
    modules: Array.from(modules.entries())
      .map(([module, count]) => ({ module, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    memory_applications: {
      total_events: memoryEvents,
      total_applied: totalAppliedMemory,
      keys: Array.from(memoryKeys.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
    },
    recent_blocked: recentBlocked,
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
        .select("id, task_id, step_id, status, risk_level, created_at, approved_at, decision_notes, approval_context")
        .eq("tenant_id", auth.context.tenantId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(pendingLimit),
      brainAdminSupabase
        .from("brain_approvals")
        .select("id, task_id, step_id, status, risk_level, created_at, approved_at, decision_notes, approval_context")
        .eq("tenant_id", auth.context.tenantId)
        .neq("status", "pending")
        .order("updated_at", { ascending: false })
        .limit(recentLimit),
      includeActivity
        ? brainAdminSupabase
            .from("brain_tasks")
            .select("id, title, goal, module, channel, status, created_at, updated_at, result_summary, error_message")
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
      ...allApprovals.map((approval) => approval.task_id),
      ...(recentArtifacts || []).map((artifact) => artifact.task_id),
      ...(recentEvents || []).map((event) => event.task_id),
    ]);
    const stepIds = uniqueIds([
      ...allApprovals.map((approval) => approval.step_id),
      ...(recentEvents || []).map((event) => event.step_id),
    ]);

    const [{ data: taskRows, error: taskRowsError }, { data: stepRows, error: stepRowsError }] = await Promise.all([
      taskIds.length > 0
        ? brainAdminSupabase
            .from("brain_tasks")
            .select("id, title, goal, module, channel, status, created_at, updated_at, result_summary, error_message")
            .eq("tenant_id", auth.context.tenantId)
            .in("id", taskIds)
        : Promise.resolve({ data: [], error: null } as { data: TaskRow[]; error: null }),
      stepIds.length > 0
        ? brainAdminSupabase
            .from("brain_steps")
            .select("id, title, status, step_type, capability_name, handler_type")
            .eq("tenant_id", auth.context.tenantId)
            .in("id", stepIds)
        : Promise.resolve({ data: [], error: null } as { data: StepRow[]; error: null }),
    ]);

    if (taskRowsError || stepRowsError) {
      console.error("[brain/inbox] relation load", {
        taskRowsError: taskRowsError?.message,
        stepRowsError: stepRowsError?.message,
      });
      return NextResponse.json({ error: "Nao foi possivel carregar detalhes do inbox do cerebro." }, { status: 500 });
    }

    const tasksMap = Object.fromEntries((taskRows || []).map((task) => [task.id, task])) as Record<string, TaskRow>;
    const stepsMap = Object.fromEntries((stepRows || []).map((step) => [step.id, step])) as Record<string, StepRow>;

    return NextResponse.json({
      pending_count: pendingCount || 0,
      pending_approvals: (pendingApprovals || []).map((approval) => normalizeApprovalRow(approval as ApprovalRow, tasksMap, stepsMap)),
      recent_approvals: (recentApprovals || []).map((approval) => normalizeApprovalRow(approval as ApprovalRow, tasksMap, stepsMap)),
      recent_tasks: includeActivity ? (recentTasks || []) : [],
      recent_artifacts: (recentArtifacts || []).map((artifact) => normalizeArtifactRow(artifact as ArtifactRow, tasksMap)),
      recent_events: (recentEvents || []).map((event) => normalizeLearningEventRow(event as LearningEventRow, tasksMap, stepsMap)),
      operational_summary: buildOperationalSummary((recentEvents || []) as LearningEventRow[]),
    });
  } catch (error) {
    console.error("[brain/inbox] fatal", error);
    return NextResponse.json({ error: "Erro interno ao carregar o inbox do cerebro." }, { status: 500 });
  }
}
