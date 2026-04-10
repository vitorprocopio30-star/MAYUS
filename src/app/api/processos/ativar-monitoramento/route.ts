import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { escavadorFetch } from '@/lib/services/escavador-client'
import { solicitarResumoIA } from '@/lib/services/escavador-ia'

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

  // 3. Ativa monitoramento semanal via API V1
  let monitoramentoId: string | null = null
  try {
    const resMonitor = await fetch(
      'https://api.escavador.com/api/v1/monitoramentos',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${integration.api_key}`,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          tipo: 'PROCESSO',
          valor: numero_cnj,
          frequencia: 'SEMANAL',
          enviar_callback: 1
        })
      }
    )
    if (resMonitor.ok) {
      const mon = await resMonitor.json()
      monitoramentoId = String(mon.id ?? '')
    }
  } catch (e) {
    console.error('[ATIVAR_MONITORAMENTO] Erro ao criar monitoramento V1:', e)
  }

  // 4. Salva ID do monitoramento e dados enriquecidos no banco
  if (monitoramentoId) {
    await adminSupabase
      .from('monitored_processes')
      .update({
        escavador_monitoramento_id: monitoramentoId,
        monitoramento_ativo: true
      })
      .eq('numero_processo', numero_cnj)
      .eq('tenant_id', tenantId)

    // Dispara geração do resumo IA em background
    solicitarResumoIA(numero_cnj, tenantId).catch(console.error)
  }

  return NextResponse.json({
    ok: true,
    monitoramento_id: monitoramentoId,
    monitoramento_ativo: !!monitoramentoId,
    dados_completos: dadosEnriquecidos
  })
}
