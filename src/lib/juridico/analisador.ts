import { createClient } from '@supabase/supabase-js'
import { callLLMWithFallback } from '@/lib/llm-fallback'
import { prepareProactiveMovementDraft } from '@/lib/lex/proactive-movement-draft'
import {
  buildMayusAgentProfileExplanation,
  evaluateMayusAgentProfile,
} from '@/lib/agent/runtime/agent-profiles'
import {
  createHermesMissionTrajectory,
  recordHermesMissionApproval,
  recordHermesMissionDecision,
  recordHermesMissionResult,
} from '@/lib/agent/runtime/trajectory'
import {
  buildProcessCardClientName,
  buildProcessCardDescription,
  buildProcessCardTitle,
} from '@/lib/juridico/process-card-context'
import {
  chooseSemanticLegalStage,
  resolveProcessPipelineContext,
} from '@/lib/juridico/process-pipeline-resolver'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const KEYWORDS: Record<string, string> = {
  'contestacao': 'CONTESTACAO', 'contestou': 'CONTESTACAO',
  'sentenca': 'SENTENCA', 'sentenciou': 'SENTENCA',
  'julgou procedente': 'SENTENCA', 'julgou improcedente': 'SENTENCA',
  'acordao': 'SENTENCA', 'v.u.': 'SENTENCA',
  'recurso': 'RECURSO', 'apelacao': 'RECURSO', 'apelou': 'RECURSO',
  'embargos': 'RECURSO', 'agravo': 'RECURSO',
  'audiencia': 'AUDIENCIA', 'designada audiencia': 'AUDIENCIA', 'pauta': 'AUDIENCIA',
  'despacho': 'DESPACHO', 'concluso': 'DESPACHO', 'determino': 'DESPACHO',
  'citacao': 'CITACAO', 'citado': 'CITACAO', 'cite-se': 'CITACAO', 'mandado': 'CITACAO',
  'arquivado': 'ARQUIVAMENTO', 'arquivamento': 'ARQUIVAMENTO', 'baixa definitiva': 'ARQUIVAMENTO',
  'extinto': 'EXTINCAO', 'extincao': 'EXTINCAO', 'homologado': 'EXTINCAO'
}

const HIGH_SIGNAL_PATTERNS = [
  /prazo/i,
  /intimac/i,
  /citac/i,
  /contestac/i,
  /apela(c|ç)ao/i,
  /contrarrazo/i,
  /embargos?/i,
  /audienc/i,
  /sentenc/i,
  /recurso/i,
  /agravo/i,
]

const LOW_SIGNAL_PATTERNS = [
  /juntada/i,
  /certid(a|ã)o/i,
  /mero expediente/i,
  /decurso de prazo/i,
  /protocolo/i,
  /remessa/i,
  /redistribuic/i,
  /expediente/i,
]

function isLikelyLowSignalMovement(texto: string): boolean {
  if (!texto.trim()) return true
  const hasHighSignal = HIGH_SIGNAL_PATTERNS.some((pattern) => pattern.test(texto))
  if (hasHighSignal) return false
  return LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(texto))
}

type PartesProcesso = {
  polo_ativo?: string
  polo_passivo?: string
} | null

type MovimentacaoHistorica = {
  data?: string
  descricao?: string
  conteudo?: string
}

type MonitoredProcessContext = {
  numero_processo: string | null
  resumo_curto: string | null
  cliente_nome: string | null
  tribunal: string | null
  classe_processual?: string | null
  partes: PartesProcesso
  movimentacoes: MovimentacaoHistorica[] | null
  advogado_responsavel_id?: string | null
  linked_task_id?: string | null
}

type AnalisePrazoLLM =
  | { gerar: false; motivo: string }
  | {
      gerar: true
      tipo: 'prazo' | 'audiencia' | 'recurso' | 'citacao' | 'sentenca'
      descricao: string
      data_vencimento?: string
      urgencia?: 'alta' | 'media' | 'baixa'
      motivo: string
    }

type PrazoExplicito = {
  dias: number
  descricao: string
  vencimento: Date
  evidencia: string
}

type PoloRepresentado = 'autor' | 'reu' | 'indeterminado'
type ObrigacaoMovimentacao = 'escritorio' | 'cliente' | 'parte_contraria' | 'indeterminada'

type AnaliseMovimentacaoPayload = {
  tipo_evento: string | null
  requer_acao: boolean
  acao_sugerida: string | null
  prazo_extraido_dias: number | null
  data_vencimento_extraida: string | null
  confianca_analise: 'alta' | 'media' | 'baixa'
  confidence?: 'alta' | 'media' | 'baixa'
  origem: 'deterministica' | 'llm' | 'heuristica' | 'ignorada'
  motivo: string
  polo_representado?: PoloRepresentado | null
  obrigacao_de_quem?: ObrigacaoMovimentacao | null
  confidence_reason?: string | null
  evidencia?: string | null
  review_required?: boolean
  agentic_governance?: Record<string, unknown> | null
}

type MovementDutyAssessment = {
  polo_representado: PoloRepresentado
  obrigacao_de_quem: ObrigacaoMovimentacao
  confidence: AnaliseMovimentacaoPayload['confianca_analise']
  confidence_reason: string
  evidencia?: string | null
}

export type AnaliseMovimentacaoResult = AnaliseMovimentacaoPayload & {
  automation_status: 'none' | 'review_required' | 'deadline_card_created' | 'duplicate_skipped'
  requires_human_review: boolean
  paid_summary_recommended: boolean
  process_task_id?: string | null
}

function shouldRecommendPaidSummary(payload: AnaliseMovimentacaoPayload): boolean {
  if (payload.origem === 'ignorada') return false
  if (payload.confianca_analise === 'baixa') return false
  if (payload.tipo_evento === 'ARQUIVAMENTO' || payload.tipo_evento === 'EXTINCAO') return false
  return payload.requer_acao || ['PRAZO', 'AUDIENCIA', 'RECURSO', 'CITACAO', 'SENTENCA'].includes(String(payload.tipo_evento || ''))
}

function buildAnaliseResult(
  payload: AnaliseMovimentacaoPayload,
  automationStatus: AnaliseMovimentacaoResult['automation_status'],
  processTaskId?: string | null
): AnaliseMovimentacaoResult {
  const normalizedPayload = normalizeAnalysisPayload(payload, automationStatus === 'review_required')
  return {
    ...normalizedPayload,
    automation_status: automationStatus,
    requires_human_review: automationStatus === 'review_required',
    paid_summary_recommended: shouldRecommendPaidSummary(normalizedPayload),
    process_task_id: processTaskId ?? null,
  }
}

function normalizeAnalysisPayload(
  payload: AnaliseMovimentacaoPayload,
  reviewRequired = payload.review_required ?? false
): AnaliseMovimentacaoPayload {
  const basePayload = {
    ...payload,
    confidence: payload.confidence ?? payload.confianca_analise,
    confidence_reason: payload.confidence_reason ?? payload.motivo,
    review_required: reviewRequired,
  }

  return {
    ...basePayload,
    agentic_governance: payload.agentic_governance ?? buildMovementAgenticGovernance(basePayload),
  }
}

function buildMovementAgenticGovernance(payload: AnaliseMovimentacaoPayload): Record<string, unknown> {
  const reviewRequired = payload.review_required === true
  const tool = reviewRequired ? 'legal_movement_review_required' : 'legal_movement_internal_analysis'
  const surface = reviewRequired ? 'legal_decision' : 'internal'
  const openclawDecision = evaluateMayusAgentProfile({
    agentId: 'lex',
    module: 'legal_ops',
    channel: 'juridico',
    tool,
    surface,
  })
  const openclawExplanation = buildMayusAgentProfileExplanation(openclawDecision)
  const missionId = `lex:movement:${payload.tipo_evento || 'unknown'}:${payload.origem}`

  let trajectory = createHermesMissionTrajectory({
    missionId,
    objective: 'Classificar movimentacao processual com governanca supervisionada.',
    payload: {
      tipo_evento: payload.tipo_evento,
      origem: payload.origem,
      polo_representado: payload.polo_representado ?? null,
      obrigacao_de_quem: payload.obrigacao_de_quem ?? null,
    },
    actor: { id: 'lex', role: 'agent' },
  })

  trajectory = recordHermesMissionDecision(trajectory, {
    summary: payload.motivo,
    payload: {
      confidence: payload.confidence ?? payload.confianca_analise,
      confidence_reason: payload.confidence_reason ?? payload.motivo,
      openclaw_policy: openclawExplanation,
      review_required: reviewRequired,
    },
    actor: { id: 'lex', role: 'agent' },
  })

  trajectory = reviewRequired
    ? recordHermesMissionApproval(trajectory, {
        summary: 'Movimentacao juridica enviada para supervisao humana.',
        decision: 'requested',
        payload: {
          reason: payload.confidence_reason ?? payload.motivo,
        },
        actor: { id: 'lex', role: 'agent' },
      })
    : recordHermesMissionResult(trajectory, {
        summary: 'Movimentacao juridica classificada sem aprovacao humana obrigatoria.',
        payload: {
          automation_safe: payload.requer_acao === false || payload.confianca_analise === 'alta',
        },
        actor: { id: 'lex', role: 'agent' },
      })

  return {
    version: 1,
    openclaw_policy: openclawExplanation,
    hermes_trajectory: {
      mission_id: trajectory.missionId,
      status: trajectory.status,
      events: trajectory.events.map((event) => ({
        type: event.type,
        label: event.label,
        summary: event.summary,
        payload: event.payload,
      })),
    },
  }
}

function extrairConteudoLLM(data: any): string | null {
  const content = data?.choices?.[0]?.message?.content
  return typeof content === 'string' ? content.trim() : null
}

function calcularDiasUteis(inicio: Date, dias: number): Date {
  let count = 0
  const data = new Date(inicio)
  while (count < dias) {
    data.setDate(data.getDate() + 1)
    const d = data.getDay()
    if (d !== 0 && d !== 6) count++
  }
  return data
}

function parseDataBaseMovimentacao(value?: string | null): Date {
  if (!value) return new Date()
  if (/^\d{2}\/\d{2}\/\d{4}/.test(value)) {
    const [dia, mes, ano] = value.split(' ')[0].split('/').map(Number)
    const parsed = new Date(ano, mes - 1, dia)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  const parsed = new Date(String(value).includes(' ') ? String(value).replace(' ', 'T') : String(value))
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed
}

function limparComplementoPrazo(value: string | undefined): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^(que\s+)?(a\s+parte\s+)?/i, '')
    .replace(/\s+(sob pena|no prazo|conforme|nos termos).*$/i, '')
    .trim()
}

function parseNumeroPrazo(value: string | undefined): number | null {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return null

  const numeric = Number(raw.replace(/^0+/, '') || '0')
  if (Number.isFinite(numeric) && numeric > 0) return numeric

  const porExtenso: Record<string, number> = {
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    tres: 3,
    três: 3,
    quatro: 4,
    cinco: 5,
    seis: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    dez: 10,
    onze: 11,
    doze: 12,
    treze: 13,
    quatorze: 14,
    catorze: 14,
    quinze: 15,
    dezesseis: 16,
    dezasseis: 16,
    dezessete: 17,
    dezassete: 17,
    dezoito: 18,
    dezenove: 19,
    dezanove: 19,
    vinte: 20,
    trinta: 30,
  }

  return porExtenso[raw] ?? null
}

function formatarAcaoPrazo(complemento: string, dias: number): string {
  if (!complemento) return `Cumprir prazo processual de ${dias} dias úteis`
  const primeira = complemento.charAt(0).toUpperCase() + complemento.slice(1)
  return `Cumprir determinação: ${primeira}`
}

function extrairPrazoExplicito(textoOriginal: string | null | undefined, dataBase: Date): PrazoExplicito | null {
  const texto = String(textoOriginal ?? '').replace(/\s+/g, ' ').trim()
  if (!texto) return null

  const textoNormalizado = normalizarTexto(texto)
  if (/decurso de prazo|prazo decorrido|certidao de decurso/.test(textoNormalizado)) return null

  const patterns = [
    /prazo\s+(?:comum\s+)?(?:de\s+)?(\d{1,3}|[a-zçãé]+)(?:\s*\([^)]{1,24}\))?\s+dias?(?:\s+uteis|\s+úteis)?(?:\s+(?:para|a fim de|para que)\s+([^.;\n]+))?/i,
    /prazo\s+(?:comum\s+)?(?:de\s+)?\d{1,3}\s*\(([^)]{1,24})\)\s+dias?(?:\s+uteis|\s+úteis)?(?:\s+(?:para|a fim de|para que)\s+([^.;\n]+))?/i,
    /(?:em|no prazo de)\s+(\d{1,3}|[a-zçãé]+)(?:\s*\([^)]{1,24}\))?\s+dias?(?:\s+uteis|\s+úteis)?\s*,?\s+(?:para|a fim de|para que)\s+([^.;\n]+)/i,
    /(\d{1,3}|[a-zçãé]+)(?:\s*\([^)]{1,24}\))?\s+dias?(?:\s+uteis|\s+úteis)?\s*,?\s+(?:para|a fim de|para que)\s+([^.;\n]+)/i,
  ]

  for (const pattern of patterns) {
    const match = texto.match(pattern)
    if (!match) continue

    const dias = parseNumeroPrazo(match[1])
    if (dias == null || !Number.isFinite(dias) || dias <= 0 || dias > 120) continue

    const complemento = limparComplementoPrazo(match[2])
    return {
      dias,
      descricao: formatarAcaoPrazo(complemento, dias),
      vencimento: calcularDiasUteis(dataBase, dias),
      evidencia: match[0].trim(),
    }
  }

  return null
}

async function classificarComLLM(tenantId: string, conteudo: string, resumo: string | null): Promise<string | null> {
  const tipos = 'CONTESTACAO, SENTENCA, RECURSO, AUDIENCIA, DESPACHO, CITACAO, ARQUIVAMENTO, EXTINCAO'
  try {
    const aiResult = await callLLMWithFallback<any>({
      supabase: adminSupabase,
      tenantId,
      useCase: 'classificar_movimentacao',
      request: {
        temperature: 0,
        max_tokens: 20,
        messages: [
          {
            role: 'system',
            content: `Você é um classificador jurídico preciso. Classifique a movimentação em UM dos tipos: ${tipos}. 
            Ata de audiência, protocolo de ata ou juntada de ata são eventos PASSADOS — classifique como DESPACHO, nunca como AUDIENCIA.
            Responda APENAS com o tipo em maiúsculas, sem explicação. Se não se encaixar, responda NULL.`
          },
          {
            role: 'user',
            content: `Movimentação: "${conteudo}"\nContexto: "${resumo ?? 'não disponível'}"`
          }
        ],
      },
    })

    if (aiResult.ok === false) {
      console.warn(`[ANALISADOR] Classificacao LLM indisponivel: ${aiResult.failureKind}`)
      return null
    }

    const tipo = extrairConteudoLLM(aiResult.data)?.toUpperCase().replace(/[^A-Z]/g, '')
    return tipos.includes(tipo) ? tipo : null
  } catch {
    console.warn('[ANALISADOR] Falha LLM durante classificacao.')
    return null
  }
}

function normalizarTexto(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function categorizarDescricaoPrazo(value: string | null | undefined): string {
  const texto = normalizarTexto(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!texto) return 'sem-descricao'
  if (texto.includes('replica') && texto.includes('contest')) return 'replica_contestacao'
  if (texto.includes('contrarrazo') || texto.includes('contrarraz')) return 'contrarrazoes'
  if (texto.includes('embargos') && texto.includes('declar')) return 'embargos_declaracao'
  if (texto.includes('sentenca') && (texto.includes('public') || texto.includes('grupo') || texto.includes('prolacao') || texto.includes('julg'))) {
    return 'sentenca_monitoramento'
  }

  return texto
}

function inferirPoloEscritorio(clienteNome: string | null, partes: PartesProcesso): string {
  const cliente = normalizarTexto(clienteNome)
  const poloAtivo = normalizarTexto(partes?.polo_ativo)
  const poloPassivo = normalizarTexto(partes?.polo_passivo)
  const primeiroNomeCliente = cliente.split(' ').filter(Boolean)[0] ?? ''

  const representaAutor =
    (!!cliente && !!poloAtivo && (poloAtivo.includes(cliente) || cliente.includes(poloAtivo.split(' ')[0] ?? ''))) ||
    (!!primeiroNomeCliente && poloAtivo.includes(primeiroNomeCliente))

  if (representaAutor) return 'AUTOR (polo ativo)'
  if (!!cliente && !!poloPassivo && (poloPassivo.includes(cliente) || poloPassivo.includes(primeiroNomeCliente))) {
    return 'REU (polo passivo)'
  }

  return 'INDETERMINADO'
}

function inferirPoloPorAdvogado(partes: PartesProcesso, advogadoNome: string | null, oabRegistro: string | null): string {
  const poloAtivo = normalizarTexto(partes?.polo_ativo)
  const poloPassivo = normalizarTexto(partes?.polo_passivo)
  const advogado = normalizarTexto(advogadoNome)
  const oab = normalizarTexto(oabRegistro).replace(/\D/g, '')
  const primeiroNomeAdvogado = advogado.split(' ').filter(Boolean)[0] ?? ''

  const matchAtivo =
    (!!advogado && poloAtivo.includes(advogado)) ||
    (!!primeiroNomeAdvogado && poloAtivo.includes(primeiroNomeAdvogado)) ||
    (!!oab && poloAtivo.includes(oab))

  const matchPassivo =
    (!!advogado && poloPassivo.includes(advogado)) ||
    (!!primeiroNomeAdvogado && poloPassivo.includes(primeiroNomeAdvogado)) ||
    (!!oab && poloPassivo.includes(oab))

  if (matchAtivo && !matchPassivo) return 'AUTOR (polo ativo)'
  if (matchPassivo && !matchAtivo) return 'REU (polo passivo)'
  return 'INDETERMINADO'
}

function normalizarPoloRepresentado(value: string | null | undefined): PoloRepresentado {
  const polo = normalizarTexto(value)
  if (polo.includes('autor') || polo.includes('ativo')) return 'autor'
  if (polo.includes('reu') || polo.includes('passivo')) return 'reu'
  return 'indeterminado'
}

function detectarAlvoObrigacao(textoOriginal: string | null | undefined): PoloRepresentado {
  const texto = normalizarTexto(textoOriginal)
  if (!texto) return 'indeterminado'

  const authorDirectedPatterns = [
    /(?:intime-se|intimacao|intimada|intimado)[^.;\n]{0,100}(?:parte autora|autor|requerente|exequente)/,
    /(?:parte autora|autor|requerente|exequente)[^.;\n]{0,120}(?:prazo|manifest|apresent|emend|regulariz|replica|cumpr|comprov)/,
  ]
  const defendantDirectedPatterns = [
    /(?:cite-se|citacao|citado|citada|citados)[^.;\n]{0,100}(?:parte re|reu|requerid|executad)/,
    /(?:parte re|reu|requerid|executad)[^.;\n]{0,120}(?:prazo|contest|manifest|apresent|contrarrazo|cumpr|comprov)/,
  ]

  const authorIndex = authorDirectedPatterns
    .map((pattern) => texto.search(pattern))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]
  const defendantIndex = defendantDirectedPatterns
    .map((pattern) => texto.search(pattern))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]

  if (authorIndex === undefined && defendantIndex === undefined) return 'indeterminado'
  if (authorIndex === undefined) return 'reu'
  if (defendantIndex === undefined) return 'autor'
  return authorIndex <= defendantIndex ? 'autor' : 'reu'
}

function detectarPoloQueInterposRecurso(textoOriginal: string | null | undefined): PoloRepresentado {
  const texto = normalizarTexto(textoOriginal)
  if (!texto || !/(recurso|apelac|agravo|embargos?|contrarrazo)/.test(texto)) return 'indeterminado'
  if (!/(interpos|interp|apresent|protocol|opos|manejado|manejou|recorrent|apelant|agravant|embargant)/.test(texto)) return 'indeterminado'

  const authorActorPatterns = [
    /(?:recurso|apelac|agravo|embargos?)[^.;\n]{0,160}(?:interpos|interp|apresent|protocol|opos|manejado|manejou)[^.;\n]{0,160}(?:parte autora|autor|autora|requerente|exequente)/,
    /(?:parte autora|autor|autora|requerente|exequente)[^.;\n]{0,160}(?:interpos|interp|apresent|protocol|opos|manejado|manejou)[^.;\n]{0,160}(?:recurso|apelac|agravo|embargos?)/,
    /(?:recorrent|apelant|agravant|embargant)[^.;\n]{0,120}(?:parte autora|autor|autora|requerente|exequente)/,
    /(?:parte autora|autor|autora|requerente|exequente)[^.;\n]{0,120}(?:recorrent|apelant|agravant|embargant)/,
  ]
  const defendantActorPatterns = [
    /(?:recurso|apelac|agravo|embargos?)[^.;\n]{0,160}(?:interpos|interp|apresent|protocol|opos|manejado|manejou)[^.;\n]{0,160}(?:parte re|\breu\b|\bre\b|requerid|executad)/,
    /(?:parte re|\breu\b|\bre\b|requerid|executad)[^.;\n]{0,160}(?:interpos|interp|apresent|protocol|opos|manejado|manejou)[^.;\n]{0,160}(?:recurso|apelac|agravo|embargos?)/,
    /(?:recorrent|apelant|agravant|embargant)[^.;\n]{0,120}(?:parte re|\breu\b|\bre\b|requerid|executad)/,
    /(?:parte re|\breu\b|\bre\b|requerid|executad)[^.;\n]{0,120}(?:recorrent|apelant|agravant|embargant)/,
  ]

  const authorIndex = authorActorPatterns
    .map((pattern) => texto.search(pattern))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]
  const defendantIndex = defendantActorPatterns
    .map((pattern) => texto.search(pattern))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]

  if (authorIndex === undefined && defendantIndex === undefined) return 'indeterminado'
  if (authorIndex === undefined) return 'reu'
  if (defendantIndex === undefined) return 'autor'
  return authorIndex <= defendantIndex ? 'autor' : 'reu'
}

function detectarPoloRecursalPassivo(textoOriginal: string | null | undefined): PoloRepresentado {
  const texto = normalizarTexto(textoOriginal)
  if (!texto || !/(recurso|apelac|agravo|embargos?|contrarrazo)/.test(texto)) return 'indeterminado'
  if (!/(apelad|agravad|embargad|recorrid)/.test(texto)) return 'indeterminado'

  const passiveRole = /(?:apelad|agravad|embargad|recorrid)/
  const authorActorPatterns = [
    new RegExp(`${passiveRole.source}[^.;\\n]{0,120}(?:parte autora|autor|autora|requerente|exequente)`),
    new RegExp(`(?:parte autora|autor|autora|requerente|exequente)[^.;\\n]{0,120}${passiveRole.source}`),
  ]
  const defendantActorPatterns = [
    new RegExp(`${passiveRole.source}[^.;\\n]{0,120}(?:parte re|\\breu\\b|\\bre\\b|requerid|executad)`),
    new RegExp(`(?:parte re|\\breu\\b|\\bre\\b|requerid|executad)[^.;\\n]{0,120}${passiveRole.source}`),
  ]

  const authorIndex = authorActorPatterns
    .map((pattern) => texto.search(pattern))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]
  const defendantIndex = defendantActorPatterns
    .map((pattern) => texto.search(pattern))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0]

  if (authorIndex === undefined && defendantIndex === undefined) return 'indeterminado'
  if (authorIndex === undefined) return 'reu'
  if (defendantIndex === undefined) return 'autor'
  return authorIndex <= defendantIndex ? 'autor' : 'reu'
}

function isObrigacaoPessoalCliente(textoOriginal: string | null | undefined): boolean {
  const texto = normalizarTexto(textoOriginal)
  return /depoimento pessoal|comparecimento pessoal|comparecer pessoalmente|depositar pessoalmente/.test(texto)
}

function avaliarObrigacaoRecursal(params: {
  processo: MonitoredProcessContext | null | undefined
  textoOriginal: string | null | undefined
  tipoEvento: string | null
  evidencia?: string | null
}): MovementDutyAssessment | null {
  const texto = normalizarTexto(params.textoOriginal)
  if (!params.processo || (params.tipoEvento !== 'RECURSO' && !/(recurso|apelac|agravo|embargos?|contrarrazo)/.test(texto))) {
    return null
  }

  const poloRepresentado = normalizarPoloRepresentado(
    inferirPoloEscritorio(params.processo.cliente_nome, params.processo.partes)
  )
  if (poloRepresentado === 'indeterminado') return null

  const poloQueRecorreu = detectarPoloQueInterposRecurso(params.textoOriginal)
  if (poloQueRecorreu !== 'indeterminado' && poloQueRecorreu === poloRepresentado) {
    return {
      polo_representado: poloRepresentado,
      obrigacao_de_quem: 'parte_contraria',
      confidence: 'alta',
      confidence_reason: 'Recurso interposto pelo polo representado; eventual resposta recursal e da parte contraria.',
      evidencia: params.evidencia ?? null,
    }
  }

  if (poloQueRecorreu !== 'indeterminado') {
    return {
      polo_representado: poloRepresentado,
      obrigacao_de_quem: 'escritorio',
      confidence: 'alta',
      confidence_reason: 'Recurso interposto pela parte contraria; resposta recursal deve ser avaliada pelo escritorio.',
      evidencia: params.evidencia ?? null,
    }
  }

  const poloRecursalPassivo = detectarPoloRecursalPassivo(params.textoOriginal)
  if (poloRecursalPassivo === 'indeterminado') return null

  if (poloRecursalPassivo === poloRepresentado) {
    return {
      polo_representado: poloRepresentado,
      obrigacao_de_quem: 'escritorio',
      confidence: 'alta',
      confidence_reason: 'Polo representado consta como parte recorrida/apelada/agravada; resposta recursal pode ser obrigacao do escritorio.',
      evidencia: params.evidencia ?? null,
    }
  }

  return {
    polo_representado: poloRepresentado,
    obrigacao_de_quem: 'parte_contraria',
    confidence: 'alta',
    confidence_reason: 'Polo contrario consta como parte recorrida/apelada/agravada; eventual resposta recursal nao e do escritorio.',
    evidencia: params.evidencia ?? null,
  }
}

function avaliarObrigacaoMovimentacao(params: {
  processo: MonitoredProcessContext | null | undefined
  textoOriginal: string | null | undefined
  acaoSugerida?: string | null
  evidencia?: string | null
}): MovementDutyAssessment | null {
  if (!params.processo) return null

  const poloRepresentado = normalizarPoloRepresentado(
    inferirPoloEscritorio(params.processo.cliente_nome, params.processo.partes)
  )
  const alvoObrigacao = detectarAlvoObrigacao([
    params.textoOriginal,
    params.acaoSugerida,
    params.evidencia,
  ].filter(Boolean).join(' '))

  if (poloRepresentado === 'indeterminado') {
    return {
      polo_representado: 'indeterminado',
      obrigacao_de_quem: 'indeterminada',
      confidence: 'baixa',
      confidence_reason: 'Polo representado nao foi inferido com seguranca a partir do cliente e das partes do processo.',
      evidencia: params.evidencia ?? null,
    }
  }

  if (alvoObrigacao === 'indeterminado') {
    return {
      polo_representado: poloRepresentado,
      obrigacao_de_quem: 'indeterminada',
      confidence: 'media',
      confidence_reason: 'A movimentacao contem sinal juridico, mas nao explicita qual polo deve cumprir o ato.',
      evidencia: params.evidencia ?? null,
    }
  }

  const alvoRepresentado = alvoObrigacao === poloRepresentado
  if (!alvoRepresentado) {
    return {
      polo_representado: poloRepresentado,
      obrigacao_de_quem: 'parte_contraria',
      confidence: 'alta',
      confidence_reason: 'A movimentacao direciona o ato ao polo contrario ao cliente representado.',
      evidencia: params.evidencia ?? null,
    }
  }

  const obrigacaoRepresentado: ObrigacaoMovimentacao = isObrigacaoPessoalCliente(params.textoOriginal)
    ? 'cliente'
    : 'escritorio'

  return {
    polo_representado: poloRepresentado,
    obrigacao_de_quem: obrigacaoRepresentado,
    confidence: 'alta',
    confidence_reason: obrigacaoRepresentado === 'cliente'
      ? 'A movimentacao indica ato pessoal do cliente representado.'
      : 'A movimentacao direciona o ato ao polo representado pelo escritorio.',
    evidencia: params.evidencia ?? null,
  }
}

function aplicarObrigacaoMovimentacao(
  payload: AnaliseMovimentacaoPayload,
  assessment: MovementDutyAssessment | null
): AnaliseMovimentacaoPayload {
  if (!assessment) return payload
  return {
    ...payload,
    polo_representado: assessment.polo_representado,
    obrigacao_de_quem: assessment.obrigacao_de_quem,
    confidence: payload.confidence ?? payload.confianca_analise,
    confidence_reason: payload.confidence_reason ?? assessment.confidence_reason,
    evidencia: payload.evidencia ?? assessment.evidencia ?? null,
  }
}

function montarHistoricoTexto(movimentacoes: MovimentacaoHistorica[] | null | undefined): string {
  const sorted = [...(movimentacoes ?? [])]
    .sort((a, b) => {
      const da = a.data ?? ''
      const db = b.data ?? ''
      return db.localeCompare(da) // mais recente primeiro
    })
    .slice(0, 5)

  if (sorted.length === 0) return 'Sem historico disponivel'

  return sorted
    .map((mov) => {
      const data = mov.data ?? 'sem data'
      const descricao = mov.descricao ?? mov.conteudo ?? 'sem descricao'
      return `- ${data}: ${descricao}`
    })
    .join('\n')
}

function limparJsonResposta(responseText: string): string {
  return responseText.replace(/```json|```/gi, '').trim()
}

function mapearTipoEventoPorAnalise(analise: AnalisePrazoLLM | null, texto: string): string | null {
  if (!analise || !analise.gerar) return null

  if (analise.tipo === 'prazo') return 'PRAZO'
  if (analise.tipo === 'audiencia') return 'AUDIENCIA'
  if (analise.tipo === 'recurso') return 'RECURSO'
  if (analise.tipo === 'citacao') return 'CITACAO'
  if (analise.tipo === 'sentenca') return 'SENTENCA'

  const descricao = normalizarTexto(analise.descricao)

  if (descricao.includes('replica') || descricao.includes('réplica') || texto.includes('contest')) {
    return 'CONTESTACAO'
  }

  if (descricao.includes('contrarrazo') || descricao.includes('contrarraz')) {
    return 'RECURSO'
  }

  if (descricao.includes('contestacao') || descricao.includes('contestação')) {
    return 'CITACAO'
  }

  return null
}

function parseDataVencimentoLLM(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function analiseTemVencimentoConfiavel(analise: AnalisePrazoLLM | null): boolean {
  return Boolean(analise?.gerar && parseDataVencimentoLLM(analise.data_vencimento))
}

function mapearPrioridade(analise: AnalisePrazoLLM | null): string | null {
  if (!analise || !analise.gerar) return null
  if (analise.urgencia === 'alta') return 'alta'
  if (analise.urgencia === 'media') return 'media'
  if (analise.urgencia === 'baixa') return 'baixa'
  return null
}

function movementTimelineKey(entry: any) {
  const escavadorId = String(entry?.escavador_movimentacao_id || '').trim()
  if (escavadorId) return `escavador:${escavadorId}`

  const data = String(entry?.data || '').trim()
  const tipo = String(entry?.tipo_evento || '').trim()
  const conteudo = String(entry?.conteudo || '').trim().slice(0, 500)
  if (!data && !tipo && !conteudo) return null
  return `raw:${data}:${tipo}:${conteudo}`
}

function appendUniqueMovementEntry(timeline: any[], entry: any) {
  const nextKey = movementTimelineKey(entry)
  const deduped = nextKey
    ? timeline.filter((item) => movementTimelineKey(item) !== nextKey)
    : timeline
  return [...deduped, entry].slice(-50)
}

async function persistirAnaliseMovimentacao(params: {
  tenantId: string
  numeroCnj: string
  processMovimentacaoId?: string | null
  escavadorMovimentacaoId?: string | null
  payload: AnaliseMovimentacaoPayload
}) {
  const payload = normalizeAnalysisPayload(params.payload)
  const updatePayload = {
    tipo_evento: payload.tipo_evento,
    requer_acao: payload.requer_acao,
    acao_sugerida: payload.acao_sugerida,
    prazo_extraido_dias: payload.prazo_extraido_dias,
    data_vencimento_extraida: payload.data_vencimento_extraida,
    confianca_analise: payload.confianca_analise,
    analise_json: payload,
    analisado_em: new Date().toISOString(),
  }

  try {
    if (params.processMovimentacaoId) {
      const { error } = await adminSupabase
        .from('process_movimentacoes')
        .update(updatePayload)
        .eq('id', params.processMovimentacaoId)
        .eq('tenant_id', params.tenantId)
      if (error) console.warn('[ANALISADOR] Falha ao persistir analise por id.', error.message)
      return
    }

    if (params.escavadorMovimentacaoId) {
      const { error } = await adminSupabase
        .from('process_movimentacoes')
        .update(updatePayload)
        .eq('tenant_id', params.tenantId)
        .eq('numero_cnj', params.numeroCnj)
        .eq('escavador_movimentacao_id', params.escavadorMovimentacaoId)
      if (error) console.warn('[ANALISADOR] Falha ao persistir analise por movimentacao do Escavador.', error.message)
      return
    }
  } catch (error) {
    console.warn('[ANALISADOR] Falha ao persistir analise da movimentacao.', error)
  }
}

async function registrarRevisaoHumanaMovimentacao(params: {
  tenantId: string
  numeroCnj: string
  processMovimentacaoId?: string | null
  escavadorMovimentacaoId?: string | null
  processoId?: string | null
  payload: AnaliseMovimentacaoPayload
}) {
  try {
    const payload = normalizeAnalysisPayload(params.payload, true)
    await adminSupabase.from('system_event_logs').insert({
      tenant_id: params.tenantId,
      source: 'juridico',
      provider: 'mayus',
      event_name: 'legal_movement_review_required',
      status: 'review_required',
      payload: {
        numero_cnj: params.numeroCnj,
        processo_id: params.processoId ?? null,
        process_movimentacao_id: params.processMovimentacaoId ?? null,
        escavador_movimentacao_id: params.escavadorMovimentacaoId ?? null,
        tipo_evento: payload.tipo_evento,
        requer_acao: payload.requer_acao,
        acao_sugerida: payload.acao_sugerida,
        prazo_extraido_dias: payload.prazo_extraido_dias,
        data_vencimento_extraida: payload.data_vencimento_extraida,
        confianca_analise: payload.confianca_analise,
        confidence: payload.confidence ?? payload.confianca_analise,
        origem: payload.origem,
        motivo: payload.motivo,
        polo_representado: payload.polo_representado ?? null,
        obrigacao_de_quem: payload.obrigacao_de_quem ?? null,
        confidence_reason: payload.confidence_reason ?? payload.motivo,
        evidencia: payload.evidencia ?? null,
        review_required: payload.review_required ?? true,
      },
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    console.warn('[ANALISADOR] Falha ao auditar revisao humana da movimentacao.', error)
  }
}

function sanitizeAutomationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Erro desconhecido')
  return message.replace(/(token|apikey|api_key|authorization|password|secret)=[^\s]+/gi, '$1=[redacted]').slice(0, 500)
}

async function registrarFalhaAutomacaoMovimentacao(params: {
  tenantId: string
  numeroCnj: string
  processMovimentacaoId?: string | null
  escavadorMovimentacaoId?: string | null
  processoId?: string | null
  errorMessage: string
  payload: AnaliseMovimentacaoPayload
}) {
  try {
    const payload = normalizeAnalysisPayload(params.payload)
    await adminSupabase.from('system_event_logs').insert({
      tenant_id: params.tenantId,
      source: 'juridico',
      provider: 'mayus',
      event_name: 'legal_movement_auto_create_failed',
      status: 'failed',
      payload: {
        numero_cnj: params.numeroCnj,
        processo_id: params.processoId ?? null,
        process_movimentacao_id: params.processMovimentacaoId ?? null,
        escavador_movimentacao_id: params.escavadorMovimentacaoId ?? null,
        error: params.errorMessage,
        tipo_evento: payload.tipo_evento,
        acao_sugerida: payload.acao_sugerida,
        data_vencimento_extraida: payload.data_vencimento_extraida,
        polo_representado: payload.polo_representado ?? null,
        obrigacao_de_quem: payload.obrigacao_de_quem ?? null,
        confidence: payload.confidence ?? payload.confianca_analise,
        confidence_reason: payload.confidence_reason ?? payload.motivo,
      },
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    console.warn('[ANALISADOR] Falha ao auditar erro de automacao da movimentacao.', error)
  }
}

async function persistirRevisaoMovimentacao(params: {
  tenantId: string
  numeroCnj: string
  processMovimentacaoId?: string | null
  escavadorMovimentacaoId?: string | null
  processoId?: string | null
  payload: AnaliseMovimentacaoPayload
}): Promise<AnaliseMovimentacaoResult> {
  const payload = normalizeAnalysisPayload(params.payload, true)
  await persistirAnaliseMovimentacao({ ...params, payload })
  await registrarRevisaoHumanaMovimentacao({ ...params, payload })
  return buildAnaliseResult(payload, 'review_required')
}

async function analisarComLLM(params: {
  tenantId: string
  monitoredProcess: MonitoredProcessContext
  textoMovimentacao: string
}): Promise<AnalisePrazoLLM | null> {
  try {
    let poloEscritorio = inferirPoloEscritorio(
      params.monitoredProcess.cliente_nome,
      params.monitoredProcess.partes
    )

    if (poloEscritorio === 'INDETERMINADO' && params.monitoredProcess.advogado_responsavel_id) {
      const { data: advogado } = await adminSupabase
        .from('profiles')
        .select('full_name, oab_registro')
        .eq('id', params.monitoredProcess.advogado_responsavel_id)
        .maybeSingle()

      poloEscritorio = inferirPoloPorAdvogado(
        params.monitoredProcess.partes,
        advogado?.full_name ?? null,
        advogado?.oab_registro ?? null
      )
    }

    const historicoTexto = montarHistoricoTexto(params.monitoredProcess.movimentacoes)
    const prompt = `Você é um assistente jurídico especializado em direito processual civil brasileiro.

CONTEXTO DO PROCESSO:
- Número: ${params.monitoredProcess.numero_processo ?? 'não disponível'}
- Cliente: ${params.monitoredProcess.cliente_nome ?? 'não disponível'}
- O escritório representa: ${poloEscritorio}
- Tribunal: ${params.monitoredProcess.tribunal ?? 'não disponível'}
- Classe processual: ${params.monitoredProcess.classe_processual ?? 'não disponível'}

ÚLTIMAS MOVIMENTAÇÕES (histórico):
${historicoTexto}

NOVA MOVIMENTAÇÃO A ANALISAR:
"${params.textoMovimentacao}"

REGRAS OBRIGATÓRIAS — Analise antes de gerar qualquer prazo:

1. POLO: O escritório representa ${poloEscritorio}.
   - Se a peça foi protocolada PELO escritório (pelo nosso cliente) → ato JÁ REALIZADO, NÃO gerar prazo.
   - Se a peça foi protocolada PELA PARTE CONTRÁRIA e gera obrigação de resposta → gerar prazo.
   - Se a movimentação é uma INTIMAÇÃO direcionada ao escritório → gerar prazo.

2. FASE PROCESSUAL: Verifique o histórico.
   - Se já houve audiência ou ata de audiência → NÃO gerar prazo de contestação (fase já superada).
   - Se já houve sentença → NÃO gerar prazo de contestação ou réplica.
   - Se o recurso foi interposto PELO ESCRITÓRIO → NÃO gerar prazo de contrarrazões (é obrigação do adversário).
   - Se o recurso foi interposto PELO ADVERSÁRIO → gerar prazo de contrarrazões.

3. DESPACHOS: Despachos de mero expediente (ex: "Despacho — Verificar cumprimento") NÃO geram prazos processuais. NUNCA gerar prazo para despachos.

4. SE NÃO HÁ PRAZO REAL: Retorne exatamente: { "gerar": false, "motivo": "<explicação>" }

5. MOVIMENTAÇÕES BUROCRÁTICAS: Se for apenas juntada, certidão, protocolo, remessa, redistribuição ou outro andamento sem obrigação concreta para o escritório, retorne gerar=false.

6. CLASSE PROCESSUAL:
   - Se a classe for "Agravo de Instrumento" e o cliente for o AGRAVADO (polo passivo do agravo) → gerar prazo de Contrarrazões de Agravo (15 dias úteis).
   - Se a classe for "Agravo de Instrumento" e o cliente for o AGRAVANTE (polo ativo) → o recurso foi interposto pelo escritório, NÃO gerar prazo.
   - Se a classe for "Apelação" e o cliente for o APELADO → gerar prazo de Contrarrazões de Apelação.
   - Se a classe for "Apelação" e o cliente for o APELANTE → o recurso foi interposto pelo escritório, NÃO gerar prazo.

SE houver prazo real, retorne JSON:
{
  "gerar": true,
  "tipo": "prazo" | "audiencia" | "recurso" | "citacao" | "sentenca",
  "descricao": "<descrição clara da ação que o escritório deve tomar>",
  "data_vencimento": "<YYYY-MM-DD>",
  "urgencia": "alta" | "media" | "baixa",
  "motivo": "<por que este prazo foi gerado>"
}

Responda APENAS com o JSON, sem texto adicional.`

    const aiResult = await callLLMWithFallback<any>({
      supabase: adminSupabase,
      tenantId: params.tenantId,
      useCase: 'classificar_movimentacao',
      request: {
        temperature: 0,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      },
    })

    if (aiResult.ok === false) {
      console.warn(`[ANALISADOR] Analise LLM indisponivel: ${aiResult.failureKind}`)
      return null
    }

    const responseText = extrairConteudoLLM(aiResult.data)
    if (!responseText) return null

    const parsed = JSON.parse(limparJsonResposta(responseText))
    if (parsed?.gerar === false) {
      return { gerar: false, motivo: String(parsed.motivo ?? 'Sem motivo informado') }
    }

    const tipo = parsed?.tipo
    const descricao = String(parsed?.descricao ?? '').trim()
    if (
      parsed?.gerar === true &&
      ['prazo', 'audiencia', 'recurso', 'citacao', 'sentenca'].includes(tipo) &&
      descricao
    ) {
      return {
        gerar: true,
        tipo,
        descricao,
        data_vencimento: parsed?.data_vencimento,
        urgencia: parsed?.urgencia,
        motivo: String(parsed?.motivo ?? 'Motivo não informado')
      }
    }

    return null
  } catch {
    console.warn('[ANALISADOR] Falha ao analisar com LLM.')
    return null
  }
}

export async function analisarMovimentacao(params: {
  processo_id: string
  numero_cnj: string
  tenant_id: string
  movimentacao: { id?: string | number; conteudo?: string; data?: string }
  advogado_id?: string | null
  escavador_movimentacao_id?: string | null
  process_movimentacao_id?: string | null
}) {
  const textoBruto = (params.movimentacao.conteudo ?? '').toLowerCase()
  const texto = textoBruto.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  const escavadorMovimentacaoId =
    (params.escavador_movimentacao_id ?? String(params.movimentacao.id ?? '')).trim() || null
  const dataBase = parseDataBaseMovimentacao(params.movimentacao.data)
  const prazoExplicito = extrairPrazoExplicito(params.movimentacao.conteudo, dataBase)

  if (!prazoExplicito && isLikelyLowSignalMovement(texto)) {
    const payload: AnaliseMovimentacaoPayload = {
      tipo_evento: null,
      requer_acao: false,
      acao_sugerida: null,
      prazo_extraido_dias: null,
      data_vencimento_extraida: null,
      confianca_analise: 'alta',
      origem: 'ignorada',
      motivo: 'Movimentacao de baixo sinal sem comando processual concreto.',
    }
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload,
    })
    console.log(`[ANALISADOR] Movimentacao de baixo sinal ignorada para ${params.numero_cnj}.`)
    return buildAnaliseResult(payload, 'none')
  }

  // Busca contexto do processo
  const { data: processo, error: processoError } = await adminSupabase
    .from('monitored_processes')
    .select('numero_processo, resumo_curto, cliente_nome, tribunal, partes, movimentacoes, advogado_responsavel_id, classe_processual, linked_task_id')
    .eq('id', params.processo_id)
    .eq('tenant_id', params.tenant_id)
    .single()
  if (processoError) console.warn(`[ANALISADOR] Falha ao carregar contexto do processo ${params.numero_cnj}: ${processoError.message}`)

  const movementDutyAssessment = processo
    ? avaliarObrigacaoRecursal({
        processo: processo as MonitoredProcessContext,
        textoOriginal: params.movimentacao.conteudo ?? '',
        tipoEvento: null,
        evidencia: prazoExplicito?.evidencia ?? null,
      }) ?? avaliarObrigacaoMovimentacao({
        processo: processo as MonitoredProcessContext,
        textoOriginal: params.movimentacao.conteudo ?? '',
        evidencia: prazoExplicito?.evidencia ?? null,
      })
    : null
  const withMovementDuty = (payload: AnaliseMovimentacaoPayload) =>
    aplicarObrigacaoMovimentacao(payload, movementDutyAssessment)

  const analiseLLM = processo
    ? await analisarComLLM({
        tenantId: params.tenant_id,
        monitoredProcess: processo as MonitoredProcessContext,
        textoMovimentacao: params.movimentacao.conteudo ?? ''
      })
    : null

  const hasRecursalSignal = /(recurso|apelac|agravo|embargos?|contrarrazo)/.test(texto)
  if (analiseLLM && !analiseLLM.gerar && !prazoExplicito && !hasRecursalSignal) {
    const payload = withMovementDuty({
      tipo_evento: null,
      requer_acao: false,
      acao_sugerida: null,
      prazo_extraido_dias: null,
      data_vencimento_extraida: null,
      confianca_analise: 'media',
      origem: 'llm',
      motivo: analiseLLM.motivo,
    })
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload,
    })
    console.log(`[ANALISADOR] Prazo nao gerado: ${analiseLLM.motivo}`)
    return buildAnaliseResult(payload, 'none')
  }

  let tipoEvento = mapearTipoEventoPorAnalise(analiseLLM, texto)
  if (!tipoEvento && prazoExplicito) {
    tipoEvento = 'PRAZO'
  }

  // Fallback para classificacao por keywords se o JSON do LLM falhar
  if (!tipoEvento) {
    const textoLower = texto.toLowerCase()

    // Exclusões — eventos passados que contêm "audiência" mas não são audiência futura
    if (
      textoLower.includes('ata de audiencia') ||
      textoLower.includes('ata de conciliacao') ||
      textoLower.includes('ata de conciliação') ||
      textoLower.includes('minuta de ata') ||
      textoLower.includes('protocolo de ata') ||
      textoLower.includes('juntada de ata')
    ) {
      tipoEvento = 'DESPACHO'
    } else {
      for (const [kw, tipo] of Object.entries(KEYWORDS)) {
        if (texto.includes(kw)) { tipoEvento = tipo; break }
      }
    }
  }

  if (!tipoEvento) {
    const payload = withMovementDuty({
      tipo_evento: null,
      requer_acao: false,
      acao_sugerida: null,
      prazo_extraido_dias: null,
      data_vencimento_extraida: null,
      confianca_analise: 'baixa',
      origem: 'heuristica',
      motivo: 'Nao foi possivel classificar a movimentacao em um evento juridico acionavel.',
    })
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload,
    })
    return buildAnaliseResult(payload, 'none')
  }

  // Busca regra de prazo
  const { data: prazo } = await adminSupabase
    .from('prazos_processuais')
    .select('*')
    .eq('tipo_evento', tipoEvento)
    .single()

  const prazoGenerico = !prazo && tipoEvento === 'PRAZO' && (prazoExplicito || analiseTemVencimentoConfiavel(analiseLLM))
    ? {
        tipo_evento: 'PRAZO',
        dias_uteis: prazoExplicito?.dias ?? 0,
        descricao: prazoExplicito?.descricao || String(analiseLLM?.gerar ? analiseLLM.descricao : 'Cumprir prazo processual').trim(),
        prioridade: 'MEDIA',
        tipo_tarefa: 'Prazo processual',
      }
    : null

  const regraPrazo = prazo ?? prazoGenerico

  if (tipoEvento === 'PRAZO' && !prazoExplicito && !analiseTemVencimentoConfiavel(analiseLLM)) {
    const payload = withMovementDuty({
      tipo_evento: tipoEvento,
      requer_acao: true,
      acao_sugerida: analiseLLM?.gerar ? analiseLLM.descricao : 'Revisar possivel prazo processual',
      prazo_extraido_dias: null,
      data_vencimento_extraida: null,
      confianca_analise: 'baixa',
      origem: analiseLLM ? 'llm' : 'heuristica',
      motivo: 'Possivel prazo identificado sem vencimento confiavel; prazo automatico nao foi criado.',
    })
    return persistirRevisaoMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      processoId: params.processo_id,
      payload,
    })
  }

  if (!regraPrazo) {
    const confidenceWithoutRule = movementDutyAssessment?.obrigacao_de_quem === 'parte_contraria'
      ? movementDutyAssessment.confidence
      : 'baixa'
    const payload = withMovementDuty({
      tipo_evento: tipoEvento,
      requer_acao: false,
      acao_sugerida: null,
      prazo_extraido_dias: null,
      data_vencimento_extraida: null,
      confianca_analise: confidenceWithoutRule,
      origem: 'heuristica',
      motivo: 'Evento classificado, mas sem regra de prazo configurada.',
    })
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload,
    })
    return buildAnaliseResult(payload, 'none')
  }

  // Arquivamento/extinção: encerra processo
  if (tipoEvento === 'ARQUIVAMENTO' || tipoEvento === 'EXTINCAO') {
    const payload = withMovementDuty({
      tipo_evento: tipoEvento,
      requer_acao: true,
      acao_sugerida: 'Revisar encerramento/arquivamento antes de inativar o processo ou cancelar monitoramento.',
      prazo_extraido_dias: null,
      data_vencimento_extraida: null,
      confianca_analise: analiseLLM ? 'media' : 'baixa',
      origem: analiseLLM ? 'llm' : 'heuristica',
      motivo: 'Movimentacao indica possivel encerramento/arquivamento; em beta, a inativacao automatica exige revisao humana.',
    })
    const result = await persistirRevisaoMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      processoId: params.processo_id,
      payload,
    })
    console.log(`[ANALISADOR] Encerramento enviado para revisao humana: ${params.numero_cnj}`)
    return result
  }

  const vencimento = prazoExplicito?.vencimento
    ?? parseDataVencimentoLLM(analiseLLM && analiseLLM.gerar ? analiseLLM.data_vencimento : undefined)
    ?? calcularDiasUteis(dataBase, regraPrazo.dias_uteis)
  const descricaoPrazo = String(prazoExplicito?.descricao || (analiseLLM?.gerar ? analiseLLM.descricao : regraPrazo.descricao) || '').trim()
  const prioridadePrazo = mapearPrioridade(analiseLLM) ?? String(regraPrazo.prioridade || 'MEDIA').toLowerCase()
  const prazoDutyAssessment = processo
    ? avaliarObrigacaoRecursal({
        processo: processo as MonitoredProcessContext,
        textoOriginal: params.movimentacao.conteudo ?? '',
        tipoEvento,
        evidencia: prazoExplicito?.evidencia ?? null,
      }) ?? avaliarObrigacaoMovimentacao({
        processo: processo as MonitoredProcessContext,
        textoOriginal: params.movimentacao.conteudo ?? '',
        acaoSugerida: descricaoPrazo,
        evidencia: prazoExplicito?.evidencia ?? null,
      })
    : movementDutyAssessment
  const withPrazoDuty = (payload: AnaliseMovimentacaoPayload) =>
    aplicarObrigacaoMovimentacao(payload, prazoDutyAssessment)

  if (prazoDutyAssessment?.obrigacao_de_quem === 'parte_contraria') {
    const payload = withPrazoDuty({
      tipo_evento: tipoEvento,
      requer_acao: false,
      acao_sugerida: null,
      prazo_extraido_dias: prazoExplicito?.dias ?? null,
      data_vencimento_extraida: prazoExplicito ? vencimento.toISOString() : null,
      confianca_analise: 'alta',
      origem: prazoExplicito ? 'deterministica' : analiseLLM ? 'llm' : 'heuristica',
      motivo: 'Movimentacao direcionada a parte contraria; prazo/card do escritorio nao foi criado.',
      evidencia: prazoExplicito?.evidencia ?? prazoDutyAssessment.evidencia ?? null,
    })
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload,
    })
    console.log(`[ANALISADOR] Obrigacao da parte contraria ignorada para ${params.numero_cnj}.`)
    return buildAnaliseResult(payload, 'none')
  }

  if (prazoDutyAssessment?.polo_representado === 'indeterminado') {
    const payload = withPrazoDuty({
      tipo_evento: tipoEvento,
      requer_acao: true,
      acao_sugerida: descricaoPrazo,
      prazo_extraido_dias: prazoExplicito?.dias ?? null,
      data_vencimento_extraida: vencimento.toISOString(),
      confianca_analise: 'baixa',
      origem: prazoExplicito ? 'deterministica' : analiseLLM ? 'llm' : 'heuristica',
      motivo: 'Polo representado indeterminado; prazo/card automatico exige revisao humana.',
      evidencia: prazoExplicito?.evidencia ?? null,
    })
    return persistirRevisaoMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      processoId: params.processo_id,
      payload,
    })
  }

  // Nao gerar prazo para despachos genericos
  if (descricaoPrazo.toLowerCase().includes('despacho')) {
    const payload = withPrazoDuty({
      tipo_evento: tipoEvento,
      requer_acao: false,
      acao_sugerida: null,
      prazo_extraido_dias: null,
      data_vencimento_extraida: null,
      confianca_analise: 'alta',
      origem: prazoExplicito ? 'deterministica' : analiseLLM ? 'llm' : 'heuristica',
      motivo: 'Despacho generico ignorado para evitar criacao indevida de prazo.',
    })
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload,
    })
    console.log(`[ANALISADOR] Despacho generico ignorado para ${params.numero_cnj}.`)
    return buildAnaliseResult(payload, 'none')
  }

  // Deduplicacao idempotente por movimentacao do Escavador
  if (escavadorMovimentacaoId) {
    const { data: prazosDuplicados } = await adminSupabase
      .from('process_prazos')
      .select('id')
      .eq('monitored_process_id', params.processo_id)
      .eq('escavador_movimentacao_id', escavadorMovimentacaoId)
      .limit(1)

    if (prazosDuplicados && prazosDuplicados.length > 0) {
      const payload = withPrazoDuty({
        tipo_evento: tipoEvento,
        requer_acao: true,
        acao_sugerida: descricaoPrazo,
        prazo_extraido_dias: prazoExplicito?.dias ?? null,
        data_vencimento_extraida: vencimento.toISOString(),
        confianca_analise: prazoExplicito ? 'alta' : 'media',
        origem: prazoExplicito ? 'deterministica' : analiseLLM ? 'llm' : 'heuristica',
        motivo: 'Movimentacao ja processada anteriormente; prazo duplicado nao foi recriado.',
        evidencia: prazoExplicito?.evidencia ?? null,
      })
      await persistirAnaliseMovimentacao({
        tenantId: params.tenant_id,
        numeroCnj: params.numero_cnj,
        processMovimentacaoId: params.process_movimentacao_id,
        escavadorMovimentacaoId,
        payload,
      })
      console.log(
        `[ANALISADOR] Movimentacao ${escavadorMovimentacaoId} ja processada para ${params.numero_cnj}. Ignorando duplicata.`
      )
      return buildAnaliseResult(payload, 'duplicate_skipped')
    }
  }

  // Fallback de deduplicacao quando nao houver ID da movimentacao
  const inicioDiaVencimento = new Date(vencimento)
  inicioDiaVencimento.setUTCHours(0, 0, 0, 0)
  const fimDiaVencimento = new Date(vencimento)
  fimDiaVencimento.setUTCHours(23, 59, 59, 999)

  const categoriaAtual = categorizarDescricaoPrazo(descricaoPrazo)
  const agruparSemDia = ['replica_contestacao', 'contrarrazoes', 'embargos_declaracao', 'sentenca_monitoramento'].includes(categoriaAtual)

  let querySemelhantes = adminSupabase
    .from('process_prazos')
    .select('id, descricao')
    .eq('monitored_process_id', params.processo_id)
    .eq('tipo', tipoEvento === 'AUDIENCIA' ? 'audiencia' : 'prazo')
    .limit(50)

  if (!agruparSemDia) {
    querySemelhantes = querySemelhantes
      .gte('data_vencimento', inicioDiaVencimento.toISOString())
      .lte('data_vencimento', fimDiaVencimento.toISOString())
  }

  const { data: prazosSemelhantes } = await querySemelhantes

  const duplicadoSemantico = Array.isArray(prazosSemelhantes)
    ? prazosSemelhantes.some((item: any) => categorizarDescricaoPrazo(item?.descricao) === categoriaAtual)
    : false

  if (duplicadoSemantico) {
    const payload = withPrazoDuty({
      tipo_evento: tipoEvento,
      requer_acao: true,
      acao_sugerida: descricaoPrazo,
      prazo_extraido_dias: prazoExplicito?.dias ?? null,
      data_vencimento_extraida: vencimento.toISOString(),
      confianca_analise: prazoExplicito ? 'alta' : 'media',
      origem: prazoExplicito ? 'deterministica' : analiseLLM ? 'llm' : 'heuristica',
      motivo: 'Prazo semanticamente semelhante ja existe; novo prazo nao foi recriado.',
      evidencia: prazoExplicito?.evidencia ?? null,
    })
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload,
    })
    console.log(
      `[ANALISADOR] Prazo semelhante ja existente para ${params.numero_cnj} (${descricaoPrazo}). Ignorando duplicata.`
    )
    return buildAnaliseResult(payload, 'duplicate_skipped')
  }

  const confiancaAcaoAutomatica: AnaliseMovimentacaoPayload['confianca_analise'] = prazoExplicito
    ? 'alta'
    : analiseLLM
      ? 'media'
      : 'baixa'

  if (confiancaAcaoAutomatica !== 'alta') {
    const payload = withPrazoDuty({
      tipo_evento: tipoEvento,
      requer_acao: true,
      acao_sugerida: descricaoPrazo,
      prazo_extraido_dias: prazoExplicito?.dias ?? null,
      data_vencimento_extraida: vencimento.toISOString(),
      confianca_analise: confiancaAcaoAutomatica,
      origem: analiseLLM ? 'llm' : 'heuristica',
      motivo: analiseLLM?.gerar
        ? `${analiseLLM.motivo} Em beta, a criacao automatica de prazo/card exige evidencia deterministica de alta confianca.`
        : 'Evento juridico acionavel detectado por heuristica; em beta, exige revisao humana antes de criar prazo/card.',
      evidencia: prazoExplicito?.evidencia ?? null,
    })

    return persistirRevisaoMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      processoId: params.processo_id,
      payload,
    })
  }

  try {
  // Upsert do card do processo — um card por processo, movimentacoes acumuladas
  const movimentacaoEntry = {
    data: params.movimentacao.data ?? new Date().toISOString().slice(0, 10),
    conteudo: params.movimentacao.conteudo ?? '',
    tipo_evento: tipoEvento,
    escavador_movimentacao_id: escavadorMovimentacaoId,
    criado_em: new Date().toISOString()
  }

  const pipelineContext = await resolveProcessPipelineContext({
    supabase: adminSupabase,
    tenantId: params.tenant_id,
    linkedTaskId: processo?.linked_task_id,
    processNumber: params.numero_cnj,
  })
  const pipelineId = pipelineContext.pipelineId
  const stageId = chooseSemanticLegalStage(pipelineContext.visibleStages, [
    descricaoPrazo,
    tipoEvento,
    params.movimentacao.conteudo ?? '',
  ]) || pipelineContext.fallbackStageId

  if (!pipelineId || !stageId) {
    throw new Error(`Pipeline juridica nao encontrada para ${params.numero_cnj}; prazo automatico nao foi criado sem card Kanban.`)
  }

  const { data: cardsExistentes, error: cardsError } = await adminSupabase
    .from('process_tasks')
    .select('id, title, description, client_name, movimentacoes_timeline')
    .eq('tenant_id', params.tenant_id)
    .eq('processo_1grau', params.numero_cnj)
    .eq('pipeline_id', pipelineId || '')
    .order('updated_at', { ascending: false })
    .limit(1)
  if (cardsError) throw new Error(`Falha ao buscar card processual existente: ${cardsError.message}`)

  const cardExistente = cardsExistentes?.[0] ?? null
  let taskId: string | null = null

  if (cardExistente && stageId) {
    const timelineAtual = Array.isArray(cardExistente.movimentacoes_timeline)
      ? cardExistente.movimentacoes_timeline
      : []
    const timelineAtualizada = appendUniqueMovementEntry(timelineAtual, movimentacaoEntry)
    const cardClientName = buildProcessCardClientName(processo ?? {})
    const cardDescription = buildProcessCardDescription({
      processo: {
        ...(processo ?? {}),
        numero_processo: params.numero_cnj,
      },
      resumoCurto: processo?.resumo_curto,
      proximaAcao: descricaoPrazo,
    })

    const { data: updatedCard, error: updateCardError } = await adminSupabase
      .from('process_tasks')
      .update({
        stage_id: stageId,
        movimentacoes_timeline: timelineAtualizada,
        client_name: cardExistente.client_name || cardClientName,
        description: cardExistente.description || cardDescription,
        andamento_1grau: descricaoPrazo,
        prazo_fatal: vencimento.toISOString(),
        escavador_movimentacao_id: escavadorMovimentacaoId,
        updated_at: new Date().toISOString()
      })
      .eq('id', cardExistente.id)
      .eq('tenant_id', params.tenant_id)
      .select('id')
      .maybeSingle()
    if (updateCardError) throw new Error(`Falha ao atualizar card processual: ${updateCardError.message}`)
    if (!updatedCard?.id) throw new Error('Card processual nao encontrado para atualizacao neste tenant.')

    taskId = cardExistente.id
  } else {
    const { count, error: countError } = await adminSupabase
      .from('process_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('stage_id', stageId)
      .eq('tenant_id', params.tenant_id)
    if (countError) throw new Error(`Falha ao calcular posicao do card processual: ${countError.message}`)
    const position_index = count ?? 0
    const cardTitle = buildProcessCardTitle({
      ...(processo ?? {}),
      numero_processo: params.numero_cnj,
    })
    const cardClientName = buildProcessCardClientName(processo ?? {})
    const cardDescription = buildProcessCardDescription({
      processo: {
        ...(processo ?? {}),
        numero_processo: params.numero_cnj,
      },
      resumoCurto: processo?.resumo_curto,
      proximaAcao: descricaoPrazo,
    })

    const { data: novoCard, error: insertCardError } = await adminSupabase.from('process_tasks').insert({
      tenant_id: params.tenant_id,
      pipeline_id: pipelineId,
      stage_id: stageId,
      title: cardTitle,
      description: cardDescription,
      client_name: cardClientName,
      processo_1grau: params.numero_cnj,
      andamento_1grau: descricaoPrazo,
      prazo_fatal: vencimento.toISOString(),
      movimentacoes_timeline: [movimentacaoEntry],
      assigned_to: params.advogado_id ?? null,
      escavador_movimentacao_id: escavadorMovimentacaoId,
      tags: [tipoEvento],
      position_index,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).select('id').single()
    if (insertCardError) throw new Error(`Falha ao criar card processual: ${insertCardError.message}`)

    taskId = novoCard?.id ?? null

    if (taskId) {
      const { error: linkError } = await adminSupabase
        .from('monitored_processes')
        .update({ linked_task_id: taskId })
        .eq('id', params.processo_id)
        .eq('tenant_id', params.tenant_id)
      if (linkError) throw new Error(`Falha ao vincular card ao processo monitorado: ${linkError.message}`)
    }
  }

  // Registra em process_prazos
  const { error: prazoError } = await adminSupabase.from('process_prazos').upsert(
    {
      tenant_id: params.tenant_id,
      monitored_process_id: params.processo_id,
      process_task_id: taskId,
      tipo: tipoEvento === 'AUDIENCIA' ? 'audiencia' : 'prazo',
      descricao: descricaoPrazo,
      data_vencimento: vencimento.toISOString(),
      status: 'pendente',
      responsavel_id: params.advogado_id ?? null,
      escavador_movimentacao_id: escavadorMovimentacaoId,
      prioridade: prioridadePrazo as any,
      criado_por_ia: true,
      created_at: new Date().toISOString()
    },
    {
      onConflict: escavadorMovimentacaoId
        ? 'monitored_process_id,escavador_movimentacao_id'
        : 'monitored_process_id,tipo,descricao,data_vencimento',
      ignoreDuplicates: true
    }
  )
  if (prazoError) throw new Error(`Falha ao registrar prazo processual: ${prazoError.message}`)

  const payloadFinal = withPrazoDuty({
    tipo_evento: tipoEvento,
    requer_acao: true,
    acao_sugerida: descricaoPrazo,
    prazo_extraido_dias: prazoExplicito?.dias ?? null,
    data_vencimento_extraida: vencimento.toISOString(),
    confianca_analise: 'alta',
    origem: 'deterministica',
    motivo: prazoExplicito?.evidencia
      ? `Prazo explicito identificado na movimentacao: ${prazoExplicito.evidencia}`
      : 'Prazo criado por regra deterministica de alta confianca.',
    evidencia: prazoExplicito?.evidencia ?? null,
  })

  await persistirAnaliseMovimentacao({
    tenantId: params.tenant_id,
    numeroCnj: params.numero_cnj,
    processMovimentacaoId: params.process_movimentacao_id,
    escavadorMovimentacaoId,
    payload: payloadFinal,
  })

  const proactiveDraft = await prepareProactiveMovementDraft({
    tenantId: params.tenant_id,
    processTaskId: taskId,
    processNumber: params.numero_cnj,
    movementText: params.movimentacao.conteudo ?? '',
    movementDate: params.movimentacao.data ?? null,
    movementId: escavadorMovimentacaoId,
    eventType: tipoEvento,
    deadlineDescription: descricaoPrazo,
    responsibleUserId: params.advogado_id ?? processo?.advogado_responsavel_id ?? null,
    metadata: {
      requer_acao: payloadFinal.requer_acao,
      obrigacao_de_quem: payloadFinal.obrigacao_de_quem ?? null,
      polo_representado: payloadFinal.polo_representado ?? null,
      confidence: payloadFinal.confidence ?? payloadFinal.confianca_analise,
    },
  })

  if (proactiveDraft.status === 'prepared') {
    console.log(
      `[ANALISADOR] Lex proativo preparou ${proactiveDraft.recommendedPieceLabel} para ${params.numero_cnj}.`
    )
  } else if (proactiveDraft.status === 'failed') {
    console.error(`[ANALISADOR] Lex proativo falhou para ${params.numero_cnj}: ${proactiveDraft.reason}`)
  }

  console.log(`[ANALISADOR] ✅ ${regraPrazo.tipo_tarefa} criado para ${params.numero_cnj} — vence ${vencimento.toDateString()}`)
  return buildAnaliseResult(payloadFinal, 'deadline_card_created', taskId)
  } catch (error) {
    const errorMessage = sanitizeAutomationError(error)
    const payloadFalha = withPrazoDuty({
      tipo_evento: tipoEvento,
      requer_acao: true,
      acao_sugerida: descricaoPrazo,
      prazo_extraido_dias: prazoExplicito?.dias ?? null,
      data_vencimento_extraida: vencimento.toISOString(),
      confianca_analise: 'alta',
      origem: 'deterministica',
      motivo: `Prazo de alta confianca nao foi criado por falha operacional: ${errorMessage}`,
      evidencia: prazoExplicito?.evidencia ?? null,
    })

    await registrarFalhaAutomacaoMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      processoId: params.processo_id,
      errorMessage,
      payload: payloadFalha,
    })
    return persistirRevisaoMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      processoId: params.processo_id,
      payload: payloadFalha,
    })
  }
}
