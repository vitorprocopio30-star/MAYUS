import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { escavadorFetch } from '@/lib/services/escavador-client'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/admin/backfill-resumos
// Body: { secret: "...", tenant_id: "...", action: "solicitar" | "coletar" }
export async function POST(req: NextRequest) {
  const { secret, tenant_id, action } = await req.json()
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: integration } = await adminSupabase
    .from('tenant_integrations').select('api_key')
    .eq('tenant_id', tenant_id).eq('provider', 'escavador').single()
  if (!integration?.api_key) return NextResponse.json({ error: 'Escavador não configurado' }, { status: 400 })

  // Busca todos os processos sem resumo
  const { data: processos } = await adminSupabase
    .from('monitored_processes')
    .select('id, numero_processo')
    .eq('tenant_id', tenant_id)
    .or('resumo_curto.is.null,resumo_curto.eq.')

  if (!processos?.length) return NextResponse.json({ message: 'Nenhum processo sem resumo', total: 0 })

  // Se action = 'coletar', apenas busca resumos já prontos e salva
  if (action === 'coletar') {
    let salvos = 0
    for (const p of processos) {
      try {
        const resumoData = await escavadorFetch(
          `/processos/numero_cnj/${p.numero_processo}/ia/resumo`,
          integration.api_key,
          tenant_id
        )
        if (resumoData?.resumo) {
          await adminSupabase
            .from('monitored_processes')
            .update({
              resumo_curto: resumoData.resumo,
              updated_at: new Date().toISOString()
            })
            .eq('id', p.id)
          salvos++
        }
      } catch { /* resumo ainda não pronto, pula */ }
      // Rate limit safety
      await new Promise(r => setTimeout(r, 500))
    }
    return NextResponse.json({ action: 'coletar', total: processos.length, salvos })
  }

  // Comportamento padrão: Solicitar geração
  let solicitados = 0
  let erros = 0

  for (const p of processos) {
    try {
      await escavadorFetch(
        `/processos/numero_cnj/${p.numero_processo}/ia/resumo/solicitar-atualizacao`,
        integration.api_key,
        tenant_id,
        { method: 'POST' }
      )
      solicitados++
      // Espera 2s entre cada para não estourar rate limit (500 req/min)
      await new Promise(r => setTimeout(r, 2000))
    } catch {
      erros++
    }
  }

  return NextResponse.json({
    message: 'Backfill iniciado — resumos sendo gerados em background',
    total: processos.length,
    solicitados,
    erros,
    custo_estimado: `R$ ${(solicitados * 0.08).toFixed(2)}`
  })
}
