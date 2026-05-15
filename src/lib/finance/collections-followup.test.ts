import { describe, expect, it } from "vitest";
import {
  buildCollectionsFollowupArtifactMetadata,
  buildCollectionsFollowupPlan,
} from "./collections-followup";

describe("collections followup", () => {
  it("classifies light overdue and builds a supervised reminder", () => {
    const plan = buildCollectionsFollowupPlan({
      clientName: "Maria Silva",
      legalArea: "Previdenciario",
      amount: "1500",
      daysOverdue: "3",
      dueDate: "2026-05-10",
      tone: "empatico",
    });

    expect(plan.stage).toBe("light_overdue");
    expect(plan.priority).toBe("low");
    expect(plan.requiresHumanApproval).toBe(true);
    expect(plan.externalSideEffectsBlocked).toBe(true);
    expect(plan.suggestedFirstMessage).toContain("Maria");
    expect(plan.humanReviewChecklist).toContain("Confirmar se o pagamento ja nao foi recebido antes de contatar o cliente.");
  });

  it("escalates delinquency by overdue days and value", () => {
    const plan = buildCollectionsFollowupPlan({
      clientName: "Carlos Souza",
      amount: 7500,
      daysOverdue: 18,
      stage: "inadimplencia",
      channel: "telefone",
      tone: "firme",
    });

    expect(plan.stage).toBe("delinquency");
    expect(plan.priority).toBe("high");
    expect(plan.primaryChannel).toBe("phone");
    expect(plan.cadence[1]).toEqual(expect.objectContaining({
      channel: "phone",
      objective: "Tentar contato humano para reduzir risco de inadimplencia prolongada.",
    }));
  });

  it("tracks renegotiation promises without executing external side effects", () => {
    const plan = buildCollectionsFollowupPlan({
      clientName: "Bianca Lima",
      amount: "2.400,50",
      daysOverdue: 9,
      notes: "cliente pediu renegociacao",
      paymentPromiseAt: "2026-05-20",
      nextContactAt: "2026-05-18T13:00:00.000Z",
    });
    const metadata = buildCollectionsFollowupArtifactMetadata({
      crmTaskId: "crm-task-1",
      billingArtifactId: "billing-artifact-1",
      financialId: "financial-1",
      plan,
    });

    expect(plan.stage).toBe("renegotiation");
    expect(plan.promiseTracking).toEqual({
      paymentPromiseAt: "2026-05-20",
      nextContactAt: "2026-05-18T13:00:00.000Z",
    });
    expect(metadata).toEqual(expect.objectContaining({
      crm_task_id: "crm-task-1",
      billing_artifact_id: "billing-artifact-1",
      financial_id: "financial-1",
      collection_stage: "renegotiation",
      external_side_effects_blocked: true,
      requires_human_approval: true,
    }));
    expect(JSON.stringify(metadata)).not.toMatch(/api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });
});
