import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

const JURIDICO_PIPELINE_ID = '7b4d39bb-785c-402a-826d-0088867d934c'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { monitored_process_id, numero_processo, description, tenant_id } = body

    if (!monitored_process_id || !tenant_id) {
      return NextResponse.json({ error: 'monitored_process_id e tenant_id são obrigatórios.' }, { status: 400 })
    }

    // Busca o primeiro stage do pipeline jurídico
    const { data: stage, error: stageErr } = await supabaseAdmin
      .from('process_stages')
      .select('id')
      .eq('pipeline_id', JURIDICO_PIPELINE_ID)
      .order('position_index', { ascending: true })
      .limit(1)
      .single()

    if (stageErr || !stage) {
      return NextResponse.json({ error: 'Stage do pipeline jurídico não encontrado.' }, { status: 500 })
    }

    // Cria o card no Kanban com service role (bypassa RLS de pipeline_id)
    const { data: task, error: taskErr } = await supabaseAdmin
      .from('process_tasks')
      .insert({
        pipeline_id: JURIDICO_PIPELINE_ID,
        stage_id: stage.id,
        tenant_id,
        title: numero_processo || 'Anotação de Processo',
        description: description || '',
        sector: 'juridico',
        position_index: 0,
      })
      .select('id, description, title, created_at')
      .single()

    if (taskErr || !task) {
      console.error('[SALVAR_ANOTACAO] Erro ao criar process_task:', taskErr)
      return NextResponse.json({ error: 'Erro ao criar anotação.', details: taskErr }, { status: 500 })
    }

    // Vincula os prazos deste processo ao novo card
    await supabaseAdmin
      .from('process_prazos')
      .update({ process_task_id: task.id })
      .eq('monitored_process_id', monitored_process_id)
      .is('process_task_id', null)

    return NextResponse.json({ task })
  } catch (err: any) {
    console.error('[SALVAR_ANOTACAO]', err)
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}
