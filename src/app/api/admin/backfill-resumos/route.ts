import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { solicitarResumoIA, buscarESalvarResumo } from '@/lib/services/escavador-ia'
import { requireTenantApiKey } from '@/lib/integrations/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/admin/backfill-resumos
// Body: { secret: "...", tenant_id: "...", action: "solicitar" | "coletar" }
export async function POST(req: NextRequest) {
  console.log('[BACKFILL] Iniciando execução - v1.5')
  const { secret, tenant_id, action } = await req.json()
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { apiKey } = await requireTenantApiKey(tenant_id, 'escavador')
  if (!apiKey) return NextResponse.json({ error: 'Escavador não configurado' }, { status: 400 })

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
    let pulados = 0
    for (const p of processos) {
      console.log(`[BACKFILL] Coletando ${p.numero_processo}...`)
      const ok = await buscarESalvarResumo(p.numero_processo, tenant_id)
      if (ok) salvos++
      else pulados++
      
      // Rate limit safety
      await new Promise(r => setTimeout(r, 500))
    }
    return NextResponse.json({ action: 'coletar', total: processos.length, salvos, pulados })
  }

  // Comportamento padrão: Solicitar geração
  let solicitados = 0
  let erros = 0

  for (const p of processos) {
    try {
      console.log(`[BACKFILL] Solicitando ${p.numero_processo}...`)
      await solicitarResumoIA(p.numero_processo, tenant_id)
      solicitados++
    } catch (err) {
      console.error(`[BACKFILL] Erro ao solicitar ${p.numero_processo}:`, err)
      erros++
    }
    // Espera 2s entre cada para não estourar rate limit
    await new Promise(r => setTimeout(r, 2000))
  }

  return NextResponse.json({
    message: 'Backfill iniciado — resumos sendo gerados em background',
    total: processos.length,
    solicitados,
    erros,
    custo_estimado: `R$ ${(solicitados * 0.08).toFixed(2)}`
  }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' }
  })
}
