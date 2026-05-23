import { describe, expect, it } from "vitest";
import {
  createHermesMissionTrajectory,
  evaluateHermesMissionTrajectory,
  getMissingHermesMissionTrajectoryTypes,
  hasHermesMinimumMissionTrajectory,
  recordHermesMissionApproval,
  recordHermesMissionArtifact,
  recordHermesMissionBlock,
  recordHermesMissionDecision,
  recordHermesMissionResult,
  recordHermesMissionStep,
} from "./trajectory";

describe("Hermes mission trajectory", () => {
  it("records the minimum mission trajectory without persisted PII or secrets", () => {
    let trajectory = createHermesMissionTrajectory({
      missionId: "mission-1",
      tenantId: "tenant-1",
      objective:
        "Organizar atendimento de ana@example.com com api_key=mayus-secret-key",
      at: "2026-05-15T10:00:00.000Z",
      payload: {
        authorization: "Bearer should-never-persist",
        cliente: "Ana 123.456.789-10",
      },
    });

    trajectory = recordHermesMissionStep(trajectory, {
      summary:
        "Etapa consultou o cliente no telefone +55 11 99999-8888 usando token=raw-token-value",
      payload: {
        nested: {
          senha: "senha-cliente",
          email: "cliente@mayus.test",
        },
      },
      at: "2026-05-15T10:01:00.000Z",
    });
    trajectory = recordHermesMissionDecision(trajectory, {
      summary: "Decisao: abrir artifact de memoria supervisionada.",
      payload: { reason: "evento aprovado pelo operador" },
      at: "2026-05-15T10:02:00.000Z",
    });
    trajectory = recordHermesMissionBlock(trajectory, {
      summary: "Bloqueio: aguardar approval humano antes de usar como skill.",
      payload: { blocker: "human_review_required" },
      at: "2026-05-15T10:03:00.000Z",
    });
    trajectory = recordHermesMissionArtifact(trajectory, {
      summary: "Artifact criado para revisao do aprendizado.",
      payload: { artifactId: "artifact-1" },
      at: "2026-05-15T10:04:00.000Z",
    });
    trajectory = recordHermesMissionApproval(trajectory, {
      summary: "Approval humano registrado.",
      decision: "approved",
      payload: { reviewerId: "user-1" },
      at: "2026-05-15T10:05:00.000Z",
    });
    trajectory = recordHermesMissionResult(trajectory, {
      summary: "Resultado: proposta pronta para ciclo supervisionado.",
      payload: { outcome: "proposal_ready" },
      at: "2026-05-15T10:06:00.000Z",
    });

    const persisted = JSON.stringify(trajectory);

    expect(hasHermesMinimumMissionTrajectory(trajectory)).toBe(true);
    expect(getMissingHermesMissionTrajectoryTypes(trajectory)).toEqual([]);
    expect(trajectory.status).toBe("completed");
    expect(trajectory.events.map((event) => event.type)).toEqual([
      "objective",
      "step",
      "decision",
      "block",
      "artifact",
      "approval",
      "result",
    ]);
    expect(persisted).toContain("[redacted]");
    expect(persisted).toContain("[pii-redacted]");
    expect(persisted).not.toContain("mayus-secret-key");
    expect(persisted).not.toContain("raw-token-value");
    expect(persisted).not.toContain("senha-cliente");
    expect(persisted).not.toContain("ana@example.com");
    expect(persisted).not.toContain("cliente@mayus.test");
    expect(persisted).not.toContain("123.456.789-10");
    expect(persisted).not.toContain("99999-8888");
  });

  it("avalia completude, approval e proxima acao segura sem autoaprovar", () => {
    const trajectory = recordHermesMissionApproval(
      recordHermesMissionStep(
        createHermesMissionTrajectory({
          missionId: "mission-evaluation",
          objective: "Transformar aprendizado em memoria supervisionada.",
          at: "2026-05-21T10:00:00.000Z",
        }),
        {
          summary: "Etapa identificou aprendizado reutilizavel.",
          at: "2026-05-21T10:01:00.000Z",
        },
      ),
      {
        summary: "Approval solicitado ao socio.",
        decision: "requested",
        at: "2026-05-21T10:02:00.000Z",
      },
    );

    const evaluation = evaluateHermesMissionTrajectory(trajectory);

    expect(evaluation).toEqual(expect.objectContaining({
      minimumComplete: false,
      completionRatio: 0.43,
      approvalStatus: "requested",
      nextSafeAction:
        "Aguardar approval humano antes de promover memoria, skill ou procedimento.",
    }));
    expect(evaluation.missingEventTypes).toEqual([
      "decision",
      "block",
      "artifact",
      "result",
    ]);
    expect(JSON.stringify(evaluation)).not.toContain("\"approved\"");
  });
});
