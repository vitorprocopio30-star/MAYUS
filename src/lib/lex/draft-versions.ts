import { supabaseAdmin } from "@/lib/supabase/admin";

export type ProcessDraftVersionRecord = {
  id: string;
  tenant_id: string;
  process_task_id: string;
  source_artifact_id: string | null;
  source_task_id: string | null;
  source_case_brain_task_id: string | null;
  parent_version_id: string | null;
  version_number: number;
  workflow_status: "draft" | "approved" | "published";
  is_current: boolean;
  piece_type: string | null;
  piece_label: string | null;
  practice_area: string | null;
  summary: string | null;
  draft_markdown: string;
  metadata: Record<string, unknown> | null;
  approved_by: string | null;
  approved_at: string | null;
  published_by: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type BrainArtifactDraftSourceRecord = {
  id: string;
  metadata: Record<string, unknown> | null;
};

export type DraftLearningLoopSignalCategory =
  | "substantive_expansion"
  | "substantive_reduction"
  | "structure_refined"
  | "citations_enriched"
  | "citations_reduced"
  | "human_polish_minor"
  | "no_material_change";

export type DraftLearningLoopMetrics = {
  charCount: number;
  wordCount: number;
  paragraphCount: number;
  sectionCount: number;
  citationCount: number;
};

export type DraftLearningLoopDelta = {
  capturedAt: string;
  sourceKind: "source_artifact" | "parent_version" | "none";
  sourceLabel: string | null;
  changed: boolean;
  changeRatio: number;
  categories: DraftLearningLoopSignalCategory[];
  summary: string;
  baseline: DraftLearningLoopMetrics;
  final: DraftLearningLoopMetrics;
  delta: DraftLearningLoopMetrics;
};

export type DraftPromotionCandidateType =
  | "style_memory"
  | "template_structure"
  | "citation_policy"
  | "argument_heuristic";

export type DraftPromotionCandidate = {
  status: "pending_supervision";
  source: "human_editor";
  summary: string;
  candidateTypes: DraftPromotionCandidateType[];
  signalCategories: DraftLearningLoopSignalCategory[];
  confidence: "low" | "medium" | "high";
  createdAt: string;
  basedOnVersionId: string;
  basedOnVersionNumber: number;
};

type ProcessDocumentMemoryCaseBrainRecord = {
  case_brain_task_id: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  return fallback;
}

function shouldRetryLegacyCreateDraftRpc(error: unknown) {
  const message = getErrorMessage(error, "").toLowerCase();
  return message.includes("p_parent_version_id") || message.includes("schema cache");
}

function getString(value: Record<string, unknown> | null | undefined, key: string) {
  const item = value?.[key];
  return typeof item === "string" && item.trim().length > 0 ? item.trim() : null;
}

function countWords(markdown: string) {
  return String(markdown || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function countParagraphs(markdown: string) {
  return String(markdown || "")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean).length;
}

function countSections(markdown: string) {
  return String(markdown || "")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return /^#{1,6}\s/.test(trimmed) || /^[IVXLCDM]+\s*[-.:)]\s+.{3,}/i.test(trimmed) || /^\d+\s*[-.:)]\s+.{3,}/.test(trimmed);
    }).length;
}

function countCitations(markdown: string) {
  const matches = String(markdown || "").match(/\b(?:art\.?|arts\.?|lei|tema|sumula|s[uú]mula|resp|re|cpc|cc|clt|cf|stj|stf)\b/gi);
  return matches?.length || 0;
}

function buildLearningLoopMetrics(markdown: string): DraftLearningLoopMetrics {
  const safeMarkdown = String(markdown || "").trim();
  return {
    charCount: safeMarkdown.length,
    wordCount: countWords(safeMarkdown),
    paragraphCount: countParagraphs(safeMarkdown),
    sectionCount: countSections(safeMarkdown),
    citationCount: countCitations(safeMarkdown),
  };
}

export function buildDraftTextMetrics(markdown: string) {
  return buildLearningLoopMetrics(markdown);
}

function buildDraftPromotionCandidateTypes(categories: DraftLearningLoopSignalCategory[]) {
  const candidateTypes = new Set<DraftPromotionCandidateType>();

  if (categories.includes("human_polish_minor")) {
    candidateTypes.add("style_memory");
  }

  if (categories.includes("structure_refined")) {
    candidateTypes.add("template_structure");
  }

  if (categories.includes("citations_enriched") || categories.includes("citations_reduced")) {
    candidateTypes.add("citation_policy");
  }

  if (categories.includes("substantive_expansion") || categories.includes("substantive_reduction")) {
    candidateTypes.add("argument_heuristic");
  }

  return Array.from(candidateTypes);
}

function buildDraftPromotionCandidateConfidence(candidateTypes: DraftPromotionCandidateType[]) {
  if (candidateTypes.length >= 3) return "high" as const;
  if (candidateTypes.length === 2) return "medium" as const;
  return "low" as const;
}

export function buildDraftPromotionCandidate(params: {
  delta: DraftLearningLoopDelta;
  baseVersionId: string;
  baseVersionNumber: number;
}) {
  if (!params.delta.changed || params.delta.categories.includes("no_material_change")) {
    return null;
  }

  const candidateTypes = buildDraftPromotionCandidateTypes(params.delta.categories);
  if (candidateTypes.length === 0) {
    return null;
  }

  return {
    status: "pending_supervision",
    source: "human_editor",
    summary: `Candidato supervisionavel preparado a partir da V${params.baseVersionNumber}: ${candidateTypes.join(", ")} com sinais ${params.delta.categories.join(", ")}.`,
    candidateTypes,
    signalCategories: params.delta.categories,
    confidence: buildDraftPromotionCandidateConfidence(candidateTypes),
    createdAt: new Date().toISOString(),
    basedOnVersionId: params.baseVersionId,
    basedOnVersionNumber: params.baseVersionNumber,
  } satisfies DraftPromotionCandidate;
}

function clampChangeRatio(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Number(value.toFixed(4));
}

function buildLearningLoopCategories(params: {
  baseline: DraftLearningLoopMetrics;
  delta: DraftLearningLoopMetrics;
  changed: boolean;
}) {
  if (!params.changed) {
    return ["no_material_change"] as DraftLearningLoopSignalCategory[];
  }

  const categories: DraftLearningLoopSignalCategory[] = [];

  if (params.delta.charCount >= 600 || params.delta.paragraphCount >= 2) {
    categories.push("substantive_expansion");
  }

  if (params.delta.charCount <= -600 || params.delta.paragraphCount <= -2) {
    categories.push("substantive_reduction");
  }

  if (Math.abs(params.delta.sectionCount) >= 1) {
    categories.push("structure_refined");
  }

  if (params.delta.citationCount >= 1) {
    categories.push("citations_enriched");
  }

  if (params.delta.citationCount <= -1) {
    categories.push("citations_reduced");
  }

  if (categories.length === 0) {
    categories.push("human_polish_minor");
  }

  return categories;
}

function buildLearningLoopSummary(params: {
  sourceLabel: string | null;
  categories: DraftLearningLoopSignalCategory[];
  delta: DraftLearningLoopMetrics;
  changeRatio: number;
}) {
  const sourceLabel = params.sourceLabel || "a base anterior";
  const parts = [
    `Delta capturado contra ${sourceLabel}`,
    `${params.delta.charCount >= 0 ? "+" : ""}${params.delta.charCount} caracteres`,
    `${params.delta.paragraphCount >= 0 ? "+" : ""}${params.delta.paragraphCount} paragrafos`,
    `${params.delta.sectionCount >= 0 ? "+" : ""}${params.delta.sectionCount} secoes`,
    `${params.delta.citationCount >= 0 ? "+" : ""}${params.delta.citationCount} citacoes`,
    `${Math.round(params.changeRatio * 100)}% de variacao estimada`,
  ];

  if (params.categories.length > 0) {
    parts.push(`sinais: ${params.categories.join(", ")}`);
  }

  return parts.join(" · ");
}

export function buildDraftLearningLoopDelta(params: {
  baselineMarkdown: string;
  finalMarkdown: string;
  sourceKind?: DraftLearningLoopDelta["sourceKind"];
  sourceLabel?: string | null;
}) {
  const baseline = buildLearningLoopMetrics(params.baselineMarkdown);
  const final = buildLearningLoopMetrics(params.finalMarkdown);
  const delta = {
    charCount: final.charCount - baseline.charCount,
    wordCount: final.wordCount - baseline.wordCount,
    paragraphCount: final.paragraphCount - baseline.paragraphCount,
    sectionCount: final.sectionCount - baseline.sectionCount,
    citationCount: final.citationCount - baseline.citationCount,
  } satisfies DraftLearningLoopMetrics;
  const baselineFloor = Math.max(baseline.charCount, baseline.wordCount * 4, 1);
  const finalText = String(params.finalMarkdown || "").trim();
  const baselineText = String(params.baselineMarkdown || "").trim();
  const changed = finalText !== baselineText;
  const changeRatio = clampChangeRatio(Math.abs(delta.charCount) / baselineFloor);
  const categories = buildLearningLoopCategories({ baseline, delta, changed });

  return {
    capturedAt: new Date().toISOString(),
    sourceKind: params.sourceKind || "none",
    sourceLabel: params.sourceLabel || null,
    changed,
    changeRatio,
    categories,
    summary: buildLearningLoopSummary({
      sourceLabel: params.sourceLabel || null,
      categories,
      delta,
      changeRatio,
    }),
    baseline,
    final,
    delta,
  } satisfies DraftLearningLoopDelta;
}

export async function getProcessDraftVersionById(params: { tenantId: string; versionId: string }) {
  const { data, error } = await supabaseAdmin
    .from("process_draft_versions")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.versionId)
    .maybeSingle<ProcessDraftVersionRecord>();

  if (error) throw error;
  return data || null;
}

export async function getProcessDraftVersionForTask(params: {
  tenantId: string;
  processTaskId: string;
  versionId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("process_draft_versions")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .eq("process_task_id", params.processTaskId)
    .eq("id", params.versionId)
    .maybeSingle<ProcessDraftVersionRecord>();

  if (error) throw error;
  return data || null;
}

async function getCurrentProcessCaseBrainTaskId(params: { tenantId: string; processTaskId: string }) {
  const { data, error } = await supabaseAdmin
    .from("process_document_memory")
    .select("case_brain_task_id")
    .eq("tenant_id", params.tenantId)
    .eq("process_task_id", params.processTaskId)
    .maybeSingle<ProcessDocumentMemoryCaseBrainRecord>();

  if (error) throw error;
  return data?.case_brain_task_id || null;
}

function withoutPublicationMetadata(metadata: Record<string, unknown> | null | undefined) {
  if (!isRecord(metadata)) return {} as Record<string, unknown>;
  const nextMetadata = { ...metadata };
  delete nextMetadata.premium_publish;
  delete nextMetadata.learning_loop_capture;
  return nextMetadata;
}

export async function createHumanReviewedProcessDraftVersion(params: {
  tenantId: string;
  processTaskId: string;
  baseVersionId: string;
  draftMarkdown: string;
  actorId: string;
  surface?: "documentos" | "mayus";
}) {
  const baseVersion = await getProcessDraftVersionForTask({
    tenantId: params.tenantId,
    processTaskId: params.processTaskId,
    versionId: params.baseVersionId,
  });

  if (!baseVersion) {
    throw new Error("Versao da minuta nao encontrada.");
  }

  if (!baseVersion.is_current) {
    throw new Error("Selecione a versao atual da minuta antes de salvar uma nova revisao humana.");
  }

  const currentCaseBrainTaskId = await getCurrentProcessCaseBrainTaskId({
    tenantId: params.tenantId,
    processTaskId: params.processTaskId,
  });

  if (
    currentCaseBrainTaskId !== null
    && baseVersion.source_case_brain_task_id !== currentCaseBrainTaskId
  ) {
    throw new Error("A versao selecionada esta desatualizada em relacao ao Case Brain atual e nao pode originar nova versao formal.");
  }

  const nextDraftMarkdown = String(params.draftMarkdown || "");
  const normalizedNextDraft = nextDraftMarkdown.trim();
  const normalizedBaseDraft = String(baseVersion.draft_markdown || "").trim();

  if (!normalizedNextDraft) {
    throw new Error("Nao foi possivel salvar a revisao humana sem conteudo.");
  }

  if (normalizedNextDraft === normalizedBaseDraft) {
    throw new Error("Nenhuma alteracao material foi detectada para criar uma nova versao formal.");
  }

  const nowIso = new Date().toISOString();
  const metrics = buildDraftTextMetrics(nextDraftMarkdown);
  const baseMetadata = withoutPublicationMetadata(baseVersion.metadata);
  const learningLoopCapture = buildDraftLearningLoopDelta({
    baselineMarkdown: baseVersion.draft_markdown,
    finalMarkdown: nextDraftMarkdown,
    sourceKind: "parent_version",
    sourceLabel: `a versao V${baseVersion.version_number}`,
  });
  const promotionCandidate = buildDraftPromotionCandidate({
    delta: learningLoopCapture,
    baseVersionId: baseVersion.id,
    baseVersionNumber: baseVersion.version_number,
  });

  return createProcessDraftVersion({
    tenantId: params.tenantId,
    processTaskId: params.processTaskId,
    sourceArtifactId: baseVersion.source_artifact_id,
    sourceTaskId: baseVersion.source_task_id,
    sourceCaseBrainTaskId: baseVersion.source_case_brain_task_id,
    pieceType: baseVersion.piece_type,
    pieceLabel: baseVersion.piece_label,
    practiceArea: baseVersion.practice_area,
    summary: `Versao revisada manualmente a partir da V${baseVersion.version_number}.`,
    draftMarkdown: nextDraftMarkdown,
    parentVersionId: baseVersion.id,
    metadata: {
      ...baseMetadata,
      edit_source: "human_editor",
      edited_from_version_id: baseVersion.id,
      edited_from_version_number: baseVersion.version_number,
      edited_at: nowIso,
      edited_by: params.actorId,
      edited_in_surface: params.surface || "documentos",
      warnings: [],
      requires_human_review: false,
      learning_loop_capture: learningLoopCapture,
      promotion_candidate: promotionCandidate,
      quality_metrics: {
        charCount: metrics.charCount,
        wordCount: metrics.wordCount,
        paragraphCount: metrics.paragraphCount,
        sectionCount: metrics.sectionCount,
      },
    },
    createdBy: params.actorId,
  });
}

export async function loadDraftLearningLoopDelta(params: {
  tenantId: string;
  version: ProcessDraftVersionRecord;
}) {
  if (params.version.parent_version_id) {
    const parentVersion = await getProcessDraftVersionById({
      tenantId: params.tenantId,
      versionId: params.version.parent_version_id,
    });

    if (parentVersion?.draft_markdown) {
      return buildDraftLearningLoopDelta({
        baselineMarkdown: parentVersion.draft_markdown,
        finalMarkdown: params.version.draft_markdown,
        sourceKind: "parent_version",
        sourceLabel: `a versao V${parentVersion.version_number}`,
      });
    }
  }

  if (params.version.source_artifact_id) {
    const { data, error } = await supabaseAdmin
      .from("brain_artifacts")
      .select("id, metadata")
      .eq("tenant_id", params.tenantId)
      .eq("id", params.version.source_artifact_id)
      .maybeSingle<BrainArtifactDraftSourceRecord>();

    if (error) throw error;

    const metadata = isRecord(data?.metadata) ? data.metadata : null;
    const baselineMarkdown = getString(metadata, "reply");
    if (baselineMarkdown) {
      return buildDraftLearningLoopDelta({
        baselineMarkdown,
        finalMarkdown: params.version.draft_markdown,
        sourceKind: "source_artifact",
        sourceLabel: "a primeira minuta gerada",
      });
    }
  }

  return buildDraftLearningLoopDelta({
    baselineMarkdown: params.version.draft_markdown,
    finalMarkdown: params.version.draft_markdown,
    sourceKind: "none",
    sourceLabel: null,
  });
}

export async function createProcessDraftVersion(params: {
  tenantId: string;
  processTaskId: string;
  sourceArtifactId?: string | null;
  sourceTaskId?: string | null;
  sourceCaseBrainTaskId?: string | null;
  parentVersionId?: string | null;
  pieceType?: string | null;
  pieceLabel?: string | null;
  practiceArea?: string | null;
  summary?: string | null;
  draftMarkdown: string;
  metadata?: Record<string, unknown> | null;
  createdBy?: string | null;
}) {
  const rpcPayload = {
    p_tenant_id: params.tenantId,
    p_process_task_id: params.processTaskId,
    p_source_artifact_id: params.sourceArtifactId || null,
    p_source_task_id: params.sourceTaskId || null,
    p_source_case_brain_task_id: params.sourceCaseBrainTaskId || null,
    p_piece_type: params.pieceType || null,
    p_piece_label: params.pieceLabel || null,
    p_practice_area: params.practiceArea || null,
    p_summary: params.summary || null,
    p_draft_markdown: params.draftMarkdown,
    p_metadata: isRecord(params.metadata) ? params.metadata : {},
    p_created_by: params.createdBy || null,
    p_parent_version_id: params.parentVersionId || null,
  };

  let { data, error } = await supabaseAdmin
    .rpc("create_process_draft_version_atomic", rpcPayload)
    .single<ProcessDraftVersionRecord>();

  if ((error || !data) && params.parentVersionId && shouldRetryLegacyCreateDraftRpc(error)) {
    const legacyPayload = {
      ...rpcPayload,
    } as Record<string, unknown>;
    delete legacyPayload.p_parent_version_id;

    const legacyResult = await supabaseAdmin
      .rpc("create_process_draft_version_atomic", legacyPayload)
      .single<ProcessDraftVersionRecord>();

    data = legacyResult.data;
    error = legacyResult.error;
  }

  if (error || !data) {
    throw new Error(getErrorMessage(error, "Nao foi possivel registrar a versao da minuta."));
  }

  return data;
}

export async function listProcessDraftVersions(params: { tenantId: string; processTaskId: string }) {
  const { data, error } = await supabaseAdmin
    .from("process_draft_versions")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .eq("process_task_id", params.processTaskId)
    .order("version_number", { ascending: false });

  if (error) throw error;
  return (data || []) as ProcessDraftVersionRecord[];
}

export async function updateProcessDraftVersionWorkflow(params: {
  tenantId: string;
  processTaskId: string;
  versionId: string;
  action: "approve" | "publish";
  actorId: string;
}) {
  const { data: updatedVersion, error: updateError } = await supabaseAdmin
    .rpc("transition_process_draft_version_atomic", {
      p_tenant_id: params.tenantId,
      p_process_task_id: params.processTaskId,
      p_version_id: params.versionId,
      p_action: params.action,
      p_actor_id: params.actorId,
    })
    .single<ProcessDraftVersionRecord>();

  if (updateError || !updatedVersion) {
    throw new Error(getErrorMessage(updateError, "Nao foi possivel atualizar o workflow da minuta."));
  }

  return updatedVersion;
}
