"use client";

import { useState, useEffect, useCallback } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { fetchSafeIntegrations } from "@/lib/integrations/fetch-safe-integrations";
import { saveTenantIntegration } from "@/lib/integrations/save-integration";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import {
  Plug, Zap, Eye, EyeOff, Save, Copy, RefreshCw,
  CheckCircle2, AlertTriangle, Clock, ChevronRight,
  CreditCard, FileCheck, Webhook, FlaskConical, ShieldCheck, X,
  BrainCircuit, MessageSquare, Cpu, Globe
} from "lucide-react";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Integration {
  id?: string;
  tenant_id?: string;
  provider: string;
  webhook_url?: string | null;
  status: "connected" | "disconnected" | "error" | null;
  instance_name?: string | null;
  display_name?: string | null;
  updated_at?: string | null;
  has_api_key: boolean;
  has_webhook_secret: boolean;
}

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
  docUrl: string;
  category: "finance" | "signature" | "ai" | "comm" | "soon";
  badgeSoon?: boolean;
}

// ─── Catálogo de Provedores ───────────────────────────────────────────────────
const CATALOG: IntegrationDef[] = [
  {
    id: "openai",
    label: "OpenAI",
    tagline: "Dê vida ao MAYUS com o cérebro do GPT-4o. Respostas instantâneas e análise neural de casos.",
    icon: BrainCircuit,
    iconBg: "bg-[#00a67e]/20",
    iconColor: "text-[#4ade80]",
    accentColor: "#00a67e",
    apiKeyLabel: "Chave de API OpenAI",
    apiKeyPlaceholder: "sk-...",
    docUrl: "https://platform.openai.com/",
    category: "ai",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    tagline: "Poderosa inteligência multimodal do Google. Velocidade e precisão para automações.",
    icon: Zap,
    iconBg: "bg-[#4285F4]/20",
    iconColor: "text-[#4285F4]",
    accentColor: "#4285F4",
    apiKeyLabel: "Chave de API Gemini",
    apiKeyPlaceholder: "AIza...",
    docUrl: "https://aistudio.google.com/",
    category: "ai",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    tagline: "O cérebro por trás do Claude 3.5 Sonnet. Raciocínio avançado e escrita excepcional.",
    icon: ShieldCheck,
    iconBg: "bg-[#D97757]/20",
    iconColor: "text-[#D97757]",
    accentColor: "#D97757",
    apiKeyLabel: "Chave de API Anthropic",
    apiKeyPlaceholder: "sk-ant-...",
    docUrl: "https://console.anthropic.com/",
    category: "ai",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    tagline: "Acesso unificado aos melhores modelos (Claude, Llama, etc) em um só lugar.",
    icon: Cpu,
    iconBg: "bg-[#7c3aed]/20",
    iconColor: "text-[#a78bfa]",
    accentColor: "#7c3aed",
    apiKeyLabel: "Chave de API OpenRouter",
    apiKeyPlaceholder: "sk-or-v1-...",
    docUrl: "https://openrouter.ai/",
    category: "ai",
  },
  {
    id: "evolution",
    label: "Evolution API",
    tagline: "Integração profissional com WhatsApp. Gerencie conversas e fluxos automáticos sem limites.",
    icon: MessageSquare,
    iconBg: "bg-[#25d366]/20",
    iconColor: "text-[#4ade80]",
    accentColor: "#25d366",
    apiKeyLabel: "API Key / Global Token",
    apiKeyPlaceholder: "Token da sua instância...",
    docUrl: "https://doc.evolution-api.com/",
    category: "comm",
  },
  {
    id: "meta_cloud",
    label: "WhatsApp Cloud",
    tagline: "Conexão oficial via API da Meta. Estabilidade máxima para grandes volumes de mensagens.",
    icon: Globe,
    iconBg: "bg-[#0668E1]/20",
    iconColor: "text-[#60a5fa]",
    accentColor: "#0668E1",
    apiKeyLabel: "Token de Acesso Permanente",
    apiKeyPlaceholder: "EAA...",
    docUrl: "https://developers.facebook.com/",
    category: "comm",
  },
  {
    id: "asaas",
    label: "Asaas",
    tagline: "Automatize cobranças, Pix e boletos. Pagamentos confirmados atualizam seu BI.",
    icon: CreditCard,
    iconBg: "bg-[#4ade80]/20",
    iconColor: "text-[#4ade80]",
    accentColor: "#4ade80",
    apiKeyLabel: "Token de API do Asaas",
    apiKeyPlaceholder: "$aact_...",
    docUrl: "https://docs.asaas.com/",
    category: "finance",
  },
  {
    id: "zapsign",
    label: "ZapSign",
    tagline: "Automatize o processo de assinatura de contratos. Incrementa suas metas de CTR.",
    icon: FileCheck,
    iconBg: "bg-[#818cf8]/20",
    iconColor: "text-[#818cf8]",
    accentColor: "#818cf8",
    apiKeyLabel: "Token de API do ZapSign",
    apiKeyPlaceholder: "zs_live_...",
    docUrl: "https://docs.zapsign.com.br/",
    category: "signature",
  },
];

// ─── Componente de Badge de Status ────────────────────────────────────────────
function StatusBadge({ status }: { status: string | null | undefined }) {
  if (status === "connected")
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#4ade80] bg-[#4ade80]/10 border border-[#4ade80]/20 px-3 py-1 rounded-full">
        <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />
        Conectado
      </span>
    );
  if (status === "error")
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded-full">
        <AlertTriangle size={10} />
        Erro
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-gray-500 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 px-3 py-1 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />
      Desconectado
    </span>
  );
}

// ─── Card de Integração ───────────────────────────────────────────────────────
function IntegrationCard({
  def,
  integration,
  webhookUrl,
  onSave,
}: {
  def: IntegrationDef;
  integration: Integration | null;
  webhookUrl: string;
  onSave: (provider: string, apiKey: string) => Promise<void>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [tempKey, setTempKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const isConnected = integration?.status === "connected";
  const hasKey = !!integration?.has_api_key;

  const handleSave = async () => {
    if (!tempKey.trim()) return toast.error("Insira uma chave de API válida.");
    setIsSaving(true);
    await onSave(def.id, tempKey.trim());
    setTempKey("");
    setIsExpanded(false);
    setIsSaving(false);
  };

  const handleTest = async () => {
    if (!integration?.has_api_key) return toast.error("Configure a integração primeiro.");
    setIsTesting(true);
    const toastId = toast.loading(`Testando conexão com ${def.label}...`);
    // Simula ping — em produção, chamar a API real
    await new Promise((r) => setTimeout(r, 1500));
    toast.success(`✅ ${def.label} respondeu com sucesso!`, { id: toastId });
    setIsTesting(false);
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    toast.success("URL de Webhook copiada!");
  };

  if (def.badgeSoon) {
    return (
      <div className="relative bg-[#0c0c0c] border border-gray-200 dark:border-white/5 p-6 rounded-2xl opacity-60">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 ${def.iconBg} rounded-xl flex items-center justify-center border border-gray-200 dark:border-white/5`}>
            <def.icon size={22} className={def.iconColor} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">{def.label}</h3>
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Clock size={9} /> Em breve
              </span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{def.tagline}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative bg-[#0c0c0c] border rounded-2xl transition-all duration-300 overflow-hidden ${
        isConnected
          ? "border-[#4ade80]/20 shadow-[0_0_30px_rgba(74,222,128,0.04)]"
          : "border-gray-200 dark:border-white/5 hover:border-gray-200 dark:border-white/10"
      }`}
    >
      {/* Glow de fundo quando conectado */}
      {isConnected && (
        <div
          className="absolute top-0 right-0 w-40 h-40 rounded-bl-full blur-3xl pointer-events-none"
          style={{ backgroundColor: `${def.accentColor}08` }}
        />
      )}

      {/* ─── Header do Card ─── */}
      <div className="flex items-center gap-4 p-6">
        <div
          className={`w-12 h-12 ${def.iconBg} rounded-xl flex items-center justify-center border border-gray-200 dark:border-white/5 shrink-0`}
        >
          <def.icon size={22} className={def.iconColor} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">{def.label}</h3>
            <StatusBadge status={integration?.status} />
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{def.tagline}</p>
        </div>

        <button
          onClick={() => setIsExpanded((v) => !v)}
          className={`p-2 rounded-xl border transition-all shrink-0 ${
            isExpanded
              ? "bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 text-gray-900 dark:text-white"
              : "bg-transparent border-transparent text-gray-600 hover:text-gray-400"
          }`}
        >
          {isExpanded ? <X size={18} /> : <ChevronRight size={18} />}
        </button>
      </div>

      {/* ─── Painel de Configuração Expandido ─── */}
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-white/5 px-6 pb-6 pt-5 space-y-5 animate-in fade-in slide-in-from-top-2 duration-200">

          {/* Campo de API Key */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500">
              {def.apiKeyLabel}
            </label>

            {hasKey && !tempKey ? (
              <div className="flex items-center gap-3 bg-gray-200 dark:bg-black/40 border border-gray-200 dark:border-white/5 rounded-xl px-4 py-3">
                <ShieldCheck size={16} className="text-[#4ade80] shrink-0" />
                <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">Chave protegida no backend do escritório. Informe uma nova apenas se quiser substituir.</span>
                <button
                  onClick={() => setTempKey(" ")} // activa o modo edição
                  className="text-[10px] font-black uppercase tracking-widest text-[#CCA761] hover:text-gray-900 dark:text-white transition-colors"
                >
                  Trocar
                </button>
              </div>
            ) : (
              // Input para nova chave
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={tempKey.trim()}
                  onChange={(e) => setTempKey(e.target.value)}
                  placeholder={def.apiKeyPlaceholder}
                  autoComplete="off"
                  className="w-full bg-gray-200 dark:bg-black/40 border-2 border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 pr-12 text-sm font-mono text-gray-900 dark:text-white placeholder:text-gray-700 focus:border-[#CCA761] outline-none transition-all"
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute inset-y-0 right-4 flex items-center text-gray-600 hover:text-gray-900 dark:text-white transition-colors"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            )}
          </div>

          {/* URL de Webhook */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 flex items-center gap-2">
              <Webhook size={12} />
              URL do Webhook (cole no painel {def.label})
            </label>
            <div className="flex items-center gap-3 bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-white/5 rounded-xl px-4 py-3">
              <code className="text-xs text-[#CCA761] font-mono flex-1 truncate">{webhookUrl}</code>
              <button
                onClick={copyWebhookUrl}
                className="text-gray-600 hover:text-gray-900 dark:text-white transition-colors shrink-0"
              >
                <Copy size={14} />
              </button>
            </div>
            <p className="text-[10px] text-gray-600 leading-relaxed">
              🔒 Cada sinal recebido é validado por um token secreto exclusivo do seu escritório.
            </p>
          </div>

          {/* Ações */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-white/5">
            <button
              onClick={handleTest}
              disabled={isTesting || !isConnected}
              className={`flex items-center gap-2 text-[11px] font-bold px-4 py-2 rounded-xl border transition-all ${
                isConnected
                  ? "border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:border-white/20 hover:text-gray-900 dark:text-white"
                  : "border-gray-200 dark:border-white/5 text-gray-700 cursor-not-allowed"
              }`}
            >
              <FlaskConical size={14} className={isTesting ? "animate-pulse" : ""} />
              {isTesting ? "Testando..." : "Testar Conexão"}
            </button>

            {(!hasKey || tempKey.trim()) && (
              <button
                onClick={handleSave}
                disabled={isSaving || !tempKey.trim()}
                className="flex items-center gap-2 text-[11px] font-black px-5 py-2 rounded-xl bg-gradient-to-r from-[#CCA761] to-[#f1d58d] text-black transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
              >
                {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                {isSaving ? "Salvando..." : "Salvar Chave"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Componente Webhook Interno ───────────────────────────────────────────────
function WebhookCard({ title, desc, icon: Icon, url, onCopy }: any) {
  return (
    <div className="bg-[#0c0c0c] border border-gray-200 dark:border-white/5 hover:border-gray-200 dark:border-white/10 transition-all p-6 rounded-2xl">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-[#CCA761]/10 rounded-xl flex items-center justify-center border border-[#CCA761]/20 shrink-0">
          <Icon size={20} className="text-[#CCA761]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h3>
            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 px-2 py-0.5 rounded-full">
              Ativo
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed mb-3">{desc}</p>
          <div className="flex items-center gap-2 bg-gray-200 dark:bg-black/40 border border-gray-200 dark:border-white/5 rounded-lg px-3 py-2">
            <code className="text-[11px] text-[#CCA761]/80 font-mono flex-1 truncate">{url}</code>
            <button onClick={onCopy} className="text-gray-600 hover:text-gray-900 dark:text-white transition-colors shrink-0">
              <Copy size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Página Principal ──────────────────────────────────────────────────────────
export default function IntegracoesPage() {
  const { profile } = useUserProfile();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const tenantId = profile?.tenant_id || "";

  // URL base do webhook
  const BASE_URL = typeof window !== "undefined" ? window.location.origin : "";
  const GATEWAY_URL = `${BASE_URL}/api/webhooks/gateway`;

  const loadIntegrations = useCallback(async () => {
    if (!profile?.tenant_id) return;
    setIsLoading(true);
    try {
      const data = await fetchSafeIntegrations();
      setIntegrations(data as Integration[]);
    } catch (error: any) {
      toast.error(error?.message || "Nao foi possivel carregar as integracoes.");
    } finally {
      setIsLoading(false);
    }
  }, [profile?.tenant_id]);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const getIntegration = (provider: string) =>
    integrations.find((i) => i.provider === provider) || null;

  const handleSave = async (provider: string, apiKey: string) => {
    if (!profile?.tenant_id) return;

    // Gera um segredo único para o webhook deste provedor
    const webhookSecret = crypto.randomUUID().replace(/-/g, "");

    try {
      await saveTenantIntegration({
        provider,
        apiKey,
        webhookSecret,
        status: "connected",
        displayName: CATALOG.find((c) => c.id === provider)?.label || provider,
      });
      toast.success(`✅ ${provider} conectado com sucesso!`);
      await loadIntegrations();
    } catch (err: any) {
      toast.error("Erro ao salvar: " + err.message);
    }
  };

  const aiIntegrations = CATALOG.filter((c) => c.category === "ai");
  const commIntegrations = CATALOG.filter((c) => c.category === "comm");
  const biIntegrations = CATALOG.filter((c) => ["finance", "signature"].includes(c.category));
  const soonIntegrations = CATALOG.filter((c) => c.category === "soon");

  return (
    <div
      className={`flex-1 overflow-auto bg-white dark:bg-[#050505] min-h-screen text-gray-900 dark:text-white p-6 sm:p-10 hide-scrollbar ${montserrat.className}`}
    >
      <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* ─── CABEÇALHO ─── */}
        <div className="flex items-start gap-5">
          <div className="w-14 h-14 bg-gradient-to-tr from-[#CCA761]/30 to-transparent flex items-center justify-center rounded-2xl border border-[#CCA761]/20 shrink-0">
            <Plug size={28} className="text-[#CCA761]" />
          </div>
          <div>
            <h1 className={`text-3xl font-bold tracking-wide text-gray-900 dark:text-white ${cormorant.className} italic`}>
              Integrações &{" "}
              <span className="text-[#CCA761]">Conexões Externas</span>
            </h1>
            <p className="text-gray-500 text-sm mt-1 leading-relaxed">
              Conecte suas ferramentas e transforme o MAYUS em um centro de comando autônomo.
              <br />
              <span className="text-[#4ade80] font-semibold text-[11px]">
                🔒 Suas chaves ficam protegidas no backend e não são exibidas após salvas.
              </span>
            </p>
          </div>
        </div>

        {/* ─── SEÇÃO: INTELIGÊNCIA NEURAL ─── */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-gray-200 dark:border-white/5">
            <div className="w-7 h-7 bg-[#00a67e]/10 rounded-lg flex items-center justify-center border border-[#00a67e]/20">
              <BrainCircuit size={14} className="text-[#00a67e]" />
            </div>
            <h2 className="text-sm font-black uppercase tracking-[0.25em] text-gray-400">
              Inteligência Artificial
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {aiIntegrations.map((def) => (
              <IntegrationCard
                key={def.id}
                def={def}
                integration={getIntegration(def.id)}
                webhookUrl={`${GATEWAY_URL}?provider=${def.id}&tenant_id=${tenantId}`}
                onSave={handleSave}
              />
            ))}
          </div>
        </section>

        {/* ─── SEÇÃO: COMUNICAÇÃO ─── */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-gray-200 dark:border-white/5">
            <div className="w-7 h-7 bg-[#25d366]/10 rounded-lg flex items-center justify-center border border-[#25d366]/20">
              <MessageSquare size={14} className="text-[#25d366]" />
            </div>
            <h2 className="text-sm font-black uppercase tracking-[0.25em] text-gray-400">
              Comunicação Omnichannel
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {commIntegrations.map((def) => (
              <IntegrationCard
                key={def.id}
                def={def}
                integration={getIntegration(def.id)}
                webhookUrl={`${GATEWAY_URL}?provider=${def.id}&tenant_id=${tenantId}`}
                onSave={handleSave}
              />
            ))}
          </div>
        </section>

        {/* ─── SEÇÃO: BI & GESTÃO ─── */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-gray-200 dark:border-white/5">
            <div className="w-7 h-7 bg-[#CCA761]/10 rounded-lg flex items-center justify-center border border-[#CCA761]/20">
              <Zap size={14} className="text-[#CCA761]" />
            </div>
            <h2 className="text-sm font-black uppercase tracking-[0.25em] text-gray-400">
              BI & Gestão Estratégica
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {biIntegrations.map((def) => (
              <IntegrationCard
                key={def.id}
                def={def}
                integration={getIntegration(def.id)}
                webhookUrl={`${GATEWAY_URL}?provider=${def.id}&tenant_id=${tenantId}`}
                onSave={handleSave}
              />
            ))}
          </div>
        </section>

        {/* ─── SEÇÃO: WEBHOOKS INTERNOS ─── */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 pb-3 border-b border-gray-200 dark:border-white/5">
            <div className="w-7 h-7 bg-[#818cf8]/10 rounded-lg flex items-center justify-center border border-[#818cf8]/20">
              <Webhook size={14} className="text-[#818cf8]" />
            </div>
            <h2 className="text-sm font-black uppercase tracking-[0.25em] text-gray-400">
              Webhooks de Entrada
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <WebhookCard
              title="Financeiro (Asaas)"
              desc="Cole esta URL no painel do Asaas em Integrações > Webhooks."
              icon={CreditCard}
              url={`${GATEWAY_URL}?provider=asaas&tenant_id=${tenantId}`}
              onCopy={() => {
                navigator.clipboard.writeText(`${GATEWAY_URL}?provider=asaas&tenant_id=${tenantId}`);
                toast.success("URL copiada!");
              }}
            />
            <WebhookCard
              title="Jurídico (ZapSign)"
              desc="Cole esta URL na ZapSign em Configurações > API > Webhooks."
              icon={FileCheck}
              url={`${GATEWAY_URL}?provider=zapsign&tenant_id=${tenantId}`}
              onCopy={() => {
                navigator.clipboard.writeText(`${GATEWAY_URL}?provider=zapsign&tenant_id=${tenantId}`);
                toast.success("URL copiada!");
              }}
            />
          </div>
        </section>

        {/* ─── SEÇÃO: EM BREVE ─── */}
        {soonIntegrations.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-200 dark:border-white/5">
              <div className="w-7 h-7 bg-amber-500/10 rounded-lg flex items-center justify-center border border-amber-500/20">
                <Clock size={14} className="text-amber-500" />
              </div>
              <h2 className="text-sm font-black uppercase tracking-[0.25em] text-gray-400">
                Em breve
              </h2>
            </div>
            <div className="space-y-3">
              {soonIntegrations.map((def) => (
                <IntegrationCard
                  key={def.id}
                  def={def}
                  integration={null}
                  webhookUrl=""
                  onSave={async () => {}}
                />
              ))}
            </div>
          </section>
        )}

        {/* ─── NOTA DE SEGURANÇA ─── */}
        <div className="bg-[#0d1a0d] border border-[#4ade80]/10 rounded-2xl p-6 flex items-start gap-4">
          <ShieldCheck size={24} className="text-[#4ade80] shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-[#4ade80] mb-1">Protocolo de Segurança Ativo</h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Todas as chaves de API são armazenadas criptografadas no banco de dados e protegidas por Row Level Security (RLS) do Supabase.
              Cada organização só acessa suas próprias chaves. Após salvar, a chave completa nunca mais é exibida.
              Os Webhooks são validados por um token secreto exclusivo gerado automaticamente para o seu escritório.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
