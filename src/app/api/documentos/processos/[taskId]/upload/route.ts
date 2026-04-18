import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTenantGoogleDriveContext } from "@/lib/services/google-drive-tenant";
import { syncProcessDocuments, type ProcessTaskDocumentContext } from "@/lib/services/process-documents";
import { uploadGoogleDriveFile } from "@/lib/services/google-drive";

export const runtime = "nodejs";

type ProcessDocumentMemoryRecord = {
  folder_structure?: Record<string, { id: string; name: string; webViewLink: string }> | null;
};

export async function POST(request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const { tenantId } = await getTenantSession();
    const taskId = String(params?.taskId || "").trim();

    if (!taskId) {
      return NextResponse.json({ error: "Processo inválido para upload." }, { status: 400 });
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

    if (!task || !task.drive_folder_id) {
      return NextResponse.json({ error: "Crie a estrutura documental do processo antes de enviar arquivos." }, { status: 400 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const folderLabel = String(formData.get("folderLabel") || "").trim() || "01-Documentos do Cliente";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Selecione um arquivo válido para upload." }, { status: 400 });
    }

    const driveContext = await getTenantGoogleDriveContext(request, tenantId);
    const { data: memory } = await supabaseAdmin
      .from("process_document_memory")
      .select("folder_structure")
      .eq("process_task_id", task.id)
      .maybeSingle<ProcessDocumentMemoryRecord>();

    const folderStructure = memory?.folder_structure || {};
    const targetFolderId = folderStructure[folderLabel]?.id || task.drive_folder_id;

    const bytes = await file.arrayBuffer();
    await uploadGoogleDriveFile(driveContext.accessToken, {
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      bytes,
      parentFolderId: targetFolderId,
    });

    const result = await syncProcessDocuments({
      tenantId,
      accessToken: driveContext.accessToken,
      task,
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
      { error: error?.message || "Erro ao enviar documento para o processo." },
      { status: 500 }
    );
  }
}
