import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { User as UserIcon, AlignLeft, X, Trash2, Calendar, CheckCircle2, ArrowRight, MessageCircle, Tag as TagIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Pipeline, Stage, Profile, Task } from "@/types/processos";
import "react-quill/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill"), { 
  ssr: false,
  loading: () => <div className="h-[250px] w-full bg-white/5 animate-pulse rounded-lg" />
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
  const supabase = createClient();
  const [isSaving, setIsSaving] = useState(false);

  // Task Form State
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
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
  
  // Pending Move State for Win/Loss

  // Initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (editingTask) {
        setTaskTitle(editingTask.title);
        setTaskDesc(editingTask.description || "");
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
        setTaskDesc("");
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
    }
  }, [isOpen, editingTask, defaultStageId, stages]);

  const handeSaveTask = async () => {
    if (!taskTitle.trim()) { toast.error("Título é obrigatório."); return; }
    if (!taskStageId) return;

    setIsSaving(true);
    try {
      if (editingTask) {
        const { data, error } = await supabase.from("process_tasks").update({
          title: taskTitle,
          description: taskDesc,
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
        }).eq("id", editingTask.id).select().single();
        if (error) throw error;
        
        onSaveSuccess(data, false);
        toast.success("Processo atualizado.");
      } else {
        // Need to calculate maxPos differently, but we don't have all tasks here.
        // We can pass maxPos or just default to 0 and let backend sort it out, or let page do it.
        // For simplicity, passing 0, we can refine this later if needed.
        const { data, error } = await supabase.from("process_tasks").insert({
          tenant_id: profile!.tenant_id,
          pipeline_id: pipeline!.id,
          stage_id: taskStageId,
          title: taskTitle,
          description: taskDesc,
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
        }).select().single();
        if (error) throw error;
        
        onSaveSuccess(data, true);
        toast.success("Processo criado.");
      }
      onClose();
    } catch (err) {
      toast.error("Erro ao salvar tarefa.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTask = async () => {
    if (!editingTask || !confirm("Tem certeza que deseja excluir esta tarefa?")) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase.from("process_tasks").delete().eq("id", editingTask.id);
      if (error) throw error;
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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[95vh] animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-white/5 bg-[#141414] relative">
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
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Nº do Processo</label>
                  <input type="text" value={taskTitle} onChange={e => setTaskTitle(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-[#CCA761] rounded-lg px-4 py-3 text-lg font-bold focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors"
                    placeholder="Ex: 0000000-00.0000.0.00.0000" autoFocus />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                       <UserIcon size={14} /> Nome do Cliente
                    </label>
                    <input type="text" value={taskClientName} onChange={e => setTaskClientName(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors"
                      placeholder="Ex: João da Silva" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                      <svg className="w-3.5 h-3.5 text-[#4285F4]" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 15l4.5-8h9L16 15H7zm-1.5-1l4.5-8L5.5 2 1 10l4.5 4zm6 1l-1.5 3h9l1.5-3h-9z" />
                      </svg>
                      Google Drive
                    </label>
                    <div className="flex gap-2">
                      <input type="text" value={taskDriveLink} onChange={e => setTaskDriveLink(e.target.value)}
                        className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#4285F4]/50 placeholder-gray-700 transition-colors"
                        placeholder="Cole o link da pasta do Drive" />
                      {taskDriveLink && (
                        <a href={taskDriveLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center px-4 bg-[#1a1a1a] border border-[#2a2a2a] hover:border-[#4285F4] hover:text-[#4285F4] text-gray-400 rounded-lg transition-colors" title="Abrir pasta no Drive">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">⚖️ Processo 1º Grau</label>
                    <input type="text" value={taskProcesso1Grau} onChange={e => setTaskProcesso1Grau(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">⚖️ Processo 2º Grau</label>
                    <input type="text" value={taskProcesso2Grau} onChange={e => setTaskProcesso2Grau(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">🎯 Demanda</label>
                    <input type="text" value={taskDemanda} onChange={e => setTaskDemanda(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👇 Andamento do Processo 1º Grau</label>
                    <input type="text" value={taskAndamento1Grau} onChange={e => setTaskAndamento1Grau(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👇 Andamento do Processo 2º Grau</label>
                    <input type="text" value={taskAndamento2Grau} onChange={e => setTaskAndamento2Grau(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👨‍⚖️ Órgão julgador</label>
                    <input type="text" value={taskOrgaoJulgador} onChange={e => setTaskOrgaoJulgador(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👩‍⚖️ Tutela de urgência</label>
                    <input type="text" value={taskTutelaUrgencia} onChange={e => setTaskTutelaUrgencia(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">👩‍⚖️ Sentença</label>
                    <input type="text" value={taskSentenca} onChange={e => setTaskSentenca(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">🦉 Réu</label>
                    <input type="text" value={taskReu} onChange={e => setTaskReu(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">💵 Valor da Causa</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">R$</span>
                      <input type="number" step="0.01" value={taskValorCausa} onChange={e => setTaskValorCausa(e.target.value)}
                        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-10 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">📅 Fatal</label>
                    <input type="date" value={taskPrazoFatal} onChange={e => setTaskPrazoFatal(e.target.value)}
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors appearance-none" style={{ colorScheme: 'dark' }} />
                  </div>

                  <div className="space-y-1.5 flex items-center mt-7 gap-3 h-full">
                    <input type="checkbox" checked={taskLiminarDeferida} onChange={e => setTaskLiminarDeferida(e.target.checked)}
                      className="w-5 h-5 bg-[#1a1a1a] border border-[#2a2a2a] rounded focus:ring-[#CCA761]/50 accent-[#CCA761] cursor-pointer" id="liminar_deferida" />
                    <label htmlFor="liminar_deferida" className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2 cursor-pointer pt-0">
                      ✅ Liminar Deferida
                    </label>
                  </div>
                </div>

                <div className="space-y-1.5 mt-6">
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                    <AlignLeft size={14} /> Resumo do Caso
                  </label>
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
                      className="flex-1 bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors"
                      placeholder="Ex: 11999999999"
                    />
                    {taskPhone && (
                      <a 
                        href={`https://wa.me/${taskPhone.replace(/\D/g, "")}`} 
                        target="_blank" rel="noopener noreferrer"
                        className="bg-[#25D366] hover:bg-[#20bd5a] text-white p-3 rounded-lg transition-colors flex items-center justify-center shadow-[0_0_15px_rgba(37,211,102,0.3)] shrink-0"
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
                      className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors appearance-none cursor-pointer"
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
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="">Não atribuído</option>
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.id}>{agent.full_name}</option>
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
                        className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 transition-colors appearance-none cursor-pointer"
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
                  <div className="flex flex-wrap gap-2 mb-2 p-3 bg-[#1a1a1a] border border-[#2a2a2a] rounded-lg min-h-[50px]">
                    {pipeline?.tags && pipeline.tags.length > 0 ? (
                      pipeline.tags.map(tag => {
                        const [name, color] = tag.includes('|') ? tag.split('|') : [tag, '#CCA761'];
                        const isSelected = taskTags.includes(tag);
                        return (
                          <button
                            key={tag}
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
                        );
                      })
                    ) : (
                      <span className="text-xs text-gray-500 italic flex items-center h-full">Nenhuma etiqueta configurada neste Processo. Acesse as Configurações para criar.</span>
                    )}
                  </div>
                  <style jsx global>{`
                    /* ReactQuill Dark Mode Overrides */
                    .ql-editor {
                      color: white !important;
                      font-size: 0.875rem !important;
                      min-height: 120px;
                    }
                    .ql-toolbar.ql-snow {
                      border-color: #2a2a2a !important;
                      background-color: #1a1a1a !important;
                      border-top-left-radius: 0.5rem;
                      border-top-right-radius: 0.5rem;
                    }
                    .ql-container.ql-snow {
                      border-color: #2a2a2a !important;
                      border-bottom-left-radius: 0.5rem;
                      border-bottom-right-radius: 0.5rem;
                      background-color: #1a1a1a !important;
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

            <div className="p-5 border-t border-white/5 bg-[#141414] flex items-center justify-end gap-3">
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
