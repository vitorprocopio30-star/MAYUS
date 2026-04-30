import { callLLMWithFallback, type LLMFallbackTrace } from '@/lib/llm-fallback';
import type { AINotice } from '@/lib/llm-errors';
import { loadDriveStyleReferencePacket } from '@/lib/juridico/drive-style-examples';
import { MAYUS_LEGAL_SYSTEM_PROMPT } from '@/lib/juridico/mayus-legal-system-prompt';
import {
  normalizeLegalPieceRequest,
  type NormalizedPieceRequest,
} from '@/lib/juridico/piece-catalog';
import { supabaseAdmin } from '@/lib/supabase/admin';

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

type PlannerOutlinePayload = {
  title?: unknown;
  purpose?: unknown;
  must_cover?: unknown;
  min_paragraphs?: unknown;
};

type PiecePlannerResponsePayload = {
  piece_label?: unknown;
  piece_family?: unknown;
  practice_area?: unknown;
  strategy_summary?: unknown;
  outline?: unknown;
  recommended_document_ids?: unknown;
  missing_documents?: unknown;
  warnings?: unknown;
};

type PlannedSection = {
  title: string;
  purpose: string;
  mustCover: string[];
  minParagraphs: number;
};

type PiecePlan = {
  pieceLabel: string;
  pieceFamily: string;
  practiceArea: string | null;
  strategySummary: string;
  outline: PlannedSection[];
  recommendedDocumentIds: string[];
  missingDocuments: string[];
  warnings: string[];
  usedFallbackPlan: boolean;
};

type DraftMetrics = {
  charCount: number;
  wordCount: number;
  paragraphCount: number;
  sectionCount: number;
};

export type GeneratedLegalPiece = {
  pieceType: string;
  pieceLabel: string;
  pieceFamily: string;
  pieceFamilyLabel: string;
  practiceArea: string | null;
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
  aiNotice?: AINotice | null;
  aiFallbackTrace?: LLMFallbackTrace[];
  expansionApplied: boolean;
  qualityMetrics: DraftMetrics;
};

export type GenerateLegalPieceParams = {
  tenantId: string;
  processTaskId: string;
  pieceType: string;
  practiceArea?: string;
  objective?: string;
  instructions?: string;
  documentIds?: string[];
};

type ChatCallParams = {
  tenantId: string;
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
};

type ChatCallResult = {
  text: string;
  provider: string;
  model: string;
  notice?: AINotice;
  fallbackTrace: LLMFallbackTrace[];
};

const MAX_SOURCE_DOCUMENTS = 8;
const MAX_TEXT_SNIPPET_CHARS = 4200;
const MAX_WRITER_TOKENS = 6200;
const MAX_EXPANDER_TOKENS = 3800;
const MAX_PLANNER_TOKENS = 2200;

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
  return value.map((item) => normalizeFreeText(item)).filter(Boolean);
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

function safeBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  return fallback;
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
    .slice(0, 14);
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
  pieceRequest: NormalizedPieceRequest;
  document: ProcessDocumentRecord;
  textSnippet: string | null;
  selectedIds: Set<string>;
  keyDocumentIds: Set<string>;
}) {
  const { pieceRequest, document, textSnippet, selectedIds, keyDocumentIds } = params;
  const type = normalizeFreeText(document.document_type).toLowerCase();
  const name = normalizeFreeText(document.name).toLowerCase();
  const folder = normalizeFreeText(document.folder_label).toLowerCase();
  const familyKey = pieceRequest.familyKey;
  let score = pieceRequest.documentPriority[type] || 0;

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

  if (familyKey === 'contestacao' && /(inicial|peticao inicial)/.test(`${name} ${folder}`)) score += 10;
  if (familyKey === 'replica' && /(contestacao|defesa)/.test(`${name} ${folder}`)) score += 11;
  if (familyKey === 'apelacao' && /(sentenca|decisao|acordao)/.test(`${name} ${folder}`)) score += 9;
  if (familyKey === 'contrarrazoes' && /(apelacao|recurso|razoes)/.test(`${name} ${folder}`)) score += 10;
  if (familyKey === 'tutela_urgencia' && /(liminar|urgencia|risco|perigo)/.test(`${name} ${folder}`)) score += 6;
  if (familyKey === 'cumprimento_sentenca' && /(cumprimento|sentenca|calculo|execucao)/.test(`${name} ${folder}`)) score += 8;
  if (familyKey === 'embargos_execucao' && /(execucao|titulo|penhora)/.test(`${name} ${folder}`)) score += 8;
  if (familyKey === 'memoriais' && /(audiencia|memorial|alegac)/.test(`${name} ${folder}`)) score += 7;
  if (familyKey === 'notificacao_extrajudicial' && /(contrato|inadimpl|comprovante|notificacao)/.test(`${name} ${folder}`)) score += 6;

  return score;
}

function buildMissingDocuments(pieceRequest: NormalizedPieceRequest, documents: ProcessDocumentRecord[], memoryMissing: string[]) {
  const missing = new Set<string>(memoryMissing.filter(Boolean));
  const requirements = pieceRequest.requirements || [];

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

function parseJsonPayload<T>(rawText: string) {
  const cleaned = rawText.replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const jsonCandidate = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(jsonCandidate) as T;
}

function extractResponseText(data: any) {
  if (typeof data?.choices?.[0]?.message?.content === 'string') {
    return data.choices[0].message.content;
  }

  const messageContent = data?.choices?.[0]?.message?.content;
  if (Array.isArray(messageContent)) {
    const text = messageContent
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

function createProviderAwareFetch(systemPrompt: string): typeof fetch {
  return async (input, init) => {
    const endpoint = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!endpoint.includes('api.anthropic.com')) {
      return fetch(input, init);
    }

    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {};
    const messages = Array.isArray(body.messages)
      ? body.messages.filter((message: any) => message?.role !== 'system')
      : [{ role: 'user', content: '' }];

    return fetch(input, {
      ...init,
      body: JSON.stringify({
        model: body.model,
        system: systemPrompt,
        max_tokens: body.max_tokens,
        temperature: body.temperature,
        messages,
      }),
    });
  };
}

async function callTextModel(params: ChatCallParams): Promise<ChatCallResult> {
  const { tenantId, systemPrompt, userPrompt, temperature, maxTokens } = params;
  const aiResult = await callLLMWithFallback<any>({
    supabase: supabaseAdmin,
    tenantId,
    useCase: 'gerar_peca',
    allowNonOpenAICompatible: true,
    request: {
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    },
    timeoutMs: 180000,
    fetchImpl: createProviderAwareFetch(systemPrompt),
  });

  if (aiResult.ok === false) {
    throw new Error(aiResult.notice.message);
  }

  const text = extractResponseText(aiResult.data);
  if (!text) throw new Error('A IA nao retornou conteudo textual.');

  return {
    text,
    provider: aiResult.usedClient.provider,
    model: aiResult.usedClient.model,
    notice: aiResult.notice,
    fallbackTrace: aiResult.fallbackTrace,
  };
}

function buildWritingDirectives(pieceRequest: NormalizedPieceRequest, tone: string | null | undefined) {
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
    base.push('Adote tom tecnico, seco e direto, priorizando precisao e economia verbal.');
  } else if (toneText.includes('humanizado')) {
    base.push('Adote tom tecnico com sensibilidade narrativa, sem perder densidade juridica.');
  } else {
    base.push('Adote tom tecnico-persuasivo, com narrativa forense madura e segura.');
  }

  switch (pieceRequest.familyKey) {
    case 'contestacao':
      base.push('Na contestacao, enfrente os fatos narrados na inicial ponto a ponto e destaque impugnacao especifica.');
      break;
    case 'replica':
      base.push('Na replica, rebata cada argumento relevante da contestacao e mostre por que a defesa nao afasta os fatos constitutivos da autora.');
      break;
    case 'apelacao':
    case 'contrarrazoes':
    case 'recurso_generico':
      base.push('Nos recursos, organize as teses em capitulos independentes, cada um com fundamentacao e pedido correspondente.');
      break;
    case 'tutela_urgencia':
      base.push('Na tutela de urgencia, separe probabilidade do direito e perigo de dano com base concreta nos autos.');
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

function buildGlobalPieceReference(pieceRequest: NormalizedPieceRequest) {
  switch (pieceRequest.familyKey) {
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
        '- Se houver preliminares, trata-las com sobriedade e utilidade pratica, sem poluir a peca.',
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
    case 'contrarrazoes':
      return [
        'REFERENCIA GLOBAL PARA PECA RECURSAL:',
        '- Identificar com clareza o erro material, juridico ou valorativo da decisao recorrida ou do recurso adverso.',
        '- Organizar as razoes recursais em capitulos independentes, cada um com tese e pedido de reforma ou desprovimento correspondente.',
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

function outlineFallbackFromTemplate(pieceRequest: NormalizedPieceRequest, structureMarkdown: string) {
  const sections = structureMarkdown
    .split(/\n+/)
    .map((line) => normalizeFreeText(line).replace(/^[-*]\s*/, ''))
    .filter(Boolean)
    .slice(0, 12)
    .map((line) => ({
      title: line,
      purpose: 'Desenvolver o capitulo com base documental e articulacao juridica completa.',
      mustCover: ['fatos relevantes', 'fundamentos aplicaveis', 'consequencia processual'],
      minParagraphs: Math.max(2, Math.ceil(pieceRequest.qualityProfile.minParagraphs / Math.max(1, pieceRequest.qualityProfile.minSections))),
    }));

  return sections.length > 0 ? sections : [{
    title: 'DOS FUNDAMENTOS E PEDIDOS',
    purpose: 'Estruturar a tese principal e concluir com pedidos claros.',
    mustCover: ['fatos', 'direito', 'pedido'],
    minParagraphs: 3,
  }];
}

function normalizePlannerOutline(value: unknown, pieceRequest: NormalizedPieceRequest, structureMarkdown: string) {
  if (!Array.isArray(value)) {
    return outlineFallbackFromTemplate(pieceRequest, structureMarkdown);
  }

  const normalized = value
    .map((item) => {
      if (typeof item === 'string') {
        const title = normalizeFreeText(item);
        if (!title) return null;
        return {
          title,
          purpose: 'Desenvolver o capitulo com profundidade e aderencia documental.',
          mustCover: ['fatos relevantes', 'fundamentos aplicaveis'],
          minParagraphs: 2,
        } satisfies PlannedSection;
      }

      if (!item || typeof item !== 'object') return null;
      const payload = item as PlannerOutlinePayload;
      const title = normalizeFreeText(payload.title);
      if (!title) return null;
      return {
        title,
        purpose: normalizeFreeText(payload.purpose) || 'Desenvolver o capitulo com profundidade e aderencia documental.',
        mustCover: safeStringArray(payload.must_cover).slice(0, 6),
        minParagraphs: Math.max(2, Number(payload.min_paragraphs || 2) || 2),
      } satisfies PlannedSection;
    })
    .filter(Boolean) as PlannedSection[];

  if (normalized.length === 0) {
    return outlineFallbackFromTemplate(pieceRequest, structureMarkdown);
  }

  return normalized;
}

function buildPlanningPrompt(params: {
  task: ProcessTaskRecord;
  pieceRequest: NormalizedPieceRequest;
  practiceArea: string;
  memory: ProcessMemoryRecord | null;
  template: TenantLegalTemplateRecord;
  profile: TenantLegalProfileRecord | null;
  selectedDocuments: SelectedProcessDocument[];
  styleReferencePacket: string;
  missingDocuments: string[];
  objective: string;
  instructions: string;
}) {
  const { task, pieceRequest, practiceArea, memory, template, profile, selectedDocuments, styleReferencePacket, missingDocuments, objective, instructions } = params;
  const keyFacts = formatKeyFacts(memory?.key_facts);
  const sourceDocuments = selectedDocuments.length > 0
    ? selectedDocuments.map((document, index) => {
        const snippet = document.textSnippet || 'Sem texto extraido para este arquivo.';
        return [
          `DOCUMENTO ${index + 1}`,
          `id: ${document.id}`,
          `nome: ${document.name}`,
          `tipo: ${document.document_type || 'nao classificado'}`,
          `pasta: ${document.folder_label || 'nao informada'}`,
          `texto:\n${snippet}`,
        ].join('\n');
      }).join('\n\n')
    : 'Nenhum documento com texto aproveitavel foi encontrado. Trabalhe apenas com a memoria consolidada e deixe lacunas claras.';

  return `Voce e o planner juridico do MAYUS. Sua funcao e desenhar uma peca robusta, nao escrever a peca final.

REGRAS ABSOLUTAS:
- Use somente os fatos e documentos fornecidos.
- Nunca invente documento, data, jurisprudencia, pedido, valor ou fato nao presente no contexto.
- Modele a profundidade necessaria para uma minuta profissional, evitando outline raso.
- Entregue JSON puro.

PROCESSO:
- titulo: ${task.title}
- cliente: ${task.client_name || 'Nao informado'}
- numero: ${task.process_number || 'Nao informado'}
- fase atual: ${memory?.current_phase || task.stage_id || 'Nao informada'}
- area do direito: ${practiceArea || 'Nao informada'}

PECA SOLICITADA:
- texto pedido pelo usuario: ${pieceRequest.input}
- slug normalizado: ${pieceRequest.normalizedKey}
- familia inferida: ${pieceRequest.familyLabel}

MEMORIA CONSOLIDADA:
${memory?.summary_master || 'Sem resumo mestre consolidado.'}

FATOS-CHAVE:
${keyFacts.length > 0 ? keyFacts.map((fact) => `- ${fact}`).join('\n') : '- Nenhum fato-chave consolidado.'}

MODELO DO ESCRITORIO:
- nome: ${template.template_name || pieceRequest.defaultTemplate.templateName}
- estrutura base:\n${template.structure_markdown || pieceRequest.defaultTemplate.structureMarkdown}
- notas de orientacao: ${template.guidance_notes || pieceRequest.defaultTemplate.guidanceNotes}

MODELOS INSTITUCIONAIS DO DRIVE:
${styleReferencePacket}

PERFIL JURIDICO:
${buildProfileSummary(profile)}

OBJETIVO:
${objective || 'Gerar uma minuta robusta, pronta para revisao humana.'}

INSTRUCOES EXTRAS:
${instructions || 'Sem instrucoes extras.'}

PENDENCIAS DOCUMENTAIS:
${missingDocuments.length > 0 ? missingDocuments.map((item) => `- ${item}`).join('\n') : '- Nenhuma pendencia critica detectada.'}

DOCUMENTOS-FONTE:
${sourceDocuments}

QUALIDADE OBRIGATORIA DO PLANO:
- No minimo ${pieceRequest.qualityProfile.minSections} secoes de merito/estrutura.
- Outline robusto, com sequencia logica e enfrentamento especifico do problema processual.
- Indique os documentos mais relevantes pelos ids recebidos.

RETORNE EXATAMENTE ESTE JSON:
{
  "piece_label": "nome final da peca em pt-BR",
  "piece_family": "familia inferida",
  "practice_area": "area do direito",
  "strategy_summary": "2-4 frases objetivas sobre a linha mestra da peca",
  "outline": [
    {
      "title": "titulo da secao",
      "purpose": "para que a secao serve",
      "must_cover": ["ponto 1", "ponto 2"],
      "min_paragraphs": 2
    }
  ],
  "recommended_document_ids": ["uuid"],
  "missing_documents": ["documento faltante"],
  "warnings": ["alerta objetivo"]
}`;
}

function buildWriterPrompt(params: {
  task: ProcessTaskRecord;
  pieceRequest: NormalizedPieceRequest;
  practiceArea: string;
  memory: ProcessMemoryRecord | null;
  template: TenantLegalTemplateRecord;
  profile: TenantLegalProfileRecord | null;
  plan: PiecePlan;
  selectedDocuments: SelectedProcessDocument[];
  styleReferencePacket: string;
  objective: string;
  instructions: string;
}) {
  const { task, pieceRequest, practiceArea, memory, template, profile, plan, selectedDocuments, styleReferencePacket, objective, instructions } = params;
  const writingDirectives = buildWritingDirectives(pieceRequest, profile?.default_tone);
  const globalPieceReference = buildGlobalPieceReference(pieceRequest);
  const sourceDocuments = selectedDocuments.length > 0
    ? selectedDocuments.map((document, index) => {
        const snippet = document.textSnippet || 'Sem texto extraido para este arquivo.';
        return [
          `DOCUMENTO ${index + 1}`,
          `id: ${document.id}`,
          `nome: ${document.name}`,
          `tipo: ${document.document_type || 'nao classificado'}`,
          `pasta: ${document.folder_label || 'nao informada'}`,
          `texto:\n${snippet}`,
        ].join('\n');
      }).join('\n\n')
    : 'Nenhum documento com texto aproveitavel foi encontrado. Trabalhe apenas com a memoria consolidada e deixe lacunas claras.';

  const outlineText = plan.outline.map((section, index) => {
    const mustCover = section.mustCover.length > 0 ? section.mustCover.join('; ') : 'desenvolvimento livre orientado ao objetivo processual';
    return `${index + 1}. ${section.title}\n- finalidade: ${section.purpose}\n- cobrir: ${mustCover}\n- paragrafo minimo sugerido: ${section.minParagraphs}`;
  }).join('\n\n');

  return `Voce e o redator juridico senior do MAYUS. Sua tarefa e redigir a peca completa em markdown.

REGRAS ABSOLUTAS:
- Use somente os fatos e documentos fornecidos.
- Nunca invente documento, data, jurisprudencia, pedido, valor ou fato nao presente no contexto.
- Nao resuma. Nao entregue minuta curta. Desenvolva cada secao com densidade de advogado experiente.
- Nao devolva explicacoes fora da peca. Retorne somente markdown da minuta.

REGIME DE REDACAO FORENSE:
${writingDirectives}

GUIA INSTITUCIONAL GLOBAL:
${GLOBAL_LEGAL_STYLE_GUIDE}

REFERENCIA PADRAO DESTA PECA:
${globalPieceReference}

PROCESSO:
- titulo: ${task.title}
- cliente: ${task.client_name || 'Nao informado'}
- numero: ${task.process_number || 'Nao informado'}
- fase atual: ${memory?.current_phase || task.stage_id || 'Nao informada'}
- area do direito: ${practiceArea || 'Nao informada'}

PECA:
- nome final: ${plan.pieceLabel}
- texto pedido pelo usuario: ${pieceRequest.input}
- familia: ${plan.pieceFamily}

MODELO DO ESCRITORIO:
- nome: ${template.template_name || pieceRequest.defaultTemplate.templateName}
- estrutura base:\n${template.structure_markdown || pieceRequest.defaultTemplate.structureMarkdown}
- notas de orientacao: ${template.guidance_notes || pieceRequest.defaultTemplate.guidanceNotes}

MODELOS INSTITUCIONAIS DO DRIVE:
${styleReferencePacket}

OBJETIVO:
${objective || 'Gerar minuta robusta, pronta para revisao profissional.'}

INSTRUCOES EXTRAS:
${instructions || 'Sem instrucoes extras.'}

ESTRATEGIA DA PECA:
${plan.strategySummary}

OUTLINE OBRIGATORIO:
${outlineText}

PENDENCIAS DOCUMENTAIS:
${plan.missingDocuments.length > 0 ? plan.missingDocuments.map((item) => `- ${item}`).join('\n') : '- Nenhuma pendencia critica detectada.'}

ALERTAS:
${plan.warnings.length > 0 ? plan.warnings.map((item) => `- ${item}`).join('\n') : '- Nenhum alerta especifico adicional.'}

MEMORIA CONSOLIDADA:
${memory?.summary_master || 'Sem resumo mestre consolidado.'}

DOCUMENTOS-FONTE PRIORITARIOS:
${sourceDocuments}

PISO DE QUALIDADE OBRIGATORIO:
- No minimo ${pieceRequest.qualityProfile.minSections} secoes relevantes.
- No minimo ${pieceRequest.qualityProfile.minParagraphs} paragrafos de desenvolvimento no corpo da peca.
- No minimo ${pieceRequest.qualityProfile.minChars} caracteres aproximados.
- Cada secao deve sair madura, com conexao entre fatos, prova e consequencia juridica.
- Se a peca for contestacao, replica, contrarrazoes ou outra resposta, enfrente a peca adversa ponto a ponto quando isso estiver no contexto.
- Feche com requerimentos e pedidos finais operacionais.
- Siga o nivel de densidade, hierarquia de titulos e cadencia argumentativa observados nos modelos institucionais do Drive, sem copiar fatos ou nomes deles.

RETORNE SOMENTE O MARKDOWN FINAL DA PECA.`;
}

function buildExpansionPrompt(params: {
  pieceRequest: NormalizedPieceRequest;
  plan: PiecePlan;
  draftMarkdown: string;
  metrics: DraftMetrics;
}) {
  const { pieceRequest, plan, draftMarkdown, metrics } = params;
  return `Voce recebeu uma peca juridica ainda curta ou superficial. Sua tarefa e expandi-la sem inventar fatos ou documentos.

PECA:
- nome: ${plan.pieceLabel}
- familia: ${plan.pieceFamily}

OUTLINE OBRIGATORIO:
${plan.outline.map((section, index) => `${index + 1}. ${section.title} - ${section.purpose}`).join('\n')}

METRICAS ATUAIS:
- caracteres: ${metrics.charCount}
- palavras: ${metrics.wordCount}
- paragrafos: ${metrics.paragraphCount}
- secoes: ${metrics.sectionCount}

PISO DE QUALIDADE:
- caracteres minimos: ${pieceRequest.qualityProfile.minChars}
- paragrafos minimos: ${pieceRequest.qualityProfile.minParagraphs}
- secoes minimas: ${pieceRequest.qualityProfile.minSections}

INSTRUCOES:
- Amplie as secoes que estiverem rasas.
- Acrescente fundamentacao argumentativa e conexao com os documentos ja mencionados.
- Mantenha o estilo forense profissional.
- Nao devolva explicacoes. Retorne somente markdown.

TEXTO ATUAL:\n${draftMarkdown}`;
}

function normalizePiecePlan(params: {
  pieceRequest: NormalizedPieceRequest;
  template: TenantLegalTemplateRecord;
  plannerPayload: PiecePlannerResponsePayload | null;
  practiceArea: string;
  missingDocuments: string[];
}) {
  const { pieceRequest, template, plannerPayload, practiceArea, missingDocuments } = params;
  const outline = normalizePlannerOutline(plannerPayload?.outline, pieceRequest, template.structure_markdown || pieceRequest.defaultTemplate.structureMarkdown);
  const strategySummary = normalizeFreeText(plannerPayload?.strategy_summary)
    || 'Organizar a peca com narrativa processual madura, enfrentamento especifico dos pontos controvertidos e pedidos finais tecnicamente operacionais.';

  return {
    pieceLabel: normalizeFreeText(plannerPayload?.piece_label) || pieceRequest.pieceLabel,
    pieceFamily: normalizeFreeText(plannerPayload?.piece_family) || pieceRequest.familyLabel,
    practiceArea: normalizeFreeText(plannerPayload?.practice_area) || normalizeFreeText(practiceArea) || null,
    strategySummary,
    outline,
    recommendedDocumentIds: normalizeDocumentIds(plannerPayload?.recommended_document_ids),
    missingDocuments: Array.from(new Set([...missingDocuments, ...safeStringArray(plannerPayload?.missing_documents)])),
    warnings: safeStringArray(plannerPayload?.warnings),
    usedFallbackPlan: !plannerPayload,
  } satisfies PiecePlan;
}

function computeDraftMetrics(markdown: string): DraftMetrics {
  const clean = normalizeFreeText(markdown);
  const paragraphs = clean
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => /[A-Za-zÀ-ÿ]/.test(block));
  const sectionCount = clean
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(#{1,6}\s+|[IVXLCDM]+\s*[-–—]|[A-Z][A-Z\s]{5,}$)/.test(line)).length;
  const wordCount = clean.split(/\s+/).filter(Boolean).length;

  return {
    charCount: clean.length,
    wordCount,
    paragraphCount: paragraphs.length,
    sectionCount,
  };
}

function isDraftTooShallow(pieceRequest: NormalizedPieceRequest, metrics: DraftMetrics) {
  return (
    metrics.charCount < pieceRequest.qualityProfile.minChars
    || metrics.paragraphCount < pieceRequest.qualityProfile.minParagraphs
    || metrics.sectionCount < pieceRequest.qualityProfile.minSections
  );
}

function buildUsedDocuments(selectedDocuments: SelectedProcessDocument[]) {
  return selectedDocuments.map((document) => ({
    id: document.id,
    name: document.name,
    documentType: document.document_type || null,
    folderLabel: document.folder_label || null,
    webViewLink: document.web_view_link || null,
    modifiedAt: document.modified_at || null,
  }));
}

export async function generateLegalPiece(params: GenerateLegalPieceParams): Promise<GeneratedLegalPiece> {
  const objective = normalizeFreeText(params.objective);
  const instructions = normalizeFreeText(params.instructions);
  const practiceArea = normalizeFreeText(params.practiceArea);
  const selectedIds = new Set(normalizeDocumentIds(params.documentIds));
  const pieceRequest = normalizeLegalPieceRequest(params.pieceType);

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
      .in('piece_type', pieceRequest.templateLookupKeys),
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
  const fetchedTemplates = (templateRes.data || []) as TenantLegalTemplateRecord[];
  const template = {
    piece_type: pieceRequest.normalizedKey,
    template_name: pieceRequest.defaultTemplate.templateName,
    template_mode: 'visual_profile',
    structure_markdown: pieceRequest.defaultTemplate.structureMarkdown,
    guidance_notes: pieceRequest.defaultTemplate.guidanceNotes,
    ...(fetchedTemplates.find((item) => item.piece_type === pieceRequest.normalizedKey)
      || fetchedTemplates.find((item) => item.piece_type === pieceRequest.familyKey)
      || fetchedTemplates[0]
      || {}),
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
        pieceRequest,
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

  const initiallySelectedDocuments = scoredDocuments
    .filter((document) => document.score > 0 || selectedIds.has(document.id))
    .slice(0, MAX_SOURCE_DOCUMENTS);

  const missingDocuments = buildMissingDocuments(
    pieceRequest,
    documents,
    Array.isArray(memory?.missing_documents) ? memory.missing_documents : []
  );

  const styleReferencePacket = await loadDriveStyleReferencePacket({
    tenantId: params.tenantId,
    pieceInput: pieceRequest.input,
    familyLabel: pieceRequest.familyLabel,
  });

  const plannerSystemPrompt = `${MAYUS_LEGAL_SYSTEM_PROMPT}

MODO ATUAL: PLANNER JURIDICO
- Sua funcao nesta chamada e apenas planejar a peca.
- Entregue somente JSON puro.
- Nao escreva a peca final nesta etapa.
- Estruture um plano robusto, profissional e litigante.`;
  const writerSystemPrompt = `${MAYUS_LEGAL_SYSTEM_PROMPT}

MODO ATUAL: REDATOR JURIDICO
- Sua funcao nesta chamada e redigir a peca completa.
- Entregue somente markdown da minuta final.
- Nao explique o que esta fazendo.
- Escreva como advogado da Dutra Advocacia, com densidade, maturidade e aderencia documental.`;

  const aiNotices: AINotice[] = [];
  const aiFallbackTrace: LLMFallbackTrace[] = [];
  let usedModel = '';
  let usedProvider = '';
  const registerAIResult = (result: ChatCallResult) => {
    usedModel = result.model;
    usedProvider = result.provider;
    if (result.notice) aiNotices.push(result.notice);
    aiFallbackTrace.push(...result.fallbackTrace);
  };

  let planPayload: PiecePlannerResponsePayload | null = null;
  try {
    const plannerResult = await callTextModel({
      tenantId: params.tenantId,
      systemPrompt: plannerSystemPrompt,
      userPrompt: buildPlanningPrompt({
        task,
        pieceRequest,
        practiceArea,
        memory,
        template,
        profile: profileRes.data || null,
        selectedDocuments: initiallySelectedDocuments,
        styleReferencePacket: styleReferencePacket.packet,
        missingDocuments,
        objective,
        instructions,
      }),
      temperature: 0.1,
      maxTokens: MAX_PLANNER_TOKENS,
    });
    registerAIResult(plannerResult);
    planPayload = parseJsonPayload<PiecePlannerResponsePayload>(plannerResult.text);
  } catch {
    planPayload = null;
  }

  const plan = normalizePiecePlan({
    pieceRequest,
    template,
    plannerPayload: planPayload,
    practiceArea,
    missingDocuments,
  });

  const selectedDocuments = (
    plan.recommendedDocumentIds.length > 0
      ? initiallySelectedDocuments.filter((document) => plan.recommendedDocumentIds.includes(document.id))
      : initiallySelectedDocuments
  );
  const writerPrompt = buildWriterPrompt({
    task,
    pieceRequest,
    practiceArea: plan.practiceArea || practiceArea,
    memory,
    template,
    profile: profileRes.data || null,
    plan,
    selectedDocuments: selectedDocuments.length > 0 ? selectedDocuments : initiallySelectedDocuments,
    styleReferencePacket: styleReferencePacket.packet,
    objective,
    instructions,
  });

  const writerResult = await callTextModel({
    tenantId: params.tenantId,
    systemPrompt: writerSystemPrompt,
    userPrompt: writerPrompt,
    temperature: 0.2,
    maxTokens: MAX_WRITER_TOKENS,
  });
  registerAIResult(writerResult);
  let draftMarkdown = normalizeFreeText(writerResult.text);

  if (!draftMarkdown) {
    throw new Error('A IA nao retornou o texto final da peca.');
  }

  let metrics = computeDraftMetrics(draftMarkdown);
  let expansionApplied = false;
  if (isDraftTooShallow(pieceRequest, metrics)) {
    const expansionResult = await callTextModel({
      tenantId: params.tenantId,
      systemPrompt: writerSystemPrompt,
      userPrompt: buildExpansionPrompt({ pieceRequest, plan, draftMarkdown, metrics }),
      temperature: 0.15,
      maxTokens: MAX_EXPANDER_TOKENS,
    });
    registerAIResult(expansionResult);
    draftMarkdown = normalizeFreeText(expansionResult.text);
    metrics = computeDraftMetrics(draftMarkdown);
    expansionApplied = true;
  }

  const warnings = Array.from(new Set([
    ...styleReferencePacket.warnings,
    ...plan.warnings,
    ...plan.missingDocuments.map((item) => `Documento pendente: ${item}`),
    ...(plan.usedFallbackPlan ? ['Planner de peca caiu em fallback local; revisar a estrutura gerada.'] : []),
    ...(isDraftTooShallow(pieceRequest, metrics) ? ['A minuta final ainda ficou abaixo do piso ideal de profundidade e precisa de revisao reforcada.'] : []),
  ]));

  const confidenceNote = plan.strategySummary
    || (plan.missingDocuments.length > 0
      ? 'Rascunho parcial: faltam documentos essenciais e a revisao humana e obrigatoria.'
      : 'Rascunho consistente com a memoria e os documentos selecionados; revisar antes de protocolar.');

  return {
    pieceType: pieceRequest.normalizedKey,
    pieceLabel: plan.pieceLabel,
    pieceFamily: pieceRequest.familyKey,
    pieceFamilyLabel: pieceRequest.familyLabel,
    practiceArea: plan.practiceArea || practiceArea || null,
    outline: plan.outline.map((section) => section.title),
    draftMarkdown,
    usedDocuments: buildUsedDocuments(selectedDocuments.length > 0 ? selectedDocuments : initiallySelectedDocuments),
    missingDocuments: plan.missingDocuments,
    warnings,
    confidenceNote,
    requiresHumanReview: safeBoolean(true, true),
    model: usedModel,
    provider: usedProvider,
    aiNotice: aiNotices[0] || null,
    aiFallbackTrace,
    expansionApplied,
    qualityMetrics: metrics,
  };
}
