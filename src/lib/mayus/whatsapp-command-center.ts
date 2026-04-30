import { buildDailyPlaybook, type DailyPlaybook, type DailyPlaybookPreferences } from "@/lib/mayus/daily-playbook";

export type WhatsAppCommandIntent = "daily_playbook" | "crm_next_steps" | "agenda_today" | "unknown";

export type WhatsAppCommandInput = {
  tenantId: string;
  senderPhone: string;
  text?: string | null;
  aiFeatures?: Record<string, any> | null;
  crmTasks?: Parameters<typeof buildDailyPlaybook>[0]["crmTasks"];
  userTasks?: Parameters<typeof buildDailyPlaybook>[0]["userTasks"];
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
      playbook: DailyPlaybook;
      metadata: Record<string, unknown>;
    };

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

export function normalizeWhatsAppPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") ? digits : `55${digits}`;
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
  if (!/(mayus|relatorio|relatorio|playbook|agenda|crm|lead|prazo|status|sistema)/.test(normalized)) return "unknown";
  if (/playbook|relatorio|resumo|status do escritorio|status do sistema/.test(normalized)) return "daily_playbook";
  if (/lead|crm|proximo passo|follow/.test(normalized)) return "crm_next_steps";
  if (/agenda|hoje|tarefas|prazo/.test(normalized)) return "agenda_today";
  return "unknown";
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
  const intent = inferWhatsAppCommandIntent(text);

  if (intent === "unknown") {
    return { handled: false, reason: "not_command", intent };
  }

  if (!isAuthorizedWhatsAppCommandSender({ senderPhone: input.senderPhone, aiFeatures: input.aiFeatures })) {
    return { handled: false, reason: "not_authorized", intent };
  }

  const { preferences } = getDailyPlaybookConfig(input.aiFeatures);
  const playbook = buildDailyPlaybook({
    firmName: typeof input.aiFeatures?.firm_name === "string" ? input.aiFeatures.firm_name : null,
    preferences,
    crmTasks: input.crmTasks || [],
    userTasks: input.userTasks || [],
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
