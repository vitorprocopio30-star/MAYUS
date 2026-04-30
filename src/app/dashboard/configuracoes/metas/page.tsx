"use client";

import { useState, useEffect } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { Scale, Plus, Trash2, Edit3, Save, X, Loader2, DollarSign, FileText, Target, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

interface Goal {
  id: string;
  tenant_id: string;
  name: string;
  type: "VALOR" | "CONTRATOS";
  target_value: number;
  period: "DIARIO" | "SEMANAL" | "MENSAL" | "ANUAL";
  created_at: string;
}

export default function MetasPage() {
  const { profile, tenantId } = useUserProfile();
  const supabase = createClient();

  const [goals, setGoals] = useState<Goal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState<"VALOR"|"CONTRATOS">("CONTRATOS");
  const [draftValue, setDraftValue] = useState("");
  const [draftPeriod, setDraftPeriod] = useState<"DIARIO"|"SEMANAL"|"MENSAL"|"ANUAL">("MENSAL");

  useEffect(() => {
    if (tenantId) loadGoals();
  }, [tenantId]);

  const loadGoals = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("tenant_goals")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar metas: " + error.message);
    } else if (data) {
      setGoals(data as Goal[]);
    }
    setIsLoading(false);
  };

  const handleCreate = async () => {
    if (!draftName.trim() || !draftValue) return toast.error("Preencha todos os campos obrigatórios.");
    setIsSaving(true);
    
    const { error } = await supabase.from("tenant_goals").insert({
      tenant_id: tenantId,
      name: draftName.trim(),
      type: draftType,
      target_value: Number(draftValue),
      period: draftPeriod
    });

    if (error) {
      toast.error("Erro: " + error.message);
    } else {
      toast.success(`Meta "${draftName}" configurada!`);
      resetForm();
      loadGoals();
    }
    setIsSaving(false);
  };

  const handleUpdate = async (id: string) => {
    if (!draftName.trim() || !draftValue) return toast.error("Preencha todos os campos.");
    setIsSaving(true);

    const { error } = await supabase.from("tenant_goals").update({
      name: draftName.trim(),
      type: draftType,
      target_value: Number(draftValue),
      period: draftPeriod
    }).eq("id", id);

    if (error) toast.error("Erro ao atualizar: " + error.message);
    else {
      toast.success("Meta atualizada com sucesso!");
      resetForm();
      loadGoals();
    }
    setIsSaving(false);
  };

  const handleDelete = async (goal: Goal) => {
    if (!confirm(`Remover definitivamente a meta "${goal.name}"?`)) return;
    const { error } = await supabase.from("tenant_goals").delete().eq("id", goal.id);
    if (error) toast.error("Erro: " + error.message);
    else {
      toast.success("Meta removida.");
      loadGoals();
    }
  };

  const startEdit = (goal: Goal) => {
    setEditingId(goal.id);
    setDraftName(goal.name);
    setDraftType(goal.type);
    setDraftValue(goal.target_value.toString());
    setDraftPeriod(goal.period);
    setIsCreating(false);
  };

  const startCreate = () => {
    setIsCreating(true);
    setEditingId(null);
    setDraftName("");
    setDraftType("CONTRATOS");
    setDraftValue("");
    setDraftPeriod("MENSAL");
  };

  const resetForm = () => {
    setIsCreating(false);
    setEditingId(null);
  };

  const formatValue = (value: number, type: string) => {
    if (type === "VALOR") return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
    return `${value} Contratos`;
  };

  if (profile && profile.role !== "Administrador" && profile.role !== "admin" && profile.role !== "mayus_admin" && profile.role !== "Sócio" && profile.role !== "socio") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-200 dark:bg-black">
        <div className="text-center">
          <AlertCircle size={48} className="text-red-500 mx-auto mb-4" />
          <h2 className={`text-2xl font-bold ${cormorant.className} italic`}>Acesso Restrito</h2>
          <p className="text-gray-500 text-sm">Apenas administradores podem gerenciar as metas corporativas.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex-1 overflow-auto bg-white dark:bg-[#050505] min-h-screen text-white p-6 sm:p-10 hide-scrollbar ${montserrat.className}`}>
      <div className="max-w-4xl mx-auto">
        
        {/* BREADCRUMB */}
        <Link href="/dashboard/configuracoes" className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2 hover:text-white transition-colors mb-6 w-max">
          <ChevronLeft size={14} /> Voltar ao Senso Estratégico
        </Link>

        {/* HEADER */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-tr from-[#10B981]/30 to-transparent flex items-center justify-center rounded-2xl border border-[#10B981]/20">
              <Scale size={28} className="text-[#10B981]" />
            </div>
            <div>
              <h1 className={`text-3xl font-bold tracking-wider uppercase text-white ${cormorant.className} drop-shadow-md`}>
                Metas Jurídicas
              </h1>
              <p className="text-gray-400 text-sm tracking-widest mt-1">Defina objetivos e acompanhe o crescimento operacional</p>
            </div>
          </div>

          <button 
            onClick={startCreate}
            disabled={isCreating}
            className="flex items-center gap-2 px-5 py-3 bg-[#10B981] text-black rounded-xl font-black uppercase text-[10px] tracking-widest shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:scale-105 transition-transform disabled:opacity-50"
          >
            <Plus size={16} /> Novo Alvo
          </button>
        </div>

        {/* FORMULÁRIO */}
        {(isCreating || editingId) && (
          <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-[#10B981]/20 p-6 rounded-2xl shadow-xl mb-8 animate-in slide-in-from-top-4 duration-500">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <Target size={18} className="text-[#10B981]" />
                {editingId ? "Editar Meta" : "Nova Meta do Escritório"}
              </h3>
              <button onClick={resetForm} className="text-gray-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-[#10B981] mb-2 block">Códinome do Objetivo</label>
                <input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="Ex: Faturamento Mensal, Fechamento de Ouro"
                  className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#10B981]/50 placeholder:text-gray-600 transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-[#10B981] mb-2 block">Amplitude do Desafio (Período)</label>
                <select
                  value={draftPeriod}
                  onChange={(e) => setDraftPeriod(e.target.value as any)}
                  className="w-full bg-[#111] border border-white/10 rounded-lg px-4 py-3 text-sm text-white focus:outline-none focus:border-[#10B981]/50 transition-colors cursor-pointer"
                >
                  <option value="DIARIO">Desafio Diário (24h)</option>
                  <option value="SEMANAL">Sprint Semanal</option>
                  <option value="MENSAL">Fechamento Mensal</option>
                  <option value="ANUAL">Meta Anual (Global)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
               <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[#10B981] mb-2 block">Natureza do KPI</label>
                  <div className="flex gap-2">
                     <button onClick={() => setDraftType('CONTRATOS')} className={`flex-1 py-3 rounded-lg border font-bold text-xs flex items-center justify-center gap-2 transition-all ${draftType === 'CONTRATOS' ? 'bg-[#10B981]/10 border-[#10B981] text-[#10B981]' : 'bg-[#111] border-white/10 text-gray-500'}`}>
                        <FileText size={16} /> Por Contratos
                     </button>
                     <button onClick={() => setDraftType('VALOR')} className={`flex-1 py-3 rounded-lg border font-bold text-xs flex items-center justify-center gap-2 transition-all ${draftType === 'VALOR' ? 'bg-[#10B981]/10 border-[#10B981] text-[#10B981]' : 'bg-[#111] border-white/10 text-gray-500'}`}>
                        <DollarSign size={16} /> Valor Financeiro
                     </button>
                  </div>
               </div>
               <div>
                 <label className="text-[10px] font-black uppercase tracking-widest text-[#10B981] mb-2 block">Valor Alvo do Desafio</label>
                 <div className="relative">
                    {draftType === 'VALOR' && <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">R$</span>}
                    <input
                      type="number"
                      value={draftValue}
                      onChange={(e) => setDraftValue(e.target.value)}
                      placeholder={draftType === 'VALOR' ? "100000" : "50"}
                      className={`w-full bg-[#111] border border-white/10 rounded-lg py-3 text-sm text-white focus:outline-none focus:border-[#10B981]/50 placeholder:text-gray-600 font-mono transition-colors ${draftType === 'VALOR' ? 'pl-10 pr-4' : 'px-4'}`}
                    />
                 </div>
               </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
              <button onClick={resetForm} className="text-xs font-bold px-4 py-2 text-gray-400 hover:text-white">
                Cancelar
              </button>
              <button
                onClick={() => editingId ? handleUpdate(editingId) : handleCreate()}
                disabled={isSaving}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#10B981] text-black rounded-lg font-black uppercase text-[10px] tracking-widest hover:bg-white transition-all disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {editingId ? "Atualizar Alvo" : "Firmar Nova Meta"}
              </button>
            </div>
          </div>
        )}

        {/* LISTA */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 opacity-30">
              <Loader2 className="animate-spin" size={32} />
            </div>
          ) : goals.length === 0 ? (
            <div className="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-white/5 p-10 rounded-2xl shadow-xl text-center">
              <div className="w-20 h-20 bg-[#10B981]/10 border border-[#10B981]/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Target size={36} className="text-[#10B981] opacity-50" />
              </div>
              <h3 className="text-xl font-bold mb-2">Construa o Império</h3>
              <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">O motor base precisa de parâmetros. Adicione o primeiro alvo financeiro ou de crescimento para que o sistema alinhe as estatísticas.</p>
              <button onClick={startCreate} className="bg-[#10B981] text-black px-6 py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:scale-105 transition-transform">
                <Plus size={14} className="inline mr-2" /> Definir Primeiro Alvo Operacional
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {goals.map((goal) => (
                 <div key={goal.id} className="group relative bg-[#0C0C0C] border border-white/5 p-6 rounded-2xl hover:border-[#10B981]/30 transition-all overflow-hidden flex flex-col justify-between">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/[0.03] to-transparent rounded-bl-full pointer-events-none" />
                    
                    <div>
                       <div className="flex items-start justify-between mb-3 relative z-10">
                          <h4 className="font-bold text-white text-lg pr-4 line-clamp-2 leading-tight">{goal.name}</h4>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity absolute right-0 top-0 bg-[#0C0C0C] pl-2">
                             <button onClick={() => startEdit(goal)} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-md text-gray-400 hover:text-white transition-colors"><Edit3 size={14} /></button>
                             <button onClick={() => handleDelete(goal)} className="p-1.5 bg-white/5 hover:bg-red-500/20 rounded-md text-gray-400 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                          </div>
                       </div>
                       <div className="flex gap-2 mb-6">
                          <span className="text-[9px] bg-[#10B981]/10 text-[#10B981] px-2 py-0.5 rounded border border-[#10B981]/20 uppercase tracking-widest font-black flex items-center gap-1">
                             {goal.type === 'VALOR' ? <DollarSign size={10} /> : <FileText size={10} />}
                             {goal.type}
                          </span>
                          <span className="text-[9px] bg-white/5 text-gray-400 px-2 py-0.5 rounded border border-white/10 uppercase tracking-widest font-black">
                             {goal.period}
                          </span>
                       </div>
                    </div>
                    
                    <div className="mt-auto">
                       <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">MÉTRICA ALVO</p>
                       <p className="text-2xl font-black text-white font-mono tracking-tight">{formatValue(goal.target_value, goal.type)}</p>
                    </div>
                 </div>
               ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
