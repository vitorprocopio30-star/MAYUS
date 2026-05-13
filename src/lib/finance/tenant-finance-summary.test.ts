import { describe, expect, it } from "vitest";
import { buildTenantFinanceSummaryFromRows } from "./tenant-finance-summary";

describe("tenant finance summary", () => {
  it("summarizes received, open, overdue and collections followup plans by tenant rows", () => {
    const summary = buildTenantFinanceSummaryFromRows({
      tenantId: "tenant-1",
      now: new Date("2026-05-13T12:00:00.000Z"),
      financialRows: [
        {
          id: "fin-paid",
          external_id: "pay-1",
          amount: 2500,
          status: "PAYMENT_RECEIVED",
          type: "receita",
          source: "asaas",
          reference_date: "2026-05-10",
        },
        {
          id: "fin-overdue",
          amount: 1000,
          status: "Pendente",
          type: "receita",
          due_date: "2026-05-01",
        },
        {
          id: "fin-open",
          amount: 2000,
          status: "Pendente",
          type: "receita",
          due_date: "2026-05-20",
        },
        {
          id: "fin-marketing",
          amount: -300,
          status: "Pago",
          type: "despesa",
          description: "Meta Ads",
        },
      ],
      brainArtifacts: [
        {
          id: "artifact-1",
          artifact_type: "collections_followup_plan",
          title: "Plano de cobranca Maria",
          source_module: "finance",
          created_at: "2026-05-12T12:00:00.000Z",
          metadata: {
            client_name: "Maria",
            amount: 1000,
            days_overdue: 12,
            due_date: "2026-05-01",
            collection_priority: "high",
            next_best_action: "Revisar proposta de renegociacao.",
            requires_human_approval: true,
          },
        },
        {
          id: "billing-1",
          artifact_type: "asaas_billing",
          title: "Cobranca Maria",
          created_at: "2026-05-10T12:00:00.000Z",
          metadata: {
            cobranca_id: "pay-1",
            nome_cliente: "Maria",
            valor: 2500,
          },
        },
        {
          id: "opening-1",
          artifact_type: "revenue_case_opening",
          title: "Caso aberto Maria",
          created_at: "2026-05-11T12:00:00.000Z",
          metadata: {
            payment_id: "pay-1",
            process_task_id: "process-1",
            case_id: "case-1",
          },
        },
      ],
      processTasks: [
        {
          id: "process-1",
          title: "Maria - Novo caso",
          client_name: "Maria",
          value: 2500,
          source: "revenue_to_case",
          client_id: "case-1",
          tags: ["revenue_to_case"],
        },
      ],
    });

    expect(summary.financials.received).toEqual({ amount: 2500, count: 1 });
    expect(summary.financials.openCharges).toEqual({ amount: 3000, count: 2 });
    expect(summary.financials.overdue).toEqual({ amount: 1000, count: 1 });
    expect(summary.financials.forecast).toEqual({ amount: 2000, count: 1 });
    expect(summary.financials.expenses.marketing).toEqual({ amount: 300, count: 1 });
    expect(summary.collectionsFollowup.totalPlans).toBe(1);
    expect(summary.collectionsFollowup.highPriorityPlans).toBe(1);
    expect(summary.collectionsFollowup.recentPlans[0]).toEqual(expect.objectContaining({
      clientName: "Maria",
      requiresHumanApproval: true,
      externalSideEffectsBlocked: true,
    }));
    expect(summary.revenueReconciliation.available).toBe(true);
    expect(summary.revenueReconciliation.report.totals.matched).toBe(1);
    const matchedItem = summary.revenueReconciliation.report.items.find((item) => item.status === "matched");
    expect(matchedItem).toEqual(expect.objectContaining({
      status: "matched",
      financialId: "fin-paid",
      billingArtifactId: "billing-1",
      processTaskId: "process-1",
      caseId: "case-1",
    }));
  });
});
