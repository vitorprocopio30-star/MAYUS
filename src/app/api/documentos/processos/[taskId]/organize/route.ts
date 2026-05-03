import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTenantGoogleDriveContext } from "@/lib/services/google-drive-tenant";
import { organizeProcessDocuments, type ProcessTaskDocumentContext } from "@/lib/services/process-documents";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const { tenantId, userId } = await getTenantSession();
    const taskId = String(params?.taskId || "").trim();

    if (!taskId) {
      return NextResponse.json({ error: "Processo inválido para organização documental." }, { status: 400 });
    }

    const { data: task, error: taskError } = await supabaseAdmin
      .from("process_tasks")
      .select("id, tenant_id, stage_id, title, client_name, process_number, drive_link, drive_folder_id")
      .eq("id", taskId)
      .eq("tenant_id", tenantId)
      .maybeSingle<ProcessTaskDocumentContext>();

    if (taskError) {
      throw taskError;
    }

    if (!task) {
      return NextResponse.json({ error: "Processo nao encontrado para este escritorio." }, { status: 404 });
    }

    if (!task.drive_folder_id) {
      return NextResponse.json({ error: "Crie a estrutura documental do processo antes de organizar o acervo." }, { status: 400 });
    }

    const driveContext = await getTenantGoogleDriveContext(request, tenantId);
    const result = await organizeProcessDocuments({
      tenantId,
      accessToken: driveContext.accessToken,
      task,
    });

    await supabaseAdmin.from("system_event_logs").insert({
      tenant_id: tenantId,
      user_id: userId,
      source: "documentos",
      provider: "google_drive",
      event_name: "process_document_repository_organized",
      status: result.organization.moved > 0 ? "completed" : "reviewed",
      payload: {
        process_task_id: task.id,
        process_title: task.title,
        process_number: task.process_number || null,
        moved_count: result.organization.moved,
        skipped_count: result.organization.skipped,
        needs_review_count: result.organization.needsReview,
        moves: result.organization.moves.slice(0, 25),
        document_count: (result.memory as any)?.document_count ?? result.documents.length,
        sync_status: (result.memory as any)?.sync_status ?? null,
        warnings: result.warnings.slice(0, 10),
      },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    if (error.message === "GoogleDriveDisconnected" || error.message === "GoogleDriveNotConfigured") {
      return NextResponse.json({ error: "Google Drive não conectado para este escritório." }, { status: 400 });
    }

    return NextResponse.json(
      { error: error?.message || "Erro ao organizar o acervo documental do processo." },
      { status: 500 }
    );
  }
}
