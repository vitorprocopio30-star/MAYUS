import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { escavadorFetch, checkBudget } from '@/lib/services/escavador-client'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function getAuthContext(req: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch { }
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await adminSupabase
    .from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return null

  const { data: integration } = await adminSupabase
    .from('tenant_integrations').select('api_key')
    .eq('tenant_id', profile.tenant_id).eq('provider', 'escavador').single()
  if (!integration?.api_key) return null

  return { tenantId: profile.tenant_id, apiKey: integration.api_key }
}

// POST — solicita geração do resumo IA
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { numero_processo } = await req.json()
  if (!numero_processo) return NextResponse.json({ error: 'Número inválido' }, { status: 400 })

  const dentro = await checkBudget(ctx.tenantId)
  if (!dentro) return NextResponse.json({ error: 'Limite de créditos atingido' }, { status: 402 })

  try {
    // FIX: era /processes/ — corrigido para /processos/
    const data = await escavadorFetch(
      `/processos/numero_cnj/${numero_processo}/ia/resumo/solicitar-atualizacao`,
      ctx.apiKey,
      ctx.tenantId,
      { method: 'POST' }
    )
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET ?numero_processo=X&action=status  → verifica status
// GET ?numero_processo=X               → busca resumo pronto e salva no banco
export async function GET(req: NextRequest) {
  const ctx = await getAuthContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const numero_processo = url.searchParams.get('numero_processo')
  const action = url.searchParams.get('action') // 'status' ou vazio

  if (!numero_processo) return NextResponse.json({ error: 'Número inválido' }, { status: 400 })

  try {
    if (action === 'status') {
      // FIX: era /processes/ — corrigido para /processos/
      const data = await escavadorFetch(
        `/processos/numero_cnj/${numero_processo}/ia/resumo/status`,
        ctx.apiKey,
        ctx.tenantId
      )
      return NextResponse.json(data)
    }

    // Busca resumo pronto
    // FIX: era /processes/ — corrigido para /processos/
    const data = await escavadorFetch(
      `/processos/numero_cnj/${numero_processo}/ia/resumo`,
      ctx.apiKey,
      ctx.tenantId
    )

    // Salva no banco se tiver conteúdo
    const resumoFinal = data.conteudo || data.resumo
    if (resumoFinal) {
      await adminSupabase
        .from('monitored_processes')
        .update({
          resumo_curto: resumoFinal,
          updated_at: new Date().toISOString()
        })
        .eq('numero_processo', numero_processo)
        .eq('tenant_id', ctx.tenantId)
    }

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
