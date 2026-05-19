import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMemoryPromotionProposal,
  sanitizeMemoryText,
} from "@/lib/agent/memory/promotion";
import { recordLearningEvent } from "@/lib/agent/memory/learning-events";

type ReviewClient = Pick<SupabaseClient, "from"> | { from: (table: string) => any };

type LearningEventRow = {
  id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  created_at: string | null;
};

type BrainMemoryRow = {
  id: string;
  memory_key: string | null;
  value: Record<string, unknown> | null;
  source: string | null;
  promoted: boolean | null;
  created_at: string | null;
};

export type SelfImprovementPatternSummary = {
  patternKind: string;
  category: "compliance" | "financeiro" | "comercial" | "juridico" | "atendimento";
  eventType: string;
  count: number;
  evidenceEventIds: string[];
  suggestedText: string;
  correctionKind: string;
  recommendedAction: string;
  skipped?: boolean;
  skipReason?: string;
};

export type RunSelfImprovementReviewInput = {
  supabase: ReviewClient;
  tenantId: string;
  lookbackDays?: number;
  actorId?: string | null;
  brainContext?: {
    taskId?: string | null;
    runId?: string | null;
    stepId?: string | null;
  } | null;
};

export type RunSelfImprovementReviewResult = {
  proposalsCreated: number;
  patternsDetected: SelfImprovementPatternSummary[];
};

type PatternCandidate = Omit<SelfImprovementPatternSummary, "skipped" | "skipReason"> & {
  evidenceEvents: Array<{ id: string; event_type: string; created_at: string | null }>;
};

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeToken(value: unknown, fallback = "geral") {
  const text = sanitizeMemoryText(String(value || ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return text || fallback;
}

function firstString(value: unknown) {
  if (Array.isArray(value)) {
    const found = value.find((item) => typeof item === "string" && item.trim());
    return typeof found === "string" ? found : null;
  }
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function overdueBucket(value: unknown) {
  const days = numberOrNull(value);
  if (days === null) return "unknown";
  if (days <= 7) return "0_7";
  if (days <= 30) return "8_30";
  return "30_plus";
}

function leadReason(value: unknown) {
  const text = sanitizeMemoryText(String(value || "")).trim();
  if (!text) return "sem_motivo";
  return normalizeToken(text.split(/\s+/).slice(0, 5).join(" "), "sem_motivo");
}

function groupKeyForEvent(event: LearningEventRow) {
  const payload = getRecord(event.payload);
  if (event.event_type === "mayus_operating_partner_repair_pattern") {
    const flag = normalizeToken(firstString(payload.original_risk_flags), "unknown_flag");
    return {
      patternKind: `repair_${flag}`,
      category: "compliance" as const,
      groupKey: `repair:${flag}`,
      suggestedText: `Quando o MAYUS apresentar reparos recorrentes por ${flag}, revisar a resposta antes do envio e priorizar a regra institucional associada.`,
      correctionKind: "operating_partner_reply_repair",
      recommendedAction: "Regenerar a resposta antes do envio; se a flag persistir, bloquear autoenvio e pedir revisao humana.",
    };
  }

  if (event.event_type === "self_correction_failed" || event.event_type === "self_correction_blocked") {
    const correctionKind = normalizeToken(payload.correction_kind, "unknown_correction");
    const reason = normalizeToken(payload.reason || payload.pattern_kind, "sem_motivo");
    return {
      patternKind: `correction_${event.event_type === "self_correction_failed" ? "failed" : "blocked"}_${correctionKind}_${reason}`,
      category: "compliance" as const,
      groupKey: `self_correction:${event.event_type}:${correctionKind}:${reason}`,
      suggestedText: `Quando a auto-correcao ${correctionKind} falhar ou bloquear pelo motivo ${reason}, revisar o guardrail antes de repetir a execucao.`,
      correctionKind,
      recommendedAction: "Escalar para revisao humana e transformar o padrao em memoria institucional antes de nova aplicacao automatica.",
    };
  }

  if (event.event_type === "billing_payment_overdue") {
    const bucket = overdueBucket(payload.delay_days_estimate);
    return {
      patternKind: `overdue_${bucket}`,
      category: "financeiro" as const,
      groupKey: `overdue:${bucket}`,
      suggestedText: `Quando uma cobranca entrar na faixa de atraso ${bucket.replace("_", "-")}, preparar follow-up financeiro supervisionado antes de liberar novas acoes de cobranca.`,
      correctionKind: "supervised_financial_followup",
      recommendedAction: "Preparar follow-up financeiro como rascunho supervisionado, sem acao externa automatica.",
    };
  }

  if (event.event_type === "lead_outcome_recorded") {
    const outcome = payload.outcome === "won" ? "won" : payload.outcome === "lost" ? "lost" : "unknown";
    const reason = leadReason(payload.motivo);
    return {
      patternKind: `lead_${outcome}_motivo_${reason}`,
      category: "comercial" as const,
      groupKey: `lead:${outcome}:${reason}`,
      suggestedText: `Quando leads terminarem como ${outcome} pelo motivo ${reason}, ajustar abordagem comercial e proximo passo antes de repetir o mesmo roteiro.`,
      correctionKind: "commercial_playbook_adjustment",
      recommendedAction: "Ajustar roteiro comercial e proximo passo antes de aplicar novamente no atendimento.",
    };
  }

  if (event.event_type === "human_revision_delta_recorded") {
    const signal = normalizeToken(firstString(payload.signal_categories), "delta_humano");
    return {
      patternKind: `draft_delta_${signal}`,
      category: "juridico" as const,
      groupKey: `draft_delta:${signal}`,
      suggestedText: `Quando revisoes humanas indicarem ${signal}, incorporar esse padrao na proxima minuta antes da revisao final.`,
      correctionKind: "legal_draft_guardrail",
      recommendedAction: "Aplicar o padrao na proxima minuta, mantendo revisao humana antes de uso juridico.",
    };
  }

  if (event.event_type === "legal_piece_approved" || event.event_type === "legal_piece_published") {
    const workflow = event.event_type === "legal_piece_approved" ? "approved" : "published";
    const practice = normalizeToken(payload.practice_area, "area_geral");
    const piece = normalizeToken(payload.piece_type || payload.piece_label, "peca");
    return {
      patternKind: `piece_${workflow}_${practice}_${piece}`,
      category: "juridico" as const,
      groupKey: `piece:${workflow}:${practice}:${piece}`,
      suggestedText: `Quando pecas ${piece} em ${practice} forem ${workflow}, preservar os padroes juridicos aprovados e os guardrails de revisao na proxima geracao.`,
      correctionKind: "legal_piece_pattern_reuse",
      recommendedAction: "Reutilizar o padrao aprovado como memoria, sem dispensar revisao humana da peca final.",
    };
  }

  if (event.event_type === "whatsapp_human_reply_delta_recorded") {
    const editCategory = Array.isArray(payload.edit_categories) && payload.edit_categories.includes("objection_handled")
      ? "objection_handled"
      : normalizeToken(firstString(payload.edit_categories), "human_reply_delta");
    const stage = normalizeToken(payload.conversation_stage || payload.intent, "atendimento");
    return {
      patternKind: `attendance_${stage}_${editCategory}`,
      category: "atendimento" as const,
      groupKey: `attendance:${stage}:${editCategory}`,
      suggestedText: `Quando o atendimento WhatsApp estiver em ${stage} com ${editCategory}, revisar o rascunho MAYUS antes do envio e preservar o padrao humano que melhorou a resposta.`,
      correctionKind: "attendance_reply_repair",
      recommendedAction: "Corrigir o rascunho antes do envio e promover o padrao humano aprovado para memoria supervisionada.",
    };
  }

  if (event.event_type === "support_case_status_resolved") {
    const responseMode = normalizeToken(payload.response_mode, "unknown");
    const reason = responseMode === "handoff"
      ? normalizeToken(payload.handoff_reason, "handoff")
      : normalizeToken(payload.confidence, "answer");
    return {
      patternKind: `support_status_${responseMode}_${reason}`,
      category: "atendimento" as const,
      groupKey: `support:${responseMode}:${reason}`,
      suggestedText: `Quando pedidos de status de caso terminarem em ${responseMode}/${reason}, melhorar a triagem de suporte e pedir identificadores suficientes antes de responder o cliente.`,
      correctionKind: "support_triage_correction",
      recommendedAction: "Corrigir a triagem de suporte antes de responder e escalar quando faltar identificador verificavel.",
    };
  }

  return null;
}

function buildPatternCandidates(events: LearningEventRow[]): PatternCandidate[] {
  const groups = new Map<string, PatternCandidate>();

  for (const event of events) {
    const grouping = groupKeyForEvent(event);
    if (!grouping) continue;

    const current = groups.get(grouping.groupKey) || {
      patternKind: grouping.patternKind,
      category: grouping.category,
      eventType: event.event_type,
      count: 0,
      evidenceEventIds: [],
      evidenceEvents: [],
      suggestedText: grouping.suggestedText,
      correctionKind: grouping.correctionKind,
      recommendedAction: grouping.recommendedAction,
    };

    current.count += 1;
    if (current.evidenceEventIds.length < 5) {
      current.evidenceEventIds.push(event.id);
      current.evidenceEvents.push({
        id: event.id,
        event_type: event.event_type,
        created_at: event.created_at,
      });
    }
    groups.set(grouping.groupKey, current);
  }

  return Array.from(groups.values()).filter((candidate) => candidate.count >= 3);
}

function isRecent(createdAt: string | null, days: number) {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created)) return false;
  return Date.now() - created <= days * 24 * 60 * 60 * 1000;
}

function isRejectedOrRevoked(row: BrainMemoryRow) {
  const status = typeof row.value?.status === "string" ? row.value.status : null;
  return status === "rejected" || status === "revoked";
}

function proposalMemoryKey(patternKind: string) {
  return `self_improvement:${patternKind}`.slice(0, 120);
}

async function loadLearningEvents(params: RunSelfImprovementReviewInput, lookbackIso: string) {
  const { data, error } = await params.supabase
    .from("learning_events")
    .select("id, event_type, payload, created_at")
    .eq("tenant_id", params.tenantId)
    .in("event_type", [
      "mayus_operating_partner_repair_pattern",
      "self_correction_failed",
      "self_correction_blocked",
      "billing_payment_overdue",
      "lead_outcome_recorded",
      "human_revision_delta_recorded",
      "legal_piece_approved",
      "legal_piece_published",
      "whatsapp_human_reply_delta_recorded",
      "support_case_status_resolved",
    ])
    .gte("created_at", lookbackIso)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw error;
  return Array.isArray(data) ? data as LearningEventRow[] : [];
}

async function loadExistingSelfImprovementMemories(params: RunSelfImprovementReviewInput) {
  const { data, error } = await params.supabase
    .from("brain_memories")
    .select("id, memory_key, value, source, promoted, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("scope", "tenant")
    .eq("memory_type", "institutional_memory_proposal")
    .eq("source", "self_improvement_loop")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return Array.isArray(data) ? data as BrainMemoryRow[] : [];
}

function shouldSkipCandidate(candidate: PatternCandidate, existing: BrainMemoryRow[]) {
  const key = proposalMemoryKey(candidate.patternKind);
  const match = existing.find((row) => row.memory_key === key && !isRejectedOrRevoked(row));
  if (!match) return null;
  if (match.promoted === true) return "already_promoted";
  if (isRecent(match.created_at, 7)) return "recent_proposal_exists";
  return null;
}

async function insertProposal(params: RunSelfImprovementReviewInput, candidate: PatternCandidate) {
  const proposal = buildMemoryPromotionProposal({
    key: proposalMemoryKey(candidate.patternKind),
    value: candidate.suggestedText,
    category: candidate.category,
    source: "self_improvement_loop",
    sourceLabel: "MAYUS detectou padrao",
    confidence: 0.6,
      evidence: {
        pattern_kind: candidate.patternKind,
        correction_kind: candidate.correctionKind,
        recommended_action: candidate.recommendedAction,
        event_type: candidate.eventType,
        count: candidate.count,
      evidence_event_ids: candidate.evidenceEventIds,
      evidence_events: candidate.evidenceEvents,
    },
    proposedBy: params.actorId || null,
  });

  const { error } = await params.supabase.from("brain_memories").insert({
    tenant_id: params.tenantId,
    scope: "tenant",
    memory_type: proposal.memoryType,
    memory_key: proposal.memoryKey,
    value: proposal.value,
    source: proposal.source,
    confidence: proposal.confidence,
    promoted: false,
    created_by: params.actorId || null,
  });

  if (error) throw error;
}

async function insertReportArtifact(params: RunSelfImprovementReviewInput, result: RunSelfImprovementReviewResult) {
  if (!params.brainContext?.taskId) return;

  const { error } = await params.supabase.from("brain_artifacts").insert({
    tenant_id: params.tenantId,
    task_id: params.brainContext.taskId,
    run_id: params.brainContext.runId || null,
    step_id: params.brainContext.stepId || null,
    artifact_type: "self_improvement_report",
    title: "Relatorio de auto-aprendizado MAYUS",
    source_module: "self_improvement_loop",
    mime_type: "application/json",
    metadata: {
      proposals_created: result.proposalsCreated,
      patterns_detected: result.patternsDetected,
      external_side_effects_blocked: true,
    },
  });
  if (error) throw error;
}

export async function runSelfImprovementReview(input: RunSelfImprovementReviewInput): Promise<RunSelfImprovementReviewResult> {
  if (!input.tenantId) {
    return { proposalsCreated: 0, patternsDetected: [] };
  }

  const lookbackDays = Math.max(1, Math.min(Math.floor(input.lookbackDays ?? 7), 90));
  const lookbackIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const events = await loadLearningEvents(input, lookbackIso);
  const candidates = buildPatternCandidates(events);
  const existing = await loadExistingSelfImprovementMemories(input);
  const patternsDetected: SelfImprovementPatternSummary[] = [];
  let proposalsCreated = 0;

  for (const candidate of candidates) {
    const skipReason = shouldSkipCandidate(candidate, existing);
    if (skipReason) {
      patternsDetected.push({ ...candidate, skipped: true, skipReason });
      continue;
    }

    await insertProposal(input, candidate);
    proposalsCreated += 1;
    patternsDetected.push(candidate);
  }

  const result = { proposalsCreated, patternsDetected };

  if (proposalsCreated > 0) {
    await recordLearningEvent({
      supabase: input.supabase,
      tenantId: input.tenantId,
      eventType: "self_improvement_proposals_created",
      sourceModule: "self_improvement_loop",
      createdBy: input.actorId || null,
      taskId: input.brainContext?.taskId || null,
      runId: input.brainContext?.runId || null,
      stepId: input.brainContext?.stepId || null,
      payload: {
        proposals_created: proposalsCreated,
        pattern_kinds: patternsDetected.filter((pattern) => !pattern.skipped).map((pattern) => pattern.patternKind),
        correction_kinds: patternsDetected.filter((pattern) => !pattern.skipped).map((pattern) => pattern.correctionKind),
      },
    });
  }

  await insertReportArtifact(input, result);

  return result;
}
