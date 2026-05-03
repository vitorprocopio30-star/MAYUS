"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { Cormorant_Garamond } from "next/font/google";
import { 
  Settings2, Trophy, Save, Building2, Users, Palette, Zap, Bot, 
  ChevronRight, LayoutDashboard, Loader2, Scale, Target, Trash2, 
  BrainCircuit, MessageSquare, Cpu, Globe, Eye, EyeOff, Link2, 
  FileCheck, CreditCard, AlertTriangle, ShieldCheck, X, Webhook, Copy, RefreshCw, FlaskConical,
  Clock, CalendarDays, Mail, Smartphone
} from "lucide-react";
import { useGamification } from "@/hooks/useGamification";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { fetchSafeIntegrations, type SafeTenantIntegration } from "@/lib/integrations/fetch-safe-integrations";
import { saveTenantIntegration } from "@/lib/integrations/save-integration";
import { useUserProfile } from "@/hooks/useUserProfile";
import { ZapSignService } from "@/lib/services/zapsign";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });

// ─── Tipos ────────────────────────────────────────────────────────────────────
type OfficeGoal = {
  id: string;
  name: string;
  value: number | string;
  unit: string;
  departmentId: string;
  source: 'manual' | 'vendas' | 'leads' | 'agendamentos' | 'processos';
  currentValue?: number | string;
};

interface IntegrationDef {
  id: string;
  label: string;
  tagline: string;
  icon: React.ComponentType<any>;
  iconBg: string;
  iconColor: string;
  accentColor: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  category: "finance" | "signature" | "ai" | "comm";
}

type SetupDoctorStatus = "ok" | "fixed" | "warning" | "blocked";

type SetupDoctorCheck = {
  id: string;
  category: string;
  status: SetupDoctorStatus;
  title: string;
  detail: string;
  autoFixable: boolean;
  fixed?: boolean;
  nextAction?: string | null;
};

type SetupDoctorReport = {
  ready: boolean;
  autoFixApplied: boolean;
  readinessScore?: number;
  readinessLevel?: "ready" | "almost_ready" | "needs_setup" | "blocked";
  recommendedAction?: {
    id: string;
    category: string;
    title: string;
    detail: string;
    action: string;
    sourceCheckId: string;
    requiresHumanAction: boolean;
  };
  summary: Record<SetupDoctorStatus, number>;
  checks: SetupDoctorCheck[];
  brainTrace?: {
    taskId: string;
    runId: string;
    stepId: string;
    artifactId: string | null;
    eventType: string;
  } | null;
};

// ─── Catálogo de Provedores Premium ───────────────────────────────────────────
type TenantBetaWorkMode = {
  taskId: string | null;
  artifactId: string | null;
  readinessScore: number;
  readinessLevel: "ready" | "almost_ready" | "needs_setup" | "blocked";
  workQueue: Array<{
    id: string;
    title: string;
    detail: string;
    priority: "high" | "medium" | "low";
    requiresApproval: boolean;
    status?: "queued" | "awaiting_approval" | "executing" | "completed";
    stepId?: string | null;
  }>;
};

type TenantBetaExecutionSummary = {
  finalStatus: "executing" | "awaiting_approval" | "completed" | "idle";
  summary: string;
  executions: Array<{
    stepId: string;
    stepKey: string;
    title: string;
    summary: string;
  }>;
};

type SalesConsultationProfile = {
  ideal_client: string;
  core_solution: string;
  unique_value_proposition: string;
  value_pillars: string[];
  positioning_summary: string;
  status: "draft" | "validated";
};

type DailyPlaybookPreferences = {
  enabled: boolean;
  timezone: string;
  deliveryTime: string;
  weekdays: number[];
  channels: Array<"whatsapp" | "email" | "mayus_panel">;
  scope: "executive" | "growth" | "legal" | "full";
  detailLevel: "short" | "standard" | "deep";
  authorizedPhones: string[];
};

const EMPTY_SALES_PROFILE: SalesConsultationProfile = {
  ideal_client: "",
  core_solution: "",
  unique_value_proposition: "",
  value_pillars: ["", "", ""],
  positioning_summary: "",
  status: "draft",
};

const DEFAULT_DAILY_PLAYBOOK: DailyPlaybookPreferences = {
  enabled: false,
  timezone: "America/Sao_Paulo",
  deliveryTime: "08:00",
  weekdays: [1, 2, 3, 4, 5],
  channels: ["mayus_panel"],
  scope: "full",
  detailLevel: "standard",
  authorizedPhones: [],
};

function normalizeSalesProfile(value: any): SalesConsultationProfile {
  if (!value || typeof value !== "object") return EMPTY_SALES_PROFILE;

  const pillars = Array.isArray(value.value_pillars)
    ? value.value_pillars.map((item: unknown) => String(item || "").trim()).slice(0, 3)
    : [];

  return {
    ideal_client: String(value.ideal_client || "").trim(),
    core_solution: String(value.core_solution || "").trim(),
    unique_value_proposition: String(value.unique_value_proposition || "").trim(),
    value_pillars: [...pillars, "", "", ""].slice(0, 3),
    positioning_summary: String(value.positioning_summary || "").trim(),
    status: value.status === "validated" ? "validated" : "draft",
  };
}

function normalizeDailyPlaybookPreferences(value: any): DailyPlaybookPreferences {
  const channels = Array.isArray(value?.channels)
    ? value.channels.filter((channel: unknown): channel is DailyPlaybookPreferences["channels"][number] => ["whatsapp", "email", "mayus_panel"].includes(String(channel)))
    : DEFAULT_DAILY_PLAYBOOK.channels;
  const weekdays: number[] = Array.isArray(value?.weekdays)
    ? Array.from(new Set<number>(value.weekdays.filter((day: unknown): day is number => typeof day === "number" && Number.isInteger(day) && day >= 0 && day <= 6)))
    : DEFAULT_DAILY_PLAYBOOK.weekdays;
  const deliveryTime = typeof value?.deliveryTime === "string"
    ? value.deliveryTime
    : typeof value?.delivery_time === "string"
      ? value.delivery_time
      : DEFAULT_DAILY_PLAYBOOK.deliveryTime;
  const detailLevel = ["short", "standard", "deep"].includes(String(value?.detailLevel || value?.detail_level))
    ? String(value?.detailLevel || value?.detail_level) as DailyPlaybookPreferences["detailLevel"]
    : DEFAULT_DAILY_PLAYBOOK.detailLevel;
  const scope = ["executive", "growth", "legal", "full"].includes(String(value?.scope))
    ? String(value.scope) as DailyPlaybookPreferences["scope"]
    : DEFAULT_DAILY_PLAYBOOK.scope;
  const authorizedPhones = Array.isArray(value?.authorizedPhones)
    ? value.authorizedPhones.map(normalizeAuthorizedPhone).filter(Boolean).slice(0, 10)
    : Array.isArray(value?.authorized_phones)
      ? value.authorized_phones.map(normalizeAuthorizedPhone).filter(Boolean).slice(0, 10)
      : DEFAULT_DAILY_PLAYBOOK.authorizedPhones;

  return {
    enabled: value?.enabled === true,
    timezone: typeof value?.timezone === "string" && value.timezone.trim() ? value.timezone.trim() : DEFAULT_DAILY_PLAYBOOK.timezone,
    deliveryTime: /^\d{1,2}:[0-5]\d$/.test(deliveryTime) ? deliveryTime.padStart(5, "0") : DEFAULT_DAILY_PLAYBOOK.deliveryTime,
    weekdays: weekdays.length > 0 ? weekdays : DEFAULT_DAILY_PLAYBOOK.weekdays,
    channels: channels.length > 0 ? channels : DEFAULT_DAILY_PLAYBOOK.channels,
    scope,
    detailLevel,
    authorizedPhones,
  };
}

function normalizeAuthorizedPhone(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith("55")) return digits.slice(0, 13);
  return digits.slice(0, 13);
}

function parseAuthorizedPhonesInput(value: string) {
  return value
    .split(/\n|,|;/)
    .map((phone) => normalizeAuthorizedPhone(phone))
    .filter(Boolean)
    .slice(0, 10);
}

const CATALOG: IntegrationDef[] = [
  {
    id: "openai",
    label: "OpenAI (GPT-4o)",
    tagline: "Dê vida ao MAYUS com o cérebro neural da OpenAI. Análise de casos e automação de respostas.",
    icon: BrainCircuit,
    iconBg: "bg-[#00a67e]/20",
    iconColor: "text-[#4ade80]",
    accentColor: "#00a67e",
    apiKeyLabel: "Chave de API OpenAI",
    apiKeyPlaceholder: "sk-...",
    category: "ai",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    tagline: "Inteligência multimodal do Google. Alta velocidade e precisão para triagem de leads.",
    icon: Zap,
    iconBg: "bg-[#4285F4]/20",
    iconColor: "text-[#4285F4]",
    accentColor: "#4285F4",
    apiKeyLabel: "Chave de API Gemini",
    apiKeyPlaceholder: "AIza...",
    category: "ai",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    tagline: "O poder do Claude 3.5 Sonnet. Raciocínio avançado e escrita excepcional para o jurídico.",
    icon: ShieldCheck,
    iconBg: "bg-[#D97757]/20",
    iconColor: "text-[#D97757]",
    accentColor: "#D97757",
    apiKeyLabel: "Chave de API Anthropic",
    apiKeyPlaceholder: "sk-ant-...",
    category: "ai",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    tagline: "Acesso unificado a dezenas de modelos de IA em um só lugar. Flexibilidade total.",
    icon: Cpu,
    iconBg: "bg-[#7c3aed]/20",
    iconColor: "text-[#a78bfa]",
    accentColor: "#7c3aed",
    apiKeyLabel: "Chave de API OpenRouter",
    apiKeyPlaceholder: "sk-or-v1-...",
    category: "ai",
  },
  {
    id: "evolution",
    label: "Evolution API",
    tagline: "Integração profissional com WhatsApp. Gerencie instâncias e fluxos de mensagens.",
    icon: MessageSquare,
    iconBg: "bg-[#25d366]/20",
    iconColor: "text-[#4ade80]",
    accentColor: "#25d366",
    apiKeyLabel: "API Key / Global Token",
    apiKeyPlaceholder: "Token da sua instância...",
    category: "comm",
  },
  {
    id: "meta_cloud",
    label: "WhatsApp Cloud",
    tagline: "Conexão oficial via API da Meta. Estabilidade máxima para grandes volumes.",
    icon: Globe,
    iconBg: "bg-[#0668E1]/20",
    iconColor: "text-[#60a5fa]",
    accentColor: "#0668E1",
    apiKeyLabel: "Token de Acesso Permanente",
    apiKeyPlaceholder: "EAA...",
    category: "comm",
  },
  {
    id: "asaas",
    label: "Asaas Finanças",
    tagline: "Sincronize cobranças e pagamentos. Dados financeiros alimentam seu BI automaticamente.",
    icon: CreditCard,
    iconBg: "bg-[#4ade80]/20",
    iconColor: "text-[#4ade80]",
    accentColor: "#4ade80",
    apiKeyLabel: "Token de API do Asaas",
    apiKeyPlaceholder: "$aact_...",
    category: "finance",
  },
  {
    id: "zapsign",
    label: "ZapSign Contratos",
    tagline: "Assinatura digital de documentos. Monitore conversão de contratos (CTR) em tempo real.",
    icon: FileCheck,
    iconBg: "bg-[#818cf8]/20",
    iconColor: "text-[#818cf8]",
    accentColor: "#818cf8",
    apiKeyLabel: "Token de API do ZapSign",
    apiKeyPlaceholder: "zs_live_...",
    category: "signature",
  },
];

// ─── Componentes Auxiliares ───────────────────────────────────────────────────

function StatusBadge({ isConnected }: { isConnected: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border ${
      isConnected 
        ? "bg-[#4ade80]/10 border-[#4ade80]/20 text-[#4ade80]" 
        : "bg-white/5 border-white/10 text-gray-500"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-[#4ade80] animate-pulse" : "bg-gray-600"}`} />
      {isConnected ? "Conectado" : "Desconectado"}
    </span>
  );
}

function IntegrationCard({ 
  def, 
  currentKey, 
  isConnected, 
  webhookUrl,
  onSave 
}: { 
  def: IntegrationDef; 
  currentKey: string; 
  isConnected: boolean;
  webhookUrl: string;
  onSave: (provider: string, key: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [tempKey, setTempKey] = useState(currentKey);

  useEffect(() => {
    setTempKey(currentKey);
  }, [currentKey]);

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("Webhook copiado!");
  };

  return (
    <div className={`group relative bg-[#0c0c0c] border rounded-2xl transition-all duration-300 overflow-hidden ${
      isExpanded ? "border-[#CCA761]/30 shadow-[0_0_40px_rgba(204,167,97,0.05)]" : "border-white/5 hover:border-white/10"
    }`}>
      {/* Glow de fundo */}
      {isConnected && (
        <div className="absolute top-0 right-0 w-32 h-32 blur-3xl pointer-events-none opacity-20" style={{ background: def.accentColor }} />
      )}

      {/* Header */}
      <div className="flex items-center gap-4 p-5">
        <div className={`w-11 h-11 ${def.iconBg} rounded-xl flex items-center justify-center border border-white/5 shrink-0`}>
          <def.icon size={20} className={def.iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-0.5">
            <h3 className="text-sm font-bold text-white uppercase tracking-tight">{def.label}</h3>
            <StatusBadge isConnected={isConnected} />
          </div>
          <p className="text-[10px] text-gray-500 leading-tight truncate">{def.tagline}</p>
        </div>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className={`p-2 rounded-lg border transition-all ${isExpanded ? "bg-white/10 border-white/20 text-white" : "border-transparent text-gray-700 hover:text-gray-400"}`}
        >
          {isExpanded ? <X size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* Expandido */}
      {isExpanded && (
        <div className="px-5 pb-5 pt-2 border-t border-white/5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 ml-1">{def.apiKeyLabel}</label>
            <div className="relative">
              <input 
                type={showKey ? "text" : "password"} 
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                placeholder={def.apiKeyPlaceholder}
                className="w-full bg-gray-200 dark:bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white focus:border-[#CCA761] outline-none transition-all pr-12"
              />
              <button 
                onClick={() => setShowKey(!showKey)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-white"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 ml-1 flex items-center gap-2">
              <Webhook size={10} /> Endpoint de Webhook (Destino)
            </label>
            <div className="flex items-center gap-2 bg-white dark:bg-[#050505] border border-white/5 rounded-xl px-3 py-2.5">
              <code className="text-[10px] text-[#CCA761] font-mono flex-1 truncate">{webhookUrl}</code>
              <button onClick={copyWebhook} className="text-gray-600 hover:text-white transition-colors">
                <Copy size={13} />
              </button>
            </div>
            <p className="text-[9px] text-gray-600 italic">🔒 Conexão protegida por token JWT exclusivo do servidor.</p>
          </div>

          <div className="flex justify-end pt-2">
            <button 
              onClick={() => {
                onSave(def.id, tempKey);
                setIsExpanded(false);
              }}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-[#CCA761] to-[#f1d58d] text-black text-[10px] font-black uppercase tracking-widest rounded-lg transition-transform hover:scale-105 active:scale-95"
            >
              <Save size={14} /> Salvar Chave
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

function SetupDoctorPanel({
  report,
  beta,
  betaSummary,
  isLoading,
  isFixing,
  isStartingBeta,
  isExecutingBetaStep,
  isExecutingBetaQueue,
  onRefresh,
  onAutofix,
  onStartBeta,
  onExecuteNextBetaStep,
  onExecuteSafeBetaQueue,
}: {
  report: SetupDoctorReport | null;
  beta: TenantBetaWorkMode | null;
  betaSummary: TenantBetaExecutionSummary | null;
  isLoading: boolean;
  isFixing: boolean;
  isStartingBeta: boolean;
  isExecutingBetaStep: boolean;
  isExecutingBetaQueue: boolean;
  onRefresh: () => void;
  onAutofix: () => void;
  onStartBeta: () => void;
  onExecuteNextBetaStep: () => void;
  onExecuteSafeBetaQueue: () => void;
}) {
  const blocked = report?.summary.blocked || 0;
  const warnings = report?.summary.warning || 0;
  const fixed = report?.summary.fixed || 0;
  const ok = report?.summary.ok || 0;
  const hasFixableIssues = report?.checks.some((item) => item.autoFixable && item.status !== "ok") || false;
  const statusTone = report?.ready
    ? "border-[#4ade80]/20 bg-[#0d1a0d]"
    : blocked > 0
      ? "border-red-500/20 bg-[#1a0d0d]"
      : "border-[#CCA761]/25 bg-[#15120a]";

  const statusMeta: Record<SetupDoctorStatus, { label: string; className: string; icon: React.ComponentType<any> }> = {
    ok: { label: "OK", className: "text-[#4ade80] bg-[#4ade80]/10 border-[#4ade80]/20", icon: ShieldCheck },
    fixed: { label: "Corrigido", className: "text-[#CCA761] bg-[#CCA761]/10 border-[#CCA761]/20", icon: Save },
    warning: { label: "Aviso", className: "text-amber-300 bg-amber-400/10 border-amber-400/20", icon: AlertTriangle },
    blocked: { label: "Bloqueio", className: "text-red-300 bg-red-400/10 border-red-400/20", icon: AlertTriangle },
  };

  return (
    <section className={`border rounded-3xl p-6 sm:p-7 mb-10 transition-colors ${statusTone}`}>
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
        <div className="flex gap-4 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#CCA761]/10 border border-[#CCA761]/20 flex items-center justify-center shrink-0">
            <FlaskConical size={22} className="text-[#CCA761]" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-2">
              <h2 className="text-sm font-black uppercase tracking-[0.25em] text-[#CCA761]">Setup Doctor</h2>
              {report && (
                <span className={`px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${
                  report.ready
                    ? "text-[#4ade80] border-[#4ade80]/20 bg-[#4ade80]/10"
                    : "text-amber-300 border-amber-400/20 bg-amber-400/10"
                }`}>
                  {report.ready ? "Pronto" : "Precisa atencao"}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 leading-relaxed max-w-2xl">
              Diagnostico vivo do tenant: CRM, skills, credenciais essenciais e trilha de auditoria.
            </p>
            {report?.brainTrace?.taskId && (
              <Link
                href="/dashboard/mayus"
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#CCA761]/25 bg-[#CCA761]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#CCA761] hover:bg-[#CCA761]/15"
              >
                <BrainCircuit size={12} />
                Artifact registrado no MAYUS
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading || isFixing || isStartingBeta}
            className="h-10 px-4 rounded-xl border border-white/10 bg-white/80 dark:bg-black/20 text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-2 disabled:opacity-50"
            title="Atualizar diagnostico"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={onAutofix}
            disabled={isLoading || isFixing || isStartingBeta || !hasFixableIssues}
            className="h-10 px-4 rounded-xl bg-[#CCA761] text-black text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-40"
            title="Corrigir defaults seguros"
          >
            {isFixing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Corrigir
          </button>
          <button
            type="button"
            onClick={onStartBeta}
            disabled={isLoading || isFixing || isStartingBeta}
            className="h-10 px-4 rounded-xl border border-[#4ade80]/25 bg-[#4ade80]/10 text-[#4ade80] text-[10px] font-black uppercase tracking-widest flex items-center gap-2 disabled:opacity-40"
            title="Iniciar beta supervisionado"
          >
            {isStartingBeta ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />}
            Iniciar Beta
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
        {[
          ["OK", ok, "text-[#4ade80]"],
          ["Corrigidos", fixed, "text-[#CCA761]"],
          ["Avisos", warnings, "text-amber-300"],
          ["Bloqueios", blocked, "text-red-300"],
        ].map(([label, value, color]) => (
          <div key={String(label)} className="border border-white/10 rounded-2xl px-4 py-3 bg-white/70 dark:bg-black/20">
            <div className={`text-xl font-black ${color}`}>{value}</div>
            <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">{label}</div>
          </div>
        ))}
      </div>

      {report?.recommendedAction && (
        <div className="mt-5 grid gap-3 lg:grid-cols-[160px_1fr]">
          <div className="border border-white/10 rounded-2xl px-4 py-4 bg-white/70 dark:bg-black/20">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-500">
              <Target size={12} className="text-[#CCA761]" />
              Prontidao
            </div>
            <div className="mt-2 text-3xl font-black text-white">{report.readinessScore ?? 0}%</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {(report.readinessLevel || "needs_setup").replaceAll("_", " ")}
            </div>
          </div>
          <div className="border border-[#CCA761]/20 rounded-2xl p-4 bg-[#CCA761]/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[#CCA761]/25 bg-[#CCA761]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[#CCA761]">
                Proximo melhor passo
              </span>
              {report.recommendedAction.requiresHumanAction && (
                <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-amber-300">
                  Revisao humana
                </span>
              )}
            </div>
            <div className="mt-3 text-sm font-black uppercase tracking-wider text-white">{report.recommendedAction.title}</div>
            <div className="mt-1 text-[11px] leading-relaxed text-gray-400">{report.recommendedAction.detail}</div>
            <div className="mt-2 text-[11px] leading-relaxed text-[#CCA761] font-bold">{report.recommendedAction.action}</div>
          </div>
        </div>
      )}

      {beta && (
        <div className="mt-5 border border-[#4ade80]/20 rounded-2xl p-4 bg-[#4ade80]/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-[#4ade80]">Modo Beta ativo</div>
              <div className="mt-1 text-sm font-black uppercase tracking-wider text-white">
                Fila operacional criada com {beta.readinessScore}% de prontidao
              </div>
            </div>
            {beta.artifactId && (
              <Link href="/dashboard/mayus" className="inline-flex items-center gap-2 rounded-full border border-[#4ade80]/25 bg-[#4ade80]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#4ade80]">
                <BrainCircuit size={12} />
                Ver no MAYUS
              </Link>
            )}
            <button
              type="button"
              onClick={onExecuteNextBetaStep}
              disabled={isExecutingBetaStep || isExecutingBetaQueue || !beta.workQueue.some((item) => item.status === "queued" || !item.status)}
              className="inline-flex items-center gap-2 rounded-full border border-[#4ade80]/25 bg-[#4ade80]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#4ade80] disabled:opacity-40"
            >
              {isExecutingBetaStep ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
              Executar proximo
            </button>
            <button
              type="button"
              onClick={onExecuteSafeBetaQueue}
              disabled={isExecutingBetaStep || isExecutingBetaQueue || !beta.workQueue.some((item) => item.status === "queued" || !item.status)}
              className="inline-flex items-center gap-2 rounded-full border border-[#CCA761]/25 bg-[#CCA761]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#CCA761] disabled:opacity-40"
            >
              {isExecutingBetaQueue ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
              Executar seguros
            </button>
          </div>
          <div className="mt-4 grid gap-2">
            {beta.workQueue.slice(0, 4).map((item) => (
              <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-white">{item.title}</span>
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-gray-400">{item.priority}</span>
                  {item.status && <span className="rounded-full border border-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-gray-400">{item.status.replaceAll("_", " ")}</span>}
                  {item.requiresApproval && <span className="rounded-full border border-amber-400/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-amber-300">Aprovar</span>}
                </div>
                <div className="mt-1 text-[10px] leading-relaxed text-gray-500">{item.detail}</div>
              </div>
            ))}
          </div>
          {betaSummary && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#4ade80]">Ultima execucao</span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-gray-400">
                  {betaSummary.finalStatus.replaceAll("_", " ")}
                </span>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-gray-400">
                  {betaSummary.executions.length} item{betaSummary.executions.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="mt-2 text-[11px] leading-relaxed text-gray-300">{betaSummary.summary}</div>
              {betaSummary.executions.length > 0 && (
                <div className="mt-3 grid gap-1.5">
                  {betaSummary.executions.slice(0, 5).map((execution) => (
                    <div key={`${execution.stepId}:${execution.stepKey}`} className="rounded-xl border border-white/5 bg-black/20 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-wider text-white">{execution.title}</div>
                      <div className="mt-1 text-[10px] leading-relaxed text-gray-500">{execution.summary}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-5 space-y-2">
        {isLoading && !report ? (
          <div className="flex items-center gap-3 text-xs text-gray-400 py-4">
            <Loader2 size={15} className="animate-spin text-[#CCA761]" />
            Rodando diagnostico...
          </div>
        ) : (
          report?.checks.slice(0, 8).map((item) => {
            const meta = statusMeta[item.status];
            const StatusIcon = meta.icon;
            return (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-start gap-3 border border-white/10 rounded-2xl p-4 bg-white/70 dark:bg-black/20">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-widest w-fit ${meta.className}`}>
                  <StatusIcon size={12} />
                  {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black uppercase tracking-wider text-white">{item.title}</div>
                  <div className="text-[11px] text-gray-500 leading-relaxed mt-1">{item.detail}</div>
                  {item.nextAction && (
                    <div className="text-[10px] text-[#CCA761] leading-relaxed mt-2 font-bold uppercase tracking-wider">{item.nextAction}</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function ConfiguracoesContent() {
  const router = useRouter();
  const { tenantId } = useUserProfile();
  const supabase = createClient();
  const { enabled, toggleGamification } = useGamification();
  
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [draftGamification, setDraftGamification] = useState(enabled);
  const [primaryColor, setPrimaryColor] = useState("#CCA761");
  const [stats, setStats] = useState({ depts: 0, members: 0 });
  const [departments, setDepartments] = useState<any[]>([]);
  const [defaultDeptId, setDefaultDeptId] = useState<string>("");
  const [aiFeatures, setAiFeatures] = useState<any>({});
  
  // Metas Estratégicas
  const [officeGoals, setOfficeGoals] = useState<OfficeGoal[]>([]);
  const [newGoal, setNewGoal] = useState<Partial<OfficeGoal>>({ 
    name: "", value: "", unit: "R$", departmentId: "all", source: "manual", currentValue: ""
  });
  const [customUnit, setCustomUnit] = useState("");
  const [isCustomUnit, setIsCustomUnit] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Integrações
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as 'goals' | 'integrations') || 'goals';
  const [activeTab, setActiveTab] = useState<'goals' | 'integrations'>(initialTab);
  const [integrations, setIntegrations] = useState<SafeTenantIntegration[]>([]);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    openai: "", gemini: "", anthropic: "", openrouter: "",
    evolution: "", meta_cloud: "", asaas: "", zapsign: ""
  });
  const [doctorReport, setDoctorReport] = useState<SetupDoctorReport | null>(null);
  const [betaWorkMode, setBetaWorkMode] = useState<TenantBetaWorkMode | null>(null);
  const [betaExecutionSummary, setBetaExecutionSummary] = useState<TenantBetaExecutionSummary | null>(null);
  const [isDoctorLoading, setIsDoctorLoading] = useState(false);
  const [isDoctorFixing, setIsDoctorFixing] = useState(false);
  const [isStartingBeta, setIsStartingBeta] = useState(false);
  const [isExecutingBetaStep, setIsExecutingBetaStep] = useState(false);
  const [isExecutingBetaQueue, setIsExecutingBetaQueue] = useState(false);
  const [salesProfile, setSalesProfile] = useState<SalesConsultationProfile>(EMPTY_SALES_PROFILE);
  const [dailyPlaybook, setDailyPlaybook] = useState<DailyPlaybookPreferences>(DEFAULT_DAILY_PLAYBOOK);
  const [authorizedPhonesInput, setAuthorizedPhonesInput] = useState("");
  const [isPreviewingPlaybook, setIsPreviewingPlaybook] = useState(false);
  const [playbookPreview, setPlaybookPreview] = useState<string | null>(null);
  const [playbookPreviewHtml, setPlaybookPreviewHtml] = useState<string | null>(null);

  const loadIntegrations = useCallback(async () => {
    if (!tenantId) return;
    try {
      const data = await fetchSafeIntegrations();
      setIntegrations(data);
    } catch (error: any) {
      toast.error(error?.message || "Nao foi possivel carregar as integracoes.");
    }
  }, [tenantId]);

  const loadDoctorReport = useCallback(async () => {
    if (!tenantId) return;
    setIsDoctorLoading(true);
    try {
      const response = await fetch("/api/setup/doctor", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Nao foi possivel carregar o setup doctor.");
      setDoctorReport(payload.report);
    } catch (error: any) {
      toast.error(error?.message || "Nao foi possivel carregar o setup doctor.");
    } finally {
      setIsDoctorLoading(false);
    }
  }, [tenantId]);

  const runDoctorAutofix = useCallback(async () => {
    if (!tenantId) return;
    setIsDoctorFixing(true);
    try {
      const response = await fetch("/api/setup/doctor", { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Nao foi possivel corrigir o setup.");
      setDoctorReport(payload.report);
      if (payload.report?.summary?.blocked > 0) {
        toast.warning("Defaults corrigidos. Ainda existem credenciais externas pendentes.");
      } else {
        toast.success("Setup verificado e corrigido.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Nao foi possivel corrigir o setup.");
    } finally {
      setIsDoctorFixing(false);
    }
  }, [tenantId]);

  const startBetaWorkMode = useCallback(async () => {
    if (!tenantId) return;
    setIsStartingBeta(true);
    try {
      const response = await fetch("/api/setup/beta", { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Nao foi possivel iniciar o beta MAYUS.");
      setDoctorReport(payload.beta?.report || null);
      setBetaWorkMode(payload.beta || null);
      setBetaExecutionSummary(null);
      toast.success("Modo Beta iniciado. O MAYUS criou a fila operacional supervisionada.");
    } catch (error: any) {
      toast.error(error?.message || "Nao foi possivel iniciar o beta MAYUS.");
    } finally {
      setIsStartingBeta(false);
    }
  }, [tenantId]);

  const executeNextBetaStep = useCallback(async () => {
    if (!tenantId || !betaWorkMode?.taskId) return;
    setIsExecutingBetaStep(true);
    try {
      const response = await fetch("/api/setup/beta/execute-next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: betaWorkMode.taskId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Nao foi possivel executar o proximo item beta.");

      if (!payload.execution) {
        toast.info(payload.message || "Nenhum item seguro em fila para executar.");
        return;
      }

      setBetaWorkMode((current) => current ? {
        ...current,
        workQueue: current.workQueue.map((item) => item.stepId === payload.execution.stepId
          ? { ...item, status: "completed" }
          : item),
      } : current);
      setBetaExecutionSummary({
        finalStatus: payload.execution.taskStatus || "executing",
        summary: payload.execution.summary || "Item beta executado.",
        executions: [{
          stepId: String(payload.execution.stepId || ""),
          stepKey: String(payload.execution.stepKey || ""),
          title: String(payload.execution.title || "Item beta"),
          summary: String(payload.execution.summary || "Item beta executado."),
        }],
      });
      if (payload.execution.taskStatus === "awaiting_approval") {
        toast.warning(payload.execution.summary || "Itens seguros executados. O MAYUS aguarda aprovacao humana.");
      } else {
        toast.success(payload.execution.summary || "Item beta executado.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Nao foi possivel executar o proximo item beta.");
    } finally {
      setIsExecutingBetaStep(false);
    }
  }, [tenantId, betaWorkMode?.taskId]);

  const executeSafeBetaQueue = useCallback(async () => {
    if (!tenantId || !betaWorkMode?.taskId) return;
    setIsExecutingBetaQueue(true);
    try {
      const response = await fetch("/api/setup/beta/execute-safe-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: betaWorkMode.taskId, maxSteps: 10 }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Nao foi possivel executar a fila segura beta.");

      const executedStepIds = new Set<string>((payload.result?.executions || []).map((item: any) => String(item.stepId || "")));
      setBetaWorkMode((current) => current ? {
        ...current,
        workQueue: current.workQueue.map((item) => item.stepId && executedStepIds.has(item.stepId)
          ? { ...item, status: "completed" }
          : item),
      } : current);
      setBetaExecutionSummary({
        finalStatus: payload.result?.finalStatus || "idle",
        summary: payload.result?.summary || "Fila segura executada.",
        executions: (payload.result?.executions || []).map((item: any) => ({
          stepId: String(item.stepId || ""),
          stepKey: String(item.stepKey || ""),
          title: String(item.title || "Item beta"),
          summary: String(item.summary || "Item beta executado."),
        })),
      });

      if (payload.result?.finalStatus === "awaiting_approval") {
        toast.warning(payload.result.summary || "Fila segura executada. Restam aprovacoes humanas.");
      } else {
        toast.success(payload.result?.summary || "Fila segura executada.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Nao foi possivel executar a fila segura beta.");
    } finally {
      setIsExecutingBetaQueue(false);
    }
  }, [tenantId, betaWorkMode?.taskId]);

  useEffect(() => {
    if (activeTab === 'integrations') {
      router.replace('/dashboard/configuracoes/integracoes');
    }
  }, [activeTab, router]);

  useEffect(() => {
    setDraftGamification(enabled);
  }, [enabled]);

  useEffect(() => {
    if (!tenantId) return;
    
    const loadData = async () => {
      const { count: deptCount } = await supabase.from('departments').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
      const { count: memberCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
      setStats({ depts: deptCount || 0, members: memberCount || 0 });

      const { data: settings } = await supabase
        .from('tenant_settings')
        .select('branding, ai_features, strategic_goals')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (settings?.branding?.primary_color) setPrimaryColor(settings.branding.primary_color);
      if (settings?.ai_features?.default_department_id) setDefaultDeptId(settings.ai_features.default_department_id);
      if (settings?.ai_features) setAiFeatures(settings.ai_features);
      setSalesProfile(normalizeSalesProfile(settings?.ai_features?.sales_consultation_profile));
      const normalizedPlaybook = normalizeDailyPlaybookPreferences(settings?.ai_features?.daily_playbook);
      setDailyPlaybook(normalizedPlaybook);
      setAuthorizedPhonesInput(normalizedPlaybook.authorizedPhones.join("\n"));
      if (settings?.strategic_goals) setOfficeGoals(settings.strategic_goals);

      const { data: depts } = await supabase.from('departments').select('id, name').eq('tenant_id', tenantId);
      if (depts) setDepartments(depts);
      
      await loadIntegrations();
      await loadDoctorReport();
    };
    loadData();
  }, [tenantId, supabase, loadIntegrations, loadDoctorReport]);

  const handleAddGoal = () => {
    if (!newGoal.name || !newGoal.value) return toast.error("Preencha o nome e o valor da meta.");
    const goal: OfficeGoal = {
      id: Math.random().toString(36).substr(2, 9),
      name: newGoal.name || "",
      value: newGoal.value || 0,
      unit: isCustomUnit ? customUnit : (newGoal.unit || "R$"),
      departmentId: newGoal.departmentId || "all",
      source: newGoal.source || "manual",
      currentValue: newGoal.currentValue || 0
    };
    setOfficeGoals([...officeGoals, goal]);
    setNewGoal({ name: "", value: "", unit: "R$", departmentId: "all", source: "manual", currentValue: "" });
    setHasUnsavedChanges(true);
    toast.success("Meta adicionada!");
  };

  const handleRemoveGoal = (id: string) => {
    setOfficeGoals(officeGoals.filter(g => g.id !== id));
    setHasUnsavedChanges(true);
  };

  const updateApiKeyLocally = (provider: string, key: string) => {
    setApiKeys(prev => ({ ...prev, [provider]: key }));
    setHasUnsavedChanges(true);
  };

  const updateSalesProfile = (field: keyof SalesConsultationProfile, value: string | string[]) => {
    setSalesProfile((prev) => ({ ...prev, [field]: value, status: "draft" }));
    setHasUnsavedChanges(true);
  };

  const updateSalesProfilePillar = (index: number, value: string) => {
    setSalesProfile((prev) => {
      const nextPillars = [...prev.value_pillars];
      nextPillars[index] = value;
      return { ...prev, value_pillars: nextPillars, status: "draft" };
    });
    setHasUnsavedChanges(true);
  };

  const updateDailyPlaybook = (patch: Partial<DailyPlaybookPreferences>) => {
    setDailyPlaybook((prev) => ({ ...prev, ...patch }));
    setHasUnsavedChanges(true);
    setPlaybookPreview(null);
    setPlaybookPreviewHtml(null);
  };

  const updateAuthorizedPhonesInput = (value: string) => {
    setAuthorizedPhonesInput(value);
    updateDailyPlaybook({ authorizedPhones: parseAuthorizedPhonesInput(value) });
  };

  const toggleDailyPlaybookChannel = (channel: DailyPlaybookPreferences["channels"][number]) => {
    setDailyPlaybook((prev) => {
      const hasChannel = prev.channels.includes(channel);
      const nextChannels = hasChannel
        ? prev.channels.filter((item) => item !== channel)
        : [...prev.channels, channel];

      return {
        ...prev,
        channels: nextChannels.length > 0 ? nextChannels : ["mayus_panel"],
      };
    });
    setHasUnsavedChanges(true);
    setPlaybookPreview(null);
    setPlaybookPreviewHtml(null);
  };

  const toggleDailyPlaybookWeekday = (day: number) => {
    setDailyPlaybook((prev) => {
      const nextWeekdays = prev.weekdays.includes(day)
        ? prev.weekdays.filter((item) => item !== day)
        : [...prev.weekdays, day].sort((a, b) => a - b);

      return {
        ...prev,
        weekdays: nextWeekdays.length > 0 ? nextWeekdays : DEFAULT_DAILY_PLAYBOOK.weekdays,
      };
    });
    setHasUnsavedChanges(true);
    setPlaybookPreview(null);
    setPlaybookPreviewHtml(null);
  };

  const previewDailyPlaybook = async () => {
    setIsPreviewingPlaybook(true);
    try {
      const response = await fetch("/api/mayus/daily-playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: dailyPlaybook, persist: false }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) throw new Error(data?.error || "Nao foi possivel gerar a previa.");

      setPlaybookPreview(data?.playbook?.whatsappSummary || data?.playbook?.executiveSummary || "Playbook gerado.");
      setPlaybookPreviewHtml(data?.playbook?.htmlReport || null);
      toast.success("Previa do Playbook gerada sem criar artifact.");
    } catch (error: any) {
      toast.error(error?.message || "Falha ao gerar previa do Playbook.");
    } finally {
      setIsPreviewingPlaybook(false);
    }
  };

  const generateDraftPuv = () => {
    const idealClient = salesProfile.ideal_client.trim() || "clientes que precisam decidir com seguranca";
    const coreSolution = salesProfile.core_solution.trim() || "um caminho juridico claro, com diagnostico e plano de acao";
    const draftPuv = `Ajudamos ${idealClient} a sair da incerteza e tomar a proxima decisao com ${coreSolution}, usando diagnostico consultivo, plano de provas e acompanhamento humano antes de qualquer promessa.`;
    updateSalesProfile("unique_value_proposition", draftPuv);
    toast.success("PUV rascunho criada para validacao.");
  };

  const handleSaveIntegrations = async () => {
    if (!tenantId) return;
    try {
      const providersToSave = Object.entries(apiKeys).filter(([_, key]) => key.length > 0);
      for (const [provider, api_key] of providersToSave) {
        await saveTenantIntegration({
          provider,
          apiKey: api_key,
          status: 'connected',
        });
      }
      toast.success("Integrações salvas!");
      loadIntegrations();
    } catch (err: any) {
      toast.error("Erro ao salvar integrações: " + err.message);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    if (!tenantId) {
      toast.error("Erro: Organização não encontrada.");
      setIsSaving(false);
      return;
    }

    try {
      if (activeTab === 'integrations') await handleSaveIntegrations();
      toggleGamification(draftGamification);
      const normalizedSalesProfile = {
        ...salesProfile,
        value_pillars: salesProfile.value_pillars.map((item) => item.trim()).filter(Boolean).slice(0, 3),
        status: salesProfile.unique_value_proposition.trim() && salesProfile.ideal_client.trim() && salesProfile.core_solution.trim()
          ? salesProfile.status
          : "draft",
        updated_at: new Date().toISOString(),
      };
      const normalizedDailyPlaybook = {
        ...dailyPlaybook,
        authorizedPhones: parseAuthorizedPhonesInput(authorizedPhonesInput),
        updated_at: new Date().toISOString(),
      };
      
      const payload = { 
        tenant_id: tenantId, 
        branding: { primary_color: primaryColor },
        ai_features: { 
          ...aiFeatures, 
          default_department_id: defaultDeptId,
          contract_flow_mode: aiFeatures.contract_flow_mode || 'hybrid',
          zapsign_template_id: aiFeatures.zapsign_template_id || '',
          sales_consultation_profile: normalizedSalesProfile,
          daily_playbook: normalizedDailyPlaybook,
        },
        strategic_goals: officeGoals,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase.from('tenant_settings').upsert(payload, { onConflict: 'tenant_id' });
      if (error) throw error;

      setSuccess(true);
      setHasUnsavedChanges(false);
      setSalesProfile(normalizeSalesProfile(normalizedSalesProfile));
      setDailyPlaybook(normalizeDailyPlaybookPreferences(normalizedDailyPlaybook));
      setAuthorizedPhonesInput(normalizedDailyPlaybook.authorizedPhones.join("\n"));
      await loadDoctorReport();
      toast.success("Tudo atualizado com sucesso!");
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const configCards = [
    { title: "Estrutura e Setores", desc: "Gerencie departamentos e cores de identificação.", icon: Building2, href: "/dashboard/configuracoes/departamentos", stats: `${stats.depts} Setores ativos`, color: "#CCA761" },
    { title: "Gestão de Equipe", desc: "Convide profissionais, cargos e planos de carreira.", icon: Users, href: "/dashboard/equipe", stats: `${stats.members} Membros registrados`, color: "#4F46E5" },
    { title: "Jurídico & Modelos", desc: "Fonte, espaçamento, assets institucionais e modelos por peça para cada escritório.", icon: FileCheck, href: "/dashboard/configuracoes/juridico", stats: "Perfil jurídico multi-tenant", color: "#CCA761" }
  ];

  const BASE_WEBHOOK_URL = typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/gateway` : "";

  return (
    <div className="flex-1 overflow-auto bg-white dark:bg-[#050505] min-h-screen text-white p-6 sm:p-10 hide-scrollbar">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-tr from-[#CCA761]/30 to-transparent flex items-center justify-center rounded-2xl border border-[#CCA761]/20">
              <Settings2 size={28} className="text-[#CCA761]" />
            </div>
            <div>
              <h1 className={`text-3xl font-bold tracking-wider uppercase text-white ${cormorant.className} drop-shadow-md`}>Configurações Globais</h1>
              <p className="text-gray-400 text-sm tracking-widest mt-1">Gerencie a inteligência e metas do seu escritório</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-3 px-8 py-3.5 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] text-[#0a0a0a] rounded-xl font-black uppercase tracking-[0.2em] text-[11px] shadow-[0_0_20px_rgba(204,167,97,0.3)] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 group overflow-hidden border border-white/10"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin"/> : success ? "CONCLUÍDO!" : hasUnsavedChanges ? <><Save size={16}/> SALVAR ALTERAÇÕES</> : <><Save size={16}/> ATUALIZAR ESCRITÓRIO</>}
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-white/5 mb-10">
          <button onClick={() => setActiveTab('goals')} className={`px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${activeTab === 'goals' ? 'border-[#CCA761] text-[#CCA761]' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Metas do Escritório (BI)</button>
          <button onClick={() => setActiveTab('integrations')} className={`px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] transition-all border-b-2 ${activeTab === 'integrations' ? 'border-[#CCA761] text-[#CCA761]' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>Integrações & APIs</button>
        </div>

        <div className="space-y-10 animate-fade-in-up">
          <SetupDoctorPanel
            report={doctorReport}
            beta={betaWorkMode}
            betaSummary={betaExecutionSummary}
            isLoading={isDoctorLoading}
            isFixing={isDoctorFixing}
            isStartingBeta={isStartingBeta}
            isExecutingBetaStep={isExecutingBetaStep}
            isExecutingBetaQueue={isExecutingBetaQueue}
            onRefresh={loadDoctorReport}
            onAutofix={runDoctorAutofix}
            onStartBeta={startBetaWorkMode}
            onExecuteNextBetaStep={executeNextBetaStep}
            onExecuteSafeBetaQueue={executeSafeBetaQueue}
          />

          <section className="border border-[#CCA761]/20 rounded-3xl p-6 sm:p-7 bg-white/80 dark:bg-[#0d0b07] mb-10">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5 mb-6">
              <div className="flex gap-4 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-[#CCA761]/10 border border-[#CCA761]/20 flex items-center justify-center shrink-0">
                  <Target size={22} className="text-[#CCA761]" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.25em] text-[#CCA761]">Perfil Comercial do MAYUS</h2>
                  <p className="text-xs text-gray-500 leading-relaxed max-w-2xl mt-2">
                    Base que o MAYUS usa para vender como consultor: cliente ideal, solucao, PUV e pilares.
                  </p>
                </div>
              </div>
              <span className={`w-fit rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest ${
                salesProfile.status === "validated"
                  ? "border-[#4ade80]/20 bg-[#4ade80]/10 text-[#4ade80]"
                  : "border-amber-400/20 bg-amber-400/10 text-amber-300"
              }`}>
                {salesProfile.status === "validated" ? "Validado" : "Rascunho"}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <label className="space-y-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Cliente ideal</span>
                <textarea
                  value={salesProfile.ideal_client}
                  onChange={(event) => updateSalesProfile("ideal_client", event.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white focus:outline-none focus:border-[#CCA761]/60"
                  placeholder="Ex: segurados do INSS com beneficio negado, urgencia financeira e disposicao para organizar documentos."
                />
              </label>

              <label className="space-y-2">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Solucao central</span>
                <textarea
                  value={salesProfile.core_solution}
                  onChange={(event) => updateSalesProfile("core_solution", event.target.value)}
                  rows={4}
                  className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white focus:outline-none focus:border-[#CCA761]/60"
                  placeholder="Ex: diagnostico previdenciario com plano de provas, revisao do CNIS e proximo passo juridico claro."
                />
              </label>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black">PUV</span>
                <button
                  type="button"
                  onClick={generateDraftPuv}
                  className="w-fit rounded-xl border border-[#CCA761]/25 bg-[#CCA761]/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#CCA761] hover:bg-[#CCA761]/15"
                >
                  Gerar PUV rascunho
                </button>
              </div>
              <textarea
                value={salesProfile.unique_value_proposition}
                onChange={(event) => updateSalesProfile("unique_value_proposition", event.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white focus:outline-none focus:border-[#CCA761]/60"
                placeholder="Uma promessa clara, autoral e verificavel. Nao use 'bom atendimento' como diferencial."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              {salesProfile.value_pillars.map((pillar, index) => (
                <label key={index} className="space-y-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Pilar {index + 1}</span>
                  <input
                    value={pillar}
                    onChange={(event) => updateSalesProfilePillar(index, event.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white focus:outline-none focus:border-[#CCA761]/60"
                    placeholder={index === 0 ? "Raio-X do Caso" : index === 1 ? "Plano de Provas" : "Decisao Segura"}
                  />
                </label>
              ))}
            </div>

            <label className="block space-y-2 mt-4">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Resumo de posicionamento</span>
              <textarea
                value={salesProfile.positioning_summary}
                onChange={(event) => updateSalesProfile("positioning_summary", event.target.value)}
                rows={3}
                className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white focus:outline-none focus:border-[#CCA761]/60"
                placeholder="Notas livres para o MAYUS entender tom, publico, tese comercial, anti-cliente e limites de promessa."
              />
            </label>

            <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-[11px] text-gray-500 leading-relaxed max-w-2xl">
                Se a PUV ainda estiver em rascunho, o MAYUS usa como hipotese e pede validacao antes de escalar atendimento comercial.
              </p>
              <button
                type="button"
                onClick={() => updateSalesProfile("status", salesProfile.status === "validated" ? "draft" : "validated")}
                className="h-10 px-4 rounded-xl border border-white/10 bg-white/80 dark:bg-black/20 text-[10px] font-black uppercase tracking-widest text-white"
              >
                {salesProfile.status === "validated" ? "Marcar rascunho" : "Validar perfil"}
              </button>
            </div>
          </section>

          <section className="border border-[#CCA761]/20 rounded-3xl p-6 sm:p-7 bg-white/80 dark:bg-[#0d0b07] mb-10">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5 mb-6">
              <div className="flex gap-4 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-[#CCA761]/10 border border-[#CCA761]/20 flex items-center justify-center shrink-0">
                  <CalendarDays size={22} className="text-[#CCA761]" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.25em] text-[#CCA761]">Playbook Diario MAYUS</h2>
                  <p className="text-xs text-gray-500 leading-relaxed max-w-2xl mt-2">
                    Relatorio operacional configuravel para o escritorio receber o plano do dia por painel, WhatsApp ou e-mail.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateDailyPlaybook({ enabled: !dailyPlaybook.enabled })}
                className={`w-fit rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-widest transition ${
                  dailyPlaybook.enabled
                    ? "border-[#4ade80]/20 bg-[#4ade80]/10 text-[#4ade80]"
                    : "border-white/10 bg-white/5 text-gray-500"
                }`}
              >
                {dailyPlaybook.enabled ? "Ativo" : "Pausado"}
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-5">
              <div className="space-y-4">
                <label className="block space-y-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black flex items-center gap-2">
                    <Clock size={13} className="text-[#CCA761]" /> Horario de envio
                  </span>
                  <input
                    type="time"
                    value={dailyPlaybook.deliveryTime}
                    onChange={(event) => updateDailyPlaybook({ deliveryTime: event.target.value })}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white focus:outline-none focus:border-[#CCA761]/60"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Fuso horario</span>
                  <input
                    value={dailyPlaybook.timezone}
                    onChange={(event) => updateDailyPlaybook({ timezone: event.target.value })}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white focus:outline-none focus:border-[#CCA761]/60"
                    placeholder="America/Sao_Paulo"
                  />
                </label>

                <div className="space-y-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Dias de envio</span>
                  <div className="grid grid-cols-7 gap-1.5">
                    {[
                      [0, "D"],
                      [1, "S"],
                      [2, "T"],
                      [3, "Q"],
                      [4, "Q"],
                      [5, "S"],
                      [6, "S"],
                    ].map(([day, label]) => {
                      const active = dailyPlaybook.weekdays.includes(Number(day));
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDailyPlaybookWeekday(Number(day))}
                          className={`h-10 rounded-xl border text-[10px] font-black uppercase tracking-widest transition ${
                            active
                              ? "border-[#CCA761] bg-[#CCA761]/15 text-[#CCA761]"
                              : "border-white/10 bg-black/20 text-gray-500 hover:text-gray-300"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Canais</span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: "mayus_panel", label: "Painel", icon: LayoutDashboard },
                      { id: "whatsapp", label: "WhatsApp", icon: Smartphone },
                      { id: "email", label: "E-mail", icon: Mail },
                    ].map((channel) => {
                      const Icon = channel.icon;
                      const active = dailyPlaybook.channels.includes(channel.id as DailyPlaybookPreferences["channels"][number]);
                      return (
                        <button
                          key={channel.id}
                          type="button"
                          onClick={() => toggleDailyPlaybookChannel(channel.id as DailyPlaybookPreferences["channels"][number])}
                          className={`flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-[10px] font-black uppercase tracking-widest transition ${
                            active
                              ? "border-[#CCA761] bg-[#CCA761]/15 text-[#CCA761]"
                              : "border-white/10 bg-black/20 text-gray-500 hover:text-gray-300"
                          }`}
                        >
                          <Icon size={14} /> {channel.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-2">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Escopo</span>
                    <select
                      value={dailyPlaybook.scope}
                      onChange={(event) => updateDailyPlaybook({ scope: event.target.value as DailyPlaybookPreferences["scope"] })}
                      className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white focus:outline-none focus:border-[#CCA761]/60"
                    >
                      <option value="full">Completo</option>
                      <option value="executive">Executivo</option>
                      <option value="growth">Growth/CRM</option>
                      <option value="legal">Juridico</option>
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black">Detalhe</span>
                    <select
                      value={dailyPlaybook.detailLevel}
                      onChange={(event) => updateDailyPlaybook({ detailLevel: event.target.value as DailyPlaybookPreferences["detailLevel"] })}
                      className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white focus:outline-none focus:border-[#CCA761]/60"
                    >
                      <option value="short">Curto</option>
                      <option value="standard">Padrao</option>
                      <option value="deep">Profundo</option>
                    </select>
                  </label>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#CCA761]">Previa segura</p>
                      <p className="mt-1 text-[11px] text-gray-500 leading-relaxed">
                        Gera um resumo sem criar artifact e sem enviar mensagem externa.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={previewDailyPlaybook}
                      disabled={isPreviewingPlaybook}
                      className="h-10 px-4 rounded-xl border border-[#CCA761]/25 bg-[#CCA761]/10 text-[10px] font-black uppercase tracking-widest text-[#CCA761] hover:bg-[#CCA761]/15 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isPreviewingPlaybook ? <Loader2 size={14} className="animate-spin" /> : <FlaskConical size={14} />}
                      Gerar previa
                    </button>
                  </div>
                  {(playbookPreviewHtml || playbookPreview) && (
                    <div className="mt-4 space-y-3">
                      {playbookPreviewHtml && (
                        <div className="overflow-hidden rounded-xl border border-[#CCA761]/20 bg-[#050505]">
                          <iframe
                            title="Previa HTML do Playbook diario MAYUS"
                            srcDoc={playbookPreviewHtml}
                            sandbox=""
                            className="h-[420px] w-full bg-[#050505]"
                          />
                        </div>
                      )}
                      {playbookPreview && (
                        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-[#050505] p-4 text-[11px] leading-5 text-gray-300">
                          {playbookPreview}
                        </pre>
                      )}
                    </div>
                  )}
                </div>

                <label className="block space-y-2">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-black flex items-center gap-2">
                    <Smartphone size={13} className="text-[#CCA761]" /> Telefones autorizados para comandar o MAYUS
                  </span>
                  <textarea
                    value={authorizedPhonesInput}
                    onChange={(event) => updateAuthorizedPhonesInput(event.target.value)}
                    onBlur={() => setAuthorizedPhonesInput(dailyPlaybook.authorizedPhones.join("\n"))}
                    rows={3}
                    className="w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white focus:outline-none focus:border-[#CCA761]/60"
                    placeholder="Ex: 21999990000 ou 5521999990000"
                  />
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    Use um numero por linha. O MAYUS normaliza para DDI 55 e aceita telefone com DDD, por exemplo 5521999990000.
                  </p>
                </label>
              </div>
            </div>
          </section>

          {activeTab === 'goals' ? (
            <>
              {/* GOVERNANÇA DE CONTRATOS - CARD SOLICITADO (MOVIDO PARA O TOPO PARA TESTE) */}
              <div className="bg-[#0C0C0C] border border-[#CCA761]/40 p-8 rounded-3xl relative shadow-2xl z-50 isolate mb-10">
                 <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-4">
                    <h2 className="text-sm font-black uppercase tracking-[0.3em] text-[#CCA761] flex items-center gap-3"><ShieldCheck size={18} /> Governança de Fechamento</h2>
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest bg-white/5 px-3 py-1 rounded-full border border-white/5">Protocolo ZapSign Ativo</span>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    {[
                      { id: 'ia_only', label: 'Somente IA', desc: 'Fechamento Autônomo', icon: Bot, color: '#CCA761' },
                      { id: 'human_only', label: 'Somente Humano', desc: 'Revisão Necessária', icon: Users, color: '#4F46E5' },
                      { id: 'hybrid', label: 'Modo Híbrido', desc: 'Agilidade Máxima', icon: Zap, color: '#22c55e' }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          setAiFeatures(prev => ({ ...prev, contract_flow_mode: mode.id as any }));
                          setHasUnsavedChanges(true);
                        }}
                        className={`flex flex-col items-center gap-4 p-6 rounded-2xl border-2 transition-all text-center ${
                          aiFeatures.contract_flow_mode === mode.id 
                            ? 'bg-[#CCA761]/5 border-[#CCA761] shadow-[0_0_20px_rgba(204,167,97,0.1)]' 
                            : 'bg-gray-200 dark:bg-black border-white/10 hover:border-white/20 grayscale hover:grayscale-0'
                        }`}
                      >
                         <div className={`p-4 rounded-xl mb-1 ${aiFeatures.contract_flow_mode === mode.id ? 'bg-[#CCA761] text-black' : 'bg-white/5 text-gray-500'}`}>
                           <mode.icon size={24} />
                         </div>
                         <div>
                            <span className="block text-[11px] font-black uppercase tracking-widest text-white mb-1">{mode.label}</span>
                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">{mode.desc}</span>
                         </div>
                      </button>
                    ))}
                 </div>

                 <div className="bg-gray-200 dark:bg-black/40 border border-white/10 p-6 rounded-2xl space-y-4 relative z-[999]">
                    <div className="flex items-center justify-between">
                       <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2" htmlFor="zapsign_template_id"><Link2 size={14} className="text-[#CCA761]" /> ID do Template ZapSign</label>
                       <a href="https://app.zapsign.com.br" target="_blank" className="text-[8px] text-[#CCA761] hover:underline font-bold uppercase tracking-widest">Acessar Painel ZapSign</a>
                    </div>
                    <div className="relative group">
                      <input 
                        type="text" 
                        id="zapsign_template_id"
                        name="zapsign_template_id"
                        autoComplete="off"
                        placeholder="Clique aqui e cole o ID do modelo..." 
                        value={aiFeatures.zapsign_template_id || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setAiFeatures(prev => ({ ...prev, zapsign_template_id: val }));
                          setHasUnsavedChanges(true);
                        }}
                        onFocus={(e) => e.target.select()}
                        className="w-full bg-[#111] border border-[#CCA761]/20 rounded-xl px-5 py-4 text-sm text-white placeholder:text-gray-700 outline-none focus:border-[#CCA761] font-mono transition-all relative z-[1000] cursor-text select-text pointer-events-auto shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]"
                      />
                      <div className="absolute inset-0 rounded-xl border border-[#CCA761]/0 group-hover:border-[#CCA761]/10 pointer-events-none transition-all" />
                    </div>
                 </div>
              </div>

              {/* ESTRUTURA OPERACIONAL */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {configCards.map((card, i) => (
                  <Link key={i} href={card.href} className="group relative bg-[#0C0C0C] border border-white/5 p-6 rounded-2xl hover:border-[#CCA761]/30 transition-all overflow-hidden flex flex-col h-full">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/[0.03] to-transparent rounded-bl-full pointer-events-none" />
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 border transition-colors group-hover:bg-[#CCA761]/10 group-hover:border-[#CCA761]/20`} style={{ borderColor: `${card.color}20`, backgroundColor: `${card.color}05` }}>
                      <card.icon size={22} style={{ color: card.color }} />
                    </div>
                    <h3 className="text-lg font-bold text-white mb-2 group-hover:text-[#CCA761] transition-colors">{card.title}</h3>
                    <p className="text-gray-500 text-xs leading-relaxed mb-6 flex-1">{card.desc}</p>
                    <div className="flex items-center justify-between border-t border-white/5 pt-4">
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-600">{card.stats}</span>
                      <ChevronRight size={14} className="text-gray-700 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                ))}
              </div>

              {/* METAS ESTRATÉGICAS */}
              <div className="bg-[#0C0C0C] border border-[#CCA761]/20 p-8 rounded-3xl relative overflow-hidden shadow-2xl">
                 <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
                    <h2 className="text-sm font-black uppercase tracking-[0.3em] text-[#CCA761] flex items-center gap-3"><Target size={18} /> KPIs & Metas (BI)</h2>
                 </div>
                 <div className="space-y-4 mb-8">
                    {officeGoals.map(goal => (
                      <div key={goal.id} className="flex items-center justify-between bg-gray-200 dark:bg-black/40 border border-white/5 p-4 rounded-xl group hover:border-[#CCA761]/30 transition-all font-mono">
                         <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white">{goal.name}</span>
                            <span className="text-xs font-bold text-[#4ade80]">{goal.unit === 'R$' ? `R$ ${Number(goal.value).toLocaleString('pt-BR')}` : `${goal.value} ${goal.unit}`}</span>
                         </div>
                         <button onClick={() => handleRemoveGoal(goal.id)} className="p-2 text-gray-700 hover:text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14} /></button>
                      </div>
                    ))}
                 </div>
                 <div className="bg-gray-200 dark:bg-black/20 p-6 rounded-2xl border border-white/5 items-end flex gap-3">
                    <div className="flex-1 space-y-1.5 font-mono">
                       <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Nome</label>
                       <input value={newGoal.name} onChange={e => setNewGoal({...newGoal, name: e.target.value})} className="w-full bg-[#111] border border-white/5 rounded-xl px-4 py-3 text-[10px] text-white outline-none focus:border-[#CCA761]"/>
                    </div>
                    <div className="w-[100px] space-y-1.5 font-mono">
                       <label className="text-[9px] font-black uppercase text-gray-500 tracking-widest">Valor</label>
                       <input value={newGoal.value} onChange={e => setNewGoal({...newGoal, value: e.target.value})} className="w-full bg-[#111] border border-white/5 rounded-xl px-4 py-3 text-[10px] text-white outline-none focus:border-[#CCA761]"/>
                    </div>
                    <button onClick={handleAddGoal} className="px-5 h-[42px] bg-[#CCA761] text-black rounded-xl font-black text-[9px] uppercase tracking-widest shadow-[0_0_15px_rgba(204,167,97,0.3)]">ADICIONAR</button>
                 </div>
              </div>

              {/* GAMIFICAÇÃO */}
              <div className={`bg-[#0C0C0C] border border-white/5 p-8 rounded-3xl transition-all ${draftGamification ? 'border-[#CCA761]/20' : ''}`}>
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div className="flex gap-4">
                    <Trophy size={20} className="text-[#CCA761]" />
                    <h3 className="text-lg font-bold text-white">Gamificação Ativa</h3>
                  </div>
                  <button onClick={() => setDraftGamification(!draftGamification)} className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors ${draftGamification ? "bg-[#CCA761]" : "bg-gray-800"}`}><div className={`bg-white w-4 h-4 rounded-full transition-transform ${draftGamification ? "translate-x-6" : "translate-x-0"}`} /></button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-12 pb-20">
              {/* IA */}
              <section className="space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                  <BrainCircuit size={16} className="text-gray-500" />
                  <h2 className="text-sm font-black uppercase tracking-[0.25em] text-gray-500">Inteligência Neural</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {CATALOG.filter(c => c.category === 'ai').map(def => (
                    <IntegrationCard 
                      key={def.id} 
                      def={def} 
                      currentKey={apiKeys[def.id]} 
                      isConnected={integrations.some(i => i.provider === def.id)}
                      webhookUrl={`${BASE_WEBHOOK_URL}?provider=${def.id}&tenant_id=${tenantId}`}
                      onSave={updateApiKeyLocally} 
                    />
                  ))}
                </div>
              </section>

              {/* COMUNICAÇÃO */}
              <section className="space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                  <MessageSquare size={16} className="text-gray-500" />
                  <h2 className="text-sm font-black uppercase tracking-[0.25em] text-gray-500">Comunicação Omnichannel</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {CATALOG.filter(c => c.category === 'comm').map(def => (
                    <IntegrationCard 
                      key={def.id} 
                      def={def} 
                      currentKey={apiKeys[def.id]} 
                      isConnected={integrations.some(i => i.provider === def.id)}
                      webhookUrl={`${BASE_WEBHOOK_URL}?provider=${def.id}&tenant_id=${tenantId}`}
                      onSave={updateApiKeyLocally} 
                    />
                  ))}
                </div>
              </section>

              {/* FINANCEIRO & BI */}
              <section className="space-y-6">
                <div className="flex items-center gap-3 pb-3 border-b border-white/5">
                  <CreditCard size={16} className="text-[#CCA761]" />
                  <h2 className="text-sm font-black uppercase tracking-[0.25em] text-gray-500">BI & Gestão Estratégica</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {CATALOG.filter(c => ['finance', 'signature'].includes(c.category)).map(def => (
                    <IntegrationCard 
                      key={def.id} 
                      def={def} 
                      currentKey={apiKeys[def.id]} 
                      isConnected={integrations.some(i => i.provider === def.id)}
                      webhookUrl={`${BASE_WEBHOOK_URL}?provider=${def.id}&tenant_id=${tenantId}`}
                      onSave={updateApiKeyLocally} 
                    />
                  ))}
                </div>
              </section>

              {/* RODAPÉ DE SEGURANÇA */}
              <div className="bg-[#0d1a0d] border border-[#4ade80]/10 rounded-2xl p-6 flex items-start gap-4">
                <ShieldCheck size={24} className="text-[#4ade80] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-bold text-[#4ade80] mb-1">Criptografia de Ponta a Ponta Ativa</h3>
                  <p className="text-[10px] text-gray-500 leading-relaxed uppercase tracking-wider font-bold">
                    Suas chaves de API nunca são enviadas ao navegador após o salvamento. 
                    O sistema utiliza Row Level Security (RLS) para isolamento total de dados entre escritórios.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConfiguracoesPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-white dark:bg-[#050505] min-h-screen text-[#CCA761] uppercase tracking-[0.3em] font-black animate-pulse">Iniciando Protocolos...</div>}>
      <ConfiguracoesContent />
    </Suspense>
  );
}
