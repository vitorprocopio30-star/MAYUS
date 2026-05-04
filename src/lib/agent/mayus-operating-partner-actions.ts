import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MayusOperatingPartnerAction,
  MayusOperatingPartnerDecision,
} from "./mayus-operating-partner";

export type MayusOperatingPartnerActionResult = {
  type: MayusOperatingPartnerAction["type"];
  status: "executed" | "skipped" | "failed";
  detail: string;
  record_id?: string | null;
};

type ExecuteActionsInput = {
  supabase: SupabaseClient;
  tenantId: string;
  contact: {
    id: string;
    name: string | null;
    phone_number: string | null;
    assigned_user_id?: string | null;
  };
  trigger: string;
  actorUserId?: string | null;
  decision: MayusOperatingPartnerDecision;
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizePhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || null;
}

async function getOrCreateCommercialPipeline(params: {
  supabase: SupabaseClient;
  tenantId: string;
}) {
  const { data: existing, error: existingError } = await params.supabase
    .from("crm_pipelines")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existingError) throw existingError;
  if (existing?.id) return existing.id;

  const { data: pipeline, error: pipelineError } = await params.supabase
    .from("crm_pipelines")
    .insert({ tenant_id: params.tenantId, name: "Comercial" })
    .select("id")
    .single<{ id: string }>();

  if (pipelineError || !pipeline?.id) throw pipelineError || new Error("Pipeline comercial nao criado.");

  await params.supabase.from("crm_stages").insert([
    { pipeline_id: pipeline.id, name: "Novo Lead", color: "#3b82f6", order_index: 0 },
    { pipeline_id: pipeline.id, name: "Qualificacao", color: "#fbbf24", order_index: 1 },
    { pipeline_id: pipeline.id, name: "Fechado", color: "#10b981", order_index: 2, is_win: true },
    { pipeline_id: pipeline.id, name: "Perdido", color: "#ef4444", order_index: 3, is_loss: true },
  ]);

  return pipeline.id;
}

async function getDefaultCommercialStage(params: {
  supabase: SupabaseClient;
  pipelineId: string;
}) {
  const { data, error } = await params.supabase
    .from("crm_stages")
    .select("id, name, order_index")
    .eq("pipeline_id", params.pipelineId)
    .order("order_index", { ascending: true });

  if (error) throw error;

  const leadStage = (data || []).find((stage) => String(stage.name || "").toLowerCase().includes("lead"));
  const first = leadStage || data?.[0];
  if (first?.id) return String(first.id);

  const { data: inserted, error: insertError } = await params.supabase
    .from("crm_stages")
    .insert({ pipeline_id: params.pipelineId, name: "Novo Lead", color: "#3b82f6", order_index: 0 })
    .select("id")
    .single<{ id: string }>();

  if (insertError || !inserted?.id) throw insertError || new Error("Etapa comercial nao criada.");
  return inserted.id;
}

async function createOrTouchCrmLead(input: ExecuteActionsInput) {
  const phone = normalizePhone(input.contact.phone_number);
  const pipelineId = await getOrCreateCommercialPipeline({
    supabase: input.supabase,
    tenantId: input.tenantId,
  });
  const stageId = await getDefaultCommercialStage({
    supabase: input.supabase,
    pipelineId,
  });

  if (phone) {
    const { data: existing, error: existingError } = await input.supabase
      .from("crm_tasks")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .eq("phone", phone)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (existingError) throw existingError;
    if (existing?.id) {
      const { error: updateError } = await input.supabase
        .from("crm_tasks")
        .update({ data_ultima_movimentacao: new Date().toISOString() })
        .eq("id", existing.id);
      if (updateError) throw updateError;
      return { id: existing.id, detail: "Lead existente atualizado no CRM." };
    }
  }

  const title = cleanText(input.contact.name) || `Lead WhatsApp ${phone || input.contact.id.slice(0, 8)}`;
  const { data: task, error } = await input.supabase
    .from("crm_tasks")
    .insert({
      tenant_id: input.tenantId,
      pipeline_id: pipelineId,
      stage_id: stageId,
      title,
      description: [
        "Criado pelo MAYUS socio virtual a partir do WhatsApp.",
        `Intencao: ${input.decision.intent}`,
        `Proximo passo: ${input.decision.next_action}`,
        `Resultado esperado: ${input.decision.expected_outcome}`,
      ].join("\n"),
      position_index: 0,
      tags: ["whatsapp", "mayus-socio-virtual", input.decision.intent],
      phone,
      source: "whatsapp_mayus_operating_partner",
      lead_scoring: Math.round(input.decision.confidence * 100),
      data_ultima_movimentacao: new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !task?.id) throw error || new Error("Lead CRM nao criado.");
  return { id: task.id, detail: "Lead criado no CRM." };
}

async function findCrmLead(input: ExecuteActionsInput) {
  const explicitId = cleanText(String(input.decision.actions_to_execute.find((action) => action.payload?.crm_task_id)?.payload?.crm_task_id || ""));
  if (explicitId) return explicitId;

  const phone = normalizePhone(input.contact.phone_number);
  if (!phone) return null;

  const { data, error } = await input.supabase
    .from("crm_tasks")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("phone", phone)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) throw error;
  return data?.id || null;
}

async function updateCrmStage(input: ExecuteActionsInput, action: MayusOperatingPartnerAction) {
  const crmTaskId = cleanText(String(action.payload?.crm_task_id || "")) || await findCrmLead(input);
  if (!crmTaskId) return { id: null, detail: "Nenhum lead CRM encontrado para atualizar etapa." };

  let stageId = cleanText(String(action.payload?.stage_id || ""));
  const stageName = cleanText(String(action.payload?.stage_name || action.payload?.stage || ""));

  if (!stageId && stageName) {
    const { data: task, error: taskError } = await input.supabase
      .from("crm_tasks")
      .select("pipeline_id")
      .eq("tenant_id", input.tenantId)
      .eq("id", crmTaskId)
      .maybeSingle<{ pipeline_id: string | null }>();
    if (taskError) throw taskError;

    if (task?.pipeline_id) {
      const { data: stages, error: stageError } = await input.supabase
        .from("crm_stages")
        .select("id, name")
        .eq("pipeline_id", task.pipeline_id);
      if (stageError) throw stageError;
      const normalizedStageName = stageName.toLowerCase();
      const match = (stages || []).find((stage) => String(stage.name || "").toLowerCase().includes(normalizedStageName));
      stageId = match?.id || "";
    }
  }

  if (!stageId) return { id: crmTaskId, detail: "Etapa CRM nao informada pelo agente." };

  const { error } = await input.supabase
    .from("crm_tasks")
    .update({ stage_id: stageId, data_ultima_movimentacao: new Date().toISOString() })
    .eq("tenant_id", input.tenantId)
    .eq("id", crmTaskId);

  if (error) throw error;
  return { id: crmTaskId, detail: "Etapa do lead atualizada no CRM." };
}

async function createFollowUpTask(input: ExecuteActionsInput, action: MayusOperatingPartnerAction) {
  const title = cleanText(action.title) || "Follow-up MAYUS WhatsApp";
  const urgency = cleanText(String(action.payload?.urgency || "")) || (
    input.decision.closing_readiness.status === "ready_for_human_close" ? "ATENCAO" : "ROTINA"
  );
  const sourceId = `mayus-whatsapp:${input.contact.id}:${Date.now()}:${title.slice(0, 32).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const { data, error } = await input.supabase
    .from("user_tasks")
    .insert({
      tenant_id: input.tenantId,
      title,
      description: [
        cleanText(String(action.payload?.description || "")) || input.decision.reasoning_summary_for_team,
        `Contato WhatsApp: ${input.contact.name || input.contact.phone_number || input.contact.id}`,
        `Proximo passo: ${input.decision.next_action}`,
      ].filter(Boolean).join("\n"),
      assigned_to: input.contact.assigned_user_id || input.actorUserId || null,
      created_by: input.actorUserId || null,
      created_by_agent: "mayus_operating_partner",
      source_table: "whatsapp_contacts",
      source_id: sourceId,
      urgency,
      status: "Pendente",
      category: "WhatsApp",
      type: "followup",
      client_name: input.contact.name,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data?.id) throw error || new Error("Tarefa de follow-up nao criada.");
  return { id: data.id, detail: "Tarefa de follow-up criada." };
}

async function logAction(input: ExecuteActionsInput, action: MayusOperatingPartnerAction, result: MayusOperatingPartnerActionResult) {
  await input.supabase.from("system_event_logs").insert({
    tenant_id: input.tenantId,
    user_id: input.actorUserId || null,
    source: "whatsapp",
    provider: "mayus",
    event_name: "mayus_operating_partner_action",
    status: result.status === "failed" ? "error" : "ok",
    payload: {
      contact_id: input.contact.id,
      trigger: input.trigger,
      action,
      result,
      intent: input.decision.intent,
      confidence: input.decision.confidence,
      requires_approval: input.decision.requires_approval,
    },
    created_at: new Date().toISOString(),
  });
}

export async function executeMayusOperatingPartnerActions(input: ExecuteActionsInput): Promise<MayusOperatingPartnerActionResult[]> {
  const actions = input.decision.actions_to_execute || [];
  const results: MayusOperatingPartnerActionResult[] = [];

  for (const action of actions) {
    if (input.decision.requires_approval || action.requires_approval) {
      const result: MayusOperatingPartnerActionResult = {
        type: action.type,
        status: "skipped",
        detail: "Acao aguardando aprovacao humana.",
      };
      results.push(result);
      await logAction(input, action, result);
      continue;
    }

    try {
      let result: MayusOperatingPartnerActionResult;
      if (action.type === "create_crm_lead") {
        const created = await createOrTouchCrmLead(input);
        result = {
          type: action.type,
          status: "executed",
          detail: created.detail,
          record_id: created.id,
        };
      } else if (action.type === "update_crm_stage") {
        const updated = await updateCrmStage(input, action);
        result = {
          type: action.type,
          status: updated.id ? "executed" : "skipped",
          detail: updated.detail,
          record_id: updated.id,
        };
      } else if (action.type === "create_task") {
        const created = await createFollowUpTask(input, action);
        result = {
          type: action.type,
          status: "executed",
          detail: created.detail,
          record_id: created.id,
        };
      } else if (
        action.type === "add_internal_note"
        || action.type === "answer_support"
        || action.type === "ask_discovery_question"
        || action.type === "request_document"
        || action.type === "mark_ready_for_closing"
        || action.type === "recommend_handoff"
        || action.type === "handoff_human"
      ) {
        result = {
          type: action.type,
          status: "executed",
          detail: action.title,
        };
      } else {
        result = {
          type: action.type,
          status: "skipped",
          detail: "Acao planejada para uma proxima etapa de automacao.",
        };
      }

      results.push(result);
      await logAction(input, action, result);
    } catch (error: any) {
      const result: MayusOperatingPartnerActionResult = {
        type: action.type,
        status: "failed",
        detail: error?.message || "Falha ao executar acao MAYUS.",
      };
      results.push(result);
      await logAction(input, action, result);
    }
  }

  return results;
}
