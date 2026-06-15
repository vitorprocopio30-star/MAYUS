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
import { upsertMovementAnalysisContract } from '@/lib/juridico/movement-analysis-contract'
import { prepareProactiveMovementDraft } from '@/lib/lex/proactive-movement-draft'
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
  confidence?: string | null
  origem?: string | null
  motivo?: string | null
  polo_representado?: string | null
  obrigacao_de_quem?: string | null
  confidence_reason?: string | null
  evidencia?: string | null
  review_required?: boolean | null
  agentic_governance?: unknown
}

type AgenticGovernanceSummary = {
  openclaw: {
    surface: string | null
    outcome: string | null
    requires_approval: boolean | null
    can_execute_now: boolean | null
    reason: string | null
  }
  hermes: {
    status: string | null
    events_count: number
    last_event_type: string | null
    last_event_summary: string | null
  }
}

type ReviewSupervisionContext = {
  process_context: {
    numero_cnj: string | null
    cliente_nome: string | null
    tribunal: string | null
    tipo_evento: string | null
    acao_sugerida: string | null
    data_vencimento_extraida: string | null
    movimentacao_data: string | null
    movimentacao_conteudo: string | null
  }
  sources_used: string[]
  gaps: string[]
  blockers: string[]
  operational_thesis: string | null
  next_action_before_draft_factory: string | null
  openclaw_reason: string | null
}

type ReviewOverrides = {
  acao_sugerida?: string | null
  data_vencimento_extraida?: string | null
  polo_representado?: string | null
  obrigacao_de_quem?: string | null
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

function normalizedDutyValue(value: unknown) {
  return optionalText(value)?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') || null
}

function resolveReviewedDuty(payload: ReviewPayload, movement: any, overrides?: ReviewOverrides) {
  const movementAnalysis = normalizePayload(movement?.analise_json)
  return {
    polo: normalizedDutyValue(overrides?.polo_representado)
      || normalizedDutyValue(payload.polo_representado)
      || normalizedDutyValue(movementAnalysis.polo_representado)
      || normalizedDutyValue(movement?.polo_representado),
    duty: normalizedDutyValue(overrides?.obrigacao_de_quem)
      || normalizedDutyValue(payload.obrigacao_de_quem)
      || normalizedDutyValue(movementAnalysis.obrigacao_de_quem)
      || normalizedDutyValue(movement?.obrigacao_de_quem),
  }
}

function assertReviewedDutyAllowsTask(payload: ReviewPayload, movement: any, overrides?: ReviewOverrides) {
  const { polo, duty } = resolveReviewedDuty(payload, movement, overrides)

  if (polo !== 'autor' && polo !== 'reu') {
    throw new Error('Confirme o polo representado antes de aprovar a criacao de card e prazo.')
  }

  if (duty !== 'escritorio' && duty !== 'cliente') {
    throw new Error('Confirme que a obrigacao e do escritorio/cliente antes de aprovar a criacao de card e prazo.')
  }

  return { polo, duty }
}

function optionalSummaryText(value: unknown) {
  const raw = optionalText(value)
  return raw
    ? raw
        .replace(/(token|apikey|api_key|authorization|password|secret)[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
        .slice(0, 280)
    : null
}

function optionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => optionalSummaryText(item)).filter((item): item is string => Boolean(item))))
    : []
}

function summarizeOpenClawPolicy(policy: Record<string, unknown>) {
  const subject = isRecord(policy.subject) ? policy.subject : {}
  const surfaceMatrix = isRecord(policy.surface_matrix) ? policy.surface_matrix : {}
  const requiresApproval = optionalBoolean(policy.requires_approval)
  const canExecuteNow = optionalBoolean(policy.can_execute_now)
  const allowed = optionalBoolean(policy.allowed)
  const outcome = optionalSummaryText(policy.outcome)
    || (allowed === false ? 'blocked' : requiresApproval ? 'requires_approval' : canExecuteNow ? 'can_execute_now' : null)
  const reason = optionalSummaryText(policy.reason)
    || (requiresApproval
      ? 'Politica OpenClaw exige aprovacao humana para esta superficie.'
      : canExecuteNow
        ? 'Politica OpenClaw permite execucao nesta superficie.'
        : allowed === false
          ? 'Politica OpenClaw bloqueou esta acao.'
        : null)

  return {
    surface: optionalSummaryText(subject.surface) || optionalSummaryText(surfaceMatrix.surface),
    outcome,
    requires_approval: requiresApproval,
    can_execute_now: canExecuteNow,
    reason,
  }
}

function summarizeHermesTrajectory(trajectory: Record<string, unknown>) {
  const events = Array.isArray(trajectory.events) ? trajectory.events.filter(isRecord) : []
  const lastEvent = events.length > 0 ? events[events.length - 1] : null

  return {
    status: optionalSummaryText(trajectory.status),
    events_count: events.length,
    last_event_type: lastEvent ? optionalSummaryText(lastEvent.type) : null,
    last_event_summary: lastEvent ? optionalSummaryText(lastEvent.summary) : null,
  }
}

function summarizeAgenticGovernance(payload: ReviewPayload, analysis: ReviewPayload): AgenticGovernanceSummary | null {
  const governance = isRecord(payload.agentic_governance)
    ? payload.agentic_governance
    : isRecord(analysis.agentic_governance)
      ? analysis.agentic_governance
      : null

  if (!governance) return null

  const openclawPolicy = isRecord(governance.openclaw_policy) ? governance.openclaw_policy : {}
  const hermesTrajectory = isRecord(governance.hermes_trajectory) ? governance.hermes_trajectory : {}

  return {
    openclaw: summarizeOpenClawPolicy(openclawPolicy),
    hermes: summarizeHermesTrajectory(hermesTrajectory),
  }
}

function summarizeReviewSupervisionContext(params: {
  payload: ReviewPayload
  analysis: ReviewPayload
  movement: any
  process: any
  agenticGovernance: AgenticGovernanceSummary | null
}): ReviewSupervisionContext {
  const governance = isRecord(params.payload.agentic_governance)
    ? params.payload.agentic_governance
    : isRecord(params.analysis.agentic_governance)
      ? params.analysis.agentic_governance
      : {}
  const operationalThesis = isRecord(governance.operational_thesis)
    ? governance.operational_thesis
    : isRecord(governance.operationalThesis)
      ? governance.operationalThesis
      : null
  const processNumber = optionalSummaryText(params.payload.numero_cnj)
    || optionalSummaryText(params.movement?.numero_cnj)
    || optionalSummaryText(params.process?.numero_processo)
  const action = optionalSummaryText(params.payload.acao_sugerida)
    || optionalSummaryText(params.movement?.acao_sugerida)
  const eventType = optionalSummaryText(params.payload.tipo_evento)
    || optionalSummaryText(params.movement?.tipo_evento)
  const dueDate = optionalSummaryText(params.payload.data_vencimento_extraida)
    || optionalSummaryText(params.movement?.data_vencimento_extraida)

  const sourcesUsed = stringList((governance as Record<string, unknown>).sources_used_before_draft_factory)
    .concat(stringList((governance as Record<string, unknown>).sourcesUsedBeforeDraftFactory))
    .concat(stringList(isRecord((governance as Record<string, unknown>).sources) ? ((governance as Record<string, unknown>).sources as Record<string, unknown>).factual : null))
  const gaps = stringList((governance as Record<string, unknown>).gaps_before_draft_factory)
    .concat(stringList((governance as Record<string, unknown>).gapsBeforeDraftFactory))
    .concat(stringList(isRecord((governance as Record<string, unknown>).gaps) ? ((governance as Record<string, unknown>).gaps as Record<string, unknown>).all : null))
  const blockers = stringList((governance as Record<string, unknown>).blockers_before_draft_factory)
    .concat(stringList((governance as Record<string, unknown>).blockersBeforeDraftFactory))
    .concat(stringList((governance as Record<string, unknown>).blockers))

  return {
    process_context: {
      numero_cnj: processNumber,
      cliente_nome: optionalSummaryText(params.process?.cliente_nome),
      tribunal: optionalSummaryText(params.process?.tribunal),
      tipo_evento: eventType,
      acao_sugerida: action,
      data_vencimento_extraida: dueDate,
      movimentacao_data: optionalSummaryText(params.movement?.data),
      movimentacao_conteudo: optionalSummaryText(movementContent(params.movement, params.payload)),
    },
    sources_used: Array.from(new Set([
      ...sourcesUsed,
      params.movement?.id ? 'process_movimentacoes' : null,
      params.process?.id ? 'monitored_processes' : null,
      params.payload.agentic_governance || params.analysis.agentic_governance ? 'agentic_governance' : null,
    ].filter((item): item is string => Boolean(item)))),
    gaps: Array.from(new Set(gaps)),
    blockers: Array.from(new Set(blockers)),
    operational_thesis: optionalSummaryText(operationalThesis?.thesis)
      || (processNumber && action ? `Movimentacao ${eventType || 'juridica'} do processo ${processNumber} exige supervisao antes da Draft Factory: ${action}.` : null),
    next_action_before_draft_factory: optionalSummaryText(operationalThesis?.nextActionBeforeDraftFactory)
      || optionalSummaryText((governance as Record<string, unknown>).next_action_before_draft_factory)
      || 'Aprovador humano deve confirmar prazo, fonte e providencia antes de liberar missao Lex/Draft Factory.',
    openclaw_reason: optionalSummaryText((governance as Record<string, unknown>).openclaw_reason)
      || optionalSummaryText((governance as Record<string, unknown>).openclawReason)
      || params.agenticGovernance?.openclaw.reason
      || 'Politica OpenClaw exige aprovacao humana antes de side effects juridicos.',
  }
}

function parseReviewOverrides(body: Record<string, unknown>): ReviewOverrides {
  const overrides: ReviewOverrides = {}

  if (Object.prototype.hasOwnProperty.call(body, 'acao_sugerida')) {
    overrides.acao_sugerida = optionalText(body.acao_sugerida)
  }

  if (Object.prototype.hasOwnProperty.call(body, 'data_vencimento_extraida')) {
    overrides.data_vencimento_extraida = optionalText(body.data_vencimento_extraida)
  }

  if (Object.prototype.hasOwnProperty.call(body, 'polo_representado')) {
    overrides.polo_representado = optionalText(body.polo_representado)
  }

  if (Object.prototype.hasOwnProperty.call(body, 'obrigacao_de_quem')) {
    overrides.obrigacao_de_quem = optionalText(body.obrigacao_de_quem)
  }

  return overrides
}

function serializeReviewOverrides(overrides?: ReviewOverrides) {
  const payload: Record<string, string | null> = {}
  if (!overrides) return null

  if (overrides.acao_sugerida !== undefined) payload.acao_sugerida = optionalText(overrides.acao_sugerida)
  if (overrides.data_vencimento_extraida !== undefined) payload.data_vencimento_extraida = optionalText(overrides.data_vencimento_extraida)
  if (overrides.polo_representado !== undefined) payload.polo_representado = optionalText(overrides.polo_representado)
  if (overrides.obrigacao_de_quem !== undefined) payload.obrigacao_de_quem = optionalText(overrides.obrigacao_de_quem)

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
    const agenticGovernance = summarizeAgenticGovernance(payload, analysis)
    const supervisionContext = summarizeReviewSupervisionContext({ payload, analysis, movement, process, agenticGovernance })
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
      confidence: payload.confidence || analysis.confidence || payload.confianca_analise || movement?.confianca_analise || null,
      origem: payload.origem || analysis.origem || null,
      motivo: payload.motivo || String(analysis.motivo || ''),
      polo_representado: payload.polo_representado || analysis.polo_representado || null,
      obrigacao_de_quem: payload.obrigacao_de_quem || analysis.obrigacao_de_quem || null,
      confidence_reason: payload.confidence_reason || String(analysis.confidence_reason || analysis.motivo || ''),
      evidencia: payload.evidencia || String(analysis.evidencia || ''),
      review_required: payload.review_required ?? (typeof analysis.review_required === 'boolean' ? analysis.review_required : true),
      agentic_governance: agenticGovernance,
      supervision_context: supervisionContext,
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
    const agenticGovernance = summarizeAgenticGovernance(payload, analysis)
    const supervisionContext = summarizeReviewSupervisionContext({ payload, analysis, movement, process, agenticGovernance })
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
      confidence: payload.confidence || analysis.confidence || payload.confianca_analise || movement?.confianca_analise || null,
      origem: payload.origem || analysis.origem || null,
      motivo: payload.motivo || String(analysis.motivo || ''),
      polo_representado: payload.polo_representado || analysis.polo_representado || null,
      obrigacao_de_quem: payload.obrigacao_de_quem || analysis.obrigacao_de_quem || null,
      confidence_reason: payload.confidence_reason || String(analysis.confidence_reason || analysis.motivo || ''),
      evidencia: payload.evidencia || String(analysis.evidencia || ''),
      review_required: payload.review_required ?? (typeof analysis.review_required === 'boolean' ? analysis.review_required : true),
      agentic_governance: agenticGovernance,
      supervision_context: supervisionContext,
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
    polo_representado: params.overrides?.polo_representado ?? payload.polo_representado ?? null,
    obrigacao_de_quem: params.overrides?.obrigacao_de_quem ?? payload.obrigacao_de_quem ?? null,
  }

  if (!process?.id) throw new Error('Processo monitorado nao encontrado para esta revisao.')
  if (tipoEvento === 'ARQUIVAMENTO' || tipoEvento === 'EXTINCAO') {
    throw new Error('Encerramento/arquivamento ainda exige acao manual no beta.')
  }
  if (!dueDateIso) throw new Error('Esta movimentacao nao tem vencimento confiavel para aprovacao automatica.')
  const reviewedDuty = assertReviewedDutyAllowsTask(reviewedPayload, movement, params.overrides)
  reviewedPayload.polo_representado = reviewedDuty.polo
  reviewedPayload.obrigacao_de_quem = reviewedDuty.duty

  const taskId = await createOrUpdateProcessCard({
    tenantId: params.tenantId,
    process,
    movement,
    payload: reviewedPayload,
    dueDateIso,
    reviewerId: params.userId,
  })
  const escavadorMovimentacaoId = payload.escavador_movimentacao_id || movement?.escavador_movimentacao_id || null
  const analysisForSupervision = normalizePayload(movement?.analise_json)
  const agenticGovernance = summarizeAgenticGovernance(reviewedPayload, analysisForSupervision)
  const supervisionContext = summarizeReviewSupervisionContext({
    payload: reviewedPayload,
    analysis: analysisForSupervision,
    movement,
    process,
    agenticGovernance,
  })

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
        polo_representado: reviewedPayload.polo_representado ?? analysis.polo_representado ?? null,
        obrigacao_de_quem: reviewedPayload.obrigacao_de_quem ?? analysis.obrigacao_de_quem ?? null,
        confidence: reviewedPayload.confidence || reviewedPayload.confianca_analise || analysis.confidence || analysis.confianca_analise || null,
        confidence_reason: reviewedPayload.confidence_reason ?? analysis.confidence_reason ?? null,
        evidencia: reviewedPayload.evidencia ?? analysis.evidencia ?? null,
        review_required: false,
      },
    })
      .eq('id', movement.id)
      .eq('tenant_id', params.tenantId)
    if (movementUpdateError) throw new Error(`Falha ao atualizar movimentacao revisada: ${movementUpdateError.message}`)
  }

  let proactiveMovement: unknown = null
  try {
    proactiveMovement = await prepareProactiveMovementDraft({
      tenantId: params.tenantId,
      processTaskId: taskId,
      processNumber: String(process.numero_processo || payload.numero_cnj || movement?.numero_cnj || ''),
      movementText: movementContent(movement, payload) || descricao,
      movementDate: movement?.data || null,
      movementId: movement?.id || escavadorMovimentacaoId || payload.process_movimentacao_id || null,
      eventType: tipoEvento,
      deadlineDescription: descricao,
      responsibleUserId: process.advogado_responsavel_id || params.userId,
      metadata: {
        ...normalizePayload(movement?.analise_json),
        ...reviewedPayload,
        review_source: 'human_approved_movement_review',
        review_note: params.note || null,
        process_task_id: taskId,
        due_date: dueDateIso,
        supervision_context: supervisionContext,
        sources_used_before_draft_factory: supervisionContext.sources_used,
        gaps_before_draft_factory: supervisionContext.gaps,
        blockers_before_draft_factory: supervisionContext.blockers,
        operational_thesis: supervisionContext.operational_thesis,
        openclaw_reason: supervisionContext.openclaw_reason,
      },
    })
  } catch (error: any) {
    proactiveMovement = {
      status: 'failed',
      reason: error?.message || 'Falha ao preparar missao Lex proativa apos revisao humana.',
    }
  }

  return {
    taskId,
    prazoCreated: true,
    proactive_movement: proactiveMovement,
    reviewed_payload: {
      tipo_evento: tipoEvento,
      acao_sugerida: descricao,
      data_vencimento_extraida: dueDateIso,
      polo_representado: reviewedPayload.polo_representado ?? null,
      obrigacao_de_quem: reviewedPayload.obrigacao_de_quem ?? null,
      confidence: reviewedPayload.confidence || reviewedPayload.confianca_analise || null,
      confidence_reason: reviewedPayload.confidence_reason ?? null,
      evidencia: reviewedPayload.evidencia ?? null,
      supervision_context: supervisionContext,
      sources_used_before_draft_factory: supervisionContext.sources_used,
      gaps_before_draft_factory: supervisionContext.gaps,
      blockers_before_draft_factory: supervisionContext.blockers,
      operational_thesis: supervisionContext.operational_thesis,
      openclaw_reason: supervisionContext.openclaw_reason,
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

  const basePayload = normalizePayload(review.payload)
  const nextPayload: Record<string, unknown> = {
    ...(basePayload as Record<string, unknown>),
    agentic_governance: summarizeAgenticGovernance(basePayload, basePayload),
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

  const contractPayload = nextPayload as Record<string, unknown>
  await upsertMovementAnalysisContract({
    client: supabaseAdmin,
    tenantId: params.tenantId,
    numeroCnj: String(contractPayload.numero_cnj || ''),
    processMovimentacaoId: optionalText(contractPayload.process_movimentacao_id),
    escavadorMovimentacaoId: optionalText(contractPayload.escavador_movimentacao_id),
    processoId: optionalText(contractPayload.processo_id),
    linkedProcessTaskId: optionalText((actionResult as Record<string, unknown>).taskId),
    auditUserId: params.userId,
    auditSource: 'movement_review',
    reviewedBy: params.userId,
    reviewedAt: String(contractPayload.reviewed_at || new Date().toISOString()),
    reviewNote: params.note || null,
    reviewStatus: params.decision,
    payload: nextPayload as ReviewPayload,
  })

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
  const basePayload = normalizePayload(review.payload)
  const nextPayload: Record<string, unknown> = {
    ...(basePayload as Record<string, unknown>),
    agentic_governance: summarizeAgenticGovernance(basePayload, basePayload),
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

  await upsertMovementAnalysisContract({
    client: supabaseAdmin,
    tenantId: params.tenantId,
    numeroCnj: String(nextPayload.numero_cnj || ''),
    processMovimentacaoId: optionalText(nextPayload.process_movimentacao_id),
    escavadorMovimentacaoId: optionalText(nextPayload.escavador_movimentacao_id),
    processoId: optionalText(nextPayload.processo_id),
    linkedProcessTaskId: optionalText(nextPayload.linked_process_task_id),
    auditUserId: params.userId,
    auditSource: 'movement_review_recovery',
    reviewedBy: params.userId,
    reviewedAt: now,
    reviewNote: params.note,
    reviewStatus: 'review_required',
    payload: nextPayload as ReviewPayload,
  })

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
        : message.includes('manual') || message.includes('vencimento') || message.includes('Acao revisada') || message.includes('Confirme')
          ? 422
          : 500
    return NextResponse.json({ error: message }, { status })
  }
}
