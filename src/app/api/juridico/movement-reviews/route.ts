import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isBrainExecutiveRole } from '@/lib/brain/roles'
import {
  buildProcessCardClientName,
  buildProcessCardDescription,
  buildProcessCardTitle,
} from '@/lib/juridico/process-card-context'
import {
  chooseSemanticLegalStage,
  resolveProcessPipelineContext,
} from '@/lib/juridico/process-pipeline-resolver'
import { supabaseAdmin } from '@/lib/supabase/admin'

type AuthResult =
  | { error: NextResponse }
  | { userId: string; tenantId: string; role: string }

type ReviewPayload = {
  numero_cnj?: string | null
  processo_id?: string | null
  process_movimentacao_id?: string | null
  escavador_movimentacao_id?: string | null
  tipo_evento?: string | null
  acao_sugerida?: string | null
  prazo_extraido_dias?: number | null
  data_vencimento_extraida?: string | null
  confianca_analise?: string | null
  origem?: string | null
  motivo?: string | null
  evidencia?: string | null
}

type ReviewOverrides = {
  acao_sugerida?: string | null
  data_vencimento_extraida?: string | null
}

type ReviewDecision = 'approved' | 'ignored'

async function authenticateExecutive(): Promise<AuthResult> {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { user }, error } = await authClient.auth.getUser()
  if (error || !user) return { error: NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 }) }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single()

  if (!profile?.tenant_id || !profile?.role) {
    return { error: NextResponse.json({ error: 'Perfil nao encontrado.' }, { status: 403 }) }
  }

  if (!isBrainExecutiveRole(profile.role)) {
    return { error: NextResponse.json({ error: 'Apenas perfis executivos podem revisar movimentacoes juridicas.' }, { status: 403 }) }
  }

  return { userId: user.id, tenantId: profile.tenant_id, role: profile.role }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizePayload(value: unknown): ReviewPayload {
  return isRecord(value) ? value as ReviewPayload : {}
}

function parseDueDate(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function optionalText(value: unknown) {
  const raw = typeof value === 'string' ? value.trim() : ''
  return raw || null
}

function parseReviewOverrides(body: Record<string, unknown>): ReviewOverrides {
  const overrides: ReviewOverrides = {}

  if (Object.prototype.hasOwnProperty.call(body, 'acao_sugerida')) {
    overrides.acao_sugerida = optionalText(body.acao_sugerida)
  }

  if (Object.prototype.hasOwnProperty.call(body, 'data_vencimento_extraida')) {
    overrides.data_vencimento_extraida = optionalText(body.data_vencimento_extraida)
  }

  return overrides
}

function serializeReviewOverrides(overrides?: ReviewOverrides) {
  const payload: Record<string, string | null> = {}
  if (!overrides) return null

  if (overrides.acao_sugerida !== undefined) payload.acao_sugerida = optionalText(overrides.acao_sugerida)
  if (overrides.data_vencimento_extraida !== undefined) payload.data_vencimento_extraida = optionalText(overrides.data_vencimento_extraida)

  return Object.keys(payload).length > 0 ? payload : null
}

function resolveReviewedAction(payload: ReviewPayload, movement: any, overrides?: ReviewOverrides) {
  if (overrides?.acao_sugerida !== undefined) {
    const reviewedAction = optionalText(overrides.acao_sugerida)
    if (!reviewedAction) throw new Error('Acao revisada e obrigatoria para aprovar esta movimentacao.')
    return reviewedAction
  }

  return String(payload.acao_sugerida || movement?.acao_sugerida || 'Revisar movimentacao processual').trim()
}

function resolveReviewedDueDate(payload: ReviewPayload, movement: any, overrides?: ReviewOverrides) {
  const overrideProvided = overrides?.data_vencimento_extraida !== undefined
  const raw = overrideProvided
    ? overrides?.data_vencimento_extraida
    : payload.data_vencimento_extraida || movement?.data_vencimento_extraida
  const parsed = parseDueDate(raw)

  if (overrideProvided && String(raw || '').trim() && !parsed) {
    throw new Error('Data de vencimento revisada invalida.')
  }

  return parsed
}

function movementContent(movement: any, payload: ReviewPayload) {
  return String(movement?.conteudo || payload.evidencia || payload.motivo || '').trim()
}

function isProcessingReviewStatus(status: unknown) {
  return status === 'approved_processing' || status === 'ignored_processing'
}

function movementTimelineKey(entry: any) {
  const escavadorId = String(entry?.escavador_movimentacao_id || '').trim()
  if (escavadorId) return `escavador:${escavadorId}`

  const data = String(entry?.data || '').trim()
  const tipo = String(entry?.tipo_evento || '').trim()
  const conteudo = String(entry?.conteudo || '').trim().slice(0, 500)
  if (!data && !tipo && !conteudo) return null
  return `raw:${data}:${tipo}:${conteudo}`
}

function prependUniqueMovementEntry(timeline: any[], entry: any) {
  const nextKey = movementTimelineKey(entry)
  const deduped = nextKey
    ? timeline.filter((item) => movementTimelineKey(item) !== nextKey)
    : timeline
  return [entry, ...deduped].slice(0, 50)
}

async function loadReview(params: { tenantId: string; reviewId: string }) {
  const { data, error } = await supabaseAdmin
    .from('system_event_logs')
    .select('id, tenant_id, status, payload, created_at')
    .eq('id', params.reviewId)
    .eq('tenant_id', params.tenantId)
    .eq('event_name', 'legal_movement_review_required')
    .maybeSingle()

  if (error) throw error
  return data || null
}

async function loadReviewContext(tenantId: string, payload: ReviewPayload) {
  const [movementRes, processRes] = await Promise.all([
    payload.process_movimentacao_id
      ? supabaseAdmin
          .from('process_movimentacoes')
          .select('id, numero_cnj, data, conteudo, tipo_evento, acao_sugerida, prazo_extraido_dias, data_vencimento_extraida, confianca_analise, analise_json, escavador_movimentacao_id, created_at')
          .eq('tenant_id', tenantId)
          .eq('id', payload.process_movimentacao_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    payload.processo_id
      ? supabaseAdmin
          .from('monitored_processes')
          .select('id, tenant_id, numero_processo, resumo_curto, cliente_nome, tribunal, partes, advogado_responsavel_id, linked_task_id, classe_processual')
          .eq('tenant_id', tenantId)
          .eq('id', payload.processo_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (movementRes.error) throw movementRes.error
  if (processRes.error) throw processRes.error
  return { movement: movementRes.data, process: processRes.data }
}

async function listPendingReviews(tenantId: string) {
  const { data: reviews, error } = await supabaseAdmin
    .from('system_event_logs')
    .select('id, status, payload, created_at')
    .eq('tenant_id', tenantId)
    .eq('event_name', 'legal_movement_review_required')
    .eq('status', 'review_required')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) throw error

  const items = []
  for (const review of reviews || []) {
    const payload = normalizePayload(review.payload)
    const { movement, process } = await loadReviewContext(tenantId, payload)
    const analysis = normalizePayload(movement?.analise_json)
    items.push({
      id: review.id,
      created_at: review.created_at,
      status: review.status,
      numero_cnj: payload.numero_cnj || movement?.numero_cnj || process?.numero_processo || null,
      processo_id: payload.processo_id || process?.id || null,
      process_movimentacao_id: payload.process_movimentacao_id || movement?.id || null,
      tipo_evento: payload.tipo_evento || movement?.tipo_evento || null,
      acao_sugerida: payload.acao_sugerida || movement?.acao_sugerida || null,
      data_vencimento_extraida: payload.data_vencimento_extraida || movement?.data_vencimento_extraida || null,
      confianca_analise: payload.confianca_analise || movement?.confianca_analise || null,
      origem: payload.origem || analysis.origem || null,
      motivo: payload.motivo || String(analysis.motivo || ''),
      evidencia: payload.evidencia || String(analysis.evidencia || ''),
      movimentacao_data: movement?.data || null,
      movimentacao_conteudo: movementContent(movement, payload),
      cliente_nome: process?.cliente_nome || null,
      tribunal: process?.tribunal || null,
    })
  }

  return items
}

async function listStuckReviews(tenantId: string) {
  const { data: reviews, error } = await supabaseAdmin
    .from('system_event_logs')
    .select('id, status, payload, created_at')
    .eq('tenant_id', tenantId)
    .eq('event_name', 'legal_movement_review_required')
    .in('status', ['approved_processing', 'ignored_processing'])
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) throw error

  const items = []
  for (const review of reviews || []) {
    const payload = normalizePayload(review.payload)
    const { movement, process } = await loadReviewContext(tenantId, payload)
    const analysis = normalizePayload(movement?.analise_json)
    items.push({
      id: review.id,
      created_at: review.created_at,
      status: review.status,
      numero_cnj: payload.numero_cnj || movement?.numero_cnj || process?.numero_processo || null,
      processo_id: payload.processo_id || process?.id || null,
      process_movimentacao_id: payload.process_movimentacao_id || movement?.id || null,
      tipo_evento: payload.tipo_evento || movement?.tipo_evento || null,
      acao_sugerida: payload.acao_sugerida || movement?.acao_sugerida || null,
      data_vencimento_extraida: payload.data_vencimento_extraida || movement?.data_vencimento_extraida || null,
      confianca_analise: payload.confianca_analise || movement?.confianca_analise || null,
      origem: payload.origem || analysis.origem || null,
      motivo: payload.motivo || String(analysis.motivo || ''),
      evidencia: payload.evidencia || String(analysis.evidencia || ''),
      movimentacao_data: movement?.data || null,
      movimentacao_conteudo: movementContent(movement, payload),
      cliente_nome: process?.cliente_nome || null,
      tribunal: process?.tribunal || null,
      review_error: isRecord(review.payload) && typeof review.payload.review_error === 'string' ? review.payload.review_error : null,
      review_note: isRecord(review.payload) && typeof review.payload.review_note === 'string' ? review.payload.review_note : null,
    })
  }

  return items
}

async function createOrUpdateProcessCard(params: {
  tenantId: string
  process: any
  movement: any
  payload: ReviewPayload
  dueDateIso: string
  reviewerId: string
}) {
  const numeroCnj = String(params.payload.numero_cnj || params.process?.numero_processo || params.movement?.numero_cnj || '')
  if (!numeroCnj) return null

  const descricao = String(params.payload.acao_sugerida || params.movement?.acao_sugerida || 'Revisar movimentacao processual').trim()
  const tipoEvento = String(params.payload.tipo_evento || params.movement?.tipo_evento || 'PRAZO')
  const pipelineContext = await resolveProcessPipelineContext({
    supabase: supabaseAdmin,
    tenantId: params.tenantId,
    linkedTaskId: params.process?.linked_task_id,
    processNumber: numeroCnj,
  })
  const pipelineId = pipelineContext.pipelineId
  const stageId = chooseSemanticLegalStage(pipelineContext.visibleStages, [descricao, tipoEvento, params.movement?.conteudo || '']) || pipelineContext.fallbackStageId
  if (!pipelineId || !stageId) {
    throw new Error('Pipeline juridica nao encontrada para criar card; configure uma pipeline juridica antes de aprovar esta revisao.')
  }

  const movementEntry = {
    data: params.movement?.data || new Date().toISOString().slice(0, 10),
    conteudo: params.movement?.conteudo || '',
    tipo_evento: tipoEvento,
    escavador_movimentacao_id: params.payload.escavador_movimentacao_id || params.movement?.escavador_movimentacao_id || null,
    revisado_por_humano: true,
    revisado_em: new Date().toISOString(),
  }

  const { data: existingCards, error: existingCardsError } = await supabaseAdmin
    .from('process_tasks')
    .select('id, client_name, description, movimentacoes_timeline')
    .eq('tenant_id', params.tenantId)
    .eq('processo_1grau', numeroCnj)
    .eq('pipeline_id', pipelineId)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (existingCardsError) throw new Error(`Falha ao buscar card processual existente: ${existingCardsError.message}`)

  const existing = existingCards?.[0] || null
  if (existing?.id) {
    const timeline = Array.isArray(existing.movimentacoes_timeline) ? existing.movimentacoes_timeline : []
    const { data: updatedCard, error: updateCardError } = await supabaseAdmin
      .from('process_tasks')
      .update({
        stage_id: stageId,
        andamento_1grau: descricao,
        prazo_fatal: params.dueDateIso,
        movimentacoes_timeline: prependUniqueMovementEntry(timeline, movementEntry),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .eq('tenant_id', params.tenantId)
      .select('id')
      .maybeSingle()
    if (updateCardError) throw new Error(`Falha ao atualizar card processual: ${updateCardError.message}`)
    if (!updatedCard?.id) throw new Error('Card processual nao encontrado para atualizacao neste tenant.')
    return existing.id as string
  }

  const { count, error: countError } = await supabaseAdmin
    .from('process_tasks')
    .select('*', { count: 'exact', head: true })
    .eq('stage_id', stageId)
    .eq('tenant_id', params.tenantId)
  if (countError) throw new Error(`Falha ao calcular posicao do card processual: ${countError.message}`)

  const cardProcess = { ...(params.process || {}), numero_processo: numeroCnj }
  const { data: created, error: createCardError } = await supabaseAdmin.from('process_tasks').insert({
    tenant_id: params.tenantId,
    pipeline_id: pipelineId,
    stage_id: stageId,
    title: buildProcessCardTitle(cardProcess),
    description: buildProcessCardDescription({ processo: cardProcess, resumoCurto: params.process?.resumo_curto, proximaAcao: descricao }),
    client_name: buildProcessCardClientName(params.process || {}),
    processo_1grau: numeroCnj,
    andamento_1grau: descricao,
    prazo_fatal: params.dueDateIso,
    movimentacoes_timeline: [movementEntry],
    assigned_to: params.process?.advogado_responsavel_id || params.reviewerId,
    escavador_movimentacao_id: params.payload.escavador_movimentacao_id || params.movement?.escavador_movimentacao_id || null,
    tags: [tipoEvento, 'revisado_humano'],
    position_index: count ?? 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select('id').single()
  if (createCardError) throw new Error(`Falha ao criar card processual: ${createCardError.message}`)

  if (created?.id && params.process?.id) {
    const { error: linkError } = await supabaseAdmin
      .from('monitored_processes')
      .update({ linked_task_id: created.id })
      .eq('id', params.process.id)
      .eq('tenant_id', params.tenantId)
    if (linkError) throw new Error(`Falha ao vincular card ao processo monitorado: ${linkError.message}`)
  }

  return created?.id || null
}

async function approveReview(params: { tenantId: string; userId: string; review: any; note?: string | null; overrides?: ReviewOverrides }) {
  const payload = normalizePayload(params.review.payload)
  const { movement, process } = await loadReviewContext(params.tenantId, payload)
  const tipoEvento = String(payload.tipo_evento || movement?.tipo_evento || '')
  const dueDateIso = resolveReviewedDueDate(payload, movement, params.overrides)
  const descricao = resolveReviewedAction(payload, movement, params.overrides)
  const reviewedPayload: ReviewPayload = {
    ...payload,
    tipo_evento: tipoEvento,
    acao_sugerida: descricao,
    data_vencimento_extraida: dueDateIso,
  }

  if (!process?.id) throw new Error('Processo monitorado nao encontrado para esta revisao.')
  if (tipoEvento === 'ARQUIVAMENTO' || tipoEvento === 'EXTINCAO') {
    throw new Error('Encerramento/arquivamento ainda exige acao manual no beta.')
  }
  if (!dueDateIso) throw new Error('Esta movimentacao nao tem vencimento confiavel para aprovacao automatica.')

  const taskId = await createOrUpdateProcessCard({
    tenantId: params.tenantId,
    process,
    movement,
    payload: reviewedPayload,
    dueDateIso,
    reviewerId: params.userId,
  })
  const escavadorMovimentacaoId = payload.escavador_movimentacao_id || movement?.escavador_movimentacao_id || null

  const { error: prazoError } = await supabaseAdmin.from('process_prazos').upsert({
    tenant_id: params.tenantId,
    monitored_process_id: process.id,
    process_task_id: taskId,
    tipo: tipoEvento === 'AUDIENCIA' ? 'audiencia' : 'prazo',
    descricao,
    data_vencimento: dueDateIso,
    status: 'pendente',
    responsavel_id: process.advogado_responsavel_id || params.userId,
    escavador_movimentacao_id: escavadorMovimentacaoId,
    prioridade: 'media',
    criado_por_ia: true,
    created_at: new Date().toISOString(),
  }, {
    onConflict: escavadorMovimentacaoId
      ? 'monitored_process_id,escavador_movimentacao_id'
      : 'monitored_process_id,tipo,descricao,data_vencimento',
    ignoreDuplicates: true,
  })
  if (prazoError) throw new Error(`Falha ao registrar prazo processual: ${prazoError.message}`)

  if (movement?.id) {
    const analysis = normalizePayload(movement.analise_json)
    const { error: movementUpdateError } = await supabaseAdmin.from('process_movimentacoes').update({
      analise_json: {
        ...analysis,
        review_status: 'approved',
        reviewed_by: params.userId,
        reviewed_at: new Date().toISOString(),
        review_note: params.note || null,
        reviewed_action: descricao,
        reviewed_due_date: dueDateIso,
        process_task_id: taskId,
      },
    })
      .eq('id', movement.id)
      .eq('tenant_id', params.tenantId)
    if (movementUpdateError) throw new Error(`Falha ao atualizar movimentacao revisada: ${movementUpdateError.message}`)
  }

  return {
    taskId,
    prazoCreated: true,
    reviewed_payload: {
      tipo_evento: tipoEvento,
      acao_sugerida: descricao,
      data_vencimento_extraida: dueDateIso,
    },
  }
}

async function decideReview(params: {
  tenantId: string
  userId: string
  reviewId: string
  decision: ReviewDecision
  note?: string | null
  overrides?: ReviewOverrides
}) {
  const review = await loadReview({ tenantId: params.tenantId, reviewId: params.reviewId })
  if (!review) throw new Error('Revisao nao encontrada.')
  if (review.status !== 'review_required') throw new Error('Esta revisao ja foi processada.')

  const reviewOverrides = serializeReviewOverrides(params.overrides)

  const reservedPayload = {
    ...(normalizePayload(review.payload) as Record<string, unknown>),
    review_decision: params.decision,
    reviewed_by: params.userId,
    reviewed_at: new Date().toISOString(),
    review_note: params.note || null,
    ...(reviewOverrides ? { review_overrides: reviewOverrides } : {}),
  }

  const { data: reserved, error: reserveError } = await supabaseAdmin
    .from('system_event_logs')
    .update({ status: `${params.decision}_processing`, payload: reservedPayload })
    .eq('id', review.id)
    .eq('tenant_id', params.tenantId)
    .eq('status', 'review_required')
    .select('id')
    .maybeSingle()

  if (reserveError) throw reserveError
  if (!reserved?.id) throw new Error('Esta revisao ja foi processada por outro usuario.')

  let actionResult: Record<string, unknown>
  try {
    actionResult = params.decision === 'approved'
      ? await approveReview({ tenantId: params.tenantId, userId: params.userId, review, note: params.note, overrides: params.overrides })
      : { ignored: true }
  } catch (error: any) {
    const { error: restoreError } = await supabaseAdmin
      .from('system_event_logs')
      .update({
        status: 'review_required',
        payload: {
          ...reservedPayload,
          review_decision: null,
          review_error: error?.message || 'Falha ao executar revisao juridica.',
        },
      })
      .eq('id', review.id)
      .eq('tenant_id', params.tenantId)
      .eq('status', `${params.decision}_processing`)
    if (restoreError) console.error('[juridico/movement-reviews] Falha ao restaurar revisao:', restoreError.message)
    throw error
  }

  const reviewedPayload = isRecord(actionResult.reviewed_payload) ? actionResult.reviewed_payload : {}

  const nextPayload = {
    ...(normalizePayload(review.payload) as Record<string, unknown>),
    ...reviewedPayload,
    review_decision: params.decision,
    reviewed_by: params.userId,
    reviewed_at: new Date().toISOString(),
    review_note: params.note || null,
    ...(reviewOverrides ? { review_overrides: reviewOverrides } : {}),
    action_result: actionResult,
  }

  const { data: finalized, error: finalUpdateError } = await supabaseAdmin
    .from('system_event_logs')
    .update({ status: params.decision, payload: nextPayload })
    .eq('id', review.id)
    .eq('status', `${params.decision}_processing`)
    .eq('tenant_id', params.tenantId)
    .select('id')
    .maybeSingle()
  if (finalUpdateError) throw finalUpdateError
  if (!finalized?.id) throw new Error('Falha ao finalizar revisao juridica; status intermediario nao encontrado.')

  const { error: auditError } = await supabaseAdmin.from('system_event_logs').insert({
    tenant_id: params.tenantId,
    user_id: params.userId,
    source: 'juridico',
    provider: 'mayus',
    event_name: `legal_movement_review_${params.decision}`,
    status: params.decision,
    payload: nextPayload,
    created_at: new Date().toISOString(),
  })
  if (auditError) throw auditError

  return actionResult
}

async function recoverReview(params: {
  tenantId: string
  userId: string
  reviewId: string
  note: string
}) {
  const review = await loadReview({ tenantId: params.tenantId, reviewId: params.reviewId })
  if (!review) throw new Error('Revisao nao encontrada.')
  if (!isProcessingReviewStatus(review.status)) throw new Error('Apenas revisoes em processamento podem ser recuperadas.')

  const now = new Date().toISOString()
  const nextPayload = {
    ...(normalizePayload(review.payload) as Record<string, unknown>),
    review_decision: null,
    recovered_by: params.userId,
    recovered_at: now,
    recovery_note: params.note,
    previous_status: review.status,
    review_error: 'Revisao recuperada manualmente para nova decisao humana.',
  }

  const { data: recovered, error: recoverError } = await supabaseAdmin
    .from('system_event_logs')
    .update({ status: 'review_required', payload: nextPayload })
    .eq('id', review.id)
    .eq('tenant_id', params.tenantId)
    .in('status', ['approved_processing', 'ignored_processing'])
    .select('id')
    .maybeSingle()

  if (recoverError) throw recoverError
  if (!recovered?.id) throw new Error('Esta revisao nao esta mais em processamento.')

  const { error: auditError } = await supabaseAdmin.from('system_event_logs').insert({
    tenant_id: params.tenantId,
    user_id: params.userId,
    source: 'juridico',
    provider: 'mayus',
    event_name: 'legal_movement_review_recovered',
    status: 'review_required',
    payload: nextPayload,
    created_at: now,
  })
  if (auditError) throw auditError

  return { recovered: true }
}

export async function GET() {
  const auth = await authenticateExecutive()
  if ('error' in auth) return auth.error

  try {
    const [reviews, stuckReviews] = await Promise.all([
      listPendingReviews(auth.tenantId),
      listStuckReviews(auth.tenantId),
    ])
    return NextResponse.json({ ok: true, reviews, stuck_reviews: stuckReviews })
  } catch (error: any) {
    console.error('[juridico/movement-reviews]', error?.message || error)
    return NextResponse.json({ error: 'Nao foi possivel carregar revisoes juridicas.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await authenticateExecutive()
  if ('error' in auth) return auth.error

  const rawBody = await req.json().catch(() => ({}))
  const body = isRecord(rawBody) ? rawBody : {}
  const reviewId = typeof body.review_id === 'string' ? body.review_id : ''
  const decision = body.decision
  const note = typeof body.note === 'string' ? body.note : null
  const overrides = parseReviewOverrides(body)

  if (!reviewId || (decision !== 'approved' && decision !== 'ignored' && decision !== 'recover')) {
    return NextResponse.json({ error: 'review_id e decision approved/ignored/recover sao obrigatorios.' }, { status: 400 })
  }

  if (decision === 'recover' && !optionalText(note)) {
    return NextResponse.json({ error: 'note e obrigatoria para recuperar revisao travada.' }, { status: 400 })
  }

  try {
    if (decision === 'recover') {
      const result = await recoverReview({
        tenantId: auth.tenantId,
        userId: auth.userId,
        reviewId,
        note: optionalText(note)!,
      })
      return NextResponse.json({ ok: true, result })
    }

    const result = await decideReview({
      tenantId: auth.tenantId,
      userId: auth.userId,
      reviewId,
      decision: decision as ReviewDecision,
      note,
      overrides,
    })
    return NextResponse.json({ ok: true, result })
  } catch (error: any) {
    const message = error?.message || 'Nao foi possivel processar revisao juridica.'
    const status = message.includes('Pipeline juridica')
      ? 422
      : message.includes('Revisao nao encontrada')
      ? 404
      : message.includes('outro usuario') || message.includes('ja foi processada')
        ? 409
        : message.includes('manual') || message.includes('vencimento') || message.includes('Acao revisada')
          ? 422
          : 500
    return NextResponse.json({ error: message }, { status })
  }
}
