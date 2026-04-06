"use client";

import { useState, useEffect } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ArrowLeft, Save, Briefcase, ChevronRight, Plus, Trash2, Calendar, Target, DollarSign, Image as ImageIcon, CheckCircle, TrendingUp, Users, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

type CareerPlan = {
  id: string;
  name: string;
  type: string; // Categoria Customizada (Ex: Closer, SDR, Pós-Venda)
  unit: string; // Símbolo da Unidade (R$, CTR, AGD, etc)
  metricType: "currency" | "numeric";
  salary: number | string;
  monthlyGoal: number | string;
  minSalesForLevel: number | string;
  commissionType?: "fixed" | "percentage";
  brackets: CommissionBracket[];
};

type CommissionBracket = {
  id: string;
  minSales: number | string;
  commissionValue: number | string;
};

export default function ConfigComercialPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  
  const [progressionType, setProgressionType] = useState("Por Meses Batendo a Meta");
  const [monthsPromo, setMonthsPromo] = useState("4");
  const [enableEvolution, setEnableEvolution] = useState(true);
  const [companyName, setCompanyName] = useState("Dutra Advocacia");

  const [plans, setPlans] = useState<CareerPlan[]>([
    {
      id: "p1", name: "JUNIOR", type: "Closer", unit: "R$", metricType: "currency", salary: 2000, monthlyGoal: 15000, minSalesForLevel: 0,
      brackets: [{ id: "b1", minSales: 1000, commissionValue: 80 }, { id: "b2", minSales: 10000, commissionValue: 100 }]
    },
    {
      id: "p4", name: "SDR JUNIOR", type: "SDR", unit: "AGD", metricType: "numeric", salary: 1500, monthlyGoal: 30, minSalesForLevel: 0,
      brackets: [{ id: "b7", minSales: 1, commissionValue: 30 }]
    }
  ]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPlans = localStorage.getItem("MTO_COMMERCIAL_PLANS");
      if (savedPlans) {
        try { setPlans(JSON.parse(savedPlans)); } catch(e){}
      }
      const savedGeneral = localStorage.getItem("MTO_COMMERCIAL_GENERAL");
      if (savedGeneral) {
        try { 
          const data = JSON.parse(savedGeneral);
          if (data.companyName) setCompanyName(data.companyName);
          if (data.progressionType) setProgressionType(data.progressionType);
          if (data.monthsPromo) setMonthsPromo(data.monthsPromo);
          if (data.enableEvolution !== undefined) setEnableEvolution(data.enableEvolution);
        } catch(e){}
      }
    }
  }, []);

  const [activePlanId, setActivePlanId] = useState(plans[0]?.id || "");

  const activePlan = plans.find(p => p.id === activePlanId);

  const handleCreatePlan = (typeName?: string) => {
    const finalType = typeName || prompt("Nome da Nova Categoria (ex: Pós-Venda, Sucesso):") || "Nova Categoria";
    const newId = Math.random().toString(36).substr(2, 9);
    setPlans([...plans, {
      id: newId,
      name: `NOVO NÍVEL`,
      type: finalType,
      unit: "R$",
      metricType: "currency",
      salary: 1500,
      monthlyGoal: 10,
      minSalesForLevel: 10,
      commissionType: "fixed",
      brackets: [{ id: Math.random().toString(36), minSales: 1, commissionValue: 50 }]
    }]);
    setActivePlanId(newId);
  };

  const handleUpdateActivePlan = (field: keyof CareerPlan, value: any) => {
    setPlans(plans.map(p => p.id === activePlanId ? { ...p, [field]: value } : p));
  };

  const handleDeletePlan = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if(plans.length <= 1) return toast.error("Você precisa de pelo menos 1 plano configurado.");
    const filtered = plans.filter(p => p.id !== id);
    setPlans(filtered);
    if(activePlanId === id) setActivePlanId(filtered[0]?.id || "");
  };

  const handleAddBracket = () => {
    if(!activePlan) return;
    const newBrackets = [...activePlan.brackets, { id: Math.random().toString(36), minSales: 1, commissionValue: 0 }];
    handleUpdateActivePlan("brackets", newBrackets);
  };

  const handleUpdateBracket = (bracketId: string, field: keyof CommissionBracket, value: number | string) => {
    if(!activePlan) return;
    const newBrackets = activePlan.brackets.map(b => b.id === bracketId ? { ...b, [field]: value } : b);
    handleUpdateActivePlan("brackets", newBrackets);
  };

  const handleDeleteBracket = (bracketId: string) => {
    if(!activePlan) return;
    const newBrackets = activePlan.brackets.filter(b => b.id !== bracketId);
    handleUpdateActivePlan("brackets", newBrackets);
  };

  const handleSave = async () => {
    setIsLoading(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("MTO_COMMERCIAL_PLANS", JSON.stringify(plans));
      localStorage.setItem("MTO_COMMERCIAL_GENERAL", JSON.stringify({
        companyName, progressionType, monthsPromo, enableEvolution
      }));
    }
    setTimeout(() => {
      setIsLoading(false);
      toast.success("Configurações de metas salvas com sucesso!");
    }, 1000);
  };

  // Agrupamento dinâmico dos planos por categoria
  const planCategories = Array.from(new Set(plans.map(p => p.type)));

  const getCategoryColor = (type: string) => {
    const t = type.toLowerCase();
    if(t === 'closer' || t === 'vendas') return 'text-[#4ade80]';
    if(t === 'sdr' || t === 'agendamentos') return 'text-[#22d3ee]';
    return 'text-[#CCA761]';
  };

  return (
    <div className={"w-full max-w-[1400px] mx-auto space-y-8 pb-24 animate-fade-in-up " + montserrat.className}>
      
      {/* Header Premium Global */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 pb-6 border-b border-[#CCA761]/20 relative z-40">
        <div className="flex items-start gap-4">
          <button onClick={() => router.back()} className="p-2.5 bg-black/40 hover:bg-white/5 border border-[#CCA761]/30 hover:border-[#CCA761] rounded-xl transition-colors mt-2">
            <ArrowLeft size={20} className="text-[#CCA761]" />
          </button>
          <div className="flex flex-col">
            <h1 className={`text-4xl lg:text-5xl text-[#CCA761] font-bold tracking-tight ${cormorant.className} italic drop-shadow-[0_0_15px_rgba(204,167,97,0.3)] leading-none mb-1`}>
              Metas & <span className="text-white">Performance</span>
            </h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.3em]">CONFIGURE INDICADORES E PLANOS DE CARREIRA</p>
          </div>
        </div>

        <button 
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center gap-2 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#0a0a0a] px-8 py-3.5 rounded-xl font-[900] text-[11px] uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_20px_rgba(204,167,97,0.3)] disabled:opacity-50"
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {isLoading ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}
        </button>
      </div>

      <div className="space-y-8 animate-fade-in">
          {/* Regras de Progressão */}
          <div className="glass-card-premium p-6 lg:p-8 rounded-2xl border border-[#CCA761]/20 bg-gradient-to-br from-[#111111]/80 to-[#050505]/90 backdrop-blur-xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#CCA761]/5 rounded-bl-full pointer-events-none" />
            
            <h2 className="text-[10px] text-[#CCA761] font-black uppercase tracking-[0.3em] mb-8 flex items-center gap-2">
              <TrendingUp size={14} /> Regras de Progressão & Evolução
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
               <div className="space-y-2">
                 <label className="text-[9px] text-gray-500 uppercase tracking-widest font-black ml-1">Critério de Promoção</label>
                 <div className="relative">
                   <Target size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-700" />
                   <select 
                      value={progressionType} 
                      onChange={e => setProgressionType(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#222] text-white pl-12 pr-4 py-4 rounded-xl text-sm font-bold focus:border-[#CCA761]/50 focus:outline-none transition-all appearance-none"
                   >
                     <option>Por Meses Batendo a Meta</option>
                     <option>Por Volume Financeiro Agregado</option>
                     <option>Manual (Apenas Adm)</option>
                   </select>
                   <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-700 rotate-90" />
                 </div>
               </div>

               <div className="space-y-2">
                 <label className="text-[9px] text-gray-500 uppercase tracking-widest font-black ml-1">Consistência Necessária (Meses)</label>
                 <div className="relative">
                   <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-700" />
                   <input 
                      type="number" 
                      value={monthsPromo} 
                      onChange={e => setMonthsPromo(e.target.value)}
                      className="w-full bg-[#0a0a0a] border border-[#222] text-white pl-12 pr-4 py-4 rounded-xl text-sm font-bold focus:border-[#CCA761]/50 focus:outline-none transition-all" 
                   />
                 </div>
               </div>

               <div className="flex items-center lg:pt-6">
                 <label className="flex items-center gap-3 cursor-pointer group bg-black/20 p-4 rounded-xl border border-white/5 hover:border-[#CCA761]/30 transition-all w-full">
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${enableEvolution ? 'bg-[#CCA761] border-[#CCA761] shadow-[0_0_10px_rgba(204,167,97,0.3)]' : 'border-gray-600 bg-transparent'}`}>
                       {enableEvolution && <CheckCircle size={14} className="text-[#0a0a0a] stroke-[3]" />}
                    </div>
                    <input type="checkbox" className="hidden" checked={enableEvolution} onChange={() => setEnableEvolution(!enableEvolution)} />
                    <div className="flex flex-col">
                      <span className="text-[10px] text-gray-300 group-hover:text-white uppercase tracking-widest font-black transition-colors">Modo Gamificação Ativo</span>
                      <span className="text-[8px] text-gray-600 font-bold uppercase tracking-tight">Evolução visual no painel</span>
                    </div>
                 </label>
               </div>
            </div>
          </div>

          {/* Interface de Categorias Dinâmicas */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Esquerda: Agrupamentos Flexíveis */}
            <div className="lg:col-span-3 space-y-6">
              
              {planCategories.map(cat => (
                <div key={cat} className="space-y-3">
                  <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2 ${getCategoryColor(cat)}`}>
                    <Briefcase size={14} /> {cat}
                  </h3>
                  {plans.filter(p => p.type === cat).map(p => (
                    <div 
                      key={p.id}
                      onClick={() => setActivePlanId(p.id)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer relative group flex justify-between items-center ${activePlanId === p.id ? 'bg-[#CCA761]/10 border-[#CCA761]/50 shadow-[0_0_15px_rgba(204,167,97,0.1)]' : 'bg-[#0a0a0a] border-[#222] hover:border-white/20'}`}
                    >
                      <div className="flex flex-col">
                        <span className={`text-xs font-black uppercase tracking-widest mb-1 ${activePlanId === p.id ? 'text-white' : 'text-gray-300'}`}>{p.name}</span>
                        <span className="text-[9px] text-gray-500 font-medium">Meta: {p.monthlyGoal} {p.unit} • Sal: R$ {p.salary}</span>
                      </div>
                      <button onClick={(e) => handleDeletePlan(p.id, e)} className="text-gray-600 hover:text-red-500 transition-colors p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button 
                    onClick={() => handleCreatePlan(cat)}
                    className="w-full py-2.5 bg-white/5 border border-white/5 hover:border-white/20 rounded-xl flex items-center justify-center gap-2 transition-all group"
                  >
                    <Plus size={12} className="text-gray-500 group-hover:rotate-90 transition-transform" />
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest italic">Novo Nível de {cat}</span>
                  </button>
               </div>
              ))}

              <button 
                onClick={() => handleCreatePlan()}
                className="w-full py-4 mt-6 bg-[#CCA761]/5 border-2 border-dashed border-[#CCA761]/30 hover:border-[#CCA761] hover:bg-[#CCA761]/10 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all text-[#CCA761]"
              >
                <Plus size={20} />
                <span className="text-[10px] font-black uppercase tracking-widest text-center">Criar Novo Tipo<br/>de Meta Personalizada</span>
              </button>
            </div>

            {/* Direita: Editor de Planos */}
            {activePlan && (
              <div className="lg:col-span-9">
                <div className="glass-card-premium p-6 lg:p-8 rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-xl relative min-h-full">
                  <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
                     <div className="flex items-center gap-4">
                        <h2 className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">Configuração de Performance</h2>
                        <input 
                          type="text" 
                          value={activePlan.type}
                          onChange={(e) => handleUpdateActivePlan("type", e.target.value)}
                          className="bg-transparent border-b border-white/10 text-[#CCA761] text-[10px] font-black uppercase tracking-widest focus:border-[#CCA761] focus:outline-none px-2 py-0.5"
                          placeholder="CATEGORIA"
                        />
                     </div>
                     <span className="text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-sm bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30">
                        Editando {activePlan.name}
                     </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                     <div className="space-y-2">
                       <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Título do Nível</label>
                       <input 
                         type="text" 
                         value={activePlan.name}
                         onChange={(e) => handleUpdateActivePlan("name", e.target.value)}
                         className="w-full bg-[#111] border border-[#333] text-white px-4 py-3 rounded-xl text-sm focus:border-[#CCA761]/50 focus:outline-none transition-colors font-semibold" 
                       />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Métrica / Unidade</label>
                       <div className="flex gap-2">
                          <select 
                            value={activePlan.metricType}
                            onChange={(e) => handleUpdateActivePlan("metricType", e.target.value)}
                            className="bg-[#111] border border-[#333] text-white px-3 py-3 rounded-xl text-[10px] font-black focus:border-[#CCA761] focus:outline-none appearance-none"
                          >
                            <option value="currency">R$</option>
                            <option value="numeric">QTD</option>
                          </select>
                          <input 
                            type="text" 
                            value={activePlan.unit}
                            onChange={(e) => handleUpdateActivePlan("unit", e.target.value)}
                            className="flex-1 bg-[#111] border border-[#333] text-white px-4 py-3 rounded-xl text-xs focus:border-[#CCA761] focus:outline-none font-black uppercase tracking-widest" 
                            placeholder="Símbolo (Ex: CTR, AGD)"
                          />
                       </div>
                     </div>
                     <div className="space-y-2">
                       <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Salário Base (R$)</label>
                       <input 
                         type="number" 
                         value={activePlan.salary}
                         onChange={(e) => handleUpdateActivePlan("salary", e.target.value === '' ? '' : Number(e.target.value))}
                         className="w-full bg-[#111] border border-[#333] text-white px-4 py-3 rounded-xl text-sm focus:border-[#4ade80]/50 focus:outline-none transition-colors font-mono" 
                       />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Meta Mensal ({activePlan.unit})</label>
                       <input 
                         type="number" 
                         value={activePlan.monthlyGoal}
                         onChange={(e) => handleUpdateActivePlan("monthlyGoal", e.target.value === '' ? '' : Number(e.target.value))}
                         className="w-full bg-[#111] border border-[#333] text-white px-4 py-3 rounded-xl text-sm focus:border-[#CCA761]/50 focus:outline-none transition-colors font-mono" 
                       />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Mín. Histórico p/ Nível</label>
                       <input 
                         type="number" 
                         value={activePlan.minSalesForLevel}
                         onChange={(e) => handleUpdateActivePlan("minSalesForLevel", e.target.value === '' ? '' : Number(e.target.value))}
                         className="w-full bg-[#111] border border-[#333] text-white px-4 py-3 rounded-xl text-sm focus:border-[#CCA761]/50 focus:outline-none transition-colors font-mono" 
                       />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Distribuição de Comissão</label>
                       <select 
                         value={activePlan.commissionType || "fixed"}
                         onChange={(e) => handleUpdateActivePlan("commissionType", e.target.value)}
                         className="w-full bg-[#111] border border-[#333] text-white px-4 py-3 rounded-xl text-sm focus:border-[#CCA761]/50 focus:outline-none appearance-none"
                       >
                         <option value="fixed">Fixo por Unidade (R$)</option>
                         <option value="percentage">Porcentagem sobre Venda (%)</option>
                       </select>
                     </div>
                  </div>

                  <h3 className="text-[10px] text-[#CCA761] font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    Tabela de Comissionamento Progressivo
                  </h3>
                  
                  <div className="space-y-4 mb-6">
                     <div className="grid grid-cols-12 gap-4 border-b border-white/5 pb-2 text-[9px] text-gray-500 font-bold uppercase tracking-widest px-2">
                        <div className="col-span-5">Volume Alcançado ({activePlan.unit})</div>
                        <div className="col-span-6">Valor da Comissão</div>
                        <div className="col-span-1"></div>
                     </div>

                     {activePlan.brackets.map((bracket) => (
                       <div key={bracket.id} className="grid grid-cols-12 gap-4 items-center group bg-[#111]/50 p-2 rounded-xl border border-transparent hover:border-white/5 transition-colors">
                          <div className="col-span-5">
                             <input 
                               type="number" 
                               value={bracket.minSales}
                               onChange={(e) => handleUpdateBracket(bracket.id, "minSales", e.target.value === '' ? '' : Number(e.target.value))}
                               className="w-full bg-transparent border border-[#333] text-white px-4 py-2 rounded-lg text-sm focus:border-[#CCA761]/50 focus:outline-none transition-colors font-mono"
                             />
                          </div>
                          <div className="col-span-6 relative">
                             <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold pt-[1px] select-none">
                               {(!activePlan.commissionType || activePlan.commissionType === "fixed") ? "R$" : "%"}
                             </div>
                             <input 
                               type="number" 
                               value={bracket.commissionValue}
                               onChange={(e) => handleUpdateBracket(bracket.id, "commissionValue", e.target.value === '' ? '' : Number(e.target.value))}
                               className="w-full bg-transparent border border-[#333] text-[#4ade80] px-4 pl-9 py-2 rounded-lg text-sm focus:border-[#4ade80]/50 focus:outline-none transition-colors font-mono font-bold"
                             />
                          </div>
                          <div className="col-span-1 flex justify-center">
                            <button onClick={() => handleDeleteBracket(bracket.id)} className="p-2 text-gray-600 hover:text-red-500 transition-colors">
                               <Trash2 size={16} />
                            </button>
                          </div>
                       </div>
                     ))}
                  </div>

                  <button 
                     onClick={handleAddBracket}
                     className="px-5 py-2.5 bg-white/5 border border-white/10 hover:border-[#CCA761]/30 hover:bg-[#CCA761]/5 rounded-xl flex items-center justify-center gap-2 transition-all mt-6"
                   >
                     <Plus size={14} className="text-[#CCA761]" />
                     <span className="text-[10px] text-[#CCA761] font-bold uppercase tracking-widest">Adicionar Nova Faixa de Bônus</span>
                   </button>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

