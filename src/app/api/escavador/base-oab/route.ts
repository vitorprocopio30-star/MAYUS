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
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { oab_estado, oab_numero } = await req.json()
  if (!oab_estado || !oab_numero) return NextResponse.json({ error: 'OAB inválida' }, { status: 400 })

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()
  if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })
  const tenantId = profile.tenant_id

  const cacheKey = `OAB_FULL:${String(oab_estado).toUpperCase()}:${String(oab_numero)}`
  const { data: cache } = await adminSupabase
    .from('processos_cache')
    .select('processos,total,advogado,total_paginas,pagina_atual,sincronizado,updated_at')
    .eq('tenant_id', tenantId)
    .eq('cache_key', cacheKey)
    .maybeSingle()

  if (!cache?.processos) {
    return NextResponse.json({ exists: false })
  }

  const processos = Array.isArray(cache.processos) ? cache.processos : []
  const numeros = processos.map((p: any) => p.numero_processo).filter(Boolean)

  const { data: jaMonitorados } = numeros.length > 0
    ? await adminSupabase
        .from('monitored_processes')
        .select('id, numero_processo, status, escavador_id, escavador_monitoramento_id, resumo_curto, resumo_solicitado_em, urgencia_nivel, proxima_acao_sugerida, data_ultima_movimentacao, ultima_movimentacao_texto, movimentacoes')
        .eq('tenant_id', tenantId)
        .in('numero_processo', numeros)
    : { data: [] as any[] }

  const monitoradosMap = new Map((jaMonitorados ?? []).map((m: any) => [m.numero_processo, m]))
  const processosComStatus = processos.map((p: any) => {
    const db = monitoradosMap.get(p.numero_processo)
    return {
      ...p,
      status: db?.status ?? p.status ?? 'ATIVO',
      monitorado: !!db?.escavador_monitoramento_id && !!db?.id,
      id: db?.id ?? undefined,
      escavador_id: db?.escavador_id || p.escavador_id,
      escavador_monitoramento_id: db?.escavador_monitoramento_id ?? undefined,
      resumo_curto: db?.resumo_curto ?? p.resumo_curto ?? undefined,
      resumo_solicitado_em: db?.resumo_solicitado_em ?? undefined,
      urgencia_nivel: db?.urgencia_nivel ?? p.urgencia_nivel ?? undefined,
      proxima_acao_sugerida: db?.proxima_acao_sugerida ?? p.proxima_acao_sugerida ?? undefined,
      data_ultima_movimentacao: db?.data_ultima_movimentacao ?? p.data_ultima_movimentacao ?? undefined,
      ultima_movimentacao_texto: db?.ultima_movimentacao_texto ?? p.ultima_movimentacao_texto ?? undefined,
      movimentacoes: Array.isArray(db?.movimentacoes) ? db.movimentacoes : p.movimentacoes,
    }
  })

  const { data: capacity } = await adminSupabase
    .rpc('check_monitoramento_capacity', { p_tenant_id: tenantId })
    .single() as { data: MonitoramentoCapacity | null; error: unknown }

  const ativosNaoMonitorados = processosComStatus.filter((p: any) => p.status === 'ATIVO' && !p.monitorado).length
  const disponivelSemCusto = capacity?.disponivel_sem_custo ?? 0
  const precoExtra = capacity?.preco_extra ?? 0.97
  const excedenteSeProsseguir = Math.max(0, ativosNaoMonitorados - disponivelSemCusto)

  return NextResponse.json({
    exists: true,
    fonte: 'cache',
    processos: processosComStatus,
    total: cache.total ?? processosComStatus.length,
    total_retornado: processosComStatus.length,
    advogado_nome: (cache.advogado as any)?.nome ?? '',
    next_url: null,
    paginas_buscadas: cache.total_paginas ?? null,
    ultima_sincronizacao: cache.updated_at ?? null,
    sincronizado: cache.sincronizado ?? false,
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
}
