import { describe, expect, it } from "vitest";
import {
  buildOfficeSetupConversationArtifactMetadata,
  buildOfficeSetupConversationPlan,
} from "./office-setup-conversation";

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
    expect(plan.shouldPersistMethodology).toBe(true);
    expect(plan.operationalMethodology.status).toBe("approved");
    expect(plan.operationalMethodology.intake.methodology_base_used).toBe(false);
    expect(plan.operationalMethodology.internet_policy.no_auto_activation).toBe(true);
    expect(plan.methodologyReview).toEqual(expect.objectContaining({
      scope: "individual_office",
      status: "approved",
      activation: "active_internal",
      can_guide_internal_decisions: true,
      requires_human_review: true,
    }));
    expect(plan.methodologyReview.pending_area_validations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        area: "Direito Bancario",
        status: "needs_area_review",
        pending_items: expect.arrayContaining([
          "Confirmar se perguntas, documentos e fases refletem a rotina real do escritorio.",
        ]),
      }),
    ]));
    expect(plan.methodologyReview.approval_proposal).toEqual(expect.objectContaining({
      recommendation: "review_before_approval",
      requires_human_approval: true,
      blocks_sensitive_activation: true,
    }));
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
    expect(plan.operationalMethodology.area_methods).toEqual(expect.arrayContaining([
      expect.objectContaining({
        area: "Direito Bancario",
        phases: expect.arrayContaining(["Triagem do desconto/contrato"]),
      }),
      expect.objectContaining({
        area: "Previdenciario",
        required_documents: expect.arrayContaining(["CNIS"]),
      }),
    ]));
    expect(plan.operationalMethodology.improvement_rules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: "pending",
        requires_approval: true,
      }),
    ]));
    expect(plan.operationalMethodology.tenant_review).toEqual(plan.methodologyReview);

    const metadata = buildOfficeSetupConversationArtifactMetadata(plan);
    expect(metadata).toEqual(expect.objectContaining({
      methodology_status: "approved",
      methodology_activation: "active_internal",
      human_approval_proposal: expect.objectContaining({
        title: "Revisar metodologia antes de ativar",
      }),
    }));
    expect(metadata.pending_area_validations).toEqual(expect.arrayContaining([
      expect.objectContaining({ area: "Direito Bancario" }),
    ]));
    expect(JSON.stringify(plan)).not.toMatch(/api_key|sk-/i);
  });

  it("keeps draft answers out of persistence until the owner confirms", () => {
    const plan = buildOfficeSetupConversationPlan({
      conversationSummary: "Areas de atuacao: familia e previdenciario. Tom: acolhedor.",
    });

    expect(plan.status).toBe("collecting");
    expect(plan.shouldPersist).toBe(false);
    expect(plan.shouldPersistMethodology).toBe(true);
    expect(plan.operationalMethodology.status).toBe("recommended");
    expect(plan.methodologyReview.approval_proposal).toEqual(expect.objectContaining({
      recommendation: "review_before_approval",
      requires_human_approval: true,
    }));
    expect(plan.nextQuestion).toBeTruthy();
  });

  it("recommends the MAYUS base methodology when the office has no defined process", () => {
    const plan = buildOfficeSetupConversationPlan({
      conversationSummary: "Nao tenho processo definido. Monte a metodologia do meu escritorio para trabalhista, previdenciario e bancario/RMC.",
    });

    expect(plan.status).toBe("collecting");
    expect(plan.shouldPersist).toBe(false);
    expect(plan.shouldPersistMethodology).toBe(true);
    expect(plan.operationalMethodology.status).toBe("recommended");
    expect(plan.operationalMethodology.intake.methodology_base_used).toBe(true);
    expect(plan.operationalMethodology.area_methods).toEqual(expect.arrayContaining([
      expect.objectContaining({
        area: "Trabalhista",
        intake_questions: expect.arrayContaining(["Qual era a funcao, periodo de trabalho e motivo da saida?"]),
        required_documents: expect.arrayContaining(["CTPS", "Holerites"]),
      }),
      expect.objectContaining({
        area: "Previdenciario",
        required_documents: expect.arrayContaining(["CNIS", "Carta de indeferimento ou decisao do INSS"]),
      }),
      expect.objectContaining({
        area: "Bancario/RMC",
        required_documents: expect.arrayContaining(["Contrato ou proposta bancaria", "Extratos"]),
      }),
    ]));
    expect(plan.operationalMethodology.improvement_rules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: "methodology_base",
        status: "pending",
        requires_approval: true,
      }),
    ]));
    expect(plan.methodologyReview).toEqual(expect.objectContaining({
      status: "recommended",
      activation: "supervised_suggestion",
      can_guide_internal_decisions: false,
      requires_human_review: true,
    }));
    expect(plan.methodologyReview.review_reasons).toEqual(expect.arrayContaining([
      "methodology_recommended_not_approved",
      "methodology_base_requires_tenant_validation",
      "area_methods_need_review",
    ]));
    expect(plan.methodologyReview.pending_area_validations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        area: "Trabalhista",
        required_documents_count: expect.any(Number),
        phases_count: expect.any(Number),
      }),
    ]));
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
