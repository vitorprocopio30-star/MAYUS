import { describe, expect, it } from "vitest";
import {
  amountToCents,
  buildPlatformFinanceSummaryFromRows,
  normalizePlatformBillingEvent,
} from "./platform-billing-summary";

describe("platform billing summary", () => {
  it("calcula MRR/ARR, recebidos e vencidos sem depender de financials", () => {
    const summary = buildPlatformFinanceSummaryFromRows({
      now: new Date("2026-05-13T12:00:00.000Z"),
      tenants: [
        {
          id: "tenant-active",
          name: "Ativo",
          status: "ativo",
          plan_type: "scale",
          billing_cycle: "mensal",
          billing_cycle_start: "2026-05-01T00:00:00.000Z",
          billing_cycle_end: "2026-06-01T00:00:00.000Z",
          created_at: "2026-05-01T00:00:00.000Z",
          max_processos: 100,
          platform_billing_amount_cents: 64700,
        },
        {
          id: "tenant-risk",
          name: "Inadimplente",
          status: "inadimplente",
          plan_type: "scale",
          billing_cycle: "anual",
          billing_cycle_start: "2026-04-01T00:00:00.000Z",
          billing_cycle_end: "2026-05-08T00:00:00.000Z",
          created_at: "2026-04-01T00:00:00.000Z",
          max_processos: 100,
          platform_billing_amount_cents: 596400,
        },
        {
          id: "tenant-trial",
          name: "Trial",
          status: "trial",
          plan_type: "scale",
          billing_cycle: "mensal",
          billing_cycle_start: null,
          billing_cycle_end: "2026-05-18T00:00:00.000Z",
          created_at: "2026-05-01T00:00:00.000Z",
          max_processos: 100,
        },
        {
          id: "tenant-canceled",
          name: "Cancelado",
          status: "cancelado",
          plan_type: "scale",
          billing_cycle: "mensal",
          billing_cycle_start: null,
          billing_cycle_end: null,
          created_at: "2026-05-01T00:00:00.000Z",
          max_processos: 100,
        },
      ],
      events: [
        {
          tenant_id: "tenant-active",
          provider: "asaas",
          event_name: "PAYMENT_CONFIRMED",
          external_id: "pay-1",
          customer_id: "cus-1",
          subscription_id: "sub-1",
          gross_amount: 647,
          net_amount: 647,
          status: "received",
          occurred_at: "2026-05-10T10:00:00.000Z",
        },
      ],
    });

    expect(summary.totals).toMatchObject({
      tenants: 4,
      active: 1,
      trial: 1,
      delinquent: 1,
      canceled: 1,
      mrr: 647,
      arr: 7764,
      atRiskMrr: 497,
      receivedTotal: 647,
      receivedThisMonth: 647,
      overdueExpectedAmount: 5964,
      trialEndingSoon: 1,
    });
    expect(summary.tenants.find((tenant) => tenant.id === "tenant-risk")?.daysOverdue).toBe(6);
  });

  it("normaliza valores e eventos Asaas usados pelo webhook SaaS", () => {
    expect(amountToCents("647,90")).toBe(64790);
    expect(amountToCents(5964)).toBe(596400);
    expect(normalizePlatformBillingEvent("PAYMENT_RECEIVED")).toEqual({
      eventType: "received",
      billingStatus: "received",
      tenantStatus: "ativo",
    });
    expect(normalizePlatformBillingEvent("PAYMENT_CREATED")).toEqual({
      eventType: "pending",
      billingStatus: "pending",
      tenantStatus: null,
    });
    expect(normalizePlatformBillingEvent("UNKNOWN")).toBeNull();
  });
});
