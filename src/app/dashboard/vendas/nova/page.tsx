"use client";

import { useState, useEffect } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { ArrowLeft, Save, Loader2, DollarSign, Camera, CalendarIcon, Briefcase, Landmark, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import confetti from "canvas-confetti";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

export default function NovaVendaPage() {
  const router = useRouter();
  const { tenantId, user } = useUserProfile();
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("nova_venda");

  // State Compartilhado
  const [clientName, setClientName] = useState("");
  const [professionalName, setProfessionalName] = useState("");
  const [careerPlan, setCareerPlan] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadOrigin, setLeadOrigin] = useState("");
  const [leadChannel, setLeadChannel] = useState("");
  const [leadLegalArea, setLeadLegalArea] = useState("");
  const [leadCity, setLeadCity] = useState("");
  const [leadState, setLeadState] = useState("");
  const [leadUrgency, setLeadUrgency] = useState("medium");
  const [leadPain, setLeadPain] = useState("");
  const [leadNotes, setLeadNotes] = useState("");
  const [leadAnalysis, setLeadAnalysis] = useState<{
    score: number;
    kind: string;
    nextStep: string;
    tags: string[];
    needsHumanHandoff: boolean;
  } | null>(null);

  const [team, setTeam] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("MTO_COMMERCIAL_PROF");
      if (saved) {
        try { setTeam(JSON.parse(saved)); } catch(e){}
      }
      const savedPlans = localStorage.getItem("MTO_COMMERCIAL_PLANS");
      if (savedPlans) {
        try { setPlans(JSON.parse(savedPlans)); } catch(e){}
      }
    }
  }, []);

  const selectedProfessional = team.find(p => p.name === professionalName);
  const [contractDate, setContractDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState(activeTab === "nova_venda" ? "Fechado" : "Agendado/Aprovado");
  
  // State Exclusivo Venda
  const [ticketTotal, setTicketTotal] = useState("");
  const [installments, setInstallments] = useState("1");
  const [saleNumber, setSaleNumber] = useState("1");

  // Helpers
  const formatMoney = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  
  const handleTicketChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/\D/g, "");
    if (!val) {
      setTicketTotal("");
      return;
    }
    const floatVal = parseFloat(val) / 100;
    setTicketTotal(floatVal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  const getRawTicket = () => {
    const clean = ticketTotal.replace(/\./g, '').replace(',', '.');
    return parseFloat(clean) || 0;
  };

  const getCommissionConfig = () => {
    if (!careerPlan) return { value: 0, type: "percentage" };
    const plan = plans.find(p => p.name === careerPlan);
    if (!plan || !plan.brackets || plan.brackets.length === 0) return { value: 0, type: "percentage" };
    
    // Check bracket by current sale mapping (descending order to find highest matched bracket)
    const sortedBrackets = [...plan.brackets].sort((a,b) => Number(b.minSales) - Number(a.minSales));
    const currentSale = parseInt(saleNumber) || 1;
    const activeBracket = sortedBrackets.find(b => currentSale >= Number(b.minSales)) || sortedBrackets[sortedBrackets.length - 1];

    const baseVal = Number(activeBracket.commissionValue);
    return {
      value: isNaN(baseVal) ? 0 : baseVal,
      type: plan.commissionType || "fixed"
    };
  };

  const calculateInstallmentValue = () => {
    const rawValue = getRawTicket();
    const inst = parseInt(installments) || 1;
    if (rawValue === 0) return "—";
    return formatMoney(rawValue / inst);
  };

  const getCommissionRawValue = () => {
    const rawValue = getRawTicket();
    const { value, type } = getCommissionConfig();
    if (value === 0) return 0;
    
    if (type === "fixed") return value;
    return rawValue * (value / 100);
  };

  const calculateCommission = () => {
    const comm = getCommissionRawValue();
    return comm > 0 ? formatMoney(comm) : "R$ 0,00";
  };

  const calculateGain = () => {
    const comm = getCommissionRawValue();
    return comm > 0 ? formatMoney(comm) : "R$ 0,00";
  };

  const handleSave = async () => {
    setIsLoading(true);

    if (activeTab === "lead_intake") {
      try {
        const response = await fetch("/api/growth/lead-intake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: clientName,
            phone: leadPhone,
            email: leadEmail,
            origin: leadOrigin,
            channel: leadChannel,
            legalArea: leadLegalArea,
            city: leadCity,
            state: leadState,
            urgency: leadUrgency,
            pain: leadPain,
            notes: leadNotes,
          }),
        });

        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error || "Nao foi possivel registrar o lead.");
        }

        setLeadAnalysis(data?.analysis || null);
        toast.success("Lead registrado no CRM com score inicial.");
        if (data?.task?.pipeline_id) {
          setTimeout(() => router.push(`/dashboard/crm/${data.task.pipeline_id}`), 1200);
        }
      } catch (error: any) {
        toast.error(error?.message || "Erro ao registrar lead.");
      } finally {
        setIsLoading(false);
      }
      return;
    }
    
    // Convert to float
    const rawTicket = getRawTicket();

    const payload = {
      tenant_id: tenantId,
      client_name: clientName || "Cliente Desconhecido",
      professional_name: professionalName || "SDR/Closer",
      career_plan: careerPlan,
      ticket_total: rawTicket,
      installments: parseInt(installments) || 1,
      contract_date: contractDate,
      status: status,
      commission_value: getCommissionRawValue(),
      estimated_earnings: getCommissionRawValue(),
      sale_number_month: parseInt(saleNumber) || 1,
    };

    const { error } = await supabase.from("sales").insert([payload]);

    setIsLoading(false);

    if (error) {
      toast.error("Erro ao registrar venda: " + error.message);
      return;
    }

    if (activeTab === "nova_venda") {
      // EFEITO DE FESTA MAIS INTENSO (Canhões laterais prolongados)
      const duration = 2500;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 35, spread: 360, ticks: 80, zIndex: 1000, colors: ['#CCA761', '#f1d58d', '#ffffff', '#10b981', '#fbbf24'] };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 40 * (timeLeft / duration);
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
      }, 250);

      toast.success("Contrato de venda registrado com sucesso!");
    } else {
      toast.success("Agendamento de SDR registrado com sucesso!");
    }
    
    setTimeout(() => router.push("/dashboard/vendas"), 2000);
  };

  return (
    <div className={"space-y-8 max-w-5xl mx-auto pb-20 fade-in animate-in duration-500 " + montserrat.className}>
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="p-2 bg-[#111] hover:bg-white/5 border border-[#222] rounded-xl transition-colors">
            <ArrowLeft size={20} className="text-gray-400" />
          </button>
          <div>
            <h1 className={"text-2xl md:text-3xl text-white italic font-bold " + cormorant.className}>
              {activeTab === "nova_venda" ? "Nova " : "Novo " }
              <span className="text-[#CCA761]">{activeTab === "nova_venda" ? "Venda" : activeTab === "lead_intake" ? "Lead" : "Agendamento"}</span>
            </h1>
            <p className="text-gray-500 text-sm mt-1 uppercase tracking-widest font-bold">
              {activeTab === "nova_venda" ? "Registre um novo contrato (Closer)" : activeTab === "lead_intake" ? "Capture e qualifique uma oportunidade comercial" : "Registre um agendamento / Qualificação (SDR)"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex bg-[#111] border border-[#222] rounded-xl p-1 w-full max-w-2xl">
        <button 
          onClick={() => { setActiveTab("lead_intake"); setStatus("Novo Lead"); }} 
          className={"flex-1 py-3 text-[11px] uppercase tracking-widest font-bold rounded-lg transition-all flex items-center justify-center gap-2 " + (activeTab === "lead_intake" ? "bg-[#CCA761]/10 text-[#CCA761]" : "text-gray-500 hover:text-gray-300")}
        >
          {activeTab === "lead_intake" && <div className="w-1.5 h-1.5 rounded-full bg-[#CCA761] shadow-[0_0_8px_rgba(204,167,97,0.8)]" />}
          Novo Lead
        </button>
        <button 
          onClick={() => { setActiveTab("nova_venda"); setStatus("Fechado"); }} 
          className={"flex-1 py-3 text-[11px] uppercase tracking-widest font-bold rounded-lg transition-all flex items-center justify-center gap-2 " + (activeTab === "nova_venda" ? "bg-[#CCA761]/10 text-[#CCA761]" : "text-gray-500 hover:text-gray-300")}
        >
          {activeTab === "nova_venda" && <div className="w-1.5 h-1.5 rounded-full bg-[#CCA761] shadow-[0_0_8px_rgba(204,167,97,0.8)]" />}
          Registrar Contrato
        </button>
        <button 
          onClick={() => { setActiveTab("agendamento"); setStatus("Agendado/Aprovado"); }} 
          className={"flex-1 py-3 text-[11px] uppercase tracking-widest font-bold rounded-lg transition-all flex items-center justify-center gap-2 " + (activeTab === "agendamento" ? "bg-[#CCA761]/10 text-[#CCA761]" : "text-gray-500 hover:text-gray-300")}
        >
          {activeTab === "agendamento" && <div className="w-1.5 h-1.5 rounded-full bg-[#CCA761] shadow-[0_0_8px_rgba(204,167,97,0.8)]" />}
          Agendamento SDR
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Coluna Principal */}
        <div className="md:col-span-2 space-y-6">
          
          {/* Card: Dados Principais */}
          <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-4">
              {activeTab === "lead_intake" ? <Target size={18} className="text-[#CCA761]" /> : <DollarSign size={18} className="text-[#CCA761]" />}
              <h2 className="text-lg font-semibold tracking-wide text-white">
                {activeTab === "nova_venda" ? "Dados da Venda" : activeTab === "lead_intake" ? "Dados do Lead" : "Dados do Agendamento"}
              </h2>
            </div>

            {activeTab === "lead_intake" ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Nome do Lead</label>
                    <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Ex: Maria Silva" className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Telefone / WhatsApp</label>
                    <input value={leadPhone} onChange={e => setLeadPhone(e.target.value)} placeholder="(21) 99999-0000" className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">E-mail</label>
                    <input type="email" value={leadEmail} onChange={e => setLeadEmail(e.target.value)} placeholder="lead@email.com" className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Origem</label>
                    <input value={leadOrigin} onChange={e => setLeadOrigin(e.target.value)} placeholder="Instagram, Google Ads, indicação..." className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Canal</label>
                    <input value={leadChannel} onChange={e => setLeadChannel(e.target.value)} placeholder="WhatsApp, formulário, telefone..." className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Área Jurídica</label>
                    <input value={leadLegalArea} onChange={e => setLeadLegalArea(e.target.value)} placeholder="Trabalhista, Previdenciário, Família..." className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1.5 col-span-2">
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Cidade</label>
                      <input value={leadCity} onChange={e => setLeadCity(e.target.value)} placeholder="Rio de Janeiro" className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">UF</label>
                      <input value={leadState} onChange={e => setLeadState(e.target.value.toUpperCase())} maxLength={2} placeholder="RJ" className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Urgência</label>
                  <select value={leadUrgency} onChange={e => setLeadUrgency(e.target.value)} className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 appearance-none">
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta / urgente</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Dor principal</label>
                  <textarea value={leadPain} onChange={e => setLeadPain(e.target.value)} rows={4} placeholder="Explique em linguagem simples o problema que trouxe este lead." className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Observações</label>
                  <textarea value={leadNotes} onChange={e => setLeadNotes(e.target.value)} rows={3} placeholder="Documentos citados, objeções, disponibilidade, contexto comercial." className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors" />
                </div>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
              
              <div className="col-span-12 md:col-span-3 flex flex-col items-center gap-2 pt-2">
                 <div className="w-[80px] h-[80px] border-2 border-[#333] rounded-full flex flex-col items-center justify-center bg-[#0a0a0a] overflow-hidden">
                     {selectedProfessional?.avatarUrl ? (
                       <Image src={selectedProfessional.avatarUrl} alt={selectedProfessional.name} width={80} height={80} className="w-full h-full object-cover" />
                     ) : (
                       <Camera size={24} className="text-gray-700" />
                    )}
                 </div>
                 <label className="text-[9px] text-[#CCA761] uppercase tracking-[0.2em] font-bold mt-1 text-center">
                   {activeTab === "nova_venda" ? "Closer Vinculado" : "SDR Vinculado"}
                 </label>
              </div>

              <div className="col-span-12 md:col-span-9 space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Nome do Cliente</label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      placeholder="Ex: João Ferreira"
                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Profissional (SDR/Closer)</label>
                      <select
                        value={professionalName}
                        onChange={e => {
                           setProfessionalName(e.target.value);
                           const prof = team.find(p => p.name === e.target.value);
                           if (prof && prof.careerPlanId) {
                               const planMatch = plans.find(pl => pl.id === prof.careerPlanId);
                               if (planMatch) setCareerPlan(planMatch.name);
                           }
                        }}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors appearance-none cursor-pointer"
                      >
                         <option value="">Selecione o profissional cadastrado...</option>
                         {team.filter(p => activeTab === 'nova_venda' ? p.role?.toLowerCase().includes('closer') : p.role?.toLowerCase().includes('sdr')).map(prof => (
                            <option key={prof.id} value={prof.name}>{prof.name} - {prof.role}</option>
                         ))}
                         {team.filter(p => activeTab === 'nova_venda' ? !p.role?.toLowerCase().includes('closer') : !p.role?.toLowerCase().includes('sdr')).map(prof => (
                            <option key={prof.id} value={prof.name}>{prof.name} - {prof.role}</option>
                         ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Plano de Carreira</label>
                      <select
                        value={careerPlan}
                        onChange={e => setCareerPlan(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 appearance-none cursor-pointer"
                      >
                        <option value="">Selecione o plano/nível...</option>
                        {plans.map(p => (
                          <option key={p.id} value={p.name}>{p.name} ({p.type})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Número da Venda (Status Mês Atual)</label>
                      <input
                        type="number"
                        min="1"
                        value={saleNumber}
                        onChange={e => setSaleNumber(e.target.value)}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-[#4ade80] rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 font-mono font-bold"
                      />
                    </div>
                  </div>
              </div>
            </div>
            )}
          </div>

          {/* Card: Finanças */}
          {activeTab !== "lead_intake" && <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
             <div className="flex items-center gap-2 mb-6 border-b border-white/5 pb-4">
               <Landmark size={18} className="text-[#CCA761]" />
               <h2 className="text-lg font-semibold tracking-wide text-white">Valores & Pagamento</h2>
             </div>

             {activeTab === "nova_venda" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Ticket Total (R$)</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">R$</div>
                      <input
                        type="text"
                        value={ticketTotal}
                        onChange={handleTicketChange}
                        placeholder="0,00"
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg pl-12 pr-4 py-3 text-sm font-bold focus:outline-none focus:border-[#CCA761]/50 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Nº de Parcelas</label>
                    <input
                      type="number"
                      value={installments}
                      onChange={e => setInstallments(e.target.value)}
                      min="1"
                      className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors"
                    />
                  </div>
                </div>
             )}

             {/* Dynamic calculation result layout */}
             <div className={"pt-6 grid gap-4 " + (activeTab === "nova_venda" ? "border-t border-white/5 grid-cols-2 md:grid-cols-4" : "grid-cols-2 lg:grid-cols-4")}>
                
                {activeTab === "nova_venda" && (
                  <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                    <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">Parcela</p>
                    <p className="text-[#CCA761] font-bold text-lg">{calculateInstallmentValue()}</p>
                  </div>
                )}
                
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">Comissão (Faixa)</p>
                  <p className="text-[#CCA761] font-bold text-lg">{activeTab === "nova_venda" ? calculateCommission() : "R$ 0,00/ctr"}</p>
                </div>
                
                <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">Salário Fixo</p>
                  <p className="text-[#CCA761] font-bold text-lg">R$ 0,00</p>
                </div>
                
                <div className="p-3 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                  <p className="text-[9px] text-emerald-400 uppercase tracking-widest font-bold mb-1">Ganho Est.</p>
                  <p className="text-emerald-400 font-black text-lg">{activeTab === "nova_venda" ? calculateGain() : "R$ 0,00"}</p>
                </div>

                {activeTab === "agendamento" && (
                  <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                    <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mb-1">Agend. Nº (Mês)</p>
                    <p className="text-[#eab308] font-black text-lg">1º</p>
                  </div>
                )}
             </div>
          </div>}

          {activeTab === "lead_intake" && leadAnalysis && (
            <div className="bg-white/[0.02] border border-[#CCA761]/20 rounded-2xl p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-[10px] text-[#CCA761] uppercase tracking-widest font-black">Qualificação inicial</p>
                  <h3 className="text-xl font-black text-white">Score {leadAnalysis.score}/100</h3>
                </div>
                <span className="text-[10px] uppercase tracking-widest px-3 py-1 rounded-full border border-[#CCA761]/30 text-[#CCA761]">{leadAnalysis.kind}</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{leadAnalysis.nextStep}</p>
              <div className="flex flex-wrap gap-2 mt-4">
                {leadAnalysis.tags.map((tag) => (
                  <span key={tag} className="text-[10px] uppercase tracking-wider bg-[#CCA761]/10 text-[#CCA761] border border-[#CCA761]/20 rounded-full px-3 py-1">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Coluna Sidebar */}
        <div className="space-y-6">
          {/* Card: Gestão */}
          <div className="bg-gradient-to-br from-[#111111] to-[#0a0a0a] border border-[#222] rounded-2xl p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCA761]/5 rounded-bl-full pointer-events-none" />
            <div className="flex items-center gap-2 mb-6 border-b border-[#222] pb-4">
              <Briefcase size={18} className="text-[#CCA761]" />
              <h2 className="text-lg font-semibold tracking-wide text-white">Status Operacional</h2>
            </div>
            
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status Atual</label>
                <select 
                  value={status} 
                  onChange={e => setStatus(e.target.value)} 
                  className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 appearance-none"
                >
                  {activeTab === "lead_intake" ? (
                    <>
                      <option value="Novo Lead">Novo Lead</option>
                      <option value="Qualificacao">Qualificação</option>
                      <option value="Handoff Humano">Handoff Humano</option>
                    </>
                  ) : activeTab === "nova_venda" ? (
                    <>
                      <option value="Fechado">Fechado</option>
                      <option value="Pendente">Em Análise (Pendente)</option>
                      <option value="Perdido">Cancelado</option>
                    </>
                  ) : (
                    <>
                      <option value="Agendado/Aprovado">Agendado/Aprov.</option>
                      <option value="Pendente">Pendente Retorno</option>
                      <option value="No-show">No-show / Falso</option>
                    </>
                  )}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                  {activeTab === "nova_venda" ? "Data do Contrato" : activeTab === "lead_intake" ? "Data de Entrada" : "Data do Agendamento"}
                </label>
                <input
                  type="date"
                  value={contractDate}
                  onChange={e => setContractDate(e.target.value)}
                  className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors [color-scheme:dark]"
                />
              </div>

              {activeTab === "nova_venda" && (
                <div className="mt-6 pt-6 border-t border-[#222]">
                   <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold text-center">Desempenho no Mês</p>
                   <div className="mt-3 flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full border-[3px] border-[#CCA761] bg-[#CCA761]/10 flex flex-col items-center justify-center shadow-[0_0_15px_rgba(204,167,97,0.2)]">
                         <span className="text-2xl font-black text-[#CCA761]">1º</span>
                      </div>
                   </div>
                   <p className="text-center text-xs text-gray-400 mt-2">Venda do Profissional</p>
                </div>
              )}
            </div>
            
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="mt-8 w-full relative flex items-center justify-center gap-2 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-[800] py-3.5 px-8 rounded-lg transition-all duration-300 transform active:scale-95 text-sm shadow-none overflow-hidden hover:-translate-y-[1px] tracking-widest disabled:opacity-50"
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} strokeWidth={2.5} />}
              <span>{isLoading ? "SALVANDO..." : activeTab === "nova_venda" ? "REGISTRAR VENDA" : activeTab === "lead_intake" ? "REGISTRAR LEAD" : "REGISTRAR AGEND."}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
