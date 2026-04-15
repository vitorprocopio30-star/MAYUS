import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { processo_id, processo } = await req.json()
  if (!processo_id) return NextResponse.json({ error: 'processo_id é obrigatório' }, { status: 400 })

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const isUuid = typeof processo_id === 'string' && processo_id.includes('-') && processo_id.length === 36
  const numeroProcesso = String(processo?.numero_processo || (isUuid ? '' : processo_id) || '').trim()
  const now = new Date().toISOString()

  if (isUuid) {
    const { data: updatedById, error: updatedByIdError } = await adminSupabase
      .from('monitored_processes')
      .update({ status: 'ARQUIVADO', updated_at: now })
      .eq('tenant_id', profile.tenant_id)
      .eq('id', processo_id)
      .select('id, numero_processo, status')
      .maybeSingle()

    if (updatedByIdError) return NextResponse.json({ error: updatedByIdError.message }, { status: 500 })
    if (updatedById) return NextResponse.json({ success: true, processo: updatedById })
  }

  if (!numeroProcesso) {
    return NextResponse.json({ error: 'numero_processo é obrigatório para arquivar processo não monitorado' }, { status: 400 })
  }

  const payload = {
    tenant_id: profile.tenant_id,
    numero_processo: numeroProcesso,
    tribunal: processo?.tribunal ?? null,
    comarca: processo?.comarca ?? null,
    vara: processo?.vara ?? null,
    assunto: processo?.assunto ?? null,
    classe_processual: processo?.classe_processual ?? null,
    tipo_acao: processo?.tipo_acao ?? null,
    fase_atual: processo?.fase_atual ?? null,
    status: 'ARQUIVADO',
    data_distribuicao: processo?.data_distribuicao ?? null,
    data_ultima_movimentacao: processo?.data_ultima_movimentacao ?? null,
    ultima_movimentacao_texto: processo?.ultima_movimentacao_texto ?? null,
    partes: {
      polo_ativo: processo?.polo_ativo ?? null,
      polo_passivo: processo?.polo_passivo ?? null,
      data_inicio: processo?.data_distribuicao ?? null,
      valor_causa: processo?.valor_causa ?? null,
    },
    monitoramento_ativo: false,
    ativo: true,
    updated_at: now,
  }

  const { data: upserted, error: upsertError } = await adminSupabase
    .from('monitored_processes')
    .upsert(payload, { onConflict: 'tenant_id,numero_processo' })
    .select('id, numero_processo, status')
    .single()

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })

  return NextResponse.json({ success: true, processo: upserted })
}
