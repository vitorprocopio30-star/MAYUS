import { describe, expect, it } from "vitest";
import { buildLeadQualificationArtifactMetadata, buildLeadQualificationPlan } from "./lead-qualification";

describe("lead qualification", () => {
  it("builds a previdenciario playbook with minimum documents", () => {
    const plan = buildLeadQualificationPlan({
      leadName: "Maria Silva",
      legalArea: "Previdenciario",
      pain: "Negativa do INSS com prazo para recurso.",
      score: 82,
    });

    expect(plan.confidence).toBe("high");
    expect(plan.requiresHumanHandoff).toBe(true);
    expect(plan.riskFlags).toContain("urgencia_ou_prazo");
    expect(plan.minimumDocuments).toContain("CNIS");
    expect(plan.qualificationScript.join(" ")).toContain("Meu INSS");
  });

  it("keeps low confidence when context is missing", () => {
    const plan = buildLeadQualificationPlan({
      leadName: "Lead incompleto",
      score: 30,
    });

    expect(plan.confidence).toBe("low");
    expect(plan.requiresHumanHandoff).toBe(true);
    expect(plan.riskFlags).toContain("area_juridica_nao_informada");
    expect(plan.riskFlags).toContain("dor_principal_nao_informada");
  });

  it("builds safe artifact metadata without raw contact fields", () => {
    const plan = buildLeadQualificationPlan({
      leadName: "Bianca Indicada",
      legalArea: "Familia",
      pain: "Revisao de alimentos com menor envolvido.",
      score: 76,
    });
    const metadata = buildLeadQualificationArtifactMetadata({
      crmTaskId: "crm-task-1",
      plan,
    });

    expect(metadata).toEqual(expect.objectContaining({
      crm_task_id: "crm-task-1",
      lead_name: "Bianca Indicada",
      legal_area: "Familia",
      qualification_confidence: "high",
      requires_human_handoff: true,
    }));
    expect(JSON.stringify(metadata)).not.toMatch(/phone|email|api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });
});
