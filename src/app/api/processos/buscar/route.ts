import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { EscavadorService } from '@/lib/services/escavador'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

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

    const { query, tipo } = await req.json() as { query: string; tipo: 'numero' | 'oab' | 'cpf' }

    if (!query?.trim()) return NextResponse.json({ error: 'Query obrigatória.' }, { status: 400 })
    if (!['numero', 'oab', 'cpf'].includes(tipo)) return NextResponse.json({ error: 'Tipo inválido.' }, { status: 400 })

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
      const [estado, numero] = query.trim().split('/')
      if (!estado || !numero) {
        return NextResponse.json({ error: 'Formato OAB inválido. Use: RJ/211558' }, { status: 400 })
      }
      let todosProcessos: any[] = []
      let page = 1
      let totalPaginas = 1
      let advogado = null
      do {
        const res = await EscavadorService.buscarPorOAB(apiKey, estado.trim(), numero.trim(), page, 100)
        console.log('[ESCAVADOR_FULL]', JSON.stringify(res, null, 2).substring(0, 5000))
        if (!advogado) advogado = res?.advogado_encontrado ?? null
        const itens = res?.itens ?? res?.items ?? []
        todosProcessos = todosProcessos.concat(itens)
        totalPaginas = res?.meta?.last_page ?? res?.last_page ?? 1
        page++
      } while (page <= totalPaginas && page <= 10)

      const processosNormalizados = todosProcessos.map((p: any) => ({
        numero_cnj: p.numero_cnj ?? p.numero ?? '',
        tribunal: p.tribunal_sigla ?? p.tribunal ?? '—',
        assunto: p.assuntos?.[0]?.nome ?? p.assunto ?? '—',
        ultima_movimentacao: p.ultimo_movimento?.descricao ?? '—',
        status: p.status ?? 'ativo'
      }))

      return NextResponse.json({
        processos: processosNormalizados,
        total: processosNormalizados.length,
        advogado
      })
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
