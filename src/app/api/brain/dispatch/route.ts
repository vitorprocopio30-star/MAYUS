import { NextRequest, NextResponse } from "next/server";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";

export const dynamic = "force-dynamic";

type DispatchBody = {
  goal?: string;
  title?: string;
  module?: string;
  channel?: string;
  task_input?: Record<string, unknown>;
  task_context?: Record<string, unknown>;
  policy_snapshot?: Record<string, unknown>;
};

function normalizeString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getBrainAuthContext();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = (await req.json().catch(() => ({}))) as DispatchBody;
    const goal = normalizeString(body.goal);

    if (!goal) {
      return NextResponse.json({ error: "goal e obrigatorio." }, { status: 400 });
    }

    const title = normalizeString(body.title) || goal.slice(0, 120);
    const moduleName = normalizeString(body.module, "core") || "core";
    const channel = normalizeString(body.channel, "chat") || "chat";
    const taskInput = normalizeObject(body.task_input);
    const taskContext = normalizeObject(body.task_context);
    const policySnapshot = normalizeObject(body.policy_snapshot);

    const now = new Date().toISOString();

    const { data: task, error: taskError } = await brainAdminSupabase
      .from("brain_tasks")
      .insert({
        tenant_id: auth.context.tenantId,
        created_by: auth.context.userId,
        channel,
        module: moduleName,
        status: "planning",
        title,
        goal,
        task_input: taskInput,
        task_context: taskContext,
        policy_snapshot: policySnapshot,
        started_at: now,
      })
      .select("*")
      .single();

    if (taskError || !task) {
      console.error("[brain/dispatch] task insert", taskError?.message);
      return NextResponse.json({ error: "Nao foi possivel criar a missao." }, { status: 500 });
    }

    const { data: run, error: runError } = await brainAdminSupabase
      .from("brain_runs")
      .insert({
        task_id: task.id,
        tenant_id: auth.context.tenantId,
        attempt_number: 1,
        status: "planning",
        started_at: now,
      })
      .select("*")
      .single();

    if (runError || !run) {
      console.error("[brain/dispatch] run insert", runError?.message);
      await brainAdminSupabase.from("brain_tasks").delete().eq("id", task.id);
      return NextResponse.json({ error: "Nao foi possivel iniciar a execucao da missao." }, { status: 500 });
    }

    const { data: step, error: stepError } = await brainAdminSupabase
      .from("brain_steps")
      .insert({
        task_id: task.id,
        run_id: run.id,
        tenant_id: auth.context.tenantId,
        order_index: 1,
        step_key: "mission_planner",
        title: "Planejar missao",
        step_type: "planner",
        status: "queued",
        input_payload: {
          goal,
          module: moduleName,
          channel,
          task_input: taskInput,
          task_context: taskContext,
        },
      })
      .select("*")
      .single();

    if (stepError || !step) {
      console.error("[brain/dispatch] step insert", stepError?.message);
      await brainAdminSupabase.from("brain_runs").delete().eq("id", run.id);
      await brainAdminSupabase.from("brain_tasks").delete().eq("id", task.id);
      return NextResponse.json({ error: "Nao foi possivel criar o primeiro step da missao." }, { status: 500 });
    }

    await brainAdminSupabase.from("learning_events").insert({
      tenant_id: auth.context.tenantId,
      task_id: task.id,
      run_id: run.id,
      step_id: step.id,
      event_type: "task_dispatched",
      source_module: moduleName,
      payload: {
        channel,
        user_role: auth.context.userRole,
        goal,
      },
      created_by: auth.context.userId,
    });

    return NextResponse.json(
      {
        task,
        run,
        step,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[brain/dispatch] fatal", error);
    return NextResponse.json({ error: "Erro interno ao despachar a missao." }, { status: 500 });
  }
}
