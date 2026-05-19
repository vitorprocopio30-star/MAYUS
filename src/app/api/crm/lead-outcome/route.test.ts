import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getTenantSessionMock, fromMock } = vi.hoisted(() => ({
  getTenantSessionMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: getTenantSessionMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: fromMock },
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/crm/lead-outcome", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeMaybeSingleQuery(result: { data: any; error: any }) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };
  return query;
}

function makeInsertQuery(inserts: any[]) {
  return {
    insert: vi.fn(async (payload: any) => {
      inserts.push(payload);
      return { error: null };
    }),
  };
}

describe("POST /api/crm/lead-outcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantSessionMock.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
  });

  it("exige sessao autenticada", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const response = await POST(buildRequest({ crmTaskId: "crm-1", outcome: "won" }));

    expect(response.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rejeita lead fora do tenant da sessao", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "crm_tasks") return makeMaybeSingleQuery({ data: null, error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const response = await POST(buildRequest({ crmTaskId: "crm-other", outcome: "won" }));

    expect(response.status).toBe(404);
  });

  it("grava outcome derivado da etapa final, sem confiar no body", async () => {
    const inserts: any[] = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "crm_tasks") {
        return makeMaybeSingleQuery({
          data: {
            id: "crm-1",
            tenant_id: "tenant-1",
            stage_id: "stage-won",
            created_at: "2026-05-01T00:00:00.000Z",
            value: 1200,
          },
          error: null,
        });
      }
      if (table === "crm_stages") {
        return makeMaybeSingleQuery({
          data: { id: "stage-won", is_win: true, is_loss: false },
          error: null,
        });
      }
      if (table === "learning_events") return makeInsertQuery(inserts);
      throw new Error(`unexpected table ${table}`);
    });

    const response = await POST(buildRequest({
      crmTaskId: "crm-1",
      outcome: "lost",
      motivo: "Fechou com sk-test-secret-super-longo-123456",
      valor: "R$ 1.200,00",
      fonte: "crm_board",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, outcome: "won" });
    expect(inserts[0]).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      event_type: "lead_outcome_recorded",
      source_module: "crm",
      created_by: "user-1",
      payload: expect.objectContaining({
        crm_task_id: "crm-1",
        outcome: "won",
        requested_outcome: "lost",
        stage_id: "stage-won",
        valor_cents: 120000,
        fonte: "crm_board",
      }),
    }));
    expect(JSON.stringify(inserts[0])).not.toContain("sk-test-secret-super-longo-123456");
  });

  it("grava perda quando etapa final e is_loss", async () => {
    const inserts: any[] = [];
    fromMock.mockImplementation((table: string) => {
      if (table === "crm_tasks") {
        return makeMaybeSingleQuery({
          data: {
            id: "crm-2",
            tenant_id: "tenant-1",
            stage_id: "stage-lost",
            created_at: "2026-05-02T00:00:00.000Z",
            value: null,
          },
          error: null,
        });
      }
      if (table === "crm_stages") {
        return makeMaybeSingleQuery({
          data: { id: "stage-lost", is_win: false, is_loss: true },
          error: null,
        });
      }
      if (table === "learning_events") return makeInsertQuery(inserts);
      throw new Error(`unexpected table ${table}`);
    });

    const response = await POST(buildRequest({ crmTaskId: "crm-2", outcome: "lost", motivo: "preco alto" }));

    expect(response.status).toBe(200);
    expect(inserts[0].payload).toEqual(expect.objectContaining({
      outcome: "lost",
      motivo: "preco alto",
    }));
  });
});
