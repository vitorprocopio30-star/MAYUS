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
          } catch { }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { numero_processo } = await req.json()
  if (!numero_processo) return NextResponse.json({ error: 'Número do processo é obrigatório' }, { status: 400 })

  const { data: profile } = await adminSupabase
    .from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })
  const tenantId = profile.tenant_id

  const { error } = await adminSupabase
    .from('monitored_processes')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('numero_processo', numero_processo)

  if (error) {
    console.error('[remover-monitoramento]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Decrementar contagem (opcional, dependendo de como você quer cobrar)
  // Por enquanto apenas removemos.

  return NextResponse.json({ success: true, mensagem: 'Processo removido do monitoramento.' })
}
