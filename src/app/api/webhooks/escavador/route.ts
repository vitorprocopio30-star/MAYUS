// Force Trigger Deploy: 2026-04-10T15:40
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { requireTenantApiKey } from '@/lib/integrations/server'
import { solicitarResumoIA, buscarESalvarResumo } from '@/lib/services/escavador-ia'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MAX_ESCAVADOR_WEBHOOK_BODY_BYTES = 1024 * 1024

function safeSecretEquals(expected: string, provided: string) {
  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(provided)

  return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer)
}

function isAuthorizedWebhook(req: NextRequest) {
  const expected = String(process.env.ESCAVADOR_WEBHOOK_SECRET || '').trim()
  const provided = String(req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()

  return Boolean(expected && provided && safeSecretEquals(expected, provided))
}

function normalizeOabEstado(value?: string | null) {
  return String(value || '').trim().toUpperCase()
}

function normalizeOabNumero(value?: string | null) {
  return String(value || '').replace(/\D/g, '')
}

function normalizarDataEvento(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
    const [dia, mes, ano] = raw.split(' ')[0].split('/')
    return `${ano}-${mes}-${dia}`
  }

  if (raw.includes('-')) {
    const datePart = raw.replace(' ', 'T').split('T')[0]
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  const ano = parsed.getFullYear()
  const mes = String(parsed.getMonth() + 1).padStart(2, '0')
  const dia = String(parsed.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function normalizarTipoEventoWebhook(value: unknown) {
  return String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')
    .toLowerCase()
}

function extrairTipoEventoWebhook(body: any) {
  return normalizarTipoEventoWebhook(
    body?.event ??
    body?.evento ??
    body?.tipo_evento ??
    body?.tipoEvento ??
    body?.event_type ??
    body?.type
  )
}

function isEventoNovaMovimentacao(evento: string) {
  return [
    'nova_movimentacao',
    'diario_movimentacao_nova',
    'movimentacao_nova',
    'nova_movimentacao_diario',
    'nova_movimentacao_diario_oficial',
  ].includes(evento)
}

function extrairOabDeTexto(value?: string | null) {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) return null

  const match = raw.match(/OAB\s*\/?\s*([A-Z]{2})\s*([0-9.\-/]+)/)
  if (!match) return null

  const oabEstado = normalizeOabEstado(match[1])
  const oabNumero = normalizeOabNumero(match[2])

  if (!oabEstado || !oabNumero) return null
  return { oabEstado, oabNumero }
}

function extrairOabDoMonitoramento(mon: any) {
  const candidates = [
    mon?.termo,
    mon?.valor,
    mon?.descricao,
    mon?.label,
    mon?.processo?.advogado,
  ]

  for (const value of candidates) {
    const parsed = extrairOabDeTexto(value)
    if (parsed) return parsed
  }

  return null
}

async function resolverTenantPorMonitoramentoOabLegacy(monitoramentoId: string | null) {
  if (!monitoramentoId) return null

  const { data: integracoes } = await adminSupabase
    .from('tenant_integrations')
    .select('tenant_id, metadata')
    .eq('provider', 'escavador')

  const match = (integracoes ?? []).find((integ: any) => {
    const monitoramentoOabId = String(integ?.metadata?.monitoramento_oab_id ?? '')
    return monitoramentoOabId && monitoramentoOabId === monitoramentoId
  })

  return match?.tenant_id ?? null
}

async function resolverContextoMonitoramentoOab(monitoramentoId: string | null, oab?: { oabEstado: string; oabNumero: string } | null) {
  if (monitoramentoId) {
    const { data: monitoramento } = await adminSupabase
      .from('tenant_oab_monitoramentos')
      .select('tenant_id, oab_estado, oab_numero')
      .eq('monitoramento_oab_id', monitoramentoId)
      .maybeSingle()

    if (monitoramento?.tenant_id) {
      return {
        tenantId: monitoramento.tenant_id,
        oabEstado: monitoramento.oab_estado,
        oabNumero: monitoramento.oab_numero,
      }
    }
  }

  if (oab?.oabEstado && oab?.oabNumero) {
    const { data: monitoramentos } = await adminSupabase
      .from('tenant_oab_monitoramentos')
      .select('tenant_id, oab_estado, oab_numero')
      .eq('oab_estado', oab.oabEstado)
      .eq('oab_numero', oab.oabNumero)
      .limit(2)

    if ((monitoramentos ?? []).length === 1) {
      const match = monitoramentos?.[0]
      return {
        tenantId: match.tenant_id,
        oabEstado: match.oab_estado,
        oabNumero: match.oab_numero,
      }
    }
  }

  const tenantLegacy = await resolverTenantPorMonitoramentoOabLegacy(monitoramentoId)
  if (!tenantLegacy) return null

  return {
    tenantId: tenantLegacy,
    oabEstado: oab?.oabEstado ?? null,
    oabNumero: oab?.oabNumero ?? null,
  }
}




export async function POST(req: NextRequest) {
  // 1. Valida token de segurança
  if (!isAuthorizedWebhook(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const contentLength = Number(req.headers.get('content-length') || '0')
  if (Number.isFinite(contentLength) && contentLength > MAX_ESCAVADOR_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  const rawBody = await req.text()
  if (rawBody.length > MAX_ESCAVADOR_WEBHOOK_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  }

  let body: any
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const evento = extrairTipoEventoWebhook(body)
  console.log('[ESCAVADOR_WEBHOOK] Evento recebido:', {
    evento,
    hasProcesso: Boolean(body?.processo),
    monitoramentos: Array.isArray(body?.monitoramentos) ? body.monitoramentos.length : body?.monitoramento ? 1 : 0,
  })

  // Evento: processo novo detectado via monitoramento por OAB
  if (evento === 'novo_processo' || evento === 'processo_encontrado') {
    const numeroCnj =
      body?.processo?.numero_cnj ??
      body?.processo?.numero_novo ??
      body?.numero_cnj ??
      body?.numero_processo

    const monitoramentoIdOab = String(body?.monitoramento?.id ?? body?.monitoramentos?.[0]?.id ?? '') || null
    const contextoOab = await resolverContextoMonitoramentoOab(
      monitoramentoIdOab,
      extrairOabDoMonitoramento(body?.monitoramento ?? body?.monitoramentos?.[0] ?? null)
    )
    const tenantId =
      body?.tenant_id ??
      contextoOab?.tenantId

    if (!numeroCnj || !tenantId) {
      console.log('[webhook-escavador] novo_processo: sem numero_cnj ou tenant_id')
      return NextResponse.json({ ok: true })
    }

    const { data: existente } = await adminSupabase
      .from('monitored_processes')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('numero_processo', numeroCnj)
      .maybeSingle()

    if (existente) {
      console.log(`[webhook-escavador] Processo ${numeroCnj} já monitorado.`)
      return NextResponse.json({ ok: true })
    }

    const dadosProcesso = body?.processo ?? {}
    const partes = dadosProcesso?.partes ?? {}

    const { data: novoProcesso } = await adminSupabase
      .from('monitored_processes')
      .insert({
        tenant_id: tenantId,
        numero_processo: numeroCnj,
        tribunal: dadosProcesso?.tribunal ?? dadosProcesso?.orgao_julgador ?? '',
        status: 'ATIVO',
        partes: {
          polo_ativo: partes?.polo_ativo ?? dadosProcesso?.titulo_polo_ativo ?? '',
          polo_passivo: partes?.polo_passivo ?? dadosProcesso?.titulo_polo_passivo ?? ''
        },
        ativo: true,
        monitoramento_ativo: false,
        escavador_id: dadosProcesso?.id?.toString() ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select('id')
      .single()

    if (!novoProcesso?.id) {
      console.error('[webhook-escavador] Falha ao inserir processo novo')
      return NextResponse.json({ ok: true })
    }

    const { apiKey } = await requireTenantApiKey(tenantId, 'escavador')

    if (apiKey) {
      const monRes = await fetch('https://api.escavador.com/api/v2/monitoramentos/processos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
          numero: numeroCnj,
          frequencia: 'SEMANAL'
        })
      })

      const monData = await monRes.json().catch(() => null)
      if (monRes.ok && monData?.id) {
        await adminSupabase
          .from('monitored_processes')
          .update({
            escavador_monitoramento_id: monData.id.toString(),
            monitoramento_ativo: true
          })
          .eq('id', novoProcesso.id)
      }
    }

    await adminSupabase.from('process_update_queue').insert({
      tenant_id: tenantId,
      numero_cnj: numeroCnj,
      status: 'PENDENTE',
      created_at: new Date().toISOString()
    })

    console.log(`[webhook-escavador] ✅ Processo novo importado automaticamente: ${numeroCnj}`)
    return NextResponse.json({ ok: true })
  }

  // 2. Evento: nova movimentação no Diário Oficial
  if (isEventoNovaMovimentacao(evento)) {
    // Normalização: suporta array em monitoramentos ou objeto em monitoramento
    const rawMon = body.monitoramentos ?? body.monitoramento ?? []
    const monitoramentos = Array.isArray(rawMon) ? rawMon : [rawMon]
    
    const movimentacao = body.movimentacao ?? {}
      const movimentacaoId = String(movimentacao.id ?? '').trim() || null
      const resumoSolicitadoNoEvento = new Set<string>()

      for (const mon of monitoramentos) {
      // Extração robusta do número do processo (inclui mon.numero aprovado pelo user)
      const numero_cnj = mon.numero ?? mon.termo ?? mon.valor ?? mon.processo?.numero_novo ?? mon.processo?.numero
      if (!numero_cnj) {
        console.warn('[ESCAVADOR_WEBHOOK] Monitoramento sem número identificável:', mon)
        continue
      }

      // Enfileira para o agente processar (log de auditoria)
      await adminSupabase.from('process_update_queue').insert({
        numero_cnj,
        evento,
        payload: body,
        status: 'PENDENTE'
      })

      const monitoramentoIdEscavador = String(mon.id ?? '').trim() || null
      const contextoOab = await resolverContextoMonitoramentoOab(monitoramentoIdEscavador, extrairOabDoMonitoramento(mon))

      // DUAL LOOKUP: tenta por escavador_monitoramento_id primeiro
      let { data: processos } = await adminSupabase
        .from('monitored_processes')
        .select('id, tenant_id, movimentacoes, advogado_responsavel_id, escavador_monitoramento_id, resumo_solicitado_em')
        .eq('escavador_monitoramento_id', monitoramentoIdEscavador)

      // Fallback por numero_processo (CNJ)
      if (!processos || processos.length === 0) {
        console.log(`[ESCAVADOR_WEBHOOK] ID ${monitoramentoIdEscavador} não encontrado. Tentando CNJ: ${numero_cnj}`)
        const { data: fallback } = await adminSupabase
          .from('monitored_processes')
          .select('id, tenant_id, movimentacoes, advogado_responsavel_id, escavador_monitoramento_id, resumo_solicitado_em')
          .eq('numero_processo', numero_cnj)
        processos = fallback

        // Backfill automático: popula escavador_monitoramento_id se estava nulo
        if (processos?.length && monitoramentoIdEscavador) {
          for (const p of processos) {
            if (!p.escavador_monitoramento_id) {
              await adminSupabase
                .from('monitored_processes')
                .update({ escavador_monitoramento_id: monitoramentoIdEscavador })
                .eq('id', p.id)
            }
          }
        }
      }

      const novaMovimentacao = {
        id: movimentacaoId,
        data: movimentacao.data_formatada ?? movimentacao.data,
        conteudo: movimentacao.snippet ?? movimentacao.conteudo,
        diario: movimentacao.diario_oficial,
        link_pdf: movimentacao.link_pdf,
        criado_em: new Date().toISOString()
      }

      if (!processos || processos.length === 0) {
        if (!contextoOab?.tenantId) {
          console.warn(`[ESCAVADOR_WEBHOOK] Sem tenant para inbox de ${numero_cnj}`)
          continue
        }

        const { data: inboxAtual } = await adminSupabase
          .from('process_movimentacoes_inbox')
          .select('id, movimentacoes, quantidade_eventos')
          .eq('tenant_id', contextoOab.tenantId)
          .eq('numero_cnj', numero_cnj)
          .maybeSingle()

        const historicoAtual = Array.isArray(inboxAtual?.movimentacoes) ? inboxAtual.movimentacoes : []
        const jaTemMovimentacao = movimentacaoId
          ? historicoAtual.some((mov: any) => String(mov?.id ?? '').trim() === movimentacaoId)
          : false

        if (jaTemMovimentacao) {
          continue
        }

        const movimentacoesInbox = [novaMovimentacao, ...historicoAtual].slice(0, 50)
        await adminSupabase
          .from('process_movimentacoes_inbox')
          .upsert({
            tenant_id: contextoOab.tenantId,
            numero_cnj,
            oab_estado: contextoOab.oabEstado,
            oab_numero: contextoOab.oabNumero,
            latest_data: normalizarDataEvento(novaMovimentacao.data),
            latest_conteudo: novaMovimentacao.conteudo,
            latest_fonte: 'diario_oficial',
            latest_created_at: novaMovimentacao.criado_em,
            quantidade_eventos: movimentacoesInbox.length,
            movimentacoes: movimentacoesInbox,
            payload_ultimo_evento: body,
            monitorado: false,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id,numero_cnj' })

        continue
      }

      for (const processo of processos ?? []) {
        const historicoAtual = Array.isArray(processo.movimentacoes) ? processo.movimentacoes : []
        const jaTemMovimentacao = movimentacaoId
          ? historicoAtual.some((mov: any) => String(mov?.id ?? '').trim() === movimentacaoId)
          : false

        if (jaTemMovimentacao) {
          continue
        }

        // Mantém histórico dos últimos 50 movimentos
        const movimentacoes = [
          novaMovimentacao,
          ...historicoAtual
        ].slice(0, 50)

        // Atualiza processo monitorado
        await adminSupabase
          .from('monitored_processes')
          .update({
            movimentacoes,
            data_ultima_movimentacao: novaMovimentacao.data ?? null,
            ultima_movimentacao_texto: novaMovimentacao.conteudo,
            updated_at: new Date().toISOString()
          })
          .eq('id', processo.id)

        // Persiste movimentação na tabela de histórico
        await adminSupabase.from('process_movimentacoes').insert({
          tenant_id: processo.tenant_id,
          numero_cnj,
          data: normalizarDataEvento(novaMovimentacao.data),
          conteudo: novaMovimentacao.conteudo,
          fonte: 'diario_oficial'
        })

        await adminSupabase
          .from('process_movimentacoes_inbox')
          .delete()
          .eq('tenant_id', processo.tenant_id)
          .eq('numero_cnj', numero_cnj)

        // Dispara analisador jurídico (cria tarefas automáticas) - Aguardado para não morrer na Vercel
        const { analisarMovimentacao } = await import('@/lib/juridico/analisador')
        await analisarMovimentacao({
          processo_id: processo.id,
          numero_cnj,
          tenant_id: processo.tenant_id,
          movimentacao: novaMovimentacao,
          advogado_id: processo.advogado_responsavel_id,
          escavador_movimentacao_id: movimentacaoId ?? ''
        }).catch(console.error)

        // Dispara resumo IA em background apenas uma vez por processo neste evento
        const resumoKey = `${processo.tenant_id}:${numero_cnj}`
        const ultimaSolicitacaoTs = processo.resumo_solicitado_em
          ? new Date(processo.resumo_solicitado_em).getTime()
          : 0
        const cooldownAtivo = Number.isFinite(ultimaSolicitacaoTs) && ultimaSolicitacaoTs > 0
          ? Date.now() - ultimaSolicitacaoTs < 20 * 60 * 1000
          : false

        if (!resumoSolicitadoNoEvento.has(resumoKey) && !cooldownAtivo) {
          resumoSolicitadoNoEvento.add(resumoKey)

          await adminSupabase
            .from('monitored_processes')
            .update({ resumo_solicitado_em: new Date().toISOString() })
            .eq('id', processo.id)

          solicitarResumoIA(numero_cnj, processo.tenant_id).catch(console.error)
        }
      }
    }
  }

  // 3. Evento: atualização do tribunal (síncrono ou assíncrono)
  if (evento === 'update_time' || evento === 'resultado_processo_async') {
    const numero_cnj = body.processo?.numero_unico ?? body.app?.monitor?.valor
    if (numero_cnj) {
      await adminSupabase.from('process_update_queue').insert({
        numero_cnj,
        evento,
        payload: body,
        status: 'PENDENTE'
      })
    }
  }

  // 4. Evento: processo verificado (sucesso da monitoração básica)
  if (evento === 'processo_verificado') {
    // Normalização similar para o evento verificado
    const monData = body.monitoramento ?? {}
    const numero_cnj = monData.numero ?? monData.termo ?? monData.valor ?? body.valor
    const status_escavador = monData.status
    const monitoramentoIdEscavador = String(monData.id ?? '')

    if (numero_cnj) {
      await adminSupabase
        .from('monitored_processes')
        .update({
          ultima_verificacao: new Date().toISOString(),
          status_escavador: status_escavador ?? 'VERIFICADO'
        })
        .eq('numero_processo', numero_cnj)

      // Dual lookup para resumo
      let { data: processos } = await adminSupabase
        .from('monitored_processes')
        .select('id, tenant_id, escavador_monitoramento_id')
        .eq('escavador_monitoramento_id', monitoramentoIdEscavador)

      if (!processos || processos.length === 0) {
        const { data: fallback } = await adminSupabase
          .from('monitored_processes')
          .select('id, tenant_id, escavador_monitoramento_id')
          .eq('numero_processo', numero_cnj)
        processos = fallback

        // Backfill on-the-fly
        if (processos?.length && monitoramentoIdEscavador) {
          for (const p of processos) {
            if (!p.escavador_monitoramento_id) {
              await adminSupabase
                .from('monitored_processes')
                .update({ escavador_monitoramento_id: monitoramentoIdEscavador })
                .eq('id', p.id)
            }
          }
        }
      }

      for (const p of processos ?? []) {
        buscarESalvarResumo(numero_cnj, p.tenant_id).catch(console.error)
      }
    }
  }

  return NextResponse.json({ ok: true })
}
