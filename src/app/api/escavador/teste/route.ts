import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  
  const { data: integration } = await supabase
    .from('tenant_integrations')
    .select('api_key')
    .eq('provider', 'escavador')
    .in('status', ['active', 'connected'])
    .limit(1)
    .single()

  if (!integration?.api_key) return NextResponse.json({ error: 'sem api key' })

  const url = new URL('https://api.escavador.com/api/v2/advogado/processos')
  url.searchParams.set('oab_numero', '211558')
  url.searchParams.set('oab_estado', 'RJ')

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${integration.api_key}`,
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
