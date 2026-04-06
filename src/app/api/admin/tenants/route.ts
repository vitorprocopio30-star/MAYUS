import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isSuperadmin } from '@/lib/auth/is-superadmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function authenticateSuperadmin(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }
  const ok = await isSuperadmin(user.id)
  if (!ok) return { error: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }
  return { user }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateSuperadmin(req)
    if (auth.error) return auth.error

    const { data: tenants, error } = await supabase
      .from('tenants')
      .select('id, name, plan_type, status, billing_cycle, created_at, max_processos, asaas_customer_id')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
    return NextResponse.json({ tenants: tenants ?? [] }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
