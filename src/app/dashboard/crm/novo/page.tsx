"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Plus, GripVertical, Trash2, Edit2, Check } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "sonner";

interface Stage {
  id: string;
  name: string;
  color: string;
  is_loss: boolean;
  is_win: boolean;
}

const DEFAULT_STAGES: Stage[] = [
  { id: "1", name: "Novo Líder", color: "#6b7280", is_loss: false, is_win: false },
  { id: "2", name: "Qualificatória", color: "#3b82f6", is_loss: false, is_win: false },
  { id: "3", name: "Proposta Enviada", color: "#a855f7", is_loss: false, is_win: false },
  { id: "4", name: "Negociação", color: "#eab308", is_loss: false, is_win: false },
  { id: "5", name: "Oportunidade Perdida", color: "#ef4444", is_loss: true, is_win: false },
  { id: "6", name: "Oportunidade Conquistada", color: "#22c55e", is_loss: false, is_win: true },
];

export default function NovoFunilPage() {
  const router = useRouter();
  const supabase = createClient();
  const { profile } = useUserProfile();
  
  const [name, setName] = useState("Comercial");
  const [description, setDescription] = useState("Track your sales leads from initial contact to closing the deal.");
  const [stages, setStages] = useState<Stage[]>(DEFAULT_STAGES);
  const [isLoading, setIsLoading] = useState(false);

  const handleAddStage = () => {
    const newStage: Stage = {
      id: Math.random().toString(36).substring(7),
      name: "Nova Etapa",
      color: "#9ca3af",
      is_loss: false,
      is_win: false
    };
    setStages([...stages, newStage]);
  };

  const handleRemoveStage = (id: string) => {
    setStages(stages.filter(s => s.id !== id));
  };

  const updateStage = (id: string, field: keyof Stage, value: any) => {
    setStages(stages.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    if (!profile?.tenant_id) return;
    if (!name.trim()) {
      toast.error("O nome do funil é obrigatório.");
      return;
    }

    setIsLoading(true);

    try {
      // 1. Insert Pipeline
      const { data: pipeline, error: pipelineError } = await supabase
        .from("crm_pipelines")
        .insert({
          tenant_id: profile.tenant_id,
          name,
          description,
        })
        .select()
        .single();

      if (pipelineError) throw pipelineError;

      // 2. Insert Stages
      const stagesToInsert = stages.map((stage, index) => ({
        pipeline_id: pipeline.id,
        name: stage.name,
        color: stage.color,
        order_index: index,
        is_loss: stage.is_loss,
        is_win: stage.is_win,
      }));

      const { error: stagesError } = await supabase
        .from("crm_stages")
        .insert(stagesToInsert);

      if (stagesError) throw stagesError;

      toast.success("Funil criado com sucesso!");
      router.push(`/dashboard/crm/${pipeline.id}`);
      router.refresh();
    } catch (error: any) {
      console.error(error);
      toast.error("Erro ao salvar funil: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 w-full flex flex-col min-h-screen bg-[#050505]">
      {/* HEADER */}
      <header className="flex-none bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/5 sticky top-0 z-30">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/dashboard"
              className="p-2 -ml-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">
                Novo Funil (Kanban)
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">Configure as etapas do seu processo comercial</p>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={isLoading}
            className="flex items-center gap-2 bg-[#3b82f6] hover:bg-[#2563eb] text-white px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(59,130,246,0.3)]"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Save size={18} />
            )}
            Salvar alterações
          </button>
        </div>
      </header>

      {/* CONTENT */}
      <div className="flex-1 p-6 overflow-y-auto no-scrollbar">
        <div className="max-w-4xl mx-auto space-y-8">
          
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
              {stages.map((stage, index) => (
                <div 
                  key={stage.id}
                  className="group flex flex-col md:flex-row items-start md:items-center gap-4 bg-[#111] border border-white/5 rounded-xl p-3 hover:border-white/10 transition-colors"
                >
                  <div className="hidden md:flex text-gray-600 cursor-grab">
                    <GripVertical size={18} />
                  </div>

                  {/* Cor */}
                  <div className="relative">
                    <input 
                      type="color" 
                      value={stage.color}
                      onChange={e => updateStage(stage.id, "color", e.target.value)}
                      className="w-6 h-6 rounded-full cursor-pointer bg-transparent border-0 p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none [&::-webkit-color-swatch]:rounded-full"
                    />
                  </div>

                  {/* Nome da Etapa */}
                  <div className="flex-1 w-full">
                    <input 
                      type="text"
                      value={stage.name}
                      onChange={e => updateStage(stage.id, "name", e.target.value)}
                      className="w-full bg-transparent border-b border-transparent hover:border-white/10 focus:border-[#CCA761]/50 focus:outline-none text-sm text-white py-1 px-2 font-medium transition-colors"
                      placeholder="Nome da etapa"
                    />
                  </div>

                  {/* Toggles e Ações */}
                  <div className="flex items-center gap-4 w-full md:w-auto mt-2 md:mt-0 pt-2 md:pt-0 border-t border-white/5 md:border-t-0 pl-2">
                    
                    <label className="flex items-center gap-2 cursor-pointer bg-black/20 px-3 py-1.5 rounded-md border border-white/5">
                      <span className="text-xs text-gray-400 font-medium">Perdido</span>
                      <div className="relative inline-flex items-center">
                        <input 
                          type="checkbox" 
                          checked={stage.is_loss}
                          onChange={e => {
                            updateStage(stage.id, "is_loss", e.target.checked);
                            if (e.target.checked) updateStage(stage.id, "is_win", false);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#3b82f6]"></div>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer bg-black/20 px-3 py-1.5 rounded-md border border-white/5">
                      <span className="text-xs text-gray-400 font-medium">Ganho</span>
                      <div className="relative inline-flex items-center">
                        <input 
                          type="checkbox" 
                          checked={stage.is_win}
                          onChange={e => {
                            updateStage(stage.id, "is_win", e.target.checked);
                            if (e.target.checked) updateStage(stage.id, "is_loss", false);
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-[#10b981]"></div>
                      </div>
                    </label>

                    <button 
                      onClick={() => handleRemoveStage(stage.id)}
                      className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors ml-auto md:ml-2"
                      title="Excluir etapa"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {stages.length === 0 && (
              <div className="text-center py-8 bg-[#111] rounded-xl border border-dashed border-white/10 text-gray-500 text-sm">
                Nenhuma etapa definida. Adicione pelo menos uma etapa.
              </div>
            )}
          </section>

          {/* SEC 3: Agentes e Equipe */}
          <section className="space-y-4 pt-6 mt-6 border-t border-white/5">
            <h2 className="text-lg font-bold text-white mb-4">Agentes & Equipe</h2>
            <div className="space-y-4">
              <div className="bg-[#111] border border-white/5 rounded-xl p-4">
                <p className="text-sm text-gray-400">Configure quais membros da sua equipe terão acesso a este novo funil e as permissões de visibilidade.</p>
              </div>
            </div>
          </section>

          <div className="pb-20" />
        </div>
      </div>
    </div>
  );
}
