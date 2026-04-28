import type { EditorialCalendarItem, MarketingProfile, ReferenceInput } from "@/lib/marketing/editorial-calendar";

const REFERENCES_KEY = "mayus.marketing.references.mvp.v1";
const CALENDAR_KEY = "mayus.marketing.editorial-calendar.mvp.v1";
const PROFILE_KEY = "mayus.marketing.profile.mvp.v1";

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
