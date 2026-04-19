"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { GoogleDriveLogo } from "@/components/branding/GoogleDriveLogo";
import { LEGAL_PIECE_SUGGESTIONS, PRACTICE_AREA_OPTIONS } from "@/lib/juridico/piece-catalog";
import ReactMarkdown from "react-markdown";
import {
  Copy,
  ExternalLink,
  FolderTree,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  FileText,
  Download,
  AlertTriangle,
  Upload,
  File as FileIcon,
  X,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["400", "500", "600", "700"] });

type ProcessTaskListItem = {
  id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  client_name?: string | null;
  process_number?: string | null;
  drive_link?: string | null;
  drive_folder_id?: string | null;
  drive_structure_ready?: boolean | null;
  created_at: string;
};

type ProcessStage = { id: string; name: string };
type ProcessPipeline = { id: string; name: string };
type ProcessDocumentMemory = {
  process_task_id: string;
  document_count?: number | null;
  sync_status?: string | null;
  last_synced_at?: string | null;
  summary_master?: string | null;
  missing_documents?: string[] | null;
};

type ProcessDocumentItem = {
  process_task_id: string;
  name: string;
  document_type?: string | null;
  extraction_status?: string | null;
  folder_label?: string | null;
  web_view_link?: string | null;
  modified_at?: string | null;
};

type ProcessDocumentCard = ProcessTaskListItem & {
  stageName: string | null;
  pipelineName: string | null;
  documentCount: number;
  syncStatus: string;
  lastSyncedAt: string | null;
  summaryMaster: string | null;
  missingDocuments: string[];
  documents: ProcessDocumentItem[];
};

type PieceQualityMetrics = {
  charCount: number;
  wordCount: number;
  paragraphCount: number;
  sectionCount: number;
};

type GeneratedPieceResult = {
  pieceType: string;
  pieceLabel: string;
  pieceFamily: string;
  pieceFamilyLabel: string;
  practiceArea: string | null;
  outline: string[];
  draftMarkdown: string;
  usedDocuments: Array<{
    id: string;
    name: string;
    documentType: string | null;
    folderLabel: string | null;
    webViewLink: string | null;
    modifiedAt: string | null;
  }>;
  missingDocuments: string[];
  warnings: string[];
  confidenceNote: string;
  requiresHumanReview: boolean;
  model: string;
  provider: string;
  expansionApplied: boolean;
  qualityMetrics: PieceQualityMetrics;
};

const DOCUMENT_FOLDER_OPTIONS = [
  "01-Documentos do Cliente",
  "02-Inicial",
  "03-Contestacao",
  "04-Manifestacoes",
  "05-Decisoes e Sentencas",
  "06-Provas",
  "07-Prazos e Audiencias",
  "08-Recursos",
  "09-Pecas Finais",
] as const;

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  documento_cliente: "Documento do Cliente",
  inicial: "Inicial",
  contestacao: "Contestação",
  replica: "Réplica",
  manifestacao: "Manifestação",
  decisao: "Decisão",
  sentenca: "Sentença",
  decisao_sentenca: "Decisão / Sentença",
  recurso: "Recurso",
  prova: "Prova",
  prazo_audiencia: "Prazo / Audiência",
  peca_final: "Peça Final",
  geral: "Geral",
};

function getExtractionBadge(status?: string | null) {
  switch (status) {
    case "extracted":
      return {
        label: "Lido",
        className: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
      };
    case "error":
      return {
        label: "Falha na leitura",
        className: "bg-red-500/10 border-red-500/20 text-red-300",
      };
    case "skipped":
      return {
        label: "Indexado",
        className: "bg-white/5 border-white/10 text-gray-300",
      };
    default:
      return {
        label: "Pendente",
        className: "bg-white/5 border-white/10 text-gray-400",
      };
  }
}

function getDocumentTypeLabel(type?: string | null) {
  return DOCUMENT_TYPE_LABELS[type || ""] || type || "Tipo não identificado";
}

function formatDateTime(value?: string | null) {
  if (!value) return "Nunca sincronizado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nunca sincronizado";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function DocumentosPage() {
  const supabase = useMemo(() => createClient(), []);
  const { tenantId, isLoading: profileLoading } = useUserProfile();
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [pieceBusyTaskId, setPieceBusyTaskId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [cards, setCards] = useState<ProcessDocumentCard[]>([]);
  const [uploadFolderByTask, setUploadFolderByTask] = useState<Record<string, string>>({});
  const [uploadFilesByTask, setUploadFilesByTask] = useState<Record<string, globalThis.File | null>>({});
  const [uploadInputVersionByTask, setUploadInputVersionByTask] = useState<Record<string, number>>({});
  const [pieceTypeByTask, setPieceTypeByTask] = useState<Record<string, string>>({});
  const [piecePracticeAreaByTask, setPiecePracticeAreaByTask] = useState<Record<string, string>>({});
  const [pieceObjectiveByTask, setPieceObjectiveByTask] = useState<Record<string, string>>({});
  const [pieceInstructionsByTask, setPieceInstructionsByTask] = useState<Record<string, string>>({});
  const [generatedPieceByTask, setGeneratedPieceByTask] = useState<Record<string, GeneratedPieceResult | null>>({});
  const [downloadBusyTaskId, setDownloadBusyTaskId] = useState<string | null>(null);

  const selectedCard = useMemo(() => cards.find(c => c.id === selectedCardId), [cards, selectedCardId]);

  const loadRepository = useCallback(async () => {
    if (!tenantId) return;

    setIsLoading(true);

    try {
      const [tasksRes, stagesRes, pipelinesRes, memoryRes, documentsRes] = await Promise.all([
        supabase
          .from("process_tasks")
          .select("id, pipeline_id, stage_id, title, client_name, process_number, drive_link, drive_folder_id, drive_structure_ready, created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false }),
        supabase.from("process_stages").select("id, name"),
        supabase.from("process_pipelines").select("id, name").eq("tenant_id", tenantId),
        supabase
          .from("process_document_memory")
          .select("process_task_id, document_count, sync_status, last_synced_at, summary_master, missing_documents")
          .eq("tenant_id", tenantId),
        supabase
          .from("process_documents")
          .select("process_task_id, name, document_type, extraction_status, folder_label, web_view_link, modified_at")
          .eq("tenant_id", tenantId)
          .order("modified_at", { ascending: false }),
      ]);

      if (tasksRes.error) throw tasksRes.error;
      if (stagesRes.error) throw stagesRes.error;
      if (pipelinesRes.error) throw pipelinesRes.error;
      if (memoryRes.error) throw memoryRes.error;
      if (documentsRes.error) throw documentsRes.error;

      const stagesMap = new Map((stagesRes.data || []).map((stage: ProcessStage) => [stage.id, stage.name]));
      const pipelinesMap = new Map((pipelinesRes.data || []).map((pipeline: ProcessPipeline) => [pipeline.id, pipeline.name]));
      const memoryMap = new Map((memoryRes.data || []).map((memory: ProcessDocumentMemory) => [memory.process_task_id, memory]));
      const docsByTask = new Map<string, ProcessDocumentItem[]>();

      (documentsRes.data || []).forEach((document: ProcessDocumentItem) => {
        const current = docsByTask.get(document.process_task_id) || [];
        current.push(document);
        docsByTask.set(document.process_task_id, current);
      });

      const nextCards = (tasksRes.data || []).map((task: ProcessTaskListItem) => {
        const memory = memoryMap.get(task.id);
        return {
          ...task,
          stageName: stagesMap.get(task.stage_id) || null,
          pipelineName: pipelinesMap.get(task.pipeline_id) || null,
          documentCount: Number(memory?.document_count || 0),
          syncStatus: memory?.sync_status || (task.drive_structure_ready ? "structured" : "pending"),
          lastSyncedAt: memory?.last_synced_at || null,
          summaryMaster: memory?.summary_master || null,
          missingDocuments: Array.isArray(memory?.missing_documents) ? memory!.missing_documents! : [],
          documents: (docsByTask.get(task.id) || []).slice(0, 5),
        } satisfies ProcessDocumentCard;
      });

      setCards(nextCards);
      setUploadFolderByTask((current) => {
        const next = { ...current };
        nextCards.forEach((card) => {
          if (!next[card.id]) {
            next[card.id] = "01-Documentos do Cliente";
          }
        });
        return next;
      });
      setPieceTypeByTask((current) => {
        const next = { ...current };
        nextCards.forEach((card) => {
          if (!next[card.id]) {
            next[card.id] = "Contestacao";
          }
        });
        return next;
      });
      setPiecePracticeAreaByTask((current) => {
        const next = { ...current };
        nextCards.forEach((card) => {
          if (!next[card.id]) {
            next[card.id] = "civel";
          }
        });
        return next;
      });
      setPieceObjectiveByTask((current) => {
        const next = { ...current };
        nextCards.forEach((card) => {
          if (!next[card.id]) {
            next[card.id] = "Gerar um rascunho técnico fiel aos documentos sincronizados, sem inventar fatos ou fundamentos.";
          }
        });
        return next;
      });
    } catch (error: any) {
      console.error("[documentos][load]", error);
      toast.error(error?.message || "Não foi possível carregar o repositório documental.");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, tenantId]);

  useEffect(() => {
    if (!profileLoading && tenantId) {
      loadRepository();
    }
  }, [profileLoading, tenantId, loadRepository]);

  const filteredCards = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return cards;

    return cards.filter((card) => {
      return [card.title, card.client_name, card.process_number, card.pipelineName, card.stageName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
  }, [cards, search]);

  const handleCreateStructure = async (taskId: string) => {
    setBusyTaskId(taskId);
    try {
      const response = await fetch("/api/integrations/google-drive/process-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível criar a estrutura documental.");
      }

      toast.success(data?.alreadyExists ? "Estrutura documental já existia para este processo." : "Estrutura documental criada no Google Drive.");
      await loadRepository();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível criar a estrutura documental.");
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleSync = async (taskId: string) => {
    setBusyTaskId(taskId);
    try {
      const response = await fetch(`/api/documentos/processos/${taskId}/sync`, {
        method: "POST",
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível sincronizar os documentos.");
      }

      const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
      if (warnings.length > 0) {
        toast.warning(`Sincronização concluída com ${data?.memory?.document_count || 0} documento(s), mas ${warnings.length} item(ns) tiveram leitura parcial.`);
      } else {
        toast.success(`Sincronização concluída com ${data?.memory?.document_count || 0} documento(s).`);
      }
      await loadRepository();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível sincronizar os documentos.");
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleUploadDocument = async (taskId: string) => {
    const file = uploadFilesByTask[taskId];
    if (!file) {
      toast.error("Selecione um arquivo antes de enviar.");
      return;
    }

    setBusyTaskId(taskId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folderLabel", uploadFolderByTask[taskId] || "01-Documentos do Cliente");

      const response = await fetch(`/api/documentos/processos/${taskId}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível enviar o documento.");
      }

      const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
      if (data?.uploaded && data?.indexed === false) {
        toast.warning("Documento enviado ao Drive, mas a indexação no MAYUS falhou. Tente sincronizar novamente.");
      } else if (warnings.length > 0) {
        toast.warning("Documento enviado. O MAYUS indexou o arquivo, mas a leitura do conteúdo ficou parcial.");
      } else {
        toast.success("Documento enviado e sincronizado com sucesso.");
      }

      setUploadFilesByTask((current) => ({ ...current, [taskId]: null }));
      setUploadInputVersionByTask((current) => ({ ...current, [taskId]: (current[taskId] || 0) + 1 }));
      await loadRepository();
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível enviar o documento.");
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleGeneratePiece = async (taskId: string) => {
    if (!String(pieceTypeByTask[taskId] || "").trim()) {
      toast.error("Informe qual peça deseja gerar.");
      return;
    }

    setPieceBusyTaskId(taskId);

    try {
      const response = await fetch(`/api/documentos/processos/${taskId}/gerar-peca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pieceType: pieceTypeByTask[taskId] || "Contestacao",
          practiceArea: piecePracticeAreaByTask[taskId] || "",
          objective: pieceObjectiveByTask[taskId] || "",
          instructions: pieceInstructionsByTask[taskId] || "",
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível gerar a peça com base no Drive.");
      }

      setGeneratedPieceByTask((current) => ({ ...current, [taskId]: data as GeneratedPieceResult }));
      toast.success("Rascunho jurídico gerado com base no acervo documental.");
    } catch (error: any) {
      console.error("[documentos][gerar-peca]", error);
      toast.error(error?.message || "Não foi possível gerar a peça com base no Drive.");
    } finally {
      setPieceBusyTaskId(null);
    }
  };

  const handleCopyPiece = async (taskId: string) => {
    const piece = generatedPieceByTask[taskId];
    if (!piece?.draftMarkdown) {
      toast.error("Não há rascunho gerado para copiar.");
      return;
    }

    try {
      await navigator.clipboard.writeText(piece.draftMarkdown);
      toast.success("Rascunho copiado para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar o rascunho.");
    }
  };

  const handleDownloadPiece = async (taskId: string) => {
    const piece = generatedPieceByTask[taskId];
    if (!piece?.draftMarkdown) {
      toast.error("Não há rascunho gerado para exportar.");
      return;
    }

    setDownloadBusyTaskId(taskId);

    try {
      const response = await fetch(`/api/documentos/processos/${taskId}/exportar-peca`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pieceType: piece.pieceType,
          pieceLabel: piece.pieceLabel,
          draftMarkdown: piece.draftMarkdown,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Não foi possível exportar a peça em Word.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^\"]+)"?/i);
      const fileName = match?.[1] || `${piece.pieceType}.docx`;
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      toast.success("Arquivo Word baixado com sucesso.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível exportar a peça em Word.");
    } finally {
      setDownloadBusyTaskId(null);
    }
  };

  return (
      <div className={`flex-1 min-h-screen relative text-white p-6 sm:p-10 ${montserrat.className} overflow-hidden`}>
      <datalist id="legal-piece-suggestions">
        {LEGAL_PIECE_SUGGESTIONS.map((option) => (
          <option key={option.value} value={option.value} />
        ))}
      </datalist>
      {/* Premium Background Effects */}
      <div className="absolute inset-0 bg-[#050505] z-0" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-[#CCA761]/[0.03] blur-[150px] rounded-full pointer-events-none z-0" />
      <div className="absolute bottom-0 right-0 w-[800px] h-[400px] bg-[#4285F4]/[0.02] blur-[120px] rounded-full pointer-events-none z-0" />

      <div className="max-w-[1400px] mx-auto space-y-10 relative z-10">
        {/* Header Section */}
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-4">
          <div className="space-y-4 relative">
            <p className="text-[#CCA761] text-xs uppercase tracking-[0.4em] font-black flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#CCA761] shadow-[0_0_10px_rgba(204,167,97,0.6)] animate-pulse" />
              Inteligência Operacional
            </p>
            <div className="flex items-center gap-6">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-tr from-[#4285F4]/20 to-[#CCA761]/20 rounded-2xl blur-xl group-hover:opacity-100 opacity-60 transition-opacity duration-700" />
                <div className="w-16 h-16 rounded-2xl border border-white/10 bg-[#0a0f1a]/80 backdrop-blur-xl flex items-center justify-center relative shadow-[0_0_30px_rgba(0,0,0,0.5)] overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                  <GoogleDriveLogo size={32} className="h-[32px] w-[32px] relative z-10 drop-shadow-[0_0_15px_rgba(66,133,244,0.3)]" />
                </div>
              </div>
              <div>
                <h1 className={`text-4xl md:text-5xl text-white tracking-widest ${cormorant.className} drop-shadow-xl font-bold`}>
                  Repositório de <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#CCA761] via-[#e2c78d] to-[#CCA761] animate-[pulse_4s_ease-in-out_infinite]">Documentos</span>
                </h1>
                <p className="text-gray-400 text-sm max-w-2xl leading-relaxed mt-2 font-medium">
                  Visualize a estrutura documental de cada processo, orquestre o Google Drive oficial do caso e sincronize a memória mínima que alimenta o cérebro jurídico do <span className="text-white font-bold tracking-widest">MAYUS</span>.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative min-w-[320px] group">
              <div className="absolute inset-0 bg-gradient-to-r from-[#CCA761]/10 to-transparent blur-md opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 rounded-xl" />
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#CCA761] transition-colors z-10" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar cliente, processo ou pipeline..."
                className="relative w-full bg-[#0a0a0a]/80 backdrop-blur-md border border-white/10 hover:border-white/20 rounded-xl pl-12 pr-4 py-3.5 text-sm text-white focus:outline-none focus:border-[#CCA761]/40 focus:bg-[#111]/90 focus:shadow-[0_0_20px_rgba(204,167,97,0.08)] transition-all placeholder:text-gray-600 font-medium"
              />
            </div>
            <button
              type="button"
              onClick={loadRepository}
              className="relative overflow-hidden group px-6 py-3.5 rounded-xl border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-md hover:bg-white/5 hover:border-[#CCA761]/30 text-xs font-black uppercase tracking-[0.2em] text-white flex items-center justify-center gap-3 transition-all duration-300"
            >
              <div className="absolute inset-0 bg-[#CCA761] opacity-0 group-hover:opacity-[0.03] transition-opacity duration-300" />
              <RefreshCw size={14} className="group-hover:rotate-180 transition-transform duration-700 text-[#CCA761]" /> Atualizar
            </button>
          </div>
        </div>

        {/* Dashboard Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="group relative overflow-hidden bg-gradient-to-b from-[#0f0f0f] to-[#080808] border border-white/5 hover:border-[#CCA761]/20 rounded-2xl p-6 transition-all duration-500 hover:shadow-[0_0_30px_rgba(204,167,97,0.05)]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCA761]/5 blur-[50px] rounded-full group-hover:bg-[#CCA761]/10 transition-colors duration-500" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-[#CCA761]/30 transition-colors">
                  <FolderTree size={14} className="text-[#CCA761]" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-gray-400 font-black">Processos</p>
              </div>
              <p className="text-4xl font-black text-white tracking-tight">{cards.length}</p>
              <p className="text-xs text-gray-500 mt-2 font-medium">Monitorados no sistema</p>
            </div>
          </div>

          <div className="group relative overflow-hidden bg-gradient-to-b from-[#0f0f0f] to-[#080808] border border-white/5 hover:border-[#4285F4]/20 rounded-2xl p-6 transition-all duration-500 hover:shadow-[0_0_30px_rgba(66,133,244,0.05)]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#4285F4]/5 blur-[50px] rounded-full group-hover:bg-[#4285F4]/10 transition-colors duration-500" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#4285F4]/10 border border-[#4285F4]/20 flex items-center justify-center group-hover:border-[#4285F4]/40 transition-colors">
                  <GoogleDriveLogo size={14} className="opacity-90" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#8ab4ff] font-black">Estruturas do Drive</p>
              </div>
              <p className="text-4xl font-black text-white tracking-tight">{cards.filter((card) => card.drive_structure_ready).length}</p>
              <p className="text-xs text-gray-500 mt-2 font-medium">Prontas para sincronização</p>
            </div>
          </div>

          <div className="group relative overflow-hidden bg-gradient-to-b from-[#0f0f0f] to-[#080808] border border-white/5 hover:border-[#CCA761]/20 rounded-2xl p-6 transition-all duration-500 hover:shadow-[0_0_30px_rgba(204,167,97,0.05)]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCA761]/5 blur-[50px] rounded-full group-hover:bg-[#CCA761]/10 transition-colors duration-500" />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#CCA761]/10 border border-[#CCA761]/20 flex items-center justify-center group-hover:border-[#CCA761]/40 transition-colors">
                  <FileIcon size={14} className="text-[#CCA761]" />
                </div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-[#e2c78d] font-black">Documentos</p>
              </div>
              <p className="text-4xl font-black text-white tracking-tight">{cards.reduce((acc, card) => acc + card.documentCount, 0)}</p>
              <p className="text-xs text-gray-500 mt-2 font-medium">Sincronizados com a IA</p>
            </div>
          </div>
        </div>

        {/* Donna Banner */}
        <Link
          href="/dashboard/documentos/acervo"
          className="relative block w-full rounded-2xl overflow-hidden p-[1px] group transition-all duration-500 hover:shadow-[0_0_40px_rgba(204,167,97,0.12)]"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#CCA761]/0 via-[#CCA761]/40 to-[#CCA761]/0 opacity-30 group-hover:opacity-100 transition-opacity duration-1000 animate-[pulse_3s_ease-in-out_infinite] blur" />
          <div className="relative bg-[#070707] rounded-[15px] p-8 flex flex-col md:flex-row items-center justify-between border border-[#CCA761]/20">
            <div className="flex items-center gap-6 mb-6 md:mb-0">
              <div className="relative">
                <div className="absolute inset-0 bg-[#CCA761] blur-md opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
                <div className="w-16 h-16 rounded-full bg-[#0a0a0a] border border-[#CCA761]/40 flex items-center justify-center relative shadow-[0_0_20px_rgba(204,167,97,0.15)] group-hover:border-[#CCA761] transition-colors">
                  <Sparkles size={24} className="text-[#CCA761]" />
                </div>
              </div>
              <div>
                <h3 className={`text-3xl text-white ${cormorant.className} flex items-center gap-3 font-bold tracking-wide`}>
                  Acessar Acervo <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#CCA761] to-[#f4dca6] font-black uppercase tracking-[0.2em] ml-1">MAYUS</span>
                </h3>
                <p className="text-sm text-[#CCA761]/70 mt-1 font-medium tracking-wide">Modelos processuais premium, base de conhecimento e diretrizes da IA Jurídica especializada.</p>
              </div>
            </div>
            <div className="relative overflow-hidden group/btn px-8 py-4 bg-[#0a0a0a] border border-[#CCA761]/30 hover:border-[#CCA761] text-[#CCA761] text-xs font-black uppercase tracking-[0.25em] rounded-xl transition-all duration-300 hover:shadow-[0_0_20px_rgba(204,167,97,0.2)]">
              <div className="absolute inset-0 bg-[#CCA761]/10 -translate-x-full group-hover/btn:translate-x-0 transition-transform duration-500 ease-out" />
              <span className="relative z-10">Explorar Modelos</span>
            </div>
          </div>
        </Link>

        {isLoading ? (
          <div className="bg-[#0a0a0a]/80 backdrop-blur-md border border-white/5 rounded-3xl p-16 flex flex-col items-center justify-center gap-5">
            <div className="relative">
              <div className="absolute inset-0 bg-[#CCA761]/20 blur-xl rounded-full animate-pulse" />
              <Loader2 size={32} className="animate-spin text-[#CCA761] relative z-10" />
            </div>
            <p className="text-sm text-[#CCA761] uppercase tracking-[0.3em] font-black animate-pulse">Carregando Acervo Operacional...</p>
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="bg-[#0a0a0a]/80 backdrop-blur-md border border-white/5 rounded-3xl p-16 text-center space-y-5 shadow-inner">
            <div className="w-20 h-20 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4">
              <FolderTree size={32} className="text-[#CCA761]/60" />
            </div>
            <h2 className={`text-3xl text-white ${cormorant.className} font-bold`}>Nenhum processo encontrado no repositório</h2>
            <p className="text-sm text-gray-400 max-w-xl mx-auto leading-relaxed">
              Crie ou salve processos no seu funil primeiro. Assim que o card existir, a plataforma <span className="text-[#CCA761] font-bold">MAYUS</span> poderá iniciar a gestão documental avançada no Google Drive.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCards.map((card) => {
              const hasStructure = Boolean(card.drive_structure_ready && card.drive_folder_id && card.drive_link);

              return (
                <button
                  key={card.id}
                  onClick={() => setSelectedCardId(card.id)}
                  className="group bg-[#0a0a0a] border border-white/5 hover:border-[#CCA761]/30 rounded-2xl p-4 transition-all duration-300 hover:shadow-[0_10px_30px_rgba(204,167,97,0.05)] relative flex flex-col text-left"
                >
                  <div className="flex items-center justify-between w-full mb-3">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-[#CCA761] font-black flex items-center gap-1.5 truncate">
                      {card.pipelineName || "Pipeline"}
                    </p>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${hasStructure ? 'bg-[#4285F4] shadow-[0_0_8px_rgba(66,133,244,0.6)]' : 'bg-amber-500'}`} />
                  </div>
                  
                  <h2 className={`text-base font-bold text-white leading-tight ${cormorant.className} tracking-wide truncate w-full mb-1 group-hover:text-[#CCA761] transition-colors`}>
                    {card.title}
                  </h2>
                  <p className="text-[10px] text-gray-500 font-medium tracking-wide truncate w-full mb-4">
                    {card.client_name || "Sem cliente"} {card.process_number ? `• ${card.process_number}` : ""}
                  </p>

                  <div className="mt-auto flex items-center justify-between w-full pt-3 border-t border-white/5 group-hover:border-[#CCA761]/20 transition-colors">
                    <div className="flex items-center gap-2">
                       <p className="text-[10px] font-bold text-gray-300 bg-[#111] px-2 py-1 rounded-md border border-white/5">
                         {card.documentCount} docs
                       </p>
                       <p className="text-[9px] font-bold text-[#CCA761] uppercase tracking-wider hidden sm:block">
                         {card.syncStatus}
                       </p>
                    </div>
                    <ChevronRight size={14} className="text-gray-600 group-hover:text-[#CCA761] group-hover:translate-x-1 transition-all" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedCard && (
          <motion.div
            key="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedCardId(null)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[1380px] max-h-[92vh] overflow-y-auto no-scrollbar z-[101] outline-none"
            >
              <div className="group/card bg-[#0a0a0a] border border-[#CCA761]/30 rounded-[28px] p-6 sm:p-8 relative flex flex-col shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_0_1px_rgba(204,167,97,0.15)] m-1 sm:m-4">
                {/* Modal close button */}
                <button
                  onClick={() => setSelectedCardId(null)}
                  className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-colors z-20"
                >
                  <X size={16} />
                </button>

                {/* Subtle top gradient line */}
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CCA761]/40 to-transparent" />
                
                <div className="flex items-start justify-between gap-3 mb-5 pr-8">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.25em] text-[#CCA761] font-black flex items-center gap-1.5">
                      {selectedCard.pipelineName || "Pipeline"}
                      {selectedCard.stageName ? <><span className="w-1 h-1 rounded-full bg-[#CCA761]/50" /> {selectedCard.stageName}</> : ""}
                    </p>
                    <h2 className={`text-2xl font-bold text-white leading-tight ${cormorant.className} tracking-wide`}>{selectedCard.title}</h2>
                    <p className="text-[12px] text-gray-400 font-medium tracking-wide">
                      {selectedCard.client_name || "Sem cliente"}
                      {selectedCard.process_number ? ` • ${selectedCard.process_number}` : ""}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
                  <div className="bg-[#111] border border-white/5 rounded-xl p-3 sm:p-4">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1.5">Docs</p>
                    <p className="text-xl sm:text-2xl font-black text-white">{selectedCard.documentCount}</p>
                  </div>
                  <div className="bg-[#111] border border-white/5 rounded-xl p-3 sm:p-4">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1.5">Status</p>
                    <p className="text-[11px] font-bold text-[#CCA761] capitalize truncate mt-1">{selectedCard.syncStatus}</p>
                  </div>
                  <div className="bg-[#111] border border-white/5 rounded-xl p-3 sm:p-4">
                    <p className="text-[9px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1.5">Sync</p>
                    <p className="text-[10px] font-semibold text-gray-300 mt-1 uppercase truncate">{formatDateTime(selectedCard.lastSyncedAt).split(',')[0]}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-5 items-start">
                  <div className="space-y-5 xl:sticky xl:top-0">
                    <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/5 rounded-xl p-5 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-[#CCA761]/10 blur-2xl rounded-full" />
                      <div className="flex items-center gap-2 text-[#CCA761] text-[10px] uppercase tracking-[0.3em] font-black mb-3 pr-2">
                        <Sparkles size={14} /> Memória Base
                      </div>
                      <p className="text-sm text-gray-300 leading-relaxed font-medium relative z-10">
                        {selectedCard.summaryMaster || "Estrutura documental aguardando orquestração inicial. Sincronize o Drive para processar a taxonomia."}
                      </p>
                      {selectedCard.missingDocuments.length > 0 && (
                        <div className="mt-4 flex items-start gap-2.5 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 relative z-10">
                          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-400" />
                          <div>
                            <strong className="block text-amber-400 font-bold mb-1 uppercase tracking-wider text-[10px]">Análise da IA: Documentos Faltantes</strong>
                            {selectedCard.missingDocuments.join(", ")}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="bg-[#0f0f0f] border border-white/5 rounded-xl p-5 space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[#CCA761] text-[10px] uppercase tracking-[0.3em] font-black">
                          <Sparkles size={12} /> Orquestrador de Peças
                        </div>
                        {generatedPieceByTask[selectedCard.id] && (
                          <span className="text-[10px] uppercase tracking-[0.24em] text-gray-500 font-black text-right">
                            {generatedPieceByTask[selectedCard.id]?.provider} • {generatedPieceByTask[selectedCard.id]?.model}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <input
                          list="legal-piece-suggestions"
                          value={pieceTypeByTask[selectedCard.id] || ""}
                          onChange={(event) => setPieceTypeByTask((current) => ({ ...current, [selectedCard.id]: event.target.value }))}
                          placeholder="Digite ou escolha a peca (ex: Replica, Embargos a Execucao, Memoriais)"
                          className="w-full bg-[#111] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#CCA761]/60 font-medium tracking-wide"
                        />

                        <select
                          value={piecePracticeAreaByTask[selectedCard.id] || ""}
                          onChange={(event) => setPiecePracticeAreaByTask((current) => ({ ...current, [selectedCard.id]: event.target.value }))}
                          className="bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#CCA761]/40 font-medium tracking-wide appearance-none"
                        >
                          <option value="">Área do Direito (opcional)</option>
                          {PRACTICE_AREA_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>

                        <input
                          value={pieceObjectiveByTask[selectedCard.id] || ""}
                          onChange={(event) => setPieceObjectiveByTask((current) => ({ ...current, [selectedCard.id]: event.target.value }))}
                          placeholder="Objetivo do rascunho"
                          className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#CCA761]/40"
                        />
                      </div>

                      <textarea
                        value={pieceInstructionsByTask[selectedCard.id] || ""}
                        onChange={(event) => setPieceInstructionsByTask((current) => ({ ...current, [selectedCard.id]: event.target.value }))}
                        rows={3}
                        placeholder="Instruções adicionais para o orquestrador jurídico (opcional)."
                        className="w-full bg-[#111] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-[#CCA761]/40 resize-none"
                      />

                      <button
                        type="button"
                        onClick={() => handleGeneratePiece(selectedCard.id)}
                        disabled={pieceBusyTaskId === selectedCard.id}
                        className="w-full px-6 py-3.5 rounded-xl border border-[#CCA761]/40 bg-[#CCA761]/10 hover:bg-[#CCA761]/20 text-xs font-black uppercase tracking-[0.2em] text-[#CCA761] flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:shadow-[0_0_15px_rgba(204,167,97,0.2)]"
                      >
                        {pieceBusyTaskId === selectedCard.id ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                        Gerar Rascunho com IA
                      </button>
                    </div>

                    {generatedPieceByTask[selectedCard.id] && (
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-[#CCA761]/20 bg-gradient-to-br from-[#0a0f0a] to-[#0a0a0a] p-5 shadow-[0_5px_20px_rgba(204,167,97,0.02)] relative overflow-hidden">
                          <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCA761]/5 blur-3xl rounded-full" />
                          <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4 relative z-10">
                            <div className="flex items-center gap-2">
                              <Sparkles size={14} className="text-[#CCA761]" />
                              <p className="text-[10px] uppercase tracking-[0.25em] text-[#CCA761] font-black">Inteligência Operacional</p>
                            </div>
                            {generatedPieceByTask[selectedCard.id]!.requiresHumanReview && (
                              <span className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[9px] uppercase tracking-widest font-black">
                                <AlertTriangle size={10} /> Revisão Crítica
                              </span>
                            )}
                          </div>
                          
                          <p className="text-[13px] text-gray-300 leading-relaxed italic mb-5 relative z-10">
                            &ldquo;{generatedPieceByTask[selectedCard.id]!.confidenceNote}&rdquo;
                          </p>

                          <div className="grid grid-cols-2 gap-3 mb-5 relative z-10">
                            <div className="rounded-xl border border-white/5 bg-[#111] px-4 py-3">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1">Peça / Família</p>
                              <p className="text-sm text-white font-semibold">{generatedPieceByTask[selectedCard.id]!.pieceLabel}</p>
                              <p className="text-[11px] text-gray-500 mt-1">{generatedPieceByTask[selectedCard.id]!.pieceFamilyLabel}</p>
                            </div>
                            <div className="rounded-xl border border-white/5 bg-[#111] px-4 py-3">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1">Área / Robustez</p>
                              <p className="text-sm text-white font-semibold">{generatedPieceByTask[selectedCard.id]!.practiceArea || "Nao informada"}</p>
                              <p className="text-[11px] text-gray-500 mt-1">
                                {generatedPieceByTask[selectedCard.id]!.qualityMetrics.sectionCount} seções • {generatedPieceByTask[selectedCard.id]!.qualityMetrics.paragraphCount} parágrafos
                                {generatedPieceByTask[selectedCard.id]!.expansionApplied ? " • expansão aplicada" : ""}
                              </p>
                            </div>
                          </div>

                          {(generatedPieceByTask[selectedCard.id]!.missingDocuments.length > 0 || generatedPieceByTask[selectedCard.id]!.warnings.length > 0) && (
                            <div className="flex flex-col mb-5 border border-white/5 rounded-xl overflow-hidden bg-[#111] relative z-10">
                              {generatedPieceByTask[selectedCard.id]!.missingDocuments.length > 0 && (
                                <div className="p-4 border-b border-white/5 bg-red-500/5 relative">
                                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500/40" />
                                  <p className="text-[10px] uppercase tracking-[0.24em] text-red-400 font-black mb-1.5 flex items-center gap-2"><AlertTriangle size={12}/> Docs Faltantes</p>
                                  <p className="text-xs text-gray-300">{generatedPieceByTask[selectedCard.id]!.missingDocuments.join(", ")}</p>
                                </div>
                              )}
                              {generatedPieceByTask[selectedCard.id]!.warnings.length > 0 && (
                                <div className="p-4 relative">
                                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500/40" />
                                  <p className="text-[10px] uppercase tracking-[0.24em] text-amber-500 font-black mb-1.5">Alertas da IA</p>
                                  <p className="text-xs text-gray-400 leading-relaxed">{generatedPieceByTask[selectedCard.id]!.warnings.join(" ")}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {generatedPieceByTask[selectedCard.id]!.usedDocuments.length > 0 && (
                            <div className="relative z-10">
                              <p className="text-[10px] uppercase tracking-[0.24em] text-[#8ab4ff] font-black mb-3 flex items-center gap-2">
                                <FolderTree size={12} /> Acervo Extraído
                              </p>
                              <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto no-scrollbar pr-1">
                                {generatedPieceByTask[selectedCard.id]!.usedDocuments.map((document) => (
                                  <a 
                                    key={document.id}
                                    href={document.webViewLink || undefined}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex flex-col gap-1.5 rounded-lg border border-white/5 bg-[#141414] hover:bg-white/5 p-3 transition-colors text-left relative overflow-hidden"
                                  >
                                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-[#8ab4ff]/30 group-hover:bg-[#8ab4ff] transition-colors" />
                                    <p className="text-xs text-white font-bold truncate group-hover:text-[#8ab4ff] transition-colors ml-1">{document.name}</p>
                                    <div className="flex items-center gap-2 text-[10px] text-gray-500 ml-1">
                                      <span className="bg-white/5 border border-white/5 px-1.5 py-0.5 rounded">{getDocumentTypeLabel(document.documentType)}</span>
                                      {document.folderLabel && <span className="truncate">{document.folderLabel.replace(/^\d{2}-/, '')}</span>}
                                    </div>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="bg-[#0f0f0f] border border-white/5 rounded-xl p-5 space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-white text-[10px] uppercase tracking-[0.3em] font-black">
                            <FileIcon size={12} className="text-[#8ab4ff]" /> Arquivos
                          </div>
                        </div>

                        {selectedCard.documents.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-white/10 bg-[#111] px-5 py-6 text-xs text-center text-gray-500 uppercase tracking-widest font-medium">
                            Repositório Vazio
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {selectedCard.documents.slice(0, 3).map((document, index) => (
                              <div key={`${document.name}-${index}`} className="flex items-center justify-between gap-3 bg-[#141414] border border-white/5 hover:border-white/10 rounded-xl px-4 py-3 transition-colors">
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-gray-200 font-bold truncate">{document.name}</p>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {document.web_view_link && (
                                    <a
                                      href={document.web_view_link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-[10px] font-black uppercase tracking-[0.2em] text-[#8ab4ff] hover:text-white border border-[#4285F4]/20 rounded-md px-3 py-1.5 bg-[#4285F4]/5 hover:bg-[#4285F4]/10 transition-colors"
                                    >
                                      Ver Manual
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {Boolean(selectedCard.drive_structure_ready && selectedCard.drive_folder_id && selectedCard.drive_link) && (
                          <div className="mt-5 rounded-xl border border-[#CCA761]/20 bg-gradient-to-b from-[#CCA761]/[0.05] to-transparent p-5 space-y-4">
                            <div className="flex items-center gap-2 text-[#CCA761] text-[10px] uppercase tracking-[0.3em] font-black">
                              <Upload size={14} /> Upload via Plataforma
                            </div>

                            <div className="flex flex-col sm:flex-row gap-3">
                              <select
                                value={uploadFolderByTask[selectedCard.id] || "01-Documentos do Cliente"}
                                onChange={(event) => setUploadFolderByTask((current) => ({ ...current, [selectedCard.id]: event.target.value }))}
                                className="bg-[#0a0a0a] border border-[#CCA761]/20 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#CCA761]/60 font-medium tracking-wide appearance-none sm:w-[50%]"
                              >
                                {DOCUMENT_FOLDER_OPTIONS.map((folderLabel) => (
                                  <option key={folderLabel} value={folderLabel}>{folderLabel.replace(/^\d{2}-/, '')}</option>
                                ))}
                              </select>

                              <div className="relative flex-1">
                                <input
                                  key={`${selectedCard.id}-${uploadInputVersionByTask[selectedCard.id] || 0}`}
                                  id={`modal-upload-input-${selectedCard.id}`}
                                  type="file"
                                  onChange={(event) => {
                                    const nextFile = event.target.files?.[0] || null;
                                    setUploadFilesByTask((current) => ({ ...current, [selectedCard.id]: nextFile }));
                                  }}
                                  className="hidden"
                                />
                                <label
                                  htmlFor={`modal-upload-input-${selectedCard.id}`}
                                  className="w-full h-full min-h-[44px] bg-[#0a0a0a] border border-[#CCA761]/20 rounded-xl pl-4 pr-3 py-1.5 text-xs text-white flex items-center justify-between gap-3 cursor-pointer hover:border-[#CCA761]/50 transition-colors group/upload"
                                >
                                  <span className="truncate text-gray-400 group-hover/upload:text-gray-200 font-medium">
                                    {uploadFilesByTask[selectedCard.id]?.name || "Localizar..."}
                                  </span>
                                </label>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleUploadDocument(selectedCard.id)}
                              disabled={busyTaskId === selectedCard.id}
                              className="w-full mt-2 px-6 py-3.5 rounded-xl border border-[#CCA761]/40 bg-[#CCA761]/10 hover:bg-[#CCA761]/20 text-xs font-black uppercase tracking-[0.2em] text-[#CCA761] flex items-center justify-center gap-2 disabled:opacity-50 transition-all hover:shadow-[0_0_15px_rgba(204,167,97,0.2)]"
                            >
                              {busyTaskId === selectedCard.id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                              Enviar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#0a0a0a] border border-[#CCA761]/10 rounded-2xl flex flex-col relative overflow-hidden shadow-[0_0_40px_rgba(204,167,97,0.02)] min-h-[760px] xl:h-[86vh]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-6 py-5 border-b border-[#CCA761]/10 bg-[#0f0f0f] shrink-0 sticky top-0 z-20">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#CCA761]/10 border border-[#CCA761]/20 flex items-center justify-center">
                          <FileText size={16} className="text-[#CCA761]" />
                        </div>
                        <div>
                          <p className="text-[#CCA761] text-[10px] uppercase tracking-[0.3em] font-black">
                            {generatedPieceByTask[selectedCard.id] ? generatedPieceByTask[selectedCard.id]!.pieceLabel : "Painel Editorial Jurídico"}
                          </p>
                          <p className="text-xs text-gray-500 font-medium tracking-wide mt-0.5">
                            {generatedPieceByTask[selectedCard.id] ? "Ambiente premium de revisão e formatação" : "Pré-visualização do rascunho oficial"}
                          </p>
                        </div>
                      </div>
                      
                      {generatedPieceByTask[selectedCard.id] && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleCopyPiece(selectedCard.id)}
                            className="px-4 py-2.5 rounded-xl border border-white/10 bg-[#111] hover:bg-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-white flex items-center justify-center gap-2 transition-colors"
                          >
                            <Copy size={14} /> Copiar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadPiece(selectedCard.id)}
                            disabled={downloadBusyTaskId === selectedCard.id}
                            className="px-4 py-2.5 rounded-xl border border-[#4285F4]/30 bg-[#4285F4]/10 hover:bg-[#4285F4]/20 text-[10px] font-black uppercase tracking-[0.2em] text-[#8ab4ff] flex items-center justify-center gap-2 disabled:opacity-50 transition-colors shadow-[0_0_15px_rgba(66,133,244,0.1)]"
                          >
                            {downloadBusyTaskId === selectedCard.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            Exportar .DOCX
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 overflow-y-auto no-scrollbar bg-[#030303] p-3 sm:p-6 lg:p-10 relative">
                      {generatedPieceByTask[selectedCard.id] ? (
                        <div className="max-w-[850px] mx-auto bg-[#0d0d0d] border border-white/5 shadow-2xl rounded-xl min-h-full flex flex-col relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-[#CCA761]/50 to-transparent opacity-70" />
                          
                          <div className="absolute top-10 right-10 opacity-[0.03] pointer-events-none">
                            <Sparkles size={200} className="text-[#CCA761] mix-blend-screen" />
                          </div>

                          <div className="p-8 sm:p-12 md:p-16 relative z-10 flex-1">
                            <article 
                              className={`prose prose-invert max-w-none ${cormorant.className} 
                                prose-headings:font-bold prose-headings:text-[#e2c78d] prose-headings:tracking-wide
                                prose-h1:text-4xl prose-h1:text-center prose-h1:mb-10
                                prose-h2:text-3xl prose-h2:mt-12 prose-h2:border-b prose-h2:border-white/5 prose-h2:pb-4
                                prose-h3:text-2xl prose-h3:text-[#CCA761]
                                prose-p:text-gray-200 prose-p:leading-[2] prose-p:text-justify prose-p:text-[22px] prose-p:tracking-wide
                                prose-li:text-gray-200 prose-li:text-[22px] prose-li:leading-[1.9]
                                prose-strong:text-white prose-strong:font-bold
                                prose-blockquote:border-l-[3px] prose-blockquote:border-[#CCA761] prose-blockquote:bg-[#CCA761]/[0.03] prose-blockquote:py-4 prose-blockquote:px-6 prose-blockquote:text-gray-400 prose-blockquote:italic prose-blockquote:rounded-r-xl prose-blockquote:my-8 prose-blockquote:text-[20px]
                                prose-hr:border-white/10 prose-hr:my-12
                                marker:text-[#CCA761]
                              `}
                            >
                              <ReactMarkdown>{generatedPieceByTask[selectedCard.id]!.draftMarkdown}</ReactMarkdown>
                            </article>
                          </div>
                        </div>
                      ) : (
                        <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-center p-10 border-2 border-dashed border-[#CCA761]/10 rounded-2xl bg-[#0a0a0a]/50 m-4 lg:m-10">
                          <div className="w-24 h-24 rounded-full bg-[#111] border border-white/5 flex items-center justify-center mb-6 relative group">
                            <div className="absolute inset-0 bg-[#CCA761]/10 rounded-full blur-xl animate-pulse" />
                            <FileText size={40} className="text-[#CCA761]/30 relative z-10" />
                          </div>
                          <p className="text-[#CCA761] text-[10px] uppercase tracking-[0.3em] font-black mb-4">Página em Branco</p>
                          <p className="text-sm text-gray-500 max-w-sm leading-relaxed mx-auto">
                            O rascunho oficial de alto nível será renderizado aqui com design editorial e legibilidade confortável para advogados.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
                  {Boolean(selectedCard.drive_structure_ready && selectedCard.drive_folder_id && selectedCard.drive_link) ? (
                    <a
                      href={selectedCard.drive_link || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 rounded-xl border border-[#4285F4]/30 bg-[#4285F4]/10 hover:bg-[#4285F4]/20 text-[9px] font-black uppercase tracking-[0.1em] text-[#8ab4ff] flex items-center justify-center gap-1.5 transition-colors text-center"
                    >
                      <ExternalLink size={12} className="shrink-0" /> <span className="truncate">Drive</span>
                    </a>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleCreateStructure(selectedCard.id)}
                      disabled={busyTaskId === selectedCard.id}
                      className="w-full py-3 rounded-xl border border-[#4285F4]/40 bg-[#4285F4]/15 hover:bg-[#4285F4]/25 text-[9px] font-black uppercase tracking-[0.1em] text-[#8ab4ff] flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all text-center"
                    >
                      <FolderTree size={12} className="shrink-0" /> <span className="truncate">Criar Estrutura</span>
                    </button>
                  )}

                  <button
                      type="button"
                      onClick={() => handleSync(selectedCard.id)}
                      disabled={busyTaskId === selectedCard.id || !Boolean(selectedCard.drive_structure_ready)}
                      className="w-full py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[9px] font-black uppercase tracking-[0.1em] text-white flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors col-span-2 lg:col-span-2 text-center"
                    >
                      {busyTaskId === selectedCard.id ? <Loader2 size={12} className="animate-spin shrink-0" /> : <RefreshCw size={12} className="shrink-0" />}
                      <span>Orquestrar Sincronização IA</span>
                  </button>

                  <Link
                    href={`/dashboard/processos/${selectedCard.pipeline_id}`}
                    className="w-full py-3 rounded-xl border border-[#CCA761]/30 bg-[#CCA761]/10 hover:bg-[#CCA761]/20 text-[9px] font-black uppercase tracking-[0.1em] text-[#CCA761] flex items-center justify-center gap-1.5 transition-all text-center"
                  >
                    <FileText size={12} className="shrink-0" /> <span className="truncate">Board</span>
                  </Link>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
