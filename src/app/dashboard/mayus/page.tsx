"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import ReactMarkdown from 'react-markdown'
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import {
  Send, Bot, User, BrainCircuit, Sparkles, Loader2, KeyRound,
  AlertCircle, CheckCircle, XCircle, ShieldAlert,
  History, Plus, Trash2, Menu, X, MessageSquare, ChevronLeft, Search,
  Mic, Volume2, Square, VolumeX, SlidersHorizontal, ChevronDown, Headphones
} from "lucide-react";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useOrbState } from "@/components/dashboard/mayus-orb/OrbStateProvider";
import {
  DEFAULT_MAYUS_REALTIME_VOICE,
  REALTIME_VOICE_OPTIONS,
  estimateMayusRealtimeUsageCost,
  type MayusRealtimeCostEstimate,
  type MayusRealtimeVoice,
  type RealtimeUsage,
} from "@/lib/voice/realtime-persona";
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
  outputPayload?: Record<string, unknown>;
  taskId?: string;
  runId?: string;
  stepId?: string;
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

type ModelOption = {
  provider: string;
  model: string;
  label: string;
  description: string;
};

type RealtimeStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "tool_calling"
  | "error";

type ConversationTransport = "idle" | "realtime" | "legacy";

type RealtimeFunctionCall = {
  type?: string;
  name?: string;
  call_id?: string;
  arguments?: string;
};

type RealtimeSessionResponse = {
  client_secret?: string;
  model?: string;
  voice?: MayusRealtimeVoice;
  expires_at?: string | null;
  error?: string;
};

const REALTIME_STATUS_LABEL: Record<RealtimeStatus, string> = {
  idle: "Realtime pronto",
  connecting: "Conectando Realtime",
  listening: "Ouvindo",
  thinking: "Pensando",
  speaking: "Falando",
  tool_calling: "Consultando Brain",
  error: "Realtime bloqueado",
};

const MODEL_PRESETS: Record<string, Array<Omit<ModelOption, "provider">>> = {
  openrouter: [
    { model: "qwen/qwen3.6-plus", label: "Qwen 3.6 Plus", description: "Rapido e bom para rotina geral" },
    { model: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet", description: "Melhor para raciocinio juridico longo" },
    { model: "openai/gpt-5.2", label: "GPT-5.2", description: "Analise forte e respostas mais robustas" },
    { model: "google/gemini-3.1-pro-preview-customtools", label: "Gemini Pro", description: "Contexto amplo e documentos grandes" },
    { model: "deepseek/deepseek-chat", label: "DeepSeek", description: "Boa relacao custo/desempenho" },
  ],
  openai: [
    { model: "gpt-5.4-nano", label: "GPT-5.4 Nano", description: "Baixa latencia para chat diario" },
    { model: "gpt-5.4-mini", label: "GPT-5.4 Mini", description: "Equilibrio para operacoes" },
    { model: "gpt-5.2", label: "GPT-5.2", description: "Trabalho juridico mais profundo" },
  ],
  anthropic: [
    { model: "claude-haiku-4-5-20251001", label: "Claude Haiku", description: "Rapido para atendimento" },
    { model: "claude-sonnet-4-6", label: "Claude Sonnet", description: "Contratos, pecas e leitura longa" },
  ],
  google: [
    { model: "gemini-2.0-flash", label: "Gemini Flash", description: "Rapido para respostas gerais" },
    { model: "gemini-3.1-pro-preview-customtools", label: "Gemini Pro", description: "Contexto longo e analise documental" },
  ],
  gemini: [
    { model: "gemini-2.0-flash", label: "Gemini Flash", description: "Rapido para respostas gerais" },
    { model: "gemini-3.1-pro-preview-customtools", label: "Gemini Pro", description: "Contexto longo e analise documental" },
  ],
  groq: [
    { model: "llama-3.3-70b-versatile", label: "Llama 70B", description: "Rapido para testes e rascunhos" },
  ],
};

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
        <div className="bg-gray-200 dark:bg-black/40 rounded-xl p-3 space-y-1.5">
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
  const [apiKeyData, setApiKeyData] = useState<{ provider: string; model: string } | null>(null);
  const [availableIntegrations, setAvailableIntegrations] = useState<{ provider: string; model: string }[]>([]);
  const [isModelSwitcherOpen, setIsModelSwitcherOpen] = useState(false);
  const [customModelInput, setCustomModelInput] = useState("");
  const [checkingVault, setCheckingVault] = useState(true);
  // Novos estados da Fase 5A
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [selectedRealtimeVoice, setSelectedRealtimeVoice] = useState<MayusRealtimeVoice>(DEFAULT_MAYUS_REALTIME_VOICE);
  const [isVoiceSwitcherOpen, setIsVoiceSwitcherOpen] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("idle");
  const [conversationTransport, setConversationTransport] = useState<ConversationTransport>("idle");
  const [realtimeCost, setRealtimeCost] = useState<MayusRealtimeCostEstimate | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const isConversationModeRef = useRef(false);
  const conversationTransportRef = useRef<ConversationTransport>("idle");
  const currentConversationIdRef = useRef<string | null>(null);
  const realtimePeerRef = useRef<RTCPeerConnection | null>(null);
  const realtimeDataChannelRef = useRef<RTCDataChannel | null>(null);
  const realtimeMediaStreamRef = useRef<MediaStream | null>(null);
  const realtimeAudioRef = useRef<HTMLAudioElement | null>(null);
  const realtimeFunctionArgsRef = useRef<Record<string, string>>({});
  const realtimeProcessedCallsRef = useRef<Set<string>>(new Set());
  const realtimeStartedAtRef = useRef<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isConversationMode, setIsConversationMode] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<number | string | null>(null);
  const { profile, isLoading: profileLoading } = useUserProfile();
  const { startWorking, present } = useOrbState();

  const modelOptions = useMemo<ModelOption[]>(() => {
    const seen = new Set<string>();
    const options: ModelOption[] = [];

    for (const integration of availableIntegrations) {
      const provider = integration.provider;
      const configuredKey = `${provider}:${integration.model}`;
      if (!seen.has(configuredKey)) {
        seen.add(configuredKey);
        options.push({
          provider,
          model: integration.model,
          label: `${provider.toUpperCase()} atual`,
          description: "Modelo salvo na integracao",
        });
      }

      for (const preset of MODEL_PRESETS[provider.toLowerCase()] || []) {
        const key = `${provider}:${preset.model}`;
        if (seen.has(key)) continue;
        seen.add(key);
        options.push({ provider, ...preset });
      }
    }

    return options;
  }, [availableIntegrations]);

  const selectChatModel = (option: { provider: string; model: string }, announce = true) => {
    setApiKeyData({ provider: option.provider, model: option.model });
    setCustomModelInput(option.model);
    setIsModelSwitcherOpen(false);
    if (announce) {
      setMessages((prev) => [
        ...prev,
        { role: "system", content: `Cortex ajustado para ${option.provider.toUpperCase()} / ${option.model}.` },
      ]);
    }
  };

  const loadBrainStatus = useCallback(async () => {
    setCheckingVault(true);
    try {
      const response = await fetch("/api/brain/status", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao carregar status do cerebro.");
      }

      const availableProviders = Array.isArray(data?.available_providers)
        ? data.available_providers
            .filter((item: any) => item?.provider && item?.model)
            .map((item: any) => ({
              provider: String(item.provider),
              model: String(item.model),
            }))
        : [];

      setAvailableIntegrations(availableProviders);

      if (data?.configured && data?.default_provider && data?.default_model) {
        setApiKeyData({
          provider: String(data.default_provider),
          model: String(data.default_model),
        });
      } else {
        setApiKeyData(null);
      }
    } catch (err) {
      console.error(err);
      setApiKeyData(null);
      setAvailableIntegrations([]);
    } finally {
      setCheckingVault(false);
    }
  }, []);

  useEffect(() => {
    if (!profileLoading) {
      if (profile?.tenant_id) {
        void loadBrainStatus();
        fetchConversations();
      } else {
        setCheckingVault(false);
      }
    }
  }, [profile?.tenant_id, profileLoading, loadBrainStatus]);

  useEffect(() => {
    if (apiKeyData?.model) {
      setCustomModelInput(apiKeyData.model);
    }
  }, [apiKeyData?.model]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isConversationMode) {
        stopConversationMode();
        toast.info("Modo Conversa desativado.");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConversationMode]);

  useEffect(() => {
    isConversationModeRef.current = isConversationMode;
  }, [isConversationMode]);

  useEffect(() => {
    conversationTransportRef.current = conversationTransport;
  }, [conversationTransport]);

  useEffect(() => {
    currentConversationIdRef.current = currentConversationId;
  }, [currentConversationId]);

  const fetchConversations = async () => {
    try {
      const res = await fetch("/api/ai/conversations");
      const data = await res.json();
      if (data.conversations) setConversations(data.conversations);
    } catch (err) {
      console.error("Erro ao carregar histórico:", err);
    }
  };

  const ensureConversationForRealtime = async () => {
    if (currentConversationIdRef.current) return currentConversationIdRef.current;

    const response = await fetch("/api/ai/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Conversa por voz" }),
    });
    if (!response.ok) throw new Error("Falha ao iniciar conversa por voz.");

    const data = await response.json();
    const conversationId = String(data?.conversation?.id || "");
    if (!conversationId) throw new Error("Conversa por voz sem identificador.");

    currentConversationIdRef.current = conversationId;
    setCurrentConversationId(conversationId);
    setConversations((prev) => [data.conversation, ...prev]);
    return conversationId;
  };

  const persistRealtimeMessage = async (message: Message) => {
    try {
      const conversationId = await ensureConversationForRealtime();
      await fetch(`/api/ai/conversations/${conversationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: message.role,
          content: message.content,
          kernel: message.kernel || {},
        }),
      });
    } catch (error) {
      console.warn("[MAYUS Realtime] Falha ao persistir mensagem de voz", error);
    }
  };

  const appendRealtimeMessage = (message: Message) => {
    const content = message.content.trim();
    if (!content) return;
    const finalMessage = { ...message, content };
    setMessages((prev) => [...prev, finalMessage]);
    void persistRealtimeMessage(finalMessage);
  };

  const loadConversation = async (id: string) => {
    stopConversationMode();
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
    stopConversationMode();
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
        setApiKeyData({ provider: currentProvider, model: targetProvider.model });
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
      startWorking({ source: "chat" });
      const response = await fetch("/api/brain/chat-turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          provider: currentProvider,
          model: currentModel,
          conversationId: convId,
          history: messages
            .filter(m => m.role === "user" || m.role === "model")
            .map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        present({
          source: "chat",
          event: data?.orb,
          message: data?.error || "O MAYUS encontrou um bloqueio e vai mostrar o que aconteceu.",
        });
        throw new Error(data.error || "A IA não conseguiu responder.");
      }
      aiResponseData = data;
      present({
        source: "chat",
        event: data?.orb,
        message: data?.orb?.message,
      });

      // ── Fluxo de aprovação humana ──────────────────────────────────────
      if (
        data.kernel?.status === "awaiting_approval" &&
        data.kernel?.auditLogId &&
        data.kernel?.awaitingPayload
      ) {
        const newMessages: Message[] = [];
        if (data.reply) {
          newMessages.push({ role: "model", content: data.reply, kernel: data.kernel || {} });
        }
        newMessages.push({
          role: "approval",
          content: "",
          kernel: {
            status: data.kernel.status,
            auditLogId: data.kernel.auditLogId,
            awaitingPayload: data.kernel.awaitingPayload,
            taskId: data.kernel.taskId,
            runId: data.kernel.runId,
            stepId: data.kernel.stepId,
          },
        });
        setMessages(prev => [...prev, ...newMessages]);
      } 
      // ── Fluxo normal ────────────────────────────
      else {
        const reply = data.reply ?? "";
        const replyChunks = reply.split(/\n\n+/).filter((c: string) => c.trim().length > 0);
        const newMessages: Message[] = replyChunks.length > 0
          ? replyChunks.map((chunk: string, chunkIdx: number) => ({
              role: "model" as const,
              content: chunk.trim(),
              kernel: chunkIdx === 0 ? (data.kernel || {}) : undefined,
            }))
          : [{ role: "model" as const, content: reply || "...", kernel: data.kernel || {} }];
        setMessages(prev => [...prev, ...newMessages]);
      }
    } catch (err: any) {
      present({
        source: "chat",
        message: "O MAYUS encontrou um bloqueio e vai mostrar o que aconteceu.",
      });
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
              body: JSON.stringify({ role: "model", content: aiResponseData.reply, kernel: aiResponseData.kernel || {} }),
            });
            
            // Se estiver no Modo Conversa, tocar áudio automaticamente
           if (isConversationModeRef.current && conversationTransportRef.current === "legacy") {
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
          provider: currentProvider,
          model: currentModel,
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
      const url = `/api/ai/tts?text=${encodeURIComponent(msgContent)}`;
      
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      const audio = new Audio(url);
      audioRef.current = audio;
      
      audio.onended = () => {
        setPlayingMessageId(null);
        // Se estiver no Modo Conversa, reabrir microfone após a IA terminar de falar
        if (isConversationModeRef.current && conversationTransportRef.current === "legacy") {
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

  const stopRealtimeSession = () => {
    realtimeDataChannelRef.current?.close();
    realtimeDataChannelRef.current = null;

    realtimePeerRef.current?.getSenders().forEach((sender) => sender.track?.stop());
    realtimePeerRef.current?.close();
    realtimePeerRef.current = null;

    realtimeMediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    realtimeMediaStreamRef.current = null;

    if (realtimeAudioRef.current) {
      realtimeAudioRef.current.pause();
      realtimeAudioRef.current.srcObject = null;
      realtimeAudioRef.current.remove();
      realtimeAudioRef.current = null;
    }

    realtimeFunctionArgsRef.current = {};
    realtimeProcessedCallsRef.current.clear();
    realtimeStartedAtRef.current = null;
    setRealtimeStatus("idle");
  };

  const stopConversationMode = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    audioRef.current?.pause();
    setPlayingMessageId(null);
    setIsRecording(false);
    stopRealtimeSession();
    setConversationTransport("idle");
    setIsConversationMode(false);
  };

  const sendRealtimeEvent = (event: Record<string, unknown>) => {
    const channel = realtimeDataChannelRef.current;
    if (!channel || channel.readyState !== "open") return false;
    channel.send(JSON.stringify(event));
    return true;
  };

  const handleRealtimeCost = (usage: RealtimeUsage | null | undefined) => {
    const estimate = estimateMayusRealtimeUsageCost(usage);
    if (!estimate.usd) return;

    setRealtimeCost((previous) => ({
      usd: (previous?.usd || 0) + estimate.usd,
      brl: (previous?.brl || 0) + estimate.brl,
      textInputTokens: (previous?.textInputTokens || 0) + estimate.textInputTokens,
      textOutputTokens: (previous?.textOutputTokens || 0) + estimate.textOutputTokens,
      audioInputTokens: (previous?.audioInputTokens || 0) + estimate.audioInputTokens,
      audioOutputTokens: (previous?.audioOutputTokens || 0) + estimate.audioOutputTokens,
    }));
  };

  const handleRealtimeFunctionCall = async (call: RealtimeFunctionCall) => {
    if (call.name !== "consultar_cerebro_mayus" || !call.call_id) return;
    if (realtimeProcessedCallsRef.current.has(call.call_id)) return;
    realtimeProcessedCallsRef.current.add(call.call_id);
    setRealtimeStatus("tool_calling");

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.arguments || "{}");
    } catch {
      args = {};
    }

    const prompt = typeof args.prompt === "string" && args.prompt.trim()
      ? args.prompt.trim()
      : "Consulta de voz recebida pelo Realtime do MAYUS.";
    const reason = typeof args.reason === "string" ? args.reason : "realtime_voice";
    const conversationSummary = typeof args.conversationSummary === "string" ? args.conversationSummary : "";

    appendRealtimeMessage({
      role: "system",
      content: "MAYUS Realtime consultou o Brain operacional.",
    });

    try {
      const response = await fetch("/api/agent/voice/brain-bridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolName: "consultar_cerebro_mayus",
          prompt,
          toolPayload: {
            prompt,
            reason,
            conversationSummary,
            provider: "openai_realtime",
            voice: selectedRealtimeVoice,
          },
          history: messages
            .filter((message) => message.role === "user" || message.role === "model")
            .slice(-8)
            .map((message) => ({ role: message.role, content: message.content })),
        }),
      });
      const data = await response.json().catch(() => ({}));

      const output = response.ok
        ? {
            ok: true,
            reply: data?.reply || "Brain consultado sem resposta textual.",
            kernel: data?.kernel || {},
            taskId: data?.taskId || null,
            runId: data?.runId || null,
            stepId: data?.stepId || null,
          }
        : {
            ok: false,
            error: data?.error || "Falha ao consultar o MAYUS Brain.",
          };

      sendRealtimeEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(output),
        },
      });
      sendRealtimeEvent({ type: "response.create" });
      setRealtimeStatus("thinking");
    } catch (error: any) {
      sendRealtimeEvent({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify({
            ok: false,
            error: error?.message || "Falha de rede ao consultar o MAYUS Brain.",
          }),
        },
      });
      sendRealtimeEvent({ type: "response.create" });
      setRealtimeStatus("error");
    }
  };

  const handleRealtimeEvent = (event: any) => {
    if (!event?.type) return;

    if (event.type === "error") {
      console.error("[MAYUS Realtime]", event);
      setRealtimeStatus("error");
      toast.error(event?.error?.message || "Realtime encontrou um bloqueio.");
      return;
    }

    if (event.type === "input_audio_buffer.speech_started") {
      setRealtimeStatus("listening");
      return;
    }

    if (event.type === "input_audio_buffer.speech_stopped") {
      setRealtimeStatus("thinking");
      return;
    }

    if (event.type === "response.created") {
      setRealtimeStatus("thinking");
      return;
    }

    if (event.type === "response.audio.delta") {
      setRealtimeStatus("speaking");
      return;
    }

    if (event.type === "response.audio.done") {
      setRealtimeStatus("listening");
      return;
    }

    if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) {
      appendRealtimeMessage({ role: "user", content: String(event.transcript) });
      setInput("");
      return;
    }

    if (
      (event.type === "response.audio_transcript.done" || event.type === "response.output_text.done") &&
      event.transcript
    ) {
      appendRealtimeMessage({ role: "model", content: String(event.transcript) });
      return;
    }

    if (event.type === "response.function_call_arguments.delta" && event.call_id) {
      realtimeFunctionArgsRef.current[event.call_id] =
        (realtimeFunctionArgsRef.current[event.call_id] || "") + String(event.delta || "");
      return;
    }

    if (event.type === "response.done") {
      handleRealtimeCost(event.response?.usage);
      const output = Array.isArray(event.response?.output) ? event.response.output : [];
      const functionCalls = output.filter((item: RealtimeFunctionCall) => item?.type === "function_call");
      for (const call of functionCalls) {
        const mergedCall = {
          ...call,
          arguments: call.arguments || realtimeFunctionArgsRef.current[call.call_id || ""],
        };
        void handleRealtimeFunctionCall(mergedCall);
      }
      if (functionCalls.length === 0) setRealtimeStatus("listening");
    }
  };

  const startRealtimeSession = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Seu navegador nao liberou microfone para Realtime.");
    }

    setRealtimeStatus("connecting");
    setRealtimeCost(null);
    realtimeStartedAtRef.current = Date.now();

    const sessionResponse = await fetch("/api/agent/voice/realtime-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: selectedRealtimeVoice }),
    });
    const sessionData = (await sessionResponse.json().catch(() => ({}))) as RealtimeSessionResponse;
    if (!sessionResponse.ok || !sessionData.client_secret) {
      throw new Error(sessionData.error || "Falha ao criar sessao Realtime.");
    }

    const peer = new RTCPeerConnection();
    realtimePeerRef.current = peer;

    const remoteAudio = document.createElement("audio");
    remoteAudio.autoplay = true;
    realtimeAudioRef.current = remoteAudio;
    peer.ontrack = (event) => {
      remoteAudio.srcObject = event.streams[0];
      void remoteAudio.play().catch(() => {});
    };

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    realtimeMediaStreamRef.current = stream;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    const channel = peer.createDataChannel("oai-events");
    realtimeDataChannelRef.current = channel;
    channel.addEventListener("open", () => {
      setRealtimeStatus("listening");
      setConversationTransport("realtime");
      toast.success("MAYUS Realtime ativo.");
    });
    channel.addEventListener("message", (message) => {
      try {
        handleRealtimeEvent(JSON.parse(message.data));
      } catch (error) {
        console.warn("[MAYUS Realtime] Evento invalido", error);
      }
    });
    channel.addEventListener("close", () => {
      if (conversationTransportRef.current === "realtime") setRealtimeStatus("idle");
    });

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);

    const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      body: offer.sdp,
      headers: {
        Authorization: `Bearer ${sessionData.client_secret}`,
        "Content-Type": "application/sdp",
      },
    });
    if (!sdpResponse.ok) {
      throw new Error("OpenAI Realtime recusou a conexao WebRTC.");
    }

    await peer.setRemoteDescription({
      type: "answer",
      sdp: await sdpResponse.text(),
    });
  };

  const startLegacyConversationMode = () => {
    setConversationTransport("legacy");
    setRealtimeStatus("error");
    setTimeout(() => {
      if (!isRecording && !playingMessageId) toggleRecording();
    }, 500);
  };

  const toggleConversationMode = async () => {
    if (isConversationMode) {
      stopConversationMode();
      toast.info("Modo Conversa desativado.");
      return;
    }

    setIsConversationMode(true);
    setConversationTransport("realtime");
    try {
      await startRealtimeSession();
    } catch (error: any) {
      console.error("[MAYUS Realtime] fallback", error);
      stopRealtimeSession();
      toast.error(error?.message || "Realtime indisponivel. Usando fallback de voz.");
      startLegacyConversationMode();
    }
  };

  useEffect(() => {
    return () => {
      stopConversationMode();
    };
  }, []);

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
    <div className={`flex h-[calc(100vh-80px)] bg-gray-200 dark:bg-black overflow-hidden relative ${montserrat.className}`}>
      
      {/* Botão Mobile Menu Toggle */}
      <button 
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="md:hidden absolute top-4 left-4 z-50 p-2 bg-gray-50 dark:bg-[#141414] border border-[#CCA761]/30 rounded-lg text-[#CCA761]"
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
                <div className="w-full h-full bg-gray-200 dark:bg-black rounded-full flex items-center justify-center">
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
            <div className="relative flex items-stretch rounded-xl border border-white/10 bg-white/5">
              <button
                onClick={toggleConversationMode}
                disabled={realtimeStatus === "connecting"}
                className={`flex items-center gap-2 px-4 py-2 transition-all text-[10px] font-black uppercase tracking-[0.2em] ${
                  isConversationMode
                    ? 'bg-[#CCA761] text-black shadow-[0_0_20px_rgba(204,167,97,0.4)]'
                    : 'text-gray-500 hover:text-[#CCA761] hover:bg-white/5'
                }`}
              >
                {realtimeStatus === "connecting" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {isConversationMode ? REALTIME_STATUS_LABEL[realtimeStatus] : 'Ativar Modo Conversa'}
              </button>
              <button
                type="button"
                onClick={() => setIsVoiceSwitcherOpen((value) => !value)}
                className="flex items-center gap-1 border-l border-white/10 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#CCA761] hover:bg-[#CCA761]/10 transition-colors"
                title="Escolher voz Realtime"
              >
                <Headphones size={13} />
                {selectedRealtimeVoice}
                <ChevronDown size={12} />
              </button>

              {isVoiceSwitcherOpen && (
                <div className="absolute right-0 top-full mt-3 w-[min(86vw,300px)] rounded-2xl border border-[#CCA761]/25 bg-[#080808] shadow-2xl shadow-black/60 z-50 overflow-hidden">
                  <div className="p-4 border-b border-white/10">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#CCA761] font-black">Voz Realtime</p>
                    <p className="mt-1 text-[11px] text-gray-500 normal-case tracking-normal">
                      Trocar a voz exige reiniciar a sessao ativa.
                    </p>
                  </div>
                  <div className="max-h-72 overflow-y-auto p-2 space-y-1">
                    {REALTIME_VOICE_OPTIONS.map((voice) => {
                      const active = selectedRealtimeVoice === voice.value;
                      return (
                        <button
                          key={voice.value}
                          type="button"
                          onClick={() => {
                            setSelectedRealtimeVoice(voice.value);
                            setIsVoiceSwitcherOpen(false);
                            if (isConversationMode) {
                              stopConversationMode();
                              toast.info("Voz alterada. Ative o modo conversa novamente para testar.");
                            }
                          }}
                          className={`w-full text-left rounded-xl px-3 py-3 border transition-colors ${
                            active
                              ? "border-[#CCA761]/50 bg-[#CCA761]/10"
                              : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold text-gray-100">{voice.label}</p>
                              <p className="mt-1 text-[11px] text-gray-500">{voice.description}</p>
                            </div>
                            {active && <CheckCircle size={16} className="text-[#CCA761] shrink-0 mt-0.5" />}
                          </div>
                        </button>
                      );
                    })}
                    <div className="px-3 py-2 text-[10px] text-gray-600">
                      Onyx continua no fallback TTS, nao no Realtime.
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsModelSwitcherOpen((value) => !value)}
                className="bg-[#CCA761]/10 border border-[#CCA761]/20 px-3 py-1.5 flex items-center gap-3 rounded-lg text-xs tracking-widest text-[#CCA761] font-bold uppercase hover:border-[#CCA761]/50 hover:bg-[#CCA761]/15 transition-colors"
                title="Trocar modelo do chat"
              >
                <SlidersHorizontal size={14} />
                <span className="flex flex-col items-end">
                  <span>{apiKeyData.provider}</span>
                  <span className="text-[9px] text-gray-500 lowercase opacity-80 mt-0.5 truncate max-w-[150px]">{apiKeyData.model}</span>
                </span>
              </button>

              {isModelSwitcherOpen && (
                <div className="absolute right-0 top-full mt-3 w-[min(92vw,420px)] rounded-2xl border border-[#CCA761]/25 bg-[#080808] shadow-2xl shadow-black/60 z-50 overflow-hidden">
                  <div className="p-4 border-b border-white/10">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#CCA761] font-black">Modelo do chat</p>
                    <p className="mt-1 text-[11px] text-gray-500 normal-case tracking-normal">
                      Troca apenas esta sessao de conversa para testar respostas.
                    </p>
                  </div>

                  <div className="max-h-80 overflow-y-auto p-2 space-y-1">
                    {modelOptions.length === 0 ? (
                      <div className="p-4 text-xs text-gray-500">Nenhum provedor conectado encontrado.</div>
                    ) : (
                      modelOptions.map((option) => {
                        const active = option.provider === apiKeyData.provider && option.model === apiKeyData.model;
                        return (
                          <button
                            key={`${option.provider}:${option.model}`}
                            type="button"
                            onClick={() => selectChatModel(option)}
                            className={`w-full text-left rounded-xl px-3 py-3 border transition-colors ${
                              active
                                ? "border-[#CCA761]/50 bg-[#CCA761]/10"
                                : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-100 truncate">{option.label}</p>
                                <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#CCA761]/80 truncate">
                                  {option.provider} / {option.model}
                                </p>
                                <p className="mt-1 text-[11px] text-gray-500">{option.description}</p>
                              </div>
                              {active && <CheckCircle size={16} className="text-[#CCA761] shrink-0 mt-0.5" />}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="p-3 border-t border-white/10 bg-white/[0.02]">
                    <label className="block text-[9px] uppercase tracking-[0.22em] text-gray-500 font-black mb-2">
                      Modelo customizado
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={customModelInput}
                        onChange={(event) => setCustomModelInput(event.target.value)}
                        className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs text-gray-200 outline-none focus:border-[#CCA761]/60"
                        placeholder="ex: qwen/qwen3.6-plus"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const model = customModelInput.trim();
                          if (!model || !apiKeyData) return;
                          selectChatModel({ provider: apiKeyData.provider, model });
                        }}
                        disabled={!customModelInput.trim()}
                        className="rounded-xl border border-[#CCA761]/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#CCA761] disabled:opacity-40"
                      >
                        Usar
                      </button>
                    </div>
                  </div>
                </div>
              )}
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
                  <div className="max-w-[85%]">
                    <ApprovalCard
                      auditLogId={msg.kernel.auditLogId}
                      awaitingPayload={msg.kernel.awaitingPayload as AwaitingPayload}
                      onDecided={(decision) => {
                        if (isConversationModeRef.current && conversationTransportRef.current === "legacy") {
                          const confirmMsg = decision === 'approved'
                            ? "Excelente! Aprovado. Executando agora mesmo, Doutor!"
                            : "Entendido. Ação cancelada conforme solicitado.";
                          playMessage(confirmMsg, `decide_${idx}`);
                        }
                      }}
                    />
                  </div>
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
                  <ReactMarkdown
                    components={{
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer"
                           className="text-yellow-400 underline hover:text-yellow-300">
                          {children}
                        </a>
                      )
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>

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
                data-testid="mayus-chat-input"
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  isConversationMode
                    ? `${REALTIME_STATUS_LABEL[realtimeStatus]}... voz ${selectedRealtimeVoice}.`
                    : "Sua instrução para a IA..."
                }
                className={`w-full bg-gray-50 dark:bg-[#141414] border rounded-2xl pl-6 pr-14 py-4 focus:outline-none transition-all text-sm text-gray-200 shadow-xl ${
                  isConversationMode 
                    ? 'border-[#CCA761]/40 shadow-[#CCA761]/5' 
                    : 'border-white/10 focus:border-[#CCA761]/50'
                }`}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={isConversationMode && conversationTransport === "realtime" ? toggleConversationMode : toggleRecording}
                disabled={isLoading}
                className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full transition-all ${
                  realtimeStatus === "connecting"
                    ? 'bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30'
                    : conversationTransport === "realtime" && realtimeStatus === "speaking"
                    ? 'bg-[#CCA761] text-black animate-pulse shadow-[0_0_15px_rgba(204,167,97,0.4)]'
                    : isRecording
                    ? 'bg-[#CCA761] text-black animate-pulse shadow-[0_0_15px_rgba(204,167,97,0.4)]' 
                    : playingMessageId 
                    ? 'bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30'
                    : 'text-gray-500 hover:text-[#CCA761]'
                }`}
                title={conversationTransport === "realtime" ? "Encerrar Realtime" : isRecording ? "Ouvindo..." : playingMessageId ? "IA Falando" : "Ditar Mensagem"}
              >
                {realtimeStatus === "connecting"
                  ? <Loader2 size={18} className="animate-spin" />
                  : conversationTransport === "realtime" && realtimeStatus === "speaking"
                    ? <Volume2 size={18} className="animate-pulse" />
                    : playingMessageId
                      ? <Volume2 size={18} className="animate-pulse" />
                      : <Mic size={18} />}
              </button>
            </div>
            <button
              data-testid="mayus-send-button"
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
               {isConversationMode
                 ? `modo conversa ${conversationTransport} • ${REALTIME_STATUS_LABEL[realtimeStatus].toLowerCase()} • voz ${selectedRealtimeVoice}${realtimeCost ? ` • US$ ${realtimeCost.usd.toFixed(3)} / R$ ${realtimeCost.brl.toFixed(2)}` : ""}`
                 : 'As sessões e decisões do kernel no ambiente logado são auditáveis.'}
             </p>
          </div>
        </div>

      </main>
    </div>
  );
}
