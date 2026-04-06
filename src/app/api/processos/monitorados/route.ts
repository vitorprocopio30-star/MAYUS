import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET(req: NextRequest) {
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

    const { data, error } = await adminSupabase
      .from('monitored_processes')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: 'Erro ao buscar processos.' }, { status: 500 })

    const processos = (data ?? []).map((p: any) => {
      let partes = {}
      try {
        partes = typeof p.partes === 'string' ? JSON.parse(p.partes) : (p.partes ?? {})
      } catch (e) {
        partes = {}
      }

      return {
        id: p.id,
        numero_cnj: p.numero_processo,
        tribunal: p.tribunal,
        assunto: p.assunto,
        status: p.status,
        ultima_movimentacao: p.ultima_movimentacao,
        data_ultima_movimentacao: p.data_ultima_movimentacao,
        polo_ativo: (partes as any).polo_ativo ?? '',
        polo_passivo: (partes as any).polo_passivo ?? '',
        valor_causa: (partes as any).valor_causa ?? '',
        data_inicio: (partes as any).data_inicio ?? '',
        monitoramento_ativo: p.monitoramento_ativo
      }
    })

    return NextResponse.json({ processos })
  } catch (err: any) {
    console.error('[PROCESSOS_MONITORADOS_GET]', err)
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
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

    const body = await req.json()
    const numero = body.numero_cnj ?? body.numero_processo ?? ''
    if (!numero) return NextResponse.json({ error: 'numero_cnj obrigatório.' }, { status: 400 })

    const payload = {
      tenant_id: profile.tenant_id,
      numero_processo: numero,
      tribunal: body.tribunal ?? '',
      assunto: body.assunto ?? '',
      status: body.status ?? 'ATIVO',
      ultima_movimentacao: body.ultima_movimentacao ?? '',
      data_ultima_movimentacao: body.ultima_movimentacao_data ?? null,
      escavador_id: body.escavador_id ?? null,
      monitoramento_ativo: true,
      partes: {
        polo_ativo: body.polo_ativo ?? '',
        polo_passivo: body.polo_passivo ?? '',
        valor_causa: body.valor_causa ?? '',
        data_inicio: body.data_inicio ?? ''
      }
    }

    const { error } = await adminSupabase
      .from('monitored_processes')
      .upsert(payload, {
        onConflict: 'tenant_id,numero_processo'
      })

    if (error) {
      console.error('[MONITORADOS_POST_ERROR]', error)
      return NextResponse.json({ error: 'Erro ao salvar processo.', details: error }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[MONITORADOS_POST_ERROR]', {
      message: err.message,
      code: err.code,
      details: err.details,
      hint: err.hint
    })
    return NextResponse.json(
      { error: err.message || 'Erro interno.' },
      { status: 500 }
    )
  }
}
