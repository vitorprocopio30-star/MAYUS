export type LeadScheduleInput = {
  crmTaskId?: string | null;
  leadName?: string | null;
  legalArea?: string | null;
  pain?: string | null;
  score?: number | null;
  scheduledFor?: string | null;
  meetingType?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
  notes?: string | null;
};

export type LeadSchedulePlan = {
  leadName: string;
  legalArea: string | null;
  scheduledFor: string;
  meetingType: "consultation" | "qualification" | "return";
  urgency: "ROTINA" | "ATENCAO" | "URGENTE";
  agendaTitle: string;
  agendaDescription: string;
  preparationChecklist: string[];
  confirmationMessage: string;
  nextBestAction: string;
  requiresHumanApproval: boolean;
  summary: string;
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeText(value?: string | null) {
  return cleanText(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase() || "";
}

function parseScheduledFor(value?: string | null) {
  const text = cleanText(value);
  if (text) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(9, 0, 0, 0);
  return fallback.toISOString();
}

function normalizeMeetingType(value?: string | null): LeadSchedulePlan["meetingType"] {
  const text = normalizeText(value);
  if (/retorno|follow/.test(text)) return "return";
  if (/qualific/.test(text)) return "qualification";
  return "consultation";
}

function inferUrgency(params: { pain: string | null; score: number | null; scheduledFor: string }) {
  const scheduled = new Date(params.scheduledFor);
  const diffHours = (scheduled.getTime() - Date.now()) / 3600000;
  const urgentText = /urgente|hoje|amanha|prazo|audiencia|liminar|bloqueio/i.test(params.pain || "");

  if (urgentText || (params.score !== null && params.score >= 80) || diffHours <= 24) return "URGENTE";
  if ((params.score !== null && params.score >= 60) || diffHours <= 72) return "ATENCAO";
  return "ROTINA";
}

function buildAreaChecklist(legalArea: string | null) {
  const area = normalizeText(legalArea);

  if (area.includes("previd")) {
    return ["Separar CNIS/carta do INSS, se houver.", "Confirmar beneficio pretendido e prazo para recurso."];
  }

  if (area.includes("trabalh")) {
    return ["Separar CTPS, contrato, holerites e termo de rescisao.", "Confirmar datas de admissao/demissao."];
  }

  if (area.includes("famil")) {
    return ["Separar documentos pessoais, renda e despesas.", "Confirmar se ha menor, audiencia ou decisao anterior."];
  }

  return ["Separar documentos basicos e relato dos fatos.", "Confirmar prazo, urgencia e objetivo da consulta."];
}

export function buildLeadSchedulePlan(input: LeadScheduleInput): LeadSchedulePlan {
  const leadName = cleanText(input.leadName) || "Lead sem nome";
  const legalArea = cleanText(input.legalArea);
  const pain = cleanText(input.pain);
  const score = numberOrNull(input.score);
  const scheduledFor = parseScheduledFor(input.scheduledFor);
  const meetingType = normalizeMeetingType(input.meetingType);
  const urgency = inferUrgency({ pain, score, scheduledFor });
  const dateLabel = new Date(scheduledFor).toLocaleString("pt-BR");
  const firstName = leadName.split(/\s+/)[0] || leadName;
  const typeLabel = meetingType === "return"
    ? "retorno"
    : meetingType === "qualification"
      ? "qualificacao"
      : "consulta";
  const agendaTitle = `${typeLabel[0].toUpperCase()}${typeLabel.slice(1)} - ${leadName}`;
  const agendaDescription = [
    `Agendamento supervisionado para ${leadName}${legalArea ? ` em ${legalArea}` : ""}.`,
    pain ? `Dor principal: ${pain}` : null,
    input.notes ? `Notas: ${cleanText(input.notes)}` : null,
    `Horario sugerido: ${dateLabel}.`,
  ].filter(Boolean).join(" ");

  return {
    leadName,
    legalArea,
    scheduledFor,
    meetingType,
    urgency,
    agendaTitle,
    agendaDescription,
    preparationChecklist: [
      "Confirmar disponibilidade do advogado/SDR antes de prometer o horario.",
      "Confirmar consentimento e canal de contato do lead.",
      ...buildAreaChecklist(legalArea),
      "Registrar comparecimento, no-show ou remarcacao apos o horario.",
    ],
    confirmationMessage: `Ola, ${firstName}. Posso confirmar sua ${typeLabel} com o escritorio para ${dateLabel}? Se esse horario nao for bom, me diga uma alternativa e ajusto por aqui.`,
    nextBestAction: "Equipe deve revisar o horario, confirmar manualmente com o lead e manter a tarefa na agenda ate conclusao.",
    requiresHumanApproval: true,
    summary: `Agendamento supervisionado criado para ${leadName} em ${dateLabel}.`,
  };
}

export function buildLeadScheduleArtifactMetadata(params: {
  crmTaskId?: string | null;
  agendaTaskId?: string | null;
  plan: LeadSchedulePlan;
}) {
  return {
    summary: params.plan.summary,
    crm_task_id: params.crmTaskId || null,
    agenda_task_id: params.agendaTaskId || null,
    lead_name: params.plan.leadName,
    legal_area: params.plan.legalArea,
    scheduled_for: params.plan.scheduledFor,
    meeting_type: params.plan.meetingType,
    urgency: params.plan.urgency,
    agenda_title: params.plan.agendaTitle,
    agenda_description: params.plan.agendaDescription,
    preparation_checklist: params.plan.preparationChecklist,
    confirmation_message: params.plan.confirmationMessage,
    next_best_action: params.plan.nextBestAction,
    requires_human_approval: params.plan.requiresHumanApproval,
    requires_human_action: true,
    human_actions: [params.plan.nextBestAction],
  };
}

export function buildLeadScheduleAgendaPayload(params: {
  tenantId: string;
  crmTaskId?: string | null;
  userId?: string | null;
  plan: LeadSchedulePlan;
  ownerId?: string | null;
  ownerName?: string | null;
}) {
  return {
    tenant_id: params.tenantId,
    user_id: params.ownerId || null,
    titulo: params.plan.agendaTitle,
    descricao: params.plan.agendaDescription,
    tipo: "agendamento",
    data_inicio: params.plan.scheduledFor,
    urgencia: params.plan.urgency === "URGENTE" ? "urgente" : params.plan.urgency === "ATENCAO" ? "alta" : "normal",
    origem: "manual",
    criado_por_ia: true,
    source_table: "growth_lead_schedule",
    source_id: params.crmTaskId ? `crm:${params.crmTaskId}` : `lead:${params.plan.leadName}:${params.plan.scheduledFor}`,
    title: params.plan.agendaTitle,
    description: params.plan.agendaDescription,
    assigned_to: params.ownerId || null,
    assigned_name_snapshot: params.ownerName || null,
    created_by: params.userId || null,
    created_by_agent: "mayus",
    urgency: params.plan.urgency,
    status: "Pendente",
    scheduled_for: params.plan.scheduledFor,
    completed_at: null,
    completed_by: null,
    completed_by_name_snapshot: null,
    visibility: "global",
    task_kind: "task",
    reward_coins: params.plan.urgency === "URGENTE" ? 100 : params.plan.urgency === "ATENCAO" ? 50 : 20,
    mission_type: null,
    expires_at: null,
    created_by_role: null,
    show_only_on_date: true,
    reminder_days_before: 0,
    is_critical: params.plan.urgency === "URGENTE",
    category: params.plan.urgency === "ATENCAO" ? "ATENCAO" : params.plan.urgency,
    type: "Agendamento",
    color: params.plan.urgency === "URGENTE" ? "#f87171" : params.plan.urgency === "ATENCAO" ? "#CCA761" : "#9ca3af",
    client_name: params.plan.leadName,
    process_number: null,
    responsible_notes: params.plan.nextBestAction,
    tags: ["growth", "lead_schedule", params.plan.meetingType],
  };
}
