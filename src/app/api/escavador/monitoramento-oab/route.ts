import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { tenant_id, oab_numero, oab_estado } = await req.json()
  if (!tenant_id || !oab_numero || !oab_estado) {
    return NextResponse.json({ error: 'Parâmetros obrigatórios: tenant_id, oab_numero, oab_estado' }, { status: 400 })
  }

  const { data: integ } = await adminSupabase
    .from('tenant_integrations')
    .select('api_key, metadata')
    .eq('tenant_id', tenant_id)
    .eq('provider', 'escavador')
    .single()

  if (!integ?.api_key) {
    return NextResponse.json({ error: 'Escavador não configurado' }, { status: 400 })
  }

  const res = await fetch('https://api.escavador.com/api/v2/monitoramentos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${integ.api_key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    },
    body: JSON.stringify({
      tipo: 'termo',
      termo: `OAB/${oab_estado} ${oab_numero}`,
      frequencia: 'DIARIA',
      ativo: true
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
        oab_numero,
        oab_estado,
        criado_em: new Date().toISOString()
      }
    })
    .eq('tenant_id', tenant_id)
    .eq('provider', 'escavador')

  console.log(`[monitoramento-oab] Monitoramento criado: ID ${data?.id} para OAB ${oab_estado}/${oab_numero}`)
  return NextResponse.json({ success: true, monitoramento_id: data?.id })
}
