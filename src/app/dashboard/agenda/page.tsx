"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import confetti from "canvas-confetti";
import { Clock, AlertCircle, Star, Wand2, Calendar, CheckCircle2, Trophy, Coins, Gift, Lock, Unlock } from "lucide-react";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import { useGamification } from "@/hooks/useGamification";

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

export default function AgendaDiariaPage() {
  const { enabled: gamificationEnabled } = useGamification();
  const [events, setEvents] = useState<any[]>([]);
  const [criticalDeadlines, setCriticalDeadlines] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState("Líder");
  const [myCoins, setMyCoins] = useState(1250);
  const [showCoinAnim, setShowCoinAnim] = useState(false);
  const [donated, setDonated] = useState(false);
  const supabase = createClient();

  const MOTIVATIONAL_QUOTES = [
    "A disciplina converte a avalanche de trabalho em faturamento livre.",
    "Pequenas vitórias metódicas erguem o império da sua carreira.",
    "A excelência não é um ato, mas um hábito diário. Continue avançando.",
    "Foque no seu controle imediato: A próxima tarefa do backlog.",
    "Um dia dominado no sistema vale mais do que uma semana de desculpas.",
    "O sucesso é o resultado direto de não transferir obrigações para amanhã.",
    "Grandes profissionais não dependem de sorte, eles seguem a esteira de execução.",
    "A sua reputação começa na entrega impiedosa daquilo que prometeu no prazo.",
    "Quem resolve problemas vira líder. Quem levanta desculpas, despenca.",
    "Agir quando você não tem vontade é a única métrica que separa profissionais de amadores."
  ];
  const dailyQuote = MOTIVATIONAL_QUOTES[(new Date().getDate() - 1) % MOTIVATIONAL_QUOTES.length];
  
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const [selectedDate, setSelectedDate] = useState<number>(new Date().getDate());
  const calendarRef1 = useRef<HTMLInputElement>(null);
  const calendarRef2 = useRef<HTMLInputElement>(null);

  const openCalendar1 = () => {
    if (calendarRef1.current) {
       if ('showPicker' in HTMLInputElement.prototype) {
          // @ts-ignore
          calendarRef1.current.showPicker();
       } else {
          calendarRef1.current.focus();
       }
    }
  };

  const openCalendar2 = () => {
    if (calendarRef2.current) {
       if ('showPicker' in HTMLInputElement.prototype) {
          // @ts-ignore
          calendarRef2.current.showPicker();
       } else {
          calendarRef2.current.focus();
       }
    }
  };

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
          fullDate: d
       });
    }
    return list;
  }, []);

  // Substituto limpo para garantir que mock events não travem mais a interface

  // UNIFIED MOCK DA MAYUS SYSTEM
  const getUnifiedTasks = () => {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('@mayus:unified_tasks_v3');
    if (saved) return JSON.parse(saved);

    const now = new Date();
    const h = now.getHours();
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    // Gera tarefas dinâmicas usando o fuso horário atual
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

  const fetchTasks = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    // Sempre pega da unificada para funcionar 100% perfeitamente no Demo
    const allUnified = getUnifiedTasks();
    const myTasks = allUnified.filter((t: any) => t.person === 'Você' || t.person === 'Todos');
    
    // Ordena
    const sortedTasks = myTasks.sort((a: any, b: any) => {
      const priorityOrder: Record<string, number> = { 'URGENTE': 1, 'ATENÇÃO': 2, 'ROTINA': 3 };
      const aHasTime = a.time_text && a.time_text.trim() !== "" && a.time_text !== "--:--";
      const bHasTime = b.time_text && b.time_text.trim() !== "" && b.time_text !== "--:--";

      if (!aHasTime && bHasTime) return -1;
      if (aHasTime && !bHasTime) return 1;
      if (!aHasTime && !bHasTime) {
         const pA = priorityOrder[a.category?.toUpperCase()] || 99;
         const pB = priorityOrder[b.category?.toUpperCase()] || 99;
         if (pA !== pB) return pA - pB;
      }
      if (aHasTime && bHasTime) {
         return a.time_text.localeCompare(b.time_text);
      }
      return 0;
    });

    // Filtragem por Data Ativa: Só mostra as tarefas se a data selecionada for "Hoje". 
    // Em produção, as tarefas teriam campo "date" no banco e o filtro usaria o "selectedDate".
    const isTodaySelected = selectedDate === new Date().getDate();

    if (!isTodaySelected) {
       setEvents([]);
       setCriticalDeadlines([]);
       setIsLoading(false);
       return;
    }

    setEvents(sortedTasks.filter((t: any) => !t.is_critical));
    setCriticalDeadlines(sortedTasks.filter((t: any) => t.is_critical));
    
    // Simular nome e carregamento real
    if (user) {
      const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || "Líder";
      setUserName(name);
    }
    
    setIsLoading(false);
  };

  // Recarregar sempre que a data selecionada mudar
  useEffect(() => {
     fetchTasks();
  }, [selectedDate]);

  useEffect(() => {
    fetchTasks();
    if (typeof window !== 'undefined') {
       const savedCoins = localStorage.getItem('mayusCoins');
       if (savedCoins) setMyCoins(parseInt(savedCoins, 10));
       if (localStorage.getItem('didDonate') === 'true') setDonated(true);
       
       // EVENTO TEMPO REAL: Escuta mudanças feitas em outras abas (Ex: Agenda Global)
       window.addEventListener('storage', fetchTasks);
    }

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
      if (typeof window !== 'undefined') {
         window.removeEventListener('storage', fetchTasks);
      }
    };
  }, []);

  const toggleStatus = async (task: any) => {
    const newStatus = task.status === 'Concluído' ? 'Pendente' : 'Concluído';
    
    // Gamification Hook: Reward the user with coins
    if (newStatus === 'Concluído') {
      const reward = task.category === 'URGENTE' ? 100 : task.category === 'ATENÇÃO' ? 50 : 20;
      setMyCoins(prev => {
        const nc = prev + reward;
        if (typeof window !== 'undefined') localStorage.setItem('mayusCoins', nc.toString());
        return nc;
      });
      
      confetti({
        particleCount: 30,
        spread: 60,
        origin: { y: 0.8 },
        colors: ['#CCA761', '#ffffff', '#FFD700']
      });
      
      setShowCoinAnim(true);
      setTimeout(() => setShowCoinAnim(false), 2000);
    }
    
    // Atualiza Unified Source of Truth
    if (typeof window !== 'undefined') {
       const allUnified = JSON.parse(localStorage.getItem('@mayus:unified_tasks_v3') || '[]');
       const updatedUnified = allUnified.map((e: any) => e.id === task.id ? { ...e, status: newStatus } : e);
       localStorage.setItem('@mayus:unified_tasks_v3', JSON.stringify(updatedUnified));
       
       // Force trigger local to sync immediately alongside remote
       window.dispatchEvent(new Event('storage'));
    }
    
    // Atualiza Visual Local para Feedback Imediato
    setEvents(prev => prev.map(e => e.id === task.id ? { ...e, status: newStatus } : e));
  };

  const lockTask = (e: React.MouseEvent, task: any) => {
    e.stopPropagation();
    
    setEvents(prev => {
      const activeLocks = prev.filter(ev => ev.status === 'Em andamento').length;
      if (task.status !== 'Em andamento' && activeLocks >= 3) {
        alert("🔒 Acesso Negado: Você só pode trabalhar ativamente em no máximo 3 tarefas ao mesmo tempo para evitar bloqueio excessivo na mesa.");
        return prev;
      }
      
      const newStatus = task.status === 'Em andamento' ? 'Pendente' : 'Em andamento';
      
      // Atualiza Unified Source of Truth
      if (typeof window !== 'undefined') {
         const allUnified = JSON.parse(localStorage.getItem('@mayus:unified_tasks_v3') || '[]');
         const updatedUnified = allUnified.map((e: any) => e.id === task.id ? { ...e, status: newStatus } : e);
         localStorage.setItem('@mayus:unified_tasks_v3', JSON.stringify(updatedUnified));
         window.dispatchEvent(new Event('storage'));
      }
      
      return prev.map(ev => ev.id === task.id ? { ...ev, status: newStatus } : ev);
    });
  };

  const totalTasks = events.length;
  const completedTasks = useMemo(() => events.filter(e => e.status === 'Concluído').length, [events]);
  const progress = useMemo(() => totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0, [totalTasks, completedTasks]);
  const isKilled = useMemo(() => totalTasks > 0 && completedTasks === totalTasks, [totalTasks, completedTasks]);

  const showProgressBar = completedTasks > 0;

  const handleDonateCoins = () => {
    if (donated) {
      alert("⚠️ COTA ESGOTADA!\n\nVocê já distribuiu sua semanada vitalícia de reconhecimento. Suas doações livres enchem novamente na próxima segunda-feira. Acumule recompensas trabalhando!");
      return;
    }
    
    setTimeout(() => {
      const col = window.prompt("🫂 CULTURA MAYUS\n\nPara qual colecionador de vitórias você deseja doar as suas 3 Moedas de Reconhecimento dessa semana? (ex: Aline F.)");
      if (col && col.trim() !== '') {
        confetti({
          particleCount: 150,
          spread: 120,
          origin: { y: 0.6 },
          colors: ['#ef4444', '#ffffff', '#FFD700']
        });
        alert(`🎉 RECONHECIMENTO HISTÓRICO!\n\nVocê enalteceu o sangue de ${col} perante o departamento. A cultura do trabalho duro agradece!`);
        setDonated(true);
        if (typeof window !== 'undefined') localStorage.setItem('didDonate', 'true');
      }
    }, 50);
  };

  useEffect(() => {
     if (isKilled) {
        confetti({
           particleCount: 200,
           spread: 120,
           origin: { y: 0.5 },
           colors: ['#CCA761', '#f1d58d', '#4ade80', '#ffffff'],
           zIndex: 9999
        });
     }
  }, [isKilled]);

  return (
    <div className={`w-full max-w-7xl mx-auto space-y-8 pb-24 ${montserrat.className}`}>

      {/* Header da Página */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end pb-4 border-b border-[#CCA761]/20 relative z-40 gap-6">
        <div>
           <h1 className={`text-5xl lg:text-7xl text-[#CCA761] mb-1 font-bold tracking-tight ${cormorant.className} italic drop-shadow-[0_0_20px_rgba(204,167,97,0.3)]`}>
             Sua Agenda
           </h1>
           <div className="flex items-center gap-3 mt-2 flex-wrap">
             <p className="text-[#CCA761] text-lg font-bold tracking-widest uppercase">{greeting}, {userName}</p>
             {/* Badge Privado de Ranking do Usuário */}
             {gamificationEnabled && (
               <div title="Sua posição de produtividade nesta sprint" className="flex items-center gap-2 bg-[#CCA761]/10 border border-[#CCA761]/40 px-3 py-0.5 rounded-full shadow-[0_0_15px_rgba(204,167,97,0.2)] animate-[pulse_3s_ease-in-out_infinite] group hover:bg-[#CCA761]/20 transition-all cursor-default relative overflow-hidden">
                 <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                 <Trophy size={14} className="text-[#CCA761] group-hover:scale-110 transition-transform relative z-10" />
                 <span className="text-[#CCA761] text-[10px] font-black tracking-widest uppercase relative z-10 drop-shadow-md">Posição: 2º Lugar</span>
               </div>
             )}
           </div>
           <p className="text-[#a1a1aa] text-[11px] mt-2 font-semibold italic border-l-2 border-[#CCA761] pl-3 max-w-lg tracking-wide bg-gradient-to-r from-[#CCA761]/5 to-transparent py-1 pr-2 rounded-r-md">&quot;{dailyQuote}&quot;</p>
        </div>
        <div className="flex flex-col items-end gap-3 w-full md:w-auto">
          {/* A Carteira (Wallet) */}
          {gamificationEnabled && (
            <div className="flex items-center gap-4 bg-[#0a0a0a] border border-[#CCA761]/30 p-2 rounded-xl shadow-[inset_0_0_15px_rgba(204,167,97,0.1)] relative overflow-hidden">
               {showCoinAnim && <div className="absolute inset-0 bg-[#CCA761]/20 animate-pulse pointer-events-none" />}
               <div className="flex flex-col items-end pr-3 border-r border-[#CCA761]/20">
                 <span className="text-[#a1a1aa] text-[8px] font-black uppercase tracking-widest leading-tight">Saldo Atual</span>
                 <div className={`flex items-center gap-1.5 transition-transform duration-300 ${showCoinAnim ? 'scale-125 text-[#FFD700] drop-shadow-[0_0_10px_rgba(255,215,0,0.8)]' : 'text-[#CCA761]'}`}>
                    <span className="text-lg font-bold">{myCoins}</span>
                    <Coins size={14} className="animate-[pulse_4s_ease-in-out_infinite]" />
                 </div>
               </div>
               <div className="flex flex-col items-center px-1 cursor-pointer group" onClick={handleDonateCoins} title="Semanada de Agradecimento (Gaste até sexta!)">
                 <span className="text-[#a1a1aa] text-[8px] font-black uppercase tracking-widest mb-0.5">Livre p/ Doar</span>
                 <div className="flex gap-1 group-hover:scale-110 transition-transform">
                   <div className={`w-2 h-2 rounded-full ${donated ? 'bg-white/10' : 'bg-gradient-to-r from-[#CCA761] to-[#FFD700] shadow-[0_0_8px_rgba(204,167,97,0.8)] animate-pulse'}`} />
                   <div className={`w-2 h-2 rounded-full ${donated ? 'bg-white/10' : 'bg-gradient-to-r from-[#CCA761] to-[#FFD700] shadow-[0_0_8px_rgba(204,167,97,0.8)] animate-pulse'}`} style={{ animationDelay: '75ms' }} />
                   <div className={`w-2 h-2 rounded-full ${donated ? 'bg-white/10' : 'bg-gradient-to-r from-[#CCA761] to-[#FFD700] shadow-[0_0_8px_rgba(204,167,97,0.8)] animate-pulse'}`} style={{ animationDelay: '150ms' }} />
                 </div>
               </div>
            </div>
          )}
          
          <div className="flex gap-2">
            {gamificationEnabled && (
              <button onClick={handleDonateCoins} className={`flex items-center gap-2 border font-bold uppercase tracking-widest px-4 py-2.5 rounded-xl transition-all shadow-sm text-xs ${donated ? 'bg-[#0a0a0a] border-white/5 text-gray-500 cursor-not-allowed opacity-50' : 'bg-[#111] border-[#CCA761]/30 text-[#CCA761] hover:bg-[#CCA761]/10 hover:-translate-y-0.5 shadow-[0_5px_15px_rgba(204,167,97,0.15)]'}`}>
                <Gift size={14} /> Reconhecer
              </button>
            )}
            <div className="relative">
              <input 
                 type="date" 
                 title="Abrir calendário"
                 ref={calendarRef1}
                 className="absolute inset-0 w-0 h-0 opacity-0 pointer-events-none"
                 style={{ border: 0, padding: 0 }}
                 onChange={(e) => {
                    const dateVal = e.target.value; 
                    if (dateVal) {
                       const d = new Date(dateVal);
                       d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
                       setSelectedDate(d.getDate());
                    }
                 }}
              />
              <button onClick={openCalendar1} className="flex h-full items-center gap-2 bg-gradient-to-r from-[#CCA761] to-[#eadd87] text-[#0a0a0a] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl hover:scale-105 transition-transform shadow-[0_0_20px_rgba(204,167,97,0.3)] text-xs">
                <Calendar size={14} /> Calendário
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-8 animate-fade-in-up">
        {/* Seletor de Semana Premium */}
        <div className="flex justify-between items-center gap-2 p-1 bg-white/5 rounded-2xl border border-white/10 shadow-inner overflow-x-auto hide-scrollbar">
          {WEEK_DAYS.map((d, i) => {
            const active = parseInt(d.date) === selectedDate;
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(parseInt(d.date))}
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
                            <CheckCircle2 size={14} /> PARABÉNS! DIA CONCLUÍDO 🎯
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

              <div className="space-y-3 pb-10">
                {events.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 text-sm">Nenhuma atividade agendada.</div>
                ) : events.map((ev, i) => {
                  const isDone = ev.status === 'Concluído';
                  const active = ev.active || false;
                  const bdgColor = ev.color || '#CCA761';

                  // Lógica Visual: Escura quando pendente, Verde + Vibrante quando concluída. Cor do badge mantém.
                  const cardBgClass = isDone
                    ? 'border-[#4ade80]/30 bg-[#111] hover:bg-[#151515] shadow-[0_0_20px_rgba(74,222,128,0.05)]' // Feito -> Fundo premium com borda verde
                    : 'border-white/5 bg-[#050505] hover:bg-[#0a0a0a] opacity-80 hover:opacity-100'; // Pendente -> Escuro para focar no tempo

                  const leftLineColor = isDone ? '#4ade80' : 'rgba(255,255,255,0.1)';
                  const leftGlaow = isDone ? '0 0 10px rgba(74,222,128,0.5)' : 'none';

                  return (
                    <div key={i} className={`group relative flex items-center gap-4 transition-all duration-500 ${isDone ? '-translate-y-0.5' : ''}`}>
                      <div className="w-14 text-right shrink-0">
                        <span className={`text-base font-black italic tracking-tighter ${isDone ? 'text-gray-500' : 'text-[#CCA761]'}`}>{ev.time_text}</span>
                      </div>

                      <div
                        onClick={() => toggleStatus(ev)}
                        className={`flex-1 flex items-center justify-between p-4 rounded-xl border transition-all duration-500 cursor-pointer overflow-hidden relative ${cardBgClass}`}
                      >
                        <div className="flex items-center gap-4 relative z-10">
                          {/* LINHA LATERAL - FICA VERDE QUANDO FEITA */}
                          <div className="w-1 h-12 rounded-full transition-all duration-500" style={{ backgroundColor: leftLineColor, boxShadow: leftGlaow }} />

                          <div>
                            <div className="flex flex-col items-start gap-2 mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* BADGE DE DEPARTAMENTO: SEMPRE MANTÉM A COR ORIGINAL */}
                                <span
                                  className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-sm backdrop-blur-sm"
                                  style={{ color: bdgColor, backgroundColor: `${bdgColor}15`, border: `1px solid ${bdgColor}40`, textShadow: `0 0 8px ${bdgColor}80` }}
                                >
                                  {ev.category}
                                </span>
                                <span className={`text-[9px] font-bold uppercase tracking-widest ${isDone ? 'text-gray-500' : 'text-gray-400'}`}>• {ev.type}</span>
                                
                                {ev.created_by_agent && (
                                  <span className="text-[8px] bg-white/5 border border-white/10 text-gray-300 font-bold px-1.5 py-0.5 rounded flex items-center gap-1"><Wand2 size={10} /> {ev.created_by_agent}</span>
                                )}
                              </div>
                              
                              <div className="flex">
                                {/* BADGE DE RECOMPENSA (MAYUS COINS) */}
                                {gamificationEnabled && (
                                  <span className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 border rounded px-2 py-0.5 ${isDone ? 'text-gray-500 border-gray-600 bg-white/5' : 'text-[#CCA761] border-[#CCA761]/30 bg-[#CCA761]/10 shadow-[0_0_10px_rgba(204,167,97,0.2)]'}`}>
                                    +{ev.category === 'URGENTE' ? 100 : ev.category === 'ATENÇÃO' ? 50 : 20} <Coins size={10} className={isDone ? '' : 'text-[#FFD700]'} />
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* TÍTULO DA TAREFA */}
                            <h4 className={`text-sm font-bold tracking-wide transition-colors duration-500 mt-1 ${isDone ? 'text-[#4ade80] line-through decoration-[#4ade80]/50' : 'text-white'
                              }`}>{ev.title}</h4>
                             
                             {/* CADEADO VISUAL (Trancada) */}
                             {gamificationEnabled && ev.status === 'Em andamento' && (
                               <div className="flex items-center gap-1.5 mt-2 text-[#CCA761] bg-[#CCA761]/10 px-2 py-1 rounded w-max border border-[#CCA761]/30">
                                 <Lock size={10} className="drop-shadow-md" />
                                 <span className="text-[9px] font-black uppercase tracking-widest drop-shadow-md">Em Desenvolvimento (Protegido)</span>
                               </div>
                             )}
                          </div>
                        </div>

                        <div className="absolute top-2 right-2 sm:static sm:top-auto sm:right-auto text-right flex flex-col items-end z-20">
                          {gamificationEnabled && ev.status !== 'Concluído' && (
                            <button 
                              onClick={(e) => lockTask(e, ev)}
                              className={`p-2 rounded-lg transition-colors border shadow-sm backdrop-blur-sm ${ev.status === 'Em andamento' ? 'bg-[#CCA761] text-[#0a0a0a] border-[#eadd87] drop-shadow-[0_0_10px_rgba(204,167,97,0.8)]' : 'bg-[#111] text-gray-400 border-white/5 hover:text-white hover:bg-white/5 hover:border-white/20'}`}
                              title={ev.status === 'Em andamento' ? "Destrancar tarefa" : "Trancar tarefa (Em Andamento)"}
                            >
                              {ev.status === 'Em andamento' ? <Lock size={14} /> : <Unlock size={14} />}
                            </button>
                          )}
                        </div>

                        {/* CHECKMARK GIGANTE QUE APARECE QUANDO DONE */}
                        {isDone && (
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/4 opacity-10">
                            <CheckCircle2 size={100} className="text-[#4ade80]" />
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
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
