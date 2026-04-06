import { createClient } from '@supabase/supabase-js'
import { AsaasService } from '@/lib/asaas'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export type CobrancaItem = {
  id: string
  valor: number
  vencimento: string
  status: string
  descricao: string | null
  linkBoleto: string | null
}

type ConsultarCobrancasParams = {
  tenantId: string
  status?: 'PENDING' | 'RECEIVED' | 'CONFIRMED' | 'OVERDUE' | 'REFUNDED'
  limit?: number
}

type ConsultarCobrancasResult = {
  success: boolean
  cobranças?: CobrancaItem[]
  error?: string
}

type TenantFinanceiroRecord = {
  asaas_customer_id: string | null
  status: string | null
}

function normalizarLimite(limit?: number): number {
  if (!Number.isFinite(limit)) return 10
  if ((limit ?? 10) < 1) return 10
  if ((limit ?? 10) > 50) return 50
  return Math.floor(limit ?? 10)
}

export async function consultarCobranças(
  params: ConsultarCobrancasParams
): Promise<ConsultarCobrancasResult> {
  if (!params.tenantId) {
    return { success: false, error: 'Tenant inválido.' }
  }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('asaas_customer_id, status')
    .eq('id', params.tenantId)
    .maybeSingle<TenantFinanceiroRecord>()

  if (tenantError) {
    console.error('[ASAAS_CONSULTAR] Erro ao buscar tenant:', tenantError.message)
    return { success: false, error: 'Não foi possível localizar o tenant.' }
  }

  if (!tenant) {
    return { success: false, error: 'Tenant não encontrado.' }
  }

  if (tenant.status !== 'ativo') {
    return { success: false, error: 'Consulta indisponível para tenants não ativos.' }
  }

  if (!tenant.asaas_customer_id) {
    return { success: false, error: 'Cliente não configurado no ASAAS.' }
  }

  try {
    const limit = normalizarLimite(params.limit)

    const response = await AsaasService.listPayments({
      customer: tenant.asaas_customer_id,
      limit,
      status: params.status,
    })

    const cobranças: CobrancaItem[] = (response.data ?? []).map((item) => ({
      id: item.id,
      valor: item.value,
      vencimento: item.dueDate,
      status: item.status,
      descricao: item.description ?? null,
      linkBoleto: item.bankSlipUrl ?? item.invoiceUrl ?? null,
    }))

    return { success: true, cobranças }
  } catch (err: any) {
    const friendlyError = err.message || 'Erro inesperado ao consultar cobranças.'
    console.error('[ASAAS_CONSULTAR] Erro ao consultar cobranças:', friendlyError)
    return { success: false, error: friendlyError }
  }
}
