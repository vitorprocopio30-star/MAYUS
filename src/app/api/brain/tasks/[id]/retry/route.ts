import { NextRequest, NextResponse } from "next/server";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";

export const dynamic = "force-dynamic";

const RETRYABLE_STEP_STATUSES = new Set(["failed", "cancelled"]);
const TERMINAL_TASK_STATUSES = new Set(["completed", "completed_with_warnings", "cancelled"]);
const ACTIVE_RETRY_STATUSES = new Set(["queued", "running", "awaiting_input", "awaiting_approval"]);

type RetryBody = {
  stepId?: unknown;
  reason?: unknown;
  idempotencyKey?: unknown;
};

function normalizeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildRetryIdempotencyKey(taskId: string, sourceStepId: string, rawKey: unknown): string {
  const explicitKey = normalizeString(rawKey, 160);
  if (explicitKey) return explicitKey;
  return `brain-retry:${taskId}:${sourceStepId}`;
}

function hasActiveRetryForKey(step: Record<string, unknown>, idempotencyKey: string): boolean {
  if (!ACTIVE_RETRY_STATUSES.has(String(step.status || ""))) return false;
  const inputPayload = normalizeObject(step.input_payload);
  const retryMetadata = normalizeObject(inputPayload.retry_metadata);
  return String(retryMetadata.idempotency_key || "") === idempotencyKey;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getBrainAuthContext();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const taskId = String(params.id || "").trim();
    if (!taskId) {
      return NextResponse.json({ error: "task id invalido." }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as RetryBody;
    const sourceStepId = normalizeString(body.stepId, 80);
    const reason = normalizeString(body.reason, 500);

    if (!sourceStepId) {
      return NextResponse.json({ error: "stepId e obrigatorio para tentar novamente." }, { status: 400 });
    }

    const [{ data: task, error: taskError }, { data: sourceStep, error: sourceStepError }, { data: runs, error: runsError }, { data: steps, error: stepsError }] = await Promise.all([
      brainAdminSupabase
        .from("brain_tasks")
        .select("id, tenant_id, status, module, title")
        .eq("id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .maybeSingle(),
      brainAdminSupabase
        .from("brain_steps")
        .select("*")
        .eq("id", sourceStepId)
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .maybeSingle(),
      brainAdminSupabase
        .from("brain_runs")
        .select("id, attempt_number, status")
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .order("attempt_number", { ascending: false }),
      brainAdminSupabase
        .from("brain_steps")
        .select("id, run_id, status, input_payload, created_at")
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: false }),
    ]);

    if (taskError || !task) {
      return NextResponse.json({ error: "Missao nao encontrada." }, { status: 404 });
    }

    if (sourceStepError || !sourceStep) {
      return NextResponse.json({ error: "Step nao encontrado para esta missao." }, { status: 404 });
    }

    if (runsError || stepsError) {
      console.error("[brain/tasks/:id/retry] load", {
        runsError: runsError?.message,
        stepsError: stepsError?.message,
      });
      return NextResponse.json({ error: "Nao foi possivel preparar retry da missao." }, { status: 500 });
    }

    if (TERMINAL_TASK_STATUSES.has(String(task.status || ""))) {
      return NextResponse.json(
        { error: "Missao ja esta em estado final e nao pode ser retomada.", status: task.status },
        { status: 409 }
      );
    }

    if (!RETRYABLE_STEP_STATUSES.has(String(sourceStep.status || ""))) {
      return NextResponse.json(
        { error: "Apenas steps com falha ou cancelados podem ser retomados por retry.", status: sourceStep.status },
        { status: 409 }
      );
    }

    const idempotencyKey = buildRetryIdempotencyKey(taskId, sourceStepId, body.idempotencyKey);
    const existingRetryStep = (steps || []).find((step) => hasActiveRetryForKey(step as Record<string, unknown>, idempotencyKey));
    if (existingRetryStep) {
      const existingRun = (runs || []).find((run) => String(run.id) === String(existingRetryStep.run_id));
      return NextResponse.json({
        success: true,
        idempotent: true,
        run: existingRun || null,
        step: existingRetryStep,
      });
    }

    const nextAttemptNumber = Math.max(0, ...(runs || []).map((run) => Number(run.attempt_number) || 0)) + 1;
    const now = new Date().toISOString();

    const { data: retryRun, error: retryRunError } = await brainAdminSupabase
      .from("brain_runs")
      .insert({
        task_id: taskId,
        tenant_id: auth.context.tenantId,
        attempt_number: nextAttemptNumber,
        status: "queued",
        summary: reason ? `Retry solicitado: ${reason}` : "Retry solicitado pelo agente.",
      })
      .select("*")
      .single();

    if (retryRunError || !retryRun) {
      console.error("[brain/tasks/:id/retry] run insert", retryRunError?.message);
      return NextResponse.json({ error: "Nao foi possivel criar nova tentativa da missao." }, { status: 500 });
    }

    const sourceInputPayload = normalizeObject(sourceStep.input_payload);
    const sourceOutputPayload = normalizeObject(sourceStep.output_payload);
    const sourceErrorPayload = normalizeObject(sourceStep.error_payload);

    const retryInputPayload = {
      ...sourceInputPayload,
      retry_metadata: {
        source_step_id: sourceStepId,
        source_run_id: sourceStep.run_id || null,
        idempotency_key: idempotencyKey,
        reason: reason || null,
        requested_by: auth.context.userId,
        requested_by_role: auth.context.userRole,
        requested_at: now,
        source_status: sourceStep.status || null,
        source_error: sourceErrorPayload,
        source_output_summary: typeof sourceOutputPayload.reply === "string"
          ? sourceOutputPayload.reply.slice(0, 500)
          : null,
      },
    };

    const { data: retryStep, error: retryStepError } = await brainAdminSupabase
      .from("brain_steps")
      .insert({
        task_id: taskId,
        run_id: retryRun.id,
        tenant_id: auth.context.tenantId,
        order_index: sourceStep.order_index ?? 1,
        step_key: sourceStep.step_key,
        title: `Retry: ${sourceStep.title || "step da missao"}`.slice(0, 180),
        step_type: sourceStep.step_type || "operation",
        capability_name: sourceStep.capability_name || null,
        handler_type: sourceStep.handler_type || null,
        approval_policy: sourceStep.approval_policy || null,
        status: "queued",
        input_payload: retryInputPayload,
      })
      .select("*")
      .single();

    if (retryStepError || !retryStep) {
      console.error("[brain/tasks/:id/retry] step insert", retryStepError?.message);
      await brainAdminSupabase.from("brain_runs").delete().eq("id", retryRun.id);
      return NextResponse.json({ error: "Nao foi possivel criar step de retry." }, { status: 500 });
    }

    await Promise.all([
      brainAdminSupabase
        .from("brain_tasks")
        .update({
          status: "queued",
          error_message: null,
          completed_at: null,
        })
        .eq("id", taskId)
        .eq("tenant_id", auth.context.tenantId),
      brainAdminSupabase.from("learning_events").insert({
        tenant_id: auth.context.tenantId,
        task_id: taskId,
        run_id: retryRun.id,
        step_id: retryStep.id,
        event_type: "task_step_retry_requested",
        source_module: String(task.module || "core"),
        payload: {
          source_step_id: sourceStepId,
          idempotency_key: idempotencyKey,
          reason: reason || null,
          attempt_number: nextAttemptNumber,
          external_side_effects_blocked: true,
        },
        created_by: auth.context.userId,
      }),
    ]);

    return NextResponse.json(
      {
        success: true,
        idempotent: false,
        run: retryRun,
        step: retryStep,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[brain/tasks/:id/retry] fatal", error);
    return NextResponse.json({ error: "Erro interno ao tentar novamente a missao." }, { status: 500 });
  }
}
