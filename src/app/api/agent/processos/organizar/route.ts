import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
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

  // 2. Buscar advogados do tenant
  const { data: advogados } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('tenant_id', proc.tenant_id)
    .in('role', ['Administrador', 'advogado', 'socio'])

  // 3. Buscar TODAS as integrations do tenant (IA + Escavador)
  const { data: integrations } = await supabase
    .from('tenant_integrations')
    .select('provider, api_key')
    .eq('tenant_id', proc.tenant_id)
    .in('provider', ['openrouter', 'openai', 'escavador'])

  const openrouterKey  = integrations?.find(i => i.provider === 'openrouter')?.api_key
  const openaiKey      = integrations?.find(i => i.provider === 'openai')?.api_key
  const escavadorKey   = integrations?.find(i => i.provider === 'escavador')?.api_key || process.env.ESCAVADOR_API_KEY
  const aiKey          = openrouterKey || openaiKey
  if (!aiKey) return NextResponse.json({ error: 'Chave de IA não configurada' }, { status: 400 })

  const isOpenRouter = !!openrouterKey

  // 3b. Buscar movimentações reais do Escavador se tiver escavador_id
  let movimentacoesEscavador: any[] = Array.isArray(proc.movimentacoes)
    ? proc.movimentacoes : []

  if (proc.escavador_id && escavadorKey) {
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
- RECOLHER DOCUMENTOS  (id: 5ecb8f05-042d-40e7-a093-e1f3ce8478da)
- FAZER INICIAL        (id: 5c5df981-85f0-49c9-a1dc-a2d61bb5a617)
- PROTOCOLAR INICIAL   (id: fcf23a26-8bac-49b4-b143-1588c661b794)
- NEGOCIAÇÃO           (id: 1aac8658-1941-4661-9146-75ceb65d3b7a)
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

  // 5. Chamar IA
  const aiResp = await fetch(
    isOpenRouter
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aiKey}`,
        'Content-Type': 'application/json',
        ...(isOpenRouter && { 'HTTP-Referer': 'https://mayus-premium-pro.vercel.app' })
      },
      body: JSON.stringify({
        model: isOpenRouter ? 'anthropic/claude-sonnet-4-6' : 'gpt-4o',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    }
  )

  if (!aiResp.ok) {
    const err = await aiResp.text()
    return NextResponse.json({ error: `IA: ${err}` }, { status: 500 })
  }

  const aiData = await aiResp.json()
  const rawText = aiData.choices?.[0]?.message?.content || ''

  let resultado: any
  try {
    const clean = rawText.replace(/```json|```/g, '').trim()
    resultado = JSON.parse(clean)
  } catch {
    return NextResponse.json({ error: 'IA retornou JSON inválido', raw: rawText }, { status: 500 })
  }

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
    const prazosInsert = resultado.prazos
      .filter((p: any) => p.data_vencimento_iso)
      .map((p: any) => {
        const responsavel = advogados?.find(a =>
          a.full_name?.toLowerCase().includes(
            (p.responsavel_nome || '').toLowerCase()
          )
        )
        return {
          tenant_id:              proc.tenant_id,
          monitored_process_id:   processo_id,
          tipo:                   p.tipo || 'prazo',
          descricao:              p.descricao,
          data_vencimento:        p.data_vencimento_iso,
          prioridade:             p.prioridade || 'media',
          responsavel_id:         responsavel?.id || null,
          criado_por_ia:          true
        }
      })
    if (prazosInsert.length > 0) {
      await supabase.from('process_prazos').insert(prazosInsert)
    }
  }

  // 8. Mover Kanban se processo já estiver vinculado
  let novoCard: { id: string } | null = null

  if (proc.linked_task_id && resultado.kanban_stage_id) {
    await supabase
      .from('process_tasks')
      .update({ stage_id: resultado.kanban_stage_id, updated_at: agora })
      .eq('id', proc.linked_task_id)
  }

  // 8b. Criar card no Kanban se ainda não existe
  if (!proc.linked_task_id && resultado.kanban_stage_id) {
    const partes = proc.partes as any

    // Buscar admin do tenant para assigned_to
    const { data: advResp } = await supabase
      .from('profiles')
      .select('id')
      .eq('tenant_id', proc.tenant_id)
      .eq('role', 'Administrador')
      .single()

    const { data: cardCriado } = await supabase
      .from('process_tasks')
      .insert({
        pipeline_id:    '7b4d39bb-785c-402a-826d-0088867d934c',
        stage_id:       resultado.kanban_stage_id,
        title:          proc.cliente_nome || partes?.polo_ativo || partes?.ativo || proc.numero_processo,
        description:    resultado.resumo_curto,
        client_name:    proc.cliente_nome || partes?.polo_ativo || partes?.ativo || '',
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
      .select('id')
      .single()

    novoCard = cardCriado

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

  return NextResponse.json({
    success: true,
    processo_atualizado: procAtualizado,
    prazos_criados:      resultado.prazos?.length || 0,
    peca_sugerida:       resultado.peca_sugerida,
    kanban_card_criado:  !!novoCard?.id
  })
}
