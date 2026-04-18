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
    <div className={`flex-1 min-h-screen bg-[#050505] text-white p-6 sm:p-10 ${montserrat.className}`}>
      <div className="max-w-[1340px] mx-auto space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="space-y-3">
            <p className="text-[#CCA761] text-xs uppercase tracking-[0.35em] font-black">Operação Jurídica</p>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl border border-[#4285F4]/25 bg-[#0b1220] flex items-center justify-center shadow-[0_0_30px_rgba(66,133,244,0.08)]">
                <GoogleDriveLogo size={30} className="h-[30px] w-[30px]" />
              </div>
              <div>
                <h1 className={`text-4xl text-white tracking-wide ${cormorant.className}`}>
                  Repositório de <span className="text-[#CCA761]">Documentos</span>
                </h1>
                <p className="text-gray-400 text-sm max-w-3xl leading-relaxed">
                  Visualize a estrutura documental de cada processo, abra o Google Drive oficial do caso e sincronize a memória mínima que alimentará o cérebro jurídico do MAYUS.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative min-w-[280px]">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por cliente, processo ou pipeline"
                className="w-full bg-[#111] border border-white/10 rounded-xl pl-11 pr-4 py-3 text-sm text-white focus:outline-none focus:border-[#CCA761]/40 placeholder:text-gray-600"
              />
            </div>
            <button
              type="button"
              onClick={loadRepository}
              className="px-4 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest text-white flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} /> Atualizar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="bg-[#0f0f0f] border border-[#CCA761]/10 rounded-2xl p-5 shadow-[0_0_24px_rgba(204,167,97,0.04)]">
            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-black mb-2">Processos monitorados</p>
            <p className="text-3xl font-black text-white">{cards.length}</p>
          </div>
          <div className="bg-[#0f0f0f] border border-[#CCA761]/10 rounded-2xl p-5 shadow-[0_0_24px_rgba(204,167,97,0.04)]">
            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-black mb-2">Estrutura criada</p>
            <p className="text-3xl font-black text-white">{cards.filter((card) => card.drive_structure_ready).length}</p>
          </div>
          <div className="bg-[#0f0f0f] border border-[#CCA761]/10 rounded-2xl p-5 shadow-[0_0_24px_rgba(204,167,97,0.04)]">
            <p className="text-[10px] uppercase tracking-[0.3em] text-gray-500 font-black mb-2">Documentos sincronizados</p>
            <p className="text-3xl font-black text-white">{cards.reduce((acc, card) => acc + card.documentCount, 0)}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="bg-[#0f0f0f] border border-white/5 rounded-3xl p-10 flex items-center justify-center gap-3 text-sm text-gray-400">
            <Loader2 size={18} className="animate-spin text-[#CCA761]" /> Carregando repositório documental...
          </div>
        ) : filteredCards.length === 0 ? (
          <div className="bg-[#0f0f0f] border border-white/5 rounded-3xl p-10 text-center space-y-3">
            <FolderTree size={28} className="mx-auto text-[#CCA761]" />
            <h2 className={`text-2xl text-white ${cormorant.className}`}>Nenhum processo encontrado</h2>
            <p className="text-sm text-gray-400 max-w-xl mx-auto">
              Crie ou salve processos primeiro. Assim que o card existir, o MAYUS consegue iniciar a estrutura documental no Google Drive.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
            {filteredCards.map((card) => {
              const isBusy = busyTaskId === card.id;
              const hasStructure = Boolean(card.drive_structure_ready && card.drive_folder_id && card.drive_link);

              return (
                <div key={card.id} className="bg-[#0f0f0f] border border-[#CCA761]/12 rounded-3xl p-6 shadow-[0_0_35px_rgba(0,0,0,0.22),0_0_0_1px_rgba(204,167,97,0.05)]">
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.28em] text-gray-500 font-black mb-2">
                        {card.pipelineName || "Pipeline jurídico"}
                        {card.stageName ? ` • ${card.stageName}` : ""}
                      </p>
                      <h2 className="text-xl font-black text-white leading-tight">{card.title}</h2>
                      <p className="text-sm text-gray-400 mt-2">
                        {card.client_name || "Cliente não informado"}
                        {card.process_number ? ` • ${card.process_number}` : ""}
                      </p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-widest font-black border ${
                      hasStructure
                        ? 'bg-[#0b1220] border-[#4285F4]/30 text-[#8ab4ff]'
                        : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                    }`}>
                      {hasStructure ? 'Drive estruturado' : 'Sem estrutura'}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                    <div className="bg-[#141414] border border-[#CCA761]/8 rounded-2xl p-4">
                      <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black mb-2">Documentos</p>
                      <p className="text-2xl font-black text-white">{card.documentCount}</p>
                    </div>
                    <div className="bg-[#141414] border border-[#CCA761]/8 rounded-2xl p-4">
                      <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black mb-2">Status</p>
                      <p className="text-sm font-semibold text-white capitalize">{card.syncStatus}</p>
                    </div>
                    <div className="bg-[#141414] border border-[#CCA761]/8 rounded-2xl p-4">
                      <p className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black mb-2">Última sync</p>
                      <p className="text-sm font-semibold text-white">{formatDateTime(card.lastSyncedAt)}</p>
                    </div>
                  </div>

                  <div className="bg-[#111] border border-[#CCA761]/8 rounded-2xl p-4 space-y-3 mb-5">
                    <div className="flex items-center gap-2 text-[#CCA761] text-[10px] uppercase tracking-[0.25em] font-black">
                      <Sparkles size={12} /> Memória mínima do caso
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {card.summaryMaster || "Estrutura documental ainda não sincronizada. Crie a estrutura do Drive e sincronize para consolidar o contexto inicial do processo."}
                    </p>
                    {card.missingDocuments.length > 0 && (
                      <div className="flex items-start gap-2 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        Pendências detectadas: {card.missingDocuments.join(", ")}
                      </div>
                    )}
                  </div>

                  <div className="bg-[#111] border border-[#CCA761]/8 rounded-2xl p-5 space-y-4 mb-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-[#8ab4ff] text-[10px] uppercase tracking-[0.25em] font-black">
                        <FileIcon size={12} /> Acervo do processo
                      </div>
                      <span className="text-[10px] uppercase tracking-[0.25em] text-gray-500 font-black">
                        {card.documents.length} item(ns) recentes
                      </span>
                    </div>

                    {card.documents.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-white/10 bg-[#141414] px-4 py-5 text-sm text-gray-500">
                        Nenhum arquivo indexado ainda. Envie um documento abaixo ou sincronize a pasta do Drive para alimentar o cérebro documental do processo.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {card.documents.map((document, index) => (
                          <div key={`${document.name}-${index}`} className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 bg-[#141414] border border-white/5 rounded-xl px-4 py-3.5">
                            <div className="min-w-0 space-y-2">
                              <p className="text-sm text-white font-semibold truncate">{document.name}</p>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
                                <span className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-gray-300 font-semibold">
                                  {document.folder_label || "Sem pasta"}
                                </span>
                                <span className="px-2 py-1 rounded-full bg-[#0b1220] border border-[#4285F4]/15 text-[#8ab4ff] font-semibold">
                                  {getDocumentTypeLabel(document.document_type)}
                                </span>
                                <span>{document.modified_at ? formatDateTime(document.modified_at) : "Data indisponível"}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-black border ${getExtractionBadge(document.extraction_status).className}`}>
                                {getExtractionBadge(document.extraction_status).label}
                              </span>
                              {document.web_view_link && (
                                <a
                                  href={document.web_view_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs font-black uppercase tracking-widest text-[#8ab4ff] hover:text-white border border-white/10 rounded-lg px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors"
                                >
                                  Abrir
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {hasStructure && (
                      <div className="rounded-2xl border border-[#CCA761]/30 bg-[linear-gradient(180deg,rgba(204,167,97,0.07),rgba(11,18,32,0.52))] p-5 space-y-4 shadow-[0_0_28px_rgba(204,167,97,0.06)]">
                        <div className="flex items-center gap-2 text-[#CCA761] text-[10px] uppercase tracking-[0.25em] font-black">
                          <Upload size={12} /> Enviar novo documento
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed">
                          Selecione a subpasta correta e envie o arquivo direto pelo MAYUS. O sistema joga no Google Drive, indexa no repositório e tenta ler o conteúdo automaticamente.
                        </p>

                        <div className="grid grid-cols-1 xl:grid-cols-[minmax(240px,0.85fr)_minmax(340px,1.35fr)_170px] gap-3 items-stretch">
                          <select
                            value={uploadFolderByTask[card.id] || "01-Documentos do Cliente"}
                            onChange={(event) => setUploadFolderByTask((current) => ({ ...current, [card.id]: event.target.value }))}
                            className="w-full bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#CCA761]/45"
                          >
                            {DOCUMENT_FOLDER_OPTIONS.map((folderLabel) => (
                              <option key={folderLabel} value={folderLabel}>{folderLabel}</option>
                            ))}
                          </select>

                          <div className="relative">
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
                              className="w-full h-full min-h-[54px] bg-[#141414] border border-white/10 rounded-xl px-4 py-3 text-sm text-white flex items-center justify-between gap-3 cursor-pointer hover:border-[#CCA761]/35 transition-colors"
                            >
                              <div className="min-w-0">
                                <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500 font-black mb-1">Arquivo</p>
                                <p className="text-sm text-white truncate">
                                  {uploadFilesByTask[card.id]?.name || "Selecionar documento do processo"}
                                </p>
                              </div>
                              <span className="shrink-0 px-3 py-2 rounded-lg bg-[#111827] border border-[#CCA761]/18 text-[#CCA761] text-[11px] font-black uppercase tracking-widest">
                                Escolher
                              </span>
                            </label>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleUploadDocument(card.id)}
                            disabled={isBusy}
                            className="w-full px-4 py-3 rounded-xl border border-[#CCA761]/28 bg-[#15120b] hover:bg-[#201a0f] text-xs font-black uppercase tracking-widest text-[#CCA761] flex items-center justify-center gap-2 disabled:opacity-60"
                          >
                            {isBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                            Enviar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    {hasStructure ? (
                      <a
                        href={card.drive_link || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-3 rounded-xl border border-[#CCA761]/12 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest text-white flex items-center justify-center gap-2"
                      >
                        <ExternalLink size={14} /> Abrir pasta
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCreateStructure(card.id)}
                        disabled={isBusy}
                        className="flex-1 py-3 rounded-xl border border-[#4285F4]/25 bg-[#0b1220] hover:bg-[#12203c] text-xs font-black uppercase tracking-widest text-[#8ab4ff] flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <FolderTree size={14} />}
                        Criar estrutura
                      </button>
                    )}

                    <button
                        type="button"
                        onClick={() => handleSync(card.id)}
                        disabled={isBusy || !hasStructure}
                        className="flex-1 py-3 rounded-xl border border-[#CCA761]/12 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest text-white flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Sincronizar
                    </button>

                    <Link
                      href={`/dashboard/processos/${card.pipeline_id}`}
                      className="flex-1 py-3 rounded-xl border border-[#CCA761]/12 bg-white/5 hover:bg-white/10 text-xs font-black uppercase tracking-widest text-white flex items-center justify-center gap-2"
                    >
                      <FileText size={14} /> Abrir board
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
