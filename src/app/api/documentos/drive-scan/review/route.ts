import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type ReviewDecisionBody = {
  actionId?: string | null;
  actionIds?: unknown;
  decision?: "approve" | "reject" | null;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeActionIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeString(item)).filter(Boolean);
}

function getSafeReviewError(error: any, fallback: string) {
  if (error?.message === "Unauthorized") return { error: "Nao autenticado.", status: 401 };
  return { error: fallback, status: 500 };
}

function getPendingCategory(action: any) {
  const actionType = normalizeString(action?.action_type);
  const confidence = normalizeString(action?.confidence) || "none";

  if (action?.status === "failed") return "apply_failed";
  if (actionType === "mark_duplicate") return "duplicate";
  if (actionType === "request_review" || !action?.target_process_task_id) return "without_process";
  if (confidence === "low") return "low_confidence";
  if (confidence === "medium") return "medium_confidence";
  return "manual_review";
}

function getPendingLabel(category: string) {
  switch (category) {
    case "duplicate":
      return "Duplicado provavel";
    case "without_process":
      return "Sem processo vinculado";
    case "low_confidence":
      return "Baixa confianca";
    case "medium_confidence":
      return "Media confianca";
    case "apply_failed":
      return "Falha na aplicacao";
    default:
      return "Revisao humana";
  }
}

function buildReviewSummary(actions: any[]) {
  const summary = {
    total: actions.length,
    movable: 0,
    duplicates: 0,
    unmatched: 0,
    lowOrMediumConfidence: 0,
    failedOperations: 0,
    byConfidence: {
      high: 0,
      medium: 0,
      low: 0,
      none: 0,
    },
    byActionType: {} as Record<string, number>,
  };

  for (const action of actions) {
    const confidence = ["high", "medium", "low", "none"].includes(action?.confidence) ? action.confidence : "none";
    summary.byConfidence[confidence as keyof typeof summary.byConfidence] += 1;
    const actionType = normalizeString(action?.action_type) || "unknown";
    summary.byActionType[actionType] = (summary.byActionType[actionType] || 0) + 1;

    if (["move_to_process_folder", "create_process_folder"].includes(actionType)) summary.movable += 1;
    if (actionType === "mark_duplicate") summary.duplicates += 1;
    if (actionType === "request_review") summary.unmatched += 1;
    if (confidence === "low" || confidence === "medium") summary.lowOrMediumConfidence += 1;
    if (action.status === "failed") summary.failedOperations += 1;
  }

  return summary;
}

export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantSession();
    const confidence = normalizeString(request.nextUrl.searchParams.get("confidence"));
    const actionType = normalizeString(request.nextUrl.searchParams.get("actionType"));

    let query = supabaseAdmin
      .from("drive_scan_actions")
      .select("id, scan_run_id, scan_item_id, action_type, target_process_task_id, target_folder_label, confidence, reason, status, error_message, created_at, updated_at")
      .eq("tenant_id", tenantId)
      .in("status", ["review_required", "failed"])
      .order("created_at", { ascending: false });

    if (["high", "medium", "low", "none"].includes(confidence)) {
      query = query.eq("confidence", confidence);
    }

    if (["move_to_process_folder", "create_process_folder", "request_review", "mark_duplicate", "ignore"].includes(actionType)) {
      query = query.eq("action_type", actionType);
    }

    const { data: actions, error } = await query.limit(30);

    if (error) throw error;

    const scanItemIds = Array.from(new Set((actions || []).map((action: any) => action.scan_item_id).filter(Boolean)));
    const scanRunIds = Array.from(new Set((actions || []).map((action: any) => action.scan_run_id).filter(Boolean)));
    const processTaskIds = Array.from(new Set((actions || []).map((action: any) => action.target_process_task_id).filter(Boolean)));

    const [{ data: items }, { data: runs }, { data: tasks }] = await Promise.all([
      scanItemIds.length > 0
        ? supabaseAdmin
            .from("drive_scan_items")
            .select("id, drive_file_id, name, parent_path, web_view_link, candidate_process_number, candidate_client_name, review_reason")
            .eq("tenant_id", tenantId)
            .in("id", scanItemIds)
        : Promise.resolve({ data: [] }),
      scanRunIds.length > 0
        ? supabaseAdmin
            .from("drive_scan_runs")
            .select("id, root_folder_name, root_folder_url, created_at")
            .eq("tenant_id", tenantId)
            .in("id", scanRunIds)
        : Promise.resolve({ data: [] }),
      processTaskIds.length > 0
        ? supabaseAdmin
            .from("process_tasks")
            .select("id, title, client_name, processo_1grau, process_number")
            .eq("tenant_id", tenantId)
            .in("id", processTaskIds)
        : Promise.resolve({ data: [] }),
    ]);

    const itemsById = new Map((items || []).map((item: any) => [item.id, item]));
    const runsById = new Map((runs || []).map((run: any) => [run.id, run]));
    const tasksById = new Map((tasks || []).map((task: any) => [task.id, task]));

    return NextResponse.json({
      summary: buildReviewSummary(actions || []),
      items: (actions || []).map((action: any) => ({
        ...action,
        pendingCategory: getPendingCategory(action),
        pendingLabel: getPendingLabel(getPendingCategory(action)),
        file: itemsById.get(action.scan_item_id) || null,
        scanRun: runsById.get(action.scan_run_id) || null,
        targetProcess: action.target_process_task_id ? tasksById.get(action.target_process_task_id) || null : null,
      })),
    });
  } catch (error: any) {
    const safeError = getSafeReviewError(error, "Erro ao carregar revisoes pendentes do Drive.");
    return NextResponse.json({ error: safeError.error }, { status: safeError.status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantSession();
    const body = (await request.json().catch(() => ({}))) as ReviewDecisionBody;
    const actionIds = Array.from(new Set([
      normalizeString(body.actionId),
      ...normalizeActionIds(body.actionIds),
    ].filter(Boolean)));
    const decision = body.decision === "approve" || body.decision === "reject" ? body.decision : null;

    if (actionIds.length === 0 || !decision) {
      return NextResponse.json({ error: "Informe a acao e a decisao da revisao." }, { status: 400 });
    }

    const nextStatus = decision === "approve" ? "approved" : "rejected";
    const { data, error } = await supabaseAdmin
      .from("drive_scan_actions")
      .update({
        status: nextStatus,
        error_message: decision === "reject" ? "Rejeitada na revisao humana." : null,
      })
      .eq("tenant_id", tenantId)
      .in("id", actionIds)
      .in("status", ["review_required", "proposed", "approved"])
      .select("id, scan_run_id, action_type, status");

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Acao de revisao nao encontrada." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      action: data[0],
      actions: data,
      updatedCount: data.length,
    });
  } catch (error: any) {
    const safeError = getSafeReviewError(error, "Erro ao registrar revisao do Drive.");
    return NextResponse.json({ error: safeError.error }, { status: safeError.status });
  }
}
