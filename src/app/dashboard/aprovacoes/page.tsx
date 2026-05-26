"use client";

import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/pt-br";
import {
  Ban,
  CheckCircle2,
  Clock3,
  Cpu,
  FileText,
  Loader2,
  Link2,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/useUserProfile";
import { isBrainExecutiveRole } from "@/lib/brain/roles";
import type { BrainInboxApprovalItem, BrainInboxArtifactItem, BrainInboxEventItem, BrainInboxResponse, BrainInboxTaskItem } from "@/lib/brain/inbox-types";

dayjs.extend(relativeTime);
dayjs.locale("pt-br");

type ApprovalFilterId = "all" | "setup" | "legal" | "finance" | "escavador" | "external_messages";
type ActivityFilterId = "all" | "mayus_corrections";

type LegalMovementReviewItem = {
  id: string;
  created_at: string;
  status: string | null;
  numero_cnj: string | null;
  tipo_evento: string | null;
  acao_sugerida: string | null;
  data_vencimento_extraida: string | null;
  confianca_analise: string | null;
  origem: string | null;
  motivo: string | null;
  polo_representado?: string | null;
  obrigacao_de_quem?: string | null;
  confidence?: string | null;
  confidence_reason?: string | null;
  evidencia: string | null;
  agentic_governance?: {
    openclaw: {
      surface: string | null;
      outcome: string | null;
      requires_approval: boolean | null;
      can_execute_now: boolean | null;
      reason: string | null;
    };
    hermes: {
      status: string | null;
      events_count: number;
      last_event_type: string | null;
      last_event_summary: string | null;
    };
  } | null;
  movimentacao_data: string | null;
  movimentacao_conteudo: string | null;
  cliente_nome: string | null;
  tribunal: string | null;
  review_error?: string | null;
  review_note?: string | null;
};

type WhatsAppAgentAuditEntry = {
  id: string;
  created_at: string;
  event_name: string;
  status: string;
  contact_id: string | null;
  brain_run_id: string | null;
  skill: string | null;
  route: string | null;
  actor_role: string | null;
  conversation_type: string | null;
  quality_status: string | null;
  quality_flags: string[];
  risk_flags: string[];
  final_response_source: string | null;
  mode: string | null;
  blocked: boolean;
  repaired: boolean;
  reason: string | null;
  original_reply_preview: string | null;
  final_reply_preview: string | null;
};

type WhatsAppAgentAuditResponse = {
  ok: boolean;
  generated_at: string;
  metrics: {
    total: number;
    blocked: number;
    repaired: number;
    safe_fallback: number;
    llm_repaired: number;
    warnings: number;
    errors: number;
    quality_blocks: number;
  };
  entries: WhatsAppAgentAuditEntry[];
};

const APPROVAL_FILTERS: Array<{ id: ApprovalFilterId; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "setup", label: "Setup" },
  { id: "legal", label: "Juridico" },
  { id: "finance", label: "Financeiro" },
  { id: "escavador", label: "Escavador" },
  { id: "external_messages", label: "Mensagens externas" },
];

const SELF_CORRECTION_EVENT_TYPES = new Set([
  "mayus_operating_partner_repair_pattern",
  "self_correction_attempted",
  "self_correction_applied",
  "self_correction_requires_approval",
  "self_correction_blocked",
  "self_correction_failed",
  "self_correction_not_available",
  "self_correction_no_correction_available",
  "self_improvement_proposals_created",
]);

function isMayusCorrectionEvent(event: BrainInboxEventItem) {
  return SELF_CORRECTION_EVENT_TYPES.has(event.event_type);
}

function isMayusCorrectionArtifact(artifact: BrainInboxArtifactItem) {
  return artifact.artifact_type === "self_improvement_report"
    || artifact.source_module === "self_improvement_loop";
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : "";
}

function isTerminalLegalReview(tipoEvento: string | null | undefined) {
  const normalized = String(tipoEvento || "").trim().toUpperCase();
  return normalized === "ARQUIVAMENTO" || normalized === "EXTINCAO";
}

function getRiskBadge(riskLevel: string | null | undefined) {
  switch (riskLevel) {
    case "critical":
      return "text-red-300 border-red-500/30 bg-red-500/10";
    case "high":
      return "text-orange-300 border-orange-500/30 bg-orange-500/10";
    case "medium":
      return "text-yellow-300 border-yellow-500/30 bg-yellow-500/10";
    case "low":
      return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
    default:
      return "text-gray-300 border-white/10 bg-white/5";
  }
}

function getTaskBadge(status: string) {
  switch (status) {
    case "planning":
      return "text-blue-300 border-blue-500/30 bg-blue-500/10";
    case "executing":
      return "text-[#CCA761] border-[#CCA761]/30 bg-[#CCA761]/10";
    case "awaiting_approval":
      return "text-orange-300 border-orange-500/30 bg-orange-500/10";
    case "completed":
      return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
    case "completed_with_warnings":
      return "text-yellow-300 border-yellow-500/30 bg-yellow-500/10";
    case "failed":
      return "text-red-300 border-red-500/30 bg-red-500/10";
    case "cancelled":
      return "text-gray-300 border-white/10 bg-white/5";
    default:
      return "text-gray-300 border-white/10 bg-white/5";
  }
}

function humanizeEntityKey(key: string) {
  const labels: Record<string, string> = {
    process_task_id: "Processo interno",
    process_number: "Numero do processo",
    recommended_piece_input: "Peca solicitada",
    recommended_piece_label: "Peca sugerida",
  };

  return labels[key] || key.replaceAll("_", " ");
}

function getStringEntity(approval: BrainInboxApprovalItem, key: string) {
  const value = approval.awaiting_payload?.entities?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatReviewSignal(value: string | number | boolean | null | undefined) {
  if (typeof value === "boolean") return value ? "sim" : "nao";
  if (typeof value === "number") return String(value);
  const raw = typeof value === "string" ? value.trim() : "";
  return raw || "nao informado";
}

type LegalOperatorSummary = {
  phase: string | null;
  status: string;
  action: string;
  gate: string;
  blockers: string[];
  confidence: string | null;
  owner: string | null;
  handoff: string | null;
  guardrail: string | null;
};

function asRecordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getRecordText(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "sim" : "nao";
  return null;
}

function getRecordList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function buildLegalOperatorSummary(value: unknown): LegalOperatorSummary | null {
  const state = asRecordValue(value);
  if (!state) return null;

  const safeNextAction = asRecordValue(state.safeNextAction);
  const humanGate = asRecordValue(state.humanGate);
  const evidenceSummary = asRecordValue(state.evidenceSummary);
  const coordination = asRecordValue(state.coordination);
  const owner = asRecordValue(coordination?.owner);
  const crossFrontBoundary = asRecordValue(coordination?.crossFrontBoundary);
  const sideEffectGuardrail = asRecordValue(coordination?.sideEffectGuardrail);
  const action = getRecordText(safeNextAction, "label")
    || getRecordText(safeNextAction, "action")
    || "Proxima acao segura";
  const gateRequired = humanGate?.required === true;
  const gateReason = getRecordText(humanGate, "reason");
  const handoffTargets = getRecordList(crossFrontBoundary?.handoffRequiredFor).slice(0, 4);

  return {
    phase: getRecordText(state, "phase"),
    status: getRecordText(state, "status") || "ativo",
    action,
    gate: gateRequired ? (gateReason || "approval humano requerido") : "sem approval pendente",
    blockers: getRecordList(state.blockers).slice(0, 3),
    confidence: getRecordText(evidenceSummary, "confidence"),
    owner: getRecordText(owner, "label"),
    handoff: handoffTargets.length > 0 ? `Handoff: ${handoffTargets.join(", ")}` : getRecordText(crossFrontBoundary, "rule"),
    guardrail: getRecordText(sideEffectGuardrail, "approvalGate"),
  };
}

function LegalOperatorStateSummary({ state }: { state: unknown }) {
  const summary = buildLegalOperatorSummary(state);
  if (!summary) return null;

  return (
    <div className="rounded-xl border border-[#CCA761]/20 bg-[#CCA761]/10 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-[#CCA761]/30 bg-[#CCA761]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#E2C37A]">
          Operador juridico
        </span>
        <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500">{summary.status}</span>
        {summary.confidence && (
          <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500">confianca {summary.confidence}</span>
        )}
      </div>
      <div className="space-y-1 text-xs leading-relaxed text-gray-300">
        {summary.phase && <p>Missao: {summary.phase}</p>}
        <p>Proxima acao: {summary.action}</p>
        <p>Approval: {summary.gate}</p>
        {summary.owner && <p>Dono: {summary.owner}</p>}
        {summary.handoff && <p>{summary.handoff}</p>}
        {summary.guardrail && <p>Guardrail: {summary.guardrail}</p>}
        {summary.blockers.length > 0 && <p>Bloqueios: {summary.blockers.join(", ")}</p>}
      </div>
    </div>
  );
}

type LegalOperatorMissionItem = NonNullable<BrainInboxResponse["legal_operator_missions"]>[number];
type MissionControlItem = NonNullable<BrainInboxResponse["mission_control_snapshots"]>[number];

function getMissionAgentId(mission: MissionControlItem) {
  return mission.routine?.internalAgentId
    || mission.routine?.agentId
    || mission.agentSource
    || "mayus_operating_partner";
}

function getMissionAgentLabel(mission: MissionControlItem) {
  return mission.routine?.internalAgentLabel
    || mission.routine?.owner
    || mission.routine?.agentId
    || mission.agentSource
    || "MAYUS Operating Partner";
}

function canRetryMissionStep(mission: MissionControlItem) {
  const status = mission.currentStep?.status;
  return !mission.pendingApproval && (status === "failed" || status === "cancelled");
}

function canCancelMissionStep(mission: MissionControlItem) {
  const status = mission.currentStep?.status;
  return !mission.pendingApproval && (status === "queued" || status === "planning" || status === "failed");
}

function LegalOperatorMissionCard({ mission }: { mission: LegalOperatorMissionItem }) {
  const summary = buildLegalOperatorSummary(mission.currentState);
  const processLabel = mission.processNumber || mission.processLabel || mission.processTaskId || "Processo sem identificador";
  const approvalLabel = mission.pendingApproval
    ? `approval pendente: ${mission.pendingApproval.skillName || mission.pendingApproval.id}`
    : "sem approval pendente";

  return (
    <div className="rounded-2xl border border-[#CCA761]/20 bg-[#0f0f0f] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#CCA761]">Missao juridica viva</p>
          <h3 className="mt-1 text-sm font-semibold text-white break-words">{processLabel}</h3>
          <p className="mt-1 text-[11px] text-gray-500">
            {dayjs(mission.lastUpdatedAt).fromNow()} · fonte {mission.currentSource}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${mission.pendingApproval ? "border-orange-400/30 bg-orange-400/10 text-orange-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}>
          {mission.pendingApproval ? "approval" : "ativa"}
        </span>
      </div>

      {summary ? (
        <div className="space-y-1 text-xs leading-relaxed text-gray-300">
          <p>Status: {summary.status}</p>
          <p>Proxima acao: {summary.action}</p>
          <p>Approval: {approvalLabel}</p>
          {summary.blockers.length > 0 && <p>Bloqueios: {summary.blockers.join(", ")}</p>}
        </div>
      ) : (
        <p className="text-xs text-gray-400">Estado juridico registrado, mas sem resumo renderizavel.</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {mission.latestArtifactId && (
          <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-gray-400">
            artifact {mission.latestArtifactId}
          </span>
        )}
        {mission.latestEventId && (
          <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-gray-400">
            evento {mission.latestEventId}
          </span>
        )}
        <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-gray-400">
          {mission.timeline.length} marco{mission.timeline.length === 1 ? "" : "s"}
        </span>
      </div>

    </div>
  );
}

function MissionControlCard({ mission, onRefresh }: { mission: MissionControlItem; onRefresh: () => Promise<void> | void }) {
  const [stepActionLoading, setStepActionLoading] = useState<"retry" | "cancel" | null>(null);
  const approvalLabel = mission.pendingApproval
    ? `approval: ${mission.pendingApproval.skillName || mission.pendingApproval.id}`
    : "sem approval pendente";
  const policyLabel = mission.policy
    ? `${mission.policy.surface || "surface"} / ${mission.policy.outcome || "policy"}`
    : "policy nao registrada";
  const policyDebugger = mission.policy?.debugger;
  const policyDebuggerLabel = policyDebugger
    ? `${policyDebugger.blockedLayer ? `bloqueio ${policyDebugger.blockedLayer}` : "sem bloqueio superior"} · ${policyDebugger.appliedLayers.length} camada${policyDebugger.appliedLayers.length === 1 ? "" : "s"}`
    : null;
  const trajectoryLabel = mission.trajectory
    ? `${mission.trajectory.status || "sem status"} · ${mission.trajectory.eventsCount} evento${mission.trajectory.eventsCount === 1 ? "" : "s"}`
    : "trajectory nao registrada";
  const trajectoryCompletionLabel = mission.trajectory
    ? `${Math.round((mission.trajectory.completionRatio || 0) * 100)}% completo`
    : null;
  const missingHermesEvents = mission.trajectory?.missingEventTypes || [];
  const hermesLifecycleLabel = mission.trajectory?.lifecycleStatus || mission.trajectory?.lifecycleKind
    ? `${mission.trajectory.lifecycleStatus || "sem status"}${mission.trajectory.lifecycleKind ? ` / ${mission.trajectory.lifecycleKind}` : ""}`
    : null;
  const routineLabel = mission.routine?.routineId
    ? `${mission.routine.source || "paperclip"} · ${mission.routine.routineId}`
    : "sem rotina vinculada";
  const responsibleAgentLabel = mission.routine?.internalAgentLabel
    || mission.routine?.owner
    || mission.routine?.agentId
    || mission.agentSource
    || "MAYUS Operating Partner";
  const canRetry = canRetryMissionStep(mission);
  const canCancel = canCancelMissionStep(mission);

  async function handleStepAction(action: "retry" | "cancel") {
    if (!mission.currentStep) return;
    const label = action === "retry" ? "reabrir" : "cancelar";
    const reason = window.prompt(`Motivo para ${label} esta etapa:`);
    if (reason === null) return;
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 3) {
      toast.error("Informe um motivo com pelo menos 3 caracteres.");
      return;
    }

    setStepActionLoading(action);
    try {
      const response = await fetch(`/api/brain/tasks/${mission.taskId}/steps/${mission.currentStep.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmedReason }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel atualizar a etapa.");
      }
      toast.success(action === "retry" ? "Retry solicitado com auditoria." : "Step cancelado com auditoria.");
      await onRefresh();
    } catch (error: any) {
      toast.error(error?.message || "Falha ao atualizar a etapa.");
    } finally {
      setStepActionLoading(null);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#CCA761]">Controle agentico</p>
          <h3 className="mt-1 text-sm font-semibold text-white break-words">{mission.goal || mission.missionId}</h3>
          <p className="mt-1 text-[11px] text-gray-500">
            {mission.module || "core"} · {mission.agentSource || "mayus"} · {dayjs(mission.lastUpdatedAt).fromNow()}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${mission.pendingApproval ? "border-orange-400/30 bg-orange-400/10 text-orange-200" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}>
          {mission.status || "ativa"}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <div className="rounded-xl border border-white/5 bg-black/25 p-3">
          <p className="text-[9px] uppercase tracking-[0.16em] text-gray-500">Etapa atual</p>
          <p className="mt-1 text-xs font-semibold text-gray-100 break-words">
            {mission.currentStep?.title || mission.currentStep?.capabilityName || "sem step ativo"}
          </p>
          {mission.currentStep?.status && (
            <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-gray-500">{mission.currentStep.status}</p>
          )}
        </div>
        <div className="rounded-xl border border-white/5 bg-black/25 p-3">
          <p className="text-[9px] uppercase tracking-[0.16em] text-gray-500">Approval</p>
          <p className="mt-1 text-xs font-semibold text-gray-100 break-words">{approvalLabel}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/25 p-3">
          <p className="text-[9px] uppercase tracking-[0.16em] text-gray-500">OpenClaw</p>
          <p className="mt-1 text-xs font-semibold text-gray-100 break-words">{policyLabel}</p>
          {policyDebuggerLabel && (
            <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-gray-500">
              {policyDebuggerLabel}
            </p>
          )}
          {policyDebugger?.lowerLayersCannotReopen && (
            <p className="mt-1 text-[10px] leading-relaxed text-gray-500">
              Camada inferior nao reabre permissao negada acima.
            </p>
          )}
        </div>
        <div className="rounded-xl border border-white/5 bg-black/25 p-3">
          <p className="text-[9px] uppercase tracking-[0.16em] text-gray-500">Hermes</p>
          <p className="mt-1 text-xs font-semibold text-gray-100 break-words">{trajectoryLabel}</p>
          {trajectoryCompletionLabel && (
            <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-gray-500">
              {trajectoryCompletionLabel} - approval {mission.trajectory?.approvalStatus || "sem status"}
            </p>
          )}
          {hermesLifecycleLabel && (
            <p className="mt-1 text-[10px] leading-relaxed text-gray-500">
              Lifecycle: {hermesLifecycleLabel}
            </p>
          )}
          {missingHermesEvents.length > 0 && (
            <p className="mt-1 text-[10px] leading-relaxed text-orange-100">
              Faltam: {missingHermesEvents.join(", ")}
            </p>
          )}
          {mission.trajectory?.nextSafeAction && (
            <p className="mt-1 text-[10px] leading-relaxed text-[#CCA761]">
              Hermes: {mission.trajectory.nextSafeAction}
            </p>
          )}
        </div>
        <div className="rounded-xl border border-white/5 bg-black/25 p-3 md:col-span-2">
          <p className="text-[9px] uppercase tracking-[0.16em] text-gray-500">Paperclip</p>
          <p className="mt-1 text-xs font-semibold text-gray-100 break-words">{routineLabel}</p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[#CCA761]">{responsibleAgentLabel}</p>
        </div>
      </div>

      {mission.nextSafeAction && (
        <p className="text-xs leading-relaxed text-gray-300">Proxima acao: {mission.nextSafeAction}</p>
      )}
      {mission.blockers.length > 0 && (
        <p className="text-xs leading-relaxed text-orange-100">Bloqueios: {mission.blockers.join(", ")}</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {mission.latestArtifactId && (
          <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-gray-400">
            artifact {mission.latestArtifactId}
          </span>
        )}
        {mission.latestEventId && (
          <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-gray-400">
            evento {mission.latestEventId}
          </span>
        )}
        {mission.legalOperatorMission && (
          <span className="rounded-full border border-[#CCA761]/20 bg-[#CCA761]/10 px-2 py-1 text-[10px] text-[#E2C37A]">
            operador juridico
          </span>
        )}
        <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-gray-400">
          {mission.timeline.length} marco{mission.timeline.length === 1 ? "" : "s"}
        </span>
      </div>

      {(canRetry || canCancel) && (
        <div className="flex flex-wrap gap-2 border-t border-white/5 pt-3">
          {canRetry && (
            <button
              type="button"
              disabled={stepActionLoading !== null}
              onClick={() => void handleStepAction("retry")}
              className="inline-flex items-center gap-2 rounded-xl border border-[#CCA761]/30 bg-[#CCA761]/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#E2C37A] transition-colors hover:bg-[#CCA761]/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {stepActionLoading === "retry" ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
              Retry
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              disabled={stepActionLoading !== null}
              onClick={() => void handleStepAction("cancel")}
              className="inline-flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-red-200 transition-colors hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {stepActionLoading === "cancel" ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />}
              Cancelar step
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewSignalGrid({ review }: { review: LegalMovementReviewItem }) {
  const governance = review.agentic_governance;
  const openclaw = governance?.openclaw;
  const hermes = governance?.hermes;
  const signals = [
    { label: "Polo", value: review.polo_representado },
    { label: "Obrigacao", value: review.obrigacao_de_quem },
    { label: "Confidence", value: review.confidence || review.confianca_analise },
    { label: "Confidence reason", value: review.confidence_reason },
    { label: "OpenClaw surface", value: openclaw?.surface },
    { label: "OpenClaw outcome", value: openclaw?.outcome },
    { label: "OpenClaw approval", value: openclaw?.requires_approval },
    { label: "OpenClaw executar", value: openclaw?.can_execute_now },
    { label: "Hermes status", value: hermes?.status },
    { label: "Hermes ultimo evento", value: hermes?.last_event_type },
    { label: "Hermes eventos", value: hermes?.events_count },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-3">
      <div className="grid gap-2 md:grid-cols-3">
        {signals.map((signal) => (
          <div key={signal.label} className="rounded-lg border border-white/5 bg-white/[0.02] p-2">
            <p className="text-[9px] uppercase tracking-[0.16em] text-gray-500">{signal.label}</p>
            <p className="mt-1 text-xs font-semibold text-gray-100 break-words">{formatReviewSignal(signal.value)}</p>
          </div>
        ))}
      </div>
      {(openclaw?.reason || hermes?.last_event_summary) && (
        <div className="space-y-2 text-xs leading-relaxed text-gray-300">
          {openclaw?.reason && <p><span className="font-semibold text-[#CCA761]">OpenClaw:</span> {openclaw.reason}</p>}
          {hermes?.last_event_summary && <p><span className="font-semibold text-[#CCA761]">Hermes:</span> {hermes.last_event_summary}</p>}
        </div>
      )}
    </div>
  );
}

function isLegalDraftApproval(approval: BrainInboxApprovalItem) {
  return approval.awaiting_payload?.skillName === "legal_first_draft_generate";
}

function buildApprovalSignal(approval: BrainInboxApprovalItem) {
  return [
    approval.awaiting_payload?.skillName,
    approval.awaiting_payload?.policyDecision?.surface,
    approval.awaiting_payload?.policyDecision?.module,
    approval.step?.capability_name,
    approval.step?.handler_type,
    approval.step?.step_type,
    approval.task?.module,
    approval.task?.title,
    approval.task?.goal,
    ...Object.keys(approval.awaiting_payload?.entities || {}),
  ]
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function classifyApproval(approval: BrainInboxApprovalItem): ApprovalFilterId {
  const signal = buildApprovalSignal(approval);

  if (/\b(setup|office_setup|tenant_setup|doctor|autoconfig|office_profile|operational_methodology|office_operational_methodology)\b/.test(signal)) return "setup";
  if (/\b(escavador|paid_search|monitoramento)\b/.test(signal)) return "escavador";
  if (/\b(billing|asaas|finance|financial|cobranca|collections|revenue)\b/.test(signal)) return "finance";
  if (/\b(whatsapp|external_message|zapsign|contract|publish|publicacao|filing|protocol)\b/.test(signal)) return "external_messages";
  if (/\b(legal|lex|juridic|process|draft|minuta|peticao|petition|case_context|case_status)\b/.test(signal)) return "legal";

  return "all";
}

function matchesApprovalFilter(approval: BrainInboxApprovalItem, filter: ApprovalFilterId) {
  return filter === "all" || classifyApproval(approval) === filter;
}

function LegalDraftApprovalDetails({ approval }: { approval: BrainInboxApprovalItem }) {
  const payload = approval.awaiting_payload;
  const payloadExtras = payload as Record<string, unknown> | null | undefined;
  const processLabel = payload?.processLabel || getStringEntity(approval, "process_number") || getStringEntity(approval, "process_task_id");
  const pieceLabel = getStringEntity(approval, "recommended_piece_label") || getStringEntity(approval, "recommended_piece_input");
  const methodology = asRecordValue(payload?.methodology);
  const sources = asRecordValue(payload?.sources);
  const gaps = asRecordValue(payload?.gaps);
  const pieceContext = asRecordValue(payloadExtras?.pieceContext) || asRecordValue(payloadExtras?.piece_context);
  const agenticGovernance = asRecordValue(payload?.agenticGovernance);
  const openclawPolicy = asRecordValue(payload?.openclawPolicy) || asRecordValue(agenticGovernance?.openclaw_policy);
  const sideEffectGuardrail = asRecordValue(payload?.sideEffectGuardrail);
  const expectedDocuments = getRecordList(methodology?.expectedDocuments).slice(0, 6);
  const factualSources = getRecordList(sources?.factual).slice(0, 5);
  const gapItems = getRecordList(gaps?.all).slice(0, 6);
  const pieceDocumentsUsed = (getRecordList(pieceContext?.documentsUsed).length > 0
    ? getRecordList(pieceContext?.documentsUsed)
    : getRecordList(pieceContext?.documents_used)).slice(0, 6);
  const pieceChecklist = (getRecordList(payloadExtras?.draftVerificationChecklist).length > 0
    ? getRecordList(payloadExtras?.draftVerificationChecklist)
    : getRecordList(payloadExtras?.draft_verification_checklist).length > 0
      ? getRecordList(payloadExtras?.draft_verification_checklist)
      : getRecordList(pieceContext?.draftVerificationChecklist).length > 0
        ? getRecordList(pieceContext?.draftVerificationChecklist)
        : getRecordList(pieceContext?.draft_verification_checklist)).slice(0, 6);
  const piecePhase = getRecordText(pieceContext, "phase");
  const caseBrain = asRecordValue(pieceContext?.case_brain);
  const protectedSideEffects = getRecordList(sideEffectGuardrail?.protectedSideEffects).slice(0, 6);
  const openclawReason = getRecordText(openclawPolicy, "reason");
  const openclawOutcome = getRecordText(openclawPolicy, "outcome");

  return (
    <div className="rounded-2xl border border-[#CCA761]/20 bg-[#CCA761]/10 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <ShieldAlert size={18} className="mt-0.5 shrink-0 text-[#CCA761]" />
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#CCA761]">Missao juridica supervisionada</p>
          <p className="mt-1 text-sm text-white/90">
            O MAYUS quer gerar uma minuta juridica. A Draft Factory so sera acionada se esta aprovacao for confirmada.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Processo</p>
          <p className="mt-1 text-sm font-semibold text-white break-words">{processLabel || "Nao informado"}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Peca sugerida</p>
          <p className="mt-1 text-sm font-semibold text-white break-words">{pieceLabel || "Primeira minuta juridica"}</p>
        </div>
      </div>

      {payload?.proposedActionLabel && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Acao proposta</p>
          <p className="mt-1 text-sm text-gray-200">{payload.proposedActionLabel}</p>
        </div>
      )}

      {payload?.missionGoal && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Objetivo juridico</p>
          <p className="mt-1 text-sm text-gray-200">{payload.missionGoal}</p>
        </div>
      )}

      {(piecePhase || caseBrain) && (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Fase da peca</p>
            <p className="mt-1 text-sm text-gray-200">{piecePhase || "Fase nao consolidada"}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Case Brain</p>
            <p className="mt-1 text-sm text-gray-200">
              {caseBrain
                ? `${getRecordText(caseBrain, "high_risk_count") || "0"} risco(s) alto(s), ${getRecordText(caseBrain, "high_contradiction_count") || "0"} contradicao(oes) alta(s), ${getRecordText(caseBrain, "grounding_gap_count") || "0"} lacuna(s).`
                : "Sem leitura adicional do Case Brain."}
            </p>
          </div>
        </div>
      )}

      {payload?.reason && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-orange-300">Motivo da aprovacao</p>
          <p className="mt-1 text-sm text-orange-100">{payload.reason}</p>
        </div>
      )}

      {(openclawReason || openclawOutcome) && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-orange-300">OpenClaw</p>
          <p className="mt-1 text-sm text-orange-100">
            {openclawOutcome ? `Resultado: ${openclawOutcome}. ` : ""}
            {openclawReason || "Policy juridica exige supervisao antes de efeito sensivel."}
          </p>
        </div>
      )}

      {(expectedDocuments.length > 0 || factualSources.length > 0 || gapItems.length > 0) && (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Documentos esperados</p>
            <p className="mt-1 text-xs text-gray-200 leading-relaxed">
              {expectedDocuments.length > 0 ? expectedDocuments.join("; ") : "Sem lista metodologica registrada"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Fontes usadas</p>
            <p className="mt-1 text-xs text-gray-200 leading-relaxed">
              {pieceDocumentsUsed.length > 0
                ? pieceDocumentsUsed.join("; ")
                : factualSources.length > 0 ? factualSources.join("; ") : "Sem fonte factual adicional"}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Lacunas</p>
            <p className="mt-1 text-xs text-gray-200 leading-relaxed">
              {gapItems.length > 0 ? gapItems.join("; ") : "Nenhuma lacuna critica registrada"}
            </p>
          </div>
        </div>
      )}

      {pieceChecklist.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Checklist da minuta</p>
          <ul className="mt-2 space-y-1 text-xs text-gray-200">
            {pieceChecklist.map((item, index) => (
              <li key={`${item}-${index}`} className="flex gap-2">
                <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-[#CCA761]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Guardrails de beta</p>
        <p className="mt-1 text-xs text-gray-200 leading-relaxed">
          {protectedSideEffects.length > 0
            ? protectedSideEffects.join("; ")
            : "Sem protocolo, envio externo, publicacao ou alteracao processual automatica antes de aprovacao humana."}
        </p>
      </div>
    </div>
  );
}

function ApprovalActions({
  approval,
  onDecided,
}: {
  approval: BrainInboxApprovalItem;
  onDecided: () => Promise<void>;
}) {
  const [loading, setLoading] = useState<"approved" | "rejected" | null>(null);

  const handleDecision = async (decision: "approved" | "rejected") => {
    if (!approval.audit_log_id) {
      toast.error("Este approval nao possui audit log vinculado.");
      return;
    }

    setLoading(decision);
    try {
      const response = await fetch("/api/ai/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditLogId: approval.audit_log_id, decision }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel processar a aprovacao.");
      }

      toast.success(decision === "approved" ? "Acao aprovada com sucesso." : "Acao rejeitada com sucesso.");
      await onDecided();
    } catch (error: any) {
      toast.error(error?.message || "Falha ao processar approval.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-2 pt-3">
      <button
        onClick={() => handleDecision("approved")}
        disabled={loading !== null}
        className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
      >
        {loading === "approved" ? "Processando..." : "Aprovar"}
      </button>
      <button
        onClick={() => handleDecision("rejected")}
        disabled={loading !== null}
        className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold uppercase tracking-widest text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
      >
        {loading === "rejected" ? "Processando..." : "Rejeitar"}
      </button>
    </div>
  );
}

function ApprovalCard({ approval, onRefresh }: { approval: BrainInboxApprovalItem; onRefresh: () => Promise<void> }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Approval pendente</p>
          <h3 className="text-white font-semibold text-base mt-1">
            {approval.awaiting_payload?.skillName || approval.step?.title || approval.task?.title || "Acao do cerebro"}
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            {approval.task?.module || "core"} · {approval.task?.channel || "sistema"} · {dayjs(approval.created_at).fromNow()}
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${getRiskBadge(approval.risk_level || approval.awaiting_payload?.riskLevel)}`}>
          {approval.risk_level || approval.awaiting_payload?.riskLevel || "medio"}
        </span>
      </div>

      {approval.task && (
        <div className="rounded-xl border border-white/5 bg-gray-200 dark:bg-black/30 p-3 text-sm text-gray-300">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Missao</p>
          <p className="mt-1 text-white/90">{approval.task.title || approval.task.goal}</p>
          <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-widest text-gray-500">
            <span className={`rounded-full border px-2 py-1 ${getTaskBadge(approval.task.status)}`}>{approval.task.status.replaceAll("_", " ")}</span>
            <span>{approval.task.module}</span>
          </div>
        </div>
      )}

      {isLegalDraftApproval(approval) && <LegalDraftApprovalDetails approval={approval} />}

      <LegalOperatorStateSummary state={approval.awaiting_payload?.legalOperatorState} />

      {approval.awaiting_payload?.entities && Object.keys(approval.awaiting_payload.entities).length > 0 && (
        <div className="rounded-xl border border-white/5 bg-gray-200 dark:bg-black/30 p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Dados que serao executados</p>
          <div className="space-y-1.5 text-xs">
            {Object.entries(approval.awaiting_payload.entities).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="w-32 shrink-0 text-gray-500">{humanizeEntityKey(key)}:</span>
                <span className="text-gray-200 break-all">{value || "—"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ApprovalActions approval={approval} onDecided={onRefresh} />
    </div>
  );
}

function LegalMovementReviewCard({ review, onRefresh }: { review: LegalMovementReviewItem; onRefresh: () => Promise<void> }) {
  const [loading, setLoading] = useState<"approved" | "ignored" | null>(null);
  const [actionLabel, setActionLabel] = useState(() => review.acao_sugerida || "");
  const [dueDate, setDueDate] = useState(() => toDateInputValue(review.data_vencimento_extraida));
  const [note, setNote] = useState("");
  const terminalReview = isTerminalLegalReview(review.tipo_evento);
  const canApprove = !terminalReview && Boolean(actionLabel.trim()) && Boolean(dueDate);

  useEffect(() => {
    setActionLabel(review.acao_sugerida || "");
    setDueDate(toDateInputValue(review.data_vencimento_extraida));
    setNote("");
    setLoading(null);
  }, [review.id, review.acao_sugerida, review.data_vencimento_extraida]);

  const handleDecision = async (decision: "approved" | "ignored") => {
    if (decision === "approved" && terminalReview) {
      toast.error("Encerramento/arquivamento exige acao manual no beta.");
      return;
    }

    if (decision === "approved" && !dueDate) {
      toast.error("Informe um vencimento revisado antes de aprovar.");
      return;
    }

    if (decision === "approved" && !actionLabel.trim()) {
      toast.error("Informe a acao revisada antes de aprovar.");
      return;
    }

    setLoading(decision);
    try {
      const requestBody: Record<string, unknown> = {
        review_id: review.id,
        decision,
      };
      const trimmedNote = note.trim();
      if (trimmedNote) requestBody.note = trimmedNote;
      if (decision === "approved") {
        requestBody.acao_sugerida = actionLabel.trim();
        requestBody.data_vencimento_extraida = dueDate;
      }

      const response = await fetch("/api/juridico/movement-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Nao foi possivel processar revisao juridica.");
      toast.success(decision === "approved" ? "Prazo/card aprovado com valores revisados." : "Movimentacao ignorada com auditoria.");
      await onRefresh();
    } catch (error: any) {
      toast.error(error?.message || "Falha ao processar revisao juridica.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="rounded-2xl border border-[#CCA761]/20 bg-[#0f0f0f] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#CCA761]">Revisao juridica beta</p>
          <h3 className="mt-1 text-base font-semibold text-white break-words">
            {review.tipo_evento || "Movimentacao ambigua"} · {review.numero_cnj || "processo sem CNJ"}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {review.cliente_nome || "Cliente nao identificado"} · {review.tribunal || "tribunal nao informado"} · {dayjs(review.created_at).fromNow()}
          </p>
        </div>
        <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-orange-300">
          {review.confianca_analise || "revisar"}
        </span>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-gray-200 leading-relaxed">
        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Movimentacao</p>
        <p className="mt-2 line-clamp-4">{review.movimentacao_conteudo || "Sem conteudo textual salvo."}</p>
        {review.movimentacao_data && <p className="mt-2 text-[11px] text-gray-500">Data: {review.movimentacao_data}</p>}
      </div>

      <ReviewSignalGrid review={review} />

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <label className="text-[10px] uppercase tracking-[0.18em] text-gray-500" htmlFor={`review-action-${review.id}`}>Acao revisada</label>
          <textarea
            id={`review-action-${review.id}`}
            value={actionLabel}
            onChange={(event) => setActionLabel(event.target.value)}
            rows={3}
            placeholder="Descreva a acao que deve virar prazo/card"
            className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-[#CCA761]/50"
          />
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <label className="text-[10px] uppercase tracking-[0.18em] text-gray-500" htmlFor={`review-due-${review.id}`}>Vencimento revisado</label>
          <input
            id={`review-due-${review.id}`}
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors [color-scheme:dark] focus:border-[#CCA761]/50"
          />
          <p className="mt-2 text-[11px] text-gray-500">
            Original: {review.data_vencimento_extraida ? dayjs(review.data_vencimento_extraida).format("DD/MM/YYYY") : "nao confiavel"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <label className="text-[10px] uppercase tracking-[0.18em] text-gray-500" htmlFor={`review-note-${review.id}`}>Nota do revisor</label>
        <textarea
          id={`review-note-${review.id}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="Opcional: registre a justificativa da decisao humana"
          className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-[#CCA761]/50"
        />
      </div>

      {terminalReview && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-100 leading-relaxed">
          Encerramento, arquivamento ou extincao exigem acao manual no beta. Use a nota para registrar a revisao e ignore esta fila quando concluir fora do MAYUS.
        </div>
      )}

      {(review.motivo || review.evidencia) && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100 leading-relaxed">
          {review.motivo && <p><span className="font-semibold text-amber-300">Motivo:</span> {review.motivo}</p>}
          {review.evidencia && <p className="mt-2"><span className="font-semibold text-amber-300">Evidencia:</span> {review.evidencia}</p>}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => handleDecision("approved")}
          disabled={loading !== null || !canApprove}
          title={terminalReview ? "Encerramento/arquivamento exige acao manual no beta." : !actionLabel.trim() ? "Informe a acao revisada." : !dueDate ? "Informe o vencimento revisado." : undefined}
          className="flex-1 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold uppercase tracking-widest text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
        >
          {loading === "approved" ? "Aprovando..." : "Aprovar Prazo/Card"}
        </button>
        <button
          onClick={() => handleDecision("ignored")}
          disabled={loading !== null}
          className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-widest text-gray-300 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          {loading === "ignored" ? "Ignorando..." : "Ignorar"}
        </button>
      </div>
    </div>
  );
}

function StuckMovementReviewCard({ review, onRefresh }: { review: LegalMovementReviewItem; onRefresh: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");

  const handleRecover = async () => {
    const recoveryNote = note.trim();
    if (!recoveryNote) {
      toast.error("Informe o motivo da recuperação.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/juridico/movement-reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review_id: review.id, decision: "recover", note: recoveryNote }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Nao foi possivel recuperar revisao juridica.");
      toast.success("Revisao recuperada para nova decisao humana.");
      await onRefresh();
    } catch (error: any) {
      toast.error(error?.message || "Falha ao recuperar revisao juridica.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-red-300">Revisao travada</p>
          <h3 className="mt-1 text-base font-semibold text-white break-words">
            {review.tipo_evento || "Movimentacao ambigua"} · {review.numero_cnj || "processo sem CNJ"}
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            {review.cliente_nome || "Cliente nao identificado"} · {review.tribunal || "tribunal nao informado"} · {dayjs(review.created_at).fromNow()}
          </p>
        </div>
        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-red-300">
          {review.status || "processing"}
        </span>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-gray-200 leading-relaxed">
        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Movimentacao</p>
        <p className="mt-2 line-clamp-3">{review.movimentacao_conteudo || "Sem conteudo textual salvo."}</p>
      </div>

      <ReviewSignalGrid review={review} />

      {(review.review_error || review.review_note) && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-100 leading-relaxed">
          {review.review_error && <p><span className="font-semibold text-red-300">Erro:</span> {review.review_error}</p>}
          {review.review_note && <p className="mt-2"><span className="font-semibold text-red-300">Nota anterior:</span> {review.review_note}</p>}
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <label className="text-[10px] uppercase tracking-[0.18em] text-gray-500" htmlFor={`recover-note-${review.id}`}>Motivo da recuperação</label>
        <textarea
          id={`recover-note-${review.id}`}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          placeholder="Explique por que esta revisão deve voltar para a fila"
          className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-red-400/50"
        />
      </div>

      <button
        onClick={handleRecover}
        disabled={loading || !note.trim()}
        className="w-full rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold uppercase tracking-widest text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
      >
        {loading ? "Recuperando..." : "Voltar para revisão humana"}
      </button>
    </div>
  );
}

function ActivityCard({ task }: { task: BrainInboxTaskItem }) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#0f0f0f] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-white font-medium">{task.title || task.goal}</p>
          <p className="text-xs text-gray-500 mt-1">{task.module} · {task.channel} · {dayjs(task.updated_at).fromNow()}</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-widest ${getTaskBadge(task.status)}`}>
          {task.status.replaceAll("_", " ")}
        </span>
      </div>

      {task.result_summary && (
        <p className="text-xs text-gray-400 mt-3 line-clamp-3">{task.result_summary}</p>
      )}

      {task.error_message && (
        <p className="text-xs text-red-300 mt-3">{task.error_message}</p>
      )}
    </div>
  );
}

function buildSelfImprovementArtifactPreview(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return null;
  const proposalsCreated = typeof metadata.proposals_created === "number"
    ? metadata.proposals_created
    : Number(metadata.proposals_created);
  const patterns = Array.isArray(metadata.patterns_detected)
    ? metadata.patterns_detected
      .map((pattern) => {
        if (!pattern || typeof pattern !== "object" || Array.isArray(pattern)) return null;
        const record = pattern as Record<string, unknown>;
        return typeof record.patternKind === "string" ? record.patternKind : null;
      })
      .filter((value): value is string => Boolean(value))
    : [];

  const proposalLabel = Number.isFinite(proposalsCreated)
    ? `${proposalsCreated} proposta${proposalsCreated === 1 ? "" : "s"} de memoria`
    : "Relatorio de auto-aprendizado";
  const patternLabel = patterns.length
    ? `Padroes: ${patterns.slice(0, 3).join(", ")}${patterns.length > 3 ? "..." : ""}`
    : "Sem padrao novo promovivel neste ciclo.";

  return `${proposalLabel}. ${patternLabel}`;
}

function buildManagementArtifactPreview(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object") {
    return "Brief de inteligencia de gestao criado para revisao.";
  }

  const readiness = metadata.readiness && typeof metadata.readiness === "object"
    ? metadata.readiness as Record<string, unknown>
    : {};
  const summary = typeof metadata.summary === "string" ? metadata.summary : "Brief de inteligencia de gestao criado.";
  const status = typeof readiness.status === "string" ? readiness.status : null;
  const confidence = typeof readiness.confidence === "string" ? readiness.confidence : null;
  const nextAction = typeof metadata.nextAction === "string" ? metadata.nextAction : null;
  const gaps = Array.isArray(metadata.gaps)
    ? metadata.gaps.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 2)
    : [];

  return [
    summary,
    status ? `Readiness: ${status}${confidence ? `/${confidence}` : ""}.` : null,
    gaps.length ? `Lacunas: ${gaps.join("; ")}.` : null,
    nextAction ? `Proxima acao: ${nextAction}` : null,
  ].filter(Boolean).join(" ");
}

function ArtifactCard({ artifact }: { artifact: BrainInboxArtifactItem }) {
  const contentPreview = typeof artifact.metadata?.reply === "string"
    ? artifact.metadata.reply
    : typeof artifact.metadata?.sign_url === "string"
      ? artifact.metadata.sign_url
      : artifact.artifact_type === "self_improvement_report"
        ? buildSelfImprovementArtifactPreview(artifact.metadata)
      : artifact.artifact_type === "management_intelligence_brief"
        ? buildManagementArtifactPreview(artifact.metadata)
      : null;

  return (
    <div className="rounded-xl border border-white/8 bg-[#0f0f0f] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-white font-medium">{artifact.title || artifact.artifact_type}</p>
          <p className="text-xs text-gray-500 mt-1">{artifact.source_module || artifact.task?.module || "core"} · {dayjs(artifact.created_at).fromNow()}</p>
        </div>
        <FileText size={16} className="text-[#CCA761] shrink-0" />
      </div>

      {artifact.task && (
        <p className="text-xs text-gray-500 mt-2 truncate">{artifact.task.title || artifact.task.goal}</p>
      )}

      <div className="mt-3">
        <LegalOperatorStateSummary state={artifact.metadata?.legal_operator_state} />
      </div>

      {contentPreview && (
        <p className="text-xs text-gray-400 mt-3 line-clamp-3">{contentPreview}</p>
      )}

      {artifact.storage_url && (
        <a
          href={artifact.storage_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-xs text-[#CCA761] hover:underline"
        >
          <Link2 size={12} /> Abrir artifact
        </a>
      )}
    </div>
  );
}

function getEventTitle(event: BrainInboxEventItem) {
  switch (event.event_type) {
    case "task_dispatched":
      return "Missão despachada";
    case "chat_turn_processed":
      return "Turno do chat processado";
    case "voice_turn_processed":
      return "Turno de voz processado";
    case "revenue_to_case_completed":
      return "Loop receita -> caso concluído";
    case "case_brain_bootstrap_requested":
      return "Case Brain solicitado";
    case "case_brain_bootstrap_completed":
      return "Case Brain inicial concluído";
    case "case_brain_bootstrap_failed":
      return "Case Brain inicial falhou";
    case "case_brain_research_ready":
      return "Research pack pronto";
    case "case_brain_sources_validated":
      return "Source pack validado";
    case "case_brain_draft_plan_ready":
      return "Draft plan pronto";
    case "draft_factory_requested":
      return "Draft Factory solicitada";
    case "draft_factory_completed":
      return "Primeira minuta pronta";
    case "draft_factory_failed":
      return "Draft Factory falhou";
    case "legal_case_context_resolved":
      return "Contexto juridico resolvido";
    case "support_case_status_resolved":
      return "Status do caso respondido";
    case "process_mission_plan_created":
      return "Missao processual planejada";
    case "process_mission_step_executed":
      return "Passo da missao processual executado";
    case "mission_result":
      return "Resultado de missao registrado";
    case "legal_first_draft_requested_via_chat":
      return "Minuta juridica solicitada via chat";
    case "memory_promotion_proposed":
      return "Memoria proposta para aprovacao";
    case "memory_promotion_approved":
      return "Memoria promovida";
    case "memory_promotion_rejected":
      return "Proposta de memoria rejeitada";
    case "memory_promotion_revoked":
      return "Memoria revogada";
    case "mayus_operating_partner_repair_pattern":
      return "Padrao de reparo do Operating Partner";
    case "self_correction_attempted":
      return "Auto-correcao tentada";
    case "self_correction_applied":
      return "Auto-correcao aplicada";
    case "self_correction_requires_approval":
      return "Auto-correcao pediu aprovacao";
    case "self_correction_blocked":
      return "Auto-correcao bloqueou execucao";
    case "self_correction_failed":
      return "Auto-correcao falhou";
    case "self_correction_not_available":
    case "self_correction_no_correction_available":
      return "Auto-correcao indisponivel";
    case "self_improvement_proposals_created":
      return "MAYUS propos memoria aprendida";
    case "billing_payment_confirmed":
      return "Pagamento confirmado aprendido";
    case "billing_payment_overdue":
      return "Cobranca vencida aprendida";
    case "lead_outcome_recorded":
      return "Resultado de lead aprendido";
    default:
      return event.event_type.replaceAll("_", " ");
  }
}

function getPayloadArray(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function getEventDescription(event: BrainInboxEventItem) {
  if (event.event_type.startsWith("self_correction_")) {
    const correctionKind = typeof event.payload?.correction_kind === "string" ? event.payload.correction_kind : "correcao";
    const status = typeof event.payload?.correction_status === "string" ? event.payload.correction_status : event.event_type.replace("self_correction_", "");
    const reason = typeof event.payload?.reason === "string" ? event.payload.reason : null;
    const action = typeof event.payload?.recommended_action === "string" ? event.payload.recommended_action : null;
    return [
      `${correctionKind}: ${status}`,
      reason ? `motivo: ${reason}` : null,
      action,
    ].filter(Boolean).join(" · ");
  }

  if (event.event_type === "self_improvement_proposals_created") {
    const proposalsCreated = typeof event.payload?.proposals_created === "number"
      ? event.payload.proposals_created
      : Number(event.payload?.proposals_created);
    const patternKinds = getPayloadArray(event.payload, "pattern_kinds");
    const correctionKinds = getPayloadArray(event.payload, "correction_kinds");
    return [
      Number.isFinite(proposalsCreated) ? `${proposalsCreated} proposta${proposalsCreated === 1 ? "" : "s"} criada${proposalsCreated === 1 ? "" : "s"}` : "Propostas criadas",
      patternKinds.length ? `padroes: ${patternKinds.slice(0, 3).join(", ")}` : null,
      correctionKinds.length ? `correcoes: ${correctionKinds.slice(0, 3).join(", ")}` : null,
    ].filter(Boolean).join(" · ");
  }

  if (event.event_type === "mayus_operating_partner_repair_pattern") {
    const originalFlags = getPayloadArray(event.payload, "original_risk_flags");
    const repairedFlags = getPayloadArray(event.payload, "repaired_risk_flags");
    const succeeded = event.payload?.repair_succeeded === true ? "reparo aplicado" : "reparo pendente";
    return [
      succeeded,
      originalFlags.length ? `flags: ${originalFlags.join(", ")}` : null,
      repairedFlags.length ? `apos reparo: ${repairedFlags.join(", ")}` : null,
    ].filter(Boolean).join(" · ");
  }

  if (event.event_type === "lead_outcome_recorded") {
    const outcome = typeof event.payload?.outcome === "string" ? event.payload.outcome : "resultado";
    const motivo = typeof event.payload?.motivo === "string" ? event.payload.motivo : null;
    return motivo ? `${outcome} · motivo: ${motivo}` : outcome;
  }

  if (event.event_type === "billing_payment_confirmed" || event.event_type === "billing_payment_overdue") {
    const paymentId = typeof event.payload?.payment_id === "string" ? event.payload.payment_id : null;
    const delayDays = typeof event.payload?.delay_days_estimate === "number" ? event.payload.delay_days_estimate : null;
    return [
      paymentId ? `Pagamento ${paymentId}` : "Evento financeiro",
      delayDays !== null ? `atraso estimado: ${delayDays} dia${delayDays === 1 ? "" : "s"}` : null,
    ].filter(Boolean).join(" · ");
  }

  if (typeof event.payload?.reply === "string" && event.payload.reply.trim()) {
    return event.payload.reply;
  }

  if (typeof event.payload?.goal === "string" && event.payload.goal.trim()) {
    return event.payload.goal;
  }

  if (typeof event.payload?.payment_id === "string") {
    return `Pagamento ${event.payload.payment_id}`;
  }

  if (typeof event.payload?.tool_name === "string") {
    return `Tool: ${event.payload.tool_name}`;
  }

  if (typeof event.payload?.summary === "string" && event.payload.summary.trim()) {
    return event.payload.summary;
  }

  if (typeof event.payload?.key === "string" && event.payload.key.trim()) {
    const category = typeof event.payload?.category === "string" ? ` (${event.payload.category})` : "";
    return `Chave: ${event.payload.key}${category}`;
  }

  if (typeof event.payload?.piece_label === "string" && event.payload.piece_label.trim()) {
    return `Peca: ${event.payload.piece_label}`;
  }

  return event.task?.title || event.task?.goal || "Evento registrado no cérebro.";
}

function EventCard({ event }: { event: BrainInboxEventItem }) {
  return (
    <div className="rounded-xl border border-white/8 bg-[#0f0f0f] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-white font-medium">{getEventTitle(event)}</p>
          <p className="text-xs text-gray-500 mt-1">
            {(event.source_module || event.task?.module || "core")} · {dayjs(event.created_at).fromNow()}
          </p>
        </div>
        <Cpu size={16} className="text-[#CCA761] shrink-0" />
      </div>

      <p className="text-xs text-gray-400 mt-3 line-clamp-3">{getEventDescription(event)}</p>

      <div className="mt-3">
        <LegalOperatorStateSummary state={event.payload?.legal_operator_state} />
      </div>

      {event.step?.title && (
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mt-3">Step: {event.step.title}</p>
      )}
    </div>
  );
}

function getWhatsAppAuditBadge(entry: WhatsAppAgentAuditEntry) {
  if (entry.status === "error" || entry.quality_status === "block") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }
  if (entry.blocked) {
    return "border-orange-500/30 bg-orange-500/10 text-orange-300";
  }
  if (entry.repaired) {
    return "border-sky-400/30 bg-sky-400/10 text-sky-300";
  }
  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
}

function getWhatsAppAuditLabel(entry: WhatsAppAgentAuditEntry) {
  if (entry.status === "error" || entry.quality_status === "block") return "bloqueada";
  if (entry.blocked) return "revisao";
  if (entry.repaired) return "reparada";
  return "ok";
}

function WhatsAppAuditEntryCard({ entry }: { entry: WhatsAppAgentAuditEntry }) {
  const flags = entry.quality_flags.length ? entry.quality_flags : entry.risk_flags;
  return (
    <div className="rounded-xl border border-white/8 bg-[#0f0f0f] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">
            {entry.skill || entry.route || entry.event_name}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {entry.actor_role || "ator nao identificado"} - {entry.conversation_type || "sem resolucao"} - {dayjs(entry.created_at).fromNow()}
          </p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-widest ${getWhatsAppAuditBadge(entry)}`}>
          {getWhatsAppAuditLabel(entry)}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-[11px] text-gray-400 md:grid-cols-2">
        <span>Fonte final: <b className="font-medium text-gray-200">{entry.final_response_source || "nao informado"}</b></span>
        <span>Quality: <b className="font-medium text-gray-200">{entry.quality_status || "nao informado"}</b></span>
        {entry.brain_run_id && <span>Brain run: <b className="font-medium text-gray-200">{entry.brain_run_id}</b></span>}
        {entry.contact_id && <span>Contato: <b className="font-medium text-gray-200">{entry.contact_id}</b></span>}
      </div>

      {entry.reason && (
        <p className="mt-3 rounded-lg border border-white/8 bg-black/20 p-2 text-xs text-gray-300">
          {entry.reason}
        </p>
      )}

      {(entry.original_reply_preview || entry.final_reply_preview) && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Original LLM</p>
            <p className="mt-1 line-clamp-4 text-xs text-gray-400">{entry.original_reply_preview || "Sem reparo registrado."}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Resposta final</p>
            <p className="mt-1 line-clamp-4 text-xs text-gray-300">{entry.final_reply_preview || "Sem resposta final registrada."}</p>
          </div>
        </div>
      )}

      {flags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {flags.slice(0, 5).map((flag) => (
            <span key={flag} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-gray-400">
              {flag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BrainApprovalsPage() {
  const { role, isLoading: profileLoading } = useUserProfile();
  const [inbox, setInbox] = useState<BrainInboxResponse | null>(null);
  const [movementReviews, setMovementReviews] = useState<LegalMovementReviewItem[]>([]);
  const [stuckMovementReviews, setStuckMovementReviews] = useState<LegalMovementReviewItem[]>([]);
  const [whatsappAudit, setWhatsappAudit] = useState<WhatsAppAgentAuditResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilterId>("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilterId>("all");
  const [missionAgentFilter, setMissionAgentFilter] = useState("all");
  const isExecutive = isBrainExecutiveRole(role);
  const pendingApprovals = inbox?.pending_approvals || [];
  const recentApprovals = inbox?.recent_approvals || [];
  const recentArtifacts = inbox?.recent_artifacts || [];
  const recentEvents = inbox?.recent_events || [];
  const legalOperatorMissions = inbox?.legal_operator_missions || [];
  const missionControlSnapshots = inbox?.mission_control_snapshots || [];
  const missionAgentFilters = Array.from(
    missionControlSnapshots.reduce((acc, mission) => {
      const id = getMissionAgentId(mission);
      if (!acc.has(id)) acc.set(id, getMissionAgentLabel(mission));
      return acc;
    }, new Map<string, string>())
  );
  const filteredMissionControlSnapshots = missionAgentFilter === "all"
    ? missionControlSnapshots
    : missionControlSnapshots.filter((mission) => getMissionAgentId(mission) === missionAgentFilter);
  const correctionArtifactCount = recentArtifacts.filter(isMayusCorrectionArtifact).length;
  const correctionEventCount = recentEvents.filter(isMayusCorrectionEvent).length;
  const correctionActivityCount = correctionArtifactCount + correctionEventCount;
  const filteredRecentArtifacts = activityFilter === "mayus_corrections"
    ? recentArtifacts.filter(isMayusCorrectionArtifact)
    : recentArtifacts;
  const filteredRecentEvents = activityFilter === "mayus_corrections"
    ? recentEvents.filter(isMayusCorrectionEvent)
    : recentEvents;
  const filteredPendingApprovals = pendingApprovals.filter((approval) => matchesApprovalFilter(approval, approvalFilter));
  const filteredRecentApprovals = recentApprovals.filter((approval) => matchesApprovalFilter(approval, approvalFilter));
  const filterCounts = Object.fromEntries(
    APPROVAL_FILTERS.map((filter) => [
      filter.id,
      filter.id === "all"
        ? pendingApprovals.length
        : pendingApprovals.filter((approval) => matchesApprovalFilter(approval, filter.id)).length,
    ])
  ) as Record<ApprovalFilterId, number>;

  const loadInbox = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/brain/inbox?include_activity=true&pending_limit=30&recent_limit=12&activity_limit=16&event_limit=20", {
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel carregar o inbox do cerebro.");
      }

      setInbox(data as BrainInboxResponse);
    } catch (error: any) {
      toast.error(error?.message || "Falha ao carregar inbox do cerebro.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadMovementReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const response = await fetch("/api/juridico/movement-reviews", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Nao foi possivel carregar revisoes juridicas.");
      setMovementReviews(Array.isArray(data?.reviews) ? data.reviews : []);
      setStuckMovementReviews(Array.isArray(data?.stuck_reviews) ? data.stuck_reviews : []);
    } catch (error: any) {
      toast.error(error?.message || "Falha ao carregar revisoes juridicas.");
    } finally {
      setReviewsLoading(false);
    }
  }, []);

  const loadWhatsAppAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const response = await fetch("/api/whatsapp/agent-audit?limit=12", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Nao foi possivel carregar auditoria do WhatsApp.");
      setWhatsappAudit(data as WhatsAppAgentAuditResponse);
    } catch (error: any) {
      toast.error(error?.message || "Falha ao carregar auditoria do WhatsApp.");
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!profileLoading && isExecutive) {
      void loadInbox();
      void loadMovementReviews();
      void loadWhatsAppAudit();
    }
  }, [profileLoading, isExecutive, loadInbox, loadMovementReviews, loadWhatsAppAudit]);

  if (!profileLoading && !isExecutive) {
    return (
      <div className="max-w-4xl mx-auto mt-12 rounded-3xl border border-red-500/20 bg-red-500/5 p-8 text-center">
        <ShieldAlert className="mx-auto text-red-300 mb-4" size={42} />
        <h1 className="text-2xl text-white font-semibold">Acesso restrito</h1>
        <p className="text-gray-400 mt-3">A inbox global de approvals do MAYUS fica disponivel apenas para perfis executivos do escritorio.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.25em] text-[#CCA761] font-bold">MAYUS Brain</p>
          <h1 className="text-3xl text-white font-semibold mt-1">Inbox de Aprovações</h1>
          <p className="text-sm text-gray-400 mt-2">O que o cerebro precisa que um socio ou administrador decida agora.</p>
        </div>

        <button
          onClick={() => void Promise.all([loadInbox(), loadMovementReviews(), loadWhatsAppAudit()])}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-[#CCA761]/30 bg-[#CCA761]/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#CCA761] hover:bg-[#CCA761]/20"
        >
          <Clock3 size={14} /> Atualizar inbox
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Pendentes</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-semibold text-white">{inbox?.pending_count ?? 0}</span>
            <ShieldAlert className="text-orange-300 mb-1" size={18} />
          </div>
        </div>
        <div className="rounded-2xl border border-[#CCA761]/20 bg-[#CCA761]/10 p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#CCA761]">Revisões jurídicas</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-semibold text-white">{movementReviews.length}</span>
            <ShieldAlert className="text-[#CCA761] mb-1" size={18} />
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Aprovações recentes</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-semibold text-white">{inbox?.recent_approvals.length ?? 0}</span>
            <CheckCircle2 className="text-emerald-300 mb-1" size={18} />
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Atividade recente</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-semibold text-white">{inbox?.recent_tasks.length ?? 0}</span>
            <ShieldCheck className="text-[#CCA761] mb-1" size={18} />
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Artifacts recentes</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-semibold text-white">{inbox?.recent_artifacts.length ?? 0}</span>
            <FileText className="text-[#CCA761] mb-1" size={18} />
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Eventos recentes</p>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-semibold text-white">{inbox?.recent_events.length ?? 0}</span>
            <Cpu className="text-[#CCA761] mb-1" size={18} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {APPROVAL_FILTERS.map((filter) => {
          const active = approvalFilter === filter.id;
          return (
            <button
              key={filter.id}
              onClick={() => setApprovalFilter(filter.id)}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                active
                  ? "border-[#CCA761]/60 bg-[#CCA761]/15 text-[#CCA761]"
                  : "border-white/10 bg-[#0f0f0f] text-gray-400 hover:border-[#CCA761]/30 hover:text-[#CCA761]"
              }`}
            >
              {filter.label}
              <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-gray-300">
                {filterCounts[filter.id] || 0}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Atividade</span>
        <button
          type="button"
          onClick={() => setActivityFilter("all")}
          aria-pressed={activityFilter === "all"}
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
            activityFilter === "all"
              ? "border-[#CCA761]/60 bg-[#CCA761]/15 text-[#CCA761]"
              : "border-white/10 bg-[#0f0f0f] text-gray-400 hover:border-[#CCA761]/30 hover:text-[#CCA761]"
          }`}
        >
          Tudo
          <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-gray-300">
            {recentArtifacts.length + recentEvents.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActivityFilter("mayus_corrections")}
          aria-pressed={activityFilter === "mayus_corrections"}
          data-testid="brain-activity-filter-corrections"
          className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
            activityFilter === "mayus_corrections"
              ? "border-sky-400/50 bg-sky-400/10 text-sky-300"
              : "border-white/10 bg-[#0f0f0f] text-gray-400 hover:border-sky-400/30 hover:text-sky-300"
          }`}
        >
          Correcoes MAYUS
          <span
            data-testid="brain-corrections-count"
            className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-gray-300"
          >
            {correctionActivityCount}
          </span>
        </button>
      </div>

      {!isLoading && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Auditoria WhatsApp MAYUS</h2>
              <p className="mt-1 text-xs text-gray-500">
                Respostas reparadas, bloqueadas ou enviadas pelo agente com fonte final, qualidade e trilha do Brain.
              </p>
            </div>
            <span className="text-xs uppercase tracking-widest text-gray-500">
              {whatsappAudit?.metrics.total ?? 0} evento{(whatsappAudit?.metrics.total ?? 0) === 1 ? "" : "s"}
            </span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Reparadas</p>
              <p className="mt-2 text-2xl font-semibold text-sky-300">{whatsappAudit?.metrics.repaired ?? 0}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Bloqueadas</p>
              <p className="mt-2 text-2xl font-semibold text-orange-300">{whatsappAudit?.metrics.blocked ?? 0}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">LLM reparada</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-300">{whatsappAudit?.metrics.llm_repaired ?? 0}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Safe fallback</p>
              <p className="mt-2 text-2xl font-semibold text-gray-200">{whatsappAudit?.metrics.safe_fallback ?? 0}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Alertas</p>
              <p className="mt-2 text-2xl font-semibold text-red-300">
                {(whatsappAudit?.metrics.warnings ?? 0) + (whatsappAudit?.metrics.errors ?? 0)}
              </p>
            </div>
          </div>

          {auditLoading ? (
            <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-6 flex items-center justify-center gap-3 text-gray-400">
              <Loader2 size={16} className="animate-spin text-[#CCA761]" /> Carregando auditoria WhatsApp...
            </div>
          ) : whatsappAudit?.entries.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {whatsappAudit.entries.map((entry) => (
                <WhatsAppAuditEntryCard key={entry.id} entry={entry} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-6 text-center text-gray-500">
              Nenhuma resposta auditavel do WhatsApp encontrada nos eventos recentes.
            </div>
          )}
        </section>
      )}

      {!isLoading && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg text-white font-semibold">Controle agentico</h2>
              <p className="mt-1 text-xs text-gray-500">
                Read-model comum de missao, policy OpenClaw, trajectory Hermes, rotinas Paperclip e approvals.
              </p>
            </div>
            <span className="text-xs uppercase tracking-widest text-gray-500">
              {filteredMissionControlSnapshots.length}/{missionControlSnapshots.length} missao{missionControlSnapshots.length === 1 ? "" : "es"}
            </span>
          </div>

          {missionControlSnapshots.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Agente</span>
              <button
                type="button"
                onClick={() => setMissionAgentFilter("all")}
                aria-pressed={missionAgentFilter === "all"}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                  missionAgentFilter === "all"
                    ? "border-[#CCA761]/60 bg-[#CCA761]/15 text-[#CCA761]"
                    : "border-white/10 bg-[#0f0f0f] text-gray-400 hover:border-[#CCA761]/30 hover:text-[#CCA761]"
                }`}
              >
                Todos
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-gray-300">
                  {missionControlSnapshots.length}
                </span>
              </button>
              {missionAgentFilters.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMissionAgentFilter(id)}
                  aria-pressed={missionAgentFilter === id}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                    missionAgentFilter === id
                      ? "border-[#CCA761]/60 bg-[#CCA761]/15 text-[#CCA761]"
                      : "border-white/10 bg-[#0f0f0f] text-gray-400 hover:border-[#CCA761]/30 hover:text-[#CCA761]"
                  }`}
                >
                  {label}
                  <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[10px] text-gray-300">
                    {missionControlSnapshots.filter((mission) => getMissionAgentId(mission) === id).length}
                  </span>
                </button>
              ))}
            </div>
          )}

          {filteredMissionControlSnapshots.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {filteredMissionControlSnapshots.map((mission) => (
                <MissionControlCard key={mission.missionId} mission={mission} onRefresh={loadInbox} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-6 text-center text-gray-500">
              Nenhuma missao agentica reconstruida no Brain.
            </div>
          )}
        </section>
      )}

      {!isLoading && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg text-white font-semibold">Missoes juridicas vivas</h2>
              <p className="mt-1 text-xs text-gray-500">
                Estado reconstruido a partir de approvals, artifacts e eventos do Brain.
              </p>
            </div>
            <span className="text-xs uppercase tracking-widest text-gray-500">
              {legalOperatorMissions.length} ativa{legalOperatorMissions.length === 1 ? "" : "s"}
            </span>
          </div>

          {legalOperatorMissions.length > 0 ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {legalOperatorMissions.map((mission) => (
                <LegalOperatorMissionCard key={mission.key} mission={mission} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-6 text-center text-gray-500">
              Nenhuma missao juridica viva reconstruida no Brain.
            </div>
          )}
        </section>
      )}

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg text-white font-semibold">Revisão jurídica beta</h2>
            <p className="mt-1 text-xs text-gray-500">
              Movimentações com confiança média/baixa não criam prazo, card ou encerramento sem decisão humana.
            </p>
          </div>
          <span className="text-xs uppercase tracking-widest text-gray-500">
            {movementReviews.length} aguardando revisão
          </span>
        </div>

        {reviewsLoading ? (
          <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-6 flex items-center justify-center gap-3 text-gray-400">
            <Loader2 size={16} className="animate-spin text-[#CCA761]" /> Carregando revisões jurídicas...
          </div>
        ) : movementReviews.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {movementReviews.map((review) => (
              <LegalMovementReviewCard key={review.id} review={review} onRefresh={loadMovementReviews} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-6 text-center text-gray-400">
            Nenhuma movimentação jurídica aguardando revisão humana.
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg text-white font-semibold">Revisões travadas</h2>
            <p className="mt-1 text-xs text-gray-500">
              Decisões que ficaram em processamento podem voltar para revisão humana com auditoria.
            </p>
          </div>
          <span className="text-xs uppercase tracking-widest text-gray-500">
            {stuckMovementReviews.length} em processamento
          </span>
        </div>

        {reviewsLoading ? (
          <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-6 flex items-center justify-center gap-3 text-gray-400">
            <Loader2 size={16} className="animate-spin text-[#CCA761]" /> Verificando revisões travadas...
          </div>
        ) : stuckMovementReviews.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {stuckMovementReviews.map((review) => (
              <StuckMovementReviewCard key={review.id} review={review} onRefresh={loadMovementReviews} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-6 text-center text-gray-500">
            Nenhuma revisão jurídica travada em processamento.
          </div>
        )}
      </section>

      {isLoading ? (
        <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-8 flex items-center justify-center gap-3 text-gray-400">
          <Loader2 size={18} className="animate-spin text-[#CCA761]" />
          Carregando inbox do cerebro...
        </div>
      ) : (
        <div className="grid gap-8 xl:grid-cols-[1.35fr_0.95fr]">
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg text-white font-semibold">Aprovações pendentes</h2>
              <span className="text-xs uppercase tracking-widest text-gray-500">{filteredPendingApprovals.length} aguardando decisao</span>
            </div>

            {filteredPendingApprovals.length ? (
              <div className="space-y-4">
                {filteredPendingApprovals.map((approval) => (
                  <ApprovalCard key={approval.id} approval={approval} onRefresh={loadInbox} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-[#0f0f0f] p-8 text-center text-gray-400">
                Nenhuma aprovacao pendente. O cerebro esta operando dentro das politicas atuais.
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div>
              <h2 className="text-lg text-white font-semibold">Aprovações recentes</h2>
              <div className="mt-3 space-y-3">
                {filteredRecentApprovals.length ? (
                  filteredRecentApprovals.map((approval) => (
                    <div key={approval.id} className="rounded-xl border border-white/8 bg-[#0f0f0f] p-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-white font-medium">{approval.awaiting_payload?.skillName || approval.step?.title || "Acao do cerebro"}</p>
                          <p className="text-xs text-gray-500 mt-1">{approval.task?.module || "core"} · {dayjs(approval.approved_at || approval.created_at).fromNow()}</p>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-widest ${approval.status === "approved" ? "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" : "text-red-300 border-red-500/30 bg-red-500/10"}`}>
                          {approval.status}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-white/8 bg-[#0f0f0f] p-4 text-sm text-gray-400">
                    Nenhuma decisao recente registrada para este filtro.
                  </div>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-lg text-white font-semibold">Artifacts recentes</h2>
              <div className="mt-3 space-y-3">
                {filteredRecentArtifacts.length ? (
                  filteredRecentArtifacts.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} />)
                ) : (
                  <div className="rounded-xl border border-white/8 bg-[#0f0f0f] p-4 text-sm text-gray-400">
                    {activityFilter === "mayus_corrections"
                      ? "Nenhum artifact de correcao registrado."
                      : "Nenhum artifact recente registrado."}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-lg text-white font-semibold">Feed canônico do cérebro</h2>
              <div className="mt-3 space-y-3">
                {filteredRecentEvents.length ? (
                  filteredRecentEvents.map((event) => <EventCard key={event.id} event={event} />)
                ) : (
                  <div className="rounded-xl border border-white/8 bg-[#0f0f0f] p-4 text-sm text-gray-400">
                    {activityFilter === "mayus_corrections"
                      ? "Nenhum evento de correcao registrado."
                      : "Nenhum learning event recente registrado."}
                  </div>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-lg text-white font-semibold">Atividade do cérebro</h2>
              <div className="mt-3 space-y-3">
                {inbox?.recent_tasks.length ? (
                  inbox.recent_tasks.map((task) => <ActivityCard key={task.id} task={task} />)
                ) : (
                  <div className="rounded-xl border border-white/8 bg-[#0f0f0f] p-4 text-sm text-gray-400">
                    Nenhuma atividade recente encontrada.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
