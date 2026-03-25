"use client";

import { useEffect, useState } from "react";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { Plus, Search, DollarSign, Loader2, ArrowUpRight, TrendingUp, Briefcase, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useUserProfile } from "@/hooks/useUserProfile";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "500", "600", "700"], style: ["normal", "italic"] });
const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });

interface Sale {
  id: string;
  client_name: string;
  professional_name: string;
  ticket_total: number;
  commission_value: number;
  contract_date: string;
  status: string;
}

export default function VendasPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"vendas" | "agendamentos">("vendas");
  const [team, setTeam] = useState<any[]>([]);
  const { tenantId } = useUserProfile();
  const supabase = createClient();

  useEffect(() => {
    if (tenantId) fetchSales();
    if (typeof window !== 'undefined') {
      const savedProf = localStorage.getItem("MTO_COMMERCIAL_PROF");
      if (savedProf) {
        try { setTeam(JSON.parse(savedProf)); } catch(e){}
      }
    }
  }, [tenantId]);

  const fetchSales = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("sales")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (data) setSales(data);
    setIsLoading(false);
  };

  const handleDelete = async (id: string, clientName: string) => {
    if (!confirm(`Tem certeza que deseja excluir a venda de "${clientName}"? Essa ação é irreversível.`)) return;

    const { error } = await supabase
      .from("sales")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId); // Garantia de segurança

    if (error) {
      toast.error("Erro ao excluir venda: " + error.message);
    } else {
      toast.success("Venda excluída com sucesso.");
      setSales(sales.filter(s => s.id !== id));
    }
  };

  const filteredSales = sales.filter(s => {
    const isVenda = s.status === 'Fechado';
    const matchTab = activeTab === "vendas" ? isVenda : !isVenda;
    if (!matchTab) return false;

    return s.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           s.professional_name?.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const formatMoney = (val: number) => val?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'R$ 0,00';

  const totalTicket = sales.filter(s => s.status === 'Fechado').reduce((acc, curr) => acc + (curr.ticket_total || 0), 0);
  const totalCommissions = sales.reduce((acc, curr) => acc + (curr.commission_value || 0), 0);

  return (
    <div className={`space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto pb-20 ${montserrat.className}`}>
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className={`text-3xl md:text-4xl text-white ${cormorant.className} italic font-bold`}>
            Gestão de <span className="text-[#CCA761]">Vendas</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1 uppercase tracking-widest font-bold">Resumo Financeiro & Resultados</p>
        </div>
        
        <Link 
          href="/dashboard/vendas/nova"
          className="relative flex items-center justify-center gap-2 bg-gradient-to-r from-[#CCA761] via-[#f1d58d] to-[#CCA761] hover:from-[#e3c27e] hover:via-[#ffe8ad] hover:to-[#e3c27e] text-[#111111] font-[800] py-3 px-6 rounded-lg transition-all duration-300 transform active:scale-95 text-sm shadow-[0_0_20px_rgba(204,167,97,0.2)] tracking-widest overflow-hidden"
        >
          <div className="absolute inset-0 -translate-x-full animate-[shimmer_2.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent skew-x-12" />
          <Plus size={18} strokeWidth={2.5} className="relative z-10" />
          <span className="relative z-10">NOVA VENDA / AGEND.</span>
        </Link>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#111] border border-[#222] p-6 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#CCA761]/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center gap-3 text-gray-400 mb-2">
            <DollarSign size={18} className="text-[#CCA761]" />
            <h3 className="text-xs uppercase tracking-widest font-bold">Total Fechado</h3>
          </div>
          <p className="text-3xl font-black text-white">{formatMoney(totalTicket)}</p>
          <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1"><TrendingUp size={12}/> Global este mês</p>
        </div>
        <div className="bg-[#111] border border-[#222] p-6 rounded-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-bl-full pointer-events-none" />
          <div className="flex items-center gap-3 text-gray-400 mb-2">
            <TrendingUp size={18} className="text-emerald-500" />
            <h3 className="text-xs uppercase tracking-widest font-bold">Comissões (SDR/Closer)</h3>
          </div>
          <p className="text-3xl font-black text-emerald-400">{formatMoney(totalCommissions)}</p>
          <p className="text-xs text-emerald-500 mt-2">Valor da força de vendas</p>
        </div>
        <div className="bg-[#111] border border-[#222] p-6 rounded-2xl relative overflow-hidden">
          <div className="flex items-center gap-3 text-gray-400 mb-2">
            <Briefcase size={18} className="text-blue-500" />
            <h3 className="text-xs uppercase tracking-widest font-bold">Contratos Ativos</h3>
          </div>
          <p className="text-3xl font-black text-white">{sales.filter(s => s.status === 'Fechado').length}</p>
          <p className="text-xs text-blue-400 mt-2">Fechamentos Concluídos</p>
        </div>
      </div>

      {/* Main Container */}
      <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 backdrop-blur-sm">
        
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-6">
          <div className="flex bg-[#0a0a0a] rounded-xl p-1.5 w-max border border-white/5 shadow-inner hidden sm:flex">
             <button 
               onClick={() => setActiveTab("vendas")} 
               className={`px-6 py-2.5 text-[10px] uppercase tracking-widest font-bold rounded-lg transition-all ${activeTab === 'vendas' ? 'bg-[#CCA761] text-[#0a0a0a] shadow-lg' : 'text-gray-500 hover:text-white'}`}
             >
               Contratos e Vendas
             </button>
             <button 
               onClick={() => setActiveTab("agendamentos")} 
               className={`px-6 py-2.5 text-[10px] uppercase tracking-widest font-bold rounded-lg transition-all ${activeTab === 'agendamentos' ? 'bg-[#CCA761] text-[#0a0a0a] shadow-lg' : 'text-gray-500 hover:text-white'}`}
             >
               Agendamentos (SDR)
             </button>
          </div>
          <div className="relative w-full sm:w-80 group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-[#CCA761] transition-colors" size={18} />
            <input 
              type="text" 
              placeholder="Buscar por cliente ou profissional..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-white rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-[#CCA761]/50 transition-colors"
            />
          </div>
        </div>

        {/* Tabelas de Vendas */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="border-b border-white/5">
                <th className="pb-4 pt-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-4">Cliente</th>
                <th className="pb-4 pt-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Profissional</th>
                <th className="pb-4 pt-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Valor do Contrato</th>
                <th className="pb-4 pt-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Data</th>
                <th className="pb-4 pt-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Status</th>
                <th className="pb-4 pt-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest text-right pr-4">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500">
                    <Loader2 size={24} className="animate-spin mx-auto text-[#CCA761] mb-2" />
                    Buscando vendas registradas...
                  </td>
                </tr>
              ) : filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-500 text-sm">
                    Nenhum registro encontrado. Registre uma nova venda ou agendamento de SDR.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => (
                  <tr key={sale.id} className="group hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 pl-4">
                      <p className="font-semibold text-white text-sm">{sale.client_name}</p>
                    </td>
                    <td className="py-4 whitespace-nowrap">
                      {(() => {
                         const prof = team.find(p => p.name === sale.professional_name);
                         return (
                           <div className="flex items-center gap-2">
                             <div className="w-8 h-8 rounded-full bg-[#1a1a1a] border border-[#333] flex items-center justify-center text-[10px] font-bold text-[#CCA761] overflow-hidden">
                                {prof?.avatarUrl ? (
                                   <img src={prof.avatarUrl} alt={sale.professional_name} className="w-full h-full object-cover" />
                                ) : (
                                   sale.professional_name?.charAt(0) || "P"
                                )}
                             </div>
                             <div className="flex flex-col">
                               <span className="text-gray-200 text-sm font-semibold tracking-wide">{sale.professional_name || "SDR"}</span>
                               {prof?.role && <span className="text-[9px] text-gray-500 uppercase font-bold tracking-widest">{prof.role}</span>}
                             </div>
                           </div>
                         );
                      })()}
                    </td>
                    <td className="py-4 whitespace-nowrap">
                      <p className="font-bold text-white text-sm">{formatMoney(sale.ticket_total)}</p>
                      <p className="text-[10px] text-[#CCA761]">Comissão: {formatMoney(sale.commission_value)}</p>
                    </td>
                    <td className="py-4 whitespace-nowrap">
                      <p className="text-gray-400 text-sm">
                        {sale.contract_date ? format(new Date(sale.contract_date), "dd 'de' MMM", { locale: ptBR }) : "--"}
                      </p>
                    </td>
                    <td className="py-4 whitespace-nowrap">
                       <span className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border ${
                         sale.status === 'Fechado' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : 
                         sale.status === 'Perdido' ? "bg-red-500/10 text-red-400 border-red-500/20" :
                         "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
                       }`}>
                         {sale.status}
                       </span>
                    </td>
                    <td className="py-4 pr-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-2 text-gray-500 hover:text-[#CCA761] hover:bg-[#CCA761]/10 rounded-lg transition-colors inline-flex">
                           <ArrowUpRight size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(sale.id, sale.client_name)}
                          className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors inline-flex"
                        >
                           <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
