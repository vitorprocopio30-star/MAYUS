import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const BASE_URL = "https://api.escavador.com/api/v2"

async function fetchEscavador(endpoint: string, apiKey: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${endpoint}`
  const headers = {
    ...options.headers,
    "Authorization": `Bearer ${apiKey}`,
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/json",
  }

  const res = await fetch(url, { ...options, headers })
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.message || `Erro Escavador: ${res.status}`)
  }
  return await res.json()
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (!token) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const { data: profile } = await adminSupabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (!profile?.tenant_id) return NextResponse.json({ error: 'Tenant não encontrado.' }, { status: 403 })

    const { data: integration } = await adminSupabase
      .from('tenant_integrations')
      .select('api_key')
      .eq('tenant_id', profile.tenant_id)
      .eq('provider', 'escavador')
      .single()

    if (!integration?.api_key) return NextResponse.json({ error: 'Integração Escavador não configurada.' }, { status: 400 })

    const { numero_cnj } = await req.json()
    if (!numero_cnj) return NextResponse.json({ error: 'numero_cnj obrigatório.' }, { status: 400 })

    const resultado = await fetchEscavador(
      `/processos/numero_cnj/${encodeURIComponent(numero_cnj)}/monitoramento`,
      integration.api_key,
      { 
        method: 'POST', 
        body: JSON.stringify({ frequencia: 'SEMANAL' }) 
      }
    )

    return NextResponse.json({ ok: true, monitoramento: resultado })
  } catch (err: any) {
    console.error('[ATIVAR_MONITORAMENTO_ERROR]', err)
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}
