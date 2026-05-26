import { NextRequest, NextResponse } from 'next/server'
import { isSuperadmin } from '@/lib/auth/is-superadmin'
import { closeMonitoringOverageCharges } from '@/lib/finance/monitoring-overage'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function authorize(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const cronHeader = req.headers.get('x-cron-secret')
  const bearer = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()

  if (cronSecret && (cronHeader === cronSecret || bearer === cronSecret)) return null
  if (!bearer) return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 })

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(bearer)
  if (error || !user) return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 })

  const ok = await isSuperadmin(user.id)
  if (!ok) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  return null
}

export async function POST(req: NextRequest) {
  const authError = await authorize(req)
  if (authError) return authError

  let body: { cycle_start?: string; cycle_end?: string; dry_run?: boolean } = {}
  try { body = await req.json() } catch {}

  try {
    const result = await closeMonitoringOverageCharges({
      client: supabaseAdmin,
      cycleStart: body.cycle_start,
      cycleEnd: body.cycle_end,
      dryRun: body.dry_run === true,
    })

    await supabaseAdmin.from('system_event_logs').insert({
      source: 'billing',
      provider: 'mayus_platform',
      event_name: 'monitoring_overage_close_executed',
      status: 'ok',
      payload: result,
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error: any) {
    console.error('[monitoring-overages/close]', error?.message || error)
    return NextResponse.json({ error: 'Nao foi possivel fechar excedentes de monitoramento.' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
