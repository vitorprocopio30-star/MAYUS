"use client";

import { useState, useEffect, useCallback } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { QrCode, Smartphone, Zap, Bot, BrainCircuit, Plus, X, Eye, Settings, CheckCircle2, AlertCircle, Loader2, FolderOpen, ExternalLink, Instagram } from "lucide-react";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/useUserProfile";
import { fetchSafeIntegrations, type SafeTenantIntegration } from "@/lib/integrations/fetch-safe-integrations";
import { saveTenantIntegration } from "@/lib/integrations/save-integration";
import Image from "next/image";
import { GoogleDriveLogo } from "@/components/branding/GoogleDriveLogo";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

interface GoogleDriveState {
  available: boolean;
  connected: boolean;
  status: string;
  connectedEmail: string | null;
  rootFolderId: string | null;
  rootFolderName: string | null;
  rootFolderUrl: string | null;
}

type InstagramAutomation = {
  id: string;
  keyword: string;
  response_text: string;
  direct_message: string;
  file_url: string;
  is_active: boolean;
};

export default function IntegracoesPage() {
  const [integrations, setIntegrations] = useState<SafeTenantIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  
  // Modais de edição/criação LLMs
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [tempApiKey, setTempApiKey] = useState("");
  const [tempModel, setTempModel] = useState("");
  const { profile } = useUserProfile();

  // NOVO: EVOLUTION STATE (Tido dentro do Card)
  const [evoStep, setEvoStep] = useState<"CONFIG"|"QRCODE"|"CONNECTED">("CONFIG");
  const [evoQr, setEvoQr] = useState("");
  const [evoUrl, setEvoUrl] = useState("https://evolution.dutraprocopio.cloud");
  const [evoName, setEvoName] = useState("MAYUS2");
  const [evoKey, setEvoKey] = useState("");
  const [evoLoading, setEvoLoading] = useState(false);
  const [evoError, setEvoError] = useState("");
  const [isEvoEditing, setIsEvoEditing] = useState(true);
  const [googleDrive, setGoogleDrive] = useState<GoogleDriveState>({
    available: true,
    connected: false,
    status: "disconnected",
    connectedEmail: null,
    rootFolderId: null,
    rootFolderName: null,
    rootFolderUrl: null,
  });
  const [googleDriveLoading, setGoogleDriveLoading] = useState(true);
  const [googleDriveBusy, setGoogleDriveBusy] = useState<"save" | "disconnect" | null>(null);
  const [googleDriveRootInput, setGoogleDriveRootInput] = useState("");

  const loadGoogleDriveStatus = useCallback(async () => {
    setGoogleDriveLoading(true);

    try {
      const response = await fetch("/api/integrations/google-drive", { cache: "no-store" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível carregar a integração do Google Drive.");
      }

      setGoogleDrive(data);
      setGoogleDriveRootInput(data?.rootFolderUrl || data?.rootFolderId || "");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível carregar a integração do Google Drive.");
    } finally {
      setGoogleDriveLoading(false);
    }
  }, []);

  const loadIntegrations = useCallback(async () => {
    if (!profile?.tenant_id) return;

    setIsLoading(true);
    try {
      const data = await fetchSafeIntegrations();
      setIntegrations(data);

      // Auto-Load Evolution if exists
      const evol = data.find(i => i.provider === 'evolution');
      if (evol?.instance_name) {
         const parts = evol.instance_name.split('|');
         setEvoUrl(parts[0] || "https://evolution.dutraprocopio.cloud");
         setEvoName(parts[1] || "MAYUS2");
         setEvoKey("");
         setIsEvoEditing(false);
         if (evol.status === 'connected' && evol.has_api_key) {
           setEvoStep("CONNECTED");
         }
      }
    } catch (error: any) {
      toast.error(error?.message || "Nao foi possivel carregar as integracoes.");
    } finally {
      setIsLoading(false);
    }
  }, [profile?.tenant_id]);

  const [instagramAutomations, setInstagramAutomations] = useState<InstagramAutomation[]>([]);
  const [isAddingInsta, setIsAddingInsta] = useState(false);
  const [newInstaKeyword, setNewInstaKeyword] = useState("");
  const [newInstaResponse, setNewInstaResponse] = useState("");
  const [newInstaDM, setNewInstaDM] = useState("");
  const [newInstaFile, setNewInstaFile] = useState("");

  const loadInstagramAutomations = useCallback(async () => {
    if (!profile?.tenant_id) return;
    try {
      const response = await fetch("/api/instagram/automations", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Nao foi possivel carregar automacoes do Instagram.");
      setInstagramAutomations(Array.isArray(data?.automations) ? data.automations : []);
    } catch (error: any) {
      toast.error(error?.message || "Nao foi possivel carregar automacoes do Instagram.");
    }
  }, [profile?.tenant_id]);

  useEffect(() => {
    if (profile?.tenant_id) {
      loadIntegrations();
      loadGoogleDriveStatus();
      loadInstagramAutomations();
    }
  }, [profile?.tenant_id, loadGoogleDriveStatus, loadIntegrations, loadInstagramAutomations]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentUrl = new URL(window.location.href);
    const googleDriveStatus = currentUrl.searchParams.get("googleDrive");
    if (!googleDriveStatus) return;

    const message = currentUrl.searchParams.get("message");
    if (googleDriveStatus === "connected") {
      toast.success("Google Drive conectado com sucesso.");
    } else if (googleDriveStatus === "error") {
      toast.error(message || "Não foi possível conectar o Google Drive.");
    }

    loadGoogleDriveStatus();

    currentUrl.searchParams.delete("googleDrive");
    currentUrl.searchParams.delete("message");
    const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, [loadGoogleDriveStatus]);

  const getIntegration = (provider: string) => integrations.find(i => i.provider === provider);

  // EVO Logic Transplanted
  const checkEvoStatus = async (url: string, name: string, key: string) => {
    try {
      const statusRes = await fetch("/api/integrations/evolution", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({
           action: "status",
           url,
           name,
           key,
         })
      });
      const data = await statusRes.json();
      if (data?.status?.instance?.state === 'open') {
         setEvoStep("CONNECTED");
         setIsEvoEditing(false);
      }
    } catch(e) {}
  };

  const handleConnectLocalEvo = async () => {
    if(!evoUrl || !evoName || !evoKey) { setEvoError("Preencha URL, Nome e Chave Ouro"); return; }
    setEvoLoading(true); setEvoError("");
    try {
      const response = await fetch("/api/integrations/evolution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "connect",
          url: evoUrl,
          name: evoName,
          key: evoKey,
        }),
      });
      const connectData = await response.json().catch(() => null);

      if (!response.ok || !connectData?.ok) {
        throw new Error(connectData?.error || "Falha ao conectar");
      }

      if (connectData?.connectData?.base64) {
         setEvoQr(connectData.connectData.base64);
         setEvoStep("QRCODE");
      } else if (connectData?.connectData?.instance?.state === 'open') {
         setEvoStep("CONNECTED");
      }

      // Salva no banco "Integrações"
       if (profile?.tenant_id) {
          await saveTenantIntegration({
            provider: 'evolution',
            apiKey: evoKey,
            instanceName: `${evoUrl.replace(/\/$/, '')}|${evoName}`,
            status: 'connected',
          });
          await loadIntegrations();
       }

    } catch(e: any) {
      setEvoError(e.message);
    }
    setEvoLoading(false);
  };


  const handleSaveIntegration = async () => {
    if (!profile?.tenant_id || !editingProvider) return;

    try {
      const instagramParts = editingProvider === "instagram"
        ? tempModel.split("|").map((part) => part.trim()).filter(Boolean)
        : [];
      const payload = {
        provider: editingProvider,
        apiKey: tempApiKey,
        instanceName: tempModel,
        status: tempApiKey ? 'connected' : 'disconnected',
        metadata: editingProvider === "instagram" ? {
          instagram_business_account_id: instagramParts[0] || tempModel.trim(),
          page_id: instagramParts[1] || null,
        } : null,
      };

      await saveTenantIntegration(payload);
      
      toast.success("Integração salva com sucesso!");
      setEditingProvider(null);
      loadIntegrations();
    } catch(err: any) {
      toast.error(err.message || "Erro ao salvar integração.");
    }
  };

  const handleConnectGoogleDrive = () => {
    window.location.assign("/api/integrations/google-drive/connect");
  };

  const handleSaveGoogleDriveRoot = async () => {
    setGoogleDriveBusy("save");

    try {
      const response = await fetch("/api/integrations/google-drive", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rootFolder: googleDriveRootInput }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível salvar a pasta raiz do Google Drive.");
      }

      setGoogleDrive(data);
      setGoogleDriveRootInput(data?.rootFolderUrl || data?.rootFolderId || "");
      toast.success(googleDriveRootInput.trim() ? "Pasta raiz do Drive salva." : "Pasta raiz do Drive removida.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível salvar a pasta raiz do Google Drive.");
    } finally {
      setGoogleDriveBusy(null);
    }
  };

  const handleDisconnectGoogleDrive = async () => {
    if (!confirm("Desconectar o Google Drive deste escritório?")) return;

    setGoogleDriveBusy("disconnect");

    try {
      const response = await fetch("/api/integrations/google-drive", {
        method: "DELETE",
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível desconectar o Google Drive.");
      }

      setGoogleDrive((current) => ({
        ...current,
        connected: false,
        status: "disconnected",
        connectedEmail: null,
      }));
      toast.success("Google Drive desconectado.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível desconectar o Google Drive.");
    } finally {
      setGoogleDriveBusy(null);
    }
  };

  const handleSaveInstaAutomation = async () => {
    if (!profile?.tenant_id || !newInstaKeyword) return;
    try {
      const response = await fetch("/api/instagram/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        keyword: newInstaKeyword,
        response_text: newInstaResponse,
        direct_message: newInstaDM,
          file_url: newInstaFile,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Erro ao salvar automacao.");
      toast.success("Automação do Instagram salva!");
      setIsAddingInsta(false);
      setNewInstaKeyword("");
      setNewInstaResponse("");
      setNewInstaDM("");
      setNewInstaFile("");
      loadInstagramAutomations();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar automação.");
    }
  };

  const handleDeleteInstaAutomation = async (id: string) => {
    try {
      const response = await fetch(`/api/instagram/automations/${id}`, { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Erro ao remover automacao.");
      toast.success("Automação removida.");
      loadInstagramAutomations();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao remover.");
    }
  };

  const providers = [
    { id: "openrouter", name: "OpenRouter", icon: BrainCircuit, logoUrl: "https://mintlify.s3-us-west-1.amazonaws.com/openrouter/logo/dark.svg", color: "text-[#CCA761]", bg: "bg-[#CCA761]", desc: "Aggregator para dezenas de LLMs avançados.", models: ["anthropic/claude-sonnet-4.6", "openrouter/auto", "qwen/qwen3.6-plus", "meta-llama/llama-3-70b-instruct", "anthropic/claude-3.5-sonnet", "google/gemini-flash-1.5"] },
    { id: "openai", name: "OpenAI (ChatGPT)", icon: Bot, logoUrl: "https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg", color: "text-[#10a37f]", bg: "bg-[#10a37f]", desc: "Modelos GPT-4 e GPT-3.5 para análise jurídica.", models: ["gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"] },
    { id: "anthropic", name: "Anthropic (Claude)", icon: Zap, logoUrl: "https://upload.wikimedia.org/wikipedia/commons/4/47/Claude_AI_logo.svg", color: "text-[#cc7c61]", bg: "bg-[#cc7c61]", desc: "Claude Opus e Sonnet para longos contratos.", models: ["claude-3-5-sonnet-20240620", "claude-3-opus-20240229"] },
    { id: "gemini", name: "Google Gemini", icon: BrainCircuit, logoUrl: "https://upload.wikimedia.org/wikipedia/commons/8/8a/Google_Gemini_logo.svg", color: "text-[#1ca1f2]", bg: "bg-[#1ca1f2]", desc: "Janela de contexto massiva e raciocínio multimodal (Google).", models: ["gemini-1.5-pro", "gemini-1.5-flash"] },
    { id: "deepseek", name: "DeepSeek", icon: BrainCircuit, logoUrl: "", color: "text-[#3b82f6]", bg: "bg-[#3b82f6]", desc: "Avançado mecanismo focado na classe de código aberto e velocidade.", models: ["deepseek-chat", "deepseek-coder"] },
    { id: "grok", name: "X.AI Grok", icon: Bot, logoUrl: "https://upload.wikimedia.org/wikipedia/commons/e/e3/X.AI_logo.svg", color: "text-[#ffffff]", bg: "bg-[#ffffff]", desc: "Decisões aceleradas com inteligência em tempo real.", models: ["grok-1.5"] },
    { id: "kimi", name: "Moonshot Kimi", icon: Zap, logoUrl: "", color: "text-[#ff3b30]", bg: "bg-[#ff3b30]", desc: "Especialista excepcional em leitura de PDFs documentais gigantescos.", models: ["moonshot-v1-8k", "moonshot-v1-32k"] }
  ];

  const toggleShow = (provider: string) => setShowKey(p => ({ ...p, [provider]: !p[provider] }));

  return (
    <div className={"p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in py-10 " + montserrat.className}>
      
      {/* HEADER */}
      <div>
        <h1 className={"text-4xl font-black text-white italic tracking-wide " + cormorant.className}>
          Integrações & <span className="text-[#CCA761]">APIs Customizadas</span>
        </h1>
        <p className="text-gray-400 mt-2 max-w-2xl text-sm leading-relaxed">
          Para máxima privacidade e zero limites de escala, o seu escritório pode inserir suas próprias chaves de Inteligência Artificial e conectar máquinas autônomas e WhatsApp nativo.
        </p>
        {(isLoading || googleDriveLoading) && (
          <p className="text-[#CCA761] text-xs uppercase tracking-[0.25em] mt-4">Sincronizando integrações...</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* COLUNA ESQUERDA: MENSAJERIA (WHATAPP) */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold border-b border-white/10 pb-3 flex items-center gap-2">
            <Smartphone className="text-[#CCA761]" size={22} />
            Motor Omnichannel
          </h2>
          
          <div className="space-y-6">

            {/* WHATSAPP OFICIAL META CLOUD API */}
            <div className={`relative flex flex-col justify-between bg-gradient-to-br from-[#111111] via-[#0a0a0a] to-[#050505] p-6 border rounded-2xl transition-all duration-500 overflow-hidden ${
              getIntegration('meta_cloud')?.status === 'connected' ? 'border-[#CCA761]/60 shadow-[0_20px_40px_rgba(204,167,97,0.1)]' : 'border-[#CCA761]/30 shadow-xl'
            }`}>
               <div className="absolute top-0 right-0 w-40 h-40 bg-[#CCA761]/10 rounded-bl-full blur-3xl pointer-events-none" />
               <div className="absolute top-4 right-4 bg-[#CCA761]/10 text-[#CCA761] text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded border border-[#CCA761]/30 flex items-center gap-2 shadow-[0_0_10px_rgba(204,167,97,0.2)]">
                 <div className="w-1.5 h-1.5 bg-[#CCA761] rounded-full animate-pulse" /> 
                 {getIntegration('meta_cloud')?.status === 'connected' ? 'Ativo' : 'Recomendado'}
               </div>
               
               <div className="relative z-10">
                  <div className="bg-[#CCA761]/10 w-12 h-12 rounded-xl flex items-center justify-center border border-[#CCA761]/30 mb-4 shadow-[inset_0_0_15px_rgba(204,167,97,0.3)]">
                     <svg viewBox="0 0 24 24" width="22" height="22" className="text-[#CCA761]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  </div>
                  <div className="flex justify-between items-start mb-2 text-white">
                    <h3 className="text-xl font-black tracking-tight italic">MAYUS Cloud API (Meta)</h3>
                    {getIntegration('meta_cloud')?.status === 'connected' && editingProvider !== 'meta_cloud' && (
                       <button onClick={() => { setEditingProvider('meta_cloud'); setTempApiKey(""); setTempModel(getIntegration('meta_cloud')?.instance_name || ""); }} className="p-2 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                          <Settings size={18} />
                       </button>
                    )}
                  </div>
                  <p className="text-gray-400 text-xs leading-relaxed mb-4">
                    Conecte sua conta do Facebook Business para usar a API oficial. Total estabilidade, luxo e controle.
                  </p>
                  
                  {editingProvider === 'meta_cloud' ? (
                    <div className="space-y-4 bg-gray-200 dark:bg-black/40 p-5 rounded-xl border border-white/5 animate-in slide-in-from-top-2">
                       <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-[#CCA761] mb-1.5 block">Permanent Access Token</label>
                          <input value={tempApiKey} onChange={e => setTempApiKey(e.target.value)} type="password" placeholder="EAAB..." className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[#CCA761]/50 font-mono" />
                       </div>
                       <div>
                          <label className="text-[10px] font-black uppercase tracking-widest text-[#CCA761] mb-1.5 block">Phone Number ID | WABA ID</label>
                          <input value={tempModel} onChange={e => setTempModel(e.target.value)} type="text" placeholder="ID_DO_NUMERO|ID_DA_CONTA" className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-[#CCA761]/50" />
                       </div>
                       <div className="flex gap-2 pt-2">
                          <button onClick={() => setEditingProvider(null)} className="flex-1 py-2 text-[10px] font-black uppercase text-gray-500 hover:text-white">Cancelar</button>
                          <button onClick={handleSaveIntegration} className="flex-1 py-2 bg-[#CCA761] text-black text-[10px] font-black uppercase rounded-lg hover:bg-white transition-all shadow-[0_0_15px_rgba(204,167,97,0.2)]">Salvar Config</button>
                       </div>
                    </div>
                  ) : getIntegration('meta_cloud')?.status === 'connected' ? (
                    <div className="space-y-2 mb-6 text-xs font-medium bg-[#25D366]/5 p-4 rounded-xl border border-[#25D366]/20 backdrop-blur-sm">
                      <div className="flex items-center gap-3 text-green-400">
                        <CheckCircle2 size={14} /> Conectado e operando
                      </div>
                      <div className="text-gray-500 text-[10px] mt-1 truncate">ID do Número: {getIntegration('meta_cloud')?.instance_name?.split('|')[0]}</div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => { setEditingProvider('meta_cloud'); setTempApiKey(""); setTempModel(""); }}
                      className="relative z-10 w-full bg-gradient-to-r from-[#CCA761] to-[#b89552] hover:opacity-90 text-black flex items-center justify-center gap-3 px-6 py-3.5 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all shadow-[0_0_20px_rgba(204,167,97,0.3)] active:scale-95"
                    >
                      <Plus size={16} /> Configurar API Oficial
                    </button>
                  )}
               </div>
            </div>
            
            {/* WHATSAPP (EVOLUTION) CARD INCORPORADO */}
            <div className={`relative flex flex-col justify-between p-6 border rounded-2xl transition-all duration-300 ${
              evoStep === 'CONNECTED' ? 'bg-[#0f2e1a] border-[#25D366]/40 shadow-[0_0_30px_rgba(37,211,102,0.1)]' : 'bg-[#0f0f0f] border-white/10 shadow-xl'
            }`}>
               
               <div className="flex justify-between items-start mb-6">
                  <div>
                     <div className={`w-12 h-12 rounded-xl flex items-center justify-center border mb-4 ${
                       evoStep === 'CONNECTED' ? 'bg-[#25D366]/20 border-[#25D366] text-[#25D366]' : 'bg-white/5 border-white/10 text-gray-400'
                     }`}>
                        <QrCode size={22} />
                     </div>
                     <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                        WhatsApp API 
                        <span className="text-[10px] bg-white/10 text-gray-300 px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">Evolution</span>
                     </h3>
                     <p className="text-xs text-gray-400 mt-2">Sincronizador Oficial do Cérebro MAYUS com o seu servidor Baileys WhatsApp Web.</p>
                  </div>
                  
                  {evoStep === 'CONNECTED' && (
                     <button onClick={() => { setIsEvoEditing(!isEvoEditing) }} className="p-2 bg-gray-200 dark:bg-black/40 hover:bg-gray-200 dark:bg-black/60 rounded-lg text-gray-400 hover:text-white border border-transparent hover:border-white/10 transition-colors">
                        <Settings size={18} />
                     </button>
                  )}
               </div>

               {/* ESTADOS DO WHATSAPP */}
               
               {/* 1. CONFIGURAÇÃO */}
               {(evoStep === "CONFIG" || isEvoEditing) && (
                  <div className="bg-gray-50 dark:bg-[#141414] rounded-xl p-5 border border-white/5 space-y-4 animate-in fade-in">
                     {evoError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-3">
                           <AlertCircle className="text-red-500 shrink-0" size={16} />
                           <p className="text-xs text-red-500 font-medium">{evoError}</p>
                        </div>
                     )}
                     
                     <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-[#CCA761] mb-1.5 block">Nome da Instância</label>
                        <input value={evoName} onChange={e => setEvoName(e.target.value)} type="text" placeholder="MAYUS2" className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#CCA761]/50 placeholder:text-gray-600 transition-colors" />
                     </div>
                     <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-[#CCA761] mb-1.5 block">URL Base (Apenas Raiz)</label>
                        <input value={evoUrl} onChange={e => setEvoUrl(e.target.value)} type="text" placeholder="https://api..." className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#CCA761]/50 placeholder:text-gray-600 transition-colors" />
                     </div>
                     <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-[#CCA761] mb-1.5 block">Global API Key (A Senha)</label>
                        <div className="relative">
                           <input type={showKey['evo'] ? "text" : "password"} value={evoKey} onChange={e => setEvoKey(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-lg pl-4 pr-10 py-2.5 text-sm text-white focus:outline-none focus:border-[#CCA761]/50 placeholder:text-gray-600 transition-colors font-mono" />
                           <button onClick={() => toggleShow('evo')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-white"><Eye size={16} /></button>
                        </div>
                     </div>
                     
                     <div className="pt-2">
                        <button onClick={handleConnectLocalEvo} disabled={evoLoading} className="w-full py-3 bg-[#CCA761] hover:bg-[#b89554] text-black font-black uppercase text-[11px] tracking-widest rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50">
                           {evoLoading ? <><Loader2 size={16} className="animate-spin" /> Processando Tráfego...</> : <><QrCode size={16} /> Gravar & Iniciar Conexão</>}
                        </button>
                     </div>
                  </div>
               )}

               {/* 2. QR CODE */}
               {evoStep === "QRCODE" && (
                  <div className="flex flex-col items-center bg-gray-50 dark:bg-[#141414] rounded-xl p-6 border border-white/10 text-center animate-in zoom-in-95 duration-500">
                     <p className="text-xs text-gray-400 mb-4 tracking-wide">Abra o WhatsApp e aponte a câmera (Dispositivos Conectados)</p>
                     <div className="bg-white p-3 rounded-xl border-[4px] border-[#CCA761]/30 mb-5 shadow-[0_0_30px_rgba(204,167,97,0.15)] relative">
                        {evoQr ? (
                           <Image src={evoQr} alt="QR Code" width={200} height={200} className="rounded" unoptimized />
                        ) : (
                           <div className="w-[200px] h-[200px] bg-gray-100 animate-pulse rounded" />
                        )}
                        <div className="absolute inset-0 border-2 border-[#CCA761] rounded-xl mix-blend-overlay opacity-50" />
                     </div>
                     <button onClick={() => checkEvoStatus(evoUrl, evoName, evoKey)} className="w-full py-2.5 bg-[#111] hover:bg-white/5 border border-white/10 text-white font-bold uppercase text-[10px] tracking-widest rounded-lg flex items-center justify-center gap-2 transition-colors">
                        <Zap size={14} className="text-[#CCA761]" /> Verificar Status do Escaneamento
                     </button>
                  </div>
               )}

               {/* 3. CONNECTED */}
                {evoStep === "CONNECTED" && !isEvoEditing && (
                   <div className="bg-gray-50 dark:bg-[#141414] rounded-xl p-5 border border-[#25D366]/30 animate-in fade-in flex items-center justify-between">
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full border-2 border-[#25D366] bg-[#25D366]/10 flex items-center justify-center relative">
                           <CheckCircle2 size={24} className="text-[#25D366]" />
                           <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#25D366] rounded-full border-[3px] border-[#0a0a0a]" />
                        </div>
                        <div>
                           <p className="text-sm font-bold text-white mb-0.5">{evoName}</p>
                           <p className="text-[10px] text-[#25D366] uppercase tracking-widest font-black">Online & Espelhado Sincronicamente</p>
                        </div>
                     </div>
                     <div className="text-xs text-gray-400 font-mono opacity-50">API v2</div>
                   </div>
                )}
             </div>

            <div className={`relative flex flex-col justify-between p-6 border rounded-2xl transition-all duration-300 ${
              googleDrive.connected ? 'bg-[#0b1220] border-[#4285F4]/40 shadow-[0_0_30px_rgba(66,133,244,0.12)]' : 'bg-[#0f0f0f] border-white/10 shadow-xl'
            }`}>
              <div className="flex justify-between items-start gap-4 mb-6">
                <div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center border mb-4 ${
                    googleDrive.connected ? 'bg-[#4285F4]/15 border-[#4285F4]/40' : 'bg-white/5 border-white/10'
                  }`}>
                    <GoogleDriveLogo size={24} className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                    Google Drive
                    <span className="text-[10px] bg-white/10 text-gray-300 px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">Documentos</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-2 max-w-lg">
                    Conecte o Drive do escritório para criar pastas por processo e preencher o link automaticamente dentro do card jurídico.
                  </p>
                </div>

                <div className={`text-[10px] px-3 py-1 rounded-full uppercase tracking-widest font-black border ${
                  googleDrive.connected
                    ? 'bg-[#4285F4]/15 border-[#4285F4]/30 text-[#8ab4ff]'
                    : googleDrive.available
                      ? 'bg-white/5 border-white/10 text-gray-500'
                      : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                }`}>
                  {googleDrive.connected ? 'Conectado' : googleDrive.available ? 'Pronto para conectar' : 'Configuração pendente'}
                </div>
              </div>

              {googleDriveLoading ? (
                <div className="bg-gray-50 dark:bg-[#141414] rounded-xl p-5 border border-white/5 flex items-center gap-3 text-sm text-gray-400">
                  <Loader2 size={16} className="animate-spin text-[#4285F4]" /> Carregando estado do Google Drive...
                </div>
              ) : !googleDrive.available ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 text-sm text-amber-100 leading-relaxed">
                  Configure `GOOGLE_DRIVE_CLIENT_ID` e `GOOGLE_DRIVE_CLIENT_SECRET` no servidor para habilitar a conexão oficial com o Google Drive.
                </div>
              ) : !googleDrive.connected ? (
                <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-[#141414] rounded-xl p-5 border border-white/5 text-xs text-gray-400 leading-relaxed">
                    A integração usa OAuth oficial do Google. Depois de conectada, qualquer processo pode gerar sua própria pasta com um clique.
                  </div>
                  <button
                    type="button"
                    onClick={handleConnectGoogleDrive}
                    className="w-full py-3 bg-[#4285F4] hover:bg-[#5b95ff] text-white font-black uppercase text-[11px] tracking-widest rounded-lg flex items-center justify-center gap-2 transition-all"
                  >
                    <FolderOpen size={16} /> Conectar conta Google
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-[#141414] rounded-xl p-4 border border-white/5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Conta conectada</p>
                      <p className="text-sm font-semibold text-white break-all">{googleDrive.connectedEmail || "Conta autenticada"}</p>
                    </div>
                    <div className="bg-gray-50 dark:bg-[#141414] rounded-xl p-4 border border-white/5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Destino padrão</p>
                      <p className="text-sm font-semibold text-white">{googleDrive.rootFolderName || "Raiz do Drive"}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-[#8ab4ff] block">Pasta raiz padrão (opcional)</label>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={googleDriveRootInput}
                        onChange={(event) => setGoogleDriveRootInput(event.target.value)}
                        placeholder="Cole o link ou ID da pasta do escritório"
                        className="flex-1 bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#4285F4]/50 placeholder:text-gray-600 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={handleSaveGoogleDriveRoot}
                        disabled={googleDriveBusy === "save"}
                        className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-black uppercase tracking-widest text-white disabled:opacity-60 flex items-center justify-center gap-2"
                      >
                        {googleDriveBusy === "save" ? <Loader2 size={14} className="animate-spin" /> : null}
                        Salvar pasta
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      Quando definida, novas pastas de processos serão criadas dentro dessa estrutura automaticamente.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    {googleDrive.rootFolderUrl && (
                      <a
                        href={googleDrive.rootFolderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-black uppercase tracking-widest text-white flex items-center justify-center gap-2 transition-colors"
                      >
                        <ExternalLink size={14} /> Abrir pasta raiz
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={handleDisconnectGoogleDrive}
                      disabled={googleDriveBusy === "disconnect"}
                      className="flex-1 py-2.5 bg-red-500/10 hover:bg-red-500/15 border border-red-500/20 rounded-lg text-xs font-black uppercase tracking-widest text-red-300 disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
                    >
                      {googleDriveBusy === "disconnect" ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                      Desconectar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* INSTAGRAM GRAPH CARD */}
            <div className={`relative flex flex-col justify-between bg-gradient-to-br from-[#111111] via-[#0a0a0a] to-[#050505] p-6 border rounded-2xl transition-all duration-500 overflow-hidden ${
              getIntegration('instagram')?.status === 'connected' ? 'border-pink-500/40 shadow-[0_20px_40px_rgba(236,72,153,0.08)]' : 'border-white/5 hover:border-pink-500/20'
            }`}>
              <div className="absolute top-0 right-0 w-40 h-40 bg-pink-500/5 rounded-bl-full blur-3xl pointer-events-none" />
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-2 text-white">
                  <div>
                    <div className="bg-pink-500/10 w-12 h-12 rounded-xl flex items-center justify-center border border-pink-500/30 mb-4 shadow-[inset_0_0_15px_rgba(236,72,153,0.2)]">
                      <Instagram size={22} className="text-pink-500" />
                    </div>
                    <h3 className="text-xl font-black tracking-tight italic flex items-center gap-2">
                      Instagram Graph
                      <span className="text-[10px] bg-white/10 text-gray-300 px-2 py-0.5 rounded-full uppercase tracking-widest font-bold">Comentários + Direct</span>
                    </h3>
                  </div>
                  {getIntegration('instagram')?.status === 'connected' && editingProvider !== 'instagram' && (
                    <button onClick={() => { setEditingProvider('instagram'); setTempApiKey(''); setTempModel(getIntegration('instagram')?.instance_name || ''); }} className="p-2 border border-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                      <Settings size={18} />
                    </button>
                  )}
                </div>

                <p className="text-gray-400 text-xs leading-relaxed mb-4">
                  Receba comentários de posts, identifique palavras-chave e entregue links ou arquivos pelo Direct com trilha de idempotência.
                </p>

                {editingProvider === 'instagram' ? (
                  <div className="space-y-4 bg-white/5 p-5 rounded-xl border border-white/10 animate-in slide-in-from-top-2">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-pink-500 mb-1.5 block">Token Permanente da Meta</label>
                      <input value={tempApiKey} onChange={e => setTempApiKey(e.target.value)} type="password" placeholder="EAAB..." className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500/50 font-mono" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-pink-500 mb-1.5 block">Instagram Business Account ID | Page ID opcional</label>
                      <input value={tempModel} onChange={e => setTempModel(e.target.value)} type="text" placeholder="IG_BUSINESS_ID|PAGE_ID" className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-pink-500/50" />
                      <p className="text-[10px] text-gray-500 mt-2">Use o ID da conta profissional do Instagram. Se o webhook enviar Page ID no entry.id, adicione depois de uma barra vertical.</p>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button onClick={() => setEditingProvider(null)} className="flex-1 py-2 text-[10px] font-black uppercase text-gray-500 hover:text-white">Cancelar</button>
                      <button onClick={handleSaveIntegration} className="flex-1 py-2 bg-pink-500 text-white text-[10px] font-black uppercase rounded-lg hover:bg-pink-400 transition-all">Salvar Instagram</button>
                    </div>
                  </div>
                ) : getIntegration('instagram')?.status === 'connected' ? (
                  <div className="space-y-2 mb-1 text-xs font-medium bg-pink-500/5 p-4 rounded-xl border border-pink-500/20 backdrop-blur-sm">
                    <div className="flex items-center gap-3 text-pink-400">
                      <CheckCircle2 size={14} /> Instagram conectado
                    </div>
                    <div className="text-gray-500 text-[10px] mt-1 truncate">IG Business ID: {getIntegration('instagram')?.instance_name}</div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingProvider('instagram'); setTempApiKey(''); setTempModel(''); }}
                    className="relative z-10 w-full border border-pink-500/30 bg-pink-500/5 hover:bg-pink-500/10 text-pink-500 flex items-center justify-center gap-2 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all"
                  >
                    <Plus size={14} /> Configurar Instagram Graph
                  </button>
                )}
              </div>
            </div>

            {/* INSTAGRAM AUTOMATION CARD */}
            <div className={`relative flex flex-col justify-between bg-gradient-to-br from-[#111111] via-[#0a0a0a] to-[#050505] p-6 border rounded-2xl transition-all duration-500 overflow-hidden ${
               getIntegration('instagram')?.status === 'connected' ? 'border-pink-500/40 shadow-[0_20px_40px_rgba(236,72,153,0.05)]' : 'border-white/5'
            }`}>
               <div className="absolute top-0 right-0 w-40 h-40 bg-pink-500/5 rounded-bl-full blur-3xl pointer-events-none" />
               <div className="relative z-10">
                  <div className="bg-pink-500/10 w-12 h-12 rounded-xl flex items-center justify-center border border-pink-500/30 mb-4 shadow-[inset_0_0_15px_rgba(236,72,153,0.2)]">
                     <Instagram size={22} className="text-pink-500" />
                  </div>
                  <div className="flex justify-between items-start mb-2 text-white">
                    <h3 className="text-xl font-black tracking-tight italic">Instagram Automation</h3>
                  </div>
                  <p className="text-gray-400 text-xs leading-relaxed mb-6">
                    Responda comentários e envie arquivos automaticamente via palavra-chave no Direct.
                  </p>

                  {/* LISTA DE AUTOMAÇÕES */}
                  <div className="space-y-3 mb-6">
                     {instagramAutomations.map(auto => (
                       <div key={auto.id} className="group bg-white/5 border border-white/10 rounded-xl p-3 flex justify-between items-center hover:border-pink-500/30 transition-all">
                          <div>
                              <p className="text-[10px] font-black uppercase text-pink-500">Palavra: &quot;{auto.keyword}&quot;</p>
                             <p className="text-xs text-gray-300 mt-1 truncate max-w-[200px]">{auto.response_text}</p>
                          </div>
                          <button onClick={() => handleDeleteInstaAutomation(auto.id)} className="p-2 text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                             <X size={14} />
                          </button>
                       </div>
                     ))}
                  </div>

                  {isAddingInsta ? (
                     <div className="space-y-4 bg-white/5 p-4 rounded-xl border border-white/10 animate-in slide-in-from-top-2">
                       <div className="grid grid-cols-2 gap-3">
                          <div>
                             <label className="text-[9px] font-black uppercase tracking-widest text-pink-500 mb-1 block">Palavra-Chave</label>
                             <input value={newInstaKeyword} onChange={e => setNewInstaKeyword(e.target.value)} placeholder="Ex: PDF" className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-pink-500/50" />
                          </div>
                          <div>
                             <label className="text-[9px] font-black uppercase tracking-widest text-pink-500 mb-1 block">Link do Arquivo</label>
                             <input value={newInstaFile} onChange={e => setNewInstaFile(e.target.value)} placeholder="https://..." className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-pink-500/50" />
                          </div>
                       </div>
                       <div>
                          <label className="text-[9px] font-black uppercase tracking-widest text-pink-500 mb-1 block">Resposta no Post (Público)</label>
                          <input value={newInstaResponse} onChange={e => setNewInstaResponse(e.target.value)} placeholder="Enviamos no seu Direct!" className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-pink-500/50" />
                       </div>
                       <div>
                          <label className="text-[9px] font-black uppercase tracking-widest text-pink-500 mb-1 block">Mensagem no Direct</label>
                          <textarea value={newInstaDM} onChange={e => setNewInstaDM(e.target.value)} placeholder="Aqui está seu material..." className="w-full bg-black border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-pink-500/50 h-20 resize-none" />
                       </div>
                       <div className="flex gap-2">
                          <button onClick={() => setIsAddingInsta(false)} className="flex-1 py-2 text-[10px] font-black uppercase text-gray-500">Cancelar</button>
                          <button onClick={handleSaveInstaAutomation} className="flex-1 py-2 bg-pink-500 text-white text-[10px] font-black uppercase rounded-lg">Salvar</button>
                       </div>
                     </div>
                  ) : (
                     <button
                       onClick={() => setIsAddingInsta(true)}
                       className="w-full border border-pink-500/30 bg-pink-500/5 hover:bg-pink-500/10 text-pink-500 flex items-center justify-center gap-2 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all"
                     >
                       <Plus size={14} /> Nova Automação de Comentário
                     </button>
                  )}
               </div>
            </div>

          </div>
        </div>
          

        {/* COLUNA DIREITA: INTELLIGÊNCIA ARTIFICIAL (LLMs) */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold border-b border-white/10 pb-3 flex items-center gap-2">
            <Bot className="text-[#CCA761]" size={22} />
            Mecanismos Virtuais (IAs)
          </h2>
          
          <div className="grid grid-cols-1 gap-4">
             {providers.map(p => {
               const saved = getIntegration(p.id);
               const isConnected = saved?.status === 'connected' && saved?.has_api_key;
               const isEditing = editingProvider === p.id;
               
               return (
                 <div key={p.id} className={"bg-[#0f0f0f] border rounded-2xl p-5 transition-all duration-300 " + (isConnected ? "border-[#CCA761]/30" : "border-white/5 hover:border-white/10")}>
                   <div className="flex justify-between items-start">
                     <div className="flex items-center gap-3">
                       <div className={"w-12 h-12 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 overflow-hidden " + p.color}>
                         <p.icon size={24} />
                       </div>
                       <div>
                         <h3 className="font-bold flex items-center gap-2">
                           {p.name}
                           {isConnected && <span className="bg-green-500/20 text-green-400 text-[10px] px-2 py-0.5 rounded-full uppercase truncate font-bold">Conectado</span>}
                         </h3>
                         <p className="text-xs text-gray-500 mt-1">{p.desc}</p>
                       </div>
                     </div>
                     {!isEditing && (
                        <button onClick={() => { setEditingProvider(p.id); setTempApiKey(""); setTempModel(saved?.instance_name || p.models?.[0] || ""); }} className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors">
                         {isConnected ? <Settings size={18} /> : <Plus size={18} />}
                       </button>
                     )}
                   </div>

                   {isEditing && (
                     <div className="mt-6 animate-in fade-in border-t border-white/5 pt-6">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                           <label className="text-[10px] font-semibold text-gray-400 mb-2 block uppercase tracking-wider">Secret API Key</label>
                           <div className="relative">
                             <input type={showKey[p.id] ? "text" : "password"} value={tempApiKey} onChange={(e) => setTempApiKey(e.target.value)} className="w-full bg-[#111] border border-white/10 rounded-lg pl-3 pr-10 py-2.5 text-sm focus:border-[#CCA761] outline-none font-mono text-gray-200" />
                             <button onClick={() => toggleShow(p.id)} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-white"><Eye size={16} /></button>
                           </div>
                         </div>
                         
                         <div>
                            <label className="text-[10px] font-semibold text-gray-400 mb-2 block uppercase tracking-wider">Modelo Específico</label>
                             <input list={`models-${p.id}`} value={tempModel} onChange={(e) => setTempModel(e.target.value)} placeholder={p.models?.[0] || "Ex: gpt-4o"} className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm focus:border-[#CCA761] outline-none text-gray-200" />
                             <datalist id={`models-${p.id}`}>{p.models?.map(m => <option key={m} value={m} />)}</datalist>
                          </div>
                       </div>
                       
                       <div className="flex justify-end gap-3 mt-6">
                          <button onClick={() => setEditingProvider(null)} className="text-xs font-bold px-4 py-2 text-gray-400 hover:text-white">Cancelar</button>
                          <button onClick={handleSaveIntegration} className="text-xs font-bold px-5 py-2 rounded-lg bg-[#CCA761] hover:bg-[#b89552] text-black">Salvar Chave</button>
                       </div>
                     </div>
                   )}
                 </div>
               );
             })}
          </div>
        </div>

      </div>
    </div>
  );
}
