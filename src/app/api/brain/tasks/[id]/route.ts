import { NextRequest, NextResponse } from "next/server";
import { brainAdminSupabase, getBrainAuthContext } from "@/lib/brain/server";

export const dynamic = "force-dynamic";

const BRAIN_TASK_QUERY_TIMEOUT_MS = 6500;

type BrainQueryResult<T> = {
  data: T | null;
  error: { message?: string } | null;
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
      resolve({ data: null, error: { message: `${label}: upstream request timeout` } });
    }, BRAIN_TASK_QUERY_TIMEOUT_MS);

    Promise.resolve(query)
      .then(resolve, (error) => resolve({ data: null, error: { message: getErrorMessage(error) || `${label}: query failed` } }))
      .finally(() => clearTimeout(timeoutId));
  });
}

function warning(label: string, error: unknown) {
  const message = getErrorMessage(error);
  return message ? `${label}: ${message}` : null;
}

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

    const [taskResult, runsResult, stepsResult, approvalsResult, artifactsResult, memoriesResult, learningResult] = await Promise.all([
      safeQuery<Record<string, unknown>>(brainAdminSupabase
        .from("brain_tasks")
        .select("*")
        .eq("id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .maybeSingle(), "task"),
      safeQuery<Record<string, unknown>[]>(brainAdminSupabase
        .from("brain_runs")
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: true }), "runs"),
      safeQuery<Record<string, unknown>[]>(brainAdminSupabase
        .from("brain_steps")
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .order("order_index", { ascending: true }), "steps"),
      safeQuery<Record<string, unknown>[]>(brainAdminSupabase
        .from("brain_approvals")
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: true }), "approvals"),
      safeQuery<Record<string, unknown>[]>(brainAdminSupabase
        .from("brain_artifacts")
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: true }), "artifacts"),
      safeQuery<Record<string, unknown>[]>(brainAdminSupabase
        .from("brain_memories")
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: true }), "memories"),
      safeQuery<Record<string, unknown>[]>(brainAdminSupabase
        .from("learning_events")
        .select("*")
        .eq("task_id", taskId)
        .eq("tenant_id", auth.context.tenantId)
        .order("created_at", { ascending: true }), "learning_events"),
    ]);

    if (taskResult.error || !taskResult.data) {
      console.error("[brain/tasks/:id] task load", { taskError: taskResult.error?.message });
      return NextResponse.json({ error: taskResult.error ? "Nao foi possivel carregar a missao." : "Missao nao encontrada." }, { status: taskResult.error ? 500 : 404 });
    }

    const warnings = [
      warning("runs", runsResult.error),
      warning("steps", stepsResult.error),
      warning("approvals", approvalsResult.error),
      warning("artifacts", artifactsResult.error),
      warning("memories", memoriesResult.error),
      warning("learning_events", learningResult.error),
    ].filter(Boolean) as string[];

    if (warnings.length > 0) {
      console.warn("[brain/tasks/:id] partial", { warnings });
    }

    return NextResponse.json({
      task: taskResult.data,
      partial: warnings.length > 0,
      warnings,
      runs: runsResult.data ?? [],
      steps: stepsResult.data ?? [],
      approvals: approvalsResult.data ?? [],
      artifacts: artifactsResult.data ?? [],
      memories: memoriesResult.data ?? [],
      learning_events: learningResult.data ?? [],
    });
  } catch (error) {
    console.error("[brain/tasks/:id] fatal", error);
    return NextResponse.json({ error: "Erro interno ao carregar a missao." }, { status: 500 });
  }
}
