import { describe, expect, it } from "vitest";
import {
  buildDefOfficeTrainingPlan,
  buildDefPromptProtocol,
  buildDefSkillMatrix,
} from "./def-excellence-protocol";

describe("def excellence protocol", () => {
  it("prioriza perfil comercial quando a PUV do escritorio ainda esta fraca", () => {
    const matrix = buildDefSkillMatrix({
      legalArea: "previdenciario",
      phase: "discovery",
      channel: "whatsapp",
      discoveryCompleteness: 35,
      firmProfileCompleteness: 40,
    });

    expect(matrix.find((skill) => skill.id === "positioning_puv")).toMatchObject({
      active: true,
      legalArea: "previdenciario",
    });
    expect(matrix.find((skill) => skill.id === "diagnostic_discovery")?.active).toBe(true);
    expect(matrix.find((skill) => skill.id === "non_robotic_script")?.active).toBe(true);
  });

  it("explicita guardrails de WhatsApp e etica juridica para o prompt", () => {
    const protocol = buildDefPromptProtocol();

    expect(protocol).toContain("uma pergunta por vez");
    expect(protocol).toContain("nunca prometa resultado");
    expect(protocol).toContain("Isolamento");
  });

  it("gera plano de treino para escritorios", () => {
    const plan = buildDefOfficeTrainingPlan();

    expect(plan).toEqual(expect.arrayContaining([
      expect.stringContaining("permissao de diagnostico"),
      expect.stringContaining("sparring semanal"),
    ]));
  });
});

