import { buildTenantOperationalMethodologyContext } from "./tenant-operational-methodology";

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
  idealClient?: string | null;
  uniqueValueProposition?: string | null;
  valuePillars?: string[] | null;
  antiClientSignals?: string[] | null;
  conversationSummary?: string | null;
  conversationTurns?: Array<{ role: string; content: string }> | null;
  existingProfile?: OfficeKnowledgeProfile | null;
  confirmationText?: string | null;
};

export type OfficeSetupStatus = "collecting" | "draft" | "validated";
export type OfficeOperationalMethodologyStatus = "draft" | "recommended" | "approved" | "rejected";

export type OfficeOperationalMethodologyAreaValidation = {
  area: string;
  status: "needs_area_review" | "validated";
  owner_team: string | null;
  pending_items: string[];
  next_review_question: string | null;
  required_documents_count: number;
  phases_count: number;
};

export type OfficeOperationalMethodologyApprovalProposal = {
  recommendation: "approve" | "review_before_approval" | "edit_or_reject";
  title: string;
  summary: string;
  next_action: string;
  requires_human_approval: boolean;
  blocks_sensitive_activation: boolean;
};

export type OfficeOperationalMethodologyReview = {
  scope: "individual_office";
  status: OfficeOperationalMethodologyStatus;
  activation: "active_internal" | "supervised_suggestion" | "rejected" | "missing";
  can_guide_internal_decisions: boolean;
  requires_human_review: boolean;
  review_reasons: string[];
  area_validations: OfficeOperationalMethodologyAreaValidation[];
  pending_area_validations: OfficeOperationalMethodologyAreaValidation[];
  pending_improvement_rules: Array<{
    id: string;
    title: string;
    suggestion: string;
    source: string;
    requires_approval: boolean;
  }>;
  approval_proposal: OfficeOperationalMethodologyApprovalProposal;
};

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
  ideal_client: string | null;
  unique_value_proposition: string | null;
  value_pillars: string[];
  anti_client_signals: string[];
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

export type OfficeOperationalMethodology = {
  status: OfficeOperationalMethodologyStatus;
  identity: {
    office_name: string | null;
    practice_areas: string[];
    ideal_client: string | null;
    unique_value_proposition: string | null;
    value_pillars: string[];
    anti_client_signals: string[];
    communication_tone: string | null;
    forbidden_claims: string[];
  };
  intake: {
    methodology_base_used: boolean;
    rules: string[];
    required_documents_by_case: string[];
    human_handoff_rules: string[];
    response_sla: string | null;
    missing_information_policy: string;
  };
  case_flow: {
    phases: Array<{
      name: string;
      owner_team: string | null;
      advance_criteria: string;
      block_criteria: string;
    }>;
    departments: string[];
    permission_policy: string | null;
    calendar_policy: string | null;
    finance_policy: string | null;
  };
  area_methods: Array<{
    area: string;
    intake_questions: string[];
    required_documents: string[];
    phases: string[];
    document_structure: string[];
    owner_team: string | null;
    validation_status: "needs_area_review" | "validated";
    next_review_question: string;
  }>;
  improvement_rules: Array<{
    id: string;
    title: string;
    suggestion: string;
    status: "pending" | "approved" | "rejected";
    source: "methodology_base" | "office_interview" | "internet_research" | "usage_learning";
    requires_approval: boolean;
  }>;
  internet_policy: {
    enabled: boolean;
    allowed_sources: string[];
    required_citation_fields: string[];
    usage: string;
    sensitive_data_policy: string;
    no_auto_activation: boolean;
  };
  tenant_review?: OfficeOperationalMethodologyReview;
  updated_at: string;
};

export type OfficeSetupSignal = {
  key:
    | "office_name"
    | "practice_areas"
    | "ideal_client"
    | "unique_value_proposition"
    | "value_pillars"
    | "anti_client_signals"
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
  operationalMethodology: OfficeOperationalMethodology;
  methodologyReview: OfficeOperationalMethodologyReview;
  knownSignals: OfficeSetupSignal[];
  missingSignals: OfficeSetupSignal[];
  completeness: number;
  status: OfficeSetupStatus;
  nextQuestion: string;
  setupConversationScript: string[];
  autoConfigurationActions: string[];
  shouldPersist: boolean;
  shouldPersistMethodology: boolean;
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

function buildDefaultDocuments(area: string, baseDocuments: string[]) {
  const normalized = normalizeText(area);
  const shared = ["Documento pessoal", "Comprovante de endereco", "Contrato de honorarios/procuracao", "Resumo cronologico do caso"];

  if (/previdenci|inss|beneficio/.test(normalized)) {
    return uniqueList([...baseDocuments, "CNIS", "Carta de indeferimento ou decisao do INSS", "Documentos medicos quando houver", ...shared], 8);
  }

  if (/banc|consignad|rmc|rcc|credcesta|cartao|emprestimo/.test(normalized)) {
    return uniqueList([...baseDocuments, "Contrato ou proposta bancaria", "Extratos", "Contracheque ou comprovante do desconto", "Comprovante de valores liberados", ...shared], 8);
  }

  if (/famil|alimento|divorcio|guarda/.test(normalized)) {
    return uniqueList([...baseDocuments, "Certidao de casamento ou nascimento", "Comprovantes de renda", "Comprovantes de despesas", "Conversas ou acordos relevantes", ...shared], 8);
  }

  if (/trabalh|emprego|rescis|verba/.test(normalized)) {
    return uniqueList([...baseDocuments, "CTPS", "Contrato de trabalho", "Holerites", "TRCT/rescisao", "Controles de ponto quando houver", ...shared], 8);
  }

  return uniqueList([...baseDocuments, ...shared], 8);
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

function buildDraftUniqueValueProposition(params: {
  idealClient?: string | null;
  practiceAreas: string[];
}) {
  const client = cleanText(params.idealClient) || "pessoas com problema juridico relevante e decisao pendente";
  const areaLabel = params.practiceAreas.length
    ? ` nas areas de ${params.practiceAreas.slice(0, 3).join(", ")}`
    : "";

  return `Ajudamos ${client}${areaLabel} a entender risco, documentos e proximo passo com atendimento consultivo, prova organizada e decisao juridica humana, sem promessa vazia de resultado.`;
}

function buildDraftValuePillars() {
  return [
    "Diagnostico consultivo antes da venda",
    "Documentos e provas antes de promessa",
    "Proximo passo claro e acompanhado",
  ];
}

function shouldUseMayusBaseMethodology(params: {
  text: string;
  triageRules: string[];
  requiredDocumentsByCase: string[];
  playbookNotes: string | null;
}) {
  const normalized = normalizeText(params.text);
  return /nao\s+tenho\s+(processo|metodo|metodologia|direcao)|sem\s+(processo|metodo|metodologia)\s+definid|mont(e|ar)\s+(a\s+)?metodologia|ajud(e|ar)\s+a\s+construir\s+(o\s+)?processo|nao\s+sei\s+como\s+organizar/.test(normalized)
    || (params.triageRules.length === 0 && params.requiredDocumentsByCase.length === 0 && !params.playbookNotes);
}

function buildTenantMethodologyPhases(params: {
  departments: string[];
  defaultPipeline: string[];
}) {
  const ownerTeam = params.departments.find((department) => /jurid/i.test(department))
    || params.departments[0]
    || null;

  return params.defaultPipeline.map((phase) => ({
    name: phase,
    owner_team: ownerTeam,
    advance_criteria: "Avancar somente quando informacoes minimas, documentos esperados e risco de handoff estiverem revisados.",
    block_criteria: "Travar quando faltar documento essencial, houver urgencia juridica, decisao sensivel, cobranca, contrato ou duvida que exija humano.",
  }));
}

function buildAreaValidation(
  method: ReturnType<typeof buildTenantOperationalMethodologyContext>["areaMethods"][number],
): OfficeOperationalMethodologyAreaValidation {
  const pendingItems = [
    method.validationStatus !== "validated"
      ? "Confirmar se perguntas, documentos e fases refletem a rotina real do escritorio."
      : null,
    method.intakeQuestions.length === 0 ? "Definir perguntas obrigatorias de triagem." : null,
    method.requiredDocuments.length === 0 ? "Definir documentos obrigatorios da area." : null,
    method.phases.length === 0 ? "Definir fases e criterios de andamento." : null,
    method.documentStructure.length === 0 ? "Definir estrutura documental da area." : null,
    !method.ownerTeam ? "Definir equipe responsavel pela area." : null,
  ].filter((item): item is string => Boolean(item));

  return {
    area: method.area,
    status: method.validationStatus,
    owner_team: method.ownerTeam,
    pending_items: pendingItems,
    next_review_question: method.nextReviewQuestion,
    required_documents_count: method.requiredDocuments.length,
    phases_count: method.phases.length,
  };
}

function buildApprovalProposal(params: {
  context: ReturnType<typeof buildTenantOperationalMethodologyContext>;
  pendingAreaValidations: OfficeOperationalMethodologyAreaValidation[];
}): OfficeOperationalMethodologyApprovalProposal {
  const hasBlockingReview = params.context.reviewReasons
    .some((reason) => reason !== "methodology_improvement_requires_approval");
  const blocksSensitiveActivation = params.context.activation !== "active_internal" || hasBlockingReview;

  if (params.context.status === "approved" && !blocksSensitiveActivation) {
    return {
      recommendation: "approve",
      title: "Metodologia aprovada para uso interno",
      summary: "A metodologia individual do escritorio pode orientar decisoes internas; melhorias novas seguem aguardando aprovacao humana.",
      next_action: params.context.pendingImprovementRules.length > 0
        ? "Revisar sugestoes pendentes antes de incorporar novas regras."
        : "Manter revisao periodica da metodologia por area.",
      requires_human_approval: params.context.requiresHumanReview,
      blocks_sensitive_activation: false,
    };
  }

  if (params.context.status === "rejected") {
    return {
      recommendation: "edit_or_reject",
      title: "Metodologia rejeitada ou inativa",
      summary: "A metodologia nao deve orientar atendimento, juridico ou financeiro ate ser refeita e aprovada pelo escritorio.",
      next_action: "Reabrir a entrevista operacional e gerar nova versao para revisao do dono.",
      requires_human_approval: true,
      blocks_sensitive_activation: true,
    };
  }

  const areaLabel = params.pendingAreaValidations.length
    ? `${params.pendingAreaValidations.length} area(s) ainda precisam de validacao.`
    : "As areas estao estruturadas, mas a aprovacao do dono ainda falta.";

  return {
    recommendation: "review_before_approval",
    title: "Revisar metodologia antes de ativar",
    summary: `${areaLabel} O MAYUS deve tratar este conteudo como sugestao supervisionada do tenant.`,
    next_action: "Abrir revisao humana, confirmar area por area e aprovar apenas o que representa o escritorio.",
    requires_human_approval: true,
    blocks_sensitive_activation: true,
  };
}

function buildOfficeOperationalMethodologyReview(
  methodology: OfficeOperationalMethodology,
): OfficeOperationalMethodologyReview {
  const context = buildTenantOperationalMethodologyContext(methodology);
  const areaValidations = context.areaMethods.map(buildAreaValidation);
  const pendingAreaValidations = areaValidations.filter((item) => (
    item.status !== "validated" || item.pending_items.length > 0
  ));
  const status = context.status === "missing" ? "draft" : context.status;

  return {
    scope: "individual_office",
    status,
    activation: context.activation,
    can_guide_internal_decisions: context.canGuideInternalDecisions,
    requires_human_review: context.requiresHumanReview,
    review_reasons: context.reviewReasons,
    area_validations: areaValidations,
    pending_area_validations: pendingAreaValidations,
    pending_improvement_rules: context.pendingImprovementRules.map((rule) => ({
      id: rule.id,
      title: rule.title,
      suggestion: rule.suggestion,
      source: rule.source,
      requires_approval: rule.requiresApproval,
    })),
    approval_proposal: buildApprovalProposal({
      context,
      pendingAreaValidations,
    }),
  };
}

function buildOperationalMethodology(params: {
  status: OfficeOperationalMethodologyStatus;
  profile: OfficeKnowledgeProfile & { status: OfficeSetupStatus };
  methodologyBaseUsed: boolean;
  methodologyPlaybooks: OfficePracticeAreaPlaybook[];
}) {
  const defaultPipeline = params.methodologyPlaybooks[0]?.default_pipeline?.length
    ? params.methodologyPlaybooks[0].default_pipeline
    : buildDefaultPipeline("geral");

  const methodology = {
    status: params.status,
    identity: {
      office_name: params.profile.office_name,
      practice_areas: params.profile.practice_areas,
      ideal_client: params.profile.ideal_client,
      unique_value_proposition: params.profile.unique_value_proposition,
      value_pillars: params.profile.value_pillars,
      anti_client_signals: params.profile.anti_client_signals,
      communication_tone: params.profile.communication_tone,
      forbidden_claims: params.profile.forbidden_claims,
    },
    intake: {
      methodology_base_used: params.methodologyBaseUsed,
      rules: params.profile.triage_rules,
      required_documents_by_case: params.profile.required_documents_by_case,
      human_handoff_rules: params.profile.human_handoff_rules,
      response_sla: params.profile.response_sla,
      missing_information_policy: "Quando faltar informacao ou documento, o MAYUS deve pedir somente o minimo necessario para destravar o proximo passo.",
    },
    case_flow: {
      phases: buildTenantMethodologyPhases({
        departments: params.profile.departments,
        defaultPipeline,
      }),
      departments: params.profile.departments,
      permission_policy: params.profile.permission_policy,
      calendar_policy: params.profile.calendar_policy,
      finance_policy: params.profile.finance_policy,
    },
    area_methods: params.methodologyPlaybooks.map((playbook) => ({
      area: playbook.area,
      intake_questions: playbook.intake_questions,
      required_documents: playbook.required_documents,
      phases: playbook.default_pipeline,
      document_structure: playbook.document_structure,
      owner_team: playbook.owner_team,
      validation_status: playbook.validation_status,
      next_review_question: playbook.next_review_question,
    })),
    improvement_rules: [
      {
        id: "confirmar-metodologia-base",
        title: "Validar metodologia v0",
        suggestion: params.methodologyBaseUsed
          ? "Revisar a Metodologia Base MAYUS e aprovar, ajustar ou rejeitar cada regra antes de usar como verdade operacional."
          : "Confirmar se a metodologia capturada representa o escritorio antes de aplicar em atendimento, juridico e financeiro.",
        status: "pending" as const,
        source: params.methodologyBaseUsed ? "methodology_base" as const : "office_interview" as const,
        requires_approval: true,
      },
      {
        id: "lembrar-correcoes-recorrentes",
        title: "Aprender com correcao humana",
        suggestion: "Quando o advogado corrigir atendimento, documentos, fase ou criterio, o MAYUS deve perguntar se deve lembrar para proximos casos desse tipo.",
        status: "pending" as const,
        source: "usage_learning" as const,
        requires_approval: true,
      },
    ],
    internet_policy: {
      enabled: true,
      allowed_sources: ["STF", "STJ", "TST", "TRFs", "TRTs", "TNU", "INSS", "diarios oficiais", "tribunais locais", "fontes oficiais e artigos com link verificavel"],
      required_citation_fields: ["fonte", "link", "data_da_busca", "motivo", "fato_ou_inferencia"],
      usage: "Pesquisa externa serve para atualizar contexto, sugerir revisao da metodologia e apoiar pecas com fonte clicavel; nao altera regra ativa sozinha.",
      sensitive_data_policy: "Nao enviar dados sensiveis de clientes para busca aberta sem politica explicita e aprovacao humana.",
      no_auto_activation: true,
    },
    updated_at: new Date().toISOString(),
  } satisfies OfficeOperationalMethodology;

  return {
    ...methodology,
    tenant_review: buildOfficeOperationalMethodologyReview(methodology),
  } satisfies OfficeOperationalMethodology;
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

  const idealClient = cleanText(input.idealClient)
    || cleanText(existing?.ideal_client)
    || pickEvidence(text, [
      /(?:cliente\s+ideal|publico\s+alvo|perfil\s+de\s+cliente)\s*[:\-]?\s*(.{8,260})/i,
    ]);

  const uniqueValueProposition = cleanText(input.uniqueValueProposition)
    || cleanText(existing?.unique_value_proposition)
    || pickEvidence(text, [
      /(?:puv|proposta\s+unica\s+de\s+valor|proposta\s+unica|diferencial)\s*[:\-]?\s*(.{8,300})/i,
    ]);

  const valuePillars = pickList(input.valuePillars, existing?.value_pillars, text, [
    /(?:pilares?|pilares\s+de\s+valor|sustentamos\s+(?:em|com))\s*[:\-]?\s*(.{8,240})/i,
  ]);

  const antiClientSignals = pickList(input.antiClientSignals, existing?.anti_client_signals, text, [
    /(?:anti[-\s]?cliente|cliente\s+que\s+nao\s+queremos|nao\s+queremos\s+atender)\s*[:\-]?\s*(.{8,240})/i,
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
  const defaultPlaybookNotes = "Sem metodologia especifica validada; usar a Metodologia Base MAYUS como rascunho supervisionado ate o dono aprovar regras por area.";

  const resolvedTriageRules = triageRules.length > 0 ? triageRules : defaultTriageRules;
  const resolvedHandoffRules = humanHandoffRules.length > 0 ? humanHandoffRules : defaultHandoffRules;
  const resolvedForbiddenClaims = forbiddenClaims.length > 0 ? forbiddenClaims : defaultForbiddenClaims;
  const methodologyBaseUsed = shouldUseMayusBaseMethodology({
    text,
    triageRules,
    requiredDocumentsByCase,
    playbookNotes,
  });
  const methodologyAreas = practiceAreas.length > 0
    ? practiceAreas
    : methodologyBaseUsed
      ? ["Trabalhista", "Previdenciario", "Bancario/RMC"]
      : [];
  const practiceAreaPlaybooks = buildOfficePracticeAreaPlaybooks({
    practiceAreas,
    requiredDocumentsByCase,
    triageRules: resolvedTriageRules,
    humanHandoffRules: resolvedHandoffRules,
    departments,
    existingPlaybooks: existing?.practice_area_playbooks,
  });
  const methodologyPlaybooks = methodologyAreas.length === practiceAreas.length
    ? practiceAreaPlaybooks
    : buildOfficePracticeAreaPlaybooks({
      practiceAreas: methodologyAreas,
      requiredDocumentsByCase,
      triageRules: resolvedTriageRules,
      humanHandoffRules: resolvedHandoffRules,
      departments,
      existingPlaybooks: existing?.practice_area_playbooks,
    });

  const profile: OfficeSetupConversationPlan["profile"] = {
    office_name: officeName,
    practice_areas: practiceAreas,
    ideal_client: idealClient,
    unique_value_proposition: uniqueValueProposition || buildDraftUniqueValueProposition({
      idealClient,
      practiceAreas: methodologyAreas.length > 0 ? methodologyAreas : practiceAreas,
    }),
    value_pillars: valuePillars.length > 0 ? valuePillars : buildDraftValuePillars(),
    anti_client_signals: antiClientSignals,
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
      key: "ideal_client",
      label: "Cliente ideal",
      evidence: idealClient,
      nextQuestion: "Qual cliente ideal o escritorio quer atrair e atender melhor?",
    }),
    makeSignal({
      key: "unique_value_proposition",
      label: "PUV",
      evidence: uniqueValueProposition,
      nextQuestion: "Qual e a proposta unica de valor do escritorio? Se ainda nao existir, posso sugerir uma base.",
    }),
    makeSignal({
      key: "value_pillars",
      label: "Pilares de valor",
      evidence: valuePillars,
      nextQuestion: "Quais pilares sustentam a promessa comercial do escritorio?",
    }),
    makeSignal({
      key: "anti_client_signals",
      label: "Anti-cliente",
      evidence: antiClientSignals,
      nextQuestion: "Que tipo de cliente ou caso o escritorio prefere evitar?",
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
      label: "Metodologia operacional",
      evidence: playbookNotes,
      nextQuestion: "Quais fases, criterios e rotinas o MAYUS deve seguir no processo do escritorio?",
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
  const methodologyStatus: OfficeOperationalMethodologyStatus = status === "validated"
    ? "approved"
    : methodologyBaseUsed
      ? "recommended"
      : "draft";
  const operationalMethodology = buildOperationalMethodology({
    status: methodologyStatus,
    profile,
    methodologyBaseUsed,
    methodologyPlaybooks,
  });
  const methodologyReview = operationalMethodology.tenant_review || buildOfficeOperationalMethodologyReview(operationalMethodology);
  const methodologyNextQuestion = methodologyReview.pending_area_validations[0]?.next_review_question
    || methodologyReview.approval_proposal.next_action;

  return {
    profile,
    operationalMethodology,
    methodologyReview,
    knownSignals,
    missingSignals,
    completeness,
    status,
    nextQuestion: missingSignals[0]?.nextQuestion || methodologyNextQuestion || "Base operacional do escritorio pronta para revisao humana.",
    setupConversationScript: [
      "Comecar por identidade: areas, cliente ideal, PUV, pilares e anti-cliente.",
      "Depois coletar tom, triagem, handoff humano, documentos, promessas proibidas, preco, permissoes, agenda, financeiro e fases do processo.",
      "Se o escritorio ainda nao tiver direcao, sugerir a Metodologia Base MAYUS para atendimento, vendas, documentos e areas iniciais.",
      "Gerar metodologia por area juridica: perguntas, documentos, fases, criterios e estrutura de pastas em modo needs_area_review.",
      "Salvar como rascunho/recomendacao e aplicar como regra apenas quando o dono confirmar que representa o escritorio.",
      "Reusar o perfil no Operating Partner, WhatsApp, Setup Doctor e futuras rotinas de onboarding.",
    ],
    autoConfigurationActions: [
      "Atualizar operational_methodology em tenant_settings.ai_features como draft, recommended ou approved.",
      "Atualizar office_knowledge_profile em tenant_settings.ai_features quando houver confirmacao.",
      "Registrar artifact office_operational_methodology para auditoria.",
      "Registrar learning event quando metodologia for criada, revisada ou aprovada.",
      "Gerar area_methods/practice_area_playbooks para orientar intake, pipeline juridico e estrutura documental por area sem executar acao externa.",
      "Usar internet apenas como fonte auditavel: fonte, link, data, motivo e separacao entre fato e inferencia.",
      "Manter qualquer acao externa ou regra sensivel bloqueada ate o humano aprovar.",
    ],
    shouldPersist: confirmed && knownSignals.length > 0,
    shouldPersistMethodology: knownSignals.length > 0 || methodologyBaseUsed,
    shouldMarkValidated: confirmed && knownSignals.length > 0,
    requiresHumanReview: methodologyReview.requires_human_review,
    externalSideEffectsBlocked: true,
    summary: confirmed
      ? "Metodologia operacional do escritorio aprovada para o MAYUS supervisionado."
      : methodologyBaseUsed
        ? "Metodologia Base MAYUS recomendada como v0; precisa de revisao humana antes de virar regra ativa."
        : "Metodologia operacional em coleta; MAYUS ainda precisa de confirmacao antes de aplicar respostas.",
  };
}

export function buildOfficeSetupConversationArtifactMetadata(plan: OfficeSetupConversationPlan) {
  return {
    summary: plan.summary,
    profile: plan.profile,
    operational_methodology: plan.operationalMethodology,
    methodology_review: plan.methodologyReview,
    setup_status: plan.status,
    methodology_status: plan.operationalMethodology.status,
    methodology_activation: plan.methodologyReview.activation,
    pending_area_validations: plan.methodologyReview.pending_area_validations,
    human_approval_proposal: plan.methodologyReview.approval_proposal,
    setup_completeness: plan.completeness,
    known_signals: plan.knownSignals,
    missing_signals: plan.missingSignals,
    next_question: plan.nextQuestion,
    setup_conversation_script: plan.setupConversationScript,
    auto_configuration_actions: plan.autoConfigurationActions,
    should_persist: plan.shouldPersist,
    should_persist_methodology: plan.shouldPersistMethodology,
    should_mark_validated: plan.shouldMarkValidated,
    requires_human_review: plan.requiresHumanReview,
    external_side_effects_blocked: plan.externalSideEffectsBlocked,
  };
}
