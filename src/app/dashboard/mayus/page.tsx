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
import {
  DEFAULT_MAYUS_REALTIME_MODEL,
  DEFAULT_MAYUS_REALTIME_VOICE,
  MAYUS_REALTIME_BRL_PER_USD,
  MAYUS_REALTIME_WEB_SEARCH_USD_PER_CALL,
  REALTIME_MODEL_OPTIONS,
  REALTIME_VOICE_OPTIONS,
  estimateMayusRealtimeUsageCost,
  normalizeMayusRealtimeModel,
  type MayusRealtimeCostEstimate,
  type MayusRealtimeModel,
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

const CHAT_TURN_TIMEOUT_MS = 35_000;
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
  capabilityName?: string;
  handlerType?: string | null;
  missionKind?: string;
  voiceReply?: string;
  approvalRequired?: boolean;
  approvalId?: string | null;
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
  | "searching"
  | "creating_task"
  | "consulting_mayus"
  | "awaiting_approval"
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
  model?: MayusRealtimeModel;
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
  searching: "Pesquisando",
  creating_task: "Criando tarefa",
  consulting_mayus: "Consultando MAYUS",
  awaiting_approval: "Aguardando aprovacao",
  error: "Realtime bloqueado",
};

const REALTIME_STUCK_STATUSES = new Set<RealtimeStatus>([
  "thinking",
  "tool_calling",
  "searching",
  "creating_task",
  "consulting_mayus",
]);

const MISSION_KIND_LABELS: Record<string, string> = {
  case_status: "Status do caso",
  process_mission_plan: "Missao processual",
  process_execute_next: "Proximo passo seguro",
};

const KERNEL_STATUS_LABELS: Record<string, string> = {
  executed: "Concluido",
  success: "Concluido",
  completed: "Concluido",
  awaiting_approval: "Aguardando aprovacao",
  failed: "Bloqueado",
  blocked: "Bloqueado",
  timeout: "Tempo esgotado",
};

const FINANCE_ARTIFACT_TYPE_LABELS: Record<string, string> = {
  asaas_billing: "Asaas billing",
  collections_followup_plan: "Plano de cobranca",
  revenue_flow_plan: "Revenue-to-case",
  revenue_case_opening: "Caso aberto por receita",
  revenue_to_case: "Revenue-to-case",
};

const FINANCE_CAPABILITY_ARTIFACT_TYPES: Record<string, string> = {
  billing_create: "asaas_billing",
  asaas_cobrar: "asaas_billing",
  collections_followup: "collections_followup_plan",
  finance_collections_followup: "collections_followup_plan",
  revenue_flow_plan: "revenue_flow_plan",
  growth_revenue_flow_plan: "revenue_flow_plan",
  revenue_to_case: "revenue_to_case",
};

type FinanceArtifactHighlight = {
  artifactType: string;
  label: string;
  status: string;
  details: string[];
};

function getPayloadString(payload: Record<string, unknown> | undefined, keys: string[]) {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "sim" : "nao";
  }
  return null;
}

function inferFinanceArtifactType(kernel?: MessageKernel) {
  if (!kernel) return null;
  const payload = kernel.outputPayload || {};
  const directType = getPayloadString(payload, ["artifact_type", "artifactType"]);
  if (directType && FINANCE_ARTIFACT_TYPE_LABELS[directType]) return directType;

  if (getPayloadString(payload, ["cobranca_id", "billing_idempotency_key", "billing_status"])) {
    return "asaas_billing";
  }
  if (getPayloadString(payload, ["collection_stage", "collection_priority", "days_overdue"])) {
    return "collections_followup_plan";
  }
  if (getPayloadString(payload, ["revenue_flow_step_count", "revenue_flow_blocked_reason"])) {
    return "revenue_flow_plan";
  }

  const capability = kernel.capabilityName || kernel.awaitingPayload?.skillName || "";
  const handlerType = kernel.handlerType || "";
  return FINANCE_CAPABILITY_ARTIFACT_TYPES[capability] ||
    FINANCE_CAPABILITY_ARTIFACT_TYPES[handlerType] ||
    null;
}

function getFinanceArtifactHighlights(kernel?: MessageKernel): FinanceArtifactHighlight[] {
  const artifactType = inferFinanceArtifactType(kernel);
  if (!artifactType || !kernel) return [];
  const payload = kernel.outputPayload || {};
  const label = FINANCE_ARTIFACT_TYPE_LABELS[artifactType] || artifactType;
  const status = artifactType === "asaas_billing"
    ? getPayloadString(payload, ["billing_status", "status_inicial"]) || (kernel.approvalRequired ? "aguardando aprovacao" : "registrado")
    : artifactType === "collections_followup_plan"
      ? getPayloadString(payload, ["collection_priority", "collection_stage"]) || "plano criado"
      : getPayloadString(payload, ["revenue_flow_blocked_reason"]) || getPayloadString(payload, ["status"]) || "trilha supervisionada";

  const cobrancaId = getPayloadString(payload, ["cobranca_id"]);
  const collectionStage = getPayloadString(payload, ["collection_stage"]);
  const revenueStepCount = getPayloadString(payload, ["revenue_flow_step_count"]);
  const crmTaskId = getPayloadString(payload, ["crm_task_id"]);
  const billingArtifactId = getPayloadString(payload, ["billing_artifact_id"]);
  const financialId = getPayloadString(payload, ["financial_id"]);
  const details = [
    artifactType === "asaas_billing" && cobrancaId ? `cobranca: ${cobrancaId}` : null,
    artifactType === "collections_followup_plan" && collectionStage ? `estagio: ${collectionStage}` : null,
    artifactType === "revenue_flow_plan" && revenueStepCount ? `etapas: ${revenueStepCount}` : null,
    crmTaskId ? `crm: ${crmTaskId}` : null,
    billingArtifactId ? `billing: ${billingArtifactId}` : null,
    financialId ? `financial: ${financialId}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .slice(0, 4);

  return [{ artifactType, label, status, details }];
}

function getKernelHighlight(kernel?: MessageKernel) {
  if (!kernel) return null;

  const capability = kernel.capabilityName || "";
  const missionKind = kernel.missionKind || (
    capability === "support_case_status"
      ? "case_status"
      : capability === "legal_process_mission_plan"
        ? "process_mission_plan"
        : capability === "legal_process_mission_execute_next"
          ? "process_execute_next"
          : ""
  );
  const financeLabel = FINANCE_ARTIFACT_TYPE_LABELS[inferFinanceArtifactType(kernel) || ""] || null;
  const label = financeLabel || (missionKind ? MISSION_KIND_LABELS[missionKind] : null);
  const statusLabel = KERNEL_STATUS_LABELS[kernel.status] || kernel.status;
  const approval = Boolean(kernel.approvalRequired || kernel.status === "awaiting_approval");

  if (!label && !approval) return null;
  return {
    label: label || "Aprovacao MAYUS",
    statusLabel,
    approval,
  };
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs = 40_000) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    window.clearTimeout(timeout);
  }
}

function normalizeDashboardRole(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isMayusRealtimeTesterRole(role: string | null | undefined) {
  return ["admin", "administrador", "socio", "mayus_admin"].includes(normalizeDashboardRole(role));
}

function formatRealtimeDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

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
  const financeArtifactType = FINANCE_CAPABILITY_ARTIFACT_TYPES[awaitingPayload.skillName] || null;
  const financeArtifactLabel = financeArtifactType ? FINANCE_ARTIFACT_TYPE_LABELS[financeArtifactType] : null;

  return (
    <div className="border border-[#CCA761]/30 bg-[#0f0f0f] rounded-2xl p-5 max-w-[85%] space-y-4 animate-in fade-in slide-in-from-bottom-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] text-[#CCA761] uppercase tracking-widest font-bold mb-1 flex items-center gap-1.5">
            <ShieldAlert size={11} /> Aprovação necessária
          </p>
          <p className="text-white font-semibold text-sm">{awaitingPayload.skillName}</p>
          {financeArtifactLabel && (
            <p className="mt-1 inline-flex rounded-full border border-[#CCA761]/30 bg-[#CCA761]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#E2C37A]">
              {financeArtifactLabel}
            </p>
          )}
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
  const [selectedRealtimeModel, setSelectedRealtimeModel] = useState<MayusRealtimeModel>(DEFAULT_MAYUS_REALTIME_MODEL);
  const [selectedRealtimeVoice, setSelectedRealtimeVoice] = useState<MayusRealtimeVoice>(DEFAULT_MAYUS_REALTIME_VOICE);
  const [isVoiceSwitcherOpen, setIsVoiceSwitcherOpen] = useState(false);
  const [isRealtimeModelSwitcherOpen, setIsRealtimeModelSwitcherOpen] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("idle");
  const [conversationTransport, setConversationTransport] = useState<ConversationTransport>("idle");
  const [realtimeCost, setRealtimeCost] = useState<MayusRealtimeCostEstimate | null>(null);
  const [activeRealtimeModel, setActiveRealtimeModel] = useState<MayusRealtimeModel>(DEFAULT_MAYUS_REALTIME_MODEL);
  const [realtimeStartedAtMs, setRealtimeStartedAtMs] = useState<number | null>(null);
  const [realtimeElapsedSeconds, setRealtimeElapsedSeconds] = useState(0);

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
  const canTuneMayusRealtime = Boolean(profile?.is_superadmin) || isMayusRealtimeTesterRole(profile?.role);
  const selectedRealtimeModelOption = REALTIME_MODEL_OPTIONS.find((option) => option.value === selectedRealtimeModel) || REALTIME_MODEL_OPTIONS[0];
  const activeRealtimeModelOption = REALTIME_MODEL_OPTIONS.find((option) => option.value === activeRealtimeModel) || REALTIME_MODEL_OPTIONS[0];

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
    if (conversationTransport !== "realtime" || !REALTIME_STUCK_STATUSES.has(realtimeStatus)) return;

    const timeout = window.setTimeout(() => {
      if (conversationTransportRef.current !== "realtime") return;
      setRealtimeStatus("listening");
      toast.warning("O MAYUS demorou nesse estado. Resetei a escuta para evitar travamento.");
    }, 45_000);

    return () => window.clearTimeout(timeout);
  }, [conversationTransport, realtimeStatus]);

  useEffect(() => {
    if (conversationTransport !== "realtime" || !realtimeStartedAtMs) return;

    const refreshElapsed = () => {
      setRealtimeElapsedSeconds(Math.floor((Date.now() - realtimeStartedAtMs) / 1000));
    };

    refreshElapsed();
    const interval = window.setInterval(refreshElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [conversationTransport, realtimeStartedAtMs]);

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
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), CHAT_TURN_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch("/api/brain/chat-turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
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
      } finally {
        window.clearTimeout(timeout);
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "A IA não conseguiu responder.");
      }
      aiResponseData = data;

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
            capabilityName: data.kernel.capabilityName,
            handlerType: data.kernel.handlerType,
            missionKind: data.kernel.missionKind,
            voiceReply: data.kernel.voiceReply,
            approvalRequired: data.kernel.approvalRequired,
            approvalId: data.kernel.approvalId,
            taskId: data.kernel.taskId,
            runId: data.kernel.runId,
            stepId: data.kernel.stepId,
            outputPayload: data.kernel.outputPayload,
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
      const timedOut = err?.name === "AbortError";
      const errorMessage = timedOut
        ? "O MAYUS demorou mais que o limite seguro para responder. Pode tentar de novo em alguns segundos."
        : err.message;
      toast.error(errorMessage);
      fallbackStatus = true;
      fallbackOutput = timedOut
        ? "O MAYUS demorou mais que o limite seguro para responder. A conversa foi encerrada para nao ficar presa em analise."
        : "Erro Critico: A conexao com o cortex falhou.";
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
    setRealtimeStartedAtMs(null);
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
    const estimate = estimateMayusRealtimeUsageCost(usage, MAYUS_REALTIME_BRL_PER_USD, activeRealtimeModel);
    if (!estimate.usd) return;

    setRealtimeCost((previous) => ({
      model: activeRealtimeModel,
      usd: (previous?.usd || 0) + estimate.usd,
      brl: (previous?.brl || 0) + estimate.brl,
      textInputTokens: (previous?.textInputTokens || 0) + estimate.textInputTokens,
      textOutputTokens: (previous?.textOutputTokens || 0) + estimate.textOutputTokens,
      audioInputTokens: (previous?.audioInputTokens || 0) + estimate.audioInputTokens,
      audioOutputTokens: (previous?.audioOutputTokens || 0) + estimate.audioOutputTokens,
    }));
  };

  const addRealtimeFixedCost = (usd: number) => {
    if (!usd) return;
    setRealtimeCost((previous) => ({
      model: activeRealtimeModel,
      usd: (previous?.usd || 0) + usd,
      brl: (previous?.brl || 0) + usd * MAYUS_REALTIME_BRL_PER_USD,
      textInputTokens: previous?.textInputTokens || 0,
      textOutputTokens: previous?.textOutputTokens || 0,
      audioInputTokens: previous?.audioInputTokens || 0,
      audioOutputTokens: previous?.audioOutputTokens || 0,
    }));
  };

  const sendRealtimeToolOutput = (callId: string, output: Record<string, unknown>) => {
    sendRealtimeEvent({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: JSON.stringify(output),
      },
    });
    sendRealtimeEvent({ type: "response.create" });
  };

  const formatRealtimeSources = (sources: Array<{ title?: string; url?: string }> = []) => {
    const validSources = sources.filter((source) => source?.url);
    if (!validSources.length) return "";
    return [
      "",
      "Fontes:",
      ...validSources.map((source, index) => `${index + 1}. [${source.title || source.url}](${source.url})`),
    ].join("\n");
  };

  const handleRealtimeFunctionCall = async (call: RealtimeFunctionCall) => {
    if (!call.name || !call.call_id) return;
    if (realtimeProcessedCallsRef.current.has(call.call_id)) return;
    realtimeProcessedCallsRef.current.add(call.call_id);

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.arguments || "{}");
    } catch {
      args = {};
    }

    let nextStatus: RealtimeStatus = "thinking";

    try {
      if (call.name === "consultar_cerebro_mayus") {
        setRealtimeStatus("tool_calling");
        const prompt = typeof args.prompt === "string" && args.prompt.trim()
          ? args.prompt.trim()
          : "Consulta de voz recebida pelo Realtime do MAYUS.";
        const reason = typeof args.reason === "string" ? args.reason : "realtime_voice";
        const conversationSummary = typeof args.conversationSummary === "string" ? args.conversationSummary : "";
        const missionKind = typeof args.missionKind === "string" ? args.missionKind : undefined;

        appendRealtimeMessage({
          role: "system",
          content: "MAYUS Realtime consultou o Brain operacional.",
        });

        const { response, data } = await fetchJsonWithTimeout("/api/agent/voice/brain-bridge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            toolName: "consultar_cerebro_mayus",
            prompt,
            toolPayload: {
              prompt,
              reason,
              conversationSummary,
              missionKind,
              provider: "openai_realtime",
              voice: selectedRealtimeVoice,
            },
            history: messages
              .filter((message) => message.role === "user" || message.role === "model")
              .slice(-8)
              .map((message) => ({ role: message.role, content: message.content })),
          }),
        });

        const brainReply = data?.voiceReply || data?.reply || "Brain consultado sem resposta textual.";
        const approvalRequired = Boolean(data?.approvalRequired || data?.kernel?.approvalRequired);
        if (response.ok && (approvalRequired || data?.kernel?.status === "awaiting_approval")) {
          nextStatus = "awaiting_approval";
        }
        if (
          response.ok &&
          data?.kernel?.status === "awaiting_approval" &&
          data?.kernel?.auditLogId &&
          data?.kernel?.awaitingPayload
        ) {
          appendRealtimeMessage({
            role: "approval",
            content: "",
            kernel: {
              status: data.kernel.status,
              auditLogId: data.kernel.auditLogId,
              awaitingPayload: data.kernel.awaitingPayload,
              capabilityName: data.kernel.capabilityName,
              handlerType: data.kernel.handlerType,
              missionKind: data.missionKind || data.kernel.missionKind,
              voiceReply: data.voiceReply || brainReply,
              approvalRequired,
              approvalId: data.approvalId || data.kernel.approvalId || null,
              taskId: data.taskId || data.kernel.taskId,
              runId: data.runId || data.kernel.runId,
              stepId: data.stepId || data.kernel.stepId,
              outputPayload: data.kernel.outputPayload,
            },
          });
        }

        sendRealtimeToolOutput(call.call_id, response.ok
          ? {
              ok: true,
              reply: brainReply,
              voiceReply: data?.voiceReply || brainReply,
              fullReply: data?.reply || brainReply,
              missionKind: data?.missionKind || data?.kernel?.missionKind || "general_brain",
              approvalRequired,
              approvalId: data?.approvalId || data?.kernel?.approvalId || null,
              kernel: data?.kernel || {},
              taskId: data?.taskId || null,
              runId: data?.runId || null,
              stepId: data?.stepId || null,
            }
          : {
              ok: false,
              error: data?.error || "Falha ao consultar o MAYUS Brain.",
            });
      } else if (call.name === "pesquisar_web_mayus") {
        setRealtimeStatus("searching");
        const query = typeof args.query === "string" && args.query.trim() ? args.query.trim() : "";
        const { response, data } = await fetchJsonWithTimeout("/api/agent/voice/realtime-web-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            reason: args.reason,
            conversationSummary: args.conversationSummary,
          }),
        });

        if (response.ok) {
          addRealtimeFixedCost(Number(data?.cost?.usd || MAYUS_REALTIME_WEB_SEARCH_USD_PER_CALL));
          appendRealtimeMessage({
            role: "model",
            content: `Pesquisa web concluida:\n${data?.answer || "Sem resposta textual."}${formatRealtimeSources(data?.sources || [])}`,
          });
        }

        sendRealtimeToolOutput(call.call_id, response.ok
          ? {
              ok: true,
              answer: data?.answer,
              sources: data?.sources || [],
              cost: data?.cost || null,
            }
          : {
              ok: false,
              error: data?.error || "Falha ao pesquisar na web.",
            });
      } else if (call.name === "criar_tarefa_mayus") {
        setRealtimeStatus("creating_task");
        const { response, data } = await fetchJsonWithTimeout("/api/agent/voice/realtime-task", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });

        if (response.ok) {
          if (data?.requiresApproval) nextStatus = "awaiting_approval";
          appendRealtimeMessage({
            role: "model",
            content: `${data?.reply || "Tarefa registrada."}${data?.task?.title ? `\n\nTarefa: ${data.task.title}` : ""}`,
          });
        }

        sendRealtimeToolOutput(call.call_id, response.ok
          ? {
              ok: true,
              reply: data?.reply,
              task: data?.task || null,
              requiresApproval: Boolean(data?.requiresApproval),
            }
          : {
              ok: false,
              error: data?.error || "Falha ao criar tarefa.",
            });
      } else if (call.name === "responder_sobre_mayus") {
        setRealtimeStatus("consulting_mayus");
        const question = typeof args.question === "string" && args.question.trim()
          ? args.question.trim()
          : "O que e o MAYUS?";
        const { response, data } = await fetchJsonWithTimeout("/api/agent/voice/mayus-knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            conversationSummary: args.conversationSummary,
          }),
        });

        if (response.ok) {
          appendRealtimeMessage({
            role: "model",
            content: data?.answer || "Consultei a base interna do MAYUS.",
          });
        }

        sendRealtimeToolOutput(call.call_id, response.ok
          ? {
              ok: true,
              answer: data?.answer,
              sources: data?.sources || [],
            }
          : {
              ok: false,
              error: data?.error || "Falha ao consultar a base do MAYUS.",
            });
      } else {
        sendRealtimeToolOutput(call.call_id, {
          ok: false,
          error: `Ferramenta Realtime nao reconhecida: ${call.name}.`,
        });
      }

      setRealtimeStatus(nextStatus);
    } catch (error: any) {
      sendRealtimeToolOutput(call.call_id, {
        ok: false,
        error: error?.name === "AbortError"
          ? "Tempo limite da ferramenta MAYUS Realtime esgotado."
          : error?.message || "Falha de rede ao executar ferramenta MAYUS Realtime.",
      });
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
    setRealtimeElapsedSeconds(0);
    const startedAt = Date.now();
    realtimeStartedAtRef.current = startedAt;
    setRealtimeStartedAtMs(startedAt);
    setActiveRealtimeModel(selectedRealtimeModel);

    const sessionResponse = await fetch("/api/agent/voice/realtime-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice: selectedRealtimeVoice, model: selectedRealtimeModel }),
    });
    const sessionData = (await sessionResponse.json().catch(() => ({}))) as RealtimeSessionResponse;
    if (!sessionResponse.ok || !sessionData.client_secret) {
      throw new Error(sessionData.error || "Falha ao criar sessao Realtime.");
    }
    setActiveRealtimeModel(normalizeMayusRealtimeModel(sessionData.model));

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
              {canTuneMayusRealtime && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsRealtimeModelSwitcherOpen((value) => !value);
                      setIsVoiceSwitcherOpen(false);
                    }}
                    className="flex items-center gap-1 border-l border-white/10 px-3 text-[10px] font-black uppercase tracking-[0.18em] text-[#CCA761] hover:bg-[#CCA761]/10 transition-colors"
                    title="Escolher modelo Realtime"
                  >
                    <SlidersHorizontal size={13} />
                    {selectedRealtimeModelOption.label}
                    <ChevronDown size={12} />
                  </button>

                  {isRealtimeModelSwitcherOpen && (
                    <div className="absolute right-0 top-full mt-3 w-[min(86vw,340px)] rounded-2xl border border-[#CCA761]/25 bg-[#080808] shadow-2xl shadow-black/60 z-50 overflow-hidden">
                      <div className="p-4 border-b border-white/10">
                        <p className="text-[10px] uppercase tracking-[0.25em] text-[#CCA761] font-black">Modelo Realtime</p>
                        <p className="mt-1 text-[11px] text-gray-500 normal-case tracking-normal">
                          Premium continua padrao. Mini e apenas teste economico.
                        </p>
                      </div>
                      <div className="p-2 space-y-1">
                        {REALTIME_MODEL_OPTIONS.map((model) => {
                          const active = selectedRealtimeModel === model.value;
                          return (
                            <button
                              key={model.value}
                              type="button"
                              onClick={() => {
                                setSelectedRealtimeModel(model.value);
                                setIsRealtimeModelSwitcherOpen(false);
                                if (isConversationMode) {
                                  stopConversationMode();
                                  toast.info("Modelo Realtime alterado. Ative o modo conversa novamente para testar.");
                                }
                              }}
                              className={`w-full text-left rounded-xl px-3 py-3 border transition-colors ${
                                active
                                  ? "border-[#CCA761]/50 bg-[#CCA761]/10"
                                  : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-gray-100">{model.label}</p>
                                  <p className="mt-1 text-[10px] uppercase tracking-[0.18em] text-[#CCA761]/80 truncate">
                                    {model.value}
                                  </p>
                                  <p className="mt-1 text-[11px] text-gray-500">{model.description}</p>
                                </div>
                                {active && <CheckCircle size={16} className="text-[#CCA761] shrink-0 mt-0.5" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsVoiceSwitcherOpen((value) => !value);
                  setIsRealtimeModelSwitcherOpen(false);
                }}
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
            const kernelHighlight = getKernelHighlight(msg.kernel);
            const financeArtifactHighlights = getFinanceArtifactHighlights(msg.kernel);

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

                  {msg.role === 'model' && kernelHighlight && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3">
                      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${
                        kernelHighlight.approval
                          ? "border-amber-400/40 bg-amber-400/10 text-amber-200"
                          : "border-[#CCA761]/30 bg-[#CCA761]/10 text-[#E2C37A]"
                      }`}>
                        {kernelHighlight.label}
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500">
                        {kernelHighlight.statusLabel}
                      </span>
                    </div>
                  )}

                  {msg.role === 'model' && financeArtifactHighlights.length > 0 && (
                    <div className="mt-3 space-y-2 rounded-xl border border-[#CCA761]/20 bg-[#CCA761]/5 p-3">
                      {financeArtifactHighlights.map((highlight) => (
                        <div key={highlight.artifactType} className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-[#CCA761]/30 bg-[#CCA761]/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#E2C37A]">
                              {highlight.label}
                            </span>
                            <span className="text-[10px] uppercase tracking-[0.16em] text-gray-500">
                              {highlight.status}
                            </span>
                          </div>
                          {highlight.details.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {highlight.details.map((detail) => (
                                <span key={detail} className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] text-gray-400">
                                  {detail}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

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
                    ? `${REALTIME_STATUS_LABEL[realtimeStatus]}... ${activeRealtimeModelOption.label}, voz ${selectedRealtimeVoice}.`
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
                 ? `modo conversa ${conversationTransport} • ${REALTIME_STATUS_LABEL[realtimeStatus].toLowerCase()} • ${activeRealtimeModelOption.label} • voz ${selectedRealtimeVoice}${realtimeCost ? ` • US$ ${realtimeCost.usd.toFixed(3)} / R$ ${realtimeCost.brl.toFixed(2)}` : ""}`
                 : 'As sessões e decisões do kernel no ambiente logado são auditáveis.'}
             </p>
          </div>
          {/* Medidor temporario do piloto Realtime MAYUS: remover quando o comparativo premium/mini terminar. */}
          {canTuneMayusRealtime && isConversationMode && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[10px] text-gray-500">
              <span className="rounded-full border border-[#CCA761]/20 bg-[#CCA761]/5 px-2.5 py-1 uppercase tracking-[0.18em] text-[#CCA761]/80">
                teste realtime
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                {activeRealtimeModelOption.label}: {activeRealtimeModel}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                tempo {formatRealtimeDuration(realtimeElapsedSeconds)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                US$ {(realtimeCost?.usd || 0).toFixed(4)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                R$ {(realtimeCost?.brl || 0).toFixed(2)}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                audio {realtimeCost?.audioInputTokens || 0}/{realtimeCost?.audioOutputTokens || 0}
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
                texto {realtimeCost?.textInputTokens || 0}/{realtimeCost?.textOutputTokens || 0}
              </span>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}
