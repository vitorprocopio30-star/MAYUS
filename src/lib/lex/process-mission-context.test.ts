import { describe, expect, it } from "vitest";
import type { LegalCaseContextSnapshot } from "./case-context";
import { buildProcessMissionContext } from "./process-mission-context";

function makeSnapshot(overrides?: Partial<LegalCaseContextSnapshot>): LegalCaseContextSnapshot {
  return {
    processTask: {
      id: "process-task-1",
      title: "Maria x Banco",
      clientName: "Maria da Silva",
      processNumber: "1234567-89.2024.8.26.0100",
      legalArea: "Bancario",
      description: "Caso com desconto contestado e documentos iniciais recebidos.",
      pipelineName: "Controle Juridico",
      stageName: "Replica",
      createdAt: "2026-05-01T00:00:00.000Z",
    },
    caseBrain: {
      taskId: "case-brain-1",
      caseId: "case-1",
      summaryMaster: "Banco apresentou contestacao e a equipe deve preparar replica.",
      currentPhase: "Replica",
      queriesCount: 2,
      keyFactsCount: 3,
      recommendedPieceInput: "Replica",
      recommendedPieceLabel: "Replica a contestacao",
      firstActions: ["Preparar replica com base na contestacao e documentos do cliente."],
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
      summaryMaster: "Acervo com inicial, contestacao e documentos do cliente.",
      currentPhase: "Replica",
      missingDocuments: [],
      freshness: "fresh",
    },
    firstDraft: {
      status: "idle",
      isStale: false,
      artifactId: null,
      taskId: null,
      caseBrainTaskId: null,
      summary: null,
      error: null,
      generatedAt: null,
      pieceType: null,
      pieceLabel: null,
      recommendedPieceInput: "Replica",
      recommendedPieceLabel: "Replica a contestacao",
      practiceArea: "Bancario",
      requiresHumanReview: true,
      warningCount: 0,
    },
    ...overrides,
  };
}

describe("buildProcessMissionContext", () => {
  it("monta contexto canonico com proxima acao de minuta quando acervo esta fresco", () => {
    const context = buildProcessMissionContext(makeSnapshot());

    expect(context.process.processTaskId).toBe("process-task-1");
    expect(context.status.currentPhase).toBe("Replica");
    expect(context.status.progressSummary).toBe("Banco apresentou contestacao e a equipe deve preparar replica.");
    expect(context.status.nextStep).toBe("Preparar replica com base na contestacao e documentos do cliente.");
    expect(context.documents.freshness).toBe("fresh");
    expect(context.draft.recommendedPiece).toBe("Replica a contestacao");
    expect(context.confidence).toBe("high");
    expect(context.recommendedAction).toBe("generate_first_draft");
    expect(context.grounding.factualSources).toEqual(expect.arrayContaining([
      "case_brain",
      "fresh_document_memory",
      "case_brain_first_actions",
    ]));
  });

  it("prioriza refresh documental quando memoria esta ausente ou desatualizada", () => {
    const context = buildProcessMissionContext(makeSnapshot({
      documentMemory: {
        ...makeSnapshot().documentMemory,
        freshness: "stale",
        lastSyncedAt: "2026-04-01T00:00:00.000Z",
      },
    }));

    expect(context.confidence).toBe("high");
    expect(context.recommendedAction).toBe("refresh_document_memory");
    expect(context.grounding.inferenceNotes).toContain("document_memory_may_be_stale");
    expect(context.missionGoal).toContain("Atualizar memoria documental");
  });

  it("escala para revisao humana quando falta base minima", () => {
    const context = buildProcessMissionContext(makeSnapshot({
      processTask: {
        ...makeSnapshot().processTask,
        description: null,
        stageName: null,
      },
      caseBrain: {
        ...makeSnapshot().caseBrain,
        taskId: null,
        summaryMaster: null,
        currentPhase: null,
        firstActions: [],
        missingDocuments: [],
      },
      documentMemory: {
        ...makeSnapshot().documentMemory,
        documentCount: 0,
        syncStatus: null,
        lastSyncedAt: null,
        summaryMaster: null,
        currentPhase: null,
        missingDocuments: [],
        freshness: "missing",
      },
      firstDraft: {
        ...makeSnapshot().firstDraft,
        recommendedPieceInput: null,
        recommendedPieceLabel: null,
      },
    }));

    expect(context.confidence).toBe("low");
    expect(context.recommendedAction).toBe("human_review");
    expect(context.grounding.missingSignals).toEqual(expect.arrayContaining([
      "progress_summary",
      "current_phase",
      "document_memory",
      "case_brain_task",
    ]));
  });
});
