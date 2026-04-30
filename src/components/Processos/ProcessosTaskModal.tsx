import { useState, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { User as UserIcon, AlignLeft, X, Trash2, Calendar, CheckCircle2, ArrowRight, MessageCircle, Tag as TagIcon, Plus, Copy, Check, Pencil, FolderPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { GoogleDriveLogo } from "@/components/branding/GoogleDriveLogo";
import {
  buildAgendaPayloadFromProcessTask,
  deleteAgendaTaskBySource,
  syncAgendaTaskBySource,
} from "@/lib/agenda/userTasks";
import { Pipeline, Stage, Profile, Task } from "@/types/processos";
import "react-quill/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill"), { 
  ssr: false,
  loading: () => <div className="h-[250px] w-full bg-gray-100 dark:bg-white/5 animate-pulse rounded-lg" />
});

interface ProcessosTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTask: Task | null;
  defaultStageId: string;
  pipeline: Pipeline | null;
  stages: Stage[];
  agents: Profile[];
  profile: any;
  onSaveSuccess: (updatedTask: Task, isNew: boolean) => void;
  onDeleteSuccess: (taskId: string) => void;
}

export default function ProcessosTaskModal({
  isOpen, onClose, editingTask, defaultStageId, pipeline, stages, agents, profile, onSaveSuccess, onDeleteSuccess
}: ProcessosTaskModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const saveInFlightRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingDriveFolder, setIsCreatingDriveFolder] = useState(false);

  // Task Form State
  const [taskTitle, setTaskTitle] = useState("");
  const [taskProcessNumber, setTaskProcessNumber] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskResponsibleNotes, setTaskResponsibleNotes] = useState("");
  const [taskUrgency, setTaskUrgency] = useState<"URGENTE" | "ATENCAO" | "ROTINA">("ROTINA");
  const [taskStageId, setTaskStageId] = useState("");
  const [taskAssignedTo, setTaskAssignedTo] = useState<string | null>(null);
  const [taskTags, setTaskTags] = useState<string[]>([]);
  const [tagColor, setTagColor] = useState<string>("#CCA761");
  const [taskPhone, setTaskPhone] = useState("");
  const [taskSector, setTaskSector] = useState("");
  const [taskProcesso1Grau, setTaskProcesso1Grau] = useState("");
  const [taskProcesso2Grau, setTaskProcesso2Grau] = useState("");
  const [taskDemanda, setTaskDemanda] = useState("");
  const [taskAndamento1Grau, setTaskAndamento1Grau] = useState("");
  const [taskAndamento2Grau, setTaskAndamento2Grau] = useState("");
  const [taskOrgaoJulgador, setTaskOrgaoJulgador] = useState("");
  const [taskTutelaUrgencia, setTaskTutelaUrgencia] = useState("");
  const [taskSentenca, setTaskSentenca] = useState("");
  const [taskReu, setTaskReu] = useState("");
  const [taskValorCausa, setTaskValorCausa] = useState("");
  const [taskPrazoFatal, setTaskPrazoFatal] = useState("");
  const [taskLiminarDeferida, setTaskLiminarDeferida] = useState(false);
  const [taskClientName, setTaskClientName] = useState("");
  const [taskDriveLink, setTaskDriveLink] = useState("");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [editingTagOriginal, setEditingTagOriginal] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  
  // Pending Move State for Win/Loss

  const getAssignedAgentName = (assignedTo: string | null | undefined) => {
    if (!assignedTo) return null;
    return agents.find((agent) => agent.id === assignedTo)?.full_name || null;
  };

  // Initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (editingTask) {
        setTaskTitle(editingTask.title);
        setTaskProcessNumber(editingTask.process_number || "");
        setTaskDesc(editingTask.description || "");
        setTaskResponsibleNotes(editingTask.responsible_notes || "");
        setTaskUrgency(editingTask.urgency || "ROTINA");
        setTaskStageId(editingTask.stage_id);
        setTaskAssignedTo(editingTask.assigned_to);
        setTaskTags(editingTask.tags || []);
        setTaskPhone(editingTask.phone || "");
        setTaskSector(editingTask.sector || "");
        setTaskProcesso1Grau(editingTask.processo_1grau || "");
        setTaskProcesso2Grau(editingTask.processo_2grau || "");
        setTaskDemanda(editingTask.demanda || "");
        setTaskAndamento1Grau(editingTask.andamento_1grau || "");
        setTaskAndamento2Grau(editingTask.andamento_2grau || "");
        setTaskOrgaoJulgador(editingTask.orgao_julgador || "");
        setTaskTutelaUrgencia(editingTask.tutela_urgencia || "");
        setTaskSentenca(editingTask.sentenca || "");
        setTaskReu(editingTask.reu || "");
        setTaskValorCausa(editingTask.valor_causa ? editingTask.valor_causa.toString() : "");    
        setTaskPrazoFatal(editingTask.prazo_fatal ? editingTask.prazo_fatal.split('T')[0] : "");
        setTaskLiminarDeferida(editingTask.liminar_deferida || false);
        setTaskClientName(editingTask.client_name || "");
        setTaskDriveLink(editingTask.drive_link || "");
      } else {
        setTaskTitle("");
        setTaskProcessNumber("");
        setTaskDesc("");
        setTaskResponsibleNotes("");
        setTaskUrgency("ROTINA");
        setTaskStageId(defaultStageId || (stages[0]?.id ?? ""));
        setTaskAssignedTo(null);
        setTaskTags([]);
        setTaskPhone("");
        setTaskSector("");
        setTaskProcesso1Grau("");
        setTaskProcesso2Grau("");
        setTaskDemanda("");
        setTaskAndamento1Grau("");
        setTaskAndamento2Grau("");
        setTaskOrgaoJulgador("");
        setTaskTutelaUrgencia("");
        setTaskSentenca("");
        setTaskReu("");
        setTaskValorCausa("");
        setTaskPrazoFatal("");
        setTaskLiminarDeferida(false);
        setTaskClientName("");
        setTaskDriveLink("");
      }

      setAvailableTags(pipeline?.tags || []);
      setNewTagName("");
      setEditingTagOriginal(null);
      setCopiedKey(null);
    }
  }, [isOpen, editingTask, defaultStageId, stages, pipeline?.tags]);

  const copyText = async (key: string, value: string) => {
    if (!value || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => {
        setCopiedKey((current) => (current === key ? null : current));
      }, 1200);
    } catch {
      // noop
    }
  };

  const handleCreateDriveFolder = async () => {
    if (!editingTask?.id) {
      toast.error("Salve o processo antes de criar a pasta do Drive.");
      return;
    }

    setIsCreatingDriveFolder(true);

    try {
      const response = await fetch("/api/integrations/google-drive/process-folder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskId: editingTask.id }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Não foi possível criar a pasta do Google Drive.");
      }

      if (data?.task?.drive_link) {
        setTaskDriveLink(data.task.drive_link);
        onSaveSuccess(data.task, false);
      }

      toast.success(data?.alreadyExists ? "Este processo já possui uma pasta no Drive." : "Pasta do Drive criada com sucesso.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível criar a pasta do Google Drive.");
    } finally {
      setIsCreatingDriveFolder(false);
    }
  };

  const syncAgendaAfterSave = async (task: Task) => {
    try {
      await syncAgendaTaskBySource(
        supabase,
        buildAgendaPayloadFromProcessTask({
          tenantId: profile!.tenant_id,
          task,
          assignedName: getAssignedAgentName(task.assigned_to),
          createdBy: profile?.id || null,
        })
      );
    } catch (error) {
      console.error("[processos][agenda-sync]", error);
      toast.warning("Processo salvo, mas a sincronização com a agenda falhou.");
    }
  };

  const maybeAutoCreateDriveFolder = async (task: Task): Promise<Task> => {
    if (!task?.id || task.drive_link) {
      return task;
    }

    try {
      const response = await fetch("/api/integrations/google-drive/process-folder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ taskId: task.id }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.task) {
        return task;
      }

      return data.task;
    } catch (error) {
      console.error("[processos][drive-structure]", error);
      return task;
    }
  };

  const handleCreateTag = async () => {
    const tagName = newTagName.trim();
    if (!tagName || !pipeline?.id) return;

    const normalized = tagName.toLowerCase();
    const alreadyExists = availableTags.some((tag) => {
      if (editingTagOriginal && tag === editingTagOriginal) return false;
      const [name] = tag.includes("|") ? tag.split("|") : [tag];
      return name.trim().toLowerCase() === normalized;
    });
    if (alreadyExists) {
      toast.error("Essa etiqueta já existe neste processo.");
      return;
    }

    const value = `${tagName}|${tagColor}`;
    let nextTags = [...availableTags];

    if (editingTagOriginal) {
      nextTags = nextTags.map((tag) => (tag === editingTagOriginal ? value : tag));
    } else {
      nextTags = [...nextTags, value];
    }

    const { error } = await supabase
      .from("process_pipelines")
      .update({ tags: nextTags })
      .eq("id", pipeline.id);

    if (error) {
      toast.error(editingTagOriginal ? "Não foi possível atualizar a etiqueta." : "Não foi possível criar a etiqueta.");
      return;
    }

    setAvailableTags(nextTags);
    setTaskTags((prev) => {
      if (editingTagOriginal) {
        const replaced = prev.map((tag) => (tag === editingTagOriginal ? value : tag));
        return replaced.includes(value) ? replaced : [...replaced, value];
      }
      return prev.includes(value) ? prev : [...prev, value];
    });
    setNewTagName("");
    setEditingTagOriginal(null);
    toast.success(editingTagOriginal ? "Etiqueta atualizada." : "Etiqueta criada.");
  };

  const handleStartEditTag = (tag: string) => {
    const [name, color] = tag.includes("|") ? tag.split("|") : [tag, "#CCA761"];
    setEditingTagOriginal(tag);
    setNewTagName(name);
    setTagColor(color || "#CCA761");
  };

  const handleCancelTagEdit = () => {
    setEditingTagOriginal(null);
    setNewTagName("");
    setTagColor("#CCA761");
  };

  const isMissingExtendedProcessTaskColumns = (error: any) => {
    const message = String(error?.message || "");
    return message.includes("process_number") || message.includes("responsible_notes") || message.includes("urgency");
  };

  const withoutExtendedProcessTaskColumns = (payload: Record<string, any>) => {
    const sanitized = { ...payload };
    delete sanitized.process_number;
    delete sanitized.responsible_notes;
    delete sanitized.urgency;
    return sanitized;
  };

  const handeSaveTask = async () => {
    if (saveInFlightRef.current) return;
    if (!taskTitle.trim()) { toast.error("Título é obrigatório."); return; }
    if (!taskStageId) return;

    saveInFlightRef.current = true;
    setIsSaving(true);
    try {
      if (editingTask) {
        const payload = {
          title: taskTitle,
          process_number: taskProcessNumber || null,
          description: taskDesc,
          responsible_notes: taskResponsibleNotes || null,
          urgency: taskUrgency,
          stage_id: taskStageId,
          assigned_to: taskAssignedTo,
          tags: taskTags,
          phone: taskPhone,
          sector: taskSector,
          processo_1grau: taskProcesso1Grau || null,
          processo_2grau: taskProcesso2Grau || null,
          demanda: taskDemanda || null,
          andamento_1grau: taskAndamento1Grau || null,
          andamento_2grau: taskAndamento2Grau || null,
          orgao_julgador: taskOrgaoJulgador || null,
          tutela_urgencia: taskTutelaUrgencia || null,
          sentenca: taskSentenca || null,
          reu: taskReu || null,
          valor_causa: taskValorCausa ? parseFloat(taskValorCausa) : null,
          prazo_fatal: taskPrazoFatal ? new Date(taskPrazoFatal).toISOString() : null,
          liminar_deferida: taskLiminarDeferida,
          client_name: taskClientName || null,
          drive_link: taskDriveLink || null
        };

        let { data, error } = await supabase.from("process_tasks").update(payload).eq("id", editingTask.id).select().single();

        if (error && isMissingExtendedProcessTaskColumns(error)) {
          const legacyResponse = await supabase
            .from("process_tasks")
            .update(withoutExtendedProcessTaskColumns(payload))
            .eq("id", editingTask.id)
            .select()
            .single();
          data = legacyResponse.data;
          error = legacyResponse.error;
        }

        if (error) throw error;

        await syncAgendaAfterSave(data);
         
        onSaveSuccess(data, false);
        toast.success("Processo atualizado.");
      } else {
        // Need to calculate maxPos differently, but we don't have all tasks here.
        // We can pass maxPos or just default to 0 and let backend sort it out, or let page do it.
        // For simplicity, passing 0, we can refine this later if needed.
        const payload = {
          tenant_id: profile!.tenant_id,
          pipeline_id: pipeline!.id,
          stage_id: taskStageId,
          title: taskTitle,
          process_number: taskProcessNumber || null,
          description: taskDesc,
          responsible_notes: taskResponsibleNotes || null,
          urgency: taskUrgency,
          position_index: 0,
          assigned_to: taskAssignedTo,
          tags: taskTags,
          phone: taskPhone,
          sector: taskSector,
          processo_1grau: taskProcesso1Grau || null,
          processo_2grau: taskProcesso2Grau || null,
          demanda: taskDemanda || null,
          andamento_1grau: taskAndamento1Grau || null,
          andamento_2grau: taskAndamento2Grau || null,
          orgao_julgador: taskOrgaoJulgador || null,
          tutela_urgencia: taskTutelaUrgencia || null,
          sentenca: taskSentenca || null,
          reu: taskReu || null,
          valor_causa: taskValorCausa ? parseFloat(taskValorCausa) : null,
          prazo_fatal: taskPrazoFatal ? new Date(taskPrazoFatal).toISOString() : null,
          liminar_deferida: taskLiminarDeferida,
          client_name: taskClientName || null,
          drive_link: taskDriveLink || null
        };

        let { data, error } = await supabase.from("process_tasks").insert(payload).select().single();

        if (error && isMissingExtendedProcessTaskColumns(error)) {
          const legacyResponse = await supabase
            .from("process_tasks")
            .insert(withoutExtendedProcessTaskColumns(payload))
            .select()
            .single();
          data = legacyResponse.data;
          error = legacyResponse.error;
        }

        if (error) throw error;

        const taskWithDrive = await maybeAutoCreateDriveFolder(data);
        await syncAgendaAfterSave(taskWithDrive);
         
        onSaveSuccess(taskWithDrive, true);
        toast.success(taskWithDrive.drive_link ? "Processo criado e repositório documental iniciado." : "Processo criado.");
      }
      onClose();
    } catch (err: any) {
      console.error("[processos][save-task]", err);
      toast.error(err?.message || "Erro ao salvar tarefa.");
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!editingTask || !confirm("Tem certeza que deseja excluir esta tarefa?")) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase.from("process_tasks").delete().eq("id", editingTask.id);
      if (error) throw error;
      await deleteAgendaTaskBySource(supabase, "process_tasks", editingTask.id);
      onDeleteSuccess(editingTask.id);
      onClose();
    } catch (err) {
      toast.error("Erro ao excluir tarefa.");
    } finally {
      setIsSaving(false);
    }
  };

  const quillModules = {
    toolbar: [
      [{ 'header': [1, 2, false] }],
      ['bold', 'italic', 'underline', 'strike', 'blockquote'],
      [{'list': 'ordered'}, {'list': 'bullet'}, {'indent': '-1'}, {'indent': '+1'}],
      ['link', 'clean']
    ],
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-[#0a0a0a]/95 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/[0.02] relative">
               <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#CCA761] to-transparent opacity-50" />
               <h2 className="text-lg font-bold text-white flex items-center gap-2">
                 {editingTask ? "Editar Processo" : "Novo Processo"}
               </h2>
               <div className="flex items-center gap-2">
                 {editingTask && (
                   <button 
                     onClick={handleDeleteTask}
                     className="text-gray-500 hover:text-red-400 p-2 rounded-lg hover:bg-white/5 transition-colors"
                     title="Excluir Tarefa"
                   >
                     <Trash2 size={20} />
                   </button>
                 )}
                  <button onClick={onClose} className="text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-lg transition-colors">
                    <X size={20} />
                  </button>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 no-scrollbar grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:col-span-3 space-y-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Título da Tarefa</label>
                  <input type="text" value={taskTitle} onChange={e => setTaskTitle(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 text-[#CCA761] rounded-lg px-4 py-3 text-lg font-bold focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors"
                    placeholder="Ex: Revisar petição de tutela" autoFocus />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><Calendar size={14} /> Número do Processo (Opcional)</span>
                      <button
                        type="button"
                        onClick={() => copyText("process_number", taskProcessNumber)}
                        className="inline-flex items-center gap-1 text-[10px] text-[#CCA761] border border-[#CCA761]/30 rounded px-2 py-0.5 hover:bg-[#CCA761]/10"
                      >
                        {copiedKey === "process_number" ? <Check size={11} /> : <Copy size={11} />}
                        Copiar
                      </button>
                    </label>
                    <input type="text" value={taskProcessNumber} onChange={e => setTaskProcessNumber(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors"
                      placeholder="Ex: 0000000-00.0000.0.00.0000" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Urgência</label>
                    <select
                      value={taskUrgency}
                      onChange={e => setTaskUrgency(e.target.value as "URGENTE" | "ATENCAO" | "ROTINA")}
                      className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors appearance-none cursor-pointer"
                    >
                      <option value="URGENTE">Urgente</option>
                      <option value="ATENCAO">Atenção</option>
                      <option value="ROTINA">Rotina</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                       <UserIcon size={14} /> Nome do Cliente
                    </label>
                    <input type="text" value={taskClientName} onChange={e => setTaskClientName(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors"
                      placeholder="Ex: João da Silva" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <GoogleDriveLogo size={14} className="h-3.5 w-3.5" />
                      Google Drive
                    </label>
                    <div className="flex gap-2">
                      <input type="text" value={taskDriveLink} onChange={e => setTaskDriveLink(e.target.value)}
                        className="flex-1 bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#4285F4]/50 placeholder-gray-700 transition-colors"
                        placeholder="Cole o link da pasta do Drive" />
                      {editingTask?.id && !taskDriveLink && (
                        <button
                          type="button"
                          onClick={handleCreateDriveFolder}
                          disabled={isCreatingDriveFolder}
                          className="flex items-center justify-center px-4 bg-[#111827] border border-[#1d4ed8]/30 hover:border-[#4285F4] hover:text-[#8ab4ff] text-[#4285F4] rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          title="Criar pasta automática no Google Drive"
                        >
                          {isCreatingDriveFolder ? <Loader2 className="w-5 h-5 animate-spin" /> : <FolderPlus className="w-5 h-5" />}
                        </button>
                      )}
                      {taskDriveLink && (
                        <a href={taskDriveLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center px-4 bg-gray-100 dark:bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#4285F4] hover:text-[#4285F4] text-gray-400 rounded-lg transition-colors" title="Abrir pasta no Drive">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        </a>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed">
                      {editingTask?.id
                        ? "Cole um link existente ou gere uma pasta automática com a integração do Google Drive do escritório."
                        : "Você pode colar um link manualmente agora. Se o escritório estiver conectado ao Google Drive, o MAYUS inicia a estrutura documental logo após salvar o processo."}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">⚖️ Processo 1º Grau</label>
                    <input type="text" value={taskProcesso1Grau} onChange={e => setTaskProcesso1Grau(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">⚖️ Processo 2º Grau</label>
                    <input type="text" value={taskProcesso2Grau} onChange={e => setTaskProcesso2Grau(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">🎯 Demanda</label>
                    <input type="text" value={taskDemanda} onChange={e => setTaskDemanda(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👇 Andamento do Processo 1º Grau</label>
                    <input type="text" value={taskAndamento1Grau} onChange={e => setTaskAndamento1Grau(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👇 Andamento do Processo 2º Grau</label>
                    <input type="text" value={taskAndamento2Grau} onChange={e => setTaskAndamento2Grau(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👨‍⚖️ Órgão julgador</label>
                    <input type="text" value={taskOrgaoJulgador} onChange={e => setTaskOrgaoJulgador(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👩‍⚖️ Tutela de urgência</label>
                    <input type="text" value={taskTutelaUrgencia} onChange={e => setTaskTutelaUrgencia(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👩‍⚖️ Sentença</label>
                    <input type="text" value={taskSentenca} onChange={e => setTaskSentenca(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">🦉 Réu</label>
                    <input type="text" value={taskReu} onChange={e => setTaskReu(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">💵 Valor da Causa</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">R$</span>
                      <input type="number" step="0.01" value={taskValorCausa} onChange={e => setTaskValorCausa(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-10 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">📅 Fatal</label>
                    <input type="date" value={taskPrazoFatal} onChange={e => setTaskPrazoFatal(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors appearance-none" style={{ colorScheme: 'dark' }} />
                  </div>

                  <div className="space-y-1.5 flex items-center mt-7 gap-3 h-full">
                    <input type="checkbox" checked={taskLiminarDeferida} onChange={e => setTaskLiminarDeferida(e.target.checked)}
                      className="w-5 h-5 bg-gray-100 dark:bg-[#1a1a1a] border border-[#2a2a2a] rounded focus:ring-[#CCA761]/50 accent-[#CCA761] cursor-pointer" id="liminar_deferida" />
                    <label htmlFor="liminar_deferida" className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer pt-0">
                      ✅ Liminar Deferida
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5 mt-6">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <AlignLeft size={14} /> Resumo
                    </label>
                    <button
                      type="button"
                      onClick={() => copyText("summary", taskDesc.replace(/<[^>]+>/g, " ").trim())}
                      className="inline-flex items-center gap-1 text-[10px] text-[#CCA761] border border-[#CCA761]/30 rounded px-2 py-0.5 hover:bg-[#CCA761]/10"
                    >
                      {copiedKey === "summary" ? <Check size={11} /> : <Copy size={11} />}
                      Copiar
                    </button>
                  </div>
                  <div className="prose prose-invert max-w-none">
                    <ReactQuill 
                      theme="snow"
                      value={taskDesc}
                      onChange={setTaskDesc}
                      modules={quillModules}
                      placeholder="Adicione informações, observações e detalhes do processo..."
                    />
                  </div>
                </div>

                <div className="space-y-1.5 mt-6">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <AlignLeft size={14} /> Anotações do Responsável
                    </label>
                    <button
                      type="button"
                      onClick={() => copyText("responsible_notes", taskResponsibleNotes)}
                      className="inline-flex items-center gap-1 text-[10px] text-[#CCA761] border border-[#CCA761]/30 rounded px-2 py-0.5 hover:bg-[#CCA761]/10"
                    >
                      {copiedKey === "responsible_notes" ? <Check size={11} /> : <Copy size={11} />}
                      Copiar
                    </button>
                  </div>
                  <textarea
                    value={taskResponsibleNotes}
                    onChange={(e) => setTaskResponsibleNotes(e.target.value)}
                    className="w-full min-h-[110px] bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors"
                    placeholder="Anotações operacionais do responsável: próximos passos, pendências e observações."
                  />
                </div>
              </div>

              <div className="space-y-6 lg:border-l lg:border-white/5 lg:pl-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <MessageCircle size={14} /> WhatsApp (Telefone)
                  </label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="text" 
                      value={taskPhone} onChange={e => setTaskPhone(e.target.value)}
                      className="flex-1 bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors"
                      placeholder="Ex: 11999999999"
                    />
                    {taskPhone && (
                      <a 
                        href={`https://wa.me/${taskPhone.replace(/\D/g, "")}`} 
                        target="_blank" rel="noopener noreferrer"
                        className="bg-[#25D366] hover:bg-[#20bd5a] text-gray-900 dark:text-white p-3 rounded-lg transition-colors flex items-center justify-center shadow-[0_0_15px_rgba(37,211,102,0.3)] shrink-0"
                        title="Abrir no WhatsApp"
                      >
                        <MessageCircle size={20} />
                      </a>
                    )}
                  </div>
                </div>

                 <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <CheckCircle2 size={14} /> Etapa Atual
                  </label>
                  <div className="relative">
                    <select 
                      value={taskStageId} onChange={e => setTaskStageId(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors appearance-none cursor-pointer"
                    >
                      {stages.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500">
                      <Plus size={14} className="rotate-45" />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <UserIcon size={14} /> Responsável
                  </label>
                  <select 
                    value={taskAssignedTo || ""} 
                    onChange={e => setTaskAssignedTo(e.target.value || null)}
                    className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="">Não atribuído</option>
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.id}>{agent.full_name || `Colaborador ${String(agent.id).slice(0, 6)}`}</option>
                    ))}
                  </select>
                </div>

                {pipeline?.sectors && pipeline.sectors.length > 0 && (
                  <div className="space-y-1.5 flex flex-col pt-2 border-t border-white/5">
                    <label className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                      <ArrowRight size={14} /> Atribuir a um Setor
                    </label>
                    <div className="relative">
                      <select 
                        value={taskSector} onChange={e => setTaskSector(e.target.value)}
                        className="w-full bg-black/50 border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors appearance-none cursor-pointer"
                      >
                        <option value="">Não atribuir (Padrão)</option>
                        {pipeline.sectors.map(s => {
                          const [name] = s.includes('|') ? s.split('|') : [s];
                          return <option key={s} value={s}>{name}</option>;
                        })}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-blue-500">
                        <ArrowRight size={14} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 flex flex-col pt-2 border-t border-white/5">
                  <div className="flex flex-col gap-1 mb-1">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <TagIcon size={14} /> Etiquetas
                    </label>
                  </div>
                  
                  {/* Selector de Etiquetas */}
                  <div className="flex flex-wrap gap-2 mb-2 p-3 bg-gray-100 dark:bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg min-h-[50px]">
                    {availableTags.length > 0 ? (
                      availableTags.map(tag => {
                        const [name, color] = tag.includes('|') ? tag.split('|') : [tag, '#CCA761'];
                        const isSelected = taskTags.includes(tag);
                        return (
                          <div key={tag} className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setTaskTags(taskTags.filter(t => t !== tag));
                                } else {
                                  setTaskTags([...taskTags, tag]);
                                }
                              }}
                              className={`flex items-center gap-1.5 px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold rounded-md transition-all ${isSelected ? 'opacity-100 scale-100' : 'opacity-70 hover:opacity-100 scale-95 hover:scale-100'}`}
                              style={isSelected ? {
                                color: color,
                                border: `1px solid ${color}`,
                                backgroundColor: '#111',
                                boxShadow: `0 0 8px ${color}30`
                              } : {
                                color: 'rgba(255, 255, 255, 0.6)',
                                border: `1px solid rgba(255, 255, 255, 0.2)`,
                                backgroundColor: 'transparent'
                              }}
                            >
                              {name}
                              {isSelected && <CheckCircle2 size={12} className="ml-0.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleStartEditTag(tag)}
                              className="w-6 h-6 rounded border border-[#CCA761]/30 text-[#CCA761] hover:bg-[#CCA761]/10 flex items-center justify-center"
                              title="Editar etiqueta"
                            >
                              <Pencil size={11} />
                            </button>
                          </div>
                        );
                      })
                    ) : (
                      <span className="text-xs text-gray-500 italic flex items-center h-full">Nenhuma etiqueta configurada neste Processo. Crie uma abaixo.</span>
                    )}
                  </div>
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                    <input
                      type="text"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      placeholder="Nova etiqueta"
                      className="bg-black/50 border border-white/10 text-white rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-600"
                    />
                    <input
                      type="color"
                      value={tagColor}
                      onChange={(e) => setTagColor(e.target.value)}
                      className="w-11 h-9 rounded-lg border border-[#2a2a2a] bg-gray-100 dark:bg-[#1a1a1a] p-1 cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={handleCreateTag}
                      className="px-3 h-9 rounded-lg bg-[#CCA761]/15 border border-[#CCA761]/30 text-[#CCA761] text-[10px] font-black uppercase tracking-widest hover:bg-[#CCA761]/25"
                    >
                      {editingTagOriginal ? "Salvar" : "Criar"}
                    </button>
                  </div>
                  {editingTagOriginal && (
                    <button
                      type="button"
                      onClick={handleCancelTagEdit}
                      className="w-full h-9 rounded-lg border border-white/15 text-gray-300 text-[10px] font-black uppercase tracking-widest hover:bg-white/5"
                    >
                      Cancelar edição da etiqueta
                    </button>
                  )}
                  <style jsx global>{`
                    /* ReactQuill Dark Mode Overrides */
                    .ql-editor {
                      color: white !important;
                      font-size: 0.875rem !important;
                      min-height: 120px;
                    }
                    .ql-toolbar.ql-snow {
                      border-color: rgba(255,255,255,0.1) !important;
                      background-color: rgba(0,0,0,0.5) !important;
                      border-top-left-radius: 0.5rem;
                      border-top-right-radius: 0.5rem;
                    }
                    .ql-container.ql-snow {
                      border-color: rgba(255,255,255,0.1) !important;
                      border-bottom-left-radius: 0.5rem;
                      border-bottom-right-radius: 0.5rem;
                      background-color: rgba(0,0,0,0.5) !important;
                    }
                    .ql-snow .ql-stroke {
                      stroke: #9ca3af !important;
                    }
                    .ql-snow .ql-fill {
                      fill: #9ca3af !important;
                    }
                    .ql-snow .ql-picker {
                      color: #9ca3af !important;
                    }
                    .ql-editor.ql-blank::before {
                      color: #4b5563 !important;
                    }
                  `}</style>
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-white/5 bg-white/[0.02] flex items-center justify-end gap-3">
              <button 
                onClick={onClose} 
                className="text-sm font-semibold text-gray-400 hover:text-white px-5 py-2.5 hover:bg-white/5 rounded-lg transition-colors"
                disabled={isSaving}
              >
                Descartar
              </button>
              <button 
                onClick={handeSaveTask} 
                disabled={isSaving} 
                className="flex items-center gap-2 bg-[#CCA761] hover:bg-[#b89552] text-black px-8 py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50 shadow-lg shadow-[#CCA761]/10"
              >
                {isSaving ? "Processando..." : (editingTask ? "Salvar Alterações" : "Criar Tarefa")}
              </button>
            </div>
        </div>
      </div>
  );
}
