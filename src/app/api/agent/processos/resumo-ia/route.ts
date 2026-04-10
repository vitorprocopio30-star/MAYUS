import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Aceita processo_id (UUID) OU numero_processo (CNJ)
  const { processo_id, numero_processo } = await req.json()

  if (!processo_id && !numero_processo) {
    return NextResponse.json({ error: 'Informe processo_id ou numero_processo' }, { status: 400 })
  }

  // Buscar o processo por UUID ou por número CNJ
  let query = supabase
    .from('monitored_processes')
    .select('id, escavador_id, tenant_id, resumo_curto, resumo_solicitado_em')

  if (processo_id) {
    query = query.eq('id', processo_id)
  } else {
    query = query.eq('numero_processo', numero_processo)
  }

  const { data: proc } = await query.single()

  if (!proc?.escavador_id) {
    return NextResponse.json({ error: 'Processo não encontrado ou sem ID Escavador' }, { status: 400 })
  }

  // Se já tem resumo salvo, retornar sem cobrar novamente (anti-dupla-cobrança)
  if (proc.resumo_curto) {
    return NextResponse.json({ resumo: proc.resumo_curto, cached: true })
  }

  // Anti-duplicata: Se já foi solicitado recentemente, não disparar de novo
  if (proc.resumo_solicitado_em) {
    return NextResponse.json({ status: 'ja_solicitado' })
  }

  // Buscar credenciais da integração Escavador do tenant
  const { data: integration } = await supabase
    .from('tenant_integrations')
    .select('api_key')
    .eq('tenant_id', proc.tenant_id)
    .eq('provider', 'escavador')
    .single()

  // Fallback para variável de ambiente global
  const apiKey = integration?.api_key || process.env.ESCAVADOR_API_KEY

  if (!apiKey) {
    return NextResponse.json({ error: 'Integração Escavador não configurada' }, { status: 400 })
  }

  // Chamar Escavador: POST /v2/processos/{id}/ia/resumo/solicitar-atualizacao
  const resp = await fetch(
    `https://api.escavador.com/api/v2/processos/${proc.escavador_id}/ia/resumo/solicitar-atualizacao`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    }
  )

  if (!resp.ok) {
    const err = await resp.text()
    return NextResponse.json({ error: `Escavador: ${err}` }, { status: resp.status })
  }

  // 3. Marcar no banco que o resumo foi solicitado
  await supabase
    .from('monitored_processes')
    .update({ 
      resumo_solicitado_em: new Date().toISOString() 
    })
    .eq('id', proc.id)

  return NextResponse.json({ status: 'solicitado' })
}
