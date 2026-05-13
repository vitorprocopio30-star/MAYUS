import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  createServerClientMock,
  cookiesMock,
  getUserMock,
  fromMock,
  dispatchCapabilityExecutionMock,
  fetchAgentSkillByNameMock,
  getAgentAuditLogForTenantMock,
  markAgentAuditApprovalDecisionMock,
  markAgentAuditExecutedMock,
  markAgentAuditFallbackMock,
} = vi.hoisted(() => {
  const localFromMock = vi.fn();
    return {
      createClientMock: vi.fn(() => ({ from: localFromMock })),
      createServerClientMock: vi.fn(),
      cookiesMock: vi.fn(),
      getUserMock: vi.fn(),
      fromMock: localFromMock,
      dispatchCapabilityExecutionMock: vi.fn(),
      fetchAgentSkillByNameMock: vi.fn(),
      getAgentAuditLogForTenantMock: vi.fn(),
      markAgentAuditApprovalDecisionMock: vi.fn(),
      markAgentAuditExecutedMock: vi.fn(),
      markAgentAuditFallbackMock: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@/lib/agent/capabilities/dispatcher", () => ({
  dispatchCapabilityExecution: dispatchCapabilityExecutionMock,
}));

vi.mock("@/lib/agent/capabilities/registry", () => ({
  fetchAgentSkillByName: fetchAgentSkillByNameMock,
}));

vi.mock("@/lib/agent/audit", () => ({
  getAgentAuditLogForTenant: getAgentAuditLogForTenantMock,
  markAgentAuditApprovalDecision: markAgentAuditApprovalDecisionMock,
  markAgentAuditExecuted: markAgentAuditExecutedMock,
  markAgentAuditFallback: markAgentAuditFallbackMock,
}));

import { POST } from "./route";

function buildQuery(config?: {
  singleResult?: { data: any; error: any };
  maybeSingleResult?: { data: any; error: any };
}) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    update: vi.fn(() => query),
    single: vi.fn(async () => config?.singleResult ?? { data: null, error: null }),
    maybeSingle: vi.fn(async () => config?.maybeSingleResult ?? { data: null, error: null }),
  };

  return query;
}

function configureServiceClient(params: { role: string }) {
  const profilesQuery = buildQuery({
    singleResult: {
      data: { role: params.role, tenant_id: "tenant-1" },
      error: null,
    },
  });
  const brainApprovalsQuery = buildQuery({
    maybeSingleResult: {
      data: null,
      error: null,
    },
  });
  const auditLogsQuery = buildQuery({
    singleResult: {
      data: null,
      error: null,
    },
  });

  fromMock.mockImplementation((table: string) => {
    if (table === "profiles") return profilesQuery;
    if (table === "brain_approvals") return brainApprovalsQuery;
    if (table === "agent_audit_logs") return auditLogsQuery;
    return buildQuery();
  });
}

function configureServiceClientWithBrainApproval(params: { role: string }) {
  const profilesQuery = buildQuery({
    singleResult: {
      data: { role: params.role, tenant_id: "tenant-1" },
      error: null,
    },
  });
  const brainApprovalsQuery = buildQuery({
    maybeSingleResult: {
      data: {
        id: "brain-approval-1",
        task_id: "brain-task-1",
        run_id: "brain-run-1",
        step_id: "brain-step-1",
      },
      error: null,
    },
  });
  const genericQuery = buildQuery({
    singleResult: { data: null, error: null },
    maybeSingleResult: { data: null, error: null },
  });

  fromMock.mockImplementation((table: string) => {
    if (table === "profiles") return profilesQuery;
    if (table === "brain_approvals") return brainApprovalsQuery;
    return genericQuery;
  });
}

function buildRequest() {
  return new Request("http://localhost:3000/api/ai/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ auditLogId: "audit-1", decision: "approved" }),
  });
}

describe("POST /api/ai/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    createServerClientMock.mockReturnValue({
      auth: {
        getUser: getUserMock,
      },
    });

    cookiesMock.mockResolvedValue({
      getAll: () => [],
      set: vi.fn(),
    });

    getUserMock.mockResolvedValue({
      data: {
        user: { id: "user-1" },
      },
      error: null,
    });

    dispatchCapabilityExecutionMock.mockResolvedValue({
      status: "executed",
      reply: "ok",
    });
    fetchAgentSkillByNameMock.mockResolvedValue(null);
    getAgentAuditLogForTenantMock.mockResolvedValue(null);
    markAgentAuditApprovalDecisionMock.mockResolvedValue({ updated: true });
    markAgentAuditExecutedMock.mockResolvedValue({ error: null });
    markAgentAuditFallbackMock.mockResolvedValue({ error: null });
  });

  it("permite que mayus_admin passe pela checagem de aprovacao executiva", async () => {
    configureServiceClient({ role: "mayus_admin" });

    const response = await POST(buildRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Registro de auditoria nao encontrado." });
  });

  it("mantem perfis nao executivos bloqueados na aprovacao", async () => {
    configureServiceClient({ role: "advogado" });

    const response = await POST(buildRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Apenas perfis executivos podem aprovar acoes. Perfil atual: "advogado".',
    });
  });

  it("aprova proposta juridica supervisionada e executa legal_first_draft_generate", async () => {
    configureServiceClientWithBrainApproval({ role: "admin" });
    getAgentAuditLogForTenantMock.mockResolvedValue({
      id: "audit-1",
      tenant_id: "tenant-1",
      user_id: "requester-1",
      skill_invoked: "legal_first_draft_generate",
      intention_raw: "Missao processual supervisionada: Gerar primeira minuta juridica",
      payload_executed: null,
      status: "awaiting_approval",
      approval_status: "pending",
      approval_context: {
        risk_level: "high",
        process_task_id: "process-task-1",
        recommended_piece_label: "Contestação Previdenciária",
      },
      approved_by: null,
      approved_at: null,
      idempotency_key: "idem-1",
      idempotency_expires_at: new Date(Date.now() + 60_000).toISOString(),
      pending_execution_payload: {
        entities: {
          process_task_id: "process-task-1",
          process_number: "E2E-2026-0001",
          recommended_piece_input: "Contestação",
          recommended_piece_label: "Contestação Previdenciária",
        },
        idempotencyKey: "idem-1",
        skillName: "legal_first_draft_generate",
        schemaVersion: "1.0.0",
      },
    });
    fetchAgentSkillByNameMock.mockResolvedValue({
      name: "legal_first_draft_generate",
      handler_type: "lex_first_draft_generate",
    });
    dispatchCapabilityExecutionMock.mockResolvedValue({
      status: "executed",
      reply: "A primeira minuta Contestação Previdenciária foi gerada pela Draft Factory juridica.",
      outputPayload: {
        process_task_id: "process-task-1",
        case_first_draft_artifact_id: "artifact-draft-1",
        recommended_piece_label: "Contestação Previdenciária",
      },
      data: { artifactId: "artifact-draft-1" },
    });

    const response = await POST(buildRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(markAgentAuditApprovalDecisionMock).toHaveBeenCalledWith(expect.objectContaining({
      auditLogId: "audit-1",
      decision: "approved",
      approverId: "user-1",
    }));
    expect(fetchAgentSkillByNameMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      name: "legal_first_draft_generate",
    });
    expect(dispatchCapabilityExecutionMock).toHaveBeenCalledWith(expect.objectContaining({
      handlerType: "lex_first_draft_generate",
      capabilityName: "legal_first_draft_generate",
      tenantId: "tenant-1",
      userId: "user-1",
      entities: expect.objectContaining({ process_task_id: "process-task-1" }),
      auditLogId: "audit-1",
      brainContext: {
        taskId: "brain-task-1",
        runId: "brain-run-1",
        stepId: "brain-step-1",
        sourceModule: "mayus",
      },
    }));
    expect(markAgentAuditExecutedMock).toHaveBeenCalledWith(expect.objectContaining({
      auditLogId: "audit-1",
      payloadExecuted: expect.objectContaining({
        idempotencyKey: "idem-1",
        skill: "legal_first_draft_generate",
        handler_type: "lex_first_draft_generate",
        case_first_draft_artifact_id: "artifact-draft-1",
      }),
    }));
    expect(json).toEqual(expect.objectContaining({
      status: "executed",
      auditLogId: "audit-1",
      approvedBy: "user-1",
      artifactId: "artifact-draft-1",
    }));
  });

  it("nao marca como executada uma aprovacao que cria nova aprovacao supervisionada", async () => {
    configureServiceClientWithBrainApproval({ role: "admin" });
    getAgentAuditLogForTenantMock.mockResolvedValue({
      id: "audit-1",
      tenant_id: "tenant-1",
      user_id: "requester-1",
      skill_invoked: "legal_process_mission_execute_next",
      intention_raw: "Executar proximo passo juridico",
      payload_executed: null,
      status: "awaiting_approval",
      approval_status: "pending",
      approval_context: { risk_level: "high" },
      approved_by: null,
      approved_at: null,
      idempotency_key: "idem-1",
      idempotency_expires_at: new Date(Date.now() + 60_000).toISOString(),
      pending_execution_payload: {
        entities: { process_task_id: "process-task-1" },
        idempotencyKey: "idem-1",
        skillName: "legal_process_mission_execute_next",
        schemaVersion: "1.0.0",
      },
    });
    fetchAgentSkillByNameMock.mockResolvedValue({
      name: "legal_process_mission_execute_next",
      handler_type: "lex_process_mission_execute_next",
    });
    dispatchCapabilityExecutionMock.mockResolvedValue({
      status: "awaiting_approval",
      reply: "## Missao juridica supervisionada",
      outputPayload: {
        auditLogId: "nested-approval-audit-1",
        proposed_capability: "legal_first_draft_generate",
        proposed_handler_type: "lex_first_draft_generate",
      },
    });

    const response = await POST(buildRequest());
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(markAgentAuditExecutedMock).not.toHaveBeenCalled();
    expect(markAgentAuditFallbackMock).not.toHaveBeenCalled();
    expect(json).toEqual(expect.objectContaining({
      status: "awaiting_approval",
      auditLogId: "audit-1",
      approvedBy: "user-1",
      awaitingApproval: expect.objectContaining({
        auditLogId: "nested-approval-audit-1",
        proposed_capability: "legal_first_draft_generate",
      }),
    }));
  });
});
