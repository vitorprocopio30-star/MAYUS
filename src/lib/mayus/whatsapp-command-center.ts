import { buildDailyPlaybook, type DailyPlaybook, type DailyPlaybookInput, type DailyPlaybookPreferences } from "@/lib/mayus/daily-playbook";
import { OFFICE_PLAYBOOK_SETUP_STEPS, normalizeOfficePlaybookProfile, type OfficePlaybookProfile } from "@/lib/growth/office-playbook-profile";

export type WhatsAppCommandIntent = "daily_playbook" | "crm_next_steps" | "agenda_today" | "office_playbook_setup" | "unknown";

export type WhatsAppCommandInput = {
  tenantId: string;
  senderPhone: string;
  text?: string | null;
  aiFeatures?: Record<string, any> | null;
  crmTasks?: Parameters<typeof buildDailyPlaybook>[0]["crmTasks"];
  userTasks?: Parameters<typeof buildDailyPlaybook>[0]["userTasks"];
  whatsappSignals?: DailyPlaybookInput["whatsappSignals"];
  processSignals?: DailyPlaybookInput["processSignals"];
  financialSignals?: DailyPlaybookInput["financialSignals"];
  salesSignals?: DailyPlaybookInput["salesSignals"];
  systemSignals?: DailyPlaybookInput["systemSignals"];
  officePlaybookStatus?: string | null;
  now?: Date;
};

export type WhatsAppCommandResult =
  | {
      handled: false;
      reason: "not_authorized" | "not_command" | "unknown_intent";
      intent: WhatsAppCommandIntent;
    }
  | {
      handled: true;
      intent: Exclude<WhatsAppCommandIntent, "unknown">;
      replyText: string;
      playbook?: DailyPlaybook;
      metadata: Record<string, unknown>;
      officePlaybookSetup?: OfficePlaybookSetupUpdate;
    };

export type OfficePlaybookSetupUpdate = {
  nextProfile: OfficePlaybookProfile;
  action: "started" | "answered" | "activated";
  currentStep: string | null;
  nextQuestion: string | null;
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

export function normalizeWhatsAppPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.startsWith("55")) return digits.slice(0, 13);
  return digits;
}

function normalize(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function getDailyPlaybookConfig(aiFeatures?: Record<string, any> | null) {
  const raw = aiFeatures?.daily_playbook && typeof aiFeatures.daily_playbook === "object"
    ? aiFeatures.daily_playbook
    : {};

  return {
    preferences: raw as Partial<DailyPlaybookPreferences>,
    authorizedPhones: Array.isArray(raw.authorizedPhones)
      ? raw.authorizedPhones
      : Array.isArray(raw.authorized_phones)
        ? raw.authorized_phones
        : [],
  };
}

export function isAuthorizedWhatsAppCommandSender(params: {
  senderPhone: string;
  aiFeatures?: Record<string, any> | null;
}) {
  const sender = normalizeWhatsAppPhone(params.senderPhone);
  const { authorizedPhones } = getDailyPlaybookConfig(params.aiFeatures);
  const allowed = authorizedPhones.map(normalizeWhatsAppPhone).filter(Boolean);

  return allowed.length > 0 && allowed.includes(sender);
}

export function inferWhatsAppCommandIntent(text?: string | null): WhatsAppCommandIntent {
  const normalized = normalize(text);
  if (!/(mayus|maius|marlos|relatorio|relatorio|analise|playbook|agenda|crm|lead|prazo|status|sistema|configurar|vendas|escritorio|confirmar)/.test(normalized)) return "unknown";
  if (/configur(ar|e)|setup|auto.?configur|vendas do escritorio|playbook comercial|configurar vendas/.test(normalized)) return "office_playbook_setup";
  if (/confirmar playbook|ativar playbook|aprovar playbook/.test(normalized)) return "office_playbook_setup";
  if (/playbook|relatorio|resumo|analise do escritorio|analise geral|diagnostico do escritorio|status do escritorio|status do sistema/.test(normalized)) return "daily_playbook";
  if (/lead|crm|proximo passo|follow/.test(normalized)) return "crm_next_steps";
  if (/agenda|hoje|tarefas|prazo/.test(normalized)) return "agenda_today";
  return "unknown";
}

function splitListAnswer(text: string) {
  return text
    .split(/\n|;|,|\|/)
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 12);
}

function currentSetupStep(profile: OfficePlaybookProfile | null) {
  const sessionStep = cleanText(profile?.setup_session?.current_step || null);
  if (sessionStep && OFFICE_PLAYBOOK_SETUP_STEPS.some((step) => step.id === sessionStep)) return sessionStep;
  return OFFICE_PLAYBOOK_SETUP_STEPS[0].id;
}

function stepQuestion(stepId: string | null) {
  return OFFICE_PLAYBOOK_SETUP_STEPS.find((step) => step.id === stepId)?.question || null;
}

function nextStepId(stepId: string | null) {
  const index = OFFICE_PLAYBOOK_SETUP_STEPS.findIndex((step) => step.id === stepId);
  if (index < 0) return OFFICE_PLAYBOOK_SETUP_STEPS[0].id;
  return OFFICE_PLAYBOOK_SETUP_STEPS[index + 1]?.id || null;
}

function applySetupAnswer(profile: OfficePlaybookProfile, stepId: string, answer: string): OfficePlaybookProfile {
  const text = cleanText(answer) || "";
  const list = splitListAnswer(text);
  const next: OfficePlaybookProfile = { ...profile };

  if (stepId === "main_legal_areas") next.main_legal_areas = list.length ? list : [text];
  if (stepId === "thesis_by_area") {
    const areas = next.main_legal_areas?.length ? next.main_legal_areas : ["area principal"];
    next.thesis_by_area = [{ area: areas[0], thesis: text }];
  }
  if (stepId === "ideal_client") next.ideal_client = text;
  if (stepId === "common_pains") next.common_pains = list.length ? list : [text];
  if (stepId === "offer_positioning") next.offer_positioning = text;
  if (stepId === "qualification_questions") next.qualification_questions = list.length ? list : [text];
  if (stepId === "required_documents") next.required_documents = list.length ? list : [text];
  if (stepId === "forbidden_claims") next.forbidden_claims = list.length ? list : [text];
  if (stepId === "handoff_rules") next.handoff_rules = list.length ? list : [text];
  if (stepId === "next_best_actions") next.next_best_actions = list.length ? list : [text];

  return next;
}

function buildOfficePlaybookSetupResponse(input: WhatsAppCommandInput, text: string): Extract<WhatsAppCommandResult, { handled: true }> {
  const existing = normalizeOfficePlaybookProfile(input.aiFeatures?.office_playbook_profile) || {
    status: "needs_owner_input",
    owner_questions: OFFICE_PLAYBOOK_SETUP_STEPS.map((step) => step.question),
  } as OfficePlaybookProfile;
  const normalized = normalize(text);
  const now = (input.now || new Date()).toISOString();

  if (/confirmar playbook|ativar playbook|aprovar playbook/.test(normalized)) {
    const nextProfile: OfficePlaybookProfile = {
      ...existing,
      status: "active",
      setup_session: {
        active: false,
        current_step: null,
        completed_steps: existing.setup_session?.completed_steps || [],
        started_at: existing.setup_session?.started_at || now,
        updated_at: now,
      },
      updated_at: now,
    };
    return {
      handled: true,
      intent: "office_playbook_setup",
      replyText: "Playbook comercial ativado. A partir de agora o MAYUS usa essa tese, oferta, perguntas e regras para conduzir o WhatsApp do escritorio com mais contexto.",
      metadata: { intent: "office_playbook_setup", action: "activated", tenant_id: input.tenantId, sender_phone_authorized: true },
      officePlaybookSetup: { nextProfile, action: "activated", currentStep: null, nextQuestion: null },
    };
  }

  const sessionActive = existing.setup_session?.active === true;
  const isStart = /configur|setup|auto.?configur|vendas do escritorio|playbook comercial/.test(normalized) && !sessionActive;
  const stepId = isStart ? OFFICE_PLAYBOOK_SETUP_STEPS[0].id : currentSetupStep(existing);
  const completed = new Set(existing.setup_session?.completed_steps || []);
  let nextProfile: OfficePlaybookProfile = { ...existing };
  let action: "started" | "answered" = "started";
  let nextQuestion = stepQuestion(stepId);

  if (!isStart && sessionActive) {
    nextProfile = applySetupAnswer(existing, stepId, text);
    completed.add(stepId);
    const nextStep = nextStepId(stepId);
    action = "answered";
    nextQuestion = stepQuestion(nextStep);
    nextProfile.setup_session = {
      active: Boolean(nextStep),
      current_step: nextStep,
      completed_steps: Array.from(completed),
      started_at: existing.setup_session?.started_at || now,
      updated_at: now,
    };
    nextProfile.status = nextStep ? "needs_owner_input" : "draft";
    nextProfile.updated_at = now;

    return {
      handled: true,
      intent: "office_playbook_setup",
      replyText: nextStep
        ? `Perfeito, salvei isso no playbook do escritorio. Proxima pergunta: ${nextQuestion}`
        : "Perfeito, salvei as respostas e deixei o playbook como rascunho. Se estiver correto, responda: confirmar playbook.",
      metadata: { intent: "office_playbook_setup", action, current_step: stepId, next_step: nextStep, tenant_id: input.tenantId, sender_phone_authorized: true },
      officePlaybookSetup: { nextProfile, action, currentStep: nextStep, nextQuestion },
    };
  }

  nextProfile = {
    ...existing,
    status: "needs_owner_input",
    owner_questions: OFFICE_PLAYBOOK_SETUP_STEPS.map((step) => step.question),
    setup_session: {
      active: true,
      current_step: stepId,
      completed_steps: existing.setup_session?.completed_steps || [],
      started_at: existing.setup_session?.started_at || now,
      updated_at: now,
    },
    updated_at: now,
  };

  return {
    handled: true,
    intent: "office_playbook_setup",
    replyText: `Vamos configurar o playbook comercial do escritorio. Vou perguntar uma coisa por vez. Primeira pergunta: ${nextQuestion}`,
    metadata: { intent: "office_playbook_setup", action, current_step: stepId, tenant_id: input.tenantId, sender_phone_authorized: true },
    officePlaybookSetup: { nextProfile, action, currentStep: stepId, nextQuestion },
  };
}

function buildCommandReply(params: {
  intent: Exclude<WhatsAppCommandIntent, "unknown">;
  playbook: DailyPlaybook;
}) {
  if (params.intent === "crm_next_steps") {
    const leads = params.playbook.crm.leadsNeedingNextStep.slice(0, 5);
    const list = leads.length > 0
      ? leads.map((lead, index) => `${index + 1}. ${lead.title}: ${lead.organizedObjective}`).join("\n")
      : "Nenhum lead prioritario sem proximo passo agora.";

    return [
      "MAYUS - CRM",
      `${params.playbook.metrics.crmLeadsNeedingNextStep} lead(s) precisam de organizacao.`,
      list,
      "",
      "Nenhuma mensagem externa foi enviada automaticamente.",
    ].join("\n").trim();
  }

  if (params.intent === "agenda_today") {
    const actions = params.playbook.priorityActions
      .filter((action) => action.area === "agenda" || action.area === "legal")
      .slice(0, 5);
    const list = actions.length > 0
      ? actions.map((action, index) => `${index + 1}. ${action.title}: ${action.detail}`).join("\n")
      : "Sem tarefa critica na agenda de hoje.";

    return [
      "MAYUS - Agenda",
      params.playbook.executiveSummary,
      list,
      "",
      "Nenhuma acao externa foi executada automaticamente.",
    ].join("\n").trim();
  }

  return params.playbook.whatsappSummary;
}

export function buildWhatsAppCommandResponse(input: WhatsAppCommandInput): WhatsAppCommandResult {
  const text = cleanText(input.text);
  const activeOfficeSetup = normalizeOfficePlaybookProfile(input.aiFeatures?.office_playbook_profile)?.setup_session?.active === true;
  const intent = activeOfficeSetup ? "office_playbook_setup" : inferWhatsAppCommandIntent(text);

  if (intent === "unknown") {
    return { handled: false, reason: "not_command", intent };
  }

  if (!isAuthorizedWhatsAppCommandSender({ senderPhone: input.senderPhone, aiFeatures: input.aiFeatures })) {
    return { handled: false, reason: "not_authorized", intent };
  }

  if (intent === "office_playbook_setup") {
    return buildOfficePlaybookSetupResponse(input, text || "");
  }

  const { preferences } = getDailyPlaybookConfig(input.aiFeatures);
  const playbook = buildDailyPlaybook({
    firmName: typeof input.aiFeatures?.firm_name === "string" ? input.aiFeatures.firm_name : null,
    preferences,
    crmTasks: input.crmTasks || [],
    userTasks: input.userTasks || [],
    whatsappSignals: input.whatsappSignals || [],
    processSignals: input.processSignals || [],
    financialSignals: input.financialSignals || [],
    salesSignals: input.salesSignals || [],
    systemSignals: input.systemSignals || [],
    officePlaybookStatus: input.officePlaybookStatus,
    now: input.now,
  });

  return {
    handled: true,
    intent,
    playbook,
    replyText: buildCommandReply({ intent, playbook }),
    metadata: {
      intent,
      sender_phone_authorized: true,
      tenant_id: input.tenantId,
      playbook_summary: playbook.executiveSummary,
      metrics: playbook.metrics,
      external_side_effects_blocked: true,
    },
  };
}
