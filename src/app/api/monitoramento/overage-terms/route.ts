import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import {
  buildMonitoringOverageBlockedPayload,
  buildMonitoringOverageQuote,
} from '@/lib/finance/monitoring-overage'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
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
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })
  const tenantId = profile.tenant_id

  const body = await req.json().catch(() => ({}))
  if (body?.accept_terms !== true) {
    return NextResponse.json({ error: 'Aceite explicito dos termos de excedente e obrigatorio.' }, { status: 400 })
  }

  const incomingCount = Math.max(1, Number(body?.incoming_count || 1))
  const quote = await buildMonitoringOverageQuote({
    tenantId,
    incomingCount,
    client: adminSupabase,
  })

  const { data: tenant } = await adminSupabase
    .from('tenants')
    .select('monitoring_payment_method_status,asaas_customer_id,asaas_subscription_id,status')
    .eq('id', tenantId)
    .maybeSingle()

  const hasPaymentMethod = Boolean(
    tenant?.monitoring_payment_method_status === 'metodo_valido' &&
    tenant?.asaas_customer_id &&
    tenant?.asaas_subscription_id &&
    tenant?.status !== 'inadimplente' &&
    tenant?.status !== 'cancelado'
  )
  const acceptedAt = new Date().toISOString()
  const nextStatus = hasPaymentMethod ? 'excedente_liberado' : 'cartao_pendente'
  const blockedReason = hasPaymentMethod ? null : 'platform_payment_method_required'

  const { error: updateError } = await adminSupabase
    .from('tenants')
    .update({
      monitoring_overage_terms_accepted_at: acceptedAt,
      monitoring_overage_terms_accepted_by: user.id,
      monitoring_overage_status: nextStatus,
      monitoring_overage_blocked_reason: blockedReason,
    })
    .eq('id', tenantId)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  const monitoringOverage = {
    ...buildMonitoringOverageBlockedPayload(quote).monitoring_overage,
    blocked_reason: blockedReason,
  }

  await adminSupabase.from('system_event_logs').insert({
    tenant_id: tenantId,
    user_id: user.id,
    source: 'monitoramento',
    provider: 'mayus',
    event_name: 'monitoring_overage_terms_accepted',
    status: hasPaymentMethod ? 'ok' : 'pending_payment_method',
    payload: {
      accepted_at: acceptedAt,
      monitoring_overage: monitoringOverage,
      payment_method_status: tenant?.monitoring_payment_method_status ?? null,
      overage_status: nextStatus,
      blocked_reason: blockedReason,
    },
    created_at: acceptedAt,
  })

  return NextResponse.json({
    ok: true,
    terms_accepted_at: acceptedAt,
    overage_status: nextStatus,
    payment_ready: hasPaymentMethod,
    monitoring_overage: monitoringOverage,
  })
}
