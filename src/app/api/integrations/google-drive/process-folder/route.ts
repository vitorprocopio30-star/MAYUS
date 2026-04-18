import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildProcessGoogleDriveFolderName,
  createGoogleDriveFolder,
  createGoogleDriveFolderStructure,
  DEFAULT_PROCESS_DOCUMENT_FOLDERS,
  extractGoogleDriveFolderId,
  isGoogleDriveConfigured,
} from "@/lib/services/google-drive";
import { getTenantGoogleDriveContext } from "@/lib/services/google-drive-tenant";

type ProcessTaskRecord = {
  id: string;
  tenant_id: string;
  stage_id?: string | null;
  title: string;
  client_name?: string | null;
  process_number?: string | null;
  drive_link?: string | null;
  drive_folder_id?: string | null;
  drive_structure_ready?: boolean | null;
};

function buildInitialSummary(task: ProcessTaskRecord) {
  return [
    task.client_name ? `Cliente: ${task.client_name}` : null,
    task.process_number ? `Processo: ${task.process_number}` : null,
    task.title ? `Caso: ${task.title}` : null,
    "Estrutura documental do processo pronta no Google Drive para ingestão e resumos do MAYUS.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantSession();

    if (!isGoogleDriveConfigured()) {
      return NextResponse.json({ error: "Google Drive não configurado no servidor." }, { status: 503 });
    }

    const body = await request.json().catch(() => null);
    const taskId = String(body?.taskId || "").trim();

    if (!taskId) {
      return NextResponse.json({ error: "Processo inválido para criação de pasta." }, { status: 400 });
    }

    const { data: task, error: taskError } = await supabaseAdmin
      .from("process_tasks")
      .select("id, tenant_id, stage_id, title, client_name, process_number, drive_link, drive_folder_id, drive_structure_ready")
      .eq("id", taskId)
      .eq("tenant_id", tenantId)
      .maybeSingle<ProcessTaskRecord>();

    if (taskError) {
      throw taskError;
    }

    if (!task) {
      return NextResponse.json({ error: "Processo não encontrado." }, { status: 404 });
    }

    let driveContext;
    try {
      driveContext = await getTenantGoogleDriveContext(request, tenantId);
    } catch (error: any) {
      if (error?.message === "GoogleDriveDisconnected" || error?.message === "GoogleDriveNotConfigured") {
        return NextResponse.json(
          { error: "Conecte o Google Drive em Configurações > Integrações para gerar a pasta automaticamente." },
          { status: 400 }
        );
      }
      throw error;
    }

    let folderId = task.drive_folder_id || extractGoogleDriveFolderId(task.drive_link || "");
    let folderUrl = task.drive_link || null;
    let folderName = buildProcessGoogleDriveFolderName(task);

    if (!folderId) {
      const folder = await createGoogleDriveFolder(driveContext.accessToken, {
        name: folderName,
        parentFolderId: driveContext.metadata.drive_root_folder_id || null,
      });

      folderId = folder.id;
      folderUrl = folder.webViewLink;
      folderName = folder.name;
    }

    const folderStructure = await createGoogleDriveFolderStructure(
      driveContext.accessToken,
      folderId,
      DEFAULT_PROCESS_DOCUMENT_FOLDERS
    );

    const { data: updatedTask, error: updateTaskError } = await supabaseAdmin
      .from("process_tasks")
      .update({
        drive_link: folderUrl,
        drive_folder_id: folderId,
        drive_structure_ready: true,
      })
      .eq("id", task.id)
      .eq("tenant_id", tenantId)
      .select()
      .single();

    if (updateTaskError) {
      throw updateTaskError;
    }

    const { error: memoryError } = await supabaseAdmin
      .from("process_document_memory")
      .upsert(
        {
          tenant_id: tenantId,
          process_task_id: task.id,
          drive_folder_id: folderId,
          drive_folder_url: folderUrl,
          drive_folder_name: folderName,
          folder_structure: folderStructure,
          sync_status: "structured",
          current_phase: task.stage_id || null,
          summary_master: buildInitialSummary(task),
          key_facts: [
            task.client_name ? { label: "cliente", value: task.client_name } : null,
            task.process_number ? { label: "processo", value: task.process_number } : null,
          ].filter(Boolean),
          missing_documents: ["Documentos do Cliente", "Inicial", "Peças processuais relevantes"],
        },
        { onConflict: "process_task_id" }
      );

    if (memoryError) {
      throw memoryError;
    }

    return NextResponse.json({
      success: true,
      alreadyExists: Boolean(task.drive_link && task.drive_structure_ready),
      folder: {
        id: folderId,
        name: folderName,
        webViewLink: folderUrl,
      },
      folderStructure,
      task: updatedTask,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error?.message || "Erro ao criar pasta automática no Google Drive." },
      { status: 500 }
    );
  }
}
