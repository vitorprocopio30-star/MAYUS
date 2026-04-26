import { createClient } from "@supabase/supabase-js";
import { createBrainArtifact } from "@/lib/brain/artifacts";
import { buildAgendaPayloadFromProcessTask, syncAgendaTaskBySource } from "@/lib/agenda/userTasks";
import { executeCaseBrainBootstrapFlow } from "@/lib/lex/case-brain-bootstrap";

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ClientMatch = {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  asaas_customer_id: string | null;
};

type BillingArtifactRow = {
  id: string;
  tenant_id: string;
  task_id: string | null;
  run_id: string | null;
  step_id: string | null;
  metadata: Record<string, unknown> | null;
};

type CrmTaskMatch = {
  id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  tags: string[] | null;
  phone: string | null;
  sector: string | null;
  value: number | null;
};

type ProcessPipelineRow = { id: string; name: string | null };
type ProcessStageRow = { id: string; name: string | null; order_index: number | null; is_win: boolean | null; is_loss: boolean | null };
type CaseRow = { id: string; tenant_id: string; client_name: string; status: string | null };
type ProcessTaskRow = {
  id: string;
  tenant_id: string;
  pipeline_id: string;
  stage_id: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  value: number | null;
  tags: string[] | null;
  phone: string | null;
  sector: string | null;
  data_ultima_movimentacao: string | null;
  client_name?: string | null;
};

type BrainTaskBootstrapRow = { id: string };
type BrainBootstrapRefs = { taskId: string; runId: string; stepId: string; created: boolean };

function getString(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function getNumber(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const normalized = Number(value.replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(normalized)) return normalized;
  }
  return null;
}

async function resolveTenantAndClient(customerId: string) {
  const { data: tenant } = await serviceSupabase
    .from("tenants")
    .select("id")
    .eq("asaas_customer_id", customerId)
    .maybeSingle<{ id: string }>();

  if (tenant?.id) {
    return { tenantId: tenant.id, tenantBilling: true, client: null as ClientMatch | null };
  }

  const { data: client } = await serviceSupabase
    .from("clients")
    .select("id, tenant_id, name, phone, email, asaas_customer_id")
    .eq("asaas_customer_id", customerId)
    .maybeSingle<ClientMatch>();

  if (!client) {
    return null;
  }

  return { tenantId: client.tenant_id, tenantBilling: false, client };
}

async function findBillingArtifact(tenantId: string, paymentId: string) {
  const { data } = await serviceSupabase
    .from("brain_artifacts")
    .select("id, tenant_id, task_id, run_id, step_id, metadata")
    .eq("tenant_id", tenantId)
    .eq("artifact_type", "asaas_billing")
    .eq("metadata->>cobranca_id", paymentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<BillingArtifactRow>();

  return data || null;
}

async function resolveCrmTask(tenantId: string, billingArtifact: BillingArtifactRow | null) {
  const crmTaskId = getString(billingArtifact?.metadata, "crm_task_id");
  if (!crmTaskId) return null;

  const { data } = await serviceSupabase
    .from("crm_tasks")
    .select("id, pipeline_id, stage_id, title, description, assigned_to, tags, phone, sector, value")
    .eq("tenant_id", tenantId)
    .eq("id", crmTaskId)
    .maybeSingle<CrmTaskMatch>();

  return data || null;
}

async function resolveOrCreateCase(tenantId: string, clientName: string) {
  const { data: existing } = await serviceSupabase
    .from("cases")
    .select("id, tenant_id, client_name, status")
    .eq("tenant_id", tenantId)
    .eq("client_name", clientName)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<CaseRow>();

  if (existing?.id) {
    return existing;
  }

  const { data, error } = await serviceSupabase
    .from("cases")
    .insert({
      tenant_id: tenantId,
      client_name: clientName,
      status: "Ativo",
    })
    .select("id, tenant_id, client_name, status")
    .single<CaseRow>();

  if (error || !data) {
    throw error || new Error("Nao foi possivel criar o caso juridico.");
  }

  return data;
}

async function ensureProcessPipeline(tenantId: string) {
  const { data: existingPipelines } = await serviceSupabase
    .from("process_pipelines")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  let pipeline = (existingPipelines?.[0] || null) as ProcessPipelineRow | null;

  if (!pipeline) {
    const { data: newPipeline, error: pipelineError } = await serviceSupabase
      .from("process_pipelines")
      .insert({
        tenant_id: tenantId,
        name: "Casos MAYUS",
        description: "Pipeline criado automaticamente pelo loop revenue-to-case do MAYUS.",
      })
      .select("id, name")
      .single<ProcessPipelineRow>();

    if (pipelineError || !newPipeline) {
      throw pipelineError || new Error("Nao foi possivel criar o pipeline processual padrao.");
    }

    pipeline = newPipeline;
  }

  let { data: stages } = await serviceSupabase
    .from("process_stages")
    .select("id, name, order_index, is_win, is_loss")
    .eq("pipeline_id", pipeline.id)
    .order("order_index", { ascending: true });

  if (!stages || stages.length === 0) {
    await serviceSupabase.from("process_stages").insert([
      { pipeline_id: pipeline.id, name: "Entrada", color: "#3b82f6", order_index: 0 },
      { pipeline_id: pipeline.id, name: "Em análise", color: "#fbbf24", order_index: 1 },
      { pipeline_id: pipeline.id, name: "Em andamento", color: "#8b5cf6", order_index: 2 },
      { pipeline_id: pipeline.id, name: "Fechado", color: "#10b981", order_index: 3, is_win: true },
    ]);

    const stagesReload = await serviceSupabase
      .from("process_stages")
      .select("id, name, order_index, is_win, is_loss")
      .eq("pipeline_id", pipeline.id)
      .order("order_index", { ascending: true });
    stages = stagesReload.data || [];
  }

  const openStage = (stages || []).find((stage) => !stage.is_win && !stage.is_loss) || stages?.[0] || null;
  if (!openStage) {
    throw new Error("Nao foi possivel resolver uma etapa inicial do pipeline processual.");
  }

  return { pipeline, stage: openStage as ProcessStageRow };
}

async function resolveAssignedName(assignedTo: string | null) {
  if (!assignedTo) return null;

  const { data } = await serviceSupabase
    .from("profiles")
    .select("full_name")
    .eq("id", assignedTo)
    .maybeSingle<{ full_name: string | null }>();

  return data?.full_name || null;
}

async function moveCrmTaskToWin(params: { tenantId: string; crmTask: CrmTaskMatch | null; value: number | null }) {
  if (!params.crmTask) return;

  const { data: winStage } = await serviceSupabase
    .from("crm_stages")
    .select("id")
    .eq("pipeline_id", params.crmTask.pipeline_id)
    .eq("is_win", true)
    .maybeSingle<{ id: string }>();

  const updatePayload: Record<string, unknown> = {
    value: params.value ?? params.crmTask.value ?? 0,
    data_ultima_movimentacao: new Date().toISOString(),
    tags: Array.from(new Set([...(params.crmTask.tags || []), "fechado", "asaas_pago", "revenue_to_case"])),
  };

  if (winStage?.id) {
    updatePayload.stage_id = winStage.id;
  }

  await serviceSupabase
    .from("crm_tasks")
    .update(updatePayload)
    .eq("tenant_id", params.tenantId)
    .eq("id", params.crmTask.id);
}

async function createProcessTaskFromBilling(params: {
  tenantId: string;
  clientName: string;
  clientPhone: string | null;
  caseId: string;
  crmTask: CrmTaskMatch | null;
  amount: number | null;
  billingArtifact: BillingArtifactRow | null;
}) {
  const { pipeline, stage } = await ensureProcessPipeline(params.tenantId);

  const { data: stageTasks } = await serviceSupabase
    .from("process_tasks")
    .select("position_index")
    .eq("tenant_id", params.tenantId)
    .eq("pipeline_id", pipeline.id)
    .eq("stage_id", stage.id)
    .order("position_index", { ascending: false })
    .limit(1);

  const nextPosition = (stageTasks?.[0]?.position_index ?? -1) + 1;
  const amount = params.amount;
  const legalArea = getString(params.billingArtifact?.metadata, "legal_area");
  const serviceTitle = params.crmTask?.title || `${params.clientName} - Novo caso`;
  const descriptionParts = [
    "Caso aberto automaticamente apos confirmacao de pagamento no Asaas.",
    getString(params.billingArtifact?.metadata, "nome_cliente") ? `Cliente: ${getString(params.billingArtifact?.metadata, "nome_cliente")}` : null,
    amount !== null ? `Valor confirmado: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount)}` : null,
    getString(params.billingArtifact?.metadata, "vencimento") ? `Vencimento original: ${getString(params.billingArtifact?.metadata, "vencimento")}` : null,
    legalArea ? `Frente: ${legalArea}` : null,
    params.crmTask?.description ? `Contexto comercial:\n${params.crmTask.description}` : null,
  ].filter(Boolean);

  const { data: processTask, error } = await serviceSupabase
    .from("process_tasks")
    .insert({
      tenant_id: params.tenantId,
      pipeline_id: pipeline.id,
      stage_id: stage.id,
      client_id: params.caseId,
      assigned_to: params.crmTask?.assigned_to || null,
      title: serviceTitle,
      description: descriptionParts.join("\n\n"),
      position_index: nextPosition,
      value: amount ?? 0,
      tags: Array.from(new Set([...(params.crmTask?.tags || []), "revenue_to_case", "asaas_pago", "mayus"])),
      phone: params.crmTask?.phone || params.clientPhone || null,
      sector: params.crmTask?.sector || null,
      source: "revenue_to_case",
      demanda: legalArea,
      data_ultima_movimentacao: new Date().toISOString(),
      client_name: params.clientName,
      created_at: new Date().toISOString(),
    })
    .select("id, tenant_id, pipeline_id, stage_id, assigned_to, title, description, value, tags, phone, sector, data_ultima_movimentacao, client_name")
    .single<ProcessTaskRow>();

  if (error || !processTask) {
    throw error || new Error("Nao foi possivel criar o process_task do caso aberto automaticamente.");
  }

  const assignedName = await resolveAssignedName(processTask.assigned_to);
  await syncAgendaTaskBySource(
    serviceSupabase,
    buildAgendaPayloadFromProcessTask({
      tenantId: params.tenantId,
      task: processTask,
      assignedName,
      createdBy: null,
      createdByAgent: "mayus_brain",
    })
  );

  return processTask;
}

async function maybeCreateSale(params: {
  tenantId: string;
  clientName: string;
  professionalId: string | null;
  professionalName: string | null;
  amount: number | null;
  installments: number;
}) {
  const contractDate = new Date().toISOString().slice(0, 10);
  const { data: existing } = await serviceSupabase
    .from("sales")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("client_name", params.clientName)
    .eq("contract_date", contractDate)
    .eq("ticket_total", params.amount ?? 0)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existing?.id) {
    return existing.id;
  }

  const { data, error } = await serviceSupabase
    .from("sales")
    .insert({
      tenant_id: params.tenantId,
      client_name: params.clientName,
      professional_id: params.professionalId,
      professional_name: params.professionalName,
      ticket_total: params.amount ?? 0,
      installments: Math.max(1, params.installments || 1),
      contract_date: contractDate,
      status: "Fechado",
      commission_value: 0,
      estimated_earnings: 0,
      sale_number_month: 1,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw error || new Error("Nao foi possivel registrar a venda confirmada.");
  }

  return data.id;
}

function buildCaseBrainDossier(params: {
  client: ClientMatch;
  clientName: string;
  caseRecord: CaseRow;
  crmTask: CrmTaskMatch | null;
  processTask: ProcessTaskRow;
  billingArtifact: BillingArtifactRow;
  saleId: string;
  legalArea: string | null;
  amount: number | null;
}) {
  const amountFormatted = typeof params.amount === "number"
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(params.amount)
    : null;
  const nextActions = [
    "Confirmar documentos iniciais do cliente.",
    "Definir estratégia jurídica e tese principal.",
    "Validar a frente jurídica e os marcos processuais do caso.",
  ];

  const summary = [
    `# Dossiê Inicial do Case Brain`,
    `## Cliente`,
    `- Nome: ${params.clientName}`,
    params.client.email ? `- Email: ${params.client.email}` : null,
    params.client.phone ? `- Telefone: ${params.client.phone}` : null,
    params.client.asaas_customer_id ? `- Asaas Customer: ${params.client.asaas_customer_id}` : null,
    ``,
    `## Caso`,
    `- Case ID: ${params.caseRecord.id}`,
    `- Status: ${params.caseRecord.status || "Ativo"}`,
    params.legalArea ? `- Frente jurídica: ${params.legalArea}` : null,
    ``,
    `## Origem comercial`,
    params.crmTask?.title ? `- Oportunidade: ${params.crmTask.title}` : null,
    params.crmTask?.id ? `- CRM Task ID: ${params.crmTask.id}` : null,
    amountFormatted ? `- Valor fechado: ${amountFormatted}` : null,
    `- Sale ID: ${params.saleId}`,
    ``,
    `## Abertura operacional`,
    `- Process Task ID: ${params.processTask.id}`,
    `- Etapa inicial: ${params.processTask.stage_id}`,
    params.processTask.assigned_to ? `- Responsável: ${params.processTask.assigned_to}` : null,
    ``,
    `## Próximos passos sugeridos`,
    ...nextActions.map((action) => `- ${action}`),
  ].filter((line): line is string => Boolean(line));

  return {
    dossier: {
      client: {
        id: params.client.id,
        name: params.clientName,
        email: params.client.email,
        phone: params.client.phone,
        asaas_customer_id: params.client.asaas_customer_id,
      },
      case: {
        id: params.caseRecord.id,
        status: params.caseRecord.status || "Ativo",
        legal_area: params.legalArea,
      },
      commercial_origin: {
        crm_task_id: params.crmTask?.id || null,
        crm_title: params.crmTask?.title || null,
        sale_id: params.saleId,
        amount: params.amount,
      },
      operational_opening: {
        process_task_id: params.processTask.id,
        stage_id: params.processTask.stage_id,
        assigned_to: params.processTask.assigned_to,
      },
      billing: {
        billing_artifact_id: params.billingArtifact.id,
        due_date: getString(params.billingArtifact.metadata, "vencimento"),
        payment_link: getString(params.billingArtifact.metadata, "payment_link") || getString(params.billingArtifact.metadata, "invoice_url"),
      },
      next_actions: nextActions,
    },
    summaryMarkdown: summary.join("\n"),
  };
}

async function executeCaseBrainBootstrap(params: {
  tenantId: string;
  refs: BrainBootstrapRefs;
  client: ClientMatch;
  clientName: string;
  caseRecord: CaseRow;
  crmTask: CrmTaskMatch | null;
  processTask: ProcessTaskRow;
  billingArtifact: BillingArtifactRow;
  saleId: string;
  legalArea: string | null;
  amount: number | null;
}) {
  await executeCaseBrainBootstrapFlow({
    tenantId: params.tenantId,
    refs: params.refs,
    client: {
      id: params.client.id,
      name: params.client.name,
      email: params.client.email,
      phone: params.client.phone,
      asaas_customer_id: params.client.asaas_customer_id,
    },
    clientName: params.clientName,
    caseRecord: {
      id: params.caseRecord.id,
      status: params.caseRecord.status,
    },
    crmTask: params.crmTask,
    processTask: params.processTask,
    billingArtifact: {
      id: params.billingArtifact.id,
      metadata: params.billingArtifact.metadata,
    },
    saleId: params.saleId,
    legalArea: params.legalArea,
    amount: params.amount,
  });
}

async function bootstrapCaseBrainTask(params: {
  tenantId: string;
  clientId: string;
  clientName: string;
  caseId: string;
  processTaskId: string;
  legalArea: string | null;
  sourceTaskId: string | null;
  sourceRunId: string | null;
  sourceStepId: string | null;
}): Promise<BrainBootstrapRefs> {
  const { data: existing } = await serviceSupabase
    .from("brain_tasks")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("module", "lex")
    .eq("task_context->>case_id", params.caseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<BrainTaskBootstrapRow>();

  if (existing?.id) {
    const { data: run } = await serviceSupabase
      .from("brain_runs")
      .select("id")
      .eq("task_id", existing.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>();

    const { data: step } = run
      ? await serviceSupabase
          .from("brain_steps")
          .select("id")
          .eq("run_id", run.id)
          .order("order_index", { ascending: true })
          .limit(1)
          .maybeSingle<{ id: string }>()
      : { data: null };

    if (run?.id && step?.id) {
      return { taskId: existing.id, runId: run.id, stepId: step.id, created: false };
    }

    throw new Error("Missao lex existente sem run/step validos para bootstrap do Case Brain.");
  }

  const now = new Date().toISOString();
  const title = `Bootstrap Case Brain - ${params.clientName}`;
  const goal = `Montar o Case Brain inicial do novo caso aberto para ${params.clientName}, consolidando dossiê, frente jurídica e próximos passos.`;

  const { data: task, error: taskError } = await serviceSupabase
    .from("brain_tasks")
    .insert({
      tenant_id: params.tenantId,
      created_by: null,
      channel: "system",
      module: "lex",
      status: "queued",
      title,
      goal,
      task_input: {
        trigger: "revenue_to_case",
        client_id: params.clientId,
        client_name: params.clientName,
        case_id: params.caseId,
        process_task_id: params.processTaskId,
      },
      task_context: {
        source: "revenue_to_case",
        client_id: params.clientId,
        case_id: params.caseId,
        process_task_id: params.processTaskId,
        legal_area: params.legalArea,
        source_task_id: params.sourceTaskId,
        source_run_id: params.sourceRunId,
        source_step_id: params.sourceStepId,
      },
      policy_snapshot: {
        bootstrap: true,
        requires_human_confirmation: false,
      },
    })
    .select("id")
    .single<BrainTaskBootstrapRow>();

  if (taskError || !task) {
    throw taskError || new Error("Nao foi possivel criar a missao inicial do Case Brain.");
  }

  const { data: run, error: runError } = await serviceSupabase
    .from("brain_runs")
    .insert({
      task_id: task.id,
      tenant_id: params.tenantId,
      attempt_number: 1,
      status: "queued",
      started_at: null,
    })
    .select("id")
    .single<{ id: string }>();

  if (runError || !run) {
    throw runError || new Error("Nao foi possivel criar a execucao inicial do Case Brain.");
  }

  const { data: step, error: stepError } = await serviceSupabase
    .from("brain_steps")
    .insert({
      task_id: task.id,
      run_id: run.id,
      tenant_id: params.tenantId,
      order_index: 1,
      step_key: "case_brain_bootstrap",
      title: "Carregar dossiê inicial do caso",
      step_type: "planner",
      status: "queued",
      input_payload: {
        trigger: "revenue_to_case",
        client_id: params.clientId,
        client_name: params.clientName,
        case_id: params.caseId,
        process_task_id: params.processTaskId,
        legal_area: params.legalArea,
      },
    })
    .select("id")
    .single<{ id: string }>();

  if (stepError || !step) {
    throw stepError || new Error("Nao foi possivel criar o step inicial do Case Brain.");
  }

  await serviceSupabase.from("learning_events").insert({
    tenant_id: params.tenantId,
    task_id: task.id,
    run_id: run.id,
    step_id: step.id,
    event_type: "case_brain_bootstrap_requested",
    source_module: "lex",
    payload: {
      trigger: "revenue_to_case",
      client_id: params.clientId,
      client_name: params.clientName,
      case_id: params.caseId,
      process_task_id: params.processTaskId,
      legal_area: params.legalArea,
      created_at: now,
    },
    created_by: null,
  });

  return { taskId: task.id, runId: run.id, stepId: step.id, created: true };
}

export async function openCaseFromConfirmedBilling(params: {
  paymentId: string;
  customerId: string;
  paymentValue?: number | null;
}) {
  const resolved = await resolveTenantAndClient(params.customerId);
  if (!resolved || resolved.tenantBilling) {
    return { handled: false as const, reason: resolved ? "tenant_billing" : "not_found" };
  }

  const existingRevenueArtifact = await serviceSupabase
    .from("brain_artifacts")
    .select("id")
    .eq("tenant_id", resolved.tenantId)
    .eq("artifact_type", "revenue_case_opening")
    .eq("metadata->>payment_id", params.paymentId)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existingRevenueArtifact.data?.id) {
    return { handled: true as const, reason: "already_processed" };
  }

  const billingArtifact = await findBillingArtifact(resolved.tenantId, params.paymentId);
  if (!billingArtifact) {
    return { handled: false as const, reason: "billing_artifact_not_found", tenantId: resolved.tenantId, clientId: resolved.client?.id || null };
  }

  const client = resolved.client;
  if (!client) {
    return { handled: false as const, reason: "client_not_found", tenantId: resolved.tenantId };
  }

  const crmTask = await resolveCrmTask(resolved.tenantId, billingArtifact);
  const amount = getNumber(billingArtifact.metadata, "valor") ?? params.paymentValue ?? crmTask?.value ?? 0;
  const clientName = getString(billingArtifact.metadata, "client_name") || getString(billingArtifact.metadata, "nome_cliente") || client.name;
  const legalArea = getString(billingArtifact.metadata, "legal_area");
  const caseRecord = await resolveOrCreateCase(resolved.tenantId, clientName);
  const professionalName = await resolveAssignedName(crmTask?.assigned_to || null);

  await moveCrmTaskToWin({ tenantId: resolved.tenantId, crmTask, value: amount });

  const processTask = await createProcessTaskFromBilling({
    tenantId: resolved.tenantId,
    clientName,
    clientPhone: client.phone,
    caseId: caseRecord.id,
    crmTask,
    amount,
    billingArtifact,
  });

  const saleId = await maybeCreateSale({
    tenantId: resolved.tenantId,
    clientName,
    professionalId: crmTask?.assigned_to || null,
    professionalName,
    amount,
    installments: Math.max(1, Math.round(getNumber(billingArtifact.metadata, "parcelas") ?? 1)),
  });

  const caseBrainRefs = await bootstrapCaseBrainTask({
    tenantId: resolved.tenantId,
    clientId: client.id,
    clientName,
    caseId: caseRecord.id,
    processTaskId: processTask.id,
    legalArea,
    sourceTaskId: billingArtifact.task_id,
    sourceRunId: billingArtifact.run_id,
    sourceStepId: billingArtifact.step_id,
  });

  await executeCaseBrainBootstrap({
    tenantId: resolved.tenantId,
    refs: caseBrainRefs,
    client,
    clientName,
    caseRecord,
    crmTask,
    processTask,
    billingArtifact,
    saleId,
    legalArea,
    amount,
  });

  if (billingArtifact.task_id) {
    await createBrainArtifact({
      tenantId: resolved.tenantId,
      taskId: billingArtifact.task_id,
      runId: billingArtifact.run_id,
      stepId: billingArtifact.step_id,
      artifactType: "revenue_case_opening",
      title: `Caso aberto - ${clientName}`,
      dedupeKey: `payment:${params.paymentId}`,
      metadata: {
        payment_id: params.paymentId,
        customer_id: params.customerId,
        client_id: client.id,
        crm_task_id: crmTask?.id || null,
        process_task_id: processTask.id,
        case_id: caseRecord.id,
        sale_id: saleId,
        case_brain_task_id: caseBrainRefs.taskId,
      },
    });

    await serviceSupabase.from("learning_events").insert({
      tenant_id: resolved.tenantId,
      task_id: billingArtifact.task_id,
      run_id: billingArtifact.run_id,
      step_id: billingArtifact.step_id,
      event_type: "revenue_to_case_completed",
      source_module: "financeiro",
      payload: {
        payment_id: params.paymentId,
        customer_id: params.customerId,
        client_id: client.id,
        crm_task_id: crmTask?.id || null,
        process_task_id: processTask.id,
        case_id: caseRecord.id,
        sale_id: saleId,
        case_brain_task_id: caseBrainRefs.taskId,
      },
      created_by: crmTask?.assigned_to || null,
    });
  }

  return {
    handled: true as const,
    reason: "case_opened",
    tenantId: resolved.tenantId,
    clientId: client.id,
    caseId: caseRecord.id,
    processTaskId: processTask.id,
    saleId,
    caseBrainTaskId: caseBrainRefs.taskId,
  };
}
