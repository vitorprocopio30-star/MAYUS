"use client";

import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/pt-br";
import {
  CheckCircle2,
  Clock3,
  Cpu,
  FileText,
  Loader2,
  Link2,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/useUserProfile";
import { isBrainExecutiveRole } from "@/lib/brain/roles";
import type { BrainInboxApprovalItem, BrainInboxArtifactItem, BrainInboxEventItem, BrainInboxResponse, BrainInboxTaskItem } from "@/lib/brain/inbox-types";

dayjs.extend(relativeTime);
dayjs.locale("pt-br");

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

function isLegalDraftApproval(approval: BrainInboxApprovalItem) {
  return approval.awaiting_payload?.skillName === "legal_first_draft_generate";
}

function LegalDraftApprovalDetails({ approval }: { approval: BrainInboxApprovalItem }) {
  const payload = approval.awaiting_payload;
  const processLabel = payload?.processLabel || getStringEntity(approval, "process_number") || getStringEntity(approval, "process_task_id");
  const pieceLabel = getStringEntity(approval, "recommended_piece_label") || getStringEntity(approval, "recommended_piece_input");

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

      {payload?.reason && (
        <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 p-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-orange-300">Motivo da aprovacao</p>
          <p className="mt-1 text-sm text-orange-100">{payload.reason}</p>
        </div>
      )}
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

function ArtifactCard({ artifact }: { artifact: BrainInboxArtifactItem }) {
  const contentPreview = typeof artifact.metadata?.reply === "string"
    ? artifact.metadata.reply
    : typeof artifact.metadata?.sign_url === "string"
      ? artifact.metadata.sign_url
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
    default:
      return event.event_type.replaceAll("_", " ");
  }
}

function getEventDescription(event: BrainInboxEventItem) {
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

      {event.step?.title && (
        <p className="text-[10px] uppercase tracking-widest text-gray-500 mt-3">Step: {event.step.title}</p>
      )}
    </div>
  );
}

export default function BrainApprovalsPage() {
  const { role, isLoading: profileLoading } = useUserProfile();
  const [inbox, setInbox] = useState<BrainInboxResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isExecutive = isBrainExecutiveRole(role);

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

  useEffect(() => {
    if (!profileLoading && isExecutive) {
      void loadInbox();
    }
  }, [profileLoading, isExecutive, loadInbox]);

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
          onClick={() => void loadInbox()}
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
              <span className="text-xs uppercase tracking-widest text-gray-500">{inbox?.pending_count ?? 0} aguardando decisao</span>
            </div>

            {inbox?.pending_approvals.length ? (
              <div className="space-y-4">
                {inbox.pending_approvals.map((approval) => (
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
                {inbox?.recent_approvals.length ? (
                  inbox.recent_approvals.map((approval) => (
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
                    Nenhuma decisao recente registrada.
                  </div>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-lg text-white font-semibold">Artifacts recentes</h2>
              <div className="mt-3 space-y-3">
                {inbox?.recent_artifacts.length ? (
                  inbox.recent_artifacts.map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} />)
                ) : (
                  <div className="rounded-xl border border-white/8 bg-[#0f0f0f] p-4 text-sm text-gray-400">
                    Nenhum artifact recente registrado.
                  </div>
                )}
              </div>
            </div>

            <div>
              <h2 className="text-lg text-white font-semibold">Feed canônico do cérebro</h2>
              <div className="mt-3 space-y-3">
                {inbox?.recent_events.length ? (
                  inbox.recent_events.map((event) => <EventCard key={event.id} event={event} />)
                ) : (
                  <div className="rounded-xl border border-white/8 bg-[#0f0f0f] p-4 text-sm text-gray-400">
                    Nenhum learning event recente registrado.
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
