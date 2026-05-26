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
    name: "management_intelligence_brief",
    description: "Cria brief de inteligencia de gestao.",
    input_schema: { type: "object", properties: {} },
    handler_type: "management_intelligence_brief",
  },
  {
    name: "office_setup_conversation",
    description: "Conduz onboarding operacional do escritorio.",
    input_schema: { type: "object", properties: {} },
    handler_type: "setup_office_profile_conversation",
  },
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
  {
    name: "legal_case_brain_insights",
    description: "Gera Case Brain 2.0.",
    input_schema: { type: "object", properties: {} },
    handler_type: "lex_case_brain_insights",
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

  it("executa onboarding operacional pelo router local sem chamar LLM", async () => {
    dispatchCapabilityExecutionMock.mockResolvedValueOnce({
      status: "executed",
      reply: "## Perfil operacional configurado",
      outputPayload: {
        office_setup_persisted: true,
        operational_methodology_persisted: true,
        setup_status: "validated",
        methodology_status: "approved",
        artifact_type: "office_operational_methodology",
        legacy_artifact_type: "office_setup_conversation",
        event_type: "office_operational_methodology_approved",
        external_side_effects: [],
      },
      data: { ok: true },
    });

    const response = await POST(buildRequest(
      "Mayus, configure o escritorio. Nome do escritorio: Dutra Advocacia. Areas de atuacao: Bancario | Previdenciario. Tom: curto e consultivo. Triagem: perguntar cidade e documentos. Handoff: urgencia juridica chama humano. Documentos: contrato e contracheque. Promessas proibidas: nunca prometer ganho. SLA: responder em ate 1 hora. Departamentos: comercial e juridico. Permissoes: socio aprova contrato, cobranca e envio externo. Agenda: consulta pode ser sugerida, confirmacao externa exige humano. Financeiro: cobrancas e renegociacoes ficam supervisionadas. Playbook: usar roteiro consultivo curto. Pode salvar."
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(callLLMWithFallbackMock).not.toHaveBeenCalled();
    expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({
      intent: "office_setup_conversation",
      entities: expect.objectContaining({
        office_name: "Dutra Advocacia",
        practice_areas: "Bancario | Previdenciario",
        communication_tone: "curto e consultivo",
        triage_rules: "perguntar cidade e documentos",
        human_handoff_rules: "urgencia juridica chama humano",
        required_documents_by_case: "contrato e contracheque",
        forbidden_claims: "nunca prometer ganho",
        response_sla: "responder em ate 1 hora",
        departments: "comercial e juridico",
        permission_policy: "socio aprova contrato, cobranca e envio externo",
        calendar_policy: "consulta pode ser sugerida, confirmacao externa exige humano",
        finance_policy: "cobrancas e renegociacoes ficam supervisionadas",
        playbook_notes: "usar roteiro consultivo curto",
        confirmation: "Pode salvar",
      }),
    }), expect.objectContaining({ tenantId: "tenant-1", userId: "user-1" }));
    expect(dispatchCapabilityExecutionMock).toHaveBeenCalledWith(expect.objectContaining({
      handlerType: "setup_office_profile_conversation",
      capabilityName: "office_setup_conversation",
      tenantId: "tenant-1",
      userId: "user-1",
      auditLogId: "audit-1",
    }));
    expect(json.kernel).toEqual(expect.objectContaining({
      status: "executed",
      auditLogId: "audit-1",
      capabilityName: "office_setup_conversation",
      handlerType: "setup_office_profile_conversation",
      outputPayload: expect.objectContaining({
        office_setup_persisted: true,
        operational_methodology_persisted: true,
        setup_status: "validated",
        methodology_status: "approved",
        artifact_type: "office_operational_methodology",
        legacy_artifact_type: "office_setup_conversation",
        event_type: "office_operational_methodology_approved",
        external_side_effects: [],
      }),
    }));
  });

  it("executa inteligencia de gestao pelo router local sem chamar LLM", async () => {
    dispatchCapabilityExecutionMock.mockResolvedValueOnce({
      status: "executed",
      reply: "## Inteligencia de gestao",
      outputPayload: {
        artifact_type: "management_intelligence_brief",
        readiness_status: "partial",
        readiness_confidence: "low",
        external_side_effects_blocked: true,
        strategic_decision_blocked: true,
      },
      data: { ok: true },
    });

    const response = await POST(buildRequest(
      "Mayus, analise meu escritorio como CEO e explique CAC, pipeline e margem antes de eu decidir."
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(callLLMWithFallbackMock).not.toHaveBeenCalled();
    expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({
      intent: "management_intelligence_brief",
      entities: expect.objectContaining({
        focus_terms: "CAC",
      }),
    }), expect.objectContaining({ tenantId: "tenant-1", userId: "user-1" }));
    expect(dispatchCapabilityExecutionMock).toHaveBeenCalledWith(expect.objectContaining({
      handlerType: "management_intelligence_brief",
      capabilityName: "management_intelligence_brief",
      tenantId: "tenant-1",
      userId: "user-1",
      auditLogId: "audit-1",
    }));
    expect(json.kernel).toEqual(expect.objectContaining({
      status: "executed",
      capabilityName: "management_intelligence_brief",
      handlerType: "management_intelligence_brief",
      outputPayload: expect.objectContaining({
        artifact_type: "management_intelligence_brief",
        strategic_decision_blocked: true,
      }),
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

  it("executa Case Brain 2.0 pelo router local sem chamar LLM", async () => {
    dispatchCapabilityExecutionMock.mockResolvedValueOnce({
      status: "executed",
      reply: "## Case Brain 2.0",
      outputPayload: { risk_count: 2, contradiction_count: 1 },
      data: { ok: true },
    });

    const response = await POST(buildRequest(
      "Mayus, gere o Case Brain 2.0 com cronologia estruturada e mapa de riscos do processo 1234567-89.2024.8.26.0100."
    ));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(callLLMWithFallbackMock).not.toHaveBeenCalled();
    expect(dispatchCapabilityExecutionMock).toHaveBeenCalledWith(expect.objectContaining({
      handlerType: "lex_case_brain_insights",
      capabilityName: "legal_case_brain_insights",
    }));
    expect(json.kernel).toEqual(expect.objectContaining({
      status: "executed",
      capabilityName: "legal_case_brain_insights",
      handlerType: "lex_case_brain_insights",
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
