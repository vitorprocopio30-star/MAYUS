"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Save, Plus, GripVertical, Trash2, MessageCircle } from "lucide-react";
import Link from "next/link";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";

type Pipeline = {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  settings?: Record<string, boolean>;
};

interface Stage {
  id: string;
  name: string;
  color: string;
  is_loss: boolean;
  is_win: boolean;
  is_new?: boolean;
}

export default function ConfigFunilPage() {
  const router = useRouter();
  const { pipelineId } = useParams() as { pipelineId: string };
  const supabase = createClient();
  const { profile } = useUserProfile();
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [stages, setStages] = useState<Stage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [agentId, setAgentId] = useState("");

  const [pipelineTags, setPipelineTags] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#CCA761");

  const [pipelineSectors, setPipelineSectors] = useState<string[]>([]);
  const [newSectorName, setNewSectorName] = useState("");
  const [newSectorColor, setNewSectorColor] = useState("#8b5cf6");

  const [pipelineInboxes, setPipelineInboxes] = useState<string[]>([]);
  const [newInboxName, setNewInboxName] = useState("");

  const [automations, setAutomations] = useState<Record<string, boolean>>({
    auto_create: true,
    auto_assign: false,
    sync_agents: false,
    auto_resolve: false,
    auto_win: false
  });

  useEffect(() => {
    async function loadData() {
      if (!profile?.tenant_id || !pipelineId) return;
      try {
        const [pipeRes, stagesRes] = await Promise.all([
          supabase.from("crm_pipelines").select("*").eq("id", pipelineId).single(),
          supabase.from("crm_stages").select("*").eq("pipeline_id", pipelineId).order("order_index")
        ]);
        if (pipeRes.data) {
          setName(pipeRes.data.name);
          setDescription(pipeRes.data.description || "");
          if (pipeRes.data.tags) setPipelineTags(pipeRes.data.tags);
          if (pipeRes.data.sectors) setPipelineSectors(pipeRes.data.sectors);
          if (pipeRes.data.settings) {
            const { inboxes, ...autoSettings } = pipeRes.data.settings as Record<string, any>;
            if (inboxes && Array.isArray(inboxes)) setPipelineInboxes(inboxes);
            setAutomations(prev => ({ ...prev, ...autoSettings }));
          }
        }
        if (stagesRes.data) {
          setStages(stagesRes.data.map(s => ({
            id: s.id,
            name: s.name,
            color: s.color,
            is_loss: s.is_loss,
            is_win: s.is_win,
            is_new: false
          })));
        }
      } catch (err: any) {
        toast.error("Erro ao carregar configurações do funil.");
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [pipelineId, profile?.tenant_id, supabase]);

  const handleAddTag = () => {
    if (!newTagName.trim()) return;
    const tagString = `${newTagName.trim()}|${newTagColor}`;
    if (!pipelineTags.includes(tagString)) {
      setPipelineTags([...pipelineTags, tagString]);
    }
    setNewTagName("");
  };

  const handleRemoveTag = (tag: string) => {
    setPipelineTags(pipelineTags.filter(t => t !== tag));
  };

  const handleAddSector = () => {
    if (!newSectorName.trim()) return;
    const sectorString = `${newSectorName.trim()}|${newSectorColor}`;
    if (!pipelineSectors.includes(sectorString)) {
      setPipelineSectors([...pipelineSectors, sectorString]);
    }
    setNewSectorName("");
  };

  const handleAddInbox = () => {
    if (!newInboxName.trim()) return;
    if (!pipelineInboxes.includes(newInboxName.trim())) {
      setPipelineInboxes([...pipelineInboxes, newInboxName.trim()]);
    }
    setNewInboxName("");
  };

  const handleRemoveSector = (sector: string) => {
    setPipelineSectors(pipelineSectors.filter(s => s !== sector));
  };

  const handleRemoveInbox = (inbox: string) => {
    setPipelineInboxes(pipelineInboxes.filter(i => i !== inbox));
  };

  const handleAddStage = () => {
    const newStage: Stage = {
      id: Math.random().toString(36).substring(7),
      name: "Nova Etapa",
      color: "#9ca3af",
      is_loss: false,
      is_win: false,
      is_new: true
    };
    setStages([...stages, newStage]);
  };

  const handleRemoveStage = (id: string, is_new?: boolean) => {
    if (!is_new) {
      if (!confirm("Remover esta etapa apagará todas as tarefas vinculadas a ela. Tem certeza?")) return;
    }
    setStages(stages.filter(s => s.id !== id));
  };

  const updateStageData = (id: string, updates: Partial<Stage>) => {
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };
  const handleSave = async () => {
    if (!profile?.tenant_id) return;
    if (!name.trim()) { toast.error("O nome do funil é obrigatório."); return; }

    setIsSaving(true);
    try {
      // 1. Update pipeline
      const { error: pipelineError } = await supabase.from("crm_pipelines").update({
        name,
        description,
        tags: pipelineTags,
        sectors: pipelineSectors,
        settings: { ...automations, inboxes: pipelineInboxes }
      }).eq("id", pipelineId);

      if (pipelineError) throw pipelineError;

      // 2. Sync stages
      const { data: existingStages } = await supabase.from("crm_stages").select("id").eq("pipeline_id", pipelineId);
      const existingIds = existingStages?.map((s: any) => s.id) || [];
      const currentIds = stages.filter(s => !s.is_new).map(s => s.id);
      
      const idsToDelete = existingIds.filter(id => !currentIds.includes(id));
      if (idsToDelete.length > 0) {
        await supabase.from("crm_stages").delete().in("id", idsToDelete);
      }

      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        if (stage.is_new) {
          await supabase.from("crm_stages").insert({
            pipeline_id: pipelineId,
            name: stage.name,
            color: stage.color,
            order_index: i,
            is_loss: stage.is_loss,
            is_win: stage.is_win,
          });
        } else {
          await supabase.from("crm_stages").update({
            name: stage.name,
            color: stage.color,
            order_index: i,
            is_loss: stage.is_loss,
            is_win: stage.is_win,
          }).eq("id", stage.id);
        }
      }

      toast.success("Configurações salvas.");
    } catch (err: any) {
      toast.error("Erro ao salvar.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePipeline = async () => {
    if (!window.confirm("Certeza absoluta? Todas as etapas e tarefas deste funil serão deletadas para sempre.")) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase.from("crm_pipelines").delete().eq("id", pipelineId);
      if (error) throw error;
      
      toast.success("Funil excluído com sucesso.");
      router.push("/dashboard/crm");
    } catch (err: any) {
      toast.error("Erro ao excluir funil.");
      setIsSaving(false);
    }
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(stages);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setStages(items);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen bg-white dark:bg-[#050505]">
        <div className="w-8 h-8 border-4 border-[#CCA761] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 w-full flex flex-col min-h-screen bg-white dark:bg-[#050505]">
      {/* HEADER */}
      <header className="flex-none bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-30">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href={`/dashboard/crm/${pipelineId}`}
              className="p-2 -ml-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Configurações do Funil
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Configure as etapas do seu processo comercial ({name})</p>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-gradient-to-r from-[#CCA761] to-[#e3c27e] text-black hover:from-[#d1b06d] hover:to-[#f1cd8c] px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(204,167,97,0.4)] ring-1 ring-[#CCA761]/30 hover:ring-[#CCA761]/60"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              <Save size={18} />
            )}
            Salvar Alterações
          </button>
        </div>
      </header>

      {/* CONTENT */}
      <div className="flex-1 p-6 overflow-y-auto no-scrollbar">
        <div className="max-w-4xl space-y-8">
          
          {/* SEC 1: Informações Básicas */}
          <section className="space-y-4">
            <h2 className="text-lg font-bold text-white mb-6">Informações básicas</h2>
            
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">Nome do funil</label>
              <input 
                type="text" 
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-[#111] border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors"
                placeholder="Ex: Comercial, Integração, etc."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-300">Descrição</label>
              <textarea 
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                className="w-full bg-[#111] border border-white/10 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors resize-none"
                placeholder="Descreva o propósito deste funil..."
              />
            </div>
          </section>

          {/* SEC 2: Etapas / Passos */}
          <section className="space-y-4 pt-6 mt-6 border-t border-white/5">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold text-white">Passos</h2>
                <div className="bg-white/10 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {stages.length}
                </div>
              </div>
              <button 
                onClick={handleAddStage}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-md"
              >
                <Plus size={16} /> Adicionar etapa
              </button>
            </div>

            <div className="space-y-2">
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="stages-list">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                      {stages.map((stage, index) => (
                        <Draggable key={stage.id} draggableId={stage.id} index={index}>
                          {(provided, snapshot) => (
                            <div 
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              className={`group flex flex-col md:flex-row items-start md:items-center gap-4 p-4 rounded-2xl border transition-all duration-500 relative overflow-hidden shadow-lg ${
                                snapshot.isDragging 
                                  ? 'border-[#CCA761]/60 bg-gradient-to-r from-[#CCA761]/10 to-[#111] shadow-[0_0_30px_rgba(204,167,97,0.15)] ring-1 ring-[#CCA761]/20 z-50' 
                                  : 'border-white/5 bg-gradient-to-r from-[#111] to-[#0a0a0a] hover:border-white/20 hover:bg-[#151515]'
                              }`}
                            >
                              {/* Background Gradient Suave */}
                              <div className="absolute top-0 left-0 bottom-0 w-32 opacity-10 pointer-events-none" style={{ background: `linear-gradient(to right, ${stage.color}, transparent)` }} />
                              
                              {/* Linha Mágica da Etapa */}
                              <div className="absolute top-3 bottom-3 left-0 w-1.5 rounded-r-full shadow-[0_0_10px_currentColor]" style={{ backgroundColor: stage.color, color: stage.color }} />

                              <div {...provided.dragHandleProps} className="hidden md:flex text-gray-600 cursor-grab active:cursor-grabbing hover:text-white transition-colors p-1 z-10 ml-2">
                                <GripVertical size={18} />
                              </div>

                  {/* Cor */}
                  <div className="relative z-10">
                    <input 
                      type="color" 
                      value={stage.color}
                      onChange={e => updateStageData(stage.id, { color: e.target.value })}
                      className="w-7 h-7 rounded-full cursor-pointer bg-transparent border-0 p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full shadow-md"
                      style={{ boxShadow: `0 0 10px ${stage.color}80` }}
                    />
                  </div>

                  {/* Nome da Etapa */}
                  <div className="flex-1 w-full z-10">
                    <input 
                      type="text"
                      value={stage.name}
                      onChange={e => updateStageData(stage.id, { name: e.target.value })}
                      className="w-full bg-transparent border-b border-transparent hover:border-white/10 focus:border-[#CCA761]/50 focus:outline-none text-base text-gray-100 group-hover:text-white font-bold tracking-wide py-1 px-2 transition-colors placeholder:text-gray-600"
                      placeholder="Nome da etapa"
                    />
                  </div>

                  {/* Ações */}
                  <div className="flex flex-wrap items-center justify-end gap-3 w-full md:w-auto mt-2 md:mt-0 pt-3 md:pt-0 border-t border-white/5 md:border-t-0 pl-2 z-10">

                    <button 
                      onClick={() => handleRemoveStage(stage.id, stage.is_new)}
                      className="p-2.5 text-gray-500 hover:text-red-400 hover:bg-gray-200 dark:bg-black/40 border border-transparent hover:border-red-500/20 rounded-xl transition-colors ml-auto md:ml-2 shadow-sm"
                      title="Excluir etapa"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            </div>
            {stages.length === 0 && (
              <div className="text-center py-8 bg-[#111] rounded-xl border border-dashed border-white/10 text-gray-500 text-sm">
                Nenhuma etapa definida. Adicione pelo menos uma etapa.
              </div>
            )}
          </section>

          {/* SEC 3: Etiquetas do Funil */}
          <section className="space-y-4 pt-6 mt-6 border-t border-white/5">
            <h2 className="text-lg font-bold text-white mb-2">Etiquetas</h2>
            <div className="bg-[#111] border border-white/5 rounded-xl p-4">
              <p className="text-sm text-gray-400 mb-4">Crie etiquetas personalizadas que estarão disponíveis para os leads deste funil.</p>
              
              <div className="flex gap-3 mb-6">
                <input 
                  type="text" 
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  placeholder="Nome da etiqueta"
                  className="flex-1 bg-gray-200 dark:bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#CCA761]/50 transition-colors"
                  onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                />
                <input 
                  type="color" 
                  value={newTagColor}
                  onChange={e => setNewTagColor(e.target.value)}
                  className="w-10 h-[38px] rounded border border-white/10 bg-transparent p-0 cursor-pointer"
                />
                <button 
                  onClick={handleAddTag}
                  className="bg-[#CCA761]/10 text-[#CCA761] hover:bg-[#CCA761] hover:text-black px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                >
                  Adicionar
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {pipelineTags.map(tag => {
                  const [tagname, color] = tag.includes('|') ? tag.split('|') : [tag, '#CCA761'];
                  return (
                    <div 
                      key={tag}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-[#1A1A1A] border shadow-sm group"
                      style={{ borderColor: color, boxShadow: `0 0 5px ${color}40` }}
                    >
                      <span className="text-[10px] font-black uppercase tracking-widest" style={{ color }}>{tagname}</span>
                      <button onClick={() => handleRemoveTag(tag)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* SEC 3.5: Setores do Funil */}
          <section className="space-y-4 pt-6 mt-6 border-t border-white/5">
            <h2 className="text-lg font-bold text-white mb-2">Setores (Transferência)</h2>
            <div className="bg-[#111] border border-white/5 rounded-xl p-4">
              <p className="text-sm text-gray-400 mb-4">Cadastre os setores para os quais você deseja atribuir/transferir as oportunidades dentro deste funil.</p>
              
              <div className="flex gap-3 mb-6">
                <input 
                  type="text" 
                  value={newSectorName}
                  onChange={e => setNewSectorName(e.target.value)}
                  placeholder="Nome do Setor (ex: Vendas, Envio)"
                  className="flex-1 bg-gray-200 dark:bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50 transition-colors"
                  onKeyDown={e => e.key === 'Enter' && handleAddSector()}
                />
                <input 
                  type="color" 
                  value={newSectorColor}
                  onChange={e => setNewSectorColor(e.target.value)}
                  className="w-10 h-[38px] rounded border border-white/10 bg-transparent p-0 cursor-pointer"
                />
                <button 
                  onClick={handleAddSector}
                  className="bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors"
                >
                  Cadastrar Setor
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {pipelineSectors.map(sector => {
                  const [secname, color] = sector.includes('|') ? sector.split('|') : [sector, '#8b5cf6'];
                  return (
                    <div 
                      key={sector}
                      className="flex items-center gap-2 px-3 py-1.5 rounded bg-[#1A1A1A] border shadow-sm group"
                      style={{ borderColor: color, boxShadow: `0 0 5px ${color}40` }}
                    >
                      <span className="text-[11px] font-black uppercase tracking-widest" style={{ color }}>{secname}</span>
                      <button onClick={() => handleRemoveSector(sector)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
                {pipelineSectors.length === 0 && <span className="text-sm text-gray-600 italic">Nenhum setor cadastrado. Cadastre um para ativar o botão Atribuir na Tarefa.</span>}
              </div>
            </div>
          </section>

          {/* SEC 4: Caixas de entrada */}
          {false && <section className="space-y-4 pt-8 mt-8 border-t border-white/5 relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#CCA761] opacity-[0.03] blur-[100px] pointer-events-none" />
            
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-[#CCA761]/10 rounded-lg text-[#CCA761] border border-[#CCA761]/20">
                <MessageCircle size={20} />
              </div>
              <h2 className="text-xl font-bold text-white tracking-wide">Caixas de Entrada (Integração)</h2>
            </div>
            
            <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/5 rounded-2xl p-6 shadow-[0_8px_30px_rgba(0,0,0,0.5)] relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-gray-300 dark:via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              
              <p className="text-sm text-gray-400 mb-6 leading-relaxed">
                Adicione os canais de recebimento (ex: WhatsApp, Instagram) que estarão vinculados a este funil. Estes canais serão acionados automagicamente.
              </p>
              
              <div className="flex items-center gap-3 mb-6 relative">
                <input 
                  type="text" 
                  value={newInboxName}
                  onChange={e => setNewInboxName(e.target.value)}
                  placeholder="Nome do Canal (ex: WhatsApp Atendimento)"
                  className="flex-1 bg-gray-200 dark:bg-black/40 border border-[#2a2a2a] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#CCA761]/50 focus:ring-1 focus:ring-[#CCA761]/30 transition-all placeholder:text-gray-600"
                  onKeyDown={e => e.key === 'Enter' && handleAddInbox()}
                />
                <button 
                  onClick={handleAddInbox}
                  className="bg-gradient-to-r from-[#1a1a1a] to-[#222] border border-white/5 hover:border-[#CCA761]/30 hover:bg-[#CCA761]/10 text-[#CCA761] px-6 py-3 rounded-xl text-sm font-bold transition-all shadow-md shadow-black/50"
                >
                  Conectar 
                </button>
              </div>

              <div className="flex flex-wrap gap-3">
                {pipelineInboxes.map(inbox => (
                  <div key={inbox} className="inline-flex items-center gap-3 bg-gradient-to-r from-[#222] to-[#1a1a1a] text-gray-200 text-xs font-bold px-4 py-2 rounded-xl border border-white/10 shadow-lg group/item transition-all hover:bg-white/5">
                    <span className="flex items-center gap-2">
                       <span className="relative flex h-2 w-2">
                         <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                         <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500 shadow-[0_0_8px_#22c55e]"></span>
                       </span>
                       <span className="uppercase tracking-wider font-black">{inbox}</span>
                    </span>
                    <button 
                      onClick={() => handleRemoveInbox(inbox)} 
                      className="ml-2 text-gray-500 hover:text-red-400 p-1 hover:bg-gray-200 dark:bg-black/50 rounded-md transition-colors"
                      title="Deletar integração"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                
                {pipelineInboxes.length === 0 && (
                  <div className="w-full text-center py-6 border border-dashed border-[#2a2a2a] rounded-xl text-gray-500 text-sm font-medium">
                    Nenhum canal conectado ainda. Adicione uma caixa de entrada acima.
                  </div>
                )}
              </div>
            </div>
          </section>}

          {/* SEC 5: Automação */}
          {false && <section className="space-y-6 pt-8 mt-8 border-t border-white/5">
            <div>
              <h2 className="text-xl font-bold text-white tracking-wide">Automações do Funil</h2>
              <p className="text-sm text-gray-400 mt-1.5 leading-relaxed">
                Deixe o sitema trabalhar por você. <span className="text-[#CCA761] hover:text-white font-semibold cursor-pointer transition-colors border-b border-[#CCA761]/30 hover:border-white">Criar Regras Personalizadas Avançadas...</span>
              </p>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { title: "Gerar Tarefa Instantânea", desc: "Criar card automaticamente nas etapas ao receber nova conversa nas Caixas de Entrada.", field: "auto_create" },
                { title: "Atribuição Direta", desc: "Se nenhuma equipe for selecionada, atribuir ao agente menos ocupado e online agora.", field: "auto_assign" },
                { title: "Sincronização Bidirecional", desc: "Manter o agente de live chat e do card unidos automaticamente.", field: "sync_agents" },
                { title: "Encerramento Definitivo", desc: "Avançar o card para concluído/perdido quando chat for arquivado.", field: "auto_resolve" },
                { title: "Win Automático de Atendimento", desc: "Transformar card do lead em Ganho/Fechado se conversa concluir bem.", field: "auto_win" },
              ].map((auto, idx) => (
                <div key={idx} className="flex gap-4 items-start bg-[#111] hover:bg-[#151515] border border-white/5 hover:border-[#CCA761]/20 p-5 rounded-2xl transition-all shadow-md group relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCA761] opacity-0 group-hover:opacity-[0.03] blur-[30px] transition-opacity" />
                  
                  <div className="relative inline-flex items-center mt-0.5 cursor-pointer z-10 flex-shrink-0">
                    <input 
                      type="checkbox" 
                      checked={automations[auto.field] || false} 
                      onChange={e => setAutomations({ ...automations, [auto.field]: e.target.checked })}
                      className="sr-only peer" 
                    />
                    <div className="w-11 h-6 bg-gray-200 dark:bg-black/50 border border-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 peer-checked:after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#CCA761] peer-checked:to-[#e3c27e] peer-checked:border-transparent cursor-pointer shadow-inner"></div>
                  </div>
                  <div className="z-10">
                    <h4 className="text-sm font-extrabold text-gray-200 group-hover:text-[#CCA761] transition-colors">{auto.title}</h4>
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed pr-2">{auto.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>}

          {/* SEC 5: Excluir funil */}
          <section className="space-y-4 pt-8 mt-6 border-t border-white/5">
            <div>
              <h2 className="text-lg font-bold text-red-400 mb-1">Excluir funil</h2>
              <p className="text-sm text-gray-500">Depois de excluir um funil, não há como voltar atrás. Todas as tarefas e etapas serão excluídas permanentemente.</p>
            </div>
            <button 
              onClick={handleDeletePipeline}
              className="flex items-center gap-2 border border-red-500/30 text-red-500 hover:bg-red-500/10 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors"
            >
              <Trash2 size={16} /> Excluir funil
            </button>
          </section>

          <div className="pb-20" />
        </div>
      </div>
    </div>
  );
}
