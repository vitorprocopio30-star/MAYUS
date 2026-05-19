import { describe, expect, it, vi } from "vitest";
import {
  SELF_CORRECTION_TAXONOMY,
  buildSelfCorrectionLearningPayload,
  planSelfCorrectionForPolicy,
  recordSelfCorrectionEvent,
} from "./self-correction";

describe("self-correction runtime", () => {
  it("planeja bloqueio para configuracao ausente e aprovacao para alto risco", () => {
    expect(planSelfCorrectionForPolicy({
      riskLevel: "low",
      policyOutcome: "blocked_needs_credentials",
    })).toEqual(expect.objectContaining({
      status: "blocked",
      correctionKind: "missing_configuration",
      externalSideEffectsBlocked: true,
    }));

    expect(planSelfCorrectionForPolicy({
      riskLevel: "high",
      policyOutcome: "requires_approval",
    })).toEqual(expect.objectContaining({
      status: "requires_approval",
      correctionKind: "supervision_required",
      externalSideEffectsBlocked: true,
    }));
  });

  it("mantem baixo risco como preflight sem correcao destrutiva", () => {
    expect(planSelfCorrectionForPolicy({ riskLevel: "low", policyOutcome: "execute" })).toEqual(expect.objectContaining({
      status: "no_correction_available",
      correctionKind: "policy_preflight",
      externalSideEffectsBlocked: false,
    }));
  });

  it("declara taxonomia inicial para setup, atendimento, juridico, comercial e financeiro", () => {
    expect(Object.keys(SELF_CORRECTION_TAXONOMY)).toEqual(expect.arrayContaining([
      "missing_configuration",
      "support_triage_correction",
      "legal_draft_guardrail",
      "commercial_playbook_adjustment",
      "supervised_financial_followup",
    ]));
  });

  it("sanitiza payload e grava learning_event sem texto bruto sensivel", async () => {
    const insert = vi.fn(async (_payload: unknown) => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) };

    await recordSelfCorrectionEvent({
      supabase,
      tenantId: "tenant-1",
      status: "failed",
      sourceModule: "mayus_operating_partner",
      correctionKind: "reply_repair",
      riskLevel: "low",
      reason: "token sk-secret-value-1234567890 should not leak",
      metadata: {
        api_key: "service_role_key=super-secret-token",
      },
    });

    expect(supabase.from).toHaveBeenCalledWith("learning_events");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      event_type: "self_correction_failed",
      source_module: "mayus_operating_partner",
      payload: expect.objectContaining({
        correction_status: "failed",
        correction_kind: "reply_repair",
      }),
    }));
    expect(JSON.stringify(insert.mock.calls[0][0])).not.toContain("super-secret-token");
    expect(JSON.stringify(insert.mock.calls[0][0])).not.toContain("sk-secret-value-1234567890");
  });

  it("grava o evento canonico quando nao ha correcao necessaria", async () => {
    const insert = vi.fn(async (_payload: unknown) => ({ error: null }));
    const supabase = { from: vi.fn(() => ({ insert })) };

    await recordSelfCorrectionEvent({
      supabase,
      tenantId: "tenant-1",
      status: "no_correction_available",
      sourceModule: "agent_policy",
      correctionKind: "policy_preflight",
      riskLevel: "low",
      recommendedAction: "Nenhuma correcao necessaria; a policy permitiu seguir.",
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "self_correction_not_available",
      source_module: "agent_policy",
      payload: expect.objectContaining({
        correction_status: "no_correction_available",
        correction_kind: "policy_preflight",
        external_side_effects_blocked: false,
      }),
    }));
  });

  it("constroi payload de auditoria de correcao sem aceitar risco invalido", () => {
    expect(buildSelfCorrectionLearningPayload({
      supabase: { from: vi.fn() },
      tenantId: "tenant-1",
      status: "corrected",
      sourceModule: "test",
      correctionKind: "safe_reply",
      riskLevel: "dangerous",
      evidenceEventIds: ["event-1", "event-2"],
    })).toEqual(expect.objectContaining({
      correction_status: "corrected",
      risk_level: "unknown",
      evidence_event_ids: ["event-1", "event-2"],
    }));
  });
});
