import { createClient } from '@supabase/supabase-js'
import { escavadorFetch } from './escavador-client'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type CriarMonitoramentoParams = {
  tenantId: string
  apiKey: string
  numeroProcesso: string
  frequencia?: 'diaria' | 'semanal' | 'mensal'
}

type ResultadoMonitoramento = {
  ok: boolean
  monitoramentoId: string | null
  payload: any
  error?: string
}

function extrairMonitoramentoId(payload: any): string | null {
  const id =
    payload?.id ??
    payload?.monitoramento?.id ??
    payload?.data?.id ??
    payload?.resultado?.id ??
    null

  if (id === null || id === undefined || id === '') return null
  return String(id)
}

export async function criarMonitoramentoProcesso({
  tenantId,
  apiKey,
  numeroProcesso,
  frequencia = 'semanal'
}: CriarMonitoramentoParams): Promise<ResultadoMonitoramento> {
  try {
    const payload = await escavadorFetch(
      '/monitoramentos/processos',
      apiKey,
      tenantId,
      {
        method: 'POST',
        body: JSON.stringify({ numero: numeroProcesso, frequencia })
      }
    )

    const monitoramentoId = extrairMonitoramentoId(payload)
    if (!monitoramentoId) {
      return {
        ok: false,
        monitoramentoId: null,
        payload,
        error: 'Escavador retornou sucesso sem monitoramento_id'
      }
    }

    return { ok: true, monitoramentoId, payload }
  } catch (err: any) {
    return {
      ok: false,
      monitoramentoId: null,
      payload: null,
      error: err?.message || 'Falha ao criar monitoramento'
    }
  }
}

export async function solicitarResumoProcesso(
  tenantId: string,
  apiKey: string,
  numeroProcesso: string
): Promise<boolean> {
  try {
    await escavadorFetch(
      `/processos/numero_cnj/${numeroProcesso}/ia/resumo/solicitar-atualizacao`,
      apiKey,
      tenantId,
      { method: 'POST' }
    )

    await adminSupabase
      .from('monitored_processes')
      .update({ resumo_solicitado_em: new Date().toISOString() })
      .eq('tenant_id', tenantId)
      .eq('numero_processo', numeroProcesso)

    return true
  } catch {
    return false
  }
}
