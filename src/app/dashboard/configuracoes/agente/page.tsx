"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import {
  Bot, Shield, ShieldCheck, ShieldOff, Layers, Users,
  ChevronRight, AlertTriangle, Loader2, RefreshCw, Zap,
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

// ─── Constantes ───────────────────────────────────────────────────────────────

const ALLOWED_ROLES = ["admin", "socio", "Administrador", "Sócio"];

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

  const router = useRouter();
  const { role, isLoading: profileLoading } = useUserProfile();

  // Redirect se não tiver permissão
  useEffect(() => {
    if (!profileLoading) {
      if (!role || !ALLOWED_ROLES.includes(role)) {
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

  // Fetch inicial — só roda quando o perfil está carregado e tem permissão
  useEffect(() => {
    if (profileLoading) return;
    if (!role || !ALLOWED_ROLES.includes(role)) return;
    fetchSkills();
  }, [role, profileLoading, fetchSkills]);

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
          onClick={fetchSkills}
          disabled={loading}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-[#CCA761] transition-colors border border-white/10 hover:border-[#CCA761]/30 rounded-xl px-3 py-2"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
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
