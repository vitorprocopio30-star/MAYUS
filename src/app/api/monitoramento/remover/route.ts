import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { requireTenantApiKey } from '@/lib/integrations/server'
import { cancelarMonitoramentoProcesso } from '@/lib/services/monitoramento-processos'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function DELETE(req: NextRequest) {
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

  const { processo_id } = await req.json()
  if (!processo_id) return NextResponse.json({ error: 'processo_id é obrigatório' }, { status: 400 })

  const { data: profile } = await adminSupabase
    .from('profiles').select('tenant_id').eq('id', user.id).single()
  if (!profile?.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })
  const tenantId = profile.tenant_id

  let lookupQuery = adminSupabase
    .from('monitored_processes')
    .select('id, numero_processo, escavador_monitoramento_id, monitoramento_ativo')
    .eq('tenant_id', tenantId)

  // Verifica se é UUID
  if (processo_id.includes('-') && processo_id.length === 36) {
    lookupQuery = lookupQuery.eq('id', processo_id)
  } else {
    lookupQuery = lookupQuery.eq('numero_processo', processo_id)
  }

  const { data: processo, error: lookupError } = await lookupQuery.maybeSingle()
  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
  if (!processo) return NextResponse.json({ error: 'Processo monitorado não encontrado' }, { status: 404 })

  const monitoramentoId = processo.escavador_monitoramento_id
  if (monitoramentoId && processo.monitoramento_ativo) {
    let cancelamento: { ok: boolean; error?: string }
    try {
      const { apiKey } = await requireTenantApiKey(tenantId, 'escavador')
      if (!apiKey) {
        cancelamento = { ok: false, error: 'Integracao Escavador nao configurada ou inativa.' }
      } else {
        cancelamento = await cancelarMonitoramentoProcesso({
          tenantId,
          apiKey,
          monitoramentoId: String(monitoramentoId),
        })
      }
    } catch (error: any) {
      cancelamento = {
        ok: false,
        error: error?.message || 'Falha ao preparar cancelamento no Escavador',
      }
    }

    if (!cancelamento.ok) {
      await adminSupabase.from('system_event_logs').insert({
        tenant_id: tenantId,
        user_id: user.id,
        source: 'monitoramento',
        provider: 'escavador',
        event_name: 'escavador_monitoring_cancel_failed',
        status: 'error',
        payload: {
          action: 'remover_monitoramento',
          processo_id: processo.id,
          numero_processo: processo.numero_processo,
          escavador_monitoramento_id: monitoramentoId,
          error: cancelamento.error,
        },
        created_at: new Date().toISOString(),
      })
      return NextResponse.json({ error: 'Falha ao cancelar monitoramento no Escavador.' }, { status: 502 })
    }
  }

  const { error } = await adminSupabase
    .from('monitored_processes')
    .update({
      ativo: false,
      monitoramento_ativo: false,
      escavador_monitoramento_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('id', processo.id)

  if (error) {
    console.error('[remover-monitoramento]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, mensagem: 'Processo removido e monitoramento externo cancelado com sucesso.' })
}
