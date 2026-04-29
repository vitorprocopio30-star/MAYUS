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
  });
});
