import { createClient } from '@supabase/supabase-js'
import { getLLMClient, buildHeaders } from '@/lib/llm-router'

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

async function classificarComLLM(tenantId: string, conteudo: string, resumo: string | null): Promise<string | null> {
  const tipos = 'CONTESTACAO, SENTENCA, RECURSO, AUDIENCIA, DESPACHO, CITACAO, ARQUIVAMENTO, EXTINCAO'
  try {
    const llm = await getLLMClient(adminSupabase, tenantId, 'classificar_movimentacao')
    const res = await fetch(llm.endpoint, {
      method: 'POST',
      headers: buildHeaders(llm),
      body: JSON.stringify({
        model: llm.model,
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
        ]
      })
    })
    const data = await res.json()
    const tipo = data.choices?.[0]?.message?.content?.trim().toUpperCase().replace(/[^A-Z]/g, '')
    return tipos.includes(tipo) ? tipo : null
  } catch (err) {
    console.error('[ANALISADOR] Falha LLM:', err)
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
  const ultimas = (movimentacoes ?? []).slice(0, 5)
  if (ultimas.length === 0) return 'Sem historico disponivel'

  return ultimas
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

function mapearPrioridade(analise: AnalisePrazoLLM | null): string | null {
  if (!analise || !analise.gerar) return null
  if (analise.urgencia === 'alta') return 'alta'
  if (analise.urgencia === 'media') return 'media'
  if (analise.urgencia === 'baixa') return 'baixa'
  return null
}

async function analisarComLLM(params: {
  tenantId: string
  monitoredProcess: MonitoredProcessContext
  textoMovimentacao: string
}): Promise<AnalisePrazoLLM | null> {
  try {
    const llm = await getLLMClient(adminSupabase, params.tenantId, 'classificar_movimentacao')
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

5. CLASSE PROCESSUAL:
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

    const res = await fetch(llm.endpoint, {
      method: 'POST',
      headers: buildHeaders(llm),
      body: JSON.stringify({
        model: llm.model,
        temperature: 0,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    const data = await res.json()
    const responseText = data.choices?.[0]?.message?.content?.trim()
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
  } catch (err) {
    console.error('[ANALISADOR] Falha ao analisar com LLM:', err)
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
}) {
  const textoBruto = (params.movimentacao.conteudo ?? '').toLowerCase()
  const texto = textoBruto.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  const escavadorMovimentacaoId =
    (params.escavador_movimentacao_id ?? String(params.movimentacao.id ?? '')).trim() || null

  // Busca contexto do processo
  const { data: processo } = await adminSupabase
    .from('monitored_processes')
    .select('numero_processo, resumo_curto, cliente_nome, tribunal, partes, movimentacoes, advogado_responsavel_id, classe_processual')
    .eq('id', params.processo_id)
    .single()

  const analiseLLM = processo
    ? await analisarComLLM({
        tenantId: params.tenant_id,
        monitoredProcess: processo as MonitoredProcessContext,
        textoMovimentacao: params.movimentacao.conteudo ?? ''
      })
    : null

  if (analiseLLM && !analiseLLM.gerar) {
    console.log(`[ANALISADOR] Prazo nao gerado: ${analiseLLM.motivo}`)
    return
  }

  let tipoEvento = mapearTipoEventoPorAnalise(analiseLLM, texto)

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

  if (!tipoEvento) return

  // Busca regra de prazo
  const { data: prazo } = await adminSupabase
    .from('prazos_processuais')
    .select('*')
    .eq('tipo_evento', tipoEvento)
    .single()

  if (!prazo) return

  // Arquivamento/extinção: encerra processo
  if (tipoEvento === 'ARQUIVAMENTO' || tipoEvento === 'EXTINCAO') {
    await adminSupabase
      .from('monitored_processes')
      .update({ ativo: false, monitoramento_ativo: false, kanban_coluna: 'ENCERRADO' })
      .eq('id', params.processo_id)
    console.log(`[ANALISADOR] Processo encerrado: ${params.numero_cnj}`)
    return
  }

  const dataBase = params.movimentacao.data ? new Date(params.movimentacao.data) : new Date()
  const vencimento = parseDataVencimentoLLM(analiseLLM && analiseLLM.gerar ? analiseLLM.data_vencimento : undefined)
    ?? calcularDiasUteis(dataBase, prazo.dias_uteis)
  const descricaoPrazo = String(analiseLLM?.gerar ? analiseLLM.descricao : prazo.descricao ?? '').trim()
  const prioridadePrazo = mapearPrioridade(analiseLLM) ?? prazo.prioridade.toLowerCase()

  // Nao gerar prazo para despachos genericos
  if (descricaoPrazo.toLowerCase().includes('despacho')) {
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

  const { data: prazosSemelhantes } = await adminSupabase
    .from('process_prazos')
    .select('id')
    .eq('monitored_process_id', params.processo_id)
    .eq('tipo', tipoEvento === 'AUDIENCIA' ? 'audiencia' : 'prazo')
    .eq('descricao', descricaoPrazo)
    .gte('data_vencimento', inicioDiaVencimento.toISOString())
    .lte('data_vencimento', fimDiaVencimento.toISOString())
    .limit(1)

  if (prazosSemelhantes && prazosSemelhantes.length > 0) {
      console.log(
      `[ANALISADOR] Prazo semelhante ja existente para ${params.numero_cnj} (${descricaoPrazo}). Ignorando duplicata.`
      )
      return
  }

  // Conta cards no stage para position_index
  const { count } = await adminSupabase
    .from('process_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('stage_id', '5ecb8f05-042d-40e7-a093-e1f3ce8478da')
  const position_index = count ?? 0

  // Cria card no Kanban (process_tasks)
  const { data: task } = await adminSupabase.from('process_tasks').insert({
    pipeline_id: '7b4d39bb-785c-402a-826d-0088867d934c',
    stage_id: '5ecb8f05-042d-40e7-a093-e1f3ce8478da',
    title: `${descricaoPrazo}`,
    description: `Processo: ${params.numero_cnj}\nCliente: ${processo?.cliente_nome ?? 'N/D'}\n\n${params.movimentacao.conteudo}`,
    assigned_to: params.advogado_id ?? null,
    prazo_fatal: vencimento.toISOString(),
    processo_1grau: params.numero_cnj,
    escavador_movimentacao_id: escavadorMovimentacaoId,
    position_index,
    tags: [prazo.tipo_tarefa],
    created_at: new Date().toISOString()
  }).select('id').single()

  // Registra em process_prazos
  await adminSupabase.from('process_prazos').upsert(
    {
      tenant_id: params.tenant_id,
      monitored_process_id: params.processo_id,
      process_task_id: task?.id ?? null,
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

  console.log(`[ANALISADOR] ✅ ${prazo.tipo_tarefa} criado para ${params.numero_cnj} — vence ${vencimento.toDateString()}`)
}
