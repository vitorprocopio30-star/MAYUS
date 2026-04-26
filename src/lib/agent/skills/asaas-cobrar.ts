// src/lib/agent/skills/asaas-cobrar.ts
//
// Handler da skill asaas_cobrar
//
// Fluxo de resolução do customer ASAAS (em ordem de prioridade):
//
//   Cenário 1 — customer_id direto: usa imediatamente, gera cobrança.
//
//   Cenário 2 — nome_cliente ou cpf_cnpj → cliente já existe no MAYUS:
//     a) Tem asaas_customer_id → usa e gera cobrança.
//     b) Não tem asaas_customer_id → cria customer no ASAAS,
//        salva ID de volta em clients.asaas_customer_id, gera cobrança.
//
//   Cenário 3 — cliente não existe no MAYUS:
//     → Cria customer no ASAAS + registro em clients, gera cobrança.
//
// Em todos os casos retorna { cobrancaId, invoiceUrl, bankSlipUrl, paymentLink }.

import { createClient } from '@supabase/supabase-js'
import { AsaasService } from '@/lib/asaas'
import type { AsaasPaymentParams } from '@/lib/asaas'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export type BillingType = AsaasPaymentParams['billingType']

export type AsaasCobrancaParams = {
  tenantId: string
  // Cenário 1
  customer_id?: string
  // Cenário 2 / 3
  nome_cliente?: string
  cpf_cnpj?: string
  email?: string          // Necessário para criar customer novo no ASAAS
  // Cobrança
  valor: number
  vencimento: string      // YYYY-MM-DD
  descricao?: string
  billing_type?: BillingType
  // Parcelamento
  parcelas?: number       // Número de parcelas (ex: 14)
  valor_parcela?: number  // Valor de cada parcela
  valor_total?: number    // Valor total do contrato
  // Recorrência (Assinatura)
  recorrente?: boolean    // Se true, cria uma assinatura contínua
  ciclo?: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY'
}

export type AsaasCobrancaResult = {
  success: boolean
  cobrancaId?: string
  invoiceUrl?: string
  bankSlipUrl?: string
  paymentLink?: string
   clientId?: string
   asaasCustomerId?: string
   clientName?: string
  error?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function validarVencimento(vencimento: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(vencimento)
}

async function registrarAuditLog(params: {
  tenantId: string
  status: 'success' | 'error'
  cobrancaId?: string
  customerId: string
  valor: number
  vencimento: string
  descricao: string
  billingType: BillingType
  error?: string
}) {
  const { error } = await supabase.from('system_event_logs').insert({
    source: 'system',
    provider: 'asaas',
    event_name: 'asaas_cobrar',
    status: params.status,
    tenant_id: params.tenantId,
    payload: {
      cobranca_id: params.cobrancaId ?? null,
      customer_id: params.customerId,
      valor: params.valor,
      vencimento: params.vencimento,
      descricao: params.descricao,
      billing_type: params.billingType,
      error: params.error ?? null,
    },
    created_at: new Date().toISOString(),
  })
  if (error) {
    console.error('[ASAAS_COBRAR] Erro best-effort ao registrar audit log:', error.message)
  }
}

// ─── Resolução do customer ASAAS ─────────────────────────────────────────────

type ResolveResult =
  | { customerId: string; clientId?: string; clientName?: string; error?: never }
  | { customerId?: never; error: string }

async function resolverCustomerId(
  tenantId: string,
  params: Pick<AsaasCobrancaParams, 'customer_id' | 'nome_cliente' | 'cpf_cnpj' | 'email'>
): Promise<ResolveResult> {

  // ── Cenário 1: customer_id direto ──────────────────────────────────────────
  if (params.customer_id?.trim()) {
    const customerId = params.customer_id.trim()
    const { data: existingClient } = await supabase
      .from('clients')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('asaas_customer_id', customerId)
      .maybeSingle()

    return {
      customerId,
      clientId: existingClient?.id,
      clientName: existingClient?.name ?? params.nome_cliente?.trim(),
    }
  }

  if (!params.nome_cliente && !params.cpf_cnpj && !params.customer_id) {
    return { error: 'Informe pelo menos o nome do cliente para gerar a cobrança.' }
  }

  // Monta query de lookup
  const doc = params.cpf_cnpj ? params.cpf_cnpj.replace(/\D/g, '') : null

  let query = supabase
    .from('clients')
    .select('id, name, document, email, asaas_customer_id')
    .eq('tenant_id', tenantId)
    .limit(1)

  if (doc) {
    query = query.eq('document', doc)
  } else {
    query = query.ilike('name', `%${params.nome_cliente!.trim()}%`)
  }

  const { data: client, error: lookupError } = await query.maybeSingle()

  if (lookupError) {
    return { error: 'Erro ao buscar cliente no MAYUS.' }
  }

  // ── Cenário 2a: cliente existe e já tem asaas_customer_id ─────────────────
  if (client?.asaas_customer_id) {
    return {
      customerId: client.asaas_customer_id,
      clientId: client.id,
      clientName: client.name,
    }
  }

  // ── Cenário 2b: cliente existe mas não tem asaas_customer_id ──────────────
  if (client) {
    const emailParaCriar = params.email?.trim() || client.email || ''
    const docParaCriar = doc || client.document || undefined

    let asaasCustomerId: string
    try {
      // Busca a apiKey para o tenant
      const apiKey = await AsaasService.getApiKey(tenantId, supabase);
      if (!apiKey) throw new Error('Integração Asaas não configurada para este tenant.');

      const asaasCustomer = await AsaasService.createCustomer({
        name: client.name,
        email: emailParaCriar,
        cpfCnpj: docParaCriar,
        externalReference: client.id,
        notificationDisabled: false,
      }, apiKey)
      asaasCustomerId = asaasCustomer.id
    } catch (err: any) {
      return { error: `Erro ao criar cliente no ASAAS: ${err.message}` }
    }

    // Salva ID de volta no registro existente
    const { error: updateError } = await supabase
      .from('clients')
      .update({ asaas_customer_id: asaasCustomerId })
      .eq('id', client.id)
      .eq('tenant_id', tenantId)

    if (updateError) {
      console.error('[ASAAS_COBRAR] Erro ao salvar asaas_customer_id no cliente:', updateError.message)
      // Não aborta — já temos o ID para gerar a cobrança
    }

    return {
      customerId: asaasCustomerId,
      clientId: client.id,
      clientName: client.name,
    }
  }

  // ── Cenário 3: cliente não existe no MAYUS ────────────────────────────────
  const nome = params.nome_cliente?.trim()
  const email = params.email?.trim() || ''

  if (!nome) {
    return { error: 'Nome do cliente é obrigatório para criar um novo registro.' }
  }
  // CPF/CNPJ não é mais obrigatório aqui

  // Cria no ASAAS primeiro
  let asaasCustomerId: string
  try {
    // Busca a apiKey para o tenant
    const apiKey = await AsaasService.getApiKey(tenantId, supabase);
    if (!apiKey) throw new Error('Integração Asaas não configurada para este tenant.');

    const asaasCustomer = await AsaasService.createCustomer({
      name: nome,
      email,
      cpfCnpj: doc,
      notificationDisabled: false,
    }, apiKey)
    asaasCustomerId = asaasCustomer.id
  } catch (err: any) {
    return { error: `Erro ao criar cliente no ASAAS: ${err.message}` }
  }

  // Cria na tabela clients
  const { data: newClient, error: insertError } = await supabase
    .from('clients')
    .insert({
      tenant_id: tenantId,
      name: nome,
      document: doc,
      email: email || null,
      type: 'PF',
      status: 'ativo',
      origin: 'MAYUS IA',
      asaas_customer_id: asaasCustomerId,
    })
    .select('id')
    .single()

  if (insertError) {
    // Cliente criado no ASAAS mas falhou no MAYUS — ainda usamos o ID
    console.error('[ASAAS_COBRAR] Erro ao criar cliente no MAYUS:', insertError.message)
  } else {
    console.info(`[ASAAS_COBRAR] Novo cliente criado: ${newClient.id}`)
  }

  return {
    customerId: asaasCustomerId,
    clientId: newClient?.id,
    clientName: nome,
  }
}

// ─── Handler Principal ────────────────────────────────────────────────────────

export async function executarCobranca(
  params: AsaasCobrancaParams
): Promise<AsaasCobrancaResult> {
  console.log('[ASAAS_COBRAR_DEBUG] params recebidos:', JSON.stringify(params, null, 2))
  const billingType: BillingType = params.billing_type ?? 'UNDEFINED'
  const descricao = params.descricao?.trim() || 'Cobrança MAYUS'

  if (!params.tenantId)
    return { success: false, error: 'Tenant inválido.' }
  if (!Number.isFinite(params.valor) || params.valor <= 0)
    return { success: false, error: 'Valor da cobrança inválido.' }
  if (!validarVencimento(params.vencimento))
    return { success: false, error: 'Data de vencimento inválida. Use YYYY-MM-DD.' }

  // BYOK - Busca a chave de API do tenant
  const apiKey = await AsaasService.getApiKey(params.tenantId, supabase)
  if (!apiKey) {
    const errorMsg = 'Integração Asaas não configurada para este tenant. Configure a chave de API em Configurações > Integrações.'
    return { success: false, error: errorMsg }
  }

  const resolved = await resolverCustomerId(params.tenantId, {
    customer_id: params.customer_id,
    nome_cliente: params.nome_cliente,
    cpf_cnpj: params.cpf_cnpj,
    email: params.email,
  })

  if (resolved.error) {
    return { success: false, error: resolved.error }
  }

  const customerId = resolved.customerId
  const resolvedClientId = 'clientId' in resolved ? resolved.clientId : undefined
  const resolvedClientName = 'clientName' in resolved ? resolved.clientName : undefined

  try {
    // ── Lógica de Parcelamento ───────────────────────────────────────────────
    if (params.parcelas && params.parcelas > 1) {
      const valorTotal = Number(params.valor_total || params.valor)

      // Nota: Enviamos apenas value e installmentCount. 
      // O Asaas calcula o valor de cada parcela automaticamente, o que evita 
      // erros de arredondamento e rejeições por limite em cobranças complexas.
      const cobranca = await AsaasService.createInstallmentPayment({
        customer: customerId,
        billingType: billingType === 'UNDEFINED' ? 'BOLETO' : (billingType as 'BOLETO' | 'CREDIT_CARD'),
        value: valorTotal,
        installmentCount: params.parcelas,
        dueDate: params.vencimento,
        description: descricao,
        externalReference: params.tenantId,
      }, apiKey)

      await registrarAuditLog({
        tenantId: params.tenantId,
        status: 'success',
        cobrancaId: cobranca.id,
        customerId,
        valor: valorTotal,
        vencimento: params.vencimento,
        descricao: `${descricao} (Parcelado ${params.parcelas}x)`,
        billingType: billingType === 'UNDEFINED' ? 'BOLETO' : billingType,
      })

      return {
        success: true,
        cobrancaId: cobranca.id,
        invoiceUrl: cobranca.invoiceUrl,
        bankSlipUrl: cobranca.bankSlipUrl,
        paymentLink: cobranca.paymentLink,
        clientId: resolvedClientId,
        asaasCustomerId: customerId,
        clientName: resolvedClientName,
      }
    }

    // ── Lógica de Recorrência (Assinatura) ───────────────────────────────────
    if (params.recorrente) {
      const ciclo = params.ciclo || 'MONTHLY'
      const valor = Number(params.valor)
      const assinatura = await AsaasService.createSubscription({
        customer: customerId,
        billingType: billingType === 'UNDEFINED' ? 'BOLETO' : billingType,
        value: valor,
        nextDueDate: params.vencimento,
        cycle: ciclo,
        description: `${descricao} (Assinatura ${ciclo})`,
        externalReference: params.tenantId,
      }, apiKey)

      await registrarAuditLog({
        tenantId: params.tenantId,
        status: 'success',
        cobrancaId: assinatura.id,
        customerId,
        valor: valor,
        vencimento: params.vencimento,
        descricao: `${descricao} (Assinatura ${ciclo})`,
        billingType: billingType === 'UNDEFINED' ? 'BOLETO' : billingType,
      })

      // Para assinaturas, tentamos obter o link do primeiro boleto
      const checkoutUrl = await AsaasService.getCheckoutUrl(assinatura.id, apiKey)

      return {
        success: true,
        cobrancaId: assinatura.id,
        invoiceUrl: checkoutUrl || undefined,
        paymentLink: checkoutUrl || undefined,
        clientId: resolvedClientId,
        asaasCustomerId: customerId,
        clientName: resolvedClientName,
      }
    }

    // ── Cobrança Avulsa (Original) ──────────────────────────────────────────
    const cobranca = await AsaasService.createPayment({
      customer: customerId,
      billingType,
      value: params.valor,
      dueDate: params.vencimento,
      description: descricao,
      externalReference: params.tenantId,
    }, apiKey)

    await registrarAuditLog({
      tenantId: params.tenantId,
      status: 'success',
      cobrancaId: cobranca.id,
      customerId,
      valor: params.valor,
      vencimento: params.vencimento,
      descricao,
      billingType,
    })

    return {
      success: true,
      cobrancaId: cobranca.id,
      invoiceUrl: cobranca.invoiceUrl,
      bankSlipUrl: cobranca.bankSlipUrl,
      paymentLink: cobranca.paymentLink,
      clientId: resolvedClientId,
      asaasCustomerId: customerId,
      clientName: resolvedClientName,
    }

  } catch (err: any) {
    const friendlyError = err.message || 'Erro inesperado ao gerar cobrança.'
    console.error('[ASAAS_COBRAR] Erro ao gerar cobrança:', friendlyError)

    await registrarAuditLog({
      tenantId: params.tenantId,
      status: 'error',
      customerId,
      valor: params.valor,
      vencimento: params.vencimento,
      descricao,
      billingType,
      error: friendlyError,
    })

    return { success: false, error: friendlyError }
  }
}
