import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { solicitarResumoIA, buscarESalvarResumo } from '@/lib/services/escavador-ia'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)




export async function POST(req: NextRequest) {
  // 1. Valida token de segurança
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (auth !== process.env.ESCAVADOR_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  console.log('[ESCAVADOR_WEBHOOK]', JSON.stringify(body, null, 2))

  const evento = body.event ?? body.evento ?? ''

  // 2. Evento: nova movimentação no Diário Oficial
  if (evento === 'nova_movimentacao' || evento === 'diario_movimentacao_nova') {
    const monitoramentos = body.monitoramento ?? []
    const movimentacao = body.movimentacao ?? {}

    for (const mon of monitoramentos) {
      const numero_cnj = mon.termo ?? mon.processo?.numero_novo ?? mon.valor
      if (!numero_cnj) continue

      // Enfileira para o agente processar
      await adminSupabase.from('process_update_queue').insert({
        numero_cnj,
        evento,
        payload: body,
        status: 'PENDENTE'
      })

      // DUAL LOOKUP: tenta por escavador_monitoramento_id primeiro, fallback por numero_processo
      const monitoramentoIdEscavador = mon.id
      let { data: processos } = await adminSupabase
        .from('monitored_processes')
        .select('id, tenant_id, movimentacoes, advogado_responsavel_id, escavador_monitoramento_id')
        .eq('escavador_monitoramento_id', monitoramentoIdEscavador)

      // Fallback por numero_processo (CNJ)
      if (!processos || processos.length === 0) {
        const { data: fallback } = await adminSupabase
          .from('monitored_processes')
          .select('id, tenant_id, movimentacoes, advogado_responsavel_id, escavador_monitoramento_id')
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
        id: movimentacao.id,
        data: movimentacao.data_formatada ?? movimentacao.data,
        conteudo: movimentacao.snippet ?? movimentacao.conteudo,
        diario: movimentacao.diario_oficial,
        link_pdf: movimentacao.link_pdf,
        criado_em: new Date().toISOString()
      }

      for (const processo of processos ?? []) {
        // Mantém histórico dos últimos 50 movimentos
        const movimentacoes = [
          novaMovimentacao,
          ...((processo.movimentacoes as any[]) ?? [])
        ].slice(0, 50)

        // Atualiza processo monitorado
        await adminSupabase
          .from('monitored_processes')
          .update({
            movimentacoes,
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

        // Dispara analisador jurídico (cria tarefas automáticas)
        const { analisarMovimentacao } = await import('@/lib/juridico/analisador')
        await analisarMovimentacao({
          processo_id: processo.id,
          numero_cnj,
          tenant_id: processo.tenant_id,
          movimentacao: novaMovimentacao,
          advogado_id: processo.advogado_responsavel_id
        }).catch(console.error)

        // Dispara resumo IA em background (R$0,08 por processo, regra 24h)
        solicitarResumoIA(numero_cnj, processo.tenant_id).catch(console.error)
      }
    }
  }

  // 3. Evento: atualização do tribunal (síncrono ou assíncrono)
  if (evento === 'update_time' || evento === 'resultado_processo_async') {
    const numero_cnj =
      body.processo?.numero_unico ?? body.app?.monitor?.valor
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
    const numero_cnj = body.monitoramento?.termo || body.valor
    const status_escavador = body.monitoramento?.status
    if (numero_cnj) {
      await adminSupabase
        .from('monitored_processes')
        .update({
          ultima_verificacao: new Date().toISOString(),
          status_escavador: status_escavador ?? 'VERIFICADO'
        })
        .eq('numero_processo', numero_cnj)

      // DUAL LOOKUP: tenta por ID primeiro, fallback por numero_processo
      const monitoramentoIdEscavador = body.monitoramento?.id
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

  // Responde imediatamente (Escavador retenta em caso de timeout)
  return NextResponse.json({ ok: true })
}
