import { NextRequest, NextResponse } from "next/server";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildGoogleDriveFolderUrl,
  DEFAULT_PROCESS_DOCUMENT_FOLDERS,
  isGoogleDriveFolder,
  listGoogleDriveChildren,
  type GoogleDriveFolderStructure,
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
};

type ProcessDocumentMemoryRecord = {
  folder_structure?: GoogleDriveFolderStructure | null;
  summary_master?: string | null;
  key_facts?: unknown;
};

type SyncedDocument = {
  id: string;
  name: string;
  folderName: string;
  url: string | null;
  modifiedTime: string | null;
  mimeType: string | null;
};

function normalizeFolderStructure(value: unknown): GoogleDriveFolderStructure {
  if (!value || typeof value !== "object") return {};
  return value as GoogleDriveFolderStructure;
}

function buildSummary(task: ProcessTaskRecord, documents: SyncedDocument[], missingDocuments: string[]) {
  const headline = [task.client_name, task.process_number, task.title].filter(Boolean).join(" | ");
  const latestDocument = documents[0]?.name ? `Último documento: ${documents[0].name}.` : "Nenhum documento sincronizado ainda.";
  const pendencias = missingDocuments.length
    ? `Pendências documentais: ${missingDocuments.join(", ")}.`
    : "Estrutura documental essencial preenchida.";

  return [headline || "Processo sem identificação consolidada", latestDocument, pendencias]
    .filter(Boolean)
    .join(" ");
}

export async function POST(_request: NextRequest, { params }: { params: { taskId: string } }) {
  try {
    const { tenantId } = await getTenantSession();
    const taskId = String(params?.taskId || "").trim();

    if (!taskId) {
      return NextResponse.json({ error: "Processo inválido para sincronização." }, { status: 400 });
    }

    const { data: task, error: taskError } = await supabaseAdmin
      .from("process_tasks")
      .select("id, tenant_id, stage_id, title, client_name, process_number, drive_link, drive_folder_id")
      .eq("id", taskId)
      .eq("tenant_id", tenantId)
      .maybeSingle<ProcessTaskRecord>();

    if (taskError) {
      throw taskError;
    }

    if (!task || !task.drive_folder_id) {
      return NextResponse.json({ error: "Crie a estrutura documental do processo antes de sincronizar." }, { status: 400 });
    }

    const driveContext = await getTenantGoogleDriveContext(_request, tenantId);

    const { data: memory } = await supabaseAdmin
      .from("process_document_memory")
      .select("folder_structure, summary_master, key_facts")
      .eq("process_task_id", task.id)
      .maybeSingle<ProcessDocumentMemoryRecord>();

    const rootChildren = await listGoogleDriveChildren(driveContext.accessToken, task.drive_folder_id);
    const existingStructure = normalizeFolderStructure(memory?.folder_structure);

    const structure: GoogleDriveFolderStructure = { ...existingStructure };
    for (const child of rootChildren) {
      if (!isGoogleDriveFolder(child) || !child.name) continue;
      structure[child.name] = {
        id: child.id,
        name: child.name,
        webViewLink: child.webViewLink || buildGoogleDriveFolderUrl(child.id),
      };
    }

    const rootLooseFiles: SyncedDocument[] = rootChildren
      .filter((item) => !isGoogleDriveFolder(item))
      .map((item) => ({
        id: item.id,
        name: item.name || "Documento sem nome",
        folderName: "Raiz do Processo",
        url: item.webViewLink || null,
        modifiedTime: item.modifiedTime || null,
        mimeType: item.mimeType || null,
      }));

    const folderDocuments = await Promise.all(
      Object.values(structure).map(async (folder) => {
        const children = await listGoogleDriveChildren(driveContext.accessToken, folder.id);
        return children
          .filter((item) => !isGoogleDriveFolder(item))
          .map<SyncedDocument>((item) => ({
            id: item.id,
            name: item.name || "Documento sem nome",
            folderName: folder.name,
            url: item.webViewLink || null,
            modifiedTime: item.modifiedTime || null,
            mimeType: item.mimeType || null,
          }));
      })
    );

    const documents = [...rootLooseFiles, ...folderDocuments.flat()].sort((a, b) => {
      return new Date(b.modifiedTime || 0).getTime() - new Date(a.modifiedTime || 0).getTime();
    });

    const requiredFolders = [
      "01-Documentos do Cliente",
      "02-Inicial",
      "03-Contestacao",
    ];

    const missingDocuments = requiredFolders.filter((folderName) => {
      return !documents.some((document) => document.folderName === folderName);
    });

    const summaryMaster = buildSummary(task, documents, missingDocuments);
    const keyDocuments = documents.slice(0, 8).map((document) => ({
      id: document.id,
      name: document.name,
      folder: document.folderName,
      url: document.url,
      modified_at: document.modifiedTime,
      mime_type: document.mimeType,
    }));

    const { data: updatedMemory, error: memoryError } = await supabaseAdmin
      .from("process_document_memory")
      .upsert(
        {
          tenant_id: tenantId,
          process_task_id: task.id,
          drive_folder_id: task.drive_folder_id,
          drive_folder_url: task.drive_link || buildGoogleDriveFolderUrl(task.drive_folder_id),
          drive_folder_name: task.title,
          folder_structure: structure,
          document_count: documents.length,
          sync_status: "synced",
          last_synced_at: new Date().toISOString(),
          summary_master: summaryMaster,
          key_documents: keyDocuments,
          missing_documents: missingDocuments,
          current_phase: task.stage_id || null,
          key_facts: memory?.key_facts || [],
        },
        { onConflict: "process_task_id" }
      )
      .select()
      .single();

    if (memoryError) {
      throw memoryError;
    }

    return NextResponse.json({
      success: true,
      memory: updatedMemory,
      documents,
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    if (error.message === "GoogleDriveDisconnected" || error.message === "GoogleDriveNotConfigured") {
      return NextResponse.json({ error: "Google Drive não conectado para este escritório." }, { status: 400 });
    }

    return NextResponse.json(
      { error: error?.message || "Erro ao sincronizar documentos do processo." },
      { status: 500 }
    );
  }
}
