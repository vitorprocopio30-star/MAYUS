import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

  // Filtrar duplicatas
  const numeros = processos.map((p: Record<string, string>) => p.numero_processo)
  const { data: existentes } = await adminSupabase
    .from('monitored_processes').select('numero_processo')
    .eq('tenant_id', tenantId).in('numero_processo', numeros)
  const existentesSet = new Set((existentes ?? []).map((e: { numero_processo: string }) => e.numero_processo))
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

  // Montar rows com TODOS os campos ricos e sincronizar com Escavador
  const rows = await Promise.all(novos.map(async (p: Record<string, unknown>) => {
    // Sincronizar com Escavador v2
    if (integration?.api_key) {
      try {
        await fetch('https://api.escavador.com/api/v2/monitoramentos/processos', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${integration.api_key}`,
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify({
            numero: p.numero_processo,
            frequencia: 'semanal',
          })
        })
      } catch (err) {
        console.error(`[sinc-escavador] Erro no processo ${p.numero_processo}:`, err)
      }
    }

    return {
      tenant_id: tenantId,
      numero_processo: p.numero_processo,
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
      raw_escavador: p.raw_escavador ?? null,
      ultima_atualizacao_escavador: new Date().toISOString(),
      monitoramento_ativo: true,
      ativo: true,
    }
  }))

  const { error } = await adminSupabase
    .from('monitored_processes')
    .insert(rows)

  if (error && !error.message.includes('duplicate')) {
    console.error('[importar-lote]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const importados = novos.length
  await adminSupabase.rpc('increment_processos_monitorados', { p_tenant_id: tenantId, p_quantidade: importados })

  return NextResponse.json({
    importados,
    ignorados: existentesSet.size,
    excedente_cobrado: excedente,
    custo_gerado: custoMensal,
    mensagem: excedente > 0
      ? `${importados} processos monitorados. ${excedente} excedentes (R$${custoMensal.toFixed(2)}/mês).`
      : `${importados} processos monitorados no plano.`
  })
}
