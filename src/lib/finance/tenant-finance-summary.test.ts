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
          case_id: "case-maria",
          amount: 1000,
          status: "Pendente",
          type: "receita",
          due_date: "2026-05-01",
          metadata: {
            client_name: "Maria",
          },
        },
        {
          id: "fin-open",
          case_id: "case-maria",
          amount: 2000,
          status: "Pendente",
          type: "receita",
          due_date: "2026-05-20",
          metadata: {
            client_name: "Maria",
          },
        },
        {
          id: "fin-overdue-old",
          amount: 4000,
          status: "inadimplente",
          type: "receita",
          due_date: "2026-04-01",
          reference_date: "2026-04-01",
          metadata: {
            client_id: "client-joao",
            nome_cliente: "Joao",
          },
        },
        {
          id: "fin-no-due",
          amount: 600,
          status: "Pendente",
          type: "receita",
          description: "Honorarios sem vencimento definido",
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
      salesRows: [
        {
          id: "sale-pending",
          client_name: "Ana Contrato",
          ticket_total: 3000,
          status: "Pendente",
          contract_date: "2026-05-25",
        },
        {
          id: "sale-closed",
          client_name: "Bruno Fechado",
          ticket_total: 8000,
          status: "Fechado",
          contract_date: "2026-05-05",
        },
        {
          id: "sale-lost",
          client_name: "Carla Perdida",
          ticket_total: 1200,
          status: "Perdido",
        },
      ],
      crmStages: [
        { id: "stage-proposal", name: "Proposta enviada", is_win: false, is_loss: false },
        { id: "stage-won", name: "Fechado", is_win: true, is_loss: false },
        { id: "stage-lost", name: "Perdido", is_win: false, is_loss: true },
      ],
      crmTasks: [
        {
          id: "crm-proposal",
          title: "Dora proposta previdenciaria",
          value: 7000,
          source: "indicacao",
          stage_id: "stage-proposal",
          data_ultima_movimentacao: "2026-05-12",
        },
        {
          id: "crm-won",
          title: "Eva contrato fechado",
          value: 5000,
          stage_id: "stage-won",
        },
        {
          id: "crm-lost",
          title: "Felipe oportunidade perdida",
          value: 900,
          stage_id: "stage-lost",
        },
      ],
    });

    expect(summary.financials.received).toEqual({ amount: 2500, count: 1 });
    expect(summary.financials.openCharges).toEqual({ amount: 7600, count: 4 });
    expect(summary.financials.overdue).toEqual({ amount: 5000, count: 2 });
    expect(summary.financials.forecast).toEqual({ amount: 2600, count: 2 });
    expect(summary.financials.delinquency.rate).toBe(65.8);
    expect(summary.financials.forecastBuckets).toEqual({
      dueIn7Days: { amount: 2000, count: 1 },
      dueIn30Days: { amount: 0, count: 0 },
      future: { amount: 0, count: 0 },
      noDueDate: { amount: 600, count: 1 },
    });
    expect(summary.financials.overdueAging).toEqual({
      days1To7: { amount: 0, count: 0 },
      days8To14: { amount: 1000, count: 1 },
      days15To30: { amount: 0, count: 0 },
      days31Plus: { amount: 4000, count: 1 },
    });
    expect(summary.financials.riskItems[0]).toEqual(expect.objectContaining({
      clientName: "Joao",
      openAmount: 4000,
      overdueAmount: 4000,
      riskLevel: "high",
      maxDaysOverdue: 42,
    }));
    expect(summary.financials.riskItems[1]).toEqual(expect.objectContaining({
      clientName: "Maria",
      caseId: "case-maria",
      openAmount: 3000,
      overdueAmount: 1000,
      forecastAmount: 2000,
      riskLevel: "medium",
    }));
    expect(summary.financials.expenses.marketing).toEqual({ amount: 300, count: 1 });
    expect(summary.commercialForecast.source).toBe("sales+crm_tasks");
    expect(summary.commercialForecast.available).toBe(true);
    expect(summary.commercialForecast.pipelineAmount).toBe(10000);
    expect(summary.commercialForecast.pendingContracts).toEqual({ amount: 3000, count: 1 });
    expect(summary.commercialForecast.closedContracts).toEqual({ amount: 13000, count: 2 });
    expect(summary.commercialForecast.lostAmount).toBe(2100);
    expect(summary.commercialForecast.byStage).toEqual([
      expect.objectContaining({ stageId: "stage-proposal", stageName: "Proposta enviada", amount: 7000, count: 1, isWin: false, isLoss: false }),
      expect.objectContaining({ stageId: "stage-won", stageName: "Fechado", amount: 5000, count: 1, isWin: true, isLoss: false }),
      expect.objectContaining({ stageId: "stage-lost", stageName: "Perdido", amount: 900, count: 1, isWin: false, isLoss: true }),
    ]);
    expect(summary.commercialForecast.topOpportunities[0]).toEqual(expect.objectContaining({
      kind: "crm",
      label: "Dora proposta previdenciaria",
      amount: 7000,
      stage: "Proposta enviada",
      nextBestAction: "Priorizar follow-up humano e confirmar proximo compromisso.",
    }));
    expect(summary.commercialForecast.topOpportunities[1]).toEqual(expect.objectContaining({
      kind: "sale",
      label: "Ana Contrato",
      amount: 3000,
      stage: "Pendente",
    }));
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
