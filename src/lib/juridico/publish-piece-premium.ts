import { supabaseAdmin } from "@/lib/supabase/admin";
import { exportLegalPieceToDocx, type ExportLegalPieceParams } from "@/lib/juridico/export-piece-docx";
import { exportLegalPieceToPdf } from "@/lib/juridico/export-piece-pdf";
import { getProcessDraftVersionById, loadDraftLearningLoopDelta, type DraftLearningLoopDelta } from "@/lib/lex/draft-versions";
import { uploadGoogleDriveFile, type GoogleDriveFolderStructure, buildGoogleDriveFolderUrl } from "@/lib/services/google-drive";

type ProcessTaskExportRecord = {
  id: string;
  title: string;
  client_name: string | null;
  process_number: string | null;
  drive_link: string | null;
  drive_folder_id: string | null;
};

type TenantLegalProfileExportRecord = {
  office_display_name?: string | null;
  default_font_family?: string | null;
  body_font_size?: number | null;
  title_font_size?: number | null;
  paragraph_spacing?: number | null;
  line_spacing?: number | null;
  text_alignment?: string | null;
  margin_top?: number | null;
  margin_right?: number | null;
  margin_bottom?: number | null;
  margin_left?: number | null;
  signature_block?: string | null;
  use_page_numbers?: boolean | null;
  use_header?: boolean | null;
  use_footer?: boolean | null;
};

type TenantLegalTemplateExportRecord = {
  piece_type: string;
  template_name?: string | null;
  template_mode?: string | null;
  template_docx_url?: string | null;
  structure_markdown?: string | null;
  guidance_notes?: string | null;
};

type TenantLegalAssetExportRecord = {
  asset_type: string;
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
};

type ProcessDocumentMemoryExportRecord = {
  folder_structure?: GoogleDriveFolderStructure | null;
};

type ProcessDraftVersionMetadataRecord = {
  metadata?: Record<string, unknown> | null;
};

export type LegalPieceExportFormat = "docx" | "pdf";

export type PremiumPublishedArtifact = {
  format: "pdf";
  fileName: string;
  mimeType: "application/pdf";
  driveFileId: string;
  webViewLink: string | null;
  modifiedAt: string | null;
  driveFolderId: string | null;
  driveFolderLabel: string;
  driveFolderUrl: string | null;
  publishedAt: string;
};

export type PremiumPublicationLearningLoopCapture = DraftLearningLoopDelta;

type LoadedLegalPieceExportBundle = {
  task: ProcessTaskExportRecord;
  profile: TenantLegalProfileExportRecord | null;
  template: TenantLegalTemplateExportRecord | null;
  assets: TenantLegalAssetExportRecord[];
  folderStructure: GoogleDriveFolderStructure;
};

function sanitizeFileName(value: string) {
  return String(value || "peca-juridica")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "peca-juridica";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildExportFileName(format: LegalPieceExportFormat, pieceType: string, processTitle: string) {
  return `${sanitizeFileName(pieceType)}-${sanitizeFileName(processTitle || "processo")}.${format}`;
}

function buildDriveTargetFolder(bundle: LoadedLegalPieceExportBundle) {
  const premiumFolder = bundle.folderStructure?.["09-Pecas Finais"];
  return {
    id: premiumFolder?.id || bundle.task.drive_folder_id || null,
    label: premiumFolder?.name || "09-Pecas Finais",
    url: premiumFolder?.webViewLink || (bundle.task.drive_folder_id ? buildGoogleDriveFolderUrl(bundle.task.drive_folder_id) : bundle.task.drive_link),
  };
}

function toArrayBuffer(value: ArrayBuffer | Buffer) {
  if (value instanceof ArrayBuffer) {
    return value;
  }

  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function mapBundleToExportParams(bundle: LoadedLegalPieceExportBundle, pieceType: string, pieceLabel: string, draftMarkdown: string): ExportLegalPieceParams {
  return {
    pieceLabel,
    pieceType,
    processTitle: String(bundle.task.title || "Processo sem titulo"),
    processNumber: bundle.task.process_number || null,
    clientName: bundle.task.client_name || null,
    draftMarkdown,
    profile: bundle.profile || null,
    template: bundle.template || null,
    assets: bundle.assets || [],
  };
}

export async function loadLegalPieceExportBundle(params: {
  tenantId: string;
  taskId: string;
  pieceType: string;
}) {
  const [taskRes, profileRes, templateRes, assetsRes, memoryRes] = await Promise.all([
    supabaseAdmin
      .from("process_tasks")
      .select("id, title, client_name, process_number, drive_link, drive_folder_id")
      .eq("id", params.taskId)
      .eq("tenant_id", params.tenantId)
      .maybeSingle<ProcessTaskExportRecord>(),
    supabaseAdmin
      .from("tenant_legal_profiles")
      .select("office_display_name, default_font_family, body_font_size, title_font_size, paragraph_spacing, line_spacing, text_alignment, margin_top, margin_right, margin_bottom, margin_left, signature_block, use_page_numbers, use_header, use_footer")
      .eq("tenant_id", params.tenantId)
      .maybeSingle<TenantLegalProfileExportRecord>(),
    supabaseAdmin
      .from("tenant_legal_templates")
      .select("piece_type, template_name, template_mode, template_docx_url, structure_markdown, guidance_notes")
      .eq("tenant_id", params.tenantId)
      .eq("piece_type", params.pieceType)
      .eq("is_active", true)
      .maybeSingle<TenantLegalTemplateExportRecord>(),
    supabaseAdmin
      .from("tenant_legal_assets")
      .select("asset_type, file_url, file_name, mime_type")
      .eq("tenant_id", params.tenantId)
      .eq("is_active", true)
      .returns<TenantLegalAssetExportRecord[]>(),
    supabaseAdmin
      .from("process_document_memory")
      .select("folder_structure")
      .eq("process_task_id", params.taskId)
      .maybeSingle<ProcessDocumentMemoryExportRecord>(),
  ]);

  if (taskRes.error) throw taskRes.error;
  if (profileRes.error) throw profileRes.error;
  if (templateRes.error) throw templateRes.error;
  if (assetsRes.error) throw assetsRes.error;
  if (memoryRes.error) throw memoryRes.error;
  if (!taskRes.data) {
    throw new Error("Processo nao encontrado.");
  }

  return {
    task: taskRes.data,
    profile: profileRes.data || null,
    template: templateRes.data || null,
    assets: assetsRes.data || [],
    folderStructure: memoryRes.data?.folder_structure || {},
  } satisfies LoadedLegalPieceExportBundle;
}

export async function exportLegalPieceBinary(params: {
  tenantId: string;
  taskId: string;
  pieceType: string;
  pieceLabel: string;
  draftMarkdown: string;
  format: LegalPieceExportFormat;
}) {
  const bundle = await loadLegalPieceExportBundle({
    tenantId: params.tenantId,
    taskId: params.taskId,
    pieceType: params.pieceType,
  });
  const exportParams = mapBundleToExportParams(bundle, params.pieceType, params.pieceLabel, params.draftMarkdown);
  const buffer = params.format === "pdf"
    ? await exportLegalPieceToPdf(exportParams)
    : await exportLegalPieceToDocx(exportParams);
  const fileName = buildExportFileName(params.format, params.pieceType, bundle.task.title || "processo");
  const mimeType = params.format === "pdf"
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  return {
    buffer,
    fileName,
    mimeType,
    bundle,
  };
}

export async function recordPremiumPublicationOnDraftVersion(params: {
  tenantId: string;
  versionId: string;
  publication: PremiumPublishedArtifact;
  learningLoopCapture?: PremiumPublicationLearningLoopCapture | null;
}) {
  const { data: version, error: versionError } = await supabaseAdmin
    .from("process_draft_versions")
    .select("metadata")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.versionId)
    .maybeSingle<ProcessDraftVersionMetadataRecord>();

  if (versionError) throw versionError;
  const metadata = isRecord(version?.metadata) ? version.metadata : {};
  const nextMetadata = {
    ...metadata,
    premium_publish: {
      ...params.publication,
    },
    learning_loop_capture: params.learningLoopCapture || metadata.learning_loop_capture || null,
  } satisfies Record<string, unknown>;

  const { error: updateError } = await supabaseAdmin
    .from("process_draft_versions")
    .update({ metadata: nextMetadata })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.versionId);

  if (updateError) throw updateError;
}

export async function publishLegalPiecePremium(params: {
  tenantId: string;
  taskId: string;
  accessToken: string;
  pieceType: string;
  pieceLabel: string;
  draftMarkdown: string;
  versionId?: string | null;
}) {
  const version = params.versionId
    ? await getProcessDraftVersionById({
      tenantId: params.tenantId,
      versionId: params.versionId,
    })
    : null;
  const learningLoopCapture = version
    ? await loadDraftLearningLoopDelta({
      tenantId: params.tenantId,
      version,
    })
    : null;
  const exported = await exportLegalPieceBinary({
    tenantId: params.tenantId,
    taskId: params.taskId,
    pieceType: params.pieceType,
    pieceLabel: params.pieceLabel,
    draftMarkdown: params.draftMarkdown,
    format: "pdf",
  });
  const driveTarget = buildDriveTargetFolder(exported.bundle);

  if (!driveTarget.id) {
    throw new Error("Crie a estrutura documental do processo antes de publicar o artifact premium.");
  }

  const uploadedFile = await uploadGoogleDriveFile(params.accessToken, {
    name: exported.fileName,
    mimeType: exported.mimeType,
    bytes: toArrayBuffer(exported.buffer as ArrayBuffer | Buffer),
    parentFolderId: driveTarget.id,
  });

  const publication = {
    format: "pdf",
    fileName: uploadedFile.name || exported.fileName,
    mimeType: "application/pdf",
    driveFileId: uploadedFile.id,
    webViewLink: uploadedFile.webViewLink || null,
    modifiedAt: uploadedFile.modifiedTime || null,
    driveFolderId: driveTarget.id,
    driveFolderLabel: driveTarget.label,
    driveFolderUrl: driveTarget.url || null,
    publishedAt: new Date().toISOString(),
  } satisfies PremiumPublishedArtifact;

  if (params.versionId) {
    await recordPremiumPublicationOnDraftVersion({
      tenantId: params.tenantId,
      versionId: params.versionId,
      publication,
      learningLoopCapture,
    });
  }

  return {
    publication,
    learningLoopCapture,
    uploadedFile,
    task: exported.bundle.task,
  };
}
