import { describe, expect, it } from "vitest";
import { resolveProactiveEventPlaybook } from "./registry";

describe("proactive legal event registry", () => {
  it("nao prepara contrarrazoes quando o recurso foi ato do proprio polo representado", () => {
    const playbook = resolveProactiveEventPlaybook({
      domain: "lex",
      source: "escavador",
      eventType: "RECURSO",
      text: "Recurso de apelacao interposto pela parte autora.",
      metadata: {
        requer_acao: false,
        obrigacao_de_quem: "parte_contraria",
      },
    });

    expect(playbook).toBeNull();
  });

  it("prepara resposta recursal quando a movimentacao continua acionavel", () => {
    const playbook = resolveProactiveEventPlaybook({
      domain: "lex",
      source: "escavador",
      eventType: "RECURSO",
      text: "Recurso de apelacao interposto pela parte re.",
      metadata: {
        requer_acao: true,
        obrigacao_de_quem: "escritorio",
      },
    });

    expect(playbook).toEqual(expect.objectContaining({
      id: "lex.escavador.apelacao_interposta",
      recommendedPieceLabel: "Contrarrazoes de Apelacao",
      requiresHumanReview: true,
    }));
  });

  it("gera checklist artifact-only para prazo ou intimacao generica revisada", () => {
    const playbook = resolveProactiveEventPlaybook({
      domain: "lex",
      source: "escavador",
      eventType: "PRAZO",
      text: "Intimacao para manifestacao sobre documentos no prazo legal.",
      metadata: {
        requer_acao: true,
        obrigacao_de_quem: "escritorio",
      },
    });

    expect(playbook).toEqual(expect.objectContaining({
      id: "lex.escavador.prazo_manifestacao_generica",
      actionType: "artifact_only",
      artifactType: "lex_proactive_manifestation_checklist",
      recommendedPieceInput: null,
      recommendedPieceLabel: "Manifestacao",
      requiresHumanReview: true,
      blocksExternalActionUntilHumanOk: true,
    }));
  });
});
