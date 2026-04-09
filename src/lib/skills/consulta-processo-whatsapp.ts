import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Busca contexto completo de processo para a IA responder ao cliente
export async function getContextoProcesso(tenantId: string, query: string) {
  // Busca por número CNJ exato
  const numeroCnj = query.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0]
  if (numeroCnj) {
    const { data } = await supabase
      .from('v_processo_contexto_ia')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('numero_processo', numeroCnj)
      .single()
    if (data) return [data]
  }

  // Busca por nome do cliente (polo ativo)
  const { data } = await supabase
    .from('v_processo_contexto_ia')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('monitoramento_ativo', true)
    .ilike('polo_ativo', `%${query}%`)
    .limit(5)

  return data ?? []
}

// Formata para o system prompt da IA no WhatsApp
export function formatarContextoParaIA(processos: Record<string, unknown>[]) {
  if (!processos.length) return 'Nenhum processo encontrado para esta consulta.'

  return processos.map(p => p.contexto_ia).join('\n\n---\n\n')
}
