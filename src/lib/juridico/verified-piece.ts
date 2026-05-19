import {
  buildDocumentEvidencePack,
  loadLatestDocumentEvidencePackArtifact,
  type DocumentEvidencePack,
  type DocumentEvidencePackDocument,
} from "@/lib/services/document-evidence-pack";
import { supabaseAdmin } from "@/lib/supabase/admin";

type VerificationSupabase = typeof supabaseAdmin;

export type VerifiedPieceStatus = "ready" | "needs_review" | "blocked";

export type VerifiedPieceSnapshot = {
  status: VerifiedPieceStatus;
  ready: boolean;
  requiresHumanReview: boolean;
  evidencePackArtifactId: string | null;
  evidencePackGeneratedAt: string | null;
  summary: string;
  factBasis: Array<Pick<DocumentEvidencePackDocument, "id" | "name" | "documentType" | "folderLabel" | "webViewLink" | "modifiedAt" | "relevanceScore">>;
  pendingValidations: string[];
  warnings: string[];
  blockReasons: string[];
  gaps: DocumentEvidencePack["gaps"];
  risks: DocumentEvidencePack["risks"];
  documentMemory: DocumentEvidencePack["documentMemory"] | null;
};

function getTime(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function compact(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function mapFactBasis(pack: DocumentEvidencePack | null) {
  return (pack?.factBasis || []).map((document) => ({
    id: document.id,
    name: document.name,
    documentType: document.documentType || null,
    folderLabel: document.folderLabel || null,
    webViewLink: document.webViewLink || null,
    modifiedAt: document.modifiedAt || null,
    relevanceScore: document.relevanceScore,
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getString(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function evaluateVerifiedPieceReadiness(params: {
  tenantId: string;
  processTaskId: string;
  supabase?: VerificationSupabase;
}): Promise<VerifiedPieceSnapshot> {
  const supabase = params.supabase || supabaseAdmin;
  const [latestArtifact, currentPack] = await Promise.all([
    loadLatestDocumentEvidencePackArtifact({
      tenantId: params.tenantId,
      processTaskId: params.processTaskId,
      supabase,
    }),
    buildDocumentEvidencePack({
      tenantId: params.tenantId,
      processTaskId: params.processTaskId,
      supabase,
    }),
  ]);
  const persistedPack = latestArtifact?.pack || null;
  const blockReasons: string[] = [];
  const warnings: string[] = [];

  if (!persistedPack) {
    blockReasons.push("Salve um Pacote de Evidencias antes de aprovar, publicar ou exportar a peca oficial.");
  }

  if (persistedPack && !persistedPack.citationChecklist.readyForFactCitations) {
    blockReasons.push("O Pacote de Evidencias salvo ainda nao esta pronto para citacoes factuais.");
  }

  if (!currentPack.citationChecklist.readyForFactCitations) {
    blockReasons.push("O acervo atual ainda possui lacunas ou riscos documentais que impedem citacao factual segura.");
  }

  if (persistedPack) {
    const artifactGeneratedAt = getTime(persistedPack.generatedAt);
    const currentLastSyncedAt = getTime(currentPack.documentMemory.lastSyncedAt);
    if (currentLastSyncedAt > artifactGeneratedAt) {
      blockReasons.push("O Pacote de Evidencias salvo esta desatualizado em relacao a ultima sincronizacao documental.");
    }

    if (persistedPack.documentMemory.documentCount !== currentPack.documentMemory.documentCount) {
      blockReasons.push("O volume atual de documentos mudou depois do Pacote de Evidencias salvo.");
    }
  }

  const currentWarnings = compact([
    ...currentPack.gaps.filter((gap) => gap.severity !== "low").map((gap) => gap.label),
    ...currentPack.risks.filter((risk) => risk.severity !== "low").map((risk) => risk.title),
  ]);
  warnings.push(...currentWarnings);

  const status: VerifiedPieceStatus = blockReasons.length > 0
    ? "blocked"
    : warnings.length > 0
      ? "needs_review"
      : "ready";

  return {
    status,
    ready: status === "ready",
    requiresHumanReview: status !== "ready",
    evidencePackArtifactId: latestArtifact?.artifactId || null,
    evidencePackGeneratedAt: persistedPack?.generatedAt || null,
    summary: persistedPack?.summary || currentPack.summary,
    factBasis: mapFactBasis(persistedPack || currentPack),
    pendingValidations: compact([
      ...(persistedPack?.citationChecklist.pendingValidations || []),
      ...currentPack.citationChecklist.pendingValidations,
      ...blockReasons,
    ]),
    warnings: compact(warnings),
    blockReasons: compact(blockReasons),
    gaps: currentPack.gaps,
    risks: currentPack.risks,
    documentMemory: currentPack.documentMemory,
  };
}

export function getVerifiedPieceBlockMessage(snapshot: VerifiedPieceSnapshot | null | undefined) {
  if (!snapshot) return "A peca ainda nao possui validacao verificavel.";
  return snapshot.blockReasons[0] || snapshot.pendingValidations[0] || "A peca ainda nao esta verificavel para uso oficial.";
}

export function assertVerifiedPieceReady(snapshot: VerifiedPieceSnapshot | null | undefined) {
  if (snapshot?.ready) return;
  throw new Error(getVerifiedPieceBlockMessage(snapshot));
}

export function assertDraftVerifiedAgainstCurrent(params: {
  draftMetadata: Record<string, unknown> | null | undefined;
  currentSnapshot: VerifiedPieceSnapshot | null | undefined;
}) {
  assertVerifiedPieceReady(params.currentSnapshot);

  const verifiedPiece = isRecord(params.draftMetadata?.verified_piece)
    ? params.draftMetadata.verified_piece
    : null;
  const draftEvidencePackArtifactId = getString(params.draftMetadata, "evidence_pack_artifact_id")
    || getString(verifiedPiece, "evidencePackArtifactId");

  if (verifiedPiece?.ready !== true || verifiedPiece?.status !== "ready") {
    throw new Error("A versao da minuta nao possui snapshot verificavel pronto. Gere ou salve nova versao apos o Pacote de Evidencias.");
  }

  if (!draftEvidencePackArtifactId || draftEvidencePackArtifactId !== params.currentSnapshot?.evidencePackArtifactId) {
    throw new Error("A versao da minuta foi validada com outro Pacote de Evidencias. Gere ou salve nova versao com o pacote atual.");
  }
}
