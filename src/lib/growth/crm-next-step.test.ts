import { describe, expect, it } from "vitest";

import { buildCrmLeadNextStepStatus } from "./crm-next-step";

const now = new Date("2026-04-28T12:00:00.000Z");

describe("buildCrmLeadNextStepStatus", () => {
  it("marca lead aberto sem proximo passo", () => {
    const status = buildCrmLeadNextStepStatus({
      title: "Maria - Previdenciario",
      description: "Cliente quer entender aposentadoria rural.",
      stageName: "Novo Lead",
      createdAt: "2026-04-28T10:00:00.000Z",
      now,
    });

    expect(status.needsNextStep).toBe(true);
    expect(status.reason).toBe("Sem proximo passo claro registrado.");
    expect(status.organizedPlan.channel).toBe("internal_review");
    expect(status.organizedPlan.ownerLabel).toBe("responsavel comercial");
    expect(status.organizedPlan.dueAt).toBe("2026-04-29T12:00:00.000Z");
    expect(status.organizedPlan.checklist).toContain("Pedir CNIS/carta do INSS, se ainda nao estiverem no dossie.");
  });

  it("aceita proximo passo registrado na descricao", () => {
    const status = buildCrmLeadNextStepStatus({
      title: "Joao - Trabalhista",
      description: "Proximo passo: ligar amanha com lista de documentos.",
      stageName: "Em negociacao",
      createdAt: "2026-04-28T10:00:00.000Z",
      now,
    });

    expect(status.needsNextStep).toBe(false);
    expect(status.hasNextStepSignal).toBe(true);
    expect(status.organizedPlan.label).toBe("Proximo passo registrado");
  });

  it("mantem alerta quando o proximo passo ficou parado", () => {
    const status = buildCrmLeadNextStepStatus({
      title: "Ana - Familia",
      description: "Follow-up por WhatsApp depois do envio da proposta.",
      stageName: "Qualificacao",
      lastMovedAt: "2026-04-24T10:00:00.000Z",
      now,
    });

    expect(status.needsNextStep).toBe(true);
    expect(status.isStale).toBe(true);
    expect(status.staleDays).toBe(4);
    expect(status.organizedPlan.channel).toBe("whatsapp");
    expect(status.organizedPlan.dueAt).toBe("2026-04-28T19:00:00.000Z");
    expect(status.suggestedNextStep).toContain("confirmar se o follow-up ainda vale");
  });

  it("ignora oportunidades encerradas", () => {
    const status = buildCrmLeadNextStepStatus({
      title: "Lead perdido",
      description: "Sem retorno.",
      stageName: "Perdido",
      isLoss: true,
      createdAt: "2026-04-20T10:00:00.000Z",
      now,
    });

    expect(status.needsNextStep).toBe(false);
    expect(status.reason).toBe("Oportunidade encerrada.");
    expect(status.organizedPlan.requiresHumanApproval).toBe(false);
  });

  it("usa responsavel e telefone para organizar o proximo passo", () => {
    const status = buildCrmLeadNextStepStatus({
      title: "Carlos",
      description: "Quer saber sobre verbas rescisorias.",
      legalArea: "Trabalhista",
      phone: "21999990000",
      assignedName: "Dutra",
      createdAt: "2026-04-28T10:00:00.000Z",
      now,
    });

    expect(status.needsNextStep).toBe(true);
    expect(status.organizedPlan.channel).toBe("whatsapp");
    expect(status.organizedPlan.ownerLabel).toBe("Dutra");
    expect(status.organizedPlan.objective).toContain("qualificar Carlos em Trabalhista");
    expect(status.organizedPlan.checklist).toContain("Pedir CTPS, holerites e termo de rescisao.");
  });
});
