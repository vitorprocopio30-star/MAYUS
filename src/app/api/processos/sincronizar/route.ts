import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EscavadorService } from '@/lib/services/escavador'

export const maxDuration = 60

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

  const apiKey = integration?.api_key
  if (!apiKey)
    return NextResponse.json({ error: 'Escavador não configurado' }, { status: 400 })

  const { cache_key, query, pagina_inicio = 2, allow_paid_search } = await req.json()

  if (!allow_paid_search) {
    return NextResponse.json({ error: 'Sincronização de OAB bloqueada sem confirmação explícita.' }, { status: 400 })
  }

  const { data: cache } = await adminSupabase
    .from('processos_cache')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('cache_key', cache_key)
    .single()

  if (!cache || cache.sincronizado)
    return NextResponse.json({ ok: true, sincronizado: true })

  const [estado, numero] = (query as string).trim().split('/')
  let todos = cache.processos as any[]

  const pageFim = Math.min(pagina_inicio + 3, cache.total_paginas)

  for (let page = pagina_inicio; page <= pageFim; page++) {
    const [resE, resF] = await Promise.all([
      (EscavadorService as any)
        .buscarPorOAB(apiKey, estado, numero, page, 100)
        .catch(() => null),
      (EscavadorService as any)
        .buscarPorOABFederal(apiKey, estado, numero, page, 100)
        .catch(() => null)
    ])

    const itensE = resE?.itens ?? resE?.items ?? []
    const itensF = resF?.itens ?? resF?.items ?? []
    const novos = [...itensE, ...itensF].map((p: any) => normalizarProcesso(p))
    todos = [...todos, ...novos]
  }

  const unicos = Array.from(
    new Map(todos.map((p: any) => [p.numero_cnj || Math.random(), p])).values()
  )

  const terminou = pageFim >= cache.total_paginas

  await adminSupabase
    .from('processos_cache')
    .update({
      processos: unicos,
      total: unicos.length,
      pagina_atual: pageFim,
      sincronizado: terminou,
      updated_at: new Date().toISOString()
    })
    .eq('tenant_id', tenantId)
    .eq('cache_key', cache_key)

  return NextResponse.json({
    ok: true,
    sincronizado: terminou,
    total_carregado: unicos.length,
    proxima_pagina: terminou ? null : pageFim + 1
  })
}

function normalizarProcesso(p: any) {
  const fontes = p.fontes ?? []
  const fonteTrib =
    fontes.find((f: any) => f.tribunal?.sigla || f.sistema) ?? fontes[0] ?? {}
  const capa = fonteTrib?.capa ?? {}
  const partes = p.partes ?? capa.partes ?? []
  const poloAtivo =
    partes
      .filter((pt: any) => pt.polo === 'ATIVO' && pt.tipo !== 'ADVOGADO')
      .map((pt: any) => pt.nome)
      .join(', ') ||
    p.titulo_polo_ativo ||
    '—'
  const poloPassivo =
    partes
      .filter((pt: any) => pt.polo === 'PASSIVO' && pt.tipo !== 'ADVOGADO')
      .map((pt: any) => pt.nome)
      .join(', ') ||
    p.titulo_polo_passivo ||
    '—'
  const movs = p.movimentacoes ?? capa.movimentacoes ?? []
  return {
    numero_cnj: p.numero_cnj ?? p.numero_unico ?? '',
    tribunal:
      p.unidade_origem?.tribunal_sigla ?? fonteTrib?.tribunal?.sigla ?? '—',
    assunto:
      capa.assunto_principal_normalizado?.nome ?? capa.assunto ?? '—',
    polo_ativo: poloAtivo,
    polo_passivo: poloPassivo,
    ultima_movimentacao:
      movs[0]?.conteudo ?? p.data_ultima_movimentacao ?? '—',
    valor_causa: capa.valor_causa?.valor_formatado ?? '—',
    status: capa.status_predito ?? p.status ?? 'ATIVO',
    data_inicio: p.data_inicio ?? '—'
  }
}
