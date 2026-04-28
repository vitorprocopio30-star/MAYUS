export type SalesProfileSetupInput = {
  idealClient?: string | null;
  coreSolution?: string | null;
  uniqueValueProposition?: string | null;
  valuePillars?: string[] | null;
  positioningSummary?: string | null;
  antiClientSignals?: string[] | null;
  conversationSummary?: string | null;
  conversationTurns?: Array<{ role: string; content: string }> | null;
  existingProfile?: SalesProfileSetupProfile | null;
  confirmationText?: string | null;
};

export type SalesProfileSetupStatus = "collecting" | "draft" | "auto_configured" | "validated";

export type SalesProfileSetupSignal = {
  key: "ideal_client" | "core_solution" | "unique_value_proposition" | "value_pillars" | "anti_client";
  label: string;
  status: "captured" | "drafted" | "missing";
  evidence: string | null;
  nextQuestion: string;
};

export type SalesProfileSetupProfile = {
  idealClient: string | null;
  coreSolution: string | null;
  uniqueValueProposition: string | null;
  valuePillars: string[];
  positioningSummary: string | null;
  antiClientSignals: string[];
  status?: string | null;
};

export type SalesProfileSetupPlan = {
  profile: SalesProfileSetupProfile & { status: SalesProfileSetupStatus };
  knownSignals: SalesProfileSetupSignal[];
  missingSignals: SalesProfileSetupSignal[];
  draftedSignals: SalesProfileSetupSignal[];
  completeness: number;
  status: SalesProfileSetupStatus;
  nextQuestion: string;
  setupConversationScript: string[];
  autoConfigurationActions: string[];
  shouldPersist: boolean;
  shouldMarkValidated: boolean;
  requiresHumanReview: boolean;
  externalSideEffectsBlocked: boolean;
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

function splitList(values?: string[] | null) {
  return (values || [])
    .flatMap((item) => String(item || "").split(/\s*(?:\||;|,)\s*/))
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
}

function buildConversationText(input: SalesProfileSetupInput) {
  const turns = (input.conversationTurns || [])
    .filter((turn) => cleanText(turn.content))
    .slice(-16)
    .map((turn) => `${turn.role}: ${cleanText(turn.content)}`)
    .join("\n");

  return [input.conversationSummary, turns]
    .map((item) => cleanText(item))
    .filter(Boolean)
    .join("\n");
}

function pickEvidence(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1])?.slice(0, 260) || null;
  }
  return null;
}

function inferIdealClient(input: SalesProfileSetupInput, text: string) {
  return cleanText(input.idealClient)
    || cleanText(input.existingProfile?.idealClient)
    || pickEvidence(text, [
      /cliente\s+ideal\s*[:\-]?\s*(.{12,240})/i,
      /atendemos\s+(.{12,240})/i,
      /melhor\s+cliente\s*[:\-]?\s*(.{12,240})/i,
      /publico\s+alvo\s*[:\-]?\s*(.{12,240})/i,
    ]);
}

function inferCoreSolution(input: SalesProfileSetupInput, text: string) {
  return cleanText(input.coreSolution)
    || cleanText(input.existingProfile?.coreSolution)
    || pickEvidence(text, [
      /solu[cç][aã]o\s+(?:central|principal)?\s*[:\-]?\s*(.{12,240})/i,
      /resolvemos\s+(.{12,240})/i,
      /entregamos\s+(.{12,240})/i,
      /ajudamos\s+[^.]{0,80}\s+a\s+(.{12,240})/i,
    ]);
}

function inferPuv(input: SalesProfileSetupInput, text: string) {
  return cleanText(input.uniqueValueProposition)
    || cleanText(input.existingProfile?.uniqueValueProposition)
    || pickEvidence(text, [
      /puv\s*[:\-]?\s*(.{12,280})/i,
      /proposta\s+unica\s+de\s+valor\s*[:\-]?\s*(.{12,280})/i,
      /proposta\s+única\s+de\s+valor\s*[:\-]?\s*(.{12,280})/i,
      /diferencial\s*[:\-]?\s*(.{12,280})/i,
    ]);
}

function inferPillars(input: SalesProfileSetupInput, text: string) {
  const provided = splitList(input.valuePillars);
  if (provided.length > 0) return provided;

  const existing = splitList(input.existingProfile?.valuePillars);
  if (existing.length > 0) return existing;

  const evidence = pickEvidence(text, [
    /pilares?\s*[:\-]?\s*(.{12,220})/i,
    /sustentamos\s+(?:isso\s+)?(?:em|com)\s+(.{12,220})/i,
  ]);

  return splitList(evidence ? [evidence] : []);
}

function inferAntiClient(input: SalesProfileSetupInput, text: string) {
  const provided = splitList(input.antiClientSignals);
  if (provided.length > 0) return provided;

  const existing = splitList(input.existingProfile?.antiClientSignals);
  if (existing.length > 0) return existing;

  const evidence = pickEvidence(text, [
    /anti[-\s]?cliente\s*[:\-]?\s*(.{10,220})/i,
    /n[aã]o\s+queremos\s+atender\s+(.{10,220})/i,
    /cliente\s+ruim\s*[:\-]?\s*(.{10,220})/i,
  ]);

  return splitList(evidence ? [evidence] : []);
}

function buildDraftPuv(idealClient: string | null, coreSolution: string | null) {
  const client = idealClient || "clientes com problema juridico relevante e decisao pendente";
  const solution = coreSolution || "clareza sobre risco, documentos, estrategia e proximo passo";
  return `Ajudamos ${client} a sair da incerteza e decidir com seguranca usando diagnostico consultivo, plano de provas e acompanhamento juridico humano para chegar em ${solution}, sem promessa vazia de resultado.`;
}

function buildDraftPillars(coreSolution: string | null) {
  return [
    "Diagnostico Sem Venda Forcada",
    "Plano de Provas e Risco",
    coreSolution ? "Decisao Guiada por Evidencia" : "Decisao Guiada por Clareza",
  ];
}

function buildPositioningSummary(params: {
  idealClient: string | null;
  coreSolution: string | null;
  puv: string | null;
  pillars: string[];
}) {
  if (!params.idealClient && !params.coreSolution && !params.puv) return null;

  return [
    params.idealClient ? `Cliente ideal: ${params.idealClient}` : null,
    params.coreSolution ? `Solucao central: ${params.coreSolution}` : null,
    params.puv ? `PUV: ${params.puv}` : null,
    params.pillars.length > 0 ? `Pilares: ${params.pillars.join(", ")}` : null,
  ].filter(Boolean).join(" | ");
}

function isConfirmation(input: SalesProfileSetupInput) {
  const text = normalizeText([
    input.confirmationText,
    input.conversationSummary,
    ...(input.conversationTurns || []).slice(-4).map((turn) => turn.content),
  ].join("\n"));

  return /\b(confirmo|validado|valida|pode\s+salvar|salva|salvar|pode\s+gravar|grava|aprovado|fechado|esta\s+certo|t[aá]\s+certo)\b/i.test(text);
}

export function buildSalesProfileSetupPlan(input: SalesProfileSetupInput): SalesProfileSetupPlan {
  const conversationText = buildConversationText(input);
  const idealClient = inferIdealClient(input, conversationText);
  const coreSolution = inferCoreSolution(input, conversationText);
  const providedPuv = inferPuv(input, conversationText);
  const providedPillars = inferPillars(input, conversationText);
  const antiClientSignals = inferAntiClient(input, conversationText);

  const draftedPuv = providedPuv || buildDraftPuv(idealClient, coreSolution);
  const valuePillars = providedPillars.length > 0 ? providedPillars : buildDraftPillars(coreSolution);
  const positioningSummary = cleanText(input.positioningSummary)
    || cleanText(input.existingProfile?.positioningSummary)
    || buildPositioningSummary({ idealClient, coreSolution, puv: draftedPuv, pillars: valuePillars });

  const signals: SalesProfileSetupSignal[] = [
    {
      key: "ideal_client",
      label: "Cliente ideal",
      status: idealClient ? "captured" : "missing",
      evidence: idealClient,
      nextQuestion: "Quem e o cliente ideal do escritorio? Pode me dizer problema, urgencia, perfil e capacidade de decisao.",
    },
    {
      key: "core_solution",
      label: "Solucao central",
      status: coreSolution ? "captured" : "missing",
      evidence: coreSolution,
      nextQuestion: "Qual transformacao concreta o escritorio entrega para esse cliente, alem do servico juridico tecnico?",
    },
    {
      key: "unique_value_proposition",
      label: "PUV",
      status: providedPuv ? "captured" : "drafted",
      evidence: draftedPuv,
      nextQuestion: "A PUV sugerida representa o escritorio ou devo ajustar o posicionamento?",
    },
    {
      key: "value_pillars",
      label: "Pilares autorais",
      status: providedPillars.length > 0 ? "captured" : "drafted",
      evidence: valuePillars.join(" | "),
      nextQuestion: "Quais sao os tres pilares autorais que sustentam essa PUV?",
    },
    {
      key: "anti_client",
      label: "Anti-cliente",
      status: antiClientSignals.length > 0 ? "captured" : "drafted",
      evidence: antiClientSignals.length > 0
        ? antiClientSignals.join(" | ")
        : "curioso focado so em preco | quem exige promessa de resultado | quem nao aceita diagnostico minimo",
      nextQuestion: "Que tipo de cliente o escritorio nao quer atender, mesmo que pague?",
    },
  ];

  const knownSignals = signals.filter((signal) => signal.status === "captured");
  const draftedSignals = signals.filter((signal) => signal.status === "drafted");
  const missingSignals = signals.filter((signal) => signal.status === "missing");
  const completeness = Math.round(((knownSignals.length + draftedSignals.length * 0.5) / signals.length) * 100);
  const confirmed = isConfirmation(input);
  const requiredCaptured = Boolean(idealClient && coreSolution);
  const status: SalesProfileSetupStatus = confirmed && requiredCaptured
    ? "validated"
    : requiredCaptured && completeness >= 70
      ? "auto_configured"
      : completeness >= 50
        ? "draft"
        : "collecting";

  const antiClient = antiClientSignals.length > 0
    ? antiClientSignals
    : ["curioso focado so em preco", "quem exige promessa de resultado", "quem nao aceita diagnostico minimo"];

  const profile: SalesProfileSetupPlan["profile"] = {
    idealClient,
    coreSolution,
    uniqueValueProposition: draftedPuv,
    valuePillars,
    positioningSummary,
    antiClientSignals: antiClient,
    status,
  };

  return {
    profile,
    knownSignals,
    missingSignals,
    draftedSignals,
    completeness,
    status,
    nextQuestion: missingSignals[0]?.nextQuestion
      || (draftedSignals.length > 0 ? draftedSignals[0].nextQuestion : "Perfil comercial pronto para ser usado no atendimento consultivo."),
    setupConversationScript: [
      "Comecar investigando cliente ideal e solucao antes de falar de automacao.",
      "Se a PUV nao existir, montar uma versao inicial com base na dor, transformacao e diferencial real.",
      "Transformar a PUV em tres pilares autorais para orientar descoberta, encantamento e fechamento.",
      "Gravar o perfil como base do atendimento MAYUS e reusar em reativacao, qualificacao, follow-up e fechamento.",
    ],
    autoConfigurationActions: [
      "Atualizar sales_consultation_profile em tenant_settings.ai_features.",
      "Disponibilizar PUV e pilares para a skill sales_consultation.",
      "Registrar artifact sales_profile_setup para auditoria no MAYUS.",
      "Registrar learning event para o Setup Doctor reconhecer que o perfil comercial foi configurado.",
    ],
    shouldPersist: completeness >= 50,
    shouldMarkValidated: confirmed && requiredCaptured,
    requiresHumanReview: status !== "validated",
    externalSideEffectsBlocked: true,
    summary: status === "collecting"
      ? "Perfil comercial ainda em coleta; MAYUS precisa investigar mais sinais com o usuario."
      : `Perfil comercial ${status === "validated" ? "validado" : "auto-configurado"} para atendimento consultivo MAYUS.`,
  };
}

export function buildSalesProfileSetupArtifactMetadata(plan: SalesProfileSetupPlan) {
  return {
    summary: plan.summary,
    profile: plan.profile,
    setup_status: plan.status,
    setup_completeness: plan.completeness,
    known_signals: plan.knownSignals,
    missing_signals: plan.missingSignals,
    drafted_signals: plan.draftedSignals,
    next_question: plan.nextQuestion,
    setup_conversation_script: plan.setupConversationScript,
    auto_configuration_actions: plan.autoConfigurationActions,
    should_persist: plan.shouldPersist,
    should_mark_validated: plan.shouldMarkValidated,
    requires_human_review: plan.requiresHumanReview,
    external_side_effects_blocked: plan.externalSideEffectsBlocked,
  };
}
