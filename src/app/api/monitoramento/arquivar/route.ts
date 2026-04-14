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

  const { processo_id } = await req.json()
  if (!processo_id) return NextResponse.json({ error: 'processo_id é obrigatório' }, { status: 400 })

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  let query = adminSupabase
    .from('monitored_processes')
    .update({ status: 'ARQUIVADO', updated_at: new Date().toISOString() })
    .eq('tenant_id', profile.tenant_id)

  if (processo_id.includes('-') && processo_id.length === 36) {
    query = query.eq('id', processo_id)
  } else {
    query = query.eq('numero_processo', processo_id)
  }

  const { data, error } = await query.select('id, numero_processo, status').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, processo: data })
}
