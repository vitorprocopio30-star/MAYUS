import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normalizeOabEstado(value: string) {
  return String(value || '').trim().toUpperCase()
}

function normalizeOabNumero(value: string) {
  return String(value || '').replace(/\D/g, '')
}

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { oab_numero, oab_estado, advogado_nome } = await req.json()
  if (!oab_numero || !oab_estado) {
    return NextResponse.json({ error: 'Parâmetros obrigatórios: oab_numero, oab_estado' }, { status: 400 })
  }

  const normalizedEstado = normalizeOabEstado(oab_estado)
  const normalizedNumero = normalizeOabNumero(oab_numero)

  if (!normalizedEstado || !normalizedNumero) {
    return NextResponse.json({ error: 'OAB inválida' }, { status: 400 })
  }

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!profile?.tenant_id) return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 400 })

  const tenant_id = profile.tenant_id

  const { data: integ } = await adminSupabase
    .from('tenant_integrations')
    .select('api_key, metadata')
    .eq('tenant_id', tenant_id)
    .eq('provider', 'escavador')
    .single()

  if (!integ?.api_key) {
    return NextResponse.json({ error: 'Escavador não configurado' }, { status: 400 })
  }

  const termoPrincipal = `OAB/${normalizedEstado} ${normalizedNumero}`

  const res = await fetch('https://api.escavador.com/api/v2/monitoramentos/novos-processos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${integ.api_key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify({
      termo: termoPrincipal,
      variacoes: [
        `OAB ${normalizedEstado} ${normalizedNumero}`,
        `${normalizedEstado}${normalizedNumero}`
      ]
    })
  })

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    console.error('[monitoramento-oab] Erro Escavador:', data)
    return NextResponse.json({ error: data }, { status: res.status })
  }

  await adminSupabase
    .from('tenant_integrations')
    .update({
      metadata: {
        ...(integ.metadata as Record<string, unknown> | null),
        monitoramento_oab_id: data?.id,
        monitoramento_oab_termo: termoPrincipal,
        oab_numero: normalizedNumero,
        oab_estado: normalizedEstado,
        criado_em: new Date().toISOString()
      }
    })
    .eq('tenant_id', tenant_id)
    .eq('provider', 'escavador')

  await adminSupabase
    .from('tenant_oab_monitoramentos')
    .upsert({
      tenant_id,
      oab_estado: normalizedEstado,
      oab_numero: normalizedNumero,
      advogado_nome: String(advogado_nome || '').trim() || null,
      monitoramento_oab_id: data?.id ? String(data.id) : null,
      monitoramento_ativo: true,
      ultima_sincronizacao: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'tenant_id,oab_estado,oab_numero' })

  console.log(`[monitoramento-oab] Monitoramento criado: ID ${data?.id} para OAB ${normalizedEstado}/${normalizedNumero}`)
  return NextResponse.json({ success: true, monitoramento_id: data?.id })
}
