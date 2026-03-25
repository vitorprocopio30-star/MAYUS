"use client";

import { useState, useEffect, useRef } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { Send, Bot, User, BrainCircuit, Sparkles, Loader2, KeyRound, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import Link from "next/link";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600"] });

interface Message {
  role: "system" | "user" | "model";
  content: string;
}

export default function MAYUSPlayground() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiKeyData, setApiKeyData] = useState<{ provider: string, key: string, model: string } | null>(null);
  const [availableIntegrations, setAvailableIntegrations] = useState<{ provider: string, key: string, model: string }[]>([]);
  const [checkingVault, setCheckingVault] = useState(true);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const { profile, isLoading: profileLoading } = useUserProfile();

  useEffect(() => {
    if (!profileLoading) {
      if (profile?.tenant_id) {
        loadApiKey();
      } else {
        setCheckingVault(false);
      }
    }
  }, [profile?.tenant_id, profileLoading]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const loadApiKey = async () => {
    setCheckingVault(true);
    try {
      const { data: integrations, error } = await supabase
        .from("tenant_integrations")
        .select("provider, api_key, instance_name")
        .eq("tenant_id", profile!.tenant_id)
        .eq("status", "connected");

      if (error) {
        console.error("Erro ao buscar integrações:", error);
      }

      if (integrations && integrations.length > 0) {
         const mappedIntegrations = integrations.map(i => ({ 
             provider: i.provider, 
             key: i.api_key, 
             model: i.instance_name || (i.provider === 'openai' ? 'gpt-3.5-turbo' : i.provider === 'gemini' ? 'gemini-1.5-flash' : i.provider === 'anthropic' ? 'claude-3-5-sonnet-20240620' : 'openrouter/auto')
         })).filter(i => i.key);
         
         setAvailableIntegrations(mappedIntegrations);

         const openrouter = integrations.find(i => i.provider === 'openrouter');
         const openai = integrations.find(i => i.provider === 'openai');
         const gemini = integrations.find(i => i.provider === 'gemini');
         const anthropic = integrations.find(i => i.provider === 'anthropic');

         if (openrouter && openrouter.api_key) setApiKeyData({ provider: 'openrouter', key: openrouter.api_key, model: openrouter.instance_name || "openrouter/auto" });
         else if (openai && openai.api_key) setApiKeyData({ provider: 'openai', key: openai.api_key, model: openai.instance_name || "gpt-3.5-turbo" });
         else if (anthropic && anthropic.api_key) setApiKeyData({ provider: 'anthropic', key: anthropic.api_key, model: anthropic.instance_name || "claude-3-5-sonnet-20240620" });
         else if (gemini && gemini.api_key) setApiKeyData({ provider: 'gemini', key: gemini.api_key, model: gemini.instance_name || "gemini-1.5-flash" });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingVault(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !apiKeyData) return;

    let userMsg = input.trim();
    let currentModel = apiKeyData.model;
    let currentProvider = apiKeyData.provider;
    let currentKey = apiKeyData.key;

    if (userMsg.startsWith('/')) {
      const parts = userMsg.split(' ');
      const command = parts[0].substring(1).toLowerCase(); // remove a barra '/'
      
      const targetProvider = availableIntegrations.find(i => i.provider.toLowerCase() === command);
      
      if (targetProvider) {
        // Mudar provedor
        currentProvider = targetProvider.provider;
        currentKey = targetProvider.key;
        currentModel = targetProvider.model;
        
        setApiKeyData({ provider: currentProvider, key: currentKey, model: currentModel });
        
        userMsg = parts.slice(1).join(' ').trim();
        
        if (!userMsg) {
          setMessages(prev => [...prev, { role: "system", content: `Aviso do Córtex: A IA passará a operar pelo Córtex principal do provedor "${currentProvider.toUpperCase()}" (Modelo Base: ${currentModel}).` }]);
          setInput("");
          return;
        }
      } else {
        // Mudar apenas o modelo (mesmo provedor)
        currentModel = command;
        setApiKeyData(prev => prev ? { ...prev, model: currentModel } : null);
        
        userMsg = parts.slice(1).join(' ').trim();
        
        if (!userMsg) {
          setMessages(prev => [...prev, { role: "system", content: `Aviso do Córtex: O provedor ${currentProvider.toUpperCase()} passará a operar pelo modelo "${currentModel}".` }]);
          setInput("");
          return;
        }
      }
    }

    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          provider: currentProvider,
          apiKey: currentKey,
          model: currentModel,
          history: messages.filter(m => m.role !== 'system')
        })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "A IA não conseguiu responder.");

      // Divisão de parágrafos em múltiplas mensagens para não ficar um texto gigante
      const replyChunks = data.reply.split(/\n\n+/).filter((c: string) => c.trim().length > 0);
      
      const newMessages: Message[] = replyChunks.map((chunk: string) => ({
        role: "model",
        content: chunk.trim()
      }));

      setMessages(prev => [...prev, ...newMessages]);
    } catch (err: any) {
      toast.error(err.message);
      setMessages(prev => [...prev, { role: "system", content: "Erro Crítico: A conexão com o córtex falhou." }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingVault) {
    return <div className="p-8 flex items-center justify-center animate-pulse text-[#CCA761]">Acessando Cofre de Chaves...</div>;
  }

  if (!apiKeyData) {
    return (
      <div className={`p-6 max-w-4xl mx-auto mt-20 text-center animate-fade-in-up ${montserrat.className}`}>
        <div className="w-24 h-24 mx-auto bg-[#CCA761]/10 rounded-full flex items-center justify-center border border-[#CCA761]/30 mb-6">
          <KeyRound size={40} className="text-[#CCA761]" />
        </div>
        <h1 className={`text-5xl text-white mb-4 ${cormorant.className}`}>O MAYUS está Adormecido</h1>
        <p className="text-gray-400 mb-8 max-w-lg mx-auto leading-relaxed">
          Nenhuma chave de IA (OpenAI ou Gemini) foi encontrada no seu cofre seguro. Vá para a página de integrações e conecte uma mente de Inteligência Artificial para dar vida ao MAYUS.
        </p>
        <Link href="/dashboard/configuracoes/integracoes" className="inline-flex items-center gap-2 bg-[#CCA761] text-black font-bold uppercase tracking-widest text-xs px-8 py-4 rounded-xl hover:scale-105 transition-transform">
          Ir para Integrações
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-[calc(100vh-100px)] max-w-5xl mx-auto p-4 ${montserrat.className}`}>
      
      {/* HEADER DO MAYUS */}
      <div className="flex items-center justify-between pb-4 border-b border-[#CCA761]/20 mb-4">
         <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-[#CCA761] to-[#604c26] flex items-center justify-center p-[1px]">
                 <div className="w-full h-full bg-black rounded-full flex items-center justify-center">
                    <BrainCircuit size={24} className="text-[#CCA761]" />
                 </div>
              </div>
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-black" />
            </div>
            <div>
              <h1 className={`text-2xl text-[#CCA761] font-bold ${cormorant.className}`}>MAYUS AI Playground</h1>
              <p className="text-xs text-green-400 flex items-center gap-1 font-bold tracking-widest uppercase">
                <Sparkles size={12} /> Córtex Ativo ({apiKeyData.provider})
              </p>
            </div>
         </div>
         <div className="bg-[#CCA761]/10 border border-[#CCA761]/20 px-4 py-2 flex flex-col items-end rounded-lg text-xs tracking-widest text-[#CCA761] font-bold uppercase transition-all">
           <span>{apiKeyData.provider}</span>
           <span className="text-[9px] text-gray-500 lowercase opacity-80 mt-1 truncate max-w-[150px]">{apiKeyData.model}</span>
         </div>
      </div>

      {/* CHAT AREA */}
      <div className="flex-1 overflow-y-auto hide-scrollbar space-y-6 p-4 rounded-2xl bg-[#0a0a0a]/50 border border-white/5 shadow-inner">
        
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
            <Bot size={60} className="text-[#CCA761] mb-6 animate-pulse" />
            <p className={`text-3xl text-white ${cormorant.className}`}>Olá, Sócio(a).</p>
            <p className="text-gray-400 mt-2 text-sm max-w-md">Sou o MAYUS. Como posso ajudar nas tomadas de decisões do escritório hoje?</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-4 animate-in fade-in slide-in-from-bottom-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
             <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-white/10 text-white' : 'bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30 shadow-[0_0_15px_rgba(204,167,97,0.2)]'}`}>
                {msg.role === 'user' ? <User size={16} /> : (msg.role === 'model' ? <Bot size={16} /> : <AlertCircle size={16} />)}
             </div>
             
             <div className={`p-4 rounded-2xl max-w-[80%] text-sm leading-relaxed whitespace-pre-wrap ${msg.role === 'user' ? 'bg-white/10 text-gray-200 rounded-tr-sm' : (msg.role === 'model' ? 'bg-[#111] text-gray-300 rounded-tl-sm border border-white/5' : 'bg-red-500/10 text-red-400 border border-red-500/30')}`}>
                {msg.content}
             </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex gap-4 animate-pulse">
             <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30">
               <Loader2 size={16} className="animate-spin" />
             </div>
             <div className="bg-[#111] text-gray-400 p-4 rounded-2xl text-xs rounded-tl-sm border border-white/5">
                MAYUS está processando...
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* INPUT BUBBLE */}
      <div className="mt-4 relative">
         <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
           <input
             type="text"
             value={input}
             onChange={(e) => setInput(e.target.value)}
             placeholder="Digite sua mensagem para o MAYUS..."
             className="flex-1 bg-[#141414] border border-white/10 rounded-2xl px-6 py-4 focus:outline-none focus:border-[#CCA761] text-sm text-gray-200 shadow-xl"
             disabled={isLoading}
           />
           <button 
             type="submit" 
             disabled={!input.trim() || isLoading}
             className="bg-[#CCA761] hover:bg-[#b89552] disabled:bg-gray-700 disabled:text-gray-500 text-black px-6 rounded-2xl flex items-center justify-center transition-all active:scale-95 shadow-[0_0_15px_rgba(204,167,97,0.2)] disabled:shadow-none"
           >
             <Send size={20} />
           </button>
         </form>
      </div>

    </div>
  );
}
