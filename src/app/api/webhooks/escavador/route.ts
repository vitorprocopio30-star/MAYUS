// Force Trigger Deploy: 2026-04-10T15:40
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { solicitarResumoIA, buscarESalvarResumo } from '@/lib/services/escavador-ia'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function resolverTenantPorApiKey(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? ''
  const bearer = authHeader.replace(/^Bearer\s+/i, '').trim()
  const apiKeyHeader = req.headers.get('x-escavador-api-key')?.trim() ?? ''
  const possivelApiKey = apiKeyHeader || bearer

  if (!possivelApiKey || possivelApiKey === process.env.ESCAVADOR_WEBHOOK_SECRET) return null

  const { data: integ } = await adminSupabase
    .from('tenant_integrations')
    .select('tenant_id')
    .eq('provider', 'escavador')
    .eq('api_key', possivelApiKey)
    .maybeSingle()

  return integ?.tenant_id ?? null
}

async function resolverTenantPorMonitoramentoOab(monitoramentoId: string | null) {
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




export async function POST(req: NextRequest) {
  // 1. Valida token de segurança
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (auth !== process.env.ESCAVADOR_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  console.log('[ESCAVADOR_WEBHOOK] Payload recebido:', JSON.stringify(body, null, 2))

  const evento = body.event ?? body.evento ?? ''

  // Evento: processo novo detectado via monitoramento por OAB
  if (evento === 'novo_processo' || evento === 'processo_encontrado') {
    const numeroCnj =
      body?.processo?.numero_cnj ??
      body?.processo?.numero_novo ??
      body?.numero_cnj ??
      body?.numero_processo

    const monitoramentoIdOab = String(body?.monitoramento?.id ?? body?.monitoramentos?.[0]?.id ?? '') || null
    const tenantId =
      body?.tenant_id ??
      (await resolverTenantPorMonitoramentoOab(monitoramentoIdOab)) ??
      (await resolverTenantPorApiKey(req))

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

    const { data: integ } = await adminSupabase
      .from('tenant_integrations')
      .select('api_key')
      .eq('tenant_id', tenantId)
      .eq('provider', 'escavador')
      .single()

    if (integ?.api_key) {
      const monRes = await fetch('https://api.escavador.com/api/v2/monitoramentos/processos', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${integ.api_key}`,
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
  if (evento === 'nova_movimentacao' || evento === 'diario_movimentacao_nova') {
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

      // DUAL LOOKUP: tenta por escavador_monitoramento_id primeiro
      const monitoramentoIdEscavador = String(mon.id ?? '')
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
          data: novaMovimentacao.data,
          conteudo: novaMovimentacao.conteudo,
          fonte: 'diario_oficial'
        })

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
