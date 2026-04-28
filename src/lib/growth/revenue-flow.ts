export type RevenueFlowInput = {
  crmTaskId?: string | null;
  clientName?: string | null;
  legalArea?: string | null;
  amount?: number | string | null;
  proposalReady?: boolean | string | null;
  contractReady?: boolean | string | null;
  billingReady?: boolean | string | null;
  paymentConfirmed?: boolean | string | null;
};

export type RevenueFlowStep = {
  key: "proposal" | "contract" | "billing" | "case_opening";
  label: string;
  status: "ready" | "waiting" | "blocked";
  capability: string;
  humanAction: string;
};

export type RevenueFlowPlan = {
  clientName: string;
  legalArea: string | null;
  crmTaskId: string | null;
  amount: number | null;
  steps: RevenueFlowStep[];
  nextBestAction: string;
  blockedReason: string | null;
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
    const parsed = Number(value.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function bool(value: unknown) {
  return value === true || value === "true" || value === "sim" || value === "yes";
}

function buildStep(params: {
  key: RevenueFlowStep["key"];
  label: string;
  status: RevenueFlowStep["status"];
  capability: string;
  humanAction: string;
}): RevenueFlowStep {
  return params;
}

export function buildRevenueFlowPlan(input: RevenueFlowInput): RevenueFlowPlan {
  const clientName = cleanText(input.clientName) || "Cliente nao identificado";
  const legalArea = cleanText(input.legalArea);
  const crmTaskId = cleanText(input.crmTaskId);
  const amount = numberOrNull(input.amount);
  const proposalReady = bool(input.proposalReady);
  const contractReady = bool(input.contractReady);
  const billingReady = bool(input.billingReady);
  const paymentConfirmed = bool(input.paymentConfirmed);
  const blockedReason = amount === null ? "Valor comercial ainda nao confirmado para gerar cobranca." : null;

  const steps: RevenueFlowStep[] = [
    buildStep({
      key: "proposal",
      label: "Proposta comercial",
      status: proposalReady ? "ready" : "waiting",
      capability: "proposal_generate",
      humanAction: proposalReady ? "Revisar proposta projetada no CRM." : "Gerar e revisar proposta antes de contrato.",
    }),
    buildStep({
      key: "contract",
      label: "Contrato",
      status: proposalReady ? contractReady ? "ready" : "waiting" : "blocked",
      capability: "zapsign_contract",
      humanAction: contractReady ? "Conferir link/documento de assinatura." : "Aprovar proposta e dados do signatario antes de gerar contrato.",
    }),
    buildStep({
      key: "billing",
      label: "Cobranca inicial",
      status: blockedReason ? "blocked" : contractReady ? billingReady ? "ready" : "waiting" : "blocked",
      capability: "asaas_cobrar",
      humanAction: billingReady ? "Conferir link de pagamento e status." : "Gerar cobranca somente apos contrato aprovado/assinado.",
    }),
    buildStep({
      key: "case_opening",
      label: "Abertura do caso",
      status: paymentConfirmed ? "ready" : "blocked",
      capability: "revenue_to_case",
      humanAction: paymentConfirmed
        ? "Validar caso/process_task criado pelo webhook de pagamento."
        : "Aguardar confirmacao de pagamento Asaas antes de abrir caso automaticamente.",
    }),
  ];

  const firstPending = steps.find((step) => step.status === "waiting") || steps.find((step) => step.status === "blocked");
  const nextBestAction = firstPending?.humanAction || "Fluxo comercial completo; validar dossie do caso no Case Brain.";

  return {
    clientName,
    legalArea,
    crmTaskId,
    amount,
    steps,
    nextBestAction,
    blockedReason,
    requiresHumanApproval: true,
    summary: `Plano revenue-to-case criado para ${clientName}${legalArea ? ` em ${legalArea}` : ""}.`,
  };
}

export function buildRevenueFlowArtifactMetadata(plan: RevenueFlowPlan) {
  return {
    summary: plan.summary,
    client_name: plan.clientName,
    legal_area: plan.legalArea,
    crm_task_id: plan.crmTaskId,
    amount: plan.amount,
    steps: plan.steps,
    next_best_action: plan.nextBestAction,
    blocked_reason: plan.blockedReason,
    requires_human_approval: plan.requiresHumanApproval,
    requires_human_action: true,
    human_actions: [plan.nextBestAction],
  };
}
