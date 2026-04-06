import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { AsaasService } from '@/lib/asaas'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const CadastroSchema = z.object({
  nome_escritorio: z.string().min(2).max(255),
  cnpj: z.string().regex(/^\d{14}$/).optional(),
  oab_estado: z.string().length(2).toUpperCase().optional(),
  nome: z.string().min(2).max(255),
  email: z.string().email(),
  senha: z.string().min(8),
  telefone: z.string().regex(/^\d{10,11}$/).optional(),
  plano_id: z.enum(['mayus_monthly', 'mayus_annual']),
  aceite_termos: z.literal(true),
})

type CadastroPayload = z.infer<typeof CadastroSchema>

function nextDueDate() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}



export async function POST(req: NextRequest) {
  let data: CadastroPayload
  try {
    const body = await req.json()
    if (body.cnpj) body.cnpj = body.cnpj.replace(/\D/g, '')
    if (body.telefone) body.telefone = body.telefone.replace(/\D/g, '')
    data = CadastroSchema.parse(body)
  } catch (err) {
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: 'Dados inválidos', detalhes: err.flatten().fieldErrors }, { status: 422 })
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { data: { users: authUsers } } = await supabase.auth.admin.listUsers()
  const emailExistsInAuth = authUsers.some((u: { email?: string }) => u.email === data.email)
  if (emailExistsInAuth)
    return NextResponse.json({ error: 'E-mail já cadastrado.' }, { status: 409 })

  let tenantId: string | null = null
  let authUserId: string | null = null
  let asaasCustomerId: string | null = null
  let asaasSubId: string | null = null

  try {
    tenantId = crypto.randomUUID()

    const { error: tenantErr } = await supabase.from('tenants').insert({
      id: tenantId,
      name: data.nome_escritorio,
      cnpj: data.cnpj ?? null,
      billing_cycle: data.plano_id === 'mayus_annual' ? 'anual' : 'mensal',
      plan_type: 'scale',
      status: 'trial',
      billing_cycle_end: new Date(Date.now() + 7 * 86400000).toISOString(),
      max_processos: 100,
      created_at: new Date().toISOString(),
    })
    if (tenantErr) throw new Error(`Tenant: ${tenantErr.message}`)

    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email: data.email, password: data.senha, email_confirm: true,
      user_metadata: { nome: data.nome, tenant_id: tenantId, role: 'admin' },
    })
    if (authErr || !authData.user) throw new Error(`Auth: ${authErr?.message}`)
    authUserId = authData.user.id

    const { error: profileErr } = await supabase.from('profiles').insert({
      id: authUserId, tenant_id: tenantId, full_name: data.nome,
      role: 'admin', is_active: true, created_at: new Date().toISOString(),
    })
    if (profileErr) throw new Error(`Profile: ${profileErr.message}`)

    const customer = await AsaasService.createCustomer({
      name: data.nome_escritorio,
      email: data.email,
      mobilePhone: data.telefone,
      cpfCnpj: data.cnpj ?? '',
      externalReference: tenantId,
    })
    asaasCustomerId = customer.id

    // 1. Criar subscription ASAAS
    const subscription = await AsaasService.createSubscription({
      customer         : asaasCustomerId,
      billingType      : 'UNDEFINED',
      cycle            : data.plano_id === 'mayus_annual' ? 'YEARLY' : 'MONTHLY',
      value            : data.plano_id === 'mayus_annual' ? 5964.00 : 647.00,
      nextDueDate      : nextDueDate(),
      description      : `MAYUS — Plano ${data.plano_id === 'mayus_annual' ? 'Anual' : 'Mensal'}`,
      externalReference: tenantId,
    })
    asaasSubId = subscription.id

    // 2. Buscar link de checkout
    const checkoutUrl = await AsaasService.getCheckoutUrl(asaasSubId)

    await supabase.from('tenants').update({ asaas_customer_id: customer.id }).eq('id', tenantId)

    return NextResponse.json({
      success      : true,
      tenant_id    : tenantId,
      checkout_url : checkoutUrl,
      mensagem     : 'Cadastro realizado! Complete o pagamento para ativar o MAYUS.',
    }, { status: 201 })

  } catch (err) {
    console.error('[CADASTRO] Erro — rollback', err)
    if (asaasSubId)      await AsaasService.cancelSubscription(asaasSubId)
    if (asaasCustomerId) await AsaasService.deleteCustomer(asaasCustomerId)
    if (authUserId)      await supabase.auth.admin.deleteUser(authUserId)
    if (tenantId)        await supabase.from('tenants').delete().eq('id', tenantId)
    
    return NextResponse.json({ error: (err as any).message || 'Falha ao configurar cobrança.' }, { status: 502 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 })
}
