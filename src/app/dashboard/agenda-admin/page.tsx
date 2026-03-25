"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { ShieldCheck, Search, Filter, Calendar, CheckCircle2, Clock, Sword, User, BrainCircuit } from "lucide-react";
import { Montserrat, Cormorant_Garamond } from "next/font/google";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "900"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });

export default function AgendaAdminPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const supabase = createClient();

  const fetchAllTasks = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsLoading(false);
      return;
    }
    const tenantId = user.user_metadata?.tenant_id || user.app_metadata?.tenant_id;

    if (tenantId) {
      const { data: allTasks } = await supabase
        .from('user_tasks')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (allTasks && allTasks.length > 0) setTasks(allTasks);
      else setTasks(getUnifiedTasks());
    } else {
      setTasks(getUnifiedTasks());
    }
    setIsLoading(false);
  };

  const getUnifiedTasks = () => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('@mayus:unified_tasks_v3');
    if (saved) return JSON.parse(saved);

    const now = new Date();
    const h = now.getHours();
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    const initial = [
      { id: "t1", time_text: pad(h) + ":00", title: "Daily de Alinhamento (Kickoff)", category: "Gestão", person: "Todos", type: "Reunião", color: "#f87171", status: "Pendente", active: true },
      { id: "t2", time_text: pad((h+1)%24) + ":00", title: "Review de Leads Cadenciados", category: "Comercial", person: "Equipe SDR", type: "Reunião", color: "#CCA761", status: "Pendente" },
      { id: "t3", time_text: pad((h+2)%24) + ":30", title: "Elaboração de Contrato Social", category: "Societário", person: "Dra. Mariana", type: "Documento", color: "#b4a0f8", status: "Pendente" },
      { id: "t4", time_text: pad((h+3)%24) + ":00", title: "Fechamento: Empresa Alpha", category: "Vendas", person: "Ana S.", type: "Call", color: "#CCA761", status: "Em andamento" },
      { id: "t5", time_text: pad((h+4)%24) + ":15", title: "Triagem de Protocolos PJe", category: "Judicial", person: "Paralegal", type: "Análise", color: "#22d3ee", status: "Pendente" },
      
      { id: "t6", time_text: pad((h)%24) + ":45", title: "Audiência de Conciliação Virtual", category: "URGENTE", person: "Você", type: "Audiência", color: "#f87171", status: "Pendente", active: true },
      { id: "t7", time_text: pad((h+1)%24) + ":30", title: "Responder cliente sobre Liminar", category: "ATENÇÃO", person: "Você", type: "Atendimento", color: "#CCA761", status: "Pendente" },
      { id: "t8", time_text: pad((h+3)%24) + ":00", title: "Revisar Distrato Societário Ouro", category: "ATENÇÃO", person: "Você", type: "Documento", color: "#CCA761", status: "Pendente" },
      { id: "t9", time_text: pad((h+5)%24) + ":15", title: "Ler Diário Oficial", category: "TRANQUILO", person: "Você", type: "Leitura", color: "#22d3ee", status: "Pendente" },
      { id: "t10", time_text: pad((h+7)%24) + ":45", title: "Atualizar CRM MAYUS", category: "ROTINA", person: "Você", type: "Sistema", color: "#9ca3af", status: "Pendente" },
    ];
    localStorage.setItem('@mayus:unified_tasks_v3', JSON.stringify(initial));
    return initial;
  };

  useEffect(() => {
    fetchAllTasks();

    if (typeof window !== 'undefined') {
       window.addEventListener('storage', fetchAllTasks);
    }

    // Listener de Tempo Real para o Painel da Chefia
    const channel = supabase
      .channel('realtime_admin_tasks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_tasks' },
        (payload) => {
          console.log("Uma tarefa mudou, atualizando visor Admin...", payload);
          fetchAllTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (typeof window !== 'undefined') {
         window.removeEventListener('storage', fetchAllTasks);
      }
    };
  }, []);

  // Agrupamento por Pessoa (Funcionário)
  const groupedTasks = useMemo(() => {
    const map: Record<string, any[]> = {};
    const filtered = tasks.filter(t => 
      t.title?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      t.person?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.forEach(task => {
      const personName = task.person || "Sem Responsável";
      if (!map[personName]) map[personName] = [];
      map[personName].push(task);
    });

    return Object.entries(map).sort((a, b) => b[1].length - a[1].length); // Maior número de tarefas primeiro
  }, [tasks, searchTerm]);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.status === 'Concluído').length;
  const pendingTasks = totalTasks - completedTasks;
  const aiGenerated = tasks.filter(t => t.created_by_ai).length; // Hypothetical flag if they have it, or just a mock stat

  return (
    <div className={`w-full max-w-7xl mx-auto space-y-8 pb-24 ${montserrat.className}`}>
      {/* Header Premium Chefia */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end pb-8 border-b border-red-500/20 relative z-40 gap-8">
        <div>
          <h1 className={`text-5xl lg:text-7xl text-red-500 mb-1 font-bold tracking-tight ${cormorant.className} italic drop-shadow-[0_0_20px_rgba(239,68,68,0.3)]`}>
            Auditoria de Agendas
          </h1>
          <div className="mt-4 flex items-center gap-3">
             <span className="bg-red-500/10 border border-red-500/30 text-red-500 text-[10px] font-black tracking-[0.2em] uppercase px-3 py-1 rounded shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                Nível de Acesso: Chefia Suprema
             </span>
             <span className="text-gray-400 text-xs tracking-widest uppercase font-bold">Modo de Fiscalização Global</span>
          </div>
        </div>

        {/* Resumo Rápido de Produtividade Global */}
        <div className="flex gap-4">
           <div className="bg-[#0a0a0a] border border-white/5 p-4 rounded-xl text-center min-w-[120px]">
              <span className="text-gray-500 text-[9px] uppercase tracking-widest font-black block mb-1">Total Equipe</span>
              <span className="text-3xl text-white font-light">{totalTasks}</span>
           </div>
           <div className="bg-[#0a0a0a] border border-green-500/20 p-4 rounded-xl text-center min-w-[120px] shadow-[inset_0_0_20px_rgba(34,197,94,0.05)]">
              <span className="text-green-500 text-[9px] uppercase tracking-widest font-black block mb-1">Concluídas</span>
              <span className="text-3xl text-green-400 font-light">{completedTasks}</span>
           </div>
           <div className="bg-[#0a0a0a] border border-[#CCA761]/20 p-4 rounded-xl text-center min-w-[120px] shadow-[inset_0_0_20px_rgba(204,167,97,0.05)]">
              <span className="text-[#CCA761] text-[9px] uppercase tracking-widest font-black block mb-1">Pendências</span>
              <span className="text-3xl text-[#CCA761] font-light">{pendingTasks}</span>
           </div>
        </div>
      </div>

      {/* Caixa de Pesquisa */}
      <div className="flex items-center gap-4 bg-[#050505] p-2 rounded-xl border border-white/10 shadow-lg">
        <div className="flex-1 flex items-center gap-3 px-4">
          <Search size={20} className="text-gray-500" />
          <input 
             type="text" 
             placeholder="Pesquisar por funcionário, título da tarefa, ou cliente..." 
             className="w-full bg-transparent border-none text-white outline-none placeholder:text-gray-600 font-medium"
             value={searchTerm}
             onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="bg-white/5 hover:bg-white/10 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors flex items-center gap-2">
           <Filter size={14} /> Filtros
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-red-500 border-t-transparent flex rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="space-y-8 animate-fade-in-up">
          {groupedTasks.length === 0 ? (
            <div className="text-center py-20 text-gray-500">Nenhuma tarefa encontrada no escopo da equipe.</div>
          ) : (
            groupedTasks.map(([person, personTasks], idx) => {
              const done = personTasks.filter(t => t.status === 'Concluído').length;
              const pend = personTasks.length - done;
              const prog = Math.round((done / personTasks.length) * 100);

              return (
                <div key={idx} className="bg-[#0a0a0a] border border-white/5 rounded-2xl overflow-hidden hover:border-white/10 transition-colors">
                  
                  {/* Cabelhaço do Colaborador */}
                  <div className="bg-gradient-to-r from-[#111] to-[#050505] p-5 border-b border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-[#1a1a1a] border border-white/10 flex items-center justify-center text-xl font-black text-gray-300">
                         {person.charAt(0)}
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-white tracking-tight">{person}</h2>
                        <div className="flex items-center gap-3 mt-1">
                           <span className="text-[10px] uppercase font-black tracking-widest text-[#CCA761]">{prog}% Concluído</span>
                           <span className="text-[10px] uppercase font-bold tracking-widest text-gray-500">{personTasks.length} Atividades Totais</span>
                        </div>
                      </div>
                    </div>

                    <div className="w-full sm:w-1/3 h-1.5 bg-black rounded-full overflow-hidden border border-white/5">
                       <div className="h-full bg-gradient-to-r from-red-500 via-[#CCA761] to-green-500 transition-all duration-1000" style={{ width: `${prog}%` }} />
                    </div>
                  </div>

                  {/* Grid de Tarefas Desse Colaborador */}
                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 bg-[#020202]">
                     {personTasks.map((t, i) => (
                        <div key={i} className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${t.status === 'Concluído' ? 'border-green-500/20 bg-green-500/5 opacity-50' : 'border-[#CCA761]/30 bg-[#CCA761]/5 shadow-[inset_0_0_15px_rgba(204,167,97,0.02)]'}`}>
                           <div>
                              <div className="flex justify-between items-start mb-3">
                                 <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-sm bg-black/50 border border-white/10 text-gray-300">
                                   {t.time_text || '--:--'}
                                 </span>
                                 <div className="flex items-center gap-2">
                                     {t.created_by_agent && (
                                       <span className="text-[#3b82f6] text-[9px] font-black uppercase tracking-widest flex items-center gap-1 bg-[#3b82f6]/10 px-1.5 py-0.5 rounded border border-[#3b82f6]/30" title="Criado pela IA (MAYUS / N8N)">
                                          <BrainCircuit size={10} /> IA
                                       </span>
                                     )}
                                     {t.status === 'Concluído' ? (
                                        <CheckCircle2 size={16} className="text-green-500" />
                                     ) : (
                                        <Clock size={14} className="text-[#CCA761]" />
                                     )}
                                 </div>
                              </div>
                              <h4 className={`text-sm font-bold tracking-wide ${t.status === 'Concluído' ? 'text-gray-500 line-through' : 'text-gray-200'}`}>{t.title}</h4>
                              {t.client_name && <p className="text-[10px] text-gray-500 font-semibold mt-2 uppercase">Ref: {t.client_name}</p>}
                           </div>
                           <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center">
                              <span className="text-[9px] font-black uppercase tracking-widest text-[#CCA761]">{t.category}</span>
                              <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600">{t.type}</span>
                           </div>
                        </div>
                     ))}
                  </div>

                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  );
}
