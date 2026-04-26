import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { isSuperadmin } from '@/lib/auth/is-superadmin'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const StatusSchema = z.object({
  status: z.enum(['ativo', 'inadimplente', 'cancelado']),
})

async function authenticateSuperadmin(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) }
  const ok = await isSuperadmin(user.id)
  if (!ok) return { error: NextResponse.json({ error: 'Acesso negado.' }, { status: 403 }) }
  return { user }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateSuperadmin(req)
    if (auth.error) return auth.error

    const parsed = StatusSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success)
      return NextResponse.json({ error: 'Dados inválidos.', detalhes: parsed.error.flatten().fieldErrors }, { status: 422 })

    const { data: tenant, error: tenantError } = await supabase
      .from('tenants').select('id').eq('id', params.id).maybeSingle()
    if (tenantError) return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
    if (!tenant) return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 404 })

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('tenants').update({ status: parsed.data.status, updated_at: now }).eq('id', params.id)
    if (updateError) return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })

    const { error: auditError } = await supabase.from('system_event_logs').insert({
      source: 'admin',
      provider: 'admin',
      event_name: 'admin_status_change',
      status: 'success',
      tenant_id: params.id,
      user_id: auth.user.id,
      payload: { novo_status: parsed.data.status, alterado_por: auth.user.id },
      created_at: now,
    })
    if (auditError) console.error('[ADMIN_TENANT_STATUS] Erro audit:', auditError.message)

    return NextResponse.json({ success: true }, { status: 200 })
  } catch {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}

export async function POST() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
