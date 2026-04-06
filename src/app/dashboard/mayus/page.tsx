"use client";

import { useState, useEffect, useRef } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import {
  Send, Bot, User, BrainCircuit, Sparkles, Loader2, KeyRound,
  AlertCircle, CheckCircle, XCircle, ShieldAlert,
  History, Plus, Trash2, Menu, X, MessageSquare, ChevronLeft, Search,
  Mic, Volume2, Square, VolumeX
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";
import Link from "next/link";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import "dayjs/locale/pt-br";

dayjs.extend(relativeTime);
dayjs.locale("pt-br");

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400","500","600","700"], style: ["italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300","400","500","600"] });

// ─── Types ────────────────────────────────────────────────────────────────────

interface AwaitingPayload {
  skillName: string;
  riskLevel: string;
  entities: Record<string, string>;
  idempotencyKey: string;
  schemaVersion: string;
}

interface MessageKernel {
  status: string;
  auditLogId?: string;
  awaitingPayload?: AwaitingPayload;
}

interface Message {
  id?: string;
  role: "system" | "user" | "model" | "approval";
  content: string;
  kernel?: MessageKernel;
  created_at?: string;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}

// ─── ApprovalCard ─────────────────────────────────────────────────────────────

type ApprovalState =
  | "idle" | "loading" | "approved" | "rejected"
  | "already_processed" | "expired" | "no_permission" | "error";

function ApprovalCard({
  auditLogId,
  awaitingPayload,
  onDecided,
}: {
  auditLogId: string;
  awaitingPayload: AwaitingPayload;
  onDecided?: (decision: 'approved' | 'rejected') => void;
}) {
  const [cardState, setCardState] = useState<ApprovalState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [approvedMessage, setApprovedMessage] = useState("");

  const handleDecision = async (decision: "approved" | "rejected") => {
    if (cardState !== "idle") return; // imutável após primeira decisão
    setCardState("loading");
    try {
      const res = await fetch("/api/ai/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auditLogId, decision }),
      });
      const data = await res.json();

      if (res.status === 409) {
        setCardState("already_processed");
        setStatusMessage("Esta ação já foi processada anteriormente.");
        return;
      }
      if (res.status === 410) {
        setCardState("expired");
        setStatusMessage("Solicitação expirada. O usuário deve iniciar a ação novamente.");
        return;
      }
      if (res.status === 403) {
        setCardState("no_permission");
        setStatusMessage("Sem permissão para aprovar. Apenas Admin e Sócio podem autorizar.");
        return;
      }
      if (res.status >= 500) {
        setCardState("error");
        setStatusMessage(data?.error ?? "Erro interno — ação aprovada mas não executada. Verifique as integrações.");
        return;
      }
      if (!res.ok) {
        setCardState("error");
        setStatusMessage(data?.error ?? "Erro inesperado ao processar a decisão.");
        return;
      }

      if (decision === "approved") {
        const wasExecuted = data?.status === "executed";
        setApprovedMessage(
          wasExecuted
            ? "Aprovada. Ação executada com sucesso."
            : "Aprovada e registrada. Execução será processada em breve."
        );
        setCardState("approved");
        if (onDecided) onDecided("approved");
      } else {
        setCardState("rejected");
        if (onDecided) onDecided("rejected");
      }
    } catch {
      setCardState("error");
      setStatusMessage("Falha de rede ao processar a decisão.");
    }
  };

  // Risk level: valores confirmados em inglês na migration Fase 0
  const riskBadge: Record<string, string> = {
    critical: "text-red-400 border-red-500/40 bg-red-500/10",
    high:     "text-orange-400 border-orange-500/40 bg-orange-500/10",
    medium:   "text-yellow-400 border-yellow-500/40 bg-yellow-500/10",
    low:      "text-green-400 border-green-500/40 bg-green-500/10",
  };
  const badgeClass = riskBadge[awaitingPayload.riskLevel] ?? riskBadge.medium;

  return (
    <div className="border border-[#CCA761]/30 bg-[#0f0f0f] rounded-2xl p-5 max-w-[85%] space-y-4 animate-in fade-in slide-in-from-bottom-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] text-[#CCA761] uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5">
            <ShieldAlert size={11} /> Aprovação necessária
          </p>
          <p className="text-white font-semibold text-sm">{awaitingPayload.skillName}</p>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border whitespace-nowrap ${badgeClass}`}>
          {awaitingPayload.riskLevel ?? "desconhecido"}
        </span>
      </div>

      {/* Entities — dados reais para decisão informada do aprovador */}
      <div className="space-y-1.5">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest">Dados que serão executados</p>
        <div className="bg-black/40 rounded-xl p-3 space-y-1.5">
          {Object.entries(awaitingPayload.entities).length > 0 ? (
            Object.entries(awaitingPayload.entities).map(([key, value]) => (
              <div key={key} className="flex gap-2 text-xs">
                <span className="text-gray-500 min-w-[130px] shrink-0">{key}:</span>
                <span className="text-gray-200 break-all">{value || "—"}</span>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-xs italic">Nenhuma entidade detectada.</p>
          )}
        </div>
      </div>

      {/* Área de decisão — bloqueada após primeira ação */}
      {cardState === "idle" && (
        <div className="flex gap-2 pt-1">
          <button
            id={`approve-btn-${auditLogId}`}
            onClick={() => handleDecision("approved")}
            className="flex-1 bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold uppercase tracking-widest py-2.5 rounded-xl hover:bg-emerald-600/30 transition-all active:scale-95"
          >
            Aprovar
          </button>
          <button
            id={`reject-btn-${auditLogId}`}
            onClick={() => handleDecision("rejected")}
            className="flex-1 bg-red-600/20 border border-red-500/40 text-red-400 text-xs font-bold uppercase tracking-widest py-2.5 rounded-xl hover:bg-red-600/30 transition-all active:scale-95"
          >
            Rejeitar
          </button>
        </div>
      )}

      {cardState === "loading" && (
        <div className="flex items-center justify-center gap-2 py-2 text-xs text-[#CCA761]">
          <Loader2 size={14} className="animate-spin" />
          <span>Processando decisão...</span>
        </div>
      )}

      {cardState === "approved" && (
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold py-2">
          <CheckCircle size={15} />
          <span>{approvedMessage}</span>
        </div>
      )}

      {cardState === "rejected" && (
        <div className="flex items-center gap-2 text-gray-400 text-xs font-semibold py-2">
          <XCircle size={15} />
          <span>Rejeitada. Nenhuma ação foi executada.</span>
        </div>
      )}

      {["already_processed", "expired", "no_permission", "error"].includes(cardState) && (
        <div className="flex items-start gap-2 text-amber-400 text-xs py-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{statusMessage}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MAYUSPlayground() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [apiKeyData, setApiKeyData] = useState<{ provider: string; key: string; model: string } | null>(null);
  const [availableIntegrations, setAvailableIntegrations] = useState<{ provider: string; key: string; model: string }[]>([]);
  const [checkingVault, setCheckingVault] = useState(true);

  // Novos estados da Fase 5A
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const isConversationModeRef = useRef(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isConversationMode, setIsConversationMode] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<number | string | null>(null);
  const supabase = createClient();
  const { profile, isLoading: profileLoading } = useUserProfile();

  useEffect(() => {
    if (!profileLoading) {
      if (profile?.tenant_id) {
        loadApiKey();
        fetchConversations();
      } else {
        setCheckingVault(false);
      }
    }
  }, [profile?.tenant_id, profileLoading]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isConversationMode) {
        setIsConversationMode(false);
        setIsRecording(false);
        toast.info("Modo Conversa desativado.");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConversationMode]);

  useEffect(() => {
    isConversationModeRef.current = isConversationMode;
  }, [isConversationMode]);

  const loadApiKey = async () => {
    setCheckingVault(true);
    try {
      const { data: integrations, error } = await supabase
        .from("tenant_integrations")
        .select("provider, api_key, instance_name")
        .eq("tenant_id", profile!.tenant_id)
        .eq("status", "connected");

      if (error) console.error("Erro ao buscar integrações:", error);

      if (integrations && integrations.length > 0) {
        const mappedIntegrations = integrations.map(i => ({
          provider: i.provider,
          key: i.api_key,
          model: i.instance_name || (
            i.provider === 'openai'    ? 'gpt-3.5-turbo' :
            i.provider === 'gemini'    ? 'gemini-1.5-flash' :
            i.provider === 'anthropic' ? 'claude-3-5-sonnet-20240620' :
            'openrouter/auto'
          ),
        })).filter(i => i.key);
        setAvailableIntegrations(mappedIntegrations);

        const openrouter = integrations.find(i => i.provider === 'openrouter');
        const openai     = integrations.find(i => i.provider === 'openai');
        const anthropic  = integrations.find(i => i.provider === 'anthropic');
        const gemini     = integrations.find(i => i.provider === 'gemini');

        if (openai?.api_key)          setApiKeyData({ provider: 'openai',     key: openai.api_key,     model: openai.instance_name     || "gpt-3.5-turbo" });
        else if (anthropic?.api_key)  setApiKeyData({ provider: 'anthropic',  key: anthropic.api_key,  model: anthropic.instance_name  || "claude-3-5-sonnet-20240620" });
        else if (openrouter?.api_key) setApiKeyData({ provider: 'openrouter', key: openrouter.api_key, model: openrouter.instance_name || "openrouter/auto" });
        else if (gemini?.api_key)     setApiKeyData({ provider: 'gemini',     key: gemini.api_key,     model: gemini.instance_name     || "gemini-1.5-flash" });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCheckingVault(false);
    }
  };

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/ai/conversations");
      const data = await res.json();
      if (data.conversations) setConversations(data.conversations);
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
    }
  };

  const loadConversation = async (id: string) => {
    setIsLoading(true);
    setCurrentConversationId(id);
    try {
      const res = await fetch(`/api/ai/conversations/${id}`);
      const data = await res.json();
      if (data.messages) setMessages(data.messages);
      if (window.innerWidth < 768) setIsMobileMenuOpen(false);
    } catch (err) {
      toast.error("Erro ao carregar mensagens.");
      setCurrentConversationId(null);
    } finally {
      setIsLoading(false);
    }
  };

  const createNewChat = () => {
    setCurrentConversationId(null);
    setMessages([]);
    if (window.innerWidth < 768) setIsMobileMenuOpen(false);
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setConversations(prev => prev.filter(c => c.id !== id));
      if (currentConversationId === id) createNewChat();
      toast.success("Conversa deletada.");
    } catch {
      toast.error("Erro ao deletar conversa.");
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !apiKeyData) return;

    let userMsg = input.trim();
    let currentModel = apiKeyData.model;
    let currentProvider = apiKeyData.provider;
    let convId = currentConversationId;
    const isFirstMessage = !convId;

    if (userMsg.startsWith('/')) {
      const parts = userMsg.split(' ');
      const command = parts[0].substring(1).toLowerCase();
      const targetProvider = availableIntegrations.find(i => i.provider.toLowerCase() === command);

      if (targetProvider) {
        currentProvider = targetProvider.provider;
        setApiKeyData({ provider: currentProvider, key: targetProvider.key, model: targetProvider.model });
        userMsg = parts.slice(1).join(' ').trim();
        if (!userMsg) {
          setMessages(prev => [...prev, { role: "system", content: `Aviso do Córtex: Provedor alterado para "${currentProvider.toUpperCase()}".` }]);
          setInput("");
          return;
        }
      } else {
        currentModel = command;
        setApiKeyData(prev => prev ? { ...prev, model: currentModel } : null);
        userMsg = parts.slice(1).join(' ').trim();
        if (!userMsg) {
          setMessages(prev => [...prev, { role: "system", content: `Aviso do Córtex: Modelo alterado para "${currentModel}".` }]);
          setInput("");
          return;
        }
      }
    }

    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setIsLoading(true);

    // 1. Inicia conversa no banco se for o primeiro envio
    if (isFirstMessage) {
      try {
        const res = await fetch("/api/ai/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Nova Conversa" }),
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        convId = data.conversation.id;
        setCurrentConversationId(convId);
        setConversations(prev => [data.conversation, ...prev]);
      } catch (err) {
        toast.error("Falha ao iniciar conversa no banco.");
        setIsLoading(false);
        return;
      }
    }

    // 2. Persiste a mensagem do Usuário
    try {
      await fetch(`/api/ai/conversations/${convId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "user", content: userMsg }),
      });
    } catch { } // não bloqueia o chat se falhar

    // 3. Comunica com o Kernel
    let aiResponseData: any = null;
    let fallbackStatus = false;
    let fallbackOutput = "";

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          provider: currentProvider,
          model: currentModel,
          history: messages
            .filter(m => m.role === "user" || m.role === "model")
            .map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "A IA não conseguiu responder.");
      aiResponseData = data;

      // ── Fluxo de aprovação humana ──────────────────────────────────────
      if (
        data.kernel?.status === "awaiting_approval" &&
        data.kernel?.auditLogId &&
        data.kernel?.awaitingPayload
      ) {
        const newMessages: Message[] = [];
        if (data.reply) {
          newMessages.push({ role: "model", content: data.reply });
        }
        newMessages.push({
          role: "approval",
          content: "",
          kernel: {
            status: data.kernel.status,
            auditLogId: data.kernel.auditLogId,
            awaitingPayload: data.kernel.awaitingPayload,
          },
        });
        setMessages(prev => [...prev, ...newMessages]);
      } 
      // ── Fluxo normal ────────────────────────────
      else {
        const reply = data.reply ?? "";
        const replyChunks = reply.split(/\n\n+/).filter((c: string) => c.trim().length > 0);
        const newMessages: Message[] = replyChunks.length > 0
          ? replyChunks.map((chunk: string) => ({ role: "model" as const, content: chunk.trim() }))
          : [{ role: "model" as const, content: reply || "..." }];
        setMessages(prev => [...prev, ...newMessages]);
      }
    } catch (err: any) {
      toast.error(err.message);
      fallbackStatus = true;
      fallbackOutput = "Erro Crítico: A conexão com o córtex falhou.";
      setMessages(prev => [...prev, { role: "system", content: fallbackOutput }]);
    } finally {
      setIsLoading(false);
    }

    // 4. Salva a resposta do Córtex de forma tolerante a falhas
    if (convId) {
       if (fallbackStatus) {
         try {
           await fetch(`/api/ai/conversations/${convId}`, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ role: "system", content: fallbackOutput, kernel: {} }),
           });
         } catch { }
       } else if (aiResponseData) {
         const isApproval = aiResponseData.kernel?.status === "awaiting_approval";
         
         if (aiResponseData.reply) {
           await fetch(`/api/ai/conversations/${convId}`, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ role: "model", content: aiResponseData.reply, kernel: {} }),
           });
           
           // Se estiver no Modo Conversa, tocar áudio automaticamente
           if (isConversationModeRef.current) {
             playMessage(aiResponseData.reply, "latest_conv");
           }
         }
         if (isApproval) {
           await fetch(`/api/ai/conversations/${convId}`, {
             method: "POST",
             headers: { "Content-Type": "application/json" },
             body: JSON.stringify({ role: "approval", content: "", kernel: aiResponseData.kernel }),
           });
         }
       }
    }

    // 5. Gera o título após a IA responder a primeira vez usando OpenAI para garantir
    if (isFirstMessage && convId) {
      fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: `Gere um título curto (máx 4 palavras) para a frase: "${userMsg}". Responda APENAS o título, sem aspas ou explicações.`,
          provider: "openai",
          history: []
        })
      }).then(res => res.json()).then(data => {
        if (data.reply) {
          fetch(`/api/ai/conversations/${convId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: data.reply.replace(/"/g, '') })
          }).then(() => fetchConversations());
        }
      });
    }
  };

  // ─── Lógica de Voz (STT & TTS) ──────────────────────────────────────────────

  const toggleRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Seu navegador não suporta reconhecimento de voz.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.lang = "pt-BR";
    recognition.continuous = true; // Mantém o mic aberto entre pequenas pausas
    recognition.interimResults = true; // Visualização em tempo real
    recognition.maxAlternatives = 1;

    let fullTranscript = "";

    recognition.onstart = () => {
      setIsRecording(true);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      
      // Envio automático se houver conteúdo acumulado
      // Usamos o que está no input ou o fullTranscript capturado
      if (fullTranscript.trim()) {
        const textToSend = fullTranscript.trim();
        setTimeout(() => handleSendWithText(textToSend), 100);
      }
    };

    recognition.onerror = (e: any) => {
      console.error("STT Error:", e);
      setIsRecording(false);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = "";
      let currentFinal = "";

      // Reconstrói a partir de todos os resultados (finais e temporários)
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          currentFinal += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      fullTranscript += currentFinal;
      setInput(fullTranscript + interimTranscript);

      // Reset do timer de silêncio (2.5 segundos)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        recognition.stop(); // O evento onend fará o envio
      }, 2500);
    };

    recognition.start();
  };

  // Helper para enviar texto direto (usado pelo STT)
  const handleSendWithText = async (text: string) => {
    if (!text.trim() || !apiKeyData) return;

    // ─── Interceptador de Comandos de Aprovação Vocal ──────────────────────────
    if (isConversationModeRef.current) {
      // Normalização: Remove pontuação e espaços extras para melhorar o matching
      const cleanText = text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim();
      const isApprove = ["aprovar", "pode aprovar", "confirmar", "ok", "autorizar", "aceitar"].some(k => cleanText.includes(k));
      const isReject = ["rejeitar", "cancelar", "não", "parar", "negar"].some(k => cleanText.includes(k));

      if (isApprove) {
        const approveBtns = document.querySelectorAll('[id^="approve-btn-"]:not([disabled])');
        const lastApproveBtn = approveBtns[approveBtns.length - 1] as HTMLButtonElement;
        if (lastApproveBtn) {
          lastApproveBtn.click();
          setInput("");
          return; // Intercepta: Não envia o texto para o kernel
        }
      } else if (isReject) {
        const rejectBtns = document.querySelectorAll('[id^="reject-btn-"]:not([disabled])');
        const lastRejectBtn = rejectBtns[rejectBtns.length - 1] as HTMLButtonElement;
        if (lastRejectBtn) {
          lastRejectBtn.click();
          setInput("");
          return; // Intercepta: Não envia o texto para o kernel
        }
      }
    }

    // Forçar o envio do texto capturado
    setInput(text);
    document.getElementById("chat-form")?.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
  };

  const playMessage = async (msgContent: string, msgId: string | number) => {
    if (playingMessageId === msgId) {
      audioRef.current?.pause();
      setPlayingMessageId(null);
      return;
    }

    try {
      setPlayingMessageId(msgId);
      const url = `/api/ai/tts?provider=openai&voice=onyx&text=${encodeURIComponent(msgContent)}`;
      
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onended = () => {
        setPlayingMessageId(null);
        // Se estiver no Modo Conversa, reabrir microfone após a IA terminar de falar
        if (isConversationModeRef.current) {
          setTimeout(() => {
            toggleRecording();
          }, 500); // 500ms para hardware sync estável
        }
      };
      audio.onerror = () => {
        toast.error("Erro ao reproduzir áudio.");
        setPlayingMessageId(null);
      };
      
      await audio.play();
    } catch (err) {
      console.error(err);
      setPlayingMessageId(null);
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
          Nenhuma chave de IA foi encontrada no seu cofre seguro. Vá para a página de integrações e conecte uma mente de Inteligência Artificial para dar vida ao MAYUS.
        </p>
        <Link href="/dashboard/configuracoes/integracoes" className="inline-flex items-center gap-2 bg-[#CCA761] text-black font-bold uppercase tracking-widest text-xs px-8 py-4 rounded-xl hover:scale-105 transition-transform">
          Ir para Integrações
        </Link>
      </div>
    );
  }

  return (
    <div className={`flex h-[calc(100vh-80px)] bg-black overflow-hidden relative ${montserrat.className}`}>
      
      {/* Botão Mobile Menu Toggle */}
      <button 
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="md:hidden absolute top-4 left-4 z-50 p-2 bg-[#141414] border border-[#CCA761]/30 rounded-lg text-[#CCA761]"
      >
        {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* --- SIDEBAR DE HISTÓRICO --- */}
      <aside className={`
        ${isSidebarOpen ? 'w-80' : 'w-0'} 
        ${isMobileMenuOpen ? 'translate-x-0 w-80' : '-translate-x-full md:translate-x-0'}
        transition-all duration-300 border-r border-[#CCA761]/20 bg-[#0a0a0a] flex flex-col hide-scrollbar absolute md:relative z-40 h-full
      `}>
        {isSidebarOpen && (
          <div className="flex flex-col h-full w-80">
            <div className="p-4 border-b border-white/5">
              <button 
                onClick={createNewChat}
                className="w-full flex items-center gap-2 bg-[#CCA761]/10 text-[#CCA761] hover:bg-[#CCA761]/20 border border-[#CCA761]/30 rounded-xl px-4 py-3 font-semibold text-sm transition-colors uppercase tracking-widest"
              >
                <Plus size={16} /> Nova Conversa
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1 hide-scrollbar">
              {conversations.length === 0 ? (
                <div className="text-center p-6 opacity-50">
                  <History size={30} className="mx-auto mb-2 text-[#CCA761]" />
                  <p className="text-xs text-gray-400">Nenhum histórico disponível</p>
                </div>
              ) : (
                conversations.map((conv) => (
                  <div 
                    key={conv.id}
                    onClick={() => loadConversation(conv.id)}
                    className={`group relative flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                      currentConversationId === conv.id 
                        ? 'bg-[#CCA761]/10 border border-[#CCA761]/30' 
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <MessageSquare size={15} className={currentConversationId === conv.id ? "text-[#CCA761]" : "text-gray-500"} />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm tracking-wide truncate ${currentConversationId === conv.id ? 'text-[#CCA761]' : 'text-gray-300'}`}>
                        {conv.title}
                      </p>
                      <p className="text-[10px] text-gray-600 mt-0.5">
                        {dayjs(conv.updated_at).fromNow()}
                      </p>
                    </div>
                    <button 
                      onClick={(e) => deleteConversation(conv.id, e)}
                      className="absolute right-2 opacity-0 group-hover:opacity-100 p-1.5 hover:bg-red-500/20 text-gray-500 hover:text-red-400 rounded-md transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </aside>

      {/* --- CHAT AREA CENTRAL --- */}
      <main className="flex-1 flex flex-col relative h-full">

        {/* HEADER DA TELA CENTRAL */}
        <header className="flex items-center justify-between p-4 border-b border-[#CCA761]/10 bg-gradient-to-b from-[#111] to-transparent">
          <div className="flex items-center gap-4 pl-12 md:pl-0">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden md:flex p-2 hover:bg-white/5 text-gray-400 rounded-lg transition-colors border border-transparent hover:border-white/10"
              title={isSidebarOpen ? "Recolher Histórico" : "Expandir Histórico"}
            >
               {isSidebarOpen ? <ChevronLeft size={18} /> : <History size={18} />}
            </button>
            <div className="relative hidden sm:block">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#CCA761] to-[#604c26] flex items-center justify-center p-[1px]">
                <div className="w-full h-full bg-black rounded-full flex items-center justify-center">
                  <BrainCircuit size={18} className="text-[#CCA761]" />
                </div>
              </div>
            </div>
            <div>
              <h1 className={`text-xl text-[#CCA761] font-bold ${cormorant.className}`}>MAYUS AI</h1>
              <p className="text-[10px] text-green-400 flex items-center gap-1 font-bold tracking-widest uppercase">
                <Sparkles size={10} /> Córtex ({apiKeyData.provider})
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const newState = !isConversationMode;
                setIsConversationMode(newState);
                if (newState) {
                  toast.success("Modo Conversa Ativado");
                  if (!isRecording && !playingMessageId) {
                    setTimeout(() => toggleRecording(), 500);
                  }
                } else {
                  setIsRecording(false);
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all text-[10px] font-black uppercase tracking-[0.2em] ${
                isConversationMode 
                  ? 'bg-[#CCA761] border-[#CCA761] text-black shadow-[0_0_20px_rgba(204,167,97,0.4)] animate-pulse' 
                  : 'bg-white/5 border-white/10 text-gray-500 hover:border-[#CCA761]/40'
              }`}
            >
              <Sparkles size={14} /> {isConversationMode ? 'Modo Conversa Ativo' : 'Ativar Modo Conversa'}
            </button>
            <div className="bg-[#CCA761]/10 border border-[#CCA761]/20 px-3 py-1.5 flex flex-col items-end rounded-lg text-xs tracking-widest text-[#CCA761] font-bold uppercase">
              <span>{apiKeyData.provider}</span>
              <span className="text-[9px] text-gray-500 lowercase opacity-80 mt-0.5 truncate max-w-[120px]">{apiKeyData.model}</span>
            </div>
          </div>
        </header>

        {/* FEED DE MENSAGENS */}
        <div className="flex-1 overflow-y-auto hide-scrollbar space-y-6 lg:px-24 md:px-12 px-4 py-8">
          
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-70">
              <Bot size={50} className="text-[#CCA761] mb-5 animate-pulse" />
              <p className={`text-3xl text-white ${cormorant.className}`}>Bem-vindo ao Córtex.</p>
              <p className="text-gray-400 mt-2 text-sm max-w-sm">Tudo o que for decidido e acordado aqui ficará gravado no seu banco de dados institucional.</p>
            </div>
          )}

          {messages.map((msg, idx) => {
            if (msg.role === "approval" && msg.kernel?.auditLogId && msg.kernel?.awaitingPayload) {
              return (
                <div key={idx} className="flex gap-4 animate-in fade-in slide-in-from-bottom-2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30">
                    <ShieldAlert size={16} />
                  </div>
                  <ApprovalCard
                    auditLogId={msg.kernel.auditLogId}
                    awaitingPayload={msg.kernel.awaitingPayload as AwaitingPayload}
                    onDecided={(decision) => {
                      if (isConversationModeRef.current) {
                        const confirmMsg = decision === 'approved' 
                          ? "Excelente! Aprovado. Executando agora mesmo, Doutor!" 
                          : "Entendido. Ação cancelada conforme solicitado.";
                        playMessage(confirmMsg, `decide_${idx}`);
                      }
                    }}
                  />
                </div>
              );
            }

            return (
              <div key={idx} className={`flex gap-4 animate-in fade-in slide-in-from-bottom-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === 'user'
                    ? 'bg-white/10 text-white'
                    : msg.role === 'model'
                    ? 'bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30 shadow-[0_0_15px_rgba(204,167,97,0.2)]'
                    : 'bg-red-500/10 text-red-400'
                }`}>
                  {msg.role === 'user' ? <User size={16} /> : msg.role === 'model' ? <Bot size={16} /> : <AlertCircle size={16} />}
                </div>
                <div className={`p-4 rounded-2xl max-w-[85%] text-sm leading-relaxed whitespace-pre-wrap relative group/msg ${
                  msg.role === 'user'
                    ? 'bg-white/10 text-gray-200 rounded-tr-sm'
                    : msg.role === 'model'
                    ? 'bg-[#111] text-gray-300 rounded-tl-sm border border-white/5'
                    : 'bg-red-500/10 text-red-400 border border-red-500/30'
                }`}>
                  {msg.content}
                  
                  {msg.role === 'model' && (
                    <button
                      onClick={() => playMessage(msg.content, msg.id || idx)}
                      className={`absolute -right-10 top-2 p-2 rounded-full transition-all ${
                        playingMessageId === (msg.id || idx) 
                          ? 'bg-[#CCA761] text-black scale-110' 
                          : 'bg-white/5 text-gray-500 hover:text-[#CCA761] opacity-0 group-hover/msg:opacity-100'
                      }`}
                      title="Ouvir Resposta"
                    >
                      {playingMessageId === (msg.id || idx) ? <Square size={14} fill="currentColor" /> : <Volume2 size={14} />}
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex gap-4 animate-pulse">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30">
                <Loader2 size={16} className="animate-spin" />
              </div>
              <div className="bg-[#111] text-gray-400 p-4 rounded-2xl text-xs rounded-tl-sm border border-white/5">
                MAYUS está analisando...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* CONTROLES E INPUT CENTRAL */}
        <div className="p-4 lg:px-24 md:px-12 bg-gradient-to-t from-black via-black/80 to-transparent">
          <form 
            id="chat-form"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }} 
            className="flex gap-2"
          >
            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isConversationMode ? "Ouvindo... Pode falar." : "Sua instrução para a IA..."}
                className={`w-full bg-[#141414] border rounded-2xl pl-6 pr-14 py-4 focus:outline-none transition-all text-sm text-gray-200 shadow-xl ${
                  isConversationMode 
                    ? 'border-[#CCA761]/40 shadow-[#CCA761]/5' 
                    : 'border-white/10 focus:border-[#CCA761]/50'
                }`}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={toggleRecording}
                disabled={isLoading}
                className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all ${
                  isRecording 
                    ? 'bg-[#CCA761] text-black animate-pulse shadow-[0_0_15px_rgba(204,167,97,0.4)]' 
                    : playingMessageId 
                    ? 'bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30'
                    : 'text-gray-500 hover:text-[#CCA761]'
                }`}
                title={isRecording ? "Ouvindo..." : playingMessageId ? "IA Falando" : "Ditar Mensagem"}
              >
                {playingMessageId ? <Volume2 size={18} className="animate-pulse" /> : <Mic size={18} />}
              </button>
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={`bg-transparent hover:bg-[#CCA761]/10 border border-[#CCA761]/30 hover:border-[#CCA761] disabled:border-gray-800 disabled:text-gray-600 text-[#CCA761] px-6 rounded-2xl flex items-center justify-center transition-all active:scale-95 disabled:hover:bg-transparent ${
                isConversationMode ? 'hidden sm:flex' : 'flex'
              }`}
            >
              <Send size={18} />
            </button>
          </form>
          <div className="text-center mt-3 flex items-center justify-center gap-2">
             {isConversationMode && <span className="w-1.5 h-1.5 rounded-full bg-[#CCA761] animate-ping" />}
             <p className="text-[10px] text-gray-600 font-medium lowercase tracking-widest">
               {isConversationMode ? 'Modo conversa ativo • kernel em escuta' : 'As sessões e decisões do kernel no ambiente logado são auditáveis.'}
             </p>
          </div>
        </div>

      </main>
    </div>
  );
}
