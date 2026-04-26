import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  fromMock,
  insertMock,
  createBrainArtifactMock,
  getLegalCaseContextSnapshotMock,
  buildLegalCaseContextReplyMock,
  buildSupportCaseStatusContractMock,
  buildSupportCaseStatusReplyMock,
  executeDraftFactoryForProcessTaskMock,
  listProcessDraftVersionsMock,
  updateProcessDraftVersionWorkflowMock,
  getTenantGoogleDriveContextMock,
  syncProcessDocumentsMock,
  publishLegalPiecePremiumMock,
} = vi.hoisted(() => ({
  ...(() => {
    const localFromMock = vi.fn();
    return {
      fromMock: localFromMock,
      insertMock: vi.fn(),
      createClientMock: vi.fn(() => ({ from: localFromMock })),
      createBrainArtifactMock: vi.fn(),
      getLegalCaseContextSnapshotMock: vi.fn(),
      buildLegalCaseContextReplyMock: vi.fn(),
      buildSupportCaseStatusContractMock: vi.fn(),
      buildSupportCaseStatusReplyMock: vi.fn(),
      executeDraftFactoryForProcessTaskMock: vi.fn(),
      listProcessDraftVersionsMock: vi.fn(),
      updateProcessDraftVersionWorkflowMock: vi.fn(),
      getTenantGoogleDriveContextMock: vi.fn(),
      syncProcessDocumentsMock: vi.fn(),
      publishLegalPiecePremiumMock: vi.fn(),
    };
  })(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/brain/artifacts", () => ({
  createBrainArtifact: createBrainArtifactMock,
}));

vi.mock("@/lib/lex/case-context", () => ({
  getLegalCaseContextSnapshot: getLegalCaseContextSnapshotMock,
  buildLegalCaseContextReply: buildLegalCaseContextReplyMock,
  buildSupportCaseStatusContract: buildSupportCaseStatusContractMock,
  buildSupportCaseStatusReply: buildSupportCaseStatusReplyMock,
}));

vi.mock("@/lib/lex/draft-factory", () => ({
  executeDraftFactoryForProcessTask: executeDraftFactoryForProcessTaskMock,
}));

vi.mock("@/lib/lex/draft-versions", () => ({
  listProcessDraftVersions: listProcessDraftVersionsMock,
  updateProcessDraftVersionWorkflow: updateProcessDraftVersionWorkflowMock,
}));

vi.mock("@/lib/services/google-drive-tenant", () => ({
  buildTenantGoogleDriveServiceRequest: vi.fn(() => new Request("https://mayus-premium-pro.vercel.app/api/integrations/google-drive/callback")),
  getTenantGoogleDriveContext: getTenantGoogleDriveContextMock,
}));

vi.mock("@/lib/services/process-documents", () => ({
  syncProcessDocuments: syncProcessDocumentsMock,
}));

vi.mock("@/lib/juridico/publish-piece-premium", () => ({
  publishLegalPiecePremium: publishLegalPiecePremiumMock,
}));

vi.mock("@/lib/services/zapsign", () => ({
  ZapSignService: {},
}));

vi.mock("@/lib/services/escavador", () => ({
  EscavadorService: {},
}));

vi.mock("@/lib/agent/skills/asaas-cobrar", () => ({
  executarCobranca: vi.fn(),
}));

vi.mock("@/lib/agent/skills/calculadora", () => ({
  executarCalculo: vi.fn(),
}));

vi.mock("@/lib/agent/capabilities/proposals", () => ({
  generateProposalAndProjectToCrm: vi.fn(),
}));

vi.mock("@/lib/skills/consulta-processo-whatsapp", () => ({
  formatarContextoParaIA: vi.fn(),
  getContextoProcesso: vi.fn(),
}));

import { dispatchCapabilityExecution } from "./dispatcher";

function makeSnapshot(overrides?: Record<string, any>) {
  return {
    processTask: {
      id: "process-task-1",
      title: "E2E HISTORICO FORMAL MAYUS",
      clientName: "Cliente Playwright E2E",
      processNumber: "E2E-2026-0001",
      legalArea: "Previdenciário",
      description: "Caso previdenciário com Case Brain ativo.",
      pipelineName: "Pipeline Jurídico",
      stageName: "Contestação",
      createdAt: "2026-04-20T21:00:00.000Z",
    },
    caseBrain: {
      taskId: "case-brain-1",
      caseId: "case-1",
      summaryMaster: "Contexto jurídico consolidado.",
      currentPhase: "Contestação",
      queriesCount: 3,
      keyFactsCount: 4,
      recommendedPieceInput: "Contestação",
      recommendedPieceLabel: "Contestação Previdenciária",
      firstActions: ["Revisar a minuta com base no acervo validado."],
      missingDocuments: [],
      validatedInternalSourcesCount: 1,
      validatedLawReferencesCount: 2,
      validatedCaseLawReferencesCount: 1,
      externalValidationGapCount: 0,
      pendingValidationCount: 0,
      readyForFactCitations: true,
      readyForLawCitations: true,
      readyForCaseLawCitations: true,
    },
    documentMemory: {
      documentCount: 1,
      syncStatus: "completed",
      lastSyncedAt: "2026-04-20T21:00:00.000Z",
      summaryMaster: "Memória documental sincronizada.",
      currentPhase: "Contestação",
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
      recommendedPieceInput: "Contestação",
      recommendedPieceLabel: "Contestação Previdenciária",
      practiceArea: "Previdenciário",
      requiresHumanReview: true,
      warningCount: 0,
    },
    ...overrides,
  };
}

function makeDraftVersion(overrides?: Record<string, any>) {
  return {
    id: "draft-version-1",
    tenant_id: "tenant-1",
    process_task_id: "process-task-1",
    source_artifact_id: "case-first-draft-1",
    source_task_id: "draft-factory-task-1",
    source_case_brain_task_id: "case-brain-1",
    parent_version_id: null,
    version_number: 2,
    workflow_status: "draft",
    is_current: true,
    piece_type: "contestacao",
    piece_label: "Contestação Previdenciária",
    practice_area: "Previdenciário",
    summary: "Versão corrente pronta para revisão formal.",
    draft_markdown: "# minuta",
    metadata: {},
    approved_by: null,
    approved_at: null,
    published_by: null,
    published_at: null,
    created_by: "user-1",
    created_at: "2026-04-20T21:00:00.000Z",
    updated_at: "2026-04-20T21:00:00.000Z",
    ...overrides,
  };
}

function makeTemplateQuery(rows: Array<Record<string, unknown>>) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(async () => ({ data: rows, error: null })),
  };

  return query;
}

function makeMaybeSingleQuery(result: { data: any; error: any }) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };

  return query;
}

describe("dispatchCapabilityExecution - juridico", () => {
  beforeEach(() => {
    insertMock.mockReset();
    fromMock.mockReset();
    createClientMock.mockReset();
    createBrainArtifactMock.mockReset();
    getLegalCaseContextSnapshotMock.mockReset();
    buildLegalCaseContextReplyMock.mockReset();
    buildSupportCaseStatusContractMock.mockReset();
    buildSupportCaseStatusReplyMock.mockReset();
    executeDraftFactoryForProcessTaskMock.mockReset();
    listProcessDraftVersionsMock.mockReset();
    updateProcessDraftVersionWorkflowMock.mockReset();
    getTenantGoogleDriveContextMock.mockReset();
    syncProcessDocumentsMock.mockReset();
    publishLegalPiecePremiumMock.mockReset();

    insertMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert: insertMock });
    createClientMock.mockReturnValue({ from: fromMock });
    createBrainArtifactMock.mockResolvedValue({ id: "artifact-chat-1" });
    listProcessDraftVersionsMock.mockResolvedValue([]);
    getTenantGoogleDriveContextMock.mockResolvedValue({
      integrationId: "drive-integration-1",
      refreshToken: "refresh-token-1",
      accessToken: "access-token-1",
      metadata: {},
    });
  });

  it("registra artifact de contexto juridico para a missao do MAYUS", async () => {
    const snapshot = makeSnapshot({
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "completed",
        artifactId: "draft-artifact-1",
        summary: "Primeira minuta pronta para revisão.",
        pieceLabel: "Contestação Previdenciária",
      },
    });
    getLegalCaseContextSnapshotMock.mockResolvedValue(snapshot);
    buildLegalCaseContextReplyMock.mockReturnValue("## Contexto juridico do processo");

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_case_context",
      capabilityName: "legal_case_context",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-1",
      brainContext: {
        taskId: "brain-task-1",
        runId: "brain-run-1",
        stepId: "brain-step-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toBe("## Contexto juridico do processo");
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-1",
      artifactType: "legal_case_context",
      sourceModule: "mayus",
      metadata: expect.objectContaining({
        process_task_id: "process-task-1",
        case_brain_task_id: "case-brain-1",
        first_draft_status: "completed",
        recommended_piece_label: "Contestação Previdenciária",
      }),
    }));
    expect(fromMock).toHaveBeenCalledWith("learning_events");
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "legal_case_context_resolved",
      task_id: "brain-task-1",
      payload: expect.objectContaining({
        process_task_id: "process-task-1",
        first_draft_status: "completed",
      }),
    }));
  });

  it("monta o contrato minimo de suporte para status do caso", async () => {
    const snapshot = makeSnapshot();
    getLegalCaseContextSnapshotMock.mockResolvedValue(snapshot);
    buildSupportCaseStatusContractMock.mockReturnValue({
      responseMode: "answer",
      confidence: "high",
      processTaskId: "process-task-1",
      processLabel: "E2E-2026-0001",
      clientLabel: "Cliente Playwright E2E",
      statusHeadline: "Contexto juridico consolidado. Fase atual: Contestação.",
      currentPhase: "Contestação",
      nextStep: "Revisar a minuta com base no acervo validado.",
      pendingItems: [],
      summary: "Contexto juridico consolidado.",
      handoffReason: null,
    });
    buildSupportCaseStatusReplyMock.mockReturnValue("## Status do caso");

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_support_case_status",
      capabilityName: "support_case_status",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-support-1",
      brainContext: {
        taskId: "brain-task-support-1",
        runId: "brain-run-support-1",
        stepId: "brain-step-support-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toBe("## Status do caso");
    expect(buildSupportCaseStatusContractMock).toHaveBeenCalledWith(snapshot);
    expect(result.outputPayload).toEqual(expect.objectContaining({
      process_task_id: "process-task-1",
      support_status_response_mode: "answer",
      support_status_confidence: "high",
      support_status_current_phase: "Contestação",
      support_status_next_step: "Revisar a minuta com base no acervo validado.",
      support_status_pending_count: 0,
      support_status_handoff_reason: null,
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-support-1",
      artifactType: "support_case_status",
      sourceModule: "mayus",
      metadata: expect.objectContaining({
        process_task_id: "process-task-1",
        process_number: "E2E-2026-0001",
        support_status_response_mode: "answer",
        support_status_confidence: "high",
        support_status_current_phase: "Contestação",
      }),
    }));
    expect(fromMock).toHaveBeenCalledWith("learning_events");
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "support_case_status_resolved",
      task_id: "brain-task-support-1",
      payload: expect.objectContaining({
        process_task_id: "process-task-1",
        response_mode: "answer",
        confidence: "high",
      }),
    }));
  });

  it("escala para handoff humano quando nao identifica o caso com seguranca", async () => {
    getLegalCaseContextSnapshotMock.mockRejectedValue(new Error("Nao consegui identificar qual processo juridico voce quer consultar."));

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_support_case_status",
      capabilityName: "support_case_status",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { client_name: "Cliente sem numero" },
      auditLogId: "audit-support-2",
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("handoff humano recomendado");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      support_status_response_mode: "handoff",
      support_status_confidence: "low",
      support_status_handoff_reason: "case_not_identified",
    }));
    expect(createBrainArtifactMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("escala para handoff humano especifico quando a referencia do caso e ambigua", async () => {
    getLegalCaseContextSnapshotMock.mockRejectedValue(new Error("Encontrei mais de um processo juridico para essa referencia. Informe o numero do processo ou o ID interno."));

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_support_case_status",
      capabilityName: "support_case_status",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { client_name: "Maria da Silva" },
      auditLogId: "audit-support-ambiguous",
      brainContext: {
        taskId: "brain-task-support-ambiguous",
        runId: "brain-run-support-ambiguous",
        stepId: "brain-step-support-ambiguous",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("handoff humano recomendado");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      support_status_response_mode: "handoff",
      support_status_confidence: "low",
      support_status_handoff_reason: "ambiguous_case_match",
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-support-ambiguous",
      artifactType: "support_case_status",
      metadata: expect.objectContaining({
        process_label: "Maria da Silva",
        support_status_handoff_reason: "ambiguous_case_match",
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "support_case_status_resolved",
      task_id: "brain-task-support-ambiguous",
      payload: expect.objectContaining({
        process_label: "Maria da Silva",
        handoff_reason: "ambiguous_case_match",
      }),
    }));
  });

  it("registra artifact do resultado da primeira minuta quando o MAYUS aciona a Draft Factory", async () => {
    const snapshotBefore = makeSnapshot({
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "failed",
        error: "Falha anterior da Draft Factory.",
      },
    });
    const snapshotAfter = makeSnapshot({
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "completed",
        artifactId: "case-first-draft-1",
        taskId: "draft-factory-task-1",
        caseBrainTaskId: "case-brain-1",
        summary: "Primeira minuta pronta para revisão humana.",
        pieceLabel: "Contestação Previdenciária",
      },
    });

    getLegalCaseContextSnapshotMock
      .mockResolvedValueOnce(snapshotBefore)
      .mockResolvedValueOnce(snapshotAfter);
    executeDraftFactoryForProcessTaskMock.mockResolvedValue({
      draftFactoryTaskId: "draft-factory-task-1",
      runId: "draft-run-1",
      stepId: "draft-step-1",
      artifactId: "case-first-draft-1",
      caseBrainTaskId: "case-brain-1",
      recommendedPieceInput: "Contestação",
      recommendedPieceLabel: "Contestação Previdenciária",
      result: {
        pieceType: "contestacao",
        pieceLabel: "Contestação Previdenciária",
        pieceFamily: "peca_juridica",
        pieceFamilyLabel: "Peça Jurídica",
        practiceArea: "Previdenciário",
        outline: ["Síntese", "Pedidos"],
        draftMarkdown: "# minuta",
        usedDocuments: [],
        missingDocuments: [],
        warnings: [],
        confidenceNote: "Retry concluído.",
        requiresHumanReview: true,
        model: "seeded-retry-v1",
        provider: "playwright-fixture",
        expansionApplied: false,
        qualityMetrics: {
          charCount: 1400,
          wordCount: 220,
          paragraphCount: 9,
          sectionCount: 4,
        },
      },
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_first_draft_generate",
      capabilityName: "legal_first_draft_generate",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-2",
      brainContext: {
        taskId: "brain-task-2",
        runId: "brain-run-2",
        stepId: "brain-step-2",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Retry concluido");
    expect(executeDraftFactoryForProcessTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      processTaskId: "process-task-1",
      trigger: "manual_draft_factory",
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-2",
      artifactType: "legal_first_draft_result",
      sourceModule: "mayus",
      metadata: expect.objectContaining({
        process_task_id: "process-task-1",
        result_status: "completed",
        draft_factory_task_id: "draft-factory-task-1",
        case_first_draft_artifact_id: "case-first-draft-1",
        recommended_piece_label: "Contestação Previdenciária",
        first_draft_status: "completed",
        first_draft_stale_before: false,
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "legal_first_draft_requested_via_chat",
      task_id: "brain-task-2",
      payload: expect.objectContaining({
        process_task_id: "process-task-1",
        draft_factory_task_id: "draft-factory-task-1",
        piece_label: "Contestação Previdenciária",
      }),
    }));
  });

  it("aprova a versao formal atual da minuta via MAYUS", async () => {
    const snapshotBefore = makeSnapshot({
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "completed",
        artifactId: "case-first-draft-1",
        taskId: "draft-factory-task-1",
        caseBrainTaskId: "case-brain-1",
        summary: "Primeira minuta pronta para revisão humana.",
        pieceLabel: "Contestação Previdenciária",
      },
    });
    const snapshotAfter = makeSnapshot({
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "completed",
        artifactId: "case-first-draft-1",
        taskId: "draft-factory-task-1",
        caseBrainTaskId: "case-brain-1",
        summary: "Versão aprovada formalmente e pronta para publicação.",
        pieceLabel: "Contestação Previdenciária",
      },
    });
    const draftVersion = makeDraftVersion();
    const approvedVersion = makeDraftVersion({
      workflow_status: "approved",
      approved_by: "user-1",
      approved_at: "2026-04-20T22:20:00.000Z",
    });

    getLegalCaseContextSnapshotMock
      .mockResolvedValueOnce(snapshotBefore)
      .mockResolvedValueOnce(snapshotAfter);
    listProcessDraftVersionsMock.mockResolvedValue([draftVersion]);
    updateProcessDraftVersionWorkflowMock.mockResolvedValue(approvedVersion);

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_draft_workflow",
      capabilityName: "legal_draft_workflow",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        process_number: "E2E-2026-0001",
        workflow_action: "aprovar",
        version_number: "2",
      },
      auditLogId: "audit-3",
      brainContext: {
        taskId: "brain-task-3",
        runId: "brain-run-3",
        stepId: "brain-step-3",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("foi aprovada com sucesso");
    expect(updateProcessDraftVersionWorkflowMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      processTaskId: "process-task-1",
      versionId: "draft-version-1",
      action: "approve",
      actorId: "user-1",
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-3",
      artifactType: "legal_draft_workflow_result",
      metadata: expect.objectContaining({
        process_task_id: "process-task-1",
        workflow_action_requested: "approve",
        draft_version_id: "draft-version-1",
        draft_workflow_status_after: "approved",
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "legal_draft_workflow_executed",
      task_id: "brain-task-3",
      payload: expect.objectContaining({
        process_task_id: "process-task-1",
        draft_version_id: "draft-version-1",
        workflow_status: "approved",
      }),
    }));
  });

  it("publica a versao draft da minuta aprovando antes quando necessario", async () => {
    const snapshotBefore = makeSnapshot({
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "completed",
        artifactId: "case-first-draft-1",
        taskId: "draft-factory-task-1",
        caseBrainTaskId: "case-brain-1",
        summary: "Primeira minuta pronta para revisão humana.",
        pieceLabel: "Contestação Previdenciária",
      },
    });
    const snapshotAfter = makeSnapshot({
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "completed",
        artifactId: "case-first-draft-1",
        taskId: "draft-factory-task-1",
        caseBrainTaskId: "case-brain-1",
        summary: "Versão publicada formalmente e pronta para exportação.",
        pieceLabel: "Contestação Previdenciária",
      },
    });
    const draftVersion = makeDraftVersion();
    const approvedVersion = makeDraftVersion({
      workflow_status: "approved",
      approved_by: "user-1",
      approved_at: "2026-04-20T22:25:00.000Z",
    });
    const publishedVersion = makeDraftVersion({
      workflow_status: "published",
      approved_by: "user-1",
      approved_at: "2026-04-20T22:25:00.000Z",
      published_by: "user-1",
      published_at: "2026-04-20T22:26:00.000Z",
    });

    getLegalCaseContextSnapshotMock
      .mockResolvedValueOnce(snapshotBefore)
      .mockResolvedValueOnce(snapshotAfter);
    listProcessDraftVersionsMock.mockResolvedValue([draftVersion]);
    updateProcessDraftVersionWorkflowMock
      .mockResolvedValueOnce(approvedVersion)
      .mockResolvedValueOnce(publishedVersion);

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_draft_workflow",
      capabilityName: "legal_draft_workflow",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        process_number: "E2E-2026-0001",
        workflow_action: "publique",
      },
      auditLogId: "audit-4",
      brainContext: {
        taskId: "brain-task-4",
        runId: "brain-run-4",
        stepId: "brain-step-4",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("foi aprovada e publicada com sucesso");
    expect(updateProcessDraftVersionWorkflowMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
      versionId: "draft-version-1",
      action: "approve",
    }));
    expect(updateProcessDraftVersionWorkflowMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
      versionId: "draft-version-1",
      action: "publish",
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-4",
      artifactType: "legal_draft_workflow_result",
      metadata: expect.objectContaining({
        workflow_action_requested: "publish",
        workflow_actions_executed: ["approve", "publish"],
        draft_workflow_status_after: "published",
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "legal_draft_workflow_executed",
      task_id: "brain-task-4",
      payload: expect.objectContaining({
        workflow_action_requested: "publish",
        workflow_actions_executed: ["approve", "publish"],
        workflow_status: "published",
      }),
    }));
  });

  it("prepara revisao juridica orientada da minuta atual", async () => {
    const snapshot = makeSnapshot({
      caseBrain: {
        ...makeSnapshot().caseBrain,
        readyForCaseLawCitations: false,
      },
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "completed",
        artifactId: "case-first-draft-1",
        taskId: "draft-factory-task-1",
        caseBrainTaskId: "case-brain-1",
        summary: "Primeira minuta pronta para revisão humana.",
        pieceLabel: "Contestação Previdenciária",
      },
    });
    const draftVersion = makeDraftVersion({
      metadata: {
        quality_metrics: {
          charCount: 4200,
          paragraphCount: 9,
          sectionCount: 3,
        },
        warnings: ["Fundamentação ainda superficial em um dos tópicos defensivos."],
      },
    });
    const templateQuery = makeTemplateQuery([
      {
        piece_type: "contestacao",
        template_name: "Contestacao Premium",
        structure_markdown: "I - SÍNTESE DA INICIAL\nII - PRELIMINARES\nIII - MÉRITO\nIV - IMPUGNAÇÃO ESPECÍFICA\nV - PEDIDOS",
        guidance_notes: "Responder ponto a ponto a inicial e reforçar a prova documental do cliente.",
      },
    ]);

    getLegalCaseContextSnapshotMock.mockResolvedValue(snapshot);
    listProcessDraftVersionsMock.mockResolvedValue([draftVersion]);
    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_legal_templates") return templateQuery;
      return { insert: insertMock };
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_draft_review_guidance",
      capabilityName: "legal_draft_review_guidance",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        process_number: "E2E-2026-0001",
        version_number: "2",
      },
      auditLogId: "audit-5",
      brainContext: {
        taskId: "brain-task-5",
        runId: "brain-run-5",
        stepId: "brain-step-5",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("## Revisão orientada da minuta");
    expect(result.reply).toContain("Fortalecer a minuta antes de aprovar formalmente.");
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-5",
      artifactType: "legal_draft_review",
      metadata: expect.objectContaining({
        process_task_id: "process-task-1",
        draft_version_id: "draft-version-1",
        review_verdict: "attention",
        recommended_action: "strengthen_before_approval",
        blocker_count: 0,
        caution_count: 5,
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "legal_draft_review_prepared",
      task_id: "brain-task-5",
      payload: expect.objectContaining({
        process_task_id: "process-task-1",
        draft_version_id: "draft-version-1",
        review_verdict: "attention",
        recommended_action: "strengthen_before_approval",
      }),
    }));
  });

  it("monta um loop supervisionado por secao para reforcar a minuta", async () => {
    const snapshot = makeSnapshot({
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "completed",
        artifactId: "case-first-draft-1",
        taskId: "draft-factory-task-1",
        caseBrainTaskId: "case-brain-1",
        summary: "Primeira minuta pronta para revisão humana.",
        pieceLabel: "Contestação Previdenciária",
      },
    });
    const draftVersion = makeDraftVersion({
      draft_markdown: [
        "# I - Síntese da Inicial",
        "A narrativa dos fatos está ligada ao contrato e aos anexos principais do cliente. ".repeat(18),
        "",
        "# II - Das Preliminares",
        "Preliminar ainda muito curta.",
        "",
        "# III - Do Mérito",
        "O mérito enfrenta os pedidos da inicial, mas ainda não articula os fundamentos legais e a jurisprudência validada. ".repeat(8),
        "",
        "# V - Dos Pedidos",
        "Requer a improcedência integral dos pedidos, com condenação da parte autora em custas e honorários. ".repeat(12),
      ].join("\n"),
      metadata: {
        quality_metrics: {
          charCount: 6100,
          paragraphCount: 12,
          sectionCount: 4,
        },
      },
    });
    const templateQuery = makeTemplateQuery([
      {
        piece_type: "contestacao",
        template_name: "Contestacao Premium",
        structure_markdown: "I - SINTESE DA INICIAL\nII - DAS PRELIMINARES, SE CABIVEIS\nIII - DO MERITO\nIV - DA IMPUGNACAO ESPECIFICA DOS FATOS\nV - DOS PEDIDOS E DA PROVA",
        guidance_notes: "Enfrentar a inicial ponto a ponto, com impugnação específica, prova e pedidos defensivos completos.",
      },
    ]);

    getLegalCaseContextSnapshotMock.mockResolvedValue(snapshot);
    listProcessDraftVersionsMock.mockResolvedValue([draftVersion]);
    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_legal_templates") return templateQuery;
      return { insert: insertMock };
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_draft_revision_loop",
      capabilityName: "legal_draft_revision_loop",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        process_number: "E2E-2026-0001",
        version_number: "2",
      },
      auditLogId: "audit-7",
      brainContext: {
        taskId: "brain-task-7",
        runId: "brain-run-7",
        stepId: "brain-step-7",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("## Loop supervisionado da minuta");
    expect(result.reply).toContain("Plano de reforco por secao");
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-7",
      artifactType: "legal_draft_revision_loop",
      metadata: expect.objectContaining({
        process_task_id: "process-task-1",
        draft_version_id: "draft-version-1",
        review_verdict: "attention",
        recommended_action: "apply_revision_plan",
        sections_analyzed: 4,
        weak_section_count: 3,
        missing_section_count: 1,
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "legal_draft_revision_loop_prepared",
      task_id: "brain-task-7",
      payload: expect.objectContaining({
        process_task_id: "process-task-1",
        draft_version_id: "draft-version-1",
        sections_analyzed: 4,
        weak_section_count: 3,
        missing_section_count: 1,
        recommended_action: "apply_revision_plan",
      }),
    }));
  });

  it("sincroniza a memoria documental do processo via MAYUS", async () => {
    const snapshotBefore = makeSnapshot({
      documentMemory: {
        ...makeSnapshot().documentMemory,
        syncStatus: "structured",
        lastSyncedAt: null,
        summaryMaster: "Memória documental ainda não sincronizada.",
      },
    });
    const snapshotAfter = makeSnapshot({
      documentMemory: {
        ...makeSnapshot().documentMemory,
        syncStatus: "synced",
        lastSyncedAt: "2026-04-20T22:40:00.000Z",
        summaryMaster: "Memória documental atualizada com a contestação e documentos essenciais do caso.",
        missingDocuments: ["03-Contestacao"],
        freshness: "fresh",
      },
    });
    const processTaskQuery = makeMaybeSingleQuery({
      data: {
        id: "process-task-1",
        tenant_id: "tenant-1",
        stage_id: "stage-1",
        title: "E2E HISTORICO FORMAL MAYUS",
        client_name: "Cliente Playwright E2E",
        process_number: "E2E-2026-0001",
        drive_link: "https://drive.google.com/drive/folders/e2e-historico-formal-mayus",
        drive_folder_id: "e2e-historico-formal-mayus",
      },
      error: null,
    });

    getLegalCaseContextSnapshotMock
      .mockResolvedValueOnce(snapshotBefore)
      .mockResolvedValueOnce(snapshotAfter);
    fromMock.mockImplementation((table: string) => {
      if (table === "process_tasks") return processTaskQuery;
      return { insert: insertMock };
    });
    syncProcessDocumentsMock.mockResolvedValue({
      memory: {},
      structure: {},
      documents: [
        {
          driveFileId: "doc-1",
          driveFolderId: "e2e-historico-formal-mayus",
          folderLabel: "02-Inicial",
          name: "inicial-e2e.pdf",
          mimeType: "application/pdf",
          sizeBytes: 1024,
          modifiedAt: "2026-04-20T22:39:00.000Z",
          webViewLink: "https://drive.google.com/file/d/inicial-e2e/view",
          documentType: "inicial",
          classificationStatus: "classified",
          extractionStatus: "extracted",
          excerpt: "Resumo da inicial",
        },
        {
          driveFileId: "doc-2",
          driveFolderId: "e2e-historico-formal-mayus",
          folderLabel: "01-Documentos do Cliente",
          name: "contrato-e2e.pdf",
          mimeType: "application/pdf",
          sizeBytes: 2048,
          modifiedAt: "2026-04-20T22:38:00.000Z",
          webViewLink: "https://drive.google.com/file/d/contrato-e2e/view",
          documentType: "documento_cliente",
          classificationStatus: "classified",
          extractionStatus: "extracted",
          excerpt: "Resumo do contrato",
        },
      ],
      warnings: [
        {
          stage: "extract",
          fileName: "audio-cliente.mp3",
          message: "Formato ainda nao suportado para extração automática.",
        },
      ],
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_document_memory_refresh",
      capabilityName: "legal_document_memory_refresh",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        process_number: "E2E-2026-0001",
      },
      auditLogId: "audit-6",
      brainContext: {
        taskId: "brain-task-6",
        runId: "brain-run-6",
        stepId: "brain-step-6",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("## Memoria documental atualizada");
    expect(result.reply).toContain("Documentos sincronizados: 2");
    expect(getTenantGoogleDriveContextMock).toHaveBeenCalledTimes(1);
    expect(syncProcessDocumentsMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      accessToken: "access-token-1",
      task: expect.objectContaining({
        id: "process-task-1",
        drive_folder_id: "e2e-historico-formal-mayus",
      }),
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-6",
      artifactType: "legal_document_memory_refresh",
      metadata: expect.objectContaining({
        process_task_id: "process-task-1",
        document_count: 2,
        sync_status: "synced",
        warning_count: 1,
        missing_documents: ["03-Contestacao"],
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "legal_document_memory_refreshed",
      task_id: "brain-task-6",
      payload: expect.objectContaining({
        process_task_id: "process-task-1",
        document_count: 2,
        sync_status: "synced",
        warning_count: 1,
      }),
    }));
  });

  it("publica o artifact premium final no Drive via MAYUS", async () => {
    const snapshot = makeSnapshot({
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "completed",
        artifactId: "case-first-draft-1",
        taskId: "draft-factory-task-1",
        caseBrainTaskId: "case-brain-1",
        summary: "Primeira minuta pronta para revisão humana.",
        pieceLabel: "Contestação Previdenciária",
      },
    });
    const publishedVersion = makeDraftVersion({
      workflow_status: "published",
      published_by: "user-1",
      published_at: "2026-04-20T22:26:00.000Z",
    });

    getLegalCaseContextSnapshotMock.mockResolvedValue(snapshot);
    listProcessDraftVersionsMock.mockResolvedValue([publishedVersion]);
    publishLegalPiecePremiumMock.mockResolvedValue({
      publication: {
        format: "pdf",
        fileName: "contestacao-e2e.pdf",
        mimeType: "application/pdf",
        driveFileId: "drive-file-1",
        webViewLink: "https://drive.google.com/file/d/drive-file-1/view",
        modifiedAt: "2026-04-20T22:30:00.000Z",
        driveFolderId: "folder-pecas-finais",
        driveFolderLabel: "09-Pecas Finais",
        driveFolderUrl: "https://drive.google.com/drive/folders/folder-pecas-finais",
        publishedAt: "2026-04-20T22:30:00.000Z",
      },
      learningLoopCapture: {
        capturedAt: "2026-04-20T22:30:00.000Z",
        sourceKind: "source_artifact",
        sourceLabel: "a primeira minuta gerada",
        changed: true,
        changeRatio: 0.34,
        categories: ["substantive_expansion", "citations_enriched"],
        summary: "Delta capturado contra a primeira minuta gerada · +1200 caracteres · +3 paragrafos · +1 secoes · +2 citacoes · 34% de variacao estimada · sinais: substantive_expansion, citations_enriched",
        baseline: { charCount: 3200, wordCount: 510, paragraphCount: 9, sectionCount: 4, citationCount: 1 },
        final: { charCount: 4400, wordCount: 680, paragraphCount: 12, sectionCount: 5, citationCount: 3 },
        delta: { charCount: 1200, wordCount: 170, paragraphCount: 3, sectionCount: 1, citationCount: 2 },
      },
      uploadedFile: {
        id: "drive-file-1",
        name: "contestacao-e2e.pdf",
        webViewLink: "https://drive.google.com/file/d/drive-file-1/view",
      },
      task: {
        id: "process-task-1",
      },
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_artifact_publish_premium",
      capabilityName: "legal_artifact_publish_premium",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        process_number: "E2E-2026-0001",
        version_number: "2",
      },
      auditLogId: "audit-8",
      brainContext: {
        taskId: "brain-task-8",
        runId: "brain-run-8",
        stepId: "brain-step-8",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("artifact premium em PDF");
    expect(publishLegalPiecePremiumMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "process-task-1",
      accessToken: "access-token-1",
      versionId: "draft-version-1",
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-8",
      artifactType: "legal_artifact_publish_premium",
      storageUrl: "https://drive.google.com/file/d/drive-file-1/view",
      metadata: expect.objectContaining({
        process_task_id: "process-task-1",
        draft_version_id: "draft-version-1",
        publish_format: "pdf",
        publish_status: "published",
        drive_file_id: "drive-file-1",
        learning_loop_changed: true,
        learning_loop_source_kind: "source_artifact",
        learning_loop_categories: ["substantive_expansion", "citations_enriched"],
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "legal_artifact_publish_premium_executed",
      task_id: "brain-task-8",
      payload: expect.objectContaining({
        process_task_id: "process-task-1",
        draft_version_id: "draft-version-1",
        publish_format: "pdf",
        learning_loop_changed: true,
        learning_loop_source_kind: "source_artifact",
      }),
    }));
    expect(result.reply).toContain("Learning loop:");
  });
});
