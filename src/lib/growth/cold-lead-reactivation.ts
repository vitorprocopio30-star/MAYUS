export type ColdLeadCandidateInput = {
  id?: string | null;
  name?: string | null;
  legalArea?: string | null;
  source?: string | null;
  score?: number | null;
  lastInteraction?: string | null;
  tags?: string[] | null;
};

export type ColdLeadReactivationInput = {
  legalArea?: string | null;
  segment?: string | null;
  minDaysInactive?: number | string | null;
  maxLeads?: number | string | null;
  goal?: string | null;
  candidates?: ColdLeadCandidateInput[] | null;
};

export type ColdLeadReactivationMessage = {
  channel: "whatsapp" | "phone";
  objective: string;
  suggestedMessage: string;
};

export type ColdLeadReactivationPlan = {
  legalArea: string | null;
  segment: string;
  minDaysInactive: number;
  maxLeads: number;
  candidateCount: number;
  candidates: Array<{
    id: string | null;
    name: string;
    legalArea: string | null;
    source: string | null;
    score: number | null;
    priority: "low" | "medium" | "high";
  }>;
  selectionCriteria: string[];
  messageVariants: ColdLeadReactivationMessage[];
  approvalChecklist: string[];
  stopConditions: string[];
  nextBestAction: string;
  requiresHumanApproval: boolean;
  externalSideEffectsBlocked: boolean;
  summary: string;
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function numberOrDefault(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function normalizeArea(value?: string | null) {
  return cleanText(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase() || null;
}

function inferSegment(input: ColdLeadReactivationInput) {
  const directSegment = cleanText(input.segment);
  const legalArea = cleanText(input.legalArea);
  return directSegment || legalArea || "leads frios";
}

function buildAreaReason(legalArea: string | null) {
  const area = normalizeArea(legalArea);

  if (area?.includes("previd")) {
    return "retomar oportunidade previdenciaria com foco em prazo, CNIS, indeferimento ou revisao de beneficio";
  }

  if (area?.includes("trabalh")) {
    return "retomar oportunidade trabalhista com foco em prazo, verbas, documentos de vinculo e risco de prescricao";
  }

  if (area?.includes("famil")) {
    return "retomar oportunidade de familia com cuidado no tom e validacao de urgencia";
  }

  return "retomar oportunidade comercial sem assumir tese juridica antes da qualificacao";
}

function buildCandidatePriority(candidate: ColdLeadCandidateInput): "low" | "medium" | "high" {
  const score = numberOrDefault(candidate.score, NaN);
  if (Number.isFinite(score) && score >= 75) return "high";
  if (Number.isFinite(score) && score < 45) return "low";
  return "medium";
}

function normalizeCandidates(input: ColdLeadReactivationInput, maxLeads: number): ColdLeadReactivationPlan["candidates"] {
  return (input.candidates || [])
    .slice(0, maxLeads)
    .map((candidate) => {
      const name = cleanText(candidate.name) || "Lead sem nome";
      const score = Number.isFinite(numberOrDefault(candidate.score, NaN))
        ? numberOrDefault(candidate.score, NaN)
        : null;

      return {
        id: cleanText(candidate.id),
        name,
        legalArea: cleanText(candidate.legalArea) || cleanText(input.legalArea),
        source: cleanText(candidate.source),
        score,
        priority: buildCandidatePriority(candidate),
      };
    });
}

export function buildColdLeadReactivationPlan(input: ColdLeadReactivationInput): ColdLeadReactivationPlan {
  const legalArea = cleanText(input.legalArea);
  const segment = inferSegment(input);
  const minDaysInactive = Math.max(7, Math.round(numberOrDefault(input.minDaysInactive, 30)));
  const maxLeads = Math.max(1, Math.min(50, Math.round(numberOrDefault(input.maxLeads, 20))));
  const candidates = normalizeCandidates(input, maxLeads);
  const areaReason = buildAreaReason(legalArea);
  const goal = cleanText(input.goal) || "validar se ainda faz sentido retomar o atendimento";

  return {
    legalArea,
    segment,
    minDaysInactive,
    maxLeads,
    candidateCount: candidates.length,
    candidates,
    selectionCriteria: [
      `Segmento: ${segment}.`,
      `Considerar leads sem interacao ha pelo menos ${minDaysInactive} dias.`,
      "Priorizar cards sem proximo passo aberto e sem opt-out registrado.",
      "Excluir leads que pediram para nao receber contato ou ja contrataram outro escritorio.",
      `Motivo da reativacao: ${areaReason}.`,
    ],
    messageVariants: [
      {
        channel: "whatsapp",
        objective: "Retomar conversa com contexto e baixa friccao.",
        suggestedMessage: `Ola, tudo bem? Estou retomando alguns atendimentos de ${segment}. A ideia e ${goal}, sem compromisso. Posso te fazer uma pergunta rapida para entender se isso ainda faz sentido para voce?`,
      },
      {
        channel: "whatsapp",
        objective: "Segundo toque curto para quem nao respondeu.",
        suggestedMessage: "Passando so para nao deixar seu atendimento perdido. Se ainda quiser avaliar o caso, eu organizo os proximos passos por aqui.",
      },
      {
        channel: "phone",
        objective: "Contato humano apenas para leads de maior prioridade.",
        suggestedMessage: "Ligacao sugerida somente apos revisao humana do historico, consentimento e prioridade do card.",
      },
    ],
    approvalChecklist: [
      "Revisar a lista de candidatos antes de qualquer contato.",
      "Confirmar que nao existe opt-out, pedido de pausa ou conflito de interesse.",
      "Validar se a mensagem esta adequada ao tom do escritorio e ao historico do lead.",
      "Selecionar manualmente quais leads receberao contato e registrar retorno no CRM.",
    ],
    stopConditions: [
      "Lead pediu para nao receber contato.",
      "Lead ja contratou outro escritorio.",
      "Historico indica risco juridico que exige analise de advogado antes da retomada.",
    ],
    nextBestAction: candidates.length > 0
      ? "SDR deve revisar candidatos, aprovar mensagens e executar contato manualmente por lote controlado."
      : "SDR deve revisar o filtro de leads frios no CRM antes de aprovar a campanha.",
    requiresHumanApproval: true,
    externalSideEffectsBlocked: true,
    summary: `Plano de reativacao criado para ${segment} com ${candidates.length} candidato(s) operacional(is).`,
  };
}

export function buildColdLeadReactivationArtifactMetadata(plan: ColdLeadReactivationPlan) {
  return {
    summary: plan.summary,
    legal_area: plan.legalArea,
    segment: plan.segment,
    min_days_inactive: plan.minDaysInactive,
    max_leads: plan.maxLeads,
    candidate_count: plan.candidateCount,
    candidates: plan.candidates,
    selection_criteria: plan.selectionCriteria,
    message_variants: plan.messageVariants,
    approval_checklist: plan.approvalChecklist,
    stop_conditions: plan.stopConditions,
    next_best_action: plan.nextBestAction,
    requires_human_approval: plan.requiresHumanApproval,
    external_side_effects_blocked: plan.externalSideEffectsBlocked,
    requires_human_action: true,
    human_actions: [plan.nextBestAction],
  };
}
