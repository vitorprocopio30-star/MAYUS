import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  buildGoogleDriveFolderUrl,
  downloadGoogleDriveFile,
  isGoogleDriveFolder,
  listGoogleDriveChildren,
  type GoogleDriveFolderStructure,
} from "@/lib/services/google-drive";

export type ProcessTaskDocumentContext = {
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

type ExtractedContent = {
  rawText: string | null;
  normalizedText: string | null;
  excerpt: string | null;
  pageCount: number | null;
  extractionStatus: "extracted" | "skipped" | "error";
  extractionError: string | null;
};

type ExistingProcessDocumentRecord = {
  id: string;
  drive_file_id: string;
  extraction_status?: "extracted" | "skipped" | "error" | "pending" | null;
};

export type ProcessDocumentSyncWarning = {
  stage: "download" | "extract" | "index";
  fileName: string;
  message: string;
};

export type SyncedProcessDocument = {
  driveFileId: string;
  driveFolderId: string | null;
  folderLabel: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  modifiedAt: string | null;
  webViewLink: string | null;
  documentType: string;
  classificationStatus: "classified" | "folder_inferred" | "pending";
  extractionStatus: "extracted" | "skipped" | "error";
  excerpt: string | null;
};

export type SyncProcessDocumentsResult = {
  memory: unknown;
  documents: SyncedProcessDocument[];
  structure: GoogleDriveFolderStructure;
  warnings: ProcessDocumentSyncWarning[];
};

const FOLDER_DOCUMENT_TYPE_MAP: Record<string, string> = {
  "01-Documentos do Cliente": "documento_cliente",
  "02-Inicial": "inicial",
  "03-Contestacao": "contestacao",
  "04-Manifestacoes": "manifestacao",
  "05-Decisoes e Sentencas": "decisao_sentenca",
  "06-Provas": "prova",
  "07-Prazos e Audiencias": "prazo_audiencia",
  "08-Recursos": "recurso",
  "09-Pecas Finais": "peca_final",
  "Raiz do Processo": "geral",
};

function normalizeFolderStructure(value: unknown): GoogleDriveFolderStructure {
  if (!value || typeof value !== "object") return {};
  return value as GoogleDriveFolderStructure;
}

function normalizeText(text: string | null | undefined) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getFileExtension(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() || "" : "";
}

function inferDocumentType(folderLabel: string, name: string, textSample?: string | null) {
  const folderType = FOLDER_DOCUMENT_TYPE_MAP[folderLabel];
  const target = normalizeText(`${name} ${textSample || ""}`).toLowerCase();

  if (/(replica|réplica)/.test(target)) return "replica";
  if (/(contestacao|contestação)/.test(target)) return "contestacao";
  if (/(inicial|peti[cç][aã]o inicial)/.test(target)) return "inicial";
  if (/(sentenca|sentença)/.test(target)) return "sentenca";
  if (/(decisao|decisão|liminar)/.test(target)) return "decisao";
  if (/(recurso|apela[cç][aã]o|agravo|embargos)/.test(target)) return "recurso";
  if (/(prova|laudo|documento pessoal|contrato|procura[cç][aã]o|rg|cpf)/.test(target)) return folderType === "manifestacao" ? "manifestacao" : "documento_cliente";

  return folderType || "geral";
}

async function extractDocumentText(name: string, mimeType: string | null, bytes: Uint8Array): Promise<ExtractedContent> {
  const extension = getFileExtension(name);

  try {
    if ((mimeType || "").startsWith("text/") || ["txt", "md", "csv"].includes(extension)) {
      const rawText = new TextDecoder("utf-8").decode(bytes);
      const normalizedText = normalizeText(rawText);
      return {
        rawText,
        normalizedText,
        excerpt: normalizedText.slice(0, 500) || null,
        pageCount: null,
        extractionStatus: "extracted",
        extractionError: null,
      };
    }

    if ((mimeType || "") === "application/pdf" || extension === "pdf") {
      const pdfParseModule = await import("pdf-parse");
      const pdfParse = (pdfParseModule as any).default || pdfParseModule;
      const parsed = await pdfParse(Buffer.from(bytes));
      const rawText = String(parsed?.text || "");
      const normalizedText = normalizeText(rawText);
      return {
        rawText,
        normalizedText,
        excerpt: normalizedText.slice(0, 500) || null,
        pageCount: Number(parsed?.numpages || 0) || null,
        extractionStatus: normalizedText ? "extracted" : "skipped",
        extractionError: normalizedText ? null : "PDF sem texto legível extraído.",
      };
    }

    if (
      (mimeType || "") === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      || extension === "docx"
    ) {
      const mammothModule = await import("mammoth");
      const mammoth = (mammothModule as any).default || mammothModule;
      const parsed = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      const rawText = String(parsed?.value || "");
      const normalizedText = normalizeText(rawText);
      return {
        rawText,
        normalizedText,
        excerpt: normalizedText.slice(0, 500) || null,
        pageCount: null,
        extractionStatus: normalizedText ? "extracted" : "skipped",
        extractionError: normalizedText ? null : "DOCX sem texto legível extraído.",
      };
    }

    return {
      rawText: null,
      normalizedText: null,
      excerpt: null,
      pageCount: null,
      extractionStatus: "skipped",
      extractionError: null,
    };
  } catch (error: any) {
    return {
      rawText: null,
      normalizedText: null,
      excerpt: null,
      pageCount: null,
      extractionStatus: "error",
      extractionError: error?.message || "Falha ao extrair texto do documento.",
    };
  }
}

function shouldAttemptExtraction(name: string, mimeType: string | null) {
  const extension = getFileExtension(name);

  if ((mimeType || "").startsWith("application/vnd.google-apps")) {
    return false;
  }

  if ((mimeType || "").startsWith("text/")) {
    return true;
  }

  if (
    (mimeType || "") === "application/pdf"
    || (mimeType || "") === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return true;
  }

  return ["txt", "md", "csv", "pdf", "docx"].includes(extension);
}

async function tryExtractProcessDocument(params: {
  accessToken: string;
  driveFileId: string;
  name: string;
  mimeType: string | null;
}): Promise<ExtractedContent> {
  if (!shouldAttemptExtraction(params.name, params.mimeType)) {
    return {
      rawText: null,
      normalizedText: null,
      excerpt: null,
      pageCount: null,
      extractionStatus: "skipped",
      extractionError: null,
    };
  }

  try {
    const bytes = await downloadGoogleDriveFile(params.accessToken, params.driveFileId);
    return await extractDocumentText(params.name, params.mimeType, bytes);
  } catch (error: any) {
    return {
      rawText: null,
      normalizedText: null,
      excerpt: null,
      pageCount: null,
      extractionStatus: "error",
      extractionError: error?.message || "Falha ao baixar ou extrair o documento.",
    };
  }
}

function buildSummary(task: ProcessTaskDocumentContext, documents: SyncedProcessDocument[], missingDocuments: string[]) {
  const headline = [task.client_name, task.process_number, task.title].filter(Boolean).join(" | ");
  const latestDocument = documents[0]?.name ? `Último documento: ${documents[0].name}.` : "Nenhum documento sincronizado ainda.";
  const tipos = Array.from(new Set(documents.map((document) => document.documentType))).filter(Boolean);
  const tiposLabel = tipos.length ? `Tipos já detectados: ${tipos.join(", ")}.` : null;
  const pendencias = missingDocuments.length
    ? `Pendências documentais: ${missingDocuments.join(", ")}.`
    : "Estrutura documental essencial preenchida.";

  return [headline || "Processo sem identificação consolidada", latestDocument, tiposLabel, pendencias]
    .filter(Boolean)
    .join(" ");
}

export async function syncProcessDocuments(params: {
  tenantId: string;
  accessToken: string;
  task: ProcessTaskDocumentContext;
}): Promise<SyncProcessDocumentsResult> {
  const { tenantId, accessToken, task } = params;

  if (!task.drive_folder_id) {
    throw new Error("Crie a estrutura documental do processo antes de sincronizar.");
  }

  const { data: memory } = await supabaseAdmin
    .from("process_document_memory")
    .select("folder_structure, summary_master, key_facts")
    .eq("process_task_id", task.id)
    .maybeSingle<ProcessDocumentMemoryRecord>();

  const rootChildren = await listGoogleDriveChildren(accessToken, task.drive_folder_id);
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

  const candidateFiles = [
    ...rootChildren
      .filter((item) => !isGoogleDriveFolder(item))
      .map((item) => ({
        driveFileId: item.id,
        driveFolderId: task.drive_folder_id || null,
        folderLabel: "Raiz do Processo",
        name: item.name || "Documento sem nome",
        mimeType: item.mimeType || null,
        sizeBytes: item.size ? Number(item.size) : null,
        modifiedAt: item.modifiedTime || null,
        webViewLink: item.webViewLink || null,
      })),
    ...(await Promise.all(
      Object.values(structure).map(async (folder) => {
        const children = await listGoogleDriveChildren(accessToken, folder.id);
        return children
          .filter((item) => !isGoogleDriveFolder(item))
          .map((item) => ({
            driveFileId: item.id,
            driveFolderId: folder.id,
            folderLabel: folder.name,
            name: item.name || "Documento sem nome",
            mimeType: item.mimeType || null,
            sizeBytes: item.size ? Number(item.size) : null,
            modifiedAt: item.modifiedTime || null,
            webViewLink: item.webViewLink || null,
          }));
      })
    )).flat(),
  ];

  const { data: existingDocuments, error: existingDocumentsError } = await supabaseAdmin
    .from("process_documents")
    .select("id, drive_file_id, extraction_status")
    .eq("process_task_id", task.id);

  if (existingDocumentsError) {
    throw existingDocumentsError;
  }

  const existingDocumentsByDriveId = new Map(
    ((existingDocuments || []) as ExistingProcessDocumentRecord[]).map((document) => [document.drive_file_id, document])
  );

  const documents: SyncedProcessDocument[] = [];
  const warnings: ProcessDocumentSyncWarning[] = [];

  for (const file of candidateFiles) {
    const existingDocument = existingDocumentsByDriveId.get(file.driveFileId);
    const extracted = await tryExtractProcessDocument({
      accessToken,
      driveFileId: file.driveFileId,
      name: file.name,
      mimeType: file.mimeType,
    });

    const documentType = inferDocumentType(file.folderLabel, file.name, extracted.normalizedText);
    const classificationStatus: SyncedProcessDocument["classificationStatus"] = FOLDER_DOCUMENT_TYPE_MAP[file.folderLabel]
      ? "folder_inferred"
      : documentType !== "geral"
        ? "classified"
        : "pending";

    const extractionStatus = extracted.extractionStatus === "skipped" && existingDocument?.extraction_status === "extracted"
      ? "extracted"
      : extracted.extractionStatus;

    const { data: upsertedDocument, error: documentError } = await supabaseAdmin
      .from("process_documents")
      .upsert(
        {
          tenant_id: tenantId,
          process_task_id: task.id,
          drive_file_id: file.driveFileId,
          drive_folder_id: file.driveFolderId,
          folder_label: file.folderLabel,
          name: file.name,
          mime_type: file.mimeType,
          size_bytes: file.sizeBytes,
          modified_at: file.modifiedAt,
          web_view_link: file.webViewLink,
          document_type: documentType,
          classification_status: classificationStatus,
          extraction_status: extractionStatus,
        },
        { onConflict: "drive_file_id" }
      )
      .select("id")
      .single();

    if (documentError) {
      throw documentError;
    }

    const { error: contentError } = await supabaseAdmin
      .from("process_document_contents")
      .upsert(
        {
          tenant_id: tenantId,
          process_document_id: upsertedDocument.id,
          raw_text: extracted.rawText,
          normalized_text: extracted.normalizedText,
          excerpt: extracted.excerpt,
          page_count: extracted.pageCount,
          extraction_status: extractionStatus,
          extracted_at: extracted.extractionStatus === "extracted" ? new Date().toISOString() : null,
          extraction_error: extracted.extractionError,
        },
        { onConflict: "process_document_id" }
      );

    if (contentError) {
      warnings.push({
        stage: "index",
        fileName: file.name,
        message: contentError.message,
      });
    }

    if (extracted.extractionStatus === "error" && extracted.extractionError) {
      warnings.push({
        stage: "extract",
        fileName: file.name,
        message: extracted.extractionError,
      });
    }

    documents.push({
      ...file,
      documentType,
      classificationStatus,
      extractionStatus,
      excerpt: extracted.excerpt,
    });
  }

  const currentDriveIds = new Set(documents.map((document) => document.driveFileId));
  const staleDocumentIds = (existingDocuments || [])
    .filter((document) => !currentDriveIds.has(document.drive_file_id))
    .map((document) => document.id);

  if (staleDocumentIds.length > 0) {
    const { error: deleteError } = await supabaseAdmin
      .from("process_documents")
      .delete()
      .in("id", staleDocumentIds);

    if (deleteError) {
      throw deleteError;
    }
  }

  const missingDocuments = [
    "01-Documentos do Cliente",
    "02-Inicial",
    "03-Contestacao",
  ].filter((folderLabel) => !documents.some((document) => document.folderLabel === folderLabel));

  const summaryMaster = buildSummary(task, documents, missingDocuments);
  const keyDocuments = documents.slice(0, 8).map((document) => ({
    id: document.driveFileId,
    name: document.name,
    folder: document.folderLabel,
    url: document.webViewLink,
    modified_at: document.modifiedAt,
    mime_type: document.mimeType,
    document_type: document.documentType,
    extraction_status: document.extractionStatus,
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

  documents.sort((a, b) => new Date(b.modifiedAt || 0).getTime() - new Date(a.modifiedAt || 0).getTime());

  return {
    memory: updatedMemory,
    documents,
    structure,
    warnings,
  };
}
