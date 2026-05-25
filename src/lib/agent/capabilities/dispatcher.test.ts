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
  createAgentAuditLogMock,
  runSelfImprovementReviewMock,
  loadTenantFinanceSummaryMock,
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
      createAgentAuditLogMock: vi.fn(),
      runSelfImprovementReviewMock: vi.fn(),
      loadTenantFinanceSummaryMock: vi.fn(),
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

vi.mock("@/lib/agent/audit", () => ({
  createAgentAuditLog: createAgentAuditLogMock,
}));

vi.mock("@/lib/agent/runtime/self-improvement-review", () => ({
  runSelfImprovementReview: runSelfImprovementReviewMock,
}));

vi.mock("@/lib/finance/tenant-finance-summary", () => ({
  loadTenantFinanceSummary: loadTenantFinanceSummaryMock,
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
import { executarCobranca } from "@/lib/agent/skills/asaas-cobrar";

function makeSnapshot(overrides: Record<string, any> = {}) {
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

function makeDraftVersion(overrides: Record<string, any> = {}) {
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

function makeOperationalMethodology(overrides: Record<string, any> = {}) {
  return {
    status: "approved",
    identity: {
      office_name: "Dutra Advocacia",
      practice_areas: ["Previdenciario"],
    },
    intake: {
      required_documents_by_case: ["procuração", "documento pessoal"],
      methodology_base_used: false,
    },
    case_flow: {
      phases: ["Triagem documental", "Analise juridica", "Minuta"],
      owners: ["Juridico"],
      advancement_criteria: ["documentos minimos conferidos"],
      blocking_criteria: ["ausencia de CNIS"],
    },
    area_methods: [{
      area: "Previdenciario",
      intake_questions: ["Qual beneficio foi indeferido"],
      required_documents: ["CNIS", "indeferimento administrativo", "PPP/LTCAT"],
      phases: ["Triagem previdenciaria", "Analise CNIS", "Minuta"],
      document_structure: ["01 Documentos pessoais", "02 CNIS", "03 Provas tecnicas"],
      owner_team: "Juridico previdenciario",
      validation_status: "validated",
      next_review_question: null,
    }],
    improvement_rules: [],
    internet_policy: {
      enabled: true,
      no_auto_activation: true,
      usage: "somente atualizar contexto e sugerir revisao auditavel",
      allowed_sources: ["gov.br", "inss.gov.br"],
    },
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

function makeListQuery(result: { data: any[]; error: any }) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => result),
    in: vi.fn(async () => result),
  };

  return query;
}

function makeGrowthQuery(table: string, inserts: Array<{ table: string; payload: any }>) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    insert: vi.fn((payload: any) => {
      inserts.push({ table, payload });
      query.lastInsert = payload;
      return query;
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "crm_pipelines") return { data: { id: "pipeline-1" }, error: null };
      return { data: null, error: null };
    }),
    single: vi.fn(async () => {
      if (table === "crm_tasks") return { data: { id: "crm-task-1", pipeline_id: "pipeline-1" }, error: null };
      return { data: { id: `${table}-1` }, error: null };
    }),
    then: (resolve: (value: any) => void) => {
      if (table === "crm_stages") {
        resolve({ data: [{ id: "stage-1", name: "Novo Lead", order_index: 0 }], error: null });
        return;
      }

      resolve({ data: null, error: null });
    },
  };

  return query;
}

function makeApprovedLegalFirstDraftApprovalQuery(overrides: Record<string, any> = {}) {
  return makeMaybeSingleQuery({
    data: {
      skill_invoked: "legal_first_draft_generate",
      approval_status: "approved",
      approved_by: "user-1",
      approved_at: "2026-04-20T21:05:00.000Z",
      approval_context: {
        source_capability: "legal_process_mission_execute_next",
      },
      pending_execution_payload: {
        source: "legal_process_mission_execute_next",
      },
      ...overrides,
    },
    error: null,
  });
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
    createAgentAuditLogMock.mockReset();
    runSelfImprovementReviewMock.mockReset();
    loadTenantFinanceSummaryMock.mockReset();
    vi.mocked(executarCobranca).mockReset();

    insertMock.mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert: insertMock });
    createClientMock.mockReturnValue({ from: fromMock });
    createBrainArtifactMock.mockResolvedValue({ id: "artifact-chat-1" });
    createAgentAuditLogMock.mockResolvedValue({ id: "approval-audit-draft-1" });
    vi.mocked(executarCobranca).mockResolvedValue({
      success: true,
      cobrancaId: "pay-1",
      invoiceUrl: "https://asaas.test/i/pay-1",
      bankSlipUrl: "https://asaas.test/b/pay-1",
      paymentLink: "https://asaas.test/p/pay-1",
      clientId: "client-1",
      asaasCustomerId: "cus-1",
      clientName: "Maria Silva",
    });
    listProcessDraftVersionsMock.mockResolvedValue([]);
    getTenantGoogleDriveContextMock.mockResolvedValue({
      integrationId: "drive-integration-1",
      refreshToken: "refresh-token-1",
      accessToken: "access-token-1",
      metadata: {},
    });
  });

  it("executa self_improvement_review e retorna resumo supervisionado", async () => {
    const review = {
      proposalsCreated: 1,
      patternsDetected: [{
        patternKind: "repair_foreign_language_leak",
        category: "compliance",
        eventType: "mayus_operating_partner_repair_pattern",
        count: 3,
        evidenceEventIds: ["evt-1", "evt-2", "evt-3"],
        suggestedText: "Revisar vazamento de idioma antes do envio.",
      }],
    };
    runSelfImprovementReviewMock.mockResolvedValue(review);

    const result = await dispatchCapabilityExecution({
      handlerType: "core_self_improvement_review",
      capabilityName: "self_improvement_review",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { lookback_days: "14" },
      auditLogId: "audit-self-improvement-1",
      brainContext: {
        taskId: "task-1",
        runId: "run-1",
        stepId: "step-1",
        sourceModule: "mayus",
      },
    });

    expect(runSelfImprovementReviewMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      actorId: "user-1",
      lookbackDays: 14,
      brainContext: expect.objectContaining({
        taskId: "task-1",
        runId: "run-1",
        stepId: "step-1",
      }),
    }));
    expect(result.status).toBe("executed");
    expect(result.reply).toContain("criou 1 proposta");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      proposals_created: 1,
      patterns_detected: review.patternsDetected,
      external_side_effects_blocked: true,
    }));
  });

  it("executa lead_intake pelo chat, cria CRM task e artifact da missao", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => makeGrowthQuery(table, inserts));

    const result = await dispatchCapabilityExecution({
      handlerType: "growth_lead_intake",
      capabilityName: "lead_intake",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        name: "Bianca Indicada",
        phone: "21966665555",
        legalArea: "Familia",
        pain: "Indicada por um cliente para avaliar revisao de alimentos.",
        referredBy: "Pedro Cliente",
      },
      auditLogId: "audit-lead-1",
      brainContext: {
        taskId: "brain-task-lead-1",
        runId: "brain-run-lead-1",
        stepId: "brain-step-lead-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Lead registrado");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      crm_task_id: "crm-task-1",
      lead_kind: "referral",
      lead_needs_human_handoff: true,
    }));
    expect(inserts.some((item) => item.table === "crm_tasks" && item.payload.title === "Bianca Indicada")).toBe(true);
    expect(inserts.some((item) => item.table === "system_event_logs" && item.payload.event_name === "referral_intake_created")).toBe(true);
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-lead-1",
      artifactType: "referral_intake",
      metadata: expect.objectContaining({
        crm_task_id: "crm-task-1",
        kind: "referral",
        referred_by: "Pedro Cliente",
        phone_present: true,
      }),
    }));
    expect(JSON.stringify(createBrainArtifactMock.mock.calls[0][0].metadata)).not.toContain("21966665555");
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "referral_intake_artifact_created")).toBe(true);
  });

  it("executa lead_qualify pelo chat e registra plano de qualificacao", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "crm_tasks") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: {
              id: "crm-task-1",
              title: "Maria Silva",
              description: "Negativa do INSS com prazo para recurso.",
              sector: "Previdenciario",
              source: "Instagram",
              lead_scoring: 82,
              tags: ["lead-intake", "previdenciario"],
            },
            error: null,
          })),
        };
        return query;
      }

      return makeGrowthQuery(table, inserts);
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "growth_lead_qualify",
      capabilityName: "lead_qualify",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { crm_task_id: "crm-task-1" },
      auditLogId: "audit-qualify-1",
      brainContext: {
        taskId: "brain-task-qualify-1",
        runId: "brain-run-qualify-1",
        stepId: "brain-step-qualify-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Qualificacao do lead");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      crm_task_id: "crm-task-1",
      lead_name: "Maria Silva",
      qualification_confidence: "high",
      lead_requires_human_handoff: true,
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-qualify-1",
      artifactType: "lead_qualification_plan",
      metadata: expect.objectContaining({
        crm_task_id: "crm-task-1",
        lead_name: "Maria Silva",
        legal_area: "Previdenciario",
        qualification_confidence: "high",
        minimum_documents: expect.arrayContaining(["CNIS"]),
      }),
    }));
    expect(JSON.stringify(createBrainArtifactMock.mock.calls[0][0].metadata)).not.toMatch(/phone|email|api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "lead_qualification_plan_created")).toBe(true);
  });

  it("executa lead_followup pelo chat e registra plano supervisionado", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "crm_tasks") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: {
              id: "crm-task-1",
              title: "Maria Silva",
              description: "Negativa do INSS com prazo para recurso amanha.",
              sector: "Previdenciario",
              source: "Instagram",
              lead_scoring: 82,
              tags: ["lead-intake", "previdenciario"],
            },
            error: null,
          })),
        };
        return query;
      }

      return makeGrowthQuery(table, inserts);
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "growth_lead_followup",
      capabilityName: "lead_followup",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { crm_task_id: "crm-task-1" },
      auditLogId: "audit-followup-1",
      brainContext: {
        taskId: "brain-task-followup-1",
        runId: "brain-run-followup-1",
        stepId: "brain-step-followup-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Follow-up do lead");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      crm_task_id: "crm-task-1",
      lead_name: "Maria Silva",
      followup_priority: "high",
      cadence_step_count: 3,
      requires_human_approval: true,
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-followup-1",
      artifactType: "lead_followup_plan",
      metadata: expect.objectContaining({
        crm_task_id: "crm-task-1",
        lead_name: "Maria Silva",
        legal_area: "Previdenciario",
        followup_priority: "high",
        cadence: expect.arrayContaining([
          expect.objectContaining({ channel: "whatsapp" }),
          expect.objectContaining({ channel: "phone" }),
        ]),
        requires_human_approval: true,
      }),
    }));
    expect(JSON.stringify(createBrainArtifactMock.mock.calls[0][0].metadata)).not.toMatch(/phone_number|email|api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "lead_followup_plan_created")).toBe(true);
  });

  it("executa lead_schedule pelo chat e registra agenda interna supervisionada", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "crm_tasks") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: {
              id: "crm-task-1",
              title: "Maria Silva",
              description: "Negativa do INSS com prazo para recurso.",
              sector: "Previdenciario",
              source: "Instagram",
              lead_scoring: 82,
              tags: ["lead-intake", "previdenciario"],
              assigned_to: "sdr-1",
            },
            error: null,
          })),
        };
        return query;
      }

      return makeGrowthQuery(table, inserts);
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "growth_lead_schedule",
      capabilityName: "lead_schedule",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        crm_task_id: "crm-task-1",
        scheduled_for: "2026-04-28T13:00:00.000Z",
        meeting_type: "consulta",
        owner_name: "SDR MAYUS",
      },
      auditLogId: "audit-schedule-1",
      brainContext: {
        taskId: "brain-task-schedule-1",
        runId: "brain-run-schedule-1",
        stepId: "brain-step-schedule-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Agendamento do lead");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      crm_task_id: "crm-task-1",
      agenda_task_id: "user_tasks-1",
      lead_name: "Maria Silva",
      scheduled_for: "2026-04-28T13:00:00.000Z",
      schedule_urgency: "URGENTE",
      requires_human_approval: true,
    }));
    expect(inserts.some((item) => item.table === "user_tasks" && item.payload.source_table === "growth_lead_schedule")).toBe(true);
    expect(inserts.find((item) => item.table === "user_tasks").payload).toEqual(expect.objectContaining({
      source_id: "crm:crm-task-1",
      assigned_to: "sdr-1",
      created_by_agent: "mayus",
      show_only_on_date: true,
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-schedule-1",
      artifactType: "lead_schedule_plan",
      metadata: expect.objectContaining({
        crm_task_id: "crm-task-1",
        agenda_task_id: "user_tasks-1",
        lead_name: "Maria Silva",
        legal_area: "Previdenciario",
        urgency: "URGENTE",
        requires_human_approval: true,
      }),
    }));
    expect(JSON.stringify(createBrainArtifactMock.mock.calls[0][0].metadata)).not.toMatch(/phone|email|google|oauth|api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "lead_schedule_plan_created")).toBe(true);
  });

  it("executa revenue_flow_plan pelo chat sem acionar integracoes externas", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => makeGrowthQuery(table, inserts));

    const result = await dispatchCapabilityExecution({
      handlerType: "growth_revenue_flow_plan",
      capabilityName: "revenue_flow_plan",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        client_name: "Maria Silva",
        legal_area: "Previdenciario",
        amount: "4500",
      },
      auditLogId: "audit-revenue-1",
      brainContext: {
        taskId: "brain-task-revenue-1",
        runId: "brain-run-revenue-1",
        stepId: "brain-step-revenue-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Plano revenue-to-case");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      client_name: "Maria Silva",
      revenue_flow_step_count: 4,
      requires_human_approval: true,
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-revenue-1",
      artifactType: "revenue_flow_plan",
      metadata: expect.objectContaining({
        client_name: "Maria Silva",
        legal_area: "Previdenciario",
        amount: 4500,
        steps: expect.arrayContaining([
          expect.objectContaining({ capability: "proposal_generate" }),
          expect.objectContaining({ capability: "zapsign_contract" }),
          expect.objectContaining({ capability: "asaas_cobrar" }),
          expect.objectContaining({ capability: "revenue_to_case" }),
        ]),
        requires_human_approval: true,
      }),
    }));
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "revenue_flow_plan_created")).toBe(true);
    expect(inserts.some((item) => item.table === "user_tasks")).toBe(false);
    expect(JSON.stringify(createBrainArtifactMock.mock.calls[0][0].metadata)).not.toMatch(/api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });

  it("executa billing_create aprovado, cria artifact asaas_billing e learning event", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => makeGrowthQuery(table, inserts));

    const result = await dispatchCapabilityExecution({
      handlerType: "asaas_cobrar",
      capabilityName: "billing_create",
      tenantId: "tenant-1",
      userId: "approver-1",
      entities: {
        nome_cliente: "Maria Silva",
        valor: "1500",
        vencimento: "2099-05-20",
        billing_type: "PIX",
        descricao: "Entrada contrato previdenciario",
      },
      auditLogId: "approval-billing-1",
      brainContext: {
        taskId: "brain-task-billing-1",
        runId: "brain-run-billing-1",
        stepId: "brain-step-billing-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(executarCobranca).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      nome_cliente: "Maria Silva",
      valor: 1500,
      vencimento: "2099-05-20",
      billing_type: "PIX",
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-billing-1",
      artifactType: "asaas_billing",
      dedupeKey: "asaas_billing:tenant-1:maria silva:1500.00:2099-05-20:brain-task-billing-1",
      metadata: expect.objectContaining({
        billing_idempotency_key: "asaas_billing:tenant-1:maria silva:1500.00:2099-05-20:brain-task-billing-1",
        billing_status: "created",
        cobranca_id: "pay-1",
        invoice_url: "https://asaas.test/i/pay-1",
        payment_link: "https://asaas.test/p/pay-1",
        nome_cliente: "Maria Silva",
        asaas_customer_id: "cus-1",
        valor: 1500,
        vencimento: "2099-05-20",
        billing_type: "PIX",
      }),
    }));
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "billing_created")).toBe(true);
    expect(JSON.stringify(createBrainArtifactMock.mock.calls[0][0].metadata)).not.toMatch(/api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });

  it("bloqueia billing_create duplicado antes de chamar Asaas", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "brain_artifacts") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: {
              id: "billing-artifact-existing",
              title: "Cobranca Maria Silva",
              storage_url: "https://asaas.test/p/pay-existing",
              created_at: "2026-05-12T12:00:00.000Z",
              metadata: {
                billing_idempotency_key: "asaas_billing:tenant-1:maria silva:1500.00:2099-05-20:approval-billing-duplicate",
              },
            },
            error: null,
          })),
        };
        return query;
      }
      return makeGrowthQuery(table, inserts);
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "asaas_cobrar",
      capabilityName: "billing_create",
      tenantId: "tenant-1",
      userId: "approver-1",
      entities: {
        nome_cliente: "Maria Silva",
        valor: "1500",
        vencimento: "2099-05-20",
      },
      auditLogId: "approval-billing-duplicate",
    });

    expect(result.status).toBe("blocked");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      billing_duplicate: true,
      billing_artifact_id: "billing-artifact-existing",
    }));
    expect(executarCobranca).not.toHaveBeenCalled();
    expect(createBrainArtifactMock).not.toHaveBeenCalled();
  });

  it("executa collections_followup pelo chat e registra plano financeiro supervisionado", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => makeGrowthQuery(table, inserts));

    const result = await dispatchCapabilityExecution({
      handlerType: "finance_collections_followup",
      capabilityName: "collections_followup",
      tenantId: "tenant-1",
      userId: "finance-1",
      entities: {
        client_name: "Maria Silva",
        legal_area: "Previdenciario",
        amount: "1500",
        days_overdue: "12",
        collection_stage: "inadimplencia",
        tone: "firme",
        channel: "WhatsApp",
        payment_promise_at: "2026-05-20",
        next_contact_at: "2026-05-18T13:00:00.000Z",
      },
      auditLogId: "audit-collections-1",
      brainContext: {
        taskId: "brain-task-collections-1",
        runId: "brain-run-collections-1",
        stepId: "brain-step-collections-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Plano de cobranca supervisionada");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      collection_stage: "renegotiation",
      collection_priority: "medium",
      external_side_effects_blocked: true,
      requires_human_approval: true,
      payment_promise_at: "2026-05-20",
      next_contact_at: "2026-05-18T13:00:00.000Z",
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-collections-1",
      artifactType: "collections_followup_plan",
      metadata: expect.objectContaining({
        client_name: "Maria Silva",
        legal_area: "Previdenciario",
        amount: 1500,
        days_overdue: 12,
        collection_stage: "renegotiation",
        suggested_first_message: expect.stringContaining("Maria"),
        external_side_effects_blocked: true,
        requires_human_approval: true,
      }),
    }));
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "collections_followup_plan_created")).toBe(true);
    expect(executarCobranca).not.toHaveBeenCalled();
    expect(JSON.stringify(createBrainArtifactMock.mock.calls[0][0].metadata)).not.toMatch(/api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });

  it("executa management_intelligence_brief com readiness e sem decisao automatica", async () => {
    loadTenantFinanceSummaryMock.mockResolvedValue({
      tenantId: "tenant-1",
      generatedAt: "2026-05-22T12:00:00.000Z",
      financials: {
        received: { amount: 10000, count: 2 },
        forecast: { amount: 3000, count: 1 },
        overdue: { amount: 1500, count: 1 },
        delinquency: { amount: 1500, count: 1, rate: 15 },
        openCharges: { amount: 4500, count: 2 },
        forecastBuckets: {
          dueIn7Days: { amount: 3000, count: 1 },
          dueIn30Days: { amount: 0, count: 0 },
          future: { amount: 0, count: 0 },
          noDueDate: { amount: 0, count: 0 },
        },
        overdueAging: {
          days1To7: { amount: 1500, count: 1 },
          days8To14: { amount: 0, count: 0 },
          days15To30: { amount: 0, count: 0 },
          days31Plus: { amount: 0, count: 0 },
        },
        riskItems: [],
        expenses: {
          fixed: { amount: 2000, count: 1 },
          marketing: { amount: 500, count: 1 },
        },
      },
      commercialForecast: {
        source: "sales+crm_tasks",
        available: true,
        pipelineAmount: 7000,
        pendingContracts: { amount: 3000, count: 1 },
        closedContracts: { amount: 10000, count: 2 },
        lostAmount: 0,
        byStage: [{ stageId: "stage-1", stageName: "Proposta", amount: 7000, count: 1, isWin: false, isLoss: false }],
        topOpportunities: [{ kind: "crm", id: "crm-1", label: "Lead RMC", amount: 7000, stage: "Proposta", source: "indicacao", nextBestAction: "Confirmar proximo compromisso." }],
      },
      collectionsFollowup: {
        source: "brain_artifacts",
        available: true,
        totalPlans: 1,
        highPriorityPlans: 0,
        recentPlans: [],
      },
      revenueReconciliation: {
        source: "financials+brain_artifacts+process_tasks",
        available: true,
        report: {
          generatedAt: "2026-05-22T12:00:00.000Z",
          totals: { matched: 1, needsReview: 0, missingFinancial: 0, missingArtifact: 0, missingProcessTask: 0 },
          items: [{ status: "matched" }],
        },
      },
      unitEconomics: {
        grossRevenue: 10000,
        directCosts: 1000,
        commissions: 500,
        estimatedProfit: 8500,
        estimatedMarginRate: 85,
        byCase: [{ label: "Caso RMC", amount: 10000, revenue: 10000, count: 1 }],
        byLegalArea: [{ legalArea: "Bancario", amount: 10000, revenue: 10000, count: 1 }],
        commissionsBreakdown: { byOwner: [], byOrigin: [] },
      },
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "management_intelligence_brief",
      capabilityName: "management_intelligence_brief",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        request: "Analise meu escritorio como CEO, com CAC, pipeline e margem.",
      },
      auditLogId: "audit-management-1",
      brainContext: {
        taskId: "brain-task-management-1",
        runId: "brain-run-management-1",
        stepId: "brain-step-management-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Inteligencia de gestao");
    expect(result.reply).toContain("Limite: nao executei decisao empresarial");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      artifact_type: "management_intelligence_brief",
      readiness_status: "ready",
      external_side_effects_blocked: true,
      strategic_decision_blocked: true,
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      artifactType: "management_intelligence_brief",
      metadata: expect.objectContaining({
        artifactType: "management_intelligence_brief",
        readiness: expect.objectContaining({
          status: "ready",
        }),
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "management_intelligence_brief_created",
      payload: expect.objectContaining({
        tenant_only: true,
        strategic_decision_blocked: true,
      }),
    }));
  });

  it("executa external_action_preview pelo chat sem executar integracao externa", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => makeGrowthQuery(table, inserts));

    const result = await dispatchCapabilityExecution({
      handlerType: "growth_external_action_preview",
      capabilityName: "external_action_preview",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        action_type: "contrato",
        client_name: "Maria Silva",
        legal_area: "Previdenciario",
        recipient_email: "maria@example.com",
      },
      auditLogId: "audit-preview-1",
      brainContext: {
        taskId: "brain-task-preview-1",
        runId: "brain-run-preview-1",
        stepId: "brain-step-preview-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Preview de acao externa");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      action_type: "zapsign_contract",
      client_name: "Maria Silva",
      external_preview_blocker_count: 0,
      external_side_effects_blocked: true,
      requires_human_approval: true,
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-preview-1",
      artifactType: "external_action_preview",
      metadata: expect.objectContaining({
        action_type: "zapsign_contract",
        client_name: "Maria Silva",
        preview_status: "pending_human_approval",
        external_side_effects_blocked: true,
        requires_human_approval: true,
      }),
    }));
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "external_action_preview_created")).toBe(true);
    expect(inserts.some((item) => item.table === "user_tasks")).toBe(false);
    expect(JSON.stringify(createBrainArtifactMock.mock.calls[0][0].metadata)).not.toMatch(/maria@example\.com|api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });

  it("executa client_acceptance_record pelo chat e registra auditoria operacional", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => makeGrowthQuery(table, inserts));

    const result = await dispatchCapabilityExecution({
      handlerType: "growth_client_acceptance_record",
      capabilityName: "client_acceptance_record",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        client_name: "Maria Silva",
        acceptance_type: "proposta",
        acceptance_channel: "WhatsApp",
        evidence_summary: "Cliente confirmou aceite da proposta.",
        amount: "4500",
      },
      auditLogId: "audit-acceptance-1",
      brainContext: {
        taskId: "brain-task-acceptance-1",
        runId: "brain-run-acceptance-1",
        stepId: "brain-step-acceptance-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Aceite do cliente registrado");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      client_name: "Maria Silva",
      acceptance_type: "proposal",
      client_acceptance_audit_status: "recorded_pending_internal_review",
      external_side_effects_blocked: true,
      requires_human_review: true,
    }));
    expect(inserts.some((item) => item.table === "system_event_logs" && item.payload.event_name === "client_acceptance_recorded")).toBe(true);
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-acceptance-1",
      artifactType: "client_acceptance_record",
      metadata: expect.objectContaining({
        client_name: "Maria Silva",
        acceptance_type: "proposal",
        amount: 4500,
        audit_status: "recorded_pending_internal_review",
        external_side_effects_blocked: true,
        requires_human_review: true,
      }),
    }));
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "client_acceptance_record_created")).toBe(true);
    expect(inserts.some((item) => item.table === "user_tasks")).toBe(false);
    expect(JSON.stringify(createBrainArtifactMock.mock.calls[0][0].metadata)).not.toMatch(/phone_number|email|api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });

  it("executa lead_reactivation pelo chat e registra plano supervisionado", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "crm_tasks") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(() => query),
          then: (resolve: (value: any) => void) => {
            resolve({
              data: [
                {
                  id: "crm-task-1",
                  title: "Maria Silva",
                  description: "Lead frio de revisao de beneficio.",
                  sector: "Previdenciario",
                  source: "Instagram",
                  lead_scoring: 82,
                  tags: ["lead-intake", "previdenciario"],
                },
                {
                  id: "crm-task-2",
                  title: "Joao Souza",
                  description: "Lead antigo sem retorno.",
                  sector: "Previdenciario",
                  source: "Indicacao",
                  lead_scoring: 45,
                  tags: ["previdenciario"],
                },
              ],
              error: null,
            });
          },
        };
        return query;
      }

      return makeGrowthQuery(table, inserts);
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "growth_lead_reactivation",
      capabilityName: "lead_reactivation",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        legal_area: "Previdenciario",
        min_days_inactive: "45",
        max_leads: "12",
      },
      auditLogId: "audit-reactivation-1",
      brainContext: {
        taskId: "brain-task-reactivation-1",
        runId: "brain-run-reactivation-1",
        stepId: "brain-step-reactivation-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Reativacao de leads frios");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      legal_area: "Previdenciario",
      lead_reactivation_candidate_count: 2,
      lead_reactivation_message_count: 3,
      external_side_effects_blocked: true,
      requires_human_approval: true,
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-reactivation-1",
      artifactType: "lead_reactivation_plan",
      metadata: expect.objectContaining({
        legal_area: "Previdenciario",
        candidate_count: 2,
        candidates: expect.arrayContaining([
          expect.objectContaining({ id: "crm-task-1", name: "Maria Silva", priority: "high" }),
        ]),
        message_variants: expect.arrayContaining([
          expect.objectContaining({ channel: "whatsapp" }),
        ]),
        requires_human_approval: true,
        external_side_effects_blocked: true,
      }),
    }));
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "lead_reactivation_plan_created")).toBe(true);
    expect(inserts.some((item) => item.table === "user_tasks")).toBe(false);
    expect(JSON.stringify(createBrainArtifactMock.mock.calls[0][0].metadata)).not.toMatch(/phone_number|email|api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });

  it("executa marketing_ops_assistant pelo chat sem side effects externos", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const nextMarketingDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_settings") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({
            data: {
              ai_features: {
                marketing_os: {
                  profile: {
                    firmName: "MAYUS Advocacia",
                    positioning: "Autoridade juridica premium",
                    legalAreas: ["Previdenciario"],
                    audiences: ["Segurados do INSS"],
                    channels: ["linkedin"],
                    voiceTone: "premium",
                    websites: [],
                    socialProfiles: [],
                    admiredReferences: [],
                    ethicsGuardrails: ["Nao prometer resultado juridico."],
                  },
                  calendar: [
                    {
                      id: "item-1",
                      title: "Previdenciario: guia educativo",
                      channel: "linkedin",
                      legalArea: "Previdenciario",
                      objective: "authority",
                      tone: "premium",
                      audience: "Segurados do INSS",
                      angle: "guia educativo",
                      guardrails: [],
                      sourcePatternIds: [],
                      date: nextMarketingDate,
                      status: "approved",
                      notes: "",
                    },
                  ],
                  references: [],
                },
              },
            },
            error: null,
          })),
        };
        return query;
      }

      if (table === "crm_tasks") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          order: vi.fn(() => query),
          limit: vi.fn(async () => ({
            data: [
              {
                id: "crm-task-1",
                title: "Maria Silva",
                description: "Lead novo sem combinado claro.",
                tags: ["previdenciario"],
                sector: "Previdenciario",
                created_at: "2026-04-25T10:00:00.000Z",
                data_ultima_movimentacao: null,
              },
            ],
            error: null,
          })),
        };
        return query;
      }

      return makeGrowthQuery(table, inserts);
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "growth_marketing_ops_assistant",
      capabilityName: "marketing_ops_assistant",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        request: "Mayus, o que eu devo publicar esta semana",
        legal_area: "Previdenciario",
        channel: "linkedin",
      },
      auditLogId: "audit-marketing-ops-1",
      brainContext: {
        taskId: "brain-task-marketing-ops-1",
        runId: "brain-run-marketing-ops-1",
        stepId: "brain-step-marketing-ops-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Growth por chat");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      mode: "weekly_plan",
      this_week_count: 1,
      approved_without_task_count: 1,
      leads_needing_next_step_count: 1,
      external_side_effects_blocked: true,
      requires_human_approval: true,
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-marketing-ops-1",
      artifactType: "marketing_ops_assistant_plan",
      metadata: expect.objectContaining({
        this_week_count: 1,
        approved_without_task_count: 1,
        leads_needing_next_step_count: 1,
        external_side_effects_blocked: true,
      }),
    }));
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "marketing_ops_assistant_plan_created")).toBe(true);
    expect(inserts.some((item) => item.table === "user_tasks")).toBe(false);
  });

  it("executa sales_consultation pelo chat e registra plano DEF supervisionado", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => makeGrowthQuery(table, inserts));

    const result = await dispatchCapabilityExecution({
      handlerType: "growth_sales_consultation",
      capabilityName: "sales_consultation",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        lead_name: "Maria Silva",
        legal_area: "Previdenciario",
        stage: "descoberta",
        channel: "WhatsApp",
        objection: "achei caro",
        ticket_value: "4500",
      },
      history: [
        { role: "user", content: "Caso: beneficio negado. Ela quer destravar aposentadoria e ja tentou resolver no INSS." },
      ],
      auditLogId: "audit-sales-consultation-1",
      brainContext: {
        taskId: "brain-task-sales-consultation-1",
        runId: "brain-run-sales-consultation-1",
        stepId: "brain-step-sales-consultation-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Consultoria comercial DEF");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      lead_name: "Maria Silva",
      sales_consultation_phase: "discovery",
      objection_move_count: 1,
      discovery_completeness: expect.any(Number),
      missing_signal_count: expect.any(Number),
      next_discovery_question: expect.any(String),
      firm_positioning_completeness: expect.any(Number),
      firm_profile_missing_signal_count: expect.any(Number),
      firm_profile_drafted: true,
      external_side_effects_blocked: true,
      requires_human_review: true,
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-sales-consultation-1",
      artifactType: "sales_consultation_plan",
      metadata: expect.objectContaining({
        lead_name: "Maria Silva",
        legal_area: "Previdenciario",
        consultation_phase: "discovery",
        discovery_questions: expect.arrayContaining([
          expect.stringContaining("Antes de eu te dizer qualquer caminho"),
        ]),
        objection_moves: expect.arrayContaining([
          expect.objectContaining({ type: "price" }),
        ]),
        missing_signals: expect.any(Array),
        discovery_completeness: expect.any(Number),
        next_discovery_question: expect.any(String),
        firm_profile: expect.objectContaining({
          uniqueValueProposition: expect.stringContaining("Ajudamos"),
        }),
        firm_profile_missing_signals: expect.any(Array),
        requires_human_review: true,
        external_side_effects_blocked: true,
      }),
    }));
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "sales_consultation_plan_created")).toBe(true);
    expect(inserts.some((item) => item.table === "user_tasks")).toBe(false);
    expect(JSON.stringify(createBrainArtifactMock.mock.calls[0][0].metadata)).not.toMatch(/phone_number|email|api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });

  it("executa commercial_playbook_setup e registra skill comercial reutilizavel", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => makeGrowthQuery(table, inserts));

    const result = await dispatchCapabilityExecution({
      handlerType: "growth_commercial_playbook_setup",
      capabilityName: "commercial_playbook_setup",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        firm_name: "Dutra Advocacia",
        legal_area: "Direito Bancario",
        template_flavor: "dutra_blindagem",
        source_document: "gestao-comercial-dutra-advocacia.html",
        ideal_client: "aposentados com descontos RMC ou GRAM e urgencia financeira",
      },
      auditLogId: "audit-commercial-playbook-1",
      brainContext: {
        taskId: "brain-task-commercial-playbook-1",
        runId: "brain-run-commercial-playbook-1",
        stepId: "brain-step-commercial-playbook-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Skill comercial criada para Dutra Advocacia");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      artifact_type: "commercial_playbook_setup",
      method_name: "MAYUS Front Desk Comercial",
      office_name: "Dutra Advocacia",
      first_response_sla_minutes: 5,
      call_analysis_checklist_count: expect.any(Number),
      external_side_effects_blocked: true,
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-commercial-playbook-1",
      artifactType: "commercial_playbook_setup",
      metadata: expect.objectContaining({
        office_name: "Dutra Advocacia",
        source_model: expect.stringContaining("Modelo Dutra Advocacia"),
        first_response_sla_minutes: 5,
        mayus_role: "first_attendant_sdr_closer_router",
        daily_report_sections: expect.arrayContaining([
          expect.objectContaining({ id: "frontdesk" }),
          expect.objectContaining({ id: "calls" }),
        ]),
        call_analysis_checklist: expect.any(Array),
      }),
    }));
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "commercial_playbook_setup_created")).toBe(true);
  });

  it("executa sales_profile_setup e grava perfil comercial nas configuracoes", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const upserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_settings") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: { ai_features: { existing_flag: true } }, error: null })),
          upsert: vi.fn((payload: any) => {
            upserts.push({ table, payload });
            return { error: null };
          }),
        };
        return query;
      }

      return makeGrowthQuery(table, inserts);
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "growth_sales_profile_setup",
      capabilityName: "sales_profile_setup",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        ideal_client: "empresarios com passivo trabalhista e decisao urgente",
        core_solution: "reduzir risco e negociar com provas antes do litigio",
        confirmation: "pode salvar",
      },
      auditLogId: "audit-sales-profile-1",
      brainContext: {
        taskId: "brain-task-sales-profile-1",
        runId: "brain-run-sales-profile-1",
        stepId: "brain-step-sales-profile-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Auto-configuracao comercial");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      setup_status: "validated",
      sales_profile_persisted: true,
      external_side_effects_blocked: true,
    }));
    expect(upserts).toHaveLength(1);
    expect(upserts[0].payload.ai_features).toEqual(expect.objectContaining({
      existing_flag: true,
      sales_consultation_profile: expect.objectContaining({
        ideal_client: "empresarios com passivo trabalhista e decisao urgente",
        core_solution: "reduzir risco e negociar com provas antes do litigio",
        status: "validated",
      }),
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-sales-profile-1",
      artifactType: "sales_profile_setup",
      metadata: expect.objectContaining({
        setup_status: "validated",
        persisted: true,
        profile: expect.objectContaining({
          uniqueValueProposition: expect.stringContaining("empresarios com passivo trabalhista"),
        }),
      }),
    }));
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "sales_profile_configured")).toBe(true);
  });

  it("executa office_setup_conversation e grava respostas aprovadas no perfil operacional", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const upserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_settings") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: { ai_features: { existing_flag: true } }, error: null })),
          upsert: vi.fn((payload: any) => {
            upserts.push({ table, payload });
            return { error: null };
          }),
        };
        return query;
      }

      return makeGrowthQuery(table, inserts);
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "setup_office_profile_conversation",
      capabilityName: "office_setup_conversation",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        office_name: "Dutra Advocacia",
        practice_areas: "Direito Bancario | Previdenciario",
        communication_tone: "curto, humano e consultivo",
        triage_rules: "separar lead novo de cliente atual",
        human_handoff_rules: "urgencia juridica chama advogado",
        required_documents_by_case: "contracheque | CNJ",
        forbidden_claims: "resultado garantido",
        pricing_policy: "nao falar preco sem aprovacao",
        response_sla: "5 minutos",
        departments: "Comercial | Juridico",
        permission_policy: "socio aprova contrato cobranca e envio externo",
        calendar_policy: "consulta pode ser sugerida mas confirmacao externa exige humano",
        finance_policy: "cobrancas e renegociacoes ficam supervisionadas",
        playbook_notes: "roteiro consultivo curto com proximo passo claro",
        confirmation: "pode salvar",
      },
      auditLogId: "audit-office-setup-1",
      brainContext: {
        taskId: "brain-task-office-setup-1",
        runId: "brain-run-office-setup-1",
        stepId: "brain-step-office-setup-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Metodologia operacional");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      setup_status: "validated",
      methodology_status: "approved",
      office_setup_persisted: true,
      operational_methodology_persisted: true,
      artifact_type: "office_operational_methodology",
      legacy_artifact_type: "office_setup_conversation",
      event_type: "office_operational_methodology_approved",
      memory_proposals_created: 12,
      external_side_effects_blocked: true,
    }));
    expect(upserts).toHaveLength(1);
    expect(upserts[0].payload.ai_features).toEqual(expect.objectContaining({
      existing_flag: true,
      office_knowledge_profile: expect.objectContaining({
        office_name: "Dutra Advocacia",
        practice_areas: ["Direito Bancario", "Previdenciario"],
        communication_tone: "curto, humano e consultivo",
        permission_policy: "socio aprova contrato cobranca e envio externo",
        calendar_policy: "consulta pode ser sugerida mas confirmacao externa exige humano",
        finance_policy: "cobrancas e renegociacoes ficam supervisionadas",
        playbook_notes: "roteiro consultivo curto com proximo passo claro",
        practice_area_playbooks: expect.arrayContaining([
          expect.objectContaining({
            area: "Direito Bancario",
            validation_status: "needs_area_review",
          }),
          expect.objectContaining({
            area: "Previdenciario",
            required_documents: expect.arrayContaining(["CNIS"]),
          }),
        ]),
        status: "validated",
      }),
      operational_methodology: expect.objectContaining({
        status: "approved",
        identity: expect.objectContaining({
          office_name: "Dutra Advocacia",
          practice_areas: ["Direito Bancario", "Previdenciario"],
        }),
        area_methods: expect.arrayContaining([
          expect.objectContaining({
            area: "Direito Bancario",
            phases: expect.arrayContaining(["Triagem do desconto/contrato"]),
          }),
          expect.objectContaining({
            area: "Previdenciario",
            required_documents: expect.arrayContaining(["CNIS"]),
          }),
        ]),
        internet_policy: expect.objectContaining({
          no_auto_activation: true,
        }),
      }),
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-office-setup-1",
      artifactType: "office_operational_methodology",
      metadata: expect.objectContaining({
        methodology_status: "approved",
        persisted: true,
        operational_methodology: expect.objectContaining({
          status: "approved",
        }),
      }),
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-office-setup-1",
      artifactType: "office_setup_conversation",
      metadata: expect.objectContaining({
        setup_status: "validated",
        persisted: true,
        profile: expect.objectContaining({
          office_name: "Dutra Advocacia",
        }),
      }),
    }));
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "office_operational_methodology_approved")).toBe(true);
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "office_setup_profile_configured")).toBe(true);
    const memoryInsert = inserts.find((item) => item.table === "brain_memories");
    expect(memoryInsert.payload).toEqual(expect.arrayContaining([
      expect.objectContaining({
        memory_type: "institutional_memory_proposal",
        memory_key: "tom_de_atendimento",
        source: "office_setup_conversation",
        promoted: false,
      }),
      expect.objectContaining({
        memory_type: "institutional_memory_proposal",
        memory_key: "politica_de_preco",
        source: "office_setup_conversation",
        promoted: false,
      }),
      expect.objectContaining({
        memory_type: "institutional_memory_proposal",
        memory_key: "politica_de_permissoes",
        source: "office_setup_conversation",
        promoted: false,
      }),
      expect.objectContaining({
        memory_type: "institutional_memory_proposal",
        memory_key: "notas_de_playbook",
        source: "office_setup_conversation",
        promoted: false,
      }),
      expect.objectContaining({
        memory_type: "institutional_memory_proposal",
        memory_key: "playbooks_por_area",
        source: "office_setup_conversation",
        promoted: false,
      }),
    ]));
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "memory_promotion_proposed")).toBe(true);
    expect(JSON.stringify(createBrainArtifactMock.mock.calls[0][0].metadata)).not.toMatch(/api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });

  it("persiste metodologia recomendada sem gravar perfil operacional sem confirmacao", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const upserts: Array<{ table: string; payload: any }> = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_settings") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: { ai_features: { existing_flag: true } }, error: null })),
          upsert: vi.fn((payload: any) => {
            upserts.push({ table, payload });
            return { error: null };
          }),
        };
        return query;
      }

      return makeGrowthQuery(table, inserts);
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "setup_office_profile_conversation",
      capabilityName: "office_setup_conversation",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        notes: "Nao tenho processo definido. Monte a metodologia do meu escritorio para trabalhista, previdenciario e bancario/RMC.",
      },
      auditLogId: "audit-office-methodology-1",
      brainContext: {
        taskId: "brain-task-office-methodology-1",
        runId: "brain-run-office-methodology-1",
        stepId: "brain-step-office-methodology-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      setup_status: "collecting",
      methodology_status: "recommended",
      office_setup_persisted: false,
      operational_methodology_persisted: true,
      methodology_base_used: true,
      area_method_count: 3,
      requires_human_review: true,
    }));
    expect(upserts).toHaveLength(1);
    expect(upserts[0].payload.ai_features).toEqual(expect.objectContaining({
      existing_flag: true,
      operational_methodology: expect.objectContaining({
        status: "recommended",
        intake: expect.objectContaining({
          methodology_base_used: true,
        }),
        area_methods: expect.arrayContaining([
          expect.objectContaining({ area: "Trabalhista" }),
          expect.objectContaining({ area: "Previdenciario" }),
          expect.objectContaining({ area: "Bancario/RMC" }),
        ]),
      }),
    }));
    expect(upserts[0].payload.ai_features.office_knowledge_profile).toBeUndefined();
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      artifactType: "office_operational_methodology",
      metadata: expect.objectContaining({
        methodology_status: "recommended",
        persisted: true,
        profile_persisted: false,
      }),
    }));
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "office_operational_methodology_recommended")).toBe(true);
    expect(inserts.some((item) => item.table === "brain_memories")).toBe(false);
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

  it("monta plano de missao agentica processual sem executar side effects", async () => {
    getLegalCaseContextSnapshotMock.mockResolvedValue(makeSnapshot({
      documentMemory: {
        documentCount: 3,
        syncStatus: "synced",
        lastSyncedAt: "2026-05-08T00:00:00.000Z",
        summaryMaster: "Acervo sincronizado com contestacao e documentos do cliente.",
        currentPhase: "Contestação",
        missingDocuments: [],
        freshness: "fresh",
      },
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "idle",
        recommendedPieceInput: "Contestação",
        recommendedPieceLabel: "Contestação Previdenciária",
      },
    }));

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_process_mission_plan",
      capabilityName: "legal_process_mission_plan",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-process-mission-1",
      brainContext: {
        taskId: "brain-task-mission-1",
        runId: "brain-run-mission-1",
        stepId: "brain-step-mission-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("## Missao agentica do processo");
    expect(result.reply).toContain("Execucao: plano registrado sem side effects externos");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      process_task_id: "process-task-1",
      process_mission_confidence: "high",
      process_mission_recommended_action: "generate_first_draft",
      legal_operator_state: expect.objectContaining({
        status: "awaiting_human_approval",
        safeNextAction: expect.objectContaining({
          action: "generate_first_draft",
          requiresApproval: true,
        }),
      }),
      external_side_effects_blocked: true,
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-mission-1",
      artifactType: "process_mission_plan",
      sourceModule: "mayus",
      metadata: expect.objectContaining({
        process_task_id: "process-task-1",
        process_mission_recommended_action: "generate_first_draft",
        processMissionContext: expect.objectContaining({
          recommendedAction: "generate_first_draft",
        }),
        methodology: expect.any(Object),
        sources: expect.objectContaining({
          factual: expect.any(Array),
          operationalThesisSources: expect.any(Array),
        }),
        gaps: expect.objectContaining({
          all: expect.any(Array),
        }),
        operational_thesis: expect.objectContaining({
          openClawReason: expect.stringContaining("Draft Factory"),
          nextActionBeforeDraftFactory: expect.stringContaining("approval humano"),
        }),
        openclaw_reason: expect.stringContaining("Draft Factory"),
        recommendedAction: "generate_first_draft",
        sideEffectGuardrail: expect.objectContaining({
          approvalGate: "humanGate",
        }),
        agentic_governance: expect.objectContaining({
          openclaw_policy: expect.objectContaining({
            surface: "legal_decision",
            outcome: "requires_approval",
            requires_approval: true,
          }),
          hermes_trajectory: expect.objectContaining({
            events: expect.any(Array),
          }),
        }),
        legal_operator_state: expect.objectContaining({
          status: "awaiting_human_approval",
          safeNextAction: expect.objectContaining({ action: "generate_first_draft" }),
        }),
        external_side_effects_blocked: true,
      }),
    }));
    expect(fromMock).toHaveBeenCalledWith("learning_events");
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "process_mission_plan_created",
      task_id: "brain-task-mission-1",
      payload: expect.objectContaining({
        process_task_id: "process-task-1",
        recommended_action: "generate_first_draft",
        legal_operator_state: expect.objectContaining({
          status: "awaiting_human_approval",
          safeNextAction: expect.objectContaining({ action: "generate_first_draft" }),
        }),
        external_side_effects_blocked: true,
      }),
    }));
  });

  it("injeta metodologia operacional aprovada do tenant no contexto juridico", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    getLegalCaseContextSnapshotMock.mockResolvedValue(makeSnapshot({
      processTask: {
        ...makeSnapshot().processTask,
        legalArea: "Previdenciário",
        stageName: null,
      },
      documentMemory: {
        ...makeSnapshot().documentMemory,
        freshness: "fresh",
        currentPhase: null,
        missingDocuments: ["CNIS"],
      },
      caseBrain: {
        ...makeSnapshot().caseBrain,
        currentPhase: null,
        firstActions: [],
        missingDocuments: ["CNIS"],
      },
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "idle",
      },
    }));
    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_settings") {
        return makeMaybeSingleQuery({
          data: {
            ai_features: {
              operational_methodology: makeOperationalMethodology(),
            },
          },
          error: null,
        });
      }

      return makeGrowthQuery(table, inserts);
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_process_mission_plan",
      capabilityName: "legal_process_mission_plan",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-process-mission-methodology-1",
      brainContext: {
        taskId: "brain-task-mission-methodology-1",
        runId: "brain-run-mission-methodology-1",
        stepId: "brain-step-mission-methodology-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("Metodologia do escritorio");
    expect(result.reply).toContain("CNIS");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      operational_methodology_provided: true,
      operational_methodology_status: "approved",
      operational_methodology_activation: "active_internal",
      operational_methodology_area: "Previdenciario",
      operational_methodology_expected_documents: expect.arrayContaining(["CNIS", "PPP/LTCAT"]),
      legal_operator_state: expect.objectContaining({
        evidenceSummary: expect.objectContaining({
          methodologyStatus: "approved",
          methodologyActivation: "active_internal",
        }),
      }),
    }));
    expect(JSON.stringify(result.outputPayload)).not.toMatch(/global|waze/i);
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      artifactType: "process_mission_plan",
      metadata: expect.objectContaining({
        operational_methodology_status: "approved",
        operational_methodology_area: "Previdenciario",
        process_mission_context: expect.objectContaining({
          methodology: expect.objectContaining({
            status: "approved",
            expectedDocuments: expect.arrayContaining(["CNIS", "indeferimento administrativo"]),
          }),
        }),
      }),
    }));
  });

  it("executa refresh documental quando a missao processual recomenda memoria desatualizada", async () => {
    const missionSnapshot = makeSnapshot({
      documentMemory: {
        ...makeSnapshot().documentMemory,
        syncStatus: "structured",
        lastSyncedAt: "2026-04-01T00:00:00.000Z",
        summaryMaster: "Memória documental antiga.",
        missingDocuments: [],
        freshness: "stale",
      },
    });
    const snapshotAfter = makeSnapshot({
      documentMemory: {
        ...makeSnapshot().documentMemory,
        syncStatus: "synced",
        lastSyncedAt: "2026-05-08T00:00:00.000Z",
        summaryMaster: "Memória documental atualizada.",
        missingDocuments: [],
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
      .mockResolvedValueOnce(missionSnapshot)
      .mockResolvedValueOnce(missionSnapshot)
      .mockResolvedValueOnce(snapshotAfter);
    fromMock.mockImplementation((table: string) => {
      if (table === "process_tasks") return processTaskQuery;
      return { insert: insertMock };
    });
    syncProcessDocumentsMock.mockResolvedValue({
      memory: {},
      structure: {},
      documents: [{ driveFileId: "doc-1", name: "inicial.pdf" }],
      warnings: [],
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_process_mission_execute_next",
      capabilityName: "legal_process_mission_execute_next",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-process-exec-1",
      brainContext: {
        taskId: "brain-task-process-exec-1",
        runId: "brain-run-process-exec-1",
        stepId: "brain-step-process-exec-1",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("## Execucao da missao processual");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      process_task_id: "process-task-1",
      process_mission_recommended_action: "refresh_document_memory",
      executed_capability: "legal_document_memory_refresh",
      step_status: "executed",
      legal_operator_state: expect.objectContaining({
        status: "ready_internal_action",
        safeNextAction: expect.objectContaining({
          action: "refresh_document_memory",
          canAutoExecute: true,
        }),
      }),
    }));
    expect(syncProcessDocumentsMock).toHaveBeenCalledTimes(1);
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      artifactType: "process_mission_step_result",
      metadata: expect.objectContaining({
        process_task_id: "process-task-1",
        result_status: "executed",
        executed_capability: "legal_document_memory_refresh",
        legal_operator_state: expect.objectContaining({
          status: "ready_internal_action",
          safeNextAction: expect.objectContaining({ action: "refresh_document_memory" }),
        }),
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "process_mission_step_executed",
      payload: expect.objectContaining({
        process_task_id: "process-task-1",
        recommended_action: "refresh_document_memory",
        executed_capability: "legal_document_memory_refresh",
        legal_operator_state: expect.objectContaining({
          status: "ready_internal_action",
          safeNextAction: expect.objectContaining({ action: "refresh_document_memory" }),
        }),
      }),
    }));
  });

  it("registra erro auditavel quando refresh documental da missao falha", async () => {
    const missionSnapshot = makeSnapshot({
      documentMemory: {
        ...makeSnapshot().documentMemory,
        syncStatus: "structured",
        lastSyncedAt: "2026-04-01T00:00:00.000Z",
        summaryMaster: "Memória documental antiga.",
        missingDocuments: [],
        freshness: "stale",
      },
    });
    const processTaskQuery = makeMaybeSingleQuery({
      data: {
        id: "process-task-1",
        tenant_id: "tenant-1",
        drive_link: "https://drive.google.com/drive/folders/e2e-historico-formal-mayus",
        drive_folder_id: "e2e-historico-formal-mayus",
      },
      error: null,
    });

    getLegalCaseContextSnapshotMock
      .mockResolvedValueOnce(missionSnapshot)
      .mockResolvedValueOnce(missionSnapshot);
    fromMock.mockImplementation((table: string) => {
      if (table === "process_tasks") return processTaskQuery;
      return { insert: insertMock };
    });
    getTenantGoogleDriveContextMock.mockRejectedValueOnce(new Error("GoogleDriveNotConfigured"));

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_process_mission_execute_next",
      capabilityName: "legal_process_mission_execute_next",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-process-exec-refresh-failed",
      brainContext: {
        taskId: "brain-task-process-refresh-failed",
        runId: "brain-run-process-refresh-failed",
        stepId: "brain-step-process-refresh-failed",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("failed");
    expect(result.reply).toContain("GoogleDriveNotConfigured");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      process_task_id: "process-task-1",
      process_mission_recommended_action: "refresh_document_memory",
      executed_capability: "legal_document_memory_refresh",
      step_status: "failed",
      step_output_payload: expect.objectContaining({
        error_message: "GoogleDriveNotConfigured",
      }),
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      artifactType: "process_mission_step_result",
      metadata: expect.objectContaining({
        process_task_id: "process-task-1",
        result_status: "failed",
        executed_capability: "legal_document_memory_refresh",
        error_message: "GoogleDriveNotConfigured",
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "process_mission_step_executed",
      payload: expect.objectContaining({
        process_task_id: "process-task-1",
        result_status: "failed",
        executed_capability: "legal_document_memory_refresh",
        error_message: "GoogleDriveNotConfigured",
      }),
    }));
  });

  it("bloqueia execucao da missao processual quando a confianca e baixa", async () => {
    getLegalCaseContextSnapshotMock.mockResolvedValue(makeSnapshot({
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
    }));

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_process_mission_execute_next",
      capabilityName: "legal_process_mission_execute_next",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-process-exec-low",
      brainContext: {
        taskId: "brain-task-process-exec-low",
        runId: "brain-run-process-exec-low",
        stepId: "brain-step-process-exec-low",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.reply).toContain("bloqueada para supervisao");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      process_mission_confidence: "low",
      blocked_reason: "low_confidence_process_mission",
      legal_operator_state: expect.objectContaining({
        status: "blocked",
        blockers: expect.arrayContaining(["low_confidence_process_mission"]),
      }),
      external_side_effects_blocked: true,
    }));
    expect(syncProcessDocumentsMock).not.toHaveBeenCalled();
  });

  it("bloqueia execucao da missao processual quando o Case Brain aponta contradicao critica", async () => {
    getLegalCaseContextSnapshotMock.mockResolvedValue(makeSnapshot({
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "completed",
        artifactId: "draft-artifact-1",
        caseBrainTaskId: "case-brain-antigo",
        generatedAt: "2026-04-19T10:00:00.000Z",
      },
    }));

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_process_mission_execute_next",
      capabilityName: "legal_process_mission_execute_next",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-process-exec-case-brain-contradiction",
      brainContext: {
        taskId: "brain-task-case-brain-contradiction",
        runId: "brain-run-case-brain-contradiction",
        stepId: "brain-step-case-brain-contradiction",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.reply).toContain("bloqueada para supervisao");
    expect(result.reply).toContain("contradicao critica");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      blocked_reason: "case_brain_high_contradiction",
      case_brain_contradiction_count: expect.any(Number),
      external_side_effects_blocked: true,
    }));
    expect(syncProcessDocumentsMock).not.toHaveBeenCalled();
    expect(executeDraftFactoryForProcessTaskMock).not.toHaveBeenCalled();
  });

  it("bloqueia execucao automatica quando movimentacao recente exige acao", async () => {
    getLegalCaseContextSnapshotMock.mockResolvedValue(makeSnapshot({
      documentMemory: {
        ...makeSnapshot().documentMemory,
        freshness: "stale",
        lastSyncedAt: "2026-04-01T00:00:00.000Z",
      },
    }));
    fromMock.mockImplementation((table: string) => {
      if (table === "process_documents") return makeListQuery({ data: [], error: null });
      if (table === "process_movimentacoes") return makeListQuery({
        data: [{
          data: "2026-05-10T00:00:00.000Z",
          conteudo: "Intimacao publicada para manifestacao em prazo curto.",
          fonte: "escavador",
          tipo_evento: "intimacao",
          requer_acao: true,
          acao_sugerida: "Conferir prazo e providencia com advogado responsavel.",
          confianca_analise: "high",
          created_at: null,
        }],
        error: null,
      });
      if (table === "process_movimentacoes_inbox") return makeMaybeSingleQuery({ data: null, error: null });
      return { insert: insertMock };
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_process_mission_execute_next",
      capabilityName: "legal_process_mission_execute_next",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-process-exec-action-movement",
      brainContext: {
        taskId: "brain-task-action-movement",
        runId: "brain-run-action-movement",
        stepId: "brain-step-action-movement",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.reply).toContain("movimentacao recente que exige acao");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      process_mission_recommended_action: "refresh_document_memory",
      blocked_reason: "case_brain_action_movement",
      case_brain_risk_count: expect.any(Number),
      external_side_effects_blocked: true,
    }));
    expect(syncProcessDocumentsMock).not.toHaveBeenCalled();
  });

  it("abre aprovacao supervisionada quando a missao recomenda primeira minuta", async () => {
    getLegalCaseContextSnapshotMock.mockResolvedValue(makeSnapshot({
      documentMemory: {
        ...makeSnapshot().documentMemory,
        syncStatus: "synced",
        lastSyncedAt: "2026-05-08T00:00:00.000Z",
        summaryMaster: "Memória documental atualizada.",
        missingDocuments: [],
        freshness: "fresh",
      },
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "idle",
        recommendedPieceInput: "Contestação",
        recommendedPieceLabel: "Contestação Previdenciária",
      },
    }));

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_process_mission_execute_next",
      capabilityName: "legal_process_mission_execute_next",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-process-exec-blocked",
      brainContext: {
        taskId: "brain-task-draft-approval",
        runId: "brain-run-draft-approval",
        stepId: "brain-step-draft-approval",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("awaiting_approval");
    expect(result.reply).toContain("Missao juridica supervisionada");
    expect(result.reply).toContain("aguardando aprovacao humana");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      auditLogId: "approval-audit-draft-1",
      process_mission_recommended_action: "generate_first_draft",
      case_brain_risk_count: 0,
      case_brain_high_contradiction_count: 0,
      proposed_capability: "legal_first_draft_generate",
      proposed_handler_type: "lex_first_draft_generate",
      approval_required: true,
      legal_operator_state: expect.objectContaining({
        status: "awaiting_human_approval",
        safeNextAction: expect.objectContaining({
          action: "generate_first_draft",
          requiresApproval: true,
        }),
      }),
      external_side_effects_blocked: true,
      awaitingPayload: expect.objectContaining({
        skillName: "legal_first_draft_generate",
        riskLevel: "high",
        operationalThesis: expect.objectContaining({
          openClawReason: expect.stringContaining("Draft Factory"),
          sourcesUsed: expect.arrayContaining(["case_brain"]),
        }),
        sources_used_before_draft_factory: expect.arrayContaining(["case_brain"]),
        openclaw_reason: expect.stringContaining("Draft Factory"),
        processMissionContext: expect.objectContaining({
          recommendedAction: "generate_first_draft",
        }),
        methodology: expect.any(Object),
        sources: expect.objectContaining({
          factual: expect.any(Array),
        }),
        gaps: expect.objectContaining({
          all: expect.any(Array),
        }),
        recommendedAction: "generate_first_draft",
        sideEffectGuardrail: expect.objectContaining({
          approvalGate: "humanGate",
        }),
        openclawPolicy: expect.objectContaining({
          surface: "legal_decision",
          outcome: "requires_approval",
          requires_approval: true,
        }),
        hermesTrajectory: expect.objectContaining({
          events: expect.any(Array),
        }),
        legalOperatorState: expect.objectContaining({
          status: "awaiting_human_approval",
          safeNextAction: expect.objectContaining({ action: "generate_first_draft" }),
        }),
        entities: expect.objectContaining({
          process_task_id: "process-task-1",
          process_number: "E2E-2026-0001",
          recommended_piece_input: "Contestação",
          recommended_piece_label: "Contestação Previdenciária",
        }),
      }),
    }));
    expect(createAgentAuditLogMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      userId: "user-1",
      skillInvoked: "legal_first_draft_generate",
      status: "awaiting_approval",
      approvalStatus: "pending",
      approvalContext: expect.objectContaining({
        case_brain_risk_count: 0,
        case_brain_high_risk_count: 0,
        case_brain_contradiction_count: 0,
        case_brain_high_contradiction_count: 0,
        piece_context: expect.objectContaining({
          piece_label: expect.any(String),
          draft_verification_checklist: expect.any(Array),
        }),
        draft_verification_checklist: expect.any(Array),
        processMissionContext: expect.objectContaining({
          recommendedAction: "generate_first_draft",
        }),
        openclaw_policy: expect.objectContaining({
          surface: "legal_decision",
          outcome: "requires_approval",
        }),
        hermes_trajectory: expect.objectContaining({
          events: expect.any(Array),
        }),
        legal_operator_state: expect.objectContaining({
          status: "awaiting_human_approval",
          safeNextAction: expect.objectContaining({ action: "generate_first_draft" }),
        }),
      }),
      pendingExecutionPayload: expect.objectContaining({
        skillName: "legal_first_draft_generate",
        entities: expect.objectContaining({ process_task_id: "process-task-1" }),
        pieceContext: expect.objectContaining({
          piece_label: expect.any(String),
          draft_verification_checklist: expect.any(Array),
        }),
        draftVerificationChecklist: expect.any(Array),
        processMissionContext: expect.objectContaining({
          recommendedAction: "generate_first_draft",
        }),
        sideEffectGuardrail: expect.objectContaining({
          approvalGate: "humanGate",
        }),
        openclaw_policy: expect.objectContaining({
          surface: "legal_decision",
          outcome: "requires_approval",
        }),
        legal_operator_state: expect.objectContaining({
          status: "awaiting_human_approval",
          safeNextAction: expect.objectContaining({ action: "generate_first_draft" }),
        }),
      }),
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      artifactType: "process_mission_step_result",
      metadata: expect.objectContaining({
        result_status: "blocked",
        executed_capability: "legal_first_draft_generate",
        step_output_payload: expect.objectContaining({
          approval_audit_log_id: "approval-audit-draft-1",
          proposed_capability: "legal_first_draft_generate",
          legal_operator_state: expect.objectContaining({
            status: "awaiting_human_approval",
            safeNextAction: expect.objectContaining({ action: "generate_first_draft" }),
          }),
        }),
      }),
    }));
    expect(syncProcessDocumentsMock).not.toHaveBeenCalled();
    expect(executeDraftFactoryForProcessTaskMock).not.toHaveBeenCalled();
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
      progressSummary: "Contexto juridico consolidado.",
      currentPhase: "Contestação",
      nextStep: "Revisar a minuta com base no acervo validado.",
      pendingItems: [],
      summary: "Contexto juridico consolidado.",
      grounding: {
        factualSources: ["resumo do Case Brain", "fase do Case Brain"],
        inferenceNotes: [],
        missingSignals: ["pendencias documentais registradas"],
      },
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
      support_status_progress_summary: "Contexto juridico consolidado.",
      support_status_current_phase: "Contestação",
      support_status_next_step: "Revisar a minuta com base no acervo validado.",
      support_status_pending_count: 0,
      support_status_factual_source_count: 2,
      support_status_inference_count: 0,
      support_status_missing_signal_count: 1,
      support_status_handoff_reason: null,
      legal_operator_state: expect.objectContaining({
        status: "ready_internal_action",
        safeNextAction: expect.objectContaining({ action: "refresh_document_memory" }),
      }),
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
        support_status_progress_summary: "Contexto juridico consolidado.",
        support_status_current_phase: "Contestação",
        support_status_factual_sources: ["resumo do Case Brain", "fase do Case Brain"],
        support_status_inference_notes: [],
        support_status_missing_signals: ["pendencias documentais registradas"],
        legal_operator_state: expect.objectContaining({
          status: "ready_internal_action",
          safeNextAction: expect.objectContaining({ action: "refresh_document_memory" }),
        }),
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
        progress_summary: "Contexto juridico consolidado.",
        factual_sources: ["resumo do Case Brain", "fase do Case Brain"],
        inference_notes: [],
        missing_signals: ["pendencias documentais registradas"],
        legal_operator_state: expect.objectContaining({
          status: "ready_internal_action",
          safeNextAction: expect.objectContaining({ action: "refresh_document_memory" }),
        }),
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

  it("bloqueia Draft Factory direta sem approval humano aprovado", async () => {
    getLegalCaseContextSnapshotMock.mockResolvedValue(makeSnapshot({
      documentMemory: {
        ...makeSnapshot().documentMemory,
        freshness: "fresh",
      },
    }));
    fromMock.mockImplementation((table: string) => {
      if (table === "agent_audit_logs") {
        return makeMaybeSingleQuery({ data: null, error: null });
      }

      return { insert: insertMock };
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_first_draft_generate",
      capabilityName: "legal_first_draft_generate",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-direct-draft",
      brainContext: {
        taskId: "brain-task-direct-draft",
        runId: "brain-run-direct-draft",
        stepId: "brain-step-direct-draft",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.reply).toContain("bloqueada para approval humano");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      blocked_reason: "draft_generation_approval_not_found",
      approval_required: true,
      approval_status: "missing_or_unapproved",
      external_side_effects_blocked: true,
    }));
    expect(executeDraftFactoryForProcessTaskMock).not.toHaveBeenCalled();
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      artifactType: "legal_first_draft_result",
      metadata: expect.objectContaining({
        result_status: "failed",
        process_task_id: "process-task-1",
        error_message: expect.stringContaining("Aprovacao humana da minuta nao foi encontrada"),
        external_side_effects_blocked: true,
      }),
    }));
  });

  it("bloqueia Draft Factory com approval aprovado que nao veio da missao processual", async () => {
    getLegalCaseContextSnapshotMock.mockResolvedValue(makeSnapshot({
      documentMemory: {
        ...makeSnapshot().documentMemory,
        freshness: "fresh",
      },
    }));
    fromMock.mockImplementation((table: string) => {
      if (table === "agent_audit_logs") {
        return makeApprovedLegalFirstDraftApprovalQuery({
          approval_context: { source_capability: "legal_first_draft_generate" },
          pending_execution_payload: { source: "manual_draft_factory" },
        });
      }

      return { insert: insertMock };
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_first_draft_generate",
      capabilityName: "legal_first_draft_generate",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-direct-approved-draft",
      brainContext: {
        taskId: "brain-task-direct-approved-draft",
        runId: "brain-run-direct-approved-draft",
        stepId: "brain-step-direct-approved-draft",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      blocked_reason: "draft_generation_approval_source_mismatch",
      approval_required: true,
      external_side_effects_blocked: true,
    }));
    expect(executeDraftFactoryForProcessTaskMock).not.toHaveBeenCalled();
  });

  it("bloqueia Draft Factory com approval sem aprovador humano completo", async () => {
    getLegalCaseContextSnapshotMock.mockResolvedValue(makeSnapshot({
      documentMemory: {
        ...makeSnapshot().documentMemory,
        freshness: "fresh",
      },
    }));
    fromMock.mockImplementation((table: string) => {
      if (table === "agent_audit_logs") {
        return makeApprovedLegalFirstDraftApprovalQuery({ approved_by: null });
      }

      return { insert: insertMock };
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_first_draft_generate",
      capabilityName: "legal_first_draft_generate",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-approved-without-human",
      brainContext: {
        taskId: "brain-task-approved-without-human",
        runId: "brain-run-approved-without-human",
        stepId: "brain-step-approved-without-human",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      blocked_reason: "draft_generation_approval_not_approved",
      approval_required: true,
      external_side_effects_blocked: true,
    }));
    expect(executeDraftFactoryForProcessTaskMock).not.toHaveBeenCalled();
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
    fromMock.mockImplementation((table: string) => {
      if (table === "agent_audit_logs") {
        return makeApprovedLegalFirstDraftApprovalQuery();
      }

      return { insert: insertMock };
    });
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
        external_side_effects_blocked: true,
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "legal_first_draft_requested_via_chat",
      task_id: "brain-task-2",
      payload: expect.objectContaining({
        process_task_id: "process-task-1",
        draft_factory_task_id: "draft-factory-task-1",
        approval_status: "approved",
        approval_audit_log_id: "audit-2",
        external_side_effects_blocked: true,
        piece_label: "Contestação Previdenciária",
      }),
    }));
  });

  it("bloqueia Draft Factory direta quando metodologia do tenant ainda nao foi aprovada", async () => {
    const recommendedMethodology = makeOperationalMethodology({
      status: "recommended",
      intake: {
        required_documents_by_case: ["procuração"],
        methodology_base_used: true,
      },
      area_methods: [{
        area: "Previdenciario",
        intake_questions: ["Qual beneficio foi indeferido"],
        required_documents: ["CNIS", "indeferimento administrativo"],
        phases: ["Triagem previdenciaria", "Analise CNIS"],
        document_structure: ["01 Documentos pessoais", "02 CNIS"],
        owner_team: "Juridico previdenciario",
        validation_status: "needs_area_review",
        next_review_question: "Validar fluxo previdenciario com o socio.",
      }],
    });

    getLegalCaseContextSnapshotMock.mockResolvedValue(makeSnapshot({
      documentMemory: {
        ...makeSnapshot().documentMemory,
        freshness: "fresh",
      },
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "idle",
      },
    }));
    fromMock.mockImplementation((table: string) => {
      if (table === "agent_audit_logs") {
        return makeApprovedLegalFirstDraftApprovalQuery();
      }

      if (table === "tenant_settings") {
        return makeMaybeSingleQuery({
          data: {
            ai_features: {
              operational_methodology: recommendedMethodology,
            },
          },
          error: null,
        });
      }

      return { insert: insertMock };
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_first_draft_generate",
      capabilityName: "legal_first_draft_generate",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: { process_number: "E2E-2026-0001" },
      auditLogId: "audit-draft-methodology-block",
      brainContext: {
        taskId: "brain-task-draft-methodology-block",
        runId: "brain-run-draft-methodology-block",
        stepId: "brain-step-draft-methodology-block",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("blocked");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      blocked_reason: "operational_methodology_requires_review",
      operational_methodology_status: "recommended",
      operational_methodology_activation: "supervised_suggestion",
      operational_methodology_requires_human_review: true,
    }));
    expect(executeDraftFactoryForProcessTaskMock).not.toHaveBeenCalled();
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      artifactType: "legal_first_draft_result",
      metadata: expect.objectContaining({
        result_status: "failed",
        operational_methodology_status: "recommended",
        operational_methodology_blockers: expect.arrayContaining(["methodology_not_approved"]),
        process_mission_context: expect.objectContaining({
          methodology: expect.objectContaining({
            status: "recommended",
            activation: "supervised_suggestion",
          }),
        }),
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

  it("gera Case Brain 2.0 com cronologia, riscos e contradicoes", async () => {
    const snapshot = makeSnapshot({
      processTask: {
        ...makeSnapshot().processTask,
        stageName: "Inicial",
      },
      caseBrain: {
        ...makeSnapshot().caseBrain,
        taskId: "case-brain-atual",
        currentPhase: "Contestação",
        missingDocuments: ["contracheque atualizado"],
        readyForCaseLawCitations: false,
      },
      documentMemory: {
        ...makeSnapshot().documentMemory,
        freshness: "stale",
        currentPhase: "Contestação",
        missingDocuments: ["extrato bancario"],
      },
      firstDraft: {
        ...makeSnapshot().firstDraft,
        status: "completed",
        artifactId: "draft-artifact-1",
        caseBrainTaskId: "case-brain-antigo",
        isStale: true,
      },
    });

    getLegalCaseContextSnapshotMock.mockResolvedValue(snapshot);
    fromMock.mockImplementation((table: string) => {
      if (table === "process_documents") {
        return makeListQuery({
          data: [
            {
              id: "doc-1",
              name: "contestacao.pdf",
              document_type: "contestacao",
              extraction_status: "extracted",
              folder_label: "03-Contestacao",
              modified_at: "2026-05-07T00:00:00.000Z",
            },
            {
              id: "doc-2",
              name: "audio-cliente.mp3",
              document_type: null,
              extraction_status: "skipped",
              folder_label: "Raiz do Processo",
              modified_at: "2026-05-06T00:00:00.000Z",
            },
          ],
          error: null,
        });
      }
      if (table === "process_document_contents") {
        return makeListQuery({
          data: [
            {
              process_document_id: "doc-1",
              excerpt: "Banco afirma regularidade da contratacao.",
              extraction_status: "extracted",
            },
          ],
          error: null,
        });
      }
      if (table === "process_movimentacoes") {
        return makeListQuery({
          data: [
            {
              data: "2026-05-10",
              conteudo: "Intimada a parte autora para manifestacao sobre contestacao no prazo legal.",
              fonte: "diario_oficial",
              tipo_evento: "contestacao_protocolada",
              requer_acao: true,
              acao_sugerida: "Preparar replica e conferir prazo fatal.",
              confianca_analise: "high",
              created_at: "2026-05-10T00:00:00.000Z",
            },
          ],
          error: null,
        });
      }
      if (table === "process_movimentacoes_inbox") {
        return makeMaybeSingleQuery({ data: null, error: null });
      }
      return { insert: insertMock };
    });

    const result = await dispatchCapabilityExecution({
      handlerType: "lex_case_brain_insights",
      capabilityName: "legal_case_brain_insights",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: {
        process_number: "E2E-2026-0001",
      },
      auditLogId: "audit-case-brain-2",
      brainContext: {
        taskId: "brain-task-case-brain-2",
        runId: "brain-run-case-brain-2",
        stepId: "brain-step-case-brain-2",
        sourceModule: "mayus",
      },
    });

    expect(result.status).toBe("executed");
    expect(result.reply).toContain("## Case Brain 2.0");
    expect(result.outputPayload).toEqual(expect.objectContaining({
      case_brain_insights_confidence: "medium",
      risk_count: expect.any(Number),
      contradiction_count: expect.any(Number),
      evidence_document_count: 2,
      evidence_movement_count: 1,
      legal_operator_state: expect.objectContaining({
        status: "ready_internal_action",
        safeNextAction: expect.objectContaining({ action: "refresh_document_memory" }),
      }),
      external_side_effects_blocked: true,
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-case-brain-2",
      artifactType: "legal_case_brain_insights",
      metadata: expect.objectContaining({
        process_task_id: "process-task-1",
        risk_count: expect.any(Number),
        contradiction_count: expect.any(Number),
        evidence_document_count: 2,
        evidence_movement_count: 1,
        legal_operator_state: expect.objectContaining({
          status: "ready_internal_action",
          safeNextAction: expect.objectContaining({ action: "refresh_document_memory" }),
        }),
        external_side_effects_blocked: true,
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "legal_case_brain_insights_created",
      task_id: "brain-task-case-brain-2",
      payload: expect.objectContaining({
        process_task_id: "process-task-1",
        risk_count: expect.any(Number),
        contradiction_count: expect.any(Number),
        legal_operator_state: expect.objectContaining({
          status: "ready_internal_action",
          safeNextAction: expect.objectContaining({ action: "refresh_document_memory" }),
        }),
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
