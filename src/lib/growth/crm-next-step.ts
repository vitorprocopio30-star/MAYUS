export type CrmLeadNextStepInput = {
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  stageName?: string | null;
  isWin?: boolean | null;
  isLoss?: boolean | null;
  lastMovedAt?: string | null;
  createdAt?: string | null;
  now?: Date;
};

export type CrmLeadNextStepStatus = {
  needsNextStep: boolean;
  hasNextStepSignal: boolean;
  isStale: boolean;
  staleDays: number;
  reason: string;
  suggestedNextStep: string;
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

export function buildCrmLeadNextStepStatus(input: CrmLeadNextStepInput): CrmLeadNextStepStatus {
  const isClosed = Boolean(input.isWin || input.isLoss);
  const content = [input.title, input.description, input.stageName, ...(input.tags || [])].map(normalize).join(" ");
  const hasNextStepSignal = NEXT_STEP_PATTERN.test(content);
  const staleDays = getAgeDays(input);
  const isStale = staleDays >= 2;

  if (isClosed) {
    return {
      needsNextStep: false,
      hasNextStepSignal,
      isStale: false,
      staleDays,
      reason: "Oportunidade encerrada.",
      suggestedNextStep: "Nenhuma acao comercial pendente.",
    };
  }

  if (!hasNextStepSignal) {
    return {
      needsNextStep: true,
      hasNextStepSignal,
      isStale,
      staleDays,
      reason: "Sem proximo passo claro registrado.",
      suggestedNextStep: "Definir data, canal e responsavel para o proximo contato antes de avancar.",
    };
  }

  if (isStale) {
    return {
      needsNextStep: true,
      hasNextStepSignal,
      isStale,
      staleDays,
      reason: `Proximo passo existe, mas o lead esta parado ha ${staleDays} dias.`,
      suggestedNextStep: "Revisar o combinado e confirmar se o follow-up ainda esta valido.",
    };
  }

  return {
    needsNextStep: false,
    hasNextStepSignal,
    isStale,
    staleDays,
    reason: "Proximo passo identificado.",
    suggestedNextStep: "Manter acompanhamento conforme registrado.",
  };
}
