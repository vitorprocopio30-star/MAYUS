export type SalesConsultationInput = {
  crmTaskId?: string | null;
  leadName?: string | null;
  legalArea?: string | null;
  pain?: string | null;
  source?: string | null;
  score?: number | string | null;
  tags?: string[] | null;
  channel?: string | null;
  stage?: string | null;
  objective?: string | null;
  objection?: string | null;
  ticketValue?: number | string | null;
  conversationSummary?: string | null;
  conversationTurns?: Array<{ role: string; content: string }> | null;
  officeIdealClient?: string | null;
  officeSolution?: string | null;
  officeUniqueValueProposition?: string | null;
  officePillars?: string[] | null;
  officePositioningSummary?: string | null;
};

export type SalesConsultationPhase = "discovery" | "enchantment" | "closing" | "recovery";

export type SalesConsultationProfile = "misfit" | "curious" | "decided" | "empowered";

export type SalesConsultationObjectionMove = {
  objection: string;
  type: "price" | "authority" | "timing" | "fit" | "unknown";
  investigationQuestion: string;
  responseFrame: string;
  nextMove: string;
};

export type SalesConsultationChannelMove = {
  channel: "whatsapp" | "phone" | "meeting";
  objective: string;
  suggestedMessage: string;
};

export type SalesDiscoverySignal = {
  key: string;
  label: string;
  status: "captured" | "missing";
  evidence: string | null;
  nextQuestion: string;
};

export type SalesFirmProfileSignal = {
  key: "ideal_client" | "core_solution" | "unique_value_proposition" | "value_pillars" | "anti_client";
  label: string;
  status: "captured" | "missing" | "drafted";
  evidence: string | null;
  nextQuestion: string;
};

export type SalesFirmProfile = {
  idealClient: string | null;
  coreSolution: string | null;
  uniqueValueProposition: string;
  valuePillars: string[];
  antiClientSignals: string[];
  knownSignals: SalesFirmProfileSignal[];
  missingSignals: SalesFirmProfileSignal[];
  positioningCompleteness: number;
  nextPositioningQuestion: string;
  isDrafted: boolean;
};

export type SalesConsultationPlan = {
  leadName: string;
  legalArea: string | null;
  phase: SalesConsultationPhase;
  customerProfile: SalesConsultationProfile;
  channel: "whatsapp" | "phone" | "meeting";
  objective: string;
  trustPosture: string;
  discoveryQuestions: string[];
  diagnosticMap: {
    situation: string[];
    motivation: string[];
    problem: string[];
    impediment: string[];
  };
  enchantmentBridge: string[];
  emotionalReasonsToAct: string[];
  logicalProofPoints: string[];
  priceAnchors: string[];
  objectionMoves: SalesConsultationObjectionMove[];
  closingSequence: string[];
  channelMoves: SalesConsultationChannelMove[];
  firmProfile: SalesFirmProfile;
  knownSignals: SalesDiscoverySignal[];
  missingSignals: SalesDiscoverySignal[];
  discoveryCompleteness: number;
  nextDiscoveryQuestion: string;
  adaptiveInstructions: string[];
  qualityScorecard: string[];
  forbiddenMoves: string[];
  nextBestAction: string;
  requiresHumanReview: boolean;
  externalSideEffectsBlocked: boolean;
  summary: string;
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function numberOrNull(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[R$\s.]/g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeText(value?: string | null) {
  return cleanText(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase() || null;
}

function buildConversationText(input: SalesConsultationInput) {
  const turnText = (input.conversationTurns || [])
    .filter((turn) => cleanText(turn.content))
    .slice(-12)
    .map((turn) => `${turn.role}: ${cleanText(turn.content)}`)
    .join("\n");
  return [input.conversationSummary, turnText].map((item) => cleanText(item)).filter(Boolean).join("\n");
}

function pickEvidence(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1])?.slice(0, 220) || null;
    if (match?.[0]) return cleanText(match[0])?.slice(0, 220) || null;
  }
  return null;
}

function buildDiscoverySignals(input: SalesConsultationInput, areaAngle: ReturnType<typeof buildAreaAngle>) {
  const conversation = buildConversationText(input);
  const normalized = normalizeText(conversation) || "";
  const leadName = cleanText(input.leadName);
  const legalArea = cleanText(input.legalArea);
  const pain = cleanText(input.pain);
  const objection = cleanText(input.objection);
  const ticketValue = numberOrNull(input.ticketValue);

  const specs: Array<Omit<SalesDiscoverySignal, "status"> & { captured: boolean }> = [
    {
      key: "lead_identity",
      label: "Identidade do lead",
      captured: Boolean(leadName && leadName !== "Lead sem nome"),
      evidence: leadName,
      nextQuestion: "Para eu registrar certo, qual e o nome da pessoa que estamos atendendo?",
    },
    {
      key: "legal_area",
      label: "Area juridica ou segmento",
      captured: Boolean(legalArea),
      evidence: legalArea,
      nextQuestion: "Esse atendimento e de qual area ou segmento juridico?",
    },
    {
      key: "situation",
      label: "Situacao concreta",
      captured: Boolean(pain || pickEvidence(conversation, [/aconteceu\s+(.{12,160})/i, /caso\s*[:\-]?\s*(.{12,160})/i])),
      evidence: pain || pickEvidence(conversation, [/aconteceu\s+(.{12,160})/i, /caso\s*[:\-]?\s*(.{12,160})/i]),
      nextQuestion: `O que aconteceu ate aqui em relacao a ${areaAngle.situation}?`,
    },
    {
      key: "motivation",
      label: "Motivacao emocional",
      captured: /quero|preciso|medo|preocup|resolver|evitar|mudar|seguranca|tranquil/i.test(normalized),
      evidence: pickEvidence(conversation, [/(?:quero|preciso|medo|preocupado|resolver|evitar|mudar)\s+(.{8,160})/i]),
      nextQuestion: "O que voce mais quer evitar que aconteca agora?",
    },
    {
      key: "desired_outcome",
      label: "Resultado desejado",
      captured: /resultado|objetivo|mudar|conseguir|receber|resolver|ganhar|parar/i.test(normalized),
      evidence: pickEvidence(conversation, [/(?:objetivo|resultado|quero|preciso)\s*[:\-]?\s*(.{8,160})/i]),
      nextQuestion: "Se isso der certo, o que exatamente muda na sua vida ou na sua rotina?",
    },
    {
      key: "previous_attempts",
      label: "Alternativas ja tentadas",
      captured: /tentei|ja fui|procurei|outro advogado|inss|administrativo|acordo|procon|recurso/i.test(normalized),
      evidence: pickEvidence(conversation, [/(?:tentei|procurei|ja fui|falei com|entrei com)\s+(.{8,160})/i]),
      nextQuestion: "Quais alternativas voce ja tentou, e por que elas nao resolveram?",
    },
    {
      key: "decision_makers",
      label: "Decisores",
      captured: /conjuge|esposa|marido|socio|familia|decido sozinho|decido sozinha/i.test(normalized),
      evidence: pickEvidence(conversation, [/(?:conjuge|esposa|marido|socio|familia|decido sozinho|decido sozinha).{0,120}/i]),
      nextQuestion: "Quem mais participa dessa decisao ou precisa estar confortavel com o caminho?",
    },
    {
      key: "urgency",
      label: "Urgencia e prazo",
      captured: /prazo|urgente|urgencia|hoje|amanha|audiencia|liminar|bloqueio|prescri|data/i.test(normalized),
      evidence: pickEvidence(conversation, [/(?:prazo|urgente|urgencia|audiencia|liminar|bloqueio|prescri).{0,140}/i]),
      nextQuestion: "Existe algum prazo, audiencia, bloqueio ou risco imediato que mude a prioridade?",
    },
    {
      key: "budget_or_anchor",
      label: "Capacidade de investimento ou ancora",
      captured: ticketValue !== null || /caro|valor|preco|orcamento|investimento|parcel|entrada|condicao/i.test(normalized),
      evidence: ticketValue !== null ? `R$ ${ticketValue.toLocaleString("pt-BR")}` : pickEvidence(conversation, [/(?:caro|valor|preco|orcamento|investimento|parcel|entrada|condicao).{0,140}/i]),
      nextQuestion: "Quando falamos de investimento, sua maior duvida e valor, forma de pagamento, seguranca ou prioridade?",
    },
    {
      key: "objection",
      label: "Objecao dominante",
      captured: Boolean(objection) || /vou pensar|caro|preciso falar|sem tempo|depois|nao sei|concorrente/i.test(normalized),
      evidence: objection || pickEvidence(conversation, [/(?:vou pensar|caro|preciso falar|sem tempo|depois|nao sei|concorrente).{0,140}/i]),
      nextQuestion: "Se tivesse que escolher um unico impeditivo hoje, qual seria: valor, seguranca, tempo, decisor ou falta de clareza?",
    },
  ];

  const signals = specs.map(({ captured, ...signal }) => ({
    ...signal,
    status: captured ? "captured" as const : "missing" as const,
    evidence: captured ? signal.evidence || "Sinal presente no bate-papo." : null,
  }));

  return {
    knownSignals: signals.filter((signal) => signal.status === "captured"),
    missingSignals: signals.filter((signal) => signal.status === "missing"),
    completeness: Math.round((signals.filter((signal) => signal.status === "captured").length / signals.length) * 100),
  };
}

function splitPillars(value?: string[] | null) {
  return (value || [])
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
}

function inferTextFromPositioning(input: SalesConsultationInput, patterns: RegExp[]) {
  const text = [input.officePositioningSummary, buildConversationText(input)]
    .map((item) => cleanText(item))
    .filter(Boolean)
    .join("\n");
  return pickEvidence(text, patterns);
}

function buildDraftPuv(params: {
  legalArea: string | null;
  idealClient: string | null;
  coreSolution: string | null;
  areaAngle: ReturnType<typeof buildAreaAngle>;
}) {
  const client = params.idealClient || "clientes que precisam decidir com seguranca";
  const solution = params.coreSolution || params.areaAngle.transformation;
  const area = params.legalArea ? ` em ${params.legalArea}` : "";
  return `Ajudamos ${client}${area} a sair da incerteza e tomar a proxima decisao com ${solution}, usando diagnostico juridico-comercial, plano de provas e acompanhamento humano antes de qualquer promessa.`;
}

function buildDefaultPillars(areaAngle: ReturnType<typeof buildAreaAngle>) {
  return [
    "Diagnostico Sem Venda Forcada",
    "Plano de Provas e Risco",
    `Decisao Guiada por ${areaAngle.transformation}`,
  ];
}

function buildFirmProfile(input: SalesConsultationInput, areaAngle: ReturnType<typeof buildAreaAngle>): SalesFirmProfile {
  const idealClient = cleanText(input.officeIdealClient) || inferTextFromPositioning(input, [
    /cliente\s+ideal\s*[:\-]?\s*(.{12,220})/i,
    /atendemos\s+(.{12,220})/i,
    /nosso\s+publico\s*[:\-]?\s*(.{12,220})/i,
  ]);
  const coreSolution = cleanText(input.officeSolution) || inferTextFromPositioning(input, [
    /solu[cç][aã]o\s*[:\-]?\s*(.{12,220})/i,
    /resolvemos\s+(.{12,220})/i,
    /entregamos\s+(.{12,220})/i,
  ]);
  const providedPuv = cleanText(input.officeUniqueValueProposition) || inferTextFromPositioning(input, [
    /puv\s*[:\-]?\s*(.{12,260})/i,
    /proposta\s+unica\s+de\s+valor\s*[:\-]?\s*(.{12,260})/i,
    /diferencial\s*[:\-]?\s*(.{12,260})/i,
  ]);
  const providedPillars = splitPillars(input.officePillars);
  const draftPuv = buildDraftPuv({ legalArea: cleanText(input.legalArea), idealClient, coreSolution, areaAngle });
  const valuePillars = providedPillars.length > 0 ? providedPillars : buildDefaultPillars(areaAngle);
  const antiClient = [
    "lead que quer apenas preco sem contexto",
    "lead que exige promessa de resultado juridico",
    "lead que nao aceita diagnostico ou documentacao minima",
  ];

  const signals: SalesFirmProfileSignal[] = [
    {
      key: "ideal_client",
      label: "Cliente ideal do escritorio",
      status: idealClient ? "captured" : "missing",
      evidence: idealClient,
      nextQuestion: "Qual e o cliente ideal do escritorio? Descreva problema, perfil, urgencia e capacidade de decisao.",
    },
    {
      key: "core_solution",
      label: "Solucao central para o cliente",
      status: coreSolution ? "captured" : "missing",
      evidence: coreSolution,
      nextQuestion: "Qual transformacao concreta o escritorio entrega para esse cliente, alem do servico juridico em si?",
    },
    {
      key: "unique_value_proposition",
      label: "PUV",
      status: providedPuv ? "captured" : "drafted",
      evidence: providedPuv || draftPuv,
      nextQuestion: "Existe uma PUV autoral do escritorio? Se nao existir, quer validar a PUV sugerida pelo MAYUS?",
    },
    {
      key: "value_pillars",
      label: "Pilares autorais",
      status: providedPillars.length > 0 ? "captured" : "drafted",
      evidence: valuePillars.join(" | "),
      nextQuestion: "Quais sao os 3 pilares incopiaveis que sustentam essa promessa?",
    },
    {
      key: "anti_client",
      label: "Anti-cliente",
      status: "drafted",
      evidence: antiClient.join(" | "),
      nextQuestion: "Que tipo de cliente o escritorio nao quer atrair, mesmo que pague?",
    },
  ];
  const captured = signals.filter((signal) => signal.status === "captured").length;
  const drafted = signals.filter((signal) => signal.status === "drafted").length;
  const missing = signals.filter((signal) => signal.status === "missing");

  return {
    idealClient,
    coreSolution,
    uniqueValueProposition: providedPuv || draftPuv,
    valuePillars,
    antiClientSignals: antiClient,
    knownSignals: signals.filter((signal) => signal.status !== "missing"),
    missingSignals: missing,
    positioningCompleteness: Math.round(((captured + drafted * 0.5) / signals.length) * 100),
    nextPositioningQuestion: missing[0]?.nextQuestion || "Perfil comercial suficiente. Validar se a PUV sugerida representa o escritorio antes de escalar atendimento.",
    isDrafted: !providedPuv || providedPillars.length === 0,
  };
}

function normalizeChannel(channel?: string | null): SalesConsultationPlan["channel"] {
  const normalized = normalizeText(channel);
  if (normalized?.includes("lig") || normalized?.includes("phone") || normalized?.includes("telefone")) return "phone";
  if (normalized?.includes("meet") || normalized?.includes("call") || normalized?.includes("reun")) return "meeting";
  return "whatsapp";
}

function inferPhase(input: SalesConsultationInput): SalesConsultationPhase {
  const stage = normalizeText(input.stage);
  const objection = normalizeText(input.objection);
  const summary = normalizeText(input.conversationSummary);

  if (stage?.includes("descob")) {
    return "discovery";
  }

  if (stage?.includes("fecha")) {
    return "closing";
  }

  if (stage?.includes("encant") || stage?.includes("apresent") || summary?.includes("proposta")) {
    return "enchantment";
  }

  if (stage?.includes("reativ") || stage?.includes("recuper") || summary?.includes("sem resposta")) {
    return "recovery";
  }

  if (objection?.includes("caro") || objection?.includes("preco") || objection?.includes("valor")) {
    return "closing";
  }

  return "discovery";
}

function inferProfile(input: SalesConsultationInput): SalesConsultationProfile {
  const score = numberOrNull(input.score);
  const objection = normalizeText(input.objection);
  const summary = normalizeText(input.conversationSummary);

  if (summary?.includes("so preco") || objection?.includes("so preco") || objection?.includes("curioso")) return "curious";
  if (summary?.includes("concorrente") || summary?.includes("comparando") || objection?.includes("outro escritorio")) return "empowered";
  if (score !== null && score >= 75) return "decided";
  if (score !== null && score < 40) return "misfit";
  return "empowered";
}

function buildAreaAngle(legalArea: string | null) {
  const area = normalizeText(legalArea);

  if (area?.includes("previd")) {
    return {
      situation: "beneficio, CNIS, indeferimento, prazos e historico administrativo",
      transformation: "clareza sobre chance, documentos e caminho para destravar o beneficio",
      proof: "metodo de analise documental, revisao de CNIS e plano de prova antes de promessa de resultado",
      risk: "prazo, perda de renda, documentos incompletos ou tentativa administrativa mal conduzida",
    };
  }

  if (area?.includes("trabalh")) {
    return {
      situation: "vinculo, verbas, rescisao, testemunhas, mensagens e prazo prescricional",
      transformation: "seguranca para decidir sem medo de retalhacao ou prova fraca",
      proof: "diagnostico do vinculo, checklist de provas e leitura de risco antes da proposta",
      risk: "prescricao, perda de provas, acordo ruim ou silencio por medo",
    };
  }

  if (area?.includes("famil")) {
    return {
      situation: "urgencia familiar, filhos, alimentos, guarda, partilha e acordos anteriores",
      transformation: "decisao mais segura em um tema sensivel, com menos conflito desnecessario",
      proof: "triagem cuidadosa, mapa de documentos e conducao humana antes de qualquer medida",
      risk: "conflito escalado, decisao precipitada ou falta de documentos sobre renda e rotina",
    };
  }

  return {
    situation: "contexto, prazo, pessoas envolvidas, documentos e tentativa anterior de solucao",
    transformation: "clareza sobre risco, caminho e proximo passo juridico-comercial",
    proof: "diagnostico inicial, checklist documental e direcionamento responsavel antes da proposta",
    risk: "prazo perdido, decisao por impulso ou investimento sem fit com a tese do escritorio",
  };
}

function buildObjectionMoves(objection: string | null): SalesConsultationObjectionMove[] {
  const normalized = normalizeText(objection);
  const moves: SalesConsultationObjectionMove[] = [
    {
      objection: objection || "vou pensar",
      type: normalized?.includes("caro") || normalized?.includes("preco") || normalized?.includes("valor") ? "price" : "unknown",
      investigationQuestion: "Quando voce diz isso, o que exatamente vem a sua mente: valor, seguranca, prioridade ou falta de clareza sobre o proximo passo?",
      responseFrame: "Manter tom calmo, acolher a preocupacao e voltar ao diagnostico antes de defender preco ou proposta.",
      nextMove: "Isolar a variavel real e decidir se o caminho e ajustar percepcao de valor, timing ou fit.",
    },
  ];

  if (normalized?.includes("conjuge") || normalized?.includes("socio") || normalized?.includes("familia")) {
    moves.push({
      objection: objection || "preciso falar com outra pessoa",
      type: "authority",
      investigationQuestion: "Essa pessoa participa da decisao desde o inicio ou voce quer apenas validar seguranca antes de avancar?",
      responseFrame: "Trazer a decisao para criterios objetivos e preparar um resumo curto para o decisor ausente.",
      nextMove: "Criar roteiro de repasse e marcar retorno supervisionado com decisor, sem pressionar fechamento invisivel.",
    });
  }

  if (normalized?.includes("depois") || normalized?.includes("tempo") || normalized?.includes("momento")) {
    moves.push({
      objection: objection || "nao e o momento",
      type: "timing",
      investigationQuestion: "O que precisa acontecer para esse tema virar prioridade, e qual o custo de esperar mais?",
      responseFrame: "Ancorar a decisao no risco de adiamento, sem fabricar urgencia ou prazo falso.",
      nextMove: "Registrar data de retorno e condicao objetiva para retomada.",
    });
  }

  return moves;
}

function buildDiscoveryQuestions(params: {
  leadName: string;
  legalArea: string | null;
  areaAngle: ReturnType<typeof buildAreaAngle>;
}) {
  return [
    "Antes de eu te dizer qualquer caminho, quero entender se faz sentido para voce e para o escritorio. Se nao fizer, eu te aponto uma alternativa mais honesta.",
    `O que aconteceu ate aqui em relacao a ${params.areaAngle.situation}?`,
    "O que voce mais quer evitar que aconteca agora?",
    "O que exatamente voce espera mudar se esse problema for resolvido?",
    "Quais alternativas voce ja tentou, e por que elas nao resolveram?",
    "Quem mais participa dessa decisao ou precisa estar confortavel com o caminho?",
    "Se no final fizer sentido, voce prefere decidir hoje ou combinar um criterio objetivo para decidir depois?",
  ];
}

function buildChannelMoves(params: {
  leadName: string;
  channel: SalesConsultationPlan["channel"];
  phase: SalesConsultationPhase;
  legalArea: string | null;
}) {
  const firstName = params.leadName.split(/\s+/)[0] || params.leadName;
  const areaLabel = params.legalArea ? ` sobre ${params.legalArea}` : "";

  const whatsappMessage = params.phase === "discovery"
    ? `Ola, ${firstName}. Antes de te apresentar qualquer caminho${areaLabel}, preciso entender se isso realmente faz sentido para voce. Posso te fazer 3 perguntas rapidas?`
    : `Ola, ${firstName}. Revendo seu caso${areaLabel}, acendeu um ponto que eu prefiro validar por conversa para nao te passar uma orientacao rasa. Podemos falar por 10 minutos?`;

  return [
    {
      channel: "whatsapp" as const,
      objective: "Abrir conversa sem pressao e pedir permissao para diagnosticar.",
      suggestedMessage: whatsappMessage,
    },
    {
      channel: "phone" as const,
      objective: "Transferir energia e conduzir descoberta quando ha alta intencao ou objecao mal explicada.",
      suggestedMessage: "Ligacao recomendada apenas apos revisao humana do historico e consentimento do lead.",
    },
    {
      channel: "meeting" as const,
      objective: "Fazer encantamento e fechamento quando a descoberta ja revelou fit e decisores.",
      suggestedMessage: "Usar a reuniao para conectar diagnostico, valor percebido, risco de inacao e decisao objetiva.",
    },
  ];
}

export function buildSalesConsultationPlan(input: SalesConsultationInput): SalesConsultationPlan {
  const leadName = cleanText(input.leadName) || "Lead sem nome";
  const legalArea = cleanText(input.legalArea);
  const pain = cleanText(input.pain);
  const objective = cleanText(input.objective) || "conduzir atendimento consultivo de alta performance";
  const objection = cleanText(input.objection);
  const channel = normalizeChannel(input.channel);
  const phase = inferPhase(input);
  const customerProfile = inferProfile(input);
  const ticketValue = numberOrNull(input.ticketValue);
  const areaAngle = buildAreaAngle(legalArea);

  const discoveryQuestions = buildDiscoveryQuestions({ leadName, legalArea, areaAngle });
  const discoverySignals = buildDiscoverySignals({ ...input, leadName, legalArea, pain, objection }, areaAngle);
  const firmProfile = buildFirmProfile(input, areaAngle);
  const objectionMoves = buildObjectionMoves(objection);
  const channelMoves = buildChannelMoves({ leadName, channel, phase, legalArea });
  const valueLabel = ticketValue !== null
    ? `Investimento informado: R$ ${ticketValue.toLocaleString("pt-BR")}.`
    : "Investimento ainda nao informado.";

  return {
    leadName,
    legalArea,
    phase,
    customerProfile,
    channel,
    objective,
    trustPosture: "Comecar com recuo estrategico: diagnosticar antes de propor, ouvir mais do que falar e deixar claro que nem todo lead deve comprar.",
    discoveryQuestions,
    diagnosticMap: {
      situation: [
        `Mapear ${areaAngle.situation}.`,
        "Confirmar origem do lead, expectativa e nivel de consciencia.",
      ],
      motivation: [
        `Explorar a mudanca desejada: ${areaAngle.transformation}.`,
        "Fazer o lead verbalizar por que resolver agora importa.",
      ],
      problem: [
        pain ? `Aprofundar dor declarada: ${pain}.` : "Sair de respostas genericas e descobrir a dor concreta.",
        "Perguntar o que ja foi tentado e por que nao funcionou.",
      ],
      impediment: [
        "Descobrir decisores, limite financeiro, urgencia real e medo dominante antes da proposta.",
        "Registrar objecao potencial antes do fechamento para nao ser surpreendido no fim.",
      ],
    },
    enchantmentBridge: [
      `Conectar a oferta ao diagnostico: ${areaAngle.transformation}.`,
      `Usar a PUV do escritorio: ${firmProfile.uniqueValueProposition}`,
      `Apresentar no maximo tres pilares autorais: ${firmProfile.valuePillars.join(", ")}.`,
      "Usar prova e autoridade sem prometer resultado juridico.",
      "Reduzir informacao tecnica ao essencial e traduzir o impacto na vida do cliente.",
    ],
    emotionalReasonsToAct: [
      "Reduzir incerteza e recuperar sensacao de controle.",
      "Evitar o custo emocional e pratico de deixar o problema parado.",
      `Visualizar a transformacao esperada: ${areaAngle.transformation}.`,
    ],
    logicalProofPoints: [
      areaAngle.proof,
      "Checklist documental e criterio claro para dizer sim, nao ou agora nao.",
      "Registro do atendimento no CRM para continuidade sem depender de memoria humana.",
    ],
    priceAnchors: [
      valueLabel,
      `Ancorar contra o custo de inacao: ${areaAngle.risk}.`,
      "Comparar investimento com alternativas mais caras, atrasadas ou improvisadas apenas quando forem reais.",
    ],
    objectionMoves,
    closingSequence: [
      "Perguntar o que mais fez sentido e fazer o lead verbalizar valor percebido.",
      "Isolar a variavel decisiva: financeiro, seguranca, decisor, tempo ou fit.",
      "Se houver fit, propor decisao objetiva e proximo passo concreto.",
      "Se nao houver fit, encerrar com orientacao honesta e registrar motivo no CRM.",
    ],
    channelMoves,
    firmProfile,
    knownSignals: discoverySignals.knownSignals,
    missingSignals: discoverySignals.missingSignals,
    discoveryCompleteness: discoverySignals.completeness,
    nextDiscoveryQuestion: discoverySignals.missingSignals[0]?.nextQuestion || "A descoberta esta madura. Agora valide o que mais fez sentido antes de apresentar proposta.",
    adaptiveInstructions: [
      discoverySignals.completeness < 50
        ? "Continuar em descoberta: fazer uma pergunta por vez e nao apresentar proposta ainda."
        : "Usar os sinais capturados para personalizar a ponte de encantamento.",
      discoverySignals.missingSignals.length > 0
        ? `Priorizar o proximo sinal faltante: ${discoverySignals.missingSignals[0].label}.`
        : "Avancar para verificacao de valor percebido e isolamento da variavel decisiva.",
      firmProfile.missingSignals.length > 0
        ? `Antes de escalar vendas, perguntar ao usuario MAYUS: ${firmProfile.nextPositioningQuestion}`
        : "Aplicar PUV e pilares do escritorio no atendimento do lead.",
      "Gravar cada resposta nova como artifact/learning event antes de sugerir contato externo.",
    ],
    qualityScorecard: [
      "Descoberta antes de oferta.",
      "Lead falou mais do que o atendente.",
      "Dor, motivacao, decisor e impedimento ficaram claros.",
      "Proposta foi personalizada ao que o lead disse.",
      "Fechamento pediu decisao sem pressao e sem manipular informacao.",
    ],
    forbiddenMoves: [
      "Prometer resultado juridico.",
      "Inventar escassez, prazo, depoimento ou prova social.",
      "Pressionar lead vulneravel ou juridicamente urgente sem advogado.",
      "Enviar WhatsApp, e-mail, contrato, cobranca ou ligacao automatica sem acao humana.",
      "Comecar defendendo preco antes de entender a objecao real.",
    ],
    nextBestAction: firmProfile.missingSignals.length > 0
      ? `Usuario MAYUS deve responder: "${firmProfile.nextPositioningQuestion}"`
      : phase === "discovery"
        ? `Atendente deve perguntar: "${discoverySignals.missingSignals[0]?.nextQuestion || "O que mais fez sentido ate aqui?"}"`
      : "Atendente deve revisar o diagnostico, adaptar encantamento/fechamento e registrar resposta ou motivo de perda no CRM.",
    requiresHumanReview: true,
    externalSideEffectsBlocked: true,
    summary: `Plano de consultoria comercial DEF criado para ${leadName}${legalArea ? ` em ${legalArea}` : ""}.`,
  };
}

export function buildSalesConsultationArtifactMetadata(params: {
  crmTaskId?: string | null;
  plan: SalesConsultationPlan;
}) {
  return {
    summary: params.plan.summary,
    crm_task_id: params.crmTaskId || null,
    lead_name: params.plan.leadName,
    legal_area: params.plan.legalArea,
    consultation_phase: params.plan.phase,
    customer_profile: params.plan.customerProfile,
    channel: params.plan.channel,
    objective: params.plan.objective,
    trust_posture: params.plan.trustPosture,
    discovery_questions: params.plan.discoveryQuestions,
    diagnostic_map: params.plan.diagnosticMap,
    enchantment_bridge: params.plan.enchantmentBridge,
    emotional_reasons_to_act: params.plan.emotionalReasonsToAct,
    logical_proof_points: params.plan.logicalProofPoints,
    price_anchors: params.plan.priceAnchors,
    objection_moves: params.plan.objectionMoves,
    closing_sequence: params.plan.closingSequence,
    channel_moves: params.plan.channelMoves,
    firm_profile: params.plan.firmProfile,
    firm_positioning_completeness: params.plan.firmProfile.positioningCompleteness,
    firm_profile_missing_signals: params.plan.firmProfile.missingSignals,
    firm_profile_drafted: params.plan.firmProfile.isDrafted,
    known_signals: params.plan.knownSignals,
    missing_signals: params.plan.missingSignals,
    discovery_completeness: params.plan.discoveryCompleteness,
    next_discovery_question: params.plan.nextDiscoveryQuestion,
    adaptive_instructions: params.plan.adaptiveInstructions,
    quality_scorecard: params.plan.qualityScorecard,
    forbidden_moves: params.plan.forbiddenMoves,
    next_best_action: params.plan.nextBestAction,
    requires_human_review: params.plan.requiresHumanReview,
    external_side_effects_blocked: params.plan.externalSideEffectsBlocked,
    requires_human_action: true,
    human_actions: [params.plan.nextBestAction],
  };
}
