import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { getTenantGoogleDriveContext } from "@/lib/services/google-drive-tenant";
import { createDriveDocumentScanPreview } from "@/lib/services/drive-document-scanner";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type PreviewBody = {
  rootFolderId?: string | null;
  maxDepth?: number | null;
  maxItems?: number | null;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getSafeDriveScanError(error: any, fallback: string) {
  if (error?.message === "Unauthorized") return { error: "Nao autenticado.", status: 401 };
  if (error?.message === "TenantNotFound") return { error: "Tenant nao encontrado para a sessao atual.", status: 403 };
  if (error?.message === "GoogleDriveDisconnected" || error?.message === "GoogleDriveNotConfigured") {
    return { error: "Google Drive nao conectado para este escritorio.", status: 400 };
  }
  return { error: fallback, status: 500 };
}

function getNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function buildRunDetailSummary(actions: any[], items: any[]) {
  return {
    totalActions: actions.length,
    pendingReview: actions.filter((action) => action.status === "review_required").length,
    approved: actions.filter((action) => action.status === "approved").length,
    applied: actions.filter((action) => action.status === "applied").length,
    failed: actions.filter((action) => action.status === "failed").length,
    skipped: actions.filter((action) => action.status === "skipped").length,
    duplicates: actions.filter((action) => action.action_type === "mark_duplicate").length,
    withoutProcess: actions.filter((action) => action.action_type === "request_review" || !action.target_process_task_id).length,
    lowOrMediumConfidence: actions.filter((action) => action.confidence === "low" || action.confidence === "medium").length,
    scannedItems: items.length,
  };
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId, userId } = await getTenantSession();
    const body = (await request.json().catch(() => ({}))) as PreviewBody;
    const driveContext = await getTenantGoogleDriveContext(request, tenantId);
    const rootFolderId = normalizeString(body.rootFolderId) || normalizeString(driveContext.metadata.drive_root_folder_id);

    if (!rootFolderId) {
      return NextResponse.json(
        { error: "Selecione uma pasta raiz do Google Drive antes de analisar o acervo." },
        { status: 400 }
      );
    }

    const result = await createDriveDocumentScanPreview({
      tenantId,
      userId,
      accessToken: driveContext.accessToken,
      rootFolderId,
      maxDepth: body.maxDepth || undefined,
      maxItems: body.maxItems || undefined,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    const safeError = getSafeDriveScanError(error, "Erro ao gerar preview do acervo do Drive.");
    return NextResponse.json({ error: safeError.error }, { status: safeError.status });
  }
}

export async function GET(request?: NextRequest) {
  try {
    const { tenantId } = await getTenantSession();
    const runId = normalizeString(request?.nextUrl.searchParams.get("runId"));

    if (runId) {
      const { data: run, error: runError } = await supabaseAdmin
        .from("drive_scan_runs")
        .select("id, root_folder_name, root_folder_url, status, counters, error_message, brain_task_id, brain_run_id, brain_artifact_id, created_at, completed_at")
        .eq("tenant_id", tenantId)
        .eq("id", runId)
        .maybeSingle();

      if (runError) throw runError;
      if (!run) {
        return NextResponse.json({ error: "Analise do Drive nao encontrada para este escritorio." }, { status: 404 });
      }

      const [{ data: actions }, { data: items }] = await Promise.all([
        supabaseAdmin
          .from("drive_scan_actions")
          .select("id, scan_item_id, action_type, target_process_task_id, target_folder_label, confidence, reason, status, error_message, applied_at, created_at, updated_at")
          .eq("tenant_id", tenantId)
          .eq("scan_run_id", runId)
          .order("created_at", { ascending: false }),
        supabaseAdmin
          .from("drive_scan_items")
          .select("id, drive_file_id, name, mime_type, parent_path, web_view_link, candidate_process_number, candidate_client_name, review_reason, status, created_at")
          .eq("tenant_id", tenantId)
          .eq("scan_run_id", runId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      const scanItemIds = Array.from(new Set((actions || []).map((action: any) => action.scan_item_id).filter(Boolean)));
      const processTaskIds = Array.from(new Set((actions || []).map((action: any) => action.target_process_task_id).filter(Boolean)));

      const [{ data: actionItems }, { data: tasks }] = await Promise.all([
        scanItemIds.length > 0
          ? supabaseAdmin
              .from("drive_scan_items")
              .select("id, drive_file_id, name, parent_path, web_view_link, candidate_process_number, candidate_client_name, review_reason, status")
              .eq("tenant_id", tenantId)
              .in("id", scanItemIds)
          : Promise.resolve({ data: [] }),
        processTaskIds.length > 0
          ? supabaseAdmin
              .from("process_tasks")
              .select("id, title, client_name, processo_1grau, process_number")
              .eq("tenant_id", tenantId)
              .in("id", processTaskIds)
          : Promise.resolve({ data: [] }),
      ]);

      const itemsById = new Map((actionItems || []).map((item: any) => [item.id, item]));
      const tasksById = new Map((tasks || []).map((task: any) => [task.id, task]));
      const enrichedActions = (actions || []).map((action: any) => ({
        ...action,
        file: itemsById.get(action.scan_item_id) || null,
        targetProcess: action.target_process_task_id ? tasksById.get(action.target_process_task_id) || null : null,
      }));

      return NextResponse.json({
        run: {
          ...run,
          counters: {
            ...(run.counters || {}),
            filesScanned: getNumber(run.counters?.filesScanned),
            needsReview: getNumber(run.counters?.needsReview),
            duplicates: getNumber(run.counters?.duplicates),
            proposedActions: getNumber(run.counters?.proposedActions),
          },
        },
        summary: buildRunDetailSummary(enrichedActions, items || []),
        actions: enrichedActions,
        items: items || [],
      });
    }

    const { data, error } = await supabaseAdmin
      .from("drive_scan_runs")
      .select("id, root_folder_name, root_folder_url, status, counters, error_message, brain_artifact_id, created_at, completed_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(8);

    if (error) {
      throw error;
    }

    return NextResponse.json({ runs: data || [] });
  } catch (error: any) {
    const safeError = getSafeDriveScanError(error, "Erro ao carregar historico de analises do Drive.");
    return NextResponse.json({ error: safeError.error }, { status: safeError.status });
  }
}
