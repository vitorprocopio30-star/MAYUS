import type { SupabaseClient } from "@supabase/supabase-js";
import {
  prepareWhatsAppSalesReplyForContact,
  sendFrontdeskWhatsAppReply,
} from "@/lib/growth/whatsapp-sales-reply-runtime";
import {
  buildSupportCaseStatusContract,
  getLegalCaseContextSnapshot,
  type SupportCaseStatusContract,
} from "@/lib/lex/case-context";

export type WhatsAppMayusIntent = "sales" | "support" | "human_handoff";
export type WhatsAppMayusAgentRole = "sdr" | "closer" | "support" | "human";
export type WhatsAppMayusGovernanceMode = "ia_only" | "human_only" | "hybrid";
export type WhatsAppMayusDecisionStatus = "prepared" | "auto_send_allowed" | "auto_sent" | "auto_send_failed" | "human_review_required" | "duplicate_suppressed";
export type WhatsAppMayusDecisionStage = "sdr_discovery" | "closer_qualification" | "support_status" | "human_handoff";
export type WhatsAppMayusNextAction = "prepare_reply" | "auto_send_whatsapp" | "notify_human" | "skip_duplicate" | "no_action";
export type WhatsAppMayusDecisionConfidence = "low" | "medium" | "high";

type RuntimeSupabase = SupabaseClient | { from: (table: string) => any };

type WhatsAppContactRecord = {
  id: string;
  name: string | null;
  phone_number: string | null;
  assigned_user_id?: string | null;
  lead_tags?: string[] | null;
};

type WhatsAppMessageRecord = {
  direction: string;
  content: string | null;
  message_type: string | null;
  created_at: string | null;
};

type WhatsAppMayusSettings = {
  governanceMode: WhatsAppMayusGovernanceMode;
  aiFeatures: Record<string, any>;
};

type PrepareWhatsAppMayusReplyParams = {
  supabase: RuntimeSupabase;
  tenantId: string;
  contactId: string;
  actorUserId?: string | null;
  trigger: "manual" | "meta_webhook" | "evolution_webhook";
  notify?: boolean;
  autoSendFirstResponse?: boolean;
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizeText(value?: string | null) {
  return cleanText(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase() || "";
}

function firstName(value?: string | null) {
  return cleanText(value)?.split(/\s+/)[0] || "tudo bem";
}

function isPhoneLike(value?: string | null) {
  const compact = String(value || "").replace(/\D/g, "");
  return compact.length >= 8 && compact.length >= String(value || "").replace(/\s/g, "").length - 2;
}

function getLastInbound(messages: WhatsAppMessageRecord[]) {
  return [...messages].reverse().find((message) => message.direction === "inbound" && cleanText(message.content)) || null;
}

function getLatestInboundAt(messages: WhatsAppMessageRecord[]) {
  return getLastInbound(messages)?.created_at || null;
}

function getConversationText(messages: WhatsAppMessageRecord[]) {
  return messages
    .slice(-8)
    .map((message) => cleanText(message.content))
    .filter(Boolean)
    .join("\n");
}

function getProcessNumber(text: string) {
  return text.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0] || null;
}

function hasSupportSignal(text: string) {
  return /(suporte|status|atualiza[cç][aã]o|andamento|movimenta[cç][aã]o|publica[cç][aã]o|meu\s+caso|meu\s+processo|n[uú]mero\s+do\s+processo|consulta\s+processual|audi[eê]ncia|per[ií]cia|senten[cç]a|recurso|prazo|documento\s+pendente|pend[eê]ncia|juntada|protocolo)/i.test(text);
}

function hasHumanSignal(text: string) {
  return /(humano|atendente|advogado|doutor|doutora|respons[aá]vel|falar\s+com|prefiro\s+falar|pessoa\s+da\s+equipe|algu[eé]m\s+da\s+equipe|me\s+liga|ligar|telefone|chamada)/i.test(text);
}

function hasCloserSignal(text: string) {
  return /(valor|valores|pre[cç]o|custa|or[cç]amento|honor[aá]rio|honorarios|proposta|contrato|assin|pix|boleto|pagamento|forma\s+de\s+pagamento|entrada|fechar|fechamento|posso\s+fechar|parcel|proxima\s+etapa|pr[oó]ximo\s+passo)/i.test(text);
}

function normalizeGovernanceMode(value: unknown): WhatsAppMayusGovernanceMode {
  return value === "ia_only" || value === "human_only" || value === "hybrid" ? value : "ia_only";
}

function hasExplicitHumanHandoffSignal(text: string) {
  return /(humano|atendente|advogado|doutor|doutora|respons[aÃ¡]vel|falar\s+com\s+(uma\s+)?pessoa|prefiro\s+falar\s+com\s+(uma\s+)?pessoa|pessoa\s+da\s+equipe|algu[eÃ©]m\s+da\s+equipe)/i.test(text);
}

function hasSalesAdvanceSignal(text: string) {
  return /(valor|valores|pre[cÃ§]o|custa|or[cÃ§]amento|honor[aÃ¡]rio|honorarios|proposta|contrato|assin|pix|boleto|pagamento|forma\s+de\s+pagamento|entrada|fechar|fechamento|posso\s+fechar|parcel|proxima\s+etapa|pr[oÃ³]ximo\s+passo|reuni[aÃ£]o|agenda|agendar|marcar|call|liga[cÃ§][aÃ£]o|me\s+liga|ligar|telefone|chamada)/i.test(text);
}

function inferDecisionStage(intent: WhatsAppMayusIntent, role: WhatsAppMayusAgentRole): WhatsAppMayusDecisionStage {
  if (intent === "support") return "support_status";
  if (intent === "human_handoff") return "human_handoff";
  return role === "closer" ? "closer_qualification" : "sdr_discovery";
}

function confidenceFromCompleteness(value: unknown): WhatsAppMayusDecisionConfidence {
  const score = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (score >= 65) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function buildDecisionMetadata(params: {
  status: WhatsAppMayusDecisionStatus;
  nextAction: WhatsAppMayusNextAction;
  stage: WhatsAppMayusDecisionStage;
  confidence: WhatsAppMayusDecisionConfidence;
  latestInboundAt: string | null;
  handoffReason?: string | null;
}) {
  return {
    decision_status: params.status,
    next_action: params.nextAction,
    decision_stage: params.stage,
    decision_confidence: params.confidence,
    handoff_reason: params.handoffReason || null,
    latest_inbound_at: params.latestInboundAt,
  };
}

export function inferWhatsAppMayusIntent(params: {
  contact?: Pick<WhatsAppContactRecord, "lead_tags"> | null;
  messages: WhatsAppMessageRecord[];
}): WhatsAppMayusIntent {
  const lastInbound = getLastInbound(params.messages);
  const text = [getConversationText(params.messages), ...(params.contact?.lead_tags || [])].join("\n");
  const normalized = normalizeText(text);

  if (lastInbound && hasExplicitHumanHandoffSignal(normalizeText(lastInbound.content))) return "human_handoff";
  if (hasSupportSignal(normalized) || Boolean(getProcessNumber(text))) return "support";
  return "sales";
}

export function inferWhatsAppMayusAgentRole(params: {
  intent: WhatsAppMayusIntent;
  messages: WhatsAppMessageRecord[];
}): WhatsAppMayusAgentRole {
  if (params.intent === "support") return "support";
  if (params.intent === "human_handoff") return "human";
  const lastInboundText = normalizeText(getLastInbound(params.messages)?.content);
  return (hasCloserSignal(lastInboundText) || hasSalesAdvanceSignal(lastInboundText)) ? "closer" : "sdr";
}

export function buildSupportCaseStatusEntities(params: {
  contact: WhatsAppContactRecord;
  messages: WhatsAppMessageRecord[];
}) {
  const text = getConversationText(params.messages);
  const processNumber = getProcessNumber(text);
  const contactName = cleanText(params.contact.name);
  const usableContactName = contactName && !isPhoneLike(contactName) ? contactName : null;
  const phoneNumber = String(params.contact.phone_number || "").split("@")[0].replace(/\D/g, "");
  const entities: Record<string, string> = {};

  if (processNumber) entities.process_number = processNumber;
  if (phoneNumber.length >= 8) entities.phone_number = phoneNumber;
  if (usableContactName) entities.client_name = usableContactName;
  if (!processNumber && usableContactName) entities.process_reference = usableContactName;

  return entities;
}

function buildHumanHandoffReply(contact: WhatsAppContactRecord) {
  return [
    `Oi, ${firstName(contact.name)}. Entendi que voce quer falar com uma pessoa da equipe.`,
    "Vou deixar o contexto organizado aqui para o responsavel assumir sem voce precisar repetir tudo.",
    "Se puder, me diga em uma frase se o assunto e urgencia, documentos, valor, estrategia do caso ou suporte sobre processo.",
  ].join("\n\n");
}

function buildClientSupportStatusReply(contract: SupportCaseStatusContract, contact: WhatsAppContactRecord) {
  if (contract.responseMode === "handoff") {
    return [
      `Oi, ${firstName(contact.name)}. Entendi que voce quer uma atualizacao do caso.`,
      "Eu nao vou te responder no escuro: preciso que a equipe confirme o processo correto antes de te passar status.",
      "Ja deixei o pedido sinalizado internamente para alguem revisar e te retornar com seguranca.",
    ].join("\n\n");
  }

  return [
    `Oi, ${firstName(contact.name)}. Localizei o caso e separei um resumo seguro para voce.`,
    `Andamento: ${contract.progressSummary || contract.statusHeadline}`,
    contract.currentPhase ? `Fase atual: ${contract.currentPhase}` : null,
    contract.nextStep ? `Proximo passo: ${contract.nextStep}` : null,
    contract.pendingItems.length > 0
      ? `Pendencias registradas: ${contract.pendingItems.join("; ")}.`
      : "Nao encontrei pendencia critica registrada agora.",
    "Se algo mudou ou voce recebeu documento novo, me envie aqui que eu organizo para a equipe avaliar.",
  ].filter(Boolean).join("\n\n");
}

async function loadContact(params: Pick<PrepareWhatsAppMayusReplyParams, "supabase" | "tenantId" | "contactId">) {
  const { data, error } = await params.supabase
    .from("whatsapp_contacts")
    .select("id, name, phone_number, assigned_user_id, lead_tags")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.contactId)
    .maybeSingle();

  if (error || !data) throw new Error("Contato nao encontrado.");
  return data as WhatsAppContactRecord;
}

async function loadMessages(params: Pick<PrepareWhatsAppMayusReplyParams, "supabase" | "tenantId" | "contactId">) {
  const { data } = await params.supabase
    .from("whatsapp_messages")
    .select("direction, content, message_type, created_at")
    .eq("tenant_id", params.tenantId)
    .eq("contact_id", params.contactId)
    .order("created_at", { ascending: false })
    .limit(20);

  return ((data || []) as WhatsAppMessageRecord[]).reverse();
}

async function loadMayusSettings(supabase: RuntimeSupabase, tenantId: string): Promise<WhatsAppMayusSettings> {
  const { data } = await supabase
    .from("tenant_settings")
    .select("ai_features")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const aiFeatures = data?.ai_features && typeof data.ai_features === "object" ? data.ai_features : {};

  return {
    aiFeatures,
    governanceMode: normalizeGovernanceMode(aiFeatures.whatsapp_mayus_mode || aiFeatures.contract_flow_mode),
  };
}

async function insertSystemEvent(params: {
  supabase: RuntimeSupabase;
  tenantId: string;
  userId?: string | null;
  payload: Record<string, unknown>;
  status?: "ok" | "warning" | "error";
  eventName?: string;
}) {
  await params.supabase.from("system_event_logs").insert({
    tenant_id: params.tenantId,
    user_id: params.userId || null,
    source: "whatsapp",
    provider: "mayus",
    event_name: params.eventName || "whatsapp_mayus_reply_prepared",
    status: params.status || "ok",
    payload: params.payload,
    created_at: new Date().toISOString(),
  });
}

async function loadExistingPreparedDecision(params: {
  supabase: RuntimeSupabase;
  tenantId: string;
  contactId: string;
  latestInboundAt: string | null;
}) {
  if (!params.latestInboundAt) return null;

  try {
    const table = params.supabase.from("system_event_logs");
    if (typeof table?.select !== "function") return null;

    const query = table
      .select("id, payload, created_at")
      .eq("tenant_id", params.tenantId)
      .eq("event_name", "whatsapp_mayus_reply_prepared")
      .eq("payload->>contact_id", params.contactId)
      .eq("payload->>latest_inbound_at", params.latestInboundAt)
      .order("created_at", { ascending: false });
    const limitedQuery = typeof query.limit === "function" ? query.limit(1) : query;
    const finalQuery = typeof limitedQuery?.maybeSingle === "function" ? limitedQuery : query;
    const { data } = typeof finalQuery?.maybeSingle === "function"
      ? await finalQuery.maybeSingle()
      : { data: null };

    return data?.payload ? data as { id: string; payload: Record<string, unknown>; created_at: string } : null;
  } catch {
    return null;
  }
}

async function notifyTeam(params: {
  supabase: RuntimeSupabase;
  tenantId: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success";
}) {
  await params.supabase.from("notifications").insert({
    tenant_id: params.tenantId,
    user_id: null,
    title: params.title,
    message: params.message.slice(0, 180),
    type: params.type,
    link_url: "/dashboard/conversas/whatsapp",
    created_at: new Date().toISOString(),
  });
}

async function saveHandoffInternalNote(params: {
  supabase: RuntimeSupabase;
  tenantId: string;
  contactId: string;
  content: string;
}) {
  const table = params.supabase.from("whatsapp_messages");
  if (typeof table?.insert !== "function") return;

  await table.insert({
    tenant_id: params.tenantId,
    contact_id: params.contactId,
    direction: "outbound",
    message_type: "internal_note",
    content: params.content.slice(0, 1200),
    status: "internal_note",
    created_at: new Date().toISOString(),
  });
}

async function prepareSupportReply(params: PrepareWhatsAppMayusReplyParams & {
  contact: WhatsAppContactRecord;
  messages: WhatsAppMessageRecord[];
  settings: WhatsAppMayusSettings;
  agentRole: WhatsAppMayusAgentRole;
  latestInboundAt: string | null;
}) {
  const entities = buildSupportCaseStatusEntities({ contact: params.contact, messages: params.messages });
  let contract: SupportCaseStatusContract | null = null;
  let suggestedReply: string;
  let internalNote: string;
  let supportError: string | null = null;

  try {
    if (Object.keys(entities).length === 0) throw new Error("case_not_identified");
    const snapshot = await getLegalCaseContextSnapshot({ tenantId: params.tenantId, entities });
    contract = buildSupportCaseStatusContract(snapshot);
    suggestedReply = buildClientSupportStatusReply(contract, params.contact);
    internalNote = contract.responseMode === "handoff"
      ? "Suporte identificado, mas a base do caso nao esta segura para autoenvio."
      : `Suporte identificado com confianca ${contract.confidence}.`;
  } catch (error) {
    supportError = error instanceof Error ? error.message : "support_case_status_failed";
    suggestedReply = buildClientSupportStatusReply({
      responseMode: "handoff",
      confidence: "low",
      processTaskId: "",
      processLabel: entities.process_number || entities.client_name || "caso nao identificado",
      clientLabel: entities.client_name || params.contact.name,
      statusHeadline: "Caso nao identificado com seguranca.",
      progressSummary: null,
      currentPhase: null,
      nextStep: null,
      pendingItems: [],
      summary: null,
      grounding: { factualSources: [], inferenceNotes: [], missingSignals: ["identificacao do caso"] },
      handoffReason: "case_not_identified",
    }, params.contact);
    internalNote = "Suporte identificado, mas nao consegui confirmar o processo correto. Handoff humano recomendado.";
  }

  const mayAutoSend = Boolean(
    params.autoSendFirstResponse
    && params.trigger !== "manual"
    && params.settings.governanceMode !== "human_only"
    && !params.contact.assigned_user_id
    && params.contact.phone_number
    && suggestedReply
  );
  let autoDelivery: Awaited<ReturnType<typeof sendFrontdeskWhatsAppReply>> | null = null;
  let autoSendError: string | null = null;
  const supportHandoffReason = contract?.responseMode === "handoff"
    ? contract.handoffReason || supportError || "support_needs_review"
    : null;
  const baseDecision = buildDecisionMetadata({
    status: mayAutoSend
      ? "auto_send_allowed"
      : contract?.responseMode === "answer"
        ? "prepared"
        : "human_review_required",
    nextAction: mayAutoSend
      ? "auto_send_whatsapp"
      : contract?.responseMode === "answer"
        ? "prepare_reply"
        : "notify_human",
    stage: "support_status",
    confidence: (contract?.confidence || "low") as WhatsAppMayusDecisionConfidence,
    handoffReason: supportHandoffReason,
    latestInboundAt: params.latestInboundAt,
  });

  const payload = {
    contact_id: params.contact.id,
    trigger: params.trigger,
    intent: "support" as const,
    agent_role: params.agentRole,
    governance_mode: params.settings.governanceMode,
    mode: contract?.responseMode === "answer" || mayAutoSend ? "suggested_reply" : "human_review_required",
    suggested_reply: suggestedReply,
    internal_note: internalNote,
    ...baseDecision,
    may_auto_send: mayAutoSend,
    requires_human_review: !mayAutoSend && contract?.responseMode !== "answer",
    support_case_entities: entities,
    support_status_response_mode: contract?.responseMode || "handoff",
    support_status_confidence: contract?.confidence || "low",
    support_status_process_task_id: contract?.processTaskId || null,
    support_status_process_label: contract?.processLabel || entities.process_number || entities.client_name || null,
    support_status_current_phase: contract?.currentPhase || null,
    support_status_next_step: contract?.nextStep || null,
    support_status_pending_items: contract?.pendingItems || [],
    support_status_error: supportError,
    first_response_policy: {
      enabled: params.autoSendFirstResponse === true,
      can_auto_send: mayAutoSend,
    },
  };

  await insertSystemEvent({
    supabase: params.supabase,
    tenantId: params.tenantId,
    userId: params.actorUserId,
    status: contract?.responseMode === "answer" ? "ok" : "warning",
    payload,
  });

  if (contract?.responseMode !== "answer") {
    await saveHandoffInternalNote({
      supabase: params.supabase,
      tenantId: params.tenantId,
      contactId: params.contact.id,
      content: [
        "Handoff MAYUS - Suporte",
        `Motivo: ${supportHandoffReason || "base do caso nao confirmada"}`,
        `Sinais encontrados: ${Object.keys(entities).join(", ") || "nenhum"}`,
        internalNote,
      ].join("\n"),
    });
  }

  if (mayAutoSend && params.contact.phone_number) {
    try {
      autoDelivery = await sendFrontdeskWhatsAppReply({
        supabase: params.supabase as SupabaseClient,
        tenantId: params.tenantId,
        contactId: params.contact.id,
        phoneNumber: params.contact.phone_number,
        text: suggestedReply,
      });
      await insertSystemEvent({
        supabase: params.supabase,
        tenantId: params.tenantId,
        userId: params.actorUserId,
        eventName: "whatsapp_mayus_reply_auto_sent",
        payload: {
          ...payload,
          ...buildDecisionMetadata({
            status: autoDelivery.sent ? "auto_sent" : "auto_send_failed",
            nextAction: autoDelivery.sent ? "no_action" : "notify_human",
            stage: "support_status",
            confidence: (contract?.confidence || "low") as WhatsAppMayusDecisionConfidence,
            handoffReason: autoDelivery.sent ? null : "whatsapp_delivery_failed",
            latestInboundAt: params.latestInboundAt,
          }),
          auto_sent: autoDelivery.sent,
          provider: "provider" in autoDelivery ? autoDelivery.provider : null,
          block_count: "blockCount" in autoDelivery ? autoDelivery.blockCount : 0,
          typing_presence_used: "typingPresenceUsed" in autoDelivery ? autoDelivery.typingPresenceUsed : false,
        },
      });
    } catch (error) {
      autoSendError = error instanceof Error ? error.message : "auto_send_failed";
      await insertSystemEvent({
        supabase: params.supabase,
        tenantId: params.tenantId,
        userId: params.actorUserId,
        eventName: "whatsapp_mayus_reply_auto_send_failed",
        status: "error",
        payload: { ...payload, auto_send_error: autoSendError },
      });
    }
  }

  if (params.notify) {
    await notifyTeam({
      supabase: params.supabase,
      tenantId: params.tenantId,
      title: autoDelivery?.sent ? "MAYUS respondeu suporte" : "Suporte WhatsApp identificado",
      message: autoDelivery?.sent
        ? `${params.contact.name || "cliente WhatsApp"}: status respondido pelo MAYUS.`
        : `${params.contact.name || "cliente WhatsApp"}: ${internalNote}`,
      type: autoDelivery?.sent ? "success" : contract?.responseMode === "answer" ? "info" : "warning",
    });
  }

  return {
    contact: params.contact,
    intent: "support" as const,
    agentRole: params.agentRole,
    metadata: {
      ...payload,
      ...buildDecisionMetadata({
        status: autoDelivery
          ? autoDelivery.sent ? "auto_sent" : "auto_send_failed"
          : autoSendError ? "auto_send_failed" : baseDecision.decision_status,
        nextAction: autoDelivery?.sent ? "no_action" : autoSendError ? "notify_human" : baseDecision.next_action,
        stage: "support_status",
        confidence: (contract?.confidence || "low") as WhatsAppMayusDecisionConfidence,
        handoffReason: autoDelivery?.sent ? null : supportHandoffReason || (autoSendError ? "whatsapp_delivery_failed" : null),
        latestInboundAt: params.latestInboundAt,
      }),
      auto_sent: autoDelivery?.sent === true,
      auto_send_error: autoSendError,
    },
  };
}

async function prepareHumanHandoffReply(params: PrepareWhatsAppMayusReplyParams & {
  contact: WhatsAppContactRecord;
  settings: WhatsAppMayusSettings;
  agentRole: WhatsAppMayusAgentRole;
  latestInboundAt: string | null;
}) {
  const suggestedReply = buildHumanHandoffReply(params.contact);
  const decision = buildDecisionMetadata({
    status: "human_review_required",
    nextAction: "notify_human",
    stage: "human_handoff",
    confidence: "high",
    handoffReason: "human_requested",
    latestInboundAt: params.latestInboundAt,
  });
  const payload = {
    contact_id: params.contact.id,
    trigger: params.trigger,
    intent: "human_handoff" as const,
    agent_role: params.agentRole,
    governance_mode: params.settings.governanceMode,
    mode: "human_review_required",
    suggested_reply: suggestedReply,
    internal_note: "Cliente pediu atendimento humano. MAYUS preparou handoff com contexto.",
    ...decision,
    may_auto_send: false,
    requires_human_review: true,
    handoff_recommended: true,
  };

  await insertSystemEvent({
    supabase: params.supabase,
    tenantId: params.tenantId,
    userId: params.actorUserId,
    status: "warning",
    payload,
  });

  await saveHandoffInternalNote({
    supabase: params.supabase,
    tenantId: params.tenantId,
    contactId: params.contact.id,
    content: [
      "Handoff MAYUS - Cliente pediu humano",
      "Motivo: human_requested",
      "Acao: equipe deve assumir sem pedir para o lead repetir o contexto.",
      `Resposta preparada: ${suggestedReply}`,
    ].join("\n"),
  });

  if (params.notify) {
    await notifyTeam({
      supabase: params.supabase,
      tenantId: params.tenantId,
      title: "Cliente pediu humano",
      message: `${params.contact.name || "Contato WhatsApp"}: handoff recomendado pelo MAYUS.`,
      type: "warning",
    });
  }

  return {
    contact: params.contact,
    intent: "human_handoff" as const,
    agentRole: params.agentRole,
    metadata: { ...payload, auto_sent: false, auto_send_error: null },
  };
}

export async function prepareWhatsAppMayusReplyForContact(params: PrepareWhatsAppMayusReplyParams) {
  const [contact, messages, settings] = await Promise.all([
    loadContact(params),
    loadMessages(params),
    loadMayusSettings(params.supabase, params.tenantId),
  ]);
  const intent = inferWhatsAppMayusIntent({ contact, messages });
  const agentRole = inferWhatsAppMayusAgentRole({ intent, messages });
  const latestInboundAt = getLatestInboundAt(messages);
  const decisionStage = inferDecisionStage(intent, agentRole);
  const autoSendFirstResponse = Boolean(params.autoSendFirstResponse && settings.governanceMode !== "human_only");

  if (params.trigger !== "manual") {
    const existingDecision = await loadExistingPreparedDecision({
      supabase: params.supabase,
      tenantId: params.tenantId,
      contactId: params.contactId,
      latestInboundAt,
    });

    if (existingDecision) {
      const payload = {
        contact_id: contact.id,
        trigger: params.trigger,
        intent,
        agent_role: agentRole,
        governance_mode: settings.governanceMode,
        duplicate_of_event_id: existingDecision.id,
        duplicate_of_created_at: existingDecision.created_at,
        ...buildDecisionMetadata({
          status: "duplicate_suppressed",
          nextAction: "skip_duplicate",
          stage: decisionStage,
          confidence: "high",
          latestInboundAt,
        }),
        auto_sent: false,
        auto_send_error: null,
      };

      await insertSystemEvent({
        supabase: params.supabase,
        tenantId: params.tenantId,
        userId: params.actorUserId,
        eventName: "whatsapp_mayus_reply_duplicate_suppressed",
        payload,
      });

      return { contact, intent, agentRole, metadata: payload };
    }
  }

  if (intent === "support") {
    return prepareSupportReply({ ...params, contact, messages, settings, agentRole, autoSendFirstResponse, latestInboundAt });
  }

  if (intent === "human_handoff") {
    return prepareHumanHandoffReply({ ...params, contact, settings, agentRole, latestInboundAt });
  }

  const prepared = await prepareWhatsAppSalesReplyForContact({
    supabase: params.supabase as SupabaseClient,
    tenantId: params.tenantId,
    contactId: params.contactId,
    actorUserId: params.actorUserId,
    trigger: params.trigger,
    notify: params.notify,
    autoSendFirstResponse,
  });
  const payload = {
    ...prepared.metadata,
    contact_id: prepared.contact.id,
    trigger: params.trigger,
    intent,
    agent_role: agentRole,
    governance_mode: settings.governanceMode,
    ...buildDecisionMetadata({
      status: prepared.metadata.auto_sent === true
        ? "auto_sent"
        : prepared.metadata.auto_send_error
          ? "auto_send_failed"
          : prepared.metadata.requires_human_review
            ? "human_review_required"
            : "prepared",
      nextAction: prepared.metadata.auto_sent === true
        ? "no_action"
        : prepared.metadata.requires_human_review || prepared.metadata.handoff_recommended
          ? "notify_human"
          : "prepare_reply",
      stage: decisionStage,
      confidence: confidenceFromCompleteness(prepared.metadata.discovery_completeness),
      handoffReason: prepared.metadata.handoff_recommended ? "human_requested" : null,
      latestInboundAt,
    }),
  };

  await insertSystemEvent({
    supabase: params.supabase,
    tenantId: params.tenantId,
    userId: params.actorUserId,
    payload,
  });

  return {
    contact: prepared.contact,
    intent,
    agentRole,
    metadata: payload,
  };
}
