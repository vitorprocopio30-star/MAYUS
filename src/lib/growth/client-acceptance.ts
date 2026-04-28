export type ClientAcceptanceInput = {
  clientName?: string | null;
  crmTaskId?: string | null;
  legalArea?: string | null;
  acceptanceType?: string | null;
  acceptanceChannel?: string | null;
  evidenceSummary?: string | null;
  amount?: number | string | null;
  acceptedAt?: string | null;
};

export type ClientAcceptanceRecord = {
  clientName: string;
  crmTaskId: string | null;
  legalArea: string | null;
  acceptanceType: "proposal" | "contract" | "billing" | "engagement" | "generic";
  acceptanceChannel: string | null;
  evidenceSummary: string;
  amount: number | null;
  acceptedAt: string;
  auditStatus: "recorded_pending_internal_review";
  checklist: string[];
  nextBestAction: string;
  externalSideEffectsBlocked: boolean;
  requiresHumanReview: boolean;
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

function normalizeAcceptanceType(value?: string | null): ClientAcceptanceRecord["acceptanceType"] {
  const text = normalizeText(value);
  if (/proposta|proposal/.test(text)) return "proposal";
  if (/contrato|contract|assin/.test(text)) return "contract";
  if (/cobran|pagamento|billing|asaas|pix|boleto/.test(text)) return "billing";
  if (/fechamento|contrat|engagement|entrada/.test(text)) return "engagement";
  return "generic";
}

function parseAcceptedAt(value?: string | null) {
  const text = cleanText(value);
  if (text) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

export function buildClientAcceptanceRecord(input: ClientAcceptanceInput): ClientAcceptanceRecord {
  const clientName = cleanText(input.clientName) || "Cliente nao identificado";
  const crmTaskId = cleanText(input.crmTaskId);
  const legalArea = cleanText(input.legalArea);
  const acceptanceType = normalizeAcceptanceType(input.acceptanceType);
  const acceptanceChannel = cleanText(input.acceptanceChannel);
  const evidenceSummary = cleanText(input.evidenceSummary) || "Aceite informado ao MAYUS sem anexo/evidencia adicional.";
  const amount = numberOrNull(input.amount);
  const acceptedAt = parseAcceptedAt(input.acceptedAt);

  return {
    clientName,
    crmTaskId,
    legalArea,
    acceptanceType,
    acceptanceChannel,
    evidenceSummary,
    amount,
    acceptedAt,
    auditStatus: "recorded_pending_internal_review",
    checklist: [
      "Conferir se o aceite foi dado pelo cliente ou representante autorizado.",
      "Validar se proposta/contrato/cobranca relacionados correspondem ao aceite.",
      "Registrar evidencia externa em local apropriado antes de executar side effect.",
      "Manter execucao externa dependente de aprovacao humana ou gatilho confirmado.",
    ],
    nextBestAction: "Equipe deve revisar o aceite registrado e vincular evidencia antes de avançar para contrato, cobranca ou abertura de caso.",
    externalSideEffectsBlocked: true,
    requiresHumanReview: true,
    summary: `Aceite do cliente registrado para ${clientName}.`,
  };
}

export function buildClientAcceptanceArtifactMetadata(record: ClientAcceptanceRecord) {
  return {
    summary: record.summary,
    client_name: record.clientName,
    crm_task_id: record.crmTaskId,
    legal_area: record.legalArea,
    acceptance_type: record.acceptanceType,
    acceptance_channel: record.acceptanceChannel,
    evidence_summary: record.evidenceSummary,
    amount: record.amount,
    accepted_at: record.acceptedAt,
    audit_status: record.auditStatus,
    checklist: record.checklist,
    next_best_action: record.nextBestAction,
    external_side_effects_blocked: record.externalSideEffectsBlocked,
    requires_human_review: record.requiresHumanReview,
    requires_human_action: true,
    human_actions: [record.nextBestAction],
  };
}

export function buildClientAcceptanceSystemEventPayload(params: {
  record: ClientAcceptanceRecord;
  userId?: string | null;
  auditLogId?: string | null;
}) {
  return {
    event_name: "client_acceptance_recorded",
    status: "ok",
    payload: {
      audit_log_id: params.auditLogId || null,
      user_id: params.userId || null,
      client_name: params.record.clientName,
      crm_task_id: params.record.crmTaskId,
      legal_area: params.record.legalArea,
      acceptance_type: params.record.acceptanceType,
      acceptance_channel: params.record.acceptanceChannel,
      amount: params.record.amount,
      accepted_at: params.record.acceptedAt,
      audit_status: params.record.auditStatus,
      external_side_effects_blocked: params.record.externalSideEffectsBlocked,
    },
  };
}
