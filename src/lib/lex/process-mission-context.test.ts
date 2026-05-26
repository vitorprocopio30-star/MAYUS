import { describe, expect, it } from "vitest";
import type { OfficeOperationalMethodology } from "@/lib/setup/office-setup-conversation";
import { buildTenantOperationalMethodologyContext } from "@/lib/setup/tenant-operational-methodology";
import type { LegalCaseContextSnapshot } from "./case-context";
import { buildLegalOperatorState, buildProcessMissionContext } from "./process-mission-context";

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

function makeMethodology(overrides: Partial<OfficeOperationalMethodology> = {}): OfficeOperationalMethodology {
  return {
    status: "approved",
    identity: {
      office_name: "Dutra Advocacia",
      practice_areas: ["Bancario/RMC"],
      ideal_client: "Aposentados com descontos bancarios indevidos",
      unique_value_proposition: "Atendimento consultivo com prova documental",
      value_pillars: ["clareza", "seguranca"],
      anti_client_signals: ["quer promessa de resultado"],
      communication_tone: "curto e consultivo",
      forbidden_claims: ["nao prometer resultado"],
    },
    intake: {
      methodology_base_used: false,
      rules: ["perguntar origem do desconto"],
      required_documents_by_case: ["RG", "Comprovante de residencia"],
      human_handoff_rules: ["risco juridico chama humano"],
      response_sla: "1 hora",
      missing_information_policy: "pedir uma informacao por vez",
    },
    case_flow: {
      phases: [
        {
          name: "Triagem",
          owner_team: "juridico",
          advance_criteria: "documentos minimos recebidos",
          block_criteria: "sem autorizacao do cliente",
        },
      ],
      departments: ["juridico"],
      permission_policy: "socio aprova contrato",
      calendar_policy: "prazo com conferencia humana",
      finance_policy: "honorarios supervisionados",
    },
    area_methods: [
      {
        area: "Bancario/RMC",
        intake_questions: ["qual banco?", "qual desconto?"],
        required_documents: ["Contrato", "Extrato", "Contracheque"],
        phases: ["Entrevista", "Documentos", "Analise", "Replica"],
        document_structure: ["01-Contrato", "02-Extratos"],
        owner_team: "juridico",
        validation_status: "validated",
        next_review_question: "Confirmar fluxo RMC.",
      },
    ],
    improvement_rules: [],
    internet_policy: {
      enabled: true,
      allowed_sources: ["tribunais", "gov.br"],
      required_citation_fields: ["fonte", "link", "data"],
      usage: "sugerir revisao, nunca ativar regra sozinho",
      sensitive_data_policy: "nao enviar dados de cliente",
      no_auto_activation: true,
    },
    updated_at: "2026-05-22T00:00:00.000Z",
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
    expect(context.legalDuty).toEqual(expect.objectContaining({
      representedPole: null,
      obligationOwner: null,
      confidence: "not_available",
    }));
    expect(context.confidence).toBe("high");
    expect(context.recommendedAction).toBe("generate_first_draft");
    expect(context.operationalThesis).toEqual(expect.objectContaining({
      thesis: expect.stringContaining("Gerar primeira minuta"),
      sourcesUsed: expect.arrayContaining(["case_brain", "fresh_document_memory"]),
      openClawReason: expect.stringContaining("Draft Factory"),
      nextActionBeforeDraftFactory: expect.stringContaining("approval humano"),
    }));
    expect(context.grounding.factualSources).toEqual(expect.arrayContaining([
      "case_brain",
      "fresh_document_memory",
      "case_brain_first_actions",
    ]));
    expect(context.grounding.inferenceNotes).toContain("legal_duty_not_consolidated");

    const operatorState = buildLegalOperatorState(context);
    expect(operatorState).toEqual(expect.objectContaining({
      phase: "Replica",
      status: "awaiting_human_approval",
      coordination: expect.objectContaining({
        owner: {
          front: "front_a",
          label: "Frente A - Juridico/Lex",
          domain: "juridico_lex",
        },
        crossFrontBoundary: expect.objectContaining({
          ownedScope: "legal_mission_context",
          handoffRequiredFor: expect.arrayContaining([
            "front_b",
            "dispatcher",
            "control_plane",
          ]),
        }),
        sideEffectGuardrail: expect.objectContaining({
          approvalGate: "humanGate",
          requiresHumanApprovalForLegalSideEffects: true,
          blocksExternalSideEffectsUntilHumanApproval: true,
          protectedSideEffects: expect.arrayContaining([
            "draft_factory_generation",
            "cross_front_mutation",
          ]),
        }),
      }),
      safeNextAction: expect.objectContaining({
        action: "generate_first_draft",
        requiresApproval: true,
        externalSideEffectsBlocked: true,
      }),
      humanGate: expect.objectContaining({
        required: true,
        blocksExternalAction: true,
      }),
      evidenceSummary: expect.objectContaining({
        confidence: "high",
        documentFreshness: "fresh",
        documentCount: 5,
        legalDuty: expect.objectContaining({
          confidence: "not_available",
        }),
      }),
    }));
  });

  it("consolida polo e obrigacao quando Case Brain traz sinal explicito", () => {
    const context = buildProcessMissionContext(makeSnapshot({
      caseBrain: {
        ...makeSnapshot().caseBrain,
        summaryMaster: [
          "Banco apresentou contestacao.",
          "polo_representado: autor.",
          "obrigacao_de_quem: escritorio.",
        ].join(" "),
      },
    }));

    expect(context.legalDuty).toEqual(expect.objectContaining({
      representedPole: "autor",
      obligationOwner: "escritorio",
      confidence: "confirmed",
      evidence: expect.arrayContaining([
        "case_brain_summary:polo_representado",
        "case_brain_summary:obrigacao_de_quem",
      ]),
      sources: ["case_brain_summary"],
    }));
    expect(context.grounding.factualSources).toContain("legal_duty_signal");
    expect(context.operationalThesis.gaps).not.toContain("legal_duty_not_consolidated");
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

    const operatorState = buildLegalOperatorState(context);
    expect(operatorState.status).toBe("ready_internal_action");
    expect(operatorState.safeNextAction).toEqual(expect.objectContaining({
      action: "refresh_document_memory",
      canAutoExecute: true,
      requiresApproval: false,
    }));
    expect(operatorState.coordination?.sideEffectGuardrail).toEqual(expect.objectContaining({
      approvalGate: "humanGate",
      requiresHumanApprovalForLegalSideEffects: true,
      blocksExternalSideEffectsUntilHumanApproval: true,
    }));
    expect(operatorState.blockers).toContain("stale_document_memory");
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

    const operatorState = buildLegalOperatorState(context);
    expect(operatorState.status).toBe("blocked");
    expect(operatorState.humanGate.required).toBe(true);
    expect(operatorState.coordination?.owner.label).toBe("Frente A - Juridico/Lex");
    expect(operatorState.coordination?.sideEffectGuardrail.protectedSideEffects).toContain("process_state_mutation");
    expect(operatorState.blockers).toEqual(expect.arrayContaining([
      "low_confidence_process_mission",
      "missing:document_memory",
      "missing:case_brain_task",
    ]));
    expect(context.operationalThesis.openClawReason).toContain("insuficiente");
    expect(context.operationalThesis.blockers).toEqual(expect.arrayContaining([
      "low_confidence_process_mission",
      "missing_document_memory",
    ]));
  });

  it("carrega metodologia aprovada do tenant como contexto juridico por area", () => {
    const operationalMethodology = buildTenantOperationalMethodologyContext(makeMethodology());
    const context = buildProcessMissionContext(makeSnapshot(), { operationalMethodology });

    expect(context.methodology).toEqual(expect.objectContaining({
      provided: true,
      status: "approved",
      activation: "active_internal",
      canGuideInternalDecisions: true,
      requiresHumanReview: false,
      areaNeedsReview: false,
      ownerTeam: "juridico",
      nextReviewQuestion: "Confirmar fluxo RMC.",
    }));
    expect(context.methodology.areaMethod).toEqual(expect.objectContaining({
      area: "Bancario/RMC",
      validationStatus: "validated",
    }));
    expect(context.methodology.expectedDocuments).toEqual(expect.arrayContaining([
      "Contrato",
      "Extrato",
      "Contracheque",
      "RG",
    ]));
    expect(context.methodology.expectedPhases).toEqual([
      "Entrevista",
      "Documentos",
      "Analise",
      "Replica",
    ]);
    expect(context.methodology.expectedDocumentStructure).toEqual(["01-Contrato", "02-Extratos"]);
    expect(context.methodology.expectedIntakeQuestions).toEqual(["qual banco?", "qual desconto?"]);
    expect(context.methodology.reviewCriteria).toEqual(expect.arrayContaining([
      "status:approved",
      "activation:active_internal",
      "area_method_validation:validated",
    ]));
    expect(context.methodology.blockers).toEqual([]);
    expect(context.grounding.factualSources).toEqual(expect.arrayContaining([
      "tenant_operational_methodology",
      "tenant_operational_area_method",
    ]));

    const operatorState = buildLegalOperatorState(context);
    expect(operatorState.evidenceSummary).toEqual(expect.objectContaining({
      methodologyStatus: "approved",
      methodologyActivation: "active_internal",
      methodologyReviewReasons: [],
    }));
  });

  it("bloqueia autoexecucao juridica quando metodologia nao esta aprovada ou area precisa revisao", () => {
    const baseMethodology = makeMethodology();
    const operationalMethodology = buildTenantOperationalMethodologyContext(makeMethodology({
      status: "recommended",
      intake: {
        ...baseMethodology.intake,
        methodology_base_used: true,
      },
      area_methods: [
        {
          ...baseMethodology.area_methods[0],
          validation_status: "needs_area_review",
        },
      ],
    }));
    const context = buildProcessMissionContext(makeSnapshot({
      caseBrain: {
        ...makeSnapshot().caseBrain,
        missingDocuments: ["Contrato"],
      },
      documentMemory: {
        ...makeSnapshot().documentMemory,
        freshness: "stale",
        missingDocuments: ["Contrato"],
      },
    }), { operationalMethodology });

    expect(context.recommendedAction).toBe("refresh_document_memory");
    expect(context.methodology).toEqual(expect.objectContaining({
      status: "recommended",
      activation: "supervised_suggestion",
      canGuideInternalDecisions: false,
      requiresHumanReview: true,
      areaNeedsReview: true,
      missingExpectedDocuments: ["Contrato"],
    }));
    expect(context.methodology.reviewReasons).toEqual(expect.arrayContaining([
      "methodology_recommended_not_approved",
      "methodology_base_requires_tenant_validation",
      "area_methods_need_review",
    ]));
    expect(context.methodology.blockers).toEqual(expect.arrayContaining([
      "methodology_not_approved",
      "methodology_requires_human_review",
      "methodology_area_needs_review",
      "methodology:methodology_recommended_not_approved",
      "methodology:area_methods_need_review",
    ]));
    expect(context.grounding.inferenceNotes).toContain("tenant_methodology_requires_review");

    const operatorState = buildLegalOperatorState(context);
    expect(operatorState.status).toBe("awaiting_supervision");
    expect(operatorState.safeNextAction).toEqual(expect.objectContaining({
      action: "refresh_document_memory",
      canAutoExecute: false,
      requiresApproval: true,
    }));
    expect(operatorState.humanGate).toEqual(expect.objectContaining({
      required: true,
      reason: "Metodologia operacional do tenant ainda exige revisao humana antes de orientar execucao juridica sensivel.",
      blocksExternalAction: true,
    }));
    expect(operatorState.blockers).toEqual(expect.arrayContaining([
      "methodology_not_approved",
      "methodology_area_needs_review",
      "methodology_expected_documents_missing",
      "stale_document_memory",
      "pending_documents",
    ]));
  });
});
