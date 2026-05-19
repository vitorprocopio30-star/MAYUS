import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  createServerClientMock,
  cookiesMock,
  adminFromMock,
  getSessionMock,
  inserts,
} = vi.hoisted(() => {
  const localAdminFromMock = vi.fn();
  return {
    createClientMock: vi.fn(() => ({ from: localAdminFromMock })),
    createServerClientMock: vi.fn(),
    cookiesMock: vi.fn(),
    adminFromMock: localAdminFromMock,
    getSessionMock: vi.fn(),
    inserts: [] as Array<{ table: string; payload: any }>,
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

import { GET, POST } from "./route";

function profileQuery(data: unknown) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(async () => ({ data, error: null })),
  };
  return chain;
}

function brainMemoryInsertQuery() {
  let inserted: any;
  const chain: any = {
    insert: vi.fn((payload: any) => {
      inserted = payload;
      inserts.push({ table: "brain_memories", payload });
      return chain;
    }),
    select: vi.fn(() => chain),
    single: vi.fn(async () => ({
      data: {
        id: "brain-memory-1",
        memory_key: inserted.memory_key,
        value: inserted.value,
        source: inserted.source,
        confidence: inserted.confidence,
        promoted: inserted.promoted,
        created_by: inserted.created_by,
        created_at: "2026-05-15T20:20:00.000Z",
        updated_at: null,
      },
      error: null,
    })),
  };
  return chain;
}

function learningEventInsertQuery() {
  return {
    insert: vi.fn(async (payload: any) => {
      inserts.push({ table: "learning_events", payload });
      return { error: null };
    }),
  };
}

function officeMemorySelectQuery(data: any[]) {
  let orderCalls = 0;
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => {
      orderCalls += 1;
      return orderCalls >= 2 ? Promise.resolve({ data, error: null }) : chain;
    }),
  };
  return chain;
}

function proposalSelectQuery(data: any[]) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(async () => ({ data, error: null })),
  };
  return chain;
}

function correctionSelectQuery(data: any[]) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(async () => ({ data, error: null })),
  };
  return chain;
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/agent/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/agent/memory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;

    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";

    createClientMock.mockReturnValue({ from: adminFromMock });
    createServerClientMock.mockReturnValue({
      auth: { getSession: getSessionMock },
    });
    cookiesMock.mockResolvedValue({ getAll: () => [], set: vi.fn() });
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
      error: null,
    });
  });

  it("retorna resumo operacional de auto-correcao sem expor segredo", async () => {
    adminFromMock.mockImplementation((table: string) => {
      if (table === "profiles") {
        return profileQuery({ role: "administrador", tenant_id: "tenant-1" });
      }
      if (table === "office_institutional_memory") {
        return officeMemorySelectQuery([]);
      }
      if (table === "brain_memories") {
        return proposalSelectQuery([]);
      }
      if (table === "learning_events") {
        return correctionSelectQuery([
          {
            id: "correction-1",
            event_type: "self_correction_applied",
            source_module: "mayus_operating_partner",
            payload: {
              correction_status: "corrected",
              correction_kind: "operating_partner_reply_repair",
              target_module: "whatsapp_reply",
              recommended_action: "Aplicar resposta reparada.",
            },
            created_at: "2026-05-19T10:00:00.000Z",
          },
          {
            id: "correction-2",
            event_type: "self_correction_blocked",
            source_module: "agent_executor",
            payload: {
              correction_status: "blocked",
              correction_kind: "missing_configuration",
              reason: "api_key=super-secret-value",
              external_side_effects_blocked: true,
            },
            created_at: "2026-05-19T09:00:00.000Z",
          },
        ]);
      }
      return profileQuery(null);
    });

    const response = await GET();
    const json = await response.json();
    const serialized = JSON.stringify(json);

    expect(response.status).toBe(200);
    expect(json.correctionSummary).toEqual(expect.objectContaining({
      total: 2,
      corrected: 1,
      blocked: 1,
      failed: 0,
    }));
    expect(json.correctionSummary.recent[0]).toEqual(expect.objectContaining({
      id: "correction-1",
      status: "corrected",
      correctionKind: "operating_partner_reply_repair",
      targetModule: "whatsapp_reply",
    }));
    expect(serialized).toContain("[redacted]");
    expect(serialized).not.toContain("super-secret-value");
  });
});

describe("POST /api/agent/memory Hermes lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;

    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";

    createClientMock.mockReturnValue({ from: adminFromMock });
    createServerClientMock.mockReturnValue({
      auth: { getSession: getSessionMock },
    });
    cookiesMock.mockResolvedValue({ getAll: () => [], set: vi.fn() });
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: "user-1" } } },
      error: null,
    });

    adminFromMock.mockImplementation((table: string) => {
      if (table === "profiles") {
        return profileQuery({ role: "administrador", tenant_id: "tenant-1" });
      }
      if (table === "brain_memories") {
        return brainMemoryInsertQuery();
      }
      if (table === "learning_events") {
        return learningEventInsertQuery();
      }
      return profileQuery(null);
    });
  });

  it("persiste proposta Hermes supervisionada sem auto-aprovar nem vazar segredo", async () => {
    const response = await POST(request({
      action: "propose_hermes_lifecycle",
      kind: "skill",
      slug: "Triagem sensivel",
      title: "Triagem sensivel",
      description: "Nunca repetir bearer_token=secret-token-value nem operador@mayus.test.",
      confidence: 91,
      payload: {
        api_key: "api-secret-value",
        phone: "+55 11 98888-7777",
        safe_note: "Confirmar documentos antes de acionar rotina.",
      },
    }) as any);
    const json = await response.json();
    const serialized = JSON.stringify({ json, inserts });

    expect(response.status).toBe(201);
    expect(json.proposal).toEqual(expect.objectContaining({
      id: "brain-memory-1",
      key: "skill:triagem-sensivel",
      category: "hermes_skill_lifecycle",
      source: "hermes_lifecycle",
      confidence: 0.91,
      status: "proposed",
      promoted: false,
      createdBy: "user-1",
    }));
    expect(json.lifecycleEntry).toEqual(expect.objectContaining({
      kind: "skill",
      slug: "triagem-sensivel",
      status: "proposed",
      tenantId: "tenant-1",
      proposedBy: "user-1",
      approvedBy: null,
    }));

    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toMatchObject({
      table: "brain_memories",
      payload: {
        tenant_id: "tenant-1",
        scope: "tenant",
        memory_type: "institutional_memory_proposal",
        memory_key: "skill:triagem-sensivel",
        source: "hermes_lifecycle",
        confidence: 0.91,
        promoted: false,
        created_by: "user-1",
      },
    });
    expect(inserts[1]).toMatchObject({
      table: "learning_events",
      payload: {
        tenant_id: "tenant-1",
        event_type: "hermes_lifecycle_proposed",
        source_module: "agent_memory",
        created_by: "user-1",
      },
    });
    expect(serialized).toContain("[redacted]");
    expect(serialized).toContain("[pii-redacted]");
    expect(serialized).not.toContain("api-secret-value");
    expect(serialized).not.toContain("secret-token-value");
    expect(serialized).not.toContain("operador@mayus.test");
    expect(serialized).not.toContain("98888-7777");
    expect(serialized).not.toContain("\"status\":\"approved\"");
  });
});
