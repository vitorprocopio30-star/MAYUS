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

    const { data: processos, error } = await adminSupabase
      .from('monitored_processes')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: 'Erro ao buscar processos.' }, { status: 500 })

    return NextResponse.json({ processos: processos ?? [] })
  } catch (err: any) {
    console.error('[PROCESSOS_MONITORADOS]', err)
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

    const processo = await req.json()
    if (!processo?.numero_cnj) return NextResponse.json({ error: 'numero_cnj obrigatório.' }, { status: 400 })

    const { error } = await adminSupabase
      .from('monitored_processes')
      .upsert({
        tenant_id: profile.tenant_id,
        numero_cnj: processo.numero_cnj,
        tribunal: processo.tribunal ?? null,
        assunto: processo.assunto ?? null,
        polo_ativo: processo.polo_ativo ?? null,
        polo_passivo: processo.polo_passivo ?? null,
        ultima_movimentacao: processo.ultima_movimentacao ?? null,
        valor_causa: processo.valor_causa ?? null,
        status: processo.status ?? null,
        data_inicio: processo.data_inicio ?? null,
      }, { onConflict: 'tenant_id,numero_cnj' })

    if (error) return NextResponse.json({ error: 'Erro ao salvar processo.' }, { status: 500 })

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
