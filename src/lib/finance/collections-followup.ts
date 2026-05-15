export type CollectionsFollowupStage = "light_overdue" | "delinquency" | "renegotiation";
export type CollectionsFollowupPriority = "low" | "medium" | "high";
export type CollectionsFollowupTone = "firm" | "empathetic" | "neutral";
export type CollectionsFollowupChannel = "whatsapp" | "phone" | "email";

export type CollectionsFollowupInput = {
  clientName?: string | null;
  legalArea?: string | null;
  amount?: number | string | null;
  daysOverdue?: number | string | null;
  dueDate?: string | null;
  stage?: string | null;
  tone?: string | null;
  channel?: string | null;
  notes?: string | null;
  paymentPromiseAt?: string | null;
  nextContactAt?: string | null;
};

export type CollectionsFollowupCadenceItem = {
  offsetHours: number;
  channel: CollectionsFollowupChannel;
  objective: string;
  suggestedMessage: string;
};

export type CollectionsFollowupPlan = {
  clientName: string;
  legalArea: string | null;
  amount: number | null;
  daysOverdue: number;
  dueDate: string | null;
  stage: CollectionsFollowupStage;
  priority: CollectionsFollowupPriority;
  tone: CollectionsFollowupTone;
  primaryChannel: CollectionsFollowupChannel;
  suggestedFirstMessage: string;
  cadence: CollectionsFollowupCadenceItem[];
  humanReviewChecklist: string[];
  stopConditions: string[];
  blockers: string[];
  promiseTracking: {
    paymentPromiseAt: string | null;
    nextContactAt: string | null;
  };
  nextBestAction: string;
  externalSideEffectsBlocked: boolean;
  requiresHumanApproval: boolean;
  summary: string;
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizeText(value?: string | null) {
  return cleanText(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase() || "";
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function integerOrZero(value: unknown) {
  const parsed = numberOrNull(value);
  if (parsed === null) return 0;
  return Math.max(0, Math.floor(parsed));
}

function formatCurrency(value: number | null) {
  if (value === null) return "valor em aberto";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function normalizeTone(value?: string | null): CollectionsFollowupTone {
  const text = normalizeText(value);
  if (/firme|assertivo|objetivo|duro/.test(text)) return "firm";
  if (/empatico|humano|acolhedor|suave|leve/.test(text)) return "empathetic";
  return "neutral";
}

function normalizeChannel(value?: string | null): CollectionsFollowupChannel {
  const text = normalizeText(value);
  if (/telefone|ligacao|call/.test(text)) return "phone";
  if (/email|e-mail/.test(text)) return "email";
  return "whatsapp";
}

function normalizeStage(input: {
  stage?: string | null;
  notes?: string | null;
  daysOverdue: number;
  paymentPromiseAt?: string | null;
}): CollectionsFollowupStage {
  const text = normalizeText(`${input.stage || ""} ${input.notes || ""}`);
  if (/renegoci|parcel|acordo|promessa/.test(text) || cleanText(input.paymentPromiseAt)) return "renegotiation";
  if (/inadimpl|vencid|atraso\s+grave|negativ/.test(text)) return "delinquency";
  if (input.daysOverdue >= 8) return "delinquency";
  return "light_overdue";
}

function resolvePriority(params: {
  stage: CollectionsFollowupStage;
  amount: number | null;
  daysOverdue: number;
}) {
  if (params.stage === "delinquency" && (params.daysOverdue >= 15 || (params.amount ?? 0) >= 5000)) return "high";
  if (params.stage === "renegotiation" || params.daysOverdue >= 8 || (params.amount ?? 0) >= 2500) return "medium";
  return "low";
}

function buildFirstMessage(params: {
  clientName: string;
  stage: CollectionsFollowupStage;
  tone: CollectionsFollowupTone;
  amount: number | null;
  daysOverdue: number;
  dueDate: string | null;
  legalArea: string | null;
}) {
  const firstName = params.clientName.split(/\s+/)[0] || params.clientName;
  const amountLabel = formatCurrency(params.amount);
  const dueLabel = params.dueDate ? ` com vencimento em ${params.dueDate}` : "";
  const areaLabel = params.legalArea ? ` do atendimento em ${params.legalArea}` : "";
  const daysLabel = params.daysOverdue > 0 ? ` ha ${params.daysOverdue} dia(s)` : "";

  if (params.stage === "renegotiation") {
    return `Ola, ${firstName}. Estou organizando a pendencia${areaLabel} de ${amountLabel}${dueLabel}. Se precisar ajustar a forma de pagamento, posso levar uma proposta de renegociacao para aprovacao interna antes de qualquer novo envio.`;
  }

  if (params.stage === "delinquency") {
    const opener = params.tone === "empathetic"
      ? "Quero te ajudar a regularizar isso com seguranca."
      : "Precisamos regularizar essa pendencia para manter o andamento combinado.";
    return `Ola, ${firstName}. Consta uma pendencia${areaLabel} de ${amountLabel}${dueLabel}${daysLabel}. ${opener} Voce consegue confirmar o pagamento ou prefere que eu organize uma alternativa para revisao?`;
  }

  const softener = params.tone === "firm"
    ? "Pode confirmar a regularizacao ainda hoje?"
    : "Pode me confirmar se o pagamento ja foi feito ou se prefere que eu reenvie o link?";
  return `Ola, ${firstName}. Passando para conferir a parcela${areaLabel} de ${amountLabel}${dueLabel}${daysLabel}. ${softener}`;
}

function buildCadence(params: {
  stage: CollectionsFollowupStage;
  primaryChannel: CollectionsFollowupChannel;
  firstMessage: string;
}) {
  if (params.stage === "renegotiation") {
    return [
      {
        offsetHours: 0,
        channel: params.primaryChannel,
        objective: "Confirmar interesse em regularizar e colher proposta de ajuste sem prometer aprovacao.",
        suggestedMessage: params.firstMessage,
      },
      {
        offsetHours: 24,
        channel: "phone" as const,
        objective: "Validar condicao real de pagamento e encaminhar para aprovacao interna.",
        suggestedMessage: "Tentativa humana recomendada para entender proposta de renegociacao e evitar troca longa por mensagem.",
      },
      {
        offsetHours: 72,
        channel: "whatsapp" as const,
        objective: "Registrar ausencia de retorno e pausar nova tentativa automatica.",
        suggestedMessage: "Vou deixar a regularizacao em pausa por enquanto. Quando quiser retomar, me chame por aqui para organizarmos a melhor alternativa com o escritorio.",
      },
    ];
  }

  return [
    {
      offsetHours: 0,
      channel: params.primaryChannel,
      objective: "Retomar cobranca com contexto, sem ameaca juridica e sem envio externo automatico.",
      suggestedMessage: params.firstMessage,
    },
    {
      offsetHours: params.stage === "delinquency" ? 24 : 48,
      channel: params.stage === "delinquency" ? "phone" as const : "whatsapp" as const,
      objective: params.stage === "delinquency"
        ? "Tentar contato humano para reduzir risco de inadimplencia prolongada."
        : "Reforcar lembrete curto se nao houver resposta.",
      suggestedMessage: params.stage === "delinquency"
        ? "Ligacao recomendada antes de nova mensagem, pois a pendencia ja passou do atraso leve."
        : "Estou so reforcando o lembrete para ficar tudo em ordem. Posso reenviar o link de pagamento?",
    },
    {
      offsetHours: params.stage === "delinquency" ? 72 : 96,
      channel: "whatsapp" as const,
      objective: "Encerrar a cadencia sem insistencia excessiva e levar caso para revisao humana.",
      suggestedMessage: "Nao consegui confirmar a regularizacao por aqui. Vou sinalizar internamente para o escritorio decidir o proximo passo adequado.",
    },
  ];
}

function buildReviewChecklist(stage: CollectionsFollowupStage) {
  const checklist = [
    "Conferir valor, vencimento, cliente e origem da cobranca no CRM/financials/artifact.",
    "Confirmar se o pagamento ja nao foi recebido antes de contatar o cliente.",
    "Revisar tom da mensagem e remover qualquer ameaca, promessa juridica ou pressao indevida.",
    "Confirmar que o cliente pode ser contatado pelo canal escolhido.",
  ];

  if (stage === "renegotiation") {
    checklist.push("Aprovar internamente qualquer desconto, parcelamento ou nova data antes de prometer ao cliente.");
  }

  if (stage === "delinquency") {
    checklist.push("Validar se ha regra contratual ou politica do escritorio para escalonamento da inadimplencia.");
  }

  return checklist;
}

export function buildCollectionsFollowupPlan(input: CollectionsFollowupInput): CollectionsFollowupPlan {
  const clientName = cleanText(input.clientName) || "Cliente nao identificado";
  const legalArea = cleanText(input.legalArea);
  const amount = numberOrNull(input.amount);
  const daysOverdue = integerOrZero(input.daysOverdue);
  const dueDate = cleanText(input.dueDate);
  const paymentPromiseAt = cleanText(input.paymentPromiseAt);
  const nextContactAt = cleanText(input.nextContactAt);
  const tone = normalizeTone(input.tone);
  const primaryChannel = normalizeChannel(input.channel);
  const stage = normalizeStage({
    stage: input.stage,
    notes: input.notes,
    daysOverdue,
    paymentPromiseAt,
  });
  const priority = resolvePriority({ stage, amount, daysOverdue });
  const suggestedFirstMessage = buildFirstMessage({
    clientName,
    stage,
    tone,
    amount,
    daysOverdue,
    dueDate,
    legalArea,
  });
  const blockers = [
    clientName === "Cliente nao identificado" ? "Cliente nao identificado com seguranca." : null,
    amount === null ? "Valor da pendencia ausente ou invalido." : null,
  ].filter((item): item is string => Boolean(item));
  const cadence = buildCadence({ stage, primaryChannel, firstMessage: suggestedFirstMessage });
  const nextBestAction = blockers.length > 0
    ? "Resolver os dados minimos da cobranca antes de enviar qualquer mensagem externa."
    : stage === "renegotiation"
      ? "Responsavel financeiro deve revisar proposta de renegociacao e registrar promessa/proximo contato."
      : priority === "high"
        ? "Responsavel financeiro deve revisar e tentar contato humano no mesmo dia."
        : "Responsavel financeiro deve revisar a mensagem, enviar manualmente e registrar retorno.";

  return {
    clientName,
    legalArea,
    amount,
    daysOverdue,
    dueDate,
    stage,
    priority,
    tone,
    primaryChannel,
    suggestedFirstMessage,
    cadence,
    humanReviewChecklist: buildReviewChecklist(stage),
    stopConditions: [
      "Pagamento confirmado.",
      "Cliente pediu para nao receber contato.",
      "Cliente contestou valor, contrato ou servico.",
      "Renegociacao exige aprovacao de socio/financeiro antes de resposta final.",
    ],
    blockers,
    promiseTracking: {
      paymentPromiseAt,
      nextContactAt,
    },
    nextBestAction,
    externalSideEffectsBlocked: true,
    requiresHumanApproval: true,
    summary: `Plano de cobranca ${stage} criado para ${clientName}.`,
  };
}

export function buildCollectionsFollowupArtifactMetadata(params: {
  crmTaskId?: string | null;
  billingArtifactId?: string | null;
  financialId?: string | null;
  plan: CollectionsFollowupPlan;
}) {
  return {
    summary: params.plan.summary,
    crm_task_id: params.crmTaskId || null,
    billing_artifact_id: params.billingArtifactId || null,
    financial_id: params.financialId || null,
    client_name: params.plan.clientName,
    legal_area: params.plan.legalArea,
    amount: params.plan.amount,
    days_overdue: params.plan.daysOverdue,
    due_date: params.plan.dueDate,
    collection_stage: params.plan.stage,
    collection_priority: params.plan.priority,
    tone: params.plan.tone,
    primary_channel: params.plan.primaryChannel,
    suggested_first_message: params.plan.suggestedFirstMessage,
    cadence: params.plan.cadence,
    human_review_checklist: params.plan.humanReviewChecklist,
    stop_conditions: params.plan.stopConditions,
    blockers: params.plan.blockers,
    payment_promise_at: params.plan.promiseTracking.paymentPromiseAt,
    next_contact_at: params.plan.promiseTracking.nextContactAt,
    next_best_action: params.plan.nextBestAction,
    external_side_effects_blocked: params.plan.externalSideEffectsBlocked,
    requires_human_approval: params.plan.requiresHumanApproval,
    requires_human_action: true,
    human_actions: [params.plan.nextBestAction],
  };
}
