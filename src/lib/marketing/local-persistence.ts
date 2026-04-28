import type { EditorialCalendarItem, ReferenceInput } from "@/lib/marketing/editorial-calendar";

const REFERENCES_KEY = "mayus.marketing.references.mvp.v1";
const CALENDAR_KEY = "mayus.marketing.editorial-calendar.mvp.v1";

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const value = window.localStorage.getItem(key);
    if (!value) return fallback;

    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function loadMarketingReferences(): ReferenceInput[] {
  return readJson<ReferenceInput[]>(REFERENCES_KEY, []);
}

export function saveMarketingReferences(references: ReferenceInput[]) {
  writeJson(REFERENCES_KEY, references);
}

export function loadMarketingCalendar(): EditorialCalendarItem[] {
  return readJson<EditorialCalendarItem[]>(CALENDAR_KEY, []);
}

export function saveMarketingCalendar(calendar: EditorialCalendarItem[]) {
  writeJson(CALENDAR_KEY, calendar);
}
