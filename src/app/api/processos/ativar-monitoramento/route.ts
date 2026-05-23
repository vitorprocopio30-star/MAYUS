import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { escavadorFetch } from '@/lib/services/escavador-client'
import { criarMonitoramentoProcesso, solicitarResumoProcesso } from '@/lib/services/monitoramento-processos'
import { requireTenantApiKey } from '@/lib/integrations/server'
import {
  buildEscavadorBudgetBlockedPayload,
  evaluateEscavadorBudget,
  registerEscavadorBudgetEvent,
} from '@/lib/agent/runtime/escavador-budget'
import {
  buildMonitoringOverageBlockedPayload,
  buildMonitoringOverageQuote,
  recordMonitoringUsageSnapshot,
} from '@/lib/finance/monitoring-overage'

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

  const { numero_cnj, confirmar_custo } = await req.json()
  if (!numero_cnj)
    return NextResponse.json(
      { error: 'numero_cnj obrigatório' },
      { status: 400 }
    )

  const cnj_encoded = encodeURIComponent(numero_cnj)

  const { data: existente } = await adminSupabase
    .from('monitored_processes')
    .select('id, escavador_monitoramento_id, monitoramento_ativo, ativo')
    .eq('tenant_id', tenantId)
    .eq('numero_processo', numero_cnj)
    .maybeSingle()

  if (existente?.ativo !== false && existente?.monitoramento_ativo && existente?.escavador_monitoramento_id) {
    return NextResponse.json({
      ok: true,
      ja_monitorado: true,
      monitoramento_id: existente.escavador_monitoramento_id,
      monitoramento_ativo: true,
    })
  }

  const overageQuote = await buildMonitoringOverageQuote({
    tenantId,
    incomingCount: 1,
    client: adminSupabase,
  })

  if (overageQuote.overageCount > 0 && confirmar_custo !== true) {
    return NextResponse.json({
      requer_confirmacao: true,
      monitoring_overage: buildMonitoringOverageBlockedPayload(overageQuote).monitoring_overage,
      mensagem: `${overageQuote.freeSlots} entram no plano. Este monitoramento custara R$${overageQuote.projectedAmount.toFixed(2)}/mes.`,
    })
  }

  if (overageQuote.overageCount > 0 && !overageQuote.paymentReady) {
    const blockedPayload = buildMonitoringOverageBlockedPayload(overageQuote)
    const now = new Date().toISOString()
    await adminSupabase.from('system_event_logs').insert({
      tenant_id: tenantId,
      user_id: user.id,
      source: 'monitoramento',
      provider: 'mayus',
      event_name: 'monitoring_overage_blocked',
      status: 'blocked',
      payload: blockedPayload,
      created_at: now,
    })
    if (overageQuote.blockedReason === 'monitoring_overage_terms_required') {
      await adminSupabase.from('system_event_logs').insert({
        tenant_id: tenantId,
        user_id: user.id,
        source: 'monitoramento',
        provider: 'mayus',
        event_name: 'monitoring_overage_terms_required',
        status: 'blocked',
        payload: blockedPayload,
        created_at: now,
      })
    }
    return NextResponse.json(blockedPayload, { status: 402 })
  }

  const estimatedCostCents = 100
  const budgetCheck = await evaluateEscavadorBudget({
    tenantId,
    estimatedCostCents,
    client: adminSupabase,
  })

  if (!budgetCheck.allowed) {
    await registerEscavadorBudgetEvent({
      tenantId,
      userId: user.id,
      action: 'ativar_monitoramento_processo',
      source: 'processos_ativar_monitoramento',
      status: 'blocked',
      estimatedCostCents,
      decision: budgetCheck.decision,
      client: adminSupabase,
    })
    return NextResponse.json(buildEscavadorBudgetBlockedPayload(budgetCheck), { status: 402 })
  }

  await registerEscavadorBudgetEvent({
    tenantId,
    userId: user.id,
    action: 'ativar_monitoramento_processo',
    source: 'processos_ativar_monitoramento',
    status: budgetCheck.decision.status,
    estimatedCostCents,
    decision: budgetCheck.decision,
    client: adminSupabase,
  })

  const { apiKey } = await requireTenantApiKey(tenantId, 'escavador')

  if (!apiKey)
    return NextResponse.json(
      { error: 'Escavador nÃ£o configurado' },
      { status: 400 }
    )

  // 1. Busca dados completos do processo via API V2
  let dadosCompletos: any = null
  try {
    dadosCompletos = await escavadorFetch(
      `/processos/numero_cnj/${cnj_encoded}`,
      apiKey,
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
    apiKey,
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

  await adminSupabase
    .from('process_movimentacoes_inbox')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('numero_cnj', numero_cnj)

  const resumoSolicitado = monitoramentoId
    ? await solicitarResumoProcesso(tenantId, apiKey, numero_cnj)
    : false

  if (monitoramentoId) {
    await recordMonitoringUsageSnapshot({
      tenantId,
      currentQuantity: overageQuote.currentMonitored + 1,
      includedLimit: overageQuote.includedLimit,
      unitPriceCents: overageQuote.unitPriceCents,
      client: adminSupabase,
      metadata: {
        source: 'processos_ativar_monitoramento',
        numero_processo: numero_cnj,
      },
    })
  }

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
