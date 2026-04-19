export type PieceRequirement = {
  label: string;
  acceptedDocumentTypes: string[];
};

export type PieceQualityProfile = {
  minSections: number;
  minParagraphs: number;
  minChars: number;
};

export type PieceTemplateDefaults = {
  templateName: string;
  structureMarkdown: string;
  guidanceNotes: string;
};

export type PracticeAreaOption = {
  value: string;
  label: string;
};

export type PieceSuggestion = {
  value: string;
  label: string;
  familyKey: string;
};

export type NormalizedPieceRequest = {
  input: string;
  normalizedKey: string;
  pieceLabel: string;
  familyKey: string;
  familyLabel: string;
  templateLookupKeys: string[];
  requirements: PieceRequirement[];
  documentPriority: Record<string, number>;
  qualityProfile: PieceQualityProfile;
  defaultTemplate: PieceTemplateDefaults;
};

const DEFAULT_DOCUMENT_PRIORITY: Record<string, number> = {
  inicial: 11,
  contestacao: 11,
  replica: 10,
  recurso: 9,
  sentenca: 8,
  decisao: 8,
  decisao_sentenca: 8,
  prova: 8,
  documento_cliente: 7,
  manifestacao: 6,
  geral: 4,
};

type FamilyDefinition = {
  label: string;
  aliases: string[];
  templateFallbacks: string[];
  requirements: PieceRequirement[];
  documentPriority: Record<string, number>;
  qualityProfile: PieceQualityProfile;
  defaultTemplate: PieceTemplateDefaults;
};

function mergeDocumentPriority(overrides: Record<string, number>) {
  return { ...DEFAULT_DOCUMENT_PRIORITY, ...overrides };
}

export const PRACTICE_AREA_OPTIONS: PracticeAreaOption[] = [
  { value: "civel", label: "Civel" },
  { value: "consumidor", label: "Consumidor" },
  { value: "trabalhista", label: "Trabalhista" },
  { value: "previdenciario", label: "Previdenciario" },
  { value: "tributario", label: "Tributario" },
  { value: "empresarial", label: "Empresarial" },
  { value: "familia", label: "Familia" },
  { value: "penal", label: "Penal" },
  { value: "administrativo", label: "Administrativo" },
  { value: "imobiliario", label: "Imobiliario" },
  { value: "bancario", label: "Bancario" },
  { value: "saude", label: "Saude" },
];

export const LEGAL_PIECE_SUGGESTIONS: PieceSuggestion[] = [
  { value: "Peticao Inicial", label: "Peticao Inicial", familyKey: "peticao_inicial" },
  { value: "Contestacao", label: "Contestacao", familyKey: "contestacao" },
  { value: "Replica", label: "Replica", familyKey: "replica" },
  { value: "Tutela de Urgencia", label: "Tutela de Urgencia", familyKey: "tutela_urgencia" },
  { value: "Apelacao", label: "Apelacao", familyKey: "apelacao" },
  { value: "Contrarrazoes de Apelacao", label: "Contrarrazoes de Apelacao", familyKey: "contrarrazoes" },
  { value: "Embargos de Declaracao", label: "Embargos de Declaracao", familyKey: "embargos_declaracao" },
  { value: "Agravo de Instrumento", label: "Agravo de Instrumento", familyKey: "agravo_instrumento" },
  { value: "Impugnacao ao Cumprimento de Sentenca", label: "Impugnacao ao Cumprimento de Sentenca", familyKey: "cumprimento_sentenca" },
  { value: "Embargos a Execucao", label: "Embargos a Execucao", familyKey: "embargos_execucao" },
  { value: "Memoriais", label: "Memoriais", familyKey: "memoriais" },
  { value: "Manifestacao", label: "Manifestacao", familyKey: "manifestacao_generica" },
  { value: "Notificacao Extrajudicial", label: "Notificacao Extrajudicial", familyKey: "notificacao_extrajudicial" },
  { value: "Parecer Juridico", label: "Parecer Juridico", familyKey: "parecer_juridico" },
];

const FAMILY_DEFINITIONS: Record<string, FamilyDefinition> = {
  peticao_inicial: {
    label: "Peticao Inicial",
    aliases: ["peticao inicial", "inicial", "acao inicial"],
    templateFallbacks: ["peticao_inicial", "manifestacao_generica"],
    requirements: [
      { label: "Documentos do cliente", acceptedDocumentTypes: ["documento_cliente", "prova"] },
    ],
    documentPriority: mergeDocumentPriority({ documento_cliente: 12, prova: 11, geral: 6 }),
    qualityProfile: { minSections: 6, minParagraphs: 16, minChars: 8500 },
    defaultTemplate: {
      templateName: "Modelo Base do Escritorio",
      structureMarkdown: "I - DOS FATOS\nII - DO CABIMENTO E DA RELACAO JURIDICA\nIII - DO DIREITO MATERIAL\nIV - DA PROVA DOCUMENTAL\nV - DOS PEDIDOS\nVI - DAS PROVAS E REQUERIMENTOS FINAIS",
      guidanceNotes: "Desenvolver fatos em cronologia madura, enquadramento juridico, prova documental e pedidos determinados.",
    },
  },
  contestacao: {
    label: "Contestacao",
    aliases: ["contestacao", "defesa", "resposta do reu"],
    templateFallbacks: ["contestacao", "manifestacao_generica"],
    requirements: [
      { label: "Peticao inicial", acceptedDocumentTypes: ["inicial"] },
      { label: "Documentos do cliente", acceptedDocumentTypes: ["documento_cliente", "prova"] },
    ],
    documentPriority: mergeDocumentPriority({ inicial: 15, documento_cliente: 12, prova: 10, manifestacao: 6 }),
    qualityProfile: { minSections: 5, minParagraphs: 15, minChars: 7800 },
    defaultTemplate: {
      templateName: "Contestacao Padrao",
      structureMarkdown: "I - SINTESE DA INICIAL\nII - DAS PRELIMINARES, SE CABIVEIS\nIII - DO MERITO\nIV - DA IMPUGNACAO ESPECIFICA DOS FATOS\nV - DOS PEDIDOS E DA PROVA",
      guidanceNotes: "Enfrentar a inicial ponto a ponto, com impugnacao especifica, prova e pedidos defensivos completos.",
    },
  },
  replica: {
    label: "Replica",
    aliases: ["replica", "impugnacao a contestacao", "manifestacao sobre contestacao"],
    templateFallbacks: ["replica", "manifestacao_generica"],
    requirements: [
      { label: "Peticao inicial", acceptedDocumentTypes: ["inicial"] },
      { label: "Contestacao", acceptedDocumentTypes: ["contestacao"] },
    ],
    documentPriority: mergeDocumentPriority({ contestacao: 15, inicial: 13, prova: 10, documento_cliente: 8, manifestacao: 7 }),
    qualityProfile: { minSections: 5, minParagraphs: 15, minChars: 7600 },
    defaultTemplate: {
      templateName: "Replica Padrao",
      structureMarkdown: "I - DA SINTese DA CONTESTACAO\nII - DA IMPUGNACAO ESPECIFICA DAS TESES DEFENSIVAS\nIII - DO REFORCO PROBATORIO\nIV - DO DIREITO APLICAVEL\nV - DOS PEDIDOS FINAIS",
      guidanceNotes: "Rebater a defesa por blocos, demonstrar por que a contestacao nao afasta os fatos constitutivos e reforcar os documentos centrais.",
    },
  },
  tutela_urgencia: {
    label: "Tutela de Urgencia",
    aliases: ["tutela de urgencia", "pedido liminar", "liminar", "tutela antecipada"],
    templateFallbacks: ["tutela_urgencia", "manifestacao_generica"],
    requirements: [
      { label: "Documentos do cliente", acceptedDocumentTypes: ["documento_cliente", "prova"] },
      { label: "Provas urgentes", acceptedDocumentTypes: ["prova", "documento_cliente", "decisao", "sentenca"] },
    ],
    documentPriority: mergeDocumentPriority({ prova: 12, documento_cliente: 11, decisao: 9, sentenca: 7 }),
    qualityProfile: { minSections: 4, minParagraphs: 12, minChars: 5600 },
    defaultTemplate: {
      templateName: "Tutela de Urgencia",
      structureMarkdown: "I - DOS FATOS RELEVANTES\nII - DA PROBABILIDADE DO DIREITO\nIII - DO PERIGO DE DANO\nIV - DO PEDIDO LIMINAR E DOS REQUERIMENTOS FINAIS",
      guidanceNotes: "Separar probabilidade do direito e perigo de dano com base concreta, evitando urgencia abstrata.",
    },
  },
  apelacao: {
    label: "Apelacao",
    aliases: ["apelacao", "apelaçao", "recurso de apelacao"],
    templateFallbacks: ["apelacao", "recurso_generico", "manifestacao_generica"],
    requirements: [
      { label: "Sentenca ou decisao recorrida", acceptedDocumentTypes: ["sentenca", "decisao", "decisao_sentenca"] },
    ],
    documentPriority: mergeDocumentPriority({ sentenca: 15, decisao: 14, decisao_sentenca: 14, recurso: 9, manifestacao: 7 }),
    qualityProfile: { minSections: 5, minParagraphs: 16, minChars: 8800 },
    defaultTemplate: {
      templateName: "Apelacao",
      structureMarkdown: "I - DA SINTese DO JULGADO\nII - DO CABIMENTO E TEMPESTIVIDADE\nIII - DAS RAZOES RECURSAIS\nIV - DOS PEDIDOS DE REFORMA\nV - DOS REQUERIMENTOS FINAIS",
      guidanceNotes: "Estruturar capitulos por erro da decisao, com pedido de reforma objetivo e utilidade pratica de cada tese.",
    },
  },
  contrarrazoes: {
    label: "Contrarrazoes de Apelacao",
    aliases: ["contrarrazoes", "contrarrazoes de apelacao", "contrarrazoes", "contrarrazoes ao recurso"],
    templateFallbacks: ["contrarrazoes", "apelacao", "recurso_generico", "manifestacao_generica"],
    requirements: [
      { label: "Recurso da parte contraria", acceptedDocumentTypes: ["recurso", "apelacao"] },
      { label: "Sentenca ou decisao recorrida", acceptedDocumentTypes: ["sentenca", "decisao", "decisao_sentenca"] },
    ],
    documentPriority: mergeDocumentPriority({ recurso: 15, sentenca: 14, decisao: 12, manifestacao: 7, prova: 6 }),
    qualityProfile: { minSections: 5, minParagraphs: 15, minChars: 7600 },
    defaultTemplate: {
      templateName: "Contrarrazoes de Apelacao",
      structureMarkdown: "I - DA SINTese DO RECURSO\nII - DO ACERTO DA DECISAO\nIII - DA IMPUGNACAO ESPECIFICA DAS RAZOES RECURSAIS\nIV - DO PEDIDO DE DESPROVIMENTO\nV - DOS REQUERIMENTOS FINAIS",
      guidanceNotes: "Responder ao recurso por eixos argumentativos, preservando o acerto da decisao e enfrentando cada pedido de reforma.",
    },
  },
  embargos_declaracao: {
    label: "Embargos de Declaracao",
    aliases: ["embargos de declaracao", "embargos declaratorios", "embargos de declaração"],
    templateFallbacks: ["embargos_declaracao", "recurso_generico", "manifestacao_generica"],
    requirements: [
      { label: "Decisao embargada", acceptedDocumentTypes: ["decisao", "sentenca", "decisao_sentenca"] },
    ],
    documentPriority: mergeDocumentPriority({ decisao: 15, sentenca: 14, decisao_sentenca: 14, manifestacao: 7 }),
    qualityProfile: { minSections: 4, minParagraphs: 11, minChars: 4800 },
    defaultTemplate: {
      templateName: "Embargos de Declaracao",
      structureMarkdown: "I - DA TEMPESTIVIDADE\nII - DA DECISAO EMBARGADA\nIII - DO VICIO A SER SANADO\nIV - DOS PEDIDOS",
      guidanceNotes: "Identificar omissao, contradicao, obscuridade ou erro material de forma cirurgica e utilitaria.",
    },
  },
  agravo_instrumento: {
    label: "Agravo de Instrumento",
    aliases: ["agravo de instrumento", "agravo"],
    templateFallbacks: ["agravo_instrumento", "recurso_generico", "tutela_urgencia", "manifestacao_generica"],
    requirements: [
      { label: "Decisao agravada", acceptedDocumentTypes: ["decisao", "decisao_sentenca"] },
    ],
    documentPriority: mergeDocumentPriority({ decisao: 15, decisao_sentenca: 13, prova: 8, manifestacao: 7 }),
    qualityProfile: { minSections: 5, minParagraphs: 14, minChars: 7200 },
    defaultTemplate: {
      templateName: "Agravo de Instrumento",
      structureMarkdown: "I - DA TEMPESTIVIDADE E CABIMENTO\nII - DA SINTese DA DECISAO AGRAVADA\nIII - DAS RAZOES DE REFORMA\nIV - DO PEDIDO DE TUTELA RECURSAL, SE CABIVEL\nV - DOS PEDIDOS",
      guidanceNotes: "Explicar a utilidade recursal concreta e os efeitos praticos da reforma pretendida.",
    },
  },
  cumprimento_sentenca: {
    label: "Impugnacao ao Cumprimento de Sentenca",
    aliases: ["cumprimento de sentenca", "impugnacao ao cumprimento de sentenca", "impugnação ao cumprimento de sentença"],
    templateFallbacks: ["cumprimento_sentenca", "manifestacao_generica", "contestacao"],
    requirements: [
      { label: "Sentenca ou titulo judicial", acceptedDocumentTypes: ["sentenca", "decisao", "decisao_sentenca"] },
    ],
    documentPriority: mergeDocumentPriority({ sentenca: 14, decisao: 12, decisao_sentenca: 12, recurso: 8, prova: 7 }),
    qualityProfile: { minSections: 5, minParagraphs: 14, minChars: 7000 },
    defaultTemplate: {
      templateName: "Impugnacao ao Cumprimento de Sentenca",
      structureMarkdown: "I - DO CONTEXTO DO CUMPRIMENTO\nII - DAS MATERIAS IMPUGNAVEIS\nIII - DO EXCESSO OU INVALIDADE APONTADA\nIV - DO DIREITO APLICAVEL\nV - DOS PEDIDOS",
      guidanceNotes: "Trabalhar memoria de calculo, excesso, inexigibilidade ou nulidade com objetividade tecnicamente executiva.",
    },
  },
  embargos_execucao: {
    label: "Embargos a Execucao",
    aliases: ["embargos a execucao", "embargos a execução", "embargos do executado"],
    templateFallbacks: ["embargos_execucao", "contestacao", "manifestacao_generica"],
    requirements: [
      { label: "Execucao ou titulo executivo", acceptedDocumentTypes: ["inicial", "decisao", "sentenca", "documento_cliente"] },
    ],
    documentPriority: mergeDocumentPriority({ inicial: 12, documento_cliente: 11, prova: 10, decisao: 8, sentenca: 8 }),
    qualityProfile: { minSections: 5, minParagraphs: 14, minChars: 7200 },
    defaultTemplate: {
      templateName: "Embargos a Execucao",
      structureMarkdown: "I - DA EXECUCAO EMBARGADA\nII - DAS PRELIMINARES E PRESSUPOSTOS\nIII - DAS RAZOES DOS EMBARGOS\nIV - DO DIREITO APLICAVEL\nV - DOS PEDIDOS",
      guidanceNotes: "Enfrentar o titulo e a exequibilidade com tecnica de defesa executiva, evitando narrativa dispersa.",
    },
  },
  memoriais: {
    label: "Memoriais",
    aliases: ["memoriais", "alegacoes finais", "alegações finais"],
    templateFallbacks: ["memoriais", "manifestacao_generica"],
    requirements: [
      { label: "Documentos centrais do processo", acceptedDocumentTypes: ["manifestacao", "prova", "decisao", "sentenca", "contestacao", "inicial"] },
    ],
    documentPriority: mergeDocumentPriority({ manifestacao: 10, prova: 10, sentenca: 9, decisao: 9, contestacao: 8, inicial: 8 }),
    qualityProfile: { minSections: 4, minParagraphs: 12, minChars: 5800 },
    defaultTemplate: {
      templateName: "Memoriais",
      structureMarkdown: "I - DA SINTese PROCESSUAL\nII - DOS FATOS E PROVAS RELEVANTES\nIII - DO DIREITO APLICAVEL\nIV - DOS PEDIDOS",
      guidanceNotes: "Consolidar o historico do processo, prova produzida e conclusao pratica que o julgador deve adotar.",
    },
  },
  notificacao_extrajudicial: {
    label: "Notificacao Extrajudicial",
    aliases: ["notificacao extrajudicial", "notificação extrajudicial", "notificacao", "notificação"],
    templateFallbacks: ["notificacao_extrajudicial", "peticao_generica"],
    requirements: [
      { label: "Documentos de suporte", acceptedDocumentTypes: ["documento_cliente", "prova", "geral"] },
    ],
    documentPriority: mergeDocumentPriority({ documento_cliente: 11, prova: 10, geral: 7 }),
    qualityProfile: { minSections: 3, minParagraphs: 8, minChars: 3200 },
    defaultTemplate: {
      templateName: "Notificacao Extrajudicial",
      structureMarkdown: "I - DA RELACAO ENTRE AS PARTES\nII - DA IRREGULARIDADE OU INADIMPLEMENTO\nIII - DA PROVIDENCIA EXIGIDA E DO PRAZO",
      guidanceNotes: "Texto objetivo, firme e operacional, com comando claro e consequencia do descumprimento.",
    },
  },
  parecer_juridico: {
    label: "Parecer Juridico",
    aliases: ["parecer juridico", "parecer"],
    templateFallbacks: ["parecer_juridico", "manifestacao_generica", "peticao_generica"],
    requirements: [
      { label: "Documentos de suporte", acceptedDocumentTypes: ["documento_cliente", "prova", "geral", "manifestacao"] },
    ],
    documentPriority: mergeDocumentPriority({ documento_cliente: 10, prova: 9, geral: 8, manifestacao: 8 }),
    qualityProfile: { minSections: 5, minParagraphs: 14, minChars: 7200 },
    defaultTemplate: {
      templateName: "Parecer Juridico",
      structureMarkdown: "I - DA CONSULTA\nII - DOS FATOS E DOCUMENTOS\nIII - DO ENQUADRAMENTO JURIDICO\nIV - DOS RISCOS E CENARIOS\nV - DA CONCLUSAO",
      guidanceNotes: "Estruturar consulta, premissas, riscos e conclusoes com linguagem clara e profissional.",
    },
  },
  recurso_generico: {
    label: "Recurso",
    aliases: ["recurso", "razoes recursais", "contrarrazoes recursais"],
    templateFallbacks: ["recurso_generico", "apelacao", "manifestacao_generica"],
    requirements: [
      { label: "Decisao recorrida", acceptedDocumentTypes: ["sentenca", "decisao", "decisao_sentenca"] },
    ],
    documentPriority: mergeDocumentPriority({ sentenca: 13, decisao: 13, decisao_sentenca: 13, recurso: 10, manifestacao: 7 }),
    qualityProfile: { minSections: 5, minParagraphs: 14, minChars: 7000 },
    defaultTemplate: {
      templateName: "Recurso Generico",
      structureMarkdown: "I - DA SINTese DO JULGADO\nII - DO CABIMENTO\nIII - DAS RAZOES RECURSAIS\nIV - DOS PEDIDOS",
      guidanceNotes: "Organizar as teses recursais em capitulos autonomos, cada um com efeito pratico e pedido correspondente.",
    },
  },
  manifestacao_generica: {
    label: "Manifestacao",
    aliases: ["manifestacao", "peticao intermediaria", "petição intermediária"],
    templateFallbacks: ["manifestacao_generica", "replica", "contestacao"],
    requirements: [
      { label: "Documentos centrais do processo", acceptedDocumentTypes: ["manifestacao", "geral", "inicial", "contestacao", "prova"] },
    ],
    documentPriority: mergeDocumentPriority({ manifestacao: 10, inicial: 9, contestacao: 9, prova: 8, geral: 6 }),
    qualityProfile: { minSections: 4, minParagraphs: 11, minChars: 5200 },
    defaultTemplate: {
      templateName: "Manifestacao Padrao",
      structureMarkdown: "I - DO CONTEXTO PROCESSUAL\nII - DOS PONTOS A SEREM ENFRENTADOS\nIII - DO DIREITO APLICAVEL\nIV - DOS REQUERIMENTOS",
      guidanceNotes: "Estruturar peticao intermediaria com clareza processual, finalidade objetiva e pedidos praticos.",
    },
  },
  peticao_generica: {
    label: "Peticao",
    aliases: ["peticao", "petição"],
    templateFallbacks: ["peticao_generica", "manifestacao_generica", "peticao_inicial"],
    requirements: [
      { label: "Documentos de suporte", acceptedDocumentTypes: ["documento_cliente", "prova", "geral", "manifestacao"] },
    ],
    documentPriority: mergeDocumentPriority({ documento_cliente: 9, prova: 9, manifestacao: 8, geral: 7 }),
    qualityProfile: { minSections: 4, minParagraphs: 10, minChars: 4800 },
    defaultTemplate: {
      templateName: "Peticao Generica",
      structureMarkdown: "I - DOS FATOS\nII - DO DIREITO\nIII - DOS REQUERIMENTOS\nIV - DOS PEDIDOS",
      guidanceNotes: "Quando a especie nao estiver mapeada, produzir minuta profissional, estruturada e operacionalizavel.",
    },
  },
};

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugifyPieceType(value: string) {
  return normalizeText(value).replace(/\s+/g, "_");
}

function titleFromSlug(value: string) {
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function inferFamilyKey(normalizedInput: string) {
  for (const [familyKey, definition] of Object.entries(FAMILY_DEFINITIONS)) {
    if (definition.aliases.some((alias) => normalizedInput.includes(normalizeText(alias)))) {
      return familyKey;
    }
  }

  if (normalizedInput.includes("recurso")) return "recurso_generico";
  if (normalizedInput.includes("manifesta") || normalizedInput.includes("peticao intermediaria")) return "manifestacao_generica";
  if (normalizedInput.includes("peticao") || normalizedInput.includes("pedido")) return "peticao_generica";
  return "peticao_generica";
}

export function normalizeLegalPieceRequest(input: string): NormalizedPieceRequest {
  const cleanInput = String(input || "").trim();
  const safeInput = cleanInput || "Peticao";
  const normalizedInput = normalizeText(safeInput);
  const normalizedKey = slugifyPieceType(safeInput) || "peticao_generica";
  const familyKey = FAMILY_DEFINITIONS[normalizedKey] ? normalizedKey : inferFamilyKey(normalizedInput);
  const family = FAMILY_DEFINITIONS[familyKey] || FAMILY_DEFINITIONS.peticao_generica;
  const pieceLabel = FAMILY_DEFINITIONS[normalizedKey]?.label || titleFromSlug(normalizedKey);

  return {
    input: safeInput,
    normalizedKey,
    pieceLabel,
    familyKey,
    familyLabel: family.label,
    templateLookupKeys: Array.from(new Set([normalizedKey, familyKey, ...family.templateFallbacks])),
    requirements: family.requirements,
    documentPriority: family.documentPriority,
    qualityProfile: family.qualityProfile,
    defaultTemplate: family.defaultTemplate,
  };
}
