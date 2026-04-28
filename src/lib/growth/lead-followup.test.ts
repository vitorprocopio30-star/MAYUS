import { describe, expect, it } from "vitest";
import { buildLeadFollowupArtifactMetadata, buildLeadFollowupPlan } from "./lead-followup";

describe("lead followup", () => {
  it("builds high priority cadence for urgent or hot leads", () => {
    const plan = buildLeadFollowupPlan({
      leadName: "Maria Silva",
      legalArea: "Previdenciario",
      pain: "Negativa do INSS com prazo para recurso amanha.",
      score: 82,
    });

    expect(plan.priority).toBe("high");
    expect(plan.requiresHumanApproval).toBe(true);
    expect(plan.cadence[0].channel).toBe("whatsapp");
    expect(plan.cadence[1].channel).toBe("phone");
    expect(plan.humanReviewChecklist).toContain("Pedir CNIS ou carta do INSS");
  });

  it("builds medium cadence for normal leads", () => {
    const plan = buildLeadFollowupPlan({
      leadName: "Ana Lead",
      legalArea: "Trabalhista",
      pain: "Verbas rescisorias pendentes.",
      score: 60,
    });

    expect(plan.priority).toBe("medium");
    expect(plan.cadence[1].offsetHours).toBe(24);
    expect(plan.humanReviewChecklist).toContain("Confirmar periodo de trabalho");
  });

  it("builds safe artifact metadata for supervised followup", () => {
    const plan = buildLeadFollowupPlan({
      leadName: "Bianca Indicada",
      legalArea: "Familia",
      pain: "Revisao de alimentos.",
      score: 76,
    });
    const metadata = buildLeadFollowupArtifactMetadata({
      crmTaskId: "crm-task-1",
      plan,
    });

    expect(metadata).toEqual(expect.objectContaining({
      crm_task_id: "crm-task-1",
      lead_name: "Bianca Indicada",
      followup_priority: "high",
      requires_human_approval: true,
    }));
    expect(metadata.cadence).toHaveLength(3);
    expect(JSON.stringify(metadata)).not.toMatch(/api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });
});
