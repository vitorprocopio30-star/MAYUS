import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EscavadorService } from '@/lib/services/escavador'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Cache: chave = "oab:RJ:211558", TTL = 1 hora
const cache = new Map<string, { data: any; expiresAt: number }>()

function getCached(key: string) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null }
  return entry.data
}

function setCached(key: string, data: any) {
  cache.set(key, { data, expiresAt: Date.now() + 60 * 60 * 1000 })
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (!profile?.tenant_id) return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 403 })

    const tenantId = profile.tenant_id

    const { query, tipo, allow_paid_search, source } = await req.json() as { query: string; tipo: 'numero' | 'oab' | 'cpf'; allow_paid_search?: boolean; source?: string }

    if (!query?.trim()) return NextResponse.json({ error: 'Query obrigatória.' }, { status: 400 })
    if (!['numero', 'oab', 'cpf'].includes(tipo)) return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 })

    const cacheKey = `${tipo}:${query.trim().toUpperCase()}`
    const cached = getCached(cacheKey)
    if (cached) {
      return NextResponse.json({ ...cached, fromCache: true })
    }

    const { data: integration } = await adminSupabase
      .from('tenant_integrations')
      .select('api_key')
      .eq('tenant_id', profile.tenant_id)
      .eq('provider', 'escavador')
      .single()

    if (!integration?.api_key) {
      return NextResponse.json({ error: 'Integração com Escavador não configurada.' }, { status: 400 })
    }

    const apiKey = integration.api_key
    let resultado = null

    if (tipo === 'numero') {
      resultado = await EscavadorService.consultarProcesso(apiKey, query.trim())
      const processos = resultado ? [resultado] : []
      return NextResponse.json({ processos })
    }

    if (tipo === 'oab') {
      if (!allow_paid_search || source !== 'monitoramento_ui_sync_button') {
        return NextResponse.json({ error: 'Busca de OAB bloqueada sem confirmação explícita.' }, { status: 400 })
      }

      const [estado, numero] = query.trim().split('/')
      if (!estado || !numero) {
        return NextResponse.json({ error: 'Formato OAB inválido. Use: RJ/211558' }, { status: 400 })
      }

      // 1 e 2. Busca Estadual e Federal simultâneas - APENAS 1 PÁGINA CADA (Economia de créditos)
      const [resEstadual, resFederal] = await Promise.all([
        EscavadorService.buscarPorOAB(apiKey, estado.trim(), numero.trim(), 1),
        EscavadorService.buscarPorOABFederal(apiKey, estado.trim(), numero.trim(), 1)
      ])

      const advogado = resEstadual?.advogado_encontrado ?? resFederal?.advogado_encontrado ?? null
      const itensEstadual = resEstadual?.items ?? resEstadual?.itens ?? []
      const itensFederal = resFederal?.items ?? resFederal?.itens ?? []
      const todosProcessos = [...itensEstadual, ...itensFederal]

      // 3. Deduplicação por numero_cnj
      const unicos = Array.from(
        new Map(todosProcessos.map(proc => [proc.numero_cnj, proc])).values()
      )

      const totalReal = advogado?.quantidade_processos ?? unicos.length

      const processosNormalizados = unicos.map((p: any) => {
        const fonteTribunal = p.fontes?.find((f: any) => f.tipo === 'TRIBUNAL')
        return {
          numero_cnj: p.numero_cnj ?? '',
          tribunal: p.unidade_origem?.tribunal_sigla ?? fonteTribunal?.sigla ?? '—',
          assunto: fonteTribunal?.capa?.assunto_principal_normalizado?.nome ?? fonteTribunal?.capa?.assunto ?? '—',
          polo_ativo: p.titulo_polo_ativo ?? '—',
          polo_passivo: p.titulo_polo_passivo ?? '—',
          ultima_movimentacao: p.data_ultima_movimentacao ?? '—',
          valor_causa: fonteTribunal?.capa?.valor_causa?.valor_formatado ?? '—',
          status: fonteTribunal?.status_predito ?? 'ATIVO',
          data_inicio: p.data_inicio ?? '—'
        }
      })

      const totalEscavador = resEstadual?.meta?.total ?? resEstadual?.total ?? 0
      const totalPaginas = Math.max(
        resEstadual?.meta?.last_page ?? 1,
        resFederal?.meta?.last_page ?? 1
      )
      const hasMore = totalPaginas > 1

      const dbCacheKey = `OAB:${estado.toUpperCase()}:${numero}`

      // Persiste no cache do banco para sincronização progressiva
      adminSupabase.from('processos_cache').upsert({
        tenant_id: tenantId,
        cache_key: dbCacheKey,
        processos: processosNormalizados,
        total: processosNormalizados.length,
        advogado,
        total_paginas: totalPaginas,
        pagina_atual: 1,
        sincronizado: totalPaginas <= 1,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,cache_key' }).then(({ error }) => {
        if (error) console.error('[PROCESSOS_BUSCAR] Cache DB error:', error)
      })

      const resultado = {
        processos: processosNormalizados,
        total: processosNormalizados.length,
        totalEscavador,
        advogado,
        hasMore,
        totalPaginas,
        cacheKey: dbCacheKey
      }

      setCached(cacheKey, resultado)
      return NextResponse.json(resultado)
    }

    if (tipo === 'cpf') {
      resultado = await EscavadorService.buscarPorCPFCNPJ(apiKey, query.trim())
      return NextResponse.json({ processos: resultado?.items ?? resultado ?? [] })
    }

    return NextResponse.json({ processos: [] })
  } catch (err: any) {
    console.error('[PROCESSOS_BUSCAR]', err)
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}
