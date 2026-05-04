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
      } else if (action.type === "add_internal_note" || action.type === "answer_support" || action.type === "ask_discovery_question") {
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
