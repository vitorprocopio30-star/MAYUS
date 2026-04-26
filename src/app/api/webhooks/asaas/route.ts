/**
 * MAYUS — Webhook ASAAS
 * src/app/api/webhooks/asaas/route.ts
 *
 * Eventos tratados:
 *   PAYMENT_CONFIRMED / PAYMENT_RECEIVED  → status: 'ativo', activated_at = now()
 *   PAYMENT_OVERDUE                        → status: 'inadimplente'
 *   SUBSCRIPTION_DELETED / PAYMENT_DELETED → status: 'cancelado'
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { openCaseFromConfirmedBilling } from '@/lib/agent/capabilities/revenue-to-case'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type AsaasWebhookBody = {
  event?        : string
  payment?      : { id?: string; customer?: string; subscription?: string; value?: number }
  subscription? : { id?: string; customer?: string }
}

function statusFromEvent(event?: string): 'ativo' | 'inadimplente' | 'cancelado' | null {
  switch (event) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':    return 'ativo'
    case 'PAYMENT_OVERDUE':     return 'inadimplente'
    case 'SUBSCRIPTION_DELETED':
    case 'PAYMENT_DELETED':     return 'cancelado'
    default:                    return null
  }
}

export async function POST(req: NextRequest) {
  // 1. Validar token
  const token = req.headers.get('asaas-access-token')
  if (!process.env.ASAAS_WEBHOOK_TOKEN || token !== process.env.ASAAS_WEBHOOK_TOKEN) {
    console.warn('[ASAAS_WEBHOOK] Token inválido')
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  // 2. Parse body
  let body: AsaasWebhookBody | null = null
  try { body = await req.json() } catch { return NextResponse.json({ ok: true }) }

  const event      = body?.event
  const paymentId  = body?.payment?.id ?? body?.subscription?.id ?? null
  const customerId = body?.payment?.customer ?? body?.subscription?.customer ?? null
  const paymentValue = body?.payment?.value ?? null
  const newStatus  = statusFromEvent(event)
  let revenueToCaseResult: Awaited<ReturnType<typeof openCaseFromConfirmedBilling>> | null = null

  // 3. Ignorar eventos não mapeados
  if (!event || !customerId || !newStatus) {
    const { error: auditError } = await supabase.from('system_event_logs').insert({
      source: 'webhook',
      provider: 'asaas',
      event_name: 'asaas_webhook_ignored',
      status: 'ignored',
      payload: { event, customer_id: customerId },
      created_at: new Date().toISOString(),
    })
    if (auditError) {
      console.error('[WEBHOOK_ASAAS] Erro ao registrar audit log:', auditError.message)
    }
    return NextResponse.json({ ok: true })
  }

  if ((event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') && paymentId) {
    try {
      revenueToCaseResult = await openCaseFromConfirmedBilling({
        paymentId,
        customerId,
        paymentValue,
      })

      if (revenueToCaseResult.handled) {
        const { error: auditError } = await supabase.from('system_event_logs').insert({
          source: 'webhook',
          provider: 'asaas',
          event_name: 'asaas_revenue_to_case',
          status: 'ok',
          tenant_id: revenueToCaseResult.tenantId || null,
          payload: revenueToCaseResult,
          created_at: new Date().toISOString(),
        })

        if (auditError) {
          console.error('[ASAAS_WEBHOOK] Erro ao registrar revenue-to-case:', auditError.message)
        }

        if (revenueToCaseResult.reason === 'case_opened') {
          console.log(`[ASAAS_WEBHOOK] Pagamento ${paymentId} abriu o caso ${revenueToCaseResult.caseId} e o task ${revenueToCaseResult.processTaskId}`)
        }
      }
    } catch (error: any) {
      console.error('[ASAAS_WEBHOOK] Erro no revenue-to-case loop:', error)

      const { error: auditError } = await supabase.from('system_event_logs').insert({
        source: 'webhook',
        provider: 'asaas',
        event_name: 'asaas_revenue_to_case_error',
        status: 'error',
        payload: {
          event,
          payment_id: paymentId,
          customer_id: customerId,
          error: error?.message || 'Erro interno ao abrir caso automaticamente.',
        },
        created_at: new Date().toISOString(),
      })

      if (auditError) {
        console.error('[ASAAS_WEBHOOK] Erro ao registrar falha do revenue-to-case:', auditError.message)
      }
    }
  }

  // 4. Buscar tenant
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, status')
    .eq('asaas_customer_id', customerId)
    .maybeSingle()

  if (error || !tenant) {
    if (revenueToCaseResult && revenueToCaseResult.reason !== 'not_found' && revenueToCaseResult.reason !== 'tenant_billing') {
      return NextResponse.json({ ok: true })
    }

    const { error: auditError } = await supabase.from('system_event_logs').insert({
      source: 'webhook',
      provider: 'asaas',
      event_name: 'asaas_webhook_no_tenant',
      status: 'error',
      payload: { event, customer_id: customerId, error: error?.message },
      created_at: new Date().toISOString(),
    })
    if (auditError) {
      console.error('[WEBHOOK_ASAAS] Erro ao registrar audit log:', auditError.message)
    }
    return NextResponse.json({ ok: true })
  }

  // 5. Atualizar status do tenant
  const update: Record<string, unknown> = {
    status    : newStatus,
    updated_at: new Date().toISOString(),
  }

  if (newStatus === 'ativo' && tenant.status !== 'ativo') {
    update.activated_at        = new Date().toISOString()
    update.billing_cycle_start = new Date().toISOString()
    const end = new Date()
    end.setMonth(end.getMonth() + 1)
    update.billing_cycle_end   = end.toISOString()
  }

  await supabase.from('tenants').update(update).eq('id', tenant.id)

  const { error: auditError } = await supabase.from('system_event_logs').insert({
    source: 'webhook',
    provider: 'asaas',
    event_name: 'asaas_webhook',
    status: 'ok',
    tenant_id: tenant.id,
    payload: { event, new_status: newStatus, prev_status: tenant.status },
    created_at: new Date().toISOString(),
  })
  if (auditError) {
    console.error('[WEBHOOK_ASAAS] Erro ao registrar audit log:', auditError.message)
  }

  console.log(`[ASAAS_WEBHOOK] ${event} → tenant ${tenant.id} → ${newStatus}`)
  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
