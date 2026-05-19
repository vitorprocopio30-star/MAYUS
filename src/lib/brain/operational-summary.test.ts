import { describe, expect, it } from "vitest";
import { buildBrainInboxOperationalSummary, type BrainOperationalLearningEvent } from "./operational-summary";

const createdAt = "2026-05-19T13:00:00.000Z";
let eventIndex = 0;

function event(overrides: Partial<BrainOperationalLearningEvent>): BrainOperationalLearningEvent {
  return {
    id: overrides.id || `event-${eventIndex++}`,
    event_type: overrides.event_type || "chat_turn_processed",
    source_module: overrides.source_module ?? null,
    payload: overrides.payload ?? null,
    created_at: overrides.created_at || createdAt,
  };
}

describe("buildBrainInboxOperationalSummary", () => {
  it("counts correction events and institutional memory traces by module", () => {
    const summary = buildBrainInboxOperationalSummary([
      event({
        id: "failed",
        event_type: "self_correction_failed",
        source_module: "mayus_operating_partner",
        payload: {
          correction_kind: "operating_partner_reply_repair",
          reason: "timeout",
          metadata: {
            institutional_memory: {
              applied_count: 2,
              applied_entries: [
                { key: "tom_consultivo" },
                { key: "self_improvement:financeiro_cobranca" },
              ],
            },
          },
        },
      }),
      event({
        id: "blocked",
        event_type: "self_correction_blocked",
        source_module: "agent_policy",
        payload: {
          correction_kind: "policy_preflight",
          reason: "external_action",
        },
      }),
      event({
        id: "repair",
        event_type: "mayus_operating_partner_repair_pattern",
        source_module: "mayus_operating_partner",
      }),
      event({
        id: "proposal",
        event_type: "self_improvement_proposals_created",
        source_module: "self_improvement_loop",
      }),
    ]);

    expect(summary.correction_counts).toMatchObject({
      total: 4,
      failed: 1,
      blocked: 1,
      repair_patterns: 1,
      improvement_proposals: 1,
    });
    expect(summary.memory_applications.total_events).toBe(1);
    expect(summary.memory_applications.total_applied).toBe(2);
    expect(summary.memory_applications.keys).toEqual([
      { key: "tom_consultivo", count: 1 },
      { key: "self_improvement:financeiro_cobranca", count: 1 },
    ]);
    expect(summary.modules[0]).toEqual({ module: "mayus_operating_partner", count: 3 });
    expect(summary.recent_blocked).toHaveLength(2);
    expect(summary.recent_blocked[0]).toMatchObject({
      id: "failed",
      source_module: "mayus_operating_partner",
      correction_kind: "operating_partner_reply_repair",
      reason: "timeout",
    });
  });

  it("keeps the legacy no_correction_available alias counted as not available", () => {
    const summary = buildBrainInboxOperationalSummary([
      event({ event_type: "self_correction_not_available", source_module: "core" }),
      event({ event_type: "self_correction_no_correction_available", source_module: "core" }),
    ]);

    expect(summary.correction_counts.total).toBe(2);
    expect(summary.correction_counts.not_available).toBe(2);
    expect(summary.modules).toEqual([{ module: "core", count: 2 }]);
  });

  it("sanitizes blocked summaries and caps recent blocked rows", () => {
    const events = Array.from({ length: 7 }, (_, index) => event({
      id: `blocked-${index}`,
      event_type: "self_correction_requires_approval",
      source_module: "finance",
      payload: {
        correction_kind: `billing\nkind-${index}`,
        reason: `motivo\r\ncom controle ${index}`,
        recommended_action: "x".repeat(260),
      },
    }));

    const summary = buildBrainInboxOperationalSummary(events);

    expect(summary.recent_blocked).toHaveLength(5);
    expect(summary.recent_blocked[0].correction_kind).toBe("billing kind-0");
    expect(summary.recent_blocked[0].reason).toBe("motivo com controle 0");
    expect(summary.recent_blocked[0].recommended_action).toHaveLength(180);
  });
});
