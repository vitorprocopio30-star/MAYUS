import {
  buildProcessGoogleDriveFolderName,
  buildGoogleDriveFolderUrl,
  createGoogleDriveFolder,
  createGoogleDriveFolderStructure,
  DEFAULT_PROCESS_DOCUMENT_FOLDERS,
  fetchGoogleDriveFolder,
  isGoogleDriveFolder,
  listGoogleDriveChildren,
  moveGoogleDriveFile,
} from "@/lib/services/google-drive";
import { inferProcessDocumentOrganization } from "@/lib/juridico/document-organization";
import type { ProcessTaskDocumentContext } from "@/lib/services/process-documents";

export type DriveScanConfidence = "high" | "medium" | "low" | "none";
export type DriveScanItemKind = "file" | "folder";
export type DriveScanActionType =
  | "move_to_process_folder"
  | "create_process_folder"
  | "request_review"
  | "mark_duplicate"
  | "ignore";
export type DriveScanActionStatus = "proposed" | "review_required" | "approved" | "rejected" | "skipped" | "applied" | "failed" | "reverted";

export type DriveScanProcess = {
  id: string;
  title?: string | null;
  client_name?: string | null;
  process_number?: string | null;
  drive_folder_id?: string | null;
  drive_link?: string | null;
  reu?: string | null;
  partes?: Record<string, unknown> | null;
  oab_estado?: string | null;
  oab_numero?: string | null;
  oab_registro?: string | null;
  advogado_nome?: string | null;
};

export type DriveScanDiscoveredItem = {
  driveFileId: string;
  parentFolderId: string | null;
  parentPath: string[];
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  modifiedAt: string | null;
  webViewLink: string | null;
  itemKind: DriveScanItemKind;
};

export type DriveScanProcessMatch = {
  process: DriveScanProcess;
  score: number;
  confidence: Exclude<DriveScanConfidence, "none">;
  signals: string[];
  reason: string;
};

export type DriveScanPlannedItem = DriveScanDiscoveredItem & {
  detectedSignals: Record<string, unknown>;
  candidateProcessTaskId: string | null;
  candidateProcessNumber: string | null;
  candidateClientName: string | null;
  confidence: DriveScanConfidence;
  reviewReason: string | null;
  status: "preview" | "proposed" | "review_required" | "ignored";
  matches: DriveScanProcessMatch[];
};

export type DriveScanPlannedAction = {
  id?: string;
  driveFileId: string;
  actionType: DriveScanActionType;
  targetProcessTaskId: string | null;
  targetFolderLabel: string | null;
  targetDriveFolderId: string | null;
  beforePayload: Record<string, unknown>;
  afterPayload: Record<string, unknown>;
  confidence: DriveScanConfidence;
  reason: string;
  status: DriveScanActionStatus;
};

export type DriveScanPreviewPlan = {
  items: DriveScanPlannedItem[];
  actions: DriveScanPlannedAction[];
  counters: {
    filesScanned: number;
    foldersScanned: number;
    matchedFiles: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    needsReview: number;
    duplicates: number;
    proposedActions: number;
  };
};

type ScannerSupabase = {
  from: (table: string) => any;
};

type PersistedBrainTrace = {
  taskId: string;
  runId: string;
  stepId: string;
};

type PersistedScanRun = PersistedBrainTrace & {
  scanRunId: string;
};

export type DriveScanActionRecord = {
  id: string;
  scan_item_id: string;
  action_type: DriveScanActionType;
  target_process_task_id: string | null;
  target_folder_label: string | null;
  target_drive_folder_id: string | null;
  before_payload?: Record<string, unknown> | null;
  after_payload?: Record<string, unknown> | null;
  confidence: DriveScanConfidence;
  status: string;
};

type DriveScanItemRecord = {
  id: string;
  drive_file_id: string;
  parent_folder_id: string | null;
  parent_path?: string[] | null;
  name: string;
};

const CNJ_REGEX = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g;
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_ITEMS = 500;

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeProcessNumber(value: string | null | undefined) {
  return String(value || "").replace(/\D+/g, "");
}

function clampPositiveInteger(value: unknown, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function confidenceFromScore(score: number): DriveScanProcessMatch["confidence"] | null {
  if (score >= 80) return "high";
  if (score >= 45) return "medium";
  if (score > 0) return "low";
  return null;
}

function combineConfidence(matchConfidence: DriveScanConfidence, documentConfidence: DriveScanConfidence): DriveScanConfidence {
  if (matchConfidence === "none" || documentConfidence === "none") return "none";
  if (matchConfidence === "low" || documentConfidence === "low") return "low";
  if (matchConfidence === "medium" || documentConfidence === "medium") return "medium";
  return "high";
}

function buildDuplicateKey(item: DriveScanDiscoveredItem) {
  if (item.itemKind !== "file") return null;
  return [
    normalizeText(item.name),
    item.mimeType || "",
    item.sizeBytes ?? "unknown-size",
  ].join("|");
}

function getMeaningfulTokens(value: string | null | undefined) {
  const stopwords = new Set(["de", "da", "do", "das", "dos", "para", "com", "por", "em", "e", "a", "o"]);
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !stopwords.has(token));
}

function formatMatchReason(signals: string[]) {
  if (signals.includes("process_number_exact")) return "Numero do processo encontrado no arquivo ou caminho.";
  if (signals.includes("client_name")) return "Nome do cliente encontrado no arquivo ou caminho.";
  if (signals.includes("party_name")) return "Nome de parte do processo encontrado no arquivo ou caminho.";
  if (signals.includes("oab_match")) return "Registro OAB confirmado no contexto do processo foi encontrado no arquivo ou caminho.";
  if (signals.includes("title_overlap")) return "Titulo do processo tem termos em comum com o arquivo.";
  return "Sinais fracos indicam possivel relacao com o processo.";
}

function getProcessPartyValues(process: DriveScanProcess) {
  const parties = process.partes && typeof process.partes === "object" ? process.partes : {};
  const values = [
    process.reu,
    parties.polo_ativo,
    parties.ativo,
    parties.autor,
    parties.polo_passivo,
    parties.passivo,
    parties.reu,
  ];

  return values
    .map((value) => String(value || "").trim())
    .filter((value) => normalizeText(value).length >= 4);
}

function buildOabNeedles(process: DriveScanProcess) {
  const values = [
    process.oab_registro,
    process.oab_numero && process.oab_estado ? `${process.oab_estado} ${process.oab_numero}` : null,
    process.oab_numero && process.oab_estado ? `${process.oab_numero} ${process.oab_estado}` : null,
  ];

  return values
    .map((value) => normalizeText(value))
    .filter((value) => value.length >= 4);
}

export function extractCnjNumbers(value: string | null | undefined) {
  return Array.from(new Set(String(value || "").match(CNJ_REGEX) || []));
}

export function scoreDriveFileProcessMatch(
  item: Pick<DriveScanDiscoveredItem, "name" | "parentPath">,
  process: DriveScanProcess
): DriveScanProcessMatch | null {
  const target = `${item.parentPath.join(" ")} ${item.name}`;
  const normalizedTarget = normalizeText(target);
  const digitsTarget = normalizeProcessNumber(target);
  const signals: string[] = [];
  let score = 0;

  const processDigits = normalizeProcessNumber(process.process_number);
  if (processDigits && digitsTarget.includes(processDigits)) {
    score += 90;
    signals.push("process_number_exact");
  }

  const cnjs = extractCnjNumbers(target).map(normalizeProcessNumber);
  if (processDigits && cnjs.includes(processDigits) && !signals.includes("process_number_exact")) {
    score += 85;
    signals.push("process_number_exact");
  }

  const clientName = normalizeText(process.client_name);
  if (clientName && clientName.length >= 4 && normalizedTarget.includes(clientName)) {
    score += 35;
    signals.push("client_name");
  }

  const partyMatches = getProcessPartyValues(process)
    .map((value) => normalizeText(value))
    .filter((value) => value && normalizedTarget.includes(value));
  if (partyMatches.length > 0) {
    score += Math.min(30, partyMatches.length * 18);
    signals.push("party_name");
  }

  const oabMatches = buildOabNeedles(process).filter((value) => normalizedTarget.includes(value));
  if (oabMatches.length > 0) {
    score += 18;
    signals.push("oab_match");
  }

  if (signals.includes("party_name") && signals.includes("oab_match")) {
    score += 10;
  }

  const titleTokens = getMeaningfulTokens(process.title);
  const overlapCount = titleTokens.filter((token) => normalizedTarget.includes(token)).length;
  if (overlapCount >= 2) {
    score += Math.min(20, overlapCount * 6);
    signals.push("title_overlap");
  }

  const confidence = confidenceFromScore(score);
  if (!confidence) return null;

  return {
    process,
    score: Math.min(score, 100),
    confidence,
    signals,
    reason: formatMatchReason(signals),
  };
}

export function buildDriveScanPreviewPlan(input: {
  items: DriveScanDiscoveredItem[];
  processes: DriveScanProcess[];
}): DriveScanPreviewPlan {
  const duplicateFirstSeen = new Map<string, string>();
  const duplicateFileIds = new Set<string>();

  for (const item of input.items) {
    const key = buildDuplicateKey(item);
    if (!key) continue;
    const firstSeen = duplicateFirstSeen.get(key);
    if (firstSeen) {
      duplicateFileIds.add(item.driveFileId);
      duplicateFileIds.add(firstSeen);
    } else {
      duplicateFirstSeen.set(key, item.driveFileId);
    }
  }

  const plannedItems: DriveScanPlannedItem[] = [];
  const actions: DriveScanPlannedAction[] = [];

  for (const item of input.items) {
    const documentOrganization = inferProcessDocumentOrganization({
      name: item.name,
      mimeType: item.mimeType,
      folderLabel: item.parentPath[item.parentPath.length - 1] || null,
    });
    const matches = input.processes
      .map((process) => scoreDriveFileProcessMatch(item, process))
      .filter((match): match is DriveScanProcessMatch => Boolean(match))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const bestMatch = matches[0] || null;
    const isFolder = item.itemKind === "folder";
    const isDuplicate = duplicateFileIds.has(item.driveFileId);
    const actionConfidence = bestMatch
      ? combineConfidence(bestMatch.confidence, documentOrganization.confidence)
      : "none";
    const status: DriveScanPlannedItem["status"] = isFolder
      ? "preview"
      : isDuplicate || actionConfidence !== "high"
        ? "review_required"
        : "proposed";
    const reviewReason = isFolder
      ? null
      : isDuplicate
        ? "Arquivo com nome, tipo e tamanho repetidos no acervo analisado."
        : !bestMatch
          ? "Nenhum processo candidato foi identificado com seguranca."
          : actionConfidence !== "high"
            ? "Confianca insuficiente para mover automaticamente."
            : null;

    plannedItems.push({
      ...item,
      detectedSignals: {
        cnj_numbers: extractCnjNumbers(`${item.parentPath.join(" ")} ${item.name}`),
        duplicate_candidate: isDuplicate,
        document_type: documentOrganization.documentType,
        folder_label: documentOrganization.folderLabel,
        document_reason: documentOrganization.reason,
        process_match_signals: bestMatch?.signals || [],
      },
      candidateProcessTaskId: bestMatch?.process.id || null,
      candidateProcessNumber: bestMatch?.process.process_number || null,
      candidateClientName: bestMatch?.process.client_name || null,
      confidence: isFolder ? "none" : actionConfidence,
      reviewReason,
      status,
      matches,
    });

    if (isFolder) continue;

    if (isDuplicate) {
      actions.push({
        driveFileId: item.driveFileId,
        actionType: "mark_duplicate",
        targetProcessTaskId: bestMatch?.process.id || null,
        targetFolderLabel: null,
        targetDriveFolderId: null,
        beforePayload: {
          parent_folder_id: item.parentFolderId,
          parent_path: item.parentPath,
          name: item.name,
        },
        afterPayload: {
          duplicate_candidate: true,
        },
        confidence: "low",
        reason: "Possivel duplicidade detectada por nome, tipo e tamanho.",
        status: "review_required",
      });
      continue;
    }

    if (!bestMatch) {
      actions.push({
        driveFileId: item.driveFileId,
        actionType: "request_review",
        targetProcessTaskId: null,
        targetFolderLabel: documentOrganization.folderLabel,
        targetDriveFolderId: null,
        beforePayload: {
          parent_folder_id: item.parentFolderId,
          parent_path: item.parentPath,
          name: item.name,
        },
        afterPayload: {
          document_type: documentOrganization.documentType,
          folder_label: documentOrganization.folderLabel,
        },
        confidence: "low",
        reason: "Arquivo precisa de revisao humana antes de vinculo com processo.",
        status: "review_required",
      });
      continue;
    }

    const actionType: DriveScanActionType = bestMatch.process.drive_folder_id
      ? "move_to_process_folder"
      : "create_process_folder";
    const actionStatus: DriveScanActionStatus = actionConfidence === "high" ? "proposed" : "review_required";

    actions.push({
      driveFileId: item.driveFileId,
      actionType,
      targetProcessTaskId: bestMatch.process.id,
      targetFolderLabel: documentOrganization.folderLabel,
      targetDriveFolderId: bestMatch.process.drive_folder_id || null,
      beforePayload: {
        parent_folder_id: item.parentFolderId,
        parent_path: item.parentPath,
        name: item.name,
      },
      afterPayload: {
        document_type: documentOrganization.documentType,
        folder_label: documentOrganization.folderLabel,
        process_number: bestMatch.process.process_number || null,
        process_title: bestMatch.process.title || null,
        process_drive_folder_id: bestMatch.process.drive_folder_id || null,
      },
      confidence: actionConfidence,
      reason: actionConfidence === "high"
        ? `${bestMatch.reason} ${documentOrganization.reason}`
        : "Arquivo encontrado, mas precisa de revisao antes de movimentacao.",
      status: actionStatus,
    });
  }

  const fileItems = plannedItems.filter((item) => item.itemKind === "file");
  const counters = {
    filesScanned: fileItems.length,
    foldersScanned: plannedItems.filter((item) => item.itemKind === "folder").length,
    matchedFiles: fileItems.filter((item) => Boolean(item.candidateProcessTaskId)).length,
    highConfidence: fileItems.filter((item) => item.confidence === "high").length,
    mediumConfidence: fileItems.filter((item) => item.confidence === "medium").length,
    lowConfidence: fileItems.filter((item) => item.confidence === "low" || item.confidence === "none").length,
    needsReview: actions.filter((action) => action.status === "review_required").length,
    duplicates: actions.filter((action) => action.actionType === "mark_duplicate").length,
    proposedActions: actions.filter((action) => action.status === "proposed").length,
  };

  return {
    items: plannedItems,
    actions,
    counters,
  };
}

async function discoverDriveItems(params: {
  accessToken: string;
  rootFolderId: string;
  maxDepth: number;
  maxItems: number;
}): Promise<DriveScanDiscoveredItem[]> {
  const discovered: DriveScanDiscoveredItem[] = [];
  const queue: Array<{ folderId: string; depth: number; path: string[] }> = [
    { folderId: params.rootFolderId, depth: 0, path: [] },
  ];

  while (queue.length > 0 && discovered.length < params.maxItems) {
    const current = queue.shift()!;
    const children = await listGoogleDriveChildren(params.accessToken, current.folderId);

    for (const child of children) {
      if (discovered.length >= params.maxItems) break;

      const childName = child.name || "Documento sem nome";
      const itemKind: DriveScanItemKind = isGoogleDriveFolder(child) ? "folder" : "file";
      const item: DriveScanDiscoveredItem = {
        driveFileId: child.id,
        parentFolderId: current.folderId,
        parentPath: current.path,
        name: childName,
        mimeType: child.mimeType || null,
        sizeBytes: child.size ? Number(child.size) : null,
        modifiedAt: child.modifiedTime || null,
        webViewLink: child.webViewLink || null,
        itemKind,
      };
      discovered.push(item);

      if (itemKind === "folder" && current.depth < params.maxDepth) {
        queue.push({
          folderId: child.id,
          depth: current.depth + 1,
          path: [...current.path, childName],
        });
      }
    }
  }

  return discovered;
}

async function createBrainTrace(params: {
  supabase: ScannerSupabase;
  tenantId: string;
  userId: string;
  rootFolderId: string;
  rootFolderName: string | null;
}): Promise<PersistedBrainTrace> {
  const now = new Date().toISOString();
  const { data: task, error: taskError } = await params.supabase
    .from("brain_tasks")
    .insert({
      tenant_id: params.tenantId,
      created_by: params.userId,
      channel: "documents",
      module: "lex",
      status: "executing",
      title: "Scanner agentico do Drive",
      goal: "Analisar acervo documental do Drive e gerar preview de organizacao sem mover arquivos.",
      task_input: {
        root_folder_id: params.rootFolderId,
        root_folder_name: params.rootFolderName,
      },
      task_context: {
        source: "dashboard.documentos",
        artifact_type: "drive_document_organization_plan",
      },
      policy_snapshot: {
        preview_only: true,
        external_side_effects: false,
        raw_text_persistence: false,
        low_confidence_requires_review: true,
      },
      started_at: now,
    })
    .select("id")
    .single();

  if (taskError || !task?.id) throw taskError || new Error("drive_scan_brain_task_missing");

  const { data: run, error: runError } = await params.supabase
    .from("brain_runs")
    .insert({
      task_id: task.id,
      tenant_id: params.tenantId,
      attempt_number: 1,
      status: "executing",
      summary: "Scanner do Drive em execucao.",
      started_at: now,
    })
    .select("id")
    .single();

  if (runError || !run?.id) throw runError || new Error("drive_scan_brain_run_missing");

  const { data: step, error: stepError } = await params.supabase
    .from("brain_steps")
    .insert({
      task_id: task.id,
      run_id: run.id,
      tenant_id: params.tenantId,
      order_index: 1,
      step_key: "drive_document_scan_preview",
      title: "Gerar preview do acervo Drive",
      step_type: "operation",
      capability_name: "drive_document_scanner",
      handler_type: "drive_document_scan_preview",
      approval_policy: "preview_only",
      status: "running",
      input_payload: {
        root_folder_id: params.rootFolderId,
      },
      started_at: now,
    })
    .select("id")
    .single();

  if (stepError || !step?.id) throw stepError || new Error("drive_scan_brain_step_missing");

  return {
    taskId: task.id,
    runId: run.id,
    stepId: step.id,
  };
}

async function persistScanStart(params: {
  supabase: ScannerSupabase;
  tenantId: string;
  userId: string;
  rootFolderId: string;
  rootFolderName: string | null;
  rootFolderUrl: string | null;
  maxDepth: number;
  maxItems: number;
  brainTrace: PersistedBrainTrace;
}): Promise<PersistedScanRun> {
  const { data, error } = await params.supabase
    .from("drive_scan_runs")
    .insert({
      tenant_id: params.tenantId,
      created_by: params.userId,
      root_folder_id: params.rootFolderId,
      root_folder_name: params.rootFolderName,
      root_folder_url: params.rootFolderUrl,
      status: "scanning",
      mode: "preview",
      max_depth: params.maxDepth,
      max_items: params.maxItems,
      brain_task_id: params.brainTrace.taskId,
      brain_run_id: params.brainTrace.runId,
      brain_step_id: params.brainTrace.stepId,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data?.id) throw error || new Error("drive_scan_run_missing");

  return {
    scanRunId: data.id,
    ...params.brainTrace,
  };
}

function buildArtifactMetadata(plan: DriveScanPreviewPlan, rootFolder: { id: string; name: string | null; url: string | null }) {
  return {
    summary: `Scanner analisou ${plan.counters.filesScanned} arquivo(s), encontrou ${plan.counters.matchedFiles} vinculo(s) provavel(is) e deixou ${plan.counters.needsReview} acao(oes) para revisao.`,
    root_folder: rootFolder,
    counters: plan.counters,
    proposed_actions: plan.actions
      .filter((action) => action.status === "proposed")
      .slice(0, 20)
      .map((action) => ({
        action_type: action.actionType,
        target_process_task_id: action.targetProcessTaskId,
        target_folder_label: action.targetFolderLabel,
        confidence: action.confidence,
        reason: action.reason,
      })),
    review_required: plan.actions
      .filter((action) => action.status === "review_required")
      .slice(0, 20)
      .map((action) => ({
        action_type: action.actionType,
        target_process_task_id: action.targetProcessTaskId,
        target_folder_label: action.targetFolderLabel,
        confidence: action.confidence,
        reason: action.reason,
      })),
    preview_only: true,
    external_side_effects: false,
  };
}

async function persistPreviewPlan(params: {
  supabase: ScannerSupabase;
  tenantId: string;
  userId: string;
  persisted: PersistedScanRun;
  plan: DriveScanPreviewPlan;
  rootFolder: { id: string; name: string | null; url: string | null };
}) {
  const itemIdByDriveFileId = new Map<string, string>();
  const persistedActions: DriveScanPlannedAction[] = [];

  for (const item of params.plan.items) {
    const { data, error } = await params.supabase
      .from("drive_scan_items")
      .insert({
        tenant_id: params.tenantId,
        scan_run_id: params.persisted.scanRunId,
        drive_file_id: item.driveFileId,
        parent_folder_id: item.parentFolderId,
        parent_path: item.parentPath,
        name: item.name,
        mime_type: item.mimeType,
        size_bytes: item.sizeBytes,
        modified_at: item.modifiedAt,
        web_view_link: item.webViewLink,
        item_kind: item.itemKind,
        detected_signals: item.detectedSignals,
        candidate_process_task_id: item.candidateProcessTaskId,
        candidate_process_number: item.candidateProcessNumber,
        candidate_client_name: item.candidateClientName,
        confidence: item.confidence,
        review_reason: item.reviewReason,
        status: item.status,
      })
      .select("id")
      .single();

    if (error || !data?.id) throw error || new Error("drive_scan_item_missing");
    itemIdByDriveFileId.set(item.driveFileId, data.id);

    if (item.matches.length > 0) {
      const { error: matchError } = await params.supabase
        .from("drive_scan_item_matches")
        .insert(item.matches.map((match) => ({
          tenant_id: params.tenantId,
          scan_item_id: data.id,
          process_task_id: match.process.id,
          score: match.score,
          signals: {
            signals: match.signals,
            confidence: match.confidence,
          },
          reason: match.reason,
        })));

      if (matchError) throw matchError;
    }
  }

  for (const action of params.plan.actions) {
    const scanItemId = itemIdByDriveFileId.get(action.driveFileId);
    if (!scanItemId) continue;

    const { data, error } = await params.supabase
      .from("drive_scan_actions")
      .insert({
        tenant_id: params.tenantId,
        scan_run_id: params.persisted.scanRunId,
        scan_item_id: scanItemId,
        action_type: action.actionType,
        target_process_task_id: action.targetProcessTaskId,
        target_folder_label: action.targetFolderLabel,
        target_drive_folder_id: action.targetDriveFolderId,
        before_payload: action.beforePayload,
        after_payload: action.afterPayload,
        confidence: action.confidence,
        reason: action.reason,
        status: action.status,
      })
      .select("id")
      .single();

    if (error) throw error;
    persistedActions.push({ ...action, id: data?.id });
  }

  const metadata = buildArtifactMetadata(params.plan, params.rootFolder);
  const now = new Date().toISOString();
  const finalStatus = params.plan.counters.needsReview > 0 ? "completed_with_warnings" : "completed";

  const { data: artifact, error: artifactError } = await params.supabase
    .from("brain_artifacts")
    .insert({
      tenant_id: params.tenantId,
      task_id: params.persisted.taskId,
      run_id: params.persisted.runId,
      step_id: params.persisted.stepId,
      artifact_type: "drive_document_organization_plan",
      title: "Plano de organizacao do Drive",
      source_module: "documentos",
      metadata,
    })
    .select("id")
    .single();

  if (artifactError || !artifact?.id) throw artifactError || new Error("drive_scan_artifact_missing");

  await params.supabase
    .from("drive_scan_runs")
    .update({
      status: "preview_ready",
      counters: params.plan.counters,
      brain_artifact_id: artifact.id,
      completed_at: now,
    })
    .eq("id", params.persisted.scanRunId);

  await params.supabase
    .from("brain_steps")
    .update({
      status: "completed",
      output_payload: {
        scan_run_id: params.persisted.scanRunId,
        counters: params.plan.counters,
        artifact_id: artifact.id,
      },
      completed_at: now,
    })
    .eq("id", params.persisted.stepId);

  await params.supabase
    .from("brain_runs")
    .update({
      status: finalStatus,
      summary: metadata.summary,
      completed_at: now,
    })
    .eq("id", params.persisted.runId);

  await params.supabase
    .from("brain_tasks")
    .update({
      status: finalStatus,
      result_summary: metadata.summary,
      completed_at: now,
    })
    .eq("id", params.persisted.taskId);

  await params.supabase
    .from("learning_events")
    .insert({
      tenant_id: params.tenantId,
      task_id: params.persisted.taskId,
      run_id: params.persisted.runId,
      step_id: params.persisted.stepId,
      event_type: "drive_document_scan_preview_created",
      source_module: "documentos",
      payload: {
        scan_run_id: params.persisted.scanRunId,
        artifact_id: artifact.id,
        counters: params.plan.counters,
        root_folder_id: params.rootFolder.id,
      },
      created_by: params.userId,
    });

  await params.supabase
    .from("system_event_logs")
    .insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      source: "documentos",
      provider: "google_drive",
      event_name: "drive_document_scan_preview_created",
      status: "completed",
      payload: {
        scan_run_id: params.persisted.scanRunId,
        artifact_id: artifact.id,
        counters: params.plan.counters,
        preview_only: true,
      },
    });

  return {
    artifactId: artifact.id,
    metadata,
    actions: persistedActions,
  };
}

export async function createDriveDocumentScanPreview(params: {
  tenantId: string;
  userId: string;
  accessToken: string;
  rootFolderId: string;
  maxDepth?: number;
  maxItems?: number;
  supabase?: ScannerSupabase;
}) {
  const supabase = params.supabase || (await import("@/lib/supabase/admin")).supabaseAdmin;
  const maxDepth = clampPositiveInteger(params.maxDepth, DEFAULT_MAX_DEPTH, 8);
  const maxItems = clampPositiveInteger(params.maxItems, DEFAULT_MAX_ITEMS, 1000);
  const rootFolder = await fetchGoogleDriveFolder(params.accessToken, params.rootFolderId);
  const rootFolderName = rootFolder.name || null;
  const rootFolderUrl = rootFolder.webViewLink || buildGoogleDriveFolderUrl(rootFolder.id);
  const brainTrace = await createBrainTrace({
    supabase,
    tenantId: params.tenantId,
    userId: params.userId,
    rootFolderId: rootFolder.id,
    rootFolderName,
  });
  const persisted = await persistScanStart({
    supabase,
    tenantId: params.tenantId,
    userId: params.userId,
    rootFolderId: rootFolder.id,
    rootFolderName,
    rootFolderUrl,
    maxDepth,
    maxItems,
    brainTrace,
  });

  const [{ data: processes, error: processError }, discoveredItems] = await Promise.all([
    supabase
      .from("process_tasks")
      .select("id, title, client_name, process_number, drive_folder_id, drive_link, reu")
      .eq("tenant_id", params.tenantId),
    discoverDriveItems({
      accessToken: params.accessToken,
      rootFolderId: rootFolder.id,
      maxDepth,
      maxItems,
    }),
  ]);

  if (processError) throw processError;

  const plan = buildDriveScanPreviewPlan({
    items: discoveredItems,
    processes: (processes || []) as DriveScanProcess[],
  });
  const artifact = await persistPreviewPlan({
    supabase,
    tenantId: params.tenantId,
    userId: params.userId,
    persisted,
    plan,
    rootFolder: {
      id: rootFolder.id,
      name: rootFolderName,
      url: rootFolderUrl,
    },
  });

  return {
    scanRunId: persisted.scanRunId,
    brainTaskId: persisted.taskId,
    brainRunId: persisted.runId,
    brainArtifactId: artifact.artifactId,
    rootFolder: {
      id: rootFolder.id,
      name: rootFolderName,
      url: rootFolderUrl,
    },
    counters: plan.counters,
    items: plan.items.slice(0, 100).map((item) => ({
      driveFileId: item.driveFileId,
      name: item.name,
      itemKind: item.itemKind,
      parentPath: item.parentPath,
      candidateProcessTaskId: item.candidateProcessTaskId,
      candidateProcessNumber: item.candidateProcessNumber,
      candidateClientName: item.candidateClientName,
      confidence: item.confidence,
      status: item.status,
      reviewReason: item.reviewReason,
      detectedSignals: item.detectedSignals,
    })),
    actions: artifact.actions.slice(0, 100),
    previewOnly: true,
  };
}

async function fetchProcessTask(params: {
  supabase: ScannerSupabase;
  tenantId: string;
  processTaskId: string;
}): Promise<ProcessTaskDocumentContext | null> {
  const { data, error } = await params.supabase
    .from("process_tasks")
    .select("id, tenant_id, stage_id, title, client_name, process_number, drive_link, drive_folder_id, drive_structure_ready")
    .eq("id", params.processTaskId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  if (error) throw error;
  return data as ProcessTaskDocumentContext | null;
}

async function ensureProcessDriveStructure(params: {
  supabase: ScannerSupabase;
  tenantId: string;
  accessToken: string;
  task: ProcessTaskDocumentContext;
  processRootFolderId?: string | null;
}) {
  let folderId = params.task.drive_folder_id || null;
  let folderUrl = params.task.drive_link || null;
  let folderName = buildProcessGoogleDriveFolderName(params.task);

  if (!folderId) {
    const folder = await createGoogleDriveFolder(params.accessToken, {
      name: folderName,
      parentFolderId: params.processRootFolderId || null,
    });
    folderId = folder.id;
    folderUrl = folder.webViewLink;
    folderName = folder.name;
  }

  const folderStructure = await createGoogleDriveFolderStructure(
    params.accessToken,
    folderId,
    DEFAULT_PROCESS_DOCUMENT_FOLDERS
  );

  const { error: updateError } = await params.supabase
    .from("process_tasks")
    .update({
      drive_link: folderUrl,
      drive_folder_id: folderId,
      drive_structure_ready: true,
    })
    .eq("id", params.task.id)
    .eq("tenant_id", params.tenantId);

  if (updateError) throw updateError;

  return {
    task: {
      ...params.task,
      drive_link: folderUrl,
      drive_folder_id: folderId,
    },
    folderName,
    folderStructure,
  };
}

async function markAction(params: {
  supabase: ScannerSupabase;
  actionId: string;
  status: "applied" | "failed" | "skipped" | "reverted";
  errorMessage?: string | null;
  afterPayload?: Record<string, unknown>;
}) {
  const patch: Record<string, unknown> = {
    status: params.status,
    error_message: params.errorMessage || null,
  };

  if (params.status === "applied") {
    patch.applied_at = new Date().toISOString();
  }

  if (params.afterPayload) {
    patch.after_payload = params.afterPayload;
  }

  const { error } = await params.supabase
    .from("drive_scan_actions")
    .update(patch)
    .eq("id", params.actionId);

  if (error) throw error;
}

function sanitizeApplyError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "");
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return "Falha ao aplicar acao do scanner.";
  return compact
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/access[_ -]?token[:=]\s*[^,\s]+/gi, "access_token=[redacted]")
    .slice(0, 240);
}

async function findDriveChildById(params: {
  accessToken: string;
  folderId: string | null | undefined;
  fileId: string;
}) {
  if (!params.folderId) return null;
  const children = await listGoogleDriveChildren(params.accessToken, params.folderId);
  return children.find((child) => child.id === params.fileId) || null;
}

function readStringPayload(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function applyDriveDocumentScanActions(params: {
  tenantId: string;
  userId: string;
  accessToken: string;
  scanRunId: string;
  actionIds?: string[];
  processRootFolderId?: string | null;
  supabase?: ScannerSupabase;
}) {
  const supabase = params.supabase || (await import("@/lib/supabase/admin")).supabaseAdmin;
  const actionIds = (params.actionIds || []).map((id) => String(id || "").trim()).filter(Boolean);

  const { data: scanRun, error: scanRunError } = await supabase
    .from("drive_scan_runs")
    .select("id, tenant_id, root_folder_id, counters, brain_task_id, brain_run_id, brain_step_id")
    .eq("id", params.scanRunId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  if (scanRunError) throw scanRunError;
  if (!scanRun?.id) throw new Error("DriveScanRunNotFound");

  await supabase
    .from("drive_scan_runs")
    .update({ status: "applying" })
    .eq("id", params.scanRunId)
    .eq("tenant_id", params.tenantId);

  let actionQuery = supabase
    .from("drive_scan_actions")
    .select("id, scan_item_id, action_type, target_process_task_id, target_folder_label, target_drive_folder_id, before_payload, after_payload, confidence, status")
    .eq("tenant_id", params.tenantId)
    .eq("scan_run_id", params.scanRunId);

  if (actionIds.length > 0) {
    actionQuery = actionQuery.in("id", actionIds);
  } else {
    actionQuery = actionQuery.in("status", ["proposed", "approved"]);
  }

  const { data: actionRows, error: actionsError } = await actionQuery;
  if (actionsError) throw actionsError;

  const actions = (actionRows || []) as DriveScanActionRecord[];
  const applied: Array<{ actionId: string; processTaskId: string | null; fileName: string }> = [];
  const skipped: Array<{ actionId: string; reason: string }> = [];
  const failed: Array<{ actionId: string; error: string }> = [];
  const processesToSync = new Map<string, ProcessTaskDocumentContext>();

  for (const action of actions) {
    if (!["proposed", "approved"].includes(action.status)) {
      skipped.push({ actionId: action.id, reason: "action_not_approved_or_proposed" });
      await markAction({ supabase, actionId: action.id, status: "skipped", errorMessage: "Acao nao estava proposta/aprovada." });
      continue;
    }

    if (!["move_to_process_folder", "create_process_folder"].includes(action.action_type)) {
      skipped.push({ actionId: action.id, reason: "review_only_action" });
      await markAction({ supabase, actionId: action.id, status: "skipped", errorMessage: "Acao exige revisao humana e nao move arquivo." });
      continue;
    }

    if (action.confidence !== "high" && action.status !== "approved") {
      skipped.push({ actionId: action.id, reason: "confidence_not_high" });
      await markAction({ supabase, actionId: action.id, status: "skipped", errorMessage: "Confianca insuficiente para aplicacao automatica." });
      continue;
    }

    try {
      const { data: item, error: itemError } = await supabase
        .from("drive_scan_items")
        .select("id, drive_file_id, parent_folder_id, parent_path, name")
        .eq("id", action.scan_item_id)
        .eq("tenant_id", params.tenantId)
        .maybeSingle();

      if (itemError) throw itemError;
      const scanItem = item as DriveScanItemRecord | null;
      if (!scanItem?.drive_file_id) throw new Error("DriveScanItemNotFound");
      if (!action.target_process_task_id) throw new Error("DriveScanActionMissingProcess");

      const processTask = await fetchProcessTask({
        supabase,
        tenantId: params.tenantId,
        processTaskId: action.target_process_task_id,
      });
      if (!processTask) throw new Error("ProcessTaskNotFound");

      const ensured = await ensureProcessDriveStructure({
        supabase,
        tenantId: params.tenantId,
        accessToken: params.accessToken,
        task: processTask,
        processRootFolderId: params.processRootFolderId || scanRun.root_folder_id,
      });
      const targetFolder = action.target_folder_label
        ? ensured.folderStructure[action.target_folder_label]
        : null;
      const targetFolderId = targetFolder?.id || ensured.task.drive_folder_id;

      if (!targetFolderId) throw new Error("TargetFolderNotFound");

      const fileAlreadyInTarget = await findDriveChildById({
        accessToken: params.accessToken,
        folderId: targetFolderId,
        fileId: scanItem.drive_file_id,
      });

      if (fileAlreadyInTarget) {
        const nextAfterPayload = {
          ...(action.after_payload || {}),
          moved_file_id: fileAlreadyInTarget.id,
          moved_file_name: fileAlreadyInTarget.name || scanItem.name,
          target_drive_folder_id: targetFolderId,
          target_folder_label: action.target_folder_label,
          idempotent: true,
          idempotency_reason: "file_already_in_target",
          applied_at: new Date().toISOString(),
        };

        await markAction({
          supabase,
          actionId: action.id,
          status: "applied",
          afterPayload: nextAfterPayload,
        });

        await supabase
          .from("drive_scan_items")
          .update({ status: "applied" })
          .eq("id", scanItem.id)
          .eq("tenant_id", params.tenantId);

        applied.push({
          actionId: action.id,
          processTaskId: ensured.task.id,
          fileName: fileAlreadyInTarget.name || scanItem.name,
        });
        processesToSync.set(ensured.task.id, ensured.task);
        continue;
      }

      const fileStillInOriginalParent = scanItem.parent_folder_id
        ? await findDriveChildById({
          accessToken: params.accessToken,
          folderId: scanItem.parent_folder_id,
          fileId: scanItem.drive_file_id,
        })
        : null;

      if (scanItem.parent_folder_id && !fileStillInOriginalParent) {
        skipped.push({ actionId: action.id, reason: "original_parent_missing" });
        await markAction({
          supabase,
          actionId: action.id,
          status: "skipped",
          errorMessage: "Arquivo nao esta mais na pasta original; confirme o destino antes de reaplicar.",
          afterPayload: {
            ...(action.after_payload || {}),
            target_drive_folder_id: targetFolderId,
            target_folder_label: action.target_folder_label,
            idempotency_reason: "original_parent_missing_without_target_evidence",
          },
        });
        continue;
      }

      const movedFile = await moveGoogleDriveFile(params.accessToken, {
        fileId: scanItem.drive_file_id,
        addParentId: targetFolderId,
        removeParentIds: scanItem.parent_folder_id ? [scanItem.parent_folder_id] : [],
      });

      const nextAfterPayload = {
        ...(action.after_payload || {}),
        moved_file_id: movedFile.id,
        moved_file_name: movedFile.name || scanItem.name,
        target_drive_folder_id: targetFolderId,
        target_folder_label: action.target_folder_label,
        applied_at: new Date().toISOString(),
      };

      await markAction({
        supabase,
        actionId: action.id,
        status: "applied",
        afterPayload: nextAfterPayload,
      });

      await supabase
        .from("drive_scan_items")
        .update({ status: "applied" })
        .eq("id", scanItem.id)
        .eq("tenant_id", params.tenantId);

      applied.push({
        actionId: action.id,
        processTaskId: ensured.task.id,
        fileName: movedFile.name || scanItem.name,
      });
      processesToSync.set(ensured.task.id, ensured.task);
    } catch (error: any) {
      const message = sanitizeApplyError(error);
      failed.push({ actionId: action.id, error: message });
      await markAction({
        supabase,
        actionId: action.id,
        status: "failed",
        errorMessage: message,
      });
    }
  }

  const syncWarnings: unknown[] = [];
  const { syncProcessDocuments } = await import("@/lib/services/process-documents");
  for (const task of Array.from(processesToSync.values())) {
    try {
      const synced = await syncProcessDocuments({
        tenantId: params.tenantId,
        accessToken: params.accessToken,
        task,
      });
      syncWarnings.push(...synced.warnings);
    } catch (error: any) {
      syncWarnings.push({
        process_task_id: task.id,
        message: error?.message || "Falha ao sincronizar memoria documental apos apply.",
      });
    }
  }

  const completedStatus = failed.length > 0 || skipped.length > 0 ? "completed_with_warnings" : "completed";
  const counters = {
    applied: applied.length,
    skipped: skipped.length,
    failed: failed.length,
    syncedProcesses: processesToSync.size,
  };
  const resultSummary = `Organizacao do Drive aplicou ${applied.length} acao(oes), ignorou ${skipped.length} e teve ${failed.length} falha(s).`;

  let resultArtifactId: string | null = null;
  if (scanRun.brain_task_id) {
    const { data: resultArtifact } = await supabase
      .from("brain_artifacts")
      .insert({
        tenant_id: params.tenantId,
        task_id: scanRun.brain_task_id,
        run_id: scanRun.brain_run_id || null,
        step_id: scanRun.brain_step_id || null,
        artifact_type: "drive_document_organization_result",
        title: "Resultado da organizacao do Drive",
        source_module: "documentos",
        metadata: {
          summary: resultSummary,
          scan_run_id: params.scanRunId,
          counters,
          applied: applied.slice(0, 25),
          skipped: skipped.slice(0, 25),
          failed: failed.slice(0, 25),
          sync_warnings: syncWarnings.slice(0, 10),
          external_side_effects: applied.length > 0,
          human_review_preserved: skipped.length > 0,
        },
      })
      .select("id")
      .single();

    resultArtifactId = resultArtifact?.id || null;
  }

  await supabase
    .from("drive_scan_runs")
    .update({
      status: completedStatus,
      counters: {
        preview: scanRun.counters || {},
        apply: counters,
      },
      completed_at: new Date().toISOString(),
      error_message: failed.length > 0 ? `${failed.length} acao(oes) falharam.` : null,
    })
    .eq("id", params.scanRunId)
    .eq("tenant_id", params.tenantId);

  await supabase
    .from("learning_events")
    .insert({
      tenant_id: params.tenantId,
      task_id: scanRun.brain_task_id || null,
      run_id: scanRun.brain_run_id || null,
      event_type: "drive_document_organization_applied",
      source_module: "documentos",
      payload: {
        scan_run_id: params.scanRunId,
        artifact_id: resultArtifactId,
        counters,
        applied: applied.slice(0, 25),
        skipped: skipped.slice(0, 25),
        failed: failed.slice(0, 25),
        sync_warnings: syncWarnings.slice(0, 10),
      },
      created_by: params.userId,
    });

  await supabase
    .from("system_event_logs")
    .insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      source: "documentos",
      provider: "google_drive",
      event_name: "drive_document_organization_applied",
      status: failed.length > 0 ? "warning" : "completed",
      payload: {
        scan_run_id: params.scanRunId,
        artifact_id: resultArtifactId,
        counters,
        applied: applied.slice(0, 25),
        skipped: skipped.slice(0, 25),
        failed: failed.slice(0, 25),
      },
    });

  return {
    scanRunId: params.scanRunId,
    brainArtifactId: resultArtifactId,
    counters,
    applied,
    skipped,
    failed,
    syncWarnings,
  };
}

export async function revertDriveDocumentScanActions(params: {
  tenantId: string;
  userId: string;
  accessToken: string;
  scanRunId: string;
  actionIds: string[];
  supabase?: ScannerSupabase;
}) {
  const supabase = params.supabase || (await import("@/lib/supabase/admin")).supabaseAdmin;
  const actionIds = (params.actionIds || []).map((id) => String(id || "").trim()).filter(Boolean);

  if (!params.tenantId || !params.userId || !params.accessToken || !params.scanRunId || actionIds.length === 0) {
    throw new Error("DriveScanRevertMissingRequiredInput");
  }

  const { data: scanRun, error: scanRunError } = await supabase
    .from("drive_scan_runs")
    .select("id, tenant_id, counters, brain_task_id, brain_run_id, brain_step_id")
    .eq("id", params.scanRunId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  if (scanRunError) throw scanRunError;
  if (!scanRun?.id) throw new Error("DriveScanRunNotFound");

  const { data: actionRows, error: actionsError } = await supabase
    .from("drive_scan_actions")
    .select("id, scan_item_id, action_type, target_process_task_id, target_folder_label, target_drive_folder_id, before_payload, after_payload, confidence, status")
    .eq("tenant_id", params.tenantId)
    .eq("scan_run_id", params.scanRunId)
    .in("id", actionIds);

  if (actionsError) throw actionsError;

  const actions = (actionRows || []) as DriveScanActionRecord[];
  const reverted: Array<{ actionId: string; fileId: string; restoredParentFolderId: string }> = [];
  const skipped: Array<{ actionId: string; reason: string }> = [];
  const failed: Array<{ actionId: string; error: string }> = [];

  for (const action of actions) {
    if (action.status !== "applied") {
      skipped.push({ actionId: action.id, reason: "action_not_applied" });
      continue;
    }

    if (!["move_to_process_folder", "create_process_folder"].includes(action.action_type)) {
      skipped.push({ actionId: action.id, reason: "action_did_not_move_file" });
      continue;
    }

    const originalParentFolderId = readStringPayload(action.before_payload, "parent_folder_id");
    const targetDriveFolderId =
      readStringPayload(action.after_payload, "target_drive_folder_id") ||
      action.target_drive_folder_id ||
      null;

    if (!originalParentFolderId || !targetDriveFolderId) {
      skipped.push({ actionId: action.id, reason: "missing_revert_parent_data" });
      continue;
    }

    try {
      const { data: item, error: itemError } = await supabase
        .from("drive_scan_items")
        .select("id, drive_file_id, parent_folder_id, parent_path, name")
        .eq("id", action.scan_item_id)
        .eq("tenant_id", params.tenantId)
        .maybeSingle();

      if (itemError) throw itemError;
      const scanItem = item as DriveScanItemRecord | null;
      const fileId = readStringPayload(action.after_payload, "moved_file_id") || scanItem?.drive_file_id || null;
      if (!fileId) throw new Error("DriveScanItemNotFound");

      const movedFile = await moveGoogleDriveFile(params.accessToken, {
        fileId,
        addParentId: originalParentFolderId,
        removeParentIds: [targetDriveFolderId],
      });

      const revertedAt = new Date().toISOString();
      const nextAfterPayload = {
        ...(action.after_payload || {}),
        reverted: true,
        reverted_at: revertedAt,
        reverted_by: params.userId,
        reverted_file_id: movedFile.id,
        restored_parent_folder_id: originalParentFolderId,
        removed_parent_folder_id: targetDriveFolderId,
      };

      const { error: updateError } = await supabase
        .from("drive_scan_actions")
        .update({
          status: "reverted",
          error_message: null,
          after_payload: nextAfterPayload,
        })
        .eq("id", action.id)
        .eq("tenant_id", params.tenantId);

      if (updateError) throw updateError;

      await supabase
        .from("drive_scan_items")
        .update({ status: "preview" })
        .eq("id", action.scan_item_id)
        .eq("tenant_id", params.tenantId);

      reverted.push({
        actionId: action.id,
        fileId: movedFile.id || fileId,
        restoredParentFolderId: originalParentFolderId,
      });
    } catch (error: any) {
      const message = sanitizeApplyError(error) || "Falha ao reverter acao do scanner.";
      failed.push({ actionId: action.id, error: message });

      await supabase
        .from("drive_scan_actions")
        .update({
          error_message: message,
          after_payload: {
            ...(action.after_payload || {}),
            revert_failed_at: new Date().toISOString(),
            revert_error: message,
          },
        })
        .eq("id", action.id)
        .eq("tenant_id", params.tenantId);
    }
  }

  const counters = {
    reverted: reverted.length,
    skipped: skipped.length,
    failed: failed.length,
  };
  const resultSummary = `Reversao da organizacao do Drive moveu ${reverted.length} arquivo(s) de volta, ignorou ${skipped.length} acao(oes) e teve ${failed.length} falha(s).`;

  let resultArtifactId: string | null = null;
  if (scanRun.brain_task_id) {
    const { data: resultArtifact } = await supabase
      .from("brain_artifacts")
      .insert({
        tenant_id: params.tenantId,
        task_id: scanRun.brain_task_id,
        run_id: scanRun.brain_run_id || null,
        step_id: scanRun.brain_step_id || null,
        artifact_type: "drive_document_organization_revert",
        title: "Reversao da organizacao do Drive",
        source_module: "documentos",
        metadata: {
          summary: resultSummary,
          scan_run_id: params.scanRunId,
          counters,
          reverted: reverted.slice(0, 25),
          skipped: skipped.slice(0, 25),
          failed: failed.slice(0, 25),
          external_side_effects: reverted.length > 0,
          documents_deleted: false,
          memory_deleted: false,
        },
      })
      .select("id")
      .single();

    resultArtifactId = resultArtifact?.id || null;
  }

  await supabase
    .from("drive_scan_runs")
    .update({
      status: failed.length > 0 || skipped.length > 0 ? "completed_with_warnings" : "completed",
      counters: {
        ...(typeof scanRun.counters === "object" && scanRun.counters ? scanRun.counters : {}),
        revert: counters,
      },
      completed_at: new Date().toISOString(),
      error_message: failed.length > 0 ? `${failed.length} reversao(oes) falharam.` : null,
    })
    .eq("id", params.scanRunId)
    .eq("tenant_id", params.tenantId);

  await supabase
    .from("learning_events")
    .insert({
      tenant_id: params.tenantId,
      task_id: scanRun.brain_task_id || null,
      run_id: scanRun.brain_run_id || null,
      event_type: "drive_document_organization_reverted",
      source_module: "documentos",
      payload: {
        scan_run_id: params.scanRunId,
        artifact_id: resultArtifactId,
        counters,
        reverted: reverted.slice(0, 25),
        skipped: skipped.slice(0, 25),
        failed: failed.slice(0, 25),
      },
      created_by: params.userId,
    });

  await supabase
    .from("system_event_logs")
    .insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      source: "documentos",
      provider: "google_drive",
      event_name: "drive_document_organization_reverted",
      status: failed.length > 0 ? "warning" : "completed",
      payload: {
        scan_run_id: params.scanRunId,
        artifact_id: resultArtifactId,
        counters,
        reverted: reverted.slice(0, 25),
        skipped: skipped.slice(0, 25),
        failed: failed.slice(0, 25),
        documents_deleted: false,
        memory_deleted: false,
      },
    });

  return {
    scanRunId: params.scanRunId,
    brainArtifactId: resultArtifactId,
    counters,
    reverted,
    skipped,
    failed,
  };
}
