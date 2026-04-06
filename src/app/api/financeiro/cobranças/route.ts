import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { consultarCobranças } from '@/lib/agent/skills/financeiro/asaas-consultar'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ALLOWED_STATUS = new Set(['PENDING', 'RECEIVED', 'CONFIRMED', 'OVERDUE', 'REFUNDED'] as const)
type AllowedStatus = 'PENDING' | 'RECEIVED' | 'CONFIRMED' | 'OVERDUE' | 'REFUNDED'

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('tenant_id, role').eq('id', user.id)
      .maybeSingle<{ tenant_id: string | null; role: string | null }>()

    if (profileError || !profile) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })

    const statusParam = req.nextUrl.searchParams.get('status')
    const limitParam  = req.nextUrl.searchParams.get('limit')

    let status: AllowedStatus | undefined
    if (statusParam && ALLOWED_STATUS.has(statusParam as AllowedStatus)) {
      status = statusParam as AllowedStatus
    }

    let limit = 10
    if (limitParam) {
      const parsedLimit = Number(limitParam)
      if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
        limit = Math.min(Math.floor(parsedLimit), 50)
      }
    }

    const result = await consultarCobranças({
      tenantId: profile.tenant_id ?? '',
      status,
      limit,
    })

    if (!result.success) return NextResponse.json({ error: result.error }, { status: 502 })
    return NextResponse.json({ success: true, cobranças: result.cobranças ?? [] }, { status: 200 })
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
