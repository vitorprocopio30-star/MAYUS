import { buildWhatsAppCommandResponse, normalizeWhatsAppPhone } from "@/lib/mayus/whatsapp-command-center";
import { registerDailyPlaybookBrainArtifact } from "@/lib/mayus/daily-playbook";
import { sendWhatsAppMessage } from "@/lib/whatsapp/send-message";

type RuntimeSupabase = {
  from: (table: string) => any;
  storage?: any;
};

type HandleWhatsAppInternalCommandParams = {
  supabase: RuntimeSupabase;
  tenantId: string;
  senderPhone: string;
  content?: string | null;
  contactId?: string | null;
  source: "meta_webhook" | "evolution_webhook";
};

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

async function fetchCommandWhatsAppSignals(supabase: RuntimeSupabase, tenantId: string) {
  try {
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("direction,message_type,content,status,created_at,whatsapp_contacts(name,unread_count)")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(80);

    return (data || []).map((row: any) => ({
      contactName: row.whatsapp_contacts?.name,
      direction: row.direction,
      messageType: row.message_type,
      content: row.content,
      status: row.status,
      createdAt: row.created_at,
      unreadCount: row.whatsapp_contacts?.unread_count,
    }));
  } catch {
    return [];
  }
}

async function fetchCommandProcessSignals(supabase: RuntimeSupabase, tenantId: string) {
  try {
    const { data } = await supabase
      .from("process_tasks")
      .select("id,title,sector,prazo_fatal,data_ultima_movimentacao,valor_causa,tutela_urgencia,process_stages(name)")
      .eq("tenant_id", tenantId)
      .order("data_ultima_movimentacao", { ascending: true, nullsFirst: false })
      .limit(80);

    return (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      stageName: row.process_stages?.name,
      sector: row.sector,
      deadline: row.prazo_fatal,
      lastMovementAt: row.data_ultima_movimentacao,
      claimValue: row.valor_causa,
      urgentInjunction: Boolean(row.tutela_urgencia),
    }));
  } catch {
    return [];
  }
}

async function fetchCommandFinancialSignals(supabase: RuntimeSupabase, tenantId: string) {
  try {
    const { data } = await supabase
      .from("financials")
      .select("id,amount,status,due_date,type,description")
      .eq("tenant_id", tenantId)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(80);

    return (data || []).map((row: any) => ({
      id: row.id,
      amount: row.amount,
      status: row.status,
      dueDate: row.due_date,
      type: row.type,
      description: row.description,
    }));
  } catch {
    return [];
  }
}

async function fetchCommandSalesSignals(supabase: RuntimeSupabase, tenantId: string) {
  try {
    const { data } = await supabase
      .from("sales")
      .select("id,client_name,professional_name,ticket_total,status,contract_date")
      .eq("tenant_id", tenantId)
      .order("contract_date", { ascending: false, nullsFirst: false })
      .limit(60);

    return (data || []).map((row: any) => ({
      id: row.id,
      clientName: row.client_name,
      professionalName: row.professional_name,
      ticketTotal: row.ticket_total,
      status: row.status,
      contractDate: row.contract_date,
    }));
  } catch {
    return [];
  }
}

async function fetchCommandSystemSignals(supabase: RuntimeSupabase, tenantId: string) {
  try {
    const { data } = await supabase
      .from("system_event_logs")
      .select("event_type,severity,source,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(50);

    return (data || []).map((row: any) => ({
      eventType: row.event_type,
      severity: row.severity,
      source: row.source,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

async function sendInternalWhatsAppReply(params: {
  supabase: RuntimeSupabase;
  tenantId: string;
  contactId?: string | null;
  phoneNumber: string;
  text: string;
  mediaUrl?: string | null;
  mediaFilename?: string | null;
  mediaMimeType?: string | null;
  fallbackText?: string | null;
}) {
  if (!params.contactId) return { sent: false, reason: "missing_contact" as const };

  try {
    const result = await sendWhatsAppMessage({
      supabase: params.supabase as any,
      tenantId: params.tenantId,
      contactId: params.contactId,
      phoneNumber: normalizeWhatsAppPhone(params.phoneNumber),
      preferredProvider: null,
      text: params.text,
      mediaUrl: params.mediaUrl,
      mediaType: params.mediaUrl ? "document" : null,
      mediaFilename: params.mediaFilename,
      mediaMimeType: params.mediaMimeType,
      humanizeDelivery: true,
      metadata: {
        source: "mayus_internal_command",
        ...(params.mediaUrl ? { delivery_mode: "html_attachment" } : {}),
      },
    });

    return { sent: true, provider: result.provider, apiResponse: result.apiResponse };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (params.mediaUrl && params.fallbackText) {
      const result = await sendWhatsAppMessage({
        supabase: params.supabase as any,
        tenantId: params.tenantId,
        contactId: params.contactId,
        phoneNumber: normalizeWhatsAppPhone(params.phoneNumber),
        preferredProvider: null,
        text: params.fallbackText,
        humanizeDelivery: true,
        metadata: {
          source: "mayus_internal_command",
          delivery_mode: "route_link_fallback_after_attachment_error",
          attachment_error: message.slice(0, 300),
        },
      });

      return { sent: true, provider: result.provider, apiResponse: result.apiResponse };
    }
    if (/integracao|integração|whatsapp.*nao encontrada|whatsapp.*não encontrada/i.test(message)) {
      return { sent: false, reason: "missing_whatsapp_integration" as const };
    }
    throw error;
  }
}

function getAppBaseUrl() {
  const raw = String(
    process.env.NEXT_PUBLIC_APP_URL
    || process.env.NEXT_PUBLIC_SITE_URL
    || process.env.VERCEL_PROJECT_PRODUCTION_URL
    || process.env.VERCEL_URL
    || "https://mayus-premium-pro.vercel.app"
  ).trim();
  return (raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`).replace(/\/$/, "");
}

function buildPremiumPlaybookWhatsAppReply(params: {
  replyText: string;
  artifactId: string | null | undefined;
  publicShareToken: string | null | undefined;
}) {
  if (!params.publicShareToken && !params.artifactId) return params.replyText;

  const summary = String(params.replyText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !/^MAYUS Playbook/i.test(line) && !/^Acoes prioritarias/i.test(line))
    || "Playbook operacional gerado.";
  const url = params.publicShareToken
    ? `${getAppBaseUrl()}/playbook/${encodeURIComponent(params.publicShareToken)}`
    : `${getAppBaseUrl()}/dashboard/mayus/playbooks/${encodeURIComponent(String(params.artifactId))}`;

  return [
    "Playbook Premium gerado.",
    "",
    `Resumo: ${summary}`,
    "",
    "Acesse aqui:",
    url,
    "",
    "Nenhuma acao externa foi executada automaticamente.",
  ].join("\n").trim();
}

function buildPremiumPlaybookAttachmentCaption(replyText: string) {
  const summary = String(replyText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !/^MAYUS Playbook/i.test(line) && !/^Acoes prioritarias/i.test(line))
    || "Playbook operacional gerado.";

  return [
    "Playbook Premium gerado.",
    "",
    `Resumo: ${summary}`,
    "",
    "Estou te enviando o arquivo HTML em anexo.",
    "",
    "Nenhuma acao externa foi executada automaticamente.",
  ].join("\n").trim();
}

export async function handleWhatsAppInternalCommand(params: HandleWhatsAppInternalCommandParams) {
  const aiFeatures = await fetchTenantAiFeatures(params.supabase, params.tenantId);
  const officePlaybook = aiFeatures.office_playbook_profile && typeof aiFeatures.office_playbook_profile === "object"
    ? aiFeatures.office_playbook_profile
    : null;
  const result = buildWhatsAppCommandResponse({
    tenantId: params.tenantId,
    senderPhone: params.senderPhone,
    text: params.content,
    aiFeatures,
    crmTasks: await fetchCommandCrmTasks(params.supabase, params.tenantId),
    userTasks: await fetchCommandUserTasks(params.supabase, params.tenantId),
    whatsappSignals: await fetchCommandWhatsAppSignals(params.supabase, params.tenantId),
    processSignals: await fetchCommandProcessSignals(params.supabase, params.tenantId),
    financialSignals: await fetchCommandFinancialSignals(params.supabase, params.tenantId),
    salesSignals: await fetchCommandSalesSignals(params.supabase, params.tenantId),
    systemSignals: await fetchCommandSystemSignals(params.supabase, params.tenantId),
    officePlaybookStatus: officePlaybook?.status,
  });

  if (!result.handled) {
    const rejected = result as Extract<ReturnType<typeof buildWhatsAppCommandResponse>, { handled: false }>;

    if (rejected.reason === "not_authorized" && rejected.intent !== "unknown") {
      await params.supabase.from("system_event_logs").insert({
        tenant_id: params.tenantId,
        event_type: "whatsapp_internal_command_blocked",
        severity: "warning",
        source: "mayus",
        metadata: {
          source: params.source,
          intent: rejected.intent,
          sender_phone_authorized: false,
          raw_phone_stored: false,
        },
      });
    }

    return { handled: false, sent: false, reason: rejected.reason, intent: rejected.intent };
  }

  let brainTrace: Awaited<ReturnType<typeof registerDailyPlaybookBrainArtifact>> = null;

  if (result.officePlaybookSetup?.nextProfile) {
    const currentAiFeatures = await fetchTenantAiFeatures(params.supabase, params.tenantId);
    await params.supabase
      .from("tenant_settings")
      .upsert({
        tenant_id: params.tenantId,
        ai_features: {
          ...currentAiFeatures,
          office_playbook_profile: result.officePlaybookSetup.nextProfile,
        },
      }, { onConflict: "tenant_id" });
  } else if (result.playbook) {
    brainTrace = await registerDailyPlaybookBrainArtifact({
      tenantId: params.tenantId,
      userId: null,
      playbook: result.playbook,
      supabase: params.supabase,
    });
  }

  await params.supabase.from("system_event_logs").insert({
    tenant_id: params.tenantId,
    event_type: "whatsapp_internal_command_processed",
    severity: "info",
    source: "mayus",
    metadata: {
      ...result.metadata,
      source: params.source,
      brain_trace: brainTrace,
      raw_phone_stored: false,
    },
  });

  const replyText = result.playbook
    ? brainTrace?.htmlFileUrl
      ? buildPremiumPlaybookAttachmentCaption(result.replyText)
      : buildPremiumPlaybookWhatsAppReply({
      replyText: result.replyText,
      artifactId: brainTrace?.artifactId,
      publicShareToken: brainTrace?.publicShareToken,
    })
    : result.replyText;

  const delivery = await sendInternalWhatsAppReply({
    supabase: params.supabase,
    tenantId: params.tenantId,
    contactId: params.contactId,
    phoneNumber: params.senderPhone,
    text: replyText,
    mediaUrl: result.playbook ? brainTrace?.htmlFileUrl : null,
    mediaFilename: result.playbook ? "mayus-playbook-premium.html" : null,
    mediaMimeType: result.playbook ? "text/html" : null,
    fallbackText: result.playbook
      ? buildPremiumPlaybookWhatsAppReply({
        replyText: result.replyText,
        artifactId: brainTrace?.artifactId,
        publicShareToken: brainTrace?.publicShareToken,
      })
      : null,
  });

  return {
    handled: true,
    sent: delivery.sent,
    intent: result.intent,
    provider: "provider" in delivery ? delivery.provider : null,
    reason: "reason" in delivery ? delivery.reason : null,
  };
}
