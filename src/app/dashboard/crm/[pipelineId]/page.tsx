"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { 
  Plus, Settings, LayoutTemplate, List,
  Tag as TagIcon, User as UserIcon, AlignLeft, X, Trash2,
  Calendar, CheckCircle2, AlertTriangle, ArrowRight, MessageCircle
} from "lucide-react";
import { toast } from "sonner";
import { TagsInput } from "react-tag-input-component";

import WinLeadModal from "@/components/crm/WinLeadModal";
import LostLeadModal from "@/components/crm/LostLeadModal";

// Import CSS for ReactQuill
import "react-quill/dist/quill.snow.css";

// Dynamic import for ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import("react-quill"), { 
  ssr: false,
  loading: () => <div className="h-[250px] w-full bg-white/5 animate-pulse rounded-lg" />
});

type Pipeline = { id: string; name: string; description: string; tags: string[]; sectors: string[] };
type Stage = { id: string; name: string; color: string; order_index: number; is_loss: boolean; is_win: boolean };
type Profile = { id: string; full_name: string; avatar_url: string | null };
type Task = { 
  id: string; 
  stage_id: string; 
  title: string; 
  description: string; 
  position_index: number; 
  client_id: string | null; 
  value: number | null;
  assigned_to: string | null;
  tags: string[];
  created_at: string;
  motivo_perda?: string;
  phone?: string | null;
  sector?: string | null;
  data_ultima_movimentacao?: string;
};

export default function PipelinePage() {
  const { pipelineId } = useParams() as { pipelineId: string };
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useUserProfile();

  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [allPipelines, setAllPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<Profile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  const [viewMode, setViewMode] = useState<"board" | "list">("board");
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Task Form State
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDesc, setTaskDesc] = useState("");
  const [taskStageId, setTaskStageId] = useState("");
  const [taskAssignedTo, setTaskAssignedTo] = useState<string | null>(null);
  const [taskTags, setTaskTags] = useState<string[]>([]);
  const [tagColor, setTagColor] = useState<string>("#CCA761");
  const [taskPhone, setTaskPhone] = useState("");
  const [taskSector, setTaskSector] = useState("");
  
  // Pending Move State for Win/Loss
  const [pendingMove, setPendingMove] = useState<{ 
    taskId: string; 
    fromStageId: string; 
    toStageId: string; 
    toIndex: number; 
    isWin: boolean; 
    isLoss: boolean;
    taskTitle: string;
  } | null>(null);

  useEffect(() => {
    async function fetchData() {
      if (!profile?.tenant_id || !pipelineId) return;
      
      try {
        const [pipeRes, stagesRes, tasksRes, agentsRes, allPipesRes] = await Promise.all([
          supabase.from("crm_pipelines").select("*").eq("id", pipelineId).single(),
          supabase.from("crm_stages").select("*").eq("pipeline_id", pipelineId).order("order_index"),
          supabase.from("crm_tasks").select("*").eq("pipeline_id", pipelineId).order("position_index"),
          supabase.from("profiles").select("id, full_name, avatar_url").eq("tenant_id", profile.tenant_id),
          supabase.from("crm_pipelines").select("*").eq("tenant_id", profile.tenant_id).order("created_at")
        ]);

        if (pipeRes.data) setPipeline(pipeRes.data);
        if (stagesRes.data) setStages(stagesRes.data);
        if (tasksRes.data) setTasks(tasksRes.data);
        if (agentsRes.data) setAgents(agentsRes.data);
        if (allPipesRes.data) setAllPipelines(allPipesRes.data);
      } catch (err: any) {
        toast.error("Erro ao carregar dados.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [pipelineId, profile?.tenant_id, supabase]);

  const handleCreatePipeline = async () => {
    if (!profile?.tenant_id) return;
    try {
      setIsLoading(true);
      const { data: pipeline, error } = await supabase.from("crm_pipelines")
        .insert({
          tenant_id: profile.tenant_id,
          name: "Novo Funil",
          description: "Funil criado automaticamente."
        })
        .select()
        .single();
        
      if (error) throw error;
      
      const defaultStages = [
        { pipeline_id: pipeline.id, name: "Novo Lead", color: "#3b82f6", order_index: 0 },
        { pipeline_id: pipeline.id, name: "Em Negociação", color: "#fbbf24", order_index: 1 },
        { pipeline_id: pipeline.id, name: "Fechado", color: "#10b981", order_index: 2, is_win: true },
        { pipeline_id: pipeline.id, name: "Perdido", color: "#ef4444", order_index: 3, is_loss: true }
      ];
      
      await supabase.from("crm_stages").insert(defaultStages);
      
      toast.success("Novo funil criado com sucesso!");
      router.push(`/dashboard/crm/config/${pipeline.id}`);
    } catch (err: any) {
      toast.error("Erro ao criar funil.");
      setIsLoading(false);
    }
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const draggedTask = tasks.find(t => t.id === draggableId);
    if (!draggedTask) return;

    const destStage = stages.find(s => s.id === destination.droppableId);
    const sourceStage = stages.find(s => s.id === source.droppableId);

    // If moving to a Win or Loss column, stop the optimistic move and open modal
    if (destStage && (destStage.is_win || destStage.is_loss)) {
      setPendingMove({
        taskId: draggableId,
        fromStageId: source.droppableId,
        toStageId: destination.droppableId,
        toIndex: destination.index,
        isWin: destStage.is_win,
        isLoss: destStage.is_loss,
        taskTitle: draggedTask.title
      });
      return; // Do not update UI until modal is confirmed
    }

    const newTasks = Array.from(tasks);
    
    // Update local state optimistically
    const taskIndex = newTasks.findIndex(t => t.id === draggableId);
    const updatedTask = { ...newTasks[taskIndex], stage_id: destination.droppableId };
    newTasks.splice(taskIndex, 1);

    // Filter destination column tasks
    const destColumnTasks = newTasks.filter(t => t.stage_id === destination.droppableId).sort((a,b) => a.position_index - b.position_index);
    destColumnTasks.splice(destination.index, 0, updatedTask);
    
    // Update indices
    destColumnTasks.forEach((t, i) => {
      t.position_index = i;
    });

    setTasks([...newTasks.filter(t => t.stage_id !== destination.droppableId), ...destColumnTasks]);

    try {
      const nowIso = new Date().toISOString();
      await supabase.from("crm_tasks").update({ 
        stage_id: destination.droppableId,
        position_index: destination.index,
        data_ultima_movimentacao: nowIso
      }).eq("id", draggableId);
      
      // Update local task timestamp silently
      setTasks(prev => prev.map(t => t.id === draggableId ? { ...t, data_ultima_movimentacao: nowIso } : t));
    } catch (err) {
      toast.error("Erro ao mover tarefa.");
      // In a real app we would rollback the state here
    }
  };

  const handleWinSuccess = async (value: number, clientId: string) => {
    if (!pendingMove) return;
    const { taskId, toStageId, toIndex } = pendingMove;
    const nowIso = new Date().toISOString();
    
    try {
      await supabase.from("crm_tasks").update({
        stage_id: toStageId,
        position_index: toIndex,
        value: value,
        client_id: clientId,
        data_ultima_movimentacao: nowIso
      }).eq("id", taskId);
      
      setTasks(prev => {
        const list = [...prev];
        const idx = list.findIndex(t => t.id === taskId);
        if (idx !== -1) {
          list[idx] = { ...list[idx], stage_id: toStageId, value, client_id: clientId, data_ultima_movimentacao: nowIso };
        }
        return list;
      });
    } catch (err) {
      toast.error("Erro ao fechar oportunidade.");
    } finally {
      setPendingMove(null);
    }
  };

  const handleLossSuccess = async (motivo: string) => {
    if (!pendingMove) return;
    const { taskId, toStageId, toIndex } = pendingMove;
    const nowIso = new Date().toISOString();
    
    try {
      await supabase.from("crm_tasks").update({
        stage_id: toStageId,
        position_index: toIndex,
        motivo_perda: motivo,
        data_ultima_movimentacao: nowIso
      }).eq("id", taskId);
      
      setTasks(prev => {
        const list = [...prev];
        const idx = list.findIndex(t => t.id === taskId);
        if (idx !== -1) {
          list[idx] = { ...list[idx], stage_id: toStageId, motivo_perda: motivo, data_ultima_movimentacao: nowIso };
        }
        return list;
      });
    } catch (err) {
      toast.error("Erro ao registrar perda.");
    } finally {
      setPendingMove(null);
    }
  };

  const openNewTaskModal = (stageId?: string) => {
    setTaskTitle("");
    setTaskDesc("");
    setTaskStageId(stageId || (stages[0]?.id ?? ""));
    setTaskAssignedTo(null);
    setTaskTags([]);
    setTaskPhone("");
    setTaskSector("");
    setEditingTask(null);
    setIsTaskModalOpen(true);
  };

  const openEditTaskModal = (task: Task) => {
    setTaskTitle(task.title);
    setTaskDesc(task.description || "");
    setTaskStageId(task.stage_id);
    setTaskAssignedTo(task.assigned_to);
    setTaskTags(task.tags || []);
    setTaskPhone(task.phone || "");
    setTaskSector(task.sector || "");
    setEditingTask(task);
    setIsTaskModalOpen(true);
  };

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
        
        setTasks(tasks.map(t => t.id === editingTask.id ? data : t));
        toast.success("Tarefa atualizada.");
      } else {
        const maxPos = tasks.filter(t => t.stage_id === taskStageId).length;
        const { data, error } = await supabase.from("crm_tasks").insert({
          tenant_id: profile!.tenant_id,
          pipeline_id: pipelineId,
          stage_id: taskStageId,
          title: taskTitle,
          description: taskDesc,
          position_index: maxPos,
          assigned_to: taskAssignedTo,
          tags: taskTags,
          phone: taskPhone,
          sector: taskSector
        }).select().single();
        if (error) throw error;
        setTasks([...tasks, data]);
        toast.success("Tarefa criada.");
      }
      setIsTaskModalOpen(false);
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
      setTasks(tasks.filter(t => t.id !== editingTask.id));
      toast.success("Tarefa excluída.");
      setIsTaskModalOpen(false);
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

  if (isLoading && stages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-[#050505]">
        <div className="w-8 h-8 border-4 border-[#CCA761] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#050505] overflow-hidden">
      {/* Sempre monta a animação do Neon */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes neonBeam {
          0% { transform: translateX(-150px); }
          100% { transform: translateX(400px); }
        }
      `}} />
      
      {/* HEADER */}
      <header className="flex-none bg-[#0a0a0a]/90 backdrop-blur-xl border-b border-white/5 z-20">
        <div className="px-6 py-4 flex flex-col md:flex-row md:items-center justify-start gap-8">
          <div className="flex items-center gap-4">
            <div className="flex flex-col relative">
              <div 
                className="flex items-center gap-2 cursor-pointer group"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent flex items-center gap-2 transition-opacity group-hover:opacity-80">
                  {pipeline?.name || "Carregando..."}
                  <svg className={`w-5 h-5 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  <span className="text-xs bg-white/10 text-gray-300 px-2.5 py-1 rounded-full">{tasks.length}</span>
                </h1>
              </div>

              {/* Dropdown de Funis */}
              {isDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsDropdownOpen(false)}></div>
                  <div className="absolute top-10 left-0 mt-2 w-64 bg-[#111] border border-white/10 rounded-xl shadow-2xl py-2 z-50">
                    <div className="px-3 pb-2 mb-2 border-b border-white/5 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Seus Funis (Setores)
                    </div>
                    {allPipelines.map(p => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setIsDropdownOpen(false);
                          if (p.id !== pipelineId) router.push(`/dashboard/crm/${p.id}`);
                        }}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between ${p.id === pipelineId ? 'bg-[#CCA761]/10 text-[#CCA761]' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`}
                      >
                        {p.name}
                        {p.id === pipelineId && <CheckCircle2 size={14} />}
                      </button>
                    ))}
                    <div className="px-3 pt-2 mt-2 border-t border-white/5">
                      <button 
                        onClick={() => {
                          setIsDropdownOpen(false);
                          handleCreatePipeline();
                        }}
                        className="w-full text-left px-3 py-2 text-sm text-[#CCA761] hover:bg-[#CCA761]/10 transition-colors rounded-lg flex items-center gap-2 font-medium"
                      >
                        <Plus size={16} /> Criar Novo Funil (Setor)
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center gap-3 mt-1.5">
                {pipeline?.description && <p className="text-sm text-gray-500">{pipeline.description}</p>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap md:justify-start">
            <div className="flex items-center bg-[#111] border border-white/5 rounded-lg p-1">
              <button 
                onClick={() => setViewMode("board")}
                className={`p-2 rounded-md flex items-center gap-2 transition-all ${viewMode === "board" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-white hover:bg-white/5"}`}
              >
                <LayoutTemplate size={16} /> <span className="text-xs font-bold uppercase hidden sm:inline">Board</span>
              </button>
              <button 
                onClick={() => setViewMode("list")}
                className={`p-2 rounded-md flex items-center gap-2 transition-all ${viewMode === "list" ? "bg-white/10 text-white shadow-sm" : "text-gray-500 hover:text-white hover:bg-white/5"}`}
              >
                <List size={16} /> <span className="text-xs font-bold uppercase hidden sm:inline">Lista</span>
              </button>
            </div>

            <Link href={`/dashboard/crm/config/${pipelineId}`} className="flex items-center gap-2 p-2.5 bg-[#111] hover:bg-[#CCA761]/10 text-gray-400 hover:text-[#CCA761] border border-white/5 rounded-lg transition-colors" title="Configurações do Funil">
              <Settings size={18} /> <span className="text-xs font-bold hidden sm:inline">Configurar</span>
            </Link>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-hidden relative">
        {viewMode === "board" ? (
          <div className="h-full w-full overflow-x-auto overflow-y-hidden p-6 pb-2 relative" style={{ scrollbarWidth: 'thin', scrollbarColor: '#CCA76130 transparent' }}>
            {/* Feixe de Luz Mágico Horizontal */}
            <div className="absolute top-0 left-0 right-0 h-[2px] z-50 pointer-events-none opacity-80 overflow-hidden">
               <div className="h-full w-[150px] bg-gradient-to-r from-transparent via-white to-transparent blur-[1px] animate-[neonBeam_3s_ease-in-out_infinite_alternate]" style={{ boxShadow: '0 0 15px 3px #fff' }} />
            </div>

            <DragDropContext onDragEnd={onDragEnd}>
              <div className="flex items-start gap-6 h-full pb-10">
                {stages.map(stage => {
                  const stageTasks = tasks.filter(t => t.stage_id === stage.id).sort((a,b) => a.position_index - b.position_index);
                  
                  return (
                    <div key={stage.id} className="flex flex-col flex-none w-80 h-full max-h-full bg-[#090909] rounded-2xl border relative shadow-[0_12px_24px_rgba(0,0,0,0.55)] overflow-hidden transition-all duration-500" style={{ borderColor: `${stage.color}40` }}>
                      <div className="p-4 relative backdrop-blur-md flex flex-row items-center justify-between z-10 border-b border-white/10 overflow-hidden rounded-t-2xl">
                        {/* Preenchimento Glass Completo */}
                        <div className="absolute inset-0 opacity-[0.16] rounded-t-2xl" style={{ backgroundColor: stage.color }} />
                        
                        {/* Linha superior incandescente (Tarja Superior) + Feixe de Luz Mágico */}
                        <div className="absolute top-0 left-0 w-full h-[2px] bg-white opacity-90 overflow-hidden" style={{ backgroundColor: stage.color, boxShadow: `0 0 15px ${stage.color}` }}>
                           {/* Feixe de Luz Mágico Horizontal Correndo */}
                           <div className="absolute top-0 bottom-0 w-[50px] bg-gradient-to-r from-transparent via-white to-transparent blur-[1px] animate-[neonBeam_2.5s_ease-in-out_infinite_alternate]" style={{ boxShadow: '0 0 10px 2px #fff' }} />
                        </div>
                        
                        <div className="flex items-center gap-2 relative z-10 w-full justify-between">
                          <div className="flex items-center gap-3">
                            <h3 className="font-black text-white text-[11px] tracking-widest uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">{stage.name}</h3>
                            <div className="relative inline-flex items-center justify-center">
                               <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg border backdrop-blur-md relative z-10 text-white" style={{ borderColor: stage.color }}>
                                 {stageTasks.length}
                               </span>
                               <div className="absolute inset-0 rounded-lg opacity-20" style={{ backgroundColor: stage.color }} />
                            </div>
                          </div>
                          <button onClick={() => openNewTaskModal(stage.id)} className="text-gray-400 hover:text-white p-1 hover:bg-white/10 rounded-lg transition-colors"><Plus size={16} /></button>
                        </div>
                      </div>

                      <Droppable droppableId={stage.id}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`flex-1 flex flex-col gap-3.5 px-3.5 py-4 overflow-y-auto no-scrollbar transition-colors ${snapshot.isDraggingOver ? 'bg-[#151515] ring-inset ring-1 ring-white/10' : ''}`}
                          >
                            {stageTasks.map((task, index) => {
                              const assignee = agents.find(a => a.id === task.assigned_to);
                              
                              // Check 48h Idleness
                              const timeSinceMove = new Date().getTime() - new Date(task.data_ultima_movimentacao || task.created_at).getTime();
                              const isIdle = timeSinceMove > (48 * 60 * 60 * 1000); // 48 horas em ms
                              // Ociosidade só é perigosa se não estiver ganho nem perdido
                              const showIdleAlert = isIdle && !stage.is_win && !stage.is_loss;

                              return (
                                <Draggable key={task.id} draggableId={task.id} index={index}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      onClick={() => openEditTaskModal(task)}
                                      className={`group relative overflow-hidden px-4 py-4 rounded-xl border bg-white/[0.015] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_12px_rgba(0,0,0,0.25)] hover:bg-white/[0.03] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_20px_rgba(0,0,0,0.4)] cursor-grab active:cursor-grabbing transition-all duration-300 ${showIdleAlert ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)] ring-1 ring-red-500/20' : 'border-white/10'}`}
                                      style={{ ...provided.draggableProps.style }}
                                    >
                                      {showIdleAlert && (
                                         <div className="absolute top-0 right-0 px-2 py-0.5 bg-red-500/10 text-red-500 border-b border-l border-red-500/20 rounded-bl-lg text-[9px] font-black uppercase flex items-center gap-1 shadow-sm">
                                           <AlertTriangle size={10} /> Parado {Math.floor(timeSinceMove / (1000 * 60 * 60 * 24))}d
                                         </div>
                                      )}
                                      
                                      <div className="absolute top-3 bottom-3 left-0 w-[2px] shadow-[0_0_12px_currentColor] opacity-90 transition-opacity rounded-r-full group-hover:w-[3px]" style={{ backgroundColor: stage.color, color: stage.color }} />
                                      <h4 className="text-white text-[15px] font-bold tracking-wide mb-2 line-clamp-2 drop-shadow-sm group-hover:text-[#CCA761] transition-colors">{task.title}</h4>
                                      
                                      {task.description && (
                                        <div className="text-gray-400 text-xs mb-3 line-clamp-3 leading-relaxed">
                                          {task.description.replace(/(<([^>]+)>)/gi, "")}
                                        </div>
                                      )}
                                      
                                      {(task.tags?.length > 0 || task.sector) && (
                                        <div className="flex flex-wrap gap-2 mb-4">
                                          {task.sector && (() => {
                                            const [name, color] = task.sector.includes('|') ? task.sector.split('|') : [task.sector, '#60a5fa'];
                                            return (
                                              <span 
                                                className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded bg-[#111] border shadow-sm"
                                                style={{ color: color, borderColor: color, boxShadow: `0 0 5px ${color}40` }}
                                              >
                                                {name}
                                              </span>
                                            );
                                          })()}
                                          {task.tags && task.tags.slice(0, 3).map(tag => {
                                            const [name, color] = tag.includes('|') ? tag.split('|') : [tag, '#CCA761'];
                                            return (
                                              <span 
                                                key={tag} 
                                                className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded bg-[#111] border shadow-sm"
                                                style={{ color: color, borderColor: color, boxShadow: `0 0 5px ${color}40` }}
                                              >
                                                {name}
                                              </span>
                                            );
                                          })}
                                          {task.tags.length > 3 && <span className="text-[10px] text-gray-500 font-bold px-1 py-0.5 bg-white/5 rounded">+{task.tags.length - 3}</span>}
                                        </div>
                                      )}

                                      <div className="flex items-center justify-between text-[11px] text-gray-500 mt-auto pt-2 border-t border-white/5">
                                        <div className="flex items-center gap-1.5">
                                          <Calendar size={12} />
                                          {new Date(task.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                                        </div>
                                        
                                        {assignee && (
                                          <div className="flex items-center gap-1.5 bg-white/5 pl-2 pr-1 py-0.5 rounded-full border border-white/5">
                                            <span className="max-w-[60px] truncate">{assignee.full_name.split(' ')[0]}</span>
                                            {assignee.avatar_url ? (
                                              <img src={assignee.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                                            ) : (
                                              <div className="w-4 h-4 rounded-full bg-[#CCA761] flex items-center justify-center text-[10px] text-black font-bold">
                                                {assignee.full_name.charAt(0)}
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  );
                })}
                <div className="w-8 flex-none" />
              </div>
            </DragDropContext>
          </div>
        ) : (
          <div className="h-full p-6 overflow-y-auto no-scrollbar">
            <div className="max-w-6xl mx-auto bg-[#111] border border-white/5 rounded-xl overflow-hidden shadow-lg">
              <table className="w-full text-left border-collapse">
                <thead className="bg-white/5 border-b border-white/5 text-xs uppercase tracking-wider text-gray-400 font-bold">
                  <tr>
                    <th className="p-4">Tarefa</th>
                    <th className="p-4">Etapa</th>
                    <th className="p-4">Responsável</th>
                    <th className="p-4">Criação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-gray-300">
                  {tasks.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-gray-500">Nenhuma tarefa encontrada.</td></tr>
                  ) : tasks.map(task => {
                    const stage = stages.find(s => s.id === task.stage_id);
                    const assignee = agents.find(a => a.id === task.assigned_to);
                    return (
                      <tr key={task.id} onClick={() => openEditTaskModal(task)} className="hover:bg-white/5 cursor-pointer transition-colors group">
                        <td className="p-4">
                          <div className="font-semibold text-white mb-1 group-hover:text-[#CCA761] transition-colors">{task.title}</div>
                          <div className="flex gap-1.5 flex-wrap">
                             {task.sector && (() => {
                               const [name, color] = task.sector.includes('|') ? task.sector.split('|') : [task.sector, '#60a5fa'];
                               return (
                                 <span 
                                   className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#111] border shadow-sm"
                                   style={{ color: color, borderColor: color, boxShadow: `0 0 4px ${color}30` }}
                                 >
                                   {name}
                                 </span>
                               );
                             })()}
                            {task.tags?.map(tag => {
                              const [name, color] = tag.includes('|') ? tag.split('|') : [tag, '#CCA761'];
                              return (
                                <span 
                                  key={tag} 
                                  className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#111] border shadow-sm"
                                  style={{ color: color, borderColor: color, boxShadow: `0 0 4px ${color}30` }}
                                >
                                  {name}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-xs font-bold bg-[#1a1a1a] border border-[#2a2a2a]">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage?.color || "#fff" }} />
                            {stage?.name}
                          </span>
                        </td>
                        <td className="p-4">
                           {assignee ? (
                             <div className="flex items-center gap-2">
                               {assignee.avatar_url ? (
                                 <img src={assignee.avatar_url} alt="" className="w-6 h-6 rounded-full" />
                               ) : (
                                 <div className="w-6 h-6 rounded-full bg-[#CCA761] flex items-center justify-center text-[10px] text-black font-bold">
                                   {assignee.full_name.charAt(0)}
                                 </div>
                               )}
                               <span className="text-xs">{assignee.full_name}</span>
                             </div>
                           ) : <span className="text-gray-600 text-xs">-</span>}
                        </td>
                        <td className="p-4 text-xs text-gray-500">
                          {new Date(task.created_at).toLocaleDateString('pt-BR')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* TASK MODAL */}
      {isTaskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setIsTaskModalOpen(false)} />
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
                 <button onClick={() => setIsTaskModalOpen(false)} className="text-gray-500 hover:text-white bg-white/5 hover:bg-white/10 p-2 rounded-lg transition-colors">
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
                onClick={() => setIsTaskModalOpen(false)} 
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
      )}

      {/* WIN LEAD MODAL */}
      <WinLeadModal 
        isOpen={pendingMove?.isWin || false}
        onClose={() => setPendingMove(null)}
        onSuccess={handleWinSuccess}
        defaultName={pendingMove?.taskTitle}
      />

      {/* LOST LEAD MODAL */}
      <LostLeadModal 
        isOpen={pendingMove?.isLoss || false}
        onClose={() => setPendingMove(null)}
        onSuccess={handleLossSuccess}
      />
    </div>
  );
}
