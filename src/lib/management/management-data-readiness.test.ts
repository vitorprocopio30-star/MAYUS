import { describe, expect, it } from "vitest";
import { buildTenantFinanceSummaryFromRows } from "@/lib/finance/tenant-finance-summary";
import { buildManagementDataReadiness } from "./management-data-readiness";
import {
  buildManagementIntelligenceBrief,
  buildManagementIntelligenceReply,
} from "./management-intelligence-brief";

describe("management data readiness", () => {
  it("bloqueia analise estrategica quando faltam dados de financeiro e CRM", () => {
    const readiness = buildManagementDataReadiness({
      tenantId: "tenant-1",
      generatedAt: "2026-05-22T12:00:00.000Z",
      financeSummary: null,
    });
    const brief = buildManagementIntelligenceBrief({ readiness, request: "Analise meu escritorio como CEO" });

    expect(readiness.status).toBe("blocked");
    expect(readiness.canUseRealData).toBe(false);
    expect(readiness.blockedOutputs).toContain("decisao empresarial automatica");
    expect(brief.summary).toContain("ainda nao deve opinar");
    expect(brief.nextAction).toContain("Asaas/financials");
  });

  it("libera brief com dados reais sem dar ordem estrategica", () => {
    const financeSummary = buildTenantFinanceSummaryFromRows({
      tenantId: "tenant-1",
      now: new Date("2026-05-22T12:00:00.000Z"),
      financialRows: [
        {
          id: "fin-paid",
          amount: 6000,
          status: "PAYMENT_RECEIVED",
          type: "receita",
          source: "asaas",
          reference_date: "2026-05-10",
        },
        {
          id: "fin-overdue",
          amount: 2000,
          status: "Pendente",
          type: "receita",
          due_date: "2026-05-01",
        },
      ],
      brainArtifacts: [
        {
          id: "billing-1",
          artifact_type: "asaas_billing",
          title: "Cobranca Cliente",
          created_at: "2026-05-10T12:00:00.000Z",
          metadata: {
            cobranca_id: "pay-1",
            valor: 6000,
          },
        },
      ],
      processTasks: [
        {
          id: "process-1",
          title: "Cliente - Caso",
          client_name: "Cliente",
          value: 6000,
          source: "revenue_to_case",
          tags: ["revenue_to_case"],
        },
      ],
      unitProcessTasks: [
        {
          id: "process-1",
          title: "Cliente - Caso",
          client_name: "Cliente",
          value: 6000,
          source: "revenue_to_case",
          tags: ["revenue_to_case"],
          demanda: "Previdenciario",
        },
      ],
      salesRows: [
        {
          id: "sale-1",
          client_name: "Lead quente",
          ticket_total: 5000,
          status: "Pendente",
        },
      ],
      crmStages: [
        { id: "stage-proposal", name: "Proposta enviada", is_win: false, is_loss: false },
      ],
      crmTasks: [
        {
          id: "crm-1",
          title: "Lead RMC",
          value: 5000,
          source: "indicacao",
          stage_id: "stage-proposal",
        },
      ],
    });

    const readiness = buildManagementDataReadiness({
      tenantId: "tenant-1",
      generatedAt: "2026-05-22T12:00:00.000Z",
      financeSummary,
    });
    const brief = buildManagementIntelligenceBrief({
      readiness,
      financeSummary,
      request: "Quero entender pipeline, inadimplencia e margem",
    });
    const reply = buildManagementIntelligenceReply(brief);

    expect(readiness.status).toBe("ready");
    expect(readiness.availableDataSources).toEqual(expect.arrayContaining(["financials", "crm_tasks/sales", "process_tasks"]));
    expect(readiness.metrics.revenueReceived).toBe(6000);
    expect(brief.guardrails).toContain("Nao recomendar contratar, expandir, demitir, cortar equipe ou mudar preco como ordem.");
    expect(reply).toContain("Limite: nao executei decisao empresarial nem acao externa");
  });
});
