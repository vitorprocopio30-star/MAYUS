"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { ShieldCheck, Search, Filter, Calendar, CheckCircle2, Clock, Sword, User, BrainCircuit, Plus, X } from "lucide-react";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import { buildAgendaPayloadFromManualTask, buildAgendaPayloadFromMission, sortAgendaTasks, toAgendaEvent } from "@/lib/agenda/userTasks";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "900"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });

export default function AgendaAdminPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateMission, setShowCreateMission] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newUrgency, setNewUrgency] = useState<"URGENTE" | "ATENCAO" | "ROTINA" | "TRANQUILO">("ROTINA");
  const [newType, setNewType] = useState("Tarefa");
  const [newVisibility, setNewVisibility] = useState<"private" | "global">("global");
  const [newReminderOnly, setNewReminderOnly] = useState(false);
  const [newAssignedTo, setNewAssignedTo] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newReward, setNewReward] = useState("1000");
  const [isSaving, setIsSaving] = useState(false);
  const supabase = createClient();

  const fetchAllTasks = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle();

    if (!profile?.tenant_id) {
      setTasks([]);
      setIsLoading(false);
      return;
    }

    setTenantId(profile.tenant_id);

    const { data: teamProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: true });

    setProfiles((teamProfiles || []).filter((member: any) => member.is_active !== false));

    const { data: allTasks } = await supabase
      .from('user_tasks')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .or('visibility.eq.global,visibility.is.null');

    const normalized = sortAgendaTasks(allTasks || []).map(toAgendaEvent);
    setTasks(normalized);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchAllTasks();

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
   const aiGenerated = tasks.filter(t => t.created_by_agent).length;

  const resetCreateForm = () => {
    setNewTitle("");
    setNewDescription("");
    setNewUrgency("ROTINA");
    setNewType("Tarefa");
    setNewVisibility("global");
    setNewReminderOnly(false);
    setNewAssignedTo("");
    setNewDate(new Date().toISOString().slice(0, 10));
    setNewReward("1000");
  };

  const createAdminTask = async (kind: "task" | "mission") => {
    if (!tenantId || !newTitle.trim()) return;
    setIsSaving(true);
    try {
      const assignedName = profiles.find((p) => p.id === newAssignedTo)?.full_name || null;
      const { data: authData } = await supabase.auth.getUser();
      const createdBy = authData.user?.id || null;

      const payload = kind === "mission"
        ? buildAgendaPayloadFromMission({
            tenantId,
            title: newTitle.trim(),
            description: newDescription || null,
            assignedTo: newAssignedTo || null,
            assignedName,
            createdBy,
            createdByRole: "Administrador",
            urgency: newUrgency,
            rewardCoins: Number(newReward || "1000"),
            expiresAt: newDate ? `${newDate}T23:59:59.000Z` : null,
            visibility: newVisibility,
            showOnlyOnDate: newReminderOnly,
          })
        : buildAgendaPayloadFromManualTask({
            tenantId,
            title: newTitle.trim(),
            description: newDescription || null,
            assignedTo: newAssignedTo || null,
            assignedName,
            createdBy,
            createdByRole: "Administrador",
            urgency: newUrgency,
            scheduledFor: newDate ? `${newDate}T09:00:00.000Z` : null,
            type: newType,
            visibility: newVisibility,
            showOnlyOnDate: newReminderOnly,
          });

      const { error } = await supabase.from("user_tasks").insert(payload);
      if (error) throw error;

      setShowCreateTask(false);
      setShowCreateMission(false);
      resetCreateForm();
      fetchAllTasks();
    } finally {
      setIsSaving(false);
    }
  };

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
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => { resetCreateForm(); setShowCreateTask(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#111] border border-[#CCA761]/30 text-[#CCA761] text-xs font-black uppercase tracking-widest"
        >
          <Plus size={14} /> Nova tarefa (global)
        </button>
        <button
          onClick={() => { resetCreateForm(); setShowCreateMission(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#111] border border-red-500/40 text-red-400 text-xs font-black uppercase tracking-widest"
        >
          <Plus size={14} /> Nova missão
        </button>
      </div>

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

      {(showCreateTask || showCreateMission) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => { setShowCreateTask(false); setShowCreateMission(false); }} />
          <div className="relative w-full max-w-2xl rounded-2xl border border-[#CCA761]/20 bg-[#0a0a0a] p-6">
            <button className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 text-gray-400" onClick={() => { setShowCreateTask(false); setShowCreateMission(false); }}>
              <X size={16} />
            </button>
            <h3 className="text-lg text-white font-bold mb-4">{showCreateMission ? "Nova missão" : "Nova tarefa global"}</h3>
            <div className="space-y-3">
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Título" className="w-full bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Descrição" className="w-full bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-h-[90px]" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select value={newAssignedTo} onChange={(e) => setNewAssignedTo(e.target.value)} className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="">Sem responsável</option>
                  {profiles.map((member) => (
                    <option key={member.id} value={member.id}>{member.full_name || `Colaborador ${String(member.id).slice(0, 6)}`}</option>
                  ))}
                </select>
                <select value={newUrgency} onChange={(e) => setNewUrgency(e.target.value as any)} className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="URGENTE">Urgente</option>
                  <option value="ATENCAO">Atenção</option>
                  <option value="ROTINA">Rotina</option>
                  <option value="TRANQUILO">Tranquilo</option>
                </select>
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={newVisibility} onChange={(e) => setNewVisibility(e.target.value as any)} className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="global">Global (aparece na Agenda Global)</option>
                  <option value="private">Pessoal (somente do responsável)</option>
                </select>
                <label className="flex items-center gap-2 text-sm text-gray-300 bg-[#151515] border border-white/10 rounded-lg px-3 py-2">
                  <input type="checkbox" checked={newReminderOnly} onChange={(e) => setNewReminderOnly(e.target.checked)} />
                  Mostrar somente na data marcada (lembrete)
                </label>
              </div>
              {showCreateMission ? (
                <input value={newReward} onChange={(e) => setNewReward(e.target.value)} placeholder="Recompensa em coins" className="w-full bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              ) : (
                <select value={newType} onChange={(e) => setNewType(e.target.value)} className="w-full bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="Tarefa">Tarefa</option>
                  <option value="Prazo">Prazo</option>
                  <option value="Processo">Processo</option>
                  <option value="CRM">CRM</option>
                </select>
              )}
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => createAdminTask(showCreateMission ? "mission" : "task")}
                  disabled={isSaving || !newTitle.trim()}
                  className="bg-gradient-to-r from-[#CCA761] to-[#eadd87] text-black px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest disabled:opacity-50"
                >
                  {isSaving ? "Salvando..." : showCreateMission ? "Criar missão" : "Criar tarefa"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
