import { NextRequest, NextResponse } from "next/server";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";

export const dynamic = "force-dynamic";

const TERMINAL_TASK_STATUSES = new Set(["completed", "completed_with_warnings", "failed", "cancelled"]);
const ACTIVE_RUN_STATUSES = ["queued", "planning", "executing", "awaiting_input", "awaiting_approval"];
const ACTIVE_STEP_STATUSES = ["queued", "running", "awaiting_input", "awaiting_approval"];

type CancelBody = {
  reason?: unknown;
};

function normalizeReason(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, 500);
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

    const body = (await req.json().catch(() => ({}))) as CancelBody;
    const reason = normalizeReason(body.reason);
    if (!reason) {
      return NextResponse.json({ error: "reason e obrigatorio para cancelar a missao." }, { status: 400 });
    }

    const { data: task, error: taskError } = await brainAdminSupabase
      .from("brain_tasks")
      .select("id, tenant_id, status, module, title")
      .eq("id", taskId)
      .eq("tenant_id", auth.context.tenantId)
      .maybeSingle();

    if (taskError || !task) {
      return NextResponse.json({ error: "Missao nao encontrada." }, { status: 404 });
    }

    if (TERMINAL_TASK_STATUSES.has(String(task.status))) {
      return NextResponse.json(
        {
          error: "Missao ja esta em estado final.",
          status: task.status,
        },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const cancelPayload = {
      cancelled_by: auth.context.userId,
      cancelled_by_role: auth.context.userRole,
      reason,
      cancelled_at: now,
    };

    const [{ error: taskUpdateError }, { error: runsUpdateError }, { error: stepsUpdateError }, { error: approvalsUpdateError }] = await Promise.all([
      brainAdminSupabase
        .from("brain_tasks")
        .update({
          status: "cancelled",
          completed_at: now,
          result_summary: `Missao cancelada: ${reason}`,
        })
        .eq("id", taskId)
        .eq("tenant_id", auth.context.tenantId),
      brainAdminSupabase
        .from("brain_runs")
        .update({
          status: "cancelled",
          completed_at: now,
          summary: `Execucao cancelada: ${reason}`,
        })
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .in("status", ACTIVE_RUN_STATUSES),
      brainAdminSupabase
        .from("brain_steps")
        .update({
          status: "cancelled",
          completed_at: now,
          error_payload: cancelPayload,
        })
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .in("status", ACTIVE_STEP_STATUSES),
      brainAdminSupabase
        .from("brain_approvals")
        .update({
          status: "cancelled",
          decision_notes: `Missao cancelada: ${reason}`,
          approved_by: auth.context.userId,
          approved_at: now,
        })
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .eq("status", "pending"),
    ]);

    if (taskUpdateError || runsUpdateError || stepsUpdateError || approvalsUpdateError) {
      console.error("[brain/tasks/:id/cancel] update", {
        taskUpdateError: taskUpdateError?.message,
        runsUpdateError: runsUpdateError?.message,
        stepsUpdateError: stepsUpdateError?.message,
        approvalsUpdateError: approvalsUpdateError?.message,
      });
      return NextResponse.json({ error: "Nao foi possivel cancelar a missao." }, { status: 500 });
    }

    await brainAdminSupabase.from("learning_events").insert({
      tenant_id: auth.context.tenantId,
      task_id: taskId,
      event_type: "task_cancelled",
      source_module: String(task.module || "core"),
      payload: {
        reason,
        actor_role: auth.context.userRole,
        task_title: task.title || null,
      },
      created_by: auth.context.userId,
    });

    return NextResponse.json({
      success: true,
      task: {
        id: taskId,
        status: "cancelled",
        cancelled_at: now,
      },
    });
  } catch (error) {
    console.error("[brain/tasks/:id/cancel] fatal", error);
    return NextResponse.json({ error: "Erro interno ao cancelar a missao." }, { status: 500 });
  }
}
