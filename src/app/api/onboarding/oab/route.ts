import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { z } from 'zod'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const OnboardingOabSchema = z.object({
  oab_numero: z.string().regex(/^\d{4,6}$/, 'Número da OAB inválido'),
  oab_estado: z.string().regex(/^[A-Z]{2}$/, 'Estado da OAB inválido'),
})

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const authClient = createServerClient(
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

    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })

    const rawBody = await req.json().catch(() => null)
    const body = {
      oab_numero: rawBody?.oab_numero?.toString().replace(/\D/g, '') ?? '',
      oab_estado: rawBody?.oab_estado?.toString().trim().toUpperCase() ?? '',
    }

    const parsed = OnboardingOabSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json({ error: 'Dados inválidos.', detalhes: parsed.error.flatten().fieldErrors }, { status: 422 })

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('id, tenant_id').eq('id', user.id).maybeSingle()
    if (profileError || !profile?.tenant_id)
      return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 })

    const { oab_numero, oab_estado } = parsed.data
    const now = new Date().toISOString()

    const { error: userUpdateError } = await supabase
      .from('profiles').update({ oab_registro: oab_numero, oab_estado, updated_at: now }).eq('id', user.id)
    if (userUpdateError) return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })

    const { error: tenantUpdateError } = await supabase
      .from('tenants').update({ oab_numero, oab_estado, updated_at: now }).eq('id', profile.tenant_id)
    if (tenantUpdateError) return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })

    const { error: auditError } = await supabase.from('system_event_logs').insert({
      source: 'onboarding',
      provider: 'oab',
      event_name: 'onboarding_oab',
      status: 'queued',
      tenant_id: profile.tenant_id,
      user_id: user.id,
      payload: { skill: 'importar_processos_oab', oab_numero, oab_estado },
      created_at: now,
    })
    if (auditError) console.error('[ONBOARDING_OAB] Erro audit:', auditError.message)
    
    return NextResponse.json({ success: true, message: 'Importação iniciada.' }, { status: 200 })
  } catch (err) {
    console.error('[ONBOARDING_OAB] Erro inesperado:', err)
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 })
  }
}
