import { listTenantIntegrationsResolved } from "@/lib/integrations/server";
import { buildWhatsAppCommandResponse, normalizeWhatsAppPhone } from "@/lib/mayus/whatsapp-command-center";
import { registerDailyPlaybookBrainArtifact } from "@/lib/mayus/daily-playbook";
import { randomUUID } from "crypto";
import { resolvePublicAppUrlFromEnv } from "@/lib/url/resolve-public-app-url";

type RuntimeSupabase = {
  from: (table: string) => any;
};

type WhatsAppProvider = {
  provider: string;
  api_key: string | null;
  instance_name: string | null;
};

type HandleWhatsAppInternalCommandParams = {
  supabase: RuntimeSupabase;
  tenantId: string;
  senderPhone: string;
  content?: string | null;
  contactId?: string | null;
  source: "meta_webhook" | "evolution_webhook";
};

const PRIVATE_IP = /^(localhost|127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.0\.0\.0|::1)/;

function validateIntegrationUrl(url: string): void {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Protocolo invalido");
  if (PRIVATE_IP.test(parsed.hostname)) throw new Error("URL aponta para rede interna");
}

function cleanPhoneForEvolution(phoneNumber: string) {
  return String(phoneNumber || "").split("@")[0].replace(/\D/g, "");
}

async function fetchTenantAiFeatures(supabase: RuntimeSupabase, tenantId: string) {
  const { data } = await supabase
    .from("tenant_settings")
    .select("ai_features")
    .eq("tenant_id", tenantId)
    .single();

  return data?.ai_features && typeof data.ai_features === "object" ? data.ai_features : {};
}

async function fetchCommandCrmTasks(supabase: RuntimeSupabase, tenantId: string) {
  const { data } = await supabase
    .from("crm_tasks")
    .select(`
      id,
      title,
      description,
      tags,
      sector,
      created_at,
      data_ultima_movimentacao,
      is_win,
      is_loss,
      assigned_user_id,
      responsavel_nome,
      crm_stages(name),
      crm_contacts(phone)
    `)
    .eq("tenant_id", tenantId)
    .eq("is_win", false)
    .eq("is_loss", false)
    .order("updated_at", { ascending: false })
    .limit(60);

  return (data || []).map((task: any) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    tags: task.tags,
    sector: task.sector,
    stageName: task.crm_stages?.name || task.sector,
    assignedName: task.responsavel_nome || task.assigned_user_id,
    phone: task.crm_contacts?.phone,
    isWin: task.is_win,
    isLoss: task.is_loss,
    created_at: task.created_at,
    data_ultima_movimentacao: task.data_ultima_movimentacao,
  }));
}

async function fetchCommandUserTasks(supabase: RuntimeSupabase, tenantId: string) {
  const { data } = await supabase
    .from("user_tasks")
    .select("id,title,description,urgency,status,scheduled_for,assigned_name_snapshot,client_name,type")
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "in_progress", "scheduled"])
    .order("scheduled_for", { ascending: true, nullsFirst: false })
    .limit(80);

  return data || [];
}

async function sendInternalWhatsAppReply(params: {
  supabase: RuntimeSupabase;
  tenantId: string;
  contactId?: string | null;
  phoneNumber: string;
  text: string;
}) {
  const integrations = await listTenantIntegrationsResolved(params.tenantId, ["meta_cloud", "evolution"]);
  const provider = integrations.find((item) => item.provider === "evolution")
    || integrations.find((item) => item.provider === "meta_cloud");

  if (!provider?.api_key || !provider.instance_name) {
    return { sent: false, reason: "missing_whatsapp_integration" as const };
  }

  let apiResponse: unknown = null;

  if (provider.provider === "meta_cloud") {
    const [phoneId] = provider.instance_name.split("|");
    const url = `https://graph.facebook.com/v22.0/${phoneId}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizeWhatsAppPhone(params.phoneNumber),
        type: "text",
        text: { body: params.text },
      }),
    });

    apiResponse = await response.json().catch(() => null);
    if (!response.ok) throw new Error("Erro Meta Web API: " + JSON.stringify(apiResponse));
  }

  if (provider.provider === "evolution") {
    const [baseUrlRaw, instanceName] = provider.instance_name.split("|");
    const baseUrl = String(baseUrlRaw || "").replace(/\/$/, "");
    validateIntegrationUrl(baseUrl);

    const response = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
      method: "POST",
      headers: {
        apikey: provider.api_key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        number: cleanPhoneForEvolution(params.phoneNumber),
        text: params.text,
      }),
    });

    apiResponse = await response.json().catch(() => null);
    if (!response.ok) throw new Error("Erro Evolution API: " + JSON.stringify(apiResponse));
  }

  if (params.contactId) {
    await params.supabase.from("whatsapp_messages").insert([{
      tenant_id: params.tenantId,
      contact_id: params.contactId,
      direction: "outbound",
      message_type: "text",
      content: params.text,
      status: "sent",
    }]);
  }

  return { sent: true, provider: provider.provider, apiResponse };
}

export async function handleWhatsAppInternalCommand(params: HandleWhatsAppInternalCommandParams) {
  const aiFeatures = await fetchTenantAiFeatures(params.supabase, params.tenantId);
  const result = buildWhatsAppCommandResponse({
    tenantId: params.tenantId,
    senderPhone: params.senderPhone,
    text: params.content,
    aiFeatures,
    crmTasks: await fetchCommandCrmTasks(params.supabase, params.tenantId),
    userTasks: await fetchCommandUserTasks(params.supabase, params.tenantId),
  });

  if (!result.handled) {
    const rejected = result as Extract<ReturnType<typeof buildWhatsAppCommandResponse>, { handled: false }>;

    if (rejected.reason === "not_authorized" && rejected.intent !== "unknown") {
      await params.supabase.from("system_event_logs").insert({
        tenant_id: params.tenantId,
        source: "whatsapp",
        provider: "mayus",
        event_name: "whatsapp_internal_command_blocked",
        status: "warning",
        payload: {
          source: params.source,
          intent: rejected.intent,
          sender_phone_authorized: false,
          raw_phone_stored: false,
        },
        created_at: new Date().toISOString(),
      });
    }

    return { handled: false, sent: false, reason: rejected.reason, intent: rejected.intent };
  }

  const reportShareToken = result.intent === "daily_playbook" ? randomUUID().replace(/-/g, "") : null;
  const reportUrl = reportShareToken ? `${resolvePublicAppUrlFromEnv()}/r/playbook/${reportShareToken}` : null;
  const brainTrace = await registerDailyPlaybookBrainArtifact({
    tenantId: params.tenantId,
    userId: null,
    playbook: result.playbook,
    supabase: params.supabase,
    htmlReportUrl: reportUrl,
    htmlReportShareToken: reportShareToken,
  });
  const replyText = reportUrl && brainTrace?.artifactId
    ? `${result.replyText}\n\nPlaybook completo em HTML premium: ${reportUrl}`
    : result.replyText;

  await params.supabase.from("system_event_logs").insert({
    tenant_id: params.tenantId,
    source: "whatsapp",
    provider: "mayus",
    event_name: "whatsapp_internal_command_processed",
    status: "ok",
    payload: {
      ...result.metadata,
      source: params.source,
      brain_trace: brainTrace,
      html_report_url: reportUrl && brainTrace?.artifactId ? reportUrl : null,
      raw_phone_stored: false,
    },
    created_at: new Date().toISOString(),
  });

  const delivery = await sendInternalWhatsAppReply({
    supabase: params.supabase,
    tenantId: params.tenantId,
    contactId: params.contactId,
    phoneNumber: params.senderPhone,
    text: replyText,
  });

  return {
    handled: true,
    sent: delivery.sent,
    intent: result.intent,
    provider: "provider" in delivery ? delivery.provider : null,
    reason: "reason" in delivery ? delivery.reason : null,
  };
}
