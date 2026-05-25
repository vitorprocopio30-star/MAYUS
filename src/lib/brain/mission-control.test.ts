import { describe, expect, it } from "vitest";
import { buildBrainMissionControlSnapshots } from "./mission-control";

describe("buildBrainMissionControlSnapshots", () => {
  it("monta missao com task, run, steps e proxima etapa atual", () => {
    const snapshots = buildBrainMissionControlSnapshots({
      tasks: [{
        id: "task-1",
        title: "Planejar missao",
        goal: "Organizar trabalho operacional",
        module: "core",
        channel: "chat",
        status: "executing",
        created_at: "2026-05-21T10:00:00.000Z",
        updated_at: "2026-05-21T10:03:00.000Z",
      }],
      runs: [{
        id: "run-1",
        task_id: "task-1",
        status: "executing",
        attempt_number: 1,
        started_at: "2026-05-21T10:00:10.000Z",
      }],
      steps: [{
        id: "step-1",
        task_id: "task-1",
        run_id: "run-1",
        order_index: 1,
        title: "Analisar contexto",
        step_type: "planner",
        status: "completed",
        created_at: "2026-05-21T10:00:20.000Z",
      }, {
        id: "step-2",
        task_id: "task-1",
        run_id: "run-1",
        order_index: 2,
        title: "Executar proximo passo",
        step_type: "capability",
        capability_name: "support_case_status",
        handler_type: "lex_support_case_status",
        status: "queued",
        created_at: "2026-05-21T10:01:00.000Z",
      }],
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toEqual(expect.objectContaining({
      missionId: "task-1",
      module: "core",
      owner: "MAYUS Operating Partner",
      status: "executing",
      currentStep: expect.objectContaining({
        id: "step-2",
        capabilityName: "support_case_status",
      }),
      nextSafeAction: "Executar etapa segura: Executar proximo passo.",
    }));
    expect(snapshots[0].timeline.map((item) => item.source)).toEqual(["step", "step", "run", "task"]);
  });

  it("resume OpenClaw sem expor policy crua sensivel", () => {
    const snapshots = buildBrainMissionControlSnapshots({
      tasks: [{
        id: "task-policy",
        goal: "Preparar acao supervisionada",
        module: "legal_ops",
        status: "awaiting_approval",
        created_at: "2026-05-21T11:00:00.000Z",
        policy_snapshot: {
          policy_decision: {
            outcome: "requires_approval",
            requires_approval: true,
            can_execute_now: false,
            reason: "Revisao humana exigida antes de acao legal. token=sk-secret-value",
            surface: "legal_decision",
            module: "legal_ops",
            required_credential_providers: ["escavador"],
            profile_explanation: {
              source: "tenant_settings.ai_features.agent_profiles",
              subject: { surface: "legal_decision", module: "legal_ops" },
              surface_matrix: { surface: "legal_decision" },
              blocked_reason: {
                code: "surface_tool_not_allowed",
                layer: "agent",
                message: "Revisao humana exigida antes de acao legal.",
              },
              debugger: {
                precedence: ["global", "tenant", "module", "agent", "tool", "channel"],
                blocked_layer: "agent",
                blocked_reason_code: "surface_tool_not_allowed",
                lower_layers_cannot_reopen: true,
                applied_layers: [
                  {
                    scope: "global",
                    key: "global",
                    enabled: true,
                    requires_approval: false,
                    has_allow: true,
                    has_deny: false,
                    has_surface_matrix: false,
                  },
                  {
                    scope: "agent",
                    key: "legal_operations_agent",
                    enabled: true,
                    requires_approval: true,
                    has_allow: false,
                    has_deny: false,
                    has_surface_matrix: true,
                  },
                ],
              },
            },
          },
        },
      }],
    });

    expect(snapshots[0].policy).toEqual(expect.objectContaining({
      outcome: "requires_approval",
      surface: "legal_decision",
      requiresApproval: true,
      canExecuteNow: false,
      credentialGate: true,
      source: "tenant_settings.ai_features.agent_profiles",
      debugger: expect.objectContaining({
        blockedLayer: "agent",
        blockedReasonCode: "surface_tool_not_allowed",
        lowerLayersCannotReopen: true,
        appliedLayers: expect.arrayContaining([
          expect.objectContaining({ scope: "global", key: "global" }),
          expect.objectContaining({ scope: "agent", key: "legal_operations_agent" }),
        ]),
      }),
    }));
    expect(JSON.stringify(snapshots[0].policy)).not.toContain("sk-secret-value");
    expect(JSON.stringify(snapshots[0].policy)).not.toContain("profile_explanation");
  });

  it("sanitiza blockers reconstruidos de erros de task e step", () => {
    const snapshots = buildBrainMissionControlSnapshots({
      tasks: [{
        id: "task-secret-error",
        goal: "Investigar falha operacional",
        module: "core",
        status: "blocked",
        error_message: "Falha upstream token=sk-secret-value",
        created_at: "2026-05-21T11:30:00.000Z",
      }],
      steps: [{
        id: "step-secret-error",
        task_id: "task-secret-error",
        title: "Executar chamada interna",
        status: "failed",
        error_message: "Provider respondeu service_role_key=super-secret",
        created_at: "2026-05-21T11:31:00.000Z",
      }],
    });

    const serialized = JSON.stringify(snapshots[0]);

    expect(snapshots[0].blockers).toEqual(expect.arrayContaining([
      "Falha upstream [redacted]",
      "Provider respondeu [redacted]",
    ]));
    expect(serialized).not.toContain("sk-secret-value");
    expect(serialized).not.toContain("super-secret");
    expect(serialized).not.toContain("service_role_key=super-secret");
  });

  it("conecta Hermes trajectory e proposta lifecycle pendente", () => {
    const snapshots = buildBrainMissionControlSnapshots({
      tasks: [{
        id: "task-hermes",
        goal: "Aprender procedimento",
        module: "core",
        status: "planning",
        created_at: "2026-05-21T12:00:00.000Z",
      }],
      events: [{
        id: "event-hermes",
        task_id: "task-hermes",
        event_type: "agentic_routine_heartbeat",
        source_module: "core",
        created_at: "2026-05-21T12:01:00.000Z",
        payload: {
          hermesTrajectory: {
            status: "waiting_approval",
            events: [
              { type: "objective", summary: "Organizar aprendizado.", createdAt: "2026-05-21T12:00:00.000Z" },
              { type: "approval", summary: "Aguardar socio.", createdAt: "2026-05-21T12:01:00.000Z" },
            ],
          },
        },
      }],
      memories: [{
        id: "memory-1",
        task_id: "task-hermes",
        memory_key: "hermes:skill:triagem",
        source: "hermes_lifecycle",
        promoted: false,
        created_at: "2026-05-21T12:02:00.000Z",
        value: {
          status: "proposed",
          hermes_lifecycle_kind: "skill",
        },
      }],
    });

    expect(snapshots[0].trajectory).toEqual(expect.objectContaining({
      status: "waiting_approval",
      eventsCount: 2,
      lastEventType: "approval",
      lastEventSummary: "Aguardar socio.",
      minimumComplete: false,
      completionRatio: 0.43,
      missingEventTypes: ["step", "block", "artifact", "result"],
      approvalStatus: "requested",
      nextSafeAction:
        "Aguardar approval humano antes de promover memoria, skill ou procedimento.",
      lifecycleStatus: "proposed",
      lifecycleKind: "skill",
      latestMemoryId: "memory-1",
      latestMemoryKey: "hermes:skill:triagem",
      evaluation: expect.objectContaining({
        latestLifecycleMemoryId: "memory-1",
        latestLifecycleStatus: "proposed",
        latestLifecycleKind: "skill",
      }),
    }));
    expect(snapshots[0].blockers).toContain("Approval Hermes pendente para memoria, skill ou procedimento.");
  });

  it("reconstroi missao processual beta a partir de artifact com OpenClaw e Hermes", () => {
    const snapshots = buildBrainMissionControlSnapshots({
      tasks: [{
        id: "task-process-beta",
        goal: "Gerar primeira minuta com supervisao",
        module: "legal_ops",
        status: "awaiting_approval",
        created_at: "2026-05-21T12:30:00.000Z",
      }],
      artifacts: [{
        id: "artifact-process-beta",
        task_id: "task-process-beta",
        artifact_type: "process_mission_step_result",
        title: "Resultado da missao processual",
        created_at: "2026-05-21T12:31:00.000Z",
        metadata: {
          result_status: "blocked",
          process_task_id: "process-beta-1",
          process_number: "0000001-11.2026.8.26.0100",
          legal_operator_state: {
            status: "awaiting_human_approval",
            safeNextAction: {
              action: "generate_first_draft",
              label: "Gerar primeira minuta",
              requiresApproval: true,
            },
            blockers: ["draft_factory_generation"],
          },
          agentic_governance: {
            openclaw_policy: {
              surface: "legal_decision",
              module: "legal_ops",
              outcome: "requires_approval",
              requires_approval: true,
              can_execute_now: false,
              reason: "Geracao de minuta juridica exige aprovacao humana.",
              debugger: {
                precedence: ["platform_default", "tenant", "module", "agent", "tool", "channel"],
                blocked_layer: "human_gate",
                blocked_reason_code: "human_gate_requires_review",
                lower_layers_cannot_reopen: true,
              },
            },
            hermes_trajectory: {
              status: "waiting_approval",
              events: [
                { type: "objective", summary: "Gerar minuta supervisionada.", createdAt: "2026-05-21T12:30:00.000Z" },
                { type: "step", summary: "Contexto juridico consolidado.", createdAt: "2026-05-21T12:30:10.000Z" },
                { type: "decision", summary: "Minuta exige aprovacao.", createdAt: "2026-05-21T12:30:20.000Z" },
                { type: "block", summary: "Aguardar approval humano.", createdAt: "2026-05-21T12:30:30.000Z" },
                { type: "artifact", summary: "Artifact registrado.", createdAt: "2026-05-21T12:31:00.000Z" },
                { type: "approval", summary: "Approval solicitado.", createdAt: "2026-05-21T12:31:10.000Z", payload: { decision: "requested" } },
              ],
            },
          },
        },
      }],
      legalOperatorMissions: [{
        key: "process_task:process-beta-1",
        processTaskId: "process-beta-1",
        processNumber: "0000001-11.2026.8.26.0100",
        processLabel: "0000001-11.2026.8.26.0100",
        taskId: "task-process-beta",
        currentState: {
          status: "awaiting_human_approval",
          safeNextAction: { label: "Gerar primeira minuta" },
          blockers: ["draft_factory_generation"],
        },
        currentSource: "artifact",
        pendingApproval: null,
        latestArtifactId: "artifact-process-beta",
        latestEventId: null,
        timeline: [],
        lastUpdatedAt: "2026-05-21T12:31:00.000Z",
      }],
    });

    expect(snapshots[0].policy).toEqual(expect.objectContaining({
      surface: "legal_decision",
      outcome: "requires_approval",
      requiresApproval: true,
      reason: "Geracao de minuta juridica exige aprovacao humana.",
      debugger: expect.objectContaining({
        blockedLayer: "human_gate",
        blockedReasonCode: "human_gate_requires_review",
      }),
    }));
    expect(snapshots[0].trajectory).toEqual(expect.objectContaining({
      status: "waiting_approval",
      approvalStatus: "requested",
      minimumComplete: false,
      missingEventTypes: ["result"],
    }));
    expect(snapshots[0].legalOperatorMission?.processTaskId).toBe("process-beta-1");
    expect(snapshots[0].nextSafeAction).toContain("Gerar primeira minuta");
  });

  it("avalia Hermes no Mission Control usando task, steps, artifacts, approvals, memories e events ja carregados", () => {
    const snapshots = buildBrainMissionControlSnapshots({
      tasks: [{
        id: "task-hermes-derived",
        goal: "Consolidar procedimento supervisionado",
        module: "core",
        status: "completed",
        result_summary: "Procedimento ficou pronto como proposta auditavel.",
        created_at: "2026-05-21T12:00:00.000Z",
        updated_at: "2026-05-21T12:08:00.000Z",
      }],
      steps: [{
        id: "step-derived",
        task_id: "task-hermes-derived",
        title: "Revisar aprendizado antes de propor skill",
        step_type: "review_gate",
        status: "awaiting_approval",
        created_at: "2026-05-21T12:01:00.000Z",
      }],
      approvals: [{
        id: "approval-derived",
        task_id: "task-hermes-derived",
        status: "approved",
        approved_at: "2026-05-21T12:05:00.000Z",
        decision_notes: "Aprovado pelo socio para virar proposta supervisionada.",
      }],
      artifacts: [{
        id: "artifact-derived",
        task_id: "task-hermes-derived",
        artifact_type: "hermes_lifecycle_review",
        title: "Revisao Hermes",
        created_at: "2026-05-21T12:04:00.000Z",
      }],
      events: [{
        id: "event-derived",
        task_id: "task-hermes-derived",
        event_type: "hermes_lifecycle_proposed",
        source_module: "agent_memory",
        created_at: "2026-05-21T12:03:00.000Z",
        payload: {
          hermes_lifecycle_id: "hermes:skill:triagem",
        },
      }],
      memories: [{
        id: "memory-derived",
        task_id: "task-hermes-derived",
        memory_key: "skill:triagem-supervisionada",
        source: "hermes_lifecycle",
        promoted: false,
        created_at: "2026-05-21T12:06:00.000Z",
        value: {
          status: "proposed",
          evidence: {
            hermes_lifecycle: {
              kind: "skill",
              status: "proposed",
            },
          },
        },
      }],
    });

    expect(snapshots[0].trajectory).toEqual(expect.objectContaining({
      status: "proposed",
      minimumComplete: true,
      completionRatio: 1,
      missingEventTypes: [],
      approvalStatus: "approved",
      lifecycleStatus: "proposed",
      lifecycleKind: "skill",
      latestMemoryId: "memory-derived",
      latestMemoryKey: "skill:triagem-supervisionada",
      nextSafeAction:
        "Manter artifact, memoria e auditoria vinculados; qualquer novo uso exige novo ciclo supervisionado.",
    }));
    expect(snapshots[0].pendingApproval).toBeNull();
    expect(snapshots[0].nextSafeAction).toBe(
      "Manter artifact, memoria e auditoria vinculados; qualquer novo uso exige novo ciclo supervisionado.",
    );
  });

  it("integra Paperclip routine, approval e budget bloqueado", () => {
    const snapshots = buildBrainMissionControlSnapshots({
      tasks: [{
        id: "task-paperclip",
        tenant_id: "tenant-session",
        title: "Guardiao de prazos",
        goal: "Revisar riscos de prazo",
        module: "legal_ops",
        status: "awaiting_approval",
        created_at: "2026-05-21T13:00:00.000Z",
        task_input: {
          routine_id: "paperclip_deadline_guardian",
          source: "paperclip",
        },
        task_context: {
          agent_id: "paperclip",
        },
      }],
      steps: [{
        id: "step-paperclip",
        task_id: "task-paperclip",
        title: "Acordar rotina agentica",
        step_type: "routine",
        status: "awaiting_approval",
        input_payload: {
          routine: {
            id: "paperclip_deadline_guardian",
            label: "Guardiao de prazos e rotinas juridicas",
            source: "paperclip",
            agentId: "paperclip",
          },
          budget_decision: {
            status: "blocked",
            reasons: ["Budget diario de rotina esgotado."],
          },
        },
      }],
      approvals: [{
        id: "approval-paperclip",
        task_id: "task-paperclip",
        step_id: "step-paperclip",
        status: "pending",
        risk_level: "low",
        created_at: "2026-05-21T13:01:00.000Z",
        approval_context: {
          audit_log_id: "audit-paperclip",
          source: "agentic_routine",
          routine_id: "paperclip_deadline_guardian",
        },
      }],
    });

    expect(snapshots[0]).toEqual(expect.objectContaining({
      tenantId: "tenant-session",
      agentSource: "paperclip",
      owner: "Operador juridico",
      pendingApproval: expect.objectContaining({ id: "approval-paperclip" }),
      routine: expect.objectContaining({
        routineId: "paperclip_deadline_guardian",
        source: "paperclip",
        agentId: "paperclip",
        internalAgentId: "legal_operations_agent",
        internalAgentLabel: "Legal Operations Agent",
        budgetStatus: "blocked",
      }),
    }));
    expect(snapshots[0].blockers).toContain("Approval humano pendente");
    expect(snapshots[0].blockers).toContain("Budget da rotina bloqueado.");
  });

  it("anexa missao juridica especializada sem duplicar o envelope geral", () => {
    const snapshots = buildBrainMissionControlSnapshots({
      tasks: [{
        id: "task-legal",
        goal: "Executar proximo passo seguro",
        module: "mayus",
        status: "awaiting_approval",
        created_at: "2026-05-21T14:00:00.000Z",
      }],
      legalOperatorMissions: [{
        key: "process_task:process-1",
        processTaskId: "process-1",
        processNumber: "0000001-11.2026.8.26.0100",
        processLabel: "0000001-11.2026.8.26.0100",
        taskId: "task-legal",
        currentState: {
          status: "awaiting_human_approval",
          safeNextAction: { label: "Pedir aprovacao para gerar primeira minuta" },
          blockers: ["Minuta exige revisao humana."],
        },
        currentSource: "approval",
        pendingApproval: null,
        latestArtifactId: null,
        latestEventId: null,
        timeline: [],
        lastUpdatedAt: "2026-05-21T14:00:00.000Z",
      }],
    });

    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].legalOperatorMission?.processTaskId).toBe("process-1");
    expect(snapshots[0].nextSafeAction).toBe("Pedir aprovacao para gerar primeira minuta");
    expect(snapshots[0].blockers).toContain("Minuta exige revisao humana.");
  });

  it("prefere retry queued como etapa atual e mostra bloqueio operacional", () => {
    const snapshots = buildBrainMissionControlSnapshots({
      tasks: [{
        id: "task-retry",
        goal: "Reabrir etapa supervisionada",
        module: "core",
        status: "executing",
        created_at: "2026-05-21T15:00:00.000Z",
      }],
      steps: [{
        id: "step-failed",
        task_id: "task-retry",
        run_id: "run-retry",
        order_index: 4,
        title: "Executar analise",
        step_type: "capability",
        capability_name: "support_case_status",
        status: "failed",
        created_at: "2026-05-21T15:01:00.000Z",
      }, {
        id: "step-retry",
        task_id: "task-retry",
        run_id: "run-retry",
        order_index: 5,
        title: "Retry - Executar analise",
        step_type: "capability",
        capability_name: "support_case_status",
        status: "queued",
        input_payload: {
          retry_of_step_id: "step-failed",
          retry_reason: "Motivo validado",
        },
        created_at: "2026-05-21T15:02:00.000Z",
      }],
      events: [{
        id: "event-retry",
        task_id: "task-retry",
        step_id: "step-failed",
        event_type: "brain_step_retry_requested",
        source_module: "brain",
        created_at: "2026-05-21T15:02:10.000Z",
        payload: {
          retry_step_id: "step-retry",
          control_action: "retry",
        },
      }],
    });

    expect(snapshots[0].currentStep).toEqual(expect.objectContaining({
      id: "step-retry",
      status: "queued",
    }));
    expect(snapshots[0].blockers).toContain("Retry aguardando execucao: Retry - Executar analise");
    expect(snapshots[0].timeline[0]).toEqual(expect.objectContaining({
      id: "event-retry",
      title: "Retry solicitado",
      status: "retry",
    }));
  });

  it("mostra step cancelado na timeline, no currentStep e nos blockers", () => {
    const snapshots = buildBrainMissionControlSnapshots({
      tasks: [{
        id: "task-cancel",
        goal: "Cancelar etapa insegura",
        module: "core",
        status: "executing",
        created_at: "2026-05-21T16:00:00.000Z",
      }],
      steps: [{
        id: "step-cancelled",
        task_id: "task-cancel",
        run_id: "run-cancel",
        order_index: 3,
        title: "Publicar automaticamente",
        step_type: "external_action",
        status: "cancelled",
        created_at: "2026-05-21T16:01:00.000Z",
        updated_at: "2026-05-21T16:02:00.000Z",
      }],
      events: [{
        id: "event-cancel",
        task_id: "task-cancel",
        step_id: "step-cancelled",
        event_type: "brain_step_cancelled",
        source_module: "brain",
        created_at: "2026-05-21T16:02:10.000Z",
        payload: {
          control_action: "cancel",
        },
      }],
    });

    expect(snapshots[0].currentStep).toEqual(expect.objectContaining({
      id: "step-cancelled",
      status: "cancelled",
    }));
    expect(snapshots[0].nextSafeAction).toContain("Revisar motivo do cancelamento");
    expect(snapshots[0].blockers).toContain("Step cancelado: Publicar automaticamente");
    expect(snapshots[0].timeline[0]).toEqual(expect.objectContaining({
      id: "event-cancel",
      title: "Step cancelado",
      status: "cancel",
    }));
  });
});
