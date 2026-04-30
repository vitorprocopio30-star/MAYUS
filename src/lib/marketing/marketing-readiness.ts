import type { EditorialCalendarItem, MarketingProfile, ReferenceInput } from "@/lib/marketing/editorial-calendar";
import { hasReviewedMarketingFinalDraft, readMarketingFinalDraftFromNotes } from "@/lib/marketing/content-draft";
import { emptyMarketingProfile, type MarketingState } from "@/lib/marketing/local-persistence";

export type MarketingReadinessStatus = "empty" | "partial" | "ready";

export type MarketingReadinessCheck = {
  id: string;
  label: string;
  detail: string;
  complete: boolean;
  href: string;
  cta: string;
};

export type MarketingReadinessMetric = {
  label: string;
  value: number;
  detail: string;
  href: string;
};

export type MarketingRecommendedAction = {
  id: string;
  title: string;
  detail: string;
  href: string;
  cta: string;
  priority: "high" | "medium" | "low";
};

export type MarketingReadiness = {
  status: MarketingReadinessStatus;
  score: number;
  headline: string;
  summary: string;
  checks: MarketingReadinessCheck[];
  metrics: MarketingReadinessMetric[];
  thisWeek: EditorialCalendarItem[];
  approvedWithoutTask: EditorialCalendarItem[];
  readyToPublish: EditorialCalendarItem[];
  needsFinalReview: EditorialCalendarItem[];
  recommendedActions: MarketingRecommendedAction[];
  humanApprovalRequired: boolean;
  externalSideEffectsBlocked: boolean;
};

function clean(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function mergeProfile(profile?: Partial<MarketingProfile> | null): MarketingProfile {
  return { ...emptyMarketingProfile(), ...(profile || {}) };
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
  return parsed.getTime() >= start && parsed.getTime() <= end;
}

function hasTaskMarker(item: EditorialCalendarItem) {
  return item.notes.includes("marketing_editorial_calendar");
}

function addAction(actions: MarketingRecommendedAction[], action: MarketingRecommendedAction) {
  if (!actions.some((item) => item.id === action.id)) actions.push(action);
}

export function buildMarketingReadiness(input?: Partial<MarketingState> | null, now = new Date()): MarketingReadiness {
  const profile = mergeProfile(input?.profile);
  const references = Array.isArray(input?.references) ? input.references as ReferenceInput[] : [];
  const calendar = Array.isArray(input?.calendar) ? input.calendar as EditorialCalendarItem[] : [];

  const hasPositioning = Boolean(clean(profile.positioning));
  const hasLegalAreas = profile.legalAreas.length > 0;
  const hasAudiences = profile.audiences.length > 0;
  const hasReferences = references.length > 0 || profile.admiredReferences.length > 0;
  const hasMeaningfulMarketingInput = hasPositioning || hasLegalAreas || hasAudiences || hasReferences || references.length > 0 || calendar.length > 0;
  const hasChannels = profile.channels.length > 0 && hasMeaningfulMarketingInput;
  const hasCalendar = calendar.length > 0;
  const hasApproved = calendar.some((item) => item.status === "approved" || item.status === "published");
  const approvedWithoutTask = calendar
    .filter((item) => item.status === "approved" && !hasTaskMarker(item))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  const readyToPublish = calendar
    .filter((item) => item.status === "approved" && hasReviewedMarketingFinalDraft(item.notes))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  const needsFinalReview = calendar
    .filter((item) => item.status === "approved" && !hasReviewedMarketingFinalDraft(item.notes))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);
  const hasTasksForApproved = hasApproved && approvedWithoutTask.length === 0;
  const thisWeek = calendar
    .filter((item) => item.status !== "rejected" && isWithinNextDays(item.date, now, 7))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  const checks: MarketingReadinessCheck[] = [
    {
      id: "positioning",
      label: "Posicionamento definido",
      detail: hasPositioning ? "O MAYUS ja tem uma direcao editorial para orientar as pautas." : "Defina a promessa, postura e estilo editorial antes de gerar conteudo em escala.",
      complete: hasPositioning,
      href: "/dashboard/marketing/perfil",
      cta: "Configurar perfil",
    },
    {
      id: "legal-areas",
      label: "Areas juridicas cadastradas",
      detail: hasLegalAreas ? `${profile.legalAreas.length} area(s) disponiveis para segmentar conteudo.` : "Informe as areas prioritarias para evitar pautas genericas.",
      complete: hasLegalAreas,
      href: "/dashboard/marketing/perfil",
      cta: "Definir areas",
    },
    {
      id: "audiences",
      label: "Publicos prioritarios definidos",
      detail: hasAudiences ? `${profile.audiences.length} publico(s) orientando o Marketing OS.` : "Defina quem o escritorio quer atrair antes de criar calendario.",
      complete: hasAudiences,
      href: "/dashboard/marketing/perfil",
      cta: "Definir publicos",
    },
    {
      id: "channels",
      label: "Canais ativos selecionados",
      detail: hasChannels ? `${profile.channels.length} canal(is) ativo(s) para operacao.` : "Selecione pelo menos um canal para o MAYUS montar a cadencia.",
      complete: hasChannels,
      href: "/dashboard/marketing/perfil",
      cta: "Selecionar canais",
    },
    {
      id: "references",
      label: "Referencias calibradas",
      detail: hasReferences ? "O MAYUS tem referencias para extrair padroes sem copiar conteudo." : "Cadastre referencias admiradas para calibrar tom, formato e repertorio.",
      complete: hasReferences,
      href: "/dashboard/marketing/referencias",
      cta: "Cadastrar referencias",
    },
    {
      id: "calendar",
      label: "Calendario editorial criado",
      detail: hasCalendar ? `${calendar.length} pauta(s) no calendario editorial.` : "Gere um calendario para transformar estrategia em rotina semanal.",
      complete: hasCalendar,
      href: "/dashboard/marketing/calendario",
      cta: "Criar calendario",
    },
    {
      id: "approved-content",
      label: "Conteudos aprovados para operar",
      detail: hasApproved ? "Existem pautas aprovadas/publicadas para acompanhamento operacional." : "Aprove pelo menos uma pauta para iniciar o fluxo de publicacao supervisionada.",
      complete: hasApproved,
      href: "/dashboard/marketing/kanban",
      cta: "Aprovar pautas",
    },
    {
      id: "approved-tasks",
      label: "Aprovados conectados a tarefas",
      detail: hasTasksForApproved ? "Conteudos aprovados ja estao operacionalizados ou publicados." : "Converta aprovados em tarefas internas antes de publicar manualmente.",
      complete: hasTasksForApproved,
      href: "/dashboard/marketing/aprovados",
      cta: "Ver aprovados",
    },
  ];

  const completedChecks = checks.filter((check) => check.complete).length;
  const score = Math.round((completedChecks / checks.length) * 100);
  const hasAnyContent = hasMeaningfulMarketingInput;
  const status: MarketingReadinessStatus = !hasAnyContent ? "empty" : score >= 75 ? "ready" : "partial";
  const draftCount = calendar.filter((item) => item.status === "draft").length;
  const approvedCount = calendar.filter((item) => item.status === "approved").length;
  const publishedCount = calendar.filter((item) => item.status === "published").length;
  const rejectedCount = calendar.filter((item) => item.status === "rejected").length;
  const readyToPublishCount = calendar.filter((item) => item.status === "approved" && hasReviewedMarketingFinalDraft(item.notes)).length;
  const approvedWithFinalDraftCount = calendar.filter((item) => item.status === "approved" && readMarketingFinalDraftFromNotes(item.notes)).length;
  const needsFinalReviewCount = calendar.filter((item) => item.status === "approved" && !hasReviewedMarketingFinalDraft(item.notes)).length;
  const actions: MarketingRecommendedAction[] = [];

  if (!hasPositioning || !hasLegalAreas || !hasAudiences || !hasChannels) {
    addAction(actions, {
      id: "complete-profile",
      title: "Autoconfigurar base do Marketing OS",
      detail: "Complete posicionamento, areas, publicos e canais para o MAYUS operar com contexto real do escritorio.",
      href: "/dashboard/marketing/perfil",
      cta: "Completar perfil",
      priority: "high",
    });
  }
  if (!hasReferences) {
    addAction(actions, {
      id: "add-references",
      title: "Calibrar referencias antes de escalar conteudo",
      detail: "Adicione referencias admiradas para o MAYUS extrair padroes de tema, formato e gancho sem copiar conteudo.",
      href: "/dashboard/marketing/referencias",
      cta: "Cadastrar referencias",
      priority: "medium",
    });
  }
  if (!hasCalendar) {
    addAction(actions, {
      id: "create-calendar",
      title: "Gerar calendario editorial supervisionado",
      detail: "Transforme o perfil e as referencias em uma cadencia de publicacao para os proximos periodos.",
      href: "/dashboard/marketing/calendario",
      cta: "Criar calendario",
      priority: "high",
    });
  }
  if (thisWeek.length === 0 && hasCalendar) {
    addAction(actions, {
      id: "fill-week",
      title: "Ajustar pautas dos proximos 7 dias",
      detail: "Nao ha pauta ativa nesta semana. Reorganize o calendario para manter cadencia operacional.",
      href: "/dashboard/marketing/calendario",
      cta: "Ajustar calendario",
      priority: "medium",
    });
  }
  if (draftCount >= 3) {
    addAction(actions, {
      id: "review-drafts",
      title: "Revisar rascunhos acumulados",
      detail: `${draftCount} pauta(s) ainda estao em rascunho. Aprove, edite ou recuse para destravar a operacao.`,
      href: "/dashboard/marketing/kanban",
      cta: "Abrir kanban",
      priority: "medium",
    });
  }
  if (approvedWithoutTask.length > 0) {
    addAction(actions, {
      id: "task-approved",
      title: "Operacionalizar conteudos aprovados",
      detail: `${approvedWithoutTask.length} conteudo(s) aprovado(s) ainda nao viraram tarefa interna.`,
      href: "/dashboard/marketing/aprovados",
      cta: "Criar tarefas",
      priority: "high",
    });
  }
  if (readyToPublishCount > 0) {
    addAction(actions, {
      id: "publish-ready-content",
      title: "Publicar manualmente conteudos revisados",
      detail: `${readyToPublishCount} conteudo(s) ja tem rascunho MAYUS revisado e pode(m) ser publicado(s) manualmente pelo responsavel.`,
      href: "/dashboard/marketing/aprovados",
      cta: "Ver prontos",
      priority: "high",
    });
  }
  if (needsFinalReviewCount > 0) {
    addAction(actions, {
      id: "review-final-drafts",
      title: "Revisar rascunhos finais aprovados",
      detail: `${needsFinalReviewCount} conteudo(s) aprovado(s) ainda precisam de rascunho final ou revisao humana.`,
      href: "/dashboard/marketing/aprovados",
      cta: "Revisar aprovados",
      priority: readyToPublishCount > 0 ? "medium" : "high",
    });
  }
  addAction(actions, {
    id: "diagnose-ads",
    title: "Diagnosticar midia paga quando houver dados",
    detail: "Suba um CSV do Meta Ads para o MAYUS identificar CPL, desperdicio, vencedores e proximas hipoteses.",
    href: "/dashboard/marketing/meta-ads",
    cta: "Analisar Meta Ads",
    priority: status === "ready" ? "medium" : "low",
  });

  const headline = status === "empty"
    ? "Marketing OS ainda precisa ser configurado"
    : status === "ready"
      ? "Marketing OS pronto para operacao supervisionada"
      : "Marketing OS parcialmente configurado";

  const summary = status === "empty"
    ? "O MAYUS precisa de posicionamento, areas, publicos e canais para montar a rotina de marketing do escritorio."
    : status === "ready"
      ? "O MAYUS ja tem base suficiente para organizar pautas, aprovados e proximas acoes sem acionar publicacoes externas."
      : "O MAYUS ja encontrou dados de marketing, mas ainda faltam etapas para operar com consistencia.";

  return {
    status,
    score,
    headline,
    summary,
    checks,
    metrics: [
      { label: "Rascunhos", value: draftCount, detail: "Pautas aguardando revisao", href: "/dashboard/marketing/kanban" },
      { label: "Aprovados", value: approvedCount, detail: "Prontos para tarefa/publicacao manual", href: "/dashboard/marketing/aprovados" },
      { label: "Prontos para publicar", value: readyToPublishCount, detail: "Rascunhos revisados para acao manual", href: "/dashboard/marketing/aprovados" },
      { label: "Precisam revisao", value: needsFinalReviewCount, detail: "Aprovados sem revisao final", href: "/dashboard/marketing/aprovados" },
      { label: "Com rascunho", value: approvedWithFinalDraftCount, detail: "Aprovados com texto MAYUS", href: "/dashboard/marketing/aprovados" },
      { label: "Publicados", value: publishedCount, detail: "Marcados manualmente como publicados", href: "/dashboard/marketing/aprovados" },
      { label: "Recusados", value: rejectedCount, detail: "Pautas descartadas", href: "/dashboard/marketing/kanban" },
      { label: "Proximos 7 dias", value: thisWeek.length, detail: "Pautas ativas na semana", href: "/dashboard/marketing/calendario" },
      { label: "Aprovados sem tarefa", value: approvedWithoutTask.length, detail: "Precisam virar acao interna", href: "/dashboard/marketing/aprovados" },
      { label: "Referencias", value: references.length + profile.admiredReferences.length, detail: "Sinais para calibrar conteudo", href: "/dashboard/marketing/referencias" },
      { label: "Canais", value: profile.channels.length, detail: "Canais ativos no perfil", href: "/dashboard/marketing/perfil" },
    ],
    thisWeek,
    approvedWithoutTask,
    readyToPublish,
    needsFinalReview,
    recommendedActions: actions.slice(0, 5),
    humanApprovalRequired: true,
    externalSideEffectsBlocked: true,
  };
}
