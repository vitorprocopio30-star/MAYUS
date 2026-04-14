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
  frequencia?: 'DIARIA' | 'SEMANAL'
}

type ResultadoMonitoramento = {
  ok: boolean
  monitoramentoId: string | null
  payload: any
  error?: string
}

function normalizarNumeroProcesso(valor?: string | null): string {
  return String(valor ?? '').replace(/\D/g, '')
}

async function buscarMonitoramentoExistentePorNumero(
  apiKey: string,
  numeroProcesso: string
): Promise<{ id: string; payload: any } | null> {
  const alvo = normalizarNumeroProcesso(numeroProcesso)
  if (!alvo) return null

  let url: string | null = 'https://api.escavador.com/api/v2/monitoramentos/processos'
  let pages = 0

  while (url && pages < 10) {
    pages += 1

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    let res: Response
    try {
      res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        }
      })
    } catch {
      return null
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) return null

    const data = await res.json().catch(() => null)
    const items = data?.items ?? []
    const encontrado = items.find((item: any) => normalizarNumeroProcesso(item?.numero) === alvo)

    if (encontrado?.id) {
      return {
        id: String(encontrado.id),
        payload: encontrado
      }
    }

    url = data?.links?.next ?? null
  }

  return null
}

function extrairMonitoramentoId(payload: any): string | null {
  const candidatos = [
    payload?.id,
    payload?.monitoramento_id,
    payload?.monitoramentoId,
    payload?.monitoramento?.id,
    payload?.data?.id,
    payload?.data?.monitoramento_id,
    payload?.data?.monitoramento?.id,
    payload?.resultado?.id,
    payload?.result?.id,
  ]

  const idDireto = candidatos.find((v) => v !== null && v !== undefined && v !== '')
  if (idDireto !== undefined) {
    return String(idDireto)
  }

  const stack: any[] = [payload]
  while (stack.length > 0) {
    const atual = stack.pop()
    if (!atual) continue

    if (Array.isArray(atual)) {
      atual.forEach((v) => stack.push(v))
      continue
    }

    if (typeof atual === 'object') {
      const chavePrioritaria =
        atual.monitoramento_id ??
        atual.monitoramentoId ??
        (atual.monitoramento && atual.monitoramento.id) ??
        atual.id

      if (chavePrioritaria !== null && chavePrioritaria !== undefined && chavePrioritaria !== '') {
        return String(chavePrioritaria)
      }

      Object.values(atual).forEach((v) => stack.push(v))
    }
  }

  return null
}

export async function criarMonitoramentoProcesso({
  tenantId,
  apiKey,
  numeroProcesso,
  frequencia = 'SEMANAL'
}: CriarMonitoramentoParams): Promise<ResultadoMonitoramento> {
  const numero = String(numeroProcesso || '').trim()

  if (!numero) {
    return {
      ok: false,
      monitoramentoId: null,
      payload: null,
      error: 'Número do processo vazio para criação de monitoramento'
    }
  }

  const payloadBase = {
    numero,
    frequencia: frequencia || 'SEMANAL'
  }

  try {
    const payload = await escavadorFetch(
      '/monitoramentos/processos',
      apiKey,
      tenantId,
      {
        method: 'POST',
        body: JSON.stringify(payloadBase)
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
    const msg = String(err?.message || '')

    if (msg.includes('Escavador 422')) {
      const existente = await buscarMonitoramentoExistentePorNumero(apiKey, numero)
      if (existente?.id) {
        return {
          ok: true,
          monitoramentoId: existente.id,
          payload: {
            recovered_from_existing: true,
            ...existente.payload
          }
        }
      }
    }

    if (msg.includes('Escavador 422') && payloadBase.frequencia !== 'DIARIA') {
      try {
        const payloadRetry = await escavadorFetch(
          '/monitoramentos/processos',
          apiKey,
          tenantId,
          {
            method: 'POST',
            body: JSON.stringify({ ...payloadBase, frequencia: 'DIARIA' })
          }
        )

        const monitoramentoIdRetry = extrairMonitoramentoId(payloadRetry)
        if (monitoramentoIdRetry) {
          return { ok: true, monitoramentoId: monitoramentoIdRetry, payload: payloadRetry }
        }

        const existenteRetry = await buscarMonitoramentoExistentePorNumero(apiKey, numero)
        if (existenteRetry?.id) {
          return {
            ok: true,
            monitoramentoId: existenteRetry.id,
            payload: {
              recovered_from_existing: true,
              ...existenteRetry.payload
            }
          }
        }

        return {
          ok: false,
          monitoramentoId: null,
          payload: payloadRetry,
          error: 'Escavador retornou sucesso sem monitoramento_id após retry com frequencia DIARIA'
        }
      } catch (retryErr: any) {
        return {
          ok: false,
          monitoramentoId: null,
          payload: null,
          error: retryErr?.message || msg || 'Falha ao criar monitoramento'
        }
      }
    }

    return {
      ok: false,
      monitoramentoId: null,
      payload: null,
      error: `${msg || 'Falha ao criar monitoramento'} | payload: ${JSON.stringify(payloadBase)}`
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
