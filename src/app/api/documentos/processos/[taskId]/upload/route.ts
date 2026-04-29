import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTenantGoogleDriveContext } from "@/lib/services/google-drive-tenant";
import { syncProcessDocuments, type ProcessTaskDocumentContext } from "@/lib/services/process-documents";
import { uploadGoogleDriveFile } from "@/lib/services/google-drive";
import { inferProcessDocumentOrganization } from "@/lib/juridico/document-organization";

export const runtime = "nodejs";

type ProcessDocumentMemoryRecord = {
  folder_structure?: Record<string, { id: string; name: string; webViewLink: string }> | null;
};

export async function POST(request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const { tenantId, userId } = await getTenantSession();
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
    const files = [
      ...formData.getAll("files"),
      ...formData.getAll("file"),
    ].filter((item): item is File => item instanceof File && item.size > 0);
    const requestedFolderLabel = String(formData.get("folderLabel") || "").trim();

    if (files.length === 0) {
      return NextResponse.json({ error: "Selecione pelo menos um arquivo valido para upload." }, { status: 400 });
    }

    if (files.length > 25) {
      return NextResponse.json({ error: "Envie no maximo 25 arquivos por lote para manter a organizacao estavel." }, { status: 400 });
    }

    const driveContext = await getTenantGoogleDriveContext(request, tenantId);
    const { data: memory } = await supabaseAdmin
      .from("process_document_memory")
      .select("folder_structure")
      .eq("process_task_id", task.id)
      .maybeSingle<ProcessDocumentMemoryRecord>();

    const folderStructure = memory?.folder_structure || {};
    const autoOrganize = !requestedFolderLabel || /^auto|organizar automaticamente$/i.test(requestedFolderLabel);
    const uploadedFiles = [];
    const organizations = [];

    for (const file of files) {
      const organization = autoOrganize
        ? inferProcessDocumentOrganization({
            name: file.name,
            mimeType: file.type || "application/octet-stream",
          })
        : inferProcessDocumentOrganization({
            name: file.name,
            mimeType: file.type || "application/octet-stream",
            folderLabel: requestedFolderLabel,
          });
      const folderLabel = organization.folderLabel === "Raiz do Processo" ? "01-Documentos do Cliente" : organization.folderLabel;
      const targetFolderId = folderStructure[folderLabel]?.id || task.drive_folder_id;

      const bytes = await file.arrayBuffer();
      const uploadedFile = await uploadGoogleDriveFile(driveContext.accessToken, {
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        bytes,
        parentFolderId: targetFolderId,
      });

      uploadedFiles.push(uploadedFile);
      organizations.push({ fileName: file.name, ...organization });
    }

    try {
      const result = await syncProcessDocuments({
        tenantId,
        accessToken: driveContext.accessToken,
        task,
      });

      await supabaseAdmin.from("system_event_logs").insert({
        tenant_id: tenantId,
        user_id: userId,
        source: "documentos",
        provider: "google_drive",
        event_name: "process_document_batch_uploaded",
        status: "completed",
        payload: {
          process_task_id: task.id,
          process_title: task.title,
          process_number: task.process_number || null,
          uploaded_count: uploadedFiles.length,
          auto_organized: autoOrganize,
          organizations: organizations.slice(0, 25),
          document_count: (result.memory as any)?.document_count ?? result.documents.length,
          warnings: result.warnings.slice(0, 10),
        },
      });

      return NextResponse.json({
        success: true,
        uploaded: true,
        uploadedCount: uploadedFiles.length,
        indexed: true,
        uploadedFile: uploadedFiles[0] || null,
        uploadedFiles,
        organizations,
        ...result,
      });
    } catch (syncError: any) {
      await supabaseAdmin.from("system_event_logs").insert({
        tenant_id: tenantId,
        user_id: userId,
        source: "documentos",
        provider: "google_drive",
        event_name: "process_document_batch_uploaded",
        status: "partial",
        payload: {
          process_task_id: task.id,
          process_title: task.title,
          process_number: task.process_number || null,
          uploaded_count: uploadedFiles.length,
          auto_organized: autoOrganize,
          organizations: organizations.slice(0, 25),
          sync_error: syncError?.message || "Arquivo enviado ao Drive, mas a indexacao no MAYUS falhou.",
        },
      });

      return NextResponse.json({
        success: true,
        uploaded: true,
        uploadedCount: uploadedFiles.length,
        indexed: false,
        uploadedFile: uploadedFiles[0] || null,
        uploadedFiles,
        organizations,
        warnings: [
          {
            stage: "index",
            fileName: files.map((file) => file.name).join(", "),
            message: syncError?.message || "Arquivo enviado ao Drive, mas a indexação no MAYUS falhou.",
          },
        ],
      });
    }
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
