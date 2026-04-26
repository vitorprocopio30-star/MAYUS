import { NextRequest, NextResponse } from 'next/server'
import { getTenantSession } from '@/lib/auth/get-tenant-session'
import { supabaseAdmin } from '@/lib/supabase/admin'

const JURIDICO_PIPELINE_ID = '7b4d39bb-785c-402a-826d-0088867d934c'

export async function POST(req: NextRequest) {
  try {
    const session = await getTenantSession()
    const body = await req.json()
    const { monitored_process_id, numero_processo, description, tenant_id, process_task_id, task_id } = body
    const processTaskId = process_task_id || task_id
    const tenantId = session.tenantId

    if (tenant_id && tenant_id !== tenantId) {
      return NextResponse.json({ error: 'Tenant invalido para a sessao.' }, { status: 403 })
    }

    if (!monitored_process_id) {
      return NextResponse.json({ error: 'monitored_process_id e obrigatorio.' }, { status: 400 })
    }

    const { data: monitoredProcess, error: monitoredProcessErr } = await supabaseAdmin
      .from('monitored_processes')
      .select('id, numero_processo')
      .eq('id', monitored_process_id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (monitoredProcessErr) {
      return NextResponse.json({ error: monitoredProcessErr.message }, { status: 500 })
    }

    if (!monitoredProcess) {
      return NextResponse.json({ error: 'Processo monitorado nao encontrado para este tenant.' }, { status: 404 })
    }

    if (processTaskId) {
      const { data: task, error: taskErr } = await supabaseAdmin
        .from('process_tasks')
        .update({
          description: description || '',
          updated_at: new Date().toISOString(),
        })
        .eq('id', processTaskId)
        .eq('tenant_id', tenantId)
        .select('id, description, title, created_at')
        .maybeSingle()

      if (taskErr) {
        console.error('[SALVAR_ANOTACAO] Erro ao atualizar process_task:', taskErr)
        return NextResponse.json({ error: 'Erro ao atualizar anotacao.', details: taskErr }, { status: 500 })
      }

      if (!task) {
        return NextResponse.json({ error: 'Card nao encontrado para este tenant.' }, { status: 404 })
      }

      await supabaseAdmin
        .from('process_prazos')
        .update({ process_task_id: task.id })
        .eq('monitored_process_id', monitored_process_id)
        .is('process_task_id', null)

      return NextResponse.json({ task })
    }

    const { data: stage, error: stageErr } = await supabaseAdmin
      .from('process_stages')
      .select('id, process_pipelines!inner(tenant_id)')
      .eq('pipeline_id', JURIDICO_PIPELINE_ID)
      .eq('process_pipelines.tenant_id', tenantId)
      .order('order_index', { ascending: true })
      .limit(1)
      .single()

    if (stageErr || !stage) {
      return NextResponse.json({ error: 'Stage do pipeline juridico nao encontrado.' }, { status: 500 })
    }

    const { data: task, error: taskErr } = await supabaseAdmin
      .from('process_tasks')
      .insert({
        pipeline_id: JURIDICO_PIPELINE_ID,
        stage_id: stage.id,
        tenant_id: tenantId,
        title: numero_processo || monitoredProcess.numero_processo || 'Anotacao de Processo',
        description: description || '',
        sector: 'juridico',
        position_index: 0,
      })
      .select('id, description, title, created_at')
      .single()

    if (taskErr || !task) {
      console.error('[SALVAR_ANOTACAO] Erro ao criar process_task:', taskErr)
      return NextResponse.json({ error: 'Erro ao criar anotacao.', details: taskErr }, { status: 500 })
    }

    await supabaseAdmin
      .from('process_prazos')
      .update({ process_task_id: task.id })
      .eq('monitored_process_id', monitored_process_id)
      .is('process_task_id', null)

    return NextResponse.json({ task })
  } catch (err: any) {
    console.error('[SALVAR_ANOTACAO]', err)
    if (err?.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (err?.message === 'TenantNotFound') {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 400 })
    }
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 })
  }
}
