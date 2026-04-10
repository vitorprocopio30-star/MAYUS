import { createClient } from '@supabase/supabase-js'
import { escavadorFetch } from './escavador-client'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function getApiKey(tenantId: string): Promise<string | null> {
  const { data } = await adminSupabase
    .from('tenant_integrations').select('api_key')
    .eq('tenant_id', tenantId).eq('provider', 'escavador').single()
  return data?.api_key ?? null
}

/**
 * Solicita a geração/atualização do resumo IA no Escavador.
 * Retorna imediatamente após colocar na fila do provedor.
 */
export async function solicitarResumoIA(numero_cnj: string, tenantId: string): Promise<void> {
  const apiKey = await getApiKey(tenantId)
  if (!apiKey) return

  await escavadorFetch(
    `/processos/numero_cnj/${numero_cnj}/ia/resumo/solicitar-atualizacao`,
    apiKey,
    tenantId,
    { method: 'POST' }
  ).catch(() => null) // ignora se já estava em fila ou erro menor
}

/**
 * Busca o resumo pronto no Escavador e salva no banco do tenant.
 * Chamado normalmente via webhook ou backfill.
 */
export async function buscarESalvarResumo(numero_cnj: string, tenantId: string): Promise<boolean> {
  const apiKey = await getApiKey(tenantId)
  if (!apiKey) return false

  try {
    const data = await escavadorFetch(
      `/processos/numero_cnj/${numero_cnj}/ia/resumo`,
      apiKey,
      tenantId
    )

    // O Escavador pode retornar em 'conteudo' ou 'resumo' dependendo da versão/endpoint
    const texto = data?.conteudo ?? data?.resumo
    if (!texto) return false

    const { error } = await adminSupabase
      .from('monitored_processes')
      .update({ 
        resumo_curto: texto, 
        updated_at: new Date().toISOString() 
      })
      .eq('numero_processo', numero_cnj)
      .eq('tenant_id', tenantId)

    if (error) {
      console.error(`[RESUMO_IA] Erro ao salvar no Supabase para ${numero_cnj}:`, error)
      return false
    }

    console.log(`[RESUMO_IA] Salvo com sucesso para o tenant ${tenantId}: ${numero_cnj}`)
    return true
  } catch (err: any) {
    console.error(`[RESUMO_IA] Falha ao coletar para ${numero_cnj}:`, err.message)
    return false
  }
}
