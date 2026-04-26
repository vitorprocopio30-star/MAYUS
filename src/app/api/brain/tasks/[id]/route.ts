import { NextRequest, NextResponse } from "next/server";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await getBrainAuthContext();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const taskId = String(params.id || "").trim();
    if (!taskId) {
      return NextResponse.json({ error: "task id invalido." }, { status: 400 });
    }

    const [{ data: task, error: taskError }, { data: runs, error: runsError }, { data: steps, error: stepsError }, { data: approvals, error: approvalsError }, { data: artifacts, error: artifactsError }, { data: memories, error: memoriesError }, { data: learningEvents, error: learningError }] = await Promise.all([
      brainAdminSupabase
        .from("brain_tasks")
        .select("*")
        .eq("id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .maybeSingle(),
      brainAdminSupabase
        .from("brain_runs")
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: true }),
      brainAdminSupabase
        .from("brain_steps")
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .order("order_index", { ascending: true }),
      brainAdminSupabase
        .from("brain_approvals")
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: true }),
      brainAdminSupabase
        .from("brain_artifacts")
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: true }),
      brainAdminSupabase
        .from("brain_memories")
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: true }),
      brainAdminSupabase
        .from("learning_events")
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: true }),
    ]);

    if (taskError || !task) {
      return NextResponse.json({ error: "Missao nao encontrada." }, { status: 404 });
    }

    if (runsError || stepsError || approvalsError || artifactsError || memoriesError || learningError) {
      console.error("[brain/tasks/:id] load", {
        runsError: runsError?.message,
        stepsError: stepsError?.message,
        approvalsError: approvalsError?.message,
        artifactsError: artifactsError?.message,
        memoriesError: memoriesError?.message,
        learningError: learningError?.message,
      });
      return NextResponse.json({ error: "Nao foi possivel carregar a missao." }, { status: 500 });
    }

    return NextResponse.json({
      task,
      runs: runs ?? [],
      steps: steps ?? [],
      approvals: approvals ?? [],
      artifacts: artifacts ?? [],
      memories: memories ?? [],
      learning_events: learningEvents ?? [],
    });
  } catch (error) {
    console.error("[brain/tasks/:id] fatal", error);
    return NextResponse.json({ error: "Erro interno ao carregar a missao." }, { status: 500 });
  }
}
