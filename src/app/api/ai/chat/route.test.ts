import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  createServerClientMock,
  cookiesMock,
  getUserMock,
  adminFromMock,
  userFromMock,
  fetchTenantAgentSkillsMock,
  canExecuteAgentSkillMock,
  executeMock,
  dispatchCapabilityExecutionMock,
  callLLMWithFallbackMock,
} = vi.hoisted(() => {
  const localAdminFromMock = vi.fn();
  return {
    createClientMock: vi.fn(() => ({ from: localAdminFromMock })),
    createServerClientMock: vi.fn(),
    cookiesMock: vi.fn(),
    getUserMock: vi.fn(),
    adminFromMock: localAdminFromMock,
    userFromMock: vi.fn(),
    fetchTenantAgentSkillsMock: vi.fn(),
    canExecuteAgentSkillMock: vi.fn(),
    executeMock: vi.fn(),
    dispatchCapabilityExecutionMock: vi.fn(),
    callLLMWithFallbackMock: vi.fn(),
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

vi.mock("@/lib/llm-fallback", () => ({
  callLLMWithFallback: callLLMWithFallbackMock,
}));

vi.mock("@/lib/agent/kernel/executor", () => ({
  execute: executeMock,
}));

vi.mock("@/lib/agent/capabilities/dispatcher", () => ({
  dispatchCapabilityExecution: dispatchCapabilityExecutionMock,
}));

vi.mock("@/lib/agent/capabilities/registry", () => ({
  fetchTenantAgentSkills: fetchTenantAgentSkillsMock,
  canExecuteAgentSkill: canExecuteAgentSkillMock,
}));

import { POST } from "./route";

function queryChain(data: unknown = null) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data, error: null })),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    update: vi.fn(() => chain),
  };
  return chain;
}

function buildRequest(message: string) {
  return new Request("http://localhost:3000/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      provider: "openrouter",
      history: [],
      taskId: "brain-task-1",
      runId: "brain-run-1",
      stepId: "brain-step-1",
    }),
  });
}

const missionSkills = [
  {
    name: "legal_process_mission_plan",
    description: "Monta missao processual.",
    input_schema: { type: "object", properties: {} },
    handler_type: "lex_process_mission_plan",
  },
  {
    name: "legal_process_mission_execute_next",
    description: "Executa proximo passo seguro.",
    input_schema: { type: "object", properties: {} },
    handler_type: "lex_process_mission_execute_next",
  },
];

describe("POST /api/ai/chat deterministic process mission routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";

    createClientMock.mockReturnValue({
      from: adminFromMock,
    });
    createServerClientMock.mockReturnValue({
      auth: { getUser: getUserMock },
      from: userFromMock,
    });
    cookiesMock.mockResolvedValue({ getAll: () => [], set: vi.fn() });
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    adminFromMock.mockImplementation((table: string) => {
      if (table === "profiles") {
        return queryChain({ role: "admin", tenant_id: "tenant-1" });
      }
      if (table === "brain_steps") {
        return queryChain(null);
      }
      return queryChain(null);
    });
    userFromMock.mockImplementation((table: string) => {
      if (table === "office_institutional_memory") return queryChain([]);
      return queryChain(null);
    });

    fetchTenantAgentSkillsMock.mockResolvedValue(missionSkills);
    canExecuteAgentSkillMock.mockResolvedValue({ status: "allowed" });
    executeMock.mockResolvedValue({ status: "success", auditLogId: "audit-1" });
    dispatchCapabilityExecutionMock.mockResolvedValue({
      status: "executed",
      reply: "## Execucao da missao processual",
      outputPayload: {
        process_task_id: "process-task-1",
        process_mission_recommended_action: "refresh_document_memory",
      },
      data: { ok: true },
    });
  });

  it("executa execute_next pelo router local sem chamar LLM", async () => {
    const response = await POST(buildRequest(
      "Mayus, execute o proximo passo seguro da missao do processo 1234567-89.2024.8.26.0100."
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(callLLMWithFallbackMock).not.toHaveBeenCalled();
    expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({
      intent: "legal_process_mission_execute_next",
      entities: { process_number: "1234567-89.2024.8.26.0100" },
    }), expect.objectContaining({ tenantId: "tenant-1", userId: "user-1" }));
    expect(dispatchCapabilityExecutionMock).toHaveBeenCalledWith(expect.objectContaining({
      handlerType: "lex_process_mission_execute_next",
      capabilityName: "legal_process_mission_execute_next",
      tenantId: "tenant-1",
      userId: "user-1",
      auditLogId: "audit-1",
      brainContext: expect.objectContaining({
        taskId: "brain-task-1",
        runId: "brain-run-1",
        stepId: "brain-step-1",
      }),
    }));
    expect(json.kernel).toEqual(expect.objectContaining({
      status: "executed",
      auditLogId: "audit-1",
      capabilityName: "legal_process_mission_execute_next",
      handlerType: "lex_process_mission_execute_next",
    }));
  });

  it("executa plan pelo router local sem chamar LLM", async () => {
    dispatchCapabilityExecutionMock.mockResolvedValueOnce({
      status: "executed",
      reply: "## Missao agentica do processo",
      outputPayload: { process_mission_recommended_action: "generate_first_draft" },
      data: { ok: true },
    });

    const response = await POST(buildRequest(
      "Mayus, monte um plano agentico do processo 1234567-89.2024.8.26.0100 e diga a proxima acao segura."
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(callLLMWithFallbackMock).not.toHaveBeenCalled();
    expect(dispatchCapabilityExecutionMock).toHaveBeenCalledWith(expect.objectContaining({
      handlerType: "lex_process_mission_plan",
      capabilityName: "legal_process_mission_plan",
    }));
    expect(json.kernel).toEqual(expect.objectContaining({
      status: "executed",
      capabilityName: "legal_process_mission_plan",
      handlerType: "lex_process_mission_plan",
    }));
  });

  it("propaga aprovacao supervisionada criada pelo Lex execute_next", async () => {
    dispatchCapabilityExecutionMock.mockResolvedValueOnce({
      status: "awaiting_approval",
      reply: "## Missao juridica supervisionada",
      outputPayload: {
        auditLogId: "approval-audit-draft-1",
        process_task_id: "process-task-1",
        process_mission_recommended_action: "generate_first_draft",
        proposed_capability: "legal_first_draft_generate",
        proposed_handler_type: "lex_first_draft_generate",
        awaitingPayload: {
          entities: { process_task_id: "process-task-1" },
          skillName: "legal_first_draft_generate",
          riskLevel: "high",
          schemaVersion: "1.0.0",
        },
      },
      data: { ok: true },
    });

    const response = await POST(buildRequest(
      "Mayus, execute o proximo passo seguro da missao do processo 1234567-89.2024.8.26.0100."
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(callLLMWithFallbackMock).not.toHaveBeenCalled();
    expect(json.kernel).toEqual(expect.objectContaining({
      status: "awaiting_approval",
      auditLogId: "approval-audit-draft-1",
      capabilityName: "legal_first_draft_generate",
      handlerType: "lex_first_draft_generate",
      awaitingPayload: expect.objectContaining({
        skillName: "legal_first_draft_generate",
        riskLevel: "high",
        entities: { process_task_id: "process-task-1" },
      }),
    }));
  });
});
