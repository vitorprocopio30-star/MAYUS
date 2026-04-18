"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { GoogleDriveLogo } from "@/components/branding/GoogleDriveLogo";
import {
  ExternalLink,
  FolderTree,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  FileText,
  AlertTriangle,
  Upload,
  File as FileIcon,
} from "lucide-react";
import { toast } from "sonner";

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
  const [cards, setCards] = useState<ProcessDocumentCard[]>([]);
  const [uploadFolderByTask, setUploadFolderByTask] = useState<Record<string, string>>({});
  const [uploadFilesByTask, setUploadFilesByTask] = useState<Record<string, globalThis.File | null>>({});
  const [uploadInputVersionByTask, setUploadInputVersionByTask] = useState<Record<string, number>>({});

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

  return (
    <div className={`flex-1 min-h-screen relative text-white p-6 sm:p-10 ${montserrat.className} overflow-hidden`}>
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
          href="/dashboard/documentos/donna"
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
                <h3 className={`text-3xl text-white ${cormorant.className} flex items-center gap-3 font-bold`}>
                  Acessar Acervo da <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#CCA761] to-[#f4dca6] italic tracking-wider">Donna</span>
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredCards.map((card) => {
              const isBusy = busyTaskId === card.id;
              const hasStructure = Boolean(card.drive_structure_ready && card.drive_folder_id && card.drive_link);

              return (
                <div key={card.id} className="group/card bg-[#0a0a0a] border border-white/5 hover:border-[#CCA761]/20 rounded-[22px] p-5 transition-all duration-500 hover:shadow-[0_10px_40px_rgba(0,0,0,0.5),0_0_0_1px_rgba(204,167,97,0.1)] relative overflow-hidden flex flex-col">
                  {/* Subtle top gradient line */}
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#CCA761]/0 group-hover/card:via-[#CCA761]/40 to-transparent transition-all duration-700" />
                  
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="space-y-0.5">
                      <p className="text-[9px] uppercase tracking-[0.25em] text-[#CCA761] font-black flex items-center gap-1.5">
                        {card.pipelineName || "Pipeline"}
                        {card.stageName ? <><span className="w-1 h-1 rounded-full bg-[#CCA761]/50" /> {card.stageName}</> : ""}
                      </p>
                      <h2 className={`text-lg font-bold text-white leading-tight ${cormorant.className} tracking-wide`}>{card.title}</h2>
                      <p className="text-[11px] text-gray-400 font-medium tracking-wide truncate max-w-[200px]">
                        {card.client_name || "Sem cliente"}
                        {card.process_number ? ` • ${card.process_number}` : ""}
                      </p>
                    </div>
                    <div className={`px-2.5 py-1 rounded-full text-[9px] uppercase tracking-widest font-black border flex items-center gap-1.5 shrink-0 ${
                      hasStructure
                        ? 'bg-[#4285F4]/10 border-[#4285F4]/30 text-[#8ab4ff] shadow-[0_0_10px_rgba(66,133,244,0.1)]'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    }`}>
                      {hasStructure && <div className="w-1 h-1 rounded-full bg-[#4285F4] animate-pulse" />}
                      {hasStructure ? 'Ativo' : 'Pendente'}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-[#111] border border-white/5 rounded-xl p-3 group-hover/card:border-white/10 transition-colors">
                      <p className="text-[8px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1">Docs</p>
                      <p className="text-xl font-black text-white">{card.documentCount}</p>
                    </div>
                    <div className="bg-[#111] border border-white/5 rounded-xl p-3 group-hover/card:border-white/10 transition-colors">
                      <p className="text-[8px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1">Status</p>
                      <p className="text-[10px] font-bold text-[#CCA761] capitalize truncate">{card.syncStatus}</p>
                    </div>
                    <div className="bg-[#111] border border-white/5 rounded-xl p-3 group-hover/card:border-white/10 transition-colors">
                      <p className="text-[8px] uppercase tracking-[0.2em] text-gray-500 font-black mb-1">Sync</p>
                      <p className="text-[9px] font-semibold text-gray-300 mt-0.5 truncate uppercase tracking-tighter">{formatDateTime(card.lastSyncedAt).split(',')[0]}</p>
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/5 rounded-xl p-4 mb-4 relative overflow-hidden group-hover/card:border-[#CCA761]/10 transition-colors">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-[#CCA761]/5 blur-2xl rounded-full" />
                    <div className="flex items-center gap-2 text-[#CCA761] text-[9px] uppercase tracking-[0.25em] font-black mb-2">
                      <Sparkles size={12} /> Memória Base
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed font-medium relative z-10 line-clamp-3">
                      {card.summaryMaster || "Estrutura documental aguardando orquestração inicial. Sincronize o Drive para processar a taxonomia."}
                    </p>
                    {card.missingDocuments.length > 0 && (
                      <div className="mt-3 flex items-start gap-2 text-[10px] text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 relative z-10">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5 text-amber-400" />
                        <span className="truncate">Pendências: {card.missingDocuments.join(", ")}</span>
                      </div>
                    )}
                  </div>

                  {/* Flexible spacer to push buttons to bottom if needed */}
                  <div className="flex-1">
                    <div className="bg-[#0f0f0f] border border-white/5 rounded-xl p-4 space-y-3 mb-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-white text-[9px] uppercase tracking-[0.25em] font-black">
                          <FileIcon size={12} className="text-[#8ab4ff]" /> Arquivos
                        </div>
                      </div>

                      {card.documents.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-white/10 bg-[#111] px-4 py-4 text-[9px] text-center text-gray-500 uppercase tracking-widest font-medium">
                          Vazio
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {card.documents.slice(0, 3).map((document, index) => (
                            <div key={`${document.name}-${index}`} className="flex items-center justify-between gap-2 bg-[#141414] border border-white/5 hover:border-white/10 rounded-lg px-3 py-2 transition-colors">
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] text-gray-200 font-bold truncate">{document.name}</p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {document.web_view_link && (
                                  <a
                                    href={document.web_view_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[9px] font-black uppercase tracking-[0.1em] text-[#8ab4ff] hover:text-white border border-[#4285F4]/20 rounded-md px-2 py-1 bg-[#4285F4]/5 hover:bg-[#4285F4]/10 transition-colors"
                                  >
                                    Ver
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {hasStructure && (
                        <div className="mt-4 rounded-lg border border-[#CCA761]/20 bg-gradient-to-b from-[#CCA761]/[0.05] to-transparent p-3.5 space-y-3">
                          <div className="flex items-center gap-2 text-[#CCA761] text-[9px] uppercase tracking-[0.25em] font-black">
                            <Upload size={12} /> Upload Rápido
                          </div>

                          <div className="flex flex-col gap-2">
                            <select
                              value={uploadFolderByTask[card.id] || "01-Documentos do Cliente"}
                              onChange={(event) => setUploadFolderByTask((current) => ({ ...current, [card.id]: event.target.value }))}
                              className="w-full bg-[#0a0a0a] border border-[#CCA761]/20 rounded-lg px-3 py-2 text-[10px] text-white focus:outline-none focus:border-[#CCA761]/60 font-medium tracking-wide appearance-none"
                            >
                              {DOCUMENT_FOLDER_OPTIONS.map((folderLabel) => (
                                <option key={folderLabel} value={folderLabel}>{folderLabel.replace(/^\d{2}-/, '')}</option>
                              ))}
                            </select>

                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <input
                                  key={`${card.id}-${uploadInputVersionByTask[card.id] || 0}`}
                                  id={`upload-input-${card.id}`}
                                  type="file"
                                  onChange={(event) => {
                                    const nextFile = event.target.files?.[0] || null;
                                    setUploadFilesByTask((current) => ({ ...current, [card.id]: nextFile }));
                                  }}
                                  className="hidden"
                                />
                                <label
                                  htmlFor={`upload-input-${card.id}`}
                                  className="w-full h-full min-h-[36px] bg-[#0a0a0a] border border-[#CCA761]/20 rounded-lg pl-3 pr-2 py-1 text-[10px] text-white flex items-center justify-between gap-2 cursor-pointer hover:border-[#CCA761]/50 transition-colors group/upload"
                                >
                                  <span className="truncate text-gray-500 group-hover/upload:text-gray-200 font-medium">
                                    {uploadFilesByTask[card.id]?.name || "Arquivo..."}
                                  </span>
                                  <span className="shrink-0 px-2 py-1 rounded-md bg-[#111] border border-[#CCA761]/30 text-[#CCA761] text-[8px] font-black uppercase tracking-widest">
                                    Busca
                                  </span>
                                </label>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleUploadDocument(card.id)}
                                disabled={isBusy}
                                className="px-3 rounded-lg border border-[#CCA761]/40 bg-[#CCA761]/10 hover:bg-[#CCA761]/20 text-[9px] font-black uppercase tracking-[0.1em] text-[#CCA761] flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all hover:shadow-[0_0_10px_rgba(204,167,97,0.2)]"
                              >
                                {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                OK
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 shrink-0">
                    {hasStructure ? (
                      <a
                        href={card.drive_link || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2.5 rounded-lg border border-[#4285F4]/30 bg-[#4285F4]/10 hover:bg-[#4285F4]/20 text-[9px] font-black uppercase tracking-[0.15em] text-[#8ab4ff] flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <ExternalLink size={12} /> Drive
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCreateStructure(card.id)}
                        disabled={isBusy}
                        className="w-full py-2.5 rounded-lg border border-[#4285F4]/40 bg-[#4285F4]/15 hover:bg-[#4285F4]/25 text-[9px] font-black uppercase tracking-[0.15em] text-[#8ab4ff] flex items-center justify-center gap-1.5 disabled:opacity-50 transition-all"
                      >
                        <FolderTree size={12} /> Criar
                      </button>
                    )}

                    <button
                        type="button"
                        onClick={() => handleSync(card.id)}
                        disabled={isBusy || !hasStructure}
                        className="w-full py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-[9px] font-black uppercase tracking-[0.15em] text-white flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors"
                      >
                        {isBusy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Sync
                    </button>

                    <Link
                      href={`/dashboard/processos/${card.pipeline_id}`}
                      className="w-full py-2.5 rounded-lg border border-[#CCA761]/30 bg-[#CCA761]/10 hover:bg-[#CCA761]/20 text-[9px] font-black uppercase tracking-[0.15em] text-[#CCA761] flex items-center justify-center gap-1.5 transition-all"
                    >
                      <FileText size={12} /> Board
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
