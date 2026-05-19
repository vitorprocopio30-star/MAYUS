"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import {
  Bot, Shield, ShieldCheck, ShieldOff, Layers, Users,
  ChevronRight, AlertTriangle, Loader2, RefreshCw, Zap,
  BrainCircuit, CalendarClock, PlayCircle,
} from "lucide-react";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300","400","500","600","700"] });
const cormorant  = Cormorant_Garamond({ subsets: ["latin"], weight: ["400","500","600","700"], style: ["italic"] });

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentSkill {
  id: string;
  name: string;
  description: string | null;
  risk_level: string;
  is_active: boolean;
  allowed_roles: string[];
  allowed_channels: string[];
  schema_version: string;
  requires_human_confirmation: boolean;
  created_at: string;
}

type AgenticReadinessReport = {
  overallScore: number;
  status: "ready" | "warning" | "blocked";
  nextBestAction: string | null;
  modules: Array<{
    id: string;
    label: string;
    status: "ready" | "warning" | "blocked";
    score: number;
    summary: string;
    nextAction: string | null;
  }>;
};

type AgenticRoutineSummary = {
  id: string;
  label?: string;
  module?: string;
  enabled?: boolean;
  paused?: boolean;
  status?: "ready" | "paused" | "blocked" | "dry_run" | "created" | "awaiting_approval" | "skipped";
  reason?: string | null;
  nextAction?: string | null;
  lastResult?: {
    status?: string;
    reason?: string | null;
    taskId?: string | null;
    approvalId?: string | null;
  } | null;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ["admin", "administrador", "socio", "mayus_admin"];

function normalizeRole(role: string | undefined) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const RISK_STYLES: Record<string, string> = {
  critical: "text-red-400 border-red-500/40 bg-red-500/10",
  high:     "text-orange-400 border-orange-500/40 bg-orange-500/10",
  medium:   "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
  low:      "text-green-400 border-green-500/40 bg-green-500/10",
};

// ─── Toggle Switch ────────────────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  loading,
  id,
}: {
  checked: boolean;
  onChange: () => void;
  loading: boolean;
  id: string;
}) {
  return (
    <button
      id={id}
      onClick={onChange}
      disabled={loading}
      role="switch"
      aria-checked={checked}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
        checked ? "bg-[#CCA761]" : "bg-gray-700"
      } ${loading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      {loading ? (
        <Loader2 size={12} className="absolute left-1/2 -translate-x-1/2 animate-spin text-white" />
      ) : (
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`} />
      )}
    </button>
  );
}

// ─── Skill Card ───────────────────────────────────────────────────────────────

function SkillCard({
  skill,
  onToggle,
  toggling,
}: {
  skill: AgentSkill;
  onToggle: (id: string, current: boolean) => void;
  toggling: string | null;
}) {
  const riskStyle = RISK_STYLES[skill.risk_level] ?? RISK_STYLES.medium;
  const isToggling = toggling === skill.id;

  return (
    <div className={`relative bg-white dark:bg-[#0d0d0d] border rounded-2xl p-5 transition-all duration-200 ${
      skill.is_active
        ? "border-[#CCA761]/20 shadow-[0_0_20px_rgba(204,167,97,0.04)]"
        : "border-white/5 opacity-55"
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
            skill.is_active ? "bg-[#CCA761]/15 text-[#CCA761]" : "bg-white/5 text-gray-600"
          }`}>
            <Bot size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="text-white font-semibold text-sm truncate">{skill.name}</h3>
            <p className="text-gray-500 text-xs mt-0.5 line-clamp-2 leading-relaxed">
              {skill.description ?? "Sem descrição definida."}
            </p>
          </div>
        </div>
        <ToggleSwitch
          id={`toggle-skill-${skill.id}`}
          checked={skill.is_active}
          onChange={() => onToggle(skill.id, skill.is_active)}
          loading={isToggling}
        />
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-white/5">
        {/* Risk */}
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${riskStyle}`}>
          {skill.risk_level}
        </span>

        {/* Human confirmation */}
        {skill.requires_human_confirmation && (
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border text-violet-400 border-violet-500/40 bg-violet-500/10 flex items-center gap-1">
            <Shield size={9} /> aprovação humana
          </span>
        )}

        {/* Schema version */}
        <span className="text-[10px] text-gray-600 px-2 py-0.5 rounded-full border border-white/5">
          v{skill.schema_version}
        </span>

        {/* Roles */}
        {(skill.allowed_roles ?? []).length > 0 ? (
          skill.allowed_roles.map(role => (
            <span key={role} className="text-[10px] text-gray-500 px-2 py-0.5 rounded-full border border-white/5 flex items-center gap-1">
              <Users size={9} /> {role}
            </span>
          ))
        ) : (
          <span className="text-[10px] text-gray-600 px-2 py-0.5 rounded-full border border-white/5 flex items-center gap-1">
            <Users size={9} /> todos os perfis
          </span>
        )}

        {/* Channels */}
        {(skill.allowed_channels ?? []).length > 0 && (
          <span className="text-[10px] text-gray-600 px-2 py-0.5 rounded-full border border-white/5 flex items-center gap-1">
            <Layers size={9} /> {skill.allowed_channels.join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AgentSkillRegistryPage() {
  const [skills,   setSkills]   = useState<AgentSkill[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);
  const [readiness, setReadiness] = useState<AgenticReadinessReport | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [routines, setRoutines] = useState<AgenticRoutineSummary[]>([]);
  const [routinesLoading, setRoutinesLoading] = useState(false);
  const [runningRoutine, setRunningRoutine] = useState<string | null>(null);

  const router = useRouter();
  const { role, isLoading: profileLoading } = useUserProfile();

  // Redirect se não tiver permissão
  useEffect(() => {
    if (!profileLoading) {
      if (!ALLOWED_ROLES.includes(normalizeRole(role))) {
        router.replace("/dashboard");
      }
    }
  }, [role, profileLoading, router]);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/agent/skills");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao buscar skills.");
      setSkills(data.skills ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchReadiness = useCallback(async () => {
    setReadinessLoading(true);
    try {
      const res = await fetch("/api/setup/doctor", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Erro ao buscar prontidao agentica.");
      setReadiness(data?.report?.agenticReadiness ?? null);
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel carregar a prontidao agentica.");
    } finally {
      setReadinessLoading(false);
    }
  }, []);

  const fetchRoutines = useCallback(async () => {
    setRoutinesLoading(true);
    try {
      const res = await fetch("/api/agent/routines", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Erro ao buscar rotinas agenticas.");
      setRoutines(data?.routines ?? []);
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel carregar rotinas agenticas.");
    } finally {
      setRoutinesLoading(false);
    }
  }, []);

  // Fetch inicial — só roda quando o perfil está carregado e tem permissão
  useEffect(() => {
    if (profileLoading) return;
    if (!ALLOWED_ROLES.includes(normalizeRole(role))) return;
    fetchSkills();
    fetchReadiness();
    fetchRoutines();
  }, [role, profileLoading, fetchSkills, fetchReadiness, fetchRoutines]);

  const handleToggle = async (skillId: string, currentIsActive: boolean) => {
    setToggling(skillId);

    // Optimistic update
    setSkills(prev => prev.map(s =>
      s.id === skillId ? { ...s, is_active: !currentIsActive } : s
    ));

    try {
      const res = await fetch("/api/agent/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId, isActive: !currentIsActive }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Rollback
        setSkills(prev => prev.map(s =>
          s.id === skillId ? { ...s, is_active: currentIsActive } : s
        ));
        toast.error(data.error ?? "Falha ao atualizar skill.");
      } else {
        toast.success(
          !currentIsActive
            ? `"${data.skill?.name}" ativada.`
            : `"${data.skill?.name}" desativada.`
        );
      }
    } catch {
      // Rollback
      setSkills(prev => prev.map(s =>
        s.id === skillId ? { ...s, is_active: currentIsActive } : s
      ));
      toast.error("Erro de rede ao atualizar skill.");
    } finally {
      setToggling(null);
    }
  };

  const handleRunRoutine = async (routineId: string) => {
    setRunningRoutine(routineId);
    try {
      const res = await fetch("/api/agent/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routineId, dryRun: true }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Falha ao simular rotina.");
      toast.success("Rotina agentica analisada em dry-run.");
      await fetchRoutines();
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel acionar rotina agentica.");
    } finally {
      setRunningRoutine(null);
    }
  };

  // Loading inicial
  if (profileLoading || (loading && skills.length === 0 && !error)) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-[#CCA761]" />
      </div>
    );
  }

  const activeCount = skills.filter(s => s.is_active).length;

  return (
    <div className={`p-6 max-w-4xl mx-auto ${montserrat.className}`}>

      {/* Breadcrumb + título */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 text-[#CCA761]/50 text-[10px] uppercase tracking-widest mb-3">
            <span>Configurações</span>
            <ChevronRight size={10} />
            <span className="text-[#CCA761]">Agente</span>
          </div>
          <h1 className={`text-3xl text-white mb-1 ${cormorant.className}`}>Skill Registry</h1>
          <p className="text-gray-500 text-sm">
            Gerencie as capacidades autônomas do MAYUS para este escritório.
          </p>
        </div>
        <button
          onClick={() => {
            fetchSkills();
            fetchReadiness();
            fetchRoutines();
          }}
          disabled={loading || readinessLoading || routinesLoading}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-[#CCA761] transition-colors border border-white/10 hover:border-[#CCA761]/30 rounded-xl px-3 py-2"
        >
          <RefreshCw size={13} className={loading || readinessLoading || routinesLoading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: "Total de Skills", value: skills.length,               icon: <Zap size={16} className="text-[#CCA761]/70" /> },
          { label: "Ativas",          value: activeCount,                 icon: <ShieldCheck size={16} className="text-emerald-400" /> },
          { label: "Inativas",        value: skills.length - activeCount, icon: <ShieldOff size={16} className="text-gray-600" /> },
        ].map(stat => (
          <div key={stat.label} className="bg-white dark:bg-[#0d0d0d] border border-white/5 rounded-xl p-4 flex items-center gap-3">
            {stat.icon}
            <div>
              <p className="text-white font-bold text-xl leading-none">{stat.value}</p>
              <p className="text-gray-600 text-[10px] uppercase tracking-widest mt-1">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {readiness && (
        <section data-testid="agentic-readiness-panel" className="border border-white/10 rounded-2xl bg-white dark:bg-[#0d0d0d] p-5 mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <BrainCircuit size={16} className="text-[#CCA761]" />
                <span className="text-[10px] font-black uppercase tracking-widest text-[#CCA761]">Operating Partner Beta</span>
                <span data-testid="agentic-readiness-score" className="text-white font-black">{readiness.overallScore}%</span>
              </div>
              <p className="text-gray-500 text-xs mt-2 leading-relaxed">
                Prontidao do MAYUS como escritorio juridico AI First supervisionado.
              </p>
              {readiness.nextBestAction && (
                <p data-testid="agentic-next-best-action" className="text-[#CCA761] text-[10px] font-bold uppercase tracking-wider leading-relaxed mt-2">
                  {readiness.nextBestAction}
                </p>
              )}
            </div>
            <span className={`w-fit rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${
              readiness.status === "ready"
                ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                : readiness.status === "blocked"
                  ? "text-red-400 border-red-500/30 bg-red-500/10"
                  : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
            }`}>
              {readiness.status}
            </span>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
            {readiness.modules
              .filter((module) => module.status !== "ready")
              .slice(0, 4)
              .map((module) => (
                <div key={module.id} data-testid={`agentic-readiness-module-${module.id}`} className="rounded-xl border border-white/5 bg-black/10 p-3 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 truncate">{module.label}</span>
                    <span className="text-white text-xs font-black">{module.score}%</span>
                  </div>
                  <p className="text-gray-500 text-[10px] leading-relaxed mt-2 line-clamp-2">{module.nextAction || module.summary}</p>
                </div>
              ))}
          </div>
        </section>
      )}

      <section data-testid="agentic-routines-panel" className="border border-white/10 rounded-2xl bg-white dark:bg-[#0d0d0d] p-5 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CalendarClock size={16} className="text-[#CCA761]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#CCA761]">Rotinas agenticas</span>
              <span className="text-white font-black">{routines.length}</span>
            </div>
            <p className="text-gray-500 text-xs mt-2 leading-relaxed">
              Heartbeats internos do Operating Partner para organizar trabalho sem executar acoes externas.
            </p>
          </div>
          {routinesLoading && <Loader2 size={16} className="animate-spin text-[#CCA761]" />}
        </div>

        <div className="grid gap-2 mt-4">
          {routines.length === 0 && !routinesLoading && (
            <div className="rounded-xl border border-white/5 bg-black/10 p-3 text-gray-500 text-xs">
              Nenhuma rotina agentica ativa ainda. O MAYUS pode simular rotinas recomendadas sem gravar nada.
            </div>
          )}
          {routines.slice(0, 5).map((routine) => {
            const routineStatus = routine.status || (routine.paused ? "paused" : routine.enabled === false ? "skipped" : "ready");
            const blocked = routineStatus === "blocked";
            const loadingRoutine = runningRoutine === routine.id;

            return (
              <div
                key={routine.id}
                data-testid={`agentic-routine-row-${routine.id}`}
                className="rounded-xl border border-white/5 bg-black/10 p-3 flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-white text-sm font-semibold truncate">{routine.label || routine.id}</span>
                    <span
                      data-testid="agentic-routine-status"
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                        blocked
                          ? "text-red-400 border-red-500/30 bg-red-500/10"
                          : routineStatus === "awaiting_approval"
                            ? "text-violet-400 border-violet-500/30 bg-violet-500/10"
                            : routineStatus === "created" || routineStatus === "ready"
                              ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                              : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                      }`}
                    >
                      {routineStatus}
                    </span>
                    {routine.module && (
                      <span className="text-[9px] text-gray-600 uppercase tracking-widest">{routine.module}</span>
                    )}
                  </div>
                  <p className="text-gray-500 text-[10px] leading-relaxed mt-1 line-clamp-2">
                    {routine.lastResult?.reason || routine.reason || routine.nextAction || "Pronta para dry-run supervisionado."}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="agentic-routine-run"
                  disabled={loadingRoutine}
                  onClick={() => handleRunRoutine(routine.id)}
                  className="w-fit shrink-0 flex items-center gap-2 text-[10px] text-gray-400 hover:text-[#CCA761] transition-colors border border-white/10 hover:border-[#CCA761]/30 rounded-xl px-3 py-2 disabled:opacity-50"
                >
                  {loadingRoutine ? <Loader2 size={12} className="animate-spin" /> : <PlayCircle size={12} />}
                  Dry-run
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Erro */}
      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-red-400 text-sm">
          <AlertTriangle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && skills.length === 0 && !error && (
        <div className="text-center py-20 opacity-50">
          <Bot size={48} className="text-[#CCA761] mx-auto mb-4" />
          <p className={`text-2xl text-white mb-2 ${cormorant.className}`}>Nenhuma skill configurada</p>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            Skills são registradas via migration ou pela equipe de desenvolvimento.
          </p>
        </div>
      )}

      {/* Lista de skills */}
      {skills.length > 0 && (
        <div className="space-y-3">
          {skills.map(skill => (
            <SkillCard
              key={skill.id}
              skill={skill}
              onToggle={handleToggle}
              toggling={toggling}
            />
          ))}
        </div>
      )}

    </div>
  );
}
