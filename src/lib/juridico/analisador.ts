import { createClient } from '@supabase/supabase-js'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const KEYWORDS: Record<string, string> = {
  'contestação': 'CONTESTACAO',
  'contestou': 'CONTESTACAO',
  'sentença': 'SENTENCA',
  'sentenciou': 'SENTENCA',
  'julgou procedente': 'SENTENCA',
  'recurso': 'RECURSO',
  'apelação': 'RECURSO',
  'audiência': 'AUDIENCIA',
  'designada': 'AUDIENCIA',
  'despacho': 'DESPACHO',
  'citação': 'CITACAO',
  'citado': 'CITACAO',
  'arquivado': 'ARQUIVAMENTO',
  'arquivamento': 'ARQUIVAMENTO',
  'extinto': 'EXTINCAO',
  'extinção': 'EXTINCAO',
  'baixa definitiva': 'ARQUIVAMENTO'
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

export async function analisarMovimentacao(params: {
  processo_id: string
  numero_cnj: string
  tenant_id: string
  movimentacao: { conteudo?: string; data?: string }
  advogado_id?: string | null
}) {
  const texto = (params.movimentacao.conteudo ?? '').toLowerCase()
  let tipoEvento: string | null = null

  for (const [kw, tipo] of Object.entries(KEYWORDS)) {
    if (texto.includes(kw)) {
      tipoEvento = tipo
      break
    }
  }

  // Sem classificação por keyword — encerra sem criar tarefa
  if (!tipoEvento) return

  const { data: prazo } = await adminSupabase
    .from('prazos_processuais')
    .select('*')
    .eq('tipo_evento', tipoEvento)
    .single()

  if (!prazo) return

  // Arquivamento/extinção: desativa monitoramento
  if (tipoEvento === 'ARQUIVAMENTO' || tipoEvento === 'EXTINCAO') {
    await adminSupabase
      .from('monitored_processes')
      .update({ ativo: false, monitoramento_ativo: false, kanban_coluna: 'ENCERRADO' })
      .eq('id', params.processo_id)
    return
  }

  const dataBase = params.movimentacao.data
    ? new Date(params.movimentacao.data)
    : new Date()
  const vencimento = calcularDiasUteis(dataBase, prazo.dias_uteis)

  await adminSupabase.from('tasks').insert({
    tenant_id: params.tenant_id,
    title: `[AUTO] ${prazo.descricao}`,
    description: `Processo: ${params.numero_cnj}\n\nMovimentação: ${params.movimentacao.conteudo}`,
    due_date: vencimento.toISOString(),
    priority: prazo.prioridade,
    status: 'PENDENTE',
    assigned_to: params.advogado_id ?? null,
    created_at: new Date().toISOString()
  })

  console.log(
    `[ANALISADOR] Tarefa criada: ${prazo.tipo_tarefa} para ${params.numero_cnj}`
  )
}
