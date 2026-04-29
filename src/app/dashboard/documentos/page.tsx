"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { isFullAccessRole } from "@/lib/permissions";
import { GoogleDriveLogo } from "@/components/branding/GoogleDriveLogo";
import { LEGAL_PIECE_SUGGESTIONS, PRACTICE_AREA_OPTIONS } from "@/lib/juridico/piece-catalog";
import ReactMarkdown from "react-markdown";
import {
  Copy,
  ExternalLink,
  FolderTree,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  FileText,
  Download,
  AlertTriangle,
  CheckCircle2,
  Upload,
  File as FileIcon,
  X,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

type ProcessTaskListItem = {
  id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  client_name?: string | null;
  process_number?: string | null;
  drive_link?: string | null;
  drive_folder_id?: string | null;
  drive_structure_ready?: boolean | null;
  created_at: string;
};

type ProcessStage = { id: string; name: string };
type ProcessPipeline = { id: string; name: string };
type ProcessDocumentMemory = {
  process_task_id: string;
  document_count?: number | null;
  sync_status?: string | null;
  last_synced_at?: string | null;
  summary_master?: string | null;
  missing_documents?: string[] | null;
  case_brain_task_id?: string | null;
  draft_plan_summary?: Record<string, unknown> | null;
  first_draft_status?: string | null;
  first_draft_task_id?: string | null;
  first_draft_artifact_id?: string | null;
  first_draft_case_brain_task_id?: string | null;
  first_draft_summary?: string | null;
  first_draft_error?: string | null;
  first_draft_generated_at?: string | null;
};

type ProcessDocumentItem = {
  process_task_id: string;
  name: string;
  document_type?: string | null;
  extraction_status?: string | null;
  folder_label?: string | null;
  web_view_link?: string | null;
  modified_at?: string | null;
};

type DocumentOrganizationEvent = {
  id: string;
  tenant_id?: string | null;
  event_name: string;
  status: string;
  payload?: {
    process_task_id?: string | null;
    uploaded_count?: number | null;
    moved_count?: number | null;
    skipped_count?: number | null;
    needs_review_count?: number | null;
    auto_organized?: boolean | null;
    moves?: Array<{
      name?: string | null;
      fromFolderLabel?: string | null;
      toFolderLabel?: string | null;
      documentType?: string | null;
      confidence?: string | null;
      reason?: string | null;
    }> | null;
  } | null;
  created_at: string;
};

type TenantLegalSettingsRecord = {
  metadata?: Record<string, unknown> | null;
};

type DraftFactoryTrigger = "manual_draft_factory" | "case_brain_auto_draft_factory";

type FirstDraftStatus = "idle" | "queued" | "running" | "completed" | "failed";

type BrainArtifactDraftRecord = {
  id: string;
  task_id: string;
  metadata?: Record<string, unknown> | null;
};

type DraftPlanSummary = {
  caseBrainTaskId: string | null;
  recommendedPieceInput: string | null;
  recommendedPieceLabel: string | null;
  missingDocuments: string[];
  firstActions: string[];
  readyForLawCitations: boolean;
  readyForCaseLawCitations: boolean;
  validatedLawReferenceCount: number;
  validatedCaseLawReferenceCount: number;
  pendingValidationCount: number;
};

type DraftFactoryCardBadge = {
  label: string;
  className: string;
  dotClassName: string;
};

type DraftFactoryDocumentFilter = "all" | "queued" | "running" | "completed" | "failed";

type DraftFactoryCardQuickAction = {
  label: string;
  className: string;
};

type ProcessDocumentCard = ProcessTaskListItem & {
  stageName: string | null;
  pipelineName: string | null;
  documentCount: number;
  syncStatus: string;
  lastSyncedAt: string | null;
  summaryMaster: string | null;
  missingDocuments: string[];
  documents: ProcessDocumentItem[];
  organizationEvents: DocumentOrganizationEvent[];
  draftPlan: DraftPlanSummary | null;
  autoDraftFactoryEnabled: boolean;
  caseBrainTaskId: string | null;
  firstDraftStatus: FirstDraftStatus;
  firstDraftSummary: string | null;
  firstDraftError: string | null;
  firstDraftArtifactId: string | null;
  firstDraftCaseBrainTaskId: string | null;
};

type PieceQualityMetrics = {
  charCount: number;
  wordCount: number;
  paragraphCount: number;
  sectionCount: number;
};

type GeneratedPieceResult = {
  pieceType: string;
  pieceLabel: string;
  pieceFamily: string;
  pieceFamilyLabel: string;
  practiceArea: string | null;
  outline: string[];
  draftMarkdown: string;
  usedDocuments: Array<{
    id: string;
    name: string;
    documentType: string | null;
    folderLabel: string | null;
    webViewLink: string | null;
    modifiedAt: string | null;
  }>;
  missingDocuments: string[];
  warnings: string[];
  confidenceNote: string;
  requiresHumanReview: boolean;
  model: string;
  provider: string;
  expansionApplied: boolean;
  qualityMetrics: PieceQualityMetrics;
  generationMode?: "manual" | "draft_factory";
  draftFactoryTaskId?: string;
  draftFactoryArtifactId?: string;
  caseBrainTaskId?: string;
  recommendedPieceInput?: string | null;
  recommendedPieceLabel?: string | null;
};

type ProcessDraftVersion = {
  id: string;
  source_artifact_id: string | null;
  source_task_id: string | null;
  source_case_brain_task_id: string | null;
  version_number: number;
  workflow_status: "draft" | "approved" | "published";
  is_current: boolean;
  piece_type: string | null;
  piece_label: string | null;
  practice_area: string | null;
  summary: string | null;
  draft_markdown: string;
  metadata?: Record<string, unknown> | null;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
};

type PremiumPublicationRecord = {
  format: string | null;
  fileName: string | null;
  driveFileId: string | null;
  webViewLink: string | null;
  driveFolderLabel: string | null;
  driveFolderUrl: string | null;
  publishedAt: string | null;
};

type LearningLoopCaptureRecord = {
  changed: boolean;
  sourceKind: string | null;
  sourceLabel: string | null;
  changeRatio: number;
  categories: string[];
  summary: string | null;
};

type PromotionCandidateRecord = {
  status: string | null;
  confidence: string | null;
  candidateTypes: string[];
  summary: string | null;
};

type DraftQueueHealthAlert = {
  severity: "warning" | "critical";
  code: string;
  message: string;
  processTaskId?: string;
};

type DraftFactoryQueueHealth = {
  generatedAt: string;
  counts: {
    queued: number;
    running: number;
    completed: number;
    failed: number;
    staleCompleted: number;
  };
  oldestQueuedMinutes: number | null;
  oldestRunningMinutes: number | null;
  stuckRunningCount: number;
  repeatedFailureCount: number;
  recentFailures: Array<{
    processTaskId: string;
    title: string;
    clientName: string | null;
    error: string | null;
    updatedAt: string | null;
    failuresLast24h: number;
  }>;
  alerts: DraftQueueHealthAlert[];
};

const DOCUMENT_FOLDER_OPTIONS = [
  "01-Documentos do Cliente",
  "02-Inicial",
  "03-Contestacao",
  "04-Manifestacoes",
  "05-Decisoes e Sentencas",
  "06-Provas",
  "07-Prazos e Audiencias",
  "08-Recursos",
  "09-Pecas Finais",
] as const;

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  documento_cliente: "Documento do Cliente",
  inicial: "Inicial",
  contestacao: "Contestação",
  replica: "Réplica",
  manifestacao: "Manifestação",
  decisao: "Decisão",
  sentenca: "Sentença",
  decisao_sentenca: "Decisão / Sentença",
  recurso: "Recurso",
  prova: "Prova",
  prazo_audiencia: "Prazo / Audiência",
  peca_final: "Peça Final",
  geral: "Geral",
};

function getExtractionBadge(status?: string | null) {
  switch (status) {
    case "extracted":
      return {
        label: "Lido",
        className: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
      };
    case "error":
      return {
        label: "Falha na leitura",
        className: "bg-red-500/10 border-red-500/20 text-red-300",
      };
    case "skipped":
      return {
        label: "Indexado",
        className: "bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300",
      };
    default:
      return {
        label: "Pendente",
        className: "bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-400",
      };
  }
}

function getDocumentTypeLabel(type?: string | null) {
  return DOCUMENT_TYPE_LABELS[type || ""] || type || "Tipo não identificado";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Nunca sincronizado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nunca sincronizado";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(value: Record<string, unknown> | null | undefined, key: string) {
  const item = value?.[key];
  return typeof item === "string" && item.trim().length > 0 ? item.trim() : null;
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function getBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function getNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = Number(value);
    if (Number.isFinite(normalized)) return normalized;
  }
  return fallback;
}

function getPremiumPublication(version: ProcessDraftVersion | null) {
  const metadata = isRecord(version?.metadata) ? version?.metadata : null;
  const premium = isRecord(metadata?.premium_publish) ? metadata?.premium_publish : null;
  if (!premium) return null;

  return {
    format: getString(premium, "format"),
    fileName: getString(premium, "fileName"),
    driveFileId: getString(premium, "driveFileId"),
    webViewLink: getString(premium, "webViewLink"),
    driveFolderLabel: getString(premium, "driveFolderLabel"),
    driveFolderUrl: getString(premium, "driveFolderUrl"),
    publishedAt: getString(premium, "publishedAt"),
  } satisfies PremiumPublicationRecord;
}

function getLearningLoopCapture(version: ProcessDraftVersion | null) {
  const metadata = isRecord(version?.metadata) ? version?.metadata : null;
  const capture = isRecord(metadata?.learning_loop_capture) ? metadata.learning_loop_capture : null;
  if (!capture) return null;

  return {
    changed: getBoolean(capture.changed),
    sourceKind: getString(capture, "sourceKind"),
    sourceLabel: getString(capture, "sourceLabel"),
    changeRatio: getNumber(capture.changeRatio),
    categories: getStringArray(capture.categories),
    summary: getString(capture, "summary"),
  } satisfies LearningLoopCaptureRecord;
}

function getPromotionCandidate(version: ProcessDraftVersion | null) {
  const metadata = isRecord(version?.metadata) ? version?.metadata : null;
  const candidate = isRecord(metadata?.promotion_candidate) ? metadata.promotion_candidate : null;
  if (!candidate) return null;

  return {
    status: getString(candidate, "status"),
    confidence: getString(candidate, "confidence"),
    candidateTypes: getStringArray(candidate.candidateTypes),
    summary: getString(candidate, "summary"),
  } satisfies PromotionCandidateRecord;
}

function isAutoDraftFactoryEnabled(metadata: Record<string, unknown> | null | undefined) {
  return metadata?.auto_draft_factory_on_case_brain_ready === true;
}

function normalizeFirstDraftStatus(value?: string | null): FirstDraftStatus {
  switch (value) {
    case "queued":
    case "running":
    case "completed":
    case "failed":
      return value;
    default:
      return "idle";
  }
}

function buildDraftPlanSummary(caseBrainTaskId: string | null | undefined, value: Record<string, unknown> | null | undefined): DraftPlanSummary | null {
  if (!isRecord(value)) return null;

  const recommendedPieceInput = getString(value, "recommended_piece_input");
  const recommendedPieceLabel = getString(value, "recommended_piece_label");

  if (!recommendedPieceInput && !recommendedPieceLabel) {
    return null;
  }

  return {
    caseBrainTaskId: caseBrainTaskId || null,
    recommendedPieceInput,
    recommendedPieceLabel,
    missingDocuments: getStringArray(value.missing_documents),
    firstActions: getStringArray(value.first_actions),
    readyForLawCitations: getBoolean(value.ready_for_law_citations),
    readyForCaseLawCitations: getBoolean(value.ready_for_case_law_citations),
    validatedLawReferenceCount: getNumber(value.validated_law_reference_count),
    validatedCaseLawReferenceCount: getNumber(value.validated_case_law_reference_count),
    pendingValidationCount: getNumber(value.pending_validation_count),
  };
}

function buildGeneratedPieceFromArtifact(artifact: BrainArtifactDraftRecord): GeneratedPieceResult | null {
  const metadata = isRecord(artifact.metadata) ? artifact.metadata : null;
  const draftMarkdown = getString(metadata, "reply");

  if (!metadata || !draftMarkdown) {
    return null;
  }

  const qualityMetricsRecord = isRecord(metadata.quality_metrics) ? metadata.quality_metrics : null;
  const usedDocuments = Array.isArray(metadata.used_documents)
    ? metadata.used_documents
        .filter(isRecord)
        .map((document) => ({
          id: getString(document, "id") || `${artifact.id}:${getString(document, "name") || "document"}`,
          name: getString(document, "name") || "Documento interno",
          documentType: getString(document, "documentType") || getString(document, "document_type"),
          folderLabel: getString(document, "folderLabel") || getString(document, "folder_label"),
          webViewLink: getString(document, "webViewLink") || getString(document, "web_view_link"),
          modifiedAt: getString(document, "modifiedAt") || getString(document, "modified_at"),
        }))
    : [];

  return {
    pieceType: getString(metadata, "piece_type") || "peca_juridica",
    pieceLabel: getString(metadata, "piece_label") || getString(metadata, "recommended_piece_label") || "Peça Jurídica",
    pieceFamily: getString(metadata, "piece_family") || "peca_juridica",
    pieceFamilyLabel: getString(metadata, "piece_family_label") || getString(metadata, "piece_family") || "Peça Jurídica",
    practiceArea: getString(metadata, "practice_area"),
    outline: getStringArray(metadata.outline),
    draftMarkdown,
    usedDocuments,
    missingDocuments: getStringArray(metadata.missing_documents),
    warnings: getStringArray(metadata.warnings),
    confidenceNote: getString(metadata, "confidence_note") || "Minuta carregada a partir do artifact da Draft Factory.",
    requiresHumanReview: getBoolean(metadata.requires_human_review, true),
    model: getString(metadata, "model") || "desconhecido",
    provider: getString(metadata, "provider") || "desconhecido",
    expansionApplied: getBoolean(metadata.expansion_applied),
    qualityMetrics: {
      charCount: getNumber(qualityMetricsRecord?.charCount),
      wordCount: getNumber(qualityMetricsRecord?.wordCount),
      paragraphCount: getNumber(qualityMetricsRecord?.paragraphCount),
      sectionCount: getNumber(qualityMetricsRecord?.sectionCount),
    },
    generationMode: "draft_factory",
    draftFactoryTaskId: artifact.task_id,
    draftFactoryArtifactId: artifact.id,
    caseBrainTaskId: getString(metadata, "case_brain_task_id") || undefined,
    recommendedPieceInput: getString(metadata, "recommended_piece_input"),
    recommendedPieceLabel: getString(metadata, "recommended_piece_label"),
  };
}

function buildGeneratedPieceFromVersion(version: ProcessDraftVersion): GeneratedPieceResult {
  const metadata = isRecord(version.metadata) ? version.metadata : null;
  const qualityMetricsRecord = isRecord(metadata?.quality_metrics) ? metadata.quality_metrics : null;
  const usedDocuments = Array.isArray(metadata?.used_documents)
    ? metadata.used_documents
        .filter(isRecord)
        .map((document) => ({
          id: getString(document, "id") || `${version.id}:${getString(document, "name") || "document"}`,
          name: getString(document, "name") || "Documento interno",
          documentType: getString(document, "documentType") || getString(document, "document_type"),
          folderLabel: getString(document, "folderLabel") || getString(document, "folder_label"),
          webViewLink: getString(document, "webViewLink") || getString(document, "web_view_link"),
          modifiedAt: getString(document, "modifiedAt") || getString(document, "modified_at"),
        }))
    : [];

  return {
    pieceType: version.piece_type || getString(metadata, "piece_type") || "peca_juridica",
    pieceLabel: version.piece_label || getString(metadata, "piece_label") || "Peça Jurídica",
    pieceFamily: getString(metadata, "piece_family") || "peca_juridica",
    pieceFamilyLabel: getString(metadata, "piece_family_label") || getString(metadata, "piece_family") || "Peça Jurídica",
    practiceArea: version.practice_area || getString(metadata, "practice_area"),
    outline: getStringArray(metadata?.outline),
    draftMarkdown: version.draft_markdown,
    usedDocuments,
    missingDocuments: getStringArray(metadata?.missing_documents),
    warnings: getStringArray(metadata?.warnings),
    confidenceNote: getString(metadata, "confidence_note") || `Versão ${version.version_number} carregada do histórico jurídico formal.`,
    requiresHumanReview: getBoolean(metadata?.requires_human_review, true),
    model: getString(metadata, "model") || "desconhecido",
    provider: getString(metadata, "provider") || "desconhecido",
    expansionApplied: getBoolean(metadata?.expansion_applied),
    qualityMetrics: {
      charCount: getNumber(qualityMetricsRecord?.charCount),
      wordCount: getNumber(qualityMetricsRecord?.wordCount),
      paragraphCount: getNumber(qualityMetricsRecord?.paragraphCount),
      sectionCount: getNumber(qualityMetricsRecord?.sectionCount),
    },
    generationMode: "draft_factory",
    draftFactoryTaskId: version.source_task_id || getString(metadata, "source_task_id") || undefined,
    draftFactoryArtifactId: version.source_artifact_id || getString(metadata, "artifact_id") || undefined,
    caseBrainTaskId: version.source_case_brain_task_id || getString(metadata, "source_case_brain_task_id") || undefined,
    recommendedPieceInput: getString(metadata, "recommended_piece_input"),
    recommendedPieceLabel: getString(metadata, "recommended_piece_label"),
  };
}

function isDraftVersionStale(version: Pick<ProcessDraftVersion, "source_case_brain_task_id">, currentCaseBrainTaskId?: string | null) {
  if (!currentCaseBrainTaskId) {
    return false;
  }

  return (version.source_case_brain_task_id || null) !== currentCaseBrainTaskId;
}

function getDraftWorkflowBadge(status: ProcessDraftVersion["workflow_status"]) {
  switch (status) {
    case "published":
      return "border-sky-500/25 bg-sky-500/10 text-sky-200";
    case "approved":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
    default:
      return "border-amber-500/25 bg-amber-500/10 text-amber-100";
  }
}

function isDraftFactoryCardStale(card: Pick<ProcessDocumentCard, "caseBrainTaskId" | "firstDraftArtifactId" | "firstDraftCaseBrainTaskId"> | { caseBrainTaskId?: string | null; firstDraftArtifactId?: string | null; firstDraftCaseBrainTaskId?: string | null }) {
  const currentCaseBrainTaskId = card.caseBrainTaskId || null;
  const sourceCaseBrainTaskId = card.firstDraftCaseBrainTaskId || null;
  const artifactId = card.firstDraftArtifactId || null;

  if (!artifactId || !currentCaseBrainTaskId) {
    return false;
  }

  if (!sourceCaseBrainTaskId) {
    return true;
  }

  return sourceCaseBrainTaskId !== currentCaseBrainTaskId;
}

function getDraftFactoryCardBadge(card: Pick<ProcessDocumentCard, "draftPlan" | "firstDraftStatus" | "firstDraftArtifactId" | "caseBrainTaskId" | "firstDraftCaseBrainTaskId">): DraftFactoryCardBadge | null {
  const stale = isDraftFactoryCardStale(card);

  switch (card.firstDraftStatus) {
    case "queued":
      return {
        label: stale && card.firstDraftArtifactId ? "Atualizando minuta" : "Minuta em fila",
        className: "border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300",
        dotClassName: "bg-gray-400",
      };
    case "running":
      return {
        label: stale && card.firstDraftArtifactId ? "Atualizando minuta" : "Minuta gerando",
        className: "border-[#CCA761]/20 bg-[#CCA761]/10 text-[#CCA761]",
        dotClassName: "bg-[#CCA761] animate-pulse",
      };
    case "completed":
      return {
        label: stale ? "Minuta desatualizada" : card.firstDraftArtifactId ? "Minuta pronta" : "Minuta concluida",
        className: stale ? "border-amber-500/20 bg-amber-500/10 text-amber-200" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200",
        dotClassName: stale ? "bg-amber-400" : "bg-emerald-400",
      };
    case "failed":
      return {
        label: "Minuta falhou",
        className: "border-red-500/20 bg-red-500/10 text-red-200",
        dotClassName: "bg-red-400",
      };
    default:
      return card.draftPlan?.recommendedPieceInput
        ? {
            label: "Draft plan pronto",
            className: "border-[#CCA761]/15 bg-[#CCA761]/10 text-[#CCA761]",
            dotClassName: "bg-[#CCA761]",
          }
        : null;
  }
}

function matchesDraftFactoryDocumentFilter(card: Pick<ProcessDocumentCard, "firstDraftStatus">, filter: DraftFactoryDocumentFilter) {
  if (filter === "all") return true;
  return card.firstDraftStatus === filter;
}

function getDraftFactoryCardQuickAction(card: Pick<ProcessDocumentCard, "firstDraftStatus" | "firstDraftArtifactId" | "caseBrainTaskId" | "firstDraftCaseBrainTaskId">): DraftFactoryCardQuickAction | null {
  const stale = isDraftFactoryCardStale(card);

  if (card.firstDraftStatus === "failed") {
    return {
      label: stale && card.firstDraftArtifactId ? "Atualizar falha" : "Resolver falha",
      className: "border-red-500/20 bg-red-500/10 text-red-200 hover:bg-red-500/15",
    };
  }

  if (card.firstDraftStatus === "completed" && card.firstDraftArtifactId) {
    return {
      label: stale ? "Atualizar minuta" : "Revisar minuta",
      className: stale ? "border-amber-500/20 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/15",
    };
  }

  return null;
}

export default function DocumentosPage() {
  const supabase = useMemo(() => createClient(), []);
  const { tenantId, role, isLoading: profileLoading } = useUserProfile();
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [pieceBusyTaskId, setPieceBusyTaskId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [cards, setCards] = useState<ProcessDocumentCard[]>([]);
  const [uploadFolderByTask, setUploadFolderByTask] = useState<Record<string, string>>({});
  const [uploadFilesByTask, setUploadFilesByTask] = useState<Record<string, globalThis.File[]>>({});
  const [organizationStatusByTask, setOrganizationStatusByTask] = useState<Record<string, string>>({});
  const [uploadInputVersionByTask, setUploadInputVersionByTask] = useState<Record<string, number>>({});
  const [pieceTypeByTask, setPieceTypeByTask] = useState<Record<string, string>>({});
  const [piecePracticeAreaByTask, setPiecePracticeAreaByTask] = useState<Record<string, string>>({});
  const [pieceObjectiveByTask, setPieceObjectiveByTask] = useState<Record<string, string>>({});
  const [pieceInstructionsByTask, setPieceInstructionsByTask] = useState<Record<string, string>>({});
  const [generatedPieceByTask, setGeneratedPieceByTask] = useState<Record<string, GeneratedPieceResult | null>>({});
  const [downloadBusyTaskId, setDownloadBusyTaskId] = useState<string | null>(null);
  const [premiumPublishBusyKey, setPremiumPublishBusyKey] = useState<string | null>(null);
  const [requestedTaskId, setRequestedTaskId] = useState<string | null>(null);
  const [draftFactoryFilter, setDraftFactoryFilter] = useState<DraftFactoryDocumentFilter>("all");
  const [draftVersionsByTask, setDraftVersionsByTask] = useState<Record<string, ProcessDraftVersion[]>>({});
  const [selectedDraftVersionIdByTask, setSelectedDraftVersionIdByTask] = useState<Record<string, string | null>>({});
  const [draftEditorContentByVersionId, setDraftEditorContentByVersionId] = useState<Record<string, string>>({});
  const [draftVersionsLoadingTaskId, setDraftVersionsLoadingTaskId] = useState<string | null>(null);
  const [draftWorkflowBusyKey, setDraftWorkflowBusyKey] = useState<string | null>(null);
  const [draftRevisionBusyKey, setDraftRevisionBusyKey] = useState<string | null>(null);
  const [draftQueueHealth, setDraftQueueHealth] = useState<DraftFactoryQueueHealth | null>(null);

  const selectedCard = useMemo(() => cards.find(c => c.id === selectedCardId), [cards, selectedCardId]);
  const selectedCardDraftStale = useMemo(() => (selectedCard ? isDraftFactoryCardStale(selectedCard) : false), [selectedCard]);
  const selectedCardVersions = useMemo(() => (selectedCard ? draftVersionsByTask[selectedCard.id] || [] : []), [draftVersionsByTask, selectedCard]);
  const selectedDraftVersion = useMemo(() => {
    if (!selectedCard) return null;
    const selectedVersionId = selectedDraftVersionIdByTask[selectedCard.id] || null;
    return selectedCardVersions.find((version) => version.id === selectedVersionId)
      || selectedCardVersions.find((version) => version.is_current)
      || selectedCardVersions[0]
      || null;
  }, [selectedCard, selectedCardVersions, selectedDraftVersionIdByTask]);
  const selectedDraftPremiumPublication = useMemo(() => getPremiumPublication(selectedDraftVersion), [selectedDraftVersion]);
  const selectedDraftLearningLoopCapture = useMemo(() => getLearningLoopCapture(selectedDraftVersion), [selectedDraftVersion]);
  const selectedDraftPromotionCandidate = useMemo(() => getPromotionCandidate(selectedDraftVersion), [selectedDraftVersion]);
  const selectedDraftVersionStale = useMemo(() => {
    if (!selectedCard || !selectedDraftVersion) return false;
    return isDraftVersionStale(selectedDraftVersion, selectedCard.caseBrainTaskId);
  }, [selectedCard, selectedDraftVersion]);
  const selectedDraftEditorContent = useMemo(() => {
    if (!selectedDraftVersion) return "";
    return draftEditorContentByVersionId[selectedDraftVersion.id] ?? selectedDraftVersion.draft_markdown;
  }, [draftEditorContentByVersionId, selectedDraftVersion]);
  const selectedDraftHasUnsavedChanges = useMemo(() => {
    if (!selectedDraftVersion) return false;
    return selectedDraftEditorContent !== selectedDraftVersion.draft_markdown;
  }, [selectedDraftEditorContent, selectedDraftVersion]);
  const selectedCurrentDraftHasUnsavedChanges = useMemo(() => {
    if (!selectedDraftVersion) return false;
    return selectedDraftVersion.is_current && selectedDraftHasUnsavedChanges;
  }, [selectedDraftHasUnsavedChanges, selectedDraftVersion]);
  const selectedDraftEditorBlockedReason = useMemo(() => {
    if (!selectedDraftVersion) return null;
    if (!selectedDraftVersion.is_current) {
      return "Selecione a versao atual da minuta para registrar uma nova revisao humana oficial.";
    }

    if (selectedDraftVersionStale) {
      return "Esta versao ficou stale em relacao ao Case Brain atual. Gere uma nova minuta antes de salvar revisoes humanas formais.";
    }

    return null;
  }, [selectedDraftVersion, selectedDraftVersionStale]);
  const canFormallyReviewDraft = isFullAccessRole(role);

  useEffect(() => {
    if (!selectedDraftVersion) return;

    setDraftEditorContentByVersionId((current) => {
      if (typeof current[selectedDraftVersion.id] === "string") {
        return current;
      }

      return {
        ...current,
        [selectedDraftVersion.id]: selectedDraftVersion.draft_markdown,
      };
    });
  }, [selectedDraftVersion]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const nextRequestedTaskId = String(new URLSearchParams(window.location.search).get("taskId") || "").trim() || null;
    setRequestedTaskId(nextRequestedTaskId);
  }, []);

  useEffect(() => {
    if (!requestedTaskId || cards.length === 0) return;
    if (cards.some((card) => card.id === requestedTaskId)) {
      setSelectedCardId(requestedTaskId);
    }
  }, [cards, requestedTaskId]);

  const loadRepository = useCallback(async () => {
    if (!tenantId) return;

    setIsLoading(true);

    try {
      const [tasksRes, stagesRes, pipelinesRes, memoryRes, documentsRes, eventsRes, legalProfileRes] = await Promise.all([
        supabase
          .from("process_tasks")
          .select("id, pipeline_id, stage_id, title, client_name, process_number, drive_link, drive_folder_id, drive_structure_ready, created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false }),
        supabase.from("process_stages").select("id, name"),
        supabase.from("process_pipelines").select("id, name").eq("tenant_id", tenantId),
        supabase
          .from("process_document_memory")
          .select("process_task_id, document_count, sync_status, last_synced_at, summary_master, missing_documents, case_brain_task_id, draft_plan_summary, first_draft_status, first_draft_task_id, first_draft_artifact_id, first_draft_case_brain_task_id, first_draft_summary, first_draft_error, first_draft_generated_at")
          .eq("tenant_id", tenantId),
        supabase
          .from("process_documents")
          .select("process_task_id, name, document_type, extraction_status, folder_label, web_view_link, modified_at")
          .eq("tenant_id", tenantId)
          .order("modified_at", { ascending: false }),
        supabase
          .from("system_event_logs")
          .select("id, tenant_id, event_name, status, payload, created_at")
          .eq("tenant_id", tenantId)
          .eq("source", "documentos")
          .in("event_name", ["process_document_batch_uploaded", "process_document_repository_organized"])
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("tenant_legal_profiles")
          .select("metadata")
          .eq("tenant_id", tenantId)
          .maybeSingle<TenantLegalSettingsRecord>(),
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (stagesRes.error) throw stagesRes.error;
      if (pipelinesRes.error) throw pipelinesRes.error;
      if (memoryRes.error) throw memoryRes.error;
      if (documentsRes.error) throw documentsRes.error;
      if (eventsRes.error) throw eventsRes.error;
      if (legalProfileRes.error) throw legalProfileRes.error;

      const stagesMap = new Map((stagesRes.data || []).map((stage: ProcessStage) => [stage.id, stage.name]));
      const pipelinesMap = new Map((pipelinesRes.data || []).map((pipeline: ProcessPipeline) => [pipeline.id, pipeline.name]));
      const memoryMap = new Map((memoryRes.data || []).map((memory: ProcessDocumentMemory) => [memory.process_task_id, memory]));
      const docsByTask = new Map<string, ProcessDocumentItem[]>();
      const eventsByTask = new Map<string, DocumentOrganizationEvent[]>();
      const autoDraftFactoryEnabled = isAutoDraftFactoryEnabled((legalProfileRes.data as TenantLegalSettingsRecord | null)?.metadata || null);
      const loadedGeneratedPieces: Record<string, GeneratedPieceResult> = {};

      (documentsRes.data || []).forEach((document: ProcessDocumentItem) => {
        const current = docsByTask.get(document.process_task_id) || [];
        current.push(document);
        docsByTask.set(document.process_task_id, current);
      });
      ((eventsRes.data || []) as DocumentOrganizationEvent[]).forEach((event) => {
        const taskId = String(event.payload?.process_task_id || "");
        if (!taskId) return;
        const current = eventsByTask.get(taskId) || [];
        current.push(event);
        eventsByTask.set(taskId, current);
      });

      const artifactIds = Array.from(
        new Set(
          (memoryRes.data || [])
            .map((memory: ProcessDocumentMemory) => String(memory.first_draft_artifact_id || "").trim())
            .filter(Boolean)
        )
      );

      if (artifactIds.length > 0) {
        const { data: firstDraftArtifacts, error: artifactError } = await supabase
          .from("brain_artifacts")
          .select("id, task_id, metadata")
          .in("id", artifactIds);

        if (artifactError) throw artifactError;

        (firstDraftArtifacts || []).forEach((artifact: BrainArtifactDraftRecord) => {
          const processTaskId = getString(isRecord(artifact.metadata) ? artifact.metadata : null, "process_task_id");
          if (!processTaskId || loadedGeneratedPieces[processTaskId]) return;
          const loadedPiece = buildGeneratedPieceFromArtifact(artifact);
          if (loadedPiece) {
            loadedGeneratedPieces[processTaskId] = loadedPiece;
          }
        });
      }

      const nextCards = (tasksRes.data || []).map((task: ProcessTaskListItem) => {
        const memory = memoryMap.get(task.id);
        const draftPlan = buildDraftPlanSummary(memory?.case_brain_task_id, memory?.draft_plan_summary || null);

        return {
          ...task,
          stageName: stagesMap.get(task.stage_id) || null,
          pipelineName: pipelinesMap.get(task.pipeline_id) || null,
          documentCount: Number(memory?.document_count || 0),
          syncStatus: memory?.sync_status || (task.drive_structure_ready ? "structured" : "pending"),
          lastSyncedAt: memory?.last_synced_at || null,
          summaryMaster: memory?.summary_master || null,
          missingDocuments: Array.isArray(memory?.missing_documents) ? memory!.missing_documents! : [],
          documents: (docsByTask.get(task.id) || []).slice(0, 5),
          organizationEvents: (eventsByTask.get(task.id) || []).slice(0, 5),
          draftPlan,
          autoDraftFactoryEnabled,
          caseBrainTaskId: memory?.case_brain_task_id || null,
          firstDraftStatus: normalizeFirstDraftStatus(memory?.first_draft_status),
          firstDraftSummary: memory?.first_draft_summary || null,
          firstDraftError: memory?.first_draft_error || null,
          firstDraftArtifactId: memory?.first_draft_artifact_id || null,
          firstDraftCaseBrainTaskId: memory?.first_draft_case_brain_task_id || null,
        } satisfies ProcessDocumentCard;
      });

      setCards(nextCards);
      setGeneratedPieceByTask((current) => {
        const next = { ...current };
        Object.entries(loadedGeneratedPieces).forEach(([taskId, piece]) => {
          if (!next[taskId]) {
            next[taskId] = piece;
          }
        });
        return next;
      });
      setUploadFolderByTask((current) => {
        const next = { ...current };
        nextCards.forEach((card) => {
          if (!next[card.id]) {
            next[card.id] = "auto";
          }
        });
        return next;
      });
      setPieceTypeByTask((current) => {
        const next = { ...current };
        nextCards.forEach((card) => {
          if (!next[card.id]) {
            next[card.id] = card.draftPlan?.recommendedPieceInput || "Contestacao";
          }
        });
        return next;
      });
      setPiecePracticeAreaByTask((current) => {
        const next = { ...current };
        nextCards.forEach((card) => {
          if (!next[card.id]) {
            next[card.id] = "civel";
          }
        });
        return next;
      });
      setPieceObjectiveByTask((current) => {
        const next = { ...current };
        nextCards.forEach((card) => {
          if (!next[card.id]) {
            next[card.id] = "Gerar um rascunho técnico fiel aos documentos sincronizados, sem inventar fatos ou fundamentos.";
          }
        });
        return next;
      });
    } catch (error: any) {
      console.error("[documentos][load]", error);
      toast.error(error?.message || "Não foi possível carregar o repositório documental.");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, tenantId]);

  const loadDraftQueueHealth = useCallback(async () => {
    try {
      const response = await fetch("/api/documentos/draft-factory/health", { cache: "no-store" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível carregar a saúde da fila da Draft Factory.");
      }

      setDraftQueueHealth(data?.health as DraftFactoryQueueHealth);
    } catch (error: any) {
      console.error("[documentos][draft-factory-health]", error);
    }
  }, []);

  const loadDraftVersions = useCallback(async (taskId: string, options?: { selectCurrent?: boolean }) => {
    setDraftVersionsLoadingTaskId(taskId);

    try {
      const response = await fetch(`/api/documentos/processos/${taskId}/minutas`, { cache: "no-store" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível carregar o histórico da minuta.");
      }

      const versions = Array.isArray(data?.versions) ? data.versions as ProcessDraftVersion[] : [];
      const currentVersion = versions.find((version) => version.is_current) || versions[0] || null;

      setDraftVersionsByTask((current) => ({ ...current, [taskId]: versions }));
      setSelectedDraftVersionIdByTask((current) => {
        if (!options?.selectCurrent && current[taskId]) return current;
        return { ...current, [taskId]: currentVersion?.id || null };
      });

      if (currentVersion && options?.selectCurrent) {
        setGeneratedPieceByTask((current) => ({
          ...current,
          [taskId]: buildGeneratedPieceFromVersion(currentVersion),
        }));
      }
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível carregar o histórico da minuta.");
    } finally {
      setDraftVersionsLoadingTaskId((current) => (current === taskId ? null : current));
    }
  }, []);

  const handleSelectDraftVersion = useCallback((taskId: string, version: ProcessDraftVersion) => {
    setSelectedDraftVersionIdByTask((current) => ({ ...current, [taskId]: version.id }));
    setGeneratedPieceByTask((current) => ({
      ...current,
      [taskId]: buildGeneratedPieceFromVersion(version),
    }));
  }, []);

  const handleDraftWorkflowAction = useCallback(async (taskId: string, versionId: string, action: "approve" | "publish") => {
    const busyKey = `${taskId}:${versionId}:${action}`;
    setDraftWorkflowBusyKey(busyKey);

    try {
      const response = await fetch(`/api/documentos/processos/${taskId}/minutas/${versionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível atualizar o workflow da minuta.");
      }

      const nextVersion = data?.version as ProcessDraftVersion | undefined;
      await Promise.all([
        loadDraftVersions(taskId, { selectCurrent: true }),
        loadRepository(),
        loadDraftQueueHealth(),
      ]);

      if (nextVersion) {
        setSelectedDraftVersionIdByTask((current) => ({ ...current, [taskId]: nextVersion.id }));
      }

      toast.success(action === "approve" ? "Versão aprovada com sucesso." : "Versão publicada com sucesso.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível atualizar o workflow da minuta.");
    } finally {
      setDraftWorkflowBusyKey((current) => (current === busyKey ? null : current));
    }
  }, [loadDraftQueueHealth, loadDraftVersions, loadRepository]);

  const handleResetDraftEditor = useCallback((version: ProcessDraftVersion) => {
    setDraftEditorContentByVersionId((current) => ({
      ...current,
      [version.id]: version.draft_markdown,
    }));
  }, []);

  const handleSaveHumanReviewedVersion = useCallback(async (taskId: string, version: ProcessDraftVersion) => {
    const busyKey = `${taskId}:${version.id}`;
    const draftMarkdown = draftEditorContentByVersionId[version.id] ?? version.draft_markdown;
    setDraftRevisionBusyKey(busyKey);

    try {
      const response = await fetch(`/api/documentos/processos/${taskId}/minutas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseVersionId: version.id,
          draftMarkdown,
        }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel salvar a nova versao formal revisada.");
      }

      const nextVersion = data?.version as ProcessDraftVersion | undefined;

      if (nextVersion?.id && typeof nextVersion.draft_markdown === "string") {
        setDraftEditorContentByVersionId((current) => ({
          ...current,
          [nextVersion.id]: nextVersion.draft_markdown,
        }));
        setSelectedDraftVersionIdByTask((current) => ({ ...current, [taskId]: nextVersion.id }));
      }

      await Promise.all([
        loadDraftVersions(taskId, { selectCurrent: true }),
        loadRepository(),
        loadDraftQueueHealth(),
      ]);

      toast.success("Nova versao formal salva a partir da revisao humana.");
    } catch (error: any) {
      toast.error(error?.message || "Nao foi possivel salvar a nova versao formal revisada.");
    } finally {
      setDraftRevisionBusyKey((current) => (current === busyKey ? null : current));
    }
  }, [draftEditorContentByVersionId, loadDraftQueueHealth, loadDraftVersions, loadRepository]);

  useEffect(() => {
    if (!profileLoading && tenantId) {
      void Promise.all([loadRepository(), loadDraftQueueHealth()]);
    }
  }, [profileLoading, tenantId, loadDraftQueueHealth, loadRepository]);

  useEffect(() => {
    if (!selectedCardId) return;
    void loadDraftVersions(selectedCardId);
  }, [loadDraftVersions, selectedCardId]);

  useEffect(() => {
    if (!tenantId) return;

    const hasActiveDrafts = cards.some((card) => card.firstDraftStatus === "queued" || card.firstDraftStatus === "running");
    if (!hasActiveDrafts) return;

    const intervalId = window.setInterval(() => {
      void Promise.all([loadRepository(), loadDraftQueueHealth()]);
    }, 20000);

    return () => window.clearInterval(intervalId);
  }, [cards, loadDraftQueueHealth, loadRepository, tenantId]);

  const filteredCards = useMemo(() => {
    const term = search.trim().toLowerCase();
    const baseCards = cards.filter((card) => matchesDraftFactoryDocumentFilter(card, draftFactoryFilter));
    if (!term) return baseCards;

    return baseCards.filter((card) => {
      return [card.title, card.client_name, card.process_number, card.pipelineName, card.stageName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [cards, draftFactoryFilter, search]);

  const draftFactoryCounts = useMemo(() => ({
    all: cards.length,
    queued: cards.filter((card) => card.firstDraftStatus === "queued").length,
    running: cards.filter((card) => card.firstDraftStatus === "running").length,
    completed: cards.filter((card) => card.firstDraftStatus === "completed").length,
    failed: cards.filter((card) => card.firstDraftStatus === "failed").length,
    stale: cards.filter((card) => card.firstDraftStatus === "completed" && isDraftFactoryCardStale(card)).length,
  }), [cards]);

  const handleCreateStructure = async (taskId: string) => {
    setBusyTaskId(taskId);
    try {
      const response = await fetch("/api/integrations/google-drive/process-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível criar a estrutura documental.");
      }

      toast.success(data?.alreadyExists ? "Estrutura documental já existia para este processo." : "Estrutura documental criada no Google Drive.");
      await loadRepository();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível criar a estrutura documental.");
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleSync = async (taskId: string) => {
    setBusyTaskId(taskId);
    try {
      const response = await fetch(`/api/documentos/processos/${taskId}/sync`, {
        method: "POST",
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível sincronizar os documentos.");
      }

      const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
      if (warnings.length > 0) {
        toast.warning(`Sincronização concluída com ${data?.memory?.document_count || 0} documento(s), mas ${warnings.length} item(ns) tiveram leitura parcial.`);
      } else {
        toast.success(`Sincronização concluída com ${data?.memory?.document_count || 0} documento(s).`);
      }
      await loadRepository();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível sincronizar os documentos.");
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleOrganizeRepository = async (taskId: string) => {
    setBusyTaskId(taskId);
    try {
      const response = await fetch(`/api/documentos/processos/${taskId}/organize`, {
        method: "POST",
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível organizar o acervo.");
      }

      const moved = data?.organization?.moved || 0;
      const review = data?.organization?.needsReview || 0;
      const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
      const baseMessage = moved > 0
        ? `Acervo organizado: ${moved} arquivo(s) movido(s) para as pastas jurídicas.`
        : "Acervo analisado. Nenhum arquivo precisou ser movido.";
      setOrganizationStatusByTask((current) => ({
        ...current,
        [taskId]: `${baseMessage} ${review} item(ns) para revisão humana.`,
      }));

      if (warnings.length > 0 || review > 0) {
        toast.warning(`${baseMessage} ${review} item(ns) ficaram para revisão humana.`);
      } else {
        toast.success(baseMessage);
      }

      await loadRepository();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível organizar o acervo.");
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleUploadDocument = async (taskId: string) => {
    const files = uploadFilesByTask[taskId] || [];
    if (files.length === 0) {
      toast.error("Selecione pelo menos um arquivo antes de enviar.");
      return;
    }

    setBusyTaskId(taskId);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      formData.append("folderLabel", uploadFolderByTask[taskId] || "auto");

      const response = await fetch(`/api/documentos/processos/${taskId}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível enviar o documento.");
      }

      const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
      if (data?.uploaded && data?.indexed === false) {
        toast.warning(`${data?.uploadedCount || files.length} documento(s) enviado(s) ao Drive, mas a indexacao no MAYUS falhou. Tente sincronizar novamente.`);
      } else if (warnings.length > 0) {
        toast.warning(`${data?.uploadedCount || files.length} documento(s) enviado(s). O MAYUS indexou o acervo, mas a leitura de alguns itens ficou parcial.`);
      } else {
        toast.success(`${data?.uploadedCount || files.length} documento(s) enviado(s), organizados e sincronizados com sucesso.`);
      }
      setOrganizationStatusByTask((current) => ({
        ...current,
        [taskId]: `${data?.uploadedCount || files.length} documento(s) importado(s). Modo: ${uploadFolderByTask[taskId] === "auto" || !uploadFolderByTask[taskId] ? "organização automática" : "pasta escolhida"}.`,
      }));

      setUploadFilesByTask((current) => ({ ...current, [taskId]: [] }));
      setUploadInputVersionByTask((current) => ({ ...current, [taskId]: (current[taskId] || 0) + 1 }));
      await loadRepository();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível enviar o documento.");
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleGeneratePiece = async (taskId: string) => {
    if (!String(pieceTypeByTask[taskId] || "").trim()) {
      toast.error("Informe qual peça deseja gerar.");
      return;
    }

    setPieceBusyTaskId(taskId);

    try {
      const response = await fetch(`/api/documentos/processos/${taskId}/gerar-peca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pieceType: pieceTypeByTask[taskId] || "Contestacao",
          practiceArea: piecePracticeAreaByTask[taskId] || "",
          objective: pieceObjectiveByTask[taskId] || "",
          instructions: pieceInstructionsByTask[taskId] || "",
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível gerar a peça com base no Drive.");
      }

      setGeneratedPieceByTask((current) => ({
        ...current,
        [taskId]: {
          ...(data as GeneratedPieceResult),
          generationMode: "manual",
        },
      }));
      toast.success("Rascunho jurídico gerado com base no acervo documental.");
    } catch (error: any) {
      console.error("[documentos][gerar-peca]", error);
      toast.error(error?.message || "Não foi possível gerar a peça com base no Drive.");
    } finally {
      setPieceBusyTaskId(null);
    }
  };

  const requestDraftFactory = useCallback(async (taskId: string, options?: { trigger?: DraftFactoryTrigger; quiet?: boolean }) => {
    const trigger = options?.trigger || "manual_draft_factory";

    const response = await fetch(`/api/documentos/processos/${taskId}/draft-factory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (!options?.quiet) {
        throw new Error(data?.error || "Não foi possível executar a Draft Factory jurídica.");
      }
      throw new Error(data?.error || "Falha silenciosa na Draft Factory jurídica.");
    }

    const result = data?.result as GeneratedPieceResult | undefined;
    if (!result?.draftMarkdown) {
      throw new Error("A Draft Factory concluiu sem retornar a minuta final.");
    }

    setGeneratedPieceByTask((current) => ({
      ...current,
      [taskId]: {
        ...result,
        generationMode: "draft_factory",
        draftFactoryTaskId: String(data?.draftFactoryTaskId || ""),
        draftFactoryArtifactId: String(data?.artifactId || ""),
        caseBrainTaskId: String(data?.caseBrainTaskId || ""),
        recommendedPieceInput: typeof data?.recommendedPieceInput === "string" ? data.recommendedPieceInput : null,
        recommendedPieceLabel: typeof data?.recommendedPieceLabel === "string" ? data.recommendedPieceLabel : null,
      },
    }));
    setPieceTypeByTask((current) => ({
      ...current,
      [taskId]: typeof data?.recommendedPieceInput === "string" && data.recommendedPieceInput.trim()
        ? data.recommendedPieceInput
        : result.pieceLabel,
    }));

    if (typeof result.practiceArea === "string" && result.practiceArea.trim()) {
      setPiecePracticeAreaByTask((current) => ({ ...current, [taskId]: result.practiceArea || "" }));
    }

    await Promise.all([
      loadRepository(),
      loadDraftVersions(taskId, { selectCurrent: true }),
      loadDraftQueueHealth(),
    ]);

    return {
      result,
      recommendedPieceLabel: typeof data?.recommendedPieceLabel === "string" ? data.recommendedPieceLabel : null,
      alreadyExisting: data?.alreadyExisting === true,
    };
  }, [loadDraftQueueHealth, loadDraftVersions, loadRepository]);

  const handleGenerateFirstDraft = async (taskId: string) => {
    setPieceBusyTaskId(taskId);

    try {
      const currentCard = cards.find((card) => card.id === taskId) || null;
      const execution = await requestDraftFactory(taskId, { trigger: "manual_draft_factory" });
      if (execution.alreadyExisting) {
        toast.success(`Primeira minuta ${execution.recommendedPieceLabel || execution.result.pieceLabel} já estava disponível.`);
      } else if (currentCard && isDraftFactoryCardStale(currentCard)) {
        toast.success(`Primeira minuta ${execution.recommendedPieceLabel || execution.result.pieceLabel} atualizada com o novo contexto do Case Brain.`);
      } else if (currentCard?.firstDraftStatus === "failed") {
        toast.success(`Retry concluído. Primeira minuta ${execution.recommendedPieceLabel || execution.result.pieceLabel} gerada com sucesso.`);
      } else {
        toast.success(`Primeira minuta ${execution.recommendedPieceLabel || execution.result.pieceLabel} gerada pela Draft Factory.`);
      }
    } catch (error: any) {
      console.error("[documentos][draft-factory]", error);
      toast.error(error?.message || "Não foi possível executar a Draft Factory jurídica.");
    } finally {
      setPieceBusyTaskId(null);
    }
  };

  const handleCopyPiece = async (taskId: string) => {
    const piece = generatedPieceByTask[taskId];
    const draftMarkdown = selectedCard?.id === taskId && selectedDraftVersion
      ? selectedDraftEditorContent
      : piece?.draftMarkdown || "";

    if (!draftMarkdown.trim()) {
      toast.error("Não há rascunho gerado para copiar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(draftMarkdown);
      toast.success("Rascunho copiado para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar o rascunho.");
    }
  };

  const handleDownloadPiece = async (
    taskId: string,
    options?: {
      format?: "docx" | "pdf";
      pieceType?: string | null;
      pieceLabel?: string | null;
      draftMarkdown?: string | null;
      versionId?: string | null;
    }
  ) => {
    const piece = generatedPieceByTask[taskId];
    const draftMarkdown = options?.draftMarkdown || piece?.draftMarkdown || "";
    const pieceType = options?.pieceType || piece?.pieceType || "peca_juridica";
    const pieceLabel = options?.pieceLabel || piece?.pieceLabel || "Peça Jurídica";
    const format = options?.format || "docx";

    if (!draftMarkdown.trim()) {
      toast.error(`Não há rascunho para exportar em ${format === "pdf" ? "PDF" : "Word"}.`);
      return;
    }

    setDownloadBusyTaskId(taskId);

    try {
      const response = await fetch(`/api/documentos/processos/${taskId}/exportar-peca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pieceType,
          pieceLabel,
          draftMarkdown,
          format,
          versionId: options?.versionId || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Não foi possível exportar a peça em ${format === "pdf" ? "PDF" : "Word"}.`);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^\"]+)"?/i);
      const fileName = match?.[1] || `${piece.pieceType}.docx`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success(`Arquivo ${format === "pdf" ? "PDF" : "Word"} baixado com sucesso.`);
    } catch (error: any) {
      toast.error(error?.message || `Não foi possível exportar a peça em ${format === "pdf" ? "PDF" : "Word"}.`);
    } finally {
      setDownloadBusyTaskId(null);
    }
  };

  const handlePublishPremiumArtifact = async (taskId: string, version: ProcessDraftVersion) => {
    const busyKey = `${taskId}:${version.id}`;
    setPremiumPublishBusyKey(busyKey);

    try {
      const response = await fetch(`/api/documentos/processos/${taskId}/exportar-peca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pieceType: version.piece_type || "peca_juridica",
          pieceLabel: version.piece_label || "Peça Jurídica",
          versionId: version.id,
          publishToDrive: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Não foi possível publicar o artifact premium no Drive.");
      }

      const data = await response.json();
      await loadDraftVersions(taskId);
      toast.success(`Artifact premium publicado em ${data?.publication?.driveFolderLabel || "09-Pecas Finais"}.`);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível publicar o artifact premium no Drive.");
    } finally {
      setPremiumPublishBusyKey(null);
    }
  };

  return (
      <div className={`flex-1 min-h-screen relative text-gray-900 dark:text-white p-6 sm:p-10 ${montserrat.className} overflow-hidden`}>
      <datalist id="legal-piece-suggestions">
        {LEGAL_PIECE_SUGGESTIONS.map((option) => (
          <option key={option.value} value={option.value} />
        ))}
      </datalist>
      {/* Premium Background Effects */}
      <div className="absolute inset-0 bg-white dark:bg-[#050505] z-0" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-[#CCA761]/[0.03] blur-[150px] rounded-full pointer-events-none z-0" />
      <div className="absolute bottom-0 right-0 w-[800px] h-[400px] bg-[#4285F4]/[0.02] blur-[120px] rounded-full pointer-events-none z-0" />

      <div className="max-w-[1400px] mx-auto space-y-10 relative z-10">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-4">
          <div className="space-y-4 relative">
            <p className="text-[#CCA761] text-xs uppercase tracking-[0.4em] font-black flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#CCA761] shadow-[0_0_10px_rgba(204,167,97,0.6)] animate-pulse" />
              Inteligência Operacional
            </p>
            <div className="flex items-center gap-6">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-tr from-[#4285F4]/20 to-[#CCA761]/20 rounded-2xl blur-xl group-hover:opacity-100 opacity-60 transition-opacity duration-700" />
                <div className="w-16 h-16 rounded-2xl border border-gray-200 dark:border-white/10 bg-[#0a0f1a]/80 backdrop-blur-xl flex items-center justify-center relative shadow-[0_0_30px_rgba(0,0,0,0.5)] overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                  <GoogleDriveLogo size={32} className="h-[32px] w-[32px] relative z-10 drop-shadow-[0_0_15px_rgba(66,133,244,0.3)]" />
                </div>
              </div>
              <div>
                <h1 className={`text-4xl md:text-5xl text-gray-900 dark:text-white tracking-widest ${cormorant.className} drop-shadow-xl font-bold`}>
                  Repositório de <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#CCA761] via-[#e2c78d] to-[#CCA761] animate-[pulse_4s_ease-in-out_infinite]">Documentos</span>
                </h1>
                <p className="text-gray-400 text-sm max-w-2xl leading-relaxed mt-2 font-medium">
                  Visualize a estrutura documental de cada processo, orquestre o Google Drive oficial do caso e sincronize a memória mínima que alimenta o cérebro jurídico do <span className="text-gray-900 dark:text-white font-bold tracking-widest">MAYUS</span>.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative min-w-[320px] group">
              <div className="absolute inset-0 bg-gradient-to-r from-[#CCA761]/10 to-transparent blur-md opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 rounded-xl" />
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#CCA761] transition-colors z-10" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente, processo ou pipeline..."
                className="relative w-full bg-white dark:bg-[#0a0a0a]/80 backdrop-blur-md border border-gray-200 dark:border-white/10 hover:border-gray-300 dark:border-white/20 rounded-xl pl-12 pr-4 py-3.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/40 focus:bg-gray-100 dark:bg-[#111]/90 focus:shadow-[0_0_20px_rgba(204,167,97,0.08)] transition-all placeholder:text-gray-600 font-medium"
              />
            </div>
            <button
              type="button"
              onClick={loadRepository}
              className="relative overflow-hidden group px-6 py-3.5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0a0a0a]/80 backdrop-blur-md hover:bg-gray-100 dark:bg-white/5 hover:border-[#CCA761]/30 text-xs font-black uppercase tracking-[0.2em] text-gray-900 dark:text-white flex items-center justify-center gap-3 transition-all duration-300"
            >
              <div className="absolute inset-0 bg-[#CCA761] opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300" />
              <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-700 text-[#CCA761]" /> Atualizar
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.22em] text-gray-500 font-black mr-2">Filtro da Draft Factory</span>
          {[
            { value: "all", label: "Todas", count: draftFactoryCounts.all },
            { value: "queued", label: "Em fila", count: draftFactoryCounts.queued },
            { value: "running", label: "Gerando", count: draftFactoryCounts.running },
            { value: "completed", label: "Prontas", count: draftFactoryCounts.completed },
            { value: "failed", label: "Falhas", count: draftFactoryCounts.failed },
          ].map((option) => {
            const active = draftFactoryFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setDraftFactoryFilter(option.value as DraftFactoryDocumentFilter)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${active ? "border-[#CCA761]/35 bg-[#CCA761]/10 text-[#CCA761]" : "border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-[#111] text-gray-400 hover:text-gray-900 dark:text-white hover:bg-gray-100 dark:bg-white/5"}`}
              >
                <span>{option.label}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] ${active ? "bg-[#CCA761]/10 text-[#CCA761]" : "bg-gray-100 dark:bg-white/5 text-gray-500"}`}>
                  {option.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dashboard Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          <div className="group relative overflow-hidden bg-gradient-to-b from-[#0f0f0f] to-[#080808] border border-gray-200 dark:border-white/5 hover:border-[#CCA761]/20 rounded-2xl p-6 transition-all duration-500 hover:shadow-[0_0_30px_rgba(204,167,97,0.05)]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCA761]/5 blur-[50px] rounded-full group-hover:bg-[#CCA761]/10 transition-colors duration-500" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-center group-hover:border-[#CCA761]/30 transition-colors">
                  <FolderTree size={14} className="text-[#CCA761]" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-black">Processos</p>
              </div>
              <p className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">{cards.length}</p>
              <p className="text-xs text-gray-500 mt-2 font-medium">Monitorados no sistema</p>
            </div>
          </div>

          <div className="group relative overflow-hidden bg-gradient-to-b from-[#0f0f0f] to-[#080808] border border-gray-200 dark:border-white/5 hover:border-[#4285F4]/20 rounded-2xl p-6 transition-all duration-500 hover:shadow-[0_0_30px_rgba(66,133,244,0.05)]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#4285F4]/5 blur-[50px] rounded-full group-hover:bg-[#4285F4]/10 transition-colors duration-500" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#4285F4]/10 border border-[#4285F4]/20 flex items-center justify-center group-hover:border-[#4285F4]/40 transition-colors">
                  <GoogleDriveLogo size={14} className="opacity-90" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#8ab4ff] font-black">Estruturas do Drive</p>
              </div>
              <p className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">{cards.filter((card) => card.drive_structure_ready).length}</p>
              <p className="text-xs text-gray-500 mt-2 font-medium">Prontas para sincronização</p>
            </div>
          </div>

          <div className="group relative overflow-hidden bg-gradient-to-b from-[#0f0f0f] to-[#080808] border border-gray-200 dark:border-white/5 hover:border-[#CCA761]/20 rounded-2xl p-6 transition-all duration-500 hover:shadow-[0_0_30px_rgba(204,167,97,0.05)]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCA761]/5 blur-[50px] rounded-full group-hover:bg-[#CCA761]/10 transition-colors duration-500" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#CCA761]/10 border border-[#CCA761]/20 flex items-center justify-center group-hover:border-[#CCA761]/40 transition-colors">
                  <FileIcon size={14} className="text-[#CCA761]" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#e2c78d] font-black">Documentos</p>
              </div>
              <p className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">{cards.reduce((acc, card) => acc + card.documentCount, 0)}</p>
              <p className="text-xs text-gray-500 mt-2 font-medium">Sincronizados com a IA</p>
            </div>
          </div>

          <div className="group relative overflow-hidden bg-gradient-to-b from-[#0f0f0f] to-[#080808] border border-gray-200 dark:border-white/5 hover:border-emerald-500/20 rounded-2xl p-6 transition-all duration-500 hover:shadow-[0_0_30px_rgba(16,185,129,0.05)]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-[50px] rounded-full group-hover:bg-emerald-500/10 transition-colors duration-500" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center group-hover:border-emerald-500/40 transition-colors">
                  <Sparkles size={14} className="text-emerald-300" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-emerald-200 font-black">Draft Factory</p>
              </div>
              <p className="text-4xl font-black text-gray-900 dark:text-white tracking-tight">{Math.max(draftFactoryCounts.completed - draftFactoryCounts.stale, 0)}</p>
              <p className="text-xs text-gray-500 mt-2 font-medium">
                {draftFactoryCounts.running + draftFactoryCounts.queued} em fluxo • {draftFactoryCounts.stale} desatualizadas • {draftFactoryCounts.failed} com falha
              </p>
            </div>
          </div>
        </div>

        {draftQueueHealth && (
          <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr] gap-5">
            <div className="rounded-2xl border border-white/8 bg-[#0b0b0b] p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Saúde da fila headless</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-2 leading-relaxed">
                    Telemetria operacional da Draft Factory com alertas de backlog, travamento e falhas repetidas.
                  </p>
                </div>
                <span className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-black">
                  Atualizado {formatDateTime(draftQueueHealth.generatedAt)}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Em fila", value: draftQueueHealth.counts.queued, tone: "text-gray-900 dark:text-white border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5" },
                  { label: "Gerando", value: draftQueueHealth.counts.running, tone: "text-[#CCA761] border-[#CCA761]/20 bg-[#CCA761]/10" },
                  { label: "Travadas", value: draftQueueHealth.stuckRunningCount, tone: "text-red-200 border-red-500/20 bg-red-500/10" },
                  { label: "Falhas 24h", value: draftQueueHealth.repeatedFailureCount, tone: "text-amber-200 border-amber-500/20 bg-amber-500/10" },
                ].map((item) => (
                  <div key={item.label} className={`rounded-xl border px-4 py-3 ${item.tone}`}>
                    <p className="text-[10px] uppercase tracking-[0.18em] font-black">{item.label}</p>
                    <p className="mt-2 text-2xl font-black">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-gray-400">
                <div className="rounded-xl border border-gray-200 dark:border-white/5 bg-gray-200 dark:bg-black/20 px-4 py-3">
                  Fila mais antiga: <span className="text-gray-900 dark:text-white font-semibold">{draftQueueHealth.oldestQueuedMinutes !== null ? `${draftQueueHealth.oldestQueuedMinutes} min` : "sem backlog"}</span>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-white/5 bg-gray-200 dark:bg-black/20 px-4 py-3">
                  Running mais antigo: <span className="text-gray-900 dark:text-white font-semibold">{draftQueueHealth.oldestRunningMinutes !== null ? `${draftQueueHealth.oldestRunningMinutes} min` : "sem execuções"}</span>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-white/5 bg-gray-200 dark:bg-black/20 px-4 py-3">
                  Minutas stale: <span className="text-gray-900 dark:text-white font-semibold">{draftQueueHealth.counts.staleCompleted}</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Alertas ativos</p>
                {draftQueueHealth.alerts.length > 0 ? (
                  <div className="space-y-2">
                    {draftQueueHealth.alerts.slice(0, 5).map((alert) => (
                      <div
                        key={`${alert.code}-${alert.processTaskId || alert.message}`}
                        className={`rounded-xl border px-4 py-3 text-xs leading-relaxed ${alert.severity === "critical" ? "border-red-500/20 bg-red-500/10 text-red-200" : "border-amber-500/20 bg-amber-500/10 text-amber-100"}`}
                      >
                        {alert.message}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-200 leading-relaxed">
                    Nenhum alerta crítico no momento. A fila headless está operando dentro do esperado.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/8 bg-[#0b0b0b] p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">Falhas recentes</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">Últimos processos que pedem retry ou investigação.</p>
                </div>
                <AlertTriangle size={16} className="text-amber-300" />
              </div>

              {draftQueueHealth.recentFailures.length > 0 ? (
                <div className="space-y-3">
                  {draftQueueHealth.recentFailures.map((failure) => (
                    <div key={failure.processTaskId} className="rounded-xl border border-gray-200 dark:border-white/5 bg-gray-200 dark:bg-black/20 px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{failure.title}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {failure.clientName || "Cliente não identificado"}
                        {failure.updatedAt ? ` · ${formatDateTime(failure.updatedAt)}` : ""}
                      </p>
                      <p className="mt-2 text-xs text-red-200 leading-relaxed">{failure.error || "Falha sem mensagem detalhada."}</p>
                      <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-amber-300 font-black">
                        {failure.failuresLast24h > 0 ? `${failure.failuresLast24h} falha(s) nas últimas 24h` : "Falha atual pendente de retry"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/10 bg-gray-200 dark:bg-black/20 px-4 py-3 text-xs text-gray-500 leading-relaxed">
                  Nenhuma falha recente registrada para a Draft Factory deste tenant.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Donna Banner */}
        <Link
          href="/dashboard/documentos/acervo"
          className="relative block w-full rounded-2xl overflow-hidden p-[1px] group transition-all duration-500 hover:shadow-[0_0_40px_rgba(204,167,97,0.12)]"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#CCA761]/0 via-[#CCA761]/40 to-[#CCA761]/0 opacity-30 group-hover:opacity-100 transition-opacity duration-1000 animate-[pulse_3s_ease-in-out_infinite] blur" />
          <div className="relative bg-[#070707] rounded-[15px] p-8 flex flex-col md:flex-row items-center justify-between border border-[#CCA761]/20">
            <div className="flex items-center gap-6 mb-6 md:mb-0">
              <div className="relative">
                <div className="absolute inset-0 bg-[#CCA761] blur-md opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
                <div className="w-16 h-16 rounded-full bg-white dark:bg-[#0a0a0a] border border-[#CCA761]/40 flex items-center justify-center relative shadow-[0_0_20px_rgba(204,167,97,0.15)] group-hover:border-[#CCA761] transition-colors">
                  <Sparkles size={24} className="text-[#CCA761]" />
                </div>
              </div>
              <div>
                <h3 className={`text-3xl text-gray-900 dark:text-white ${cormorant.className} flex items-center gap-3 font-bold tracking-wide`}>
                  Acessar Acervo <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#CCA761] to-[#f4dca6] font-black uppercase tracking-[0.2em] ml-1">MAYUS</span>
                </h3>
                <p className="text-sm text-[#CCA761]/70 mt-1 font-medium tracking-wide">Modelos processuais premium, base de conhecimento e diretrizes da IA Jurídica especializada.</p>
              </div>
            </div>
            <div className="relative overflow-hidden group/btn px-8 py-4 bg-white dark:bg-[#0a0a0a] border border-[#CCA761]/30 hover:border-[#CCA761] text-[#CCA761] text-xs font-black uppercase tracking-[0.25em] rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_rgba(204,167,97,0.2)]">
              <div className="absolute inset-0 bg-[#CCA761]/10 -translate-x-full group-hover/btn:translate-x-0 transition-transform duration-500 ease-out" />
              <span className="relative z-10">Explorar Modelos</span>
            </div>
          </div>
        </Link>

        {isLoading ? (
          <div className="bg-white dark:bg-[#0a0a0a]/80 backdrop-blur-md border border-gray-200 dark:border-white/5 rounded-3xl p-16 flex flex-col items-center justify-center gap-5">
            <div className="relative">
              <div className="absolute inset-0 bg-[#CCA761]/20 blur-xl rounded-full animate-pulse" />
              <Loader2 size={32} className="animate-spin text-[#CCA761] relative z-10" />
            </div>
            <p className="text-sm text-[#CCA761] uppercase tracking-[0.3em] font-black animate-pulse">Carregando Acervo Operacional...</p>
          </div>
        ) : filteredCards.length === 0 ? (
          <div data-testid="documents-empty-state" className="bg-white dark:bg-[#0a0a0a]/80 backdrop-blur-md border border-gray-200 dark:border-white/5 rounded-3xl p-16 text-center space-y-5 shadow-inner">
            <div className="w-20 h-20 mx-auto rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 flex items-center justify-center mb-4">
              <FolderTree size={32} className="text-[#CCA761]/60" />
            </div>
            <h2 className={`text-3xl text-gray-900 dark:text-white ${cormorant.className} font-bold`}>Nenhum processo encontrado no repositório</h2>
            <p className="text-sm text-gray-400 max-w-xl mx-auto leading-relaxed">
              Crie ou salve processos no seu funil primeiro. Assim que o card existir, a plataforma <span className="text-[#CCA761] font-bold">MAYUS</span> poderá iniciar a gestão documental avançada no Google Drive.
            </p>
          </div>
        ) : (
          <div data-testid="documents-card-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCards.map((card) => {
              const hasStructure = Boolean(card.drive_structure_ready && card.drive_folder_id && card.drive_link);
              const draftBadge = getDraftFactoryCardBadge(card);
              const draftQuickAction = getDraftFactoryCardQuickAction(card);

              return (
                <button
                  key={card.id}
                  onClick={() => setSelectedCardId(card.id)}
                  data-testid={`documents-card-${card.id}`}
                  className="group bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-white/5 hover:border-[#CCA761]/30 rounded-2xl p-4 transition-all duration-300 hover:shadow-[0_10px_30px_rgba(204,167,97,0.05)] relative flex flex-col text-left"
                >
                  <div className="flex items-center justify-between w-full mb-3">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-[#CCA761] font-black flex items-center gap-1.5 truncate">
                      {card.pipelineName || "Pipeline"}
                    </p>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${hasStructure ? 'bg-[#4285F4] shadow-[0_0_8px_rgba(66,133,244,0.6)]' : 'bg-amber-500'}`} />
                  </div>
                  
                  <h2 data-testid={`documents-card-title-${card.id}`} className={`text-base font-bold text-gray-900 dark:text-white leading-tight ${cormorant.className} tracking-wide truncate w-full mb-1 group-hover:text-[#CCA761] transition-colors`}>
                    {card.title}
                  </h2>
                  <p className="text-[10px] text-gray-500 font-medium tracking-wide truncate w-full mb-4">
                    {card.client_name || "Sem cliente"} {card.process_number ? `• ${card.process_number}` : ""}
                  </p>

                  {draftBadge && (
                    <div className="mb-4 flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[9px] font-black uppercase tracking-widest ${draftBadge.className}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${draftBadge.dotClassName}`} />
                        {draftBadge.label}
                      </span>
                    </div>
                  )}

                  {draftQuickAction && (
                    <div className="mb-4 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedCardId(card.id);
                        }}
                        data-testid={`documents-card-quick-action-${card.id}`}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${draftQuickAction.className}`}
                      >
                        <ChevronRight size={12} />
                        {draftQuickAction.label}
                      </button>
                    </div>
                  )}

                  <div className="mt-auto flex items-center justify-between w-full pt-3 border-t border-gray-200 dark:border-white/5 group-hover:border-[#CCA761]/20 transition-colors">
                    <div className="flex items-center gap-2">
                       <p className="text-[10px] font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-[#111] px-2 py-1 rounded-md border border-gray-200 dark:border-white/5">
                         {card.documentCount} docs
                       </p>
                       <p className="text-[9px] font-bold text-[#CCA761] uppercase tracking-wider hidden sm:block">
                         {card.syncStatus}
                       </p>
                    </div>
                    <ChevronRight size={14} className="text-gray-600 group-hover:text-[#CCA761] group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedCard && (
          <motion.div
            key="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedCardId(null)}
            className="fixed inset-0 bg-gray-200 dark:bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              data-testid="documents-detail-modal"
              className="w-full max-w-[1380px] max-h-[92vh] overflow-y-auto no-scrollbar z-[101] outline-none"
            >
              <div className="group/card bg-white dark:bg-[#0a0a0a] border border-[#CCA761]/30 rounded-[28px] p-6 sm:p-8 relative flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_0_1px_rgba(204,167,97,0.15)] m-1 sm:m-4">
                {/* Modal close button */}
                <button
                  onClick={() => setSelectedCardId(null)}
                  aria-label="Fechar detalhes do processo"
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-400 hover:text-gray-900 dark:text-white transition-colors z-20"
                >
                  <X size={16} />
                </button>

                {/* Subtle top gradient line */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CCA761]/40 to-transparent" />
                
                <div className="flex items-start justify-between gap-3 mb-5 pr-8">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#CCA761] font-black flex items-center gap-1.5">
                      {selectedCard.pipelineName || "Pipeline"}
                      {selectedCard.stageName ? <><span className="w-1 h-1 rounded-full bg-[#CCA761]/50" /> {selectedCard.stageName}</> : ""}
                    </p>
                    <h2 data-testid="documents-detail-title" className={`text-2xl font-bold text-gray-900 dark:text-white leading-tight ${cormorant.className} tracking-wide`}>{selectedCard.title}</h2>
                    <p className="text-[12px] text-gray-400 font-medium tracking-wide">
                      {selectedCard.client_name || "Sem cliente"}
                      {selectedCard.process_number ? ` • ${selectedCard.process_number}` : ""}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
                  <div className="bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-xl p-3 sm:p-4">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1.5">Docs</p>
                    <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white">{selectedCard.documentCount}</p>
                  </div>
                  <div className="bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-xl p-3 sm:p-4">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1.5">Status</p>
                    <p className="text-[11px] font-bold text-[#CCA761] capitalize truncate mt-1">{selectedCard.syncStatus}</p>
                  </div>
                  <div className="bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-xl p-3 sm:p-4">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1.5">Sync</p>
                    <p className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 mt-1 uppercase truncate">{formatDateTime(selectedCard.lastSyncedAt).split(',')[0]}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-5 items-start">
                  <div className="space-y-5 xl:sticky xl:top-0">
                    <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-gray-200 dark:border-white/5 rounded-xl p-5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#CCA761]/10 blur-2xl rounded-full" />
                      <div className="flex items-center gap-2 text-[#CCA761] text-[10px] uppercase tracking-[0.3em] font-black mb-3 pr-2">
                        <Sparkles size={14} /> Memória Base
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed font-medium relative z-10">
                        {selectedCard.summaryMaster || "Estrutura documental aguardando orquestração inicial. Sincronize o Drive para processar a taxonomia."}
                      </p>
                      {selectedCard.missingDocuments.length > 0 && (
                        <div className="mt-4 flex items-start gap-2.5 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 relative z-10">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" />
                          <div>
                            <strong className="block text-amber-400 font-bold mb-1 uppercase tracking-wider text-[10px]">Análise da IA: Documentos Faltantes</strong>
                            {selectedCard.missingDocuments.join(", ")}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="bg-[#0f0f0f] border border-gray-200 dark:border-white/5 rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[#CCA761] text-[10px] uppercase tracking-[0.3em] font-black">
                          <Sparkles size={12} /> Orquestrador de Peças
                        </div>
                        {generatedPieceByTask[selectedCard.id] && (
                          <span className="text-[10px] uppercase tracking-[0.24em] text-gray-500 font-black text-right">
                            {generatedPieceByTask[selectedCard.id]?.provider} • {generatedPieceByTask[selectedCard.id]?.model}
                          </span>
                        )}
                      </div>

                      <div className="rounded-xl border border-[#CCA761]/20 bg-gradient-to-br from-[#CCA761]/10 to-transparent p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.22em] text-[#CCA761] font-black">Draft Factory Juridica</p>
                            <p className="text-xs text-gray-700 dark:text-gray-300 mt-2 leading-relaxed">
                              Usa o `draft plan` do Case Brain, reaproveita o motor jurídico atual e aplica controles de fonte antes da primeira minuta.
                            </p>
                          </div>

                          {selectedCard.autoDraftFactoryEnabled && (
                            <span className="shrink-0 rounded-full border border-[#CCA761]/25 bg-[#CCA761]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[#CCA761]">
                              Auto ativo
                            </span>
                          )}
                        </div>

                        {selectedCard.draftPlan ? (
                          <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-[#101010] p-4 space-y-2">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Peça sugerida pelo Case Brain</p>
                            <p className="text-sm text-gray-900 dark:text-white font-semibold">
                              {selectedCard.draftPlan.recommendedPieceLabel || selectedCard.draftPlan.recommendedPieceInput || "Peça não definida"}
                            </p>

                            {selectedCard.draftPlan.firstActions.length > 0 && (
                              <p className="text-xs text-gray-400 leading-relaxed">
                                {selectedCard.draftPlan.firstActions[0]}
                              </p>
                            )}

                            {selectedCard.draftPlan.missingDocuments.length > 0 && (
                              <p className="text-xs text-amber-300 leading-relaxed">
                                Pendências atuais: {selectedCard.draftPlan.missingDocuments.join(", ")}
                              </p>
                            )}

                            <div className="rounded-xl border border-gray-200 dark:border-white/5 bg-gray-200 dark:bg-black/20 px-3 py-3 text-[11px] text-gray-400 leading-relaxed space-y-1">
                              <p>
                                Validação externa: lei {selectedCard.draftPlan.readyForLawCitations ? "ok" : "pendente"} ({selectedCard.draftPlan.validatedLawReferenceCount}) · jurisprudência {selectedCard.draftPlan.readyForCaseLawCitations ? "ok" : "pendente"} ({selectedCard.draftPlan.validatedCaseLawReferenceCount})
                              </p>
                              {selectedCard.draftPlan.pendingValidationCount > 0 && (
                                <p className="text-amber-200">
                                  Ainda existem {selectedCard.draftPlan.pendingValidationCount} validação(ões) externa(s) pendentes antes de tratar citações como seguras.
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/10 bg-[#101010] px-4 py-3 text-xs text-gray-500 leading-relaxed">
                            O Case Brain ainda não publicou o `draft plan` deste processo. A Draft Factory automática só dispara depois dessa etapa.
                          </div>
                        )}

                        {selectedCard.autoDraftFactoryEnabled && selectedCard.draftPlan && (
                          <p className="text-[11px] text-gray-400 leading-relaxed">
                            Com a automação ativa, o MAYUS enfileira esta primeira minuta em background assim que o evento `case_brain_draft_plan_ready` for concluído.
                          </p>
                        )}

                        {selectedCardDraftStale && selectedCard.firstDraftStatus === "completed" && (
                          <div data-testid={`documents-first-draft-stale-${selectedCard.id}`} className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 leading-relaxed">
                            O Case Brain deste processo foi atualizado depois da última minuta. A versão abaixo ainda é útil para referência, mas já está desatualizada e deve ser regenerada.
                          </div>
                        )}

                        {selectedCardDraftStale && (selectedCard.firstDraftStatus === "queued" || selectedCard.firstDraftStatus === "running") && generatedPieceByTask[selectedCard.id]?.draftMarkdown && (
                          <div data-testid={`documents-first-draft-stale-${selectedCard.id}`} className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 leading-relaxed">
                            Um novo Case Brain já pediu atualização desta minuta. Enquanto a nova execução não termina, a versão anterior continua visível abaixo para consulta.
                          </div>
                        )}

                        {selectedCard.firstDraftStatus === "queued" && (
                          <div data-testid={`documents-first-draft-status-${selectedCard.id}`} className="rounded-xl border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 px-4 py-3 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                            {selectedCardDraftStale && generatedPieceByTask[selectedCard.id]?.draftMarkdown
                              ? "A atualização da primeira minuta foi enfileirada e aguarda a próxima execução headless da Draft Factory."
                              : "A primeira minuta foi enfileirada e aguarda a próxima execução headless da Draft Factory."}
                          </div>
                        )}

                        {selectedCard.firstDraftStatus === "running" && (
                          <div data-testid={`documents-first-draft-status-${selectedCard.id}`} className="rounded-xl border border-[#CCA761]/20 bg-[#CCA761]/10 px-4 py-3 text-xs text-[#CCA761] leading-relaxed">
                            {selectedCardDraftStale && generatedPieceByTask[selectedCard.id]?.draftMarkdown
                              ? "A Draft Factory está atualizando esta primeira minuta com o novo contexto do Case Brain agora."
                              : "A Draft Factory está processando esta primeira minuta agora."}
                          </div>
                        )}

                        {selectedCard.firstDraftStatus === "completed" && selectedCard.firstDraftSummary && (
                          <div data-testid={`documents-first-draft-status-${selectedCard.id}`} className={`rounded-xl px-4 py-3 text-xs leading-relaxed ${selectedCardDraftStale ? "border border-amber-500/20 bg-amber-500/10 text-amber-100" : "border border-emerald-500/20 bg-emerald-500/10 text-emerald-200"}`}>
                            {selectedCard.firstDraftSummary}
                          </div>
                        )}

                        {(draftVersionsLoadingTaskId === selectedCard.id || selectedCardVersions.length > 0) && (
                          <div className="rounded-xl border border-gray-200 dark:border-white/10 bg-[#0b0b0b] p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Revisão jurídica formal</p>
                                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                                  Histórico versionado da minuta com aprovação formal e publicação controlada.
                                </p>
                              </div>

                              {selectedDraftVersion && (
                                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${getDraftWorkflowBadge(selectedDraftVersion.workflow_status)}`}>
                                  {selectedDraftVersion.workflow_status}
                                </span>
                              )}
                            </div>

                            {draftVersionsLoadingTaskId === selectedCard.id && selectedCardVersions.length === 0 ? (
                              <div className="flex items-center gap-2 text-xs text-gray-400">
                                <Loader2 size={12} className="animate-spin" /> Carregando histórico formal...
                              </div>
                            ) : selectedDraftVersion ? (
                              <>
                                <div className="rounded-xl border border-gray-200 dark:border-white/5 bg-gray-200 dark:bg-black/30 p-3 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                                  <p className="text-gray-900 dark:text-white font-semibold">
                                    V{selectedDraftVersion.version_number} · {selectedDraftVersion.piece_label || selectedCard.draftPlan?.recommendedPieceLabel || "Minuta jurídica"}
                                  </p>
                                  <p className="mt-1 text-gray-400">
                                    Criada em {formatDateTime(selectedDraftVersion.created_at)}
                                    {selectedDraftVersion.approved_at ? ` · aprovada em ${formatDateTime(selectedDraftVersion.approved_at)}` : ""}
                                    {selectedDraftVersion.published_at ? ` · publicada em ${formatDateTime(selectedDraftVersion.published_at)}` : ""}
                                  </p>
                                  {selectedDraftVersion.summary && (
                                    <p className="mt-2 text-gray-700 dark:text-gray-300">{selectedDraftVersion.summary}</p>
                                  )}
                                </div>

                                {selectedDraftVersionStale && (
                                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 leading-relaxed">
                                    Esta versão foi gerada com um `Case Brain` anterior e não pode mais ser aprovada ou publicada como versão vigente.
                                  </div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                  {canFormallyReviewDraft && selectedDraftVersion.workflow_status === "draft" && (
                                    <button
                                      type="button"
                                      onClick={() => handleDraftWorkflowAction(selectedCard.id, selectedDraftVersion.id, "approve")}
                                      data-testid={`documents-approve-version-${selectedDraftVersion.id}`}
                                      disabled={selectedDraftVersionStale || selectedCurrentDraftHasUnsavedChanges || draftWorkflowBusyKey === `${selectedCard.id}:${selectedDraftVersion.id}:approve`}
                                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200 disabled:opacity-50"
                                    >
                                      {draftWorkflowBusyKey === `${selectedCard.id}:${selectedDraftVersion.id}:approve` ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                      Aprovar Versão
                                    </button>
                                  )}

                                  {canFormallyReviewDraft && selectedDraftVersion.workflow_status !== "published" && selectedDraftVersion.workflow_status !== "draft" && (
                                    <button
                                      type="button"
                                      onClick={() => handleDraftWorkflowAction(selectedCard.id, selectedDraftVersion.id, "publish")}
                                      data-testid={`documents-publish-version-${selectedDraftVersion.id}`}
                                      disabled={selectedDraftVersionStale || selectedCurrentDraftHasUnsavedChanges || draftWorkflowBusyKey === `${selectedCard.id}:${selectedDraftVersion.id}:publish`}
                                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-sky-200 disabled:opacity-50"
                                    >
                                      {draftWorkflowBusyKey === `${selectedCard.id}:${selectedDraftVersion.id}:publish` ? <Loader2 size={12} className="animate-spin" /> : <ExternalLink size={12} />}
                                      Publicar Versão
                                    </button>
                                  )}

                                  {selectedDraftVersion.workflow_status === "published" && (
                                    <span className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-sky-200">
                                      Publicação vigente
                                    </span>
                                  )}

                                  {selectedDraftVersion.workflow_status === "published" && (
                                    <button
                                      type="button"
                                      onClick={() => handleDownloadPiece(selectedCard.id, {
                                        format: "pdf",
                                        pieceType: selectedDraftVersion.piece_type,
                                        pieceLabel: selectedDraftVersion.piece_label,
                                        draftMarkdown: selectedDraftVersion.draft_markdown,
                                        versionId: selectedDraftVersion.id,
                                      })}
                                      data-testid={`documents-download-pdf-${selectedDraftVersion.id}`}
                                      disabled={downloadBusyTaskId === selectedCard.id || selectedCurrentDraftHasUnsavedChanges}
                                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-violet-100 disabled:opacity-50"
                                    >
                                      {downloadBusyTaskId === selectedCard.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                                      Baixar PDF Premium
                                    </button>
                                  )}

                                  {canFormallyReviewDraft && selectedDraftVersion.workflow_status === "published" && (
                                    <button
                                      type="button"
                                      onClick={() => handlePublishPremiumArtifact(selectedCard.id, selectedDraftVersion)}
                                      data-testid={`documents-publish-premium-${selectedDraftVersion.id}`}
                                      disabled={selectedCurrentDraftHasUnsavedChanges || premiumPublishBusyKey === `${selectedCard.id}:${selectedDraftVersion.id}`}
                                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#CCA761]/25 bg-[#CCA761]/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#e9d5a7] disabled:opacity-50"
                                    >
                                      {premiumPublishBusyKey === `${selectedCard.id}:${selectedDraftVersion.id}` ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                      {selectedDraftPremiumPublication?.webViewLink ? "Atualizar Artifact Premium" : "Publicar Artifact Premium"}
                                    </button>
                                  )}

                                  {selectedDraftVersion.workflow_status === "published" && selectedDraftPremiumPublication?.webViewLink && (
                                    <a
                                      href={selectedDraftPremiumPublication.webViewLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      data-testid={`documents-open-premium-${selectedDraftVersion.id}`}
                                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-white/15 bg-gray-100 dark:bg-white/5 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/85"
                                    >
                                      <ExternalLink size={12} />
                                      Abrir Artifact Premium
                                    </a>
                                  )}
                                </div>

                                {selectedCurrentDraftHasUnsavedChanges && (
                                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 leading-relaxed">
                                    Existem alteracoes nao salvas no editor formal. Salve uma nova versao antes de aprovar, publicar ou exportar o texto oficial.
                                  </div>
                                )}

                                {selectedDraftVersion.workflow_status === "published" && selectedDraftPremiumPublication && (
                                  <div className="rounded-xl border border-[#CCA761]/20 bg-[#CCA761]/10 px-4 py-3 text-xs text-[#f3e4bf] leading-relaxed">
                                    Artifact premium em {selectedDraftPremiumPublication.format?.toUpperCase() || "PDF"}
                                    {selectedDraftPremiumPublication.fileName ? `: ${selectedDraftPremiumPublication.fileName}` : ""}
                                    {selectedDraftPremiumPublication.driveFolderLabel ? ` · pasta ${selectedDraftPremiumPublication.driveFolderLabel}` : ""}
                                    {selectedDraftPremiumPublication.publishedAt ? ` · publicado em ${formatDateTime(selectedDraftPremiumPublication.publishedAt)}` : ""}
                                  </div>
                                )}

                                {selectedDraftVersion.workflow_status === "published" && selectedDraftLearningLoopCapture && (
                                  <div
                                    data-testid={`documents-learning-loop-capture-${selectedDraftVersion.id}`}
                                    className={`rounded-xl px-4 py-3 text-xs leading-relaxed ${selectedDraftLearningLoopCapture.changed ? "border border-sky-500/20 bg-sky-500/10 text-sky-100" : "border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 text-gray-700 dark:text-gray-300"}`}
                                  >
                                    <p className="font-semibold uppercase tracking-[0.18em] text-[10px] mb-2">Learning Loop Capture</p>
                                    <p>
                                      {selectedDraftLearningLoopCapture.summary || "Nenhum delta material foi capturado nesta publicação."}
                                    </p>
                                    <p className="mt-2 text-[11px] opacity-80">
                                      Baseline {selectedDraftLearningLoopCapture.sourceLabel || selectedDraftLearningLoopCapture.sourceKind || "indisponível"}
                                      {selectedDraftLearningLoopCapture.categories.length > 0 ? ` · sinais ${selectedDraftLearningLoopCapture.categories.join(", ")}` : ""}
                                      {selectedDraftLearningLoopCapture.changeRatio > 0 ? ` · ${Math.round(selectedDraftLearningLoopCapture.changeRatio * 100)}% de variação estimada` : ""}
                                    </p>
                                  </div>
                                )}

                                {selectedDraftPromotionCandidate && (
                                  <div
                                    data-testid={`documents-promotion-candidate-${selectedDraftVersion.id}`}
                                    className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-100 leading-relaxed"
                                  >
                                    <p className="font-semibold uppercase tracking-[0.18em] text-[10px] mb-2">Candidato de Padrão Supervisionado</p>
                                    <p>
                                      {selectedDraftPromotionCandidate.summary || "Um candidato supervisionavel foi preparado a partir desta revisao humana."}
                                    </p>
                                    <p className="mt-2 opacity-80">
                                      Status {selectedDraftPromotionCandidate.status || "pending_supervision"}
                                      {selectedDraftPromotionCandidate.confidence ? ` · confianca ${selectedDraftPromotionCandidate.confidence}` : ""}
                                      {selectedDraftPromotionCandidate.candidateTypes.length > 0 ? ` · destinos ${selectedDraftPromotionCandidate.candidateTypes.join(", ")}` : ""}
                                    </p>
                                  </div>
                                )}

                                <div className="space-y-2">
                                  <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black">Histórico de versões</p>
                                  <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                                    {selectedCardVersions.map((version) => {
                                      const isSelectedVersion = selectedDraftVersion.id === version.id;
                                      return (
                                        <button
                                          key={version.id}
                                          type="button"
                                          onClick={() => handleSelectDraftVersion(selectedCard.id, version)}
                                          data-testid={`documents-draft-version-${version.id}`}
                                          className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${isSelectedVersion ? "border-[#CCA761]/35 bg-[#CCA761]/10" : "border-gray-200 dark:border-white/5 bg-gray-200 dark:bg-black/20 hover:bg-gray-100 dark:bg-white/5"}`}
                                        >
                                          <div className="flex items-center justify-between gap-3">
                                            <div>
                                              <p className="text-xs font-semibold text-gray-900 dark:text-white">V{version.version_number} · {version.piece_label || "Minuta jurídica"}</p>
                                              <p className="mt-1 text-[11px] text-gray-400">{formatDateTime(version.created_at)}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              {version.is_current && (
                                                <span className="rounded-full border border-[#CCA761]/20 bg-[#CCA761]/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[#CCA761]">Atual</span>
                                              )}
                                              <span className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-widest ${getDraftWorkflowBadge(version.workflow_status)}`}>
                                                {version.workflow_status}
                                              </span>
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/10 bg-gray-200 dark:bg-black/20 px-4 py-3 text-xs text-gray-500 leading-relaxed">
                                O histórico formal ainda será criado quando a primeira minuta versionada for registrada.
                              </div>
                            )}
                          </div>
                        )}

                        {selectedCard.firstDraftStatus === "completed" && generatedPieceByTask[selectedCard.id]?.draftMarkdown && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => handleDownloadPiece(selectedCard.id, selectedDraftVersion ? {
                                pieceType: selectedDraftVersion.piece_type,
                                pieceLabel: selectedDraftVersion.piece_label,
                                draftMarkdown: selectedDraftVersion.draft_markdown,
                                versionId: selectedDraftVersion.id,
                              } : undefined)}
                              data-testid={`documents-export-piece-${selectedCard.id}`}
                              disabled={downloadBusyTaskId === selectedCard.id || Boolean(selectedDraftVersion && selectedCurrentDraftHasUnsavedChanges)}
                              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] transition-colors disabled:opacity-50 ${selectedCardDraftStale ? "border border-amber-500/25 bg-amber-500/10 hover:bg-amber-500/15 text-amber-100" : "border border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-200"}`}
                            >
                              {downloadBusyTaskId === selectedCard.id ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                              {selectedCardDraftStale ? "Exportar Versão Anterior" : "Exportar Minuta Pronta"}
                            </button>
                          </div>
                        )}

                        {selectedCard.firstDraftStatus === "failed" && selectedCard.firstDraftError && (
                          <div data-testid={`documents-first-draft-error-${selectedCard.id}`} className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-200 leading-relaxed">
                            Última tentativa automática falhou: {selectedCard.firstDraftError} {selectedCardDraftStale && generatedPieceByTask[selectedCard.id]?.draftMarkdown ? "A versão abaixo foi gerada com o contexto anterior." : "Use o retry manual abaixo para tentar novamente com o contexto já montado pelo Case Brain."}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={() => handleGenerateFirstDraft(selectedCard.id)}
                          data-testid={`documents-first-draft-action-${selectedCard.id}`}
                          disabled={pieceBusyTaskId === selectedCard.id || selectedCard.firstDraftStatus === "running" || !selectedCard.draftPlan?.recommendedPieceInput}
                          className="w-full px-6 py-3.5 rounded-xl border border-[#CCA761]/40 bg-[#CCA761]/15 hover:bg-[#CCA761]/25 text-xs font-black uppercase tracking-[0.2em] text-[#CCA761] flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:shadow-[0_0_15px_rgba(204,167,97,0.2)]"
                        >
                          {pieceBusyTaskId === selectedCard.id || selectedCard.firstDraftStatus === "running" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                          {selectedCard.draftPlan?.recommendedPieceInput
                            ? selectedCard.firstDraftStatus === "completed"
                              ? selectedCardDraftStale
                                ? "Atualizar Primeira Minuta"
                                : "Abrir Primeira Minuta"
                              : selectedCard.firstDraftStatus === "failed"
                                ? selectedCardDraftStale
                                  ? "Tentar Novamente Atualização"
                                  : "Tentar Novamente Primeira Minuta"
                              : "Gerar Primeira Minuta Sugerida"
                            : "Aguardando Draft Plan do Case Brain"}
                        </button>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <input
                          list="legal-piece-suggestions"
                          value={pieceTypeByTask[selectedCard.id] || ""}
                          onChange={(event) => setPieceTypeByTask((current) => ({ ...current, [selectedCard.id]: event.target.value }))}
                          placeholder="Digite ou escolha a peca (ex: Replica, Embargos a Execucao, Memoriais)"
                          className="w-full bg-gray-100 dark:bg-[#111] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-500 focus:outline-none focus:border-[#CCA761]/60 font-medium tracking-wide"
                        />

                        <select
                          value={piecePracticeAreaByTask[selectedCard.id] || ""}
                          onChange={(event) => setPiecePracticeAreaByTask((current) => ({ ...current, [selectedCard.id]: event.target.value }))}
                          className="bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/40 font-medium tracking-wide appearance-none"
                        >
                          <option value="">Área do Direito (opcional)</option>
                          {PRACTICE_AREA_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>

                        <input
                          value={pieceObjectiveByTask[selectedCard.id] || ""}
                          onChange={(event) => setPieceObjectiveByTask((current) => ({ ...current, [selectedCard.id]: event.target.value }))}
                          placeholder="Objetivo do rascunho"
                          className="w-full bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-500 focus:outline-none focus:border-[#CCA761]/40"
                        />
                      </div>

                      <textarea
                        value={pieceInstructionsByTask[selectedCard.id] || ""}
                        onChange={(event) => setPieceInstructionsByTask((current) => ({ ...current, [selectedCard.id]: event.target.value }))}
                        rows={3}
                        placeholder="Instruções adicionais para o orquestrador jurídico (opcional)."
                        className="w-full bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder:text-gray-500 focus:outline-none focus:border-[#CCA761]/40 resize-none"
                      />

                      <button
                        type="button"
                        onClick={() => handleGeneratePiece(selectedCard.id)}
                        disabled={pieceBusyTaskId === selectedCard.id}
                        className="w-full px-6 py-3.5 rounded-xl border border-[#CCA761]/40 bg-[#CCA761]/10 hover:bg-[#CCA761]/20 text-xs font-black uppercase tracking-[0.2em] text-[#CCA761] flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:shadow-[0_0_15px_rgba(204,167,97,0.2)]"
                      >
                        {pieceBusyTaskId === selectedCard.id ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        Gerar Rascunho Manual com IA
                      </button>
                    </div>

                    {generatedPieceByTask[selectedCard.id] && (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-[#CCA761]/20 bg-gradient-to-br from-[#0a0f0a] to-[#0a0a0a] p-5 shadow-[0_5px_20px_rgba(204,167,97,0.02)] relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCA761]/5 blur-3xl rounded-full" />
                          <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/5 pb-4 mb-4 relative z-10">
                            <div className="flex items-center gap-2">
                              <Sparkles size={14} className="text-[#CCA761]" />
                              <p className="text-[10px] uppercase tracking-[0.25em] text-[#CCA761] font-black">Inteligência Operacional</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {generatedPieceByTask[selectedCard.id]!.generationMode === "draft_factory" && (
                                <span className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#CCA761]/10 border border-[#CCA761]/20 text-[#CCA761] text-[9px] uppercase tracking-widest font-black">
                                  <Sparkles size={10} /> Draft Factory
                                </span>
                              )}
                              {generatedPieceByTask[selectedCard.id]!.requiresHumanReview && (
                                <span className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[9px] uppercase tracking-widest font-black">
                                  <AlertTriangle size={10} /> Revisão Crítica
                                </span>
                              )}
                            </div>
                          </div>

                          {generatedPieceByTask[selectedCard.id]!.generationMode === "draft_factory" && (
                            <div className="mb-4 rounded-xl border border-[#CCA761]/15 bg-[#CCA761]/[0.05] px-4 py-3 relative z-10">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-[#CCA761] font-black">Origem da minuta</p>
                              <p className="text-xs text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">
                                Primeira minuta sugerida pelo Case Brain com base em `draft plan`, `research pack` e `source pack` validados para este caso.
                              </p>
                            </div>
                          )}
                           
                          <p className="text-[13px] text-gray-700 dark:text-gray-300 leading-relaxed italic mb-5 relative z-10">
                            &ldquo;{generatedPieceByTask[selectedCard.id]!.confidenceNote}&rdquo;
                          </p>

                          <div className="grid grid-cols-2 gap-3 mb-5 relative z-10">
                            <div className="rounded-xl border border-gray-200 dark:border-white/5 bg-gray-100 dark:bg-[#111] px-4 py-3">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1">Peça / Família</p>
                              <p className="text-sm text-gray-900 dark:text-white font-semibold">{generatedPieceByTask[selectedCard.id]!.pieceLabel}</p>
                              <p className="text-[11px] text-gray-500 mt-1">{generatedPieceByTask[selectedCard.id]!.pieceFamilyLabel}</p>
                            </div>
                            <div className="rounded-xl border border-gray-200 dark:border-white/5 bg-gray-100 dark:bg-[#111] px-4 py-3">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1">Área / Robustez</p>
                              <p className="text-sm text-gray-900 dark:text-white font-semibold">{generatedPieceByTask[selectedCard.id]!.practiceArea || "Nao informada"}</p>
                              <p className="text-[11px] text-gray-500 mt-1">
                                {generatedPieceByTask[selectedCard.id]!.qualityMetrics.sectionCount} seções • {generatedPieceByTask[selectedCard.id]!.qualityMetrics.paragraphCount} parágrafos
                                {generatedPieceByTask[selectedCard.id]!.expansionApplied ? " • expansão aplicada" : ""}
                              </p>
                            </div>
                          </div>

                          {(generatedPieceByTask[selectedCard.id]!.missingDocuments.length > 0 || generatedPieceByTask[selectedCard.id]!.warnings.length > 0) && (
                            <div className="flex flex-col mb-5 border border-gray-200 dark:border-white/5 rounded-xl overflow-hidden bg-gray-100 dark:bg-[#111] relative z-10">
                              {generatedPieceByTask[selectedCard.id]!.missingDocuments.length > 0 && (
                                <div className="p-4 border-b border-gray-200 dark:border-white/5 bg-red-500/5 relative">
                                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500/40" />
                                  <p className="text-[10px] uppercase tracking-[0.24em] text-red-400 font-black mb-1.5 flex items-center gap-2"><AlertTriangle size={12}/> Docs Faltantes</p>
                                  <p className="text-xs text-gray-700 dark:text-gray-300">{generatedPieceByTask[selectedCard.id]!.missingDocuments.join(", ")}</p>
                                </div>
                              )}
                              {generatedPieceByTask[selectedCard.id]!.warnings.length > 0 && (
                                <div className="p-4 relative">
                                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500/40" />
                                  <p className="text-[10px] uppercase tracking-[0.24em] text-amber-500 font-black mb-1.5">Alertas da IA</p>
                                  <p className="text-xs text-gray-400 leading-relaxed">{generatedPieceByTask[selectedCard.id]!.warnings.join(" ")}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {generatedPieceByTask[selectedCard.id]!.usedDocuments.length > 0 && (
                            <div className="relative z-10">
                              <p className="text-[10px] uppercase tracking-[0.24em] text-[#8ab4ff] font-black mb-3 flex items-center gap-2">
                                <FolderTree size={12} /> Acervo Extraído
                              </p>
                              <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto no-scrollbar pr-1">
                                {generatedPieceByTask[selectedCard.id]!.usedDocuments.map((document) => (
                                  <a 
                                    key={document.id}
                                    href={document.webViewLink || undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex flex-col gap-1.5 rounded-lg border border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#141414] hover:bg-gray-100 dark:bg-white/5 p-3 transition-colors text-left relative overflow-hidden"
                                  >
                                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#8ab4ff]/30 group-hover:bg-[#8ab4ff] transition-colors" />
                                    <p className="text-xs text-gray-900 dark:text-white font-bold truncate group-hover:text-[#8ab4ff] transition-colors ml-1">{document.name}</p>
                                    <div className="flex items-center gap-2 text-[10px] text-gray-500 ml-1">
                                      <span className="bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 px-1.5 py-0.5 rounded">{getDocumentTypeLabel(document.documentType)}</span>
                                      {document.folderLabel && <span className="truncate">{document.folderLabel.replace(/^\d{2}-/, '')}</span>}
                                    </div>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="bg-[#0f0f0f] border border-gray-200 dark:border-white/5 rounded-xl p-5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-gray-900 dark:text-white text-[10px] uppercase tracking-[0.3em] font-black">
                            <FileIcon size={12} className="text-[#8ab4ff]" /> Arquivos
                          </div>
                        </div>

                        {selectedCard.documents.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-[#111] px-5 py-6 text-xs text-center text-gray-500 uppercase tracking-widest font-medium">
                            Repositório Vazio
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {selectedCard.documents.slice(0, 3).map((document, index) => (
                              <div key={`${document.name}-${index}`} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-[#141414] border border-gray-200 dark:border-white/5 hover:border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 transition-colors">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-gray-800 dark:text-gray-200 font-bold truncate">{document.name}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {document.web_view_link && (
                                    <a
                                      href={document.web_view_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8ab4ff] hover:text-gray-900 dark:text-white border border-[#4285F4]/20 rounded-md px-3 py-1.5 bg-[#4285F4]/5 hover:bg-[#4285F4]/10 transition-colors"
                                    >
                                      Ver Manual
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {Boolean(selectedCard.drive_structure_ready && selectedCard.drive_folder_id && selectedCard.drive_link) && (
                          <>
                          <div className="mt-5 rounded-xl border border-[#CCA761]/20 bg-gradient-to-b from-[#CCA761]/[0.05] to-transparent p-5 space-y-4">
                            <div className="flex items-center gap-2 text-[#CCA761] text-[10px] uppercase tracking-[0.3em] font-black">
                              <Upload size={14} /> Upload via Plataforma
                            </div>
                            {organizationStatusByTask[selectedCard.id] ? (
                              <p className="rounded-lg border border-[#CCA761]/15 bg-[#CCA761]/5 px-3 py-2 text-[11px] font-semibold leading-relaxed text-[#CCA761]">
                                {organizationStatusByTask[selectedCard.id]}
                              </p>
                            ) : null}

                            <div className="flex flex-col sm:flex-row gap-3">
                              <select
                                value={uploadFolderByTask[selectedCard.id] || "auto"}
                                onChange={(event) => setUploadFolderByTask((current) => ({ ...current, [selectedCard.id]: event.target.value }))}
                                className="bg-white dark:bg-[#0a0a0a] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-[#CCA761]/60 font-medium tracking-wide appearance-none sm:w-[50%]"
                              >
                                <option value="auto">Organizar automaticamente</option>
                                {DOCUMENT_FOLDER_OPTIONS.map((folderLabel) => (
                                  <option key={folderLabel} value={folderLabel}>{folderLabel.replace(/^\d{2}-/, '')}</option>
                                ))}
                              </select>

                              <div className="relative flex-1">
                                <input
                                  key={`${selectedCard.id}-${uploadInputVersionByTask[selectedCard.id] || 0}`}
                                  id={`modal-upload-input-${selectedCard.id}`}
                                  type="file"
                                  multiple
                                  onChange={(event) => {
                                    const nextFiles = Array.from(event.target.files || []);
                                    setUploadFilesByTask((current) => ({ ...current, [selectedCard.id]: nextFiles }));
                                  }}
                                  className="hidden"
                                />
                                <label
                                  htmlFor={`modal-upload-input-${selectedCard.id}`}
                                  className="w-full h-full min-h-[44px] bg-white dark:bg-[#0a0a0a] border border-[#CCA761]/20 rounded-xl pl-4 pr-3 py-1.5 text-xs text-gray-900 dark:text-white flex items-center justify-between gap-3 cursor-pointer hover:border-[#CCA761]/50 transition-colors group/upload"
                                >
                                  <span className="truncate text-gray-400 group-hover/upload:text-gray-800 dark:text-gray-200 font-medium">
                                    {(uploadFilesByTask[selectedCard.id] || []).length > 1
                                      ? `${(uploadFilesByTask[selectedCard.id] || []).length} arquivos selecionados`
                                      : (uploadFilesByTask[selectedCard.id] || [])[0]?.name || "Localizar..."}
                                  </span>
                                </label>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleUploadDocument(selectedCard.id)}
                              disabled={busyTaskId === selectedCard.id}
                              className="w-full mt-2 px-6 py-3.5 rounded-xl border border-[#CCA761]/40 bg-[#CCA761]/10 hover:bg-[#CCA761]/20 text-xs font-black uppercase tracking-[0.2em] text-[#CCA761] flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:shadow-[0_0_15px_rgba(204,167,97,0.2)]"
                            >
                              {busyTaskId === selectedCard.id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                              Enviar
                            </button>
                          </div>

                          {selectedCard.organizationEvents.length > 0 ? (
                            <div className="mt-5 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-[#0a0a0a]/80 p-5">
                              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-gray-500 mb-3">
                                <CheckCircle2 size={13} /> Historico de organizacao
                              </div>
                              <div className="grid gap-2">
                                {selectedCard.organizationEvents.map((event) => {
                                  const uploaded = event.payload?.uploaded_count || 0;
                                  const moved = event.payload?.moved_count || 0;
                                  const review = event.payload?.needs_review_count || 0;
                                  const title = event.event_name === "process_document_batch_uploaded"
                                    ? `${uploaded} documento(s) importado(s)`
                                    : `${moved} arquivo(s) movido(s)`;
                                  return (
                                    <div key={event.id} className="rounded-lg border border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#111] px-3 py-2">
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="min-w-0 truncate text-xs font-bold text-gray-900 dark:text-white">{title}</p>
                                        <span className="shrink-0 text-[10px] text-gray-500">{formatDateTime(event.created_at)}</span>
                                      </div>
                                      <p className="mt-1 text-[11px] text-gray-500">
                                        Status: {event.status}
                                        {review ? ` · ${review} para revisao` : ""}
                                      </p>
                                      {Array.isArray(event.payload?.moves) && event.payload.moves.length > 0 ? (
                                        <p className="mt-1 truncate text-[11px] text-[#CCA761]">
                                          {event.payload.moves[0]?.name} para {event.payload.moves[0]?.toFolderLabel}
                                        </p>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-[#0a0a0a] border border-[#CCA761]/10 rounded-2xl flex flex-col relative overflow-hidden shadow-[0_0_40px_rgba(204,167,97,0.02)] min-h-[760px] xl:h-[86vh]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-5 border-b border-[#CCA761]/10 bg-[#0f0f0f] shrink-0 sticky top-0 z-20">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#CCA761]/10 border border-[#CCA761]/20 flex items-center justify-center">
                          <FileText size={16} className="text-[#CCA761]" />
                        </div>
                        <div>
                          <p className="text-[#CCA761] text-[10px] uppercase tracking-[0.3em] font-black">
                            {generatedPieceByTask[selectedCard.id] ? generatedPieceByTask[selectedCard.id]!.pieceLabel : "Painel Editorial Jurídico"}
                          </p>
                          <p className="text-xs text-gray-500 font-medium tracking-wide mt-0.5">
                            {generatedPieceByTask[selectedCard.id] ? "Ambiente premium de revisão e formatação" : "Pré-visualização do rascunho oficial"}
                          </p>
                        </div>
                      </div>
                      
                      {generatedPieceByTask[selectedCard.id] && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyPiece(selectedCard.id)}
                            className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-[#111] hover:bg-gray-100 dark:bg-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-gray-900 dark:text-white flex items-center justify-center gap-2 transition-colors"
                          >
                            <Copy size={14} /> Copiar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadPiece(selectedCard.id, selectedDraftVersion ? {
                              pieceType: selectedDraftVersion.piece_type,
                              pieceLabel: selectedDraftVersion.piece_label,
                              draftMarkdown: selectedDraftVersion.draft_markdown,
                              versionId: selectedDraftVersion.id,
                            } : undefined)}
                            disabled={downloadBusyTaskId === selectedCard.id || Boolean(selectedDraftVersion && selectedCurrentDraftHasUnsavedChanges)}
                            className="px-4 py-2.5 rounded-xl border border-[#4285F4]/30 bg-[#4285F4]/10 hover:bg-[#4285F4]/20 text-[10px] font-black uppercase tracking-[0.2em] text-[#8ab4ff] flex items-center justify-center gap-2 disabled:opacity-50 transition-colors shadow-[0_0_15px_rgba(66,133,244,0.1)]"
                          >
                            {downloadBusyTaskId === selectedCard.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            Exportar .DOCX
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto no-scrollbar bg-white dark:bg-[#030303] p-3 sm:p-6 lg:p-10 relative">
                      {generatedPieceByTask[selectedCard.id] ? (
                        <div className="max-w-[850px] mx-auto bg-white dark:bg-[#0d0d0d] border border-gray-200 dark:border-white/5 shadow-2xl rounded-xl min-h-full flex flex-col relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-[#CCA761]/50 to-transparent opacity-70" />
                          
                          <div className="absolute top-10 right-10 opacity-[0.03] pointer-events-none">
                            <Sparkles size={200} className="text-[#CCA761] mix-blend-screen" />
                          </div>

                          <div className="p-8 sm:p-12 md:p-16 relative z-10 flex-1">
                            {selectedDraftVersion && canFormallyReviewDraft && (
                              <div className="mb-8 rounded-2xl border border-[#CCA761]/15 bg-gray-100 dark:bg-[#111] p-5 space-y-4">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-[0.24em] text-[#CCA761] font-black">Editor Formal do MAYUS</p>
                                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                                      O texto abaixo so vira fonte oficial do publish premium depois que voce salvar uma nova versao formal auditavel.
                                    </p>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleResetDraftEditor(selectedDraftVersion)}
                                      data-testid={`documents-reset-reviewed-version-${selectedDraftVersion.id}`}
                                      disabled={!selectedDraftHasUnsavedChanges || draftRevisionBusyKey === `${selectedCard.id}:${selectedDraftVersion.id}`}
                                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/85 disabled:opacity-50"
                                    >
                                      <RefreshCw size={12} /> Descartar Alteracoes
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSaveHumanReviewedVersion(selectedCard.id, selectedDraftVersion)}
                                      data-testid={`documents-save-reviewed-version-${selectedDraftVersion.id}`}
                                      disabled={Boolean(selectedDraftEditorBlockedReason) || !selectedDraftHasUnsavedChanges || draftRevisionBusyKey === `${selectedCard.id}:${selectedDraftVersion.id}`}
                                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#CCA761]/25 bg-[#CCA761]/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-[#f3e4bf] disabled:opacity-50"
                                    >
                                      {draftRevisionBusyKey === `${selectedCard.id}:${selectedDraftVersion.id}` ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                      Salvar Nova Versao Formal
                                    </button>
                                  </div>
                                </div>

                                {selectedDraftEditorBlockedReason && (
                                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100 leading-relaxed">
                                    {selectedDraftEditorBlockedReason}
                                  </div>
                                )}

                                <textarea
                                  data-testid={`documents-draft-editor-${selectedDraftVersion.id}`}
                                  value={selectedDraftEditorContent}
                                  onChange={(event) => setDraftEditorContentByVersionId((current) => ({
                                    ...current,
                                    [selectedDraftVersion.id]: event.target.value,
                                  }))}
                                  readOnly={Boolean(selectedDraftEditorBlockedReason)}
                                  rows={18}
                                  className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-gray-200 dark:bg-black/30 px-4 py-4 text-sm leading-7 text-gray-100 focus:outline-none focus:border-[#CCA761]/40 resize-y"
                                />
                              </div>
                            )}

                            <article 
                              className={`prose prose-invert max-w-none ${cormorant.className} 
                                prose-headings:font-bold prose-headings:text-[#e2c78d] prose-headings:tracking-wide
                                prose-h1:text-4xl prose-h1:text-center prose-h1:mb-10
                                prose-h2:text-3xl prose-h2:mt-12 prose-h2:border-b prose-h2:border-gray-200 dark:border-white/5 prose-h2:pb-4
                                prose-h3:text-2xl prose-h3:text-[#CCA761]
                                prose-p:text-gray-800 dark:text-gray-200 prose-p:leading-[2] prose-p:text-justify prose-p:text-[22px] prose-p:tracking-wide
                                prose-li:text-gray-800 dark:text-gray-200 prose-li:text-[22px] prose-li:leading-[1.9]
                                prose-strong:text-gray-900 dark:text-white prose-strong:font-bold
                                prose-blockquote:border-l-[3px] prose-blockquote:border-[#CCA761] prose-blockquote:bg-[#CCA761]/[0.03] prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:text-gray-400 prose-blockquote:italic prose-blockquote:rounded-r-xl prose-blockquote:my-8 prose-blockquote:text-[20px]
                                prose-hr:border-gray-200 dark:border-white/10 prose-hr:my-12
                                marker:text-[#CCA761]
                              `}
                            >
                              <ReactMarkdown>{selectedDraftVersion ? selectedDraftEditorContent : generatedPieceByTask[selectedCard.id]!.draftMarkdown}</ReactMarkdown>
                            </article>
                          </div>
                        </div>
                      ) : (
                        <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-center p-10 border-2 border-dashed border-[#CCA761]/10 rounded-2xl bg-white dark:bg-[#0a0a0a]/50 m-4 lg:m-10">
                          <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-[#111] border border-gray-200 dark:border-white/5 flex items-center justify-center mb-6 relative group">
                            <div className="absolute inset-0 bg-[#CCA761]/10 rounded-full blur-xl animate-pulse" />
                            <FileText size={40} className="text-[#CCA761]/30 relative z-10" />
                          </div>
                          <p className="text-[#CCA761] text-[10px] uppercase tracking-[0.3em] font-black mb-4">Página em Branco</p>
                          <p className="text-sm text-gray-500 max-w-sm leading-relaxed mx-auto">
                            A primeira minuta sugerida pelo Case Brain, ou um rascunho manual, será renderizada aqui com design editorial e legibilidade confortável para advogados.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
                  {Boolean(selectedCard.drive_structure_ready && selectedCard.drive_folder_id && selectedCard.drive_link) ? (
                    <a
                      href={selectedCard.drive_link || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 rounded-xl border border-[#4285F4]/30 bg-[#4285F4]/10 hover:bg-[#4285F4]/20 text-[9px] font-black uppercase tracking-[0.1em] text-[#8ab4ff] flex items-center justify-center gap-1.5 transition-colors text-center"
                    >
                      <ExternalLink size={12} className="shrink-0" /> <span className="truncate">Drive</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCreateStructure(selectedCard.id)}
                      disabled={busyTaskId === selectedCard.id}
                      className="w-full py-3 rounded-xl border border-[#4285F4]/40 bg-[#4285F4]/15 hover:bg-[#4285F4]/25 text-[9px] font-black uppercase tracking-[0.1em] text-[#8ab4ff] flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all text-center"
                    >
                      <FolderTree size={12} className="shrink-0" /> <span className="truncate">Criar Estrutura</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOrganizeRepository(selectedCard.id)}
                    disabled={busyTaskId === selectedCard.id || !Boolean(selectedCard.drive_structure_ready)}
                    className="w-full py-3 rounded-xl border border-[#CCA761]/30 bg-[#CCA761]/10 hover:bg-[#CCA761]/20 text-[9px] font-black uppercase tracking-[0.1em] text-[#CCA761] flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors text-center"
                  >
                    {busyTaskId === selectedCard.id ? <Loader2 size={12} className="animate-spin shrink-0" /> : <Sparkles size={12} className="shrink-0" />}
                    <span className="truncate">Organizar Acervo</span>
                  </button>

                  <button
                      type="button"
                      onClick={() => handleSync(selectedCard.id)}
                      disabled={busyTaskId === selectedCard.id || !Boolean(selectedCard.drive_structure_ready)}
                      className="w-full py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-white/5 hover:bg-gray-100 dark:bg-white/10 text-[9px] font-black uppercase tracking-[0.1em] text-gray-900 dark:text-white flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors text-center"
                    >
                      {busyTaskId === selectedCard.id ? <Loader2 size={12} className="animate-spin shrink-0" /> : <RefreshCw size={12} className="shrink-0" />}
                      <span className="truncate">Sincronizar IA</span>
                  </button>

                  <Link
                    href={`/dashboard/processos/${selectedCard.pipeline_id}`}
                    className="w-full py-3 rounded-xl border border-[#CCA761]/30 bg-[#CCA761]/10 hover:bg-[#CCA761]/20 text-[9px] font-black uppercase tracking-[0.1em] text-[#CCA761] flex items-center justify-center gap-1.5 transition-all text-center"
                  >
                    <FileText size={12} className="shrink-0" /> <span className="truncate">Board</span>
                  </Link>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
