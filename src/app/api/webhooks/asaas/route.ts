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
import {
  normalizePlatformBillingEvent,
  type NormalizedPlatformBillingEvent,
} from '@/lib/finance/platform-billing-summary'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type AsaasWebhookBody = {
  event?        : string
  payment?      : {
    id?: string
    customer?: string
    subscription?: string
    value?: number | string
    netValue?: number | string
    dueDate?: string
    paymentDate?: string
    clientPaymentDate?: string
    confirmedDate?: string
    status?: string
    billingType?: string
  }
  subscription? : {
    id?: string
    customer?: string
    value?: number | string
    status?: string
    cycle?: string
    nextDueDate?: string
  }
}

function statusFromEvent(event?: string): 'ativo' | 'inadimplente' | 'cancelado' | null {
  return normalizePlatformBillingEvent(event)?.tenantStatus ?? null
}

function extractSubscriptionId(body: AsaasWebhookBody) {
  return body.payment?.subscription ?? body.subscription?.id ?? null
}

function extractAmountCents(body: AsaasWebhookBody) {
  const amount = numberOrNull(body.payment?.value ?? body.subscription?.value)
  return amount === null ? null : Math.round(amount * 100)
}

function extractDueDate(body: AsaasWebhookBody) {
  return body.payment?.dueDate ?? body.subscription?.nextDueDate ?? null
}

function extractPaidAt(body: AsaasWebhookBody) {
  return body.payment?.paymentDate ?? body.payment?.clientPaymentDate ?? body.payment?.confirmedDate ?? null
}

function addBillingCycle(fromIso: string, billingCycle: string | null | undefined) {
  const end = new Date(fromIso)
  const cycle = String(billingCycle || '').toLowerCase()
  end.setMonth(end.getMonth() + (cycle === 'anual' || cycle === 'annual' || cycle === 'yearly' ? 12 : 1))
  return end.toISOString()
}

function numberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function isoOrNull(value: string | null) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

async function recordPlatformBillingEvent(params: {
  tenantId: string
  customerId: string
  paymentId: string | null
  event: string
  body: AsaasWebhookBody
  platformEvent: NormalizedPlatformBillingEvent
  occurredAt: string
}) {
  const externalId = params.paymentId || extractSubscriptionId(params.body)
  if (!externalId) return

  const amountCents = extractAmountCents(params.body)
  const paidAt = isoOrNull(extractPaidAt(params.body))
  const dueDate = extractDueDate(params.body)
  const { error } = await supabase.from('platform_billing_events').upsert({
    tenant_id: params.tenantId,
    provider: 'asaas',
    event_name: params.event,
    external_id: externalId,
    customer_id: params.customerId,
    subscription_id: extractSubscriptionId(params.body),
    payment_id: params.paymentId,
    asaas_event: params.event,
    event_type: params.platformEvent.eventType,
    billing_status: params.platformEvent.billingStatus,
    amount_cents: amountCents,
    currency: 'BRL',
    due_date: dueDate,
    paid_at: paidAt,
    gross_amount: numberOrNull(params.body.payment?.value ?? params.body.subscription?.value),
    net_amount: numberOrNull(params.body.payment?.netValue),
    status: params.platformEvent.billingStatus,
    occurred_at: params.occurredAt,
    metadata: {
      due_date: dueDate,
      paid_at: paidAt,
      payment_status: params.body.payment?.status ?? null,
      subscription_status: params.body.subscription?.status ?? null,
      billing_type: params.body.payment?.billingType ?? null,
      source: 'platform_subscription',
    },
    raw_payload: {
      event: params.body.event,
      payment: params.body.payment ? {
        id: params.body.payment.id,
        customer: params.body.payment.customer,
        subscription: params.body.payment.subscription,
        value: params.body.payment.value,
        netValue: params.body.payment.netValue,
        dueDate: params.body.payment.dueDate,
        paymentDate: params.body.payment.paymentDate,
        clientPaymentDate: params.body.payment.clientPaymentDate,
        confirmedDate: params.body.payment.confirmedDate,
        status: params.body.payment.status,
        billingType: params.body.payment.billingType,
      } : null,
      subscription: params.body.subscription ? {
        id: params.body.subscription.id,
        customer: params.body.subscription.customer,
        value: params.body.subscription.value,
        status: params.body.subscription.status,
        cycle: params.body.subscription.cycle,
        nextDueDate: params.body.subscription.nextDueDate,
      } : null,
    },
  }, {
    onConflict: 'provider,event_name,external_id',
  })

  if (error) {
    console.error('[ASAAS_WEBHOOK] Erro ao registrar platform_billing_events:', error.message)
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
  const paymentId  = body?.payment?.id ?? null
  const customerId = body?.payment?.customer ?? body?.subscription?.customer ?? null
  const paymentValue = numberOrNull(body?.payment?.value)
  const platformEvent = normalizePlatformBillingEvent(event)
  const newStatus  = statusFromEvent(event)
  let revenueToCaseResult: Awaited<ReturnType<typeof openCaseFromConfirmedBilling>> | null = null

  // 3. Ignorar eventos não mapeados
  if (!body || !event || !customerId || !platformEvent) {
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
      console.error('[ASAAS_WEBHOOK] Erro no revenue-to-case loop:', error instanceof Error ? error.name : 'unknown')

      const { error: auditError } = await supabase.from('system_event_logs').insert({
        source: 'webhook',
        provider: 'asaas',
        event_name: 'asaas_revenue_to_case_error',
        status: 'error',
        payload: {
          event,
          payment_id: paymentId,
          customer_id: customerId,
          error: 'Erro interno ao abrir caso automaticamente.',
          error_type: error instanceof Error ? error.name : 'unknown',
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
    .select('id, status, billing_cycle, platform_billing_amount_cents')
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

  const now = new Date().toISOString()
  const occurredAt = isoOrNull(extractPaidAt(body)) || now
  const subscriptionId = extractSubscriptionId(body)
  const amountCents = extractAmountCents(body)

  await recordPlatformBillingEvent({
    tenantId: tenant.id,
    customerId,
    paymentId,
    event,
    body,
    platformEvent,
    occurredAt,
  })

  if (!newStatus) {
    const { error: auditError } = await supabase.from('system_event_logs').insert({
      source: 'webhook',
      provider: 'asaas',
      event_name: 'asaas_webhook',
      status: 'ok',
      tenant_id: tenant.id,
      payload: {
        event,
        payment_id: paymentId,
        subscription_id: subscriptionId,
        platform_event_type: platformEvent.eventType,
        status_updated: false,
      },
      created_at: now,
    })
    if (auditError) {
      console.error('[WEBHOOK_ASAAS] Erro ao registrar audit log:', auditError.message)
    }
    return NextResponse.json({ ok: true })
  }

  // 5. Atualizar status do tenant
  const update: Record<string, unknown> = {
    status    : newStatus,
    updated_at: now,
    platform_billing_last_event_at: now,
  }

  if (subscriptionId) update.asaas_subscription_id = subscriptionId
  if (amountCents !== null && amountCents > 0 && (newStatus === 'ativo' || !tenant.platform_billing_amount_cents)) {
    update.platform_billing_amount_cents = amountCents
    update.platform_billing_currency = 'BRL'
  }

  if (newStatus === 'ativo') {
    if (tenant.status !== 'ativo') update.activated_at = occurredAt
    update.billing_cycle_start = occurredAt
    update.billing_cycle_end   = addBillingCycle(occurredAt, tenant.billing_cycle)
    update.last_payment_at = occurredAt
    update.last_payment_value = paymentValue
    update.last_payment_id = paymentId
  }

  await supabase.from('tenants').update(update).eq('id', tenant.id)

  const { error: auditError } = await supabase.from('system_event_logs').insert({
    source: 'webhook',
    provider: 'asaas',
    event_name: 'asaas_webhook',
    status: 'ok',
    tenant_id: tenant.id,
    payload: {
      event,
      payment_id: paymentId,
      subscription_id: subscriptionId,
      new_status: newStatus,
      prev_status: tenant.status,
      platform_event_type: platformEvent.eventType,
    },
    created_at: now,
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
