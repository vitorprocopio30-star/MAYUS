"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Plus, GripVertical, Trash2 } from "lucide-react";
import Link from "next/link";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";

interface Column {
  status: string;
  title: string;
  color: string;
}

interface MarketingKanbanConfig {
  name: string;
  description: string;
  columns: Column[];
  tags: string[];
  sectors: string[];
}

export default function ConfigMarketingKanbanPage() {
  const router = useRouter();
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [columns, setColumns] = useState<Column[]>([]);
  
  const [pipelineTags, setPipelineTags] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#CCA761");

  const [pipelineSectors, setPipelineSectors] = useState<string[]>([]);
  const [newSectorName, setNewSectorName] = useState("");
  const [newSectorColor, setNewSectorColor] = useState("#8b5cf6");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const defaultCols = [
      { status: "draft", title: "Rascunho", color: "#71717a" },
      { status: "approved", title: "Aprovado", color: "#34d399" },
      { status: "published", title: "Publicado", color: "#CCA761" },
      { status: "rejected", title: "Recusado", color: "#ef4444" },
    ];
    
    try {
      const savedConfig = localStorage.getItem("mayus_marketing_kanban_config");
      if (savedConfig) {
        const config: MarketingKanbanConfig = JSON.parse(savedConfig);
        setName(config.name || "COMERCIAL");
        setDescription(config.description || "funil de vendas");
        setColumns(config.columns?.length ? config.columns : defaultCols);
        setPipelineTags(config.tags || []);
        setPipelineSectors(config.sectors || []);
      } else {
        // Fallback for old columns saving
        const oldCols = localStorage.getItem("mayus_marketing_columns");
        setName("COMERCIAL");
        setDescription("funil de vendas");
        setColumns(oldCols ? JSON.parse(oldCols) : defaultCols);
      }
    } catch {
      setName("COMERCIAL");
      setDescription("funil de vendas");
      setColumns(defaultCols);
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  const handleRemoveSector = (sector: string) => {
    setPipelineSectors(pipelineSectors.filter(s => s !== sector));
  };

  const handleAddColumn = () => {
    const newCol: Column = {
      status: `custom_${Math.random().toString(36).substring(7)}`,
      title: "Nova Etapa",
      color: "#9ca3af",
    };
    setColumns([...columns, newCol]);
  };

  const handleRemoveColumn = (status: string) => {
    if (!confirm("Tem certeza que deseja remover esta etapa?")) return;
    setColumns(columns.filter(c => c.status !== status));
  };

  const updateColumnData = (status: string, updates: Partial<Column>) => {
    setColumns(prev => prev.map(c => c.status === status ? { ...c, ...updates } : c));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const config: MarketingKanbanConfig = {
        name,
        description,
        columns,
        tags: pipelineTags,
        sectors: pipelineSectors
      };
      localStorage.setItem("mayus_marketing_kanban_config", JSON.stringify(config));
      // Save just columns for backward compatibility in Kanban component
      localStorage.setItem("mayus_marketing_columns", JSON.stringify(columns));
      toast.success("Configurações do Marketing salvas com sucesso!");
      router.push("/dashboard/marketing/kanban");
    } catch (err: any) {
      toast.error("Erro ao salvar.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePipeline = () => {
    if (!window.confirm("Certeza absoluta? Todas as etapas e tarefas deste funil serão deletadas para sempre.")) return;
    setIsSaving(true);
    try {
      localStorage.removeItem("mayus_marketing_kanban_config");
      localStorage.removeItem("mayus_marketing_columns");
      toast.success("Funil excluído com sucesso.");
      router.push("/dashboard/marketing");
    } catch (err: any) {
      toast.error("Erro ao excluir funil.");
      setIsSaving(false);
    }
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(columns);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setColumns(items);
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
              href={`/dashboard/marketing/kanban`}
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
                  {columns.length}
                </div>
              </div>
              <button 
                onClick={handleAddColumn}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-md"
              >
                <Plus size={16} /> Adicionar etapa
              </button>
            </div>

            <div className="space-y-2">
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="columns-list">
                  {(provided) => (
                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                      {columns.map((col, index) => (
                        <Draggable key={col.status} draggableId={col.status} index={index}>
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
                              <div className="absolute top-0 left-0 bottom-0 w-32 opacity-10 pointer-events-none" style={{ background: `linear-gradient(to right, ${col.color}, transparent)` }} />
                              
                              {/* Linha Mágica da Etapa */}
                              <div className="absolute top-3 bottom-3 left-0 w-1.5 rounded-r-full shadow-[0_0_10px_currentColor]" style={{ backgroundColor: col.color, color: col.color }} />

                              <div {...provided.dragHandleProps} className="hidden md:flex text-gray-600 cursor-grab active:cursor-grabbing hover:text-white transition-colors p-1 z-10 ml-2">
                                <GripVertical size={18} />
                              </div>

                              {/* Cor */}
                              <div className="relative z-10">
                                <input 
                                  type="color" 
                                  value={col.color}
                                  onChange={e => updateColumnData(col.status, { color: e.target.value })}
                                  className="w-7 h-7 rounded-full cursor-pointer bg-transparent border-0 p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full shadow-md"
                                  style={{ boxShadow: `0 0 10px ${col.color}80` }}
                                />
                              </div>

                              {/* Nome da Etapa */}
                              <div className="flex-1 w-full z-10">
                                <input 
                                  type="text"
                                  value={col.title}
                                  onChange={e => updateColumnData(col.status, { title: e.target.value })}
                                  className="w-full bg-transparent border-b border-transparent hover:border-white/10 focus:border-[#CCA761]/50 focus:outline-none text-base text-gray-100 group-hover:text-white font-bold tracking-wide py-1 px-2 transition-colors placeholder:text-gray-600"
                                  placeholder="Nome da etapa"
                                />
                              </div>

                              {/* Ações */}
                              <div className="flex flex-wrap items-center justify-end gap-3 w-full md:w-auto mt-2 md:mt-0 pt-3 md:pt-0 border-t border-white/5 md:border-t-0 pl-2 z-10">

                                <button 
                                  onClick={() => handleRemoveColumn(col.status)}
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
            {columns.length === 0 && (
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
