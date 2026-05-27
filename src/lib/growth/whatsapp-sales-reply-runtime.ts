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
  type MayusOwnerOfficeSnapshot,
  type MayusWhatsAppActorContext,
  type MayusOfficeKnowledgeProfile,
  type MayusPreviousConversationEvent,
} from "@/lib/agent/mayus-operating-partner";
import {
  executeMayusOperatingPartnerActions,
  type MayusOperatingPartnerActionResult,
} from "@/lib/agent/mayus-operating-partner-actions";
import { sendWhatsAppMessage, type SendWhatsAppMessageResult } from "@/lib/whatsapp/send-message";
import type { WhatsAppSendProvider } from "@/lib/whatsapp/send-message";
import { synthesizeWhatsAppReplyAudio } from "@/lib/whatsapp/tts";
import {
  RMC_FORBIDDEN_CLAIMS,
  RMC_OFFER_POSITIONING,
  RMC_PLAYBOOK_CONTEXT,
  RMC_QUALIFICATION_QUESTIONS,
  RMC_SALES_DOCUMENT_SUMMARY,
  RMC_SALES_RULES,
} from "@/lib/growth/rmc-playbook";
import { normalizeOfficePlaybookProfile, summarizeOfficePlaybookForPrompt } from "@/lib/growth/office-playbook-profile";
import { fetchWhatsAppProcessStatusContext, type WhatsAppProcessStatusContext } from "@/lib/whatsapp/process-status-context";
import { buildWhatsAppAgentTurnV2, resolveWhatsAppDeliveryPolicy } from "@/lib/whatsapp/agent-v2";
import { isAuthorizedWhatsAppCommandSender } from "@/lib/mayus/whatsapp-command-center";
import {
  buildInstitutionalMemoryPromptBlock,
  DEFAULT_INSTITUTIONAL_MEMORY_PROMPT_CAP,
  loadEnforcedInstitutionalMemory,
} from "@/lib/agent/memory/institutional";
import {
  buildTenantOperationalMethodologyContext,
  summarizeTenantOperationalMethodologyContext,
  type TenantOperationalMethodologyContext,
} from "@/lib/setup/tenant-operational-methodology";
import type { OfficeOperationalMethodology } from "@/lib/setup/office-setup-conversation";

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getOfficeNameValue(value: unknown) {
  const text = getStringValue(value);
  if (!text) return null;
  return /^mayus$/i.test(text) ? null : text;
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

function shouldUseDefaultRmcPlaybook(features: Record<string, any>) {
  return getStringValue(features.sales_playbook_template) === "rmc_dutra";
}

function getPlainRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function buildWhatsAppActorContext(params: {
  senderPhoneAuthorized: boolean;
  processStatusContext?: WhatsAppProcessStatusContext | null;
  crmContext?: MayusOperatingPartnerCrmContext | null;
}): MayusWhatsAppActorContext {
  if (params.senderPhoneAuthorized) {
    return {
      role: "office_operator",
      sender_phone_authorized: true,
      reason: "daily_playbook_authorized_phone",
    };
  }

  if (params.processStatusContext?.verified === true) {
    return {
      role: "external_client",
      sender_phone_authorized: false,
      reason: "verified_process_contact",
    };
  }

  if (params.crmContext?.crm_task_id) {
    return {
      role: "lead",
      sender_phone_authorized: false,
      reason: "crm_context",
    };
  }

  return {
    role: "unknown",
    sender_phone_authorized: false,
    reason: "no_actor_signal",
  };
}

function buildConversationResolutionMetadata(decision?: MayusOperatingPartnerDecision | null) {
  const frame = decision?.conversation_frame;
  return {
    type: frame?.resolution_type || null,
    writer_mode: frame?.writer_mode || null,
    llm_writer_allowed: frame?.llm_writer_allowed ?? null,
    hard_guardrail_reason: frame?.hard_guardrail_reason || null,
    recommended_intent: frame?.recommended_intent || decision?.intent || null,
    resolved_reference: frame?.resolved_reference || null,
    candidate_count: frame?.candidate_summaries?.length || 0,
    final_response_source: decision?.final_response_source || null,
    quality_status: decision?.quality_check?.status || null,
    quality_flags: decision?.quality_check?.flags || [],
  };
}

function mapOperationalMethodologyAreaMethods(context: TenantOperationalMethodologyContext) {
  return context.areaMethods.map((method) => ({
    area: method.area,
    intake_questions: method.intakeQuestions,
    required_documents: method.requiredDocuments,
    handoff_triggers: [],
    default_pipeline: method.phases,
    document_structure: method.documentStructure,
    owner_team: method.ownerTeam,
    validation_status: method.validationStatus,
    next_review_question: method.nextReviewQuestion || `Validar metodologia de ${method.area}.`,
  })).slice(0, 8);
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
  const officeKnowledge = features.office_knowledge_profile;
  const operationalMethodology = getPlainRecord(features.operational_methodology);
  const methodologyContext = buildTenantOperationalMethodologyContext(
    operationalMethodology as OfficeOperationalMethodology | null,
  );
  const methodologyIdentity = getPlainRecord(operationalMethodology?.identity);
  const methodologyIntake = getPlainRecord(operationalMethodology?.intake);
  const methodologyCaseFlow = getPlainRecord(operationalMethodology?.case_flow);
  const methodologyAreaPlaybooks = mapOperationalMethodologyAreaMethods(methodologyContext);
  const methodologySummary = summarizeTenantOperationalMethodologyContext(methodologyContext) || null;
  const officePlaybook = normalizeOfficePlaybookProfile(features.office_playbook_profile);
  const officePlaybookSummary = summarizeOfficePlaybookForPrompt(officePlaybook);
  const officeProfile = getPlainRecord(officeKnowledge);
  const assistantName = getStringValue(officeProfile?.assistant_name)
    || getStringValue(officeProfile?.assistantName)
    || getStringValue(whatsappAgent?.assistant_name)
    || getStringValue(whatsappAgent?.assistantName);
  const normalizedProfile = profile && typeof profile === "object" && !Array.isArray(profile)
    ? profile as Record<string, any>
    : null;
  const useDefaultRmcPlaybook = shouldUseDefaultRmcPlaybook(features);
  const salesRules = getStringArray(features.sales_rules).length
    ? getStringArray(features.sales_rules)
    : getStringArray(normalizedProfile?.sales_rules);
  const qualificationQuestions = getStringArray(features.qualification_questions).length
    ? getStringArray(features.qualification_questions)
    : getStringArray(normalizedProfile?.qualification_questions);
  const forbiddenClaims = getStringArray(features.forbidden_claims).length
    ? getStringArray(features.forbidden_claims)
    : getStringArray(normalizedProfile?.forbidden_claims);

  return {
    salesProfile: (normalizedProfile || officePlaybook || useDefaultRmcPlaybook)
      ? {
        firmName: getStringValue(features.firm_name) || getStringValue(normalizedProfile?.firm_name) || officePlaybook?.office_name,
        idealClient: getStringValue(normalizedProfile?.ideal_client) || officePlaybook?.ideal_client,
        coreSolution: getStringValue(normalizedProfile?.core_solution),
        uniqueValueProposition: getStringValue(normalizedProfile?.unique_value_proposition),
        valuePillars: Array.isArray(normalizedProfile?.value_pillars)
          ? getStringArray(normalizedProfile?.value_pillars)
          : [],
        positioningSummary: getStringValue(normalizedProfile?.positioning_summary),
        salesPlaybookContext: getStringValue(features.sales_playbook_context)
          || getStringValue(features.sales_document_context)
          || getStringValue(normalizedProfile?.sales_playbook_context)
          || getStringValue(normalizedProfile?.sales_document_context)
          || officePlaybookSummary
          || (useDefaultRmcPlaybook ? RMC_PLAYBOOK_CONTEXT : null),
        salesDocumentSummary: getStringValue(features.sales_document_summary)
          || getStringValue(normalizedProfile?.sales_document_summary)
          || (useDefaultRmcPlaybook ? RMC_SALES_DOCUMENT_SUMMARY : null),
        salesRules: useDefaultRmcPlaybook
          ? Array.from(new Set([...RMC_SALES_RULES, ...salesRules]))
          : salesRules,
        qualificationQuestions: useDefaultRmcPlaybook
          ? Array.from(new Set([...RMC_QUALIFICATION_QUESTIONS, ...qualificationQuestions]))
          : Array.from(new Set([...(officePlaybook?.qualification_questions || []), ...qualificationQuestions])),
        offerPositioning: getStringValue(features.offer_positioning)
          || getStringValue(normalizedProfile?.offer_positioning)
          || officePlaybook?.offer_positioning
          || (useDefaultRmcPlaybook ? RMC_OFFER_POSITIONING : null),
        forbiddenClaims: useDefaultRmcPlaybook
          ? Array.from(new Set([...RMC_FORBIDDEN_CLAIMS, ...forbiddenClaims]))
          : Array.from(new Set([...(officePlaybook?.forbidden_claims || []), ...forbiddenClaims])),
      }
      : null,
    officePlaybookProfile: officePlaybook,
    officeKnowledgeProfile: officeProfile || assistantName || operationalMethodology
      ? {
        assistantName,
        officeName: getOfficeNameValue(officeProfile?.office_name)
          || getOfficeNameValue(officeProfile?.officeName)
          || getOfficeNameValue(methodologyIdentity?.office_name)
          || getOfficeNameValue(features.firm_name)
          || getOfficeNameValue(officePlaybook?.office_name),
        practiceAreas: getStringArray(officeProfile?.practice_areas).length
          ? getStringArray(officeProfile?.practice_areas)
          : getStringArray(officeProfile?.practiceAreas).length
            ? getStringArray(officeProfile?.practiceAreas)
            : getStringArray(methodologyIdentity?.practice_areas).length
              ? getStringArray(methodologyIdentity?.practice_areas)
              : methodologyAreaPlaybooks.map((method) => method.area),
        triageRules: getStringArray(officeProfile?.triage_rules).length
          ? getStringArray(officeProfile?.triage_rules)
          : getStringArray(officeProfile?.triageRules).length
            ? getStringArray(officeProfile?.triageRules)
            : getStringArray(methodologyIntake?.rules),
        humanHandoffRules: getStringArray(officeProfile?.human_handoff_rules).length
          ? getStringArray(officeProfile?.human_handoff_rules)
          : getStringArray(officeProfile?.humanHandoffRules).length
            ? getStringArray(officeProfile?.humanHandoffRules)
            : getStringArray(methodologyIntake?.human_handoff_rules),
        communicationTone: getStringValue(officeProfile?.communication_tone) || getStringValue(officeProfile?.communicationTone) || getStringValue(methodologyIdentity?.communication_tone),
        requiredDocumentsByCase: getStringArray(officeProfile?.required_documents_by_case).length
          ? getStringArray(officeProfile?.required_documents_by_case)
          : getStringArray(officeProfile?.requiredDocumentsByCase).length
            ? getStringArray(officeProfile?.requiredDocumentsByCase)
            : getStringArray(methodologyIntake?.required_documents_by_case),
        forbiddenClaims: getStringArray(officeProfile?.forbidden_claims).length
          ? getStringArray(officeProfile?.forbidden_claims)
          : getStringArray(officeProfile?.forbiddenClaims).length
            ? getStringArray(officeProfile?.forbiddenClaims)
            : getStringArray(methodologyIdentity?.forbidden_claims),
        pricingPolicy: getStringValue(officeProfile?.pricing_policy) || getStringValue(officeProfile?.pricingPolicy),
        responseSla: getStringValue(officeProfile?.response_sla) || getStringValue(officeProfile?.responseSla),
        departments: getStringArray(officeProfile?.departments).length ? getStringArray(officeProfile?.departments) : getStringArray(methodologyCaseFlow?.departments),
        permissionPolicy: getStringValue(officeProfile?.permission_policy) || getStringValue(officeProfile?.permissionPolicy) || getStringValue(methodologyCaseFlow?.permission_policy),
        calendarPolicy: getStringValue(officeProfile?.calendar_policy) || getStringValue(officeProfile?.calendarPolicy) || getStringValue(methodologyCaseFlow?.calendar_policy),
        financePolicy: getStringValue(officeProfile?.finance_policy) || getStringValue(officeProfile?.financePolicy) || getStringValue(methodologyCaseFlow?.finance_policy),
        playbookNotes: getStringValue(officeProfile?.playbook_notes) || getStringValue(officeProfile?.playbookNotes),
        operationalMethodologyStatus: getStringValue(operationalMethodology?.status),
        operationalMethodologySummary: methodologySummary,
        practiceAreaPlaybooks: Array.isArray(officeProfile?.practice_area_playbooks)
          ? officeProfile.practice_area_playbooks
          : Array.isArray(officeProfile?.practiceAreaPlaybooks)
            ? officeProfile.practiceAreaPlaybooks
            : methodologyAreaPlaybooks,
      } satisfies MayusOfficeKnowledgeProfile
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
    aiFeatures: features,
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

function normalizeRiskFlagsForProcessStatus(flags: string[], processStatusContext: Awaited<ReturnType<typeof fetchWhatsAppProcessStatusContext>>) {
  const unique = Array.from(new Set(flags));
  if (processStatusContext?.verified !== true) return unique;
  const cleaned = unique.filter((flag) => flag !== "case_status_unverified");
  return cleaned.includes("case_status_verified") ? cleaned : [...cleaned, "case_status_verified"];
}

const OPERATING_PARTNER_TIMEOUT_MS = {
  manual: 120000,
  webhook: 52000,
};

const WHATSAPP_REPLY_BLOCK_LIMIT = 650;

function splitWhatsAppReplyBlocks(text?: string | null) {
  const value = String(text || "").replace(/\s+\n/g, "\n").trim();
  if (!value) return [] as string[];
  if (value.length <= WHATSAPP_REPLY_BLOCK_LIMIT) return [value];

  const units = value
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  const blocks: string[] = [];
  let current = "";

  for (const unit of units.length ? units : [value]) {
    if (unit.length > WHATSAPP_REPLY_BLOCK_LIMIT) {
      if (current) blocks.push(current);
      for (let index = 0; index < unit.length; index += WHATSAPP_REPLY_BLOCK_LIMIT) {
        blocks.push(unit.slice(index, index + WHATSAPP_REPLY_BLOCK_LIMIT).trim());
      }
      current = "";
      continue;
    }

    const next = current ? `${current} ${unit}` : unit;
    if (next.length > WHATSAPP_REPLY_BLOCK_LIMIT) {
      if (current) blocks.push(current);
      current = unit;
    } else {
      current = next;
    }
  }

  if (current) blocks.push(current);
  return blocks.slice(0, 4);
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

function saoPauloDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function loadOwnerOfficeSnapshot(params: {
  supabase: SupabaseClient;
  tenantId: string;
  actorContext: MayusWhatsAppActorContext;
}): Promise<MayusOwnerOfficeSnapshot | null> {
  if (params.actorContext.role !== "office_operator") return null;

  const today = saoPauloDateKey();

  try {
    const query = params.supabase.from("sales");
    if (typeof (query as any).select !== "function") {
      return {
        sales_today: {
          checked: false,
          date: today,
          source: "none",
          count: 0,
          amount: null,
          highlights: [],
          note: "Tabela de vendas indisponivel no cliente Supabase.",
        },
      };
    }

    const { data, error } = await query
      .select("id, client_name, ticket_total, status, contract_date, created_at")
      .eq("tenant_id", params.tenantId)
      .eq("contract_date", today)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    const rows = Array.isArray(data) ? data as Array<{
      client_name: string | null;
      ticket_total: number | string | null;
      status: string | null;
    }> : [];
    const total = rows.reduce((sum, row) => {
      const value = Number(row.ticket_total || 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    return {
      sales_today: {
        checked: true,
        date: today,
        source: "sales",
        count: rows.length,
        amount: rows.length ? total : 0,
        highlights: rows.slice(0, 5).map((row) => ({
          title: getStringValue(row.client_name) || "Venda sem cliente",
          value: Number.isFinite(Number(row.ticket_total || 0)) ? Number(row.ticket_total || 0) : null,
          status: getStringValue(row.status),
        })),
        note: rows.length ? "Vendas encontradas na tabela sales." : "Nenhuma venda registrada na tabela sales para hoje.",
      },
    };
  } catch (error) {
    return {
      sales_today: {
        checked: false,
        date: today,
        source: "none",
        count: 0,
        amount: null,
        highlights: [],
        note: sanitizeFallbackReason(error),
      },
    };
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

function getAutoSendBlockedReason(params: {
  autoReply: { shouldAutoSend: boolean; source: string } | null;
  metadata: Record<string, any>;
  autoSendFirstResponse?: boolean;
  trigger: "manual" | "meta_webhook" | "evolution_webhook";
  assignedUserId?: string | null;
  canAutoRespondAssigned: boolean;
  canAutoRespondAssignedSafely?: boolean;
  phoneNumber?: string | null;
}) {
  if (!params.autoReply) return "no_auto_reply";
  if (!params.autoReply.shouldAutoSend) return "reply_not_marked_auto_send";
  if (params.metadata.may_auto_send !== true) return "metadata_disallows_auto_send";
  if (params.autoSendFirstResponse !== true) return "auto_send_disabled";
  if (params.trigger === "manual") return "manual_trigger";
  if (params.assignedUserId && !params.canAutoRespondAssigned && !params.canAutoRespondAssignedSafely) return "assigned_contact_blocked";
  if (!params.phoneNumber) return "missing_phone_number";
  if (params.autoReply.source !== "mayus_operating_partner_auto_reply") {
    return params.autoReply.source === "deterministic_whatsapp_auto_reply"
      ? params.metadata.fallback_reason === "operating_partner:provider_timeout"
        ? "operating_partner_timeout_no_agentic_answer"
        : "deterministic_fallback_not_agentic"
      : "non_agentic_reply_source";
  }
  return null;
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

type WhatsAppInboundMessageMarker = {
  id: string | null;
  created_at: string | null;
};

type WhatsAppReplyModality = "text" | "audio";

function normalizeInboundMessageMarker(row: any): WhatsAppInboundMessageMarker {
  return {
    id: getStringValue(row?.id),
    created_at: getStringValue(row?.created_at),
  };
}

function getLatestInboundMessageMarker(messages: any[]): WhatsAppInboundMessageMarker {
  const latestInbound = [...messages]
    .reverse()
    .find((message) => message?.direction === "inbound");
  return normalizeInboundMessageMarker(latestInbound);
}

function buildReplyTargetMarker(params: {
  replyTargetMessageId?: string | null;
  replyTargetCreatedAt?: string | null;
  latestInboundAtDecision: WhatsAppInboundMessageMarker;
}): WhatsAppInboundMessageMarker {
  return {
    id: getStringValue(params.replyTargetMessageId) || params.latestInboundAtDecision.id,
    created_at: getStringValue(params.replyTargetCreatedAt) || params.latestInboundAtDecision.created_at,
  };
}

function getLatestInboundMessage(messages: any[]) {
  return [...messages]
    .reverse()
    .find((message) => message?.direction === "inbound") || null;
}

function messageTextForModality(message: any) {
  return [
    message?.content,
    message?.media_text,
    message?.media_summary,
  ]
    .map((value) => getStringValue(value))
    .filter(Boolean)
    .join(" ");
}

function wantsAudioReply(text?: string | null) {
  const value = String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!value.trim()) return false;
  return /\b(manda|mande|responde|responda|envia|envie|fala|fale)\b.{0,48}\b(audio|voz)\b/.test(value)
    || /\b(por|em)\s+(audio|voz)\b/.test(value)
    || /\bresposta\s+(em|por)\s+(audio|voz)\b/.test(value);
}

function resolveReplyModality(messages: any[]): {
  modality: WhatsAppReplyModality;
  policy: "mirror_audio" | "text_default";
  reason: string;
} {
  const latestInbound = getLatestInboundMessage(messages);
  if (!latestInbound) {
    return { modality: "text", policy: "text_default", reason: "no_inbound_message" };
  }

  if (latestInbound.message_type === "audio") {
    return { modality: "audio", policy: "mirror_audio", reason: "last_inbound_was_audio" };
  }

  if (wantsAudioReply(messageTextForModality(latestInbound))) {
    return { modality: "audio", policy: "mirror_audio", reason: "user_requested_audio_reply" };
  }

  return { modality: "text", policy: "text_default", reason: "text_turn" };
}

async function loadLatestInboundMessageMarker(params: {
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
}): Promise<WhatsAppInboundMessageMarker> {
  const { data, error } = await params.supabase
    .from("whatsapp_messages")
    .select("id, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("contact_id", params.contactId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return normalizeInboundMessageMarker(data?.[0]);
}

function parseDateMs(value: string | null) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isReplyTargetStillLatest(params: {
  target: WhatsAppInboundMessageMarker;
  latest: WhatsAppInboundMessageMarker;
}) {
  if (!params.target.id && !params.target.created_at) return true;
  if (!params.latest.id && !params.latest.created_at) return true;
  if (params.target.id && params.latest.id) return params.target.id === params.latest.id;

  const targetMs = parseDateMs(params.target.created_at);
  const latestMs = parseDateMs(params.latest.created_at);
  if (targetMs !== null && latestMs !== null) return latestMs <= targetMs;
  return true;
}

function canAutoRespondAssignedSafely(params: {
  decision: MayusOperatingPartnerDecision | null;
  processStatusContext: Awaited<ReturnType<typeof fetchWhatsAppProcessStatusContext>>;
}) {
  const decision = params.decision;
  if (!decision) return false;
  if (decision.requires_approval || decision.risk_flags.length > 0 || decision.should_auto_send !== true) return false;
  if (decision.intent === "process_status") return params.processStatusContext?.verified === true;
  if (decision.intent === "client_support") {
    return decision.actions_to_execute.some((action) => action.type === "create_task" || action.type === "answer_support");
  }
  return false;
}

export async function prepareWhatsAppSalesReplyForContact(params: {
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
  actorUserId?: string | null;
  trigger: "manual" | "meta_webhook" | "evolution_webhook";
  notify?: boolean;
  autoSendFirstResponse?: boolean;
  preferredProvider?: WhatsAppSendProvider | null;
  replyTargetMessageId?: string | null;
  replyTargetCreatedAt?: string | null;
  brainTrace?: {
    taskId?: string | null;
    runId?: string | null;
    stepId?: string | null;
  } | null;
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
    .select("id, direction, content, message_type, media_url, media_filename, media_mime_type, media_processing_status, media_text, media_summary, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const runtimeSettings = await loadSalesRuntimeSettings({
    supabase: params.supabase,
    tenantId: params.tenantId,
  });
  const orderedMessages = (messages || []).reverse();
  const latestInboundAtDecision = getLatestInboundMessageMarker(orderedMessages);
  const replyTarget = buildReplyTargetMarker({
    replyTargetMessageId: params.replyTargetMessageId,
    replyTargetCreatedAt: params.replyTargetCreatedAt,
    latestInboundAtDecision,
  });
  const senderPhoneAuthorized = isAuthorizedWhatsAppCommandSender({
    senderPhone: contact.phone_number || "",
    aiFeatures: runtimeSettings.aiFeatures,
  });
  const [crmContext, previousMayusEvent, processStatusContext, institutionalMemory] = await Promise.all([
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
    fetchWhatsAppProcessStatusContext({
      supabase: params.supabase,
      tenantId: params.tenantId,
      contact,
      messages: orderedMessages,
      senderPhoneAuthorized,
    }),
    loadEnforcedInstitutionalMemory(params.supabase, params.tenantId, { limit: 12 }),
  ]);
  const whatsappActorContext = buildWhatsAppActorContext({
    senderPhoneAuthorized,
    processStatusContext,
    crmContext,
  });
  const ownerOfficeSnapshot = await loadOwnerOfficeSnapshot({
    supabase: params.supabase,
    tenantId: params.tenantId,
    actorContext: whatsappActorContext,
  });
  const agentTurnV2 = buildWhatsAppAgentTurnV2({
    messages: orderedMessages,
    actorContext: whatsappActorContext,
    trigger: params.trigger,
  });
  const replyModalityPreference = {
    modality: agentTurnV2.outputModality,
    policy: agentTurnV2.outputModalityPolicy,
    reason: agentTurnV2.outputModalityReason,
  };
  const agentV2Metadata = {
    agent_version: agentTurnV2.agentVersion,
    input_modalities: agentTurnV2.inputModalities,
    media_contexts: agentTurnV2.mediaContexts,
    latest_media_context: agentTurnV2.latestMediaContext,
    media_processing_status: agentTurnV2.latestMediaContext?.status || null,
    transcription_source: agentTurnV2.latestMediaContext?.transcriptionSource || null,
    vision_source: agentTurnV2.latestMediaContext?.visionSource || null,
    output_modality: agentTurnV2.outputModality,
    output_modality_policy: agentTurnV2.outputModalityPolicy,
    output_modality_reason: agentTurnV2.outputModalityReason,
    delivery_profile: agentTurnV2.deliveryPolicy.profile,
    humanize_delivery: agentTurnV2.deliveryPolicy.humanizeDelivery,
    humanize_delivery_mode: agentTurnV2.deliveryPolicy.humanizeDeliveryMode,
    typing_delay_ms: agentTurnV2.deliveryPolicy.typingDelayMs,
    max_blocking_delay_ms: agentTurnV2.deliveryPolicy.maxBlockingDelayMs,
    reply_block_gap_ms: agentTurnV2.deliveryPolicy.replyBlockGapMs,
    delivery_policy_reason: agentTurnV2.deliveryPolicy.reason,
  };
  const institutionalMemoryPrompt = buildInstitutionalMemoryPromptBlock(
    institutionalMemory,
    DEFAULT_INSTITUTIONAL_MEMORY_PROMPT_CAP,
  );
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
    ...agentV2Metadata,
    reply_source: "deterministic_fallback",
    model_used: "deterministic",
    fallback_reason: null,
    whatsapp_actor_context: whatsappActorContext,
    owner_office_snapshot: ownerOfficeSnapshot,
    reply_modality: replyModalityPreference.modality,
    audio_policy: replyModalityPreference.policy,
    audio_requested_reason: replyModalityPreference.reason,
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
        officeKnowledgeProfile: runtimeSettings.officeKnowledgeProfile,
        officePlaybookProfile: runtimeSettings.officePlaybookProfile,
        institutionalMemory,
        crmContext,
        ownerOfficeSnapshot,
        processStatusContext,
        whatsappActorContext,
        previousMayusEvent,
        salesTestbench: runtimeSettings.salesLlmTestbench,
        operatingPartner: runtimeSettings.mayusOperatingPartner,
      }), params.trigger === "manual" ? OPERATING_PARTNER_TIMEOUT_MS.manual : OPERATING_PARTNER_TIMEOUT_MS.webhook, "MAYUS Operating Partner");
      const normalizedRiskFlags = normalizeRiskFlagsForProcessStatus([
        ...deterministicMetadata.risk_flags,
        ...operatingPartnerDecision.risk_flags,
      ], processStatusContext);
      const resolvedActorContext = operatingPartnerDecision.whatsapp_actor_context || whatsappActorContext;
      const conversationResolution = buildConversationResolutionMetadata(operatingPartnerDecision);
      metadata = {
        ...deterministicMetadata,
        ...agentV2Metadata,
        reply_source: "operating_partner",
        model_used: operatingPartnerDecision.model_used,
        fallback_reason: null,
        mode: operatingPartnerDecision.should_auto_send ? "suggested_reply" : "human_review_required",
        suggested_reply: operatingPartnerDecision.reply,
        internal_note: `MAYUS Operating Partner supervisionado: ${operatingPartnerDecision.next_action}`,
        risk_flags: normalizedRiskFlags,
        may_auto_send: operatingPartnerDecision.should_auto_send,
        requires_human_review: operatingPartnerDecision.requires_approval || !operatingPartnerDecision.should_auto_send || operatingPartnerDecision.risk_flags.length > 0,
        institutional_memory_loaded: institutionalMemoryPrompt.totalAvailable,
        institutional_memory_applied: institutionalMemoryPrompt.appliedCount,
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
          whatsapp_actor_context: resolvedActorContext,
          actor_context: resolvedActorContext,
          process_status_context: processStatusContext,
          owner_office_snapshot: ownerOfficeSnapshot,
          conversation_frame: operatingPartnerDecision.conversation_frame,
          conversation_resolution: conversationResolution,
          quality_check: operatingPartnerDecision.quality_check,
          final_response_source: operatingPartnerDecision.final_response_source,
          conversation_classification: operatingPartnerDecision.conversation_classification,
          agentic_governance: operatingPartnerDecision.agentic_governance,
          openclaw_policy: operatingPartnerDecision.agentic_governance?.openclaw_policy,
          hermes_trajectory: operatingPartnerDecision.agentic_governance?.hermes_trajectory,
          paperclip_mission: operatingPartnerDecision.agentic_governance?.paperclip_mission,
          reasoning_summary_for_team: operatingPartnerDecision.reasoning_summary_for_team,
          expected_outcome: operatingPartnerDecision.expected_outcome,
          institutional_memory_loaded: institutionalMemoryPrompt.totalAvailable,
          institutional_memory_applied: institutionalMemoryPrompt.appliedCount,
        },
        conversation_state: operatingPartnerDecision.conversation_state,
        closing_readiness: operatingPartnerDecision.closing_readiness,
        support_summary: operatingPartnerDecision.support_summary,
        conversation_classification: operatingPartnerDecision.conversation_classification,
        agentic_governance: operatingPartnerDecision.agentic_governance,
        openclaw_policy: operatingPartnerDecision.agentic_governance?.openclaw_policy,
        hermes_trajectory: operatingPartnerDecision.agentic_governance?.hermes_trajectory,
        paperclip_mission: operatingPartnerDecision.agentic_governance?.paperclip_mission,
        reasoning_summary_for_team: operatingPartnerDecision.reasoning_summary_for_team,
        process_status_context: processStatusContext,
        owner_office_snapshot: ownerOfficeSnapshot,
        whatsapp_actor_context: resolvedActorContext,
        actor_context: resolvedActorContext,
        conversation_frame: operatingPartnerDecision.conversation_frame,
        conversation_resolution: conversationResolution,
        quality_check: operatingPartnerDecision.quality_check,
        final_response_source: operatingPartnerDecision.final_response_source,
      };
    } catch (error) {
      const reason = sanitizeFallbackReason(error);
      fallbackReasons.push(`operating_partner:${reason}`);
      console.error("[whatsapp-sales-reply-runtime][operating-partner]", error);
      metadata = {
        ...deterministicMetadata,
        ...agentV2Metadata,
        reply_source: "deterministic_fallback",
        model_used: "deterministic",
        fallback_reason: fallbackReasons.join("|"),
        whatsapp_actor_context: whatsappActorContext,
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
        ...agentV2Metadata,
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
        ...agentV2Metadata,
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
      replyBlocks: operatingPartnerDecision.reply_blocks,
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
        replyBlocks: undefined,
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
          replyBlocks: undefined,
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
  const assignedSafeAutoReply = canAutoRespondAssignedSafely({ decision: operatingPartnerDecision, processStatusContext });
  let blockedReason = getAutoSendBlockedReason({
    autoReply,
    metadata,
    autoSendFirstResponse: params.autoSendFirstResponse,
    trigger: params.trigger,
    assignedUserId: contact.assigned_user_id,
    canAutoRespondAssigned,
    canAutoRespondAssignedSafely: assignedSafeAutoReply,
    phoneNumber: contact.phone_number,
  });
  let canAutoSend = Boolean(
    autoReply?.shouldAutoSend
    && autoReply.source === "mayus_operating_partner_auto_reply"
    && metadata.may_auto_send === true
    && params.autoSendFirstResponse === true
    && params.trigger !== "manual"
    && (!contact.assigned_user_id || canAutoRespondAssigned || assignedSafeAutoReply)
    && contact.phone_number
  );
  const latestInboundAtSend = await loadLatestInboundMessageMarker({
    supabase: params.supabase,
    tenantId: params.tenantId,
    contactId: contact.id,
  });
  const replyAbortedReason = canAutoSend && !isReplyTargetStillLatest({
    target: replyTarget,
    latest: latestInboundAtSend,
  })
    ? "newer_message_arrived_during_generation"
    : null;

  if (replyAbortedReason) {
    canAutoSend = false;
    blockedReason = replyAbortedReason;
  }

  const effectiveActorContext = metadata.actor_context || metadata.whatsapp_actor_context || whatsappActorContext;
  const deliveryPolicy = resolveWhatsAppDeliveryPolicy({
    actorContext: effectiveActorContext,
    outputModality: replyModalityPreference.modality,
    trigger: params.trigger,
    replyText: autoReply?.text || llmReply?.reply || operatingPartnerDecision?.reply || reply.suggestedReply || null,
  });
  const runtimeRoute = metadata.conversation_classification?.class
    || operatingPartnerDecision?.intent
    || metadata.reply_source
    || "unknown";
  const runtimeSkill = processStatusContext
    ? processStatusContext.verified === true ? "support_case_status" : "whatsapp_process_query"
    : runtimeRoute === "commercial" || operatingPartnerDecision?.intent === "sales_qualification" || operatingPartnerDecision?.intent === "sales_closing"
      ? "lead_qualify"
      : operatingPartnerDecision?.intent === "legal_triage"
        ? "lead_intake"
        : "mayus_operating_partner";
  metadata = {
    ...metadata,
    mode: replyAbortedReason ? "human_review_required" : metadata.mode,
    may_auto_send: replyAbortedReason ? false : metadata.may_auto_send,
    requires_human_review: replyAbortedReason ? true : metadata.requires_human_review,
    brain_task_id: params.brainTrace?.taskId || null,
    brain_run_id: params.brainTrace?.runId || null,
    brain_step_id: params.brainTrace?.stepId || null,
    skill: metadata.skill || runtimeSkill,
    route: metadata.route || runtimeRoute,
    actor_context: metadata.actor_context || metadata.whatsapp_actor_context || whatsappActorContext,
    conversation_resolution: metadata.conversation_resolution || buildConversationResolutionMetadata(operatingPartnerDecision),
    reply_modality: replyModalityPreference.modality,
    audio_policy: replyModalityPreference.policy,
    audio_requested_reason: replyModalityPreference.reason,
    output_modality: replyModalityPreference.modality,
    delivery_profile: deliveryPolicy.profile,
    humanize_delivery: deliveryPolicy.humanizeDelivery,
    humanize_delivery_mode: deliveryPolicy.humanizeDeliveryMode,
    typing_delay_ms: deliveryPolicy.typingDelayMs,
    max_blocking_delay_ms: deliveryPolicy.maxBlockingDelayMs,
    reply_block_gap_ms: deliveryPolicy.replyBlockGapMs,
    delivery_policy_reason: deliveryPolicy.reason,
    reply_text: autoReply?.text || llmReply?.reply || operatingPartnerDecision?.reply || reply.suggestedReply || null,
    reply_target_message_id: replyTarget.id,
    reply_target_created_at: replyTarget.created_at,
    latest_inbound_message_id_at_decision: latestInboundAtDecision.id,
    latest_inbound_created_at_at_decision: latestInboundAtDecision.created_at,
    latest_inbound_message_id_at_send: latestInboundAtSend.id,
    latest_inbound_created_at_at_send: latestInboundAtSend.created_at,
    reply_aborted_reason: replyAbortedReason,
    freshness_guardrail: {
      target_message_id: replyTarget.id,
      target_created_at: replyTarget.created_at,
      latest_inbound_message_id_at_decision: latestInboundAtDecision.id,
      latest_inbound_message_id_at_send: latestInboundAtSend.id,
      latest_inbound_created_at_at_send: latestInboundAtSend.created_at,
      outcome: replyAbortedReason ? "aborted" : "current",
      reason: replyAbortedReason,
    },
  };
  const firstResponsePolicy = {
    enabled: params.autoSendFirstResponse === true,
    sla_minutes: reply.firstResponseSlaMinutes,
    can_auto_send: canAutoSend,
    assigned_contact_auto_send: canAutoRespondAssigned,
    assigned_contact_safe_auto_send: assignedSafeAutoReply,
    blocked_reason: canAutoSend ? null : blockedReason,
  };

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
      process_status_context: processStatusContext,
      ...metadata,
      first_response_policy: firstResponsePolicy,
    },
    created_at: new Date().toISOString(),
  });

  if (replyAbortedReason) {
    await params.supabase.from("system_event_logs").insert({
      tenant_id: params.tenantId,
      user_id: params.actorUserId || null,
      source: "whatsapp",
      provider: "mayus",
      event_name: "whatsapp_reply_aborted_by_newer_message",
      status: "warning",
      payload: {
        contact_id: contact.id,
        trigger: params.trigger,
        reason: replyAbortedReason,
        reply_target_message_id: replyTarget.id,
        reply_target_created_at: replyTarget.created_at,
        latest_inbound_message_id_at_decision: latestInboundAtDecision.id,
        latest_inbound_message_id_at_send: latestInboundAtSend.id,
        latest_inbound_created_at_at_send: latestInboundAtSend.created_at,
      },
      created_at: new Date().toISOString(),
    });
  }

  if (operatingPartnerDecision && !replyAbortedReason) {
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
      let sendResult: Awaited<ReturnType<typeof sendWhatsAppMessage>> | null = null;
      let replyBlockCount = 0;
      let actualReplyModality: WhatsAppReplyModality = replyModalityPreference.modality;
      let audioProvider: string | null = null;
      let ttsProvider: string | null = null;
      let voiceProfile: string | null = null;
      let voiceIdSource: string | null = null;
      let audioStoragePath: string | null = null;
      let audioFallbackReason: string | null = null;
      const baseSendMetadata = {
        source: autoReply.source,
        provider: autoReply.provider,
        model_used: autoReply.modelUsed,
        intent: autoReply.intent,
        brain_task_id: params.brainTrace?.taskId || null,
        brain_run_id: params.brainTrace?.runId || null,
        brain_step_id: params.brainTrace?.stepId || null,
        skill: metadata.skill || null,
        route: metadata.conversation_classification?.class || autoReply.intent,
        lead_stage: autoReply.leadStage,
        confidence: autoReply.confidence,
        expected_outcome: autoReply.expectedOutcome,
        audio_policy: replyModalityPreference.policy,
        audio_requested_reason: replyModalityPreference.reason,
        agent_version: agentTurnV2.agentVersion,
        input_modalities: agentTurnV2.inputModalities,
        output_modality: replyModalityPreference.modality,
        media_processing_status: agentTurnV2.latestMediaContext?.status || null,
        transcription_source: agentTurnV2.latestMediaContext?.transcriptionSource || null,
        vision_source: agentTurnV2.latestMediaContext?.visionSource || null,
        delivery_profile: deliveryPolicy.profile,
        humanize_delivery: deliveryPolicy.humanizeDelivery,
        humanize_delivery_mode: deliveryPolicy.humanizeDeliveryMode,
        typing_delay_ms: deliveryPolicy.typingDelayMs,
        max_blocking_delay_ms: deliveryPolicy.maxBlockingDelayMs,
        reply_block_gap_ms: deliveryPolicy.replyBlockGapMs,
        reply_text: autoReply.text,
      };

      if (replyModalityPreference.modality === "audio") {
        try {
          const audio = await synthesizeWhatsAppReplyAudio({
            supabase: params.supabase,
            tenantId: params.tenantId,
            contactId: contact.id,
            text: autoReply.text,
          });
          audioProvider = audio.provider;
          ttsProvider = audio.ttsProvider;
          voiceProfile = audio.voiceProfile;
          voiceIdSource = audio.voiceIdSource;
          audioStoragePath = audio.storagePath;
          replyBlockCount = 1;
          sendResult = await sendWhatsAppMessage({
            supabase: params.supabase,
            tenantId: params.tenantId,
            contactId: contact.id,
            phoneNumber: contact.phone_number || "",
            preferredProvider: params.preferredProvider || null,
            audioUrl: audio.audioUrl,
            mediaStoragePath: audio.storagePath,
            mediaMimeType: audio.mimeType,
            mediaFilename: audio.filename,
            humanizeDelivery: deliveryPolicy.humanizeDelivery,
            humanizeDeliveryMode: deliveryPolicy.humanizeDeliveryMode,
            humanizeDeliveryMaxDelayMs: deliveryPolicy.maxBlockingDelayMs,
            metadata: {
              ...baseSendMetadata,
              reply_modality: "audio",
              audio_provider: audio.provider,
              tts_provider: audio.ttsProvider,
              voice_profile: audio.voiceProfile,
              voice_id_source: audio.voiceIdSource,
              audio_storage_path: audio.storagePath,
              reply_block_index: 1,
              reply_block_count: 1,
            },
          });
        } catch (audioError) {
          audioFallbackReason = sanitizeFallbackReason(audioError);
          actualReplyModality = "text";
          console.error("[whatsapp-sales-reply-runtime][audio-reply]", audioError);
        }
      }

      if (!sendResult) {
        const blocks = autoReply.replyBlocks?.length ? autoReply.replyBlocks : splitWhatsAppReplyBlocks(autoReply.text);
        replyBlockCount = blocks.length;
        for (let index = 0; index < blocks.length; index += 1) {
          const block = blocks[index];
          sendResult = await sendWhatsAppMessage({
            supabase: params.supabase,
            tenantId: params.tenantId,
            contactId: contact.id,
            phoneNumber: contact.phone_number || "",
            preferredProvider: params.preferredProvider || null,
            text: block,
            humanizeDelivery: deliveryPolicy.humanizeDelivery,
            humanizeDeliveryMode: deliveryPolicy.humanizeDeliveryMode,
            humanizeDeliveryMaxDelayMs: deliveryPolicy.maxBlockingDelayMs,
            metadata: {
              ...baseSendMetadata,
              reply_modality: "text",
              audio_fallback_reason: audioFallbackReason,
              reply_block_index: index + 1,
              reply_block_count: blocks.length,
            },
          });
        }
      }

      metadata = {
        ...metadata,
        reply_modality: actualReplyModality,
        audio_provider: audioProvider,
        tts_provider: ttsProvider,
        voice_profile: voiceProfile,
        voice_id_source: voiceIdSource,
        audio_storage_path: audioStoragePath,
        audio_fallback_reason: audioFallbackReason,
        output_modality: actualReplyModality,
      };

      if (!sendResult) throw new Error("Resposta automatica vazia");
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
          reply_modality: actualReplyModality,
          audio_policy: replyModalityPreference.policy,
          audio_requested_reason: replyModalityPreference.reason,
          audio_provider: audioProvider,
          tts_provider: ttsProvider,
          voice_profile: voiceProfile,
          voice_id_source: voiceIdSource,
          audio_storage_path: audioStoragePath,
          audio_fallback_reason: audioFallbackReason,
          delivery_profile: deliveryPolicy.profile,
          humanize_delivery: deliveryPolicy.humanizeDelivery,
          humanize_delivery_mode: deliveryPolicy.humanizeDeliveryMode,
          typing_delay_ms: deliveryPolicy.typingDelayMs,
          max_blocking_delay_ms: deliveryPolicy.maxBlockingDelayMs,
          reply_block_count: replyBlockCount,
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
          reply_modality: replyModalityPreference.modality,
          audio_policy: replyModalityPreference.policy,
          delivery_profile: deliveryPolicy.profile,
          humanize_delivery: deliveryPolicy.humanizeDelivery,
          humanize_delivery_mode: deliveryPolicy.humanizeDeliveryMode,
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
      first_response_policy: firstResponsePolicy,
      auto_sent: autoSendResult.status === "sent",
      auto_send_error: autoSendResult.status === "failed" ? autoSendResult.error : null,
    } as Record<string, any>,
  };
}
