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
import type { BrainInboxResponse } from "@/lib/brain/inbox-types";

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
  internalAgent?: {
    id: string;
    label: string;
    role: string;
    owner: string;
  };
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

type AgentControlPlaneAgent = {
  id: string;
  label: string;
  role: string;
  module: string;
  owner: string;
  enabled: boolean;
  autonomyMode: string;
  allowedSurfaces: string[];
  budgetPolicy: {
    label: string;
    paidExternalActions: string;
    maxAutomaticCostCents: number;
  };
  health: {
    status: "ready" | "needs_setup" | "blocked" | "degraded" | "disabled";
    reason: string;
    lastActivityAt: string | null;
    nextAction: string;
  };
  routines: {
    total: number;
    enabled: number;
    blocked: number;
    awaitingApproval: number;
  };
  approvalsPending: number;
  blockersCount: number;
  memoryLifecycle: {
    applied: number;
    pendingProposals: number;
    suggestedSkills: number;
    revocations: number;
  };
  activity?: {
    latestMission: {
      id: string;
      status: string | null;
      goal: string | null;
      lastUpdatedAt: string | null;
      nextSafeAction: string | null;
    } | null;
    pendingApproval: {
      id: string;
      riskLevel: string | null;
      skillName: string | null;
      createdAt: string | null;
    } | null;
    latestArtifact: {
      id: string;
      title: string | null;
      artifactType: string | null;
      createdAt: string | null;
    } | null;
    latestEvent: {
      id: string;
      eventType: string | null;
      createdAt: string | null;
    } | null;
    latestBlocker: string | null;
  };
  openclaw?: {
    outcome: string | null;
    surface: string | null;
    source: string | null;
    reason: string | null;
    blockedLayer: string | null;
    appliedLayersCount: number;
    precedence: string[];
  };
  hermes?: {
    status: string | null;
    latestMemoryId: string | null;
    lifecycleStatus: string | null;
    lifecycleKind: string | null;
    lastEventSummary: string | null;
  };
  coordination?: {
    workstreamId: string;
    workstreamLabel: string;
    workstreamOwner: string;
    handoffRequired: boolean;
    coordinatedNextStep: string;
    collisionBlockers: string[];
  };
};

type AgentControlPlaneSummary = {
  totalAgents: number;
  enabledAgents: number;
  readyAgents: number;
  blockedAgents: number;
  degradedAgents: number;
  pendingApprovals: number;
  blockers: number;
  nextAction: string;
  policyPrecedence: string[];
  coordination?: {
    status: string;
    workstreams: number;
    collisionBlockers: number;
    nextCoordinatedStep: string;
  };
};

type AgentControlPlaneCoordination = {
  status: string;
  nextCoordinatedStep: string;
  workstreams: Array<{
    id: string;
    label: string;
    owner: string;
    scope: string;
    status: string;
    pendingApprovals: number;
    blockers: number;
    coordinatedNextStep: string;
  }>;
  collisionBlockers: Array<{
    id: string;
    label: string;
    reason: string;
    requiredHandoff: string;
  }>;
};

type AgentControlPlanePublicAgent = {
  id: "paperclip" | "openclaw" | "hermes";
  label: string;
  reusedAs: string;
  matrixMode: "read_only_status";
  owner: string;
  status: "working" | "ready" | "awaiting_approval" | "needs_attention" | "blocked" | "read_only";
  evidence: string[];
  blockers: string[];
  nextAction: string;
  operational?: {
    status: "working" | "ready" | "awaiting_approval" | "needs_attention" | "blocked" | "read_only";
    modulesCovered: string[];
    latestSignalAt: string | null;
    approvals: number;
    blockerCount: number;
    gaps: string[];
    nextAction: string;
  };
  paperclip?: {
    heartbeat: string;
    routines: {
      total: number;
      enabled: number;
      blocked: number;
      awaitingApproval: number;
    };
    approvals: number;
    budget: {
      hardStops: number;
      policyLabels: string[];
    };
    activity: {
      latestMissionAt: string | null;
      activeOwners: string[];
      handoff?: {
        chain: string[];
        latestTenantId: string | null;
        methodologyStatus: string | null;
        legalStatus: string | null;
        agenticStatus: string | null;
        nextAction: string;
      };
    };
    portability: {
      status: "pending_preflight";
      reason: string;
    };
  };
  openclaw?: {
    coverage: "mission_snapshot_policy";
    requiresFullMatrix: false;
    precedence: string[];
    surfaces: string[];
    outcomes: string[];
    blockedLayer: string | null;
    reason: string | null;
    nextModules: string[];
    methodology?: {
      status: string | null;
      activation: string | null;
      requiresHumanReview: boolean;
      reviewReasons: string[];
      blockedLayer: string | null;
      reason: string | null;
    } | null;
  };
  hermes?: {
    source: "mission_snapshots_read_only";
    missionsObserved: number;
    latestStatus: string | null;
    latestMemoryId: string | null;
    lifecycleStatus: string | null;
    lastEventSummary: string | null;
    tenantLearning?: {
      scope: "tenant_only";
      signalsObserved: number;
      latestTenantId: string | null;
      latestMethodologyStatus: string | null;
      latestActivation: string | null;
      lastReviewReason: string | null;
    };
  };
};

type MissionControlSummary = NonNullable<BrainInboxResponse["mission_control_snapshots"]>[number];

// ─── Constantes ───────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ["admin", "administrador", "socio", "mayus_admin"];

function normalizeRole(role: string | undefined) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function asAgentRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function agentText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const RISK_STYLES: Record<string, string> = {
  critical: "text-red-400 border-red-500/40 bg-red-500/10",
  high:     "text-orange-400 border-orange-500/40 bg-orange-500/10",
  medium:   "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
  low:      "text-green-400 border-green-500/40 bg-green-500/10",
};

const AGENT_HEALTH_STYLES: Record<AgentControlPlaneAgent["health"]["status"], string> = {
  ready: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  needs_setup: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  degraded: "text-violet-400 border-violet-500/30 bg-violet-500/10",
  blocked: "text-red-400 border-red-500/30 bg-red-500/10",
  disabled: "text-gray-500 border-white/10 bg-white/5",
};

const PUBLIC_AGENT_STATUS_STYLES: Record<AgentControlPlanePublicAgent["status"], string> = {
  working: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  ready: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  awaiting_approval: "text-orange-300 border-orange-500/30 bg-orange-500/10",
  needs_attention: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
  blocked: "text-red-400 border-red-500/30 bg-red-500/10",
  read_only: "text-sky-300 border-sky-500/30 bg-sky-500/10",
};

type AgentHealthFilter = "all" | AgentControlPlaneAgent["health"]["status"];

const AGENT_HEALTH_FILTERS: Array<{ id: AgentHealthFilter; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "ready", label: "Ready" },
  { id: "blocked", label: "Bloqueados" },
  { id: "degraded", label: "Degraded" },
  { id: "needs_setup", label: "Setup" },
  { id: "disabled", label: "Off" },
];

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
  const [agents, setAgents] = useState<AgentControlPlaneAgent[]>([]);
  const [agentSummary, setAgentSummary] = useState<AgentControlPlaneSummary | null>(null);
  const [agentCoordination, setAgentCoordination] = useState<AgentControlPlaneCoordination | null>(null);
  const [publicAgents, setPublicAgents] = useState<AgentControlPlanePublicAgent[]>([]);
  const [routinesLoading, setRoutinesLoading] = useState(false);
  const [runningRoutine, setRunningRoutine] = useState<string | null>(null);
  const [missionControl, setMissionControl] = useState<MissionControlSummary[]>([]);
  const [missionControlLoading, setMissionControlLoading] = useState(false);
  const [agentFilter, setAgentFilter] = useState("all");
  const [agentStatusFilter, setAgentStatusFilter] = useState<AgentHealthFilter>("all");

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
      setAgents(data?.agents ?? data?.control_plane?.agents ?? []);
      setAgentSummary(data?.summary ?? data?.control_plane?.summary ?? null);
      setAgentCoordination(data?.control_plane?.coordination ?? null);
      setPublicAgents(data?.control_plane?.publicAgents ?? data?.publicAgents ?? []);
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel carregar rotinas agenticas.");
    } finally {
      setRoutinesLoading(false);
    }
  }, []);

  const fetchMissionControl = useCallback(async () => {
    setMissionControlLoading(true);
    try {
      const res = await fetch("/api/brain/inbox?include_activity=true&pending_limit=8&recent_limit=4&activity_limit=8&artifact_limit=8&event_limit=8", {
        cache: "no-store",
      });
      const data = await res.json().catch(() => null) as BrainInboxResponse | null;
      if (!res.ok) throw new Error((data as any)?.error ?? "Erro ao buscar controle agentico.");
      setMissionControl(data?.mission_control_snapshots ?? []);
    } catch (err: any) {
      toast.error(err?.message || "Nao foi possivel carregar o controle agentico.");
    } finally {
      setMissionControlLoading(false);
    }
  }, []);

  // Fetch inicial — só roda quando o perfil está carregado e tem permissão
  useEffect(() => {
    if (profileLoading) return;
    if (!ALLOWED_ROLES.includes(normalizeRole(role))) return;
    fetchSkills();
    fetchReadiness();
    fetchRoutines();
    fetchMissionControl();
  }, [role, profileLoading, fetchSkills, fetchReadiness, fetchRoutines, fetchMissionControl]);

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
  const filteredAgents = agents.filter((agent) => {
    const matchesAgent = agentFilter === "all" || agent.id === agentFilter;
    const matchesStatus = agentStatusFilter === "all" || agent.health.status === agentStatusFilter;
    return matchesAgent && matchesStatus;
  });
  const agentStatusCounts = Object.fromEntries(
    AGENT_HEALTH_FILTERS.map((filter) => [
      filter.id,
      filter.id === "all"
        ? agents.length
        : agents.filter((agent) => agent.health.status === filter.id).length,
    ])
  ) as Record<AgentHealthFilter, number>;

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
            fetchMissionControl();
          }}
          disabled={loading || readinessLoading || routinesLoading || missionControlLoading}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-[#CCA761] transition-colors border border-white/10 hover:border-[#CCA761]/30 rounded-xl px-3 py-2"
        >
          <RefreshCw size={13} className={loading || readinessLoading || routinesLoading || missionControlLoading ? "animate-spin" : ""} />
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

      <section data-testid="agent-control-plane-panel" className="border border-white/10 rounded-2xl bg-white dark:bg-[#0d0d0d] p-5 mb-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck size={16} className="text-[#CCA761]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#CCA761]">Agent Control Plane</span>
              <span className="text-white font-black">{agentSummary?.enabledAgents ?? agents.filter((agent) => agent.enabled).length}/{agentSummary?.totalAgents ?? agents.length}</span>
            </div>
            <p className="text-gray-500 text-xs mt-2 leading-relaxed">
              Agentes internos com ownership, budget, policy, memoria, rotinas e trabalho visivel.
            </p>
            {agentSummary?.nextAction && (
              <p data-testid="agent-control-next-action" className="text-[#CCA761] text-[10px] font-bold uppercase tracking-wider leading-relaxed mt-2">
                {agentSummary.nextAction}
              </p>
            )}
            {agentSummary?.coordination?.nextCoordinatedStep && (
              <p data-testid="agent-control-coordinated-next-step" className="text-gray-400 text-[10px] font-semibold uppercase tracking-wider leading-relaxed mt-2">
                {agentSummary.coordination.nextCoordinatedStep}
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center shrink-0">
            <div className="rounded-xl border border-white/5 bg-black/10 px-3 py-2">
              <p className="text-white text-sm font-black">{agentSummary?.readyAgents ?? 0}</p>
              <p className="text-gray-600 text-[8px] uppercase tracking-widest">ready</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/10 px-3 py-2">
              <p className="text-white text-sm font-black">{agentSummary?.pendingApprovals ?? 0}</p>
              <p className="text-gray-600 text-[8px] uppercase tracking-widest">approvals</p>
            </div>
            <div className="rounded-xl border border-white/5 bg-black/10 px-3 py-2">
              <p className="text-white text-sm font-black">{agentSummary?.blockers ?? 0}</p>
              <p className="text-gray-600 text-[8px] uppercase tracking-widest">bloqueios</p>
            </div>
          </div>
        </div>

        {agentCoordination && (
          <div data-testid="agent-control-coordination" className="mt-4 rounded-xl border border-[#CCA761]/20 bg-[#CCA761]/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#CCA761]">Coordenacao das frentes</p>
                <p className="text-gray-500 text-[10px] leading-relaxed mt-1">{agentCoordination.nextCoordinatedStep}</p>
              </div>
              <span className="rounded-full border border-[#CCA761]/30 bg-black/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[#E2C37A]">
                {agentCoordination.status}
              </span>
            </div>
            <div className="grid gap-2 md:grid-cols-2 mt-3">
              {agentCoordination.workstreams.map((workstream) => (
                <div key={workstream.id} data-testid={`agent-workstream-${workstream.id}`} className="rounded-lg border border-white/5 bg-black/10 p-3 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-white text-xs font-black truncate">{workstream.label}</p>
                    <span className="text-[9px] uppercase tracking-widest text-gray-500">{workstream.status}</span>
                  </div>
                  <p className="text-gray-500 text-[10px] leading-relaxed mt-1 line-clamp-2">{workstream.scope}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[9px] uppercase tracking-widest text-gray-500">
                    <span>owner: {workstream.owner}</span>
                    <span>approvals: {workstream.pendingApprovals}</span>
                    <span>bloqueios: {workstream.blockers}</span>
                  </div>
                </div>
              ))}
            </div>
            {agentCoordination.collisionBlockers.length > 0 && (
              <div className="mt-3 space-y-1 text-[10px] leading-relaxed text-gray-400">
                {agentCoordination.collisionBlockers.slice(0, 2).map((blocker) => (
                  <p key={blocker.id}>
                    <span className="font-bold text-[#CCA761]">{blocker.label}:</span> {blocker.requiredHandoff}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {publicAgents.length > 0 && (
          <div data-testid="public-agents-matrix" className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#CCA761]">Public Agents Matrix</p>
                <p className="text-gray-500 text-[10px] leading-relaxed mt-1">
                  Paperclip, OpenClaw e Hermes reaproveitados como primitivas internas.
                </p>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-gray-400">
                read-only
              </span>
            </div>

            <div className="grid gap-3 mt-3 lg:grid-cols-3">
              {publicAgents.map((publicAgent) => {
                const statusStyle = PUBLIC_AGENT_STATUS_STYLES[publicAgent.status] ?? PUBLIC_AGENT_STATUS_STYLES.needs_attention;
                return (
                  <div
                    key={publicAgent.id}
                    data-testid={`public-agent-${publicAgent.id}`}
                    className="rounded-lg border border-white/5 bg-black/10 p-3 min-w-0"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-white text-xs font-black truncate">{publicAgent.label}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${statusStyle}`}>
                        {publicAgent.status}
                      </span>
                    </div>
                    <p className="text-gray-500 text-[10px] leading-relaxed mt-1 line-clamp-2">{publicAgent.reusedAs}</p>

                    {publicAgent.operational && (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] leading-relaxed text-gray-500">
                        <div className="rounded-lg border border-white/5 bg-black/20 p-2">
                          <p className="text-[8px] uppercase tracking-widest text-gray-600">modulos</p>
                          <p className="mt-1 text-gray-200 line-clamp-2">
                            {publicAgent.operational.modulesCovered.slice(0, 4).join(", ") || "sem cobertura"}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/20 p-2">
                          <p className="text-[8px] uppercase tracking-widest text-gray-600">ultimo sinal</p>
                          <p className="mt-1 text-gray-200 line-clamp-2">
                            {publicAgent.operational.latestSignalAt || "sem sinal"}
                          </p>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/20 p-2">
                          <p className="text-[8px] uppercase tracking-widest text-gray-600">approvals</p>
                          <p className="mt-1 text-gray-200">{publicAgent.operational.approvals}</p>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/20 p-2">
                          <p className="text-[8px] uppercase tracking-widest text-gray-600">bloqueios</p>
                          <p className="mt-1 text-gray-200">{publicAgent.operational.blockerCount}</p>
                        </div>
                        <div className="rounded-lg border border-white/5 bg-black/20 p-2 col-span-2">
                          <p className="text-[8px] uppercase tracking-widest text-gray-600">lacunas</p>
                          <p className="mt-1 text-gray-200 line-clamp-2">
                            {publicAgent.operational.gaps.slice(0, 4).join(", ") || "sem lacuna operacional"}
                          </p>
                        </div>
                      </div>
                    )}

                    {publicAgent.paperclip && (
                      <div className="mt-3 space-y-1 text-[10px] leading-relaxed text-gray-500">
                        <p><span className="text-gray-300">Heartbeat:</span> {publicAgent.paperclip.heartbeat}</p>
                        <p><span className="text-gray-300">Rotinas:</span> {publicAgent.paperclip.routines.enabled}/{publicAgent.paperclip.routines.total} enabled / {publicAgent.paperclip.routines.blocked} blocked</p>
                        <p><span className="text-gray-300">Approvals:</span> {publicAgent.paperclip.approvals} / hard stops {publicAgent.paperclip.budget.hardStops}</p>
                        <p><span className="text-gray-300">Owners:</span> {publicAgent.paperclip.activity.activeOwners.slice(0, 3).join(", ") || "sem dono ativo"}</p>
                        {publicAgent.paperclip.activity.handoff && (
                          <p><span className="text-gray-300">Handoff:</span> {publicAgent.paperclip.activity.handoff.nextAction}</p>
                        )}
                        <p><span className="text-gray-300">Portabilidade:</span> {publicAgent.paperclip.portability.status}</p>
                      </div>
                    )}

                    {publicAgent.openclaw && (
                      <div className="mt-3 space-y-1 text-[10px] leading-relaxed text-gray-500">
                        <p><span className="text-gray-300">Precedencia:</span> {publicAgent.openclaw.precedence.join(" -> ")}</p>
                        <p><span className="text-gray-300">Superficies:</span> {publicAgent.openclaw.surfaces.slice(0, 3).join(", ") || "sem snapshot"}</p>
                        <p><span className="text-gray-300">Outcome:</span> {publicAgent.openclaw.outcomes.join(", ") || "sem policy recente"}</p>
                        <p><span className="text-gray-300">Bloqueio:</span> {publicAgent.openclaw.blockedLayer || "nenhum"}</p>
                        {publicAgent.openclaw.methodology && (
                          <p><span className="text-gray-300">Metodologia:</span> {publicAgent.openclaw.methodology.status || "sem status"} / {publicAgent.openclaw.methodology.activation || "sem ativacao"}</p>
                        )}
                        <p><span className="text-gray-300">Proximos modulos:</span> {publicAgent.openclaw.nextModules.join(", ") || "cobertura atual ok"}</p>
                      </div>
                    )}

                    {publicAgent.hermes && (
                      <div className="mt-3 space-y-1 text-[10px] leading-relaxed text-gray-500">
                        <p><span className="text-gray-300">Fonte:</span> mission snapshots</p>
                        <p><span className="text-gray-300">Missoes:</span> {publicAgent.hermes.missionsObserved}</p>
                        <p><span className="text-gray-300">Status:</span> {publicAgent.hermes.lifecycleStatus || publicAgent.hermes.latestStatus || "sem trajectory"}</p>
                        <p><span className="text-gray-300">Memoria:</span> {publicAgent.hermes.latestMemoryId || "sem memoria recente"}</p>
                        <p><span className="text-gray-300">Evento:</span> {publicAgent.hermes.lastEventSummary || "sem evento recente"}</p>
                        {publicAgent.hermes.tenantLearning && (
                          <p><span className="text-gray-300">Learning:</span> {publicAgent.hermes.tenantLearning.signalsObserved} tenant-only</p>
                        )}
                      </div>
                    )}

                    {publicAgent.blockers.length > 0 && (
                      <p className="mt-3 text-orange-200 text-[10px] leading-relaxed line-clamp-2">
                        {publicAgent.blockers[0]}
                      </p>
                    )}
                    <p className="mt-3 text-[#CCA761] text-[10px] font-bold uppercase tracking-wider leading-relaxed">
                      {publicAgent.operational?.nextAction || publicAgent.nextAction}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-gray-600">Agente</span>
            <button
              type="button"
              onClick={() => setAgentFilter("all")}
              aria-pressed={agentFilter === "all"}
              className={`rounded-xl border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                agentFilter === "all"
                  ? "border-[#CCA761]/60 bg-[#CCA761]/15 text-[#CCA761]"
                  : "border-white/10 bg-black/10 text-gray-500 hover:border-[#CCA761]/30 hover:text-[#CCA761]"
              }`}
            >
              Todos
            </button>
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => setAgentFilter(agent.id)}
                aria-pressed={agentFilter === agent.id}
                data-testid={`agent-filter-${agent.id}`}
                className={`rounded-xl border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  agentFilter === agent.id
                    ? "border-[#CCA761]/60 bg-[#CCA761]/15 text-[#CCA761]"
                    : "border-white/10 bg-black/10 text-gray-500 hover:border-[#CCA761]/30 hover:text-[#CCA761]"
                }`}
              >
                {agent.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-gray-600">Status</span>
            {AGENT_HEALTH_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setAgentStatusFilter(filter.id)}
                aria-pressed={agentStatusFilter === filter.id}
                data-testid={`agent-status-filter-${filter.id}`}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-colors ${
                  agentStatusFilter === filter.id
                    ? "border-[#CCA761]/60 bg-[#CCA761]/15 text-[#CCA761]"
                    : "border-white/10 bg-black/10 text-gray-500 hover:border-[#CCA761]/30 hover:text-[#CCA761]"
                }`}
              >
                {filter.label}
                <span className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5 text-[9px] text-gray-400">
                  {agentStatusCounts[filter.id] || 0}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 mt-4 md:grid-cols-2">
          {filteredAgents.length === 0 && !routinesLoading && (
            <div className="rounded-xl border border-white/5 bg-black/10 p-3 text-gray-500 text-xs md:col-span-2">
              Nenhum agente encontrado para o filtro atual.
            </div>
          )}
          {filteredAgents.map((agent) => {
            const healthStyle = AGENT_HEALTH_STYLES[agent.health.status] ?? AGENT_HEALTH_STYLES.needs_setup;
            const latestMission = agent.activity?.latestMission;
            const pendingApproval = agent.activity?.pendingApproval;
            const latestArtifact = agent.activity?.latestArtifact;
            const latestEvent = agent.activity?.latestEvent;
            const openclawLabel = agent.openclaw?.outcome
              ? `${agent.openclaw.surface || "surface"} / ${agent.openclaw.outcome}`
              : "sem decisao recente";
            const hermesLabel = agent.hermes?.lifecycleStatus || agent.hermes?.status || "sem proposta recente";
            return (
              <div
                key={agent.id}
                data-testid={`agent-control-card-${agent.id}`}
                className="rounded-xl border border-white/5 bg-black/10 p-4 min-w-0"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-white text-sm font-semibold truncate">{agent.label}</span>
                      <span data-testid="agent-health-status" className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${healthStyle}`}>
                        {agent.health.status}
                      </span>
                    </div>
                    <p className="text-gray-500 text-[10px] leading-relaxed mt-1 line-clamp-2">{agent.role}</p>
                  </div>
                  <Bot size={16} className="text-[#CCA761] shrink-0" />
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="rounded-lg border border-white/5 bg-black/10 px-2 py-2">
                    <p className="text-white text-xs font-black">{agent.routines.enabled}/{agent.routines.total}</p>
                    <p className="text-gray-600 text-[8px] uppercase tracking-widest">rotinas</p>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-black/10 px-2 py-2">
                    <p className="text-white text-xs font-black">{agent.approvalsPending}</p>
                    <p className="text-gray-600 text-[8px] uppercase tracking-widest">approval</p>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-black/10 px-2 py-2">
                    <p className="text-white text-xs font-black">{agent.memoryLifecycle.applied}/{agent.memoryLifecycle.pendingProposals}</p>
                    <p className="text-gray-600 text-[8px] uppercase tracking-widest">memoria</p>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-[10px] leading-relaxed">
                  <p className="text-gray-500">
                    <span className="text-gray-300">Owner:</span> {agent.owner}
                  </p>
                  <p className="text-gray-500">
                    <span className="text-gray-300">Budget:</span> {agent.budgetPolicy.label}
                  </p>
                  <p className="text-gray-500">
                    <span className="text-gray-300">Policy:</span> {(agentSummary?.policyPrecedence ?? []).join(" -> ")}
                  </p>
                  <p className="text-gray-500">
                    <span className="text-gray-300">Ultima missao:</span> {latestMission?.goal || latestMission?.id || "sem missao recente"}
                  </p>
                  <p className="text-gray-500">
                    <span className="text-gray-300">Approval:</span> {pendingApproval?.skillName || pendingApproval?.id || "sem pendencia"}
                  </p>
                  <p className="text-gray-500">
                    <span className="text-gray-300">Artifact/evento:</span> {latestArtifact?.id || "sem artifact"} / {latestEvent?.id || "sem evento"}
                  </p>
                  <p className="text-gray-500">
                    <span className="text-gray-300">OpenClaw:</span> {openclawLabel}
                    {agent.openclaw?.blockedLayer ? ` · bloqueio ${agent.openclaw.blockedLayer}` : ""}
                  </p>
                  <p className="text-gray-500">
                    <span className="text-gray-300">Hermes:</span> {hermesLabel}
                    {agent.hermes?.latestMemoryId ? ` · ${agent.hermes.latestMemoryId}` : ""}
                  </p>
                  {agent.activity?.latestBlocker && (
                    <p className="text-orange-200">
                      <span className="text-orange-100">Bloqueio:</span> {agent.activity.latestBlocker}
                    </p>
                  )}
                  <p className="text-[#CCA761] font-bold uppercase tracking-wider">
                    {agent.health.nextAction}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section data-testid="agentic-mission-control-panel" className="border border-white/10 rounded-2xl bg-white dark:bg-[#0d0d0d] p-5 mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <BrainCircuit size={16} className="text-[#CCA761]" />
              <span className="text-[10px] font-black uppercase tracking-widest text-[#CCA761]">Controle agentico</span>
              <span className="text-white font-black">{missionControl.length}</span>
            </div>
            <p className="text-gray-500 text-xs mt-2 leading-relaxed">
              Missoes vivas com policy OpenClaw, trajectory Hermes, rotinas Paperclip e approvals pendentes.
            </p>
          </div>
          {missionControlLoading && <Loader2 size={16} className="animate-spin text-[#CCA761]" />}
        </div>

        <div className="grid gap-2 mt-4">
          {missionControl.length === 0 && !missionControlLoading && (
            <div className="rounded-xl border border-white/5 bg-black/10 p-3 text-gray-500 text-xs">
              Nenhuma missao agentica recente reconstruida pelo Brain.
            </div>
          )}
          {missionControl.slice(0, 3).map((mission) => {
            const policy = mission.policy
              ? `${mission.policy.surface || "surface"} / ${mission.policy.outcome || "policy"}`
              : "policy nao registrada";
            const legalMission = mission.legalOperatorMission;
            const legalSafeNextAction = asAgentRecord(legalMission?.currentState?.safeNextAction);
            const legalAction = agentText(legalSafeNextAction?.label)
              || agentText(legalSafeNextAction?.action)
              || null;
            const legalStatus = agentText(legalMission?.currentState?.status) || "ativo";
            const health = mission.blockers.length > 0
              ? `${mission.blockers.length} bloqueio${mission.blockers.length === 1 ? "" : "s"}`
              : mission.pendingApproval
                ? "approval pendente"
                : "sem bloqueio critico";

            return (
              <div key={mission.missionId} className="rounded-xl border border-white/5 bg-black/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-white text-sm font-semibold truncate">{mission.goal || mission.missionId}</span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-gray-400">
                    {mission.status || "ativa"}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <p className="text-gray-500 text-[10px] leading-relaxed">
                    <span className="text-gray-300">Policy:</span> {policy}
                  </p>
                  <p className="text-gray-500 text-[10px] leading-relaxed">
                    <span className="text-gray-300">Health:</span> {health}
                  </p>
                  <p className="text-gray-500 text-[10px] leading-relaxed">
                    <span className="text-gray-300">Proxima:</span> {mission.nextSafeAction || "revisar missao"}
                  </p>
                </div>
                {legalMission && (
                  <div className="mt-3 rounded-lg border border-[#CCA761]/20 bg-[#CCA761]/10 p-3 text-[10px] leading-relaxed">
                    <p className="font-black uppercase tracking-widest text-[#CCA761]">Missao processual Lex</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      <p className="text-gray-300">
                        <span className="text-gray-500">Processo:</span> {legalMission.processLabel || legalMission.processNumber || legalMission.processTaskId || "nao identificado"}
                      </p>
                      <p className="text-gray-300">
                        <span className="text-gray-500">Status:</span> {legalStatus}
                      </p>
                      <p className="text-gray-300">
                        <span className="text-gray-500">Proxima Lex:</span> {legalAction || "revisar contexto"}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

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
                    {routine.internalAgent?.label && (
                      <span className="text-[9px] text-[#CCA761]/70 uppercase tracking-widest">{routine.internalAgent.label}</span>
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
