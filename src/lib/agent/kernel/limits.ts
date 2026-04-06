import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type TenantLimitResult = { allowed: boolean; reason?: string; warn?: string }
type TenantRecord = {
  status: string | null
  billing_cycle_end: string | null
  max_processos: number | null
  plan_type: string | null
}

export async function checkTenantLimits(tenantId: string, skillAction: string): Promise<TenantLimitResult> {
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('status, billing_cycle_end, max_processos, plan_type')
    .eq('id', tenantId)
    .maybeSingle<TenantRecord>()

  if (error || !tenant) return { allowed: false, reason: 'Não foi possível validar os limites.' }

  const now = new Date()

  if (tenant.status === 'cancelado') return { allowed: false, reason: 'Assinatura cancelada.' }

  if (tenant.status === 'trial') {
    const trialEndsAt = tenant.billing_cycle_end ? new Date(tenant.billing_cycle_end) : null
    if (!trialEndsAt || trialEndsAt < now) return { allowed: false, reason: 'Período de trial encerrado.' }
    return { allowed: true, warn: 'Trial ativo.' }
  }

  if (tenant.status === 'inadimplente') {
    if (skillAction === 'escavador_consulta') return { allowed: true, warn: 'Conta inadimplente.' }
    return { allowed: false, reason: 'Conta inadimplente. Regularize seu pagamento.' }
  }

  if (tenant.status === 'ativo') return { allowed: true }

  return { allowed: false, reason: 'Status da conta inválido.' }
}
