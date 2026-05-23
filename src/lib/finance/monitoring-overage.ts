type SupabaseLikeClient = {
  from: (table: string) => any
  rpc: (fn: string, args?: Record<string, unknown>) => any
}

export type MonitoringCapacity = {
  total_monitorados: number
  gratuitos: number
  disponivel_sem_custo: number
  preco_extra?: number
  preco_extra_centavos?: number
}

export type MonitoringOverageQuote = {
  currentMonitored: number
  incomingCount: number
  includedLimit: number
  freeSlots: number
  overageCount: number
  unitPriceCents: number
  projectedAmountCents: number
  projectedAmount: number
  requiresConfirmation: boolean
  paymentReady: boolean
  blockedReason: string | null
}

export type MonitoringOverageSlotInput = {
  id: string
  activatedAt?: string | null
  createdAt?: string | null
  escavadorMonitoringId?: string | null
}

export type MonitoringOverageSlot = MonitoringOverageSlotInput & {
  slotIndex: number
  billingTier: 'included' | 'overage'
}

export const MONITORING_FINANCE_AGENT_CONTROL = {
  primary_agent_id: 'monitoring_agent',
  billing_agent_id: 'finance_agent',
  approval_required: true,
  external_charge_executed: false,
} as const

function currentUtcMonthCycle(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0))
  return {
    cycleStart: start.toISOString().slice(0, 10),
    cycleEnd: end.toISOString().slice(0, 10),
  }
}

function previousUtcMonthCycle(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0))
  return {
    cycleStart: start.toISOString().slice(0, 10),
    cycleEnd: end.toISOString().slice(0, 10),
  }
}

function addDaysIsoDate(days: number) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function numberOrFallback(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function centsFromCapacity(capacity: MonitoringCapacity | null) {
  if (typeof capacity?.preco_extra_centavos === 'number') return capacity.preco_extra_centavos
  return Math.round(numberOrFallback(capacity?.preco_extra, 0.97) * 100)
}

function slotTimestamp(slot: MonitoringOverageSlotInput) {
  const parsed = Date.parse(String(slot.activatedAt || slot.createdAt || ''))
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER
}

export function classifyMonitoringOverageSlots(
  rows: MonitoringOverageSlotInput[],
  includedLimit: number,
): MonitoringOverageSlot[] {
  const safeIncludedLimit = Math.max(0, Math.floor(numberOrFallback(includedLimit, 0)))
  return rows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .sort((left, right) => {
      const dateDelta = slotTimestamp(left.row) - slotTimestamp(right.row)
      if (dateDelta !== 0) return dateDelta
      const idDelta = String(left.row.id || '').localeCompare(String(right.row.id || ''))
      if (idDelta !== 0) return idDelta
      return left.originalIndex - right.originalIndex
    })
    .map(({ row }, index) => ({
      ...row,
      slotIndex: index + 1,
      billingTier: index < safeIncludedLimit ? 'included' : 'overage',
    }))
}

export async function getMonitoringCapacity(params: {
  tenantId: string
  client: SupabaseLikeClient
}): Promise<MonitoringCapacity> {
  const { data } = await params.client
    .rpc('check_monitoramento_capacity', { p_tenant_id: params.tenantId })
    .single() as { data: MonitoringCapacity | null; error: unknown }

  return {
    total_monitorados: numberOrFallback(data?.total_monitorados, 0),
    gratuitos: numberOrFallback(data?.gratuitos, 100),
    disponivel_sem_custo: Math.max(0, numberOrFallback(data?.disponivel_sem_custo, 100)),
    preco_extra: numberOrFallback(data?.preco_extra, 0.97),
    preco_extra_centavos: centsFromCapacity(data),
  }
}

export async function buildMonitoringOverageQuote(params: {
  tenantId: string
  incomingCount: number
  client: SupabaseLikeClient
}): Promise<MonitoringOverageQuote> {
  const capacity = await getMonitoringCapacity(params)
  const { data: tenant } = await params.client
    .from('tenants')
    .select([
      'monitoring_included_process_limit',
      'monitoring_extra_process_price_cents',
      'monitoring_overage_status',
      'monitoring_payment_method_status',
      'monitoring_overage_terms_accepted_at',
      'asaas_customer_id',
      'asaas_subscription_id',
      'status',
    ].join(','))
    .eq('id', params.tenantId)
    .maybeSingle()

  const includedLimit = numberOrFallback(tenant?.monitoring_included_process_limit, capacity.gratuitos)
  const unitPriceCents = numberOrFallback(tenant?.monitoring_extra_process_price_cents, capacity.preco_extra_centavos ?? 97)
  const currentMonitored = capacity.total_monitorados
  const freeSlots = Math.max(0, includedLimit - currentMonitored)
  const overageCount = Math.max(0, params.incomingCount - freeSlots)
  const hasAcceptedTerms = Boolean(tenant?.monitoring_overage_terms_accepted_at)
  const hasPlatformCustomer = Boolean(tenant?.asaas_customer_id)
  const hasPlatformSubscription = Boolean(tenant?.asaas_subscription_id)
  const paymentReady = overageCount === 0 || (
    hasAcceptedTerms &&
    tenant?.monitoring_overage_status === 'excedente_liberado' &&
    tenant?.monitoring_payment_method_status === 'metodo_valido' &&
    hasPlatformCustomer &&
    hasPlatformSubscription &&
    tenant?.status !== 'inadimplente' &&
    tenant?.status !== 'cancelado'
  )

  let blockedReason: string | null = null
  if (overageCount > 0 && !hasAcceptedTerms) blockedReason = 'monitoring_overage_terms_required'
  else if (overageCount > 0 && !paymentReady) blockedReason = 'monitoring_payment_method_required'

  return {
    currentMonitored,
    incomingCount: params.incomingCount,
    includedLimit,
    freeSlots,
    overageCount,
    unitPriceCents,
    projectedAmountCents: overageCount * unitPriceCents,
    projectedAmount: (overageCount * unitPriceCents) / 100,
    requiresConfirmation: overageCount > 0,
    paymentReady,
    blockedReason,
  }
}

export function buildMonitoringOverageBlockedPayload(quote: MonitoringOverageQuote) {
  const requiresTermsAcceptance = quote.blockedReason === 'monitoring_overage_terms_required'
  const monitoringOverage = {
    included_limit: quote.includedLimit,
    current_monitored_count: quote.currentMonitored,
    free_slots: quote.freeSlots,
    overage_count: quote.overageCount,
    unit_price_cents: quote.unitPriceCents,
    estimated_monthly_cost_cents: quote.projectedAmountCents,
    blocked_reason: quote.blockedReason,
    agent_control: MONITORING_FINANCE_AGENT_CONTROL,
    ...(requiresTermsAcceptance
      ? {
          terms_acceptance_required: true,
          terms_acceptance_endpoint: '/api/monitoramento/overage-terms',
        }
      : {}),
  }

  return {
    error: 'Excedente de monitoramento bloqueado. Cadastre um metodo de pagamento da plataforma MAYUS e aceite os termos de excedente antes de importar processos acima do limite incluso.',
    code: quote.blockedReason || 'monitoring_overage_blocked',
    monitoring_overage: monitoringOverage,
    agent_control: MONITORING_FINANCE_AGENT_CONTROL,
  }
}

export async function recordMonitoringUsageSnapshot(params: {
  tenantId: string
  currentQuantity: number
  includedLimit: number
  unitPriceCents: number
  client: SupabaseLikeClient
  metadata?: Record<string, unknown>
}) {
  const { cycleStart, cycleEnd } = currentUtcMonthCycle()
  const { data: existing } = await params.client
    .from('platform_usage_snapshots')
    .select('peak_quantity')
    .eq('tenant_id', params.tenantId)
    .eq('metric', 'monitored_processes')
    .eq('cycle_start', cycleStart)
    .eq('cycle_end', cycleEnd)
    .maybeSingle()

  const peakQuantity = Math.max(
    params.currentQuantity,
    numberOrFallback(existing?.peak_quantity, 0),
  )
  const overageQuantity = Math.max(0, peakQuantity - params.includedLimit)

  await params.client.from('platform_usage_snapshots').upsert({
    tenant_id: params.tenantId,
    cycle_start: cycleStart,
    cycle_end: cycleEnd,
    metric: 'monitored_processes',
    included_quantity: params.includedLimit,
    current_quantity: params.currentQuantity,
    peak_quantity: peakQuantity,
    overage_quantity: overageQuantity,
    unit_price_cents: params.unitPriceCents,
    projected_amount_cents: overageQuantity * params.unitPriceCents,
    source: 'monitoramento_import_batch',
    metadata: {
      ...(params.metadata || {}),
      agent_control: MONITORING_FINANCE_AGENT_CONTROL,
    },
  }, {
    onConflict: 'tenant_id,cycle_start,cycle_end,metric',
  })
}

export async function closeMonitoringOverageCharges(params: {
  client: SupabaseLikeClient
  cycleStart?: string
  cycleEnd?: string
  dryRun?: boolean
}) {
  const fallbackCycle = previousUtcMonthCycle()
  const cycleStart = params.cycleStart || fallbackCycle.cycleStart
  const cycleEnd = params.cycleEnd || fallbackCycle.cycleEnd

  const { data: tenants, error: tenantsError } = await params.client
    .from('tenants')
    .select([
      'id',
      'name',
      'monitoring_included_process_limit',
      'monitoring_extra_process_price_cents',
      'monitoring_payment_method_status',
      'monitoring_overage_status',
      'monitoring_overage_terms_accepted_at',
      'asaas_customer_id',
      'asaas_subscription_id',
      'status',
    ].join(','))
    .not('status', 'eq', 'cancelado')

  if (tenantsError) throw tenantsError

  const results: Array<Record<string, unknown>> = []
  for (const tenant of tenants || []) {
    const capacity = await getMonitoringCapacity({
      tenantId: tenant.id,
      client: params.client,
    })

    const includedQuantity = numberOrFallback(
      tenant.monitoring_included_process_limit,
      capacity.gratuitos,
    )
    const unitPriceCents = numberOrFallback(
      tenant.monitoring_extra_process_price_cents,
      capacity.preco_extra_centavos ?? 97,
    )
    const { data: existingSnapshot } = await params.client
      .from('platform_usage_snapshots')
      .select('peak_quantity')
      .eq('tenant_id', tenant.id)
      .eq('metric', 'monitored_processes')
      .eq('cycle_start', cycleStart)
      .eq('cycle_end', cycleEnd)
      .maybeSingle()

    const peakQuantity = Math.max(
      capacity.total_monitorados,
      numberOrFallback(existingSnapshot?.peak_quantity, 0),
    )
    const overageQuantity = Math.max(0, peakQuantity - includedQuantity)
    const amountCents = overageQuantity * unitPriceCents

    if (overageQuantity <= 0 || amountCents <= 0) continue

    const { data: snapshot } = await params.client.from('platform_usage_snapshots').upsert({
      tenant_id: tenant.id,
      cycle_start: cycleStart,
      cycle_end: cycleEnd,
      metric: 'monitored_processes',
      included_quantity: includedQuantity,
      current_quantity: peakQuantity,
      peak_quantity: peakQuantity,
      overage_quantity: overageQuantity,
      unit_price_cents: unitPriceCents,
      projected_amount_cents: amountCents,
      source: 'monthly_monitoring_overage_close',
      metadata: {
        close_source: 'strict_active_escavador_monitoring',
        current_monitored_count: peakQuantity,
        agent_control: MONITORING_FINANCE_AGENT_CONTROL,
      },
    }, { onConflict: 'tenant_id,cycle_start,cycle_end,metric' })
      .select('id')
      .maybeSingle()

    const paymentReady = Boolean(
      tenant.monitoring_overage_terms_accepted_at &&
      tenant.monitoring_payment_method_status === 'metodo_valido' &&
      tenant.monitoring_overage_status === 'excedente_liberado' &&
      tenant.asaas_customer_id &&
      tenant.asaas_subscription_id &&
      tenant.status !== 'inadimplente' &&
      tenant.status !== 'cancelado',
    )

    const status = paymentReady ? 'draft' : 'failed'
    const failureReason = paymentReady ? null : 'platform_payment_method_or_terms_required'

    if (params.dryRun) {
      results.push({
        tenant_id: tenant.id,
        status: 'dry_run',
        overage_quantity: overageQuantity,
        amount_cents: amountCents,
        payment_ready: paymentReady,
        failure_reason: failureReason,
        agent_control: MONITORING_FINANCE_AGENT_CONTROL,
      })
      continue
    }

    await params.client.from('platform_overage_charges').upsert({
      tenant_id: tenant.id,
      usage_snapshot_id: snapshot?.id ?? null,
      provider: 'mayus_platform',
      status,
      cycle_start: cycleStart,
      cycle_end: cycleEnd,
      metric: 'monitored_processes',
      included_quantity: includedQuantity,
      peak_quantity: peakQuantity,
      overage_quantity: overageQuantity,
      unit_price_cents: unitPriceCents,
      amount_cents: amountCents,
      due_date: paymentReady ? addDaysIsoDate(5) : null,
      failure_reason: failureReason,
      metadata: {
        source: 'monthly_monitoring_overage_close',
        billing_mode: 'platform_internal_draft',
        real_charge_executed: false,
        blocked_reason: failureReason,
        agent_control: MONITORING_FINANCE_AGENT_CONTROL,
      },
    }, { onConflict: 'tenant_id,cycle_start,cycle_end,metric' })

    results.push({
      tenant_id: tenant.id,
      status,
      overage_quantity: overageQuantity,
      amount_cents: amountCents,
      payment_ready: paymentReady,
      failure_reason: failureReason,
    })
  }

  return { cycleStart, cycleEnd, results }
}
