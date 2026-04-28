export type LeadFollowupInput = {
  crmTaskId?: string | null;
  leadName?: string | null;
  legalArea?: string | null;
  pain?: string | null;
  origin?: string | null;
  score?: number | null;
  lastInteraction?: string | null;
  goal?: string | null;
  tags?: string[] | null;
};

export type LeadFollowupCadenceItem = {
  offsetHours: number;
  channel: "whatsapp" | "phone" | "email";
  objective: string;
  suggestedMessage: string;
};

export type LeadFollowupPlan = {
  leadName: string;
  legalArea: string | null;
  priority: "low" | "medium" | "high";
  cadence: LeadFollowupCadenceItem[];
  suggestedFirstMessage: string;
  humanReviewChecklist: string[];
  stopConditions: string[];
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

function normalizeArea(value?: string | null) {
  return cleanText(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase() || null;
}

function buildFirstMessage(params: {
  leadName: string;
  legalArea: string | null;
  pain: string | null;
  goal: string | null;
}) {
  const firstName = params.leadName.split(/\s+/)[0] || params.leadName;
  const areaLabel = params.legalArea ? ` sobre ${params.legalArea}` : "";
  const painLabel = params.pain ? ` Vi aqui que o ponto principal e: ${params.pain}` : "";
  const goalLabel = params.goal || "confirmar se faz sentido avancarmos para uma avaliacao com o escritorio";

  return `Ola, ${firstName}. Aqui e do escritorio. Estou retomando seu atendimento${areaLabel}.${painLabel} Meu objetivo agora e ${goalLabel}. Posso te fazer algumas perguntas rapidas para entender o melhor proximo passo?`;
}

function buildAreaChecklist(legalArea: string | null) {
  const area = normalizeArea(legalArea);

  if (area?.includes("previd")) {
    return ["Confirmar beneficio/indeferimento", "Pedir CNIS ou carta do INSS", "Checar prazo administrativo/judicial"];
  }

  if (area?.includes("trabalh")) {
    return ["Confirmar periodo de trabalho", "Checar se ha rescisao/audiencia", "Pedir documentos de vinculo e pagamento"];
  }

  if (area?.includes("famil")) {
    return ["Confirmar urgencia familiar", "Checar se ha menores envolvidos", "Pedir documentos de renda/despesas/decisao anterior"];
  }

  return ["Confirmar problema principal", "Checar prazo ou risco imediato", "Pedir documentos que comprovem os fatos"];
}

export function buildLeadFollowupPlan(input: LeadFollowupInput): LeadFollowupPlan {
  const leadName = cleanText(input.leadName) || "Lead sem nome";
  const legalArea = cleanText(input.legalArea);
  const pain = cleanText(input.pain);
  const goal = cleanText(input.goal);
  const score = numberOrNull(input.score);
  const hasUrgency = Boolean(pain && /urgente|hoje|amanha|amanh[aã]|prazo|audiencia|audi[eê]ncia|liminar|bloqueio/i.test(pain));
  const priority = hasUrgency || (score !== null && score >= 75)
    ? "high"
    : score !== null && score < 45
      ? "low"
      : "medium";
  const suggestedFirstMessage = buildFirstMessage({ leadName, legalArea, pain, goal });
  const secondObjective = priority === "high"
    ? "Confirmar urgencia e tentar contato humano direto no mesmo dia."
    : "Reforcar disponibilidade e remover friccao para envio dos documentos minimos.";

  return {
    leadName,
    legalArea,
    priority,
    suggestedFirstMessage,
    cadence: [
      {
        offsetHours: 0,
        channel: "whatsapp",
        objective: "Retomar contato com contexto e pedir confirmacao para qualificacao.",
        suggestedMessage: suggestedFirstMessage,
      },
      {
        offsetHours: priority === "high" ? 4 : 24,
        channel: priority === "high" ? "phone" : "whatsapp",
        objective: secondObjective,
        suggestedMessage: priority === "high"
          ? "Tentativa de ligacao recomendada antes de nova mensagem, por haver urgencia ou alto score."
          : "Passando para facilitar: se preferir, pode me mandar apenas os documentos principais e eu organizo o restante por aqui.",
      },
      {
        offsetHours: priority === "high" ? 24 : 72,
        channel: "whatsapp",
        objective: "Ultima retomada curta antes de pausar a cadencia.",
        suggestedMessage: "Vou deixar seu atendimento em pausa por enquanto para nao te incomodar. Quando quiser retomar, me chame por aqui que seguimos do ponto certo.",
      },
    ],
    humanReviewChecklist: [
      "Conferir se o lead consentiu contato pelo canal escolhido.",
      ...buildAreaChecklist(legalArea),
      "Ajustar tom da mensagem ao padrao do escritorio antes de enviar.",
    ],
    stopConditions: [
      "Lead pediu para nao receber contato.",
      "Lead informou que ja contratou outro escritorio.",
      "Caso exige analise urgente por advogado antes de mensagem comercial.",
    ],
    nextBestAction: priority === "high"
      ? "SDR deve revisar a mensagem e tentar contato humano ainda hoje."
      : "SDR deve revisar a mensagem, enviar manualmente e registrar retorno no CRM.",
    requiresHumanApproval: true,
    summary: `Plano de follow-up criado para ${leadName}${legalArea ? ` em ${legalArea}` : ""}.`,
  };
}

export function buildLeadFollowupArtifactMetadata(params: {
  crmTaskId?: string | null;
  plan: LeadFollowupPlan;
}) {
  return {
    summary: params.plan.summary,
    crm_task_id: params.crmTaskId || null,
    lead_name: params.plan.leadName,
    legal_area: params.plan.legalArea,
    followup_priority: params.plan.priority,
    cadence: params.plan.cadence,
    suggested_first_message: params.plan.suggestedFirstMessage,
    human_review_checklist: params.plan.humanReviewChecklist,
    stop_conditions: params.plan.stopConditions,
    next_best_action: params.plan.nextBestAction,
    requires_human_approval: params.plan.requiresHumanApproval,
    requires_human_action: true,
    human_actions: [params.plan.nextBestAction],
  };
}
