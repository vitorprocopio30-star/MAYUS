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
        forecastBuckets: {
          dueIn7Days: { amount: 500, count: 1 },
          dueIn30Days: { amount: 0, count: 0 },
          future: { amount: 0, count: 0 },
          noDueDate: { amount: 0, count: 0 },
        },
        overdueAging: {
          days1To7: { amount: 250, count: 1 },
          days8To14: { amount: 0, count: 0 },
          days15To30: { amount: 0, count: 0 },
          days31Plus: { amount: 0, count: 0 },
        },
        riskItems: [
          {
            key: "case-1",
            label: "Maria",
            clientName: "Maria",
            caseId: "case-1",
            openAmount: 750,
            overdueAmount: 250,
            forecastAmount: 500,
            openCount: 2,
            overdueCount: 1,
            maxDaysOverdue: 3,
            oldestDueDate: "2026-05-10",
            riskLevel: "medium",
            nextBestAction: "Confirmar pagamento ou preparar renegociacao antes de novo envio externo.",
          },
        ],
        expenses: {
          fixed: { amount: 200, count: 1 },
          marketing: { amount: 100, count: 1 },
        },
      },
      commercialForecast: {
        source: "sales+crm_tasks",
        available: true,
        pipelineAmount: 5000,
        pendingContracts: { amount: 3000, count: 1 },
        closedContracts: { amount: 12000, count: 2 },
        lostAmount: 1000,
        byStage: [
          {
            stageId: "stage-1",
            stageName: "Proposta",
            amount: 2000,
            count: 1,
            isWin: false,
            isLoss: false,
          },
        ],
        topOpportunities: [
          {
            id: "crm:1",
            kind: "crm",
            label: "Oportunidade Maria",
            amount: 2000,
            stage: "Proposta",
            source: "indicacao",
            expectedDate: "2026-05-13",
            nextBestAction: "Priorizar follow-up humano e confirmar proximo compromisso.",
          },
        ],
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
      unitEconomics: {
        grossRevenue: 1000,
        directCosts: 100,
        commissions: 50,
        estimatedProfit: 850,
        estimatedMarginRate: 85,
        byCase: [
          {
            caseId: "case-1",
            label: "Maria",
            legalArea: "Previdenciario",
            receivedRevenue: 1000,
            openRevenue: 500,
            directCosts: 100,
            commissionCost: 50,
            estimatedProfit: 850,
            marginRate: 85,
            confidence: "high",
          },
        ],
        byLegalArea: [
          {
            legalArea: "Previdenciario",
            caseCount: 1,
            receivedRevenue: 1000,
            openRevenue: 500,
            directCosts: 100,
            commissionCost: 50,
            estimatedProfit: 850,
            marginRate: 85,
          },
        ],
        commissionsBreakdown: {
          byOwner: [{ label: "Closer", amount: 50, revenue: 1000, count: 1, share: 100 }],
          byOrigin: [{ label: "google", amount: 50, revenue: 1000, count: 1, share: 100 }],
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
    expect(json.summary.commercialForecast.pipelineAmount).toBe(5000);
    expect(json.summary.unitEconomics.estimatedProfit).toBe(850);
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
