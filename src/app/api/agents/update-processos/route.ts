import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { escavadorFetch } from '@/lib/services/escavador-client'
import { requireTenantApiKey } from '@/lib/integrations/server'

export const maxDuration = 60

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEFAULT_BATCH_SIZE = 50
const MAX_BATCH_SIZE = 100

function batchSize(req: NextRequest) {
  const parsed = Number(req.nextUrl.searchParams.get('limit') || DEFAULT_BATCH_SIZE)
  if (!Number.isFinite(parsed)) return DEFAULT_BATCH_SIZE
  return Math.max(1, Math.min(MAX_BATCH_SIZE, Math.trunc(parsed)))
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : []
}

function normalizeDate(value: unknown) {
  const raw = text(value)
  if (!raw) return null
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return raw
  return parsed.toISOString()
}

function movementId(movement: Record<string, any>) {
  return text(movement.id)
    || text(movement.id_movimentacao)
    || text(movement.movimentacao_id)
    || text(movement.escavador_movimentacao_id)
}

function movementDate(movement: Record<string, any>) {
  return normalizeDate(
    movement.data
    || movement.data_movimentacao
    || movement.dataHora
    || movement.data_hora
    || movement.created_at
  )
}

function movementText(movement: Record<string, any>) {
  return text(movement.conteudo)
    || text(movement.descricao)
    || text(movement.texto)
    || text(movement.movimento)
    || text(movement.nome)
}

function collectMovements(dados: any) {
  const fontes = asArray(dados?.fontes)
  return [
    ...asArray(dados?.movimentacoes),
    ...fontes.flatMap((fonte: any) => asArray(fonte?.movimentacoes)),
    ...fontes.flatMap((fonte: any) => asArray(fonte?.capa?.movimentacoes)),
  ].filter(isRecord)
}

function latestMovement(dados: any) {
  const movements = collectMovements(dados)
    .map((movement) => ({
      raw: movement,
      id: movementId(movement),
      data: movementDate(movement),
      conteudo: movementText(movement),
    }))
    .filter((movement) => movement.data || movement.conteudo)
    .sort((a, b) => {
      const aTime = a.data ? new Date(a.data).getTime() : 0
      const bTime = b.data ? new Date(b.data).getTime() : 0
      return bTime - aTime
    })

  return movements[0] || null
}

function mergeQueuePayload(payload: unknown, patch: Record<string, unknown>) {
  return {
    ...(isRecord(payload) ? payload : {}),
    update_agent: {
      ...(isRecord((payload as any)?.update_agent) ? (payload as any).update_agent : {}),
      ...patch,
    },
  }
}

function getCronAuthState(req: NextRequest) {
  if (process.env.NODE_ENV !== 'production') {
    return { authorized: true, method: 'development', missingSecret: false }
  }

  const secret = String(process.env.CRON_SECRET || '').trim()
  if (!secret) return { authorized: false, method: null, missingSecret: true }

  const cronHeader = String(req.headers.get('x-cron-secret') || '').trim()
  const bearer = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()

  if (bearer === secret) return { authorized: true, method: 'authorization_bearer', missingSecret: false }
  if (cronHeader === secret) return { authorized: true, method: 'x-cron-secret', missingSecret: false }

  return { authorized: false, method: null, missingSecret: false }
}

async function recordUpdateAgentEvent(params: {
  tenantId?: string | null
  eventName: string
  status: string
  numeroCnj?: string | null
  queueId?: string | null
  error?: string | null
  processedAt?: string | null
  metadata?: Record<string, unknown>
}) {
  try {
    await adminSupabase.from('system_event_logs').insert({
      tenant_id: params.tenantId ?? null,
      source: 'monitoramento',
      provider: 'mayus',
      event_name: params.eventName,
      status: params.status,
      payload: {
        numero_cnj: params.numeroCnj ?? null,
        queue_id: params.queueId ?? null,
        error: params.error ?? null,
        processed_at: params.processedAt ?? null,
        ...(params.metadata ?? {}),
      },
      created_at: new Date().toISOString(),
    })
  } catch (error) {
    console.warn('[UPDATE_AGENT] Falha ao auditar processamento da fila.', error)
  }
}

async function persistMovementIfNew(params: {
  tenantId: string
  numeroCnj: string
  movement: ReturnType<typeof latestMovement>
}) {
  if (!params.movement?.id || !params.movement.conteudo) return null

  const { data: existing } = await adminSupabase
    .from('process_movimentacoes')
    .select('id')
    .eq('tenant_id', params.tenantId)
    .eq('escavador_movimentacao_id', params.movement.id)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data } = await adminSupabase
    .from('process_movimentacoes')
    .insert({
      tenant_id: params.tenantId,
      numero_cnj: params.numeroCnj,
      data: params.movement.data,
      conteudo: params.movement.conteudo,
      fonte: 'escavador_update_agent',
      escavador_movimentacao_id: params.movement.id,
      tipo_evento: 'movimentacao',
    })
    .select('id')
    .maybeSingle()

  return data?.id || null
}

export async function GET(req: NextRequest) {
  const auth = getCronAuthState(req)
  if (!auth.authorized) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const limit = batchSize(req)
  const { data: fila, error: filaError } = await adminSupabase
    .from('process_update_queue')
    .select('id, numero_cnj, tenant_id, payload, evento, created_at')
    .eq('status', 'PENDENTE')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (filaError) {
    return NextResponse.json({ ok: false, error: filaError.message }, { status: 500 })
  }

  if (!fila?.length) return NextResponse.json({ ok: true, picked: 0, processed: 0, failed: 0, limit })

  let processed = 0
  let failed = 0

  for (const item of fila) {
    const processedAt = new Date().toISOString()
    let itemSucceeded = false
    let itemError: string | null = null

    try {
      await adminSupabase
        .from('process_update_queue')
        .update({ status: 'PROCESSANDO' })
        .eq('id', item.id)

      let processQuery = adminSupabase
        .from('monitored_processes')
        .select('id, tenant_id, numero_processo')
        .eq('numero_processo', item.numero_cnj)

      if (item.tenant_id) {
        processQuery = processQuery.eq('tenant_id', item.tenant_id)
      }

      const { data: processos } = await processQuery

      if (!processos?.length) {
        itemError = 'monitored_process_not_found'
      }

      for (const processo of processos ?? []) {
        const { apiKey } = await requireTenantApiKey(processo.tenant_id, 'escavador')
        if (!apiKey) {
          itemError = 'missing_escavador_api_key'
          continue
        }

        const dados = await escavadorFetch(
          `/processos/numero_cnj/${encodeURIComponent(item.numero_cnj)}`,
          apiKey,
          processo.tenant_id
        ).catch(() => null)

        if (!dados) {
          itemError = 'escavador_fetch_failed'
          continue
        }

        const fontes = dados.fontes ?? []
        const fonteTrib = fontes.find((f: any) => f.tribunal?.sigla) ?? fontes[0] ?? {}
        const capa = fonteTrib?.capa ?? {}
        const latest = latestMovement(dados)
        const latestText = latest?.conteudo || text(dados.ultima_movimentacao)
        const latestDate = latest?.data || normalizeDate(dados.data_ultima_movimentacao)

        await adminSupabase
          .from('monitored_processes')
          .update({
            status: capa.status_predito ?? 'ATIVO',
            tribunal: dados.unidade_origem?.tribunal_sigla ?? fonteTrib?.tribunal?.sigla ?? '-',
            assunto: capa.assunto_principal_normalizado?.nome ?? capa.assunto ?? '-',
            ultima_movimentacao: latestText || latestDate || '-',
            data_ultima_movimentacao: latestDate,
            ultima_movimentacao_texto: latestText,
            updated_at: processedAt,
          })
          .eq('id', processo.id)
          .eq('tenant_id', processo.tenant_id)

        await persistMovementIfNew({
          tenantId: processo.tenant_id,
          numeroCnj: item.numero_cnj,
          movement: latest,
        })

        itemSucceeded = true
      }

      await adminSupabase
        .from('process_update_queue')
        .update({
          status: itemSucceeded ? 'CONCLUIDO' : 'ERRO',
          processed_at: processedAt,
          payload: mergeQueuePayload(item.payload, {
            status: itemSucceeded ? 'ok' : 'error',
            error: itemSucceeded ? null : itemError || 'unknown_error',
            processed_at: processedAt,
          }),
        })
        .eq('id', item.id)

      if (itemSucceeded) processed++
      else failed++

      await recordUpdateAgentEvent({
        tenantId: item.tenant_id,
        eventName: 'process_update_queue_processed',
        status: itemSucceeded ? 'completed' : 'failed',
        numeroCnj: item.numero_cnj,
        queueId: item.id,
        error: itemSucceeded ? null : itemError || 'unknown_error',
        processedAt,
        metadata: {
          evento: item.evento ?? null,
          auth_method: auth.method,
        },
      })
    } catch (error) {
      failed++
      console.error('[UPDATE_AGENT] Erro:', error)
      await adminSupabase
        .from('process_update_queue')
        .update({
          status: 'ERRO',
          processed_at: processedAt,
          payload: mergeQueuePayload(item.payload, {
            status: 'error',
            error: error instanceof Error ? error.message.slice(0, 300) : 'unknown_error',
            processed_at: processedAt,
          }),
        })
        .eq('id', item.id)

      await recordUpdateAgentEvent({
        tenantId: item.tenant_id,
        eventName: 'process_update_queue_processed',
        status: 'failed',
        numeroCnj: item.numero_cnj,
        queueId: item.id,
        error: error instanceof Error ? error.message.slice(0, 300) : 'unknown_error',
        processedAt,
        metadata: {
          evento: item.evento ?? null,
          auth_method: auth.method,
        },
      })
    }
  }

  return NextResponse.json({ ok: true, picked: fila.length, processed, failed, limit })
}
