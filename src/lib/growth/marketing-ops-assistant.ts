import { buildCrmLeadNextStepStatus } from "@/lib/growth/crm-next-step";
import { emptyMarketingProfile, type MarketingState } from "@/lib/marketing/local-persistence";
import type { EditorialCalendarItem, MarketingChannel } from "@/lib/marketing/editorial-calendar";

export type MarketingOpsAssistantInput = {
  request?: string | null;
  legalArea?: string | null;
  channel?: string | null;
  objective?: string | null;
  state?: Partial<MarketingState> | null;
  crmTasks?: Array<{
    id: string;
    title?: string | null;
    description?: string | null;
    tags?: string[] | null;
    sector?: string | null;
    created_at?: string | null;
    data_ultima_movimentacao?: string | null;
  }>;
  now?: Date;
};

export type MarketingOpsAssistantPlan = {
  summary: string;
  mode: "weekly_plan" | "approved_content" | "lead_next_steps" | "general_growth_ops";
  briefing: {
    firmName: string | null;
    positioning: string | null;
    primaryChannels: MarketingChannel[];
    legalAreas: string[];
    audiences: string[];
  };
  thisWeek: Array<Pick<EditorialCalendarItem, "id" | "title" | "date" | "channel" | "legalArea" | "audience" | "objective" | "status">>;
  approvedWithoutTask: Array<Pick<EditorialCalendarItem, "id" | "title" | "date" | "channel" | "legalArea" | "audience" | "objective" | "status">>;
  leadsNeedingNextStep: Array<{ id: string; title: string; reason: string; suggestedNextStep: string }>;
  recommendedActions: string[];
  humanApprovalRequired: boolean;
  externalSideEffectsBlocked: boolean;
};

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferMode(request?: string | null): MarketingOpsAssistantPlan["mode"] {
  const text = normalize(request);
  if (/aprovad|publicad|conteudo/.test(text)) return "approved_content";
  if (/lead|crm|proximo passo|follow/.test(text)) return "lead_next_steps";
  if (/semana|publicar|pauta|calendario|editorial/.test(text)) return "weekly_plan";
  return "general_growth_ops";
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

function isWithinNextDays(value: string, now: Date, days: number) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  const start = startOfDay(now).getTime();
  const end = start + days * 24 * 60 * 60 * 1000;
  const current = parsed.getTime();
  return current >= start && current <= end;
}

function compactItem(item: EditorialCalendarItem) {
  return {
    id: item.id,
    title: item.title,
    date: item.date,
    channel: item.channel,
    legalArea: item.legalArea,
    audience: item.audience,
    objective: item.objective,
    status: item.status,
  };
}

export function buildMarketingOpsAssistantPlan(input: MarketingOpsAssistantInput): MarketingOpsAssistantPlan {
  const state = input.state || {};
  const profile = { ...emptyMarketingProfile(), ...(state.profile || {}) };
  const calendar = Array.isArray(state.calendar) ? state.calendar : [];
  const now = input.now || new Date();
  const mode = inferMode(input.request);
  const legalAreaFilter = normalize(input.legalArea);
  const channelFilter = normalize(input.channel);

  const filteredCalendar = calendar.filter((item) => {
    if (legalAreaFilter && !normalize(item.legalArea).includes(legalAreaFilter)) return false;
    if (channelFilter && normalize(item.channel) !== channelFilter) return false;
    return true;
  });

  const thisWeek = filteredCalendar
    .filter((item) => item.status !== "rejected" && isWithinNextDays(item.date, now, 7))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8)
    .map(compactItem);

  const approvedWithoutTask = filteredCalendar
    .filter((item) => item.status === "approved" && !item.notes.includes("marketing_editorial_calendar"))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 8)
    .map(compactItem);

  const leadsNeedingNextStep = (input.crmTasks || [])
    .map((task) => ({
      task,
      status: buildCrmLeadNextStepStatus({
        title: task.title,
        description: task.description,
        tags: task.tags,
        stageName: task.sector,
        lastMovedAt: task.data_ultima_movimentacao,
        createdAt: task.created_at,
        now,
      }),
    }))
    .filter((item) => item.status.needsNextStep)
    .slice(0, 8)
    .map(({ task, status }) => ({
      id: task.id,
      title: task.title || "Lead sem nome",
      reason: status.reason,
      suggestedNextStep: status.suggestedNextStep,
    }));

  const recommendedActions = [
    thisWeek.length > 0 ? `Revisar ${thisWeek.length} pauta(s) previstas para os proximos 7 dias.` : "Gerar ou ajustar pautas para os proximos 7 dias.",
    approvedWithoutTask.length > 0 ? `Transformar ${approvedWithoutTask.length} conteudo(s) aprovado(s) em tarefa interna antes de publicar manualmente.` : "Manter conteudos aprovados conectados a tarefas internas quando fizer sentido.",
    leadsNeedingNextStep.length > 0 ? `Definir proximo passo para ${leadsNeedingNextStep.length} lead(s) antes de iniciar novas campanhas.` : "Manter CRM sem leads abandonados antes de ampliar volume de marketing.",
    "Nenhuma publicacao, WhatsApp, Meta Ads ou evento externo deve ser acionado sem revisao humana.",
  ];

  const summary = mode === "lead_next_steps"
    ? `Growth por chat identificou ${leadsNeedingNextStep.length} lead(s) que precisam de proximo passo.`
    : mode === "approved_content"
      ? `Growth por chat encontrou ${approvedWithoutTask.length} conteudo(s) aprovado(s) aguardando operacionalizacao.`
      : `Growth por chat preparou uma visao operacional com ${thisWeek.length} pauta(s) da semana, ${approvedWithoutTask.length} aprovado(s) pendentes e ${leadsNeedingNextStep.length} lead(s) sem proximo passo.`;

  return {
    summary,
    mode,
    briefing: {
      firmName: profile.firmName || null,
      positioning: profile.positioning || null,
      primaryChannels: profile.channels,
      legalAreas: profile.legalAreas,
      audiences: profile.audiences,
    },
    thisWeek,
    approvedWithoutTask,
    leadsNeedingNextStep,
    recommendedActions,
    humanApprovalRequired: true,
    externalSideEffectsBlocked: true,
  };
}

export function buildMarketingOpsAssistantMetadata(plan: MarketingOpsAssistantPlan) {
  return {
    summary: plan.summary,
    mode: plan.mode,
    briefing: plan.briefing,
    this_week_count: plan.thisWeek.length,
    approved_without_task_count: plan.approvedWithoutTask.length,
    leads_needing_next_step_count: plan.leadsNeedingNextStep.length,
    this_week: plan.thisWeek,
    approved_without_task: plan.approvedWithoutTask,
    leads_needing_next_step: plan.leadsNeedingNextStep,
    recommended_actions: plan.recommendedActions,
    requires_human_approval: plan.humanApprovalRequired,
    external_side_effects_blocked: plan.externalSideEffectsBlocked,
  };
}
