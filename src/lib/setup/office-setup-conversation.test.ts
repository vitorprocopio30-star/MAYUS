import { describe, expect, it } from "vitest";
import { buildOfficeSetupConversationPlan } from "./office-setup-conversation";

describe("office setup conversation", () => {
  it("builds a validated office profile only after explicit confirmation", () => {
    const plan = buildOfficeSetupConversationPlan({
      officeName: "Dutra Advocacia",
      practiceAreas: ["Direito Bancario", "Previdenciario"],
      communicationTone: "curto, humano e consultivo",
      triageRules: ["Separar lead novo de cliente atual"],
      humanHandoffRules: ["Urgencia juridica chama advogado"],
      requiredDocumentsByCase: ["contracheque", "CNJ"],
      forbiddenClaims: ["resultado garantido"],
      pricingPolicy: "Nao falar preco sem aprovacao",
      responseSla: "5 minutos no primeiro atendimento",
      departments: ["Comercial", "Juridico"],
      permissionPolicy: "Socio aprova contrato, cobranca e envio externo",
      calendarPolicy: "Consulta pode ser sugerida, mas confirmacao externa exige humano",
      financePolicy: "Cobrancas e renegociacoes ficam supervisionadas",
      playbookNotes: "Usar roteiro consultivo curto com proximo passo claro",
      confirmationText: "Pode salvar, esta certo",
    });

    expect(plan.status).toBe("validated");
    expect(plan.shouldPersist).toBe(true);
    expect(plan.profile).toEqual(expect.objectContaining({
      office_name: "Dutra Advocacia",
      practice_areas: ["Direito Bancario", "Previdenciario"],
      permission_policy: "Socio aprova contrato, cobranca e envio externo",
      calendar_policy: "Consulta pode ser sugerida, mas confirmacao externa exige humano",
      finance_policy: "Cobrancas e renegociacoes ficam supervisionadas",
      playbook_notes: "Usar roteiro consultivo curto com proximo passo claro",
      status: "validated",
    }));
    expect(plan.profile.practice_area_playbooks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        area: "Direito Bancario",
        validation_status: "needs_area_review",
        default_pipeline: expect.arrayContaining(["Triagem do desconto/contrato"]),
        required_documents: expect.arrayContaining(["Contrato ou proposta bancaria", "contracheque"]),
      }),
      expect.objectContaining({
        area: "Previdenciario",
        default_pipeline: expect.arrayContaining(["Triagem do beneficio e historico INSS"]),
        required_documents: expect.arrayContaining(["CNIS"]),
      }),
    ]));
    expect(JSON.stringify(plan)).not.toMatch(/api_key|sk-/i);
  });

  it("keeps draft answers out of persistence until the owner confirms", () => {
    const plan = buildOfficeSetupConversationPlan({
      conversationSummary: "Areas de atuacao: familia e previdenciario. Tom: acolhedor.",
    });

    expect(plan.status).toBe("collecting");
    expect(plan.shouldPersist).toBe(false);
    expect(plan.nextQuestion).toBeTruthy();
  });

  it("redacts secret-looking text from captured profile values", () => {
    const plan = buildOfficeSetupConversationPlan({
      officeName: "Escritorio token: sk-secret",
      confirmationText: "confirmo",
    });

    expect(JSON.stringify(plan.profile)).not.toContain("sk-secret");
    expect(plan.profile.office_name).toContain("[redacted]");
  });
});
