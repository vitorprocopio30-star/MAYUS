export type OfficeSetupConversationInput = {
  officeName?: string | null;
  practiceAreas?: string[] | null;
  communicationTone?: string | null;
  triageRules?: string[] | null;
  humanHandoffRules?: string[] | null;
  requiredDocumentsByCase?: string[] | null;
  forbiddenClaims?: string[] | null;
  pricingPolicy?: string | null;
  responseSla?: string | null;
  departments?: string[] | null;
  permissionPolicy?: string | null;
  calendarPolicy?: string | null;
  financePolicy?: string | null;
  playbookNotes?: string | null;
  conversationSummary?: string | null;
  conversationTurns?: Array<{ role: string; content: string }> | null;
  existingProfile?: OfficeKnowledgeProfile | null;
  confirmationText?: string | null;
};

export type OfficeSetupStatus = "collecting" | "draft" | "validated";

export type OfficePracticeAreaPlaybook = {
  area: string;
  intake_questions: string[];
  required_documents: string[];
  handoff_triggers: string[];
  default_pipeline: string[];
  document_structure: string[];
  owner_team: string | null;
  validation_status: "needs_area_review" | "validated";
  next_review_question: string;
};

export type OfficeKnowledgeProfile = {
  status?: string | null;
  office_name: string | null;
  practice_areas: string[];
  triage_rules: string[];
  human_handoff_rules: string[];
  communication_tone: string | null;
  required_documents_by_case: string[];
  forbidden_claims: string[];
  pricing_policy: string | null;
  response_sla: string | null;
  departments: string[];
  permission_policy: string | null;
  calendar_policy: string | null;
  finance_policy: string | null;
  playbook_notes: string | null;
  practice_area_playbooks: OfficePracticeAreaPlaybook[];
};

export type OfficeSetupSignal = {
  key:
    | "office_name"
    | "practice_areas"
    | "communication_tone"
    | "triage_rules"
    | "human_handoff_rules"
    | "required_documents_by_case"
    | "forbidden_claims"
    | "pricing_policy"
    | "response_sla"
    | "departments"
    | "permission_policy"
    | "calendar_policy"
    | "finance_policy"
    | "playbook_notes";
  label: string;
  status: "captured" | "missing";
  evidence: string | string[] | null;
  nextQuestion: string;
};

export type OfficeSetupConversationPlan = {
  profile: OfficeKnowledgeProfile & { status: OfficeSetupStatus };
  knownSignals: OfficeSetupSignal[];
  missingSignals: OfficeSetupSignal[];
  completeness: number;
  status: OfficeSetupStatus;
  nextQuestion: string;
  setupConversationScript: string[];
  autoConfigurationActions: string[];
  shouldPersist: boolean;
  shouldMarkValidated: boolean;
  requiresHumanReview: boolean;
  externalSideEffectsBlocked: boolean;
  summary: string;
};

const SECRET_TEXT_PATTERN = /\b(?:sk-[a-z0-9_-]+|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|(?:api[_\s-]?key|token|secret|senha|password)\s*[:=]\s*\S+)/gi;

function cleanText(value?: string | null) {
  const text = String(value || "")
    .replace(SECRET_TEXT_PATTERN, "[redacted]")
    .replace(/\s+/g, " ")
    .trim();

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
    .slice(0, 8);
}

function buildConversationText(input: OfficeSetupConversationInput) {
  const turns = (input.conversationTurns || [])
    .filter((turn) => cleanText(turn.content))
    .slice(-18)
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
    if (match?.[1]) return cleanText(match[1])?.slice(0, 320) || null;
  }
  return null;
}

function pickList(inputValues: string[] | null | undefined, existingValues: string[] | null | undefined, text: string, patterns: RegExp[]) {
  const provided = splitList(inputValues);
  if (provided.length > 0) return provided;

  const existing = splitList(existingValues);
  if (existing.length > 0) return existing;

  const evidence = pickEvidence(text, patterns);
  return splitList(evidence ? [evidence] : []);
}

function uniqueList(values: Array<string | null | undefined>, limit = 8) {
  const seen = new Set<string>();
  const items: string[] = [];

  for (const value of values) {
    const item = cleanText(value);
    if (!item) continue;
    const key = normalizeText(item);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= limit) break;
  }

  return items;
}

function normalizeAreaKey(area: string | null | undefined) {
  return normalizeText(area).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function buildDefaultPipeline(area: string) {
  const normalized = normalizeText(area);
  const base = [
    "Triagem segura",
    "Coleta documental",
    "Analise juridica humana",
    "Proposta/contrato supervisionado",
    "Abertura do caso",
    "Acompanhamento e status",
  ];

  if (/previdenci|inss|beneficio/.test(normalized)) {
    return [
      "Triagem do beneficio e historico INSS",
      "Coleta de CNIS, carta de indeferimento e documentos pessoais",
      "Analise juridica humana",
      "Proposta/contrato supervisionado",
      "Abertura do caso previdenciario",
      "Acompanhamento de exigencias, prazos e status",
    ];
  }

  if (/banc|consignad|rmc|rcc|credcesta|cartao|emprestimo/.test(normalized)) {
    return [
      "Triagem do desconto/contrato",
      "Coleta de contracheque, extratos e contrato",
      "Analise juridica humana",
      "Proposta/contrato supervisionado",
      "Abertura do caso bancario",
      "Acompanhamento de documentos, prazos e acordo",
    ];
  }

  if (/famil|alimento|divorcio|guarda/.test(normalized)) {
    return [
      "Triagem familiar sensivel",
      "Coleta de documentos pessoais, certidoes e comprovantes",
      "Analise juridica humana",
      "Proposta/contrato supervisionado",
      "Abertura do caso de familia",
      "Acompanhamento de prazos, audiencia e acordos",
    ];
  }

  if (/trabalh|emprego|rescis|verba/.test(normalized)) {
    return [
      "Triagem trabalhista",
      "Coleta de CTPS, contrato, holerites e rescisao",
      "Analise juridica humana",
      "Proposta/contrato supervisionado",
      "Abertura do caso trabalhista",
      "Acompanhamento de audiencia, acordo e prazos",
    ];
  }

  return base;
}

function buildDefaultDocuments(area: string, globalDocuments: string[]) {
  const normalized = normalizeText(area);
  const shared = ["Documento pessoal", "Comprovante de endereco", "Contrato de honorarios/procuracao", "Resumo cronologico do caso"];

  if (/previdenci|inss|beneficio/.test(normalized)) {
    return uniqueList([...globalDocuments, "CNIS", "Carta de indeferimento ou decisao do INSS", "Documentos medicos quando houver", ...shared], 8);
  }

  if (/banc|consignad|rmc|rcc|credcesta|cartao|emprestimo/.test(normalized)) {
    return uniqueList([...globalDocuments, "Contrato ou proposta bancaria", "Extratos", "Contracheque ou comprovante do desconto", "Comprovante de valores liberados", ...shared], 8);
  }

  if (/famil|alimento|divorcio|guarda/.test(normalized)) {
    return uniqueList([...globalDocuments, "Certidao de casamento ou nascimento", "Comprovantes de renda", "Comprovantes de despesas", "Conversas ou acordos relevantes", ...shared], 8);
  }

  if (/trabalh|emprego|rescis|verba/.test(normalized)) {
    return uniqueList([...globalDocuments, "CTPS", "Contrato de trabalho", "Holerites", "TRCT/rescisao", "Controles de ponto quando houver", ...shared], 8);
  }

  return uniqueList([...globalDocuments, ...shared], 8);
}

function buildDefaultIntakeQuestions(area: string) {
  const normalized = normalizeText(area);

  if (/previdenci|inss|beneficio/.test(normalized)) {
    return [
      "Qual beneficio ou pedido do INSS esta envolvido?",
      "Ja existe decisao, indeferimento, exigencia ou processo em andamento?",
      "Voce tem CNIS, carta do INSS ou documentos medicos?",
    ];
  }

  if (/banc|consignad|rmc|rcc|credcesta|cartao|emprestimo/.test(normalized)) {
    return [
      "Qual desconto, contrato ou produto aparece no documento?",
      "Quando o desconto ou cobranca comecou?",
      "Voce recebeu valor, assinou contrato ou autorizou a operacao?",
    ];
  }

  if (/famil|alimento|divorcio|guarda/.test(normalized)) {
    return [
      "Qual e o vinculo familiar e qual urgencia existe hoje?",
      "Ha acordo, processo, medida protetiva ou audiencia marcada?",
      "Quais documentos e comprovantes voce ja tem?",
    ];
  }

  if (/trabalh|emprego|rescis|verba/.test(normalized)) {
    return [
      "Qual era a funcao, periodo de trabalho e motivo da saida?",
      "Ha verbas, horas extras, acidente, assedio ou rescisao pendente?",
      "Voce tem CTPS, holerites, contrato ou conversas relevantes?",
    ];
  }

  return [
    "Qual e o problema principal e o objetivo do atendimento?",
    "Existe prazo, audiencia, notificacao ou urgencia?",
    "Quais documentos comprovam o caso?",
  ];
}

function buildDocumentStructure(area: string) {
  const areaKey = normalizeAreaKey(area) || "area";

  return [
    `00-${areaKey}-intake-e-resumo`,
    `01-${areaKey}-documentos-cliente`,
    `02-${areaKey}-provas-e-contratos`,
    `03-${areaKey}-processo-prazos-e-movimentacoes`,
    `04-${areaKey}-minutas-e-pecas`,
    `05-${areaKey}-comunicacao-aprovacoes-e-financeiro`,
  ];
}

export function buildOfficePracticeAreaPlaybooks(params: {
  practiceAreas: string[];
  requiredDocumentsByCase?: string[] | null;
  triageRules?: string[] | null;
  humanHandoffRules?: string[] | null;
  departments?: string[] | null;
  existingPlaybooks?: OfficePracticeAreaPlaybook[] | null;
}) {
  const areas = uniqueList(params.practiceAreas, 8);
  const existingByArea = new Map(
    (params.existingPlaybooks || [])
      .filter((item) => cleanText(item.area))
      .map((item) => [normalizeAreaKey(item.area), item]),
  );
  const ownerTeam = params.departments?.find((department) => /jurid/i.test(department))
    || params.departments?.[0]
    || null;

  return areas.map((area) => {
    const existing = existingByArea.get(normalizeAreaKey(area));
    if (existing?.validation_status === "validated") return existing;

    const intakeQuestions = existing?.intake_questions?.length
      ? existing.intake_questions
      : buildDefaultIntakeQuestions(area);
    const requiredDocuments = existing?.required_documents?.length
      ? existing.required_documents
      : buildDefaultDocuments(area, params.requiredDocumentsByCase || []);
    const handoffTriggers = existing?.handoff_triggers?.length
      ? existing.handoff_triggers
      : uniqueList([
        ...(params.humanHandoffRules || []),
        "Prazo critico, audiencia, liminar, decisao juridica, contrato, cobranca ou promessa de resultado exigem humano.",
      ], 8);

    return {
      area,
      intake_questions: intakeQuestions,
      required_documents: requiredDocuments,
      handoff_triggers: handoffTriggers,
      default_pipeline: existing?.default_pipeline?.length ? existing.default_pipeline : buildDefaultPipeline(area),
      document_structure: existing?.document_structure?.length ? existing.document_structure : buildDocumentStructure(area),
      owner_team: existing?.owner_team || ownerTeam,
      validation_status: "needs_area_review" as const,
      next_review_question: `O pipeline, documentos e perguntas de ${area} representam como o escritorio trabalha hoje?`,
    };
  });
}

function isConfirmation(input: OfficeSetupConversationInput) {
  const text = normalizeText([
    input.confirmationText,
    input.conversationSummary,
    ...(input.conversationTurns || []).slice(-4).map((turn) => turn.content),
  ].join("\n"));

  return /\b(confirmo|confirmar|validado|valida|pode\s+salvar|salva|salvar|pode\s+gravar|grava|aprovado|aprove|fechado|esta\s+certo|ta\s+certo|tudo\s+certo)\b/i.test(text);
}

function makeSignal(params: {
  key: OfficeSetupSignal["key"];
  label: string;
  evidence: string | string[] | null;
  nextQuestion: string;
}): OfficeSetupSignal {
  const hasEvidence = Array.isArray(params.evidence)
    ? params.evidence.length > 0
    : Boolean(params.evidence);

  return {
    ...params,
    status: hasEvidence ? "captured" : "missing",
  };
}

export function buildOfficeSetupConversationPlan(input: OfficeSetupConversationInput): OfficeSetupConversationPlan {
  const text = buildConversationText(input);
  const existing = input.existingProfile || null;

  const officeName = cleanText(input.officeName)
    || cleanText(existing?.office_name)
    || pickEvidence(text, [
      /(?:nome\s+do\s+escritorio|escritorio|banca)\s*[:\-]?\s*(.{3,120})/i,
    ]);

  const practiceAreas = pickList(input.practiceAreas, existing?.practice_areas, text, [
    /(?:areas?\s+(?:juridicas?|de\s+atuacao)|atuamos\s+em|atuacao)\s*[:\-]?\s*(.{4,260})/i,
  ]);

  const communicationTone = cleanText(input.communicationTone)
    || cleanText(existing?.communication_tone)
    || pickEvidence(text, [
      /(?:tom|voz|linguagem|comunicacao)\s*[:\-]?\s*(.{4,220})/i,
    ]);

  const triageRules = pickList(input.triageRules, existing?.triage_rules, text, [
    /(?:triagem|qualificacao|perguntas?\s+iniciais?)\s*[:\-]?\s*(.{8,320})/i,
  ]);

  const humanHandoffRules = pickList(input.humanHandoffRules, existing?.human_handoff_rules, text, [
    /(?:handoff|escalar|passar\s+para\s+humano|advogado\s+humano)\s*[:\-]?\s*(.{8,320})/i,
  ]);

  const requiredDocumentsByCase = pickList(input.requiredDocumentsByCase, existing?.required_documents_by_case, text, [
    /(?:documentos?\s+(?:necessarios|obrigatorios|por\s+caso)|docs?)\s*[:\-]?\s*(.{6,320})/i,
  ]);

  const forbiddenClaims = pickList(input.forbiddenClaims, existing?.forbidden_claims, text, [
    /(?:promessas?\s+proibidas?|claims?\s+proibidos?|nunca\s+dizer)\s*[:\-]?\s*(.{6,320})/i,
  ]);

  const pricingPolicy = cleanText(input.pricingPolicy)
    || cleanText(existing?.pricing_policy)
    || pickEvidence(text, [
      /(?:politica\s+de\s+(?:preco|honorarios|cobranca)|preco|honorarios)\s*[:\-]?\s*(.{6,260})/i,
    ]);

  const responseSla = cleanText(input.responseSla)
    || cleanText(existing?.response_sla)
    || pickEvidence(text, [
      /(?:sla|prazo\s+de\s+resposta|tempo\s+de\s+resposta)\s*[:\-]?\s*(.{3,180})/i,
    ]);

  const departments = pickList(input.departments, existing?.departments, text, [
    /(?:departamentos?|equipe|responsaveis?)\s*[:\-]?\s*(.{4,240})/i,
  ]);

  const permissionPolicy = cleanText(input.permissionPolicy)
    || cleanText(existing?.permission_policy)
    || pickEvidence(text, [
      /(?:permissoes?|permissao|politica\s+de\s+acesso|aprovacao|quem\s+pode\s+aprovar|roles?|alcadas?)\s*[:\-]?\s*(.{6,280})/i,
    ]);

  const calendarPolicy = cleanText(input.calendarPolicy)
    || cleanText(existing?.calendar_policy)
    || pickEvidence(text, [
      /(?:agenda|calendario|politica\s+de\s+agenda|agendamentos?|consultas?|retornos?)\s*[:\-]?\s*(.{6,280})/i,
    ]);

  const financePolicy = cleanText(input.financePolicy)
    || cleanText(existing?.finance_policy)
    || pickEvidence(text, [
      /(?:(?:financeiro(?:\s+operacional)?|politica\s+financeira)\s*[:\-]?|(?:cobrancas?|renegociacoes?|asaas|inadimplencia)\s*[:\-])\s*(.{6,280})/i,
    ]);

  const playbookNotes = cleanText(input.playbookNotes)
    || cleanText(existing?.playbook_notes)
    || pickEvidence(text, [
      /(?:playbook|roteiro|script|padrao\s+de\s+atendimento|procedimento\s+operacional)\s*[:\-]?\s*(.{6,320})/i,
    ]);

  const defaultTriageRules = [
    "Separar lead novo, cliente atual, suporte, cobranca e fora de escopo antes de conduzir.",
    "Pedir somente a informacao minima para o proximo passo.",
  ];
  const defaultHandoffRules = [
    "Escalar para humano quando houver urgencia juridica, contrato, cobranca, promessa de resultado ou pedido expresso de advogado.",
  ];
  const defaultForbiddenClaims = [
    "causa ganha",
    "resultado garantido",
    "direito confirmado sem analise humana",
  ];
  const defaultPermissionPolicy = "Acoes externas, contrato, cobranca, mudanca de permissao, acesso a dados sensiveis e decisao juridica exigem aprovacao humana.";
  const defaultCalendarPolicy = "O MAYUS pode preparar sugestoes de retorno e agenda, mas confirmacao externa de consulta, audiencia ou prazo exige aprovacao humana.";
  const defaultFinancePolicy = "Cobrancas, renegociacoes, descontos, contratos e qualquer acao financeira externa ficam em modo supervisionado.";
  const defaultPlaybookNotes = "Sem playbook especifico validado; usar tom, triagem e regras operacionais ate o dono aprovar roteiro por area.";

  const resolvedTriageRules = triageRules.length > 0 ? triageRules : defaultTriageRules;
  const resolvedHandoffRules = humanHandoffRules.length > 0 ? humanHandoffRules : defaultHandoffRules;
  const resolvedForbiddenClaims = forbiddenClaims.length > 0 ? forbiddenClaims : defaultForbiddenClaims;
  const practiceAreaPlaybooks = buildOfficePracticeAreaPlaybooks({
    practiceAreas,
    requiredDocumentsByCase,
    triageRules: resolvedTriageRules,
    humanHandoffRules: resolvedHandoffRules,
    departments,
    existingPlaybooks: existing?.practice_area_playbooks,
  });

  const profile: OfficeSetupConversationPlan["profile"] = {
    office_name: officeName,
    practice_areas: practiceAreas,
    triage_rules: resolvedTriageRules,
    human_handoff_rules: resolvedHandoffRules,
    communication_tone: communicationTone || "WhatsApp claro, humano, curto, seguro e consultivo.",
    required_documents_by_case: requiredDocumentsByCase,
    forbidden_claims: resolvedForbiddenClaims,
    pricing_policy: pricingPolicy || "Nao informar preco fechado, contrato ou cobranca sem politica validada e aprovacao humana.",
    response_sla: responseSla,
    departments,
    permission_policy: permissionPolicy || defaultPermissionPolicy,
    calendar_policy: calendarPolicy || defaultCalendarPolicy,
    finance_policy: financePolicy || defaultFinancePolicy,
    playbook_notes: playbookNotes || defaultPlaybookNotes,
    practice_area_playbooks: practiceAreaPlaybooks,
    status: "collecting",
  };

  const signals = [
    makeSignal({
      key: "office_name",
      label: "Nome do escritorio",
      evidence: officeName,
      nextQuestion: "Qual e o nome publico do escritorio que o MAYUS deve usar com clientes?",
    }),
    makeSignal({
      key: "practice_areas",
      label: "Areas de atuacao",
      evidence: practiceAreas,
      nextQuestion: "Quais areas juridicas o escritorio atende hoje e quais devem ter prioridade?",
    }),
    makeSignal({
      key: "communication_tone",
      label: "Tom de atendimento",
      evidence: communicationTone,
      nextQuestion: "Qual tom o MAYUS deve usar no atendimento: mais formal, direto, acolhedor, consultivo ou premium?",
    }),
    makeSignal({
      key: "triage_rules",
      label: "Regras de triagem",
      evidence: triageRules,
      nextQuestion: "Quais perguntas ou filtros o MAYUS deve fazer antes de passar o caso para humano?",
    }),
    makeSignal({
      key: "human_handoff_rules",
      label: "Regras de handoff humano",
      evidence: humanHandoffRules,
      nextQuestion: "Em quais situacoes o MAYUS deve parar e chamar um humano imediatamente?",
    }),
    makeSignal({
      key: "required_documents_by_case",
      label: "Documentos por tipo de caso",
      evidence: requiredDocumentsByCase,
      nextQuestion: "Quais documentos o escritorio costuma pedir por area ou tipo de caso?",
    }),
    makeSignal({
      key: "forbidden_claims",
      label: "Promessas proibidas",
      evidence: forbiddenClaims,
      nextQuestion: "Quais promessas, frases ou garantias o MAYUS nunca pode fazer?",
    }),
    makeSignal({
      key: "pricing_policy",
      label: "Politica de preco",
      evidence: pricingPolicy,
      nextQuestion: "O MAYUS pode falar de preco/honorarios? Se sim, em qual limite e com qual aprovacao?",
    }),
    makeSignal({
      key: "response_sla",
      label: "SLA de resposta",
      evidence: responseSla,
      nextQuestion: "Qual prazo de resposta o escritorio quer prometer em primeiro atendimento e retornos?",
    }),
    makeSignal({
      key: "departments",
      label: "Departamentos/equipe",
      evidence: departments,
      nextQuestion: "Quais departamentos ou responsaveis o MAYUS deve conhecer para encaminhar demandas?",
    }),
    makeSignal({
      key: "permission_policy",
      label: "Politica de permissoes",
      evidence: permissionPolicy,
      nextQuestion: "Quem pode aprovar contrato, cobranca, envio externo, mudanca de permissao e decisao juridica?",
    }),
    makeSignal({
      key: "calendar_policy",
      label: "Politica de agenda",
      evidence: calendarPolicy,
      nextQuestion: "Como o MAYUS deve tratar consultas, retornos, audiencias e confirmacoes de agenda?",
    }),
    makeSignal({
      key: "finance_policy",
      label: "Politica financeira operacional",
      evidence: financePolicy,
      nextQuestion: "Quais regras de cobranca, renegociacao, desconto, Asaas e inadimplencia o MAYUS deve respeitar?",
    }),
    makeSignal({
      key: "playbook_notes",
      label: "Playbooks operacionais",
      evidence: playbookNotes,
      nextQuestion: "Quais roteiros ou playbooks o MAYUS deve seguir para atendimento, vendas, agenda e cobranca?",
    }),
  ];

  const knownSignals = signals.filter((signal) => signal.status === "captured");
  const missingSignals = signals.filter((signal) => signal.status === "missing");
  const completeness = Math.round((knownSignals.length / signals.length) * 100);
  const confirmed = isConfirmation(input);
  const status: OfficeSetupStatus = confirmed && knownSignals.length > 0
    ? "validated"
    : completeness >= 50
      ? "draft"
      : "collecting";

  profile.status = status;

  return {
    profile,
    knownSignals,
    missingSignals,
    completeness,
    status,
    nextQuestion: missingSignals[0]?.nextQuestion || "Base operacional do escritorio pronta para revisao humana.",
    setupConversationScript: [
      "Comecar por areas de atuacao, tom e regras de triagem.",
      "Depois coletar handoff humano, documentos, promessas proibidas, preco, permissoes, agenda, financeiro e playbooks.",
      "Gerar defaults por area juridica: perguntas, documentos, pipeline e estrutura de pastas em modo needs_area_review.",
      "Salvar apenas quando o dono confirmar que as respostas representam o escritorio.",
      "Reusar o perfil no Operating Partner, WhatsApp, Setup Doctor e futuras rotinas de onboarding.",
    ],
    autoConfigurationActions: [
      "Atualizar office_knowledge_profile em tenant_settings.ai_features quando houver confirmacao.",
      "Registrar artifact office_setup_conversation para auditoria.",
      "Registrar learning event para o Setup Doctor reconhecer o onboarding operacional.",
      "Gerar practice_area_playbooks para orientar pipeline juridico e estrutura documental por area sem executar acao externa.",
      "Manter qualquer acao externa bloqueada ate o humano aprovar regras sensiveis.",
    ],
    shouldPersist: confirmed && knownSignals.length > 0,
    shouldMarkValidated: confirmed && knownSignals.length > 0,
    requiresHumanReview: !confirmed,
    externalSideEffectsBlocked: true,
    summary: confirmed
      ? "Onboarding operacional do escritorio validado para o MAYUS supervisionado."
      : "Onboarding operacional em coleta; MAYUS ainda precisa de confirmacao antes de gravar respostas.",
  };
}

export function buildOfficeSetupConversationArtifactMetadata(plan: OfficeSetupConversationPlan) {
  return {
    summary: plan.summary,
    profile: plan.profile,
    setup_status: plan.status,
    setup_completeness: plan.completeness,
    known_signals: plan.knownSignals,
    missing_signals: plan.missingSignals,
    next_question: plan.nextQuestion,
    setup_conversation_script: plan.setupConversationScript,
    auto_configuration_actions: plan.autoConfigurationActions,
    should_persist: plan.shouldPersist,
    should_mark_validated: plan.shouldMarkValidated,
    requires_human_review: plan.requiresHumanReview,
    external_side_effects_blocked: plan.externalSideEffectsBlocked,
  };
}
