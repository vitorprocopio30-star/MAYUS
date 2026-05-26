import { describe, expect, it } from "vitest";
import {
  buildMayusAgentControlPlane,
  resolveMayusInternalAgentId,
} from "./control-plane";

describe("Mayus Agent Control Plane", () => {
  it("resolve rotinas Paperclip para agentes internos por modulo", () => {
    expect(resolveMayusInternalAgentId({
      agentId: "paperclip",
      module: "legal_ops",
      routineId: "paperclip_deadline_guardian",
    })).toBe("legal_operations_agent");

    expect(resolveMayusInternalAgentId({
      agentId: "paperclip",
      module: "growth",
      routineId: "paperclip_crm_next_step_sweep",
    })).toBe("growth_agent");

    expect(resolveMayusInternalAgentId({
      agentId: "mayus_self_improvement",
      module: "core",
      routineId: "mayus-self-improvement-review",
    })).toBe("mayus_integrator");
  });

  it("calcula health por agente com bloqueio, approvals, budget e memoria sanitizados", () => {
    const controlPlane = buildMayusAgentControlPlane({
      tenantId: "tenant-session",
      routines: [{
        id: "finance-daily-review",
        label: "Revisao financeira diaria",
        agentId: "finance_agent",
        module: "finance",
        source: "paperclip",
        enabled: true,
        paused: false,
        status: "ready",
      }, {
        id: "monitoring-oab-review",
        label: "Revisao de monitoramento Escavador",
        agentId: "monitoring_agent",
        module: "monitoring",
        source: "paperclip",
        enabled: true,
        paused: false,
        status: "blocked",
        reason: "Busca bloqueada por escavador_key=secret-value",
      }],
      missionSnapshots: [{
        missionId: "mission-monitoring",
        status: "awaiting_approval",
        goal: "Revisar excedente Escavador",
        lastUpdatedAt: "2026-05-21T10:00:00.000Z",
        pendingApproval: { id: "approval-1", skillName: "escavador_paid_search", riskLevel: "high" },
        blockers: ["Custo externo exige aceite humano."],
        policy: {
          outcome: "requires_approval",
          surface: "escavador_paid_search",
          source: "tenant_settings.ai_features.agent_profiles",
          reason: "Busca paga exige aceite humano.",
          debugger: {
            precedence: ["global", "tenant", "module", "agent", "tool", "channel"],
            blockedLayer: "tenant",
            blockedReasonCode: "tool_denied",
            appliedLayers: [
              { scope: "global", key: "global", enabled: true, requiresApproval: false, hasAllow: true, hasDeny: false },
              { scope: "tenant", key: "tenant", enabled: true, requiresApproval: true, hasAllow: false, hasDeny: true },
            ],
          },
        },
        timeline: [
          {
            id: "artifact-1",
            source: "artifact",
            title: "Relatorio de excedente",
            status: "draft",
            createdAt: "2026-05-21T10:01:00.000Z",
          },
          {
            id: "event-1",
            source: "event",
            title: "monitoring_overage_blocked",
            status: "blocked",
            createdAt: "2026-05-21T10:02:00.000Z",
          },
        ],
        routine: {
          routineId: "monitoring-oab-review",
          agentId: "monitoring_agent",
          internalAgentId: "monitoring_agent",
        },
        trajectory: {
          status: "waiting_approval",
          latestMemoryId: "memory-1",
          lifecycleStatus: "proposed",
          lifecycleKind: "procedure_proposal",
          lastEventSummary: "Proposta de procedimento aguardando approval.",
        },
      }],
    });

    const monitoringAgent = controlPlane.agents.find((agent) => agent.id === "monitoring_agent");
    const financeAgent = controlPlane.agents.find((agent) => agent.id === "finance_agent");

    expect(monitoringAgent).toEqual(expect.objectContaining({
      coordination: expect.objectContaining({
        workstreamId: "front_b_agentic_core",
        handoffRequired: true,
      }),
      health: expect.objectContaining({
        status: "blocked",
        lastActivityAt: "2026-05-21T10:00:00.000Z",
      }),
      approvalsPending: 1,
      blockersCount: 2,
      memoryLifecycle: expect.objectContaining({
        applied: 0,
        pendingProposals: 1,
        suggestedSkills: 1,
      }),
      activity: expect.objectContaining({
        latestMission: expect.objectContaining({
          id: "mission-monitoring",
          goal: "Revisar excedente Escavador",
        }),
        pendingApproval: expect.objectContaining({
          id: "approval-1",
          skillName: "escavador_paid_search",
        }),
        latestArtifact: expect.objectContaining({ id: "artifact-1" }),
        latestEvent: expect.objectContaining({ id: "event-1" }),
      }),
      openclaw: expect.objectContaining({
        outcome: "requires_approval",
        surface: "escavador_paid_search",
        blockedLayer: "tenant",
        appliedLayersCount: 2,
      }),
      hermes: expect.objectContaining({
        status: "waiting_approval",
        latestMemoryId: "memory-1",
        lifecycleStatus: "proposed",
      }),
      readiness: expect.objectContaining({
        tenantId: "tenant-session",
        status: "blocked",
        primitives: expect.arrayContaining([
          expect.objectContaining({ id: "paperclip", status: "blocked" }),
          expect.objectContaining({ id: "openclaw", status: "blocked" }),
          expect.objectContaining({ id: "hermes", status: "awaiting_approval" }),
        ]),
      }),
    }));
    expect(JSON.stringify(monitoringAgent)).not.toContain("secret-value");
    expect(financeAgent?.health.status).toBe("ready");
    expect(financeAgent?.readiness).toEqual(expect.objectContaining({
      tenantId: "tenant-session",
      status: "ready",
      evidenceSufficient: true,
      primitives: expect.arrayContaining([
        expect.objectContaining({ id: "paperclip", status: "ready" }),
        expect.objectContaining({ id: "openclaw", status: "insufficient_evidence" }),
        expect.objectContaining({ id: "hermes", status: "insufficient_evidence" }),
      ]),
    }));
    expect(controlPlane.summary).toEqual(expect.objectContaining({
      totalAgents: 7,
      pendingApprovals: 1,
      blockers: 2,
      policyPrecedence: ["global", "tenant", "module", "agent", "tool", "channel"],
      coordination: expect.objectContaining({
        status: "blocked",
        workstreams: 3,
        collisionBlockers: 4,
      }),
    }));
    expect(controlPlane.publicAgents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "paperclip",
        matrixMode: "read_only_status",
        status: "blocked",
        operational: expect.objectContaining({
          status: "blocked",
          modulesCovered: expect.arrayContaining(["finance", "monitoring"]),
          approvals: 1,
          blockerCount: 1,
        }),
        paperclip: expect.objectContaining({
          heartbeat: "blocked",
          routines: expect.objectContaining({
            total: 2,
            enabled: 2,
            blocked: 1,
          }),
          approvals: 1,
          budget: expect.objectContaining({
            hardStops: expect.any(Number),
          }),
          portability: expect.objectContaining({
            status: "pending_preflight",
          }),
        }),
      }),
      expect.objectContaining({
        id: "openclaw",
        status: "blocked",
        operational: expect.objectContaining({
          status: "blocked",
          approvals: 1,
          blockerCount: 1,
        }),
        openclaw: expect.objectContaining({
          requiresFullMatrix: false,
          precedence: ["global", "tenant", "module", "agent", "tool", "channel"],
          surfaces: ["escavador_paid_search"],
          outcomes: ["requires_approval"],
          blockedLayer: "tenant",
          nextModules: expect.arrayContaining(["setup"]),
        }),
      }),
      expect.objectContaining({
        id: "hermes",
        status: "blocked",
        operational: expect.objectContaining({
          status: "blocked",
          approvals: 1,
          blockerCount: 1,
        }),
        hermes: expect.objectContaining({
          source: "mission_snapshots_read_only",
          missionsObserved: 1,
          latestMemoryId: "memory-1",
          lifecycleStatus: "proposed",
        }),
      }),
    ]));
    expect(controlPlane.tenant_readiness).toEqual(expect.objectContaining({
      tenantId: "tenant-session",
      summary: expect.objectContaining({
        ready: 1,
        blocked: 1,
        awaitingApproval: 0,
        insufficientEvidence: 5,
      }),
      agents: expect.arrayContaining([
        expect.objectContaining({
          agentId: "monitoring_agent",
          status: "blocked",
          primitives: expect.arrayContaining([
            expect.objectContaining({ id: "paperclip" }),
            expect.objectContaining({ id: "openclaw" }),
            expect.objectContaining({ id: "hermes" }),
          ]),
        }),
        expect.objectContaining({
          agentId: "finance_agent",
          status: "ready",
        }),
      ]),
    }));
    expect(JSON.stringify(controlPlane.publicAgents)).not.toContain("secret-value");
  });

  it("expoe coordenacao explicita entre Frente A Juridico/Lex e Frente B Agentic Core", () => {
    const controlPlane = buildMayusAgentControlPlane({
      routines: [{
        id: "lex-human-review",
        label: "Revisao humana Lex",
        agentId: "paperclip",
        module: "legal_ops",
        source: "paperclip",
        enabled: true,
        paused: false,
        status: "ready",
      }, {
        id: "agentic-runtime-review",
        label: "Revisao do runtime agentico",
        agentId: "mayus_self_improvement",
        module: "core",
        source: "paperclip",
        enabled: true,
        paused: false,
        status: "ready",
      }],
      missionSnapshots: [{
        missionId: "mission-lex",
        module: "legal_ops",
        status: "blocked",
        goal: "Preparar contexto juridico para Draft Factory",
        lastUpdatedAt: "2026-05-21T12:00:00.000Z",
        blockers: ["Aguardando revisao humana do advogado."],
        routine: {
          routineId: "lex-human-review",
          agentId: "paperclip",
          internalAgentId: "legal_operations_agent",
        },
      }, {
        missionId: "mission-core",
        module: "core",
        status: "running",
        goal: "Consolidar Agent Control Plane",
        lastUpdatedAt: "2026-05-21T12:05:00.000Z",
        routine: {
          routineId: "agentic-runtime-review",
          agentId: "mayus_self_improvement",
          internalAgentId: "mayus_integrator",
        },
      }],
    });

    const legalWorkstream = controlPlane.coordination.workstreams.find((workstream) => (
      workstream.id === "front_a_juridico_lex"
    ));
    const agenticWorkstream = controlPlane.coordination.workstreams.find((workstream) => (
      workstream.id === "front_b_agentic_core"
    ));
    const legalAgent = controlPlane.agents.find((agent) => agent.id === "legal_operations_agent");
    const integratorAgent = controlPlane.agents.find((agent) => agent.id === "mayus_integrator");

    expect(controlPlane.coordination.status).toBe("blocked");
    expect(controlPlane.coordination.nextCoordinatedStep).toContain("Legal Operations Agent");
    expect(controlPlane.coordination.collisionBlockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "front_b_does_not_mutate_lex_state",
        protectedWorkstreamId: "front_a_juridico_lex",
      }),
      expect.objectContaining({
        id: "front_a_does_not_mutate_agentic_runtime",
        protectedWorkstreamId: "front_b_agentic_core",
      }),
    ]));

    expect(legalWorkstream).toEqual(expect.objectContaining({
      label: "Frente A Juridico/Lex",
      internalAgentIds: ["legal_operations_agent"],
      status: "blocked",
      blockers: 1,
    }));
    expect(agenticWorkstream).toEqual(expect.objectContaining({
      label: "Frente B Agentes Publicos / Core Agentico",
      internalAgentIds: expect.arrayContaining(["mayus_integrator", "monitoring_agent", "finance_agent"]),
      status: "clear",
    }));
    expect(legalAgent?.coordination).toEqual(expect.objectContaining({
      workstreamId: "front_a_juridico_lex",
      handoffRequired: true,
      collisionBlockers: expect.arrayContaining([
        "Nao alterar Control Plane, rotinas, profiles, Hermes, OpenClaw ou Paperclip por dentro da Frente A.",
      ]),
    }));
    expect(integratorAgent?.coordination).toEqual(expect.objectContaining({
      workstreamId: "front_b_agentic_core",
      handoffRequired: false,
      collisionBlockers: expect.arrayContaining([
        "Nao alterar analisador, movement reviews, Case Brain, Draft Factory, dashboards juridicos, docs ou migrations pela Frente B.",
      ]),
    }));
    expect(controlPlane.summary.coordination).toEqual(expect.objectContaining({
      status: "blocked",
      workstreams: 3,
      collisionBlockers: 4,
    }));
  });

  it("mostra Paperclip OpenClaw e Hermes lendo metodologia tenant-scoped sem assumir o Lex", () => {
    const controlPlane = buildMayusAgentControlPlane({
      missionSnapshots: [{
        missionId: "mission-lex-methodology",
        tenantId: "tenant-1",
        module: "legal_ops",
        status: "blocked",
        goal: "Preparar minuta com metodologia do tenant",
        nextSafeAction: "Submeter metodologia recomendada a revisao humana antes da Draft Factory.",
        lastUpdatedAt: "2026-05-22T12:00:00.000Z",
        blockers: ["operational_methodology_requires_review"],
        processMissionContext: {
          methodology: {
            provided: true,
            source: "tenant_settings.ai_features.operational_methodology",
            status: "recommended",
            activation: "supervised_suggestion",
            canGuideInternalDecisions: false,
            requiresHumanReview: true,
            areaMethod: { area: "Previdenciario" },
            expectedDocuments: ["CNIS", "indeferimento administrativo"],
            reviewReasons: ["methodology_recommended_not_approved"],
          },
        },
        trajectory: {
          status: "observed",
          lifecycleStatus: "proposed",
          lifecycleKind: "procedure_proposal",
          lastEventSummary: "Metodologia do tenant observada como proposta supervisionada.",
        },
      }],
    });

    expect(controlPlane.coordination.methodologySignals).toEqual([expect.objectContaining({
      tenantId: "tenant-1",
      status: "recommended",
      activation: "supervised_suggestion",
      handoffRequired: true,
      expectedDocuments: expect.arrayContaining(["CNIS"]),
    })]);
    expect(controlPlane.coordination.handoffChain).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "methodology_to_lex",
        status: "needs_coordination",
        signal: expect.stringContaining("sugestao supervisionada"),
      }),
      expect.objectContaining({
        id: "lex_to_agentic_core",
        status: "blocked",
      }),
    ]));
    expect(controlPlane.publicAgents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "paperclip",
        evidence: expect.arrayContaining(["1 sinal(is) de metodologia tenant-scoped"]),
        paperclip: expect.objectContaining({
          activity: expect.objectContaining({
            handoff: expect.objectContaining({
              methodologyStatus: "recommended",
            }),
          }),
        }),
      }),
      expect.objectContaining({
        id: "openclaw",
        status: "blocked",
        openclaw: expect.objectContaining({
          blockedLayer: "tenant_methodology",
          methodology: expect.objectContaining({
            status: "recommended",
            activation: "supervised_suggestion",
            blockedLayer: "tenant_methodology",
          }),
        }),
      }),
      expect.objectContaining({
        id: "hermes",
        hermes: expect.objectContaining({
          tenantLearning: expect.objectContaining({
            scope: "tenant_only",
            signalsObserved: 1,
            latestTenantId: "tenant-1",
            latestMethodologyStatus: "recommended",
          }),
        }),
      }),
    ]));
    expect(JSON.stringify(controlPlane)).not.toMatch(/waze|global learning|aprendizado global/i);
  });
});
