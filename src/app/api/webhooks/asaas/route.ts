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
  const customerId = body?.payment?.customer ?? body?.subscription?.customer ?? null
  const newStatus  = statusFromEvent(event)

  // 3. Ignorar eventos não mapeados
  if (!event || !customerId || !newStatus) {
    const { error: auditError } = await supabase.from('agent_audit_logs').insert({
      action: 'asaas_webhook_ignored', status: 'ignored',
      payload_executed: { event, customer_id: customerId },
      created_at: new Date().toISOString(),
    })
    if (auditError) {
      console.error('[WEBHOOK_ASAAS] Erro ao registrar audit log:', auditError.message)
    }
    return NextResponse.json({ ok: true })
  }

  // 4. Buscar tenant
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, status')
    .eq('asaas_customer_id', customerId)
    .maybeSingle()

  if (error || !tenant) {
    const { error: auditError } = await supabase.from('agent_audit_logs').insert({
      action: 'asaas_webhook_no_tenant', status: 'error',
      payload_executed: { event, customer_id: customerId, error: error?.message },
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

  const { error: auditError } = await supabase.from('agent_audit_logs').insert({
    action: 'asaas_webhook', status: 'ok',
    tenant_id: tenant.id,
    payload_executed: { event, new_status: newStatus, prev_status: tenant.status },
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
