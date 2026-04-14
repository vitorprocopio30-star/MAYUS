import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { escavadorFetch } from '@/lib/services/escavador-client'
import { criarMonitoramentoProcesso, solicitarResumoProcesso } from '@/lib/services/monitoramento-processos'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const {
    data: { user }
  } = await anonClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  const tenantId = profile?.tenant_id
  if (!tenantId)
    return NextResponse.json({ error: 'Tenant not found' }, { status: 400 })

  const { data: integration } = await adminSupabase
    .from('tenant_integrations')
    .select('api_key')
    .eq('tenant_id', tenantId)
    .eq('provider', 'escavador')
    .single()

  if (!integration?.api_key)
    return NextResponse.json(
      { error: 'Escavador não configurado' },
      { status: 400 }
    )

  const { numero_cnj } = await req.json()
  if (!numero_cnj)
    return NextResponse.json(
      { error: 'numero_cnj obrigatório' },
      { status: 400 }
    )

  const cnj_encoded = encodeURIComponent(numero_cnj)

  // 1. Busca dados completos do processo via API V2
  let dadosCompletos: any = null
  try {
    dadosCompletos = await escavadorFetch(
      `/processos/numero_cnj/${cnj_encoded}`,
      integration.api_key,
      tenantId
    )
  } catch (e) {
    console.error('[ATIVAR_MONITORAMENTO] Erro ao buscar dados completos:', e)
  }

  // 2. Extrai partes e campos do processo
  const partes = dadosCompletos?.partes ?? []
  const poloAtivo =
    partes
      .filter((p: any) => p.polo === 'ATIVO' && p.tipo !== 'ADVOGADO')
      .map((p: any) => p.nome)
      .join(', ') || '—'
  const poloPassivo =
    partes
      .filter((p: any) => p.polo === 'PASSIVO' && p.tipo !== 'ADVOGADO')
      .map((p: any) => p.nome)
      .join(', ') || '—'

  const fontes = dadosCompletos?.fontes ?? []
  const fonteTrib =
    fontes.find((f: any) => f.tribunal?.sigla || f.sistema) ?? fontes[0] ?? {}
  const capa = fonteTrib?.capa ?? {}

  const dadosEnriquecidos = {
    numero_cnj,
    tribunal:
      dadosCompletos?.unidade_origem?.tribunal_sigla ??
      fonteTrib?.tribunal?.sigla ??
      '—',
    assunto:
      capa?.assunto_principal_normalizado?.nome ?? capa?.assunto ?? '—',
    polo_ativo: poloAtivo,
    polo_passivo: poloPassivo,
    valor_causa: capa?.valor_causa?.valor_formatado ?? '—',
    data_inicio: dadosCompletos?.data_inicio ?? '—',
    ultima_movimentacao: dadosCompletos?.data_ultima_movimentacao ?? '—',
    status: capa?.status_predito ?? 'ATIVO'
  }

  // 3. Ativa monitoramento via API V2
  const monitoramento = await criarMonitoramentoProcesso({
    tenantId,
    apiKey: integration.api_key,
    numeroProcesso: numero_cnj,
    frequencia: 'SEMANAL'
  })
  const monitoramentoId = monitoramento.monitoramentoId

  // 4. Salva ID do monitoramento e dados enriquecidos no banco
  const { data: processoSalvo } = await adminSupabase
    .from('monitored_processes')
    .upsert({
      tenant_id: tenantId,
      numero_processo: numero_cnj,
      tribunal: dadosEnriquecidos.tribunal,
      assunto: dadosEnriquecidos.assunto,
      partes: {
        polo_ativo: dadosEnriquecidos.polo_ativo,
        polo_passivo: dadosEnriquecidos.polo_passivo,
      },
      data_ultima_movimentacao: dadosCompletos?.data_ultima_movimentacao ?? null,
      escavador_monitoramento_id: monitoramentoId,
      monitoramento_ativo: !!monitoramentoId,
      ultima_atualizacao_escavador: new Date().toISOString(),
      ativo: true
    }, { onConflict: 'tenant_id,numero_processo' })
    .select('id')
    .single()

  const resumoSolicitado = monitoramentoId
    ? await solicitarResumoProcesso(tenantId, integration.api_key, numero_cnj)
    : false

  // Dispara organizador IA em background
  if (processoSalvo?.id && token) {
    const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    fetch(`${appUrl}/api/agent/processos/organizar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ processo_id: processoSalvo.id })
    }).catch(console.error)
  }

  return NextResponse.json({
    ok: !!monitoramentoId,
    monitoramento_erro: monitoramento.error ?? null,
    monitoramento_id: monitoramentoId,
    monitoramento_ativo: !!monitoramentoId,
    resumo_solicitado: resumoSolicitado,
    dados_completos: dadosEnriquecidos
  })
}
