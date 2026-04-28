import { describe, expect, it } from "vitest";
import { buildSalesProfileSetupPlan } from "./sales-profile-setup";

describe("buildSalesProfileSetupPlan", () => {
  it("investiga e auto-configura perfil comercial com PUV rascunhada", () => {
    const plan = buildSalesProfileSetupPlan({
      idealClient: "beneficiarios do INSS com indeferimento recente e urgencia de renda",
      coreSolution: "entender chance real, documentos faltantes e melhor caminho para destravar o beneficio",
    });

    expect(plan.status).toBe("auto_configured");
    expect(plan.shouldPersist).toBe(true);
    expect(plan.profile.uniqueValueProposition).toContain("beneficiarios do INSS");
    expect(plan.profile.valuePillars).toHaveLength(3);
    expect(plan.missingSignals).toHaveLength(0);
    expect(plan.requiresHumanReview).toBe(true);
    expect(plan.externalSideEffectsBlocked).toBe(true);
  });

  it("marca validado quando o usuario confirma o perfil", () => {
    const plan = buildSalesProfileSetupPlan({
      conversationTurns: [
        {
          role: "user",
          content: "Cliente ideal: empresarios com passivo trabalhista. Solucao central: reduzir risco e negociar com estrategia. PUV: blindagem trabalhista consultiva antes do litigio. Pilares: Diagnostico, Prova, Negociacao. Pode salvar, esta certo.",
        },
      ],
    });

    expect(plan.status).toBe("validated");
    expect(plan.shouldMarkValidated).toBe(true);
    expect(plan.shouldPersist).toBe(true);
    expect(plan.profile.status).toBe("validated");
  });

  it("continua coletando quando faltam cliente ideal e solucao", () => {
    const plan = buildSalesProfileSetupPlan({
      conversationSummary: "Quero que o MAYUS configure vendas sozinho.",
    });

    expect(plan.status).toBe("collecting");
    expect(plan.shouldPersist).toBe(false);
    expect(plan.missingSignals.map((signal) => signal.key)).toEqual(["ideal_client", "core_solution"]);
    expect(plan.nextQuestion).toContain("cliente ideal");
  });
});
