import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildWhatsAppSalesReply,
  buildWhatsAppSalesReplyMetadata,
  type WhatsAppSalesReply,
} from "./whatsapp-sales-reply";
import {
  buildSalesLlmReply,
  normalizeSalesLlmTestbenchConfig,
  type SalesLlmReply,
  type SalesLlmTestbenchConfig,
} from "./sales-llm-reply";
import {
  buildMayusOperatingPartnerDecision,
  DEFAULT_MAYUS_OPERATING_PARTNER,
  normalizeMayusOperatingPartnerConfig,
  type MayusOperatingPartnerConfig,
  type MayusOperatingPartnerCrmContext,
  type MayusOperatingPartnerDecision,
  type MayusPreviousConversationEvent,
} from "@/lib/agent/mayus-operating-partner";
import {
  executeMayusOperatingPartnerActions,
  type MayusOperatingPartnerActionResult,
} from "@/lib/agent/mayus-operating-partner-actions";
import { sendWhatsAppMessage, type SendWhatsAppMessageResult } from "@/lib/whatsapp/send-message";
import type { WhatsAppSendProvider } from "@/lib/whatsapp/send-message";

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => getStringValue(item)).filter((item): item is string => Boolean(item));
}

function isExplicitlyEnabled(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as { enabled?: unknown }).enabled === true);
}

function isExplicitlyDisabled(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as { enabled?: unknown }).enabled === false);
}

async function loadSalesRuntimeSettings(params: {
  supabase: SupabaseClient;
  tenantId: string;
}) {
  const { data } = await params.supabase
    .from("tenant_settings")
    .select("ai_features")
    .eq("tenant_id", params.tenantId)
    .maybeSingle<{ ai_features: Record<string, any> | null }>();

  const features = data?.ai_features && typeof data.ai_features === "object" ? data.ai_features : {};
  const profile = features.sales_consultation_profile;
  const testbench = features.sales_llm_testbench;
  const whatsappAgent = features.whatsapp_agent;
  const operatingPartner = features.mayus_operating_partner;

  return {
    salesProfile: profile && typeof profile === "object"
      ? {
        firmName: getStringValue(features.firm_name) || getStringValue(profile.firm_name),
        idealClient: getStringValue(profile.ideal_client),
        coreSolution: getStringValue(profile.core_solution),
        uniqueValueProposition: getStringValue(profile.unique_value_proposition),
        valuePillars: Array.isArray(profile.value_pillars)
          ? getStringArray(profile.value_pillars)
          : [],
        positioningSummary: getStringValue(profile.positioning_summary),
        salesPlaybookContext: getStringValue(features.sales_playbook_context)
          || getStringValue(features.sales_document_context)
          || getStringValue(profile.sales_playbook_context)
          || getStringValue(profile.sales_document_context),
        salesDocumentSummary: getStringValue(features.sales_document_summary)
          || getStringValue(profile.sales_document_summary),
        salesRules: getStringArray(features.sales_rules).length
          ? getStringArray(features.sales_rules)
          : getStringArray(profile.sales_rules),
        qualificationQuestions: getStringArray(features.qualification_questions).length
          ? getStringArray(features.qualification_questions)
          : getStringArray(profile.qualification_questions),
        offerPositioning: getStringValue(features.offer_positioning)
          || getStringValue(profile.offer_positioning),
        forbiddenClaims: getStringArray(features.forbidden_claims).length
          ? getStringArray(features.forbidden_claims)
          : getStringArray(profile.forbidden_claims),
      }
      : null,
    salesLlmTestbench: isExplicitlyEnabled(testbench)
      ? normalizeSalesLlmTestbenchConfig(testbench as Partial<SalesLlmTestbenchConfig>)
      : null,
    mayusOperatingPartner: isExplicitlyDisabled(operatingPartner)
      ? null
      : normalizeMayusOperatingPartnerConfig((operatingPartner && typeof operatingPartner === "object"
        ? operatingPartner
        : DEFAULT_MAYUS_OPERATING_PARTNER) as Partial<MayusOperatingPartnerConfig>),
    autonomyMode: whatsappAgent && typeof whatsappAgent === "object"
      ? getStringValue(whatsappAgent.autonomy_mode) || "auto_respond"
      : "auto_respond",
  };
}

function sanitizeFallbackReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (!message.trim()) return "unknown_error";
  if (/401|403|unauthorized|forbidden|api key|token|credential|chave/i.test(message)) return "provider_auth_or_credentials";
  if (/429|rate limit|quota|limite/i.test(message)) return "provider_rate_limited";
  if (/timeout|timed out|aborted/i.test(message)) return "provider_timeout";
  if (/network|fetch failed|econn|enotfound|dns/i.test(message)) return "provider_network_error";
  if (/json/i.test(message)) return "invalid_model_json";
  return "provider_call_failed";
}

async function withOperationalTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timeout em ${label} apos ${timeoutMs}ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function normalizePhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits || null;
}

async function loadCrmContext(params: {
  supabase: SupabaseClient;
  tenantId: string;
  contact: { phone_number: string | null; name: string | null };
}): Promise<MayusOperatingPartnerCrmContext | null> {
  const phone = normalizePhone(params.contact.phone_number);
  if (!phone) return null;

  try {
    const query = params.supabase.from("crm_tasks");
    if (typeof (query as any).select !== "function") return null;
    const { data } = await query
      .select("id, title, description, stage_id, pipeline_id, tags, source, lead_scoring, value, data_ultima_movimentacao")
      .eq("tenant_id", params.tenantId)
      .eq("phone", phone)
      .order("data_ultima_movimentacao", { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string;
        title: string | null;
        description: string | null;
        stage_id: string | null;
        pipeline_id: string | null;
        tags: string[] | null;
        source: string | null;
        lead_scoring: number | null;
        value: number | null;
        data_ultima_movimentacao: string | null;
      }>();

    if (!data?.id) return null;

    let stageName: string | null = null;
    if (data.stage_id) {
      const stageQuery = params.supabase.from("crm_stages");
      if (typeof (stageQuery as any).select === "function") {
        const { data: stage } = await stageQuery
          .select("name")
          .eq("id", data.stage_id)
          .maybeSingle<{ name: string | null }>();
        stageName = stage?.name || null;
      }
    }

    return {
      crm_task_id: data.id,
      title: data.title,
      description: data.description,
      stage_id: data.stage_id,
      stage_name: stageName,
      tags: Array.isArray(data.tags) ? data.tags : [],
      source: data.source,
      lead_scoring: data.lead_scoring,
      value: data.value,
      last_movement_at: data.data_ultima_movimentacao,
    };
  } catch {
    return null;
  }
}

async function loadPreviousMayusEvent(params: {
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
}): Promise<MayusPreviousConversationEvent | null> {
  try {
    const query = params.supabase.from("system_event_logs");
    if (typeof (query as any).select !== "function") return null;
    const { data } = await query
      .select("payload, created_at")
      .eq("tenant_id", params.tenantId)
      .eq("event_name", "whatsapp_sales_reply_prepared")
      .eq("payload->>contact_id", params.contactId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ payload: Record<string, any> | null; created_at: string | null }>();

    const payload = data?.payload && typeof data.payload === "object" ? data.payload : null;
    if (!payload) return null;

    return {
      created_at: data?.created_at || null,
      reply_source: getStringValue(payload.reply_source),
      conversation_state: payload.conversation_state && typeof payload.conversation_state === "object" ? payload.conversation_state : null,
      closing_readiness: payload.closing_readiness && typeof payload.closing_readiness === "object" ? payload.closing_readiness : null,
      next_action: getStringValue(payload.next_action) || getStringValue(payload.mayus_operating_partner?.next_action),
      intent: getStringValue(payload.intent) || getStringValue(payload.mayus_operating_partner?.intent),
    };
  } catch {
    return null;
  }
}

function buildNotification(reply: WhatsAppSalesReply, contactName: string | null) {
  const contactLabel = contactName || "lead WhatsApp";

  if (reply.mode === "internal_setup_required") {
    return {
      title: "MAYUS precisa configurar vendas",
      message: `${contactLabel}: ${reply.internalNote}`.slice(0, 180),
      type: "warning",
    };
  }

  if (reply.mode === "human_review_required") {
    return {
      title: "Resposta WhatsApp pronta para revisar",
      message: `${contactLabel}: revisar antes de enviar por haver risco comercial/juridico.`.slice(0, 180),
      type: "warning",
    };
  }

  return {
    title: "Resposta WhatsApp preparada",
    message: `${contactLabel}: MAYUS montou uma resposta consultiva para o atendimento.`.slice(0, 180),
    type: "info",
  };
}

function buildLlmNotification(reply: SalesLlmReply, contactName: string | null) {
  const contactLabel = contactName || "lead WhatsApp";

  if (!reply.should_auto_send || reply.risk_flags.length > 0) {
    return {
      title: "Resposta WhatsApp LLM pronta para revisar",
      message: `${contactLabel}: ${reply.model_used} sugeriu ${reply.next_action}.`.slice(0, 180),
      type: "warning",
    };
  }

  return {
    title: "Resposta WhatsApp LLM preparada",
    message: `${contactLabel}: ${reply.model_used} conduziu a proxima resposta comercial.`.slice(0, 180),
    type: "info",
  };
}

function buildOperatingPartnerNotification(decision: MayusOperatingPartnerDecision, contactName: string | null) {
  const contactLabel = contactName || "lead WhatsApp";

  if (decision.requires_approval || !decision.should_auto_send || decision.risk_flags.length > 0) {
    return {
      title: "MAYUS preparou atendimento para revisar",
      message: `${contactLabel}: ${decision.next_action}.`.slice(0, 180),
      type: "warning",
    };
  }

  return {
    title: "MAYUS conduziu atendimento",
    message: `${contactLabel}: ${decision.intent} com ${Math.round(decision.confidence * 100)}% de confianca.`.slice(0, 180),
    type: "info",
  };
}

function canAutoSendDeterministicFallback(reply: WhatsAppSalesReply, fallbackReasons: string[]) {
  const safeLegalTriageTopics = new Set(["payroll_discount", "benefit_or_inss"]);
  const llmFailed = fallbackReasons.some((reason) => reason.startsWith("sales_llm:"));

  return Boolean(
    llmFailed
    && reply.mayAutoSend
    && !reply.requiresHumanReview
    && safeLegalTriageTopics.has(reply.leadTopic)
  );
}

type SalesAutoSendResult =
  | {
    attempted: true;
    status: "sent";
    provider: SendWhatsAppMessageResult["provider"];
  }
  | {
    attempted: true;
    status: "failed";
    error: string;
  }
  | {
    attempted: false;
    status: "skipped";
  };

export async function prepareWhatsAppSalesReplyForContact(params: {
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
  actorUserId?: string | null;
  trigger: "manual" | "meta_webhook" | "evolution_webhook";
  notify?: boolean;
  autoSendFirstResponse?: boolean;
  preferredProvider?: WhatsAppSendProvider | null;
}) {
  const { data: contact, error: contactError } = await params.supabase
    .from("whatsapp_contacts")
    .select("id, name, phone_number, assigned_user_id")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.contactId)
    .maybeSingle<{ id: string; name: string | null; phone_number: string | null; assigned_user_id?: string | null }>();

  if (contactError || !contact) {
    throw new Error("Contato nao encontrado.");
  }

  const { data: messages } = await params.supabase
    .from("whatsapp_messages")
    .select("direction, content, message_type, media_url, media_filename, media_mime_type, media_text, media_summary, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const runtimeSettings = await loadSalesRuntimeSettings({
    supabase: params.supabase,
    tenantId: params.tenantId,
  });
  const [crmContext, previousMayusEvent] = await Promise.all([
    loadCrmContext({
      supabase: params.supabase,
      tenantId: params.tenantId,
      contact,
    }),
    loadPreviousMayusEvent({
      supabase: params.supabase,
      tenantId: params.tenantId,
      contactId: contact.id,
    }),
  ]);

  const orderedMessages = (messages || []).reverse();
  const reply = buildWhatsAppSalesReply({
    contactName: contact.name,
    phoneNumber: contact.phone_number,
    messages: orderedMessages,
    salesProfile: runtimeSettings.salesProfile,
  });
  const deterministicMetadata = buildWhatsAppSalesReplyMetadata(reply);
  const fallbackReasons: string[] = [];
  let metadata: Record<string, any> = {
    ...deterministicMetadata,
    reply_source: "deterministic_fallback",
    model_used: "deterministic",
    fallback_reason: null,
  };
  let llmReply: SalesLlmReply | null = null;
  let operatingPartnerDecision: MayusOperatingPartnerDecision | null = null;
  let operatingPartnerActionResults: MayusOperatingPartnerActionResult[] = [];
  let autoSendResult: SalesAutoSendResult = {
    attempted: false,
    status: "skipped",
  };

  if (runtimeSettings.mayusOperatingPartner?.enabled) {
    try {
      operatingPartnerDecision = await withOperationalTimeout(buildMayusOperatingPartnerDecision({
        supabase: params.supabase,
        tenantId: params.tenantId,
        channel: "whatsapp",
        contactName: contact.name,
        phoneNumber: contact.phone_number,
        messages: orderedMessages,
        salesProfile: runtimeSettings.salesProfile,
        crmContext,
        previousMayusEvent,
        salesTestbench: runtimeSettings.salesLlmTestbench,
        operatingPartner: runtimeSettings.mayusOperatingPartner,
      }), params.trigger === "manual" ? 12000 : 8000, "MAYUS Operating Partner");
      metadata = {
        ...deterministicMetadata,
        reply_source: "operating_partner",
        model_used: operatingPartnerDecision.model_used,
        fallback_reason: null,
        mode: operatingPartnerDecision.should_auto_send ? "suggested_reply" : "human_review_required",
        suggested_reply: operatingPartnerDecision.reply,
        internal_note: `MAYUS socio virtual: ${operatingPartnerDecision.next_action}`,
        risk_flags: Array.from(new Set([...deterministicMetadata.risk_flags, ...operatingPartnerDecision.risk_flags])),
        may_auto_send: operatingPartnerDecision.should_auto_send,
        requires_human_review: operatingPartnerDecision.requires_approval || !operatingPartnerDecision.should_auto_send || operatingPartnerDecision.risk_flags.length > 0,
        mayus_operating_partner: {
          enabled: true,
          provider: operatingPartnerDecision.provider,
          model_used: operatingPartnerDecision.model_used,
          intent: operatingPartnerDecision.intent,
          confidence: operatingPartnerDecision.confidence,
          next_action: operatingPartnerDecision.next_action,
          should_auto_send: operatingPartnerDecision.should_auto_send,
          requires_approval: operatingPartnerDecision.requires_approval,
          actions_to_execute: operatingPartnerDecision.actions_to_execute,
          conversation_state: operatingPartnerDecision.conversation_state,
          closing_readiness: operatingPartnerDecision.closing_readiness,
          support_summary: operatingPartnerDecision.support_summary,
          reasoning_summary_for_team: operatingPartnerDecision.reasoning_summary_for_team,
          expected_outcome: operatingPartnerDecision.expected_outcome,
        },
        conversation_state: operatingPartnerDecision.conversation_state,
        closing_readiness: operatingPartnerDecision.closing_readiness,
        support_summary: operatingPartnerDecision.support_summary,
        reasoning_summary_for_team: operatingPartnerDecision.reasoning_summary_for_team,
      };
    } catch (error) {
      const reason = sanitizeFallbackReason(error);
      fallbackReasons.push(`operating_partner:${reason}`);
      console.error("[whatsapp-sales-reply-runtime][operating-partner]", error);
      metadata = {
        ...deterministicMetadata,
        reply_source: "deterministic_fallback",
        model_used: "deterministic",
        fallback_reason: fallbackReasons.join("|"),
        mayus_operating_partner: {
          enabled: true,
          failed: true,
          failure_reason: reason,
          fallback: runtimeSettings.salesLlmTestbench?.enabled && reason !== "provider_timeout" ? "sales_llm_reply" : "deterministic_whatsapp_sales_reply",
        },
      };
    }
  }

  const operatingPartnerTimedOut = fallbackReasons.some((reason) => reason === "operating_partner:provider_timeout");
  const shouldTrySalesLlm = runtimeSettings.salesLlmTestbench?.enabled
    && !(operatingPartnerTimedOut && params.trigger !== "manual");

  if (!operatingPartnerDecision && shouldTrySalesLlm) {
    try {
      llmReply = await buildSalesLlmReply({
        supabase: params.supabase,
        tenantId: params.tenantId,
        contactName: contact.name,
        phoneNumber: contact.phone_number,
        messages: orderedMessages,
        salesProfile: runtimeSettings.salesProfile,
        testbench: runtimeSettings.salesLlmTestbench,
        autonomyMode: runtimeSettings.autonomyMode,
      });
      metadata = {
        ...deterministicMetadata,
        reply_source: "sales_llm",
        model_used: llmReply.model_used,
        fallback_reason: fallbackReasons.length > 0 ? fallbackReasons.join("|") : null,
        mode: llmReply.should_auto_send ? "suggested_reply" : "human_review_required",
        suggested_reply: llmReply.reply,
        internal_note: `LLM de vendas ${llmReply.model_used}: ${llmReply.next_action}`,
        risk_flags: Array.from(new Set([...deterministicMetadata.risk_flags, ...llmReply.risk_flags])),
        may_auto_send: llmReply.should_auto_send,
        requires_human_review: !llmReply.should_auto_send || llmReply.risk_flags.length > 0,
        sales_llm: {
          enabled: true,
          provider: llmReply.provider,
          model_used: llmReply.model_used,
          intent: llmReply.intent,
          lead_stage: llmReply.lead_stage,
          confidence: llmReply.confidence,
          next_action: llmReply.next_action,
          should_auto_send: llmReply.should_auto_send,
          expected_outcome: llmReply.expected_outcome,
        },
        mayus_operating_partner: metadata.mayus_operating_partner,
      };
    } catch (error) {
      const reason = sanitizeFallbackReason(error);
      fallbackReasons.push(`sales_llm:${reason}`);
      console.error("[whatsapp-sales-reply-runtime][sales-llm]", error);
      metadata = {
        ...deterministicMetadata,
        reply_source: "deterministic_fallback",
        model_used: "deterministic",
        fallback_reason: fallbackReasons.join("|"),
        sales_llm: {
          enabled: true,
          failed: true,
          failure_reason: reason,
          fallback: "deterministic_whatsapp_sales_reply",
        },
        mayus_operating_partner: metadata.mayus_operating_partner,
      };
    }
  }

  const autoReply = operatingPartnerDecision
    ? {
      shouldAutoSend: operatingPartnerDecision.should_auto_send,
      text: operatingPartnerDecision.reply,
      source: "mayus_operating_partner_auto_reply",
      modelUsed: operatingPartnerDecision.model_used,
      provider: operatingPartnerDecision.provider,
      intent: operatingPartnerDecision.intent,
      confidence: operatingPartnerDecision.confidence,
      leadStage: operatingPartnerDecision.conversation_state?.stage || null,
      expectedOutcome: operatingPartnerDecision.expected_outcome,
      sentEventName: "whatsapp_mayus_operating_partner_auto_sent",
      failedEventName: "whatsapp_mayus_operating_partner_auto_send_failed",
    }
    : llmReply
      ? {
        shouldAutoSend: llmReply.should_auto_send,
        text: llmReply.reply,
        source: "sales_llm_auto_reply",
        modelUsed: llmReply.model_used,
        provider: llmReply.provider,
        intent: llmReply.intent,
        confidence: llmReply.confidence,
        leadStage: llmReply.lead_stage,
        expectedOutcome: llmReply.expected_outcome,
        sentEventName: "whatsapp_sales_llm_auto_sent",
        failedEventName: "whatsapp_sales_llm_auto_send_failed",
      }
      : reply.suggestedReply
        ? {
          shouldAutoSend: reply.mayAutoSend,
          text: reply.suggestedReply,
          source: "deterministic_whatsapp_auto_reply",
          modelUsed: "deterministic",
          provider: "mayus",
          intent: "deterministic_whatsapp_sales_reply",
          confidence: null,
          leadStage: reply.plan.phase,
          expectedOutcome: reply.plan.nextBestAction,
          sentEventName: "whatsapp_sales_reply_auto_sent",
          failedEventName: "whatsapp_sales_reply_auto_send_failed",
        }
        : null;
  const canAutoRespondAssigned = runtimeSettings.autonomyMode === "auto_respond_assigned";
  const deterministicFallbackMaySend = autoReply?.source === "deterministic_whatsapp_auto_reply"
    && canAutoSendDeterministicFallback(reply, fallbackReasons);
  const canAutoSend = Boolean(
    autoReply?.shouldAutoSend
    && metadata.may_auto_send === true
    && params.autoSendFirstResponse === true
    && params.trigger !== "manual"
    && (!contact.assigned_user_id || canAutoRespondAssigned)
    && contact.phone_number
    && (autoReply.source !== "deterministic_whatsapp_auto_reply" || deterministicFallbackMaySend)
  );

  await params.supabase.from("system_event_logs").insert({
    tenant_id: params.tenantId,
    user_id: params.actorUserId || null,
    source: "whatsapp",
    provider: "mayus",
    event_name: "whatsapp_sales_reply_prepared",
    status: "ok",
    payload: {
      contact_id: contact.id,
      trigger: params.trigger,
      crm_context: crmContext,
      ...metadata,
      first_response_policy: {
        enabled: params.autoSendFirstResponse === true,
        sla_minutes: reply.firstResponseSlaMinutes,
        can_auto_send: canAutoSend,
        assigned_contact_auto_send: canAutoRespondAssigned,
      },
    },
    created_at: new Date().toISOString(),
  });

  if (operatingPartnerDecision) {
    operatingPartnerActionResults = await executeMayusOperatingPartnerActions({
      supabase: params.supabase,
      tenantId: params.tenantId,
      contact,
      trigger: params.trigger,
      actorUserId: params.actorUserId || null,
      decision: operatingPartnerDecision,
    });
  }

  if (autoReply && canAutoSend) {
    try {
      const sendResult = await sendWhatsAppMessage({
        supabase: params.supabase,
        tenantId: params.tenantId,
        contactId: contact.id,
        phoneNumber: contact.phone_number || "",
        preferredProvider: params.preferredProvider || null,
        text: autoReply.text,
        metadata: {
          source: autoReply.source,
          provider: autoReply.provider,
          model_used: autoReply.modelUsed,
          intent: autoReply.intent,
          lead_stage: autoReply.leadStage,
          confidence: autoReply.confidence,
          expected_outcome: autoReply.expectedOutcome,
        },
      });
      autoSendResult = {
        attempted: true,
        status: "sent",
        provider: sendResult.provider,
      };
      await params.supabase.from("system_event_logs").insert({
        tenant_id: params.tenantId,
        user_id: params.actorUserId || null,
        source: "whatsapp",
        provider: "mayus",
        event_name: autoReply.sentEventName,
        status: "ok",
        payload: {
          contact_id: contact.id,
          trigger: params.trigger,
          model_used: autoReply.modelUsed,
          lead_stage: autoReply.leadStage,
          intent: autoReply.intent,
          confidence: autoReply.confidence,
          send_provider: sendResult.provider,
          first_response_sla_minutes: reply.firstResponseSlaMinutes,
          handoff_recommended: reply.handoffRecommended,
        },
        created_at: new Date().toISOString(),
      });
    } catch (error: any) {
      const message = error?.message || "Falha ao enviar resposta automatica";
      autoSendResult = {
        attempted: true,
        status: "failed",
        error: message,
      };
      console.error("[whatsapp-sales-reply-runtime][auto-send]", error);
      await params.supabase.from("system_event_logs").insert({
        tenant_id: params.tenantId,
        user_id: params.actorUserId || null,
        source: "whatsapp",
        provider: "mayus",
        event_name: autoReply.failedEventName,
        status: "error",
        payload: {
          contact_id: contact.id,
          trigger: params.trigger,
          model_used: autoReply.modelUsed,
          error: message,
          first_response_sla_minutes: reply.firstResponseSlaMinutes,
        },
        created_at: new Date().toISOString(),
      });
    }
  }

  if (params.notify) {
    const notification = operatingPartnerDecision
      ? buildOperatingPartnerNotification(operatingPartnerDecision, contact.name)
      : llmReply
        ? buildLlmNotification(llmReply, contact.name)
        : buildNotification(reply, contact.name);
    await params.supabase.from("notifications").insert({
      tenant_id: params.tenantId,
      user_id: null,
      title: autoSendResult.status === "sent" ? "MAYUS respondeu o lead" : notification.title,
      message: autoSendResult.status === "sent"
        ? `${contact.name || "lead WhatsApp"}: primeira resposta enviada pelo MAYUS.`.slice(0, 180)
        : autoSendResult.status === "failed"
          ? `${contact.name || "lead WhatsApp"}: resposta pronta, mas autoenvio falhou.`.slice(0, 180)
          : notification.message,
      type: autoSendResult.status === "sent" ? "success" : notification.type,
      link_url: "/dashboard/conversas/whatsapp",
      created_at: new Date().toISOString(),
    });
  }

  return {
    contact,
    reply,
    llmReply,
    operatingPartnerDecision,
    operatingPartnerActionResults,
    autoSendResult,
    metadata: {
      ...metadata,
      auto_sent: autoSendResult.status === "sent",
      auto_send_error: autoSendResult.status === "failed" ? autoSendResult.error : null,
    } as Record<string, any>,
  };
}
