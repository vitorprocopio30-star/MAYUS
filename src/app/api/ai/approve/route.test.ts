import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  createServerClientMock,
  cookiesMock,
  getUserMock,
  fromMock,
  dispatchCapabilityExecutionMock,
  fetchAgentSkillByNameMock,
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
});
