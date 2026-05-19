import type { SupabaseClient } from "@supabase/supabase-js";
import { recordLearningEvent } from "@/lib/agent/memory/learning-events";
import { sanitizeMemoryText } from "@/lib/agent/memory/promotion";

type SelfCorrectionClient = Pick<SupabaseClient, "from"> | { from: (table: string) => any };

export type SelfCorrectionRiskLevel = "low" | "medium" | "high" | "critical" | "unknown";

export type SelfCorrectionOutcome =
  | "corrected"
  | "requires_approval"
  | "blocked"
  | "failed"
  | "no_correction_available";

export type SelfCorrectionEventPhase = "attempted" | SelfCorrectionOutcome;

export type RecordSelfCorrectionEventInput = {
  supabase: SelfCorrectionClient;
  tenantId: string;
  status: SelfCorrectionEventPhase;
  sourceModule: string;
  correctionKind: string;
  riskLevel?: SelfCorrectionRiskLevel | string | null;
  targetModule?: string | null;
  sourceEventType?: string | null;
  sourceEventId?: string | null;
  patternKind?: string | null;
  recommendedAction?: string | null;
  reason?: string | null;
  confidence?: number | null;
  evidenceEventIds?: string[];
  externalSideEffectsBlocked?: boolean;
  metadata?: Record<string, unknown>;
  createdBy?: string | null;
  brainContext?: {
    taskId?: string | null;
    runId?: string | null;
    stepId?: string | null;
  } | null;
};

export type SelfCorrectionPolicyPlan = {
  status: SelfCorrectionOutcome;
  correctionKind: string;
  recommendedAction: string;
  externalSideEffectsBlocked: boolean;
};

export const SELF_CORRECTION_TAXONOMY = {
  operating_partner_reply_repair: {
    category: "atendimento",
    automaticRiskLimit: "low",
    recommendedAction: "Regenerar resposta antes de enviar e bloquear autoenvio se os validadores continuarem inseguros.",
  },
  missing_configuration: {
    category: "setup",
    automaticRiskLimit: "none",
    recommendedAction: "Bloquear execucao automatica e orientar correcao de credencial ou configuracao.",
  },
  support_triage_correction: {
    category: "atendimento",
    automaticRiskLimit: "low",
    recommendedAction: "Corrigir triagem de suporte antes da resposta e escalar quando faltar identificador verificavel.",
  },
  legal_draft_guardrail: {
    category: "juridico",
    automaticRiskLimit: "none",
    recommendedAction: "Aplicar padrao na proxima minuta, mantendo revisao humana antes de uso juridico.",
  },
  commercial_playbook_adjustment: {
    category: "comercial",
    automaticRiskLimit: "low",
    recommendedAction: "Ajustar roteiro comercial e proximo passo antes de repetir atendimento.",
  },
  supervised_financial_followup: {
    category: "financeiro",
    automaticRiskLimit: "none",
    recommendedAction: "Preparar follow-up financeiro como rascunho supervisionado, sem acao externa automatica.",
  },
  supervision_required: {
    category: "policy",
    automaticRiskLimit: "none",
    recommendedAction: "Degradar para aprovacao humana antes de qualquer efeito externo ou irreversivel.",
  },
  policy_preflight: {
    category: "policy",
    automaticRiskLimit: "low",
    recommendedAction: "Seguir apenas quando a policy permitir baixo risco autorizado.",
  },
} as const;

const SELF_CORRECTION_EVENT_TYPE_BY_STATUS: Record<SelfCorrectionEventPhase, string> = {
  attempted: "self_correction_attempted",
  corrected: "self_correction_applied",
  requires_approval: "self_correction_requires_approval",
  blocked: "self_correction_blocked",
  failed: "self_correction_failed",
  no_correction_available: "self_correction_not_available",
};

export function normalizeSelfCorrectionRiskLevel(value: unknown): SelfCorrectionRiskLevel {
  return value === "low" || value === "medium" || value === "high" || value === "critical"
    ? value
    : "unknown";
}

function safeList(values?: string[]) {
  return Array.isArray(values)
    ? values.map((value) => sanitizeMemoryText(value).slice(0, 120)).filter(Boolean).slice(0, 10)
    : [];
}

export function buildSelfCorrectionLearningPayload(input: RecordSelfCorrectionEventInput): Record<string, unknown> {
  const riskLevel = normalizeSelfCorrectionRiskLevel(input.riskLevel);

  return {
    correction_status: input.status,
    correction_kind: sanitizeMemoryText(input.correctionKind).slice(0, 120),
    risk_level: riskLevel,
    target_module: input.targetModule ? sanitizeMemoryText(input.targetModule).slice(0, 120) : null,
    source_event_type: input.sourceEventType ? sanitizeMemoryText(input.sourceEventType).slice(0, 120) : null,
    source_event_id: input.sourceEventId ? sanitizeMemoryText(input.sourceEventId).slice(0, 120) : null,
    pattern_kind: input.patternKind ? sanitizeMemoryText(input.patternKind).slice(0, 120) : null,
    recommended_action: input.recommendedAction ? sanitizeMemoryText(input.recommendedAction).slice(0, 500) : null,
    reason: input.reason ? sanitizeMemoryText(input.reason).slice(0, 500) : null,
    confidence: typeof input.confidence === "number" && Number.isFinite(input.confidence)
      ? Math.max(0, Math.min(1, input.confidence))
      : null,
    evidence_event_ids: safeList(input.evidenceEventIds),
    external_side_effects_blocked: input.externalSideEffectsBlocked ?? riskLevel !== "low",
    metadata: input.metadata || {},
  };
}

export async function recordSelfCorrectionEvent(input: RecordSelfCorrectionEventInput) {
  return recordLearningEvent({
    supabase: input.supabase,
    tenantId: input.tenantId,
    eventType: SELF_CORRECTION_EVENT_TYPE_BY_STATUS[input.status],
    sourceModule: input.sourceModule,
    createdBy: input.createdBy || null,
    taskId: input.brainContext?.taskId || null,
    runId: input.brainContext?.runId || null,
    stepId: input.brainContext?.stepId || null,
    payload: buildSelfCorrectionLearningPayload(input),
  });
}

export function planSelfCorrectionForPolicy(input: {
  riskLevel?: SelfCorrectionRiskLevel | string | null;
  policyOutcome?: string | null;
  requiresHumanConfirmation?: boolean | null;
  missingConfiguration?: boolean | null;
}): SelfCorrectionPolicyPlan {
  const riskLevel = normalizeSelfCorrectionRiskLevel(input.riskLevel);

  if (input.missingConfiguration || input.policyOutcome === "blocked_needs_credentials") {
    return {
      status: "blocked",
      correctionKind: "missing_configuration",
      recommendedAction: "Bloquear a execucao automatica e orientar correcao de credenciais ou configuracao antes de tentar novamente.",
      externalSideEffectsBlocked: true,
    };
  }

  if (
    input.requiresHumanConfirmation
    || input.policyOutcome === "requires_approval"
    || riskLevel === "medium"
    || riskLevel === "high"
    || riskLevel === "critical"
  ) {
    return {
      status: "requires_approval",
      correctionKind: "supervision_required",
      recommendedAction: "Degradar a acao para aprovacao humana antes de qualquer efeito externo ou irreversivel.",
      externalSideEffectsBlocked: true,
    };
  }

  return {
    status: "no_correction_available",
    correctionKind: "policy_preflight",
    recommendedAction: "Nenhuma correcao necessaria; a policy permitiu seguir apenas por ser baixo risco e autorizado.",
    externalSideEffectsBlocked: false,
  };
}
