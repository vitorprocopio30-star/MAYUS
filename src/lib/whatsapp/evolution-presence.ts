import type { SupabaseClient } from "@supabase/supabase-js";
import { listTenantIntegrationsResolved } from "@/lib/integrations/server";

type EvolutionPresence = "available" | "composing" | "paused";

type EvolutionProvider = {
  baseUrl: string;
  instanceName: string;
  apiKey: string;
};

function cleanPhone(value: string | null | undefined) {
  return String(value || "").split("@")[0].replace(/\D/g, "");
}

async function resolveEvolutionProvider(tenantId: string): Promise<EvolutionProvider | null> {
  const integrations = await listTenantIntegrationsResolved(tenantId, ["evolution"]);
  const provider = integrations.find((item) => item.provider === "evolution");
  const [baseUrlRaw, instanceName] = String(provider?.instance_name || "").split("|");
  const baseUrl = String(baseUrlRaw || "").replace(/\/$/, "");
  const apiKey = String(provider?.api_key || "").trim();

  if (!baseUrl || !instanceName || !apiKey) return null;
  return { baseUrl, instanceName, apiKey };
}

async function readContactPhone(params: {
  supabase: SupabaseClient;
  contactId: string;
}) {
  const query = params.supabase.from("whatsapp_contacts");
  if (typeof (query as any).select !== "function") return null;

  const { data } = await query
    .select("phone_number")
    .eq("id", params.contactId)
    .maybeSingle<{ phone_number: string | null }>();

  return data?.phone_number || null;
}

async function safeEvolutionPost(params: {
  tenantId: string;
  path: string;
  body: Record<string, unknown>;
  fetcher?: typeof fetch;
}) {
  try {
    const provider = await resolveEvolutionProvider(params.tenantId);
    if (!provider) return { ok: false, skipped: true, reason: "missing_evolution_provider" };

    const response = await (params.fetcher || fetch)(`${provider.baseUrl}${params.path}/${encodeURIComponent(provider.instanceName)}`, {
      method: "POST",
      headers: {
        apikey: provider.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params.body),
    });

    return { ok: response.ok, status: response.status };
  } catch (error) {
    console.warn("[Evolution Presence] Falha nao bloqueante:", error);
    return { ok: false, error: error instanceof Error ? error.message : String(error || "erro") };
  }
}

export async function markEvolutionMessageAsRead(params: {
  tenantId: string;
  remoteJid: string | null | undefined;
  messageId: string | null | undefined;
  fetcher?: typeof fetch;
}) {
  if (!params.remoteJid || !params.messageId) return { ok: false, skipped: true, reason: "missing_message" };

  return safeEvolutionPost({
    tenantId: params.tenantId,
    path: "/chat/markMessageAsRead",
    body: {
      readMessages: [{ remoteJid: params.remoteJid, fromMe: false, id: params.messageId }],
    },
    fetcher: params.fetcher,
  });
}

export async function sendEvolutionPresence(params: {
  tenantId: string;
  remoteJid: string | null | undefined;
  presence: EvolutionPresence;
  delayMs?: number;
  supabase?: SupabaseClient;
  fetcher?: typeof fetch;
}) {
  const number = cleanPhone(params.remoteJid);
  if (!number) return { ok: false, skipped: true, reason: "missing_number" };
  if (params.presence !== "composing") return { ok: true, skipped: true, reason: "unsupported_presence_noop" };

  const delay = Math.min(Math.max(Math.floor(params.delayMs || 3000), 500), 10000);
  const result = await safeEvolutionPost({
    tenantId: params.tenantId,
    path: "/chat/sendPresence",
    body: {
      number,
      presence: "composing",
      delay,
    },
    fetcher: params.fetcher,
  });
  if (params.supabase) {
    await params.supabase.from("system_event_logs").insert({
      tenant_id: params.tenantId,
      source: "whatsapp",
      provider: "evolution",
      event_name: "evolution_presence_sent",
      status: result.ok ? "ok" : "error",
      payload: { presence: "composing", delay_ms: delay, result },
      created_at: new Date().toISOString(),
    });
  }
  return result;
}

export async function sendEvolutionPresenceForContact(params: {
  supabase: SupabaseClient;
  tenantId: string;
  contactId: string;
  presence: EvolutionPresence;
  delayMs?: number;
  fetcher?: typeof fetch;
}) {
  try {
    const phoneNumber = await readContactPhone({ supabase: params.supabase, contactId: params.contactId });
    return sendEvolutionPresence({
      tenantId: params.tenantId,
      remoteJid: phoneNumber,
      presence: params.presence,
      delayMs: params.delayMs,
      supabase: params.supabase,
      fetcher: params.fetcher,
    });
  } catch (error) {
    console.warn("[Evolution Presence] Falha ao resolver contato:", error);
    return { ok: false, error: error instanceof Error ? error.message : String(error || "erro") };
  }
}
