import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

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
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { numero_processo } = await req.json()
  if (!numero_processo) return NextResponse.json({ error: 'Número inválido' }, { status: 400 })

  const { data: profile } = await adminSupabase
    .from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const { data: integration } = await adminSupabase
    .from('tenant_integrations').select('api_key')
    .eq('tenant_id', profile.tenant_id).eq('provider', 'escavador').single()

  if (!integration?.api_key) return NextResponse.json({ error: 'Escavador não configurado' }, { status: 400 })

  try {
    const res = await fetch(`https://api.escavador.com/api/v2/processes/numero_cnj/${numero_processo}/ia/resumo/solicitar-atualizacao`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.api_key}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json'
      }
    })
    
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: 'Falha ao solicitar resumo Escavador' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const numero_processo = url.searchParams.get('numero_processo')
  if (!numero_processo) return NextResponse.json({ error: 'Número inválido' }, { status: 400 })

  const { data: profile } = await adminSupabase
    .from('profiles').select('tenant_id').eq('id', user.id).single()
  
  const { data: integration } = await adminSupabase
    .from('tenant_integrations').select('api_key')
    .eq('tenant_id', profile?.tenant_id).eq('provider', 'escavador').single()

  if (!integration?.api_key) return NextResponse.json({ error: 'Escavador não configurado' }, { status: 400 })

  try {
    const res = await fetch(`https://api.escavador.com/api/v2/processes/numero_cnj/${numero_processo}/ia/resumo`, {
      headers: {
        'Authorization': `Bearer ${integration.api_key}`,
        'X-Requested-With': 'XMLHttpRequest'
      }
    })
    
    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: 'Falha ao consultar resumo Escavador' }, { status: 500 })
  }
}
