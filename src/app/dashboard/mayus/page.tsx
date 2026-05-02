"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactMarkdown from 'react-markdown'
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import {
  Send, Bot, User, BrainCircuit, Sparkles, Loader2, KeyRound,
  AlertCircle, CheckCircle, XCircle, ShieldAlert,
  History, Plus, Trash2, Menu, X, MessageSquare, ChevronLeft, Search,
  Mic, Volume2, Square, VolumeX, SlidersHorizontal
} from "lucide-react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import Link from "next/link";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/pt-br";

dayjs.extend(relativeTime);
dayjs.locale("pt-br");

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400","500","600","700"], style: ["italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300","400","500","600"] });

// ─── Types ────────────────────────────────────────────────────────────────────

interface AwaitingPayload {
  skillName: string;
  riskLevel: string;
  entities: Record<string, string>;
  idempotencyKey: string;
  schemaVersion: string;
}

interface MessageKernel {
  status: string;
  auditLogId?: string;
  awaitingPayload?: AwaitingPayload;
  outputPayload?: Record<string, unknown>;
  taskId?: string;
  runId?: string;
  stepId?: string;
}

interface Message {
  id?: string;
  role: "system" | "user" | "model" | "approval";
  content: string;
  kernel?: MessageKernel;
  created_at?: string;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

type ModelOption = {
  provider: string;
  model: string;
  label: string;
  description: string;
};

const MODEL_PRESETS: Record<string, Array<Omit<ModelOption, "provider">>> = {
  openrouter: [
    { model: "qwen/qwen3.6-plus", label: "Qwen 3.6 Plus", description: "Rapido e bom para rotina geral" },
    { model: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet", description: "Melhor para raciocinio juridico longo" },
    { model: "openai/gpt-5.2", label: "GPT-5.2", description: "Analise forte e respostas mais robustas" },
    { model: "google/gemini-3.1-pro-preview-customtools", label: "Gemini Pro", description: "Contexto amplo e documentos grandes" },
    { model: "deepseek/deepseek-chat", label: "DeepSeek", description: "Boa relacao custo/desempenho" },
  ],
  openai: [
    { model: "gpt-5.4-nano", label: "GPT-5.4 Nano", description: "Baixa latencia para chat diario" },
    { model: "gpt-5.4-mini", label: "GPT-5.4 Mini", description: "Equilibrio para operacoes" },
    { model: "gpt-5.2", label: "GPT-5.2", description: "Trabalho juridico mais profundo" },
  ],
  anthropic: [
    { model: "claude-haiku-4-5-20251001", label: "Claude Haiku", description: "Rapido para atendimento" },
    { model: "claude-sonnet-4-6", label: "Claude Sonnet", description: "Contratos, pecas e leitura longa" },
  ],
  google: [
    { model: "gemini-2.0-flash", label: "Gemini Flash", description: "Rapido para respostas gerais" },
    { model: "gemini-3.1-pro-preview-customtools", label: "Gemini Pro", description: "Contexto longo e analise documental" },
  ],
  gemini: [
    { model: "gemini-2.0-flash", label: "Gemini Flash", description: "Rapido para respostas gerais" },
    { model: "gemini-3.1-pro-preview-customtools", label: "Gemini Pro", description: "Contexto longo e analise documental" },
  ],
  groq: [
    { model: "llama-3.3-70b-versatile", label: "Llama 70B", description: "Rapido para testes e rascunhos" },
  ],
};

interface BrainTaskRecord {
  id: string;
  status: string;
  goal: string;
  module: string;
  channel: string;
  result_summary?: string | null;
  error_message?: string | null;
}

interface BrainStepRecord {
  id: string;
  order_index: number;
  title: string;
  status: string;
  step_type: string;
  capability_name?: string | null;
  handler_type?: string | null;
}

interface BrainApprovalRecord {
  id: string;
  status: string;
  risk_level?: string | null;
}

interface BrainArtifactRecord {
  id: string;
  artifact_type: string;
  title?: string | null;
  storage_url?: string | null;
  mime_type?: string | null;
  source_module?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
}

interface BrainEventRecord {
  id: string;
  event_type: string;
  source_module?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
}

interface BrainTaskSnapshot {
  task: BrainTaskRecord;
  steps: BrainStepRecord[];
  approvals: BrainApprovalRecord[];
  artifacts: BrainArtifactRecord[];
  learningEvents: BrainEventRecord[];
}

function getTrackedTaskIds(messages: Message[]): string[] {
  return Array.from(
    new Set(
      messages.flatMap((message) => {
        const baseTaskId = typeof message.kernel?.taskId === "string" && message.kernel.taskId.trim().length > 0
          ? [message.kernel.taskId]
          : [];
        const relatedTaskIds = ["case_brain_task_id", "draft_factory_task_id"]
          .map((key) => message.kernel?.outputPayload?.[key])
          .filter((value): value is string => typeof value === "string" && value.trim().length > 0);

        return [...baseTaskId, ...relatedTaskIds];
      })
    )
  ).slice(-6);
}

function getMissionBadge(status: string) {
  switch (status) {
    case "queued":
      return { label: "Na fila", className: "text-gray-300 border-white/10 bg-white/5" };
    case "planning":
      return { label: "Planejando", className: "text-blue-300 border-blue-500/30 bg-blue-500/10" };
    case "executing":
      return { label: "Executando", className: "text-[#CCA761] border-[#CCA761]/30 bg-[#CCA761]/10" };
    case "awaiting_input":
      return { label: "Aguardando dados", className: "text-sky-300 border-sky-500/30 bg-sky-500/10" };
    case "awaiting_approval":
      return { label: "Aguardando aprovação", className: "text-orange-300 border-orange-500/30 bg-orange-500/10" };
    case "completed":
      return { label: "Concluída", className: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" };
    case "completed_with_warnings":
      return { label: "Concluída com alertas", className: "text-yellow-300 border-yellow-500/30 bg-yellow-500/10" };
    case "cancelled":
      return { label: "Cancelada", className: "text-gray-300 border-white/10 bg-white/5" };
    case "failed":
      return { label: "Falhou", className: "text-red-300 border-red-500/30 bg-red-500/10" };
    default:
      return { label: status || "Desconhecido", className: "text-gray-300 border-white/10 bg-white/5" };
  }
}

function getStepAccent(status: string) {
  switch (status) {
    case "completed":
      return "bg-emerald-400";
    case "running":
      return "bg-[#CCA761] animate-pulse";
    case "awaiting_approval":
      return "bg-orange-400";
    case "failed":
      return "bg-red-400";
    case "cancelled":
      return "bg-gray-500";
    default:
      return "bg-gray-600";
  }
}

function getEventLabel(eventType: string) {
  switch (eventType) {
    case "task_dispatched":
      return "Missão despachada";
    case "chat_turn_processed":
      return "Turno processado";
    case "proposal_generated":
      return "Proposta gerada";
    case "contract_generated":
      return "Contrato gerado";
    case "billing_created":
      return "Cobrança criada";
    case "revenue_to_case_completed":
      return "Receita virou caso";
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
    case "legal_first_draft_requested_via_chat":
      return "Minuta juridica solicitada via chat";
    case "legal_draft_workflow_executed":
      return "Workflow formal da minuta executado";
    case "legal_draft_review_prepared":
      return "Revisao juridica da minuta preparada";
    case "legal_draft_revision_loop_prepared":
      return "Loop supervisionado da minuta preparado";
    case "legal_document_memory_refreshed":
      return "Memoria documental atualizada";
    case "legal_artifact_publish_premium_executed":
      return "Artifact premium publicado";
    case "tenant_setup_doctor_report_created":
      return "Setup Doctor registrado";
    case "referral_intake_artifact_created":
      return "Indicacao registrada";
    case "lead_intake_artifact_created":
      return "Lead registrado";
    case "sales_profile_configured":
      return "Perfil comercial configurado";
    case "sales_profile_setup_created":
      return "Setup comercial iniciado";
    case "sales_consultation_plan_created":
      return "Consultoria comercial";
    case "lead_qualification_plan_created":
      return "Qualificacao do lead";
    case "lead_followup_plan_created":
      return "Follow-up do lead";
    case "lead_reactivation_plan_created":
      return "Reativacao de leads";
    case "lead_schedule_plan_created":
      return "Agendamento do lead";
    case "revenue_flow_plan_created":
      return "Plano revenue-to-case";
    case "external_action_preview_created":
      return "Preview de acao externa";
    case "client_acceptance_record_created":
      return "Aceite do cliente";
    default:
      return eventType.replaceAll("_", " ");
  }
}

function getEventPreview(event: BrainEventRecord) {
  if (typeof event.payload?.reply === "string" && event.payload.reply.trim()) {
    return event.payload.reply;
  }

  if (typeof event.payload?.learning_loop_summary === "string" && event.payload.learning_loop_summary.trim()) {
    return event.payload.learning_loop_summary;
  }

  if (typeof event.payload?.goal === "string" && event.payload.goal.trim()) {
    return event.payload.goal;
  }

  if (typeof event.payload?.payment_id === "string") {
    return `Pagamento ${event.payload.payment_id}`;
  }

  if (typeof event.payload?.crm_task_id === "string") {
    return `CRM ${event.payload.crm_task_id}`;
  }

  if (typeof event.payload?.summary === "string" && event.payload.summary.trim()) {
    return event.payload.summary;
  }

  if (typeof event.payload?.piece_label === "string" && event.payload.piece_label.trim()) {
    return `Peca: ${event.payload.piece_label}`;
  }

  return null;
}

function getArtifactTypeLabel(artifactType: string) {
  switch (artifactType) {
    case "mission_result":
      return "Resultado da Missão";
    case "legal_case_context":
      return "Contexto Jurídico";
    case "support_case_status":
      return "Status do Caso";
    case "legal_first_draft_result":
      return "Resultado da Primeira Minuta";
    case "legal_draft_workflow_result":
      return "Resultado do Workflow Formal";
    case "legal_draft_review":
      return "Revisao da Minuta";
    case "legal_draft_revision_loop":
      return "Loop da Minuta";
    case "legal_document_memory_refresh":
      return "Refresh Documental";
    case "legal_artifact_publish_premium":
      return "Artifact Premium";
    case "tenant_setup_doctor_report":
      return "Setup Doctor";
    case "referral_intake":
      return "Indicacao Comercial";
    case "lead_intake":
      return "Lead Comercial";
    case "sales_profile_setup":
      return "Auto-configuracao Comercial";
    case "sales_consultation_plan":
      return "Consultoria Comercial";
    case "lead_qualification_plan":
      return "Plano de Qualificacao";
    case "lead_followup_plan":
      return "Plano de Follow-up";
    case "lead_reactivation_plan":
      return "Reativacao de Leads";
    case "lead_schedule_plan":
      return "Plano de Agendamento";
    case "revenue_flow_plan":
      return "Revenue-to-case";
    case "external_action_preview":
      return "Preview Externo";
    case "client_acceptance_record":
      return "Aceite do Cliente";
    case "case_first_draft":
      return "Artifact da Primeira Minuta";
    case "case_brain_dossier":
      return "Dossiê Inicial";
    case "case_brain_plan":
      return "Plano do Case Brain";
    case "case_research_pack":
      return "Research Pack";
    case "case_source_pack":
      return "Source Pack";
    case "case_draft_plan":
      return "Draft Plan";
    default:
      return artifactType.replaceAll("_", " ");
  }
}

function getArtifactPreview(artifact: BrainArtifactRecord) {
  const metadata = artifact.metadata || null;
  const learningLoopSummary = typeof metadata?.learning_loop_summary === "string" && metadata.learning_loop_summary.trim()
    ? metadata.learning_loop_summary.trim()
    : null;
  const summary = typeof metadata?.summary === "string" && metadata.summary.trim()
    ? metadata.summary.trim()
    : null;
  if (learningLoopSummary) return learningLoopSummary;
  if (summary) return summary;

  if (artifact.artifact_type === "case_first_draft") {
    const pieceLabel = typeof metadata?.piece_label === "string" && metadata.piece_label.trim()
      ? metadata.piece_label.trim()
      : null;
    const practiceArea = typeof metadata?.practice_area === "string" && metadata.practice_area.trim()
      ? metadata.practice_area.trim()
      : null;
    if (pieceLabel) {
      return `Primeira minuta ${pieceLabel}${practiceArea ? ` · ${practiceArea}` : ""} pronta para revisão humana.`;
    }
  }

  if (typeof metadata?.reply === "string" && metadata.reply.trim()) {
    return String(metadata.reply).trim();
  }

  if (typeof metadata?.sign_url === "string" && metadata.sign_url.trim()) {
    return String(metadata.sign_url).trim();
  }

  return null;
}

function getArtifactHighlights(artifact: BrainArtifactRecord) {
  const metadata = artifact.metadata || null;
  const highlights = [
    typeof metadata?.process_number === "string" && metadata.process_number.trim() ? metadata.process_number.trim() : null,
    typeof metadata?.recommended_piece_label === "string" && metadata.recommended_piece_label.trim()
      ? metadata.recommended_piece_label.trim()
      : typeof metadata?.piece_label === "string" && metadata.piece_label.trim()
        ? metadata.piece_label.trim()
        : null,
    typeof metadata?.workflow_action_requested === "string" && metadata.workflow_action_requested.trim()
      ? `acao ${metadata.workflow_action_requested.trim().replaceAll("_", " ")}`
      : null,
    typeof metadata?.draft_workflow_status === "string" && metadata.draft_workflow_status.trim()
      ? `workflow ${metadata.draft_workflow_status.trim().replaceAll("_", " ")}`
      : null,
    typeof metadata?.review_verdict === "string" && metadata.review_verdict.trim()
      ? `veredito ${metadata.review_verdict.trim().replaceAll("_", " ")}`
      : null,
    typeof metadata?.recommended_action === "string" && metadata.recommended_action.trim()
      ? `proximo passo ${metadata.recommended_action.trim().replaceAll("_", " ")}`
      : null,
    typeof metadata?.publish_format === "string" && metadata.publish_format.trim()
      ? `formato ${metadata.publish_format.trim().replaceAll("_", " ")}`
      : null,
    typeof metadata?.publish_status === "string" && metadata.publish_status.trim()
      ? `publicacao ${metadata.publish_status.trim().replaceAll("_", " ")}`
      : null,
    typeof metadata?.drive_folder_label === "string" && metadata.drive_folder_label.trim()
      ? `pasta ${metadata.drive_folder_label.trim()}`
      : null,
    Array.isArray(metadata?.learning_loop_categories)
      ? `${metadata.learning_loop_categories.length} sinal${metadata.learning_loop_categories.length === 1 ? "" : "is"} de aprendizado`
      : null,
    typeof metadata?.learning_loop_source_kind === "string" && metadata.learning_loop_source_kind.trim()
      ? `baseline ${metadata.learning_loop_source_kind.trim().replaceAll("_", " ")}`
      : null,
    typeof metadata?.learning_loop_changed === "boolean"
      ? metadata.learning_loop_changed ? "delta humano capturado" : "sem delta material"
      : null,
    typeof metadata?.learning_loop_change_ratio === "number"
      ? `${Math.round(metadata.learning_loop_change_ratio * 100)}% delta`
      : null,
    Array.isArray(metadata?.promotion_candidate_types)
      ? `${metadata.promotion_candidate_types.length} destino${metadata.promotion_candidate_types.length === 1 ? "" : "s"} supervisionavel`
      : null,
    typeof metadata?.promotion_candidate_status === "string" && metadata.promotion_candidate_status.trim()
      ? `candidato ${metadata.promotion_candidate_status.trim().replaceAll("_", " ")}`
      : null,
    typeof metadata?.promotion_candidate_confidence === "string" && metadata.promotion_candidate_confidence.trim()
      ? `confianca ${metadata.promotion_candidate_confidence.trim()}`
      : null,
    typeof metadata?.sections_analyzed === "number"
      ? `${metadata.sections_analyzed} secoes`
      : null,
    typeof metadata?.weak_section_count === "number"
      ? `${metadata.weak_section_count} fracas`
      : null,
    typeof metadata?.missing_section_count === "number"
      ? `${metadata.missing_section_count} ausentes`
      : null,
    typeof metadata?.sync_status === "string" && metadata.sync_status.trim()
      ? `sync ${metadata.sync_status.trim().replaceAll("_", " ")}`
      : null,
    typeof metadata?.document_count === "number"
      ? `${metadata.document_count} docs`
      : null,
    typeof metadata?.warning_count === "number"
      ? `${metadata.warning_count} warnings`
      : null,
    Array.isArray(metadata?.missing_documents)
      ? `${metadata.missing_documents.length} pendencias`
      : null,
    typeof metadata?.first_draft_status === "string" && metadata.first_draft_status.trim()
      ? `minuta ${metadata.first_draft_status.trim().replaceAll("_", " ")}`
      : null,
    typeof metadata?.support_status_response_mode === "string" && metadata.support_status_response_mode.trim()
      ? `modo ${metadata.support_status_response_mode.trim().replaceAll("_", " ")}`
      : null,
    typeof metadata?.support_status_confidence === "string" && metadata.support_status_confidence.trim()
      ? `confianca ${metadata.support_status_confidence.trim()}`
      : null,
    typeof metadata?.support_status_current_phase === "string" && metadata.support_status_current_phase.trim()
      ? `fase ${metadata.support_status_current_phase.trim()}`
      : null,
    Array.isArray(metadata?.support_status_inference_notes) && metadata.support_status_inference_notes.length > 0
      ? `${metadata.support_status_inference_notes.length} inferencias`
      : null,
    Array.isArray(metadata?.support_status_missing_signals) && metadata.support_status_missing_signals.length > 0
      ? `${metadata.support_status_missing_signals.length} sinais faltantes`
      : null,
    typeof metadata?.support_status_handoff_reason === "string" && metadata.support_status_handoff_reason.trim()
      ? `handoff ${metadata.support_status_handoff_reason.trim().replaceAll("_", " ")}`
      : null,
    artifact.artifact_type === "tenant_setup_doctor_report" && typeof metadata?.fixed_count === "number"
      ? `${metadata.fixed_count} corrigidos`
      : null,
    artifact.artifact_type === "tenant_setup_doctor_report" && typeof metadata?.blocked_count === "number"
      ? `${metadata.blocked_count} bloqueios`
      : null,
    artifact.artifact_type === "tenant_setup_doctor_report" && typeof metadata?.warning_count === "number"
      ? `${metadata.warning_count} avisos`
      : null,
    artifact.artifact_type === "tenant_setup_doctor_report" && typeof metadata?.requires_human_action === "boolean"
      ? metadata.requires_human_action ? "acao humana pendente" : "sem acao humana"
      : null,
    artifact.artifact_type === "referral_intake" && typeof metadata?.score === "number"
      ? `score ${metadata.score}`
      : null,
    artifact.artifact_type === "referral_intake" && typeof metadata?.legal_area === "string" && metadata.legal_area.trim()
      ? `area ${metadata.legal_area.trim()}`
      : null,
    artifact.artifact_type === "referral_intake" && typeof metadata?.referred_by === "string" && metadata.referred_by.trim()
      ? `indicado por ${metadata.referred_by.trim()}`
      : null,
    artifact.artifact_type === "referral_intake" && typeof metadata?.needs_human_handoff === "boolean"
      ? metadata.needs_human_handoff ? "handoff humano" : "sem handoff"
      : null,
    artifact.artifact_type === "lead_intake" && typeof metadata?.score === "number"
      ? `score ${metadata.score}`
      : null,
    artifact.artifact_type === "lead_intake" && typeof metadata?.legal_area === "string" && metadata.legal_area.trim()
      ? `area ${metadata.legal_area.trim()}`
      : null,
    artifact.artifact_type === "lead_intake" && typeof metadata?.kind === "string" && metadata.kind.trim()
      ? `tipo ${metadata.kind.trim().replaceAll("_", " ")}`
      : null,
    artifact.artifact_type === "lead_intake" && typeof metadata?.needs_human_handoff === "boolean"
      ? metadata.needs_human_handoff ? "handoff humano" : "sem handoff"
      : null,
    artifact.artifact_type === "sales_profile_setup" && typeof metadata?.setup_status === "string" && metadata.setup_status.trim()
      ? `status ${metadata.setup_status.trim().replaceAll("_", " ")}`
      : null,
    artifact.artifact_type === "sales_profile_setup" && typeof metadata?.setup_completeness === "number"
      ? `${metadata.setup_completeness}% perfil`
      : null,
    artifact.artifact_type === "sales_profile_setup" && Array.isArray(metadata?.missing_signals)
      ? `${metadata.missing_signals.length} sinais faltantes`
      : null,
    artifact.artifact_type === "sales_profile_setup" && Array.isArray(metadata?.drafted_signals)
      ? `${metadata.drafted_signals.length} rascunhos MAYUS`
      : null,
    artifact.artifact_type === "sales_profile_setup" && typeof metadata?.persisted === "boolean"
      ? metadata.persisted ? "gravado" : "nao gravado"
      : null,
    artifact.artifact_type === "sales_consultation_plan" && typeof metadata?.consultation_phase === "string" && metadata.consultation_phase.trim()
      ? `fase ${metadata.consultation_phase.trim().replaceAll("_", " ")}`
      : null,
    artifact.artifact_type === "sales_consultation_plan" && typeof metadata?.customer_profile === "string" && metadata.customer_profile.trim()
      ? `perfil ${metadata.customer_profile.trim().replaceAll("_", " ")}`
      : null,
    artifact.artifact_type === "sales_consultation_plan" && Array.isArray(metadata?.objection_moves)
      ? `${metadata.objection_moves.length} objecoes`
      : null,
    artifact.artifact_type === "sales_consultation_plan" && typeof metadata?.discovery_completeness === "number"
      ? `${metadata.discovery_completeness}% descoberta`
      : null,
    artifact.artifact_type === "sales_consultation_plan" && Array.isArray(metadata?.missing_signals)
      ? `${metadata.missing_signals.length} sinais faltantes`
      : null,
    artifact.artifact_type === "sales_consultation_plan" && typeof metadata?.firm_positioning_completeness === "number"
      ? `${metadata.firm_positioning_completeness}% perfil comercial`
      : null,
    artifact.artifact_type === "sales_consultation_plan" && Array.isArray(metadata?.firm_profile_missing_signals)
      ? `${metadata.firm_profile_missing_signals.length} sinais do escritorio`
      : null,
    artifact.artifact_type === "sales_consultation_plan" && typeof metadata?.external_side_effects_blocked === "boolean"
      ? metadata.external_side_effects_blocked ? "externo bloqueado" : "externo liberado"
      : null,
    artifact.artifact_type === "lead_qualification_plan" && typeof metadata?.qualification_confidence === "string" && metadata.qualification_confidence.trim()
      ? `confianca ${metadata.qualification_confidence.trim()}`
      : null,
    artifact.artifact_type === "lead_qualification_plan" && typeof metadata?.legal_area === "string" && metadata.legal_area.trim()
      ? `area ${metadata.legal_area.trim()}`
      : null,
    artifact.artifact_type === "lead_qualification_plan" && Array.isArray(metadata?.minimum_documents)
      ? `${metadata.minimum_documents.length} documentos`
      : null,
    artifact.artifact_type === "lead_qualification_plan" && Array.isArray(metadata?.risk_flags) && metadata.risk_flags.length > 0
      ? `${metadata.risk_flags.length} alertas`
      : null,
    artifact.artifact_type === "lead_followup_plan" && typeof metadata?.followup_priority === "string" && metadata.followup_priority.trim()
      ? `prioridade ${metadata.followup_priority.trim()}`
      : null,
    artifact.artifact_type === "lead_followup_plan" && typeof metadata?.legal_area === "string" && metadata.legal_area.trim()
      ? `area ${metadata.legal_area.trim()}`
      : null,
    artifact.artifact_type === "lead_followup_plan" && Array.isArray(metadata?.cadence)
      ? `${metadata.cadence.length} passos`
      : null,
    artifact.artifact_type === "lead_followup_plan" && typeof metadata?.requires_human_approval === "boolean"
      ? metadata.requires_human_approval ? "aprovacao humana" : "sem aprovacao humana"
      : null,
    artifact.artifact_type === "lead_reactivation_plan" && typeof metadata?.segment === "string" && metadata.segment.trim()
      ? `segmento ${metadata.segment.trim()}`
      : null,
    artifact.artifact_type === "lead_reactivation_plan" && typeof metadata?.candidate_count === "number"
      ? `${metadata.candidate_count} candidatos`
      : null,
    artifact.artifact_type === "lead_reactivation_plan" && Array.isArray(metadata?.message_variants)
      ? `${metadata.message_variants.length} mensagens`
      : null,
    artifact.artifact_type === "lead_reactivation_plan" && typeof metadata?.external_side_effects_blocked === "boolean"
      ? metadata.external_side_effects_blocked ? "externo bloqueado" : "externo liberado"
      : null,
    artifact.artifact_type === "lead_schedule_plan" && typeof metadata?.scheduled_for === "string" && metadata.scheduled_for.trim()
      ? `agenda ${new Date(metadata.scheduled_for.trim()).toLocaleDateString("pt-BR")}`
      : null,
    artifact.artifact_type === "lead_schedule_plan" && typeof metadata?.urgency === "string" && metadata.urgency.trim()
      ? `urgencia ${metadata.urgency.trim()}`
      : null,
    artifact.artifact_type === "lead_schedule_plan" && typeof metadata?.agenda_task_id === "string" && metadata.agenda_task_id.trim()
      ? `tarefa ${metadata.agenda_task_id.trim()}`
      : null,
    artifact.artifact_type === "lead_schedule_plan" && typeof metadata?.requires_human_approval === "boolean"
      ? metadata.requires_human_approval ? "confirmacao humana" : "sem confirmacao humana"
      : null,
    artifact.artifact_type === "revenue_flow_plan" && Array.isArray(metadata?.steps)
      ? `${metadata.steps.length} etapas`
      : null,
    artifact.artifact_type === "revenue_flow_plan" && typeof metadata?.amount === "number"
      ? `valor ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(metadata.amount)}`
      : null,
    artifact.artifact_type === "revenue_flow_plan" && typeof metadata?.blocked_reason === "string" && metadata.blocked_reason.trim()
      ? "bloqueado"
      : null,
    artifact.artifact_type === "revenue_flow_plan" && typeof metadata?.requires_human_approval === "boolean"
      ? metadata.requires_human_approval ? "aprovacao humana" : "sem aprovacao humana"
      : null,
    artifact.artifact_type === "external_action_preview" && typeof metadata?.action_type === "string" && metadata.action_type.trim()
      ? `acao ${metadata.action_type.trim().replaceAll("_", " ")}`
      : null,
    artifact.artifact_type === "external_action_preview" && typeof metadata?.preview_status === "string" && metadata.preview_status.trim()
      ? `status ${metadata.preview_status.trim().replaceAll("_", " ")}`
      : null,
    artifact.artifact_type === "external_action_preview" && Array.isArray(metadata?.blockers)
      ? `${metadata.blockers.length} bloqueios`
      : null,
    artifact.artifact_type === "external_action_preview" && typeof metadata?.external_side_effects_blocked === "boolean"
      ? metadata.external_side_effects_blocked ? "externo bloqueado" : "externo liberado"
      : null,
    artifact.artifact_type === "client_acceptance_record" && typeof metadata?.acceptance_type === "string" && metadata.acceptance_type.trim()
      ? `tipo ${metadata.acceptance_type.trim().replaceAll("_", " ")}`
      : null,
    artifact.artifact_type === "client_acceptance_record" && typeof metadata?.audit_status === "string" && metadata.audit_status.trim()
      ? `status ${metadata.audit_status.trim().replaceAll("_", " ")}`
      : null,
    artifact.artifact_type === "client_acceptance_record" && typeof metadata?.amount === "number"
      ? `valor ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(metadata.amount)}`
      : null,
    artifact.artifact_type === "client_acceptance_record" && typeof metadata?.external_side_effects_blocked === "boolean"
      ? metadata.external_side_effects_blocked ? "externo bloqueado" : "externo liberado"
      : null,
  ].filter(Boolean) as string[];

  return highlights.slice(0, 7);
}

function getRelatedTaskIds(kernel?: MessageKernel) {
  const currentTaskId = typeof kernel?.taskId === "string" ? kernel.taskId : null;
  return Array.from(
    new Set(
      ["case_brain_task_id", "draft_factory_task_id"]
        .map((key) => kernel?.outputPayload?.[key])
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0 && value !== currentTaskId)
    )
  );
}

function MissionStatusCard({ snapshot }: { snapshot: BrainTaskSnapshot }) {
  const badge = getMissionBadge(snapshot.task.status);
  const visibleSteps = snapshot.steps.slice(0, 4);
  const pendingApprovals = snapshot.approvals.filter((approval) => approval.status === "pending").length;
  const visibleArtifacts = snapshot.artifacts.slice(0, 3);
  const visibleEvents = snapshot.learningEvents.slice(0, 3);

  return (
    <div data-testid={`mayus-mission-card-${snapshot.task.id}`} className="mt-3 border border-white/8 bg-gray-200 dark:bg-black/30 rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Missão</p>
          <p className="text-xs text-white font-semibold">{snapshot.task.module} · {snapshot.task.channel}</p>
        </div>
        <span className={`text-[10px] px-2.5 py-1 rounded-full border font-bold uppercase tracking-widest ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {pendingApprovals > 0 && (
        <div className="text-[11px] text-orange-300 border border-orange-500/20 bg-orange-500/10 rounded-lg px-2.5 py-2">
          {pendingApprovals} aprovação(ões) pendente(s) nesta missão.
        </div>
      )}

      {visibleSteps.length > 0 && (
        <div className="space-y-2">
          {visibleSteps.map((step) => (
            <div key={step.id} className="flex items-start gap-2 text-[11px] text-gray-300">
              <span className={`mt-1.5 h-2 w-2 rounded-full ${getStepAccent(step.status)}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-white/90">{step.order_index}. {step.title}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-widest">{step.status.replaceAll("_", " ")}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {visibleArtifacts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Artifacts</p>
          {visibleArtifacts.map((artifact) => {
            const preview = getArtifactPreview(artifact);
            const highlights = getArtifactHighlights(artifact);

            return (
              <div data-testid={`mayus-artifact-${artifact.id}`} key={artifact.id} className="rounded-lg border border-white/5 bg-gray-200 dark:bg-black/20 p-2.5 text-[11px] text-gray-300">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-white/90">{artifact.title || getArtifactTypeLabel(artifact.artifact_type)}</p>
                    <p className="text-[10px] uppercase tracking-widest text-gray-500">{getArtifactTypeLabel(artifact.artifact_type)}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-gray-500">{dayjs(artifact.created_at).fromNow()}</span>
                </div>

                {highlights.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {highlights.map((highlight) => (
                      <span key={highlight} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[9px] uppercase tracking-widest text-gray-400">
                        {highlight}
                      </span>
                    ))}
                  </div>
                )}

                {preview && <p className="mt-2 text-gray-400 line-clamp-2">{preview}</p>}

                {artifact.storage_url && (
                  <a
                    href={artifact.storage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex text-[#CCA761] hover:underline"
                  >
                    Abrir artifact
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}

      {visibleEvents.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-gray-500 uppercase tracking-widest">Feed do cérebro</p>
          {visibleEvents.map((event) => {
            const preview = getEventPreview(event);

            return (
               <div data-testid={`mayus-event-${event.id}`} key={event.id} className="rounded-lg border border-white/5 bg-gray-200 dark:bg-black/20 p-2.5 text-[11px] text-gray-300">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-white/90">{getEventLabel(event.event_type)}</p>
                  <span className="text-[10px] uppercase tracking-widest text-gray-500">{dayjs(event.created_at).fromNow()}</span>
                </div>
                {preview && <p className="mt-2 text-gray-400 line-clamp-2">{preview}</p>}
              </div>
            );
          })}
        </div>
      )}

      {snapshot.task.error_message && (
        <div className="text-[11px] text-red-300 border border-red-500/20 bg-red-500/10 rounded-lg px-2.5 py-2">
          {snapshot.task.error_message}
        </div>
      )}
    </div>
  );
}

function MissionPendingCard() {
  return (
    <div className="mt-3 border border-white/8 bg-gray-200 dark:bg-black/30 rounded-xl p-3 flex items-center gap-2 text-[11px] text-gray-400">
      <Loader2 size={12} className="animate-spin text-[#CCA761]" />
      <span>Missão registrada. Carregando status do cérebro...</span>
    </div>
  );
}

// ─── ApprovalCard ─────────────────────────────────────────────────────────────

type ApprovalState =
  | "idle" | "loading" | "approved" | "rejected"
  | "already_processed" | "expired" | "no_permission" | "error";

function ApprovalCard({
  auditLogId,
  awaitingPayload,
  onDecided,
}: {
  auditLogId: string;
  awaitingPayload: AwaitingPayload;
  onDecided?: (decision: 'approved' | 'rejected') => void;
}) {
  const [cardState, setCardState] = useState<ApprovalState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [approvedMessage, setApprovedMessage] = useState("");

  const handleDecision = async (decision: "approved" | "rejected") => {
    if (cardState !== "idle") return; // imutável após primeira decisão
    setCardState("loading");
    try {
      const res = await fetch("/api/ai/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditLogId, decision }),
      });
      const data = await res.json();

      if (res.status === 409) {
        setCardState("already_processed");
        setStatusMessage("Esta ação já foi processada anteriormente.");
        return;
      }
      if (res.status === 410) {
        setCardState("expired");
        setStatusMessage("Solicitação expirada. O usuário deve iniciar a ação novamente.");
        return;
      }
      if (res.status === 403) {
        setCardState("no_permission");
        setStatusMessage("Sem permissão para aprovar. Apenas Admin e Sócio podem autorizar.");
        return;
      }
      if (res.status >= 500) {
        setCardState("error");
        setStatusMessage(data?.error ?? "Erro interno — ação aprovada mas não executada. Verifique as integrações.");
        return;
      }
      if (!res.ok) {
        setCardState("error");
        setStatusMessage(data?.error ?? "Erro inesperado ao processar a decisão.");
        return;
      }

      if (decision === "approved") {
        const wasExecuted = data?.status === "executed";
        setApprovedMessage(
          wasExecuted
            ? "Aprovada. Ação executada com sucesso."
            : "Aprovada e registrada. Execução será processada em breve."
        );
        setCardState("approved");
        if (onDecided) onDecided("approved");
      } else {
        setCardState("rejected");
        if (onDecided) onDecided("rejected");
      }
    } catch {
      setCardState("error");
      setStatusMessage("Falha de rede ao processar a decisão.");
    }
  };

  // Risk level: valores confirmados em inglês na migration Fase 0
  const riskBadge: Record<string, string> = {
    critical: "text-red-400 border-red-500/40 bg-red-500/10",
    high:     "text-orange-400 border-orange-500/40 bg-orange-500/10",
    medium:   "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
    low:      "text-green-400 border-green-500/40 bg-green-500/10",
  };
  const badgeClass = riskBadge[awaitingPayload.riskLevel] ?? riskBadge.medium;

  return (
    <div className="border border-[#CCA761]/30 bg-[#0f0f0f] rounded-2xl p-5 max-w-[85%] space-y-4 animate-in fade-in slide-in-from-bottom-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] text-[#CCA761] uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5">
            <ShieldAlert size={11} /> Aprovação necessária
          </p>
          <p className="text-white font-semibold text-sm">{awaitingPayload.skillName}</p>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border whitespace-nowrap ${badgeClass}`}>
          {awaitingPayload.riskLevel ?? "desconhecido"}
        </span>
      </div>

      {/* Entities — dados reais para decisão informada do aprovador */}
      <div className="space-y-1.5">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest">Dados que serão executados</p>
        <div className="bg-gray-200 dark:bg-black/40 rounded-xl p-3 space-y-1.5">
          {Object.entries(awaitingPayload.entities).length > 0 ? (
            Object.entries(awaitingPayload.entities).map(([key, value]) => (
              <div key={key} className="flex gap-2 text-xs">
                <span className="text-gray-500 min-w-[130px] shrink-0">{key}:</span>
                <span className="text-gray-200 break-all">{value || "—"}</span>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-xs italic">Nenhuma entidade detectada.</p>
          )}
        </div>
      </div>

      {/* Área de decisão — bloqueada após primeira ação */}
      {cardState === "idle" && (
        <div className="flex gap-2 pt-1">
          <button
            id={`approve-btn-${auditLogId}`}
            onClick={() => handleDecision("approved")}
            className="flex-1 bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold uppercase tracking-widest py-2.5 rounded-xl hover:bg-emerald-600/30 transition-all active:scale-95"
          >
            Aprovar
          </button>
          <button
            id={`reject-btn-${auditLogId}`}
            onClick={() => handleDecision("rejected")}
            className="flex-1 bg-red-600/20 border border-red-500/40 text-red-400 text-xs font-bold uppercase tracking-widest py-2.5 rounded-xl hover:bg-red-600/30 transition-all active:scale-95"
          >
            Rejeitar
          </button>
        </div>
      )}

      {cardState === "loading" && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-[#CCA761]">
          <Loader2 size={14} className="animate-spin" />
          <span>Processando decisão...</span>
        </div>
      )}

      {cardState === "approved" && (
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold py-2">
          <CheckCircle size={15} />
          <span>{approvedMessage}</span>
        </div>
      )}

      {cardState === "rejected" && (
        <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold py-2">
          <XCircle size={15} />
          <span>Rejeitada. Nenhuma ação foi executada.</span>
        </div>
      )}

      {["already_processed", "expired", "no_permission", "error"].includes(cardState) && (
        <div className="flex items-start gap-2 text-amber-400 text-xs py-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{statusMessage}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MAYUSPlayground() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiKeyData, setApiKeyData] = useState<{ provider: string; model: string } | null>(null);
  const [availableIntegrations, setAvailableIntegrations] = useState<{ provider: string; model: string }[]>([]);
  const [isModelSwitcherOpen, setIsModelSwitcherOpen] = useState(false);
  const [customModelInput, setCustomModelInput] = useState("");
  const [checkingVault, setCheckingVault] = useState(true);
  const [brainTaskSnapshots, setBrainTaskSnapshots] = useState<Record<string, BrainTaskSnapshot>>({});

  // Novos estados da Fase 5A
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const isConversationModeRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isConversationMode, setIsConversationMode] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<number | string | null>(null);
  const { profile, isLoading: profileLoading } = useUserProfile();

  const modelOptions = useMemo<ModelOption[]>(() => {
    const seen = new Set<string>();
    const options: ModelOption[] = [];

    for (const integration of availableIntegrations) {
      const provider = integration.provider;
      const configuredKey = `${provider}:${integration.model}`;
      if (!seen.has(configuredKey)) {
        seen.add(configuredKey);
        options.push({
          provider,
          model: integration.model,
          label: `${provider.toUpperCase()} atual`,
          description: "Modelo salvo na integracao",
        });
      }

      for (const preset of MODEL_PRESETS[provider.toLowerCase()] || []) {
        const key = `${provider}:${preset.model}`;
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({ provider, ...preset });
      }
    }

    return options;
  }, [availableIntegrations]);

  const selectChatModel = (option: { provider: string; model: string }, announce = true) => {
    setApiKeyData({ provider: option.provider, model: option.model });
    setCustomModelInput(option.model);
    setIsModelSwitcherOpen(false);
    if (announce) {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Cortex ajustado para ${option.provider.toUpperCase()} / ${option.model}.` },
      ]);
    }
  };

  const loadBrainTask = useCallback(async (taskId: string) => {
    try {
      const response = await fetch(`/api/brain/tasks/${taskId}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.task) {
        throw new Error(data?.error || "Erro ao carregar status da missão.");
      }

      setBrainTaskSnapshots((current) => ({
        ...current,
        [taskId]: {
          task: data.task as BrainTaskRecord,
          steps: Array.isArray(data.steps) ? (data.steps as BrainStepRecord[]) : [],
          approvals: Array.isArray(data.approvals) ? (data.approvals as BrainApprovalRecord[]) : [],
          artifacts: Array.isArray(data.artifacts) ? (data.artifacts as BrainArtifactRecord[]) : [],
          learningEvents: Array.isArray(data.learning_events) ? (data.learning_events as BrainEventRecord[]) : [],
        },
      }));
    } catch (error) {
      console.error(`[MAYUS] Falha ao carregar missão ${taskId}:`, error);
    }
  }, []);

  const loadBrainStatus = useCallback(async () => {
    setCheckingVault(true);
    try {
      const response = await fetch("/api/brain/status", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao carregar status do cerebro.");
      }

      const availableProviders = Array.isArray(data?.available_providers)
        ? data.available_providers
            .filter((item: any) => item?.provider && item?.model)
            .map((item: any) => ({
              provider: String(item.provider),
              model: String(item.model),
            }))
        : [];

      setAvailableIntegrations(availableProviders);

      if (data?.configured && data?.default_provider && data?.default_model) {
        setApiKeyData({
          provider: String(data.default_provider),
          model: String(data.default_model),
        });
      } else {
        setApiKeyData(null);
      }
    } catch (err) {
      console.error(err);
      setApiKeyData(null);
      setAvailableIntegrations([]);
    } finally {
      setCheckingVault(false);
    }
  }, []);

  useEffect(() => {
    if (!profileLoading) {
      if (profile?.tenant_id) {
        void loadBrainStatus();
        fetchConversations();
      } else {
        setCheckingVault(false);
      }
    }
  }, [profile?.tenant_id, profileLoading, loadBrainStatus]);

  useEffect(() => {
    if (apiKeyData?.model) {
      setCustomModelInput(apiKeyData.model);
    }
  }, [apiKeyData?.model]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isConversationMode) {
        setIsConversationMode(false);
        setIsRecording(false);
        toast.info("Modo Conversa desativado.");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConversationMode]);

  useEffect(() => {
    isConversationModeRef.current = isConversationMode;
  }, [isConversationMode]);

  useEffect(() => {
    const taskIds = getTrackedTaskIds(messages);

    if (taskIds.length === 0) {
      return;
    }

    const refreshTasks = async () => {
      await Promise.all(taskIds.map((taskId) => loadBrainTask(taskId)));
    };

    void refreshTasks();

    const intervalId = window.setInterval(() => {
      void refreshTasks();
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [messages, loadBrainTask]);

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/ai/conversations");
      const data = await res.json();
      if (data.conversations) setConversations(data.conversations);
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
    }
  };

  const loadConversation = async (id: string) => {
    setIsLoading(true);
    setCurrentConversationId(id);
    setBrainTaskSnapshots({});
    try {
      const res = await fetch(`/api/ai/conversations/${id}`);
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
      if (window.innerWidth < 768) setIsMobileMenuOpen(false);
    } catch (err) {
      toast.error("Erro ao carregar mensagens.");
      setCurrentConversationId(null);
    } finally {
      setIsLoading(false);
    }
  };

  const createNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    setBrainTaskSnapshots({});
    if (window.innerWidth < 768) setIsMobileMenuOpen(false);
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setConversations(prev => prev.filter(c => c.id !== id));
      if (currentConversationId === id) createNewChat();
      toast.success("Conversa deletada.");
    } catch {
      toast.error("Erro ao deletar conversa.");
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !apiKeyData) return;

    let userMsg = input.trim();
    let currentModel = apiKeyData.model;
    let currentProvider = apiKeyData.provider;
    let convId = currentConversationId;
    const isFirstMessage = !convId;

    if (userMsg.startsWith('/')) {
      const parts = userMsg.split(' ');
      const command = parts[0].substring(1).toLowerCase();
      const targetProvider = availableIntegrations.find(i => i.provider.toLowerCase() === command);

      if (targetProvider) {
        currentProvider = targetProvider.provider;
        setApiKeyData({ provider: currentProvider, model: targetProvider.model });
        userMsg = parts.slice(1).join(' ').trim();
        if (!userMsg) {
          setMessages(prev => [...prev, { role: "system", content: `Aviso do Córtex: Provedor alterado para "${currentProvider.toUpperCase()}".` }]);
          setInput("");
          return;
        }
      } else {
        currentModel = command;
        setApiKeyData(prev => prev ? { ...prev, model: currentModel } : null);
        userMsg = parts.slice(1).join(' ').trim();
        if (!userMsg) {
          setMessages(prev => [...prev, { role: "system", content: `Aviso do Córtex: Modelo alterado para "${currentModel}".` }]);
          setInput("");
          return;
        }
      }
    }

    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    // 1. Inicia conversa no banco se for o primeiro envio
    if (isFirstMessage) {
      try {
        const res = await fetch("/api/ai/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Nova Conversa" }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        convId = data.conversation.id;
        setCurrentConversationId(convId);
        setConversations(prev => [data.conversation, ...prev]);
      } catch (err) {
        toast.error("Falha ao iniciar conversa no banco.");
        setIsLoading(false);
        return;
      }
    }

    // 2. Persiste a mensagem do Usuário
    try {
      await fetch(`/api/ai/conversations/${convId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: userMsg }),
      });
    } catch { } // não bloqueia o chat se falhar

    // 3. Comunica com o Kernel
    let aiResponseData: any = null;
    let fallbackStatus = false;
    let fallbackOutput = "";

    try {
      const response = await fetch("/api/brain/chat-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          provider: currentProvider,
          model: currentModel,
          conversationId: convId,
          history: messages
            .filter(m => m.role === "user" || m.role === "model")
            .map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "A IA não conseguiu responder.");
      aiResponseData = data;

      if (data.kernel?.taskId) {
        void loadBrainTask(String(data.kernel.taskId));
      }

      // ── Fluxo de aprovação humana ──────────────────────────────────────
      if (
        data.kernel?.status === "awaiting_approval" &&
        data.kernel?.auditLogId &&
        data.kernel?.awaitingPayload
      ) {
        const newMessages: Message[] = [];
        if (data.reply) {
          newMessages.push({ role: "model", content: data.reply, kernel: data.kernel || {} });
        }
        newMessages.push({
          role: "approval",
          content: "",
          kernel: {
            status: data.kernel.status,
            auditLogId: data.kernel.auditLogId,
            awaitingPayload: data.kernel.awaitingPayload,
            taskId: data.kernel.taskId,
            runId: data.kernel.runId,
            stepId: data.kernel.stepId,
          },
        });
        setMessages(prev => [...prev, ...newMessages]);
      } 
      // ── Fluxo normal ────────────────────────────
      else {
        const reply = data.reply ?? "";
        const replyChunks = reply.split(/\n\n+/).filter((c: string) => c.trim().length > 0);
        const newMessages: Message[] = replyChunks.length > 0
          ? replyChunks.map((chunk: string, chunkIdx: number) => ({
              role: "model" as const,
              content: chunk.trim(),
              kernel: chunkIdx === 0 ? (data.kernel || {}) : undefined,
            }))
          : [{ role: "model" as const, content: reply || "...", kernel: data.kernel || {} }];
        setMessages(prev => [...prev, ...newMessages]);
      }
    } catch (err: any) {
      toast.error(err.message);
      fallbackStatus = true;
      fallbackOutput = "Erro Crítico: A conexão com o córtex falhou.";
      setMessages(prev => [...prev, { role: "system", content: fallbackOutput }]);
    } finally {
      setIsLoading(false);
    }

    // 4. Salva a resposta do Córtex de forma tolerante a falhas
    if (convId) {
       if (fallbackStatus) {
         try {
           await fetch(`/api/ai/conversations/${convId}`, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ role: "system", content: fallbackOutput, kernel: {} }),
           });
         } catch { }
       } else if (aiResponseData) {
         const isApproval = aiResponseData.kernel?.status === "awaiting_approval";
         
         if (aiResponseData.reply) {
            await fetch(`/api/ai/conversations/${convId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role: "model", content: aiResponseData.reply, kernel: aiResponseData.kernel || {} }),
            });
            
            // Se estiver no Modo Conversa, tocar áudio automaticamente
           if (isConversationModeRef.current) {
             playMessage(aiResponseData.reply, "latest_conv");
           }
         }
          if (isApproval) {
            await fetch(`/api/ai/conversations/${convId}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role: "approval", content: "", kernel: aiResponseData.kernel }),
            });
          }
        }
    }

    // 5. Gera o título após a IA responder a primeira vez usando OpenAI para garantir
    if (isFirstMessage && convId) {
      fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: `Gere um título curto (máx 4 palavras) para a frase: "${userMsg}". Responda APENAS o título, sem aspas ou explicações.`,
          provider: currentProvider,
          model: currentModel,
          history: []
        })
      }).then(res => res.json()).then(data => {
        if (data.reply) {
          fetch(`/api/ai/conversations/${convId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: data.reply.replace(/"/g, '') })
          }).then(() => fetchConversations());
        }
      });
    }
  };

  // ─── Lógica de Voz (STT & TTS) ──────────────────────────────────────────────

  const toggleRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Seu navegador não suporta reconhecimento de voz.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "pt-BR";
    recognition.continuous = true; // Mantém o mic aberto entre pequenas pausas
    recognition.interimResults = true; // Visualização em tempo real
    recognition.maxAlternatives = 1;

    let fullTranscript = "";

    recognition.onstart = () => {
      setIsRecording(true);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      
      // Envio automático se houver conteúdo acumulado
      // Usamos o que está no input ou o fullTranscript capturado
      if (fullTranscript.trim()) {
        const textToSend = fullTranscript.trim();
        setTimeout(() => handleSendWithText(textToSend), 100);
      }
    };

    recognition.onerror = (e: any) => {
      console.error("STT Error:", e);
      setIsRecording(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let currentFinal = "";

      // Reconstrói a partir de todos os resultados (finais e temporários)
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          currentFinal += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      fullTranscript += currentFinal;
      setInput(fullTranscript + interimTranscript);

      // Reset do timer de silêncio (2.5 segundos)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        recognition.stop(); // O evento onend fará o envio
      }, 2500);
    };

    recognition.start();
  };

  // Helper para enviar texto direto (usado pelo STT)
  const handleSendWithText = async (text: string) => {
    if (!text.trim() || !apiKeyData) return;

    // ─── Interceptador de Comandos de Aprovação Vocal ──────────────────────────
    if (isConversationModeRef.current) {
      // Normalização: Remove pontuação e espaços extras para melhorar o matching
      const cleanText = text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
      const isApprove = ["aprovar", "pode aprovar", "confirmar", "ok", "autorizar", "aceitar"].some(k => cleanText.includes(k));
      const isReject = ["rejeitar", "cancelar", "não", "parar", "negar"].some(k => cleanText.includes(k));

      if (isApprove) {
        const approveBtns = document.querySelectorAll('[id^="approve-btn-"]:not([disabled])');
        const lastApproveBtn = approveBtns[approveBtns.length - 1] as HTMLButtonElement;
        if (lastApproveBtn) {
          lastApproveBtn.click();
          setInput("");
          return; // Intercepta: Não envia o texto para o kernel
        }
      } else if (isReject) {
        const rejectBtns = document.querySelectorAll('[id^="reject-btn-"]:not([disabled])');
        const lastRejectBtn = rejectBtns[rejectBtns.length - 1] as HTMLButtonElement;
        if (lastRejectBtn) {
          lastRejectBtn.click();
          setInput("");
          return; // Intercepta: Não envia o texto para o kernel
        }
      }
    }

    // Forçar o envio do texto capturado
    setInput(text);
    document.getElementById("chat-form")?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  };

  const playMessage = async (msgContent: string, msgId: string | number) => {
    if (playingMessageId === msgId) {
      audioRef.current?.pause();
      setPlayingMessageId(null);
      return;
    }

    try {
      setPlayingMessageId(msgId);
      const url = `/api/ai/tts?text=${encodeURIComponent(msgContent)}`;
      
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onended = () => {
        setPlayingMessageId(null);
        // Se estiver no Modo Conversa, reabrir microfone após a IA terminar de falar
        if (isConversationModeRef.current) {
          setTimeout(() => {
            toggleRecording();
          }, 500); // 500ms para hardware sync estável
        }
      };
      audio.onerror = () => {
        toast.error("Erro ao reproduzir áudio.");
        setPlayingMessageId(null);
      };
      
      await audio.play();
    } catch (err) {
      console.error(err);
      setPlayingMessageId(null);
    }
  };

  if (checkingVault) {
    return <div className="p-8 flex items-center justify-center animate-pulse text-[#CCA761]">Acessando Cofre de Chaves...</div>;
  }

  if (!apiKeyData) {
    return (
      <div className={`p-6 max-w-4xl mx-auto mt-20 text-center animate-fade-in-up ${montserrat.className}`}>
        <div className="w-24 h-24 mx-auto bg-[#CCA761]/10 rounded-full flex items-center justify-center border border-[#CCA761]/30 mb-6">
          <KeyRound size={40} className="text-[#CCA761]" />
        </div>
        <h1 className={`text-5xl text-white mb-4 ${cormorant.className}`}>O MAYUS está Adormecido</h1>
        <p className="text-gray-400 mb-8 max-w-lg mx-auto leading-relaxed">
          Nenhuma chave de IA foi encontrada no seu cofre seguro. Vá para a página de integrações e conecte uma mente de Inteligência Artificial para dar vida ao MAYUS.
        </p>
        <Link href="/dashboard/configuracoes/integracoes" className="inline-flex items-center gap-2 bg-[#CCA761] text-black font-bold uppercase tracking-widest text-xs px-8 py-4 rounded-xl hover:scale-105 transition-transform">
          Ir para Integrações
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex h-[calc(100vh-80px)] bg-gray-200 dark:bg-black overflow-hidden relative ${montserrat.className}`}>
      
      {/* Botão Mobile Menu Toggle */}
      <button 
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="md:hidden absolute top-4 left-4 z-50 p-2 bg-gray-50 dark:bg-[#141414] border border-[#CCA761]/30 rounded-lg text-[#CCA761]"
      >
        {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* --- SIDEBAR DE HISTÓRICO --- */}
      <aside className={`
        ${isSidebarOpen ? 'w-80' : 'w-0'} 
        ${isMobileMenuOpen ? 'translate-x-0 w-80' : '-translate-x-full md:translate-x-0'}
        transition-all duration-300 border-r border-[#CCA761]/20 bg-[#0a0a0a] flex flex-col hide-scrollbar absolute md:relative z-40 h-full
      `}>
        {isSidebarOpen && (
          <div className="flex flex-col h-full w-80">
            <div className="p-4 border-b border-white/5">
              <button 
                onClick={createNewChat}
                className="w-full flex items-center gap-2 bg-[#CCA761]/10 text-[#CCA761] hover:bg-[#CCA761]/20 border border-[#CCA761]/30 rounded-xl px-4 py-3 font-semibold text-sm transition-colors uppercase tracking-widest"
              >
                <Plus size={16} /> Nova Conversa
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1 hide-scrollbar">
              {conversations.length === 0 ? (
                <div className="text-center p-6 opacity-50">
                  <History size={30} className="mx-auto mb-2 text-[#CCA761]" />
                  <p className="text-xs text-gray-400">Nenhum histórico disponível</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <div 
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={`group relative flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      currentConversationId === conv.id 
                        ? 'bg-[#CCA761]/10 border border-[#CCA761]/30' 
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <MessageSquare size={15} className={currentConversationId === conv.id ? "text-[#CCA761]" : "text-gray-500"} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm tracking-wide truncate ${currentConversationId === conv.id ? 'text-[#CCA761]' : 'text-gray-300'}`}>
                        {conv.title}
                      </p>
                      <p className="text-[10px] text-gray-600 mt-0.5">
                        {dayjs(conv.updated_at).fromNow()}
                      </p>
                    </div>
                    <button 
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="absolute right-2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded-md transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </aside>

      {/* --- CHAT AREA CENTRAL --- */}
      <main className="flex-1 flex flex-col relative h-full">

        {/* HEADER DA TELA CENTRAL */}
        <header className="flex items-center justify-between p-4 border-b border-[#CCA761]/10 bg-gradient-to-b from-[#111] to-transparent">
          <div className="flex items-center gap-4 pl-12 md:pl-0">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden md:flex p-2 hover:bg-white/5 text-gray-400 rounded-lg transition-colors border border-transparent hover:border-white/10"
              title={isSidebarOpen ? "Recolher Histórico" : "Expandir Histórico"}
            >
               {isSidebarOpen ? <ChevronLeft size={18} /> : <History size={18} />}
            </button>
            <div className="relative hidden sm:block">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#CCA761] to-[#604c26] flex items-center justify-center p-[1px]">
                <div className="w-full h-full bg-gray-200 dark:bg-black rounded-full flex items-center justify-center">
                  <BrainCircuit size={18} className="text-[#CCA761]" />
                </div>
              </div>
            </div>
            <div>
              <h1 className={`text-xl text-[#CCA761] font-bold ${cormorant.className}`}>MAYUS AI</h1>
              <p className="text-[10px] text-green-400 flex items-center gap-1 font-bold tracking-widest uppercase">
                <Sparkles size={10} /> Córtex ({apiKeyData.provider})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const newState = !isConversationMode;
                setIsConversationMode(newState);
                if (newState) {
                  toast.success("Modo Conversa Ativado");
                  if (!isRecording && !playingMessageId) {
                    setTimeout(() => toggleRecording(), 500);
                  }
                } else {
                  setIsRecording(false);
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-[10px] font-black uppercase tracking-[0.2em] ${
                isConversationMode 
                  ? 'bg-[#CCA761] border-[#CCA761] text-black shadow-[0_0_20px_rgba(204,167,97,0.4)] animate-pulse' 
                  : 'bg-white/5 border-white/10 text-gray-500 hover:border-[#CCA761]/40'
              }`}
            >
              <Sparkles size={14} /> {isConversationMode ? 'Modo Conversa Ativo' : 'Ativar Modo Conversa'}
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsModelSwitcherOpen((value) => !value)}
                className="bg-[#CCA761]/10 border border-[#CCA761]/20 px-3 py-1.5 flex items-center gap-3 rounded-lg text-xs tracking-widest text-[#CCA761] font-bold uppercase hover:border-[#CCA761]/50 hover:bg-[#CCA761]/15 transition-colors"
                title="Trocar modelo do chat"
              >
                <SlidersHorizontal size={14} />
                <span className="flex flex-col items-end">
                  <span>{apiKeyData.provider}</span>
                  <span className="text-[9px] text-gray-500 lowercase opacity-80 mt-0.5 truncate max-w-[150px]">{apiKeyData.model}</span>
                </span>
              </button>

              {isModelSwitcherOpen && (
                <div className="absolute right-0 top-full mt-3 w-[min(92vw,420px)] rounded-2xl border border-[#CCA761]/25 bg-[#080808] shadow-2xl shadow-black/60 z-50 overflow-hidden">
                  <div className="p-4 border-b border-white/10">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#CCA761] font-black">Modelo do chat</p>
                    <p className="mt-1 text-[11px] text-gray-500 normal-case tracking-normal">
                      Troca apenas esta sessao de conversa para testar respostas.
                    </p>
                  </div>

                  <div className="max-h-80 overflow-y-auto p-2 space-y-1">
                    {modelOptions.length === 0 ? (
                      <div className="p-4 text-xs text-gray-500">Nenhum provedor conectado encontrado.</div>
                    ) : (
                      modelOptions.map((option) => {
                        const active = option.provider === apiKeyData.provider && option.model === apiKeyData.model;
                        return (
                          <button
                            key={`${option.provider}:${option.model}`}
                            type="button"
                            onClick={() => selectChatModel(option)}
                            className={`w-full text-left rounded-xl px-3 py-3 border transition-colors ${
                              active
                                ? "border-[#CCA761]/50 bg-[#CCA761]/10"
                                : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-100 truncate">{option.label}</p>
                                <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#CCA761]/80 truncate">
                                  {option.provider} / {option.model}
                                </p>
                                <p className="mt-1 text-[11px] text-gray-500">{option.description}</p>
                              </div>
                              {active && <CheckCircle size={16} className="text-[#CCA761] shrink-0 mt-0.5" />}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="p-3 border-t border-white/10 bg-white/[0.02]">
                    <label className="block text-[9px] uppercase tracking-[0.22em] text-gray-500 font-black mb-2">
                      Modelo customizado
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={customModelInput}
                        onChange={(event) => setCustomModelInput(event.target.value)}
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-gray-200 outline-none focus:border-[#CCA761]/60"
                        placeholder="ex: qwen/qwen3.6-plus"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const model = customModelInput.trim();
                          if (!model || !apiKeyData) return;
                          selectChatModel({ provider: apiKeyData.provider, model });
                        }}
                        disabled={!customModelInput.trim()}
                        className="rounded-xl border border-[#CCA761]/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#CCA761] disabled:opacity-40"
                      >
                        Usar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* FEED DE MENSAGENS */}
        <div className="flex-1 overflow-y-auto hide-scrollbar space-y-6 lg:px-24 md:px-12 px-4 py-8">
          
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-70">
              <Bot size={50} className="text-[#CCA761] mb-5 animate-pulse" />
              <p className={`text-3xl text-white ${cormorant.className}`}>Bem-vindo ao Córtex.</p>
              <p className="text-gray-400 mt-2 text-sm max-w-sm">Tudo o que for decidido e acordado aqui ficará gravado no seu banco de dados institucional.</p>
            </div>
          )}

          {messages.map((msg, idx) => {
            const taskId = msg.kernel?.taskId;
            const taskSnapshot = taskId ? brainTaskSnapshots[taskId] : undefined;
            const relatedTaskIds = getRelatedTaskIds(msg.kernel);

            if (msg.role === "approval" && msg.kernel?.auditLogId && msg.kernel?.awaitingPayload) {
              return (
                <div key={idx} className="flex gap-4 animate-in fade-in slide-in-from-bottom-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30">
                    <ShieldAlert size={16} />
                  </div>
                  <div className="max-w-[85%]">
                    <ApprovalCard
                      auditLogId={msg.kernel.auditLogId}
                      awaitingPayload={msg.kernel.awaitingPayload as AwaitingPayload}
                      onDecided={(decision) => {
                        if (taskId) {
                          void loadBrainTask(taskId);
                        }

                        if (isConversationModeRef.current) {
                          const confirmMsg = decision === 'approved' 
                            ? "Excelente! Aprovado. Executando agora mesmo, Doutor!" 
                            : "Entendido. Ação cancelada conforme solicitado.";
                          playMessage(confirmMsg, `decide_${idx}`);
                        }
                      }}
                    />

                    {taskId && (taskSnapshot ? <MissionStatusCard snapshot={taskSnapshot} /> : <MissionPendingCard />)}
                    {relatedTaskIds.map((relatedTaskId) => {
                      const relatedSnapshot = brainTaskSnapshots[relatedTaskId];
                      return relatedSnapshot
                        ? <MissionStatusCard key={relatedTaskId} snapshot={relatedSnapshot} />
                        : <MissionPendingCard key={relatedTaskId} />;
                    })}
                  </div>
                </div>
              );
            }

            return (
              <div key={idx} className={`flex gap-4 animate-in fade-in slide-in-from-bottom-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-white/10 text-white'
                    : msg.role === 'model'
                    ? 'bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30 shadow-[0_0_15px_rgba(204,167,97,0.2)]'
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  {msg.role === 'user' ? <User size={16} /> : msg.role === 'model' ? <Bot size={16} /> : <AlertCircle size={16} />}
                </div>
                <div className={`p-4 rounded-2xl max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap relative group/msg ${
                  msg.role === 'user'
                    ? 'bg-white/10 text-gray-200 rounded-tr-sm'
                    : msg.role === 'model'
                    ? 'bg-[#111] text-gray-300 rounded-tl-sm border border-white/5'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}>
                  <ReactMarkdown
                    components={{
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer"
                           className="text-yellow-400 underline hover:text-yellow-300">
                          {children}
                        </a>
                      )
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>

                  {taskId && (taskSnapshot ? <MissionStatusCard snapshot={taskSnapshot} /> : <MissionPendingCard />)}
                  {relatedTaskIds.map((relatedTaskId) => {
                    const relatedSnapshot = brainTaskSnapshots[relatedTaskId];
                    return relatedSnapshot
                      ? <MissionStatusCard key={relatedTaskId} snapshot={relatedSnapshot} />
                      : <MissionPendingCard key={relatedTaskId} />;
                  })}
                    
                  {msg.role === 'model' && (
                    <button
                      onClick={() => playMessage(msg.content, msg.id || idx)}
                      className={`absolute -right-10 top-2 p-2 rounded-full transition-all ${
                        playingMessageId === (msg.id || idx) 
                          ? 'bg-[#CCA761] text-black scale-110' 
                          : 'bg-white/5 text-gray-500 hover:text-[#CCA761] opacity-0 group-hover/msg:opacity-100'
                      }`}
                      title="Ouvir Resposta"
                    >
                      {playingMessageId === (msg.id || idx) ? <Square size={14} fill="currentColor" /> : <Volume2 size={14} />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-4 animate-pulse">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30">
                <Loader2 size={16} className="animate-spin" />
              </div>
              <div className="bg-[#111] text-gray-400 p-4 rounded-2xl text-xs rounded-tl-sm border border-white/5">
                MAYUS está analisando...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* CONTROLES E INPUT CENTRAL */}
        <div className="p-4 lg:px-24 md:px-12 bg-gradient-to-t from-black via-black/80 to-transparent">
          <form 
            id="chat-form"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }} 
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <input
                data-testid="mayus-chat-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isConversationMode ? "Ouvindo... Pode falar." : "Sua instrução para a IA..."}
                className={`w-full bg-gray-50 dark:bg-[#141414] border rounded-2xl pl-6 pr-14 py-4 focus:outline-none transition-all text-sm text-gray-200 shadow-xl ${
                  isConversationMode 
                    ? 'border-[#CCA761]/40 shadow-[#CCA761]/5' 
                    : 'border-white/10 focus:border-[#CCA761]/50'
                }`}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={toggleRecording}
                disabled={isLoading}
                className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all ${
                  isRecording 
                    ? 'bg-[#CCA761] text-black animate-pulse shadow-[0_0_15px_rgba(204,167,97,0.4)]' 
                    : playingMessageId 
                    ? 'bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30'
                    : 'text-gray-500 hover:text-[#CCA761]'
                }`}
                title={isRecording ? "Ouvindo..." : playingMessageId ? "IA Falando" : "Ditar Mensagem"}
              >
                {playingMessageId ? <Volume2 size={18} className="animate-pulse" /> : <Mic size={18} />}
              </button>
            </div>
            <button
              data-testid="mayus-send-button"
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`bg-transparent hover:bg-[#CCA761]/10 border border-[#CCA761]/30 hover:border-[#CCA761] disabled:border-gray-800 disabled:text-gray-600 text-[#CCA761] px-6 rounded-2xl flex items-center justify-center transition-all active:scale-95 disabled:hover:bg-transparent ${
                isConversationMode ? 'hidden sm:flex' : 'flex'
              }`}
            >
              <Send size={18} />
            </button>
          </form>
          <div className="text-center mt-3 flex items-center justify-center gap-2">
             {isConversationMode && <span className="w-1.5 h-1.5 rounded-full bg-[#CCA761] animate-ping" />}
             <p className="text-[10px] text-gray-600 font-medium lowercase tracking-widest">
               {isConversationMode ? 'Modo conversa ativo • kernel em escuta' : 'As sessões e decisões do kernel no ambiente logado são auditáveis.'}
             </p>
          </div>
        </div>

      </main>
    </div>
  );
}
