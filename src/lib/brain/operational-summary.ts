import type { BrainInboxOperationalSummary } from "@/lib/brain/inbox-types";

export type BrainOperationalLearningEvent = {
  id: string;
  event_type: string;
  source_module?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
};

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getNumber(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function safeSummaryText(value: unknown, maxLength = 140) {
  const text = getString(value);
  if (!text) return null;
  return text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").slice(0, maxLength);
}

function incrementCounter(map: Map<string, number>, key: string, amount = 1) {
  map.set(key, (map.get(key) || 0) + amount);
}

function extractOperationalModule(event: BrainOperationalLearningEvent) {
  const payload = getRecord(event.payload);
  const metadata = getRecord(payload?.metadata);
  return getString(event.source_module)
    || getString(payload?.source_module)
    || getString(payload?.target_module)
    || getString(metadata?.module)
    || getString(metadata?.skill_name)
    || "core";
}

function extractInstitutionalMemoryTrace(payload: Record<string, unknown> | null | undefined) {
  const metadata = getRecord(payload?.metadata);
  const memory = getRecord(metadata?.institutional_memory) || getRecord(payload?.institutional_memory);
  if (!memory) return { appliedCount: 0, keys: [] as string[] };

  const appliedCount = getNumber(memory.applied_count);
  const keys = Array.isArray(memory.applied_entries)
    ? memory.applied_entries
      .map((entry) => safeSummaryText(getRecord(entry)?.key, 80))
      .filter((key): key is string => Boolean(key))
    : [];

  return { appliedCount, keys };
}

export function buildBrainInboxOperationalSummary(
  events: BrainOperationalLearningEvent[]
): BrainInboxOperationalSummary {
  const correctionCounts: BrainInboxOperationalSummary["correction_counts"] = {
    total: 0,
    attempted: 0,
    applied: 0,
    requires_approval: 0,
    blocked: 0,
    failed: 0,
    not_available: 0,
    repair_patterns: 0,
    improvement_proposals: 0,
  };
  const modules = new Map<string, number>();
  const memoryKeys = new Map<string, number>();
  const recentBlocked: BrainInboxOperationalSummary["recent_blocked"] = [];
  let memoryEvents = 0;
  let totalAppliedMemory = 0;

  for (const event of events) {
    const payload = getRecord(event.payload);
    const moduleName = extractOperationalModule(event);
    const memoryTrace = extractInstitutionalMemoryTrace(payload);

    if (memoryTrace.appliedCount > 0) {
      memoryEvents += 1;
      totalAppliedMemory += memoryTrace.appliedCount;
      incrementCounter(modules, moduleName);
      for (const key of memoryTrace.keys) {
        incrementCounter(memoryKeys, key);
      }
    }

    let isOperationalCorrection = false;
    switch (event.event_type) {
      case "self_correction_attempted":
        correctionCounts.attempted += 1;
        isOperationalCorrection = true;
        break;
      case "self_correction_applied":
        correctionCounts.applied += 1;
        isOperationalCorrection = true;
        break;
      case "self_correction_requires_approval":
        correctionCounts.requires_approval += 1;
        isOperationalCorrection = true;
        break;
      case "self_correction_blocked":
        correctionCounts.blocked += 1;
        isOperationalCorrection = true;
        break;
      case "self_correction_failed":
        correctionCounts.failed += 1;
        isOperationalCorrection = true;
        break;
      case "self_correction_not_available":
      case "self_correction_no_correction_available":
        correctionCounts.not_available += 1;
        isOperationalCorrection = true;
        break;
      case "mayus_operating_partner_repair_pattern":
        correctionCounts.repair_patterns += 1;
        isOperationalCorrection = true;
        break;
      case "self_improvement_proposals_created":
        correctionCounts.improvement_proposals += 1;
        isOperationalCorrection = true;
        break;
      default:
        break;
    }

    if (isOperationalCorrection) {
      correctionCounts.total += 1;
      incrementCounter(modules, moduleName);
    }

    if (
      recentBlocked.length < 5
      && (
        event.event_type === "self_correction_blocked"
        || event.event_type === "self_correction_failed"
        || event.event_type === "self_correction_requires_approval"
      )
    ) {
      recentBlocked.push({
        id: event.id,
        event_type: event.event_type,
        source_module: event.source_module,
        correction_kind: safeSummaryText(payload?.correction_kind, 80),
        reason: safeSummaryText(payload?.reason),
        recommended_action: safeSummaryText(payload?.recommended_action, 180),
        created_at: event.created_at,
      });
    }
  }

  return {
    correction_counts: correctionCounts,
    modules: Array.from(modules.entries())
      .map(([module, count]) => ({ module, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    memory_applications: {
      total_events: memoryEvents,
      total_applied: totalAppliedMemory,
      keys: Array.from(memoryKeys.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
    },
    recent_blocked: recentBlocked,
  };
}
