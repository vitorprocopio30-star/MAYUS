"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import {
  Brain, Plus, Pencil, Trash2, ChevronRight, Loader2,
  Check, X, ToggleLeft, ToggleRight, AlertTriangle, RefreshCw,
} from "lucide-react";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300","400","500","600","700"] });
const cormorant  = Cormorant_Garamond({ subsets: ["latin"], weight: ["400","500","600","700"], style: ["italic"] });

const ALLOWED_ROLES = ["admin", "socio", "Administrador", "Sócio"];

interface MemoryEntry {
  id: string;
  category: string;
  key: string;
  value: string;
  enforced: boolean;
  created_at: string;
}

interface MemoryProposal {
  id: string;
  category: string;
  key: string;
  value: string;
  source: string;
  sourceLabel: string;
  confidence: number;
  createdAt: string | null;
  evidence?: unknown;
}

interface MemoryCorrectionEvent {
  id: string;
  eventType: string;
  status: string;
  sourceModule: string;
  targetModule: string;
  correctionKind: string;
  riskLevel: string;
  recommendedAction: string;
  reason: string;
  externalSideEffectsBlocked: boolean;
  createdAt: string | null;
}

interface MemoryCorrectionSummary {
  total: number;
  attempted: number;
  corrected: number;
  requiresApproval: number;
  blocked: number;
  failed: number;
  notAvailable: number;
  recent: MemoryCorrectionEvent[];
}

interface EntryForm { key: string; value: string; category: string; }
const EMPTY_FORM: EntryForm = { key: "", value: "", category: "" };
const EMPTY_CORRECTION_SUMMARY: MemoryCorrectionSummary = {
  total: 0,
  attempted: 0,
  corrected: 0,
  requiresApproval: 0,
  blocked: 0,
  failed: 0,
  notAvailable: 0,
  recent: [],
};

const CATEGORY_SUGGESTIONS = ["honorarios", "prazos", "regras_gerais", "clientes", "contratos", "atendimento"];

function getEvidenceEvents(evidence: unknown) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return [];
  const record = evidence as Record<string, unknown>;
  const events = Array.isArray(record.evidence_events) ? record.evidence_events : [];
  return events
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const event = item as Record<string, unknown>;
      return {
        id: typeof event.id === "string" ? event.id : "",
        eventType: typeof event.event_type === "string" ? event.event_type : "",
        createdAt: typeof event.created_at === "string" ? event.created_at : null,
      };
    })
    .filter((item): item is { id: string; eventType: string; createdAt: string | null } => Boolean(item?.id || item?.eventType))
    .slice(0, 5);
}

function getCorrectionSuggestion(evidence: unknown) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return null;
  const record = evidence as Record<string, unknown>;
  const correctionKind = typeof record.correction_kind === "string" ? record.correction_kind : "";
  const recommendedAction = typeof record.recommended_action === "string" ? record.recommended_action : "";
  return correctionKind || recommendedAction ? { correctionKind, recommendedAction } : null;
}

export default function MemoriaPage() {
  const [entries,  setEntries]  = useState<MemoryEntry[]>([]);
  const [proposals, setProposals] = useState<MemoryProposal[]>([]);
  const [correctionSummary, setCorrectionSummary] = useState<MemoryCorrectionSummary>(EMPTY_CORRECTION_SUMMARY);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState<EntryForm>(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [decidingProposal, setDecidingProposal] = useState<string | null>(null);
  const [runningReview, setRunningReview] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const router = useRouter();
  const { role, isLoading: profileLoading } = useUserProfile();

  // Redirect se não autorizado
  useEffect(() => {
    if (!profileLoading) {
      if (!role || !ALLOWED_ROLES.includes(role)) {
        router.replace("/dashboard");
      }
    }
  }, [role, profileLoading, router]);

  const fetchEntries = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res  = await fetch("/api/agent/memory");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao buscar memória.");
      setEntries(data.entries ?? []);
      setProposals(data.proposals ?? []);
      setCorrectionSummary(data.correctionSummary ?? EMPTY_CORRECTION_SUMMARY);
    } catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (profileLoading) return;
    if (!role || !ALLOWED_ROLES.includes(role)) return;
    fetchEntries();
  }, [role, profileLoading, fetchEntries]);

  const handleSave = async () => {
    if (!form.key.trim() || !form.value.trim() || !form.category.trim()) {
      toast.error("Preencha todos os campos.");
      return;
    }
    setSaving(true);
    try {
      const isEdit = !!editId;
      const res = await fetch("/api/agent/memory", {
        method:  isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(isEdit ? { entryId: editId, ...form } : form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao salvar."); return; }

      if (isEdit) {
        setEntries(prev => prev.map(e => e.id === editId ? { ...e, ...data.entry } : e));
        toast.success("Entrada atualizada.");
      } else {
        setEntries(prev => [data.entry, ...prev]);
        toast.success("Entrada criada.");
      }
      setShowForm(false); setForm(EMPTY_FORM); setEditId(null);
    } catch { toast.error("Erro de rede."); }
    finally { setSaving(false); }
  };

  const handleToggle = async (entry: MemoryEntry) => {
    setToggling(entry.id);
    // Optimistic update
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, enforced: !e.enforced } : e));
    try {
      const res = await fetch("/api/agent/memory", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ entryId: entry.id, enforced: !entry.enforced }),
      });
      if (!res.ok) {
        // Rollback
        setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, enforced: entry.enforced } : e));
        toast.error("Falha ao atualizar.");
      }
    } catch {
      // Rollback
      setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, enforced: entry.enforced } : e));
      toast.error("Erro de rede.");
    } finally { setToggling(null); }
  };

  const handleProposalDecision = async (proposal: MemoryProposal, action: "approve" | "reject") => {
    setDecidingProposal(proposal.id);
    try {
      const res = await fetch("/api/agent/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id, action }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Falha ao revisar proposta."); return; }

      setProposals(prev => prev.filter(item => item.id !== proposal.id));
      if (action === "approve" && data.entry) {
        setEntries(prev => [data.entry, ...prev]);
        toast.success("Memoria promovida.");
      } else {
        toast.success("Proposta rejeitada.");
      }
    } catch { toast.error("Erro de rede."); }
    finally { setDecidingProposal(null); }
  };

  const handleRunSelfImprovementReview = async () => {
    setRunningReview(true);
    try {
      const res = await fetch("/api/agent/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routineId: "mayus-self-improvement-review",
          dryRun: false,
          force: true,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Falha ao revisar aprendizado.");

      const result = data?.result;
      if (result?.status === "woken") {
        const created = Number(result?.executionResult?.self_improvement_review?.proposalsCreated ?? 0);
        toast.success(created > 0
          ? `MAYUS criou ${created} proposta${created === 1 ? "" : "s"} de memoria.`
          : "MAYUS revisou os sinais e nao criou novas propostas.");
      } else {
        toast.info(result?.reason || "Revisao agentica registrada.");
      }

      await fetchEntries();
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel revisar aprendizado agora.");
    } finally {
      setRunningReview(false);
    }
  };

  const handleRevoke = async (entry: MemoryEntry) => {
    setRevoking(entry.id);
    try {
      const res = await fetch("/api/agent/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entryId: entry.id,
          action: "revoke",
          reason: "Revogada pelo painel de memoria institucional.",
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Erro ao revogar."); return; }
      setEntries(prev => prev.map(item => item.id === entry.id ? { ...item, ...data.entry } : item));
      toast.success("Memoria revogada com auditoria.");
    } catch { toast.error("Erro de rede."); }
    finally { setRevoking(null); }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/agent/memory?id=${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Erro ao deletar."); return; }
      setEntries(prev => prev.filter(e => e.id !== id));
      toast.success("Entrada removida.");
    } catch { toast.error("Erro de rede."); }
    finally { setDeleting(null); setConfirmDeleteId(null); }
  };

  const startEdit = (entry: MemoryEntry) => {
    setEditId(entry.id);
    setForm({ key: entry.key, value: entry.value, category: entry.category });
    setShowForm(true);
  };

  const cancelForm = () => { setShowForm(false); setForm(EMPTY_FORM); setEditId(null); };

  // Agrupar por categoria
  const grouped = entries.reduce((acc, entry) => {
    const cat = entry.category || "geral";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(entry);
    return acc;
  }, {} as Record<string, MemoryEntry[]>);

  if (profileLoading || (loading && entries.length === 0 && !error)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-[#CCA761]" />
      </div>
    );
  }

  const enforcedCount = entries.filter(e => e.enforced).length;

  return (
    <div className={`p-6 max-w-4xl mx-auto ${montserrat.className}`}>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 text-[#CCA761]/50 text-[10px] uppercase tracking-widest mb-3">
            <span>Configurações</span><ChevronRight size={10} /><span className="text-[#CCA761]">Memória</span>
          </div>
          <h1 className={`text-3xl text-white mb-1 ${cormorant.className}`}>Memória Institucional</h1>
          <p className="text-gray-500 text-sm">Regras e contexto que o MAYUS consulta antes de responder.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRunSelfImprovementReview}
            disabled={runningReview}
            data-testid="memory-self-improvement-review-now"
            className="flex items-center gap-2 text-xs text-sky-200 hover:text-white border border-sky-400/20 hover:border-sky-300/40 rounded-xl px-3 py-2 transition-colors disabled:opacity-50"
          >
            {runningReview ? <Loader2 size={13} className="animate-spin" /> : <Brain size={13} />}
            Revisar agora
          </button>
          <button
            onClick={fetchEntries}
            disabled={loading}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-[#CCA761] border border-white/10 hover:border-[#CCA761]/30 rounded-xl px-3 py-2 transition-colors"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => { cancelForm(); setShowForm(true); }}
            className="flex items-center gap-2 text-xs bg-[#CCA761] hover:bg-[#b89552] text-black font-bold uppercase tracking-widest px-4 py-2 rounded-xl transition-colors active:scale-95"
          >
            <Plus size={14} /> Nova Regra
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total",       value: entries.length },
          { label: "Ativas",      value: enforcedCount },
          { label: "Propostas",   value: proposals.length },
          { label: "Categorias",  value: Object.keys(grouped).length },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-[#0d0d0d] border border-white/5 rounded-xl p-4">
            <p className="text-white font-bold text-xl">{s.value}</p>
            <p className="text-gray-600 text-[10px] uppercase tracking-widest mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Formulário */}
      {showForm && (
        <div className="bg-white dark:bg-[#0d0d0d] border border-[#CCA761]/30 rounded-2xl p-5 mb-6 space-y-4">
          <h2 className={`text-xl text-[#CCA761] ${cormorant.className}`}>
            {editId ? "Editar entrada" : "Nova entrada"}
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1.5">Chave</label>
              <input
                value={form.key}
                onChange={e => setForm(p => ({ ...p, key: e.target.value }))}
                placeholder="ex: honorario_minimo"
                className="w-full bg-gray-200 dark:bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#CCA761]/50"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1.5">Categoria</label>
              <input
                value={form.category}
                onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
                placeholder="ex: honorarios"
                list="category-suggestions"
                className="w-full bg-gray-200 dark:bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#CCA761]/50"
              />
              <datalist id="category-suggestions">
                {CATEGORY_SUGGESTIONS.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-gray-500 uppercase tracking-widest block mb-1.5">Valor / Regra</label>
            <textarea
              value={form.value}
              onChange={e => setForm(p => ({ ...p, value: e.target.value }))}
              placeholder='ex: "R$ 500,00 por hora. Nunca cobrar abaixo disso."'
              rows={3}
              className="w-full bg-gray-200 dark:bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-[#CCA761]/50 resize-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={cancelForm}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white border border-white/10 px-4 py-2 rounded-xl transition-colors"
            >
              <X size={13} /> Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs bg-[#CCA761] hover:bg-[#b89552] text-black font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50 active:scale-95"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              {editId ? "Salvar alterações" : "Criar entrada"}
            </button>
          </div>
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">
          <AlertTriangle size={16} /><span>{error}</span>
        </div>
      )}

      {correctionSummary.total > 0 && (
        <div className="mb-8" data-testid="memory-self-correction-panel">
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-[10px] text-[#CCA761]/60 uppercase tracking-widest font-bold">
              Auto-correcao MAYUS
            </h2>
            <span className="text-[10px] text-gray-600 uppercase tracking-widest">
              {correctionSummary.total} evento{correctionSummary.total === 1 ? "" : "s"}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            {[
              ["Tentadas", correctionSummary.attempted],
              ["Corrigidas", correctionSummary.corrected],
              ["Aprovacao", correctionSummary.requiresApproval],
              ["Bloqueadas", correctionSummary.blocked + correctionSummary.failed],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                data-testid={`memory-correction-${String(label).toLowerCase()}`}
                className="border border-white/10 bg-[#0d0d0d] rounded-xl px-3 py-2"
              >
                <p className="text-[10px] text-gray-600 uppercase tracking-widest">{label}</p>
                <p className="text-lg font-semibold text-gray-200">{value}</p>
              </div>
            ))}
          </div>

          {correctionSummary.recent.length > 0 && (
            <div className="space-y-2">
              {correctionSummary.recent.slice(0, 4).map((event) => (
                <div key={event.id} className="bg-[#0d0d0d] border border-white/10 rounded-xl px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-[10px] text-sky-300 border border-sky-400/20 bg-sky-400/10 rounded-full px-2 py-0.5 uppercase tracking-widest">
                      {event.status}
                    </span>
                    <span className="text-xs font-semibold text-gray-200">
                      {event.correctionKind || event.eventType}
                    </span>
                    {event.externalSideEffectsBlocked && (
                      <span className="text-[10px] text-amber-300 border border-amber-400/20 bg-amber-400/10 rounded-full px-2 py-0.5 uppercase tracking-widest">
                        Sem efeito externo
                      </span>
                    )}
                  </div>
                  {(event.recommendedAction || event.reason) && (
                    <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
                      {event.recommendedAction || event.reason}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-700 mt-2 uppercase tracking-widest">
                    {event.targetModule || event.sourceModule || "mayus"}{event.createdAt ? ` - ${new Date(event.createdAt).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {proposals.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2 px-1">
            <h2 className="text-[10px] text-[#CCA761]/60 uppercase tracking-widest font-bold">
              Propostas supervisionadas
            </h2>
            <span className="text-[10px] text-gray-600 uppercase tracking-widest">
              <span data-testid="memory-proposals-count">{proposals.length}</span> pendente{proposals.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="space-y-2">
            {proposals.map(proposal => (
              <div
                key={proposal.id}
                data-testid={`memory-proposal-${proposal.id}`}
                className="bg-[#0d0d0d] border border-[#CCA761]/20 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="text-xs font-semibold text-gray-200 truncate">{proposal.key}</p>
                    <span className="text-[10px] text-[#CCA761] border border-[#CCA761]/20 rounded-full px-2 py-0.5">
                      {proposal.category}
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {Math.round(proposal.confidence * 100)}% confianca
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{proposal.value}</p>
                  <p className="text-[10px] text-gray-600 mt-2 uppercase tracking-widest">
                    Fonte: {proposal.sourceLabel || proposal.source}
                  </p>
                  {proposal.source === "self_improvement_loop" && (
                    <div className="mt-2 space-y-1">
                      <span className="inline-flex text-[10px] text-emerald-300 border border-emerald-400/20 bg-emerald-400/10 rounded-full px-2 py-0.5 uppercase tracking-widest">
                        Detectado pelo MAYUS
                      </span>
                      {getCorrectionSuggestion(proposal.evidence) && (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex w-fit text-[10px] text-sky-300 border border-sky-400/20 bg-sky-400/10 rounded-full px-2 py-0.5 uppercase tracking-widest">
                            Correcao sugerida pelo MAYUS
                          </span>
                          {getCorrectionSuggestion(proposal.evidence)?.recommendedAction && (
                            <p className="text-[10px] text-gray-500 leading-relaxed">
                              {getCorrectionSuggestion(proposal.evidence)?.recommendedAction}
                            </p>
                          )}
                        </div>
                      )}
                      {getEvidenceEvents(proposal.evidence).length > 0 && (
                        <div className="text-[10px] text-gray-600 leading-relaxed">
                          {getEvidenceEvents(proposal.evidence).map((event) => (
                            <div key={`${event.id}:${event.eventType}`}>
                              Evidencia: {event.eventType || "learning_event"} {event.id ? `#${event.id}` : ""}{event.createdAt ? ` - ${new Date(event.createdAt).toLocaleDateString("pt-BR")}` : ""}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => handleProposalDecision(proposal, "reject")}
                    disabled={!!decidingProposal}
                    data-testid={`memory-proposal-reject-${proposal.id}`}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-white border border-white/10 px-3 py-2 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {decidingProposal === proposal.id ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                    Rejeitar
                  </button>
                  <button
                    onClick={() => handleProposalDecision(proposal, "approve")}
                    disabled={!!decidingProposal}
                    data-testid={`memory-proposal-approve-${proposal.id}`}
                    className="flex items-center gap-1.5 text-xs bg-[#CCA761] hover:bg-[#b89552] text-black font-bold px-3 py-2 rounded-xl transition-colors disabled:opacity-50"
                  >
                    {decidingProposal === proposal.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                    Promover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && proposals.length === 0 && !error && (
        <div className="text-center py-20 opacity-50">
          <Brain size={48} className="text-[#CCA761] mx-auto mb-4" />
          <p className={`text-2xl text-white mb-2 ${cormorant.className}`}>Memória vazia</p>
          <p className="text-gray-500 text-sm">Adicione regras para que o MAYUS conheça o seu escritório.</p>
        </div>
      )}

      {/* Lista agrupada por categoria */}
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="mb-6">
          <h3 className="text-[10px] text-[#CCA761]/60 uppercase tracking-widest font-bold mb-2 px-1">
            {category}
          </h3>
          <div className="space-y-2">
            {items.map(entry => (
              <div
                key={entry.id}
                data-testid={`memory-entry-${entry.id}`}
                className={`bg-white dark:bg-[#0d0d0d] border rounded-xl px-4 py-3 flex items-start gap-3 transition-all ${
                  entry.enforced ? "border-white/10" : "border-white/5 opacity-50"
                }`}
              >
                {/* Toggle enforced */}
                <button
                  onClick={() => handleToggle(entry)}
                  disabled={!!toggling}
                  title={entry.enforced ? "Desativar" : "Ativar"}
                  className="mt-0.5 text-gray-500 hover:text-[#CCA761] transition-colors shrink-0"
                >
                  {toggling === entry.id
                    ? <Loader2 size={16} className="animate-spin" />
                    : entry.enforced
                    ? <ToggleRight size={20} className="text-[#CCA761]" />
                    : <ToggleLeft size={20} />
                  }
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-300 truncate">{entry.key}</p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{entry.value}</p>
                </div>

                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(entry)}
                    className="p-1.5 text-gray-600 hover:text-[#CCA761] transition-colors rounded-lg hover:bg-white/5"
                    title="Editar entrada"
                  >
                    <Pencil size={13} />
                  </button>

                  {entry.enforced && (
                    <button
                      onClick={() => handleRevoke(entry)}
                      disabled={!!revoking}
                      className="p-1.5 text-gray-600 hover:text-amber-300 transition-colors rounded-lg hover:bg-white/5 disabled:opacity-50"
                      title="Revogar com auditoria"
                    >
                      {revoking === entry.id ? <Loader2 size={13} className="animate-spin" /> : <AlertTriangle size={13} />}
                    </button>
                  )}

                  {confirmDeleteId === entry.id ? (
                    <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 rounded-lg px-2">
                      <span className="text-[10px] text-red-500 uppercase tracking-widest font-bold px-1 select-none">Excluir?</span>
                      <button onClick={() => handleDelete(entry.id)} disabled={deleting === entry.id} className="p-1.5 text-red-400 hover:text-white transition-colors" title="Confirmar">
                        {deleting === entry.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)} disabled={deleting === entry.id} className="p-1.5 text-gray-500 hover:text-white transition-colors" title="Cancelar">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(entry.id)}
                      className="p-1.5 text-gray-600 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5"
                      title="Excluir entrada"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
