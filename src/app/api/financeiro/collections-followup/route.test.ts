import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: vi.fn(),
}));

vi.mock("@/lib/brain/artifacts", () => ({
  createBrainArtifact: vi.fn(),
}));

vi.mock("@/lib/finance/tenant-finance-summary", () => ({
  loadTenantFinanceSummary: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { POST } from "./route";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { createBrainArtifact } from "@/lib/brain/artifacts";
import { loadTenantFinanceSummary } from "@/lib/finance/tenant-finance-summary";
import { supabaseAdmin } from "@/lib/supabase/admin";

const getTenantSessionMock = vi.mocked(getTenantSession);
const createBrainArtifactMock = vi.mocked(createBrainArtifact);
const loadTenantFinanceSummaryMock = vi.mocked(loadTenantFinanceSummary);
const fromMock = vi.mocked(supabaseAdmin.from);

const riskItem = {
  key: "case-risk-1",
  label: "Cliente Risco",
  clientName: "Cliente Risco",
  caseId: "case-1",
  openAmount: 7500,
  overdueAmount: 7500,
  forecastAmount: 0,
  openCount: 3,
  overdueCount: 3,
  maxDaysOverdue: 20,
  oldestDueDate: "2026-05-01",
  riskLevel: "high" as const,
  nextBestAction: "Priorizar plano de cobranca supervisionado.",
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/financeiro/collections-followup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeMaybeSingleQuery(result: { data: any; error: any }) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return query;
}

function makeSingleInsertQuery(result: { data: any; error: any }, inserts: any[]) {
  const query: any = {
    insert: vi.fn((payload) => {
      inserts.push(payload);
      return query;
    }),
    select: vi.fn(() => query),
    single: vi.fn().mockResolvedValue(result),
  };
  return query;
}

describe("POST /api/financeiro/collections-followup", () => {
  let artifactLookupResult: { data: any; error: any };
  let taskInsertResult: { data: any; error: any };
  let taskInserts: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    artifactLookupResult = { data: null, error: null };
    taskInsertResult = { data: { id: "task-1" }, error: null };
    taskInserts = [];

    getTenantSessionMock.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    loadTenantFinanceSummaryMock.mockResolvedValue({
      tenantId: "tenant-1",
      generatedAt: "2026-05-14T12:00:00.000Z",
      financials: {
        riskItems: [riskItem],
      },
    } as any);
    createBrainArtifactMock.mockResolvedValue({ id: "artifact-1" } as any);
    fromMock.mockImplementation((table: string) => {
      if (table === "brain_artifacts") return makeMaybeSingleQuery(artifactLookupResult);
      if (table === "brain_tasks") return makeSingleInsertQuery(taskInsertResult, taskInserts);
      throw new Error(`Tabela inesperada: ${table}`);
    });
  });

  it("retorna 401 quando nao ha sessao", async () => {
    getTenantSessionMock.mockRejectedValue(new Error("Unauthorized"));

    const res = await POST(makeRequest({ riskKey: riskItem.key }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toMatch(/autenticado/i);
    expect(loadTenantFinanceSummaryMock).not.toHaveBeenCalled();
  });

  it("retorna 403 quando usuario nao tem acesso completo", async () => {
    getTenantSessionMock.mockRejectedValue(new Error("Forbidden"));

    const res = await POST(makeRequest({ riskKey: riskItem.key }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/acesso negado/i);
  });

  it("recarrega o resumo pelo tenant da sessao e retorna 404 para riskKey inexistente", async () => {
    const res = await POST(makeRequest({ riskKey: "outro-risco" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/nao encontrado/i);
    expect(getTenantSessionMock).toHaveBeenCalledWith({ requireFullAccess: true });
    expect(loadTenantFinanceSummaryMock).toHaveBeenCalledWith({
      supabase: supabaseAdmin,
      tenantId: "tenant-1",
    });
    expect(createBrainArtifactMock).not.toHaveBeenCalled();
  });

  it("cria artifact collections_followup_plan sem side effect externo", async () => {
    const res = await POST(makeRequest({ riskKey: riskItem.key }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({
      ok: true,
      artifactId: "artifact-1",
      deduped: false,
    }));
    expect(body.plan).toEqual(expect.objectContaining({
      clientName: "Cliente Risco",
      amount: 7500,
      daysOverdue: 20,
      externalSideEffectsBlocked: true,
      requiresHumanApproval: true,
    }));
    expect(taskInserts[0]).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      created_by: "user-1",
      channel: "dashboard",
      module: "finance",
      status: "completed",
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "task-1",
      artifactType: "collections_followup_plan",
      sourceModule: "finance",
      dedupeKey: expect.stringContaining("collections-risk:case-risk-1"),
      metadata: expect.objectContaining({
        risk_key: "case-risk-1",
        risk_level: "high",
        external_side_effects_blocked: true,
        requires_human_approval: true,
        requires_human_action: true,
      }),
    }));
  });

  it("reaproveita artifact existente pelo dedupe e nao duplica plano", async () => {
    artifactLookupResult = { data: { id: "artifact-existing" }, error: null };

    const res = await POST(makeRequest({ riskKey: riskItem.key }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({
      ok: true,
      artifactId: "artifact-existing",
      deduped: true,
    }));
    expect(createBrainArtifactMock).not.toHaveBeenCalled();
    expect(taskInserts).toHaveLength(0);
  });
});
