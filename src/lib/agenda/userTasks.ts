export const USER_TASKS_TABLE = "user_tasks";

export const URGENCY_ORDER: Record<string, number> = {
  URGENTE: 1,
  ATENCAO: 2,
  ATENÇÃO: 2,
  ROTINA: 3,
  TRANQUILO: 4,
};

export type AgendaTaskRecord = {
  id: string;
  tenant_id: string;
  title: string;
  description?: string | null;
  assigned_to?: string | null;
  assigned_name_snapshot?: string | null;
  created_by?: string | null;
  created_by_agent?: string | null;
  source_table?: string | null;
  source_id?: string | null;
  urgency?: string | null;
  status?: string | null;
  scheduled_for?: string | null;
  completed_at?: string | null;
  completed_by?: string | null;
  completed_by_name_snapshot?: string | null;
  is_critical?: boolean | null;
  category?: string | null;
  type?: string | null;
  color?: string | null;
  client_name?: string | null;
  process_number?: string | null;
  author_name?: string | null;
  visibility?: "private" | "global" | null;
  task_kind?: "task" | "mission" | null;
  reward_coins?: number | null;
  mission_type?: string | null;
  expires_at?: string | null;
  created_by_role?: string | null;
  created_at?: string | null;
};

function normalizeUrgencyLabel(value?: string | null) {
  const normalized = String(value ?? "ROTINA")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  if (normalized in URGENCY_ORDER) return normalized;
  return "ROTINA";
}

export function normalizeAgendaStatus(value?: string | null) {
  const normalized = String(value ?? "Pendente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (normalized === "concluido") return "Concluído";
  if (normalized === "em andamento") return "Em andamento";
  return "Pendente";
}

export function inferUrgencyFromDeadline(deadline?: string | null) {
  if (!deadline) return "ROTINA";

  const now = new Date();
  const due = new Date(deadline);
  const diffDays = Math.floor((due.getTime() - now.getTime()) / 86400000);

  if (diffDays <= 0) return "URGENTE";
  if (diffDays <= 2) return "ATENCAO";
  if (diffDays <= 7) return "ROTINA";
  return "TRANQUILO";
}

export function inferUrgencyFromText(...values: Array<string | null | undefined>) {
  const text = values
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/(urgente|prazo fatal|hoje|liminar|audiencia)/.test(text)) return "URGENTE";
  if (/(atencao|atencao|amanha|follow-?up|retorno)/.test(text)) return "ATENCAO";
  if (/(rotina|crm|cadencia|cadencia|alinhamento)/.test(text)) return "ROTINA";
  return "TRANQUILO";
}

export function getUrgencyColor(urgency?: string | null) {
  const normalized = normalizeUrgencyLabel(urgency);
  if (normalized === "URGENTE") return "#f87171";
  if (normalized === "ATENCAO") return "#CCA761";
  if (normalized === "TRANQUILO") return "#22d3ee";
  return "#9ca3af";
}

export function getUrgencyLabel(urgency?: string | null) {
  const normalized = normalizeUrgencyLabel(urgency);
  if (normalized === "ATENCAO") return "ATENÇÃO";
  return normalized;
}

export function sortAgendaTasks<T extends AgendaTaskRecord>(tasks: T[]) {
  return [...tasks].sort((a, b) => {
    const urgencyDiff =
      (URGENCY_ORDER[normalizeUrgencyLabel(a.urgency)] ?? 99) -
      (URGENCY_ORDER[normalizeUrgencyLabel(b.urgency)] ?? 99);
    if (urgencyDiff !== 0) return urgencyDiff;

    const aTime = a.scheduled_for || a.created_at || "";
    const bTime = b.scheduled_for || b.created_at || "";
    return aTime.localeCompare(bTime);
  });
}

export function toAgendaEvent(task: AgendaTaskRecord) {
  const normalizedStatus = normalizeAgendaStatus(task.status);
  const completedAt = task.completed_at ? new Date(task.completed_at) : null;
  const hasCompletedTime = normalizedStatus === "Concluído" && completedAt && !Number.isNaN(completedAt.getTime());

  return {
    ...task,
    status: normalizedStatus,
    urgency: normalizeUrgencyLabel(task.urgency),
    category: task.category || getUrgencyLabel(task.urgency),
    color: task.color || getUrgencyColor(task.urgency),
    time_text: hasCompletedTime
      ? completedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : "--",
    person: task.completed_by_name_snapshot || task.assigned_name_snapshot || "Equipe MAYUS",
    visibility: task.visibility || "global",
    task_kind: task.task_kind || "task",
    reward_coins: task.reward_coins ?? (normalizeUrgencyLabel(task.urgency) === "URGENTE" ? 100 : normalizeUrgencyLabel(task.urgency) === "ATENCAO" ? 50 : 20),
  };
}

function buildBasePayload(params: {
  tenantId: string;
  sourceTable: string;
  sourceId: string;
  title: string;
  description?: string | null;
  assignedTo?: string | null;
  assignedName?: string | null;
  createdBy?: string | null;
  createdByAgent?: string | null;
  urgency?: string | null;
  scheduledFor?: string | null;
  isCritical?: boolean;
  category?: string | null;
  type?: string | null;
  color?: string | null;
  clientName?: string | null;
  status?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
  visibility?: "private" | "global";
  taskKind?: "task" | "mission";
  rewardCoins?: number;
  missionType?: string | null;
  expiresAt?: string | null;
  createdByRole?: string | null;
}) {
  const urgency = normalizeUrgencyLabel(params.urgency);
  const status = normalizeAgendaStatus(params.status);
  const legacyUrgency =
    urgency === "URGENTE"
      ? "urgente"
      : urgency === "ATENCAO"
        ? "alta"
        : urgency === "TRANQUILO"
          ? "baixa"
          : "normal";
  const legacyType = String(params.type || "Tarefa").toLowerCase();
  const scheduledFor = params.scheduledFor || new Date().toISOString();

  return {
    tenant_id: params.tenantId,
    user_id: params.assignedTo || null,
    titulo: params.title,
    descricao: params.description || null,
    tipo: legacyType,
    data_inicio: scheduledFor,
    urgencia: legacyUrgency,
    origem: params.sourceTable === "process_prazos" ? "processo" : "manual",
    criado_por_ia: Boolean(params.createdByAgent),
    source_table: params.sourceTable,
    source_id: params.sourceId,
    title: params.title,
    description: params.description || null,
    assigned_to: params.assignedTo || null,
    assigned_name_snapshot: params.assignedName || null,
    created_by: params.createdBy || null,
    created_by_agent: params.createdByAgent || null,
    urgency,
    status,
    scheduled_for: scheduledFor,
    completed_at: params.completedAt || null,
    completed_by: params.completedBy || null,
    completed_by_name_snapshot: params.completedByName || null,
    visibility: params.visibility || "global",
    task_kind: params.taskKind || "task",
    reward_coins: params.rewardCoins ?? (urgency === "URGENTE" ? 100 : urgency === "ATENCAO" ? 50 : 20),
    mission_type: params.missionType || null,
    expires_at: params.expiresAt || null,
    created_by_role: params.createdByRole || null,
    is_critical: Boolean(params.isCritical || urgency === "URGENTE"),
    category: params.category || getUrgencyLabel(urgency),
    type: params.type || "Tarefa",
    color: params.color || getUrgencyColor(urgency),
    client_name: params.clientName || null,
  };
}

export function buildAgendaPayloadFromCrmTask(params: {
  tenantId: string;
  task: any;
  assignedName?: string | null;
  createdBy?: string | null;
  createdByAgent?: string | null;
}) {
  const urgency = inferUrgencyFromText(params.task?.title, params.task?.description, ...(params.task?.tags || []));
  return buildBasePayload({
    tenantId: params.tenantId,
    sourceTable: "crm_tasks",
    sourceId: params.task.id,
    title: params.task.title,
    description: params.task.description,
    assignedTo: params.task.assigned_to,
    assignedName: params.assignedName,
    createdBy: params.createdBy,
    createdByAgent: params.createdByAgent,
    urgency,
    scheduledFor: params.task.data_ultima_movimentacao || params.task.created_at || new Date().toISOString(),
    category: getUrgencyLabel(urgency),
    type: "CRM",
    clientName: params.task.client_name || null,
    visibility: "global",
    taskKind: "task",
  });
}

export function buildAgendaPayloadFromProcessTask(params: {
  tenantId: string;
  task: any;
  assignedName?: string | null;
  createdBy?: string | null;
  createdByAgent?: string | null;
}) {
  const urgency = params.task?.prazo_fatal
    ? inferUrgencyFromDeadline(params.task.prazo_fatal)
    : inferUrgencyFromText(params.task?.title, params.task?.description, params.task?.demanda);

  return buildBasePayload({
    tenantId: params.tenantId,
    sourceTable: "process_tasks",
    sourceId: params.task.id,
    title: params.task.title,
    description: params.task.description,
    assignedTo: params.task.assigned_to,
    assignedName: params.assignedName,
    createdBy: params.createdBy,
    createdByAgent: params.createdByAgent,
    urgency,
    scheduledFor: params.task.prazo_fatal || params.task.created_at || new Date().toISOString(),
    isCritical: urgency === "URGENTE",
    category: getUrgencyLabel(urgency),
    type: "Processo",
    clientName: params.task.client_name || null,
    visibility: "global",
    taskKind: "task",
  });
}

export function buildAgendaPayloadFromProcessPrazo(params: {
  tenantId: string;
  prazo: any;
  assignedName?: string | null;
  createdBy?: string | null;
  createdByAgent?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
}) {
  const urgency = params.prazo?.data_vencimento
    ? inferUrgencyFromDeadline(params.prazo.data_vencimento)
    : inferUrgencyFromText(
        params.prazo?.tipo,
        params.prazo?.descricao,
        params.prazo?.monitored_processes?.ultima_movimentacao_texto
      );

  const isCompleted = String(params.prazo?.status ?? "").toLowerCase() === "concluido";

  return buildBasePayload({
    tenantId: params.tenantId,
    sourceTable: "process_prazos",
    sourceId: params.prazo.id,
    title: params.prazo.descricao || params.prazo.monitored_processes?.numero_processo || "Prazo processual",
    description: params.prazo.monitored_processes?.resumo_curto || params.prazo.monitored_processes?.ultima_movimentacao_texto || null,
    assignedTo: params.prazo.responsavel_id,
    assignedName: params.assignedName,
    createdBy: params.createdBy,
    createdByAgent: params.createdByAgent,
    urgency,
    status: isCompleted ? "Concluído" : "Pendente",
    scheduledFor: params.prazo.data_vencimento || params.prazo.created_at || new Date().toISOString(),
    completedAt: isCompleted ? params.prazo.completed_at || new Date().toISOString() : null,
    completedBy: isCompleted ? params.completedBy || params.prazo.responsavel_id || null : null,
    completedByName: isCompleted ? params.completedByName || params.assignedName || null : null,
    isCritical: urgency === "URGENTE",
    category: getUrgencyLabel(urgency),
    type: "Prazo",
    clientName: params.prazo.monitored_processes?.cliente_nome || null,
    visibility: "global",
    taskKind: "task",
  });
}

export function buildAgendaPayloadFromManualTask(params: {
  tenantId: string;
  title: string;
  description?: string | null;
  assignedTo?: string | null;
  assignedName?: string | null;
  createdBy?: string | null;
  createdByRole?: string | null;
  urgency?: string | null;
  scheduledFor?: string | null;
  type?: string | null;
  visibility: "private" | "global";
}) {
  const urgency = normalizeUrgencyLabel(params.urgency);
  return buildBasePayload({
    tenantId: params.tenantId,
    sourceTable: params.visibility === "private" ? "manual_private" : "manual_admin",
    sourceId: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: params.title,
    description: params.description || null,
    assignedTo: params.assignedTo || null,
    assignedName: params.assignedName || null,
    createdBy: params.createdBy || null,
    createdByRole: params.createdByRole || null,
    urgency,
    scheduledFor: params.scheduledFor || new Date().toISOString(),
    category: getUrgencyLabel(urgency),
    type: params.type || "Tarefa",
    visibility: params.visibility,
    taskKind: "task",
  });
}

export function buildAgendaPayloadFromMission(params: {
  tenantId: string;
  title: string;
  description?: string | null;
  assignedTo?: string | null;
  assignedName?: string | null;
  createdBy?: string | null;
  createdByRole?: string | null;
  urgency?: string | null;
  rewardCoins?: number;
  expiresAt?: string | null;
  missionType?: string | null;
  visibility?: "private" | "global";
}) {
  const urgency = normalizeUrgencyLabel(params.urgency);
  return buildBasePayload({
    tenantId: params.tenantId,
    sourceTable: "manual_mission",
    sourceId: `mission-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: params.title,
    description: params.description || null,
    assignedTo: params.assignedTo || null,
    assignedName: params.assignedName || null,
    createdBy: params.createdBy || null,
    createdByRole: params.createdByRole || null,
    urgency,
    scheduledFor: new Date().toISOString(),
    category: "OPORTUNIDADE",
    type: "Missão",
    visibility: params.visibility || "global",
    taskKind: "mission",
    rewardCoins: params.rewardCoins ?? 1000,
    missionType: params.missionType || "especial",
    expiresAt: params.expiresAt || null,
  });
}

export async function syncAgendaTaskBySource(supabase: any, payload: Record<string, any>) {
  const { data: existing, error: selectError } = await supabase
    .from(USER_TASKS_TABLE)
    .select("id, status, completed_at, completed_by, completed_by_name_snapshot")
    .eq("source_table", payload.source_table)
    .eq("source_id", payload.source_id)
    .maybeSingle();

  if (selectError) throw selectError;

  if (existing?.id) {
    const { error } = await supabase
      .from(USER_TASKS_TABLE)
      .update(payload)
      .eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const insertPayload = {
    ...payload,
    status: payload.status || "Pendente",
    completed_at: payload.completed_at || null,
    completed_by: payload.completed_by || null,
    completed_by_name_snapshot: payload.completed_by_name_snapshot || null,
  };

  const { data, error } = await supabase
    .from(USER_TASKS_TABLE)
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) throw error;
  return data?.id ?? null;
}

export async function deleteAgendaTaskBySource(supabase: any, sourceTable: string, sourceId: string) {
  const { error } = await supabase
    .from(USER_TASKS_TABLE)
    .delete()
    .eq("source_table", sourceTable)
    .eq("source_id", sourceId);

  if (error) throw error;
}

export function toDayRange(selectedDate: string) {
  const start = new Date(`${selectedDate}T00:00:00`);
  const end = new Date(`${selectedDate}T23:59:59.999`);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
