import { describe, expect, it } from "vitest";
import {
  buildRevenueReconciliationArtifactMetadata,
  buildRevenueReconciliationReport,
} from "./revenue-reconciliation";

describe("revenue reconciliation", () => {
  it("matches paid financials, Asaas billing artifact and process task by shared revenue-to-case aliases", () => {
    const report = buildRevenueReconciliationReport({
      generatedAt: "2026-05-13T12:00:00.000Z",
      financials: [
        {
          id: "fin-1",
          external_id: "pay-1",
          status: "RECEIVED",
          type: "receita",
          amount: "1,500.00",
          metadata: { crm_task_id: "crm-1", client_name: "Maria Silva" },
        },
      ],
      artifacts: [
        {
          id: "billing-1",
          artifact_type: "asaas_billing",
          title: "Cobranca Maria Silva",
          metadata: {
            cobranca_id: "pay-1",
            crm_task_id: "crm-1",
            nome_cliente: "Maria Silva",
            valor: 1500,
          },
        },
        {
          id: "opening-1",
          artifact_type: "revenue_case_opening",
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
          source: "revenue_to_case",
          client_name: "Maria Silva",
          value: 1500,
          task_context: { crm_task_id: "crm-1" },
          case_id: "case-1",
        },
      ],
    });

    expect(report.totals).toEqual(expect.objectContaining({
      matched: 1,
      blocked: 0,
      receivedRevenue: 1500,
      openedCaseRevenue: 1500,
    }));
    expect(report.items[0]).toEqual(expect.objectContaining({
      status: "matched",
      financialId: "fin-1",
      billingArtifactId: "billing-1",
      revenueArtifactId: "opening-1",
      processTaskId: "process-1",
      caseId: "case-1",
    }));
    expect(report.items[0].evidence).toEqual(expect.arrayContaining([
      "financials:paid",
      "brain_artifacts:asaas_billing",
      "brain_artifacts:revenue_case_opening",
      "process_tasks",
    ]));
  });

  it("blocks confirmed payments that have billing but no case/process link", () => {
    const report = buildRevenueReconciliationReport({
      financials: [
        {
          id: "fin-2",
          external_id: "pay-2",
          status: "paid",
          type: "revenue",
          amount: 2600,
        },
      ],
      artifacts: [
        {
          id: "billing-2",
          artifact_type: "asaas_billing",
          metadata: {
            cobranca_id: "pay-2",
            nome_cliente: "Carlos Souza",
            valor: 2600,
          },
        },
      ],
    });
    const metadata = buildRevenueReconciliationArtifactMetadata(report);

    expect(report.totals.blocked).toBe(1);
    expect(report.items[0]).toEqual(expect.objectContaining({
      status: "blocked",
      paymentId: "pay-2",
      financialId: "fin-2",
      billingArtifactId: "billing-2",
      processTaskId: null,
    }));
    expect(report.items[0].warnings).toContain("Pagamento confirmado sem process_task/caso vinculado.");
    expect(metadata.requires_human_action).toBe(true);
    expect(metadata.blocked_items).toEqual([
      expect.objectContaining({
        payment_id: "pay-2",
        billing_artifact_id: "billing-2",
      }),
    ]);
  });

  it("mantem pagamento confirmado em bloqueio quando ha artifact de revisao revenue-to-case", () => {
    const report = buildRevenueReconciliationReport({
      financials: [
        {
          id: "fin-review",
          external_id: "pay-review",
          status: "paid",
          type: "receita",
          amount: 1800,
        },
      ],
      artifacts: [
        {
          id: "billing-review",
          artifact_type: "asaas_billing",
          metadata: {
            cobranca_id: "pay-review",
            nome_cliente: "Rita Lima",
            valor: 1800,
          },
        },
        {
          id: "review-1",
          artifact_type: "revenue_case_opening_review",
          metadata: {
            payment_id: "pay-review",
            client_name: "Rita Lima",
            review_reason: "case_context_missing",
            requires_human_action: true,
          },
        },
      ],
    });
    const metadata = buildRevenueReconciliationArtifactMetadata(report);

    expect(report.totals.blocked).toBe(1);
    expect(report.totals.revenueArtifactCount).toBe(1);
    expect(report.items[0]).toEqual(expect.objectContaining({
      status: "blocked",
      paymentId: "pay-review",
      billingArtifactId: "billing-review",
      revenueReviewArtifactId: "review-1",
    }));
    expect(report.items[0].evidence).toContain("brain_artifacts:revenue_case_opening_review");
    expect(report.items[0].warnings).toContain("Abertura automatica do caso esta em revisao/recuperacao supervisionada.");
    expect(metadata.blocked_items[0]).toEqual(expect.objectContaining({
      revenue_review_artifact_id: "review-1",
    }));
  });

  it("keeps unpaid billing artifacts partial instead of pretending the case can be opened", () => {
    const report = buildRevenueReconciliationReport({
      financials: [
        {
          id: "fin-3",
          external_id: "pay-3",
          status: "PENDING",
          type: "receita",
          amount: "2.400,50",
        },
      ],
      artifacts: [
        {
          id: "billing-3",
          artifact_type: "asaas_billing",
          metadata: {
            cobranca_id: "pay-3",
            nome_cliente: "Bianca Lima",
            valor: "2.400,50",
          },
        },
        {
          id: "plan-3",
          artifact_type: "revenue_flow_plan",
          metadata: {
            crm_task_id: "crm-3",
            client_name: "Bianca Lima",
            amount: "2.400,50",
          },
        },
      ],
    });

    expect(report.totals.partial).toBe(1);
    expect(report.totals.openedCaseRevenue).toBe(0);
    expect(report.items[0].status).toBe("partial");
    expect(report.items[0].warnings).toContain("Lancamento financeiro ainda nao esta marcado como recebido/confirmado.");
    expect(JSON.stringify(report)).not.toMatch(/api_key|service_role|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });
});
