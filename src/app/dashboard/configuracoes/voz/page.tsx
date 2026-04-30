"use client";

import { useState, useEffect } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Volume2, Save, Loader2, Bot, Zap, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

export default function VozConfiguracoesPage() {
  const { role, isLoading: profileLoading } = useUserProfile();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // States
  const [provider, setProvider] = useState<"openai" | "elevenlabs">("openai");
  const [openAiVoice, setOpenAiVoice] = useState("nova");
  const [elevenApi, setElevenApi] = useState("");
  const [elevenVoiceId, setElevenVoiceId] = useState("");
  const [elevenAgentId, setElevenAgentId] = useState("");
  const [isElevenConfigured, setIsElevenConfigured] = useState(false);

  useEffect(() => {
    if (!profileLoading) {
      if (role === "admin" || role === "socio" || role === "Sócio" || role === "Administrador") {
        loadData();
      } else {
        setIsLoading(false);
      }
    }
  }, [role, profileLoading]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/agent/voice");
      if (!res.ok) throw new Error("Erro ao carregar dados");
      const data = await res.json();
      
      setProvider(data.voice_provider);
      setOpenAiVoice(data.openai_voice);
      setIsElevenConfigured(data.elevenlabs_configured);
      setElevenVoiceId(data.elevenlabs_voice_id);
      setElevenAgentId(data.elevenlabs_agent_id || "");
    } catch (error) {
      toast.error("Erro ao carregar configurações de voz.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: any = {
        provider,
        openai_voice: openAiVoice,
        elevenlabs_voice_id: elevenVoiceId,
        elevenlabs_agent_id: elevenAgentId,
      };

      // Só trafegamos a API Key se houver digitação (ou limitação para remover a key)
      if (elevenApi.trim() !== "") {
        payload.elevenlabs_api_key = elevenApi;
      }

      const res = await fetch("/api/agent/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Falha ao salvar");
      toast.success("Configurações de voz salvas com sucesso!");
      
      // Reload para atualizar o estado e limpar a API key digitada
      loadData();
      setElevenApi("");
    } catch (error) {
      toast.error("Falha ao salvar as configurações.");
    } finally {
      setIsSaving(false);
    }
  };

  if (profileLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="animate-spin text-[#CCA761]" size={32} />
      </div>
    );
  }

  if (role !== "admin" && role !== "socio" && role !== "Sócio" && role !== "Administrador") {
    return (
      <div className="p-10 text-center animate-in fade-in">
        <h2 className={`text-2xl font-bold text-red-500 mb-2 ${cormorant.className}`}>Acesso Restrito</h2>
        <p className="text-gray-400">Você não tem autorização para manipular os módulos vocais do Córtex.</p>
      </div>
    );
  }

  return (
    <div className={`p-6 max-w-4xl mx-auto space-y-8 animate-in fade-in py-10 ${montserrat.className}`}>
      {/* HEADER */}
      <div>
        <h1 className={`text-4xl font-black text-white italic tracking-wide ${cormorant.className}`}>
          Voz do <span className="text-[#CCA761]">MAYUS</span>
        </h1>
        <p className="text-gray-400 mt-2 text-sm leading-relaxed max-w-2xl">
          Configure a personalidade vocal da inteligência do sistema. Escolha o sintetizador preferido para operar com o Orb Neural.
        </p>
      </div>

      <div className="grid gap-6">
        {/* SELETOR DE PROVIDER */}
        <div className="bg-[#0f0f0f] border border-white/10 rounded-2xl p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Volume2 className="text-[#CCA761]" size={20} /> Provedor de Síntese Vocal (TTS)
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div 
              onClick={() => setProvider("openai")}
              className={`cursor-pointer p-5 rounded-xl border transition-all duration-300 ${provider === "openai" ? "bg-[#10a37f]/10 border-[#10a37f] shadow-[0_0_20px_rgba(16,163,127,0.1)]" : "bg-gray-50 dark:bg-[#141414] border-white/5 hover:border-white/10"}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Bot size={24} className={provider === "openai" ? "text-[#10a37f]" : "text-gray-500"} />
                <h3 className={`font-bold ${provider === "openai" ? "text-white" : "text-gray-400"}`}>OpenAI TTS-1</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Recomendado. Rápido, natural e já integrado com a chave principal. Usa o modelo tts-1 oficial para baixa latência.
              </p>
            </div>

            <div 
              onClick={() => setProvider("elevenlabs")}
              className={`cursor-pointer p-5 rounded-xl border transition-all duration-300 ${provider === "elevenlabs" ? "bg-white/10 border-white shadow-[0_0_20px_rgba(255,255,255,0.05)]" : "bg-gray-50 dark:bg-[#141414] border-white/5 hover:border-white/10"}`}
            >
              <div className="flex items-center gap-3 mb-2">
                <Zap size={24} className={provider === "elevenlabs" ? "text-white" : "text-gray-500"} />
                <h3 className={`font-bold ${provider === "elevenlabs" ? "text-white" : "text-gray-400"}`}>ElevenLabs (Premium)</h3>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Opção de altíssima fidelidade. Exige chave de API separada e Voice ID específico configurado na plataforma.
              </p>
            </div>
          </div>
        </div>

        {/* CONFIGURAÇÕES OPENAI */}
        {provider === "openai" && (
          <div className="bg-gray-50 dark:bg-[#141414] border border-[#10a37f]/30 rounded-2xl p-6 animate-in slide-in-from-top-2">
            <h3 className="text-sm font-black uppercase tracking-widest text-[#10a37f] mb-4">Ajustes — OpenAI</h3>
            <div>
               <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 block">Selecione o Timbre (Voice)</label>
               <select 
                  value={openAiVoice} 
                  onChange={e => setOpenAiVoice(e.target.value)}
                  className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#10a37f]"
               >
                 {OPENAI_VOICES.map(v => (
                   <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                 ))}
               </select>
               <p className="text-xs text-gray-500 mt-2">Dica: &quot;nova&quot; ou &quot;alloy&quot; tendem a ser as vozes mais polidas.</p>
            </div>
          </div>
        )}

        {/* CONFIGURAÇÕES ELEVENLABS */}
        {provider === "elevenlabs" && (
          <div className="bg-gray-50 dark:bg-[#141414] border border-white/30 rounded-2xl p-6 animate-in slide-in-from-top-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-white">Ajustes — ElevenLabs</h3>
              {isElevenConfigured && (
                 <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#CCA761] bg-[#CCA761]/10 px-2.5 py-1 rounded-lg border border-[#CCA761]/30">
                   <CheckCircle2 size={12} /> API Configurada
                 </span>
              )}
            </div>
            
            <div>
               <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 block">Nova API Key (xi-api-key) — Opcional se já configurada</label>
               <input 
                 type="password"
                 value={elevenApi} 
                 onChange={e => setElevenApi(e.target.value)}
                 placeholder={isElevenConfigured ? "Deixe em branco para manter a atual..." : "sk_..."}
                 className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#CCA761] font-mono"
               />
            </div>
            
            <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 block">Voice ID (Sintetizador Estático)</label>
                <input 
                  type="text"
                  value={elevenVoiceId} 
                  onChange={e => setElevenVoiceId(e.target.value)}
                  placeholder="EX: 21m00Tcm4llvDq8ikGAP..."
                  className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#CCA761] font-mono"
                />
                <p className="text-[10px] text-gray-500 mt-2">Dica: Este é o ID alfanumérico da voz no ElevenLabs.</p>
             </div>

             <div className="bg-[#CCA761]/5 border border-[#CCA761]/20 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                   <label className="text-[10px] font-black uppercase tracking-widest text-[#CCA761] block">MODO AGENTE (Gargalhadas & Humor)</label>
                   <div className="bg-[#CCA761] text-black text-[8px] font-bold px-2 py-0.5 rounded uppercase">Experimental</div>
                </div>
                <input 
                  type="text"
                  value={elevenAgentId} 
                  onChange={e => setElevenAgentId(e.target.value)}
                  placeholder="EX: agent_2601kmdr9rfpf51apgwxqm9pe01k..."
                  className="w-full bg-[#000] border border-[#CCA761]/30 rounded-lg px-4 py-2.5 text-sm text-[#CCA761] focus:outline-none focus:border-[#CCA761] font-mono placeholder:text-[#CCA761]/30"
                />
                <p className="text-[10px] text-[#CCA761]/70 leading-relaxed italic">
                  * Ao configurar um Agent ID, o Orb passará a usar o cérebro e a expressividade total da ElevenLabs (incluindo humor e reações humanas).
                </p>
             </div>
          </div>
        )}

        {/* AÇÕES */}
        <div className="flex justify-end pt-4">
          <button 
            onClick={handleSave} 
            disabled={isSaving}
            className="bg-[#CCA761] hover:bg-white text-black py-3 px-8 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(204,167,97,0.3)] disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {isSaving ? "Salvando..." : "Salvar Configurações"}
          </button>
        </div>
      </div>
    </div>
  );
}
