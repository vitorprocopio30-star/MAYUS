import { describe, expect, it } from "vitest";
import {
  buildColdLeadReactivationArtifactMetadata,
  buildColdLeadReactivationPlan,
} from "./cold-lead-reactivation";

describe("cold lead reactivation", () => {
  it("builds a supervised segment reactivation plan", () => {
    const plan = buildColdLeadReactivationPlan({
      legalArea: "Previdenciario",
      minDaysInactive: 45,
      maxLeads: 10,
      candidates: [
        { id: "crm-task-1", name: "Maria Silva", legalArea: "Previdenciario", score: 82, source: "Instagram" },
        { id: "crm-task-2", name: "Joao Souza", legalArea: "Previdenciario", score: 40, source: "Indicacao" },
      ],
    });

    expect(plan.segment).toBe("Previdenciario");
    expect(plan.minDaysInactive).toBe(45);
    expect(plan.candidateCount).toBe(2);
    expect(plan.candidates[0]).toEqual(expect.objectContaining({
      id: "crm-task-1",
      name: "Maria Silva",
      priority: "high",
    }));
    expect(plan.selectionCriteria).toEqual(expect.arrayContaining([
      expect.stringContaining("45 dias"),
    ]));
    expect(plan.messageVariants).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: "whatsapp" }),
      expect.objectContaining({ channel: "phone" }),
    ]));
    expect(plan.requiresHumanApproval).toBe(true);
    expect(plan.externalSideEffectsBlocked).toBe(true);
  });

  it("keeps metadata safe and approval-first", () => {
    const plan = buildColdLeadReactivationPlan({
      segment: "leads frios previdenciarios",
      legalArea: "Previdenciario",
      candidates: [
        { id: "crm-task-1", name: "Maria Silva", score: 76, source: "Google Ads" },
      ],
    });
    const metadata = buildColdLeadReactivationArtifactMetadata(plan);

    expect(metadata).toEqual(expect.objectContaining({
      segment: "leads frios previdenciarios",
      legal_area: "Previdenciario",
      candidate_count: 1,
      requires_human_approval: true,
      external_side_effects_blocked: true,
    }));
    expect(metadata.candidates).toEqual([
      expect.objectContaining({
        id: "crm-task-1",
        name: "Maria Silva",
        priority: "high",
      }),
    ]);
    expect(JSON.stringify(metadata)).not.toMatch(/phone_number|email|api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });
});
