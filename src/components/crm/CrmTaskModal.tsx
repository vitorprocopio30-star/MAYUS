import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { User as UserIcon, AlignLeft, X, Trash2, Calendar, CheckCircle2, ArrowRight, MessageCircle, Tag as TagIcon, Plus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Pipeline, Stage, Profile, Task } from "@/types/crm";
import "react-quill/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill"), { 
  ssr: false,
  loading: () => <div className="h-[250px] w-full bg-white/5 animate-pulse rounded-lg" />
});

interface CrmTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTask: Task | null;
  defaultStageId: string;
  pipelineId: string;
  pipeline: Pipeline | null;
  stages: Stage[];
  agents: Profile[];
  profile: any;
  onSaveSuccess: (updatedTask: Task, isNew: boolean) => void;
  onDeleteSuccess: (taskId: string) => void;
}

export default function CrmTaskModal({
  isOpen, onClose, editingTask, defaultStageId, pipelineId, pipeline, stages, agents, profile, onSaveSuccess, onDeleteSuccess
}: CrmTaskModalProps) {
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
      } else {
        setTaskTitle("");
        setTaskDesc("");
        setTaskStageId(defaultStageId || (stages[0]?.id ?? ""));
        setTaskAssignedTo(null);
        setTaskTags([]);
        setTaskPhone("");
        setTaskSector("");
      }
    }
  }, [isOpen, editingTask, defaultStageId, stages]);

  const handeSaveTask = async () => {
    if (!taskTitle.trim()) { toast.error("Título é obrigatório."); return; }
    if (!taskStageId) return;

    setIsSaving(true);
    try {
      if (editingTask) {
        const { data, error } = await supabase.from("crm_tasks").update({
          title: taskTitle,
          description: taskDesc,
          stage_id: taskStageId,
          assigned_to: taskAssignedTo,
          tags: taskTags,
          phone: taskPhone,
          sector: taskSector
        }).eq("id", editingTask.id).select().single();
        if (error) throw error;
        
        onSaveSuccess(data, false);
        toast.success("Tarefa atualizada.");
      } else {
        const { data, error } = await supabase.from("crm_tasks").insert({
          tenant_id: profile!.tenant_id,
          pipeline_id: pipelineId,
          stage_id: taskStageId,
          title: taskTitle,
          description: taskDesc,
          position_index: 0,
          assigned_to: taskAssignedTo,
          tags: taskTags,
          phone: taskPhone,
          sector: taskSector
        }).select().single();
        if (error) throw error;
        
        onSaveSuccess(data, true);
        toast.success("Tarefa criada.");
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
      const { error } = await supabase.from("crm_tasks").delete().eq("id", editingTask.id);
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
             {editingTask ? "Editar Tarefa" : "Nova Tarefa"}
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
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Título da Oportunidade</label>
                  <input 
                    type="text" 
                    value={taskTitle} onChange={e => setTaskTitle(e.target.value)}
                    className="w-full bg-[#1a1a1a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-lg font-semibold focus:outline-none focus:border-[#CCA761]/50 placeholder-gray-700 transition-colors"
                    placeholder="Ex: Empresa X - Implantação de Software"
                    autoFocus
                  />
                </div>

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
                    <AlignLeft size={14} /> Descrição Detalhada
                  </label>
                  <div className="prose prose-invert max-w-none">
                    <ReactQuill 
                      theme="snow"
                      value={taskDesc}
                      onChange={setTaskDesc}
                      modules={quillModules}
                      placeholder="Adicione informações, observações e detalhes da negociação..."
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-6 lg:border-l lg:border-white/5 lg:pl-6">
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
                      <span className="text-xs text-gray-500 italic flex items-center h-full">Nenhuma etiqueta configurada neste funil. Acesse as Configurações para criar.</span>
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
