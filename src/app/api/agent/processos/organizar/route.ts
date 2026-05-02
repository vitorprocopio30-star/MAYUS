import { createClient as createCookieSupabaseClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { buildAgendaPayloadFromProcessTask, syncAgendaTaskBySource } from '@/lib/agenda/userTasks'
import { NextRequest, NextResponse } from 'next/server'
import { callLLMWithFallback } from '@/lib/llm-fallback'
import { requireTenantApiKey } from '@/lib/integrations/server'
import { buildDocumentOrganizationSummary } from '@/lib/juridico/document-organization'
import { buildDemoOrganizationResult, isDemoProcessRecord } from '@/lib/demo/demo-oab-flow'
import {
  buildProcessCardClientName,
  buildProcessCardDescription,
  buildProcessCardTitle,
} from '@/lib/juridico/process-card-context'

function createRequestSupabaseClient(req: NextRequest) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return createCookieSupabaseClient()

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )
}

function normalizarDescricaoPrazo(value: string | null | undefined): string {
  const texto = String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!texto) return 'sem-descricao'
  if (texto.includes('replica') && texto.includes('contest')) return 'replica_contestacao'
  if (texto.includes('contrarrazo') || texto.includes('contrarraz')) return 'contrarrazoes'
  if (texto.includes('embargos') && texto.includes('declar')) return 'embargos_declaracao'
  if (texto.includes('sentenca') && (texto.includes('public') || texto.includes('grupo') || texto.includes('prolacao') || texto.includes('julg'))) {
    return 'sentenca_monitoramento'
  }

  return texto
}

function chavePrazoCanonica(tipo: string, descricao: string, dataVencimento: string) {
  const categoria = normalizarDescricaoPrazo(descricao)
  const agruparSemDia = ['replica_contestacao', 'contrarrazoes', 'embargos_declaracao', 'sentenca_monitoramento'].includes(categoria)
  const dia = dataVencimento ? new Date(dataVencimento).toISOString().slice(0, 10) : 'sem-data'
  return `${tipo}|${categoria}|${agruparSemDia ? 'sem-dia' : dia}`
}

function normalizarNomeEtapa(nome?: string | null) {
  return String(nome ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function etapaEhMovimentacoes(nome?: string | null) {
  return normalizarNomeEtapa(nome).includes('movimentac')
}

function escolherEtapaFallback(stages: any[]): string | null {
  if (!Array.isArray(stages) || stages.length === 0) return null
  const visiveis = stages.filter((s) => !etapaEhMovimentacoes(s?.name))
  if (visiveis.length === 0) return stages[0]?.id ?? null

  const prioridades = [
    'recolher documentos',
    'fazer inicial',
    'protocolar inicial',
    'contestacao',
    'contrarrazoes',
  ]

  for (const prioridade of prioridades) {
    const match = visiveis.find((s) => normalizarNomeEtapa(s?.name).includes(prioridade))
    if (match?.id) return match.id
  }

  return visiveis[0]?.id ?? null
}

function pontuarPipelineNome(nome?: string | null) {
  const n = normalizarNomeEtapa(nome)
  let score = 0
  if (n.includes('controle juridico')) score += 6
  if (n.includes('jurid')) score += 4
  if (n.includes('processo')) score += 2
  if (n.includes('crm')) score -= 3
  if (n.includes('venda')) score -= 2
  return score
}

function escolherEtapaSemantica(stages: any[], sinais: string[]) {
  const visiveis = (stages || []).filter((s: any) => !etapaEhMovimentacoes(s?.name))
  if (visiveis.length === 0) return null

  const contexto = normalizarDescricaoPrazo(sinais.join(' '))

  const regras = [
    { match: ['contrarrazo', 'agravo'], etapa: ['contrarrazoes de agravo', 'contrarrazoes'] },
    { match: ['agravo'], etapa: ['agravo de instrumento', 'agravo'] },
    { match: ['contest'], etapa: ['contestacao'] },
    { match: ['replica'], etapa: ['replica', 'contrarrazoes'] },
    { match: ['protocol'], etapa: ['protocolar inicial', 'protocolo'] },
    { match: ['inicial', 'peticao'], etapa: ['fazer inicial', 'peticao inicial'] },
    { match: ['document', 'diligenc'], etapa: ['recolher documentos', 'documentos'] },
    { match: ['sentenca', 'embargos'], etapa: ['embargos', 'sentenca', 'recursos'] },
  ]

  for (const regra of regras) {
    if (!regra.match.every((m) => contexto.includes(m))) continue
    const found = visiveis.find((s: any) => {
      const n = normalizarNomeEtapa(s?.name)
      return regra.etapa.some((e) => n.includes(e))
    })
    if (found?.id) return found.id
  }

  return null
}

export async function POST(req: NextRequest) {
  const supabase = createRequestSupabaseClient(req)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { processo_id } = await req.json()

  // 1. Buscar processo
  const { data: proc, error: procErr } = await supabase
    .from('monitored_processes')
    .select('*')
    .eq('id', processo_id)
    .single()
  if (procErr || !proc) return NextResponse.json({ error: 'Processo não encontrado' }, { status: 404 })
  const isDemoProcess = isDemoProcessRecord(proc)

  // 2. Buscar advogados do tenant
  const { data: advogados } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('tenant_id', proc.tenant_id)
    .in('role', ['Administrador', 'advogado', 'socio'])

  // 3. Buscar chave do Escavador
  const { apiKey: tenantEscavadorKey } = isDemoProcess
    ? { apiKey: null }
    : await requireTenantApiKey(proc.tenant_id, 'escavador')
  const escavadorKey = tenantEscavadorKey || process.env.ESCAVADOR_API_KEY

  // 3b. Resolver pipeline e etapas reais
  let pipelineId: string | null = null
  let linkedTaskContext: any = null

  if (proc.linked_task_id) {
    const { data: linkedTask } = await supabase
      .from('process_tasks')
      .select('pipeline_id, title, description, client_name')
      .eq('id', proc.linked_task_id)
      .maybeSingle()
    linkedTaskContext = linkedTask
    pipelineId = linkedTask?.pipeline_id ?? null
  }

  if (!pipelineId && proc.numero_processo) {
    const { data: taskByProcesso } = await supabase
      .from('process_tasks')
      .select('pipeline_id')
      .eq('processo_1grau', proc.numero_processo)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    pipelineId = taskByProcesso?.pipeline_id ?? null
  }

  if (!pipelineId) {
    const { data: allPipelines } = await supabase
      .from('process_pipelines')
      .select('id, name')
      .eq('tenant_id', proc.tenant_id)
      .order('created_at', { ascending: true })
      .limit(50)

    const best = (allPipelines || [])
      .map((p: any) => ({ ...p, _score: pontuarPipelineNome(p?.name) }))
      .sort((a: any, b: any) => b._score - a._score)[0]

    pipelineId = best?.id ?? allPipelines?.[0]?.id ?? null
  }

  const { data: stages } = pipelineId
    ? await supabase
        .from('process_stages')
        .select('id, name, order_index')
        .eq('pipeline_id', pipelineId)
        .order('order_index', { ascending: true })
    : { data: [] as any[] }

  const etapasDisponiveis = Array.isArray(stages) ? stages : []
  const etapasVisiveis = etapasDisponiveis.filter((s: any) => !etapaEhMovimentacoes(s?.name))
  const etapaFallbackId = escolherEtapaFallback(etapasDisponiveis)

  // 3c. Buscar movimentações reais do provedor externo se tiver escavador_id
  let movimentacoesEscavador: any[] = Array.isArray(proc.movimentacoes)
    ? proc.movimentacoes : []

  if (!isDemoProcess && proc.escavador_id && escavadorKey) {
    try {
      const detResp = await fetch(
        `https://api.escavador.com/api/v2/processos/${proc.escavador_id}`,
        {
          headers: {
            Authorization: `Bearer ${escavadorKey}`,
            'Content-Type': 'application/json'
          }
        }
      )
      if (detResp.ok) {
        const detData = await detResp.json()
        const movs = detData?.fontes?.[0]?.movimentacoes
                 || detData?.movimentacoes
                 || []
        if (Array.isArray(movs) && movs.length > 0) {
          movimentacoesEscavador = movs.slice(0, 15)
          // Atualizar no banco para futuras chamadas
          await supabase
            .from('monitored_processes')
            .update({ movimentacoes: movimentacoesEscavador, updated_at: new Date().toISOString() })
            .eq('id', processo_id)
        }
      }
    } catch (e) {
      console.error('Escavador detalhe falhou:', e)
    }
  }

  // 4. Montar contexto
  const movimentacoes = movimentacoesEscavador.slice(0, 15)

  const contexto = `
PROCESSO: ${proc.numero_processo}
TRIBUNAL: ${proc.tribunal || 'Não identificado'}
ASSUNTO: ${proc.assunto || 'Não identificado'}
CLASSE PROCESSUAL: ${proc.classe_processual || ''}
FASE ATUAL: ${proc.fase_processual || proc.fase_atual || ''}
STATUS PREDITO: ${proc.status_predito || ''}
COMARCA: ${proc.comarca || ''} / VARA: ${proc.vara || ''}
POLO ATIVO: ${(proc.partes as any)?.polo_ativo || (proc.partes as any)?.ativo || ''}
POLO PASSIVO: ${(proc.partes as any)?.polo_passivo || (proc.partes as any)?.passivo || ''}
VALOR DA CAUSA: ${proc.valor_causa || 'Não informado'}
DATA DE DISTRIBUIÇÃO: ${proc.data_distribuicao || 'Não informada'}

HISTÓRICO DE MOVIMENTAÇÕES (mais recente primeiro):
${movimentacoes.map((m: any, i: number) =>
  `[${i + 1}] ${m.data || ''}: ${m.texto || m.descricao || m.tipo || JSON.stringify(m)}`
).join('\n')}

ADVOGADOS DO ESCRITÓRIO:
${advogados?.map(a => `- ${a.full_name} (${a.role})`).join('\n') || 'Não informado'}

KANBAN (colunas disponíveis):
${etapasVisiveis.map((s: any) => `- ${String(s.name || '').toUpperCase()} (id: ${s.id})`).join('\n') || '- SEM ETAPAS CADASTRADAS'}
`

  const prompt = `Você é o MAYUS, assistente jurídico especializado em advocacia brasileira.

ATENÇÃO: Analise o histórico de movimentações para identificar a fase ATUAL real do processo. Nunca sugira atos processuais já realizados. Se o processo já tem audiência marcada, tutela concedida, ou citação realizada, a próxima ação deve ser estritamente o que vem DEPOIS disso.

${contexto}

Retorne SOMENTE um JSON válido, sem markdown, sem explicações.

Retorne exatamente este JSON:
{
  "resumo_curto": "Resumo em 2-3 frases claras da situação atual do processo",
  "proxima_acao_sugerida": "Ação específica mais urgente que o advogado deve tomar",
  "urgencia_nivel": "verde|amarelo|vermelho",
  "urgencia_motivo": "Por que essa urgência (vazio se verde)",
  "kanban_stage_id": "UUID da coluna mais adequada para este processo agora",
  "prazos": [
    {
      "tipo": "prazo|audiencia|sessao|pericia",
      "descricao": "Descrição clara",
      "data_vencimento_iso": "YYYY-MM-DDTHH:mm:ssZ ou null",
      "prioridade": "baixa|media|alta|urgente",
      "responsavel_nome": "Nome do advogado mais adequado ou null"
    }
  ],
  "tarefas": [
    {
      "titulo": "Título da tarefa",
      "descricao": "O que fazer exatamente",
      "responsavel_nome": "Nome do advogado mais adequado ou null",
      "prioridade": "baixa|media|alta"
    }
  ],
  "peca_sugerida": "Nome da peça processual a elaborar agora (ou null)"
}`

  let resultado: any
  let aiNotice: any = null

  if (isDemoProcess) {
    resultado = buildDemoOrganizationResult(proc, {
      kanbanStageId: etapaFallbackId,
      responsavelNome: advogados?.[0]?.full_name || null,
    })
  } else {
    // 5. Chamar IA com fallback seguro entre provedores configurados
    const aiResult = await callLLMWithFallback<any>({
      supabase,
      tenantId: proc.tenant_id,
      useCase: 'organizar_processo',
      request: {
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      },
    })

    if (aiResult.ok === false) {
      return NextResponse.json(
        {
          error: aiResult.notice.message,
          ai_notice: aiResult.notice,
        },
        { status: aiResult.failureKind === 'missing_key' || aiResult.failureKind === 'invalid_key' ? 400 : 503 }
      )
    }

    const aiData = aiResult.data
    aiNotice = aiResult.notice || null
    const rawText = aiData.choices?.[0]?.message?.content || ''

    try {
      const clean = rawText.replace(/```json|```/g, '').trim()
      resultado = JSON.parse(clean)
    } catch {
      return NextResponse.json({ error: 'IA retornou JSON inválido', raw: rawText }, { status: 500 })
    }
  }

  const etapaValida = etapasDisponiveis.find((s: any) => s.id === resultado.kanban_stage_id)
  const etapaSemantica = escolherEtapaSemantica(etapasVisiveis, [
    resultado?.proxima_acao_sugerida || '',
    resultado?.resumo_curto || '',
    ...(Array.isArray(resultado?.prazos) ? resultado.prazos.map((p: any) => p?.descricao || '') : []),
    ...movimentacoes.map((m: any) => m?.texto || m?.descricao || m?.tipo || ''),
  ])

  const etapaEscolhidaId = (etapaValida && !etapaEhMovimentacoes(etapaValida.name)
    ? etapaValida.id
    : etapaSemantica || etapaFallbackId) || null

  // 6. Persistir resultado
  const agora = new Date().toISOString()

  const { data: procAtualizado } = await supabase
    .from('monitored_processes')
    .update({
      resumo_curto:            resultado.resumo_curto,
      proxima_acao_sugerida:   resultado.proxima_acao_sugerida,
      urgencia_nivel:          resultado.urgencia_nivel || 'verde',
      ultima_organizacao_ia:   agora,
      organizacao_ia_json:     resultado,
      updated_at:              agora
    })
    .eq('id', processo_id)
    .select()
    .single()

  // 7. Criar prazos
  if (resultado.prazos?.length > 0) {
    const { data: existentes } = await supabase
      .from('process_prazos')
      .select('tipo, descricao, data_vencimento')
      .eq('monitored_process_id', processo_id)

    const chavesExistentes = new Set(
      (existentes || []).map((p: any) => chavePrazoCanonica(p.tipo || 'prazo', p.descricao || '', p.data_vencimento))
    )

    const prazosInsert = resultado.prazos
      .filter((p: any) => p.data_vencimento_iso)
      .map((p: any) => {
        const tipo = p.tipo || 'prazo'
        const descricao = p.descricao || ''
        const dataVencimento = p.data_vencimento_iso
        const chave = chavePrazoCanonica(tipo, descricao, dataVencimento)

        if (chavesExistentes.has(chave)) return null
        chavesExistentes.add(chave)

        const responsavel = advogados?.find(a =>
          a.full_name?.toLowerCase().includes(
            (p.responsavel_nome || '').toLowerCase()
          )
        )
        return {
          tenant_id:              proc.tenant_id,
          monitored_process_id:   processo_id,
          tipo,
          descricao,
          data_vencimento:        dataVencimento,
          prioridade:             p.prioridade || 'media',
          responsavel_id:         responsavel?.id || null,
          criado_por_ia:          true
        }
      })
      .filter(Boolean)
    if (prazosInsert.length > 0) {
      await supabase.from('process_prazos').upsert(
        prazosInsert as any,
        {
          onConflict: 'monitored_process_id,tipo,descricao,data_vencimento',
          ignoreDuplicates: true
        }
      )
    }
  }

  // 8. Mover Kanban se processo já estiver vinculado
  let novoCard: { id: string } | null = null

  if (proc.linked_task_id && etapaEscolhidaId) {
    const partes = proc.partes as any
    const cardClientName = buildProcessCardClientName({ ...proc, partes })
    const cardDescription = buildProcessCardDescription({
      processo: { ...proc, partes },
      resumoCurto: resultado.resumo_curto,
      proximaAcao: resultado.proxima_acao_sugerida,
    })

    await supabase
      .from('process_tasks')
      .update({
        stage_id: etapaEscolhidaId,
        client_name: linkedTaskContext?.client_name || cardClientName,
        description: linkedTaskContext?.description || cardDescription,
        updated_at: agora,
      })
      .eq('id', proc.linked_task_id)
  }

  // 8b. Criar card no Kanban se ainda não existe
  if (!proc.linked_task_id && etapaEscolhidaId && pipelineId) {
    const partes = proc.partes as any
    const cardTitle = buildProcessCardTitle({ ...proc, partes })
    const cardClientName = buildProcessCardClientName({ ...proc, partes })
    const cardDescription = buildProcessCardDescription({
      processo: { ...proc, partes },
      resumoCurto: resultado.resumo_curto,
      proximaAcao: resultado.proxima_acao_sugerida,
    })

    // Buscar admin do tenant para assigned_to
    const { data: advResp } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('tenant_id', proc.tenant_id)
      .eq('role', 'Administrador')
      .single()

    const { data: cardCriado } = await supabase
      .from('process_tasks')
      .insert({
        pipeline_id:    pipelineId,
        stage_id:       etapaEscolhidaId,
        title:          cardTitle,
        description:    cardDescription,
        client_name:    cardClientName,
        reu:            partes?.polo_passivo || partes?.passivo || '',
        processo_1grau: proc.numero_processo,
        demanda:        proc.assunto || proc.classe_processual || '',
        orgao_julgador: proc.vara || proc.comarca || '',
        valor_causa:    proc.valor_causa ? parseFloat(String(proc.valor_causa).replace(/[^\d,]/g, '').replace(',', '.')) || 0 : 0,
        andamento_1grau: resultado.proxima_acao_sugerida || '',
        prazo_fatal:    resultado.prazos?.[0]?.data_vencimento_iso || null,
        sector:         'juridico',
        tags:           [proc.tribunal || 'TJRJ'],
        position_index: 0,
        assigned_to:    advResp?.id || null,
      })
      .select('*')
      .single()

    novoCard = cardCriado

    if (cardCriado?.id) {
      await syncAgendaTaskBySource(
        supabase,
        buildAgendaPayloadFromProcessTask({
          tenantId: proc.tenant_id,
          task: cardCriado,
          assignedName: advResp?.full_name || null,
          createdBy: user.id,
          createdByAgent: 'organizar_processo',
        })
      )
    }

    if (novoCard?.id) {
      await supabase
        .from('monitored_processes')
        .update({ linked_task_id: novoCard.id, updated_at: agora })
        .eq('id', processo_id)

      if (procAtualizado) {
        (procAtualizado as any).linked_task_id = novoCard.id
      }
    }
  }

  const organizedTaskId = proc.linked_task_id || novoCard?.id || null
  let documentOrganization: ReturnType<typeof buildDocumentOrganizationSummary> | null = null
  let documentMemory: any = null

  if (organizedTaskId) {
    const [{ data: documents }, { data: memory }] = await Promise.all([
      supabase
        .from('process_documents')
        .select('name, document_type, extraction_status, classification_status, folder_label')
        .eq('process_task_id', organizedTaskId)
        .limit(200),
      supabase
        .from('process_document_memory')
        .select('document_count, sync_status, last_synced_at, summary_master, missing_documents')
        .eq('process_task_id', organizedTaskId)
        .maybeSingle(),
    ])

    documentOrganization = buildDocumentOrganizationSummary(documents || [])
    documentMemory = memory || null
  }

  return NextResponse.json({
    success: true,
    processo_atualizado: procAtualizado,
    pipeline_id:         pipelineId,
    prazos_criados:      resultado.prazos?.length || 0,
    peca_sugerida:       resultado.peca_sugerida,
    kanban_stage_id:     etapaEscolhidaId,
    kanban_card_criado:  !!novoCard?.id,
    process_task_id:     organizedTaskId,
    document_organization: documentOrganization,
    document_memory:     documentMemory,
    demo:                isDemoProcess,
    whatsapp_resposta_sugerida: resultado.whatsapp_resposta_sugerida || null,
    ai_notice:           aiNotice
  })
}
