import { createBrainArtifact } from "@/lib/brain/artifacts";
import { supabaseAdmin } from "@/lib/supabase/admin";

type EvidenceSupabase = typeof supabaseAdmin;

export type DocumentEvidencePackProcess = {
  id: string;
  title: string;
  clientName: string | null;
  processNumber: string | null;
  driveLink: string | null;
  driveFolderId: string | null;
};

export type DocumentEvidencePackDocument = {
  id: string;
  driveFileId: string | null;
  name: string;
  documentType: string | null;
  folderLabel: string | null;
  webViewLink: string | null;
  modifiedAt: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  classificationStatus: string | null;
  extractionStatus: string | null;
  extractionError: string | null;
  excerpt: string | null;
  pageCount: number | null;
  textAvailable: boolean;
  relevanceScore: number;
  relevanceReasons: string[];
};

export type DocumentEvidencePackGap = {
  code: "missing_document" | "no_text" | "no_drive_link" | "outside_structure" | "memory_missing" | "memory_stale";
  severity: "high" | "medium" | "low";
  label: string;
  documentId?: string | null;
};

export type DocumentEvidencePackRisk = {
  code: "probable_duplicate" | "low_document_coverage" | "stale_memory" | "unextracted_sources";
  severity: "high" | "medium" | "low";
  title: string;
  reason: string;
  documentIds?: string[];
};

export type DocumentEvidencePack = {
  artifactId?: string | null;
  generatedAt: string;
  process: DocumentEvidencePackProcess;
  documentMemory: {
    freshness: "fresh" | "stale" | "missing";
    documentCount: number;
    syncStatus: string | null;
    lastSyncedAt: string | null;
    summaryMaster: string | null;
    missingDocuments: string[];
  };
  documents: DocumentEvidencePackDocument[];
  factBasis: DocumentEvidencePackDocument[];
  gaps: DocumentEvidencePackGap[];
  risks: DocumentEvidencePackRisk[];
  citationChecklist: {
    readyForFactCitations: boolean;
    pendingValidations: string[];
    factCitationBasis: string[];
  };
  summary: string;
};

type ProcessTaskEvidenceRow = {
  id: string;
  title: string;
  client_name?: string | null;
  process_number?: string | null;
  drive_link?: string | null;
  drive_folder_id?: string | null;
};

type ProcessDocumentMemoryEvidenceRow = {
  document_count?: number | null;
  sync_status?: string | null;
  last_synced_at?: string | null;
  summary_master?: string | null;
  missing_documents?: unknown;
  key_documents?: unknown;
  case_brain_task_id?: string | null;
};

type ProcessDocumentEvidenceRow = {
  id: string;
  drive_file_id?: string | null;
  name: string;
  document_type?: string | null;
  folder_label?: string | null;
  web_view_link?: string | null;
  modified_at?: string | null;
  mime_type?: string | null;
  size_bytes?: number | string | null;
  classification_status?: string | null;
  extraction_status?: string | null;
};

type ProcessDocumentContentEvidenceRow = {
  process_document_id: string;
  normalized_text?: string | null;
  excerpt?: string | null;
  extraction_status?: string | null;
  extraction_error?: string | null;
  page_count?: number | null;
};

function normalizeString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => normalizeString(item)).filter(Boolean);
}

function getNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeDocumentName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.[a-z0-9]{1,8}$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getMemoryFreshness(lastSyncedAt?: string | null) {
  if (!lastSyncedAt) return "missing" as const;
  const syncedAt = new Date(lastSyncedAt).getTime();
  if (!Number.isFinite(syncedAt)) return "missing" as const;
  const days = (Date.now() - syncedAt) / (1000 * 60 * 60 * 24);
  return days > 7 ? "stale" as const : "fresh" as const;
}

function extractKeyDocumentIds(value: unknown) {
  if (!Array.isArray(value)) return new Set<string>();
  return new Set(
    value
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          return normalizeString(record.id) || normalizeString(record.driveFileId) || normalizeString(record.drive_file_id);
        }
        return "";
      })
      .filter(Boolean)
  );
}

function scoreDocument(params: {
  document: ProcessDocumentEvidenceRow;
  content: ProcessDocumentContentEvidenceRow | null;
  keyDocumentIds: Set<string>;
}) {
  const reasons: string[] = [];
  let score = 0;
  const type = normalizeString(params.document.document_type);
  const extractionStatus = normalizeString(params.content?.extraction_status || params.document.extraction_status);

  if (params.keyDocumentIds.has(params.document.id) || (params.document.drive_file_id && params.keyDocumentIds.has(params.document.drive_file_id))) {
    score += 30;
    reasons.push("documento-chave da memoria documental");
  }

  if (extractionStatus === "extracted" && normalizeString(params.content?.normalized_text || params.content?.excerpt)) {
    score += 30;
    reasons.push("texto extraido para citacao factual");
  }

  if (["inicial", "contestacao", "replica", "prova", "documento_cliente", "sentenca", "decisao", "recurso", "manifestacao"].includes(type)) {
    score += 20;
    reasons.push(`tipo documental relevante: ${type}`);
  }

  if (params.document.web_view_link) {
    score += 10;
    reasons.push("link do Drive disponivel");
  }

  if (params.document.modified_at) {
    score += 5;
    reasons.push("data de modificacao conhecida");
  }

  if (extractionStatus === "error") {
    score -= 20;
    reasons.push("extracao falhou");
  }

  return { score: Math.max(score, 0), reasons };
}

function buildDuplicateRisks(documents: DocumentEvidencePackDocument[]) {
  const groups = new Map<string, DocumentEvidencePackDocument[]>();
  for (const document of documents) {
    const key = `${normalizeDocumentName(document.name)}:${document.sizeBytes || "unknown"}`;
    if (!normalizeDocumentName(document.name)) continue;
    const current = groups.get(key) || [];
    current.push(document);
    groups.set(key, current);
  }

  return Array.from(groups.values())
    .filter((items) => items.length > 1)
    .map((items) => ({
      code: "probable_duplicate" as const,
      severity: "medium" as const,
      title: "Duplicidade documental provavel",
      reason: `${items.length} arquivos parecem repetir o mesmo documento pelo nome e tamanho.`,
      documentIds: items.map((item) => item.id),
    }));
}

export function buildDocumentEvidencePackFromRows(params: {
  process: ProcessTaskEvidenceRow;
  memory: ProcessDocumentMemoryEvidenceRow | null;
  documents: ProcessDocumentEvidenceRow[];
  contents: ProcessDocumentContentEvidenceRow[];
  generatedAt?: string;
}): DocumentEvidencePack {
  const generatedAt = params.generatedAt || new Date().toISOString();
  const contentsByDocumentId = new Map(params.contents.map((content) => [content.process_document_id, content]));
  const keyDocumentIds = extractKeyDocumentIds(params.memory?.key_documents);
  const missingDocuments = normalizeStringArray(params.memory?.missing_documents);
  const freshness = getMemoryFreshness(params.memory?.last_synced_at || null);

  const documents = params.documents
    .map((document) => {
      const content = contentsByDocumentId.get(document.id) || null;
      const extractionStatus = normalizeString(content?.extraction_status || document.extraction_status) || "pending";
      const excerpt = normalizeString(content?.excerpt) || normalizeString(content?.normalized_text).slice(0, 600) || null;
      const scored = scoreDocument({ document, content, keyDocumentIds });

      return {
        id: document.id,
        driveFileId: document.drive_file_id || null,
        name: document.name,
        documentType: document.document_type || null,
        folderLabel: document.folder_label || null,
        webViewLink: document.web_view_link || null,
        modifiedAt: document.modified_at || null,
        mimeType: document.mime_type || null,
        sizeBytes: document.size_bytes === null || document.size_bytes === undefined ? null : getNumber(document.size_bytes),
        classificationStatus: document.classification_status || null,
        extractionStatus,
        extractionError: content?.extraction_error || null,
        excerpt,
        pageCount: content?.page_count || null,
        textAvailable: extractionStatus === "extracted" && Boolean(excerpt),
        relevanceScore: scored.score,
        relevanceReasons: scored.reasons,
      } satisfies DocumentEvidencePackDocument;
    })
    .sort((left, right) => {
      if (right.relevanceScore !== left.relevanceScore) return right.relevanceScore - left.relevanceScore;
      return new Date(right.modifiedAt || 0).getTime() - new Date(left.modifiedAt || 0).getTime();
    });

  const gaps: DocumentEvidencePackGap[] = [];
  for (const missing of missingDocuments) {
    gaps.push({ code: "missing_document", severity: "high", label: `Documento essencial ausente: ${missing}.` });
  }

  for (const document of documents) {
    if (!document.textAvailable) {
      gaps.push({ code: "no_text", severity: "medium", label: `Sem texto extraido: ${document.name}.`, documentId: document.id });
    }
    if (!document.webViewLink) {
      gaps.push({ code: "no_drive_link", severity: "low", label: `Sem link do Drive: ${document.name}.`, documentId: document.id });
    }
    if (!document.folderLabel || document.folderLabel === "Raiz do Processo") {
      gaps.push({ code: "outside_structure", severity: "medium", label: `Fora da estrutura final: ${document.name}.`, documentId: document.id });
    }
  }

  if (freshness === "missing") {
    gaps.push({ code: "memory_missing", severity: "high", label: "Memoria documental ainda nao foi sincronizada." });
  } else if (freshness === "stale") {
    gaps.push({ code: "memory_stale", severity: "medium", label: "Memoria documental pode estar desatualizada." });
  }

  const factBasis = documents
    .filter((document) => document.textAvailable && document.relevanceScore >= 30)
    .slice(0, 10);
  const risks: DocumentEvidencePackRisk[] = [
    ...buildDuplicateRisks(documents),
  ];

  if (documents.length < 2) {
    risks.push({
      code: "low_document_coverage",
      severity: "high",
      title: "Baixa cobertura documental",
      reason: "O processo tem poucos documentos sincronizados para sustentar peca verificavel.",
    });
  }

  if (freshness !== "fresh") {
    risks.push({
      code: "stale_memory",
      severity: freshness === "missing" ? "high" : "medium",
      title: "Memoria documental nao esta fresca",
      reason: freshness === "missing" ? "Nao ha sincronizacao documental confirmada." : "A ultima sincronizacao documental pode estar defasada.",
    });
  }

  const unextractedCount = documents.filter((document) => !document.textAvailable).length;
  if (unextractedCount > 0) {
    risks.push({
      code: "unextracted_sources",
      severity: unextractedCount >= documents.length ? "high" : "medium",
      title: "Fontes sem texto extraido",
      reason: `${unextractedCount} documento(s) nao tem texto extraido para citacao factual.`,
      documentIds: documents.filter((document) => !document.textAvailable).map((document) => document.id),
    });
  }

  const pendingValidations = [
    ...gaps.filter((gap) => gap.severity !== "low").map((gap) => gap.label),
    ...risks.filter((risk) => risk.severity !== "low").map((risk) => risk.title),
  ];
  const readyForFactCitations = factBasis.length > 0 && pendingValidations.length === 0;
  const summary = readyForFactCitations
    ? `Pacote documental pronto para citacoes factuais com ${factBasis.length} fonte(s) util(is).`
    : `Pacote documental exige revisao humana: ${pendingValidations.slice(0, 3).join("; ") || "fontes insuficientes"}.`;

  return {
    generatedAt,
    process: {
      id: params.process.id,
      title: params.process.title,
      clientName: params.process.client_name || null,
      processNumber: params.process.process_number || null,
      driveLink: params.process.drive_link || null,
      driveFolderId: params.process.drive_folder_id || null,
    },
    documentMemory: {
      freshness,
      documentCount: getNumber(params.memory?.document_count, documents.length),
      syncStatus: params.memory?.sync_status || null,
      lastSyncedAt: params.memory?.last_synced_at || null,
      summaryMaster: params.memory?.summary_master || null,
      missingDocuments,
    },
    documents,
    factBasis,
    gaps,
    risks,
    citationChecklist: {
      readyForFactCitations,
      pendingValidations: Array.from(new Set(pendingValidations)),
      factCitationBasis: factBasis.map((document) => `${document.name}${document.documentType ? ` (${document.documentType})` : ""}`),
    },
    summary,
  };
}

async function loadRows(params: { tenantId: string; processTaskId: string; supabase: EvidenceSupabase }) {
  const [{ data: process, error: processError }, { data: memory, error: memoryError }, { data: documents, error: documentsError }] = await Promise.all([
    params.supabase
      .from("process_tasks")
      .select("id, title, client_name, process_number, drive_link, drive_folder_id")
      .eq("tenant_id", params.tenantId)
      .eq("id", params.processTaskId)
      .maybeSingle<ProcessTaskEvidenceRow>(),
    params.supabase
      .from("process_document_memory")
      .select("document_count, sync_status, last_synced_at, summary_master, missing_documents, key_documents, case_brain_task_id")
      .eq("tenant_id", params.tenantId)
      .eq("process_task_id", params.processTaskId)
      .maybeSingle<ProcessDocumentMemoryEvidenceRow>(),
    params.supabase
      .from("process_documents")
      .select("id, drive_file_id, name, document_type, folder_label, web_view_link, modified_at, mime_type, size_bytes, classification_status, extraction_status")
      .eq("tenant_id", params.tenantId)
      .eq("process_task_id", params.processTaskId)
      .order("modified_at", { ascending: false }),
  ]);

  if (processError) throw processError;
  if (memoryError) throw memoryError;
  if (documentsError) throw documentsError;
  if (!process) throw new Error("Processo nao encontrado.");

  const documentIds = ((documents || []) as ProcessDocumentEvidenceRow[]).map((document) => document.id);
  const { data: contents, error: contentsError } = documentIds.length > 0
    ? await params.supabase
        .from("process_document_contents")
        .select("process_document_id, excerpt, extraction_status, extraction_error, page_count")
        .eq("tenant_id", params.tenantId)
        .in("process_document_id", documentIds)
    : { data: [], error: null };

  if (contentsError) throw contentsError;

  return {
    process,
    memory: memory || null,
    documents: (documents || []) as ProcessDocumentEvidenceRow[],
    contents: (contents || []) as ProcessDocumentContentEvidenceRow[],
  };
}

export async function buildDocumentEvidencePack(params: {
  tenantId: string;
  processTaskId: string;
  supabase?: EvidenceSupabase;
}) {
  const rows = await loadRows({
    tenantId: params.tenantId,
    processTaskId: params.processTaskId,
    supabase: params.supabase || supabaseAdmin,
  });

  return buildDocumentEvidencePackFromRows(rows);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export async function loadLatestDocumentEvidencePackArtifact(params: {
  tenantId: string;
  processTaskId: string;
  supabase?: EvidenceSupabase;
}) {
  const supabase = params.supabase || supabaseAdmin;
  const { data, error } = await supabase
    .from("brain_artifacts")
    .select("id, metadata, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("artifact_type", "document_evidence_pack")
    .eq("metadata->>process_task_id", params.processTaskId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; metadata: Record<string, unknown> | null; created_at: string }>();

  if (error) throw error;

  const evidencePack = isRecord(data?.metadata?.evidence_pack)
    ? data.metadata.evidence_pack as DocumentEvidencePack
    : null;

  if (!data?.id || !evidencePack) return null;

  return {
    artifactId: data.id,
    createdAt: data.created_at,
    pack: { ...evidencePack, artifactId: data.id },
  };
}

async function ensureEvidenceBrainTask(params: {
  tenantId: string;
  processTaskId: string;
  userId: string | null;
  preferredTaskId?: string | null;
  supabase: EvidenceSupabase;
}) {
  if (params.preferredTaskId) return params.preferredTaskId;

  const { data, error } = await params.supabase
    .from("brain_tasks")
    .insert({
      tenant_id: params.tenantId,
      created_by: params.userId,
      channel: "documentos",
      module: "documentos",
      status: "completed",
      title: "Pacote de evidencias documentais",
      goal: "Montar pacote verificavel de evidencias documentais do processo.",
      task_input: { process_task_id: params.processTaskId },
      task_context: { process_task_id: params.processTaskId, artifact_type: "document_evidence_pack" },
      result_summary: "Pacote de evidencias documentais gerado.",
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();

  if (error) throw error;
  return data.id;
}

export async function persistDocumentEvidencePack(params: {
  tenantId: string;
  processTaskId: string;
  userId: string | null;
  supabase?: EvidenceSupabase;
}) {
  const supabase = params.supabase || supabaseAdmin;
  const rows = await loadRows({ tenantId: params.tenantId, processTaskId: params.processTaskId, supabase });
  const pack = buildDocumentEvidencePackFromRows(rows);
  const taskId = await ensureEvidenceBrainTask({
    tenantId: params.tenantId,
    processTaskId: params.processTaskId,
    userId: params.userId,
    preferredTaskId: rows.memory?.case_brain_task_id || null,
    supabase,
  });

  const artifact = await createBrainArtifact({
    tenantId: params.tenantId,
    taskId,
    artifactType: "document_evidence_pack",
    title: `Evidence pack - ${pack.process.clientName || pack.process.title}`,
    sourceModule: "documentos",
    mimeType: "application/json",
    metadata: {
      process_task_id: params.processTaskId,
      generated_at: pack.generatedAt,
      summary: pack.summary,
      document_count: pack.documents.length,
      fact_basis_count: pack.factBasis.length,
      ready_for_fact_citations: pack.citationChecklist.readyForFactCitations,
      evidence_pack: pack,
    },
  });

  return {
    pack: { ...pack, artifactId: artifact.id },
    artifactId: artifact.id,
    brainTaskId: taskId,
  };
}
