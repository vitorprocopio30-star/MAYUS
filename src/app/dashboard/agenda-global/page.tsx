"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Clock, AlertCircle, Star, Wand2, Calendar, CheckCircle2, Trophy, Sword, Lock, Target, Coins, Crown, Copy, Check, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import { useGamification } from "@/hooks/useGamification";
import { filterExistingProcessPrazoTasks, formatDateKey, getUrgencyLabel, inferUrgencyFromDeadline, sortAgendaTasks, toAgendaEvent } from "@/lib/agenda/userTasks";

const TASK_META_PREFIX = "__MAYUS_TASK_META__";

type GoogleCalendarGlobalState = {
  available: boolean;
  connected: boolean;
  status: string;
  connectedEmail: string | null;
  events: any[];
  error?: string | null;
  setup?: {
    missingEnv?: string[];
    invalidEnv?: string[];
    redirectUris?: { personal?: string; global?: string };
  } | null;
};

const montserrat = Montserrat({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["400", "600", "700"], style: ["normal", "italic"] });

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`glass-card-premium rounded-2xl overflow-hidden p-6 relative group border border-[#CCA761]/10 bg-gradient-to-b from-white/90 dark:from-[#111111]/90 to-gray-50/90 dark:to-[#050505]/90 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.4)] ring-1 ring-gray-200 dark:ring-white/5 cursor-pointer hover:border-[#CCA761]/30 hover:shadow-[0_0_20px_rgba(204,167,97,0.15)] transition-all duration-500 ${className}`}>
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
  const [activeMission, setActiveMission] = useState<any | null>(null);
  const [copiedTextKey, setCopiedTextKey] = useState<string | null>(null);
  const [reminderDateKeys, setReminderDateKeys] = useState<string[]>([]);
  const [googleCalendarGlobal, setGoogleCalendarGlobal] = useState<GoogleCalendarGlobalState>({
    available: true,
    connected: false,
    status: "disconnected",
    connectedEmail: null,
    events: [],
    error: null,
  });
  const [isGoogleCalendarGlobalLoading, setIsGoogleCalendarGlobalLoading] = useState(false);
  const [isGoogleCalendarGlobalDisconnecting, setIsGoogleCalendarGlobalDisconnecting] = useState(false);

  const getDeadlineMeta = (dateValue?: string | null) => {
    if (!dateValue) return null;
    const due = new Date(dateValue);
    if (Number.isNaN(due.getTime())) return null;

    const now = new Date();
    const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    const diffDays = Math.floor((dueStart - nowStart) / (1000 * 60 * 60 * 24));

    if (diffDays <= 3) return "border-red-500/40 bg-red-500/10 text-red-400";
    if (diffDays <= 10) return "border-amber-500/40 bg-amber-500/10 text-amber-300";
    return "border-emerald-500/40 bg-emerald-500/10 text-emerald-300";
  };

  const parseTaskMeta = (description?: string | null) => {
    const raw = String(description || "");
    if (!raw.startsWith(TASK_META_PREFIX)) return {} as { process_number?: string | null; responsible_notes?: string | null; tags?: string[] };
    try {
      const parsed = JSON.parse(raw.slice(TASK_META_PREFIX.length));
      return {
        process_number: parsed?.process_number || null,
        responsible_notes: parsed?.responsible_notes || null,
        tags: Array.isArray(parsed?.tags) ? parsed.tags.filter(Boolean).map((tag: string) => String(tag).trim()).filter(Boolean) : [],
      };
    } catch {
      return {} as { process_number?: string | null; responsible_notes?: string | null; tags?: string[] };
    }
  };

  const getDeadlineText = (dateValue?: string | null) => {
    if (!dateValue) return "";
    const due = new Date(dateValue);
    if (Number.isNaN(due.getTime())) return "";
    const now = new Date();
    const nowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    const diffDays = Math.floor((dueStart - nowStart) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return `${Math.abs(diffDays)}d atrasado`;
    if (diffDays === 0) return "hoje";
    if (diffDays === 1) return "1 dia";
    return `${diffDays} dias`;
  };

  const normalizeReminderDaysBefore = (value?: string | number | null) => {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
  };

  const getTaskDateKey = (task: any) => String(task.scheduled_for || task.created_at || "").slice(0, 10);

  const getReminderWindowKeys = (task: any) => {
    const taskDateKey = getTaskDateKey(task);
    if (!taskDateKey) return [];

    const targetDate = new Date(`${taskDateKey}T12:00:00`);
    if (Number.isNaN(targetDate.getTime())) return [taskDateKey];

    const daysBefore = normalizeReminderDaysBefore(task.reminder_days_before);
    const keys: string[] = [];

    for (let offset = daysBefore; offset >= 0; offset -= 1) {
      const current = new Date(targetDate);
      current.setDate(targetDate.getDate() - offset);
      keys.push(formatDateKey(current));
    }

    return keys;
  };

  const isTaskVisibleOnSelectedDate = (task: any, dateKey: string) => {
    if (Boolean(task.show_only_on_date)) {
      return getReminderWindowKeys(task).includes(dateKey);
    }

    return true;
  };
  
  // Mock do departamento real do profissional logado
  const userDepartment: string = 'Comercial';
  
  const supabase = createClient();

  const dailyQuote = "O talento vence jogos, mas o trabalho em equipe e a inteligência vencem campeonatos.";

  const [selectedDate, setSelectedDate] = useState<string>(formatDateKey(new Date()));

  const loadGoogleCalendarGlobalEvents = useCallback(async (dateKey: string) => {
    setIsGoogleCalendarGlobalLoading(true);

    try {
      const response = await fetch(`/api/integrations/google-calendar-global?date=${encodeURIComponent(dateKey)}`, { cache: "no-store" });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel carregar o Google Agenda global.");
      }

      const nextState: GoogleCalendarGlobalState = {
        available: Boolean(data?.available),
        connected: Boolean(data?.connected),
        status: String(data?.status || "disconnected"),
        connectedEmail: data?.connectedEmail || null,
        events: Array.isArray(data?.events) ? data.events : [],
        setup: data?.setup || null,
        error: null,
      };
      setGoogleCalendarGlobal(nextState);
      return nextState.events.map((event) => ({
        ...event,
        person: "Agenda global Google",
        visibility: "global",
      }));
    } catch (error: any) {
      setGoogleCalendarGlobal((current) => ({
        ...current,
        events: [],
        error: error?.message || "Nao foi possivel carregar o Google Agenda global.",
      }));
      return [];
    } finally {
      setIsGoogleCalendarGlobalLoading(false);
    }
  }, []);

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

    const { data: userTasks } = await supabase
      .from('user_tasks')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .or('visibility.eq.global,visibility.is.null');

    const sourceSafeTasks = await filterExistingProcessPrazoTasks(supabase, userTasks || []);

    const reminderKeys = Array.from(
      new Set(
        sourceSafeTasks
          .filter((task: any) => Boolean(task.show_only_on_date) && String(task.status || "") !== "Concluído")
          .flatMap((task: any) => getReminderWindowKeys(task))
          .filter(Boolean)
      )
    );
    setReminderDateKeys(reminderKeys);

    const filteredByDate = sourceSafeTasks.filter((task: any) => isTaskVisibleOnSelectedDate(task, selectedDate));

    const enrichedTasks = filteredByDate.map((task: any) => {
      const legacyMeta = parseTaskMeta(task.description);
      return {
        ...task,
        process_number: task.process_number || legacyMeta.process_number || null,
        responsible_notes: task.responsible_notes || legacyMeta.responsible_notes || null,
        tags: Array.isArray(task.tags) && task.tags.length > 0 ? task.tags : Array.isArray(legacyMeta.tags) ? legacyMeta.tags : [],
        description: String(task.description || "").startsWith(TASK_META_PREFIX) ? null : task.description,
        urgency: task.urgency || inferUrgencyFromDeadline(task.scheduled_for),
      };
    });

    const normalizedTasks = sortAgendaTasks(enrichedTasks).map(toAgendaEvent).map((task: any) => {
      if (task.status === 'Concluído') return task;
      return { ...task, person: 'Equipe MAYUS' };
    });

    const missions = normalizedTasks
      .filter((task: any) => task.task_kind === 'mission' && task.status !== 'Concluído')
      .sort((a: any, b: any) => {
        const aTs = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTs = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTs - aTs;
    });

    const taskItems = normalizedTasks.filter((task: any) => task.task_kind !== 'mission');
    const googleCalendarEvents = await loadGoogleCalendarGlobalEvents(selectedDate);
    setActiveMission(missions[0] || null);
    setEvents([...taskItems.filter((task: any) => !task.is_critical), ...googleCalendarEvents]);
    setCriticalDeadlines(taskItems.filter((task: any) => task.is_critical));
    setIsLoading(false);
  };

  // Substituído por getUnifiedTasks

  // Recarregar sempre que a data selecionada mudar
  useEffect(() => {
     fetchTasks();
  }, [selectedDate]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const currentUrl = new URL(window.location.href);
    const status = currentUrl.searchParams.get("googleCalendarGlobal");
    if (!status) return;

    const message = currentUrl.searchParams.get("message");
    setGoogleCalendarGlobal((current) => ({
      ...current,
      error: status === "error" ? message || "Nao foi possivel conectar o Google Agenda global." : null,
    }));

    currentUrl.searchParams.delete("googleCalendarGlobal");
    currentUrl.searchParams.delete("message");
    const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);

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
    if (task.is_external_calendar) return;
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
    if (task.is_external_calendar) return;

    const { data: { user } } = await supabase.auth.getUser();
    await supabase
      .from('user_tasks')
      .update({ assigned_to: user?.id ?? null, assigned_name_snapshot: viewerName })
      .eq('id', task.id);

    setEvents(prev => prev.map(ev => ev.id === task.id ? { ...ev, assigned_to: user?.id ?? null, assigned_name_snapshot: viewerName, person: viewerName, stolen: true } : ev));
  };

  const handleConnectGoogleCalendarGlobal = () => {
    window.location.assign("/api/integrations/google-calendar-global/connect");
  };

  const handleDisconnectGoogleCalendarGlobal = async () => {
    if (!confirm("Desconectar a agenda global do Google deste escritorio?")) return;
    setIsGoogleCalendarGlobalDisconnecting(true);

    try {
      const response = await fetch("/api/integrations/google-calendar-global", { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Nao foi possivel desconectar o Google Agenda global.");
      }

      setGoogleCalendarGlobal({
        available: true,
        connected: false,
        status: "disconnected",
        connectedEmail: null,
        events: [],
        error: null,
      });
      fetchTasks();
    } catch (error: any) {
      setGoogleCalendarGlobal((current) => ({
        ...current,
        error: error?.message || "Nao foi possivel desconectar o Google Agenda global.",
      }));
    } finally {
      setIsGoogleCalendarGlobalDisconnecting(false);
    }
  };

  const copyTaskText = async (event: React.MouseEvent, key: string, text?: string | null) => {
    event.stopPropagation();
    if (!text || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTextKey(key);
      setTimeout(() => {
        setCopiedTextKey((current) => (current === key ? null : current));
      }, 1200);
    } catch {
      // noop
    }
  };

  const getReward = (task: any) => {
    if (task?.is_external_calendar) return 0;
    const normalized = String(task?.urgency || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    if (normalized === "URGENTE") return 100;
    if (normalized === "ATENCAO") return 50;
    return 20;
  };

  const pendingEvents = useMemo(() => events.filter((e) => e.status !== 'Concluído'), [events]);
  const completedEvents = useMemo(() => {
    return events
      .filter((e) => e.status === 'Concluído')
      .sort((a, b) => {
        const aTs = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const bTs = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return bTs - aTs;
      });
  }, [events]);

  const progressEvents = useMemo(() => events.filter((event) => !event.is_external_calendar), [events]);
  const totalTasks = progressEvents.length;
  const completedTasks = useMemo(() => progressEvents.filter((event) => event.status === 'Concluído').length, [progressEvents]);
  
  // RANKING EM TEMPO REAL COMPUTADO (MAYUS COINS)
  const rankingMap = useMemo(() => {
    return events.reduce<Record<string, number>>((acc, ev) => {
      if (ev.is_external_calendar) return acc;
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
        const reward = getReward(ev);
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

  const buildInsightText = useMemo(() => {
    const pending = pendingEvents.length;
    const urgent = pendingEvents.filter((task) => String(task.urgency).toUpperCase() === 'URGENTE').length;
    const critical = criticalDeadlines.filter((task) => task.status !== 'Concluído').length;

    if (urgent >= 5) return `O escritorio possui ${urgent} tarefas urgentes abertas. Reforce distribuicao entre os responsaveis para evitar gargalo.`;
    if (critical > 0) return `Foram detectados ${critical} prazos criticos no dia. Priorize baixa assistida para reduzir risco operacional.`;
    if (pending >= 15) return `A agenda global tem ${pending} pendencias. Sugiro blocos de execucao por urgencia e tipo.`;
    return 'Fluxo global estavel. Mantenha o ritmo de baixa das agendas diarias para sustentar a previsibilidade.';
  }, [pendingEvents, criticalDeadlines]);

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
                   nameText: "text-gray-900 dark:text-white",
                   scoreText: "text-[#CCA761]"
                 };
                 
                 if (isSecond) {
                   colors = {
                     bg: "from-gray-400/20 to-[#0a0a0a]",
                     border: "border-gray-400/30",
                     tagBg: "bg-gradient-to-r from-gray-300 to-gray-500",
                     tagText: "text-[#0a0a0a]",
                     avatarBorder: "border-gray-400",
                     avatarText: "text-gray-700 dark:text-gray-300",
                     avatarShadow: "shadow-[inset_0_0_10px_rgba(156,163,175,0.4)]",
                     cardShadow: "",
                     nameText: "text-gray-800 dark:text-gray-200",
                     scoreText: "text-gray-400"
                   };
                 } else if (isThird) {
                   colors = {
                     bg: "from-[#cd7f32]/20 to-[#0a0a0a]",
                     border: "border-[#cd7f32]/30",
                     tagBg: "bg-gradient-to-r from-[#cd7f32] to-[#a05a1f]",
                     tagText: "text-gray-900 dark:text-white",
                     avatarBorder: "border-[#cd7f32]",
                     avatarText: "text-[#cd7f32]",
                     avatarShadow: "shadow-[inset_0_0_10px_rgba(205,127,50,0.4)]",
                     cardShadow: "",
                     nameText: "text-gray-700 dark:text-gray-300",
                     scoreText: "text-[#cd7f32]"
                   };
                 }
                 
                 return (
                   <div key={index} className={`flex flex-col items-center bg-gradient-to-b ${colors.bg} border ${colors.border} rounded-xl p-3 w-[22vw] min-w-[90px] max-w-[110px] sm:w-auto ${colors.cardShadow} relative hover:-translate-y-2 transition-transform cursor-pointer`}>
                      <div className={`absolute -top-3.5 ${colors.tagBg} ${colors.tagText} text-[10px] font-black px-3 py-0.5 rounded-full shadow-lg border border-gray-300 dark:border-white/20 whitespace-nowrap`}>{index + 1}º LUGAR</div>
                      <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white dark:bg-[#0a0a0a] border-[2px] sm:border-[3px] ${colors.avatarBorder} mt-2 flex items-center justify-center font-black ${colors.avatarText} ${colors.avatarShadow} text-lg`}>{String(player.name || '').charAt(0)}</div>
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
        <div className="rounded-2xl border border-[#4285F4]/25 bg-[#4285F4]/10 px-5 py-4 text-xs text-gray-700 dark:text-gray-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="font-black uppercase tracking-[0.16em] text-[#8ab4ff]">Google Agenda Global</p>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                {!googleCalendarGlobal.available
                  ? "Indisponivel ate configurar OAuth no servidor."
                  : googleCalendarGlobal.connected
                    ? `Agenda global conectada: ${googleCalendarGlobal.connectedEmail || "conta Google"}`
                    : "Admin/socio conecta a conta Google oficial do escritorio uma vez."}
              </p>
              {googleCalendarGlobal.error && (
                <p className="mt-1 text-[10px] font-semibold text-red-300">{googleCalendarGlobal.error}</p>
              )}
              {!googleCalendarGlobal.available && googleCalendarGlobal.setup?.redirectUris?.global && (
                <div className="mt-3 space-y-2 rounded-lg border border-[#4285F4]/20 bg-black/10 p-2 text-[10px] leading-relaxed text-gray-500 dark:text-gray-400">
                  <p className="font-bold text-[#8ab4ff]">Configuração necessária no Google Cloud:</p>
                  {(googleCalendarGlobal.setup.missingEnv || []).length > 0 && (
                    <p>Env ausente: {(googleCalendarGlobal.setup.missingEnv || []).join(", ")}</p>
                  )}
                  {(googleCalendarGlobal.setup.invalidEnv || []).length > 0 && (
                    <p>Env inválida: {(googleCalendarGlobal.setup.invalidEnv || []).join(", ")}</p>
                  )}
                  <button
                    type="button"
                    onClick={(event) => copyTaskText(event, "google-calendar-global-redirect", googleCalendarGlobal.setup?.redirectUris?.global)}
                    className="inline-flex max-w-full items-center gap-1 rounded-md border border-[#4285F4]/30 px-2 py-1 font-bold text-[#8ab4ff]"
                  >
                    {copiedTextKey === "google-calendar-global-redirect" ? <Check size={10} /> : <Copy size={10} />}
                    <span className="truncate">Callback global</span>
                  </button>
                </div>
              )}
            </div>
            {googleCalendarGlobal.connected ? (
              <button
                type="button"
                onClick={handleDisconnectGoogleCalendarGlobal}
                disabled={isGoogleCalendarGlobalDisconnecting}
                className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-red-300 disabled:opacity-60"
              >
                {isGoogleCalendarGlobalDisconnecting ? "..." : "Desconectar agenda global"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConnectGoogleCalendarGlobal}
                disabled={!googleCalendarGlobal.available || isGoogleCalendarGlobalLoading}
                className="rounded-lg border border-[#4285F4]/40 bg-[#4285F4] px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Conectar agenda global do Google
              </button>
            )}
          </div>
        </div>

        {/* Seletor de Semana Premium */}
        <div className="flex justify-between items-center gap-2 p-1 bg-gray-100 dark:bg-white/5 rounded-2xl border border-gray-200 dark:border-white/10 shadow-inner overflow-x-auto hide-scrollbar">
           {WEEK_DAYS.map((d, i) => {
            const active = d.dateKey === selectedDate;
            const hasReminder = reminderDateKeys.includes(d.dateKey);
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(d.dateKey)}
                className={`min-w-[70px] flex-1 flex flex-col items-center py-4 rounded-xl transition-all ${active ? 'bg-[#CCA761] text-[#0a0a0a] shadow-[0_0_20px_rgba(204,167,97,0.3)]' : 'hover:bg-gray-100 dark:bg-white/5 text-gray-500 hover:text-white'}`}
              >
                <span className="text-[10px] font-black uppercase tracking-tighter mb-1">{d.day}</span>
                <span className="text-xl font-black italic">{d.date}</span>
                {active ? (
                  <div className="w-1 h-1 bg-white dark:bg-[#0a0a0a] rounded-full mt-2" />
                ) : hasReminder ? (
                  <div className="w-1.5 h-1.5 bg-[#CCA761] rounded-full mt-2 shadow-[0_0_8px_rgba(204,167,97,0.8)]" />
                ) : (
                  <div className="w-1.5 h-1.5 mt-2" />
                )}
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

              {activeMission && (
                <div className="relative p-[1px] rounded-xl bg-gradient-to-r from-[#ef4444] via-[#CCA761] to-[#ef4444] animate-pulse mb-8 overflow-hidden group shadow-[0_0_30px_rgba(239,68,68,0.2)]">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#ef4444]/20 via-[#CCA761]/30 to-[#ef4444]/20 blur-xl" />
                  <div className="bg-white dark:bg-[#050505]/95 backdrop-blur-xl rounded-xl p-5 md:p-6 w-full relative z-10">
                    <div className="flex flex-col md:flex-row items-center gap-6 justify-between">
                      
                      <div className="flex flex-col items-center md:items-start text-center md:text-left gap-3 w-full md:w-3/4">
                         <span className="flex items-center justify-center md:justify-start gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-[#ef4444] bg-[#ef4444]/10 px-3 py-1 rounded w-fit border border-[#ef4444]/30 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                            <Target size={12} className="animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" /> OPORTUNIDADE ESPECIAL
                          </span>
                         <h3 className="text-gray-900 dark:text-white text-lg md:text-xl font-bold tracking-tight">{activeMission.title}</h3>
                         <p className="text-xs sm:text-sm text-gray-400 font-medium leading-relaxed italic"><strong className="text-[#CCA761]">Aviso do MAYUS:</strong> &quot;{activeMission.description || 'Missao operacional ativa para acelerar a execucao da equipe.'}&quot;</p>
                       </div>
  
                      <div className="w-full md:w-1/4 flex flex-col items-center justify-center gap-3 border-t md:border-t-0 md:border-l border-gray-200 dark:border-white/10 pt-4 md:pt-0 pl-0 md:pl-4">
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-1">Recompensa</span>
                          <div className="flex items-center gap-2 text-[#CCA761] font-black text-2xl h-8 drop-shadow-[0_0_10px_rgba(204,167,97,0.5)]">
                            +{activeMission.reward_coins ?? 1000} <Coins size={20} className="animate-pulse text-[#FFD700]" />
                          </div>
                        </div>
                        <button className="w-full bg-gradient-to-r from-[#ef4444] to-[#b91c1c] text-gray-900 dark:text-white text-[10px] sm:text-xs font-black uppercase tracking-widest py-2.5 rounded-lg hover:scale-105 transition-transform shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-[#fca5a5]/30 mt-2">
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
                  <button
                    onClick={() => setSelectedDate(formatDateKey(new Date()))}
                    className="text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-lg border whitespace-nowrap transition-colors text-[#4ade80] bg-[#4ade80]/10 border-[#4ade80]/30"
                  >
                    Ao Vivo (Ligado)
                  </button>
                  <button className="text-[10px] text-[#CCA761] font-bold uppercase tracking-widest border border-[#CCA761]/30 hover:bg-[#CCA761]/10 transition-colors px-3 py-1 rounded-lg">Filtros</button>
                </div>
              </div>

              {/* BARRA DE PROGRESSO ANIMADA */}
              {showProgressBar && (
                <div className="mb-6 p-4 rounded-xl border border-gray-200 dark:border-white/5 bg-gradient-to-r from-[#111] to-[#0a0a0a] flex flex-col gap-3 relative overflow-hidden group animate-fade-in-up">
                  <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 transition-colors duration-1000 ${isKilled ? 'bg-[#4ade80]/20' : 'bg-[#CCA761]/10'}`}></div>

                  <div className="flex justify-between items-center relative z-10">
                    <div>
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Aproveitamento Diário</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-2xl font-black text-gray-900 dark:text-white">{completedTasks} <span className="text-sm text-gray-500 font-normal">/ {totalTasks}</span></span>
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
                  <div className="w-full h-2 bg-gray-100 dark:bg-[#111] rounded-full overflow-hidden border border-gray-200 dark:border-white/5 relative z-10 transition-all">
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
                {pendingEvents.length === 0 ? (
                  <div className="col-span-full text-center py-12 text-gray-500 text-sm">Todas as atividades pendentes foram concluídas.</div>
                ) : pendingEvents.map((ev, i) => {
                  const active = ev.active || false;
                  const isExternalCalendar = Boolean(ev.is_external_calendar);
                  const normalizedUrgency = String(ev.urgency || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                  const bdgColor = normalizedUrgency === "URGENTE" ? "#f87171" : normalizedUrgency === "ATENCAO" ? "#CCA761" : "#9ca3af";
                  const isUrgentTask = String(ev.urgency || '').toUpperCase() === 'URGENTE';
                  const deadlineClass = isExternalCalendar ? null : getDeadlineMeta(ev.scheduled_for);

                  const cardBgClass = isUrgentTask
                    ? 'bg-[#140909] hover:bg-[#1a0b0b] opacity-95 hover:opacity-100 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
                    : isExternalCalendar
                      ? 'bg-[#4285F4]/5 hover:bg-[#4285F4]/10 opacity-95 hover:opacity-100 border-[#4285F4]/40 shadow-[0_0_18px_rgba(66,133,244,0.08)]'
                    : 'bg-white dark:bg-[#050505] hover:bg-white dark:bg-[#0a0a0a] opacity-80 hover:opacity-100';

                  return (
                    <div key={`pend-${i}`} className={`group relative transition-all duration-500`}>
                      <div
                        onClick={() => {
                          if (!isExternalCalendar) toggleStatus(ev);
                        }}
                        className={`flex flex-col justify-start gap-4 p-4 rounded-xl border transition-all duration-500 ${isExternalCalendar ? 'cursor-default' : 'cursor-pointer'} relative ${cardBgClass} min-h-[160px] h-full mt-4 group-hover:-translate-y-1 shadow-lg hover:shadow-[0_10px_30px_rgba(0,0,0,0.5)]`}
                        style={{ borderColor: isExternalCalendar ? 'rgba(66,133,244,0.45)' : isUrgentTask ? 'rgba(239,68,68,0.45)' : `${bdgColor}50`, borderTopWidth: '2px', borderTopColor: isExternalCalendar ? '#4285F4' : isUrgentTask ? '#ef4444' : bdgColor }}
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
                                  {getUrgencyLabel(ev.urgency)}
                                </span>
                                <span className={`text-[8px] font-bold uppercase tracking-widest ${isExternalCalendar ? 'text-[#8ab4ff]' : 'text-[#a1a1aa]'}`}>• {ev.type}</span>
                               
                               {ev.stolen && (
                                 <span className="text-[8px] font-black uppercase tracking-widest text-[#ef4444] bg-[#ef4444]/10 border border-[#ef4444]/40 px-1.5 py-0.5 rounded animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.2)]">Roubado!</span>
                               )}
                             </div>
                             
                             {/* BADGE DE RECOMPENSA (MAYUS COINS) */}
                              {gamificationEnabled && !isExternalCalendar && (
                               <div className="flex">
                                 <span className={`text-[8px] font-black uppercase tracking-widest flex items-center gap-1 border rounded px-2 py-0.5 text-[#CCA761] border-[#CCA761]/30 bg-[#CCA761]/10 shadow-[0_0_10px_rgba(204,167,97,0.2)]`}>
                                    +{getReward(ev)} <Coins size={8} className="text-[#FFD700]" />
                                 </span>
                               </div>
                             )}
                           </div>
                           <h4 className={`text-sm font-bold tracking-wide transition-colors duration-500 text-gray-900 dark:text-white line-clamp-3 leading-snug break-words pr-2 mt-1 ${ev.stolen ? 'text-[#ef4444]' : ''}`}>{ev.title}</h4>
                           {Array.isArray(ev.tags) && ev.tags.length > 0 && (
                             <div className="mt-1.5 flex flex-wrap gap-1">
                               {ev.tags.map((tag: string) => (
                                 <span key={`${ev.id}-${tag}`} className="text-[8px] uppercase tracking-widest px-2 py-0.5 rounded border border-[#CCA761]/30 text-[#CCA761] bg-[#CCA761]/10">
                                   {tag}
                                 </span>
                               ))}
                             </div>
                           )}
                            {ev.responsible_notes && (
                             <div className="mt-1.5 p-2 rounded border border-gray-200 dark:border-white/10 bg-gray-200 dark:bg-black/20">
                               <div className="flex items-center justify-between gap-2 mb-1">
                                 <span className="text-[8px] uppercase tracking-widest text-zinc-500 font-black">Anotações</span>
                                 <button
                                   onClick={(event) => copyTaskText(event, `global-notes-${ev.id}`, String(ev.responsible_notes || ''))}
                                   className="inline-flex items-center justify-center w-5 h-5 rounded border border-[#CCA761]/30 text-[#CCA761] hover:bg-[#CCA761]/10"
                                   title="Copiar anotações"
                                 >
                                   {copiedTextKey === `global-notes-${ev.id}` ? <Check size={10} /> : <Copy size={10} />}
                                 </button>
                               </div>
                               <p className="text-[10px] text-zinc-400 line-clamp-2">{String(ev.responsible_notes || '')}</p>
                            </div>
                            )}
                            {isExternalCalendar && ev.html_link && (
                              <a
                                href={ev.html_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="mt-1.5 inline-flex items-center gap-1.5 rounded border border-[#4285F4]/30 bg-[#4285F4]/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-[#8ab4ff] hover:bg-[#4285F4]/15"
                              >
                                <ExternalLink size={10} /> Abrir no Google
                              </a>
                            )}
                            {deadlineClass && (
                             <div className={`mt-1.5 inline-flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded border ${deadlineClass}`}>
                               <Calendar size={10} /> Fatal: {new Date(ev.scheduled_for).toLocaleDateString('pt-BR')} • {getDeadlineText(ev.scheduled_for)}
                             </div>
                           )}
                         </div>
                        
                        {/* Steal Task Overlay System */}
                        {ev.person !== "Você" && ev.status === "Em andamento" && (
                          <div className="absolute top-2 right-2 p-1.5 bg-white dark:bg-[#0a0a0a]/90 backdrop-blur-md rounded-lg border border-[#CCA761]/50 flex items-center gap-1.5 shadow-[0_0_15px_rgba(204,167,97,0.3)] z-50 group-hover:bg-[#CCA761]/10 transition-colors tooltip-group">
                             <Lock size={12} className="text-[#CCA761]" />
                             <span className="text-[9px] font-black uppercase text-[#CCA761] tracking-widest hidden group-hover:block transition-all max-w-[120px] text-right leading-tight drop-shadow-md">Trabalho em Desenvolvimento</span>
                          </div>
                        )}

                        {gamificationEnabled && !isExternalCalendar && ev.person !== "Você" && ev.status !== "Em andamento" && (
                          <div className="absolute bottom-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-50">
                            <button 
                              onClick={(e) => stealTask(e, ev)}
                              title="Assumir tarefa pendente"
                              className="flex items-center gap-1.5 bg-gradient-to-r from-[#ef4444] to-[#b91c1c] text-gray-900 dark:text-white px-3 py-1.5 rounded-lg border border-[#fca5a5]/50 shadow-[0_0_15px_rgba(239,68,68,0.5)] hover:scale-105 hover:-translate-y-1 transition-all group/btn"
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
              {completedEvents.length > 0 && (
                <div className="mt-8 animate-fade-in-up">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 bg-gradient-to-r from-[#4ade80]/10 to-transparent rounded-xl border-l-[3px] border-[#4ade80] mb-6 shadow-md gap-4">
                    <h3 className="text-sm font-black tracking-widest uppercase flex items-center gap-3 text-[#4ade80]">
                      <Star size={18} className="drop-shadow-[0_0_8px_rgba(74,222,128,0.8)]" /> Mural das Vitórias
                    </h3>
                  </div>

                  <div className="space-y-3 pb-10">
                    {completedEvents.map((ev, i) => {
                      const active = ev.active || false;
                      const normalizedUrgency = String(ev.urgency || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
                      const bdgColor = normalizedUrgency === "URGENTE" ? "#f87171" : normalizedUrgency === "ATENCAO" ? "#CCA761" : "#9ca3af";
                      const cardBgClass = 'border-[#4ade80]/30 bg-gray-100 dark:bg-[#111] hover:bg-[#151515] shadow-[0_0_20px_rgba(74,222,128,0.05)]';

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
                                      {getUrgencyLabel(ev.urgency)}
                                    </span>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">• {ev.type}</span>
                                  </div>
                                  
                                  {/* BADGE DE RECOMPENSA (MAYUS COINS) Concluída */}
                                  {gamificationEnabled && (
                                    <div className="flex">
                                      <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1 border rounded px-2 py-0.5 text-gray-500 border-gray-600 bg-gray-100 dark:bg-white/5 shadow-none">
                                        +{getReward(ev)} <Coins size={10} />
                                      </span>
                                    </div>
                                  )}
                                  
                                  <h4 className="text-sm font-bold tracking-wide transition-colors duration-500 text-[#4ade80] line-through decoration-[#4ade80]/50 mt-1">{ev.title}</h4>
                                </div>
                              </div>
                            
                            <div className="text-right hidden sm:block relative z-10 flex-col items-end opacity-20 hover:opacity-100 transition-opacity duration-300">
                              <p className="text-[9px] font-bold uppercase tracking-widest mb-1 border-b pb-0.5 text-[#4ade80] border-[#4ade80]/30 inline-block text-right w-auto ml-auto">Herói da Tarefa</p>
                              <p className="text-xs font-black tracking-widest text-gray-900 dark:text-white uppercase mt-0.5">{ev.person}</p>
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
                    <div className="p-4 bg-gray-200 dark:bg-black/40 rounded-xl border border-gray-200 dark:border-white/5 text-[11px] text-gray-500">
                      Nenhum prazo critico real encontrado para a selecao atual.
                    </div>
                  ) : (
                    criticalDeadlines.map((p, i) => (
                      <div key={i} className="p-4 bg-gray-200 dark:bg-black/40 rounded-xl border border-gray-200 dark:border-white/5 hover:border-gray-200 dark:border-white/10 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-bold text-gray-900 dark:text-white">{p.title}</span>
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
                <h5 className="text-sm font-bold text-gray-900 dark:text-white mb-2 tracking-wide">Insight da Inteligência (MAYUS)</h5>
                <p className="text-[11px] text-gray-400 leading-relaxed italic font-medium">&quot;{buildInsightText}&quot;</p>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
