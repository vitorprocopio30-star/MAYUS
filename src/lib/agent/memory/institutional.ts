import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeMemoryText } from "./promotion";

type FakeRow = Record<string, unknown>;

export type InstitutionalMemoryEntry = {
  id: string;
  key: string;
  text: string;
  category: string;
  source: "office_institutional_memory" | "brain_memory_promoted";
  sourceLabel: string | null;
  confidence: number | null;
};

export type LoadInstitutionalMemoryOptions = {
  limit?: number;
};

export type InstitutionalMemoryPromptBlock = {
  block: string;
  appliedCount: number;
  totalAvailable: number;
};

const DEFAULT_LIMIT = 30;
const MAX_KEY_CHARS = 120;
const MAX_SOURCE_LABEL_CHARS = 60;
export const DEFAULT_INSTITUTIONAL_MEMORY_PROMPT_CAP = 8;

function extractRawText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    const text = (value as Record<string, unknown>).text;
    if (typeof text === "string") return text;
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value);
}

function sanitizeText(value: unknown): string {
  return sanitizeMemoryText(extractRawText(value));
}

function sanitizeKey(value: unknown, fallback: string): string {
  const text = sanitizeMemoryText(extractRawText(value)).slice(0, MAX_KEY_CHARS).trim();
  return text || fallback;
}

function sanitizeSourceLabel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = sanitizeMemoryText(value).slice(0, MAX_SOURCE_LABEL_CHARS).trim();
  return text || null;
}

function normalizeCategory(value: unknown): string {
  const raw = typeof value === "string" ? value : extractRawText(value);
  const text = sanitizeMemoryText(raw).trim();
  if (!text) return "geral";
  return text.toLowerCase().slice(0, 40);
}

function buildEntryKey(entry: InstitutionalMemoryEntry): string {
  return `${entry.category}::${entry.key.toLowerCase()}::${entry.text.toLowerCase()}`;
}

export async function loadEnforcedInstitutionalMemory(
  supabase: SupabaseClient,
  tenantId: string,
  options: LoadInstitutionalMemoryOptions = {},
): Promise<InstitutionalMemoryEntry[]> {
  if (!tenantId) return [];
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 100));

  async function safeQuery(builderFn: () => unknown, label: string): Promise<FakeRow[]> {
    try {
      const awaited = await (builderFn() as Promise<{ data: FakeRow[] | null; error: { message: string } | null }>);
      if (awaited?.error) console.warn(`[loadEnforcedInstitutionalMemory] ${label}:`, awaited.error.message);
      return Array.isArray(awaited?.data) ? awaited.data : [];
    } catch (error) {
      console.warn(`[loadEnforcedInstitutionalMemory] ${label} threw:`, error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  const officeRows = await safeQuery(() => supabase
    .from("office_institutional_memory")
    .select("id, category, key, value, enforced, created_at")
    .eq("tenant_id", tenantId)
    .eq("enforced", true)
    .order("category", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(limit), "office_institutional_memory");

  const proposalRows = await safeQuery(() => supabase
    .from("brain_memories")
    .select("id, memory_key, value, source, confidence, promoted, created_at")
    .eq("tenant_id", tenantId)
    .eq("scope", "tenant")
    .eq("memory_type", "institutional_memory_proposal")
    .eq("promoted", true)
    .order("created_at", { ascending: false })
    .limit(limit), "brain_memories");

  const entries: InstitutionalMemoryEntry[] = [];

  for (const row of officeRows) {
    const text = sanitizeText(row.value);
    if (!text) continue;
    entries.push({
      id: String(row.id),
      key: sanitizeKey(row.key, "regra"),
      text,
      category: normalizeCategory(row.category),
      source: "office_institutional_memory",
      sourceLabel: null,
      confidence: null,
    });
  }

  for (const row of proposalRows) {
    const raw = (row.value && typeof row.value === "object") ? row.value as Record<string, unknown> : {};
    const status = typeof raw.status === "string" ? raw.status : null;
    if (status === "rejected" || status === "revoked") continue;
    const text = sanitizeText(raw.text ?? row.value);
    if (!text) continue;
    const category = normalizeCategory(raw.category ?? "geral");
    const sourceLabel = sanitizeSourceLabel(raw.source_label);
    const confidence = typeof row.confidence === "number"
      ? row.confidence
      : Number.isFinite(Number(row.confidence)) ? Number(row.confidence) : null;
    entries.push({
      id: String(row.id),
      key: sanitizeKey(row.memory_key, "memoria"),
      text,
      category,
      source: "brain_memory_promoted",
      sourceLabel,
      confidence,
    });
  }

  const dedup = new Map<string, InstitutionalMemoryEntry>();
  for (const entry of entries) {
    const key = buildEntryKey(entry);
    if (!dedup.has(key)) dedup.set(key, entry);
  }

  return Array.from(dedup.values()).slice(0, limit);
}

export function summarizeInstitutionalMemoryForPrompt(
  entries: InstitutionalMemoryEntry[],
  maxItems = DEFAULT_INSTITUTIONAL_MEMORY_PROMPT_CAP,
): string {
  const cappedMaxItems = Math.max(0, maxItems);
  if (!entries.length || cappedMaxItems === 0) return "";
  const grouped: Record<string, InstitutionalMemoryEntry[]> = {};
  const order: string[] = [];
  for (const entry of entries.slice(0, cappedMaxItems)) {
    if (!grouped[entry.category]) {
      grouped[entry.category] = [];
      order.push(entry.category);
    }
    grouped[entry.category].push(entry);
  }
  const blocks: string[] = [];
  for (const category of order) {
    const lines = grouped[category].map((item) => {
      const label = item.sourceLabel ? ` (${item.sourceLabel})` : "";
      return `- ${item.key}${label}: ${item.text}`;
    });
    blocks.push(`[${category.toUpperCase()}]\n${lines.join("\n")}`);
  }
  return blocks.join("\n\n");
}

export function buildInstitutionalMemoryPromptBlock(
  entries: InstitutionalMemoryEntry[],
  maxItems = DEFAULT_INSTITUTIONAL_MEMORY_PROMPT_CAP,
): InstitutionalMemoryPromptBlock {
  const totalAvailable = entries.length;
  const cappedMaxItems = Math.max(0, maxItems);
  const appliedCount = Math.min(totalAvailable, cappedMaxItems);
  const summary = summarizeInstitutionalMemoryForPrompt(entries, cappedMaxItems);
  const block = summary
    ? `\n\nMemoria institucional aprovada (siga obrigatoriamente):\n${summary}`
    : "";
  return { block, appliedCount: summary ? appliedCount : 0, totalAvailable };
}
