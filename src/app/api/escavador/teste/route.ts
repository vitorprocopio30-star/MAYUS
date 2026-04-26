import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireTenantApiKey } from '@/lib/integrations/server'

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const requiredSecret = process.env.ESCAVADOR_TEST_ROUTE_SECRET
  if (!requiredSecret) {
    return NextResponse.json({ error: 'Rota de teste desabilitada' }, { status: 403 })
  }

  const incomingSecret = req.headers.get('x-test-secret')
  if (incomingSecret !== requiredSecret) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .limit(1)
    .single()

  const { apiKey } = profile?.tenant_id
    ? await requireTenantApiKey(profile.tenant_id, 'escavador')
    : { apiKey: null }

  if (!apiKey) return NextResponse.json({ error: 'sem api key' })

  const url = new URL('https://api.escavador.com/api/v2/advogado/processos')
  url.searchParams.set('oab_numero', '211558')
  url.searchParams.set('oab_estado', 'RJ')

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    }
  })

  const text = await resp.text()
  return NextResponse.json({ 
    status: resp.status,
    primeiros_500: text.substring(0, 500)
  })
}
