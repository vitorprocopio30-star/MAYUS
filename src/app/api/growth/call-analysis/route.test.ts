import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTenantSessionMock, systemEventInsertMock, brainInsertMock, brainDeleteMock } = vi.hoisted(() => ({
  getTenantSessionMock: vi.fn(),
  systemEventInsertMock: vi.fn(),
  brainInsertMock: vi.fn(),
  brainDeleteMock: vi.fn(),
}));

function insertChain(table: string, payload: unknown) {
  brainInsertMock(table, payload);
  const ids: Record<string, string> = {
    brain_tasks: "task-1",
    brain_runs: "run-1",
    brain_steps: "step-1",
    brain_artifacts: "artifact-1",
  };

  return {
    select: vi.fn(() => ({
      single: vi.fn(async () => ({ data: { id: ids[table] }, error: null })),
    })),
  };
}

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: getTenantSessionMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === "system_event_logs") {
        return { insert: systemEventInsertMock };
      }

      if (table === "learning_events") {
        return { insert: (payload: unknown) => { brainInsertMock(table, payload); return { error: null }; } };
      }

      if (table === "brain_tasks") {
        return {
          insert: (payload: unknown) => insertChain(table, payload),
          delete: vi.fn(() => ({ eq: brainDeleteMock })),
        };
      }

      return { insert: (payload: unknown) => insertChain(table, payload) };
    }),
  },
}));

import { POST } from "./route";

function buildRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/growth/call-analysis", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("growth call analysis route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantSessionMock.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    systemEventInsertMock.mockResolvedValue({ error: null });
    brainInsertMock.mockImplementation(() => undefined);
    brainDeleteMock.mockResolvedValue({ error: null });
  });

  it("rejects unauthenticated requests", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const response = await POST(buildRequest({ notes: "Call com texto suficiente." }));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "Nao autenticado." });
    expect(systemEventInsertMock).not.toHaveBeenCalled();
  });

  it("returns MVP analysis for transcript text", async () => {
    const response = await POST(buildRequest({
      crmTaskId: "crm-task-1",
      leadName: "Maria",
      transcript: "Cliente tem audiencia amanha, gostou da proposta e quer avancar. Objecao: valor precisa parcelar.",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.mode).toBe("MVP upload/analysis - text transcript/notes only");
    expect(json.analysis).toEqual(expect.objectContaining({
      leadName: "Maria",
      requiresHumanReview: true,
      externalSideEffectsBlocked: true,
    }));
    expect(json.metadata.crm_task_id).toBe("crm-task-1");
    expect(json.metadata.persistence).toBe("brain_artifact_and_system_event_logs");
    expect(json.metadata.brain_trace).toEqual(expect.objectContaining({
      taskId: "task-1",
      runId: "run-1",
      stepId: "step-1",
      artifactId: "artifact-1",
      eventType: "call_analysis_artifact_created",
    }));
  });

  it("rejects empty text upload payload", async () => {
    const response = await POST(buildRequest({ leadName: "Sem notas" }));
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.error).toBe("Dados invalidos.");
    expect(json.details.transcript).toEqual(expect.arrayContaining(["Envie transcript ou notes em texto para a analise MVP."]));
    expect(systemEventInsertMock).not.toHaveBeenCalled();
  });

  it("does not return raw transcript in metadata", async () => {
    const transcript = "SEGREDO_FULL_TRANSCRIPT Cliente narrou detalhes internos que nao devem virar metadata bruta.";

    const response = await POST(buildRequest({
      leadName: "Lead Seguro",
      transcript,
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.metadata).not.toHaveProperty("transcript");
    expect(JSON.stringify(json.metadata)).not.toContain("SEGREDO_FULL_TRANSCRIPT");
    expect(json.analysis).not.toHaveProperty("transcript");
  });

  it("persists safe system event payload when crmTaskId is provided", async () => {
    const transcript = "RAW_TRANSCRIPT_SHOULD_NOT_BE_STORED Cliente tem audiencia amanha e quer avancar.";

    const response = await POST(buildRequest({
      crmTaskId: "crm-task-2",
      leadName: "Joao",
      transcript,
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.metadata.persistence).toBe("brain_artifact_and_system_event_logs");
    expect(systemEventInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      user_id: "user-1",
      source: "growth",
      provider: "mayus",
      event_name: "call_analysis_prepared",
      status: "ok",
      payload: expect.objectContaining({
        crm_task_id: "crm-task-2",
        lead_name: "Joao",
        external_side_effects_blocked: true,
        requires_human_review: true,
      }),
    }));
    const persistedPayload = systemEventInsertMock.mock.calls[0][0].payload;
    expect(persistedPayload).not.toHaveProperty("transcript");
    expect(JSON.stringify(persistedPayload)).not.toContain("RAW_TRANSCRIPT_SHOULD_NOT_BE_STORED");
  });

  it("creates a safe visible brain artifact when crmTaskId is provided", async () => {
    const transcript = "FULL_PAIN_SENTENCE_SHOULD_NOT_PERSIST Cliente disse que o problema e bloqueio urgente. Objecao sensivel: valor parcelado. Pode mandar follow-up automatico?";

    const response = await POST(buildRequest({
      crmTaskId: "crm-task-3",
      leadName: "Ana",
      transcript,
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.metadata.persistence).toBe("brain_artifact_and_system_event_logs");

    const artifactInsert = brainInsertMock.mock.calls.find(([table]) => table === "brain_artifacts")?.[1] as any;
    expect(artifactInsert).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      artifact_type: "call_commercial_analysis",
      source_module: "growth",
      metadata: expect.objectContaining({
        crm_task_id: "crm-task-3",
        lead_name: "Ana",
        requires_human_review: true,
        external_side_effects_blocked: true,
      }),
    }));
    const artifactJson = JSON.stringify(artifactInsert.metadata);
    expect(artifactJson).not.toContain("FULL_PAIN_SENTENCE_SHOULD_NOT_PERSIST");
    expect(artifactJson).not.toContain("Objecao sensivel");
    expect(artifactJson).not.toContain(json.analysis.suggestedFollowUp);
    expect(artifactInsert.metadata).not.toHaveProperty("pain");
    expect(artifactInsert.metadata).not.toHaveProperty("objections");
    expect(artifactInsert.metadata).not.toHaveProperty("suggestedFollowUp");
  });

  it("reports event-only persistence when visible artifact creation fails", async () => {
    brainInsertMock.mockImplementation((table: string) => {
      if (table === "brain_artifacts") throw new Error("artifact insert failed");
    });

    const response = await POST(buildRequest({
      crmTaskId: "crm-task-4",
      leadName: "Caio",
      notes: "Cliente quer avancar, mas precisa confirmar valor.",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.metadata.persistence).toBe("system_event_logs_event_only");
    expect(json.metadata.brain_trace).toBeNull();
    expect(systemEventInsertMock).toHaveBeenCalled();
    expect(brainDeleteMock).toHaveBeenCalledWith("id", "task-1");
  });
});
