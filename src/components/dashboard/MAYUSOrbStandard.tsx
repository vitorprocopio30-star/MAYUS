"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Mic, Waves, Scale, Loader2, Volume2, WifiOff } from "lucide-react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { fetchSafeIntegrations } from "@/lib/integrations/fetch-safe-integrations";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function MAYUSOrbStandard() {
  const { profile } = useUserProfile();
  const [transcribedText, setTranscribedText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceProviderReady, setVoiceProviderReady] = useState(false);
  
  // Memória de Curto Prazo do MAYUS
  const [chatHistory, setChatHistory] = useState<{role: string, content: string}[]>([]);

  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isAutoListeningRef = useRef<boolean>(true); // Controle de loop
  const router = useRouter();

  // Verifica se ha um provedor de voz configurado sem expor segredos no client.
  useEffect(() => {
    if (profile?.tenant_id) {
      const loadVoiceProviders = async () => {
        try {
          const integrations = await fetchSafeIntegrations({ providers: ["openai", "elevenlabs"] });
          const hasReadyProvider = integrations.some(
            (integration) => integration.status === "connected" && integration.has_api_key
          );
          setVoiceProviderReady(hasReadyProvider);
        } catch {
          setVoiceProviderReady(false);
        }
      };
      loadVoiceProviders();
    } else {
      setVoiceProviderReady(false);
    }
  }, [profile?.tenant_id]);

  const startListeningRef = useRef<() => void>();

  const processVoiceInput = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setIsProcessing(true);
    setIsListening(false); 
    setTranscribedText(`Pensando: ${text}`);

    const newHistory = [...chatHistory, { role: "user", content: text }];
    setChatHistory(newHistory);

    try {
      const chatRes = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          provider: "n8n",
          model: "gpt-4o-mini", 
          history: chatHistory,
          tenantId: profile?.tenant_id,
          userId: profile?.id 
        })
      });

      const chatData = await chatRes.json();
      if (!chatRes.ok) throw new Error(chatData.error || "A IA não conseguiu pensar no momento.");

      let finalReplyText = chatData.reply || "";

      if (chatData.tool_calls && chatData.tool_calls.length > 0) {
        for (const tool of chatData.tool_calls) {
           const funcName = tool.function.name;
           if (funcName === "abrir_agenda") {
              toast.info("MAYUS: Operação Concluída. Abrindo Agenda...");
              router.push("/dashboard/agenda");
              if (!finalReplyText) finalReplyText = "Entendido, mestre. A sua agenda diária já está carregada na tela.";
           } else if (funcName === "abrir_agenda_global") {
              toast.info("MAYUS: Operação Concluída. Abrindo Agenda Global...");
              router.push("/dashboard/agenda-global");
              if (!finalReplyText) finalReplyText = "Pronto. A Agenda Global do escritório está aberta.";
           } else if (funcName === "trocar_fundo_tema") {
              toast.message("⚠️ PROTÓCOLO INICIADO", { description: "Sobrescrevendo controles visuais..." });
              const root = document.documentElement;
              if (root.style.filter === "invert(1) hue-rotate(180deg)") {
                 root.style.filter = ""; 
              } else {
                 root.style.filter = "invert(1) hue-rotate(180deg)"; 
              }
           }
        }
      }

      if (!finalReplyText) finalReplyText = "Comando executado.";
      
      setChatHistory(prev => [...prev, { role: "assistant", content: finalReplyText }]);
      setTranscribedText(finalReplyText);

      setIsSpeaking(true);
      const audioUrl = `/api/ai/tts?text=${encodeURIComponent(finalReplyText)}&voice=onyx`;
      const audio = new Audio(audioUrl);
      
      audio.onplay = () => setIsSpeaking(true);
      audio.onended = () => {
         setIsSpeaking(false);
         setTranscribedText(""); 
         if (isAutoListeningRef.current) {
            setTimeout(() => { startListeningRef.current?.(); }, 300);
         }
      };
      await audio.play();

    } catch (err: any) {
      console.error(err);
      toast.error(err.message);
      setIsSpeaking(false);
      setTranscribedText("Falha na comunicação neural.");
    } finally {
      setIsProcessing(false);
    }
  }, [chatHistory, profile?.id, profile?.tenant_id, router]);

  const startListening = useCallback(() => {
    if (!voiceProviderReady) {
      toast.error("O MAYUS precisa de um provedor de voz conectado nas suas Configurações.");
      return;
    }

    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        toast.error("Navegador não suporta gravação de voz.");
        return;
      }

      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false; 
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'pt-BR';

      recognitionRef.current.onstart = () => {
        setIsListening(true);
        setTranscribedText("");
      };

      recognitionRef.current.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
           console.error(`Erro no microfone: ${event.error}`);
        }
        setIsListening(false);
      };

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        setTranscribedText(finalTranscript || interimTranscript);
        
        if (finalTranscript) {
          recognitionRef.current.stop();
          processVoiceInput(finalTranscript);
        }
      };

      recognitionRef.current.start();
    }
  }, [processVoiceInput, voiceProviderReady]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      isAutoListeningRef.current = false;
    } else if (isSpeaking) {
       setIsSpeaking(false);
       isAutoListeningRef.current = false;
    } else {
      isAutoListeningRef.current = true;
      setChatHistory([]);
      startListening();
    }
  }, [isListening, isSpeaking, startListening]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleListening();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleListening]);

  return (
    <div className="fixed bottom-8 right-8 z-50 flex items-center justify-center">
      <button
        onClick={toggleListening}
        className="relative group flex items-center justify-center cursor-pointer outline-none w-24 h-24 mt-2"
        title={isListening || isSpeaking ? "Parar MAYUS" : "Ativar MAYUS Nativo (Onyx)"}
      >
        <div className="absolute inset-x-0 h-full w-4 bg-gradient-to-b from-transparent via-[#CCA761]/20 to-transparent blur-md" />
        <div className={`absolute inset-0 rounded-full border-2 border-dashed transition-all duration-700 ${isListening ? "animate-[spin_4s_linear_infinite] border-green-500/40" : isSpeaking ? "animate-[spin_4s_linear_infinite] border-blue-500/40" : "animate-[spin_12s_linear_infinite] border-[#CCA761]/40"}`} />
        <div className={`absolute inset-2 rounded-full border border-t-transparent border-b-transparent transition-all duration-700 ${(isListening || isSpeaking || isProcessing) ? "animate-[spin_3s_linear_infinite_reverse] scale-110 border-[#f1d58d] shadow-[0_0_20px_rgba(204,167,97,0.5)]" : "animate-[spin_8s_linear_infinite_reverse] border-[#CCA761]/60"}`} />
        <div className={`absolute inset-4 rounded-full border transition-all duration-500 ${(isListening || isSpeaking) ? "animate-pulse scale-90 border-[#f1d58d]" : "border-[#cca761]/80"}`} />
         <div className={`relative w-10 h-10 flex items-center justify-center rounded-full bg-white dark:bg-[#0a0a0a] border border-[#CCA761]/50 transition-all duration-500 z-10 ${
            (isListening || isSpeaking || isProcessing) ? "shadow-[0_0_25px_rgba(204,167,97,0.4)] border-[#CCA761] animate-pulse" : "shadow-[inset_0_0_15px_rgba(204,167,97,0.2)] group-hover:border-[#CCA761]/80"
         }`}>
            <div className={`absolute w-6 h-6 rounded-full border border-dashed border-[#CCA761] animate-[spin_2s_linear_infinite] ${(isListening || isSpeaking) ? "scale-125 opacity-100" : "opacity-30"}`} />
            {isListening ? (
              <Mic size={18} className="text-green-400 scale-110 animate-pulse transition-all duration-500" />
            ) : isSpeaking ? (
               <Volume2 size={18} className="text-blue-400 scale-110 animate-pulse transition-all duration-500" />
            ) : isProcessing ? (
               <Loader2 size={18} className="text-yellow-400 scale-110 animate-spin transition-all duration-500" />
            ) : (
              <Scale size={18} className="text-[#CCA761] scale-100 opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500" />
            )}
         </div>
      </button>
    </div>
  );
}
