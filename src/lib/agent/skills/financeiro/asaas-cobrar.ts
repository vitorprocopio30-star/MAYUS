import { createClient } from '@supabase/supabase-js'
import { AsaasService } from '@/lib/asaas'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

type ExecutarCobrancaParams = {
  tenantId: string
  descricao: string
  valor: number
  vencimento: string
}

type ExecutarCobrancaResult = {
  success: boolean
  cobrancaId?: string
  error?: string
}

type TenantFinanceiroRecord = {
  asaas_customer_id: string | null
  status: string | null
}

async function registrarAuditLog(params: {
  tenantId: string
  status: 'success' | 'error'
  cobrancaId?: string
  valor: number
  vencimento: string
  descricao: string
  error?: string
}) {
  const { error } = await supabase.from('agent_audit_logs').insert({
    action: 'asaas_cobrar',
    status: params.status,
    tenant_id: params.tenantId,
    payload_executed: {
      cobranca_id: params.cobrancaId ?? null,
      valor: params.valor,
      vencimento: params.vencimento,
      descricao: params.descricao,
      error: params.error ?? null,
    },
    created_at: new Date().toISOString(),
  })
  if (error) {
    console.error('[ASAAS_COBRAR] Erro best-effort ao registrar audit log:', error.message)
  }
}

function validarVencimento(vencimento: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(vencimento)
}

export async function executarCobranca(
  params: ExecutarCobrancaParams
): Promise<ExecutarCobrancaResult> {
  if (!params.tenantId)
    return { success: false, error: 'Tenant inválido.' }
  if (!params.descricao?.trim())
    return { success: false, error: 'Descrição da cobrança é obrigatória.' }
  if (!Number.isFinite(params.valor) || params.valor <= 0)
    return { success: false, error: 'Valor da cobrança inválido.' }
  if (!validarVencimento(params.vencimento))
    return { success: false, error: 'Data de vencimento inválida. Use YYYY-MM-DD.' }

  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('asaas_customer_id, status')
    .eq('id', params.tenantId)
    .maybeSingle<TenantFinanceiroRecord>()

  if (tenantError) {
    console.error('[ASAAS_COBRAR] Erro ao buscar tenant:', tenantError.message)
    await registrarAuditLog({ tenantId: params.tenantId, status: 'error', valor: params.valor, vencimento: params.vencimento, descricao: params.descricao, error: 'Erro ao buscar tenant.' })
    return { success: false, error: 'Não foi possível localizar o tenant.' }
  }

  if (!tenant) {
    await registrarAuditLog({ tenantId: params.tenantId, status: 'error', valor: params.valor, vencimento: params.vencimento, descricao: params.descricao, error: 'Tenant não encontrado.' })
    return { success: false, error: 'Tenant não encontrado.' }
  }

  if (tenant.status !== 'ativo') {
    await registrarAuditLog({ tenantId: params.tenantId, status: 'error', valor: params.valor, vencimento: params.vencimento, descricao: params.descricao, error: 'Tenant não está ativo.' })
    return { success: false, error: 'Cobrança indisponível para tenants não ativos.' }
  }

  if (!tenant.asaas_customer_id) {
    await registrarAuditLog({ tenantId: params.tenantId, status: 'error', valor: params.valor, vencimento: params.vencimento, descricao: params.descricao, error: 'Cliente não configurado no ASAAS.' })
    return { success: false, error: 'Cliente não configurado no ASAAS.' }
  }

  // BYOK - Busca a chave de API do tenant
  const apiKey = await AsaasService.getApiKey(params.tenantId, supabase)
  if (!apiKey) {
    const errorMsg = 'Integração Asaas não configurada para este tenant. Configure a chave de API em Configurações > Integrações.'
    await registrarAuditLog({ 
      tenantId: params.tenantId, 
      status: 'error', 
      valor: params.valor, 
      vencimento: params.vencimento, 
      descricao: params.descricao, 
      error: errorMsg 
    })
    return { success: false, error: errorMsg }
  }

  try {
    const cobranca = await AsaasService.createPayment({
      customer: tenant.asaas_customer_id,
      billingType: 'BOLETO',
      value: params.valor,
      dueDate: params.vencimento,
      description: params.descricao,
      externalReference: params.tenantId,
    }, apiKey)

    await registrarAuditLog({ tenantId: params.tenantId, status: 'success', cobrancaId: cobranca.id, valor: params.valor, vencimento: params.vencimento, descricao: params.descricao })
    return { success: true, cobrancaId: cobranca.id }

  } catch (err: any) {
    const friendlyError = err.message || 'Erro inesperado ao gerar cobrança.'
    console.error('[ASAAS_COBRAR] Erro ao gerar cobrança:', friendlyError)
    await registrarAuditLog({ tenantId: params.tenantId, status: 'error', valor: params.valor, vencimento: params.vencimento, descricao: params.descricao, error: friendlyError })
    return { success: false, error: friendlyError }
  }
}
