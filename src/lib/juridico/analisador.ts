import { createClient } from '@supabase/supabase-js'
import { callLLMWithFallback } from '@/lib/llm-fallback'
import { prepareProactiveMovementDraft } from '@/lib/lex/proactive-movement-draft'
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

type AnaliseMovimentacaoPayload = {
  tipo_evento: string | null
  requer_acao: boolean
  acao_sugerida: string | null
  prazo_extraido_dias: number | null
  data_vencimento_extraida: string | null
  confianca_analise: 'alta' | 'media' | 'baixa'
  origem: 'deterministica' | 'llm' | 'heuristica' | 'ignorada'
  motivo: string
  evidencia?: string | null
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

async function persistirAnaliseMovimentacao(params: {
  tenantId: string
  numeroCnj: string
  processMovimentacaoId?: string | null
  escavadorMovimentacaoId?: string | null
  payload: AnaliseMovimentacaoPayload
}) {
  const updatePayload = {
    tipo_evento: params.payload.tipo_evento,
    requer_acao: params.payload.requer_acao,
    acao_sugerida: params.payload.acao_sugerida,
    prazo_extraido_dias: params.payload.prazo_extraido_dias,
    data_vencimento_extraida: params.payload.data_vencimento_extraida,
    confianca_analise: params.payload.confianca_analise,
    analise_json: params.payload,
    analisado_em: new Date().toISOString(),
  }

  try {
    if (params.processMovimentacaoId) {
      const { error } = await adminSupabase
        .from('process_movimentacoes')
        .update(updatePayload)
        .eq('id', params.processMovimentacaoId)
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
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload: {
        tipo_evento: null,
        requer_acao: false,
        acao_sugerida: null,
        prazo_extraido_dias: null,
        data_vencimento_extraida: null,
        confianca_analise: 'alta',
        origem: 'ignorada',
        motivo: 'Movimentacao de baixo sinal sem comando processual concreto.',
      },
    })
    console.log(`[ANALISADOR] Movimentacao de baixo sinal ignorada para ${params.numero_cnj}.`)
    return
  }

  // Busca contexto do processo
  const { data: processo } = await adminSupabase
    .from('monitored_processes')
    .select('numero_processo, resumo_curto, cliente_nome, tribunal, partes, movimentacoes, advogado_responsavel_id, classe_processual, linked_task_id')
    .eq('id', params.processo_id)
    .single()

  const analiseLLM = processo
    ? await analisarComLLM({
        tenantId: params.tenant_id,
        monitoredProcess: processo as MonitoredProcessContext,
        textoMovimentacao: params.movimentacao.conteudo ?? ''
      })
    : null

  if (analiseLLM && !analiseLLM.gerar && !prazoExplicito) {
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload: {
        tipo_evento: null,
        requer_acao: false,
        acao_sugerida: null,
        prazo_extraido_dias: null,
        data_vencimento_extraida: null,
        confianca_analise: 'media',
        origem: 'llm',
        motivo: analiseLLM.motivo,
      },
    })
    console.log(`[ANALISADOR] Prazo nao gerado: ${analiseLLM.motivo}`)
    return
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
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload: {
        tipo_evento: null,
        requer_acao: false,
        acao_sugerida: null,
        prazo_extraido_dias: null,
        data_vencimento_extraida: null,
        confianca_analise: 'baixa',
        origem: 'heuristica',
        motivo: 'Nao foi possivel classificar a movimentacao em um evento juridico acionavel.',
      },
    })
    return
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
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload: {
        tipo_evento: tipoEvento,
        requer_acao: true,
        acao_sugerida: analiseLLM?.gerar ? analiseLLM.descricao : 'Revisar possivel prazo processual',
        prazo_extraido_dias: null,
        data_vencimento_extraida: null,
        confianca_analise: 'baixa',
        origem: analiseLLM ? 'llm' : 'heuristica',
        motivo: 'Possivel prazo identificado sem vencimento confiavel; prazo automatico nao foi criado.',
      },
    })
    return
  }

  if (!regraPrazo) {
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload: {
        tipo_evento: tipoEvento,
        requer_acao: false,
        acao_sugerida: null,
        prazo_extraido_dias: null,
        data_vencimento_extraida: null,
        confianca_analise: 'baixa',
        origem: 'heuristica',
        motivo: 'Evento classificado, mas sem regra de prazo configurada.',
      },
    })
    return
  }

  // Arquivamento/extinção: encerra processo
  if (tipoEvento === 'ARQUIVAMENTO' || tipoEvento === 'EXTINCAO') {
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload: {
        tipo_evento: tipoEvento,
        requer_acao: false,
        acao_sugerida: null,
        prazo_extraido_dias: null,
        data_vencimento_extraida: null,
        confianca_analise: analiseLLM ? 'media' : 'baixa',
        origem: analiseLLM ? 'llm' : 'heuristica',
        motivo: 'Movimentacao indica encerramento/arquivamento do processo.',
      },
    })
    await adminSupabase
      .from('monitored_processes')
      .update({ ativo: false, monitoramento_ativo: false, kanban_coluna: 'ENCERRADO' })
      .eq('id', params.processo_id)
    console.log(`[ANALISADOR] Processo encerrado: ${params.numero_cnj}`)
    return
  }

  const vencimento = prazoExplicito?.vencimento
    ?? parseDataVencimentoLLM(analiseLLM && analiseLLM.gerar ? analiseLLM.data_vencimento : undefined)
    ?? calcularDiasUteis(dataBase, regraPrazo.dias_uteis)
  const descricaoPrazo = String(prazoExplicito?.descricao || (analiseLLM?.gerar ? analiseLLM.descricao : regraPrazo.descricao) || '').trim()
  const prioridadePrazo = mapearPrioridade(analiseLLM) ?? String(regraPrazo.prioridade || 'MEDIA').toLowerCase()

  // Nao gerar prazo para despachos genericos
  if (descricaoPrazo.toLowerCase().includes('despacho')) {
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload: {
        tipo_evento: tipoEvento,
        requer_acao: false,
        acao_sugerida: null,
        prazo_extraido_dias: null,
        data_vencimento_extraida: null,
        confianca_analise: 'alta',
        origem: prazoExplicito ? 'deterministica' : analiseLLM ? 'llm' : 'heuristica',
        motivo: 'Despacho generico ignorado para evitar criacao indevida de prazo.',
      },
    })
    console.log(`[ANALISADOR] Despacho generico ignorado para ${params.numero_cnj}.`)
    return
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
      await persistirAnaliseMovimentacao({
        tenantId: params.tenant_id,
        numeroCnj: params.numero_cnj,
        processMovimentacaoId: params.process_movimentacao_id,
        escavadorMovimentacaoId,
        payload: {
          tipo_evento: tipoEvento,
          requer_acao: true,
          acao_sugerida: descricaoPrazo,
          prazo_extraido_dias: prazoExplicito?.dias ?? null,
          data_vencimento_extraida: vencimento.toISOString(),
          confianca_analise: prazoExplicito ? 'alta' : 'media',
          origem: prazoExplicito ? 'deterministica' : analiseLLM ? 'llm' : 'heuristica',
          motivo: 'Movimentacao ja processada anteriormente; prazo duplicado nao foi recriado.',
          evidencia: prazoExplicito?.evidencia ?? null,
        },
      })
      console.log(
        `[ANALISADOR] Movimentacao ${escavadorMovimentacaoId} ja processada para ${params.numero_cnj}. Ignorando duplicata.`
      )
      return
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
    await persistirAnaliseMovimentacao({
      tenantId: params.tenant_id,
      numeroCnj: params.numero_cnj,
      processMovimentacaoId: params.process_movimentacao_id,
      escavadorMovimentacaoId,
      payload: {
        tipo_evento: tipoEvento,
        requer_acao: true,
        acao_sugerida: descricaoPrazo,
        prazo_extraido_dias: prazoExplicito?.dias ?? null,
        data_vencimento_extraida: vencimento.toISOString(),
        confianca_analise: prazoExplicito ? 'alta' : 'media',
        origem: prazoExplicito ? 'deterministica' : analiseLLM ? 'llm' : 'heuristica',
        motivo: 'Prazo semanticamente semelhante ja existe; novo prazo nao foi recriado.',
        evidencia: prazoExplicito?.evidencia ?? null,
      },
    })
    console.log(
      `[ANALISADOR] Prazo semelhante ja existente para ${params.numero_cnj} (${descricaoPrazo}). Ignorando duplicata.`
    )
    return
  }

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
    console.warn(`[ANALISADOR] Pipeline juridica nao encontrada para ${params.numero_cnj}. Prazo sera criado sem card.`)
  }

  const { data: cardsExistentes } = await adminSupabase
    .from('process_tasks')
    .select('id, title, description, client_name, movimentacoes_timeline')
    .eq('processo_1grau', params.numero_cnj)
    .eq('pipeline_id', pipelineId || '')
    .order('updated_at', { ascending: false })
    .limit(1)

  const cardExistente = cardsExistentes?.[0] ?? null
  let taskId: string | null = null

  if (cardExistente && stageId) {
    const timelineAtual = Array.isArray(cardExistente.movimentacoes_timeline)
      ? cardExistente.movimentacoes_timeline
      : []
    const timelineAtualizada = [...timelineAtual, movimentacaoEntry]
    const cardClientName = buildProcessCardClientName(processo ?? {})
    const cardDescription = buildProcessCardDescription({
      processo: {
        ...(processo ?? {}),
        numero_processo: params.numero_cnj,
      },
      resumoCurto: processo?.resumo_curto,
      proximaAcao: descricaoPrazo,
    })

    await adminSupabase
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

    taskId = cardExistente.id
  } else {
    if (!pipelineId || !stageId) {
      taskId = null
    } else {
    const { count } = await adminSupabase
      .from('process_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('stage_id', stageId)
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

    const { data: novoCard } = await adminSupabase.from('process_tasks').insert({
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

    taskId = novoCard?.id ?? null

    if (taskId) {
      await adminSupabase
        .from('monitored_processes')
        .update({ linked_task_id: taskId })
        .eq('id', params.processo_id)
    }
    }
  }

  // Registra em process_prazos
  await adminSupabase.from('process_prazos').upsert(
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
      onConflict: 'monitored_process_id,tipo,descricao,data_vencimento',
      ignoreDuplicates: true
    }
  )

  await persistirAnaliseMovimentacao({
    tenantId: params.tenant_id,
    numeroCnj: params.numero_cnj,
    processMovimentacaoId: params.process_movimentacao_id,
    escavadorMovimentacaoId,
    payload: {
      tipo_evento: tipoEvento,
      requer_acao: true,
      acao_sugerida: descricaoPrazo,
      prazo_extraido_dias: prazoExplicito?.dias ?? null,
      data_vencimento_extraida: vencimento.toISOString(),
      confianca_analise: prazoExplicito ? 'alta' : analiseLLM ? 'media' : 'baixa',
      origem: prazoExplicito ? 'deterministica' : analiseLLM ? 'llm' : 'heuristica',
      motivo: prazoExplicito?.evidencia
        ? `Prazo explicito identificado na movimentacao: ${prazoExplicito.evidencia}`
        : analiseLLM?.gerar
          ? analiseLLM.motivo
          : 'Prazo criado por regra de classificacao juridica.',
      evidencia: prazoExplicito?.evidencia ?? null,
    },
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
  })

  if (proactiveDraft.status === 'prepared') {
    console.log(
      `[ANALISADOR] Lex proativo preparou ${proactiveDraft.recommendedPieceLabel} para ${params.numero_cnj}.`
    )
  } else if (proactiveDraft.status === 'failed') {
    console.error(`[ANALISADOR] Lex proativo falhou para ${params.numero_cnj}: ${proactiveDraft.reason}`)
  }

  console.log(`[ANALISADOR] ✅ ${regraPrazo.tipo_tarefa} criado para ${params.numero_cnj} — vence ${vencimento.toDateString()}`)
}
