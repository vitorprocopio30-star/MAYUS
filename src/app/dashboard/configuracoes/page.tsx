"use client";

import { useState, useEffect, Suspense, useCallback } from "react";
import { Cormorant_Garamond } from "next/font/google";
import { 
  Settings2, Trophy, Save, Building2, Users, Palette, Zap, Bot, 
  ChevronRight, LayoutDashboard, Loader2, Scale, Target, Trash2, 
  BrainCircuit, MessageSquare, Cpu, Globe, Eye, EyeOff, Link2, 
  FileCheck, CreditCard, AlertTriangle, ShieldCheck, X, Webhook, Copy, RefreshCw, FlaskConical
} from "lucide-react";
import { useGamification } from "@/hooks/useGamification";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
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

// ─── Catálogo de Provedores Premium ───────────────────────────────────────────
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
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs font-mono text-white focus:border-[#CCA761] outline-none transition-all pr-12"
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
            <div className="flex items-center gap-2 bg-[#050505] border border-white/5 rounded-xl px-3 py-2.5">
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
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({
    openai: "", gemini: "", anthropic: "", openrouter: "",
    evolution: "", meta_cloud: "", asaas: "", zapsign: ""
  });

  const loadIntegrations = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await supabase.from('tenant_integrations').select('*').eq('tenant_id', tenantId);
    if (data) {
      setIntegrations(data);
      const newKeys = { ...apiKeys };
      data.forEach(item => {
        if (newKeys.hasOwnProperty(item.provider)) {
          newKeys[item.provider] = item.api_key || "";
        }
      });
      setApiKeys(newKeys);
    }
  }, [tenantId, supabase, apiKeys]);

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
      if (settings?.strategic_goals) setOfficeGoals(settings.strategic_goals);

      const { data: depts } = await supabase.from('departments').select('id, name').eq('tenant_id', tenantId);
      if (depts) setDepartments(depts);
      
      await loadIntegrations();
    };
    loadData();
  }, [tenantId, supabase, loadIntegrations]);

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

  const handleSaveIntegrations = async () => {
    if (!tenantId) return;
    try {
      const providersToSave = Object.entries(apiKeys).filter(([_, key]) => key.length > 0);
      for (const [provider, api_key] of providersToSave) {
        await supabase.from('tenant_integrations').upsert({
          tenant_id: tenantId,
          provider,
          api_key,
          status: 'connected',
          updated_at: new Date().toISOString()
        }, { onConflict: 'tenant_id,provider' });
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
      
      const payload = { 
        tenant_id: tenantId, 
        branding: { primary_color: primaryColor },
        ai_features: { 
          ...aiFeatures, 
          default_department_id: defaultDeptId,
          contract_flow_mode: aiFeatures.contract_flow_mode || 'hybrid',
          zapsign_template_id: aiFeatures.zapsign_template_id || ''
        },
        strategic_goals: officeGoals,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase.from('tenant_settings').upsert(payload, { onConflict: 'tenant_id' });
      if (error) throw error;

      setSuccess(true);
      setHasUnsavedChanges(false);
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
    <div className="flex-1 overflow-auto bg-[#050505] min-h-screen text-white p-6 sm:p-10 hide-scrollbar">
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
                            : 'bg-black border-white/10 hover:border-white/20 grayscale hover:grayscale-0'
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

                 <div className="bg-black/40 border border-white/10 p-6 rounded-2xl space-y-4 relative z-[999]">
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
                      <div key={goal.id} className="flex items-center justify-between bg-black/40 border border-white/5 p-4 rounded-xl group hover:border-[#CCA761]/30 transition-all font-mono">
                         <div className="flex flex-col">
                            <span className="text-[10px] font-black uppercase tracking-widest text-white">{goal.name}</span>
                            <span className="text-xs font-bold text-[#4ade80]">{goal.unit === 'R$' ? `R$ ${Number(goal.value).toLocaleString('pt-BR')}` : `${goal.value} ${goal.unit}`}</span>
                         </div>
                         <button onClick={() => handleRemoveGoal(goal.id)} className="p-2 text-gray-700 hover:text-red-500 rounded-lg opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14} /></button>
                      </div>
                    ))}
                 </div>
                 <div className="bg-black/20 p-6 rounded-2xl border border-white/5 items-end flex gap-3">
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
    <Suspense fallback={<div className="flex-1 flex items-center justify-center bg-[#050505] min-h-screen text-[#CCA761] uppercase tracking-[0.3em] font-black animate-pulse">Iniciando Protocolos...</div>}>
      <ConfiguracoesContent />
    </Suspense>
  );
}
