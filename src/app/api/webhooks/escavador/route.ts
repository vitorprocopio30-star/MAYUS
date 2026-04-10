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
  if (evento === 'diario_movimentacao_nova') {
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

      // Busca todos os tenants que monitoram esse CNJ
      const { data: processos } = await adminSupabase
        .from('monitored_processes')
        .select('id, tenant_id, movimentacoes, advogado_responsavel_id')
        .eq('numero_processo', numero_cnj)

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

      // Aproveita que o processo foi verificado para buscar resumo atualizado
      const { data: processos } = await adminSupabase
        .from('monitored_processes')
        .select('tenant_id')
        .eq('numero_processo', numero_cnj)

      for (const p of processos ?? []) {
        buscarESalvarResumo(numero_cnj, p.tenant_id).catch(console.error)
      }
    }
  }

  // Responde imediatamente (Escavador retenta em caso de timeout)
  return NextResponse.json({ ok: true })
}
