import type { EditorialCalendarItem, MarketingProfile, ReferenceInput } from "@/lib/marketing/editorial-calendar";

const REFERENCES_KEY = "mayus.marketing.references.mvp.v1";
const CALENDAR_KEY = "mayus.marketing.editorial-calendar.mvp.v1";
const PROFILE_KEY = "mayus.marketing.profile.mvp.v1";

export type MarketingState = {
  profile: MarketingProfile;
  references: ReferenceInput[];
  calendar: EditorialCalendarItem[];
  updatedAt?: string | null;
  source?: "server" | "empty" | "local";
};

function readJsonArray<T>(key: string, fallback: T[]): T[] {
  if (typeof window === "undefined") return fallback;

  try {
    const value = window.localStorage.getItem(key);
    if (!value) return fallback;

    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function readJsonObject<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const value = window.localStorage.getItem(key);
    if (!value) return fallback;

    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadMarketingReferences(): ReferenceInput[] {
  return readJsonArray<ReferenceInput>(REFERENCES_KEY, []);
}

export function saveMarketingReferences(references: ReferenceInput[]) {
  writeJson(REFERENCES_KEY, references);
}

export function loadMarketingCalendar(): EditorialCalendarItem[] {
  return readJsonArray<EditorialCalendarItem>(CALENDAR_KEY, []);
}

export function saveMarketingCalendar(calendar: EditorialCalendarItem[]) {
  writeJson(CALENDAR_KEY, calendar);
}

export function emptyMarketingProfile(): MarketingProfile {
  return {
    firmName: "",
    positioning: "",
    legalAreas: [],
    audiences: [],
    channels: ["linkedin"],
    voiceTone: "educational",
    websites: [],
    socialProfiles: [],
    admiredReferences: [],
    ethicsGuardrails: [
      "Nao prometer resultado juridico.",
      "Nao copiar conteudo de referencias.",
      "Manter revisao humana antes de publicar ou impulsionar.",
    ],
  };
}

export function loadMarketingProfile(): MarketingProfile {
  return { ...emptyMarketingProfile(), ...readJsonObject<MarketingProfile>(PROFILE_KEY, emptyMarketingProfile()) };
}

export function saveMarketingProfile(profile: MarketingProfile) {
  writeJson(PROFILE_KEY, profile);
}

export function loadLocalMarketingState(): MarketingState {
  return {
    profile: loadMarketingProfile(),
    references: loadMarketingReferences(),
    calendar: loadMarketingCalendar(),
    updatedAt: null,
  };
}

export function saveLocalMarketingState(state: Partial<MarketingState>) {
  if (state.profile) saveMarketingProfile(state.profile);
  if (state.references) saveMarketingReferences(state.references);
  if (state.calendar) saveMarketingCalendar(state.calendar);
}

export function hasMarketingStateContent(state: MarketingState | null) {
  if (!state) return false;
  return Boolean(
    state.references.length ||
    state.calendar.length ||
    state.profile.firmName.trim() ||
    state.profile.positioning.trim() ||
    state.profile.legalAreas.length ||
    state.profile.audiences.length ||
    state.profile.websites.length ||
    state.profile.socialProfiles.length ||
    state.profile.admiredReferences.length
  );
}

export function shouldUseRemoteMarketingState(state: MarketingState | null) {
  return state?.source === "server";
}

export async function loadRemoteMarketingState(): Promise<MarketingState | null> {
  const response = await fetch("/api/marketing/state", { cache: "no-store" });
  if (!response.ok) return null;

  const json = await response.json().catch(() => null);
  if (!json?.state) return null;

  return {
    profile: { ...emptyMarketingProfile(), ...(json.state.profile || {}) },
    references: Array.isArray(json.state.references) ? json.state.references : [],
    calendar: Array.isArray(json.state.calendar) ? json.state.calendar : [],
    updatedAt: json.state.updatedAt || null,
    source: json.source === "server" ? "server" : "empty",
  };
}

export async function saveRemoteMarketingState(state: Partial<MarketingState>): Promise<boolean> {
  const response = await fetch("/api/marketing/state", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state),
  });

  return response.ok;
}
