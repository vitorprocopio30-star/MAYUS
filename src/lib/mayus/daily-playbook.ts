import { buildCrmLeadNextStepStatus } from "@/lib/growth/crm-next-step";

export type DailyPlaybookChannel = "whatsapp" | "email" | "mayus_panel";
export type DailyPlaybookScope = "executive" | "growth" | "legal" | "full";
export type DailyPlaybookDetailLevel = "short" | "standard" | "deep";

export type DailyPlaybookPreferences = {
  enabled: boolean;
  timezone: string;
  deliveryTime: string;
  weekdays: number[];
  channels: DailyPlaybookChannel[];
  scope: DailyPlaybookScope;
  detailLevel: DailyPlaybookDetailLevel;
};

export type DailyPlaybookCrmTask = {
  id: string;
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  sector?: string | null;
  stageName?: string | null;
  assignedName?: string | null;
  phone?: string | null;
  isWin?: boolean | null;
  isLoss?: boolean | null;
  created_at?: string | null;
  data_ultima_movimentacao?: string | null;
};

export type DailyPlaybookUserTask = {
  id: string;
  title?: string | null;
  description?: string | null;
  urgency?: string | null;
  status?: string | null;
  scheduled_for?: string | null;
  assigned_name_snapshot?: string | null;
  client_name?: string | null;
  type?: string | null;
};

export type DailyPlaybookInput = {
  firmName?: string | null;
  preferences?: Partial<DailyPlaybookPreferences> | null;
  crmTasks?: DailyPlaybookCrmTask[];
  userTasks?: DailyPlaybookUserTask[];
  now?: Date;
};

export type DailyPlaybookAction = {
  area: "crm" | "agenda" | "legal" | "system";
  title: string;
  detail: string;
  urgency: "critical" | "attention" | "routine";
  ownerLabel: string;
  dueAt?: string | null;
};

export type DailyPlaybook = {
  title: string;
  generatedAt: string;
  preferences: DailyPlaybookPreferences;
  executiveSummary: string;
  metrics: {
    crmLeadsNeedingNextStep: number;
    agendaCriticalTasks: number;
    agendaTodayTasks: number;
    priorityActions: number;
  };
  crm: {
    leadsNeedingNextStep: Array<{
      id: string;
      title: string;
      reason: string;
      organizedObjective: string;
      ownerLabel: string;
      dueAt: string;
      channel: string;
    }>;
  };
  agenda: {
    today: Array<{
      id: string;
      title: string;
      urgency: string;
      ownerLabel: string;
      scheduledFor: string | null;
    }>;
    critical: Array<{
      id: string;
      title: string;
      urgency: string;
      ownerLabel: string;
      scheduledFor: string | null;
    }>;
  };
  priorityActions: DailyPlaybookAction[];
  whatsappSummary: string;
  externalSideEffectsBlocked: boolean;
};

export type DailyPlaybookBrainTrace = {
  taskId: string;
  runId: string;
  stepId: string;
  artifactId: string | null;
} | null;

type DailyPlaybookSupabase = {
  from: (table: string) => any;
};

const DEFAULT_PREFERENCES: DailyPlaybookPreferences = {
  enabled: false,
  timezone: "America/Sao_Paulo",
  deliveryTime: "08:00",
  weekdays: [1, 2, 3, 4, 5],
  channels: ["mayus_panel"],
  scope: "full",
  detailLevel: "standard",
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeDeliveryTime(value?: string | null) {
  const text = cleanText(value);
  const match = text?.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (!match) return DEFAULT_PREFERENCES.deliveryTime;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}

function normalizeWeekdays(value?: number[] | null) {
  const weekdays = Array.from(new Set((value || []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)));
  return weekdays.length > 0 ? weekdays : DEFAULT_PREFERENCES.weekdays;
}

function normalizeChannels(value?: DailyPlaybookChannel[] | null) {
  const allowed = new Set<DailyPlaybookChannel>(["whatsapp", "email", "mayus_panel"]);
  const channels = Array.from(new Set((value || []).filter((channel) => allowed.has(channel))));
  return channels.length > 0 ? channels : DEFAULT_PREFERENCES.channels;
}

export function normalizeDailyPlaybookPreferences(
  preferences?: Partial<DailyPlaybookPreferences> | null,
): DailyPlaybookPreferences {
  const scope = preferences?.scope && ["executive", "growth", "legal", "full"].includes(preferences.scope)
    ? preferences.scope
    : DEFAULT_PREFERENCES.scope;
  const detailLevel = preferences?.detailLevel && ["short", "standard", "deep"].includes(preferences.detailLevel)
    ? preferences.detailLevel
    : DEFAULT_PREFERENCES.detailLevel;

  return {
    enabled: Boolean(preferences?.enabled),
    timezone: cleanText(preferences?.timezone) || DEFAULT_PREFERENCES.timezone,
    deliveryTime: normalizeDeliveryTime(preferences?.deliveryTime),
    weekdays: normalizeWeekdays(preferences?.weekdays),
    channels: normalizeChannels(preferences?.channels),
    scope,
    detailLevel,
  };
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isSameLocalDay(value: string | null | undefined, now: Date) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return false;
  return startOfDay(date).getTime() === startOfDay(now).getTime();
}

function isCriticalTask(task: DailyPlaybookUserTask) {
  const content = normalize(`${task.urgency || ""} ${task.title || ""} ${task.description || ""}`);
  return /urgente|critico|critica|prazo|audiencia|liminar|bloqueio/.test(content);
}

function compactAgendaTask(task: DailyPlaybookUserTask) {
  return {
    id: task.id,
    title: cleanText(task.title) || "Tarefa sem titulo",
    urgency: cleanText(task.urgency) || "ROTINA",
    ownerLabel: cleanText(task.assigned_name_snapshot) || "responsavel interno",
    scheduledFor: cleanText(task.scheduled_for),
  };
}

function buildCrmActions(input: DailyPlaybookInput, now: Date): DailyPlaybook["crm"]["leadsNeedingNextStep"] {
  return (input.crmTasks || [])
    .map((task) => {
      const status = buildCrmLeadNextStepStatus({
        title: task.title,
        description: task.description,
        tags: task.tags,
        stageName: task.stageName || task.sector,
        legalArea: task.sector,
        phone: task.phone,
        assignedName: task.assignedName,
        isWin: task.isWin,
        isLoss: task.isLoss,
        lastMovedAt: task.data_ultima_movimentacao,
        createdAt: task.created_at,
        now,
      });

      return { task, status };
    })
    .filter((item) => item.status.needsNextStep)
    .slice(0, 12)
    .map(({ task, status }) => ({
      id: task.id,
      title: cleanText(task.title) || "Lead sem nome",
      reason: status.reason,
      organizedObjective: status.organizedPlan.objective,
      ownerLabel: status.organizedPlan.ownerLabel,
      dueAt: status.organizedPlan.dueAt,
      channel: status.organizedPlan.channel,
    }));
}

function buildPriorityActions(params: {
  crmLeads: DailyPlaybook["crm"]["leadsNeedingNextStep"];
  todayTasks: DailyPlaybook["agenda"]["today"];
  criticalTasks: DailyPlaybook["agenda"]["critical"];
}) {
  const actions: DailyPlaybookAction[] = [];

  params.criticalTasks.slice(0, 4).forEach((task) => {
    actions.push({
      area: "agenda",
      title: task.title,
      detail: "Resolver tarefa critica antes de abrir novas frentes.",
      urgency: "critical",
      ownerLabel: task.ownerLabel,
      dueAt: task.scheduledFor,
    });
  });

  params.crmLeads.slice(0, 4).forEach((lead) => {
    actions.push({
      area: "crm",
      title: lead.title,
      detail: lead.organizedObjective,
      urgency: "attention",
      ownerLabel: lead.ownerLabel,
      dueAt: lead.dueAt,
    });
  });

  if (actions.length === 0 && params.todayTasks.length > 0) {
    params.todayTasks.slice(0, 3).forEach((task) => {
      actions.push({
        area: "agenda",
        title: task.title,
        detail: "Executar tarefa do dia e registrar conclusao no MAYUS.",
        urgency: "routine",
        ownerLabel: task.ownerLabel,
        dueAt: task.scheduledFor,
      });
    });
  }

  if (actions.length === 0) {
    actions.push({
      area: "system",
      title: "Manter operacao limpa",
      detail: "Sem alerta prioritario. Revisar CRM, agenda e pendencias antes de iniciar novas campanhas.",
      urgency: "routine",
      ownerLabel: "MAYUS",
      dueAt: null,
    });
  }

  return actions.slice(0, 8);
}

function buildExecutiveSummary(params: {
  firmName: string;
  crmLeadCount: number;
  criticalTaskCount: number;
  todayTaskCount: number;
}) {
  const signals = [
    params.crmLeadCount > 0 ? `${params.crmLeadCount} lead(s) precisam de proximo passo organizado` : null,
    params.criticalTaskCount > 0 ? `${params.criticalTaskCount} tarefa(s) critica(s) pedem atencao` : null,
    params.todayTaskCount > 0 ? `${params.todayTaskCount} tarefa(s) na agenda de hoje` : null,
  ].filter(Boolean);

  if (signals.length === 0) {
    return `${params.firmName}: operacao sem alerta prioritario no inicio do dia.`;
  }

  return `${params.firmName}: ${signals.join("; ")}.`;
}

function buildWhatsAppSummary(playbook: Omit<DailyPlaybook, "whatsappSummary">) {
  const topActions = playbook.priorityActions
    .slice(0, playbook.preferences.detailLevel === "short" ? 3 : 5)
    .map((action, index) => `${index + 1}. ${action.title}: ${action.detail}`)
    .join("\n");

  return [
    `MAYUS Playbook - ${playbook.title}`,
    playbook.executiveSummary,
    "",
    "Acoes prioritarias:",
    topActions,
    "",
    "Nenhuma acao externa foi executada automaticamente.",
  ].join("\n").trim();
}

export function buildDailyPlaybook(input: DailyPlaybookInput): DailyPlaybook {
  const now = input.now || new Date();
  const preferences = normalizeDailyPlaybookPreferences(input.preferences);
  const firmName = cleanText(input.firmName) || "Escritorio";
  const crmLeads = buildCrmActions(input, now);
  const todayTasks = (input.userTasks || [])
    .filter((task) => isSameLocalDay(task.scheduled_for, now) && normalize(task.status) !== "concluido")
    .map(compactAgendaTask)
    .slice(0, 12);
  const criticalTasks = (input.userTasks || [])
    .filter((task) => isCriticalTask(task) && normalize(task.status) !== "concluido")
    .map(compactAgendaTask)
    .slice(0, 12);
  const priorityActions = buildPriorityActions({ crmLeads, todayTasks, criticalTasks });
  const generatedAt = now.toISOString();
  const title = `${firmName} - Playbook do dia`;
  const base = {
    title,
    generatedAt,
    preferences,
    executiveSummary: buildExecutiveSummary({
      firmName,
      crmLeadCount: crmLeads.length,
      criticalTaskCount: criticalTasks.length,
      todayTaskCount: todayTasks.length,
    }),
    metrics: {
      crmLeadsNeedingNextStep: crmLeads.length,
      agendaCriticalTasks: criticalTasks.length,
      agendaTodayTasks: todayTasks.length,
      priorityActions: priorityActions.length,
    },
    crm: {
      leadsNeedingNextStep: crmLeads,
    },
    agenda: {
      today: todayTasks,
      critical: criticalTasks,
    },
    priorityActions,
    externalSideEffectsBlocked: true,
  };

  return {
    ...base,
    whatsappSummary: buildWhatsAppSummary(base),
  };
}

export function buildDailyPlaybookMetadata(playbook: DailyPlaybook) {
  return {
    summary: playbook.executiveSummary,
    generated_at: playbook.generatedAt,
    delivery_time: playbook.preferences.deliveryTime,
    channels: playbook.preferences.channels,
    scope: playbook.preferences.scope,
    detail_level: playbook.preferences.detailLevel,
    crm_leads_needing_next_step: playbook.metrics.crmLeadsNeedingNextStep,
    agenda_critical_tasks: playbook.metrics.agendaCriticalTasks,
    agenda_today_tasks: playbook.metrics.agendaTodayTasks,
    priority_actions: playbook.priorityActions,
    external_side_effects_blocked: playbook.externalSideEffectsBlocked,
  };
}

export async function registerDailyPlaybookBrainArtifact(params: {
  tenantId: string;
  userId: string | null;
  playbook: DailyPlaybook;
  supabase: DailyPlaybookSupabase;
}): Promise<DailyPlaybookBrainTrace> {
  const now = new Date().toISOString();
  const metadata = buildDailyPlaybookMetadata(params.playbook);
  let createdTaskId: string | null = null;

  try {
    const { data: task, error: taskError } = await params.supabase
      .from("brain_tasks")
      .insert({
        tenant_id: params.tenantId,
        created_by: params.userId,
        channel: "mayus",
        module: "operations",
        status: "completed_with_warnings",
        title: params.playbook.title,
        goal: "Gerar playbook operacional diario configuravel para orientar o escritorio sem executar side effects externos.",
        task_input: {
          source: "api.mayus.daily-playbook",
          preferences: {
            delivery_time: params.playbook.preferences.deliveryTime,
            weekdays: params.playbook.preferences.weekdays,
            channels: params.playbook.preferences.channels,
            scope: params.playbook.preferences.scope,
            detail_level: params.playbook.preferences.detailLevel,
          },
        },
        task_context: {
          artifact_type: "daily_playbook",
          priority_actions: params.playbook.metrics.priorityActions,
        },
        policy_snapshot: {
          external_side_effects: false,
          secrets_allowed: false,
          human_handoff_required: true,
          raw_contacts_allowed: false,
        },
        result_summary: params.playbook.executiveSummary,
        started_at: now,
        completed_at: now,
      })
      .select("id")
      .single();

    if (taskError || !task?.id) throw taskError || new Error("brain_task_missing");
    createdTaskId = task.id;

    const { data: run, error: runError } = await params.supabase
      .from("brain_runs")
      .insert({
        task_id: task.id,
        tenant_id: params.tenantId,
        attempt_number: 1,
        status: "completed_with_warnings",
        summary: params.playbook.executiveSummary,
        started_at: now,
        completed_at: now,
      })
      .select("id")
      .single();

    if (runError || !run?.id) throw runError || new Error("brain_run_missing");

    const { data: step, error: stepError } = await params.supabase
      .from("brain_steps")
      .insert({
        task_id: task.id,
        run_id: run.id,
        tenant_id: params.tenantId,
        order_index: 1,
        step_key: "daily_playbook",
        title: "Gerar Playbook diario",
        step_type: "operation",
        capability_name: "daily_playbook",
        handler_type: "mayus_daily_playbook",
        status: "completed",
        input_payload: {
          scope: params.playbook.preferences.scope,
          detail_level: params.playbook.preferences.detailLevel,
        },
        output_payload: {
          metrics: params.playbook.metrics,
          external_side_effects_blocked: true,
        },
        started_at: now,
        completed_at: now,
      })
      .select("id")
      .single();

    if (stepError || !step?.id) throw stepError || new Error("brain_step_missing");

    const { data: artifact, error: artifactError } = await params.supabase
      .from("brain_artifacts")
      .insert({
        tenant_id: params.tenantId,
        task_id: task.id,
        run_id: run.id,
        step_id: step.id,
        artifact_type: "daily_playbook",
        title: params.playbook.title,
        mime_type: "application/json",
        source_module: "mayus",
        metadata,
      })
      .select("id")
      .single();

    if (artifactError) throw artifactError;

    const { error: learningError } = await params.supabase
      .from("learning_events")
      .insert({
        tenant_id: params.tenantId,
        task_id: task.id,
        run_id: run.id,
        step_id: step.id,
        event_type: "daily_playbook_created",
        source_module: "mayus",
        payload: {
          summary: params.playbook.executiveSummary,
          artifact_id: artifact?.id || null,
          metrics: params.playbook.metrics,
          channels: params.playbook.preferences.channels,
          external_side_effects_blocked: true,
        },
        created_by: params.userId,
      });

    if (learningError) throw learningError;

    return {
      taskId: task.id,
      runId: run.id,
      stepId: step.id,
      artifactId: artifact?.id || null,
    };
  } catch (error) {
    if (createdTaskId) {
      await params.supabase.from("brain_tasks").delete().eq("id", createdTaskId);
    }
    console.error("[mayus][daily-playbook][artifact]", error);
    return null;
  }
}
