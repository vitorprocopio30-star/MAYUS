import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: vi.fn(),
}));

vi.mock("@/lib/finance/tenant-finance-summary", () => ({
  loadTenantFinanceSummary: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { GET } from "./route";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { loadTenantFinanceSummary } from "@/lib/finance/tenant-finance-summary";
import { supabaseAdmin } from "@/lib/supabase/admin";

const getTenantSessionMock = vi.mocked(getTenantSession);
const loadTenantFinanceSummaryMock = vi.mocked(loadTenantFinanceSummary);

describe("GET /api/financeiro/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantSessionMock.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    loadTenantFinanceSummaryMock.mockResolvedValue({
      tenantId: "tenant-1",
      generatedAt: "2026-05-13T12:00:00.000Z",
      financials: {
        received: { amount: 1000, count: 1 },
        forecast: { amount: 500, count: 1 },
        overdue: { amount: 250, count: 1 },
        delinquency: { amount: 250, count: 1, rate: 33.3 },
        openCharges: { amount: 750, count: 2 },
        expenses: {
          fixed: { amount: 200, count: 1 },
          marketing: { amount: 100, count: 1 },
        },
      },
      collectionsFollowup: {
        source: "brain_artifacts",
        available: true,
        totalPlans: 1,
        highPriorityPlans: 1,
        recentPlans: [],
      },
      revenueReconciliation: {
        source: "financials+brain_artifacts+process_tasks",
        available: true,
        report: {
          generatedAt: "2026-05-13T12:00:00.000Z",
          totals: {
            financialCount: 1,
            billingArtifactCount: 1,
            revenueArtifactCount: 1,
            processTaskCount: 1,
            matched: 1,
            partial: 0,
            blocked: 0,
            unmatched: 0,
            receivedRevenue: 1000,
            openedCaseRevenue: 1000,
          },
          items: [],
          nextBestActions: [],
        },
      },
    });
  });

  it("loads a tenant-scoped finance summary for the active session", async () => {
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.summary.financials.received.amount).toBe(1000);
    expect(loadTenantFinanceSummaryMock).toHaveBeenCalledWith({
      supabase: supabaseAdmin,
      tenantId: "tenant-1",
    });
  });

  it("returns 401 when the user is not authenticated", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Nao autenticado." });
    expect(loadTenantFinanceSummaryMock).not.toHaveBeenCalled();
  });

  it("does not leak database errors in the response body", async () => {
    loadTenantFinanceSummaryMock.mockRejectedValueOnce(new Error("relation financials exploded"));

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: "Nao foi possivel carregar o resumo financeiro." });
    expect(JSON.stringify(json)).not.toContain("relation financials exploded");
  });
});
