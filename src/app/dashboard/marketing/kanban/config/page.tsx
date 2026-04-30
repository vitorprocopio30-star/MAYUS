"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Plus, GripVertical, Trash2 } from "lucide-react";
import Link from "next/link";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { toast } from "sonner";
import { loadLocalMarketingState, saveLocalMarketingState } from "@/lib/marketing/local-persistence";

interface Column {
  status: string;
  title: string;
  color: string;
}

export default function ConfigMarketingKanbanPage() {
  const router = useRouter();
  
  const [columns, setColumns] = useState<Column[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const state = loadLocalMarketingState();
    // Em um cenário real, as colunas viriam de uma configuração. 
    // Como estão hardcoded no page.tsx, vamos permitir editar uma cópia local.
    // Para simplificar, vamos usar as colunas padrão se não houver no storage.
    const defaultCols = [
      { status: "draft", title: "Rascunho", color: "#71717a" },
      { status: "approved", title: "Aprovado", color: "#34d399" },
      { status: "published", title: "Publicado", color: "#CCA761" },
      { status: "rejected", title: "Recusado", color: "#ef4444" },
    ];
    
    // Tenta carregar colunas personalizadas do localStorage se existirem
    const savedCols = localStorage.getItem("mayus_marketing_columns");
    setColumns(savedCols ? JSON.parse(savedCols) : defaultCols);
    setIsLoading(false);
  }, []);

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
      localStorage.setItem("mayus_marketing_columns", JSON.stringify(columns));
      toast.success("Configurações do Marketing salvas com sucesso!");
      router.push("/dashboard/marketing/kanban");
    } catch (err: any) {
      toast.error("Erro ao salvar.");
    } finally {
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
      <div className="flex-1 flex items-center justify-center min-h-screen bg-[#050505]">
        <div className="w-8 h-8 border-4 border-[#CCA761] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 w-full flex flex-col min-h-screen bg-[#050505]">
      {/* HEADER */}
      <header className="flex-none bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-30">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/dashboard/marketing/kanban"
              className="p-2 -ml-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-3xl font-cormorant italic text-[#CCA761] drop-shadow-[0_0_15px_rgba(204,167,97,0.2)]">
                Configuração do Marketing
              </h1>
              <div className="mt-1.5 h-[1px] w-full bg-gradient-to-r from-[#CCA761]/40 to-transparent" />
              <p className="text-[9px] font-black tracking-[0.2em] uppercase text-[#CCA761]/40 mt-1.5">Personalize as etapas e o design do seu fluxo editorial</p>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-[#CCA761] text-black hover:bg-[#d1b06d] px-6 py-2.5 rounded-xl text-sm font-bold font-montserrat transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(204,167,97,0.3)]"
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
          
          <section className="space-y-4">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold font-montserrat text-white">Etapas do Fluxo</h2>
              <button 
                onClick={handleAddColumn}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-md"
              >
                <Plus size={16} /> Adicionar etapa
              </button>
            </div>

            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="marketing-columns">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                    {columns.map((col, index) => (
                      <Draggable key={col.status} draggableId={col.status} index={index}>
                        {(provided, snapshot) => (
                          <div 
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            className={`flex items-center gap-4 p-4 rounded-2xl border ${
                              snapshot.isDragging ? 'border-[#CCA761] bg-[#111]' : 'border-white/5 bg-[#111]/50'
                            }`}
                          >
                            <div {...provided.dragHandleProps} className="text-gray-600">
                              <GripVertical size={18} />
                            </div>

                            <input 
                              type="color" 
                              value={col.color}
                              onChange={e => updateColumnData(col.status, { color: e.target.value })}
                              className="w-8 h-8 rounded-full cursor-pointer bg-transparent border-0 p-0"
                            />

                            <input 
                              type="text"
                              value={col.title}
                              onChange={e => updateColumnData(col.status, { title: e.target.value })}
                              className="flex-1 bg-transparent border-b border-transparent focus:border-[#CCA761] focus:outline-none text-white font-bold font-montserrat"
                            />

                            <button 
                              onClick={() => handleRemoveColumn(col.status)}
                              className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </section>
        </div>
      </div>
    </div>
  );
}
