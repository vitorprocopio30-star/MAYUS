import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { escavadorFetch } from '@/lib/services/escavador-client'
import { requireTenantApiKey } from '@/lib/integrations/server'

export const maxDuration = 60

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEFAULT_BATCH_SIZE = 10
const MAX_BATCH_SIZE = 25
const MAX_RETRY_ATTEMPTS = 3
const LOCK_SECONDS = 90

type QueueItem = {
  id: string
  numero_cnj: string
  tenant_id?: string | null
  payload?: unknown
  evento?: string | null
  created_at?: string | null
  attempt_count?: number | null
  claimed_via_rpc?: boolean
}

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

function updateAgentPayload(payload: unknown) {
  const record = isRecord(payload) ? payload : {}
  return isRecord(record.update_agent) ? record.update_agent : {}
}

function retryCount(payload: unknown) {
  const raw = updateAgentPayload(payload).retry_count
  const parsed = typeof raw === 'number' ? raw : Number(raw || 0)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0
}

function errorMessage(error: unknown) {
  if (!error || typeof error !== 'object') return ''
  return String((error as { message?: unknown }).message || '')
}

function errorCode(error: unknown) {
  if (!error || typeof error !== 'object') return ''
  return String((error as { code?: unknown }).code || '')
}

function isMissingQueueLeaseSchema(error: unknown) {
  const message = errorMessage(error).toLowerCase()
  const code = errorCode(error)
  return code === '42703'
    || code === '42883'
    || code === 'PGRST202'
    || message.includes('claim_process_update_queue_batch')
    || message.includes('attempt_count')
    || message.includes('locked_at')
    || message.includes('lock_expires_at')
    || message.includes('next_retry_at')
    || message.includes('dead_lettered_at')
}

function currentAttempt(item: QueueItem, fallbackAttempt?: number | null) {
  const formalAttempt = Number(item.attempt_count || 0)
  if (Number.isFinite(formalAttempt) && formalAttempt > 0) return Math.trunc(formalAttempt)
  if (fallbackAttempt && Number.isFinite(fallbackAttempt) && fallbackAttempt > 0) return Math.trunc(fallbackAttempt)
  return retryCount(item.payload)
}

function isRetryableQueueError(error: string | null) {
  return error === 'escavador_fetch_failed' || error === 'unknown_error'
}

async function claimQueueItem(params: {
  id: string
  payload: unknown
  authMethod: string | null
}) {
  const claimedAt = new Date().toISOString()
  const attempt = retryCount(params.payload) + 1
  const { data, error } = await adminSupabase
    .from('process_update_queue')
    .update({
      status: 'PROCESSANDO',
      payload: mergeQueuePayload(params.payload, {
        status: 'processing',
        retry_count: attempt,
        lock_acquired_at: claimedAt,
        auth_method: params.authMethod,
      }),
    })
    .eq('id', params.id)
    .eq('status', 'PENDENTE')
    .select('id')
    .maybeSingle()

  if (error) throw error
  return data?.id ? attempt : null
}

function queueFailurePatch(params: {
  attempt: number
  error: string
  processedAt: string
}) {
  const retryable = isRetryableQueueError(params.error) && params.attempt < MAX_RETRY_ATTEMPTS
  const nextRetryAfter = retryable ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null
  return {
    nextStatus: retryable ? 'PENDENTE' : 'ERRO',
    eventStatus: retryable ? 'retry_scheduled' : 'failed',
    nextRetryAfter,
    patch: {
      status: retryable ? 'retry_scheduled' : 'error',
      error: params.error,
      retry_count: params.attempt,
      retryable,
      dead_letter: !retryable,
      processed_at: params.processedAt,
      next_retry_after: nextRetryAfter,
    },
  }
}

async function loadQueueBatch(params: {
  limit: number
  workerId: string
}) {
  const rpcResult = await adminSupabase.rpc('claim_process_update_queue_batch', {
    p_limit: params.limit,
    p_worker_id: params.workerId,
    p_lock_seconds: LOCK_SECONDS,
  })

  if (!rpcResult.error) {
    return {
      data: ((rpcResult.data || []) as QueueItem[]).map((item) => ({
        ...item,
        claimed_via_rpc: true,
      })),
      error: null,
      source: 'rpc' as const,
    }
  }

  if (!isMissingQueueLeaseSchema(rpcResult.error)) {
    return { data: [] as QueueItem[], error: rpcResult.error, source: 'rpc' as const }
  }

  const legacyResult = await adminSupabase
    .from('process_update_queue')
    .select('id, numero_cnj, tenant_id, payload, evento, created_at')
    .eq('status', 'PENDENTE')
    .order('created_at', { ascending: true })
    .limit(params.limit)

  return {
    data: ((legacyResult.data || []) as QueueItem[]).map((item) => ({
      ...item,
      claimed_via_rpc: false,
    })),
    error: legacyResult.error,
    source: 'legacy' as const,
  }
}

async function updateQueueItem(params: {
  item: QueueItem
  status: 'CONCLUIDO' | 'PENDENTE' | 'ERRO'
  processedAt: string | null
  payload: Record<string, unknown>
  formalLease: boolean
  attempt: number
  error: string | null
  nextRetryAfter?: string | null
  deadLetter?: boolean
}) {
  const baseUpdate: Record<string, unknown> = {
    status: params.status,
    processed_at: params.processedAt,
    payload: params.payload,
  }

  const formalUpdate = params.formalLease
    ? {
        ...baseUpdate,
        locked_at: null,
        lock_expires_at: null,
        locked_by: null,
        next_retry_at: params.nextRetryAfter ?? null,
        last_error: params.error,
        dead_lettered_at: params.deadLetter ? params.processedAt : null,
        attempt_count: params.attempt,
      }
    : baseUpdate

  const result = await adminSupabase
    .from('process_update_queue')
    .update(formalUpdate)
    .eq('id', params.item.id)

  if (!result.error || !params.formalLease || !isMissingQueueLeaseSchema(result.error)) {
    return result
  }

  return adminSupabase
    .from('process_update_queue')
    .update(baseUpdate)
    .eq('id', params.item.id)
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
  const workerId = `process-update-${randomUUID()}`
  const { data: fila, error: filaError, source: claimSource } = await loadQueueBatch({ limit, workerId })

  if (filaError) {
    return NextResponse.json({ ok: false, error: filaError.message }, { status: 500 })
  }

  if (!fila?.length) return NextResponse.json({ ok: true, picked: 0, processed: 0, failed: 0, skipped: 0, limit, claim_source: claimSource })

  let processed = 0
  let failed = 0
  let skipped = 0

  for (const item of fila) {
    const processedAt = new Date().toISOString()
    let itemSucceeded = false
    let itemError: string | null = null
    let attempt = currentAttempt(item)

    try {
      if (!item.claimed_via_rpc) {
        const claimedAttempt = await claimQueueItem({
          id: item.id,
          payload: item.payload,
          authMethod: auth.method,
        })

        if (!claimedAttempt) {
          skipped++
          continue
        }
        attempt = claimedAttempt
      }

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

      const failure = itemSucceeded
        ? null
        : queueFailurePatch({
            attempt,
            error: itemError || 'unknown_error',
            processedAt,
          })

      const updateResult = await updateQueueItem({
        item,
        formalLease: item.claimed_via_rpc === true,
        status: itemSucceeded ? 'CONCLUIDO' : (failure!.nextStatus as 'PENDENTE' | 'ERRO'),
        processedAt: itemSucceeded || failure!.nextStatus === 'ERRO' ? processedAt : null,
        attempt,
        error: itemSucceeded ? null : itemError || 'unknown_error',
        nextRetryAfter: failure?.nextRetryAfter ?? null,
        deadLetter: failure ? failure.nextStatus === 'ERRO' : false,
        payload: mergeQueuePayload(item.payload, itemSucceeded
          ? {
              status: 'ok',
              error: null,
              retry_count: attempt,
              dead_letter: false,
              processed_at: processedAt,
              claim_source: claimSource,
              worker_id: workerId,
            }
          : failure!.patch),
      })
      if (updateResult.error) throw new Error(updateResult.error.message)

      if (itemSucceeded) processed++
      else failed++

      await recordUpdateAgentEvent({
        tenantId: item.tenant_id,
        eventName: 'process_update_queue_processed',
        status: itemSucceeded ? 'completed' : failure!.eventStatus,
        numeroCnj: item.numero_cnj,
        queueId: item.id,
        error: itemSucceeded ? null : itemError || 'unknown_error',
        processedAt,
        metadata: {
          evento: item.evento ?? null,
          auth_method: auth.method,
          claim_source: claimSource,
          worker_id: workerId,
          attempt,
        },
      })
    } catch (error) {
      failed++
      console.error('[UPDATE_AGENT] Erro:', error)
      const errorMessage = error instanceof Error ? error.message.slice(0, 300) : 'unknown_error'
      const failure = queueFailurePatch({
        attempt: Math.max(1, attempt || retryCount(item.payload) + 1),
        error: errorMessage,
        processedAt,
      })

      const updateResult = await updateQueueItem({
        item,
        formalLease: item.claimed_via_rpc === true,
        status: failure.nextStatus as 'PENDENTE' | 'ERRO',
        processedAt: failure.nextStatus === 'ERRO' ? processedAt : null,
        payload: mergeQueuePayload(item.payload, failure.patch),
        attempt: failure.patch.retry_count as number,
        error: errorMessage,
        nextRetryAfter: failure.nextRetryAfter,
        deadLetter: failure.nextStatus === 'ERRO',
      })
      if (updateResult.error) console.warn('[UPDATE_AGENT] Falha ao atualizar item com erro.', updateResult.error.message)

      await recordUpdateAgentEvent({
        tenantId: item.tenant_id,
        eventName: 'process_update_queue_processed',
        status: failure.eventStatus,
        numeroCnj: item.numero_cnj,
        queueId: item.id,
        error: errorMessage,
        processedAt,
        metadata: {
          evento: item.evento ?? null,
          auth_method: auth.method,
          claim_source: claimSource,
          worker_id: workerId,
          attempt: failure.patch.retry_count,
        },
      })
    }
  }

  return NextResponse.json({ ok: true, picked: fila.length, processed, failed, skipped, limit, claim_source: claimSource })
}
