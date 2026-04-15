"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Clock, AlertCircle, Star, Wand2, Calendar, CheckCircle2, Trophy, Sword, Lock, Target, Coins, Crown } from "lucide-react";
import Link from "next/link";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import { useGamification } from "@/hooks/useGamification";
import { formatDateKey, sortAgendaTasks, toAgendaEvent, toDayRange } from "@/lib/agenda/userTasks";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass-card-premium rounded-2xl overflow-hidden p-6 relative group border border-[#CCA761]/10 bg-gradient-to-b from-[#111111]/90 to-[#050505]/90 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.4)] ring-1 ring-white/5 cursor-pointer hover:border-[#CCA761]/30 hover:shadow-[0_0_20px_rgba(204,167,97,0.15)] transition-all duration-500 ${className}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
      <div className="relative z-10 w-full h-full flex flex-col justify-between">
        {children}
      </div>
    </div>
  );
}

export default function AgendaGlobalPage() {
  const { enabled: gamificationEnabled } = useGamification();
  const [events, setEvents] = useState<any[]>([]);
  const [criticalDeadlines, setCriticalDeadlines] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewerName, setViewerName] = useState("Você");
  
  // Mock do departamento real do profissional logado
  const userDepartment: string = 'Comercial';
  
  const supabase = createClient();

  const dailyQuote = "O talento vence jogos, mas o trabalho em equipe e a inteligência vencem campeonatos.";

  const [selectedDate, setSelectedDate] = useState<string>(formatDateKey(new Date()));

  const WEEK_DAYS = useMemo(() => {
    const list = [];
    const today = new Date();
    const currentDay = today.getDay() || 7; // 1=Segunda, 7=Domingo
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - currentDay + 1); // Vai para Segunda
    
    const weekMap = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    for (let i = 0; i < 7; i++) {
       const d = new Date(startOfWeek);
       d.setDate(startOfWeek.getDate() + i);
        list.push({
           day: weekMap[d.getDay()],
           date: d.getDate().toString(),
           active: d.getDate() === today.getDate() && d.getMonth() === today.getMonth(),
           dateKey: formatDateKey(d),
        });
     }
     return list;
  }, []);

  const fetchTasks = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setEvents([]);
      setCriticalDeadlines([]);
      setIsLoading(false);
      return;
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    setViewerName(profile?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "Você");

    if (!profile?.tenant_id) {
      setEvents([]);
      setCriticalDeadlines([]);
      setIsLoading(false);
      return;
    }

    const { startIso, endIso } = toDayRange(selectedDate);
    const { data: userTasks } = await supabase
      .from('user_tasks')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .gte('scheduled_for', startIso)
      .lte('scheduled_for', endIso);

    const normalizedTasks = sortAgendaTasks(userTasks || []).map(toAgendaEvent).map((task: any) => {
      if (task.status === 'Concluído') return task;
      return { ...task, person: 'Equipe MAYUS' };
    });
    setEvents(normalizedTasks.filter((task: any) => !task.is_critical));
    setCriticalDeadlines(normalizedTasks.filter((task: any) => task.is_critical));
    setIsLoading(false);
  };

  // Substituído por getUnifiedTasks

  // Recarregar sempre que a data selecionada mudar
  useEffect(() => {
     fetchTasks();
  }, [selectedDate]);

  useEffect(() => {
    fetchTasks();
    
    const channel = supabase
      .channel('realtime_user_tasks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_tasks' },
        (payload) => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const toggleStatus = async (task: any) => {
    const newStatus = task.status === 'Concluído' ? 'Pendente' : 'Concluído';
    const { data: { user } } = await supabase.auth.getUser();
    const updatePayload: Record<string, any> = {
      status: newStatus,
      completed_at: newStatus === 'Concluído' ? new Date().toISOString() : null,
      completed_by: newStatus === 'Concluído' ? user?.id ?? null : null,
      completed_by_name_snapshot: newStatus === 'Concluído' ? viewerName : null,
    };

    await supabase.from('user_tasks').update(updatePayload).eq('id', task.id);

    setEvents(prev => prev.map(e => e.id === task.id ? { ...e, ...updatePayload, status: newStatus, person: newStatus === 'Concluído' ? viewerName : e.person } : e));
  };

  const stealTask = async (e: React.MouseEvent, task: any) => {
    e.stopPropagation(); // Avoid triggering toggleStatus

    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('user_tasks')
      .update({ assigned_to: user?.id ?? null, assigned_name_snapshot: viewerName })
      .eq('id', task.id);

    setEvents(prev => prev.map(ev => ev.id === task.id ? { ...ev, assigned_to: user?.id ?? null, assigned_name_snapshot: viewerName, person: viewerName, stolen: true } : ev));
  };

  const totalTasks = events.length;
  const completedTasks = useMemo(() => events.filter(e => e.status === 'Concluído').length, [events]);
  
  // RANKING EM TEMPO REAL COMPUTADO (MAYUS COINS)
  const rankingMap = useMemo(() => {
    return events.reduce<Record<string, number>>((acc, ev) => {
      const isComercial = ['Vendas', 'Comercial', 'CRM'].includes(ev.category);
      const isJuridico = ['Judicial', 'Societário', 'Tributário'].includes(ev.category);
      const isMarketing = ['Marketing', 'Social Media', 'Mídia', 'Design', 'Tráfego'].includes(ev.category);

      // Na tela principal, a gente força apenas a hierarquia do departamento logado!
      if (userDepartment === 'Comercial' && !isComercial) return acc;
      if (userDepartment === 'Jurídico' && !isJuridico) return acc;
      if (userDepartment === 'Marketing' && !isMarketing) return acc;

      // Inicializa carteira se não existir
      if (ev.person && acc[ev.person] === undefined) {
        acc[ev.person] = 0;
      }
      
      // Calcula moedas ganhas baseadas na categoria
      if (ev.status === 'Concluído' && ev.person) {
        const reward = ev.category === 'URGENTE' ? 100 : ev.category === 'ATENÇÃO' ? 50 : 20;
        acc[ev.person] += reward;
      }
      return acc;
    }, {});
  }, [events, userDepartment]);

  const leaderboard = useMemo(() => {
    return Object.entries(rankingMap)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .map(([name, score]) => ({ name: String(name), score: Number(score) }));
  }, [rankingMap]);

  // Preenche dados padrão se o placar estiver vazio para não desfigurar o layout base
  const displayLeaderboard = useMemo(() => {
    return leaderboard.length >= 3 ? leaderboard.slice(0, 3) : [
      ...leaderboard,
      ...[
        { name: "Suzi P.", score: 0 },
        { name: "Caio V.", score: 0 },
        { name: "Você", score: 0 }
      ].slice(0, 3 - leaderboard.length)
    ];
  }, [leaderboard]);
  
  const progress = useMemo(() => totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0, [totalTasks, completedTasks]);
  const isKilled = useMemo(() => totalTasks > 0 && completedTasks === totalTasks, [totalTasks, completedTasks]);

  const showProgressBar = completedTasks > 0;

  return (
    <div className={`w-full max-w-7xl mx-auto space-y-8 pb-24 ${montserrat.className}`}>

      {/* Header e Ranking Podium Top 3 */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end pb-8 border-b border-[#CCA761]/20 relative z-40 gap-8">
        <div>
          <h1 className={`text-5xl lg:text-7xl text-[#CCA761] mb-1 font-bold tracking-tight ${cormorant.className} italic drop-shadow-[0_0_20px_rgba(204,167,97,0.3)]`}>
            Agenda Global
          </h1>
          <div className="mt-6 relative bg-gradient-to-r from-[#CCA761]/15 via-transparent to-transparent pl-6 py-4 border-l-[4px] border-[#CCA761] max-w-3xl overflow-hidden group rounded-r-2xl">
             <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:opacity-100 transition-opacity duration-1000 pointer-events-none" />
             <p className={`text-[#eadd87] text-xl lg:text-3xl font-semibold tracking-wide ${cormorant.className} italic drop-shadow-md leading-relaxed`}>
                &quot;{dailyQuote}&quot;
             </p>
          </div>
        </div>

        {/* PODIUM TOP 3 DINÂMICO & HALL DA FAMA */}
        {gamificationEnabled && (
          <div className="flex flex-col items-center xl:items-end w-full xl:w-auto mt-6 xl:mt-0 gap-4">
            <div className="flex items-center justify-center w-full pb-2">
              <div className="flex items-center gap-2">
                <Trophy size={20} className="text-[#CCA761] animate-pulse shrink-0" />
                <h3 className="text-[#a1a1aa] text-xs sm:text-sm font-black uppercase tracking-[0.2em] relative whitespace-nowrap">
                  RANKING <span className="text-[#CCA761]">TOP 3</span>
                  <div className="absolute -bottom-1 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#CCA761]/50 to-transparent" />
                </h3>
              </div>
            </div>
            
            <div className="flex gap-4 w-full justify-center overflow-x-auto pb-4 pt-6 px-2 xl:pb-0 hide-scrollbar items-end mt-2">
               {displayLeaderboard.map((player, index) => {
                 const isFirst = index === 0;
                 const isSecond = index === 1;
                 const isThird = index === 2;
                 
                 let colors = {
                   bg: "from-[#CCA761]/20 to-[#0a0a0a]",
                   border: "border-[#CCA761]/50",
                   tagBg: "bg-gradient-to-r from-[#CCA761] to-[#eadd87]",
                   tagText: "text-[#0a0a0a]",
                   avatarBorder: "border-[#CCA761]",
                   avatarText: "text-[#CCA761]",
                   avatarShadow: "shadow-[inset_0_0_10px_rgba(204,167,97,0.5)]",
                   cardShadow: "shadow-[0_0_20px_rgba(204,167,97,0.2)]",
                   nameText: "text-white",
                   scoreText: "text-[#CCA761]"
                 };
                 
                 if (isSecond) {
                   colors = {
                     bg: "from-gray-400/20 to-[#0a0a0a]",
                     border: "border-gray-400/30",
                     tagBg: "bg-gradient-to-r from-gray-300 to-gray-500",
                     tagText: "text-[#0a0a0a]",
                     avatarBorder: "border-gray-400",
                     avatarText: "text-gray-300",
                     avatarShadow: "shadow-[inset_0_0_10px_rgba(156,163,175,0.4)]",
                     cardShadow: "",
                     nameText: "text-gray-200",
                     scoreText: "text-gray-400"
                   };
                 } else if (isThird) {
                   colors = {
                     bg: "from-[#cd7f32]/20 to-[#0a0a0a]",
                     border: "border-[#cd7f32]/30",
                     tagBg: "bg-gradient-to-r from-[#cd7f32] to-[#a05a1f]",
                     tagText: "text-white",
                     avatarBorder: "border-[#cd7f32]",
                     avatarText: "text-[#cd7f32]",
                     avatarShadow: "shadow-[inset_0_0_10px_rgba(205,127,50,0.4)]",
                     cardShadow: "",
                     nameText: "text-gray-300",
                     scoreText: "text-[#cd7f32]"
                   };
                 }
                 
                 return (
                   <div key={index} className={`flex flex-col items-center bg-gradient-to-b ${colors.bg} border ${colors.border} rounded-xl p-3 w-[22vw] min-w-[90px] max-w-[110px] sm:w-auto ${colors.cardShadow} relative hover:-translate-y-2 transition-transform cursor-pointer`}>
                      <div className={`absolute -top-3.5 ${colors.tagBg} ${colors.tagText} text-[10px] font-black px-3 py-0.5 rounded-full shadow-lg border border-white/20 whitespace-nowrap`}>{index + 1}º LUGAR</div>
                      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0a0a0a] border-[2px] sm:border-[3px] ${colors.avatarBorder} mt-2 flex items-center justify-center font-black ${colors.avatarText} ${colors.avatarShadow} text-lg`}>{String(player.name || '').charAt(0)}</div>
                      <span className={`${colors.nameText} text-[10px] sm:text-[11px] font-bold mt-2 uppercase text-center truncate w-full px-1 sm:px-2`} title={player.name}>{String(player.name)}</span>
                      <span className={`${colors.scoreText} text-[10px] sm:text-[11px] font-black italic mt-0.5 tracking-tighter`}>{Number(player.score)} MC</span>
                   </div>
                 );
               })}
            </div>
            
            <div className="flex justify-center w-full mt-2">
              <Link href="/dashboard/hall-da-fama" className="flex justify-center items-center gap-2 px-6 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-[#CCA761] to-[#eadd87] text-[#0a0a0a] rounded-xl font-black uppercase tracking-[0.2em] text-[10px] sm:text-xs shadow-[0_0_20px_rgba(204,167,97,0.3)] hover:scale-105 transition-transform cursor-pointer overflow-hidden relative group border border-[#CCA761]/50 whitespace-nowrap">
                 <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 skew-x-12" />
                 <Crown size={18} className="animate-pulse" /> HALL DA FAMA TOTAL
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-8 animate-fade-in-up">
        {/* Seletor de Semana Premium */}
        <div className="flex justify-between items-center gap-2 p-1 bg-white/5 rounded-2xl border border-white/10 shadow-inner overflow-x-auto hide-scrollbar">
          {WEEK_DAYS.map((d, i) => {
            const active = d.dateKey === selectedDate;
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(d.dateKey)}
                className={`min-w-[70px] flex-1 flex flex-col items-center py-4 rounded-xl transition-all ${active ? 'bg-[#CCA761] text-[#0a0a0a] shadow-[0_0_20px_rgba(204,167,97,0.3)]' : 'hover:bg-white/5 text-gray-500 hover:text-white'}`}
              >
                <span className="text-[10px] font-black uppercase tracking-tighter mb-1">{d.day}</span>
                <span className="text-xl font-black italic">{d.date}</span>
                {active && <div className="w-1 h-1 bg-[#0a0a0a] rounded-full mt-2" />}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-[#CCA761] border-t-transparent flex rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Timeline e Tarefas Restantes */}
            <div className="lg:col-span-2 space-y-6">

              {/* PAINEL MAYUS: BOUNTIES DIÁRIOS */}
              {gamificationEnabled && (
                <div className="relative p-[1px] rounded-xl bg-gradient-to-r from-[#ef4444] via-[#CCA761] to-[#ef4444] animate-pulse mb-8 overflow-hidden group shadow-[0_0_30px_rgba(239,68,68,0.2)]">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#ef4444]/20 via-[#CCA761]/30 to-[#ef4444]/20 blur-xl" />
                  <div className="bg-[#050505]/95 backdrop-blur-xl rounded-xl p-5 md:p-6 w-full relative z-10">
                    <div className="flex flex-col md:flex-row items-center gap-6 justify-between">
                      
                      <div className="flex flex-col items-center md:items-start text-center md:text-left gap-3 w-full md:w-3/4">
                         <span className="flex items-center justify-center md:justify-start gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-[#ef4444] bg-[#ef4444]/10 px-3 py-1 rounded w-fit border border-[#ef4444]/30 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                           <Target size={12} className="animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" /> OPORTUNIDADE ESPECIAL
                         </span>
                         <h3 className="text-white text-lg md:text-xl font-bold tracking-tight">Recuperação de Ouro Frio</h3>
                         <p className="text-xs sm:text-sm text-gray-400 font-medium leading-relaxed italic"><strong className="text-[#CCA761]">Aviso do MAYUS:</strong> &quot;Detectei muitos Leads Premium do Comercial parados há mais de 10 dias esperando contato. O primeiro SDR/Closer que puxar 10 ligações agora e fechar a jornada no CRM leva todas as moedas.&quot;</p>
                      </div>
  
                      <div className="w-full md:w-1/4 flex flex-col items-center justify-center gap-3 border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 pl-0 md:pl-4">
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-1">Recompensa</span>
                          <div className="flex items-center gap-2 text-[#CCA761] font-black text-2xl h-8 drop-shadow-[0_0_10px_rgba(204,167,97,0.5)]">
                            +1.000 <Coins size={20} className="animate-pulse text-[#FFD700]" />
                          </div>
                        </div>
                        <button className="w-full bg-gradient-to-r from-[#ef4444] to-[#b91c1c] text-white text-[10px] sm:text-xs font-black uppercase tracking-widest py-2.5 rounded-lg hover:scale-105 transition-transform shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-[#fca5a5]/30 mt-2">
                          Assumir Missão
                        </button>
                      </div>
  
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 bg-gradient-to-r from-[#111111] to-transparent rounded-xl border-l-[3px] border-[#CCA761] mb-6 shadow-md gap-4">
                <h3 className="text-sm font-black tracking-widest uppercase flex items-center gap-3 bg-gradient-to-r from-[#CCA761] to-[#f1d58d] bg-clip-text text-transparent">
                  <Clock size={18} className="text-[#CCA761] drop-shadow-[0_0_8px_rgba(204,167,97,0.8)]" /> Compromisos do Dia
                </h3>
                <div className="flex gap-2">
                  <button className="text-[10px] text-gray-400 font-bold uppercase tracking-widest bg-white/5 px-3 py-1 rounded-lg border border-white/5 whitespace-nowrap">Ao Vivo (Realtime)</button>
                  <button className="text-[10px] text-[#CCA761] font-bold uppercase tracking-widest border border-[#CCA761]/30 hover:bg-[#CCA761]/10 transition-colors px-3 py-1 rounded-lg">Filtros</button>
                </div>
              </div>

              {/* BARRA DE PROGRESSO ANIMADA */}
              {showProgressBar && (
                <div className="mb-6 p-4 rounded-xl border border-white/5 bg-gradient-to-r from-[#111] to-[#0a0a0a] flex flex-col gap-3 relative overflow-hidden group animate-fade-in-up">
                  <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 transition-colors duration-1000 ${isKilled ? 'bg-[#4ade80]/20' : 'bg-[#CCA761]/10'}`}></div>

                  <div className="flex justify-between items-center relative z-10">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Aproveitamento Diário</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-2xl font-black text-white">{completedTasks} <span className="text-sm text-gray-500 font-normal">/ {totalTasks}</span></span>
                        {/* MENSAGEM DE PARABÉNS QUANDO 100% */}
                        {isKilled && (
                          <span className="flex items-center gap-1.5 bg-[#4ade80]/10 text-[#4ade80] text-[11px] font-black uppercase px-3 py-1 rounded border border-[#4ade80]/50 shadow-[0_0_15px_rgba(74,222,128,0.3)] animate-bounce">
                            <CheckCircle2 size={14} /> PARABÉNS AO TIME! DIA CONCLUÍDO 🎯
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className={`text-3xl font-black italic tracking-tighter ${isKilled ? 'text-[#4ade80] drop-shadow-[0_0_15px_rgba(74,222,128,0.3)] scale-110 transition-transform' : 'text-[#CCA761]'}`}>{progress}%</span>
                    </div>
                  </div>

                  {/* BARRA COM ANIMAÇÃO DE LOADING */}
                  <div className="w-full h-2 bg-[#111] rounded-full overflow-hidden border border-white/5 relative z-10 transition-all">
                    <div
                      className={`absolute top-0 left-0 bottom-0 transition-all duration-1000 ease-out ${isKilled ? 'bg-[#4ade80] shadow-[0_0_15px_rgba(74,222,128,0.8)]' : 'bg-[#CCA761]'}`}
                      style={{ width: `${progress}%` }}
                    >
                      {!isKilled && (
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent w-[200%] animate-[shimmer_2s_infinite] -translate-x-full" />
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4 lg:gap-6 pb-4">
                {events.filter(e => e.status !== 'Concluído').length === 0 ? (
                  <div className="col-span-full text-center py-12 text-gray-500 text-sm">Todas as atividades pendentes foram concluídas.</div>
                ) : events.filter(e => e.status !== 'Concluído').map((ev, i) => {
                  const active = ev.active || false;
                  const bdgColor = ev.color || '#CCA761';

                  const cardBgClass = 'bg-[#050505] hover:bg-[#0a0a0a] opacity-80 hover:opacity-100';

                  return (
                    <div key={`pend-${i}`} className={`group relative transition-all duration-500`}>
                      <div
                        onClick={() => toggleStatus(ev)}
                        className={`flex flex-col justify-start gap-4 p-4 rounded-xl border transition-all duration-500 cursor-pointer relative ${cardBgClass} min-h-[160px] h-full mt-4 group-hover:-translate-y-1 shadow-lg hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)]`}
                        style={{ borderColor: `${bdgColor}50`, borderTopWidth: '2px', borderTopColor: bdgColor }}
                      >
                        {/* Alfinete Push Pin Misto (Realista 3D com Neon Sutil) */}
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 z-30 transform group-hover:-translate-y-1 group-hover:scale-110 transition-all duration-300 shadow-transparent flex items-end justify-center" style={{ filter: `drop-shadow(0 6px 4px rgba(0,0,0,0.5)) drop-shadow(0 0 8px ${bdgColor}80)` }}>
                           <svg width="38" height="38" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="block origin-bottom overflow-visible" style={{ transform: "rotateX(55deg) rotateZ(40deg) translateY(-4px)" }}>
                             <defs>
                               <linearGradient id={`pinBodyGrad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                 <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
                                 <stop offset="30%" stopColor={bdgColor} />
                                 <stop offset="85%" stopColor={bdgColor} />
                                 <stop offset="100%" stopColor="#050505" />
                               </linearGradient>
                               <linearGradient id={`needleGrad-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                                 <stop offset="0%" stopColor="#666" />
                                 <stop offset="50%" stopColor="#eee" />
                                 <stop offset="100%" stopColor="#333" />
                               </linearGradient>
                             </defs>
                             {/* Agulha - Usando RECT em vez de Path/Line para evitar bug de WebKit sumindo com width=0 */}
                             <rect x="11.2" y="16" width="1.6" height="8" rx="0.5" fill={`url(#needleGrad-${i})`} />
                             {/* Sombra da Agulha */}
                             <rect x="12.2" y="16" width="0.6" height="8" fill="#000" fillOpacity="0.4" />
                             
                             {/* Corpo da Tachinha Clássica */}
                             <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" fill={`url(#pinBodyGrad-${i})`} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
                             
                             {/* Brilho 3D Oval no Topo (Chapéu) */}
                             <path d="M8 3 Q12 1.5 16 3 Q12 3.5 8 3" fill="#ffffff" fillOpacity="0.6" />
                             {/* Brilho 3D Superior (Luz) */}
                             <path d="M6 15 Q12 14.5 18 15" stroke="#ffffff" strokeWidth="1" strokeOpacity="0.5" fill="none" />
                           </svg>
                        </div>
                          
                        <div className="flex flex-col relative z-10 pt-4 gap-2 flex-grow">
                           <div className="flex flex-col items-start gap-2">
                             <div className="flex items-center gap-1.5 flex-wrap">
                               <span
                                 className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shadow-sm backdrop-blur-sm shadow-[#0a0a0a]"
                                 style={{ color: bdgColor, backgroundColor: `${bdgColor}20`, border: `1px solid ${bdgColor}40` }}
                               >
                                 {ev.category}
                               </span>
                               <span className={`text-[8px] font-bold uppercase tracking-widest text-[#a1a1aa]`}>• {ev.type}</span>
                               
                               {ev.stolen && (
                                 <span className="text-[8px] font-black uppercase tracking-widest text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/40 px-1.5 py-0.5 rounded animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.2)]">Roubado!</span>
                               )}
                             </div>
                             
                             {/* BADGE DE RECOMPENSA (MAYUS COINS) */}
                             {gamificationEnabled && (
                               <div className="flex">
                                 <span className={`text-[8px] font-black uppercase tracking-widest flex items-center gap-1 border rounded px-2 py-0.5 text-[#CCA761] border-[#CCA761]/30 bg-[#CCA761]/10 shadow-[0_0_10px_rgba(204,167,97,0.2)]`}>
                                   +{ev.category === 'URGENTE' ? 100 : ev.category === 'ATENÇÃO' ? 50 : 20} <Coins size={8} className="text-[#FFD700]" />
                                 </span>
                               </div>
                             )}
                           </div>
                           <h4 className={`text-sm font-bold tracking-wide transition-colors duration-500 text-white line-clamp-3 leading-snug break-words pr-2 mt-1 ${ev.stolen ? 'text-[#ef4444]' : ''}`}>{ev.title}</h4>
                        </div>
                        
                        {/* Steal Task Overlay System */}
                        {ev.person !== "Você" && ev.status === "Em andamento" && (
                          <div className="absolute top-2 right-2 p-1.5 bg-[#0a0a0a]/90 backdrop-blur-md rounded-lg border border-[#CCA761]/50 flex items-center gap-1.5 shadow-[0_0_15px_rgba(204,167,97,0.3)] z-50 group-hover:bg-[#CCA761]/10 transition-colors tooltip-group">
                             <Lock size={12} className="text-[#CCA761]" />
                             <span className="text-[9px] font-black uppercase text-[#CCA761] tracking-widest hidden group-hover:block transition-all max-w-[120px] text-right leading-tight drop-shadow-md">Trabalho em Desenvolvimento</span>
                          </div>
                        )}

                        {gamificationEnabled && ev.person !== "Você" && ev.status !== "Em andamento" && (
                          <div className="absolute bottom-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-50">
                            <button 
                              onClick={(e) => stealTask(e, ev)}
                              title="Assumir tarefa pendente"
                              className="flex items-center gap-1.5 bg-gradient-to-r from-[#ef4444] to-[#b91c1c] text-white px-3 py-1.5 rounded-lg border border-[#fca5a5]/50 shadow-[0_0_15px_rgba(239,68,68,0.5)] hover:scale-105 hover:-translate-y-1 transition-all group/btn"
                            >
                              <Sword size={12} className="group-hover/btn:animate-[bounce_0.5s_ease-in-out_infinite]" />
                              <span className="text-[8px] font-black tracking-widest uppercase">Roubar</span>
                            </button>
                          </div>
                        )}

                      </div>
                    </div>
                  )
                })}
              </div>

              {/* MURAL DAS VITÓRIAS */}
              {events.filter(e => e.status === 'Concluído').length > 0 && (
                <div className="mt-8 animate-fade-in-up">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 bg-gradient-to-r from-[#4ade80]/10 to-transparent rounded-xl border-l-[3px] border-[#4ade80] mb-6 shadow-md gap-4">
                    <h3 className="text-sm font-black tracking-widest uppercase flex items-center gap-3 text-[#4ade80]">
                      <Star size={18} className="drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]" /> Mural das Vitórias
                    </h3>
                  </div>

                  <div className="space-y-3 pb-10">
                    {events.filter(e => e.status === 'Concluído').map((ev, i) => {
                      const active = ev.active || false;
                      const bdgColor = ev.color || '#CCA761';
                      const cardBgClass = 'border-[#4ade80]/30 bg-[#111] hover:bg-[#151515] shadow-[0_0_20px_rgba(74,222,128,0.05)]';

                      return (
                        <div key={`done-${i}`} className={`group relative flex items-center gap-4 transition-all duration-500 -translate-y-0.5`}>
                          <div className="w-14 text-right shrink-0">
                            <span className="text-base font-black italic tracking-tighter text-gray-500">{ev.time_text}</span>
                          </div>

                          <div onClick={() => toggleStatus(ev)} className={`flex-1 flex items-center justify-between p-4 rounded-xl border transition-all duration-500 cursor-pointer overflow-hidden relative ${cardBgClass}`}>
                            <div className="flex items-center gap-4 relative z-10">
                              <div className="w-1 h-12 rounded-full transition-all duration-500" style={{ backgroundColor: '#4ade80', boxShadow: '0 0 10px rgba(74,222,128,0.5)' }} />
                                <div className="flex flex-col items-start gap-2 mb-2 w-full pr-16 sm:pr-24">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-sm backdrop-blur-sm" style={{ color: bdgColor, backgroundColor: `${bdgColor}15`, border: `1px solid ${bdgColor}40`, textShadow: `0 0 8px ${bdgColor}80` }}>
                                      {ev.category}
                                    </span>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">• {ev.type}</span>
                                  </div>
                                  
                                  {/* BADGE DE RECOMPENSA (MAYUS COINS) Concluída */}
                                  {gamificationEnabled && (
                                    <div className="flex">
                                      <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1 border rounded px-2 py-0.5 text-gray-500 border-gray-600 bg-white/5 shadow-none">
                                        +{ev.category === 'URGENTE' ? 100 : ev.category === 'ATENÇÃO' ? 50 : 20} <Coins size={10} />
                                      </span>
                                    </div>
                                  )}
                                  
                                  <h4 className="text-sm font-bold tracking-wide transition-colors duration-500 text-[#4ade80] line-through decoration-[#4ade80]/50 mt-1">{ev.title}</h4>
                                </div>
                              </div>
                            
                            <div className="text-right hidden sm:block relative z-10 flex-col items-end opacity-20 hover:opacity-100 transition-opacity duration-300">
                              <p className="text-[9px] font-bold uppercase tracking-widest mb-1 border-b pb-0.5 text-[#4ade80] border-[#4ade80]/30 inline-block text-right w-auto ml-auto">Herói da Tarefa</p>
                              <p className="text-xs font-black tracking-widest text-white uppercase mt-0.5">{ev.person}</p>
                            </div>

                            <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/4 opacity-10">
                              <CheckCircle2 size={100} className="text-[#4ade80]" />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Painel Lateral */}
            <div className="space-y-6">
              <GlassCard className="border border-[#f87171]/20 bg-gradient-to-b from-[#0a0a0a] to-[#140a0a]">
                <h4 className="text-[10px] text-[#f87171] font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                  <AlertCircle size={14} /> Prazos Críticos (Escritório)
                </h4>
                <div className="space-y-4">
                  {criticalDeadlines.length === 0 ? (
                    [
                      { title: "Contestação Vencendo", client: "Silva & Irmãos", time: "Hoje, 18h", color: "#f87171" },
                      { title: "Recurso Especial", client: "Alpha Group", time: "Amanhã, 12h", color: "#CCA761" },
                      { title: "Réplica Trabalhista", client: "Individual", time: "Sex, 24/03", color: "#22d3ee" }
                    ].map((p, i) => (
                      <div key={i} className="p-4 bg-black/40 rounded-xl border border-white/5 hover:border-white/10 transition-colors opacity-80">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-white">{p.title}</span>
                          <span className="text-[8px] font-black text-[#0a0a0a] px-2 py-0.5 rounded-sm uppercase" style={{ backgroundColor: p.color }}>{p.time}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-semibold tracking-wide">Cliente: {p.client}</p>
                      </div>
                    ))
                  ) : (
                    criticalDeadlines.map((p, i) => (
                      <div key={i} className="p-4 bg-black/40 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-white">{p.title}</span>
                          <span className="text-[8px] font-black text-[#0a0a0a] px-2 py-0.5 rounded-sm uppercase" style={{ backgroundColor: p.color || '#f87171' }}>{p.time_text}</span>
                        </div>
                        <p className="text-[10px] text-gray-500 font-semibold tracking-wide">Cliente: {p.client_name || '-'}</p>
                      </div>
                    ))
                  )}
                </div>
              </GlassCard>

              <div className="p-6 rounded-2xl border border-[#CCA761]/30 bg-gradient-to-br from-[#CCA761]/20 to-transparent">
                <Star className="text-[#CCA761] mb-4" size={24} />
                <h5 className="text-sm font-bold text-white mb-2 tracking-wide">Insight da Inteligência (MAYUS)</h5>
                <p className="text-[11px] text-gray-400 leading-relaxed italic font-medium">&quot;Doutor, você tem 3 audiências seguidas na quarta-feira. Recomendo revisar os relatórios de pauta agora para evitar sobrecarga operativa.&quot;</p>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
