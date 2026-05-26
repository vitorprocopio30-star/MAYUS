import { beforeAll, describe, expect, it } from "vitest";

let classifyProactiveLegalDraftTrigger: typeof import("./proactive-movement-draft").classifyProactiveLegalDraftTrigger;

describe("classifyProactiveLegalDraftTrigger", () => {
  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "service-role-key";
    ({ classifyProactiveLegalDraftTrigger } = await import("./proactive-movement-draft"));
  });

  it("detecta contestacao protocolada e sugere replica", () => {
    const trigger = classifyProactiveLegalDraftTrigger({
      eventType: "CONTESTACAO",
      movementText: "Juntada de contestacao protocolada pela parte requerida.",
      deadlineDescription: "Prazo para replica.",
    });

    expect(trigger).toMatchObject({
      id: "lex.escavador.contestacao_protocolada",
      actionType: "draft_factory",
      recommendedPieceInput: "Replica",
      recommendedPieceLabel: "Replica a contestacao",
      requiresHumanReview: true,
      blocksExternalActionUntilHumanOk: true,
    });
  });

  it("usa descricao do prazo quando a movimentacao vem resumida", () => {
    const trigger = classifyProactiveLegalDraftTrigger({
      eventType: "CONTESTACAO",
      movementText: "Movimentacao recebida.",
      deadlineDescription: "Manifestacao/replica a contestacao.",
    });

    expect(trigger?.recommendedPieceInput).toBe("Replica");
  });

  it("detecta sentenca e sugere analise recursal/apelacao", () => {
    const trigger = classifyProactiveLegalDraftTrigger({
      eventType: "SENTENCA",
      movementText: "Sentenca publicada. Julgou parcialmente procedente o pedido.",
      deadlineDescription: "Prazo recursal.",
    });

    expect(trigger).toMatchObject({
      id: "lex.escavador.sentenca_publicada",
      actionType: "draft_factory",
      recommendedPieceInput: "Apelacao",
      riskLevel: "critical",
    });
  });

  it("detecta citacao e sugere contestacao", () => {
    const trigger = classifyProactiveLegalDraftTrigger({
      eventType: "CITACAO",
      movementText: "Mandado de citacao juntado aos autos.",
      deadlineDescription: "Prazo para resposta.",
    });

    expect(trigger).toMatchObject({
      id: "lex.escavador.citacao_recebida",
      recommendedPieceInput: "Contestacao",
      riskLevel: "critical",
    });
  });

  it("detecta audiencia como artifact/checklist sem minuta formal", () => {
    const trigger = classifyProactiveLegalDraftTrigger({
      eventType: "AUDIENCIA",
      movementText: "Designada audiencia de conciliacao.",
      deadlineDescription: "Audiencia futura.",
    });

    expect(trigger).toMatchObject({
      id: "lex.escavador.audiencia_designada",
      actionType: "artifact_only",
      artifactType: "lex_proactive_hearing_checklist",
      recommendedPieceLabel: "Roteiro de audiencia",
    });
  });

  it("detecta prazo generico revisado como checklist sem Draft Factory automatica", () => {
    const trigger = classifyProactiveLegalDraftTrigger({
      eventType: "PRAZO",
      movementText: "Intimacao para manifestacao sobre documentos no prazo legal.",
      deadlineDescription: "Manifestar-se sobre documentos.",
      metadata: {
        requer_acao: true,
        obrigacao_de_quem: "escritorio",
      },
    });

    expect(trigger).toMatchObject({
      id: "lex.escavador.prazo_manifestacao_generica",
      actionType: "artifact_only",
      artifactType: "lex_proactive_manifestation_checklist",
      recommendedPieceInput: null,
      recommendedPieceLabel: "Manifestacao",
      requiresHumanReview: true,
    });
  });

  it("ignora eventos sem playbook correspondente", () => {
    const trigger = classifyProactiveLegalDraftTrigger({
      eventType: "DESPACHO",
      movementText: "Conclusos para despacho de mero expediente.",
      deadlineDescription: "Despacho generico.",
    });

    expect(trigger).toBeNull();
  });

  it("ignora recurso do proprio polo representado recebido por chamada direta do Draft Factory", () => {
    const trigger = classifyProactiveLegalDraftTrigger({
      eventType: "RECURSO",
      movementText: "Recurso de apelacao interposto pela parte autora.",
      deadlineDescription: "Prazo para contrarrazoes.",
      metadata: {
        requer_acao: false,
        obrigacao_de_quem: "parte_contraria",
      },
    });

    expect(trigger).toBeNull();
  });
});
