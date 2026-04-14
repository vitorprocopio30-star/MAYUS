import { createClient } from '@supabase/supabase-js'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ESCAVADOR_BASE_V2 = 'https://api.escavador.com/api/v2'
const LIMITE_CENTAVOS_DEFAULT = Number(process.env.ESCAVADOR_LIMITE_CENTAVOS ?? 4000)
const ESCAVADOR_TIMEOUT_MS = Number(process.env.ESCAVADOR_TIMEOUT_MS ?? 30000)

export async function escavadorFetch(
  path: string,
  apiKey: string,
  tenantId: string,
  options: RequestInit = {}
): Promise<any> {
  const isV1 = path.startsWith('/v1/')
  const url = isV1
    ? `https://api.escavador.com/api${path}`
    : `${ESCAVADOR_BASE_V2}${path}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ESCAVADOR_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...((options.headers as Record<string, string>) ?? {})
      }
    })
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Escavador timeout após ${Math.round(ESCAVADOR_TIMEOUT_MS / 1000)}s`) 
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }

  const creditos = Number(res.headers.get('Creditos-Utilizados') ?? 0)

  if (creditos > 0) {
    await adminSupabase.from('api_usage_log').insert({
      tenant_id: tenantId,
      endpoint: path,
      creditos
    })
  }

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Escavador ${res.status}: ${err}`)
  }

  return res.json()
}

export async function checkBudget(tenantId: string): Promise<boolean> {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { data } = await adminSupabase
    .from('api_usage_log')
    .select('creditos')
    .eq('tenant_id', tenantId)
    .gte('created_at', startOfMonth.toISOString())

  const total = (data ?? []).reduce(
    (sum: number, r: any) => sum + (r.creditos ?? 0),
    0
  )
  return total < LIMITE_CENTAVOS_DEFAULT
}
