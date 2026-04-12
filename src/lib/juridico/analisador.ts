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

export async function analisarMovimentacao(params: {
  processo_id: string
  numero_cnj: string
  tenant_id: string
  movimentacao: { conteudo?: string; data?: string }
  advogado_id?: string | null
}) {
  const textoBruto = (params.movimentacao.conteudo ?? '').toLowerCase()
  const texto = textoBruto.normalize("NFD").replace(/[\u0300-\u036f]/g, "")

  // Busca contexto do processo
  const { data: processo } = await adminSupabase
    .from('monitored_processes')
    .select('resumo_curto, cliente_nome')
    .eq('id', params.processo_id)
    .single()

  // 1. Tenta LLM
  let tipoEvento = await classificarComLLM(
    params.tenant_id,
    params.movimentacao.conteudo ?? '',
    processo?.resumo_curto ?? null
  )

  // 2. Fallback keywords
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
  const vencimento = calcularDiasUteis(dataBase, prazo.dias_uteis)

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
    title: `${prazo.descricao}`,
    description: `Processo: ${params.numero_cnj}\nCliente: ${processo?.cliente_nome ?? 'N/D'}\n\n${params.movimentacao.conteudo}`,
    assigned_to: params.advogado_id ?? null,
    prazo_fatal: vencimento.toISOString(),
    processo_1grau: params.numero_cnj,
    position_index,
    tags: [prazo.tipo_tarefa],
    created_at: new Date().toISOString()
  }).select('id').single()

  // Registra em process_prazos
  await adminSupabase.from('process_prazos').insert({
    tenant_id: params.tenant_id,
    monitored_process_id: params.processo_id,
    process_task_id: task?.id ?? null,
    tipo: tipoEvento === 'AUDIENCIA' ? 'audiencia' : 'prazo',
    descricao: prazo.descricao,
    data_vencimento: vencimento.toISOString(),
    status: 'pendente',
    responsavel_id: params.advogado_id ?? null,
    prioridade: prazo.prioridade.toLowerCase() as any,
    criado_por_ia: true,
    created_at: new Date().toISOString()
  })

  console.log(`[ANALISADOR] ✅ ${prazo.tipo_tarefa} criado para ${params.numero_cnj} — vence ${vencimento.toDateString()}`)
}
