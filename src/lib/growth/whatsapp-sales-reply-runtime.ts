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
  normalizeMayusOperatingPartnerConfig,
  type MayusOperatingPartnerConfig,
  type MayusOperatingPartnerDecision,
} from "@/lib/agent/mayus-operating-partner";
import {
  executeMayusOperatingPartnerActions,
  type MayusOperatingPartnerActionResult,
} from "@/lib/agent/mayus-operating-partner-actions";
import { sendWhatsAppMessage, type SendWhatsAppMessageResult } from "@/lib/whatsapp/send-message";

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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
          ? profile.value_pillars.map((item: unknown) => getStringValue(item)).filter((item): item is string => Boolean(item))
          : [],
        positioningSummary: getStringValue(profile.positioning_summary),
      }
      : null,
    salesLlmTestbench: testbench && typeof testbench === "object"
      ? normalizeSalesLlmTestbenchConfig(testbench as Partial<SalesLlmTestbenchConfig>)
      : null,
    mayusOperatingPartner: operatingPartner && typeof operatingPartner === "object"
      ? normalizeMayusOperatingPartnerConfig(operatingPartner as Partial<MayusOperatingPartnerConfig>)
      : null,
    autonomyMode: whatsappAgent && typeof whatsappAgent === "object"
      ? getStringValue(whatsappAgent.autonomy_mode) || "auto_respond"
      : "auto_respond",
  };
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
    .select("direction, content, message_type, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const runtimeSettings = await loadSalesRuntimeSettings({
    supabase: params.supabase,
    tenantId: params.tenantId,
  });

  const orderedMessages = (messages || []).reverse();
  const reply = buildWhatsAppSalesReply({
    contactName: contact.name,
    phoneNumber: contact.phone_number,
    messages: orderedMessages,
    salesProfile: runtimeSettings.salesProfile,
  });
  const deterministicMetadata = buildWhatsAppSalesReplyMetadata(reply);
  let metadata: Record<string, any> = { ...deterministicMetadata };
  let llmReply: SalesLlmReply | null = null;
  let operatingPartnerDecision: MayusOperatingPartnerDecision | null = null;
  let operatingPartnerActionResults: MayusOperatingPartnerActionResult[] = [];
  let autoSendResult: SalesAutoSendResult = {
    attempted: false,
    status: "skipped",
  };

  if (runtimeSettings.mayusOperatingPartner?.enabled) {
    try {
      operatingPartnerDecision = await buildMayusOperatingPartnerDecision({
        supabase: params.supabase,
        tenantId: params.tenantId,
        channel: "whatsapp",
        contactName: contact.name,
        phoneNumber: contact.phone_number,
        messages: orderedMessages,
        salesProfile: runtimeSettings.salesProfile,
        salesTestbench: runtimeSettings.salesLlmTestbench,
        operatingPartner: runtimeSettings.mayusOperatingPartner,
      });
      metadata = {
        ...deterministicMetadata,
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
          expected_outcome: operatingPartnerDecision.expected_outcome,
        },
      };
    } catch (error) {
      console.error("[whatsapp-sales-reply-runtime][operating-partner]", error);
      metadata = {
        ...deterministicMetadata,
        mayus_operating_partner: {
          enabled: true,
          failed: true,
          fallback: runtimeSettings.salesLlmTestbench?.enabled ? "sales_llm_reply" : "deterministic_whatsapp_sales_reply",
        },
      };
    }
  }

  if (!operatingPartnerDecision && runtimeSettings.salesLlmTestbench?.enabled) {
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
      };
    } catch (error) {
      console.error("[whatsapp-sales-reply-runtime][sales-llm]", error);
      metadata = {
        ...deterministicMetadata,
        sales_llm: {
          enabled: true,
          failed: true,
          fallback: "deterministic_whatsapp_sales_reply",
        },
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
      leadStage: null,
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
  const canAutoSend = Boolean(
    autoReply?.shouldAutoSend
    && metadata.may_auto_send === true
    && params.autoSendFirstResponse === true
    && params.trigger !== "manual"
    && !contact.assigned_user_id
    && contact.phone_number
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
      ...metadata,
      first_response_policy: {
        enabled: params.autoSendFirstResponse === true,
        sla_minutes: reply.firstResponseSlaMinutes,
        can_auto_send: canAutoSend,
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
