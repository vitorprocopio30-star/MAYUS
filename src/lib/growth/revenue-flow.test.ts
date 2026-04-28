import { describe, expect, it } from "vitest";
import { buildRevenueFlowArtifactMetadata, buildRevenueFlowPlan } from "./revenue-flow";

describe("revenue flow", () => {
  it("builds supervised proposal to case plan", () => {
    const plan = buildRevenueFlowPlan({
      crmTaskId: "crm-task-1",
      clientName: "Maria Silva",
      legalArea: "Previdenciario",
      amount: "4500,00",
      proposalReady: true,
      contractReady: false,
    });

    expect(plan.clientName).toBe("Maria Silva");
    expect(plan.amount).toBe(4500);
    expect(plan.requiresHumanApproval).toBe(true);
    expect(plan.steps).toHaveLength(4);
    expect(plan.steps[0]).toEqual(expect.objectContaining({ key: "proposal", status: "ready" }));
    expect(plan.steps[1]).toEqual(expect.objectContaining({ key: "contract", status: "waiting" }));
    expect(plan.steps[3]).toEqual(expect.objectContaining({ key: "case_opening", status: "blocked" }));
    expect(plan.nextBestAction).toContain("Aprovar proposta");
  });

  it("blocks billing when amount is missing", () => {
    const plan = buildRevenueFlowPlan({
      clientName: "Ana Lead",
      proposalReady: true,
      contractReady: true,
    });

    expect(plan.blockedReason).toBe("Valor comercial ainda nao confirmado para gerar cobranca.");
    expect(plan.steps.find((step) => step.key === "billing")?.status).toBe("blocked");
  });

  it("builds safe artifact metadata", () => {
    const plan = buildRevenueFlowPlan({
      crmTaskId: "crm-task-2",
      clientName: "Bianca Indicada",
      amount: 3000,
      proposalReady: true,
      contractReady: true,
      billingReady: true,
      paymentConfirmed: true,
    });
    const metadata = buildRevenueFlowArtifactMetadata(plan);

    expect(metadata).toEqual(expect.objectContaining({
      client_name: "Bianca Indicada",
      crm_task_id: "crm-task-2",
      amount: 3000,
      requires_human_approval: true,
    }));
    expect(metadata.steps).toHaveLength(4);
    expect(JSON.stringify(metadata)).not.toMatch(/api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });
});
