import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  fromMock,
  insertMock,
  selectMock,
  singleMock,
  fetchAgentSkillByNameMock,
  checkTenantLimitsMock,
  listTenantIntegrationsSafeMock,
} = vi.hoisted(() => {
  const fromMock = vi.fn();
  return {
    createClientMock: vi.fn(() => ({ from: fromMock })),
    fromMock,
    insertMock: vi.fn(),
    selectMock: vi.fn(),
    singleMock: vi.fn(),
    fetchAgentSkillByNameMock: vi.fn(),
    checkTenantLimitsMock: vi.fn(),
    listTenantIntegrationsSafeMock: vi.fn(),
  };
});

let tenantAiFeatures: Record<string, unknown> = {};

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/agent/capabilities/registry", () => ({
  fetchAgentSkillByName: fetchAgentSkillByNameMock,
}));

vi.mock("./limits", () => ({
  checkTenantLimits: checkTenantLimitsMock,
}));

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsSafe: listTenantIntegrationsSafeMock,
}));

import { execute } from "./executor";

function makeSkill(overrides: Record<string, unknown> = {}) {
  return {
    id: "skill-1",
    tenant_id: "tenant-1",
    name: "contract_generate",
    description: "Gera contrato supervisionado.",
    version: "1.0",
    schema_version: "1",
    input_schema: {},
    output_schema: {},
    allowed_roles: ["admin", "socio", "mayus_admin"],
    allowed_channels: ["chat"],
    requires_human_confirmation: false,
    risk_level: "high",
    is_active: true,
    handler_type: "zapsign_contract",
    ...overrides,
  };
}

describe("execute - authorization guards", () => {
  beforeEach(() => {
    createClientMock.mockReset();
    fromMock.mockReset();
    insertMock.mockReset();
    selectMock.mockReset();
    singleMock.mockReset();
    fetchAgentSkillByNameMock.mockReset();
    checkTenantLimitsMock.mockReset();
    listTenantIntegrationsSafeMock.mockReset();

    tenantAiFeatures = {
      mayus_agentic_policy: {
        autonomy_mode: "supervised",
        module_modes: {
          setup: "auto_low_risk",
          growth: "supervised",
          finance: "supervised",
          legal_ops: "supervised",
          documents: "supervised",
        },
        tool_policy: { allow: ["*"], deny: [] },
      },
    };

    singleMock.mockResolvedValue({ data: { id: "audit-1" }, error: null });
    selectMock.mockReturnValue({ single: singleMock });
    insertMock.mockReturnValue({ select: selectMock });
    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_settings") {
        const query: any = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: { ai_features: tenantAiFeatures }, error: null })),
        };
        return query;
      }
      return { insert: insertMock };
    });
    createClientMock.mockReturnValue({ from: fromMock });
    fetchAgentSkillByNameMock.mockResolvedValue(makeSkill({ risk_level: "low", handler_type: "setup_profile" }));
    checkTenantLimitsMock.mockResolvedValue({ allowed: true });
    listTenantIntegrationsSafeMock.mockResolvedValue([
      { provider: "asaas", status: "connected", has_api_key: true },
      { provider: "escavador", status: "connected", has_api_key: true },
      { provider: "evolution", status: "connected", has_api_key: true },
      { provider: "zapsign", status: "connected", has_api_key: true },
    ]);
  });

  it("permite papeis canonicos mesmo quando o perfil vem com acento ou maiusculas", async () => {
    const result = await execute(
      {
        intent: "contract_generate",
        entities: { signer_name: "Cliente Teste" },
        confidence: 0.95,
        safeText: "gerar contrato para Cliente Teste",
        ambiguous: false,
      },
      {
        userId: "user-1",
        tenantId: "tenant-1",
        userRole: "Administrador",
        channel: "chat",
      }
    );

    expect(result.status).toBe("success");
    expect(result.auditLogId).toBe("audit-1");
    expect(fromMock).toHaveBeenCalledWith("agent_audit_logs");
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "self_correction_not_available",
      source_module: "agent_executor",
      payload: expect.objectContaining({
        correction_status: "no_correction_available",
        correction_kind: "policy_preflight",
        external_side_effects_blocked: false,
      }),
    }));
  });

  it("trata roles e canais vazios como liberacao controlada pela skill", async () => {
    fetchAgentSkillByNameMock.mockResolvedValue(makeSkill({
      name: "marketing_ops_assistant",
      handler_type: "growth_marketing_ops_assistant",
      allowed_roles: null,
      allowed_channels: null,
      risk_level: "low",
    }));

    const result = await execute(
      {
        intent: "marketing_ops_assistant",
        entities: { process_number: "1234567-89.2024.8.26.0100" },
        confidence: 0.95,
        safeText: "ver contexto juridico",
        ambiguous: false,
      },
      {
        userId: "user-1",
        tenantId: "tenant-1",
        userRole: "Advogado",
        channel: "chat",
      }
    );

    expect(result.status).toBe("success");
    expect(result.auditLogId).toBe("audit-1");
  });

  it("abre aprovacao quando a policy classifica uma skill sensivel mesmo sem flag estatica", async () => {
    fetchAgentSkillByNameMock.mockResolvedValue(makeSkill({
      name: "contract_generate",
      handler_type: "zapsign_contract",
      requires_human_confirmation: false,
      risk_level: "high",
    }));

    const result = await execute(
      {
        intent: "contract_generate",
        entities: { signer_name: "Cliente Teste" },
        confidence: 0.95,
        safeText: "gerar contrato para Cliente Teste",
        ambiguous: false,
      },
      {
        userId: "user-1",
        tenantId: "tenant-1",
        userRole: "Administrador",
        channel: "chat",
      }
    );

    expect(result.status).toBe("awaiting_approval");
    expect(result.awaitingPayload).toEqual(expect.objectContaining({
      policyDecision: expect.objectContaining({
        outcome: "requires_approval",
        surface: "external_message",
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      approval_context: expect.objectContaining({
        policy_decision: expect.objectContaining({
          surface: "external_message",
          profile_explanation: expect.objectContaining({
            source: "tenant_settings.ai_features.agent_profiles",
            subject: expect.objectContaining({
              channel: "chat",
              surface: "external_message",
            }),
          }),
        }),
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "self_correction_requires_approval",
      source_module: "agent_executor",
      payload: expect.objectContaining({
        correction_status: "requires_approval",
        correction_kind: "supervision_required",
        external_side_effects_blocked: true,
      }),
    }));
  });

  it("bloqueia skill negada pela policy sem executar", async () => {
    tenantAiFeatures = {
      mayus_agentic_policy: {
        autonomy_mode: "auto_low_risk",
        module_modes: { setup: "auto_low_risk" },
        tool_policy: { allow: ["*"], deny: ["dangerous_tool"] },
      },
    };
    fetchAgentSkillByNameMock.mockResolvedValue(makeSkill({
      name: "dangerous_tool",
      handler_type: "setup_profile",
      risk_level: "low",
    }));

    const result = await execute(
      {
        intent: "dangerous_tool",
        entities: { api_key: "sk-secret" },
        confidence: 0.95,
        safeText: "rodar ferramenta perigosa",
        ambiguous: false,
      },
      {
        userId: "user-1",
        tenantId: "tenant-1",
        userRole: "Administrador",
        channel: "chat",
      }
    );

    expect(result.status).toBe("policy_blocked");
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "skill_blocked",
      approval_context: expect.objectContaining({
        policy_decision: expect.objectContaining({
          outcome: "blocked_needs_credentials",
        }),
      }),
    }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "self_correction_blocked",
      source_module: "agent_executor",
      payload: expect.objectContaining({
        correction_status: "blocked",
        correction_kind: "missing_configuration",
        external_side_effects_blocked: true,
      }),
    }));
    expect(JSON.stringify(insertMock.mock.calls.at(-1)?.[0]?.approval_context)).not.toContain("sk-secret");
  });

  it("bloqueia skill que depende de credencial ausente sem vazar segredo", async () => {
    listTenantIntegrationsSafeMock.mockResolvedValueOnce([]);
    fetchAgentSkillByNameMock.mockResolvedValue(makeSkill({
      name: "contract_generate",
      handler_type: "zapsign_contract",
      requires_human_confirmation: false,
      risk_level: "high",
    }));

    const result = await execute(
      {
        intent: "contract_generate",
        entities: { signer_name: "Cliente Teste", api_key: "sk-secret" },
        confidence: 0.95,
        safeText: "gerar contrato para Cliente Teste",
        ambiguous: false,
      },
      {
        userId: "user-1",
        tenantId: "tenant-1",
        userRole: "Administrador",
        channel: "chat",
      }
    );

    expect(result.status).toBe("policy_blocked");
    expect(result.message).toContain("credencial");
    expect(listTenantIntegrationsSafeMock).toHaveBeenCalledWith("tenant-1", ["zapsign"]);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "skill_blocked",
      approval_context: expect.objectContaining({
        policy_decision: expect.objectContaining({
          required_credential_providers: ["zapsign"],
        }),
      }),
    }));
    expect(JSON.stringify(insertMock.mock.calls.at(-1)?.[0])).not.toContain("sk-secret");
  });

  it("normaliza cobranca e abre aprovacao sem executar Asaas", async () => {
    fetchAgentSkillByNameMock.mockResolvedValue(makeSkill({
      name: "billing_create",
      description: "Cria cobranca no Asaas com link de pagamento supervisionado.",
      requires_human_confirmation: true,
      handler_type: "asaas_cobrar",
    }));

    const result = await execute(
      {
        intent: "billing_create",
        entities: { nome_cliente: "Maria Silva", valor: "1.500,00" },
        confidence: 0.95,
        safeText: "cobre a entrada da Maria em R$ 1500",
        ambiguous: false,
      },
      {
        userId: "user-1",
        tenantId: "tenant-1",
        userRole: "Administrador",
        channel: "chat",
      }
    );

    expect(result.status).toBe("awaiting_approval");
    expect(result.auditLogId).toBe("audit-1");
    expect(result.awaitingPayload).toEqual(expect.objectContaining({
      skillName: "billing_create",
      riskLevel: "high",
      entities: expect.objectContaining({
        nome_cliente: "Maria Silva",
        valor: "1500",
        billing_type: "UNDEFINED",
        vencimento: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    }));
    expect(fromMock).toHaveBeenCalledWith("agent_audit_logs");
  });
});
