import { createClient } from "@supabase/supabase-js";
import { buildAgendaPayloadFromCrmTask, syncAgendaTaskBySource } from "@/lib/agenda/userTasks";

const serviceSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ProposalEntities = Record<string, string>;

type ProposalProjectionResult = {
  proposalText: string;
  crmTaskId: string | null;
  pipelineId: string | null;
  stageId: string | null;
  created: boolean;
  projectedToCrm: boolean;
};

type CrmPipelineRow = {
  id: string;
  name: string | null;
  created_at?: string;
};

type CrmStageRow = {
  id: string;
  name: string | null;
  order_index: number | null;
  is_win?: boolean | null;
  is_loss?: boolean | null;
};

type CrmTaskRow = {
  id: string;
  tenant_id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  description: string | null;
  position_index: number | null;
  assigned_to: string | null;
  tags: string[] | null;
  phone: string | null;
  sector: string | null;
  department_id: string | null;
  value: number | null;
  created_at: string | null;
  data_ultima_movimentacao: string | null;
};

function parseAmount(value: string | undefined) {
  const normalized = Number(String(value || "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : null;
}

function formatMoney(value: number | null) {
  if (value === null) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function normalizeTags(raw: string | undefined) {
  const baseTags = String(raw || "")
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);

  return Array.from(new Set(["proposta", "mayus", ...baseTags]));
}

function buildProposalText(entities: ProposalEntities) {
  const clientName = entities.client_name || entities.nome_cliente || entities.lead_name || entities.contact_name || "Cliente";
  const legalArea = entities.legal_area || entities.area || entities.segmento || entities.matter || "Atuacao juridica";
  const objective = entities.objective || entities.objetivo || entities.scope || entities.servico || "Conducao completa do caso";
  const deliverables = entities.deliverables || entities.entregaveis || entities.escopo || entities.scope_details || "Analise inicial, estrategia, acompanhamento e comunicacao com o cliente.";
  const totalValue = parseAmount(entities.total_value || entities.valor_total || entities.valor);
  const entryValue = parseAmount(entities.entry_value || entities.valor_entrada);
  const installments = entities.installments || entities.parcelas || "";
  const paymentTerms = entities.payment_terms || entities.condicoes_pagamento || entities.billing_terms || "Pagamento conforme cronograma comercial do escritorio.";
  const nextStep = entities.next_step || entities.proximo_passo || "Aprovacao da proposta, assinatura do contrato e geracao da cobranca inicial.";
  const notes = entities.notes || entities.observacoes || entities.obs || "";

  const sections = [
    `# Proposta Comercial MAYUS`,
    `## Cliente`,
    `- Nome: ${clientName}`,
    `- Frente: ${legalArea}`,
    ``,
    `## Objetivo`,
    objective,
    ``,
    `## Escopo da proposta`,
    deliverables,
    ``,
    `## Condicoes comerciais`,
    totalValue !== null ? `- Investimento total: ${formatMoney(totalValue)}` : null,
    entryValue !== null ? `- Entrada sugerida: ${formatMoney(entryValue)}` : null,
    installments ? `- Parcelamento: ${installments}` : null,
    `- Condicoes: ${paymentTerms}`,
    ``,
    `## Proximo passo sugerido`,
    nextStep,
    notes ? "" : null,
    notes ? `## Observacoes` : null,
    notes || null,
  ].filter((value): value is string => Boolean(value));

  return sections.join("\n");
}

async function resolveCommercialPipeline(tenantId: string, requestedPipelineId?: string) {
  if (requestedPipelineId) {
    const { data } = await serviceSupabase
      .from("crm_pipelines")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("id", requestedPipelineId)
      .maybeSingle<CrmPipelineRow>();
    if (data) return data;
  }

  const { data } = await serviceSupabase
    .from("crm_pipelines")
    .select("id, name, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  if (!data || data.length === 0) return null;

  const commercialPipeline = data.find((pipeline) => /crm|comercial|vendas|leads/i.test(String(pipeline.name || "")));
  return (commercialPipeline || data[0]) as CrmPipelineRow;
}

async function resolveProposalStage(pipelineId: string) {
  const { data } = await serviceSupabase
    .from("crm_stages")
    .select("id, name, order_index, is_win, is_loss")
    .eq("pipeline_id", pipelineId)
    .order("order_index", { ascending: true });

  if (!data || data.length === 0) return null;

  const proposalStage = data.find((stage) => /proposta|proposal|orcamento|orçamento/i.test(String(stage.name || "")));
  if (proposalStage) return proposalStage as CrmStageRow;

  const negotiationStage = data.find((stage) => /negoci|follow/i.test(String(stage.name || "")) && !stage.is_win && !stage.is_loss);
  if (negotiationStage) return negotiationStage as CrmStageRow;

  const firstOpenStage = data.find((stage) => !stage.is_win && !stage.is_loss);
  return (firstOpenStage || data[0]) as CrmStageRow;
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

function buildProjectedDescription(existingDescription: string | null, proposalText: string) {
  const marker = "## Proposta MAYUS";
  const proposalSection = `${marker}\n\n${proposalText}`;

  if (!existingDescription || !existingDescription.trim()) {
    return proposalSection;
  }

  if (existingDescription.includes(marker)) {
    return existingDescription.replace(/## Proposta MAYUS[\s\S]*$/m, proposalSection);
  }

  return `${existingDescription.trim()}\n\n---\n\n${proposalSection}`;
}

export async function generateProposalAndProjectToCrm(params: {
  tenantId: string;
  userId?: string | null;
  entities: ProposalEntities;
}) : Promise<ProposalProjectionResult> {
  const proposalText = buildProposalText(params.entities);
  const requestedTaskId = params.entities.crm_task_id || params.entities.task_id || "";
  const requestedPipelineId = params.entities.pipeline_id || "";
  const value = parseAmount(params.entities.total_value || params.entities.valor_total || params.entities.valor);
  const phone = params.entities.phone_number || params.entities.phone || null;
  const sector = params.entities.sector || params.entities.segmento || null;
  const tags = normalizeTags(params.entities.tags);
  const title = params.entities.title || params.entities.client_name || params.entities.nome_cliente || params.entities.lead_name || "Proposta comercial MAYUS";
  const nowIso = new Date().toISOString();

  let existingTask: CrmTaskRow | null = null;
  if (requestedTaskId) {
    const { data } = await serviceSupabase
      .from("crm_tasks")
      .select("id, tenant_id, pipeline_id, stage_id, title, description, position_index, assigned_to, tags, phone, sector, department_id, value, created_at, data_ultima_movimentacao")
      .eq("tenant_id", params.tenantId)
      .eq("id", requestedTaskId)
      .maybeSingle<CrmTaskRow>();
    existingTask = data || null;
  }

  const pipeline = existingTask
    ? { id: existingTask.pipeline_id, name: null }
    : await resolveCommercialPipeline(params.tenantId, requestedPipelineId || undefined);

  if (!pipeline) {
    return {
      proposalText,
      crmTaskId: null,
      pipelineId: null,
      stageId: null,
      created: false,
      projectedToCrm: false,
    };
  }

  const targetStage = await resolveProposalStage(pipeline.id);
  const targetStageId = targetStage?.id || existingTask?.stage_id || null;

  if (!targetStageId) {
    return {
      proposalText,
      crmTaskId: existingTask?.id || null,
      pipelineId: pipeline.id,
      stageId: null,
      created: false,
      projectedToCrm: false,
    };
  }

  let projectedTask: CrmTaskRow;
  let created = false;

  if (existingTask) {
    const updatePayload = {
      title: existingTask.title || title,
      description: buildProjectedDescription(existingTask.description, proposalText),
      stage_id: targetStageId,
      tags: Array.from(new Set([...(existingTask.tags || []), ...tags])),
      phone: existingTask.phone || phone,
      sector: existingTask.sector || sector,
      value: value ?? existingTask.value,
      data_ultima_movimentacao: nowIso,
      source: "mayus_brain",
    };

    const { data, error } = await serviceSupabase
      .from("crm_tasks")
      .update(updatePayload)
      .eq("id", existingTask.id)
      .eq("tenant_id", params.tenantId)
      .select("id, tenant_id, pipeline_id, stage_id, title, description, position_index, assigned_to, tags, phone, sector, department_id, value, created_at, data_ultima_movimentacao")
      .single<CrmTaskRow>();

    if (error || !data) throw error || new Error("Nao foi possivel atualizar a tarefa do CRM para a proposta.");
    projectedTask = data;
  } else {
    const { data: stageTasks } = await serviceSupabase
      .from("crm_tasks")
      .select("position_index")
      .eq("tenant_id", params.tenantId)
      .eq("pipeline_id", pipeline.id)
      .eq("stage_id", targetStageId)
      .order("position_index", { ascending: false })
      .limit(1);

    const nextPosition = (stageTasks?.[0]?.position_index ?? -1) + 1;
    const insertPayload = {
      tenant_id: params.tenantId,
      pipeline_id: pipeline.id,
      stage_id: targetStageId,
      title,
      description: buildProjectedDescription(null, proposalText),
      position_index: nextPosition,
      assigned_to: params.entities.assigned_to || null,
      tags,
      phone,
      sector,
      department_id: params.entities.department_id || null,
      value,
      data_ultima_movimentacao: nowIso,
      source: "mayus_brain",
    };

    const { data, error } = await serviceSupabase
      .from("crm_tasks")
      .insert(insertPayload)
      .select("id, tenant_id, pipeline_id, stage_id, title, description, position_index, assigned_to, tags, phone, sector, department_id, value, created_at, data_ultima_movimentacao")
      .single<CrmTaskRow>();

    if (error || !data) throw error || new Error("Nao foi possivel criar a tarefa do CRM para a proposta.");
    projectedTask = data;
    created = true;
  }

  const assignedName = await resolveAssignedName(projectedTask.assigned_to);
  await syncAgendaTaskBySource(
    serviceSupabase,
    buildAgendaPayloadFromCrmTask({
      tenantId: params.tenantId,
      task: projectedTask,
      assignedName,
      createdBy: params.userId || null,
      createdByAgent: "mayus_brain",
    })
  );

  return {
    proposalText,
    crmTaskId: projectedTask.id,
    pipelineId: projectedTask.pipeline_id,
    stageId: projectedTask.stage_id,
    created,
    projectedToCrm: true,
  };
}
