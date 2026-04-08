import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { escavadorFetch } from '@/lib/services/escavador-client'

export const maxDuration = 60

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  // Segurança: cron secret em produção
  const cronSecret = req.headers.get('x-cron-secret')
  if (
    cronSecret !== process.env.CRON_SECRET &&
    process.env.NODE_ENV === 'production'
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Busca até 10 itens pendentes por execução
  const { data: fila } = await adminSupabase
    .from('process_update_queue')
    .select('id, numero_cnj, tenant_id')
    .eq('status', 'PENDENTE')
    .limit(10)

  if (!fila?.length) return NextResponse.json({ ok: true, processados: 0 })

  let processados = 0

  for (const item of fila) {
    try {
      // Marca como processando (evita processamento duplo)
      await adminSupabase
        .from('process_update_queue')
        .update({ status: 'PROCESSANDO' })
        .eq('id', item.id)

      // Busca todos os tenants que monitoram esse CNJ
      const { data: processos } = await adminSupabase
        .from('monitored_processes')
        .select('id, tenant_id')
        .eq('numero_processo', item.numero_cnj)

      for (const processo of processos ?? []) {
        // Busca integração do tenant
        const { data: integ } = await adminSupabase
          .from('tenant_integrations')
          .select('api_key')
          .eq('tenant_id', processo.tenant_id)
          .eq('provider', 'escavador')
          .single()

        if (!integ?.api_key) continue

        // Busca dados frescos do processo no Escavador
        const dados = await escavadorFetch(
          `/processos/numero_cnj/${encodeURIComponent(item.numero_cnj)}`,
          integ.api_key,
          processo.tenant_id
        ).catch(() => null)

        if (!dados) continue

        const fontes = dados.fontes ?? []
        const fonteTrib =
          fontes.find((f: any) => f.tribunal?.sigla) ?? fontes[0] ?? {}
        const capa = fonteTrib?.capa ?? {}

        await adminSupabase
          .from('monitored_processes')
          .update({
            status: capa.status_predito ?? 'ATIVO',
            tribunal: dados.unidade_origem?.tribunal_sigla ?? '—',
            assunto: capa.assunto_principal_normalizado?.nome ?? '—',
            ultima_movimentacao: dados.data_ultima_movimentacao ?? '—',
            updated_at: new Date().toISOString()
          })
          .eq('id', processo.id)
      }

      await adminSupabase
        .from('process_update_queue')
        .update({
          status: 'CONCLUIDO',
          processed_at: new Date().toISOString()
        })
        .eq('id', item.id)

      processados++
    } catch (e) {
      console.error('[UPDATE_AGENT] Erro:', e)
      await adminSupabase
        .from('process_update_queue')
        .update({ status: 'ERRO' })
        .eq('id', item.id)
    }
  }

  return NextResponse.json({ ok: true, processados })
}
