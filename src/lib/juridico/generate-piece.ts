import { buildHeaders, getLLMClient } from '@/lib/llm-router';
import { supabaseAdmin } from '@/lib/supabase/admin';

export type LegalPieceType =
  | 'peticao_inicial'
  | 'contestacao'
  | 'replica'
  | 'tutela_urgencia'
  | 'apelacao'
  | 'notificacao_extrajudicial';

type ProcessTaskRecord = {
  id: string;
  tenant_id: string;
  stage_id?: string | null;
  title: string;
  client_name?: string | null;
  process_number?: string | null;
  drive_link?: string | null;
  drive_folder_id?: string | null;
  drive_structure_ready?: boolean | null;
};

type ProcessMemoryRecord = {
  summary_master?: string | null;
  missing_documents?: string[] | null;
  key_documents?: unknown;
  key_facts?: unknown;
  current_phase?: string | null;
  document_count?: number | null;
  sync_status?: string | null;
  last_synced_at?: string | null;
};

type ProcessDocumentRecord = {
  id: string;
  drive_file_id?: string | null;
  name: string;
  document_type?: string | null;
  extraction_status?: string | null;
  folder_label?: string | null;
  web_view_link?: string | null;
  modified_at?: string | null;
};

type ProcessDocumentContentRecord = {
  process_document_id: string;
  normalized_text?: string | null;
  excerpt?: string | null;
  extraction_status?: string | null;
};

type TenantLegalTemplateRecord = {
  piece_type: string;
  template_name?: string | null;
  template_mode?: string | null;
  structure_markdown?: string | null;
  guidance_notes?: string | null;
};

type TenantLegalProfileRecord = {
  office_display_name?: string | null;
  default_tone?: string | null;
  citation_style?: string | null;
  signature_block?: string | null;
};

type KeyDocumentRecord = {
  id?: string | null;
};

type KeyFactRecord = {
  label?: string | null;
  value?: string | null;
};

type SelectedProcessDocument = ProcessDocumentRecord & {
  score: number;
  textSnippet: string | null;
};

type PieceRequirement = {
  label: string;
  acceptedDocumentTypes: string[];
};

type PieceResponsePayload = {
  outline?: unknown;
  draft_markdown?: unknown;
  used_document_ids?: unknown;
  missing_documents?: unknown;
  warnings?: unknown;
  confidence_note?: unknown;
  requires_human_review?: unknown;
};

export type GeneratedLegalPiece = {
  pieceType: LegalPieceType;
  pieceLabel: string;
  outline: string[];
  draftMarkdown: string;
  usedDocuments: Array<{
    id: string;
    name: string;
    documentType: string | null;
    folderLabel: string | null;
    webViewLink: string | null;
    modifiedAt: string | null;
  }>;
  missingDocuments: string[];
  warnings: string[];
  confidenceNote: string;
  requiresHumanReview: boolean;
  model: string;
  provider: string;
};

export type GenerateLegalPieceParams = {
  tenantId: string;
  processTaskId: string;
  pieceType: LegalPieceType;
  objective?: string;
  instructions?: string;
  documentIds?: string[];
};

const PIECE_LABELS: Record<LegalPieceType, string> = {
  peticao_inicial: 'Peticao Inicial',
  contestacao: 'Contestacao',
  replica: 'Replica',
  tutela_urgencia: 'Tutela de Urgencia',
  apelacao: 'Apelacao',
  notificacao_extrajudicial: 'Notificacao Extrajudicial',
};

const PIECE_REQUIREMENTS: Record<LegalPieceType, PieceRequirement[]> = {
  peticao_inicial: [
    { label: 'Documentos do cliente', acceptedDocumentTypes: ['documento_cliente', 'prova'] },
  ],
  contestacao: [
    { label: 'Peticao inicial', acceptedDocumentTypes: ['inicial'] },
    { label: 'Documentos do cliente', acceptedDocumentTypes: ['documento_cliente', 'prova'] },
  ],
  replica: [
    { label: 'Peticao inicial', acceptedDocumentTypes: ['inicial'] },
    { label: 'Contestacao', acceptedDocumentTypes: ['contestacao'] },
  ],
  tutela_urgencia: [
    { label: 'Documentos do cliente', acceptedDocumentTypes: ['documento_cliente', 'prova'] },
    { label: 'Provas urgentes', acceptedDocumentTypes: ['prova', 'documento_cliente', 'decisao', 'sentenca'] },
  ],
  apelacao: [
    { label: 'Sentenca ou decisao recorrida', acceptedDocumentTypes: ['sentenca', 'decisao', 'decisao_sentenca'] },
  ],
  notificacao_extrajudicial: [
    { label: 'Documentos de suporte', acceptedDocumentTypes: ['documento_cliente', 'prova', 'geral'] },
  ],
};

const DOCUMENT_PRIORITY: Record<LegalPieceType, Record<string, number>> = {
  peticao_inicial: {
    documento_cliente: 12,
    prova: 10,
    geral: 6,
    manifestacao: 3,
  },
  contestacao: {
    inicial: 14,
    documento_cliente: 11,
    prova: 10,
    decisao: 7,
    sentenca: 6,
    manifestacao: 5,
    geral: 4,
  },
  replica: {
    contestacao: 15,
    inicial: 12,
    prova: 9,
    documento_cliente: 8,
    manifestacao: 6,
    decisao: 5,
  },
  tutela_urgencia: {
    prova: 12,
    documento_cliente: 11,
    decisao: 9,
    sentenca: 7,
    manifestacao: 6,
    geral: 5,
  },
  apelacao: {
    sentenca: 14,
    decisao: 13,
    decisao_sentenca: 13,
    manifestacao: 8,
    recurso: 7,
    prova: 5,
  },
  notificacao_extrajudicial: {
    documento_cliente: 11,
    prova: 10,
    geral: 7,
    manifestacao: 5,
  },
};

const DEFAULT_TEMPLATE_BY_TYPE: Record<LegalPieceType, Pick<TenantLegalTemplateRecord, 'template_name' | 'template_mode' | 'structure_markdown' | 'guidance_notes'>> = {
  peticao_inicial: {
    template_name: 'Modelo Base do Escritorio',
    template_mode: 'visual_profile',
    structure_markdown: 'I - DOS FATOS\nII - DO DIREITO\nIII - DA JURISPRUDENCIA\nIV - DOS PEDIDOS\nV - DO VALOR DA CAUSA\nVI - DAS PROVAS',
    guidance_notes: 'Exigir documentos do cliente, cronologia clara e pedido final com valor da causa.',
  },
  contestacao: {
    template_name: 'Contestacao Padrao',
    template_mode: 'visual_profile',
    structure_markdown: 'I - PRELIMINARES\nII - DO MERITO\nIII - DOS PEDIDOS',
    guidance_notes: 'Sempre exigir a peticao inicial e espelhar os topicos da peca adversaria.',
  },
  replica: {
    template_name: 'Replica Padrao',
    template_mode: 'visual_profile',
    structure_markdown: 'I - DA CONTESTACAO\nII - DA IMPUGNACAO ESPECIFICA\nIII - DOS PEDIDOS FINAIS',
    guidance_notes: 'Exigir inicial e contestacao. Rebater topico por topico.',
  },
  tutela_urgencia: {
    template_name: 'Tutela de Urgencia',
    template_mode: 'visual_profile',
    structure_markdown: 'I - DA PROBABILIDADE DO DIREITO\nII - DO PERIGO DE DANO\nIII - DO PEDIDO LIMINAR',
    guidance_notes: 'Ressaltar fumus boni iuris e periculum in mora com objetividade e impacto.',
  },
  apelacao: {
    template_name: 'Apelacao',
    template_mode: 'visual_profile',
    structure_markdown: 'I - SINTESE DO JULGADO\nII - DAS RAZOES RECURSAIS\nIII - DA JURISPRUDENCIA\nIV - DO PEDIDO',
    guidance_notes: 'Exigir sentenca ou decisao recorrida e delimitar os pontos de reforma pretendida.',
  },
  notificacao_extrajudicial: {
    template_name: 'Notificacao Extrajudicial',
    template_mode: 'visual_profile',
    structure_markdown: 'NOTIFICACAO EXTRAJUDICIAL\n\nExposicao objetiva da situacao\nProvidencia exigida\nPrazo\nConsequencia juridica',
    guidance_notes: 'Texto objetivo, firme e com comando claro ao notificado.',
  },
};

const MAX_SOURCE_DOCUMENTS = 6;
const MAX_TEXT_SNIPPET_CHARS = 3500;

const GLOBAL_LEGAL_STYLE_GUIDE = [
  'MODELO GLOBAL DE REDACAO FORENSE DO MAYUS:',
  '- A peca deve soar como trabalho de advogado brasileiro experiente, nao como resposta de assistente virtual.',
  '- A abertura deve contextualizar o conflito com seguranca, sem floreio e sem repetir o obvio.',
  '- A narrativa dos fatos deve ser cronologica, limpa e orientada ao ponto juridicamente relevante.',
  '- Cada topico de merito deve trazer: fato concreto, leitura juridica do fato e consequencia processual pretendida.',
  '- Evite adjetivacao vazia, latinismos desnecessarios e frases de efeito sem valor tecnico.',
  '- Nao escreva como parecer academico. Escreva como minuta pronta para revisao e protocolo.',
  '- Sempre que possivel, use subtitulos forenses claros e pedidos objetivos, determinados e executaveis.',
  '- Feche a peca com bloco final consistente: requerimentos, provas, protestos cabiveis e assinatura.',
].join('\n');

function normalizeFreeText(value: unknown) {
  return String(value || '').trim();
}

function normalizeDocumentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function sanitizeSnippet(text: string | null | undefined) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function safeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => normalizeFreeText(item)).filter(Boolean);
}

function safeOutline(value: unknown) {
  const items = safeStringArray(value);
  return items.slice(0, 12);
}

function safeWarnings(value: unknown) {
  return safeStringArray(value).slice(0, 12);
}

function safeUsedDocumentIds(value: unknown) {
  return safeStringArray(value);
}

function extractKeyDocumentIds(value: unknown) {
  if (!Array.isArray(value)) return new Set<string>();
  const ids = value
    .map((item) => (item && typeof item === 'object' ? normalizeFreeText((item as KeyDocumentRecord).id) : ''))
    .filter(Boolean);
  return new Set(ids);
}

function formatKeyFacts(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const label = normalizeFreeText((item as KeyFactRecord).label);
      const factValue = normalizeFreeText((item as KeyFactRecord).value);
      if (!label && !factValue) return '';
      return label ? `${label}: ${factValue}` : factValue;
    })
    .filter(Boolean)
    .slice(0, 12);
}

function buildProfileSummary(profile: TenantLegalProfileRecord | null) {
  if (!profile) return 'Perfil juridico padrao do tenant nao configurado.';

  return [
    profile.office_display_name ? `Escritorio: ${profile.office_display_name}` : null,
    profile.default_tone ? `Tom padrao: ${profile.default_tone}` : null,
    profile.citation_style ? `Estilo de citacao: ${profile.citation_style}` : null,
    profile.signature_block ? `Bloco de assinatura: ${profile.signature_block}` : null,
  ]
    .filter(Boolean)
    .join('\n') || 'Perfil juridico padrao do tenant nao configurado.';
}

function buildDocumentScore(params: {
  pieceType: LegalPieceType;
  document: ProcessDocumentRecord;
  textSnippet: string | null;
  selectedIds: Set<string>;
  keyDocumentIds: Set<string>;
}) {
  const { pieceType, document, textSnippet, selectedIds, keyDocumentIds } = params;
  const type = normalizeFreeText(document.document_type).toLowerCase();
  const name = normalizeFreeText(document.name).toLowerCase();
  const folder = normalizeFreeText(document.folder_label).toLowerCase();
  let score = DOCUMENT_PRIORITY[pieceType][type] || 0;

  if (selectedIds.has(document.id)) score += 100;
  if (document.drive_file_id && keyDocumentIds.has(document.drive_file_id)) score += 12;

  switch (document.extraction_status) {
    case 'extracted':
      score += 8;
      break;
    case 'skipped':
      score += 3;
      break;
    case 'error':
      score -= 4;
      break;
    default:
      break;
  }

  if (textSnippet) score += 4;

  if (pieceType === 'contestacao' && /(inicial|peticao inicial)/.test(`${name} ${folder}`)) score += 9;
  if (pieceType === 'replica' && /(contestacao|contestacao)/.test(`${name} ${folder}`)) score += 9;
  if (pieceType === 'apelacao' && /(sentenca|decisao|acordao)/.test(`${name} ${folder}`)) score += 9;
  if (pieceType === 'tutela_urgencia' && /(liminar|urgencia|risco|perigo)/.test(`${name} ${folder}`)) score += 6;
  if (pieceType === 'notificacao_extrajudicial' && /(contrato|inadimpl|comprovante|notificacao)/.test(`${name} ${folder}`)) score += 6;

  return score;
}

function buildMissingDocuments(pieceType: LegalPieceType, documents: ProcessDocumentRecord[], memoryMissing: string[]) {
  const missing = new Set<string>(memoryMissing.filter(Boolean));
  const requirements = PIECE_REQUIREMENTS[pieceType] || [];

  for (const requirement of requirements) {
    const hasAcceptedDocument = documents.some((document) =>
      requirement.acceptedDocumentTypes.includes(normalizeFreeText(document.document_type).toLowerCase())
    );

    if (!hasAcceptedDocument) {
      missing.add(requirement.label);
    }
  }

  return Array.from(missing);
}

function extractResponseText(data: any) {
  if (typeof data?.choices?.[0]?.message?.content === 'string') {
    return data.choices[0].message.content;
  }

  const content = data?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    const text = content
      .map((item) => (item && typeof item === 'object' ? normalizeFreeText((item as { text?: string }).text) : ''))
      .join('\n')
      .trim();
    if (text) return text;
  }

  if (Array.isArray(data?.content)) {
    const text = data.content
      .map((item: any) => normalizeFreeText(item?.text))
      .join('\n')
      .trim();
    if (text) return text;
  }

  return '';
}

function parseJsonPayload(rawText: string) {
  const cleaned = rawText.replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const jsonCandidate = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(jsonCandidate) as PieceResponsePayload;
}

function buildWritingDirectives(pieceType: LegalPieceType, tone: string | null | undefined) {
  const toneText = normalizeFreeText(tone).toLowerCase();
  const base = [
    'Escreva como advogado contencioso brasileiro experiente, sem frases vagas, sem adjetivacao inflada e sem texto escolar.',
    'Prefira periodos claros, tecnicos e assertivos.',
    'Sempre conecte argumento a fato do processo ou ao documento-fonte correspondente.',
    'Nao use expressoes genéricas como "resta claro", "dessa forma" ou "data maxima venia" em excesso.',
    'Quando mencionar fundamento legal, explique sua utilidade no caso concreto antes do pedido.',
    'Se faltar base documental para um ponto, assuma isso expressamente em vez de preencher com suposicao.',
  ];

  if (toneText.includes('combativo')) {
    base.push('Adote tom firme, cirurgico e combativo, sem perder elegancia profissional.');
  } else if (toneText.includes('objetivo')) {
    base.push('Adote tom tecnico, seco e direto, priorizando precisão e economia verbal.');
  } else if (toneText.includes('humanizado')) {
    base.push('Adote tom tecnico com sensibilidade narrativa, sem perder densidade juridica.');
  } else {
    base.push('Adote tom tecnico-persuasivo, com narrativa forense madura e segura.');
  }

  switch (pieceType) {
    case 'contestacao':
      base.push('Na contestacao, enfrente os fatos narrados na inicial ponto a ponto e destaque impugnacao especifica.');
      break;
    case 'replica':
      base.push('Na replica, rebata objetivamente cada argumento relevante da contestacao e mostre por que a defesa nao afasta os fatos constitutivos do direito da parte autora.');
      break;
    case 'apelacao':
      base.push('Na apelacao, identifique com clareza os erros da decisao recorrida e estruture razoes recursais com pedido de reforma preciso.');
      break;
    case 'tutela_urgencia':
      base.push('Na tutela de urgencia, evidencie separadamente probabilidade do direito e perigo de dano com base concreta nos autos.');
      break;
    case 'peticao_inicial':
      base.push('Na peticao inicial, construa narrativa fática consistente, enquadramento juridico e pedidos determinados, evitando tese abstrata desconectada das provas.');
      break;
    default:
      base.push('Mantenha estrutura forense, clareza argumentativa e pedidos juridicamente operacionais.');
      break;
  }

  return base.map((item) => `- ${item}`).join('\n');
}

function buildGlobalPieceReference(pieceType: LegalPieceType) {
  switch (pieceType) {
    case 'replica':
      return [
        'REFERENCIA GLOBAL PARA REPLICA:',
        '- Abrir demonstrando que a contestacao nao afasta os fatos constitutivos do direito da parte autora.',
        '- Impugnar a defesa por blocos logicos, sem copiar a peca adversa integralmente.',
        '- Reforcar documentos centrais do processo e mostrar por que eles permanecem validos apesar da defesa.',
        '- Nos pedidos, requerer expressamente o afastamento das teses defensivas e o integral acolhimento da pretensao autoral.',
      ].join('\n');
    case 'contestacao':
      return [
        'REFERENCIA GLOBAL PARA CONTESTACAO:',
        '- Comecar pela sintese objetiva da inicial e, em seguida, delimitar os pontos efetivamente controvertidos.',
        '- Enfrentar os fatos essenciais da autora com impugnacao especifica e prova correspondente.',
        '- Se houver preliminares, tratá-las com sobriedade e utilidade pratica, sem poluir a peca.',
        '- Encerrar com pedidos defensivos claros, inclusive improcedencia e producao probatoria cabivel.',
      ].join('\n');
    case 'peticao_inicial':
      return [
        'REFERENCIA GLOBAL PARA PETICAO INICIAL:',
        '- Abrir com narrativa fática madura, situando contrato, falha, dano e tentativa de solucao, quando houver.',
        '- Estruturar fundamentos em blocos objetivos, evitando tese solta dissociada da prova.',
        '- Formular pedidos de maneira determinada, com consequencias praticas e valor da causa quando cabivel.',
      ].join('\n');
    case 'apelacao':
      return [
        'REFERENCIA GLOBAL PARA APELACAO:',
        '- Identificar com clareza o erro material, juridico ou valorativo da decisao recorrida.',
        '- Organizar as razoes recursais em capitulos independentes, cada um com tese e pedido de reforma correspondente.',
      ].join('\n');
    case 'tutela_urgencia':
      return [
        'REFERENCIA GLOBAL PARA TUTELA DE URGENCIA:',
        '- Separar com nitidez probabilidade do direito e perigo de dano.',
        '- Mostrar urgencia concreta, imediata e documentada, evitando texto genérico.',
      ].join('\n');
    default:
      return [
        'REFERENCIA GLOBAL DO MAYUS:',
        '- Estruture a peca como minuta pronta para uso forense, com narrativa, fundamentos e pedidos operacionalizaveis.',
      ].join('\n');
  }
}

function buildPrompt(params: {
  task: ProcessTaskRecord;
  pieceType: LegalPieceType;
  memory: ProcessMemoryRecord | null;
  template: TenantLegalTemplateRecord;
  profile: TenantLegalProfileRecord | null;
  selectedDocuments: SelectedProcessDocument[];
  missingDocuments: string[];
  objective: string;
  instructions: string;
}) {
  const { task, pieceType, memory, template, profile, selectedDocuments, missingDocuments, objective, instructions } = params;
  const pieceLabel = PIECE_LABELS[pieceType];
  const keyFacts = formatKeyFacts(memory?.key_facts);
  const writingDirectives = buildWritingDirectives(pieceType, profile?.default_tone);
  const globalPieceReference = buildGlobalPieceReference(pieceType);
  const sourceDocuments = selectedDocuments.length > 0
    ? selectedDocuments.map((document, index) => {
        const snippet = document.textSnippet || 'Sem texto extraido para este arquivo.';
        return [
          `DOCUMENTO ${index + 1}`,
          `id: ${document.id}`,
          `nome: ${document.name}`,
          `tipo: ${document.document_type || 'nao classificado'}`,
          `pasta: ${document.folder_label || 'nao informada'}`,
          `modificado_em: ${document.modified_at || 'nao informado'}`,
          `texto:\n${snippet}`,
        ].join('\n');
      }).join('\n\n')
    : 'Nenhum documento com texto aproveitavel foi encontrado. Trabalhe apenas com a memoria consolidada e deixe placeholders claros para o advogado revisar.';

  return `Voce e o MAYUS, redator juridico de alta precisao do escritorio.

REGRAS ABSOLUTAS:
- Use somente os fatos e documentos fornecidos.
- Nunca invente documento, data, jurisprudencia, pedido, valor ou fato nao presente no contexto.
- Quando faltar base documental, assuma postura conservadora e marque isso nas advertencias.
- Redija em portugues juridico profissional do Brasil.
- Entregue JSON puro, sem markdown fora do campo draft_markdown.

REGIME DE REDACAO FORENSE:
${writingDirectives}

GUIA INSTITUCIONAL GLOBAL:
${GLOBAL_LEGAL_STYLE_GUIDE}

REFERENCIA PADRAO DESTA PECA:
${globalPieceReference}

TAREFA:
Gerar uma ${pieceLabel} com base no processo abaixo.

PROCESSO:
- id: ${task.id}
- titulo: ${task.title}
- cliente: ${task.client_name || 'Nao informado'}
- numero: ${task.process_number || 'Nao informado'}
- fase atual: ${memory?.current_phase || task.stage_id || 'Nao informada'}
- drive estruturado: ${task.drive_structure_ready ? 'sim' : 'nao'}
- status sync: ${memory?.sync_status || 'nao sincronizado'}
- ultima sync: ${memory?.last_synced_at || 'nao informada'}
- quantidade de documentos: ${Number(memory?.document_count || selectedDocuments.length || 0)}

MEMORIA CONSOLIDADA:
${memory?.summary_master || 'Sem resumo mestre consolidado.'}

FATOS-CHAVE:
${keyFacts.length > 0 ? keyFacts.map((fact) => `- ${fact}`).join('\n') : '- Nenhum fato-chave consolidado.'}

DOCUMENTOS/PENDENCIAS FALTANTES:
${missingDocuments.length > 0 ? missingDocuments.map((item) => `- ${item}`).join('\n') : '- Nenhuma pendencia critica detectada.'}

MODELO DO ESCRITORIO:
- nome: ${template.template_name || DEFAULT_TEMPLATE_BY_TYPE[pieceType].template_name}
- modo: ${template.template_mode || DEFAULT_TEMPLATE_BY_TYPE[pieceType].template_mode || 'visual_profile'}
- estrutura base:\n${template.structure_markdown || DEFAULT_TEMPLATE_BY_TYPE[pieceType].structure_markdown || 'Sem estrutura definida.'}
- notas de orientacao: ${template.guidance_notes || DEFAULT_TEMPLATE_BY_TYPE[pieceType].guidance_notes || 'Sem notas adicionais.'}

REGRA DE PRIORIDADE DE ESTILO:
- Se houver orientacao especifica do escritorio, siga-a primeiro.
- Na falta de detalhe suficiente, siga o guia institucional global do MAYUS.
- Nunca abandone a base documental do processo para imitar estilo de forma cega.

PERFIL JURIDICO:
${buildProfileSummary(profile)}

OBJETIVO DO USUARIO:
${objective || 'Gerar um rascunho tecnico consistente e pronto para revisao humana.'}

INSTRUCOES EXTRAS:
${instructions || 'Sem instrucoes extras.'}

DOCUMENTOS-FONTE PRIORIZADOS:
${sourceDocuments}

QUALIDADE MINIMA DO TEXTO FINAL:
- O texto final deve sair pronto para revisao de advogado, nao como brainstorm.
- Use titulos forenses consistentes com a estrutura base do escritorio.
- Desenvolva argumentos com densidade suficiente; evite paragrafo raso de 1 linha quando o tema exigir fundamentacao.
- Se o processo permitir, feche a peca com pedidos objetivos e operacionalizaveis.
- Se houver fragilidade documental, inclua isso em warnings, mas ainda entregue a melhor minuta tecnicamente sustentavel.

RETORNE EXATAMENTE ESTE JSON:
{
  "outline": ["topico 1", "topico 2"],
  "draft_markdown": "texto completo da peca em markdown",
  "used_document_ids": ["uuid"],
  "missing_documents": ["documento faltante"],
  "warnings": ["alerta objetivo para revisao humana"],
  "confidence_note": "frase curta explicando o nivel de confianca do rascunho",
  "requires_human_review": true
}`;
}

export async function generateLegalPiece(params: GenerateLegalPieceParams): Promise<GeneratedLegalPiece> {
  const objective = normalizeFreeText(params.objective);
  const instructions = normalizeFreeText(params.instructions);
  const selectedIds = new Set(normalizeDocumentIds(params.documentIds));

  const { data: task, error: taskError } = await supabaseAdmin
    .from('process_tasks')
    .select('id, tenant_id, stage_id, title, client_name, process_number, drive_link, drive_folder_id, drive_structure_ready')
    .eq('id', params.processTaskId)
    .eq('tenant_id', params.tenantId)
    .maybeSingle<ProcessTaskRecord>();

  if (taskError) throw taskError;
  if (!task) throw new Error('Processo nao encontrado.');

  const [memoryRes, documentsRes, templateRes, profileRes] = await Promise.all([
    supabaseAdmin
      .from('process_document_memory')
      .select('summary_master, missing_documents, key_documents, key_facts, current_phase, document_count, sync_status, last_synced_at')
      .eq('process_task_id', task.id)
      .maybeSingle<ProcessMemoryRecord>(),
    supabaseAdmin
      .from('process_documents')
      .select('id, drive_file_id, name, document_type, extraction_status, folder_label, web_view_link, modified_at')
      .eq('process_task_id', task.id)
      .order('modified_at', { ascending: false }),
    supabaseAdmin
      .from('tenant_legal_templates')
      .select('piece_type, template_name, template_mode, structure_markdown, guidance_notes')
      .eq('tenant_id', params.tenantId)
      .eq('piece_type', params.pieceType)
      .eq('is_active', true)
      .maybeSingle<TenantLegalTemplateRecord>(),
    supabaseAdmin
      .from('tenant_legal_profiles')
      .select('office_display_name, default_tone, citation_style, signature_block')
      .eq('tenant_id', params.tenantId)
      .maybeSingle<TenantLegalProfileRecord>(),
  ]);

  if (memoryRes.error) throw memoryRes.error;
  if (documentsRes.error) throw documentsRes.error;
  if (templateRes.error) throw templateRes.error;
  if (profileRes.error) throw profileRes.error;

  const memory = memoryRes.data || null;
  const documents = (documentsRes.data || []) as ProcessDocumentRecord[];
  const template = {
    piece_type: params.pieceType,
    ...DEFAULT_TEMPLATE_BY_TYPE[params.pieceType],
    ...(templateRes.data || {}),
  } as TenantLegalTemplateRecord;

  const keyDocumentIds = extractKeyDocumentIds(memory?.key_documents);
  const documentIdsToRead = documents.map((document) => document.id);

  const { data: contents, error: contentsError } = documentIdsToRead.length > 0
    ? await supabaseAdmin
        .from('process_document_contents')
        .select('process_document_id, normalized_text, excerpt, extraction_status')
        .in('process_document_id', documentIdsToRead)
    : { data: [], error: null };

  if (contentsError) throw contentsError;

  const contentByDocumentId = new Map(
    ((contents || []) as ProcessDocumentContentRecord[]).map((content) => [content.process_document_id, content])
  );

  const scoredDocuments = documents
    .map((document) => {
      const content = contentByDocumentId.get(document.id);
      const textSnippet = sanitizeSnippet(content?.normalized_text || content?.excerpt).slice(0, MAX_TEXT_SNIPPET_CHARS) || null;
      const score = buildDocumentScore({
        pieceType: params.pieceType,
        document,
        textSnippet,
        selectedIds,
        keyDocumentIds,
      });

      return {
        ...document,
        score,
        textSnippet,
      } satisfies SelectedProcessDocument;
    })
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return new Date(right.modified_at || 0).getTime() - new Date(left.modified_at || 0).getTime();
    });

  const selectedDocuments = scoredDocuments
    .filter((document) => document.score > 0 || selectedIds.has(document.id))
    .slice(0, MAX_SOURCE_DOCUMENTS);

  const missingDocuments = buildMissingDocuments(
    params.pieceType,
    documents,
    Array.isArray(memory?.missing_documents) ? memory!.missing_documents! : []
  );

  const llm = await getLLMClient(supabaseAdmin, params.tenantId, 'gerar_peca');
  const prompt = buildPrompt({
    task,
    pieceType: params.pieceType,
    memory,
    template,
    profile: profileRes.data || null,
    selectedDocuments,
    missingDocuments,
    objective,
    instructions,
  });

  const response = await fetch(llm.endpoint, {
    method: 'POST',
    headers: buildHeaders(llm),
    body: JSON.stringify({
      model: llm.model,
      temperature: 0.2,
      max_tokens: 4000,
      messages: [
        {
          role: 'system',
          content: 'Voce redige pecas juridicas brasileiras com voz de advogado experiente em contencioso. Nunca invente fonte, nunca escreva de forma generica ou escolar e sempre preserve alertas objetivos quando faltar documento essencial.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Falha ao gerar a peca juridica.');
  }

  const data = await response.json();
  const rawText = extractResponseText(data);
  if (!rawText) {
    throw new Error('A IA nao retornou conteudo para a geracao da peca.');
  }

  let parsed: PieceResponsePayload;
  try {
    parsed = parseJsonPayload(rawText);
  } catch {
    throw new Error('A IA retornou um payload invalido para a peca.');
  }

  const outline = safeOutline(parsed.outline);
  const llmMissingDocuments = safeStringArray(parsed.missing_documents);
  const warnings = Array.from(new Set([...safeWarnings(parsed.warnings), ...missingDocuments.map((item) => `Documento pendente: ${item}`)]));
  const combinedMissingDocuments = Array.from(new Set([...missingDocuments, ...llmMissingDocuments]));
  const usedDocumentIds = new Set(safeUsedDocumentIds(parsed.used_document_ids));

  const usedDocuments = (usedDocumentIds.size > 0 ? selectedDocuments.filter((document) => usedDocumentIds.has(document.id)) : selectedDocuments)
    .map((document) => ({
      id: document.id,
      name: document.name,
      documentType: document.document_type || null,
      folderLabel: document.folder_label || null,
      webViewLink: document.web_view_link || null,
      modifiedAt: document.modified_at || null,
    }));

  const confidenceNote = normalizeFreeText(parsed.confidence_note)
    || (combinedMissingDocuments.length > 0
      ? 'Rascunho parcial: faltam documentos essenciais e a revisao humana e obrigatoria.'
      : 'Rascunho consistente com a memoria e os documentos selecionados; revisar antes de protocolar.');

  const draftMarkdown = normalizeFreeText(parsed.draft_markdown);
  if (!draftMarkdown) {
    throw new Error('A IA nao retornou o texto final da peca.');
  }

  return {
    pieceType: params.pieceType,
    pieceLabel: PIECE_LABELS[params.pieceType],
    outline,
    draftMarkdown,
    usedDocuments,
    missingDocuments: combinedMissingDocuments,
    warnings,
    confidenceNote,
    requiresHumanReview: parsed.requires_human_review !== false,
    model: llm.model,
    provider: llm.provider,
  };
}
