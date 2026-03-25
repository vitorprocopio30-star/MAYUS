"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Mic, Waves, Scale, Loader2, Volume2, WifiOff, X } from "lucide-react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import { useConversation } from "@elevenlabs/react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function MAYUSOrb() {
  const { profile } = useUserProfile();
  const [transcribedText, setTranscribedText] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [personalContext, setPersonalContext] = useState("");
  const recognitionRef = useRef<any>(null);
  const audioFlowRef = useRef<HTMLAudioElement | null>(null);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (isExpanded && audioFlowRef.current) {
       audioFlowRef.current.volume = 0.10; // Trilha reduzida para 10% (som de fundo sútil)
       audioFlowRef.current.play().catch(() => {});
    } else if (!isExpanded && audioFlowRef.current) {
       audioFlowRef.current.pause();
    }
  }, [isExpanded]);

  useEffect(() => {
    if (profile?.id) {
      const loadMemories = async () => {
        const { data } = await supabase.from('user_ai_memories').select('memory_text').eq('user_id', profile.id);
        if (data && data.length > 0) {
          setPersonalContext(data.map(m => m.memory_text).join(". "));
        }
      };
      loadMemories();
    }
  }, [profile?.id]);

  const conversation = useConversation({
    clientTools: {
      abrir_agenda: async (parameters: any) => {
        setIsExpanded(false); // Recolhe pro cantinho imediatamente!
        toast.info("MAYUS: Abrindo módulo de Agenda...");
        router.push("/dashboard/agenda");
        return "Concluído! A tela de Agenda foi aberta com sucesso. Avise ao usuário que a agenda dele já está na tela e recolhi minha tela principal.";
      },
      trocar_fundo_tema: async (parameters: any) => {
        toast.message("⚠️ PROTÓCOLO INICIADO PELO CONSELHEIRO MAYUS", { description: "Sobrescrevendo controles de interface visual..." });
        const root = document.documentElement;
        if (root.style.filter === "invert(1) hue-rotate(180deg)") {
           root.style.filter = ""; 
           return "As cores voltaram ao normal. Avise ao usuário que a interface foi restaurada.";
        } else {
           root.style.filter = "invert(1) hue-rotate(180deg)"; 
           return "A operação Hacker foi concluída! As cores da tela do cliente foram invertidas.";
        }
      },
      criar_tarefa_n8n_master: async (parameters: any) => {
        toast.info("MAYUS: Delegando tarefa ao Córtex N8N em background...");
        setIsExpanded(false); // Pode recolher se ele quiser enviar a tarefa e seguir trabalhando
        try {
          fetch("/api/ai/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: parameters.descricao_da_tarefa || "Criar tarefa via Agente ElevenLabs",
              provider: "n8n",
              apiKey: "auth-bypass",
              tenantId: profile?.tenant_id,
              userId: profile?.id
            })
          });
          return "Míssil enviado. O n8n está criando a tarefa. Você pode confirmar imediatamente ao Chefe que já enviou a ordem para a central!";
        } catch(e) {
          return "Houve um bloqueio na comunicação com o N8N.";
        }
      },
      memorizar_informacao_intima: async (parameters: any) => {
        try {
           const mem = parameters.informacao_a_memorizar || "Nova informação captada.";
           await supabase.from('user_ai_memories').insert({
             user_id: profile?.id,
             tenant_id: profile?.tenant_id,
             memory_text: mem
           });
           setPersonalContext(prev => prev + ". " + mem);
           toast.success("MAYUS: Nova Memória Adquirida no Córtex.");
           return "A informação foi armazenada permanentemente no banco central de memórias! Você vai se lembrar disso para sempre. Diga algo cordial confirmando que guardou na memória.";
        } catch(e) {
           return "Erro ao gravar na tabela de memórias.";
        }
      }
    },
    onConnect: () => {
      console.log("Conectado ao MAYUS (ElevenLabs)");
      setTranscribedText("");
    },
    onDisconnect: () => {
      console.log("Desconectado do MAYUS");
      setTranscribedText("");
    },
    onMessage: (message: any) => {
      if (message.source === "user") {
        setTranscribedText(message.message);
      }
    },
  });

  // ===== MOTOR NATIVO OPENAI DE EMERGÊNCIA / TESTES (Sem Custo ElevenLabs) =====
  const [apiKeyData, setApiKeyData] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<{role: string, content: string}[]>([]);
  const isAutoListeningRef = useRef<boolean>(true);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isBusyRef = useRef<boolean>(false); // Impede que o reinício automático encavale enquanto processa/fala

  // === MOTOR DE AUDIO VISUALIZER E NÚCLEO ===
  const agentVoiceRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  
  // Refs do Plasma Core (Física Orgânica Avançada)
  const orbAuraRef = useRef<HTMLDivElement | null>(null);
  const plasma1Ref = useRef<HTMLDivElement | null>(null);
  const plasma2Ref = useRef<HTMLDivElement | null>(null);
  const plasma3Ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (profile?.tenant_id) {
      const fetchApiKey = async () => {
        const { data } = await supabase.from("tenant_integrations").select("api_key").eq("tenant_id", profile.tenant_id).eq("provider", "openai").eq("status", "connected").single();
        if (data?.api_key) setApiKeyData(data.api_key);
      };
      fetchApiKey();
    }
  }, [profile?.tenant_id]);

  const startListening = useCallback(() => {
    if (!apiKeyData) {
      toast.error("Integração da OpenAI não conectada nas suas Configurações!");
      setIsExpanded(false);
      return;
    }
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        toast.error("Navegador não suporta gravação de voz natal.");
        return;
      }
      const rec = new SpeechRecognition();
      recognitionRef.current = rec;
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = 'pt-BR';

      rec.onstart = () => { setIsListening(true); setTranscribedText(""); };
      rec.onerror = (e: any) => { 
        if (e.error !== 'no-speech') console.error(e); 
        setIsListening(false); 
      };
      rec.onend = () => {
        setIsListening(false);
        // Se o microfone desligou por silêncio (timeout) e não estamos processando, liga de novo forçadamente!
        if (isAutoListeningRef.current && !isBusyRef.current) {
           setTimeout(() => {
              if (isAutoListeningRef.current && !isBusyRef.current) startListening();
           }, 200);
        }
      };
      
      rec.onresult = (e: any) => {
        let finalStr = '';
        for (let i = e.resultIndex; i < e.results.length; ++i) {
          if (e.results[i].isFinal) finalStr += e.results[i][0].transcript;
        }
        if (finalStr) {
          rec.stop();
          processVoiceInput(finalStr);
        }
      };
      rec.start();
    }
  }, [apiKeyData, chatHistory]);

  const processVoiceInput = async (text: string) => {
    if (!text.trim()) return;
    isBusyRef.current = true;
    setIsProcessing(true);
    setIsListening(false);
    setTranscribedText("Processando via Córtex Nativo...");

    const newHistory = [...chatHistory, { role: "user", content: text }];
    setChatHistory(newHistory);

    try {
      const chatRes = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          provider: "openai",
          apiKey: apiKeyData,
          model: "gpt-4o-mini",
          history: chatHistory
        })
      });
      const chatData = await chatRes.json();
      if (!chatRes.ok) throw new Error(chatData.error);
      
      let finalReplyText = chatData.reply || "";
      setChatHistory([...newHistory, { role: "assistant", content: finalReplyText }]);
      setTranscribedText("");

      setIsSpeaking(true);

      setIsSpeaking(true);

      // Conectar Nódulo do Analisador WebAudio se for primeira vez
      if (!analyserRef.current && agentVoiceRef.current) {
         try {
           const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
           const audioCtx = new AudioContextClass();
           const analyser = audioCtx.createAnalyser();
           const source = audioCtx.createMediaElementSource(agentVoiceRef.current);
           source.connect(analyser);
           analyser.connect(audioCtx.destination);
           analyser.fftSize = 64; 
           analyserRef.current = analyser;
           dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
         } catch(e) {
           console.log("AudioContext blocked or connected");
         }
      }

      if (agentVoiceRef.current) {
         agentVoiceRef.current.src = `/api/ai/tts?text=${encodeURIComponent(finalReplyText)}&apiKey=${apiKeyData}&voice=onyx`;
         agentVoiceRef.current.onplay = () => setIsSpeaking(true);
         agentVoiceRef.current.onended = () => {
            setIsSpeaking(false);
            isBusyRef.current = false;
            if (isAutoListeningRef.current) setTimeout(() => startListening(), 300);
         };
         await agentVoiceRef.current.play();
      }
    } catch (err: any) {
      toast.error(err.message);
      setIsSpeaking(false);
      isBusyRef.current = false;
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = useCallback(async () => {
    if (isExpanded) {
       // Desligando o MAYUS
       if (recognitionRef.current) recognitionRef.current.stop();
       isAutoListeningRef.current = false;
       isBusyRef.current = false;
       setIsListening(false);
       setIsSpeaking(false);
       setIsExpanded(false);
    } else {
       // LIGANDO O MAYUS
       setIsExpanded(true);
       isAutoListeningRef.current = true;
       setChatHistory([]);
       setTimeout(() => { startListening(); }, 500); // 500ms de caridade visual pra tela subir antes de gravar
    }
  }, [isExpanded, startListening]);

  // ==============================================================================
  // MOTOR CSS/CANVAS DA REDE NEURAL VÍVA NO FUNDO
  useEffect(() => {
    if (!isExpanded) return;
    const canvas = document.getElementById('matrix-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=~[]{}|;:,.<>/?MAYUSCORTEX'.split('');
    const fontSize = 14;
    let columns = Math.floor(width / fontSize);
    let drops: number[] = [];
    
    // Inicia gotas em alturas aleatórias para já começar chovendo preenchido
    for (let x = 0; x < columns; x++) {
       drops[x] = Math.random() * (height / fontSize);
    }

    let animationFrameId: number;
    let lastDrawTime = 0;

    const draw = (currentTime: number) => {
      animationFrameId = requestAnimationFrame(draw);
      
      // Controla FPS da chuva Matrix (cerca de 30 frames por segundo)
      if (currentTime - lastDrawTime < 45) return;
      lastDrawTime = currentTime;

      // Escurece o fundo aos poucos (cria o rastro/Matrix trail)
      ctx.fillStyle = 'rgba(2, 1, 4, 0.08)';
      ctx.fillRect(0, 0, width, height);

      // Efeito de Chuva "Dourada Pura"
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#FFD700';
      ctx.fillStyle = '#FFD700'; // Ouro Vivo
      ctx.font = fontSize + 'px monospace';

      for (let i = 0; i < drops.length; i++) {
        const text = letters[Math.floor(Math.random() * letters.length)];
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        // Se a gota passou da tela, chance de voltar pro topo
        if (drops[i] * fontSize > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };

    animationFrameId = requestAnimationFrame(draw);

    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      columns = Math.floor(width / fontSize);
      drops = [];
      for (let x = 0; x < columns; x++) drops[x] = Math.random() * (height / fontSize);
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isExpanded]);

  // AUDIO VISUALIZER LOOP E RECRIAÇÃO DA FORMA SENTIENTE (PLASMA)
  useEffect(() => {
    let animationId: number;
    const animateVisual = () => {
      let dataBuf: any = new Uint8Array(32);
      if (isSpeaking && analyserRef.current && dataArrayRef.current) {
          analyserRef.current.getByteFrequencyData(dataArrayRef.current as any);
          dataBuf = dataArrayRef.current;
      }
      
      let sum = 0;
      for (let i = 0; i < dataBuf.length; i++) sum += dataBuf[i];
      const avg = sum / dataBuf.length;

      // Dinâmica de Extensão Espacial do Agente Sensiente
      const scaleBase = 1.0 + (avg / 80);
      const intensity = avg / 255; // Força Bruta

      if (plasma1Ref.current) {
         plasma1Ref.current.style.transform = `scale(${Math.min(scaleBase * 1.15, 3.0)}) rotate(${avg/5}deg)`;
         plasma1Ref.current.style.filter = `blur(${8 + (intensity * 10)}px) drop-shadow(0 0 ${20 + (intensity * 40)}px rgba(255, 140, 0, 0.9))`;
      }
      if (plasma2Ref.current) {
         plasma2Ref.current.style.transform = `scale(${Math.min(scaleBase * 0.95, 2.5)}) rotate(${-avg/4}deg)`;
         plasma2Ref.current.style.filter = `blur(${5 + (intensity * 8)}px) drop-shadow(0 0 ${30 + (intensity * 50)}px rgba(255, 215, 0, 1))`;
      }
      if (plasma3Ref.current) {
         plasma3Ref.current.style.transform = `scale(${Math.min(1 + (avg/45), 3.5)})`;
         plasma3Ref.current.style.boxShadow = `0 0 ${40 + (intensity*100)}px #FFD700, 0 0 ${80 + (intensity*150)}px #FF8C00`;
      }
      if (orbAuraRef.current) {
         orbAuraRef.current.style.opacity = `${0.2 + (intensity * 0.6)}`;
         orbAuraRef.current.style.transform = `scale(${1 + intensity})`;
      }

      animationId = requestAnimationFrame(animateVisual);
    };

    animationId = requestAnimationFrame(animateVisual);
    return () => cancelAnimationFrame(animationId);
  }, [isSpeaking]);

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
    <>
      {/* MODO EXPANDIDO (FULL SCREEN CORTEX) */}
      <div 
        className={`fixed inset-0 z-[100] flex items-center justify-center bg-[#020104] transition-all duration-[1500ms] ${
          isExpanded ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none scale-105"
        }`}
      >
        {/* PLAYER INVISIVEL E AUDIO VISUALIZER ANALIZADOR */}
        <audio ref={audioFlowRef} src="https://ice1.somafm.com/dronezone-128-mp3" preload="none" />
        <audio ref={agentVoiceRef} crossOrigin="anonymous" className="hidden" />

        {/* PARTE 0: MATRIX CODE RAIN INFINITO NO FUNDO CEGO */}
        <canvas id="matrix-canvas" className="absolute inset-0 w-full h-full opacity-30 pointer-events-none" />

        {/* Fundo Cibernético Original Córtex - Apenas Efeito */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-[#000000]/60 to-[#020104] z-10 pointer-events-none" />

        {/* Botão Fechar / Recolher */}
        <button onClick={() => setIsExpanded(false)} className="absolute top-8 right-8 text-gray-500 hover:text-orange-400 transition-all bg-[#0a0a0a] p-3 rounded-full border border-white/5 hover:border-orange-500/30 z-[110]">
          <X size={24} />
        </button>
        
        <div className="relative z-20 flex flex-col items-center justify-center max-w-4xl text-center space-y-24 mt-[-5%] perspective-[1500px]">
          
          <div 
             className="relative flex items-center justify-center w-[600px] h-[600px] cursor-default group"
          >
             {/* THE MAYUS GRAV PLASMA CORE (Nossa Linguagem Nativa e Orgânica) */}
             <div className="relative w-64 h-64 flex items-center justify-center pointer-events-none z-20">
                 {/* Aura Espacial Pura */}
                 <div 
                   ref={orbAuraRef}
                   className="absolute inset-[-100%] rounded-full bg-[radial-gradient(circle,_rgba(255,215,0,0.15)_0%,_rgba(255,140,0,0.05)_50%,_transparent_100%)] blur-[40px] transition-all duration-75"
                 />

                 {/* Fluido Primário (Laranja Queimado) */}
                 <div 
                    ref={plasma1Ref}
                    className="absolute w-full h-full bg-gradient-to-br from-[#FF8C00] to-[#FF4500] opacity-80 mix-blend-screen transition-all duration-75"
                    style={{
                        borderRadius: '40% 60% 70% 30% / 40% 50% 60% 50%',
                        animation: 'spin 12s linear infinite',
                    }}
                 />

                 {/* Fluido Secundário Brilhante (Ouro) */}
                 <div 
                    ref={plasma2Ref}
                    className="absolute w-[85%] h-[85%] bg-gradient-to-tr from-[#FFD700] to-[#FFA500] opacity-90 mix-blend-screen transition-all duration-75"
                    style={{
                        borderRadius: '60% 40% 30% 70% / 50% 60% 40% 50%',
                        animation: 'spin 8s linear infinite reverse',
                    }}
                 />

                 {/* O Núcleo Quântico Ativo (Branco-Dourado) */}
                 <div 
                    ref={plasma3Ref}
                    className="absolute w-[50%] h-[50%] bg-[#FFF8CC] opacity-100 mix-blend-normal transition-all duration-75"
                    style={{
                        borderRadius: '45% 55% 45% 55% / 55% 45% 55% 45%',
                        animation: 'spin 4s linear infinite',
                    }}
                 />
             </div>
             
             {isListening && (
                 <div className="absolute top-[-100px] bg-black/60 px-6 py-2 rounded-full border border-orange-500/30 text-orange-400 text-sm font-light uppercase tracking-widest animate-pulse backdrop-blur-md z-50">Gravando sua voz...</div>
             )}
             {isProcessing && (
                 <div className="absolute top-[-100px] bg-black/60 px-6 py-2 rounded-full border border-orange-500/30 text-yellow-400 text-sm font-light uppercase tracking-widest animate-pulse backdrop-blur-md z-50">Córtex Processando...</div>
             )}
          </div>
          
          {/* Todas as legendas de SINÁPSES NEURAIS removidas conforme pedido! Somente a imagem limpa e o vídeo importam. */}
        </div>
      </div>

      {/* MODO RECOLHIDO (ORBE NO CANTO) */}
      <div className={`fixed bottom-8 right-8 z-[90] flex items-center justify-center transition-all duration-700 ease-in-out ${isExpanded ? "opacity-0 translate-y-20 pointer-events-none" : "opacity-100 translate-y-0"}`}>
        {/* Botão Orb Sci-Fi Principal Restaurado (Padrão Antigo Dourado - Apenas um pouco maior) */}
        <button
          onClick={toggleListening}
          className="relative group flex items-center justify-center cursor-pointer outline-none w-28 h-28 mt-2"
          title="Ativar MAYUS Cortex (Modo Tela Cheia)"
        >
          <div className="absolute inset-x-0 h-full w-5 bg-gradient-to-b from-transparent via-[#CCA761]/20 to-transparent blur-md pointer-events-none" />
          
          {/* Anel Externo Tracejado */}
          <div className={`absolute inset-0 rounded-full border-[2.5px] border-dashed transition-all duration-700 animate-[spin_12s_linear_infinite] border-[#CCA761]/40`} />
          
          {/* Anel Intermediário Sólido/Transparente */}
          <div className={`absolute inset-2.5 rounded-full border-[1.5px] border-t-transparent border-b-transparent transition-all duration-700 animate-[spin_8s_linear_infinite_reverse] border-[#CCA761]/60 group-hover:border-[#f1d58d] group-hover:shadow-[0_0_20px_rgba(204,167,97,0.5)]`} />

          {/* Anel Interno Pulsante */}
          <div className={`absolute inset-5 rounded-full border-[1px] transition-all duration-500 border-[#cca761]/80 group-hover:animate-pulse group-hover:scale-95 group-hover:border-[#f1d58d]`} />
          
          {/* Núcleo Negro Central */}
          <div className={`relative w-14 h-14 flex items-center justify-center rounded-full bg-[#0a0a0a] border border-[#CCA761]/50 transition-all duration-500 z-10 shadow-[inset_0_0_15px_rgba(204,167,97,0.2)] group-hover:border-[#CCA761]/80`}>
              <div className={`absolute w-8 h-8 rounded-full border-[1.5px] border-dashed border-[#CCA761] animate-[spin_2s_linear_infinite] opacity-30 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500`} />
              
              <Scale size={24} className="text-[#CCA761] opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all duration-500 drop-shadow-[0_0_8px_rgba(204,167,97,0.5)]" />
          </div>
        </button>
      </div>
    </>
  );
}
