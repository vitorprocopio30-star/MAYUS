import crypto from "crypto";
import { buildCrmLeadNextStepStatus } from "@/lib/growth/crm-next-step";
import { buildCommercialPlaybookModel } from "@/lib/growth/commercial-playbook-template";

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

export type DailyPlaybookWhatsAppSignal = {
  contactName?: string | null;
  direction?: "inbound" | "outbound" | string | null;
  messageType?: string | null;
  content?: string | null;
  createdAt?: string | null;
  unreadCount?: number | null;
  status?: string | null;
};

export type DailyPlaybookProcessSignal = {
  id: string;
  title?: string | null;
  stageName?: string | null;
  sector?: string | null;
  assignedName?: string | null;
  deadline?: string | null;
  lastMovementAt?: string | null;
  claimValue?: number | null;
  urgentInjunction?: boolean | null;
};

export type DailyPlaybookFinancialSignal = {
  id: string;
  amount?: number | null;
  status?: string | null;
  dueDate?: string | null;
  type?: string | null;
  description?: string | null;
};

export type DailyPlaybookSalesSignal = {
  id: string;
  clientName?: string | null;
  professionalName?: string | null;
  ticketTotal?: number | null;
  status?: string | null;
  contractDate?: string | null;
};

export type DailyPlaybookSystemSignal = {
  eventType?: string | null;
  severity?: string | null;
  source?: string | null;
  createdAt?: string | null;
};

export type DailyPlaybookInput = {
  firmName?: string | null;
  preferences?: Partial<DailyPlaybookPreferences> | null;
  crmTasks?: DailyPlaybookCrmTask[];
  userTasks?: DailyPlaybookUserTask[];
  whatsappSignals?: DailyPlaybookWhatsAppSignal[];
  processSignals?: DailyPlaybookProcessSignal[];
  financialSignals?: DailyPlaybookFinancialSignal[];
  salesSignals?: DailyPlaybookSalesSignal[];
  systemSignals?: DailyPlaybookSystemSignal[];
  officePlaybookStatus?: string | null;
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
  reportMenu: Array<{ id: string; label: string; detail: string }>;
  metrics: {
    crmLeadsNeedingNextStep: number;
    agendaCriticalTasks: number;
    agendaTodayTasks: number;
    priorityActions: number;
    whatsappUnanswered: number;
    legalCriticalDeadlines: number;
    financialOverdueAmount: number;
    salesMonthAmount: number;
    systemAlerts: number;
    officeScore: number;
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
  whatsapp: {
    inboundToday: number;
    outboundToday: number;
    unanswered: Array<{ title: string; detail: string; createdAt: string | null }>;
    documentsReceived: number;
    audiosReceived: number;
  };
  legal: {
    criticalDeadlines: Array<{ title: string; detail: string; ownerLabel: string; dueAt: string | null }>;
    staleProcesses: Array<{ title: string; detail: string; lastMovementAt: string | null }>;
  };
  financial: {
    overdueAmount: number;
    overdueItems: Array<{ title: string; detail: string; dueAt: string | null }>;
    weekReceivables: number;
  };
  sales: {
    monthAmount: number;
    tickets: number;
    averageTicket: number;
    highlights: Array<{ title: string; detail: string }>;
  };
  systemHealth: {
    score: number;
    alerts: Array<{ title: string; detail: string }>;
    officePlaybookStatus: string;
  };
  priorityActions: DailyPlaybookAction[];
  whatsappSummary: string;
  htmlReport: string;
  externalSideEffectsBlocked: boolean;
};

export type DailyPlaybookBrainTrace = {
  taskId: string;
  runId: string;
  stepId: string;
  artifactId: string | null;
  publicShareToken: string | null;
  htmlFilePath: string | null;
  htmlFileUrl: string | null;
} | null;

type DailyPlaybookSupabase = {
  from: (table: string) => any;
  storage?: any;
};

const PLAYBOOK_ARTIFACTS_BUCKET = "brain-artifacts";
const PLAYBOOK_HTML_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;

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

function daysBetween(a: Date, b: Date) {
  return Math.floor((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86400000);
}

function isWithinDays(value: string | null | undefined, now: Date, days: number) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return false;
  const diff = daysBetween(date, now);
  return diff >= 0 && diff <= days;
}

function isBeforeToday(value: string | null | undefined, now: Date) {
  const date = value ? new Date(value) : null;
  return Boolean(date && !Number.isNaN(date.getTime()) && startOfDay(date).getTime() < startOfDay(now).getTime());
}

function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}

function buildWhatsAppSection(input: DailyPlaybookInput, now: Date): DailyPlaybook["whatsapp"] {
  const signals = input.whatsappSignals || [];
  const today = signals.filter((item) => isSameLocalDay(item.createdAt, now));
  const unanswered = signals
    .filter((item) => item.direction === "inbound" && String(item.status || "").toLowerCase() !== "answered")
    .slice(0, 8)
    .map((item) => ({
      title: cleanText(item.contactName) || "Contato WhatsApp",
      detail: cleanText(item.content) || `Mensagem ${cleanText(item.messageType) || "recebida"} aguardando proximo passo.`,
      createdAt: cleanText(item.createdAt),
    }));

  return {
    inboundToday: today.filter((item) => item.direction === "inbound").length,
    outboundToday: today.filter((item) => item.direction === "outbound").length,
    unanswered,
    documentsReceived: today.filter((item) => normalize(item.messageType).includes("document")).length,
    audiosReceived: today.filter((item) => normalize(item.messageType).includes("audio")).length,
  };
}

function buildLegalSection(input: DailyPlaybookInput, now: Date): DailyPlaybook["legal"] {
  const signals = input.processSignals || [];
  return {
    criticalDeadlines: signals
      .filter((item) => item.urgentInjunction || isWithinDays(item.deadline, now, 3))
      .slice(0, 8)
      .map((item) => ({
        title: cleanText(item.title) || "Processo sem titulo",
        detail: [cleanText(item.stageName), cleanText(item.sector), item.claimValue ? `valor ${currency(item.claimValue)}` : null].filter(Boolean).join(" - ") || "Prazo juridico sensivel.",
        ownerLabel: cleanText(item.assignedName) || "Equipe Juridica",
        dueAt: cleanText(item.deadline),
      })),
    staleProcesses: signals
      .filter((item) => {
        const date = item.lastMovementAt ? new Date(item.lastMovementAt) : null;
        return Boolean(date && !Number.isNaN(date.getTime()) && daysBetween(now, date) >= 30);
      })
      .slice(0, 8)
      .map((item) => ({
        title: cleanText(item.title) || "Processo sem titulo",
        detail: cleanText(item.stageName) || "Sem movimentacao recente.",
        lastMovementAt: cleanText(item.lastMovementAt),
      })),
  };
}

function buildFinancialSection(input: DailyPlaybookInput, now: Date): DailyPlaybook["financial"] {
  const signals = input.financialSignals || [];
  const overdue = signals.filter((item) => isBeforeToday(item.dueDate, now) && !/pago|paid|quitado/i.test(String(item.status || "")));
  const week = signals.filter((item) => isWithinDays(item.dueDate, now, 7));
  return {
    overdueAmount: overdue.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    overdueItems: overdue.slice(0, 8).map((item) => ({
      title: cleanText(item.description) || cleanText(item.type) || "Cobranca pendente",
      detail: `${currency(Number(item.amount || 0))} - ${cleanText(item.status) || "pendente"}`,
      dueAt: cleanText(item.dueDate),
    })),
    weekReceivables: week.reduce((sum, item) => sum + Number(item.amount || 0), 0),
  };
}

function buildSalesSection(input: DailyPlaybookInput, now: Date): DailyPlaybook["sales"] {
  const month = now.getMonth();
  const year = now.getFullYear();
  const sales = (input.salesSignals || []).filter((item) => {
    const date = item.contractDate ? new Date(item.contractDate) : null;
    return date && !Number.isNaN(date.getTime()) && date.getMonth() === month && date.getFullYear() === year;
  });
  const amount = sales.reduce((sum, item) => sum + Number(item.ticketTotal || 0), 0);
  return {
    monthAmount: amount,
    tickets: sales.length,
    averageTicket: sales.length ? amount / sales.length : 0,
    highlights: sales.slice(0, 6).map((item) => ({
      title: cleanText(item.clientName) || "Venda sem cliente",
      detail: `${currency(Number(item.ticketTotal || 0))} - ${cleanText(item.professionalName) || "responsavel comercial"}`,
    })),
  };
}

function buildSystemHealthSection(input: DailyPlaybookInput): DailyPlaybook["systemHealth"] {
  const alerts = (input.systemSignals || [])
    .filter((item) => /error|failed|warning|critical|erro|falha/i.test(`${item.severity || ""} ${item.eventType || ""}`))
    .slice(0, 8)
    .map((item) => ({
      title: cleanText(item.eventType) || "Alerta MAYUS",
      detail: `${cleanText(item.source) || "sistema"}${item.createdAt ? ` - ${item.createdAt}` : ""}`,
    }));
  const officePlaybookStatus = cleanText(input.officePlaybookStatus) || "nao configurado";
  const score = Math.max(45, 100 - alerts.length * 8 - (/active|ativo/i.test(officePlaybookStatus) ? 0 : 8));
  return { score, alerts, officePlaybookStatus };
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
  whatsapp: DailyPlaybook["whatsapp"];
  legal: DailyPlaybook["legal"];
  financial: DailyPlaybook["financial"];
}) {
  const actions: DailyPlaybookAction[] = [];

  params.legal.criticalDeadlines.slice(0, 2).forEach((item) => {
    actions.push({
      area: "legal",
      title: item.title,
      detail: item.detail,
      urgency: "critical",
      ownerLabel: item.ownerLabel,
      dueAt: item.dueAt,
    });
  });

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

  params.whatsapp.unanswered.slice(0, 2).forEach((item) => {
    actions.push({
      area: "crm",
      title: item.title,
      detail: `Responder WhatsApp pendente: ${item.detail}`,
      urgency: "attention",
      ownerLabel: "Front desk MAYUS",
      dueAt: item.createdAt,
    });
  });

  params.financial.overdueItems.slice(0, 2).forEach((item) => {
    actions.push({
      area: "system",
      title: item.title,
      detail: `Regularizar financeiro vencido: ${item.detail}`,
      urgency: "attention",
      ownerLabel: "Financeiro",
      dueAt: item.dueAt,
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
  whatsappUnanswered: number;
  legalCriticalCount: number;
  financialOverdueAmount: number;
  officeScore: number;
}) {
  const signals = [
    params.crmLeadCount > 0 ? `${params.crmLeadCount} lead(s) precisam de proximo passo organizado` : null,
    params.criticalTaskCount > 0 ? `${params.criticalTaskCount} tarefa(s) critica(s) pedem atencao` : null,
    params.todayTaskCount > 0 ? `${params.todayTaskCount} tarefa(s) na agenda de hoje` : null,
    params.whatsappUnanswered > 0 ? `${params.whatsappUnanswered} conversa(s) WhatsApp aguardam resposta` : null,
    params.legalCriticalCount > 0 ? `${params.legalCriticalCount} prazo(s)/processo(s) juridico(s) estao em zona critica` : null,
    params.financialOverdueAmount > 0 ? `${currency(params.financialOverdueAmount)} vencido no financeiro` : null,
  ].filter(Boolean);

  if (signals.length === 0) {
    return `${params.firmName}: operacao sem alerta prioritario no inicio do dia. Score MAYUS ${params.officeScore}/100.`;
  }

  return `${params.firmName}: ${signals.join("; ")}. Score MAYUS ${params.officeScore}/100.`;
}

function buildWhatsAppSummary(playbook: Omit<DailyPlaybook, "whatsappSummary" | "htmlReport">) {
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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAction(action: DailyPlaybookAction, index: number) {
  return `
    <div class="action ${escapeHtml(action.urgency)}">
      <div class="action-index">${index + 1}</div>
      <div>
        <div class="action-title">${escapeHtml(action.title)}</div>
        <div class="action-detail">${escapeHtml(action.detail)}</div>
        <div class="action-meta">${escapeHtml(action.ownerLabel)}${action.dueAt ? ` - ${escapeHtml(action.dueAt)}` : ""}</div>
      </div>
    </div>`;
}

function renderRows<T>(items: T[], emptyText: string, render: (item: T, index: number) => string) {
  return items.length > 0 ? items.map(render).join("") : `<p class="muted">${escapeHtml(emptyText)}</p>`;
}

function renderSimpleRow(title: string, detail: string, index: number) {
  return `
    <div class="row">
      <span class="row-n">${index + 1}</span>
      <div><b>${escapeHtml(title)}</b><p>${escapeHtml(detail)}</p></div>
    </div>`;
}

function buildDailyPlaybookHtmlReport(playbook: Omit<DailyPlaybook, "whatsappSummary" | "htmlReport">) {
  const menu = playbook.reportMenu.map((section, index) => `
    <a class="nav-link" href="#${escapeHtml(section.id)}">
      <span class="nav-dot">${index + 1}</span>
      <span><b>${escapeHtml(section.label)}</b><small>${escapeHtml(section.detail)}</small></span>
    </a>`).join("");
  const priorityActions = playbook.priorityActions.map(renderAction).join("");
  const crmItems = playbook.crm.leadsNeedingNextStep.length > 0
    ? playbook.crm.leadsNeedingNextStep.map((lead, index) => `
      <div class="row">
        <span class="row-n">${index + 1}</span>
        <div><b>${escapeHtml(lead.title)}</b><p>${escapeHtml(lead.reason)} - ${escapeHtml(lead.organizedObjective)}</p></div>
      </div>`).join("")
    : `<p class="muted">Nenhum lead parado detectado no recorte do dia.</p>`;
  const agendaItems = [...playbook.agenda.critical, ...playbook.agenda.today].slice(0, 12).map((task, index) => `
    <div class="row">
      <span class="row-n">${index + 1}</span>
      <div><b>${escapeHtml(task.title)}</b><p>${escapeHtml(task.urgency)} - ${escapeHtml(task.ownerLabel)}${task.scheduledFor ? ` - ${escapeHtml(task.scheduledFor)}` : ""}</p></div>
    </div>`).join("") || `<p class="muted">Agenda sem alerta prioritario.</p>`;
  const whatsappItems = renderRows(playbook.whatsapp.unanswered, "Nenhuma conversa pendente no recorte.", (item, index) => renderSimpleRow(item.title, `${item.detail}${item.createdAt ? ` - ${item.createdAt}` : ""}`, index));
  const legalItems = renderRows(playbook.legal.criticalDeadlines, "Nenhum prazo juridico critico nas proximas 72h.", (item, index) => renderSimpleRow(item.title, `${item.detail}${item.dueAt ? ` - prazo ${item.dueAt}` : ""}`, index));
  const staleLegalItems = renderRows(playbook.legal.staleProcesses, "Nenhum processo parado ha mais de 30 dias no recorte.", (item, index) => renderSimpleRow(item.title, `${item.detail}${item.lastMovementAt ? ` - ultima movimentacao ${item.lastMovementAt}` : ""}`, index));
  const financialItems = renderRows(playbook.financial.overdueItems, "Nenhuma cobranca vencida no recorte.", (item, index) => renderSimpleRow(item.title, `${item.detail}${item.dueAt ? ` - vencimento ${item.dueAt}` : ""}`, index));
  const salesItems = renderRows(playbook.sales.highlights, "Nenhuma venda do mes registrada no recorte.", (item, index) => renderSimpleRow(item.title, item.detail, index));
  const systemItems = renderRows(playbook.systemHealth.alerts, "Nenhum alerta operacional critico nas ultimas verificacoes.", (item, index) => renderSimpleRow(item.title, item.detail, index));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(playbook.title)}</title>
<style>
:root{--gold:#C9A84C;--dark:#09090E;--dark2:#10101A;--dark3:#181825;--text:#EAE6DA;--dim:#8a8799;--border:rgba(201,168,76,.14);--red:#de7a6f;--green:#5dba8a}
*{box-sizing:border-box}body{margin:0;background:var(--dark);color:var(--text);font-family:Arial,sans-serif;font-size:14px;line-height:1.7}.topbar{position:fixed;top:0;left:0;right:0;height:56px;background:rgba(9,9,14,.97);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 20px;z-index:2}.brand{font-family:Georgia,serif;color:var(--gold);font-size:18px;letter-spacing:.08em}.sidebar{position:fixed;top:56px;bottom:0;left:0;width:270px;background:var(--dark2);border-right:1px solid var(--border);padding:18px 0;overflow:auto}.nav-link{display:flex;gap:10px;padding:9px 18px;color:var(--dim);text-decoration:none;border-left:2px solid transparent}.nav-link:hover{background:rgba(201,168,76,.06);border-left-color:var(--gold);color:var(--text)}.nav-dot{width:22px;height:22px;border-radius:50%;border:1px solid var(--border);color:var(--gold);display:flex;align-items:center;justify-content:center;font-size:11px;flex-shrink:0}.nav-link small{display:block;color:#55556a;font-size:10px;line-height:1.3}.main{margin-left:270px;padding:96px 54px 80px;max-width:1160px}.hero{border-bottom:1px solid var(--border);padding-bottom:32px;margin-bottom:34px}.eyebrow{color:var(--gold);font-size:10px;text-transform:uppercase;letter-spacing:.25em}h1{font-family:Georgia,serif;font-size:42px;font-weight:300;line-height:1.1;margin:12px 0}h1 em{color:var(--gold)}.summary{color:var(--dim);max-width:720px}.kpis{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:12px;margin-top:26px}.kpi,.card{background:var(--dark3);border:1px solid var(--border);border-radius:5px;padding:18px}.kpi b{font-family:Georgia,serif;color:var(--gold);font-size:28px}.kpi span{display:block;color:var(--dim);font-size:10px;text-transform:uppercase;letter-spacing:.14em}.section{margin:0 0 42px;scroll-margin-top:74px}.sec-title{font-family:Georgia,serif;font-size:26px;border-bottom:1px solid var(--border);padding-bottom:10px;margin-bottom:18px}.sec-title em{color:var(--gold)}.action{display:grid;grid-template-columns:34px 1fr;gap:14px;background:var(--dark3);border:1px solid var(--border);border-left:3px solid var(--gold);border-radius:5px;padding:14px;margin-bottom:10px}.action.critical{border-left-color:var(--red)}.action.routine{border-left-color:var(--green)}.action-index{color:var(--gold);font-family:Georgia,serif;font-size:22px}.action-title{font-weight:700}.action-detail{color:var(--text)}.action-meta,.muted{color:var(--dim);font-size:12px}.row{display:grid;grid-template-columns:28px 1fr;gap:12px;border-bottom:1px solid rgba(201,168,76,.08);padding:11px 0}.row-n{color:var(--gold);font-family:Georgia,serif}.row p{margin:3px 0 0;color:var(--dim)}.footer{color:#5c596b;font-size:11px;border-top:1px solid var(--border);padding-top:24px}@media(max-width:850px){.sidebar{display:none}.main{margin-left:0;padding:82px 20px}.kpis{grid-template-columns:1fr 1fr}h1{font-size:30px}}
</style>
</head>
<body>
<header class="topbar"><div class="brand">MAYUS <span style="color:#fff">Playbook</span></div><div>${escapeHtml(playbook.preferences.deliveryTime)} - ${escapeHtml(playbook.preferences.scope)}</div></header>
<nav class="sidebar">${menu}</nav>
<main class="main">
  <section class="hero" id="executive">
    <div class="eyebrow">Relatorio diario premium</div>
    <h1>${escapeHtml(playbook.title)}<br><em>menu operacional do dia</em></h1>
    <p class="summary">${escapeHtml(playbook.executiveSummary)}</p>
    <div class="kpis">
      <div class="kpi"><b>${playbook.metrics.crmLeadsNeedingNextStep}</b><span>Leads sem proximo passo</span></div>
      <div class="kpi"><b>${playbook.metrics.agendaCriticalTasks}</b><span>Tarefas criticas</span></div>
      <div class="kpi"><b>${playbook.metrics.whatsappUnanswered}</b><span>WhatsApps pendentes</span></div>
      <div class="kpi"><b>${playbook.metrics.officeScore}</b><span>Score MAYUS</span></div>
    </div>
  </section>
  <section class="section" id="playbook"><h2 class="sec-title">Playbook <em>do dia</em></h2>${priorityActions}</section>
  <section class="section" id="crm"><h2 class="sec-title">Comercial <em>e CRM</em></h2><div class="card">${crmItems}</div></section>
  <section class="section" id="whatsapp"><h2 class="sec-title">WhatsApp <em>e front desk</em></h2><div class="kpis"><div class="kpi"><b>${playbook.whatsapp.inboundToday}</b><span>Inbound hoje</span></div><div class="kpi"><b>${playbook.whatsapp.outboundToday}</b><span>Outbound hoje</span></div><div class="kpi"><b>${playbook.whatsapp.documentsReceived}</b><span>Documentos</span></div><div class="kpi"><b>${playbook.whatsapp.audiosReceived}</b><span>Audios</span></div></div><div class="card" style="margin-top:12px">${whatsappItems}</div></section>
  <section class="section" id="agenda"><h2 class="sec-title">Agenda <em>e prazos</em></h2><div class="card">${agendaItems}</div></section>
  <section class="section" id="legal"><h2 class="sec-title">Juridico <em>e processos</em></h2><div class="card">${legalItems}</div><div class="card" style="margin-top:12px"><div class="eyebrow">Processos sem movimentacao recente</div>${staleLegalItems}</div></section>
  <section class="section" id="financial"><h2 class="sec-title">Financeiro <em>e recebiveis</em></h2><div class="kpis"><div class="kpi"><b>${escapeHtml(currency(playbook.financial.overdueAmount))}</b><span>Vencido</span></div><div class="kpi"><b>${escapeHtml(currency(playbook.financial.weekReceivables))}</b><span>Recebiveis 7 dias</span></div><div class="kpi"><b>${escapeHtml(currency(playbook.sales.monthAmount))}</b><span>Vendas mes</span></div><div class="kpi"><b>${escapeHtml(currency(playbook.sales.averageTicket))}</b><span>Ticket medio</span></div></div><div class="card" style="margin-top:12px">${financialItems}</div></section>
  <section class="section" id="sales"><h2 class="sec-title">Vendas <em>e performance</em></h2><div class="card">${salesItems}</div></section>
  <section class="section" id="system"><h2 class="sec-title">Saude <em>MAYUS</em></h2><div class="card"><p>Score operacional: <b>${playbook.systemHealth.score}/100</b>. Playbook comercial do escritorio: <b>${escapeHtml(playbook.systemHealth.officePlaybookStatus)}</b>.</p>${systemItems}</div></section>
  <section class="section" id="frontdesk"><h2 class="sec-title">Front desk <em>MAYUS</em></h2><div class="card"><p>MAYUS deve fazer o primeiro atendimento em ate 5 minutos, qualificar, registrar sinais e transferir quando houver urgencia, pedido humano ou setor especifico.</p></div></section>
  <section class="section" id="calls"><h2 class="sec-title">Calls <em>e qualidade</em></h2><div class="card"><p>Revisar dor, urgencia, decisor, objecao dominante, encantamento, isolamento de variaveis e proximo passo com data/canal/responsavel.</p></div></section>
  <footer class="footer">Nenhuma acao externa foi executada automaticamente. Gerado pelo MAYUS para uso operacional interno.</footer>
</main>
</body>
</html>`;
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
  const whatsapp = buildWhatsAppSection(input, now);
  const legal = buildLegalSection(input, now);
  const financial = buildFinancialSection(input, now);
  const sales = buildSalesSection(input, now);
  const systemHealth = buildSystemHealthSection(input);
  const priorityActions = buildPriorityActions({ crmLeads, todayTasks, criticalTasks, whatsapp, legal, financial });
  const generatedAt = now.toISOString();
  const title = `${firmName} - Playbook do dia`;
  const reportMenu = [
    ...buildCommercialPlaybookModel({ firmName }).dailyReportSections,
    { id: "whatsapp", label: "WhatsApp", detail: "front desk e conversas pendentes" },
    { id: "legal", label: "Juridico", detail: "processos, prazos e riscos" },
    { id: "financial", label: "Financeiro", detail: "recebiveis e vencidos" },
    { id: "sales", label: "Vendas", detail: "ticket, volume e performance" },
    { id: "system", label: "Saude MAYUS", detail: "integracoes, alertas e configuracao" },
  ];
  const base = {
    title,
    generatedAt,
    preferences,
    reportMenu,
    executiveSummary: buildExecutiveSummary({
      firmName,
      crmLeadCount: crmLeads.length,
      criticalTaskCount: criticalTasks.length,
      todayTaskCount: todayTasks.length,
      whatsappUnanswered: whatsapp.unanswered.length,
      legalCriticalCount: legal.criticalDeadlines.length,
      financialOverdueAmount: financial.overdueAmount,
      officeScore: systemHealth.score,
    }),
    metrics: {
      crmLeadsNeedingNextStep: crmLeads.length,
      agendaCriticalTasks: criticalTasks.length,
      agendaTodayTasks: todayTasks.length,
      priorityActions: priorityActions.length,
      whatsappUnanswered: whatsapp.unanswered.length,
      legalCriticalDeadlines: legal.criticalDeadlines.length,
      financialOverdueAmount: financial.overdueAmount,
      salesMonthAmount: sales.monthAmount,
      systemAlerts: systemHealth.alerts.length,
      officeScore: systemHealth.score,
    },
    crm: {
      leadsNeedingNextStep: crmLeads,
    },
    agenda: {
      today: todayTasks,
      critical: criticalTasks,
    },
    whatsapp,
    legal,
    financial,
    sales,
    systemHealth,
    priorityActions,
    externalSideEffectsBlocked: true,
  };

  return {
    ...base,
    whatsappSummary: buildWhatsAppSummary(base),
    htmlReport: buildDailyPlaybookHtmlReport(base),
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
    html_report_available: true,
    html_report_mime_type: "text/html",
    html_report: playbook.htmlReport,
    report_menu: playbook.reportMenu,
    crm_leads_needing_next_step: playbook.metrics.crmLeadsNeedingNextStep,
    agenda_critical_tasks: playbook.metrics.agendaCriticalTasks,
    agenda_today_tasks: playbook.metrics.agendaTodayTasks,
    whatsapp_unanswered: playbook.metrics.whatsappUnanswered,
    legal_critical_deadlines: playbook.metrics.legalCriticalDeadlines,
    financial_overdue_amount: playbook.metrics.financialOverdueAmount,
    sales_month_amount: playbook.metrics.salesMonthAmount,
    system_alerts: playbook.metrics.systemAlerts,
    office_score: playbook.metrics.officeScore,
    priority_actions: playbook.priorityActions,
    whatsapp: playbook.whatsapp,
    legal: playbook.legal,
    financial: playbook.financial,
    sales: playbook.sales,
    system_health: playbook.systemHealth,
    external_side_effects_blocked: playbook.externalSideEffectsBlocked,
  };
}

function buildPublicShareToken() {
  return `pb_${crypto.randomBytes(18).toString("base64url")}`;
}

function normalizeStorageSegment(value: string) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unknown";
}

async function ensurePlaybookArtifactsBucket(supabase: DailyPlaybookSupabase) {
  if (!supabase.storage) return false;

  if (typeof supabase.storage.getBucket === "function") {
    const existing = await supabase.storage.getBucket(PLAYBOOK_ARTIFACTS_BUCKET).catch(() => null);
    if (existing && !existing.error) return true;
  }

  if (typeof supabase.storage.createBucket !== "function") return false;

  const created = await supabase.storage.createBucket(PLAYBOOK_ARTIFACTS_BUCKET, {
    public: false,
    allowedMimeTypes: ["text/html", "application/json"],
    fileSizeLimit: 1024 * 1024 * 5,
  }).catch((error: unknown) => ({ error }));

  return !created?.error;
}

async function uploadDailyPlaybookHtmlFile(params: {
  supabase: DailyPlaybookSupabase;
  tenantId: string;
  artifactId: string;
  title: string;
  html: string;
}) {
  try {
    const ready = await ensurePlaybookArtifactsBucket(params.supabase);
    if (!ready) return null;

    const path = [
      normalizeStorageSegment(params.tenantId),
      "daily_playbook",
      `${normalizeStorageSegment(params.artifactId)}.html`,
    ].join("/");
    const filename = `${normalizeStorageSegment(params.title).slice(0, 80) || "mayus-playbook"}.html`;
    const bucket = params.supabase.storage.from(PLAYBOOK_ARTIFACTS_BUCKET);
    const uploaded = await bucket.upload(path, Buffer.from(params.html, "utf8"), {
      contentType: "text/html",
      upsert: true,
    });
    if (uploaded?.error) throw uploaded.error;

    const signed = await bucket.createSignedUrl(path, PLAYBOOK_HTML_SIGNED_URL_TTL_SECONDS, { download: filename });
    if (signed?.error || !signed?.data?.signedUrl) throw signed?.error || new Error("daily_playbook_signed_url_missing");

    return {
      path,
      signedUrl: signed.data.signedUrl as string,
      filename,
    };
  } catch (error) {
    console.warn("[mayus][daily-playbook][html-file]", error);
    return null;
  }
}

export async function registerDailyPlaybookBrainArtifact(params: {
  tenantId: string;
  userId: string | null;
  playbook: DailyPlaybook;
  supabase: DailyPlaybookSupabase;
}): Promise<DailyPlaybookBrainTrace> {
  const now = new Date().toISOString();
  const publicShareToken = buildPublicShareToken();
  const metadata = {
    ...buildDailyPlaybookMetadata(params.playbook),
    public_share_enabled: true,
    public_share_token: publicShareToken,
    public_share_created_at: now,
  };
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

    const htmlFile = artifact?.id
      ? await uploadDailyPlaybookHtmlFile({
        supabase: params.supabase,
        tenantId: params.tenantId,
        artifactId: artifact.id,
        title: params.playbook.title,
        html: params.playbook.htmlReport,
      })
      : null;

    if (artifact?.id && htmlFile?.path) {
      await params.supabase
        .from("brain_artifacts")
        .update({
          storage_url: htmlFile.path,
          mime_type: "text/html",
          metadata: {
            ...metadata,
            html_file_available: true,
            html_file_path: htmlFile.path,
            html_file_mime_type: "text/html",
            html_file_filename: htmlFile.filename,
          },
        })
        .eq("id", artifact.id);
    }

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
      publicShareToken,
      htmlFilePath: htmlFile?.path || null,
      htmlFileUrl: htmlFile?.signedUrl || null,
    };
  } catch (error) {
    if (createdTaskId) {
      await params.supabase.from("brain_tasks").delete().eq("id", createdTaskId);
    }
    console.error("[mayus][daily-playbook][artifact]", error);
    return null;
  }
}
