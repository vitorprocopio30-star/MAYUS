import { describe, expect, it } from "vitest";
import type { LegalCaseContextSnapshot } from "./case-context";
import { buildCaseBrainInsights, buildCaseBrainInsightsReply } from "./case-brain-insights";

function makeSnapshot(overrides?: Partial<LegalCaseContextSnapshot>): LegalCaseContextSnapshot {
  return {
    processTask: {
      id: "process-task-1",
      title: "Maria x Banco",
      clientName: "Maria da Silva",
      processNumber: "1234567-89.2024.8.26.0100",
      legalArea: "Bancario",
      description: "Cliente contesta desconto bancario em beneficio.",
      pipelineName: "Controle Juridico",
      stageName: "Replica",
      createdAt: "2026-05-01T00:00:00.000Z",
    },
    caseBrain: {
      taskId: "case-brain-2",
      caseId: "case-1",
      summaryMaster: "Banco apresentou contestacao e a replica deve enfrentar contrato e descontos.",
      currentPhase: "Replica",
      queriesCount: 3,
      keyFactsCount: 4,
      recommendedPieceInput: "Replica",
      recommendedPieceLabel: "Replica a contestacao",
      firstActions: ["Preparar replica com quadro de descontos e impugnacao especifica."],
      missingDocuments: [],
      validatedInternalSourcesCount: 2,
      validatedLawReferencesCount: 1,
      validatedCaseLawReferencesCount: 1,
      externalValidationGapCount: 0,
      pendingValidationCount: 0,
      readyForFactCitations: true,
      readyForLawCitations: true,
      readyForCaseLawCitations: true,
    },
    documentMemory: {
      documentCount: 5,
      syncStatus: "synced",
      lastSyncedAt: "2026-05-08T00:00:00.000Z",
      summaryMaster: "Acervo com inicial, contestacao, contrato e contracheques.",
      currentPhase: "Replica",
      missingDocuments: [],
      freshness: "fresh",
    },
    firstDraft: {
      status: "completed",
      isStale: false,
      artifactId: "draft-artifact-1",
      taskId: "draft-task-1",
      caseBrainTaskId: "case-brain-2",
      summary: "Minuta de replica criada.",
      error: null,
      generatedAt: "2026-05-09T00:00:00.000Z",
      pieceType: "replica",
      pieceLabel: "Replica a contestacao",
      recommendedPieceInput: "Replica",
      recommendedPieceLabel: "Replica a contestacao",
      practiceArea: "Bancario",
      requiresHumanReview: true,
      warningCount: 0,
    },
    ...overrides,
  };
}

describe("buildCaseBrainInsights", () => {
  it("gera cronologia e mapa de fatos sem riscos quando a base esta coerente", () => {
    const insights = buildCaseBrainInsights(makeSnapshot());

    expect(insights.processTaskId).toBe("process-task-1");
    expect(insights.timeline.length).toBeGreaterThanOrEqual(3);
    expect(insights.risks).toHaveLength(0);
    expect(insights.contradictions).toHaveLength(0);
    expect(insights.factMap.documentedFacts).toEqual(expect.arrayContaining([
      expect.stringContaining("Resumo do Case Brain"),
      expect.stringContaining("Resumo documental"),
    ]));
    expect(insights.likelyNextActs[0]).toContain("Preparar replica");
    expect(insights.confidence).toBe("high");
  });

  it("aponta riscos altos e contradicoes quando minuta e documentos estao defasados", () => {
    const insights = buildCaseBrainInsights(makeSnapshot({
      processTask: {
        ...makeSnapshot().processTask,
        stageName: "Inicial",
      },
      documentMemory: {
        ...makeSnapshot().documentMemory,
        freshness: "stale",
        currentPhase: "Contestacao",
        missingDocuments: ["contracheque atualizado"],
      },
      firstDraft: {
        ...makeSnapshot().firstDraft,
        isStale: true,
        caseBrainTaskId: "case-brain-antigo",
      },
    }));

    expect(insights.risks).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Memoria documental nao esta fresca" }),
      expect.objectContaining({ title: "Pendencias documentais relevantes", severity: "high" }),
      expect.objectContaining({ title: "Minuta possivelmente defasada", severity: "high" }),
    ]));
    expect(insights.contradictions).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Etapa operacional diverge da fase juridica" }),
      expect.objectContaining({ title: "Minuta foi gerada com Case Brain anterior", severity: "high" }),
    ]));
    expect(insights.recommendedAction).toContain("contradicao critica");
    expect(insights.confidence).toBe("medium");
  });

  it("enriquece cronologia e riscos com documentos e movimentacoes reais", () => {
    const insights = buildCaseBrainInsights(makeSnapshot(), {
      documents: [
        {
          id: "doc-1",
          name: "contestacao.pdf",
          documentType: "contestacao",
          folderLabel: "03-Contestacao",
          modifiedAt: "2026-05-07T00:00:00.000Z",
          extractionStatus: "extracted",
          excerpt: "Banco afirma regularidade da contratacao e junta instrumento contratual.",
        },
        {
          id: "doc-2",
          name: "audio-cliente.mp3",
          documentType: null,
          folderLabel: "Raiz do Processo",
          modifiedAt: "2026-05-06T00:00:00.000Z",
          extractionStatus: "skipped",
          excerpt: null,
        },
      ],
      movements: [
        {
          date: "2026-05-10",
          content: "Intimada a parte autora para manifestacao sobre contestacao no prazo legal.",
          source: "diario_oficial",
          eventType: "contestacao_protocolada",
          requiresAction: true,
          suggestedAction: "Preparar replica e conferir prazo fatal.",
          confidence: "high",
        },
      ],
    });

    expect(insights.evidence).toEqual({
      documentCount: 2,
      extractedDocumentCount: 1,
      movementCount: 1,
    });
    expect(insights.timeline).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "process_documents", label: expect.stringContaining("contestacao.pdf") }),
      expect.objectContaining({ source: "diario_oficial", label: expect.stringContaining("Movimentacao processual") }),
    ]));
    expect(insights.risks).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Documentos ainda nao extraidos" }),
      expect.objectContaining({ title: "Movimentacao recente exige acao", severity: "high" }),
    ]));
    expect(insights.contradictions).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Documento fora da estrutura documental esperada" }),
    ]));
    expect(insights.likelyNextActs[0]).toBe("Preparar replica e conferir prazo fatal.");
  });

  it("monta resposta em markdown com guardrail juridico", () => {
    const reply = buildCaseBrainInsightsReply(buildCaseBrainInsights(makeSnapshot()));

    expect(reply).toContain("## Case Brain 2.0");
    expect(reply).toContain("### Cronologia estruturada");
    expect(reply).toContain("### Riscos");
    expect(reply).toContain("Guardrail: este diagnostico nao executa protocolo");
  });
});
