import { describe, expect, it } from "vitest";
import { analyzeLeadIntake, buildCrmTaskPayload } from "./lead-intake";

describe("lead intake", () => {
  it("scores urgent leads higher and recommends human follow-up", () => {
    const result = analyzeLeadIntake({
      name: "Maria Silva",
      phone: "(21) 99999-0000",
      origin: "Instagram",
      channel: "WhatsApp",
      legalArea: "Trabalhista",
      urgency: "alta",
      pain: "Tenho uma audiencia amanha e preciso de apoio urgente para defesa.",
    });

    expect(result.kind).toBe("new_lead");
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.tags).toContain("urgente");
    expect(result.needsHumanHandoff).toBe(true);
  });

  it("keeps incomplete leads as needs_context", () => {
    const result = analyzeLeadIntake({
      name: "Joao",
      pain: "Preciso de ajuda",
    });

    expect(result.kind).toBe("needs_context");
    expect(result.score).toBeLessThanOrEqual(55);
    expect(result.tags).toContain("precisa-contexto");
    expect(result.nextStep).toContain("Coletar telefone");
  });

  it("does not classify case status requests as commercial leads", () => {
    const result = analyzeLeadIntake({
      name: "Cliente Atual",
      phone: "21999990000",
      pain: "Quero saber o andamento do meu processo e se houve movimentacao.",
    });

    expect(result.kind).toBe("case_status_request");
    expect(result.tags).toContain("status-caso");
    expect(result.nextStep).toContain("status do caso");
  });

  it("builds a crm task payload with score, source and tags", () => {
    const result = analyzeLeadIntake({
      name: "Ana Lead",
      phone: "21988887777",
      origin: "Google Ads",
      channel: "Formulario",
      legalArea: "Previdenciario",
      pain: "Preciso revisar negativa do INSS e entender documentos para acao.",
    });

    const payload = buildCrmTaskPayload({
      tenantId: "tenant-1",
      pipelineId: "pipeline-1",
      stageId: "stage-1",
      result,
    });

    expect(payload.title).toBe("Ana Lead");
    expect(payload.lead_scoring).toBe(result.score);
    expect(payload.source).toBe("Google Ads");
    expect(payload.tags).toContain("lead-intake");
    expect(payload.tags).toContain("canal:formulario");
  });
});
