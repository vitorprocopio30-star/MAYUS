"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import confetti from "canvas-confetti";
import { Clock, AlertCircle, Star, Wand2, Calendar, CheckCircle2, Trophy, Coins, Gift, Lock, Unlock, Copy, Check, Plus, Target, X, Pencil } from "lucide-react";
import { Montserrat, Cormorant_Garamond } from "next/font/google";
import { useGamification } from "@/hooks/useGamification";
import { buildAgendaPayloadFromManualTask, formatDateKey, sortAgendaTasks, toAgendaEvent, toDayRange } from "@/lib/agenda/userTasks";

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
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; full_name: string; avatar_url: string | null }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState("Líder");
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [myCoins, setMyCoins] = useState(1250);
  const [showCoinAnim, setShowCoinAnim] = useState(false);
  const [donated, setDonated] = useState(false);
  const [isRealtimeOn, setIsRealtimeOn] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "in_progress" | "done">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "Prazo" | "Processo" | "CRM">("all");
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [activeMission, setActiveMission] = useState<any | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskResponsibleNotes, setNewTaskResponsibleNotes] = useState("");
  const [newTaskProcessNumber, setNewTaskProcessNumber] = useState("");
  const [newTaskUrgency, setNewTaskUrgency] = useState<"URGENTE" | "ATENCAO" | "ROTINA">("ROTINA");
  const [newTaskType, setNewTaskType] = useState<"Tarefa" | "Prazo" | "Processo" | "CRM">("Tarefa");
  const [newTaskVisibility, setNewTaskVisibility] = useState<"private" | "global">("private");
  const [newTaskAssignedTo, setNewTaskAssignedTo] = useState<string>("");
  const [newTaskReminderOnly, setNewTaskReminderOnly] = useState(false);
  const [newTaskScheduledFor, setNewTaskScheduledFor] = useState(formatDateKey(new Date()));
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [copiedTextKey, setCopiedTextKey] = useState<string | null>(null);
  const [notesOnlyTask, setNotesOnlyTask] = useState<any | null>(null);
  const [notesOnlyValue, setNotesOnlyValue] = useState("");
  const [isSavingNotesOnly, setIsSavingNotesOnly] = useState(false);
  const supabase = createClient();

  const getDeadlineMeta = (dateValue?: string | null) => {
    if (!dateValue) return null;
    const today = new Date();
    const due = new Date(dateValue);
    if (Number.isNaN(due.getTime())) return null;

    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
    const diffDays = Math.floor((dueStart - todayStart) / (1000 * 60 * 60 * 24));

    if (diffDays <= 3) {
      return {
        diffDays,
        className: "border-red-500/40 bg-red-500/10 text-red-400",
      };
    }
    if (diffDays <= 10) {
      return {
        diffDays,
        className: "border-amber-500/40 bg-amber-500/10 text-amber-300",
      };
    }
    return {
      diffDays,
      className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    };
  };

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

  const [selectedDate, setSelectedDate] = useState<string>(formatDateKey(new Date()));
  const calendarRef1 = useRef<HTMLInputElement>(null);

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
          fullDate: d,
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
      .select("tenant_id, full_name, role, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    setUserName(profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || "Líder");
    setUserAvatarUrl(profile?.avatar_url || null);
    setCurrentUserId(user.id);
    setTenantId(profile?.tenant_id || null);
    setCurrentUserRole(profile?.role || null);
    setNewTaskAssignedTo((prev) => prev || user.id);

    if (!profile?.tenant_id) {
      setEvents([]);
      setCriticalDeadlines([]);
      setTeamMembers([]);
      setIsLoading(false);
      return;
    }

    const { data: tenantProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("tenant_id", profile.tenant_id)
      .eq("is_active", true)
      .order("full_name", { ascending: true });

    const normalizedTeam = (tenantProfiles || []).map((member: any) => ({
      id: String(member.id),
      full_name: String(member.full_name || "Membro"),
      avatar_url: member.avatar_url ? String(member.avatar_url) : null,
    }));

    setTeamMembers(normalizedTeam);
    if (!newTaskAssignedTo || !normalizedTeam.some((member) => member.id === newTaskAssignedTo)) {
      setNewTaskAssignedTo(user.id);
    }

    const { startIso, endIso } = toDayRange(selectedDate);
    const { data: userTasks } = await supabase
      .from("user_tasks")
      .select("*")
      .eq("tenant_id", profile.tenant_id)
      .neq("source_table", "manual_validation");

    const assigneeParam = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("assignee")
      : null;
    const visibleAssignee = assigneeParam || user.id;
    const scopedTasks = (userTasks || []).filter((task: any) => {
      const visibility = task.visibility || "global";
      const isMine = task.assigned_to === visibleAssignee && (visibility === "private" || visibility === "global");
      const isClaimableMission = task.task_kind === "mission" && visibility === "global" && !task.assigned_to;
      if (!isMine && !isClaimableMission) return false;

      const scheduledAt = new Date(task.scheduled_for || task.created_at || 0).getTime();
      const startAt = new Date(startIso).getTime();
      const endAt = new Date(endIso).getTime();
      const isReminder = Boolean(task.show_only_on_date);
      const normalizedStatus = String(task.status || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      const isDone = normalizedStatus === "concluido";

      if (Number.isNaN(scheduledAt)) return !isReminder;
      if (isReminder) return scheduledAt >= startAt && scheduledAt <= endAt;
      if (!isDone && scheduledAt < startAt) return true;
      return scheduledAt >= startAt;
    });

    const assignedIds = Array.from(
      new Set(
        (scopedTasks || [])
          .map((task: any) => String(task.assigned_to || "").trim())
          .filter(Boolean)
      )
    );

    let avatarByProfileId = new Map<string, string>();
    if (assignedIds.length > 0) {
      const { data: assignedProfiles } = await supabase
        .from("profiles")
        .select("id, avatar_url")
        .in("id", assignedIds);

      avatarByProfileId = new Map(
        (assignedProfiles || [])
          .filter((profile: any) => Boolean(profile?.id) && Boolean(profile?.avatar_url))
          .map((profile: any) => [String(profile.id), String(profile.avatar_url)])
      );
    }

    const processPrazoIds = (scopedTasks || [])
      .filter((task: any) => task.source_table === "process_prazos" && task.source_id)
      .map((task: any) => String(task.source_id));

    let processContextByPrazoId = new Map<string, any>();
    if (processPrazoIds.length > 0) {
      const { data: prazoContextRows } = await supabase
        .from("process_prazos")
        .select("id, monitored_processes(numero_processo, partes, cliente_nome)")
        .in("id", processPrazoIds);

      processContextByPrazoId = new Map(
        (prazoContextRows || []).map((row: any) => [
          String(row.id),
          {
            process_number: row.monitored_processes?.numero_processo || null,
            author_name: row.monitored_processes?.partes?.polo_ativo || null,
            client_name: row.monitored_processes?.cliente_nome || null,
          },
        ])
      );
    }

    const enrichedTasks = (scopedTasks || []).map((task: any) => {
      const avatarUrl = task.assigned_to ? avatarByProfileId.get(String(task.assigned_to)) || null : null;
      if (task.source_table !== "process_prazos") {
        return {
          ...task,
          assigned_avatar_url: avatarUrl,
        };
      }
      const ctx = processContextByPrazoId.get(String(task.source_id));
      if (!ctx) {
        return {
          ...task,
          assigned_avatar_url: avatarUrl,
        };
      }
      return {
        ...task,
        process_number: ctx.process_number,
        author_name: ctx.author_name,
        client_name: task.client_name || ctx.client_name,
        assigned_avatar_url: avatarUrl,
      };
    });

    const normalizedTasks = sortAgendaTasks(enrichedTasks).map(toAgendaEvent);
    const missions = normalizedTasks
      .filter((task: any) => task.task_kind === "mission" && task.status !== "Concluído")
      .sort((a: any, b: any) => {
        const aTs = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bTs = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bTs - aTs;
      });
    const taskItems = normalizedTasks.filter((task: any) => task.task_kind !== "mission");

    setActiveMission(missions[0] || null);
    setEvents(taskItems.filter((task: any) => !task.is_critical));
    setCriticalDeadlines(taskItems.filter((task: any) => task.is_critical));
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
    }

    if (!isRealtimeOn) return;

    const channel = supabase
      .channel('realtime_user_tasks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_tasks' },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isRealtimeOn]);

  const getReward = (task: any) => {
    const sourceTable = String(task?.source_table || "");
    if (sourceTable === "manual_private") return 0;
    if (typeof task.reward_coins === "number") return task.reward_coins;
    const normalized = String(task.category || task.urgency || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    if (normalized === "URGENTE") return 100;
    if (normalized === "ATENCAO") return 50;
    return 20;
  };

  const toggleStatus = async (task: any) => {
    const newStatus = task.status === 'Concluído' ? 'Pendente' : 'Concluído';
    const { data: { user } } = await supabase.auth.getUser();
    
    const reward = getReward(task);

    if (newStatus === 'Concluído') {
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
    } else if (task.status === 'Concluído') {
      setMyCoins(prev => {
        const nc = Math.max(0, prev - reward);
        if (typeof window !== 'undefined') localStorage.setItem('mayusCoins', nc.toString());
        return nc;
      });
    }

    const updatePayload: Record<string, any> = {
      status: newStatus,
      completed_at: newStatus === 'Concluído' ? new Date().toISOString() : null,
      completed_by: newStatus === 'Concluído' ? user?.id ?? null : null,
      completed_by_name_snapshot: newStatus === 'Concluído' ? userName : null,
    };

    await supabase.from('user_tasks').update(updatePayload).eq('id', task.id);
    
    // Atualiza Visual Local para Feedback Imediato
    setEvents(prev => prev.map(e => e.id === task.id ? { ...e, ...updatePayload, status: newStatus, person: newStatus === 'Concluído' ? userName : e.assigned_name_snapshot || e.person } : e));
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

      supabase.from('user_tasks').update({ status: newStatus }).eq('id', task.id);
      
      return prev.map(ev => ev.id === task.id ? { ...ev, status: newStatus } : ev);
    });
  };

  const visibleEvents = useMemo(() => {
    const filtered = events.filter((ev) => {
      if (statusFilter === "pending" && ev.status !== "Pendente") return false;
      if (statusFilter === "in_progress" && ev.status !== "Em andamento") return false;
      if (statusFilter === "done" && ev.status !== "Concluído") return false;
      if (typeFilter !== "all" && ev.type !== typeFilter) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      const aDone = a.status === "Concluído";
      const bDone = b.status === "Concluído";

      if (aDone && bDone) {
        const aTs = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const bTs = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return bTs - aTs;
      }

      if (aDone !== bDone) return aDone ? 1 : -1;
      return 0;
    });
  }, [events, statusFilter, typeFilter]);

  const totalTasks = visibleEvents.length;
  const completedTasks = useMemo(() => visibleEvents.filter(e => e.status === 'Concluído').length, [visibleEvents]);
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

  const copyProcessNumber = async (event: React.MouseEvent, task: any) => {
    event.stopPropagation();
    if (!task.process_number || typeof navigator === "undefined" || !navigator.clipboard) return;

    try {
      await navigator.clipboard.writeText(task.process_number);
      setCopiedTaskId(task.id);
      setTimeout(() => {
        setCopiedTaskId((current) => (current === task.id ? null : current));
      }, 1200);
    } catch {
      // noop
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

  const buildInsightText = useMemo(() => {
    const pending = events.filter((task) => task.status !== "Concluído").length;
    const urgent = events.filter((task) => String(task.urgency).toUpperCase() === "URGENTE" && task.status !== "Concluído").length;
    const critical = criticalDeadlines.filter((task) => task.status !== "Concluído").length;

    if (urgent >= 3) {
      return `Voce possui ${urgent} tarefas urgentes abertas. Priorize as duas primeiras para reduzir risco de atraso operacional.`;
    }
    if (critical > 0) {
      return `Existem ${critical} prazos criticos no seu radar. Recomendo revisar o andamento e registrar baixa parcial ainda hoje.`;
    }
    if (pending >= 8) {
      return `Sua fila esta com ${pending} tarefas pendentes. Foque em blocos de 3 para aumentar o throughput da agenda.`;
    }
    return "Fluxo estavel. Mantenha o foco nas tarefas em andamento para fechar o dia com margem operacional.";
  }, [events, criticalDeadlines]);

  const canAssignGlobalTask = currentUserRole === "Administrador" || currentUserRole === "mayus_admin" || currentUserRole === "admin" || currentUserRole === "socio" || currentUserRole === "Sócio";

  const deadlineStats = useMemo(() => {
    const visibleDeadlines = visibleEvents.filter((task) => task.source_table === "process_prazos" || task.type === "Prazo");
    const openDeadlines = visibleDeadlines.filter((task) => task.status !== "Concluído");
    const myOpenDeadlines = openDeadlines.filter((task) => String(task.assigned_to || "") === String(currentUserId || ""));
    const criticalOpen = criticalDeadlines.filter((task) => task.status !== "Concluído").length;

    return {
      total: visibleDeadlines.length,
      open: openDeadlines.length,
      criticalOpen,
      mine: myOpenDeadlines.length,
    };
  }, [visibleEvents, criticalDeadlines, currentUserId]);

  const urgencyToMeta = (urgency: "URGENTE" | "ATENCAO" | "ROTINA") => {
    if (urgency === "URGENTE") return { reward: 100, category: "URGENTE", color: "#f87171", isCritical: true };
    if (urgency === "ATENCAO") return { reward: 50, category: "ATENÇÃO", color: "#CCA761", isCritical: false };
    return { reward: 20, category: "ROTINA", color: "#9ca3af", isCritical: false };
  };

  const isTaskEditableByOwner = (task: any) => {
    const sourceTable = String(task?.source_table || "");
    const createdByAgent = String(task?.created_by_agent || "").trim();

    if (sourceTable === "manual_admin") return false;
    if (createdByAgent.length > 0) return false;
    return sourceTable === "manual_private";
  };

  const openCreateTaskModal = () => {
    setEditingTaskId(null);
    setNewTaskTitle("");
    setNewTaskResponsibleNotes("");
    setNewTaskProcessNumber("");
    setNewTaskUrgency("ROTINA");
    setNewTaskType("Tarefa");
    setNewTaskVisibility("private");
    setNewTaskAssignedTo(currentUserId || "");
    setNewTaskReminderOnly(false);
    setNewTaskScheduledFor(formatDateKey(new Date()));
    setShowCreateTaskModal(true);
  };

  const openEditTaskModal = (event: React.MouseEvent, task: any) => {
    event.stopPropagation();
    if (!isTaskEditableByOwner(task)) {
      alert("Esta tarefa foi atribuida por Auditoria/IA e nao pode ser editada na Agenda Diaria.");
      return;
    }
    setEditingTaskId(task.id);
    setNewTaskTitle(task.title || "");
    setNewTaskResponsibleNotes(task.responsible_notes || "");
    setNewTaskProcessNumber(task.process_number || "");
    setNewTaskUrgency((task.urgency || "ROTINA") as any);
    setNewTaskType((task.type || "Tarefa") as any);
    setNewTaskVisibility((task.visibility || "private") as any);
    setNewTaskReminderOnly(Boolean(task.show_only_on_date));
    const dateKey = String(task.scheduled_for || "").slice(0, 10);
    setNewTaskScheduledFor(dateKey || formatDateKey(new Date()));
    setShowCreateTaskModal(true);
  };

  const openNotesOnlyModal = (event: React.MouseEvent, task: any) => {
    event.stopPropagation();
    setNotesOnlyTask(task);
    setNotesOnlyValue(task.responsible_notes || "");
  };

  const saveNotesOnly = async () => {
    if (!notesOnlyTask?.id || !currentUserId) return;
    setIsSavingNotesOnly(true);
    try {
      const { error } = await supabase
        .from("user_tasks")
        .update({ responsible_notes: notesOnlyValue.trim() || null })
        .eq("id", notesOnlyTask.id)
        .eq("assigned_to", currentUserId);

      if (error) throw error;

      setEvents((prev) => prev.map((ev) => ev.id === notesOnlyTask.id ? { ...ev, responsible_notes: notesOnlyValue.trim() || null } : ev));
      setCriticalDeadlines((prev) => prev.map((ev) => ev.id === notesOnlyTask.id ? { ...ev, responsible_notes: notesOnlyValue.trim() || null } : ev));
      setNotesOnlyTask(null);
      setNotesOnlyValue("");
    } catch (error: any) {
      const message = String(error?.message || "");
      if (message.includes("responsible_notes")) {
        alert("Este banco ainda não tem o campo de anotações. Rode as migrations pendentes para liberar essa edição.");
      } else {
        alert(error?.message ? `Não foi possível salvar as anotações: ${error.message}` : "Não foi possível salvar as anotações.");
      }
    } finally {
      setIsSavingNotesOnly(false);
    }
  };

  const hasMissingTaskColumns = (error: any) => {
    const message = String(error?.message || "");
    return message.includes("responsible_notes") || message.includes("process_number");
  };

  const withoutExtendedTaskColumns = (payload: Record<string, any>) => {
    const sanitized = { ...payload };
    delete sanitized.process_number;
    delete sanitized.responsible_notes;
    return sanitized;
  };

  const handleCreatePersonalTask = async () => {
    if (!tenantId || !currentUserId || !newTaskTitle.trim()) return;
    setIsCreatingTask(true);
    try {
      const scheduledFor = `${newTaskScheduledFor}T09:00:00.000Z`;
      const meta = urgencyToMeta(newTaskUrgency);
      const isPrivateTask = newTaskVisibility === "private";
      const selectedMember = teamMembers.find((member) => member.id === newTaskAssignedTo) || null;
      const assignedTo = isPrivateTask ? currentUserId : (selectedMember?.id || currentUserId);
      const assignedName = isPrivateTask ? userName : (selectedMember?.full_name || userName);

      let error: any = null;
      if (editingTaskId) {
        const updatePayload = {
          title: newTaskTitle.trim(),
          description: null,
          responsible_notes: newTaskResponsibleNotes.trim() || null,
          process_number: newTaskProcessNumber.trim() || null,
          urgency: newTaskUrgency,
          scheduled_for: scheduledFor,
          type: newTaskType,
          visibility: newTaskVisibility,
          show_only_on_date: newTaskReminderOnly,
          reward_coins: 0,
          category: meta.category,
          color: meta.color,
          is_critical: meta.isCritical,
        };

        const response = await supabase
          .from("user_tasks")
          .update(updatePayload)
          .eq("id", editingTaskId)
          .eq("assigned_to", currentUserId)
          .eq("source_table", "manual_private")
          .is("created_by_agent", null);
        error = response.error;

        if (error && hasMissingTaskColumns(error)) {
          const legacyResponse = await supabase
            .from("user_tasks")
            .update(withoutExtendedTaskColumns(updatePayload))
            .eq("id", editingTaskId)
            .eq("assigned_to", currentUserId)
            .eq("source_table", "manual_private")
            .is("created_by_agent", null);
          error = legacyResponse.error;
        }
      } else {
        const payload = buildAgendaPayloadFromManualTask({
          tenantId,
          title: newTaskTitle.trim(),
          description: null,
          responsibleNotes: newTaskResponsibleNotes.trim() || null,
          processNumber: newTaskProcessNumber.trim() || null,
          assignedTo,
          assignedName,
          createdBy: currentUserId,
          createdByRole: currentUserRole,
          urgency: newTaskUrgency,
          scheduledFor,
          type: newTaskType,
          visibility: newTaskVisibility,
          showOnlyOnDate: newTaskReminderOnly,
          rewardCoins: 0,
        });
        const response = await supabase.from("user_tasks").insert(payload);
        error = response.error;

        if (error && hasMissingTaskColumns(error)) {
          const legacyResponse = await supabase.from("user_tasks").insert(withoutExtendedTaskColumns(payload));
          error = legacyResponse.error;
        }
      }

      if (error) throw error;

      setNewTaskTitle("");
      setNewTaskResponsibleNotes("");
      setNewTaskProcessNumber("");
      setNewTaskUrgency("ROTINA");
      setNewTaskType("Tarefa");
      setNewTaskVisibility("private");
      setNewTaskAssignedTo(currentUserId || "");
      setNewTaskReminderOnly(false);
      setNewTaskScheduledFor(formatDateKey(new Date()));
      setEditingTaskId(null);
      setShowCreateTaskModal(false);
      fetchTasks();
    } catch (error: any) {
      alert(error?.message ? `Não foi possível criar/salvar a tarefa: ${error.message}` : "Não foi possível criar/salvar a tarefa.");
    } finally {
      setIsCreatingTask(false);
    }
  };

  const handleClaimMission = async () => {
    if (!activeMission || !currentUserId) return;
    await supabase
      .from("user_tasks")
      .update({ assigned_to: currentUserId, assigned_name_snapshot: userName })
      .eq("id", activeMission.id);
    fetchTasks();
  };

  const handleDeleteTask = async () => {
    if (!editingTaskId || !currentUserId) return;
    setIsCreatingTask(true);
    try {
      const { error } = await supabase
        .from("user_tasks")
        .delete()
        .eq("id", editingTaskId)
        .eq("assigned_to", currentUserId)
        .eq("source_table", "manual_private")
        .is("created_by_agent", null);

      if (error) throw error;

      setEditingTaskId(null);
      setShowCreateTaskModal(false);
      fetchTasks();
    } finally {
      setIsCreatingTask(false);
    }
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
        <div className="flex items-start gap-4 md:gap-5 w-full">
          <div className="relative shrink-0 mt-4 md:mt-7 mb-[-18px] md:mb-[-26px]">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl border border-[#CCA761]/35 bg-gradient-to-br from-[#CCA761]/20 to-[#0a0a0a] p-[2px] shadow-[0_0_25px_rgba(204,167,97,0.2)]">
              <div className="w-full h-full rounded-[14px] overflow-hidden bg-[#0a0a0a] flex items-center justify-center">
                {userAvatarUrl ? (
                  <img src={userAvatarUrl} alt={userName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[#CCA761] text-2xl font-black uppercase">{String(userName || "L").slice(0, 1)}</span>
                )}
              </div>
            </div>
          </div>
          <div className="pt-5 md:pt-6">
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
            <button
              onClick={openCreateTaskModal}
              className="flex items-center gap-2 whitespace-nowrap bg-[#111] border border-[#CCA761]/30 text-[#CCA761] font-black uppercase tracking-[0.14em] px-5 py-2.5 rounded-xl hover:bg-[#CCA761]/10 transition-colors text-xs"
            >
              <Plus size={14} /> Nova tarefa
            </button>
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
                 value={selectedDate}
                  className="absolute inset-0 w-0 h-0 opacity-0 pointer-events-none"
                  style={{ border: 0, padding: 0 }}
                  onChange={(e) => {
                     const dateVal = e.target.value; 
                     if (dateVal) {
                        setSelectedDate(dateVal);
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
              {activeMission && (
                <div className="relative p-[1px] rounded-xl bg-gradient-to-r from-[#ef4444] via-[#CCA761] to-[#ef4444] mb-2 overflow-hidden group shadow-[0_0_30px_rgba(239,68,68,0.2)]">
                  <div className="absolute inset-0 bg-gradient-to-r from-[#ef4444]/20 via-[#CCA761]/30 to-[#ef4444]/20 blur-xl" />
                  <div className="bg-[#050505]/95 backdrop-blur-xl rounded-xl p-5 md:p-6 w-full relative z-10">
                    <div className="flex flex-col md:flex-row items-center gap-6 justify-between">
                      <div className="flex flex-col items-center md:items-start text-center md:text-left gap-3 w-full md:w-3/4">
                        <span className="flex items-center justify-center md:justify-start gap-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-[#ef4444] bg-[#ef4444]/10 px-3 py-1 rounded w-fit border border-[#ef4444]/30 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                          <Target size={12} /> Oportunidade Especial
                        </span>
                        <h3 className="text-white text-lg md:text-xl font-bold tracking-tight">{activeMission.title}</h3>
                        <p className="text-xs sm:text-sm text-gray-400 font-medium leading-relaxed italic">{activeMission.description || "Missao operacional ativa para acelerar os resultados do dia."}</p>
                      </div>

                      <div className="w-full md:w-1/4 flex flex-col items-center justify-center gap-3 border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 pl-0 md:pl-4">
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-1">Recompensa</span>
                          <div className="flex items-center gap-2 text-[#CCA761] font-black text-2xl h-8 drop-shadow-[0_0_10px_rgba(204,167,97,0.5)]">
                            +{activeMission.reward_coins ?? 1000} <Coins size={20} className="text-[#FFD700]" />
                          </div>
                        </div>
                        <button
                          onClick={handleClaimMission}
                          className="w-full bg-gradient-to-r from-[#ef4444] to-[#b91c1c] text-white text-[10px] sm:text-xs font-black uppercase tracking-widest py-2.5 rounded-lg hover:scale-105 transition-transform shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-[#fca5a5]/30 mt-2"
                        >
                          Assumir Missao
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
                    onClick={() => setIsRealtimeOn((prev) => !prev)}
                    className={`text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-lg border whitespace-nowrap transition-colors ${isRealtimeOn ? "text-[#4ade80] bg-[#4ade80]/10 border-[#4ade80]/30" : "text-gray-400 bg-white/5 border-white/5"}`}
                  >
                    Ao Vivo ({isRealtimeOn ? "Ligado" : "Pausado"})
                  </button>
                  <button
                    onClick={() => setShowFilters((prev) => !prev)}
                    className={`text-[10px] font-bold uppercase tracking-widest border transition-colors px-3 py-1 rounded-lg ${showFilters ? "text-black bg-[#CCA761] border-[#CCA761]" : "text-[#CCA761] border-[#CCA761]/30 hover:bg-[#CCA761]/10"}`}
                  >
                    Filtros
                  </button>
                </div>
              </div>

              {showFilters && (
                <div className="mb-4 p-3 rounded-xl border border-white/10 bg-white/5 flex flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    {[
                      ["all", "Todos"],
                      ["pending", "Pendentes"],
                      ["in_progress", "Em andamento"],
                      ["done", "Concluídas"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setStatusFilter(value as any)}
                        className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg border ${statusFilter === value ? "bg-[#CCA761] text-black border-[#CCA761]" : "border-white/10 text-gray-400 hover:text-white"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ["all", "Todos os tipos"],
                      ["Prazo", "Prazo"],
                      ["Processo", "Processo"],
                      ["CRM", "CRM"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setTypeFilter(value as any)}
                        className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-lg border ${typeFilter === value ? "bg-[#CCA761] text-black border-[#CCA761]" : "border-white/10 text-gray-400 hover:text-white"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                {visibleEvents.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 text-sm">Nenhuma atividade agendada.</div>
                ) : visibleEvents.map((ev, i) => {
                  const isDone = ev.status === 'Concluído';
                  const active = ev.active || false;
                  const bdgColor = ev.color || '#CCA761';
                  const isUrgentTask = String(ev.urgency || '').toUpperCase() === 'URGENTE';
                  const deadlineMeta = getDeadlineMeta(ev.scheduled_for);

                  // Lógica Visual: Escura quando pendente, Verde + Vibrante quando concluída. Cor do badge mantém.
                  const cardBgClass = isDone
                    ? 'border-[#4ade80]/30 bg-[#111] hover:bg-[#151515] shadow-[0_0_20px_rgba(74,222,128,0.05)]' // Feito -> Fundo premium com borda verde
                    : isUrgentTask
                      ? 'border-red-500/40 bg-[#140909] hover:bg-[#1a0b0b] opacity-95 hover:opacity-100 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
                      : 'border-white/5 bg-[#050505] hover:bg-[#0a0a0a] opacity-80 hover:opacity-100'; // Pendente -> Escuro para focar no tempo

                  const leftLineColor = isDone ? '#4ade80' : isUrgentTask ? '#ef4444' : 'rgba(255,255,255,0.1)';
                  const leftGlaow = isDone ? '0 0 10px rgba(74,222,128,0.5)' : isUrgentTask ? '0 0 10px rgba(239,68,68,0.5)' : 'none';

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

                                {ev.assigned_name_snapshot && (
                                  <span className="inline-flex items-center gap-1.5 text-[9px] text-gray-300 border border-white/10 bg-white/5 rounded-full px-2 py-0.5">
                                    {ev.assigned_avatar_url ? (
                                      <img src={ev.assigned_avatar_url} alt={ev.assigned_name_snapshot} className="w-4 h-4 rounded-full object-cover" />
                                    ) : (
                                      <span className="w-4 h-4 rounded-full bg-[#CCA761]/30 text-[#CCA761] flex items-center justify-center text-[8px] font-black">
                                        {String(ev.assigned_name_snapshot).slice(0, 1).toUpperCase()}
                                      </span>
                                    )}
                                    {ev.assigned_name_snapshot}
                                  </span>
                                )}
                              </div>
                              
                              <div className="flex">
                                {/* BADGE DE RECOMPENSA (MAYUS COINS) */}
                                 {gamificationEnabled && (
                                   <span className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 border rounded px-2 py-0.5 ${isDone ? 'text-gray-500 border-gray-600 bg-white/5' : 'text-[#CCA761] border-[#CCA761]/30 bg-[#CCA761]/10 shadow-[0_0_10px_rgba(204,167,97,0.2)]'}`}>
                                    +{getReward(ev)} <Coins size={10} className={isDone ? '' : 'text-[#FFD700]'} />
                                   </span>
                                 )}
                              </div>
                            </div>

                             {/* TÍTULO DA TAREFA */}
                             <h4 className={`text-sm font-bold tracking-wide transition-colors duration-500 mt-1 ${isDone ? 'text-[#4ade80] line-through decoration-[#4ade80]/50' : 'text-white'
                               }`}>{ev.title}</h4>

                             {ev.process_number && (
                               <div className="mt-2 flex items-center gap-2 flex-wrap">
                                 <span className="text-[10px] font-black tracking-wide text-[#CCA761]">Proc: {ev.process_number}</span>
                                 <button
                                   onClick={(event) => copyProcessNumber(event, ev)}
                                   title="Copiar número do processo"
                                   className="inline-flex items-center justify-center w-6 h-6 rounded border border-[#CCA761]/30 text-[#CCA761] hover:bg-[#CCA761]/10"
                                 >
                                   {copiedTaskId === ev.id ? <Check size={11} /> : <Copy size={11} />}
                                 </button>
                               </div>
                             )}

                              {ev.author_name && (
                                <p className="text-[10px] text-gray-400 font-semibold mt-1">Autor: {ev.author_name}</p>
                              )}

                              {deadlineMeta && (
                                <div className={`mt-2 inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest ${deadlineMeta.className}`}>
                                  <Calendar size={10} /> Fatal: {new Date(ev.scheduled_for).toLocaleDateString("pt-BR")}
                                </div>
                              )}

                              {ev.description && (
                                <div className="mt-2 p-2 rounded border border-white/10 bg-black/20 max-w-lg">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Resumo</span>
                                    <button
                                      onClick={(event) => copyTaskText(event, `summary-${ev.id}`, String(ev.description || ""))}
                                      className="inline-flex items-center justify-center w-5 h-5 rounded border border-[#CCA761]/30 text-[#CCA761] hover:bg-[#CCA761]/10"
                                      title="Copiar resumo"
                                    >
                                      {copiedTextKey === `summary-${ev.id}` ? <Check size={10} /> : <Copy size={10} />}
                                    </button>
                                  </div>
                                  <p className="text-[10px] text-zinc-400 line-clamp-2">{String(ev.description || "")}</p>
                                </div>
                              )}

                              {ev.responsible_notes && (
                                <div className="mt-2 p-2 rounded border border-white/10 bg-black/20 max-w-lg">
                                  <div className="flex items-center justify-between gap-2 mb-1">
                                    <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-black">Anotações</span>
                                    <button
                                      onClick={(event) => copyTaskText(event, `notes-${ev.id}`, String(ev.responsible_notes || ""))}
                                      className="inline-flex items-center justify-center w-5 h-5 rounded border border-[#CCA761]/30 text-[#CCA761] hover:bg-[#CCA761]/10"
                                      title="Copiar anotações"
                                    >
                                      {copiedTextKey === `notes-${ev.id}` ? <Check size={10} /> : <Copy size={10} />}
                                    </button>
                                  </div>
                                  <p className="text-[10px] text-zinc-400 line-clamp-2">{String(ev.responsible_notes || "")}</p>
                                </div>
                              )}
                              
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
                          {isTaskEditableByOwner(ev) && ev.status !== 'Concluído' && (
                            <button
                              onClick={(event) => openEditTaskModal(event, ev)}
                              className="mb-2 p-2 rounded-lg transition-colors border shadow-sm backdrop-blur-sm bg-[#111] text-[#CCA761] border-[#CCA761]/20 hover:bg-[#CCA761]/10"
                              title="Editar tarefa"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {!isTaskEditableByOwner(ev) && ev.status !== 'Concluído' && String(ev.assigned_to || "") === String(currentUserId || "") && (
                            <button
                              onClick={(event) => openNotesOnlyModal(event, ev)}
                              className="mb-2 p-2 rounded-lg transition-colors border shadow-sm backdrop-blur-sm bg-[#111] text-[#CCA761] border-[#CCA761]/20 hover:bg-[#CCA761]/10"
                              title="Editar somente anotações"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-black/40 rounded-xl border border-white/5">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">Prazos do dia</p>
                    <p className="mt-1 text-2xl font-black text-white">{deadlineStats.total}</p>
                  </div>
                  <div className="p-4 bg-black/40 rounded-xl border border-[#f87171]/30">
                    <p className="text-[10px] uppercase tracking-widest text-[#f87171] font-black">Críticos abertos</p>
                    <p className="mt-1 text-2xl font-black text-[#f87171]">{deadlineStats.criticalOpen}</p>
                  </div>
                  <div className="p-4 bg-black/40 rounded-xl border border-white/5 col-span-2">
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 font-black">Abertos com você</p>
                    <p className="mt-1 text-xl font-black text-[#CCA761]">{deadlineStats.mine} <span className="text-sm font-semibold text-gray-500">de {deadlineStats.open}</span></p>
                  </div>
                </div>
              </GlassCard>

              <div className="p-6 rounded-2xl border border-[#CCA761]/30 bg-gradient-to-br from-[#CCA761]/20 to-transparent">
                <Star className="text-[#CCA761] mb-4" size={24} />
                <h5 className="text-sm font-bold text-white mb-2 tracking-wide">Insight da Inteligência (MAYUS)</h5>
                <p className="text-[11px] text-gray-400 leading-relaxed italic font-medium">&quot;{buildInsightText}&quot;</p>
              </div>
            </div>

          </div>
        )}
      </div>

      {showCreateTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setShowCreateTaskModal(false); setEditingTaskId(null); }} />
          <div className="relative w-full max-w-xl rounded-2xl border border-[#CCA761]/30 bg-[#0a0a0a] p-6 shadow-[0_0_30px_rgba(0,0,0,0.6)]">
            <button onClick={() => { setShowCreateTaskModal(false); setEditingTaskId(null); }} className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white">
              <X size={16} />
            </button>
            <h4 className="text-lg font-bold text-white mb-4">{editingTaskId ? "Editar tarefa" : "Nova tarefa"}</h4>
            <div className="space-y-3">
              <input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Titulo da tarefa"
                className="w-full bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
              />
              <div className="relative">
                <textarea
                  value={newTaskResponsibleNotes}
                  onChange={(e) => setNewTaskResponsibleNotes(e.target.value)}
                  placeholder="Anotações do responsável"
                  className="w-full bg-[#151515] border border-white/10 rounded-lg px-3 py-2 pr-10 text-sm text-white min-h-[90px]"
                />
                <button
                  type="button"
                  onClick={(event) => copyTaskText(event, "modal-notes", newTaskResponsibleNotes)}
                  className="absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded border border-[#CCA761]/30 text-[#CCA761] hover:bg-[#CCA761]/10"
                  title="Copiar anotações"
                >
                  {copiedTextKey === "modal-notes" ? <Check size={11} /> : <Copy size={11} />}
                </button>
              </div>
              <div className="relative">
                <input
                  value={newTaskProcessNumber}
                  onChange={(e) => setNewTaskProcessNumber(e.target.value)}
                  placeholder="Número do processo (opcional)"
                  className="w-full bg-[#151515] border border-white/10 rounded-lg px-3 py-2 pr-10 text-sm text-white"
                />
                <button
                  type="button"
                  onClick={(event) => copyTaskText(event, "modal-process", newTaskProcessNumber)}
                  className="absolute top-1/2 -translate-y-1/2 right-2 inline-flex items-center justify-center w-7 h-7 rounded border border-[#CCA761]/30 text-[#CCA761] hover:bg-[#CCA761]/10"
                  title="Copiar número do processo"
                >
                  {copiedTextKey === "modal-process" ? <Check size={11} /> : <Copy size={11} />}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select value={newTaskUrgency} onChange={(e) => setNewTaskUrgency(e.target.value as any)} className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="URGENTE">Urgente</option>
                  <option value="ATENCAO">Atencao</option>
                  <option value="ROTINA">Rotina</option>
                </select>
                <select value={newTaskType} onChange={(e) => setNewTaskType(e.target.value as any)} className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="Tarefa">Tarefa</option>
                  <option value="Prazo">Prazo</option>
                  <option value="Processo">Processo</option>
                  <option value="CRM">CRM</option>
                </select>
                <input type="date" value={newTaskScheduledFor} onChange={(e) => setNewTaskScheduledFor(e.target.value)} className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={newTaskVisibility} onChange={(e) => setNewTaskVisibility(e.target.value as any)} className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="private">Pessoal (nao vai para global)</option>
                  {canAssignGlobalTask && (
                    <option value="global">Global (vai para agenda global)</option>
                  )}
                </select>
                <select
                  value={newTaskVisibility === "private" ? currentUserId || "" : newTaskAssignedTo}
                  onChange={(e) => setNewTaskAssignedTo(e.target.value)}
                  disabled={newTaskVisibility === "private" || teamMembers.length === 0}
                  className="bg-[#151515] border border-white/10 rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value={currentUserId || ""}>Responsável: você</option>
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-300 bg-[#151515] border border-white/10 rounded-lg px-3 py-2">
                  <input
                    type="checkbox"
                    checked={newTaskReminderOnly}
                    onChange={(e) => setNewTaskReminderOnly(e.target.checked)}
                  />
                  Mostrar somente na data marcada (lembrete)
                </label>
              </div>

              <p className="text-[11px] text-gray-500">
                {newTaskVisibility === "private" ? "Tarefa pessoal: visivel apenas para voce na Agenda Diaria." : "Tarefa global: pode aparecer tambem na Agenda Global."}
              </p>
              <div className="flex justify-end pt-2">
                {editingTaskId && (
                  <button
                    onClick={handleDeleteTask}
                    disabled={isCreatingTask}
                    className="mr-auto bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    Excluir
                  </button>
                )}
                <button
                  onClick={handleCreatePersonalTask}
                  disabled={isCreatingTask || !newTaskTitle.trim()}
                  className="bg-gradient-to-r from-[#CCA761] to-[#eadd87] text-black px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest disabled:opacity-50"
                >
                  {isCreatingTask ? "Salvando..." : editingTaskId ? "Salvar edição" : "Criar tarefa"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {notesOnlyTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => { setNotesOnlyTask(null); setNotesOnlyValue(""); }} />
          <div className="relative w-full max-w-lg rounded-2xl border border-[#CCA761]/30 bg-[#0a0a0a] p-6 shadow-[0_0_30px_rgba(0,0,0,0.6)]">
            <button onClick={() => { setNotesOnlyTask(null); setNotesOnlyValue(""); }} className="absolute top-4 right-4 p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white">
              <X size={16} />
            </button>
            <h4 className="text-lg font-bold text-white mb-3">Anotações do responsável</h4>
            <p className="text-[11px] text-gray-500 mb-3">Nesta tarefa você pode editar somente as anotações.</p>
            <div className="relative">
              <textarea
                value={notesOnlyValue}
                onChange={(e) => setNotesOnlyValue(e.target.value)}
                placeholder="Escreva suas anotações"
                className="w-full min-h-[140px] bg-[#151515] border border-white/10 rounded-lg px-3 py-2 pr-10 text-sm text-white"
              />
              <button
                type="button"
                onClick={(event) => copyTaskText(event, "notes-only-modal", notesOnlyValue)}
                className="absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded border border-[#CCA761]/30 text-[#CCA761] hover:bg-[#CCA761]/10"
                title="Copiar anotações"
              >
                {copiedTextKey === "notes-only-modal" ? <Check size={11} /> : <Copy size={11} />}
              </button>
            </div>
            <div className="flex justify-end mt-4">
              <button
                onClick={saveNotesOnly}
                disabled={isSavingNotesOnly}
                className="bg-gradient-to-r from-[#CCA761] to-[#eadd87] text-black px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest disabled:opacity-50"
              >
                {isSavingNotesOnly ? "Salvando..." : "Salvar anotações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
