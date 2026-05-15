import { beforeEach, describe, expect, it, vi } from "vitest";

const { supabaseFromMock } = vi.hoisted(() => ({
  supabaseFromMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: supabaseFromMock,
  },
}));

import {
  buildSupportCaseStatusContract,
  buildSupportCaseStatusReply,
  resolveLegalProcessTask,
  type LegalCaseContextSnapshot,
} from "./case-context";

function makeProcessRow(overrides?: Record<string, unknown>) {
  return {
    id: "process-task-1",
    pipeline_id: "pipeline-1",
    stage_id: "stage-1",
    title: "Caso Previdenciario Maria",
    client_name: "Maria da Silva",
    process_number: "1234567-89.2024.8.26.0100",
    demanda: "Previdenciario",
    description: "Caso com pedido de beneficio por incapacidade.",
    created_at: "2026-04-22T00:00:00.000Z",
    ...overrides,
  };
}

function makeReferenceQuery(rows: Array<Record<string, unknown>>) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({ data: rows, error: null })),
  };

  return query;
}

function makeMaybeSingleQuery(row: Record<string, unknown> | null) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    ilike: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: row, error: null })),
  };

  return query;
}

function makeSnapshot(overrides?: Partial<LegalCaseContextSnapshot>): LegalCaseContextSnapshot {
  return {
    processTask: {
      id: "process-task-1",
      title: "Caso Previdenciario",
      clientName: "Maria da Silva",
      processNumber: "1234567-89.2024.8.26.0100",
      legalArea: "Previdenciario",
      description: "Caso com pedido de beneficio por incapacidade.",
      pipelineName: "Pipeline Juridico",
      stageName: "Contestacao",
      createdAt: "2026-04-22T00:00:00.000Z",
    },
    caseBrain: {
      taskId: "case-brain-1",
      caseId: "case-1",
      summaryMaster: "O caso segue em contestacao com contexto juridico consolidado.",
      currentPhase: "Contestacao",
      queriesCount: 2,
      keyFactsCount: 3,
      recommendedPieceInput: null,
      recommendedPieceLabel: null,
      firstActions: ["Aguardar a documentacao complementar do cliente."],
      missingDocuments: ["Comprovante de residencia"],
      validatedInternalSourcesCount: 1,
      validatedLawReferencesCount: 1,
      validatedCaseLawReferencesCount: 0,
      externalValidationGapCount: 0,
      pendingValidationCount: 0,
      readyForFactCitations: true,
      readyForLawCitations: true,
      readyForCaseLawCitations: false,
    },
    documentMemory: {
      documentCount: 4,
      syncStatus: "synced",
      lastSyncedAt: "2026-04-22T00:00:00.000Z",
      summaryMaster: "Documentos do caso sincronizados.",
      currentPhase: "Contestacao",
      missingDocuments: ["Comprovante de residencia"],
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
      recommendedPieceInput: null,
      recommendedPieceLabel: null,
      practiceArea: null,
      requiresHumanReview: true,
      warningCount: 0,
    },
    ...overrides,
  };
}

describe("resolveLegalProcessTask", () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
  });

  it("resolve referencia textual quando existe apenas um processo compativel", async () => {
    supabaseFromMock.mockReturnValue(makeReferenceQuery([makeProcessRow()]));

    const result = await resolveLegalProcessTask({
      tenantId: "tenant-1",
      entities: { client_name: "Maria da Silva" },
    });

    expect(result.id).toBe("process-task-1");
    expect(supabaseFromMock).toHaveBeenCalledWith("process_tasks");
  });

  it("resolve ID interno valido por process_task_id", async () => {
    const byIdQuery = makeMaybeSingleQuery(makeProcessRow({ id: "11111111-1111-4111-8111-111111111111" }));
    supabaseFromMock.mockReturnValue(byIdQuery);

    const result = await resolveLegalProcessTask({
      tenantId: "tenant-1",
      entities: { process_task_id: "11111111-1111-4111-8111-111111111111" },
    });

    expect(result.id).toBe("11111111-1111-4111-8111-111111111111");
    expect(byIdQuery.eq).toHaveBeenCalledWith("id", "11111111-1111-4111-8111-111111111111");
  });

  it("trata process_task_id nao-UUID como numero ou referencia operacional", async () => {
    const byNumberQuery = makeMaybeSingleQuery(makeProcessRow({
      id: "process-task-e2e",
      process_number: "E2E-2026-0001",
    }));
    supabaseFromMock.mockReturnValue(byNumberQuery);

    const result = await resolveLegalProcessTask({
      tenantId: "tenant-1",
      entities: { process_task_id: "E2E-2026-0001" },
    });

    expect(result.id).toBe("process-task-e2e");
    expect(byNumberQuery.eq).not.toHaveBeenCalledWith("id", "E2E-2026-0001");
    expect(byNumberQuery.eq).toHaveBeenCalledWith("process_number", "E2E-2026-0001");
  });

  it("bloqueia referencia textual ambigua sem escolher o processo mais recente", async () => {
    supabaseFromMock.mockReturnValue(makeReferenceQuery([
      makeProcessRow({ id: "process-task-1", process_number: "1111111-11.2024.8.26.0100" }),
      makeProcessRow({ id: "process-task-2", process_number: "2222222-22.2024.8.26.0100" }),
    ]));

    await expect(resolveLegalProcessTask({
      tenantId: "tenant-1",
      entities: { client_name: "Maria da Silva" },
    })).rejects.toThrow("mais de um processo juridico");
  });
});

describe("support_case_status contract", () => {
  it("responde quando ha base minima segura do caso", () => {
    const contract = buildSupportCaseStatusContract(makeSnapshot());

    expect(contract.responseMode).toBe("answer");
    expect(contract.confidence).toBe("high");
    expect(contract.progressSummary).toBe("O caso segue em contestacao com contexto juridico consolidado.");
    expect(contract.currentPhase).toBe("Contestacao");
    expect(contract.nextStep).toBe("Aguardar a documentacao complementar do cliente.");
    expect(contract.pendingItems).toEqual(["Comprovante de residencia"]);
    expect(contract.grounding.factualSources).toEqual(expect.arrayContaining([
      "resumo do Case Brain",
      "fase do Case Brain",
      "lacunas documentais registradas",
    ]));
    expect(contract.grounding.inferenceNotes).toEqual([]);

    const reply = buildSupportCaseStatusReply(contract);
    expect(reply).toContain("## Status do caso");
    expect(reply).toContain("Andamento: O caso segue em contestacao");
    expect(reply).toContain("Fase atual: Contestacao");
    expect(reply).toContain("Pendencias: Comprovante de residencia");
    expect(reply).toContain("Base confirmada:");
    expect(reply).toContain("Inferencias: sem inferencias relevantes");
  });

  it("distingue inferencia de proximo passo quando so ha pendencia documental", () => {
    const contract = buildSupportCaseStatusContract(makeSnapshot({
      caseBrain: {
        ...makeSnapshot().caseBrain,
        firstActions: [],
      },
    }));

    expect(contract.responseMode).toBe("answer");
    expect(contract.nextStep).toContain("Confirmar e organizar a pendencia documental");
    expect(contract.grounding.inferenceNotes).toContain("proximo passo inferido a partir da primeira pendencia documental");

    const reply = buildSupportCaseStatusReply(contract);
    expect(reply).toContain("Inferencias: proximo passo inferido");
  });

  it("usa andamento operacional na confianca quando nao ha resumo do brain", () => {
    const contract = buildSupportCaseStatusContract(makeSnapshot({
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
        summaryMaster: null,
        currentPhase: null,
        missingDocuments: [],
        freshness: "missing",
      },
    }));

    expect(contract.responseMode).toBe("answer");
    expect(contract.confidence).toBe("high");
    expect(contract.progressSummary).toBe("Caso com pedido de beneficio por incapacidade.");
    expect(contract.currentPhase).toBe("Contestacao");
    expect(contract.grounding.inferenceNotes).toContain("andamento resumido a partir da descricao operacional do processo");
  });

  it("identifica memoria documental desatualizada sem chamar de sincronizada", () => {
    const contract = buildSupportCaseStatusContract(makeSnapshot({
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
        freshness: "stale",
      },
    }));

    expect(contract.grounding.factualSources).toContain("memoria documental desatualizada");
    expect(contract.grounding.factualSources).toContain("fase de memoria documental desatualizada");
    expect(contract.grounding.factualSources).not.toContain("memoria documental sincronizada");
  });

  it("escala para handoff humano quando o caso nao esta suficientemente aterrado", () => {
    const contract = buildSupportCaseStatusContract(makeSnapshot({
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
        summaryMaster: null,
        currentPhase: null,
        missingDocuments: [],
        freshness: "missing",
      },
    }));

    expect(contract.responseMode).toBe("handoff");
    expect(contract.confidence).toBe("low");
    expect(contract.handoffReason).toBe("insufficient_case_grounding");
    expect(contract.grounding.missingSignals).toEqual(expect.arrayContaining([
      "andamento consolidado",
      "fase atual",
      "proximo passo",
    ]));

    const reply = buildSupportCaseStatusReply(contract);
    expect(reply).toContain("handoff humano recomendado");
    expect(reply).toContain("Sinais faltantes:");
  });
});
