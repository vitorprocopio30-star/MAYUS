export type CrmLeadNextStepInput = {
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  stageName?: string | null;
  legalArea?: string | null;
  phone?: string | null;
  assignedName?: string | null;
  isWin?: boolean | null;
  isLoss?: boolean | null;
  lastMovedAt?: string | null;
  createdAt?: string | null;
  now?: Date;
};

export type CrmLeadNextStepPlan = {
  label: string;
  channel: "whatsapp" | "phone" | "meeting" | "internal_review";
  ownerLabel: string;
  dueAt: string;
  objective: string;
  checklist: string[];
  requiresHumanApproval: boolean;
};

export type CrmLeadNextStepStatus = {
  needsNextStep: boolean;
  hasNextStepSignal: boolean;
  isStale: boolean;
  staleDays: number;
  reason: string;
  suggestedNextStep: string;
  organizedPlan: CrmLeadNextStepPlan;
};

const NEXT_STEP_PATTERN = /proxim[oa] passo|proxima acao|next step|next action|follow[- ]?up|retornar|retorno|ligar|whats|whatsapp|agendar|reuniao|reuniao|call|enviar proposta|proposta|documento|contrato|prazo|responsavel/i;

function stripHtml(value?: string | null) {
  return String(value || "").replace(/<[^>]*>/g, " ");
}

function normalize(value?: string | null) {
  return stripHtml(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getAgeDays(input: CrmLeadNextStepInput) {
  const base = input.lastMovedAt || input.createdAt;
  const timestamp = base ? new Date(base).getTime() : NaN;
  if (!Number.isFinite(timestamp)) return 0;

  const now = input.now || new Date();
  const diffMs = now.getTime() - timestamp;
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function getNextBusinessSlot(input: CrmLeadNextStepInput, urgency: "same_day" | "next_day") {
  const date = new Date(input.now || new Date());
  if (urgency === "same_day" && date.getHours() < 15) {
    date.setHours(16, 0, 0, 0);
  } else {
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
  }

  const day = date.getDay();
  if (day === 0) date.setDate(date.getDate() + 1);
  if (day === 6) date.setDate(date.getDate() + 2);

  return date.toISOString();
}

function inferChannel(input: CrmLeadNextStepInput): CrmLeadNextStepPlan["channel"] {
  const content = [input.title, input.description, ...(input.tags || [])].map(normalize).join(" ");

  if (/call|reuniao|consulta|agendar|meet|zoom/.test(content)) return "meeting";
  if (/ligar|telefone|phone/.test(content)) return "phone";
  if (input.phone || /whats|whatsapp|mensagem/.test(content)) return "whatsapp";
  return "internal_review";
}

function buildAreaChecklist(legalArea?: string | null) {
  const area = normalize(legalArea);

  if (area.includes("previd")) {
    return ["Pedir CNIS/carta do INSS, se ainda nao estiverem no dossie.", "Confirmar beneficio pretendido e prazo de recurso."];
  }

  if (area.includes("trabalh")) {
    return ["Pedir CTPS, holerites e termo de rescisao.", "Confirmar admissao, demissao e verbas discutidas."];
  }

  if (area.includes("famil")) {
    return ["Confirmar se ha menor, audiencia ou decisao anterior.", "Pedir documentos de renda, despesas e vinculo familiar."];
  }

  return ["Confirmar dor principal, prazo e objetivo do atendimento.", "Pedir documentos minimos que comprovem os fatos."];
}

function channelLabel(channel: CrmLeadNextStepPlan["channel"]) {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "phone") return "ligacao";
  if (channel === "meeting") return "reuniao/consulta";
  return "revisao interna";
}

function buildOrganizedPlan(input: CrmLeadNextStepInput, params: { isStale: boolean }): CrmLeadNextStepPlan {
  const channel = inferChannel(input);
  const leadName = cleanText(input.title) || "lead";
  const ownerLabel = cleanText(input.assignedName) || "responsavel comercial";
  const legalArea = cleanText(input.legalArea);
  const checklistArea = [input.legalArea, input.stageName, input.title, input.description, ...(input.tags || [])]
    .filter(Boolean)
    .join(" ");
  const dueAt = getNextBusinessSlot(input, params.isStale ? "same_day" : "next_day");
  const actionLabel = params.isStale ? "Revalidar proximo passo" : "Organizar primeiro proximo passo";
  const channelText = channelLabel(channel);

  return {
    label: actionLabel,
    channel,
    ownerLabel,
    dueAt,
    objective: params.isStale
      ? `Revisar o combinado com ${leadName}, confirmar se o follow-up ainda vale e atualizar o CRM.`
      : `Definir contato por ${channelText} para qualificar ${leadName}${legalArea ? ` em ${legalArea}` : ""} e remover a proxima friccao.`,
    checklist: [
      `Responsavel: ${ownerLabel}.`,
      `Canal recomendado: ${channelText}.`,
      ...buildAreaChecklist(checklistArea),
      "Registrar retorno, no-show ou pausa no CRM depois do contato.",
    ],
    requiresHumanApproval: channel !== "internal_review",
  };
}

function buildClosedPlan(input: CrmLeadNextStepInput): CrmLeadNextStepPlan {
  return {
    label: "Oportunidade encerrada",
    channel: "internal_review",
    ownerLabel: cleanText(input.assignedName) || "responsavel comercial",
    dueAt: (input.now || new Date()).toISOString(),
    objective: "Nenhuma acao comercial pendente.",
    checklist: ["Manter registro do fechamento/perda no historico."],
    requiresHumanApproval: false,
  };
}

export function buildCrmLeadNextStepStatus(input: CrmLeadNextStepInput): CrmLeadNextStepStatus {
  const isClosed = Boolean(input.isWin || input.isLoss);
  const content = [input.title, input.description, input.stageName, ...(input.tags || [])].map(normalize).join(" ");
  const hasNextStepSignal = NEXT_STEP_PATTERN.test(content);
  const staleDays = getAgeDays(input);
  const isStale = staleDays >= 2;
  const organizedPlan = buildOrganizedPlan(input, { isStale });

  if (isClosed) {
    return {
      needsNextStep: false,
      hasNextStepSignal,
      isStale: false,
      staleDays,
      reason: "Oportunidade encerrada.",
      suggestedNextStep: "Nenhuma acao comercial pendente.",
      organizedPlan: buildClosedPlan(input),
    };
  }

  if (!hasNextStepSignal) {
    return {
      needsNextStep: true,
      hasNextStepSignal,
      isStale,
      staleDays,
      reason: "Sem proximo passo claro registrado.",
      suggestedNextStep: organizedPlan.objective,
      organizedPlan,
    };
  }

  if (isStale) {
    return {
      needsNextStep: true,
      hasNextStepSignal,
      isStale,
      staleDays,
      reason: `Proximo passo existe, mas o lead esta parado ha ${staleDays} dias.`,
      suggestedNextStep: organizedPlan.objective,
      organizedPlan,
    };
  }

  const healthyPlan = {
    ...organizedPlan,
    label: "Proximo passo registrado",
    objective: "Manter acompanhamento conforme registrado.",
    requiresHumanApproval: false,
  };

  return {
    needsNextStep: false,
    hasNextStepSignal,
    isStale,
    staleDays,
    reason: "Proximo passo identificado.",
    suggestedNextStep: "Manter acompanhamento conforme registrado.",
    organizedPlan: healthyPlan,
  };
}
