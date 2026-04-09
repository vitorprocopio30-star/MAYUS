import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

// Extrai tudo que a Escavador manda — sem perder nada
function mapearProcesso(p: Record<string, unknown>) {
  const fonte = (p.fontes as Record<string, unknown>[])?.[0] ?? {}
  const capa = (fonte.capa as Record<string, unknown>) ?? {}
  const unidade = (p.unidade_origem as Record<string, unknown>) ?? {}

  // Partes / envolvidos completos
  const envolvidos = (fonte.envolvidos as Record<string, unknown>[]) ?? []

  // Movimentações completas
  const movimentacoes = (fonte.movimentacoes as Record<string, unknown>[]) ?? []

  return {
    numero_processo: (p.numero_cnj ?? p.numero) as string,
    escavador_id: String(p.id ?? ''),

    // Tribunal / localização
    tribunal: (unidade.sigla_tribunal ?? unidade.tribunal_sigla ?? unidade.nome ?? '—') as string,
    comarca: (unidade.comarca ?? unidade.municipio ?? null) as string | null,
    vara: (capa.orgao_julgador ?? null) as string | null,

    // Classificação
    assunto: (capa.assunto ?? '—') as string,
    classe_processual: (capa.classe ?? p.classe ?? null) as string | null,
    tipo_acao: (capa.tipo ?? null) as string | null,

    // Status e fase
    status: (fonte.status_predito ?? 'ATIVO') as string,
    fase_atual: (p.fase ?? capa.fase ?? 'CONHECIMENTO') as string,

    // Partes (polo simples para colunas)
    polo_ativo: (p.titulo_polo_ativo ?? capa.polo_ativo ?? '—') as string,
    polo_passivo: (p.titulo_polo_passivo ?? capa.polo_passivo ?? '—') as string,

    // Financeiro
    valor_causa: (capa.valor_causa ?? null) as string | null,
    data_distribuicao: (capa.data_inicio ?? capa.data_distribuicao ?? null) as string | null,

    // Movimentações
    data_ultima_movimentacao: (capa.data_ultima_movimentacao ?? null) as string | null,
    ultima_movimentacao_texto: (capa.ultimo_movimento ?? movimentacoes[0]?.titulo ?? null) as string | null,

    // Arrays completos para salvar
    envolvidos,
    movimentacoes: movimentacoes.slice(0, 20), // últimas 20

    // Raw completo para a IA não perder nada
    raw_escavador: p,
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { oab_estado, oab_numero } = await req.json()
  if (!oab_estado || !oab_numero) return NextResponse.json({ error: 'OAB inválida' }, { status: 400 })

  const { data: profile } = await adminSupabase
    .from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })
  const tenantId = profile.tenant_id

  const { data: capacity } = await adminSupabase
    .rpc('check_monitoramento_capacity', { p_tenant_id: tenantId }).single() as { data: MonitoramentoCapacity | null; error: unknown }

  const { data: integration } = await adminSupabase
    .from('tenant_integrations')
    .select('api_key')
    .eq('tenant_id', tenantId).eq('provider', 'escavador').eq('status', 'active').single()
  if (!integration?.api_key) return NextResponse.json({ error: 'Escavador não configurado' }, { status: 400 })

  // Busca paginada completa
  const allRaw: Record<string, unknown>[] = []
  let cursor: string | null = null
  let totalAdvogado = 0
  let advogadoNome = ''
  let page = 0

  do {
    const url = new URL('https://api.escavador.com/api/v2/advogado/processos')
    url.searchParams.set('oab_estado', oab_estado)
    url.searchParams.set('oab_numero', oab_numero)
    url.searchParams.set('quantidade', '100')
    if (cursor) url.searchParams.set('cursor', cursor)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${integration.api_key}`, 'X-Requested-With': 'XMLHttpRequest' }
    })
    if (!res.ok) break
    const data = await res.json()
    allRaw.push(...(data.items ?? []))
    if (page === 0) {
      totalAdvogado = data.advogado_encontrado?.quantidade_processos ?? allRaw.length
      advogadoNome = data.advogado_encontrado?.nome ?? ''
    }
    cursor = data.links?.next ? new URL(data.links.next).searchParams.get('cursor') : null
    page++
  } while (cursor && page < 20)

  const processos = allRaw.map(mapearProcesso)

  // Verificar monitorados
  const numeros = processos.map(p => p.numero_processo).filter(Boolean)
  const { data: jaMonitorados } = await adminSupabase
    .from('monitored_processes').select('numero_processo')
    .eq('tenant_id', tenantId).in('numero_processo', numeros)
  const monitoradosSet = new Set((jaMonitorados ?? []).map(m => m.numero_processo))

  // Upsert OAB
  await adminSupabase.from('oabs_salvas').upsert({
    tenant_id: tenantId, oab_estado, oab_numero,
    advogado: advogadoNome, total_processos: totalAdvogado,
    ultima_busca: new Date().toISOString(),
  }, { onConflict: 'tenant_id,oab_estado,oab_numero' })

  const processosComStatus = processos.map(p => ({
    ...p,
    monitorado: monitoradosSet.has(p.numero_processo)
  }))

  const ativosNaoMonitorados = processosComStatus.filter(p => p.status === 'ATIVO' && !p.monitorado).length
  const disponivelSemCusto = capacity?.disponivel_sem_custo ?? 0
  const precoExtra = capacity?.preco_extra ?? 0.97
  const excedenteSeProsseguir = Math.max(0, ativosNaoMonitorados - disponivelSemCusto)

  return NextResponse.json({
    processos: processosComStatus,
    total: totalAdvogado,
    total_retornado: processos.length,
    advogado_nome: advogadoNome,
    paginas_buscadas: page,
    billing: {
      total_ja_monitorados: capacity?.total_monitorados ?? 0,
      gratuitos: capacity?.gratuitos ?? 100,
      disponivel_sem_custo: disponivelSemCusto,
      ativos_nao_monitorados: ativosNaoMonitorados,
      ja_monitorados_desta_oab: monitoradosSet.size,
      excedente_se_prosseguir: excedenteSeProsseguir,
      custo_estimado_mes: excedenteSeProsseguir * precoExtra,
      preco_por_extra: precoExtra,
    }
  })
}
