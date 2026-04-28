export type ExternalActionPreviewInput = {
  actionType?: string | null;
  clientName?: string | null;
  legalArea?: string | null;
  amount?: number | string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  crmTaskId?: string | null;
  notes?: string | null;
};

export type ExternalActionPreview = {
  actionType: "zapsign_contract" | "asaas_billing" | "whatsapp_message" | "generic_external_action";
  clientName: string;
  legalArea: string | null;
  amount: number | null;
  crmTaskId: string | null;
  previewStatus: "pending_human_approval";
  riskLevel: "medium" | "high";
  checklist: string[];
  blockers: string[];
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
    const parsed = Number(value.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeActionType(value?: string | null): ExternalActionPreview["actionType"] {
  const text = normalizeText(value);
  if (/zapsign|contrato|assin/.test(text)) return "zapsign_contract";
  if (/asaas|cobran|boleto|pix|pagamento/.test(text)) return "asaas_billing";
  if (/whatsapp|mensagem/.test(text)) return "whatsapp_message";
  return "generic_external_action";
}

function buildBaseChecklist(actionType: ExternalActionPreview["actionType"]) {
  const common = [
    "Conferir identidade do cliente e origem do pedido.",
    "Confirmar que os dados comerciais batem com o CRM/artifact mais recente.",
    "Validar que nao ha segredo, token ou chave exposta no payload.",
  ];

  if (actionType === "zapsign_contract") {
    return [
      ...common,
      "Conferir nome e e-mail do signatario antes de gerar contrato.",
      "Confirmar que a proposta foi aprovada pelo escritorio.",
    ];
  }

  if (actionType === "asaas_billing") {
    return [
      ...common,
      "Conferir valor, vencimento, parcelas e descricao da cobranca.",
      "Confirmar que contrato/proposta estao aprovados antes de cobrar.",
    ];
  }

  if (actionType === "whatsapp_message") {
    return [
      ...common,
      "Conferir consentimento do lead/cliente para contato.",
      "Revisar tom, promessa comercial e ausencia de aconselhamento juridico indevido.",
    ];
  }

  return [
    ...common,
    "Identificar claramente qual integracao externa sera acionada apos aprovacao.",
  ];
}

export function buildExternalActionPreview(input: ExternalActionPreviewInput): ExternalActionPreview {
  const actionType = normalizeActionType(input.actionType);
  const clientName = cleanText(input.clientName) || cleanText(input.recipientName) || "Cliente nao identificado";
  const legalArea = cleanText(input.legalArea);
  const amount = numberOrNull(input.amount);
  const crmTaskId = cleanText(input.crmTaskId);
  const hasRecipientEmail = Boolean(cleanText(input.recipientEmail));
  const blockers = [
    actionType === "zapsign_contract" && !hasRecipientEmail
      ? "E-mail do signatario ausente para contrato."
      : null,
    actionType === "asaas_billing" && amount === null
      ? "Valor da cobranca ausente ou invalido."
      : null,
    clientName === "Cliente nao identificado"
      ? "Cliente nao identificado com seguranca."
      : null,
  ].filter((item): item is string => Boolean(item));
  const riskLevel = actionType === "asaas_billing" || actionType === "zapsign_contract" ? "high" : "medium";
  const actionLabel = actionType.replaceAll("_", " ");

  return {
    actionType,
    clientName,
    legalArea,
    amount,
    crmTaskId,
    previewStatus: "pending_human_approval",
    riskLevel,
    checklist: buildBaseChecklist(actionType),
    blockers,
    nextBestAction: blockers.length > 0
      ? "Resolver bloqueios do preview antes de solicitar aprovacao ou executar integracao externa."
      : "Advogado/socio deve revisar o preview e aprovar explicitamente antes da execucao externa.",
    externalSideEffectsBlocked: true,
    requiresHumanApproval: true,
    summary: `Preview de acao externa ${actionLabel} criado para ${clientName}.`,
  };
}

export function buildExternalActionPreviewMetadata(preview: ExternalActionPreview) {
  return {
    summary: preview.summary,
    action_type: preview.actionType,
    client_name: preview.clientName,
    legal_area: preview.legalArea,
    amount: preview.amount,
    crm_task_id: preview.crmTaskId,
    preview_status: preview.previewStatus,
    risk_level: preview.riskLevel,
    checklist: preview.checklist,
    blockers: preview.blockers,
    next_best_action: preview.nextBestAction,
    external_side_effects_blocked: preview.externalSideEffectsBlocked,
    requires_human_approval: preview.requiresHumanApproval,
    requires_human_action: true,
    human_actions: [preview.nextBestAction],
  };
}
