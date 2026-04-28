import { describe, expect, it } from "vitest";
import {
  buildSalesConsultationArtifactMetadata,
  buildSalesConsultationPlan,
} from "./sales-consultation";

describe("sales consultation", () => {
  it("builds a DEF consultative service plan", () => {
    const plan = buildSalesConsultationPlan({
      leadName: "Maria Silva",
      legalArea: "Previdenciario",
      pain: "Beneficio negado pelo INSS.",
      channel: "WhatsApp",
      stage: "descoberta",
      objective: "preparar atendimento para fechamento premium",
      score: 82,
      ticketValue: 4500,
    });

    expect(plan.leadName).toBe("Maria Silva");
    expect(plan.legalArea).toBe("Previdenciario");
    expect(plan.phase).toBe("discovery");
    expect(plan.customerProfile).toBe("decided");
    expect(plan.channel).toBe("whatsapp");
    expect(plan.discoveryQuestions[0]).toContain("Antes de eu te dizer qualquer caminho");
    expect(plan.firmProfile.uniqueValueProposition).toContain("Ajudamos");
    expect(plan.firmProfile.isDrafted).toBe(true);
    expect(plan.firmProfile.missingSignals.map((signal) => signal.key)).toEqual(expect.arrayContaining([
      "ideal_client",
      "core_solution",
    ]));
    expect(plan.nextBestAction).toContain("Usuario MAYUS deve responder");
    expect(plan.knownSignals.map((signal) => signal.key)).toEqual(expect.arrayContaining([
      "lead_identity",
      "legal_area",
      "situation",
      "budget_or_anchor",
    ]));
    expect(plan.missingSignals.map((signal) => signal.key)).toEqual(expect.arrayContaining([
      "decision_makers",
    ]));
    expect(plan.discoveryCompleteness).toBeGreaterThan(30);
    expect(plan.nextDiscoveryQuestion).toBe(plan.missingSignals[0].nextQuestion);
    expect(plan.enchantmentBridge).toEqual(expect.arrayContaining([
      expect.stringContaining("Conectar a oferta ao diagnostico"),
    ]));
    expect(plan.closingSequence).toEqual(expect.arrayContaining([
      expect.stringContaining("Isolar a variavel decisiva"),
    ]));
    expect(plan.forbiddenMoves).toEqual(expect.arrayContaining([
      "Prometer resultado juridico.",
      "Enviar WhatsApp, e-mail, contrato, cobranca ou ligacao automatica sem acao humana.",
    ]));
    expect(plan.requiresHumanReview).toBe(true);
    expect(plan.externalSideEffectsBlocked).toBe(true);
  });

  it("turns price objections into investigation moves and safe metadata", () => {
    const plan = buildSalesConsultationPlan({
      leadName: "Joao Souza",
      legalArea: "Trabalhista",
      objection: "Achei caro e preciso falar com meu socio.",
      stage: "fechamento",
      channel: "ligacao",
    });
    const metadata = buildSalesConsultationArtifactMetadata({
      crmTaskId: "crm-task-1",
      plan,
    });

    expect(plan.phase).toBe("closing");
    expect(plan.channel).toBe("phone");
    expect(plan.objectionMoves).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "price",
        investigationQuestion: expect.stringContaining("valor"),
      }),
      expect.objectContaining({
        type: "authority",
      }),
    ]));
    expect(metadata).toEqual(expect.objectContaining({
      crm_task_id: "crm-task-1",
      consultation_phase: "closing",
      external_side_effects_blocked: true,
      requires_human_review: true,
    }));
    expect(JSON.stringify(metadata)).not.toMatch(/phone_number|email|api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });

  it("uses the office commercial profile when it exists", () => {
    const plan = buildSalesConsultationPlan({
      leadName: "Maria Silva",
      legalArea: "Previdenciario",
      pain: "Beneficio negado.",
      officeIdealClient: "segurados do INSS com beneficio negado e urgencia financeira",
      officeSolution: "diagnostico previdenciario com plano de documentos e tese de revisao",
      officeUniqueValueProposition: "Transformamos indeferimentos confusos em um plano previdenciario claro antes de qualquer promessa.",
      officePillars: ["Raio-X do CNIS", "Plano de Provas", "Decisao Segura"],
    });
    const metadata = buildSalesConsultationArtifactMetadata({ plan });

    expect(plan.firmProfile.positioningCompleteness).toBeGreaterThanOrEqual(80);
    expect(plan.firmProfile.missingSignals).toHaveLength(0);
    expect(plan.firmProfile.uniqueValueProposition).toContain("indeferimentos confusos");
    expect(plan.enchantmentBridge).toEqual(expect.arrayContaining([
      expect.stringContaining("Raio-X do CNIS"),
    ]));
    expect(metadata).toEqual(expect.objectContaining({
      firm_positioning_completeness: plan.firmProfile.positioningCompleteness,
      firm_profile_drafted: false,
    }));
  });

  it("uses conversation history to adapt the next question", () => {
    const plan = buildSalesConsultationPlan({
      leadName: "Bianca",
      legalArea: "Familia",
      conversationTurns: [
        { role: "user", content: "Caso: revisao de alimentos. Ela quer resolver alimentos e esta com medo de virar conflito." },
        { role: "assistant", content: "Vou entender antes de propor qualquer medida." },
        { role: "user", content: "Ja tentou acordo, mas o ex nao respondeu. Tem urgencia porque as despesas do filho vencem essa semana." },
      ],
    });

    expect(plan.knownSignals.map((signal) => signal.key)).toEqual(expect.arrayContaining([
      "motivation",
      "desired_outcome",
      "previous_attempts",
      "urgency",
    ]));
    expect(plan.nextDiscoveryQuestion).toContain("Quem mais participa");
    expect(plan.adaptiveInstructions).toEqual(expect.arrayContaining([
      expect.stringContaining("Priorizar o proximo sinal faltante"),
    ]));
  });
});
