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
  type: "Closer" | "SDR";
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

type Professional = {
  id: string;
  name: string;
  role: string;
  baseSalary: number | string;
  receivesCommissionByLevel: boolean;
  careerPlanId: string;
  avatarUrl?: string;
};

export default function ConfigComercialPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("geral"); // 'geral' or 'profissionais'
  
  // Exemplo de Estado Mocado Inicial (no futuro, vem do DB - tenant_settings e career_plans)
  const [progressionType, setProgressionType] = useState("Por Meses Batendo a Meta");
  const [monthsPromo, setMonthsPromo] = useState("4");
  const [enableEvolution, setEnableEvolution] = useState(true);
  const [companyName, setCompanyName] = useState("Dutra Advocacia");

  const [plans, setPlans] = useState<CareerPlan[]>([
    {
      id: "p1", name: "JUNIOR", type: "Closer", salary: 2000, monthlyGoal: 15, minSalesForLevel: 0,
      brackets: [{ id: "b1", minSales: 1, commissionValue: 80 }, { id: "b2", minSales: 10, commissionValue: 100 }, { id: "b3", minSales: 15, commissionValue: 120 }]
    },
    {
      id: "p2", name: "PLENO", type: "Closer", salary: 2500, monthlyGoal: 35, minSalesForLevel: 45,
      brackets: [{ id: "b4", minSales: 1, commissionValue: 100 }, { id: "b5", minSales: 35, commissionValue: 130 }]
    },
    {
      id: "p3", name: "SENIOR", type: "Closer", salary: 3000, monthlyGoal: 50, minSalesForLevel: 105,
      brackets: [{ id: "b6", minSales: 1, commissionValue: 150 }]
    },
    {
      id: "p4", name: "SDR JUNIOR", type: "SDR", salary: 1500, monthlyGoal: 30, minSalesForLevel: 0,
      brackets: [{ id: "b7", minSales: 1, commissionValue: 30 }]
    }
  ]);

  const [professionals, setProfessionals] = useState<Professional[]>([
    { id: "prof1", name: "VITOR PROCOPIO", role: "Closer / Vendedor", baseSalary: 1500, receivesCommissionByLevel: true, careerPlanId: "p4" },
    { id: "prof2", name: "CAMILA DUTRA", role: "Advogado", baseSalary: 3500, receivesCommissionByLevel: false, careerPlanId: "" },
    { id: "prof3", name: "MAYA DUTRA", role: "Estagiário", baseSalary: 1500, receivesCommissionByLevel: false, careerPlanId: "" },
    { id: "prof4", name: "DUDA", role: "Closer / Vendedor", baseSalary: 2500, receivesCommissionByLevel: true, careerPlanId: "p3" }
  ]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedProf = localStorage.getItem("MTO_COMMERCIAL_PROF");
      if (savedProf) {
        try { setProfessionals(JSON.parse(savedProf)); } catch(e){}
      }
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

  const [activePlanId, setActivePlanId] = useState("p1");

  const activePlan = plans.find(p => p.id === activePlanId);

  const handleCreatePlan = (type: "Closer" | "SDR") => {
    const newId = Math.random().toString(36).substr(2, 9);
    setPlans([...plans, {
      id: newId,
      name: `NOVO ${type.toUpperCase()}`,
      type,
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
    if(plans.length <= 1) return toast.error("Você precisa de pelo menos 1 nível configurado.");
    const filtered = plans.filter(p => p.id !== id);
    setPlans(filtered);
    if(activePlanId === id) setActivePlanId(filtered[0].id);
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

  const handleAddProfessional = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    setProfessionals([...professionals, {
      id: newId, name: "", role: "", baseSalary: 0, receivesCommissionByLevel: false, careerPlanId: ""
    }]);
  };

  const handleUpdateProfessional = (profId: string, field: keyof Professional, value: any) => {
    setProfessionals(professionals.map(p => p.id === profId ? { ...p, [field]: value } : p));
  };

  const handlePhotoUpload = (profId: string, file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
       if (e.target?.result) {
         handleUpdateProfessional(profId, "avatarUrl", e.target.result as string);
       }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteProfessional = (profId: string) => {
    setProfessionals(professionals.filter(p => p.id !== profId));
  };

  const handleSave = async () => {
    setIsLoading(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("MTO_COMMERCIAL_PROF", JSON.stringify(professionals));
      localStorage.setItem("MTO_COMMERCIAL_PLANS", JSON.stringify(plans));
      localStorage.setItem("MTO_COMMERCIAL_GENERAL", JSON.stringify({
        companyName, progressionType, monthsPromo, enableEvolution
      }));
    }
    // TODO: Injetar banco de dados Supabase na Tabela commercial_settings / career_plans
    setTimeout(() => {
      setIsLoading(false);
      toast.success("Configurações salvas e aplicadas à equipe com sucesso!");
    }, 1500);
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
              Configurações <span className="text-white">Comerciais</span>
            </h1>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.3em]">PERSONALIZE NÍVEIS, METAS E FAIXAS</p>
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

      {/* Navegação Secundária (Tabs Estilo Header) */}
      <div className="flex bg-[#0a0a0a] rounded-xl p-1.5 w-max border border-white/5 shadow-inner">
         <button 
           onClick={() => setActiveTab("geral")} 
           className={`px-8 py-2.5 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === "geral" ? "bg-[#CCA761] text-[#0a0a0a] shadow-lg" : "text-gray-500 hover:text-white"}`}
         >
           Geral & Níveis
         </button>
         <button 
           onClick={() => setActiveTab("profissionais")} 
           className={`px-8 py-2.5 text-[11px] font-bold uppercase tracking-widest rounded-lg transition-all ${activeTab === "profissionais" ? "bg-[#CCA761] text-[#0a0a0a] shadow-lg" : "text-gray-500 hover:text-white"}`}
         >
           Profissionais
         </button>
      </div>

      {/* CONTEÚDO DA TAB GERAL & NÍVEIS */}
      {activeTab === "geral" && (
        <div className="space-y-8 animate-fade-in">
          
          {/* Sessão 1: Dados da Empresa & Progressão Global */}
          <div className="glass-card-premium p-6 lg:p-8 rounded-2xl border border-[#CCA761]/20 bg-gradient-to-br from-[#111111]/80 to-[#050505]/90 backdrop-blur-xl shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#CCA761]/5 rounded-bl-full pointer-events-none" />
            
            <h2 className="text-[10px] text-[#CCA761] font-black uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
              <Briefcase size={14} /> Dados da Empresa & Carreira
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
               
               <div className="space-y-2">
                 <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Nome da Empresa</label>
                 <input 
                    type="text" 
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="MTO Advocacia / Tech" 
                    className="w-full bg-[#0a0a0a] border border-[#222] text-white px-4 py-3 rounded-xl text-sm focus:border-[#CCA761]/50 focus:outline-none transition-colors" 
                 />
               </div>

               <div className="space-y-2">
                 <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Tipo de Progressão (Promoção)</label>
                 <select 
                    value={progressionType} 
                    onChange={e => setProgressionType(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#222] text-white px-4 py-3 rounded-xl text-sm focus:border-[#CCA761]/50 focus:outline-none transition-colors appearance-none"
                 >
                   <option>Por Meses Batendo a Meta</option>
                   <option>Por Volume Financeiro Agregado</option>
                   <option>Manual (Apenas Adm)</option>
                 </select>
               </div>

               <div className="space-y-2">
                 <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Meses de Consistência (Promoção)</label>
                 <input 
                    type="number" 
                    value={monthsPromo} 
                    onChange={e => setMonthsPromo(e.target.value)}
                    className="w-full bg-[#0a0a0a] border border-[#222] text-white px-4 py-3 rounded-xl text-sm focus:border-[#CCA761]/50 focus:outline-none transition-colors" 
                 />
               </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-end">
               <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${enableEvolution ? 'bg-[#CCA761] border-[#CCA761]' : 'border-gray-600 bg-transparent'}`}>
                     {enableEvolution && <CheckCircle size={14} className="text-[#0a0a0a]" />}
                  </div>
                  <input type="checkbox" className="hidden" checked={enableEvolution} onChange={() => setEnableEvolution(!enableEvolution)} />
                  <span className="text-[10px] text-gray-400 group-hover:text-white uppercase tracking-widest font-bold transition-colors">Ativar Modo Evolução (Gameficação visual nas metas)</span>
               </label>
            </div>
          </div>

          {/* Sessão 2: Planos Split Interface */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Esquerda: Lista de Planos Closers e SDRs */}
            <div className="lg:col-span-3 space-y-8">
              
              {/* Closers Section */}
              <div className="space-y-3">
                 <h3 className="text-[10px] text-[#4ade80] font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <TrendingUp size={14} /> Planos de Closers (Vendas)
                 </h3>
                 {plans.filter(p => p.type === "Closer").map(p => (
                   <div 
                     key={p.id}
                     onClick={() => setActivePlanId(p.id)}
                     className={`p-4 rounded-xl border transition-all cursor-pointer relative group flex justify-between items-center ${activePlanId === p.id ? 'bg-[#CCA761]/10 border-[#CCA761]/50 shadow-[0_0_15px_rgba(204,167,97,0.15)]' : 'bg-[#0a0a0a] border-[#222] hover:border-white/20'}`}
                   >
                     <div className="flex flex-col">
                       <span className={`text-xs font-black uppercase tracking-widest mb-1 ${activePlanId === p.id ? 'text-white' : 'text-gray-300'}`}>{p.name}</span>
                       <span className="text-[9px] text-gray-500 font-medium">Meta: {p.monthlyGoal} • Sal: R$ {p.salary} • {p.brackets.length} fx</span>
                     </div>
                     <button onClick={(e) => handleDeletePlan(p.id, e)} className="text-gray-600 hover:text-red-500 transition-colors p-1">
                       <Trash2 size={14} />
                     </button>
                   </div>
                 ))}
                 <button 
                   onClick={() => handleCreatePlan("Closer")}
                   className="w-full py-3.5 bg-[#4ade80]/5 border border-[#4ade80]/20 hover:border-[#4ade80]/50 hover:bg-[#4ade80]/10 rounded-xl flex items-center justify-center gap-2 transition-all group"
                 >
                   <Plus size={14} className="text-[#4ade80] group-hover:rotate-90 transition-transform" />
                   <span className="text-[10px] text-[#4ade80] font-bold uppercase tracking-widest">Plano de Closer</span>
                 </button>
              </div>

              {/* SDRs Section */}
              <div className="space-y-3 pt-6 border-t border-white/5">
                 <h3 className="text-[10px] text-[#22d3ee] font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <Users size={14} /> Planos de SDRs (Agendamentos)
                 </h3>
                 {plans.filter(p => p.type === "SDR").map(p => (
                   <div 
                     key={p.id}
                     onClick={() => setActivePlanId(p.id)}
                     className={`p-4 rounded-xl border transition-all cursor-pointer relative group flex justify-between items-center ${activePlanId === p.id ? 'bg-[#22d3ee]/10 border-[#22d3ee]/50 shadow-[0_0_15px_rgba(34,211,238,0.15)]' : 'bg-[#0a0a0a] border-[#222] hover:border-white/20'}`}
                   >
                     <div className="flex flex-col">
                       <span className={`text-xs font-black uppercase tracking-widest mb-1 ${activePlanId === p.id ? 'text-white' : 'text-gray-300'}`}>{p.name}</span>
                       <span className="text-[9px] text-gray-500 font-medium">Meta: {p.monthlyGoal} • Sal: R$ {p.salary} • {p.brackets.length} fx</span>
                     </div>
                     <button onClick={(e) => handleDeletePlan(p.id, e)} className="text-gray-600 hover:text-red-500 transition-colors p-1">
                       <Trash2 size={14} />
                     </button>
                   </div>
                 ))}
                 <button 
                   onClick={() => handleCreatePlan("SDR")}
                   className="w-full py-3.5 bg-[#22d3ee]/5 border border-[#22d3ee]/20 hover:border-[#22d3ee]/50 hover:bg-[#22d3ee]/10 rounded-xl flex items-center justify-center gap-2 transition-all group"
                 >
                   <Plus size={14} className="text-[#22d3ee] group-hover:rotate-90 transition-transform" />
                   <span className="text-[10px] text-[#22d3ee] font-bold uppercase tracking-widest">Plano de SDR</span>
                 </button>
              </div>

            </div>

            {/* Direita: Formulário de Detalhes do Plano */}
            {activePlan && (
              <div className="lg:col-span-9">
                <div className="glass-card-premium p-6 lg:p-8 rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-xl relative min-h-full">
                  <div className="flex justify-between items-center mb-8 pb-4 border-b border-white/5">
                     <h2 className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">Dados do Plano</h2>
                     <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-sm ${activePlan.type === 'Closer' ? 'bg-[#CCA761]/20 text-[#CCA761] border border-[#CCA761]/30' : 'bg-[#22d3ee]/20 text-[#22d3ee] border border-[#22d3ee]/30'}`}>
                        🔥 Plano de {activePlan.type}
                     </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                     <div className="space-y-2">
                       <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Nome do Nível</label>
                       <input 
                         type="text" 
                         value={activePlan.name}
                         onChange={(e) => handleUpdateActivePlan("name", e.target.value)}
                         className="w-full bg-[#111] border border-[#333] text-white px-4 py-3 rounded-xl text-sm focus:border-[#CCA761]/50 focus:outline-none transition-colors font-semibold" 
                       />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Salário Fixo (R$)</label>
                       <input 
                         type="number" 
                         value={activePlan.salary}
                         onChange={(e) => handleUpdateActivePlan("salary", e.target.value === '' ? '' : Number(e.target.value))}
                         className="w-full bg-[#111] border border-[#333] text-white px-4 py-3 rounded-xl text-sm focus:border-[#4ade80]/50 focus:outline-none transition-colors font-mono" 
                       />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Meta Mensal de V/A</label>
                       <input 
                         type="number" 
                         value={activePlan.monthlyGoal}
                         onChange={(e) => handleUpdateActivePlan("monthlyGoal", e.target.value === '' ? '' : Number(e.target.value))}
                         className="w-full bg-[#111] border border-[#333] text-white px-4 py-3 rounded-xl text-sm focus:border-[#CCA761]/50 focus:outline-none transition-colors font-mono" 
                       />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Mín. Vendas p/ Nível</label>
                       <input 
                         type="number" 
                         value={activePlan.minSalesForLevel}
                         onChange={(e) => handleUpdateActivePlan("minSalesForLevel", e.target.value === '' ? '' : Number(e.target.value))}
                         className="w-full bg-[#111] border border-[#333] text-white px-4 py-3 rounded-xl text-sm focus:border-[#CCA761]/50 focus:outline-none transition-colors font-mono" 
                         title="Quantidade histórica de vendas necessárias para habilitar o alcance deste plano na empresa."
                       />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[9px] text-gray-500 uppercase tracking-widest font-bold">Formato da Comissão</label>
                       <select 
                         value={activePlan.commissionType || "fixed"}
                         onChange={(e) => handleUpdateActivePlan("commissionType", e.target.value)}
                         className="w-full bg-[#111] border border-[#333] text-white px-4 py-3 rounded-xl text-sm focus:border-[#CCA761]/50 focus:outline-none transition-colors font-mono appearance-none"
                       >
                         <option value="fixed">Fixo por Contrato (R$)</option>
                         <option value="percentage">Porcentagem (%)</option>
                       </select>
                     </div>
                  </div>

                  <h3 className="text-[10px] text-[#CCA761] font-black uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    Faixas de Comissão Ativas
                  </h3>
                  
                  <div className="space-y-4 mb-6">
                     <div className="grid grid-cols-12 gap-4 border-b border-white/5 pb-2 text-[9px] text-gray-500 font-bold uppercase tracking-widest px-2">
                        <div className="col-span-5">Mínimo na Faixa (Vendas)</div>
                        <div className="col-span-6">Comissão Aplicada (Faixa)</div>
                        <div className="col-span-1 border-r border-transparent"></div>
                     </div>

                     {activePlan.brackets.map((bracket, index) => (
                       <div key={bracket.id} className="grid grid-cols-12 gap-4 items-center group bg-[#111]/50 p-2 rounded-xl border border-transparent hover:border-white/5 transition-colors">
                          <div className="col-span-5 relative">
                             <input 
                               type="number" 
                               value={bracket.minSales}
                               onChange={(e) => handleUpdateBracket(bracket.id, "minSales", e.target.value === '' ? '' : Number(e.target.value))}
                               className="w-full bg-transparent border border-[#333] text-white px-4 py-2 rounded-lg text-sm focus:border-[#CCA761]/50 focus:bg-[#111] focus:outline-none transition-colors font-mono"
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
                               className="w-full bg-transparent border border-[#333] text-[#4ade80] px-4 pl-9 py-2 rounded-lg text-sm focus:border-[#4ade80]/50 focus:bg-[#111] focus:outline-none transition-colors font-mono font-bold"
                             />
                          </div>
                          <div className="col-span-1 flex justify-center">
                            <button onClick={() => handleDeleteBracket(bracket.id)} className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors">
                               <Trash2 size={16} />
                            </button>
                          </div>
                       </div>
                     ))}
                  </div>

                  <button 
                     onClick={handleAddBracket}
                     className="px-5 py-2.5 bg-white/5 border border-white/10 hover:border-white/30 hover:bg-white/10 rounded-xl flex items-center justify-center gap-2 transition-all mt-6"
                   >
                     <Plus size={14} className="text-gray-400" />
                     <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">+ Adicionar Faixa Superior</span>
                   </button>

                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONTEÚDO DA TAB PROFISSIONAIS */}
      {activeTab === "profissionais" && (
         <div className="glass-card-premium p-6 lg:p-8 rounded-2xl border border-white/5 bg-[#0a0a0a]/80 shadow-2xl animate-fade-in relative z-10">
           
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 border-b border-white/5 pb-6">
              <h2 className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">Profissionais Cadastrados</h2>
              <div className="flex items-center gap-4 mt-4 sm:mt-0">
                  <button 
                    onClick={handleSave}
                    disabled={isLoading}
                    className="flex items-center gap-2 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#0a0a0a] px-6 py-3 rounded-xl font-[900] text-[9px] uppercase tracking-widest transition-all hover:scale-[1.02] active:scale-95 shadow-[0_0_20px_rgba(204,167,97,0.2)] disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    <span className="hidden sm:inline">{isLoading ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}</span>
                    <span className="sm:hidden">{isLoading ? "..." : "SALVAR"}</span>
                  </button>
                  <button 
                    onClick={handleAddProfessional}
                    className="flex items-center gap-2 px-6 py-3 bg-[#4ade80]/5 hover:bg-[#4ade80]/10 border border-[#4ade80]/20 hover:border-[#4ade80]/40 rounded-xl transition-all cursor-pointer group"
                  >
                     <Plus size={14} className="text-[#4ade80] group-hover:scale-110 transition-transform" />
                     <span className="text-[9px] text-[#4ade80] font-bold uppercase tracking-widest">+ Adicionar Profissional</span>
                  </button>
              </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
             {professionals.map((prof) => (
               <div key={prof.id} className="bg-[#111111]/90 border border-[#222] hover:border-[#333] transition-colors rounded-xl p-5 relative group">
                  <div className="absolute top-4 right-4 z-20">
                     <button onClick={() => handleDeleteProfessional(prof.id)} className="text-gray-600 hover:text-red-500 hover:bg-red-500/10 p-1.5 rounded-md transition-all">
                        <Trash2 size={14} />
                     </button>
                  </div>

                  {/* Header: Foto e Nome */}
                  <div className="flex items-center gap-4 mb-6">
                     <label className="w-12 h-12 rounded-lg bg-gradient-to-br from-[#1a1a1a] to-[#222] border border-[#333] flex items-center justify-center shrink-0 cursor-pointer overflow-hidden hover:border-[#CCA761]/50 transition-colors relative">
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handlePhotoUpload(prof.id, e.target.files?.[0] || null)} />
                        {prof.avatarUrl ? (
                          <img src={prof.avatarUrl} alt={prof.name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-black text-gray-400 uppercase">
                             {prof.name.slice(0, 4) || <ImageIcon size={16} className="text-gray-600" />}
                          </span>
                        )}
                     </label>
                     <input 
                       type="text" 
                       value={prof.name}
                       onChange={(e) => handleUpdateProfessional(prof.id, "name", e.target.value)}
                       placeholder="Nome do Profissional"
                       className="w-full bg-transparent border-b border-[#333] hover:border-[#CCA761]/50 focus:border-[#CCA761] text-white py-1 px-1 text-sm font-semibold uppercase tracking-wider focus:outline-none transition-colors"
                     />
                  </div>

                  {/* Formulário do Card */}
                  <div className="space-y-5">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                           <label className="text-[8px] text-gray-500 uppercase tracking-widest font-bold">Função</label>
                           <select 
                             value={prof.role} 
                             onChange={(e) => handleUpdateProfessional(prof.id, "role", e.target.value)}
                             className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white px-3 py-2.5 rounded-lg text-xs focus:border-[#CCA761]/50 focus:outline-none transition-colors appearance-none"
                           >
                              <option value="">Selecione...</option>
                              <option value="Closer / Vendedor">Closer / Vendedor</option>
                              <option value="SDR / Auxiliar Vendas">SDR / Auxiliar Vendas</option>
                              <option value="Advogado">Advogado</option>
                              <option value="Estagiário">Estagiário</option>
                              <option value="Administrativo">Administrativo</option>
                              <option value="Financeiro">Financeiro</option>
                              <option value="RH">RH</option>
                           </select>
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[8px] text-gray-500 uppercase tracking-widest font-bold">Salário Base (R$)</label>
                           <input 
                             type="number" 
                             value={prof.baseSalary}
                             onChange={(e) => handleUpdateProfessional(prof.id, "baseSalary", e.target.value === '' ? '' : Number(e.target.value))}
                             className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white px-3 py-2.5 rounded-lg text-xs font-mono focus:border-[#CCA761]/50 focus:outline-none transition-colors"
                           />
                        </div>
                     </div>

                     <div className="flex items-center justify-center gap-3 py-2 border-t border-b border-white/5 bg-white/[0.02]">
                        <div className={`w-4 h-4 rounded border flex flex-shrink-0 items-center justify-center transition-colors cursor-pointer ${prof.receivesCommissionByLevel ? 'bg-[#CCA761] border-[#CCA761]' : 'bg-[#0a0a0a] border-gray-600'}`}
                             onClick={() => handleUpdateProfessional(prof.id, "receivesCommissionByLevel", !prof.receivesCommissionByLevel)}>
                           {prof.receivesCommissionByLevel && <CheckCircle size={10} className="text-[#0a0a0a]" />}
                        </div>
                        <span className="text-[8px] text-gray-400 font-bold uppercase tracking-[0.1em] cursor-pointer" onClick={() => handleUpdateProfessional(prof.id, "receivesCommissionByLevel", !prof.receivesCommissionByLevel)}>
                           Recebe Comissão Baseada em Nível
                        </span>
                     </div>

                     <div className={`space-y-1.5 transition-all duration-300 ${prof.receivesCommissionByLevel ? 'opacity-100 max-h-20' : 'opacity-20 max-h-20 pointer-events-none grayscale'}`}>
                        <label className="text-[8px] text-gray-500 uppercase tracking-widest font-bold flex justify-between">
                           Plano de Carreira de Comissões
                        </label>
                        <select 
                          value={prof.careerPlanId} 
                          onChange={(e) => handleUpdateProfessional(prof.id, "careerPlanId", e.target.value)}
                          className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white px-3 py-2.5 rounded-lg text-xs focus:border-[#CCA761]/50 focus:outline-none transition-colors appearance-none"
                        >
                           <option value="">Selecione um plano...</option>
                           {plans.map(p => (
                             <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
                           ))}
                        </select>
                     </div>
                  </div>
               </div>
             ))}
           </div>
         </div>
      )}

    </div>
  );
}
