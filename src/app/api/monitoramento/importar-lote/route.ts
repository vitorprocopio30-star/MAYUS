import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { criarMonitoramentoProcesso, solicitarResumoProcesso } from '@/lib/services/monitoramento-processos'

interface MonitoramentoCapacity {
  total_monitorados: number
  gratuitos: number
  disponivel_sem_custo: number
  preco_extra: number
}

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { processos, confirmar_custo } = await req.json()

  const { data: profile } = await adminSupabase
    .from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })
  const tenantId = profile.tenant_id

  const { data: capacity } = await adminSupabase
    .rpc('check_monitoramento_capacity', { p_tenant_id: tenantId }).single() as { data: MonitoramentoCapacity | null; error: unknown }

  const gratuitos = capacity?.gratuitos ?? 100
  const jaMonitorados = capacity?.total_monitorados ?? 0
  const disponivelSemCusto = Math.max(0, gratuitos - jaMonitorados)
  const precoExtra = capacity?.preco_extra ?? 0.97

  // Filtrar duplicatas: só ignorar quem já tem monitoramento remoto ativo
  const numeros = processos.map((p: Record<string, string>) => p.numero_processo)
  const { data: existentes } = await adminSupabase
    .from('monitored_processes').select('numero_processo, escavador_monitoramento_id, monitoramento_ativo')
    .eq('tenant_id', tenantId).in('numero_processo', numeros)
  const existentesMap = new Map((existentes ?? []).map((e: any) => [
    e.numero_processo,
    {
      escavador_monitoramento_id: e.escavador_monitoramento_id,
      monitoramento_ativo: e.monitoramento_ativo,
    }
  ]))

  const processosJaMonitorados = processos.filter((p: Record<string, string>) => {
    const ex = existentesMap.get(p.numero_processo)
    return !!(ex?.escavador_monitoramento_id && ex?.monitoramento_ativo)
  })

  const existentesSet = new Set(processosJaMonitorados.map((p: Record<string, string>) => p.numero_processo))
  const novos = processos.filter((p: Record<string, string>) => !existentesSet.has(p.numero_processo))

  if (novos.length === 0)
    return NextResponse.json({ importados: 0, mensagem: 'Todos já estavam monitorados.' })

  const excedente = Math.max(0, novos.length - disponivelSemCusto)
  const custoMensal = excedente * precoExtra

  if (excedente > 0 && !confirmar_custo) {
    return NextResponse.json({
      requer_confirmacao: true,
      novos: novos.length,
      gratuitos_disponiveis: disponivelSemCusto,
      excedente,
      custo_mensal: custoMensal,
      preco_por_extra: precoExtra,
      mensagem: `${disponivelSemCusto} entram no plano. Os outros ${excedente} custam R$${custoMensal.toFixed(2)}/mês.`
    })
  }

  // Buscar API Key do Escavador para sincronização
  const { data: integration } = await adminSupabase
    .from('tenant_integrations')
    .select('api_key')
    .eq('tenant_id', tenantId)
    .eq('provider', 'escavador')
    .in('status', ['active', 'connected'])
    .single()

  if (!integration?.api_key) {
    return NextResponse.json(
      { error: 'Integração Escavador não configurada ou inativa.' },
      { status: 400 }
    )
  }

  const rows: Record<string, unknown>[] = []
  const falhasMonitoramento: Array<{ numero_processo: string; motivo: string }> = []

  for (const p of novos) {
    const numeroProcesso = String(p.numero_processo ?? '')
    if (!numeroProcesso) continue

    let monitoramentoId: string | null = null

    const monitoramento = await criarMonitoramentoProcesso({
      tenantId,
      apiKey: integration.api_key,
      numeroProcesso,
      frequencia: 'semanal'
    })

    if (!monitoramento.ok || !monitoramento.monitoramentoId) {
      falhasMonitoramento.push({
        numero_processo: numeroProcesso,
        motivo: monitoramento.error || 'Falha ao criar monitoramento no Escavador'
      })
      continue
    }

    monitoramentoId = monitoramento.monitoramentoId

    rows.push({
      tenant_id: tenantId,
      numero_processo: numeroProcesso,
      tribunal: p.tribunal,
      comarca: p.comarca ?? null,
      vara: p.vara ?? null,
      assunto: p.assunto,
      classe_processual: p.classe_processual ?? null,
      tipo_acao: p.tipo_acao ?? null,
      status: p.status ?? 'ATIVO',
      fase_atual: p.fase_atual,
      valor_causa: p.valor_causa ?? null,
      data_distribuicao: p.data_distribuicao ?? null,
      partes: {
        polo_ativo: p.polo_ativo,
        polo_passivo: p.polo_passivo,
        data_inicio: p.data_distribuicao,
        valor_causa: p.valor_causa,
      },
      envolvidos: p.envolvidos ?? [],
      movimentacoes: p.movimentacoes ?? [],
      ultima_movimentacao_texto: p.ultima_movimentacao_texto ?? null,
      data_ultima_movimentacao: p.data_ultima_movimentacao ?? null,
      escavador_id: p.escavador_id ?? null,
      escavador_monitoramento_id: monitoramentoId,
      raw_escavador: p.raw_escavador ?? null,
      ultima_atualizacao_escavador: new Date().toISOString(),
      monitoramento_ativo: !!monitoramentoId,
      ativo: true,
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({
      importados: 0,
      ignorados: existentesSet.size,
      falhas_monitoramento: falhasMonitoramento,
      mensagem: 'Nenhum processo foi monitorado com sucesso.'
    })
  }

  const { error } = await adminSupabase
    .from('monitored_processes')
    .upsert(rows, { onConflict: 'tenant_id,numero_processo' })

  if (error && !error.message.includes('duplicate')) {
    console.error('[importar-lote]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const importados = rows.length
  await adminSupabase.rpc('increment_processos_monitorados', { p_tenant_id: tenantId, p_quantidade: importados })

  const resultadosResumo = await Promise.allSettled(
    rows.map((r) => solicitarResumoProcesso(tenantId, integration.api_key, String(r.numero_processo)))
  )
  const resumosSolicitados = resultadosResumo.filter((r) => r.status === 'fulfilled' && r.value).length

  return NextResponse.json({
    importados,
    ignorados: processosJaMonitorados.length,
    falhas_monitoramento: falhasMonitoramento,
    resumos_solicitados: resumosSolicitados,
    excedente_cobrado: excedente,
    custo_gerado: custoMensal,
    mensagem: excedente > 0
      ? `${importados} processos monitorados. ${excedente} excedentes (R$${custoMensal.toFixed(2)}/mês).`
      : `${importados} processos monitorados no plano.`
  })
}
