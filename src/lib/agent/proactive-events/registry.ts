export type ProactiveEventDomain = "lex" | "crm" | "finance" | "integrations" | "voice" | "experience";

export type ProactiveEventActionType = "draft_factory" | "artifact_only";

export type ProactiveEventRisk = "low" | "medium" | "high" | "critical";

export type ProactiveEventInput = {
  domain: ProactiveEventDomain;
  source: string;
  eventType?: string | null;
  text?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ProactiveEventPlaybook = {
  id: string;
  domain: ProactiveEventDomain;
  source: string;
  actionType: ProactiveEventActionType;
  title: string;
  missionGoal: string;
  recommendedPieceInput?: string | null;
  recommendedPieceLabel?: string | null;
  artifactType: string;
  riskLevel: ProactiveEventRisk;
  requiresHumanReview: boolean;
  blocksExternalActionUntilHumanOk: boolean;
  reason: string;
  checklist: string[];
};

export type ProactiveEventResolver = (input: ProactiveEventInput) => ProactiveEventPlaybook | null;

function normalizeText(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizedEventType(input: ProactiveEventInput) {
  return normalizeText(input.eventType).toUpperCase();
}

function combinedText(input: ProactiveEventInput) {
  return normalizeText(`${input.text || ""} ${input.description || ""}`);
}

function includesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

const escavadorLexResolvers: ProactiveEventResolver[] = [
  (input) => {
    const eventType = normalizedEventType(input);
    const text = combinedText(input);
    if (eventType !== "CONTESTACAO") return null;
    if (!includesAny(text, [/\bcontestac/, /\bcontestou/, /\bdefesa\b/, /\breplica\b/, /\bimpugnac/])) return null;

    return {
      id: "lex.escavador.contestacao_protocolada",
      domain: "lex",
      source: "escavador",
      actionType: "draft_factory",
      title: "Replica a contestacao",
      missionGoal: "Preparar replica a contestacao com base no Case Brain, documentos sincronizados e prazo detectado.",
      recommendedPieceInput: "Replica",
      recommendedPieceLabel: "Replica a contestacao",
      artifactType: "lex_proactive_movement_draft_request",
      riskLevel: "high",
      requiresHumanReview: true,
      blocksExternalActionUntilHumanOk: true,
      reason: "Movimentacao de contestacao detectada; preparar replica para revisao humana.",
      checklist: [
        "Conferir se a contestacao esta no acervo documental.",
        "Impugnar preliminares, fatos e documentos novos.",
        "Validar pedidos finais e prazo antes de qualquer protocolo.",
      ],
    };
  },
  (input) => {
    const eventType = normalizedEventType(input);
    const text = combinedText(input);
    if (eventType !== "SENTENCA") return null;
    if (!includesAny(text, [/\bsentenc/, /\bjulgou\b/, /\bprocedente\b/, /\bimprocedente\b/, /\bacordao\b/])) return null;

    return {
      id: "lex.escavador.sentenca_publicada",
      domain: "lex",
      source: "escavador",
      actionType: "draft_factory",
      title: "Analise recursal e minuta de apelacao",
      missionGoal: "Preparar analise recursal e uma primeira minuta de apelacao, sem presumir estrategia final do advogado.",
      recommendedPieceInput: "Apelacao",
      recommendedPieceLabel: "Apelacao",
      artifactType: "lex_proactive_movement_draft_request",
      riskLevel: "critical",
      requiresHumanReview: true,
      blocksExternalActionUntilHumanOk: true,
      reason: "Sentenca/acordao detectado; preparar analise recursal e minuta inicial para revisao humana.",
      checklist: [
        "Identificar resultado, capitulos desfavoraveis e sucumbencia.",
        "Conferir prazo recursal aplicavel.",
        "Validar interesse recursal, preparo e estrategia com advogado responsavel.",
      ],
    };
  },
  (input) => {
    const eventType = normalizedEventType(input);
    const text = combinedText(input);
    if (eventType !== "RECURSO") return null;
    if (!includesAny(text, [/\bapelac/, /\brecurso\b/, /\bagravo\b/, /\bembargos?\b/, /\bcontrarrazo/])) return null;

    const isAppeal = includesAny(text, [/\bapelac/, /\bcontrarrazo/]);
    return {
      id: isAppeal ? "lex.escavador.apelacao_interposta" : "lex.escavador.recurso_interposto",
      domain: "lex",
      source: "escavador",
      actionType: "draft_factory",
      title: isAppeal ? "Contrarrazoes de apelacao" : "Manifestacao sobre recurso",
      missionGoal: "Preparar resposta tecnica ao recurso detectado, preservando revisao humana antes de qualquer protocolo.",
      recommendedPieceInput: isAppeal ? "Contrarrazoes de Apelacao" : "Manifestacao",
      recommendedPieceLabel: isAppeal ? "Contrarrazoes de Apelacao" : "Manifestacao sobre recurso",
      artifactType: "lex_proactive_movement_draft_request",
      riskLevel: "high",
      requiresHumanReview: true,
      blocksExternalActionUntilHumanOk: true,
      reason: "Recurso detectado; preparar resposta juridica inicial para revisao humana.",
      checklist: [
        "Conferir inteiro teor do recurso.",
        "Mapear pontos impugnados e documentos citados.",
        "Validar cabimento da resposta e prazo antes de protocolo.",
      ],
    };
  },
  (input) => {
    const eventType = normalizedEventType(input);
    const text = combinedText(input);
    if (eventType !== "CITACAO") return null;
    if (!includesAny(text, [/\bcitac/, /\bcitado\b/, /\bcite-se\b/, /\bmandado\b/])) return null;

    return {
      id: "lex.escavador.citacao_recebida",
      domain: "lex",
      source: "escavador",
      actionType: "draft_factory",
      title: "Contestacao inicial do caso",
      missionGoal: "Preparar primeira contestacao defensiva a partir da citacao e dos documentos ja disponiveis.",
      recommendedPieceInput: "Contestacao",
      recommendedPieceLabel: "Contestacao",
      artifactType: "lex_proactive_movement_draft_request",
      riskLevel: "critical",
      requiresHumanReview: true,
      blocksExternalActionUntilHumanOk: true,
      reason: "Citacao detectada; preparar contestacao inicial para revisao humana.",
      checklist: [
        "Confirmar data de juntada/recebimento e prazo de resposta.",
        "Validar legitimidade, competencia e preliminares possiveis.",
        "Conferir documentos minimos do cliente antes da versao final.",
      ],
    };
  },
  (input) => {
    const eventType = normalizedEventType(input);
    const text = combinedText(input);
    if (eventType !== "AUDIENCIA") return null;
    if (!includesAny(text, [/\baudienc/, /\bpauta\b/, /\bconciliac/, /\binstrucao\b/])) return null;

    return {
      id: "lex.escavador.audiencia_designada",
      domain: "lex",
      source: "escavador",
      actionType: "artifact_only",
      title: "Roteiro de audiencia e checklist",
      missionGoal: "Preparar roteiro operacional de audiencia com documentos, pontos de atencao e pendencias para o responsavel.",
      recommendedPieceInput: null,
      recommendedPieceLabel: "Roteiro de audiencia",
      artifactType: "lex_proactive_hearing_checklist",
      riskLevel: "medium",
      requiresHumanReview: true,
      blocksExternalActionUntilHumanOk: true,
      reason: "Audiencia detectada; preparar roteiro e checklist para revisao do advogado.",
      checklist: [
        "Conferir data, horario, modalidade e link/local.",
        "Listar documentos essenciais e testemunhas.",
        "Preparar pontos de acordo, perguntas e riscos de instrucao.",
      ],
    };
  },
];

export function resolveProactiveEventPlaybook(input: ProactiveEventInput) {
  if (input.domain === "lex" && input.source === "escavador") {
    for (const resolver of escavadorLexResolvers) {
      const playbook = resolver(input);
      if (playbook) return playbook;
    }
  }

  return null;
}

export function listProactiveEventPlaybooks() {
  return [
    "lex.escavador.contestacao_protocolada",
    "lex.escavador.sentenca_publicada",
    "lex.escavador.apelacao_interposta",
    "lex.escavador.recurso_interposto",
    "lex.escavador.citacao_recebida",
    "lex.escavador.audiencia_designada",
  ];
}
