import { resolvePublicAppUrl } from "@/lib/url/resolve-public-app-url";

export const GOOGLE_CALENDAR_PROVIDER_PREFIX = "google_calendar_user";
export const GOOGLE_CALENDAR_GLOBAL_PROVIDER = "google_calendar_global";
export const GOOGLE_CALENDAR_STATE_COOKIE = "google_calendar_oauth_state";
export const GOOGLE_CALENDAR_GLOBAL_STATE_COOKIE = "google_calendar_global_oauth_state";
export const GOOGLE_CALENDAR_CALLBACK_PATH = "/api/integrations/google-calendar/callback";
export const GOOGLE_CALENDAR_GLOBAL_CALLBACK_PATH = "/api/integrations/google-calendar-global/callback";

const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/userinfo.email";
const GOOGLE_OAUTH_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_OAUTH_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const GOOGLE_CALENDAR_TIME_ZONE = "America/Sao_Paulo";

type GoogleCalendarConfig = {
  clientId: string;
  clientSecret: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export type GoogleCalendarIntegrationMetadata = {
  access_token?: string | null;
  connected_email?: string | null;
  expires_at?: string | null;
  scope?: string | null;
  token_type?: string | null;
};

export type GoogleCalendarSanitizedState = {
  available: boolean;
  connected: boolean;
  status: string;
  connectedEmail: string | null;
  events: GoogleCalendarAgendaEvent[];
};

export type GoogleCalendarAgendaEvent = {
  id: string;
  title: string;
  description: string | null;
  scheduled_for: string;
  end_at: string | null;
  html_link: string | null;
  source_table: "google_calendar";
  source_id: string;
  status: "Pendente";
  urgency: "ROTINA";
  category: "Google Agenda";
  type: "Google Agenda";
  color: string;
  time_text: string;
  person: string;
  visibility: "private";
  task_kind: "task";
  is_external_calendar: true;
  is_critical: false;
  reward_coins: 0;
  tags: string[];
};

type GoogleCalendarIntegrationRecord = {
  api_key?: string | null;
  metadata?: Record<string, unknown> | null;
  status?: string | null;
};

type GoogleCalendarEventRecord = {
  id: string;
  summary?: string | null;
  description?: string | null;
  htmlLink?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
};

function getGoogleCalendarConfig(): GoogleCalendarConfig {
  const clientId = String(process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "").trim();
  const hasValidClientIdShape = /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId);

  if (!clientId || !clientSecret || !hasValidClientIdShape) {
    throw new Error("GoogleCalendarNotConfigured");
  }

  return { clientId, clientSecret };
}

function getGoogleTokenErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const error = (data as Record<string, unknown>).error;
  const description = (data as Record<string, unknown>).error_description;

  if (typeof description === "string" && description.trim()) return description.trim();
  if (typeof error === "string" && error.trim()) return error.trim();

  const nestedError = (data as Record<string, unknown>).error;
  if (nestedError && typeof nestedError === "object") {
    const nestedMessage = (nestedError as Record<string, unknown>).message;
    if (typeof nestedMessage === "string" && nestedMessage.trim()) return nestedMessage.trim();
  }

  return fallback;
}

function computeGoogleCalendarExpiresAt(expiresIn?: number): string | null {
  if (!expiresIn || !Number.isFinite(expiresIn)) return null;
  return new Date(Date.now() + expiresIn * 1000).toISOString();
}

async function exchangeGoogleToken(params: Record<string, string>): Promise<GoogleTokenResponse> {
  const { clientId, clientSecret } = getGoogleCalendarConfig();
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...params }),
  });

  const data = (await response.json().catch(() => null)) as GoogleTokenResponse | null;

  if (!response.ok || !data?.access_token) {
    throw new Error(getGoogleTokenErrorMessage(data, "Falha ao autenticar com o Google Agenda."));
  }

  return data;
}

export function getGoogleCalendarProviderForUser(userId: string): string {
  return `${GOOGLE_CALENDAR_PROVIDER_PREFIX}:${userId}`;
}

export function getGoogleCalendarGlobalProvider(): string {
  return GOOGLE_CALENDAR_GLOBAL_PROVIDER;
}

export function isGoogleCalendarConfigured(): boolean {
  try {
    getGoogleCalendarConfig();
    return true;
  } catch {
    return false;
  }
}

export function getGoogleCalendarRedirectUri(request: Request, callbackPath = GOOGLE_CALENDAR_CALLBACK_PATH): string {
  return `${resolvePublicAppUrl(request)}${callbackPath}`;
}

export function buildGoogleCalendarAuthUrl(request: Request, state: string, callbackPath = GOOGLE_CALENDAR_CALLBACK_PATH): string {
  const url = new URL(GOOGLE_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", getGoogleCalendarConfig().clientId);
  url.searchParams.set("redirect_uri", getGoogleCalendarRedirectUri(request, callbackPath));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export function getGoogleCalendarIntegrationMetadata(record: GoogleCalendarIntegrationRecord | null | undefined): GoogleCalendarIntegrationMetadata {
  return ((record?.metadata as GoogleCalendarIntegrationMetadata | null) || {}) as GoogleCalendarIntegrationMetadata;
}

export function mergeGoogleCalendarMetadata(
  current: Record<string, unknown> | null | undefined,
  next: GoogleCalendarIntegrationMetadata
): GoogleCalendarIntegrationMetadata {
  return {
    ...((current || {}) as GoogleCalendarIntegrationMetadata),
    ...next,
  };
}

export function needsGoogleCalendarTokenRefresh(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs <= Date.now() + 60_000;
}

export async function fetchGoogleCalendarConnectedEmail(accessToken: string): Promise<string | null> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await response.json().catch(() => null)) as { email?: string } | null;

  if (!response.ok) {
    throw new Error(getGoogleTokenErrorMessage(data, "Falha ao validar a conta do Google Agenda."));
  }

  return data?.email || null;
}

export async function exchangeGoogleCalendarCode(request: Request, code: string, callbackPath = GOOGLE_CALENDAR_CALLBACK_PATH) {
  const tokenData = await exchangeGoogleToken({
    code,
    grant_type: "authorization_code",
    redirect_uri: getGoogleCalendarRedirectUri(request, callbackPath),
  });

  const connectedEmail = await fetchGoogleCalendarConnectedEmail(tokenData.access_token!);

  return {
    accessToken: tokenData.access_token!,
    connectedEmail,
    expiresAt: computeGoogleCalendarExpiresAt(tokenData.expires_in),
    refreshToken: tokenData.refresh_token || null,
    scope: tokenData.scope || null,
    tokenType: tokenData.token_type || null,
  };
}

export async function refreshGoogleCalendarAccessToken(request: Request, refreshToken: string, callbackPath = GOOGLE_CALENDAR_CALLBACK_PATH) {
  const tokenData = await exchangeGoogleToken({
    grant_type: "refresh_token",
    redirect_uri: getGoogleCalendarRedirectUri(request, callbackPath),
    refresh_token: refreshToken,
  });

  return {
    accessToken: tokenData.access_token!,
    expiresAt: computeGoogleCalendarExpiresAt(tokenData.expires_in),
    scope: tokenData.scope || null,
    tokenType: tokenData.token_type || null,
  };
}

export async function revokeGoogleCalendarRefreshToken(refreshToken: string) {
  if (!refreshToken) return;
  await fetch(GOOGLE_OAUTH_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: refreshToken }),
  }).catch(() => {
    // Best effort revoke only.
  });
}

export function sanitizeGoogleCalendarState(
  record: GoogleCalendarIntegrationRecord | null | undefined,
  events: GoogleCalendarAgendaEvent[] = []
): GoogleCalendarSanitizedState {
  const metadata = getGoogleCalendarIntegrationMetadata(record);
  const connected = record?.status === "connected" && Boolean(record?.api_key);

  return {
    available: true,
    connected,
    status: record?.status || "disconnected",
    connectedEmail: connected ? metadata.connected_email || null : null,
    events: connected ? events : [],
  };
}

function normalizeGoogleDateTime(value?: string | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T09:00:00.000`;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function mapGoogleCalendarEvent(event: GoogleCalendarEventRecord): GoogleCalendarAgendaEvent | null {
  const startsAt = normalizeGoogleDateTime(event.start?.dateTime || event.start?.date || null);
  if (!startsAt) return null;

  const endsAt = normalizeGoogleDateTime(event.end?.dateTime || event.end?.date || null);
  const title = String(event.summary || "Evento do Google Agenda").trim() || "Evento do Google Agenda";
  const startsAtDate = new Date(startsAt);
  const timeText = Number.isNaN(startsAtDate.getTime())
    ? "Google"
    : startsAtDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return {
    id: `google-calendar-${event.id}`,
    title,
    description: event.description || null,
    scheduled_for: startsAt,
    end_at: endsAt,
    html_link: event.htmlLink || null,
    source_table: "google_calendar",
    source_id: event.id,
    status: "Pendente",
    urgency: "ROTINA",
    category: "Google Agenda",
    type: "Google Agenda",
    color: "#4285F4",
    time_text: timeText,
    person: "Google Agenda",
    visibility: "private",
    task_kind: "task",
    is_external_calendar: true,
    is_critical: false,
    reward_coins: 0,
    tags: ["Google"],
  };
}

export function getGoogleCalendarDayWindow(dateKey: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? dateKey : new Date().toISOString().slice(0, 10);
  return {
    timeMin: `${normalized}T00:00:00-03:00`,
    timeMax: `${normalized}T23:59:59-03:00`,
  };
}

export async function fetchGoogleCalendarEvents(accessToken: string, dateKey: string): Promise<GoogleCalendarAgendaEvent[]> {
  const { timeMin, timeMax } = getGoogleCalendarDayWindow(dateKey);
  const url = new URL(`${GOOGLE_CALENDAR_API_BASE_URL}/calendars/primary/events`);
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("timeZone", GOOGLE_CALENDAR_TIME_ZONE);

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = (await response.json().catch(() => null)) as { items?: GoogleCalendarEventRecord[] } | null;

  if (!response.ok) {
    throw new Error(getGoogleTokenErrorMessage(data, "Falha ao buscar eventos do Google Agenda."));
  }

  return (data?.items || [])
    .map(mapGoogleCalendarEvent)
    .filter((event): event is GoogleCalendarAgendaEvent => Boolean(event));
}
