import { NextRequest, NextResponse } from "next/server";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";
import { isBrainExecutiveRole } from "@/lib/brain/roles";
import {
  listMayusAgenticRoutines,
  runMayusRoutineHeartbeat,
  type MayusAgenticRoutine,
  type MayusRoutineHeartbeatResult,
} from "@/lib/agent/runtime/routines";
import { buildMayusAgentControlPlane } from "@/lib/agent/runtime/control-plane";
import { buildLegalOperatorMissionSnapshots } from "@/lib/brain/legal-operator-missions";
import {
  buildBrainMissionControlSnapshots,
  type BrainMissionControlSnapshot,
} from "@/lib/brain/mission-control";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RoutinePostBody = {
  routineId?: string;
  dryRun?: boolean;
  tenantId?: string;
  limit?: number;
  force?: boolean;
  scheduler?: boolean;
};

type RoutineClient = {
  from: (table: string) => any;
};

type RoutineScheduleTarget = {
  tenantId: string;
  routine: MayusAgenticRoutine;
};

type SchedulerItem = {
  tenantId: string;
  routineId?: string;
  status?: string;
  reason?: string;
  eventName?: string | null;
  missionCreated?: boolean;
  taskId?: string | null;
  artifactId?: string | null;
  approvalId?: string | null;
};

type RoutineEventRow = {
  created_at?: string | null;
  event_name?: string | null;
  status?: string | null;
  payload?: Record<string, unknown> | null;
};

type BrainRelationRow = Record<string, unknown> & {
  id?: string | null;
  task_id?: string | null;
  step_id?: string | null;
};

type MissionControlDiagnostics = {
  status: "ready" | "degraded";
  canReconstruct: boolean;
  reason: string;
  nextAction: string;
  sources: string[];
};

const ROUTINE_EVENT_NAMES = [
  "agentic_routine_woken",
  "agentic_routine_blocked",
  "agentic_routine_dry_run",
];

const DEFAULT_SCHEDULER_LIMIT = 5;
const MAX_SCHEDULER_LIMIT = 25;
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const WEEKLY_INTERVAL_MS = 7 * DAILY_INTERVAL_MS;
const MIN_INTERVAL_MS = 60 * 60 * 1000;

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sanitizeText(value: unknown, fallback = "scheduler_error") {
  const text = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return text
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/(service[_-]?role[_-]?key|service[_-]?role|secret|token|api[_-]?key|authorization)(["'\s:=_-]+)[^"',\s}]+/gi, "$1$2[redacted]")
    .slice(0, 280);
}

function sanitizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: sanitizeText(error.name, "Error"),
      message: sanitizeText(error.message),
    };
  }

  return { name: "Error", message: sanitizeText(String(error || "scheduler_error")) };
}

function getCronAuthState(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const hasCronHeader = request.headers.has("x-cron-secret") || request.headers.has("authorization");
  if (!secret) return { authorized: false, hasCronHeader, missingSecret: true };
  const cronHeader = request.headers.get("x-cron-secret");
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return {
    authorized: cronHeader === secret || bearer === secret,
    hasCronHeader,
    missingSecret: false,
  };
}

function normalizeLimit(value: unknown) {
  const parsed = Number(value ?? DEFAULT_SCHEDULER_LIMIT);
  if (!Number.isFinite(parsed)) return DEFAULT_SCHEDULER_LIMIT;
  return Math.min(Math.max(Math.floor(parsed), 1), MAX_SCHEDULER_LIMIT);
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return ["1", "true", "yes", "sim"].includes(value.toLowerCase());
  return fallback;
}

function normalizeRoutineOverride(value: unknown, fallbackId?: string) {
  const record = getRecord(value);
  const id = typeof record.id === "string" && record.id.trim()
    ? record.id.trim()
    : fallbackId || "";
  if (!id) return null;

  return {
    id,
    enabled: record.enabled === true,
    paused: record.paused === true,
  };
}

function extractRoutineOverrides(value: unknown): Array<{ id: string; enabled: boolean; paused: boolean }> {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeRoutineOverride(item))
      .filter(Boolean) as Array<{ id: string; enabled: boolean; paused: boolean }>;
  }

  const record = getRecord(value);
  const nested = record.routines || record.overrides || record.routine_overrides;
  if (nested) return extractRoutineOverrides(nested);

  return Object.entries(record)
    .map(([key, item]) => normalizeRoutineOverride(item, key))
    .filter(Boolean) as Array<{ id: string; enabled: boolean; paused: boolean }>;
}

function hasEnabledRoutineInSettings(aiFeatures: unknown, requestedRoutineId?: string) {
  const features = getRecord(aiFeatures);
  const raw = features.mayus_agentic_routines || features.agentic_routines;
  const overrides = extractRoutineOverrides(raw);
  return overrides.some((routine) => (
    routine.enabled &&
    !routine.paused &&
    (!requestedRoutineId || routine.id === requestedRoutineId)
  ));
}

async function discoverTenantsWithEnabledRoutines(params: {
  client: RoutineClient;
  requestedRoutineId?: string;
}) {
  const { data, error } = await params.client
    .from("tenant_settings")
    .select("tenant_id, ai_features");

  if (error) throw error;

  const tenants = new Set<string>();
  for (const row of Array.isArray(data) ? data : []) {
    const record = getRecord(row);
    const tenantId = typeof record.tenant_id === "string" ? record.tenant_id.trim() : "";
    if (!tenantId) continue;
    if (hasEnabledRoutineInSettings(record.ai_features, params.requestedRoutineId)) {
      tenants.add(tenantId);
    }
  }

  return Array.from(tenants);
}

function isScheduledRoutine(routine: MayusAgenticRoutine) {
  return routine.enabled === true && routine.paused !== true && routine.schedule?.kind !== "manual";
}

function getIntervalScheduleMinutes(schedule: MayusAgenticRoutine["schedule"]) {
  const record = getRecord(schedule);
  const minutes = Number(record.everyMinutes ?? record.intervalMinutes ?? record.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return 24 * 60;
  return Math.max(Math.floor(minutes), MIN_INTERVAL_MS / 60000);
}

function getRoutineIntervalMs(routine: MayusAgenticRoutine) {
  switch (routine.schedule?.kind) {
    case "weekly":
      return WEEKLY_INTERVAL_MS;
    case "interval":
      return getIntervalScheduleMinutes(routine.schedule) * 60 * 1000;
    case "daily":
      return DAILY_INTERVAL_MS;
    case "manual":
      return null;
    default:
      return DAILY_INTERVAL_MS;
  }
}

async function loadRecentRoutineEvents(params: {
  client: RoutineClient;
  tenantId: string;
}) {
  const baseQuery = params.client
    .from("system_event_logs")
    .select("created_at, event_name, status, payload")
    .eq("tenant_id", params.tenantId);

  const eventQuery = typeof baseQuery.in === "function"
    ? baseQuery.in("event_name", ROUTINE_EVENT_NAMES)
    : baseQuery;
  const orderedQuery = typeof eventQuery.order === "function"
    ? eventQuery.order("created_at", { ascending: false })
    : eventQuery;
  const limitedQuery = typeof orderedQuery.limit === "function"
    ? orderedQuery.limit(100)
    : orderedQuery;

  const { data, error } = await limitedQuery;
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as RoutineEventRow[];
}

function getRoutineIdFromEvent(event: RoutineEventRow) {
  const payload = getRecord(event.payload);
  const routineId = payload.routine_id || payload.routineId;
  return typeof routineId === "string" ? routineId : "";
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));
}

async function loadAgentControlMissionSnapshots(params: {
  client: RoutineClient;
  tenantId: string;
}): Promise<{
  snapshots: BrainMissionControlSnapshot[];
  diagnostics: MissionControlDiagnostics;
}> {
  const sources = [
    "brain_tasks",
    "brain_runs",
    "brain_steps",
    "brain_approvals",
    "brain_artifacts",
    "learning_events",
    "brain_memories",
  ];

  try {
    const [
      { data: pendingApprovals, error: pendingError },
      { data: recentApprovals, error: recentApprovalsError },
      { data: recentTasks, error: recentTasksError },
      { data: recentArtifacts, error: recentArtifactsError },
      { data: recentEvents, error: recentEventsError },
    ] = await Promise.all([
      params.client
        .from("brain_approvals")
        .select("id, task_id, step_id, status, risk_level, created_at, updated_at, approved_at, decision_notes, approval_context")
        .eq("tenant_id", params.tenantId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(20),
      params.client
        .from("brain_approvals")
        .select("id, task_id, step_id, status, risk_level, created_at, updated_at, approved_at, decision_notes, approval_context")
        .eq("tenant_id", params.tenantId)
        .neq("status", "pending")
        .order("updated_at", { ascending: false })
        .limit(8),
      params.client
        .from("brain_tasks")
        .select("id, title, goal, module, channel, status, created_at, updated_at, started_at, result_summary, error_message, task_input, task_context, policy_snapshot")
        .eq("tenant_id", params.tenantId)
        .order("updated_at", { ascending: false })
        .limit(12),
      params.client
        .from("brain_artifacts")
        .select("id, task_id, artifact_type, title, source_module, metadata, created_at")
        .eq("tenant_id", params.tenantId)
        .order("created_at", { ascending: false })
        .limit(16),
      params.client
        .from("learning_events")
        .select("id, task_id, step_id, event_type, source_module, payload, created_at")
        .eq("tenant_id", params.tenantId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (pendingError || recentApprovalsError || recentTasksError || recentArtifactsError || recentEventsError) {
      throw pendingError || recentApprovalsError || recentTasksError || recentArtifactsError || recentEventsError;
    }

    const approvals = [
      ...((pendingApprovals || []) as BrainRelationRow[]),
      ...((recentApprovals || []) as BrainRelationRow[]),
    ];
    const artifacts = (recentArtifacts || []) as BrainRelationRow[];
    const events = (recentEvents || []) as BrainRelationRow[];
    const tasks = (recentTasks || []) as BrainRelationRow[];
    const taskIds = uniqueIds([
      ...tasks.map((task) => task.id),
      ...approvals.map((approval) => approval.task_id),
      ...artifacts.map((artifact) => artifact.task_id),
      ...events.map((event) => event.task_id),
    ]);
    const stepIds = uniqueIds([
      ...approvals.map((approval) => approval.step_id),
      ...events.map((event) => event.step_id),
    ]);

    const [
      { data: taskRows, error: taskRowsError },
      { data: runRows, error: runRowsError },
      { data: stepRows, error: stepRowsError },
      { data: memoryRows, error: memoryRowsError },
    ] = await Promise.all([
      taskIds.length > 0
        ? params.client
            .from("brain_tasks")
            .select("id, title, goal, module, channel, status, created_at, updated_at, started_at, result_summary, error_message, task_input, task_context, policy_snapshot")
            .eq("tenant_id", params.tenantId)
            .in("id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      taskIds.length > 0
        ? params.client
            .from("brain_runs")
            .select("id, task_id, status, attempt_number, created_at, updated_at, started_at, completed_at, error_message, output_payload")
            .eq("tenant_id", params.tenantId)
            .in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
      taskIds.length > 0
        ? params.client
            .from("brain_steps")
            .select("id, task_id, run_id, order_index, step_key, title, status, step_type, capability_name, handler_type, input_payload, output_payload, error_message, created_at, updated_at, started_at, completed_at")
            .eq("tenant_id", params.tenantId)
            .in("task_id", taskIds)
        : stepIds.length > 0
          ? params.client
              .from("brain_steps")
              .select("id, task_id, run_id, order_index, step_key, title, status, step_type, capability_name, handler_type, input_payload, output_payload, error_message, created_at, updated_at, started_at, completed_at")
              .eq("tenant_id", params.tenantId)
              .in("id", stepIds)
          : Promise.resolve({ data: [], error: null }),
      taskIds.length > 0
        ? params.client
            .from("brain_memories")
            .select("id, task_id, memory_key, value, source, confidence, promoted, created_at, updated_at")
            .eq("tenant_id", params.tenantId)
            .in("task_id", taskIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (taskRowsError || runRowsError || stepRowsError || memoryRowsError) {
      throw taskRowsError || runRowsError || stepRowsError || memoryRowsError;
    }

    const legalOperatorMissions = buildLegalOperatorMissionSnapshots({
      approvals: approvals as any,
      artifacts: artifacts as any,
      events: events as any,
    });

    const snapshots = buildBrainMissionControlSnapshots({
      tasks: [...((taskRows || []) as any[]), ...(tasks as any[])],
      runs: (runRows || []) as any[],
      steps: (stepRows || []) as any[],
      approvals: approvals as any[],
      artifacts: artifacts as any[],
      events: events as any[],
      memories: (memoryRows || []) as any[],
      legalOperatorMissions,
    }).slice(0, 12);

    return {
      snapshots,
      diagnostics: snapshots.length > 0
        ? {
            status: "ready",
            canReconstruct: true,
            reason: "Mission Control reconstruiu missoes reais com owner, blockers, policy OpenClaw e trajectory Hermes.",
            nextAction: "Usar mission_control_snapshots como fonte de leitura para coordenacao interna.",
            sources,
          }
        : {
            status: "degraded",
            canReconstruct: false,
            reason: "Nenhum snapshot real de Mission Control foi encontrado para este tenant.",
            nextAction: "Acordar uma rotina Paperclip ou verificar se brain_tasks/approvals/artifacts/events existem para este tenant.",
            sources,
          },
    };
  } catch (error) {
    const safeError = sanitizeError(error);
    console.warn("[agent/routines] mission snapshots unavailable", safeError);
    return {
      snapshots: [],
      diagnostics: {
        status: "degraded",
        canReconstruct: false,
        reason: `Mission Control indisponivel: ${safeError.message}`,
        nextAction: "Verificar schema brain_*, learning_events, brain_memories e credenciais server-side antes de confiar no painel.",
        sources,
      },
    };
  }
}

function getLastRoutineEventAt(events: RoutineEventRow[], routineId: string) {
  for (const event of events) {
    if (getRoutineIdFromEvent(event) !== routineId) continue;
    const timestamp = typeof event.created_at === "string" ? Date.parse(event.created_at) : NaN;
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return null;
}

function shouldRunScheduledRoutine(params: {
  routine: MayusAgenticRoutine;
  events: RoutineEventRow[];
  now: number;
  force: boolean;
}) {
  const intervalMs = getRoutineIntervalMs(params.routine);
  if (intervalMs == null) {
    return { shouldRun: false, reason: "manual_schedule" };
  }
  if (params.force) {
    return { shouldRun: true, reason: "forced_scheduler_run" };
  }

  const lastRunAt = getLastRoutineEventAt(params.events, params.routine.id);
  if (!lastRunAt) {
    return { shouldRun: true, reason: "no_previous_scheduler_event" };
  }

  const elapsedMs = params.now - lastRunAt;
  if (elapsedMs >= intervalMs) {
    return { shouldRun: true, reason: "schedule_due" };
  }

  const nextRunAt = new Date(lastRunAt + intervalMs).toISOString();
  return { shouldRun: false, reason: `not_due_until:${nextRunAt}` };
}

function summarizeHeartbeatResult(tenantId: string, result: MayusRoutineHeartbeatResult): SchedulerItem {
  return {
    tenantId,
    routineId: result.routineId,
    status: result.status,
    reason: sanitizeText(result.reason, "routine_processed"),
    eventName: result.eventName || null,
    missionCreated: result.missionCreated === true,
    taskId: result.taskId || null,
    artifactId: result.artifactId || null,
    approvalId: result.approvalId || null,
  };
}

function isProcessedStatus(status: MayusRoutineHeartbeatResult["status"]) {
  return ["woken", "created", "dry_run", "awaiting_approval"].includes(status);
}

async function runGlobalRoutineScheduler(params: {
  body: RoutinePostBody;
  request: NextRequest;
  client: RoutineClient;
}) {
  const startedAt = Date.now();
  const searchParams = params.request.nextUrl.searchParams;
  const requestedRoutineId = typeof params.body.routineId === "string" && params.body.routineId.trim()
    ? params.body.routineId.trim()
    : searchParams.get("routineId")?.trim() || undefined;
  const dryRun = normalizeBoolean(params.body.dryRun, normalizeBoolean(searchParams.get("dryRun"), false));
  const force = normalizeBoolean(params.body.force, normalizeBoolean(searchParams.get("force"), false));
  const limit = normalizeLimit(params.body.limit ?? searchParams.get("limit"));

  const processed: SchedulerItem[] = [];
  const skipped: SchedulerItem[] = [];
  const blocked: SchedulerItem[] = [];
  const errors: SchedulerItem[] = [];

  let tenants: string[] = [];
  try {
    tenants = await discoverTenantsWithEnabledRoutines({
      client: params.client,
      requestedRoutineId,
    });
  } catch (error) {
    const safeError = sanitizeError(error);
    return NextResponse.json({
      ok: false,
      mode: "global_scheduler",
      processed,
      skipped,
      blocked,
      errors: [{ tenantId: "global", status: safeError.name, reason: safeError.message }],
      summary: {
        tenants_discovered: 0,
        tenants_enabled: 0,
        routines_eligible: 0,
        processed: 0,
        skipped: 0,
        blocked: 0,
        errors: 1,
      },
      duration_ms: Date.now() - startedAt,
    }, { status: 500 });
  }

  if (tenants.length === 0) {
    return NextResponse.json({
      ok: true,
      mode: "global_scheduler",
      dryRun,
      limit,
      message: "Nenhum tenant com rotinas agenticas habilitadas em tenant_settings.",
      processed,
      skipped,
      blocked,
      errors,
      summary: {
        tenants_discovered: 0,
        tenants_enabled: 0,
        routines_eligible: 0,
        processed: 0,
        skipped: 0,
        blocked: 0,
        errors: 0,
      },
      duration_ms: Date.now() - startedAt,
    });
  }

  const targets: RoutineScheduleTarget[] = [];
  for (const tenantId of tenants) {
    try {
      const routines = await listMayusAgenticRoutines({
        tenantId,
        client: params.client,
      });
      for (const routine of routines) {
        if (requestedRoutineId && routine.id !== requestedRoutineId) continue;
        if (!isScheduledRoutine(routine)) {
          if (routine.enabled && !routine.paused && routine.schedule?.kind === "manual") {
            skipped.push({ tenantId, routineId: routine.id, status: "skipped", reason: "manual_schedule" });
          }
          continue;
        }
        targets.push({ tenantId, routine });
      }
    } catch (error) {
      const safeError = sanitizeError(error);
      errors.push({ tenantId, status: safeError.name, reason: safeError.message });
    }
  }

  const recentEventsByTenant = new Map<string, RoutineEventRow[]>();
  let attempted = 0;
  const now = Date.now();

  for (const target of targets) {
    if (attempted >= limit) {
      skipped.push({
        tenantId: target.tenantId,
        routineId: target.routine.id,
        status: "skipped",
        reason: "limit_reached",
      });
      continue;
    }

    let events = recentEventsByTenant.get(target.tenantId);
    if (!events) {
      try {
        events = await loadRecentRoutineEvents({ client: params.client, tenantId: target.tenantId });
        recentEventsByTenant.set(target.tenantId, events);
      } catch (error) {
        const safeError = sanitizeError(error);
        blocked.push({
          tenantId: target.tenantId,
          routineId: target.routine.id,
          status: "blocked",
          reason: `schedule_window_unavailable:${safeError.message}`,
        });
        continue;
      }
    }

    const due = shouldRunScheduledRoutine({
      routine: target.routine,
      events,
      now,
      force,
    });

    if (!due.shouldRun) {
      skipped.push({
        tenantId: target.tenantId,
        routineId: target.routine.id,
        status: "skipped",
        reason: due.reason,
      });
      continue;
    }

    attempted += 1;
    try {
      const result = await runMayusRoutineHeartbeat({
        tenantId: target.tenantId,
        actorId: "system",
        routineId: target.routine.id,
        dryRun,
        client: params.client,
      });
      const item = summarizeHeartbeatResult(target.tenantId, result);
      if (isProcessedStatus(result.status)) processed.push(item);
      else if (result.status === "blocked") blocked.push(item);
      else skipped.push(item);
    } catch (error) {
      const safeError = sanitizeError(error);
      errors.push({
        tenantId: target.tenantId,
        routineId: target.routine.id,
        status: safeError.name,
        reason: safeError.message,
      });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    mode: "global_scheduler",
    dryRun,
    force,
    limit,
    processed,
    skipped,
    blocked,
    errors,
    summary: {
      tenants_discovered: tenants.length,
      tenants_enabled: tenants.length,
      routines_eligible: targets.length,
      processed: processed.length,
      skipped: skipped.length,
      blocked: blocked.length,
      errors: errors.length,
    },
    duration_ms: Date.now() - startedAt,
  }, { status: errors.length > 0 ? 207 : 200 });
}

async function getExecutiveAuth() {
  const auth = await getBrainAuthContext();
  if ("error" in auth) {
    return { error: auth.error, status: auth.status, context: null };
  }

  if (!isBrainExecutiveRole(auth.context.userRole)) {
    return { error: "Acesso restrito ao nivel executivo.", status: 403, context: null };
  }

  return { error: null, status: 200, context: auth.context };
}

export async function GET() {
  try {
    const auth = await getExecutiveAuth();
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const routines = await listMayusAgenticRoutines({
      tenantId: auth.context!.tenantId,
      client: brainAdminSupabase,
    });
    const missionControl = await loadAgentControlMissionSnapshots({
      tenantId: auth.context!.tenantId,
      client: brainAdminSupabase,
    });
    const missionControlSnapshots = missionControl.snapshots;
    const controlPlane = buildMayusAgentControlPlane({
      routines,
      missionSnapshots: missionControlSnapshots,
    });

    return NextResponse.json({
      routines,
      agents: controlPlane.agents,
      summary: controlPlane.summary,
      control_plane: controlPlane,
      mission_control: {
        ...missionControl.diagnostics,
        snapshots: missionControlSnapshots,
      },
      mission_control_degradation: missionControl.diagnostics.status === "degraded"
        ? missionControl.diagnostics
        : null,
      mission_control_snapshots: missionControlSnapshots,
    });
  } catch (error) {
    console.error("[agent/routines] GET", sanitizeError(error));
    return NextResponse.json({ error: "Nao foi possivel carregar rotinas agenticas." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as RoutinePostBody;
    const cronAuth = getCronAuthState(request);
    let tenantId = "";
    let actorId = "system";

    if (!cronAuth.authorized && cronAuth.hasCronHeader) {
      return NextResponse.json({ error: cronAuth.missingSecret ? "Cron secret nao configurado." : "Unauthorized" }, { status: 401 });
    }

    if (cronAuth.authorized) {
      tenantId = String(body.tenantId || "").trim();
      if (!tenantId) {
        return runGlobalRoutineScheduler({
          body,
          request,
          client: brainAdminSupabase,
        });
      }
    } else {
      const auth = await getExecutiveAuth();
      if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });
      tenantId = auth.context!.tenantId;
      actorId = auth.context!.userId;
    }

    const result = await runMayusRoutineHeartbeat({
      tenantId,
      actorId,
      routineId: typeof body.routineId === "string" ? body.routineId : undefined,
      dryRun: body.dryRun === true,
      force: body.force === true,
      client: brainAdminSupabase,
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error("[agent/routines] POST", sanitizeError(error));
    return NextResponse.json({ error: "Nao foi possivel acionar rotina agentica." }, { status: 500 });
  }
}
