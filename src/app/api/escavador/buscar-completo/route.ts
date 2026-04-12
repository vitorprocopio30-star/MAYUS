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

// Extrai tudo que a Escavador manda — sem perder nada
function mapearProcesso(p: Record<string, unknown>) {
  const fontes = (p.fontes as Record<string, unknown>[]) ?? []
  const fonte = fontes[0] ?? {}
  const capa = (fonte.capa as Record<string, unknown>) ?? {}
  const unidade = (p.unidade_origem as Record<string, unknown>) ?? {}

  // Partes / envolvidos completos
  const envolvidos = (fonte.envolvidos as Record<string, unknown>[]) ?? []

  // Movimentações completas
  const movimentacoes = (fonte.movimentacoes as Record<string, unknown>[]) ?? []

  return {
    numero_processo: (p.numero_cnj ?? p.numero) as string,
    escavador_id: String((fonte as any).processo_fonte_id || p.id || ''),

    // Tribunal / localização
    tribunal: (unidade.sigla_tribunal ?? unidade.tribunal_sigla ?? unidade.nome ?? (fonte as any).sigla_tribunal ?? '—') as string,
    comarca: (unidade.comarca ?? unidade.municipio ?? (fonte as any).comarca ?? null) as string | null,
    vara: (capa.orgao_julgador ?? (fonte as any).orgao_julgador ?? null) as string | null,

    // Classificação
    assunto: (capa.assunto ?? (fonte as any).assunto ?? '—') as string,
    classe_processual: (capa.classe ?? p.classe ?? (fonte as any).classe ?? null) as string | null,
    tipo_acao: (capa.tipo ?? (fonte as any).tipo ?? null) as string | null,

    // Status e fase (Normalização Inteligente - Aggressiva)
    status: (() => {
      const encerrado = p.encerrado === true || p.encerrado === 1 || p.encerrado === 'true'
      const statusPredito = String(fonte.status_predito ?? p.status ?? capa.status ?? capa.situacao ?? '')
      const tituloStatus = String(p.titulo ?? p.nome_status ?? p.situacao ?? '').toUpperCase()
      const combinado = (statusPredito + ' ' + tituloStatus).toUpperCase()

      if (encerrado) return 'ARQUIVADO'
      if (['BAIXADO', 'ENCERRADO', 'EXTINTO', 'ARQUIVADO', 'SUSPENSO', 'JULGADO', 'CANCELADO'].some(s => combinado.includes(s))) return 'ARQUIVADO'
      return 'ATIVO'
    })() as string,
    fase_atual: (fonte.status_predito ?? p.fase ?? capa.fase ?? 'CONHECIMENTO') as string,

    // Partes (polo simples para colunas)
    polo_ativo: (p.titulo_polo_ativo ?? capa.polo_ativo ?? '—') as string,
    polo_passivo: (p.titulo_polo_passivo ?? capa.polo_passivo ?? '—') as string,

    // Financeiro
    valor_causa: (capa.valor_causa_formatado ?? (typeof capa.valor_causa === 'object' && capa.valor_causa !== null
      ? (capa.valor_causa as any).valor_formatado || (capa.valor_causa as any).valor
      : (capa.valor_causa ?? null))) as string | null,
    data_distribuicao: (capa.data_inicio ?? capa.data_distribuicao ?? p.data_distribuicao ?? null) as string | null,

    // Movimentações (Fallback Agressivo)
    data_ultima_movimentacao: (capa.data_ultima_movimentacao ?? (movimentacoes[0]?.data as string) ?? (p.data_ultima_movimentacao as string) ?? null) as string | null,
    ultima_movimentacao_texto: (() => {
      const m = (movimentacoes[0] as Record<string, unknown>) ?? {}
      const texto = (capa.ultimo_movimento as any)?.conteudo || capa.ultimo_movimento || m.conteudo || m.titulo || m.descricao || m.texto || m.resumo || null
      
      // Garante que o resultado seja string ou null (objetos causam crash no React)
      if (texto && typeof texto === 'object' && !Array.isArray(texto)) {
        return (texto as any).conteudo || (texto as any).texto || JSON.stringify(texto)
      }
      return (texto as string | null)
    })(),
    ultima_movimentacao_resumo: (movimentacoes[0]?.resumo ?? null) as string | null,

    // Arrays completos para salvar
    envolvidos,
    movimentacoes: movimentacoes.slice(0, 20), // últimas 20

    // Raw completo para a IA não perder nada
    raw_escavador: p,
  }
}

// v3.1 - Force deploy for Premium Pro
export async function POST(req: NextRequest) {
  process.stdout.write('\n\n>>> REQUISIÇÃO RECEBIDA EM buscar-completo\n\n')
  console.log('[buscar-completo] START')
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

  const { oab_estado, oab_numero, cursor, next_url } = await req.json()
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
    .eq('tenant_id', tenantId)
    .eq('provider', 'escavador')
    .in('status', ['active', 'connected'])
    .single()
  if (!integration?.api_key) return NextResponse.json({ error: 'Escavador não configurado' }, { status: 400 })

  console.log(`[buscar-completo] Iniciando busca GET: OAB ${oab_numero}/${oab_estado} ${next_url ? 'COM NEXT_URL' : ''}`)

  // Verifica CACHE — bloqueia sangramento de saldo
  if (!next_url) {
    const { data: cache } = await adminSupabase
      .from('oabs_salvas')
      .select('ultima_busca, total_processos, advogado')
      .eq('tenant_id', tenantId)
      .eq('oab_estado', oab_estado)
      .eq('oab_numero', oab_numero)
      .single()

    if (cache?.ultima_busca) {
      const horasDesdeBusca = (new Date().getTime() - new Date(cache.ultima_busca).getTime()) / (1000 * 60 * 60)
      if (horasDesdeBusca < 24) {
        console.log(`[buscar-completo] CACHE HIT: OAB ${oab_numero} buscada há ${horasDesdeBusca.toFixed(1)}h. Bloqueando chamada ao Escavador.`)
        return NextResponse.json({
          cached: true,
          message: `Dados sincronizados há ${Math.floor(horasDesdeBusca)}h. Próxima atualização disponível em ${Math.ceil(24 - horasDesdeBusca)}h.`,
          advogado: cache.advogado,
          total_processos: cache.total_processos,
          ultima_busca: cache.ultima_busca
        }, { status: 200 }) // 200 e não 429 — não é erro, é cache válido
      }
    }
  }

  try {
    // Montar URL com query params (GET)
    // Fallback: Tentamos o padrão do SDK se o padrão anterior falhar
    const url = next_url 
      ? next_url
      : `https://api.escavador.com/api/v2/advogado/processos?oab_numero=${oab_numero}&oab_estado=${oab_estado}`

    let resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${integration.api_key.trim()}`,
        'Accept': 'application/json',
        'X-Requested-With': 'XMLHttpRequest'
      }
    })

    // Se falhar com 500 ou 400, tentamos o formato alternativo (numero/estado) sugerido pelo SDK
    if (!resp.ok && !next_url) {
      console.warn('[buscar-completo] Tentando fallback para params numero/estado...')
      const fallbackUrl = `https://api.escavador.com/api/v2/advogado/processos?numero=${oab_numero}&estado=${oab_estado}`
      const fallbackResp = await fetch(fallbackUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${integration.api_key.trim()}`,
          'Accept': 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      })
      if (fallbackResp.ok) {
        resp = fallbackResp
      }
    }

    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[buscar-completo] ERRO FINAL:', resp.status, errText)
      return NextResponse.json({ error: errText }, { status: resp.status })
    }
    
    const data = await resp.json()
    console.log('[buscar-completo] SUCCESS keys:', Object.keys(data))
    
    const items = data?.items ?? data?.itens ?? data?.processos ?? []
    const nextCursor: string | null = data?.links?.next ?? null

    const totalAdvogado = data?.advogado_encontrado?.quantidade_processos ?? items.length
    const advogadoNome = data?.advogado_encontrado?.nome ?? ''

    const processos = items.map(mapearProcesso)

    // Verificar monitorados
    const numeros = processos.map(p => p.numero_processo).filter(Boolean)
    const { data: jaMonitorados } = await adminSupabase
      .from('monitored_processes').select('id, numero_processo, escavador_id, resumo_curto, urgencia_nivel, proxima_acao_sugerida')
      .eq('tenant_id', tenantId).in('numero_processo', numeros)
    const monitoradosMap = new Map((jaMonitorados ?? []).map(m => [m.numero_processo, m]))

    // Upsert OAB
    await adminSupabase.from('oabs_salvas').upsert({
      tenant_id: tenantId, oab_estado, oab_numero,
      advogado: advogadoNome, total_processos: totalAdvogado,
      ultima_busca: new Date().toISOString(),
    }, { onConflict: 'tenant_id,oab_estado,oab_numero' })

    const processosComStatus = processos.map(p => {
      const db = monitoradosMap.get(p.numero_processo)
      return {
        ...p,
        monitorado: !!db,
        id: db?.id ?? undefined,
        escavador_id: db?.escavador_id || p.escavador_id,
        resumo_curto: db?.resumo_curto ?? undefined,
        urgencia_nivel: db?.urgencia_nivel ?? undefined,
        proxima_acao_sugerida: db?.proxima_acao_sugerida ?? undefined,
      }
    })

    const ativosNaoMonitorados = processosComStatus.filter(p => p.status === 'ATIVO' && !p.monitorado).length
    const disponivelSemCusto = capacity?.disponivel_sem_custo ?? 0
    const precoExtra = capacity?.preco_extra ?? 0.97
    const excedenteSeProsseguir = Math.max(0, ativosNaoMonitorados - disponivelSemCusto)

    return NextResponse.json({
      processos: processosComStatus,
      total: totalAdvogado,
      total_retornado: processos.length,
      advogado_nome: advogadoNome,
      next_url: nextCursor,
      paginas_buscadas: 1,
      billing: {
        total_ja_monitorados: capacity?.total_monitorados ?? 0,
        gratuitos: capacity?.gratuitos ?? 100,
        disponivel_sem_custo: disponivelSemCusto,
        ativos_nao_monitorados: ativosNaoMonitorados,
        ja_monitorados_desta_oab: monitoradosMap.size,
        excedente_se_prosseguir: excedenteSeProsseguir,
        custo_estimado_mes: excedenteSeProsseguir * precoExtra,
        preco_por_extra: precoExtra,
      }
    })
  } catch (error: any) {
    console.error('[buscar-completo] CRASH INTERNO:', error)
    return NextResponse.json({ error: error.message || 'Erro interno no servidor' }, { status: 500 })
  }
}
