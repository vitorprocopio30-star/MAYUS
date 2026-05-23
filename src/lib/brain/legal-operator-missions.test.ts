import { describe, expect, it } from "vitest";
import { buildLegalOperatorMissionSnapshots } from "./legal-operator-missions";

const eventState = {
  status: "awaiting_supervision",
  safeNextAction: { action: "collect_missing_documents", label: "Organizar pendencias documentais" },
};

const artifactState = {
  status: "ready_internal_action",
  safeNextAction: { action: "refresh_document_memory", label: "Atualizar memoria documental" },
};

const approvalState = {
  status: "awaiting_human_approval",
  safeNextAction: { action: "generate_first_draft", label: "Pedir aprovacao para gerar primeira minuta" },
};

describe("buildLegalOperatorMissionSnapshots", () => {
  it("prioriza approval pendente sobre artifact e evento da mesma missao", () => {
    const missions = buildLegalOperatorMissionSnapshots({
      approvals: [{
        id: "approval-1",
        task_id: "brain-task-1",
        step_id: "brain-step-1",
        status: "pending",
        risk_level: "high",
        created_at: "2026-05-21T10:00:00.000Z",
        audit_log_id: "audit-1",
        awaiting_payload: {
          skillName: "legal_first_draft_generate",
          riskLevel: "high",
          entities: {
            process_task_id: "process-task-1",
            process_number: "0000001-11.2026.8.26.0100",
          },
          legalOperatorState: approvalState,
        },
      }],
      artifacts: [{
        id: "artifact-1",
        task_id: "brain-task-1",
        artifact_type: "process_mission_step_result",
        title: "Resultado da missao",
        created_at: "2026-05-21T10:05:00.000Z",
        metadata: {
          process_task_id: "process-task-1",
          process_number: "0000001-11.2026.8.26.0100",
          legal_operator_state: artifactState,
        },
      }],
      events: [{
        id: "event-1",
        task_id: "brain-task-1",
        event_type: "process_mission_step_executed",
        created_at: "2026-05-21T10:10:00.000Z",
        payload: {
          process_task_id: "process-task-1",
          process_number: "0000001-11.2026.8.26.0100",
          legal_operator_state: eventState,
        },
      }],
    });

    expect(missions).toHaveLength(1);
    expect(missions[0]).toEqual(expect.objectContaining({
      processTaskId: "process-task-1",
      processNumber: "0000001-11.2026.8.26.0100",
      currentSource: "approval",
      currentState: approvalState,
      pendingApproval: expect.objectContaining({
        id: "approval-1",
        auditLogId: "audit-1",
        skillName: "legal_first_draft_generate",
      }),
      latestArtifactId: "artifact-1",
      latestEventId: "event-1",
      lastUpdatedAt: "2026-05-21T10:10:00.000Z",
    }));
    expect(missions[0].timeline.map((item) => item.source)).toEqual(["event", "artifact", "approval"]);
  });

  it("deduplica por process_task_id mesmo com fontes diferentes", () => {
    const missions = buildLegalOperatorMissionSnapshots({
      artifacts: [{
        id: "artifact-1",
        task_id: "brain-task-a",
        created_at: "2026-05-21T09:00:00.000Z",
        metadata: {
          process_task_id: "process-task-1",
          process_number: "0000001-11.2026.8.26.0100",
          legal_operator_state: artifactState,
        },
      }],
      events: [{
        id: "event-1",
        task_id: "brain-task-b",
        event_type: "support_case_status_resolved",
        created_at: "2026-05-21T09:30:00.000Z",
        payload: {
          process_task_id: "process-task-1",
          legal_operator_state: eventState,
        },
      }],
    });

    expect(missions).toHaveLength(1);
    expect(missions[0].timeline).toHaveLength(2);
    expect(missions[0].key).toBe("process_task:process-task-1");
  });

  it("usa artifact mais recente quando nao ha approval pendente", () => {
    const missions = buildLegalOperatorMissionSnapshots({
      artifacts: [{
        id: "artifact-old",
        created_at: "2026-05-21T08:00:00.000Z",
        metadata: {
          process_task_id: "process-task-1",
          legal_operator_state: eventState,
        },
      }, {
        id: "artifact-new",
        created_at: "2026-05-21T08:30:00.000Z",
        metadata: {
          process_task_id: "process-task-1",
          legal_operator_state: artifactState,
        },
      }],
      events: [{
        id: "event-newer",
        event_type: "process_mission_step_executed",
        created_at: "2026-05-21T09:00:00.000Z",
        payload: {
          process_task_id: "process-task-1",
          legal_operator_state: eventState,
        },
      }],
    });

    expect(missions).toHaveLength(1);
    expect(missions[0]).toEqual(expect.objectContaining({
      currentSource: "artifact",
      currentState: artifactState,
      pendingApproval: null,
      latestArtifactId: "artifact-new",
      latestEventId: "event-newer",
      lastUpdatedAt: "2026-05-21T09:00:00.000Z",
    }));
  });
});
