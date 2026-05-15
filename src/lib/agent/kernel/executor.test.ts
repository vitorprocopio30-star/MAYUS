import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  fromMock,
  insertMock,
  selectMock,
  singleMock,
  fetchAgentSkillByNameMock,
  checkTenantLimitsMock,
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
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/agent/capabilities/registry", () => ({
  fetchAgentSkillByName: fetchAgentSkillByNameMock,
}));

vi.mock("./limits", () => ({
  checkTenantLimits: checkTenantLimitsMock,
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

    singleMock.mockResolvedValue({ data: { id: "audit-1" }, error: null });
    selectMock.mockReturnValue({ single: singleMock });
    insertMock.mockReturnValue({ select: selectMock });
    fromMock.mockReturnValue({ insert: insertMock });
    createClientMock.mockReturnValue({ from: fromMock });
    fetchAgentSkillByNameMock.mockResolvedValue(makeSkill());
    checkTenantLimitsMock.mockResolvedValue({ allowed: true });
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
  });

  it("trata roles e canais vazios como liberacao controlada pela skill", async () => {
    fetchAgentSkillByNameMock.mockResolvedValue(makeSkill({
      allowed_roles: null,
      allowed_channels: null,
      risk_level: "low",
    }));

    const result = await execute(
      {
        intent: "legal_case_context",
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
