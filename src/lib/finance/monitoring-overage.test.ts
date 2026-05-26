import { describe, expect, it, vi } from "vitest";
import {
  buildMonitoringOverageBlockedPayload,
  classifyMonitoringOverageSlots,
  closeMonitoringOverageCharges,
} from "./monitoring-overage";

describe("closeMonitoringOverageCharges", () => {
  it("classifica inclusos e excedentes em ordem estavel", () => {
    const slots = classifyMonitoringOverageSlots([
      { id: "proc-c", activatedAt: "2026-05-03T10:00:00.000Z" },
      { id: "proc-a", activatedAt: "2026-05-01T10:00:00.000Z" },
      { id: "proc-b", activatedAt: "2026-05-02T10:00:00.000Z" },
      { id: "proc-d", activatedAt: "2026-05-03T10:00:00.000Z" },
    ], 2);

    expect(slots.map((slot) => [slot.id, slot.slotIndex, slot.billingTier])).toEqual([
      ["proc-a", 1, "included"],
      ["proc-b", 2, "included"],
      ["proc-c", 3, "overage"],
      ["proc-d", 4, "overage"],
    ]);
  });

  it("bloqueio de excedente declara Monitoring Agent e Finance Agent", () => {
    const payload = buildMonitoringOverageBlockedPayload({
      currentMonitored: 100,
      incomingCount: 3,
      includedLimit: 100,
      freeSlots: 0,
      overageCount: 3,
      unitPriceCents: 97,
      projectedAmountCents: 291,
      projectedAmount: 2.91,
      requiresConfirmation: true,
      paymentReady: false,
      blockedReason: "monitoring_overage_terms_required",
    });

    expect(payload.agent_control).toEqual(expect.objectContaining({
      primary_agent_id: "monitoring_agent",
      billing_agent_id: "finance_agent",
      approval_required: true,
      external_charge_executed: false,
    }));
    expect(payload.monitoring_overage.agent_control).toEqual(payload.agent_control);
  });

  it("calcula excedente ativo e cria cobranca interna da plataforma sem Asaas do escritorio", async () => {
    const tenantsQuery: any = {
      select: vi.fn(() => tenantsQuery),
      not: vi.fn(async () => ({
        data: [{
          id: "tenant-1",
          name: "Dutra Advocacia",
          monitoring_included_process_limit: 100,
          monitoring_extra_process_price_cents: 97,
          monitoring_payment_method_status: "metodo_valido",
          monitoring_overage_status: "excedente_liberado",
          monitoring_overage_terms_accepted_at: "2026-05-15T00:00:00.000Z",
          status: "ativo",
          asaas_customer_id: "office_asaas_customer_must_not_be_used",
          asaas_subscription_id: "platform_subscription_must_not_be_used",
        }],
        error: null,
      })),
    };
    const snapshotUpsertResult: any = {
      select: vi.fn(() => snapshotUpsertResult),
      maybeSingle: vi.fn(async () => ({ data: { id: "snapshot-1" }, error: null })),
    };
    const snapshotUpsert = vi.fn(() => snapshotUpsertResult);
    const chargeUpsert = vi.fn(async () => ({ error: null }));
    const snapshotQuery: any = {
      select: vi.fn(() => snapshotQuery),
      eq: vi.fn(() => snapshotQuery),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      upsert: snapshotUpsert,
    };
    const from = vi.fn((table: string) => {
      if (table === "tenants") return tenantsQuery;
      if (table === "platform_usage_snapshots") return snapshotQuery;
      if (table === "platform_overage_charges") return { upsert: chargeUpsert };
      throw new Error(`Unexpected table ${table}`);
    });
    const rpc = vi.fn(() => ({
      single: vi.fn(async () => ({
        data: {
          total_monitorados: 103,
          gratuitos: 100,
          disponivel_sem_custo: 0,
          preco_extra: 0.97,
          preco_extra_centavos: 97,
        },
        error: null,
      })),
    }));

    const result = await closeMonitoringOverageCharges({
      client: { from, rpc },
      cycleStart: "2026-04-01",
      cycleEnd: "2026-04-30",
    });

    expect(result.results).toEqual([expect.objectContaining({
      tenant_id: "tenant-1",
      status: "draft",
      overage_quantity: 3,
      amount_cents: 291,
      payment_ready: true,
    })]);
    expect(chargeUpsert).toHaveBeenCalledWith(expect.objectContaining({
      provider: "mayus_platform",
      status: "draft",
      overage_quantity: 3,
      unit_price_cents: 97,
      amount_cents: 291,
      metadata: expect.objectContaining({
        billing_mode: "platform_internal_draft",
        real_charge_executed: false,
        agent_control: expect.objectContaining({
          primary_agent_id: "monitoring_agent",
          billing_agent_id: "finance_agent",
          external_charge_executed: false,
        }),
      }),
    }), { onConflict: "tenant_id,cycle_start,cycle_end,metric" });
    expect(JSON.stringify(chargeUpsert.mock.calls)).not.toContain("office_asaas_customer_must_not_be_used");
    expect(JSON.stringify(chargeUpsert.mock.calls)).not.toContain("platform_subscription_must_not_be_used");
  });

  it("usa pico mensal salvo mesmo se o tenant cancelou excedentes antes do fechamento", async () => {
    const tenantsQuery: any = {
      select: vi.fn(() => tenantsQuery),
      not: vi.fn(async () => ({
        data: [{
          id: "tenant-1",
          name: "Dutra Advocacia",
          monitoring_included_process_limit: 100,
          monitoring_extra_process_price_cents: 97,
          monitoring_payment_method_status: "metodo_valido",
          monitoring_overage_status: "excedente_liberado",
          monitoring_overage_terms_accepted_at: "2026-05-15T00:00:00.000Z",
          asaas_customer_id: "cus_1",
          asaas_subscription_id: "sub_1",
          status: "ativo",
        }],
        error: null,
      })),
    };
    const snapshotUpsertResult: any = {
      select: vi.fn(() => snapshotUpsertResult),
      maybeSingle: vi.fn(async () => ({ data: { id: "snapshot-1" }, error: null })),
    };
    const snapshotUpsert = vi.fn(() => snapshotUpsertResult);
    const snapshotQuery: any = {
      select: vi.fn(() => snapshotQuery),
      eq: vi.fn(() => snapshotQuery),
      maybeSingle: vi.fn(async () => ({ data: { peak_quantity: 150 }, error: null })),
      upsert: snapshotUpsert,
    };
    const chargeUpsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "tenants") return tenantsQuery;
      if (table === "platform_usage_snapshots") return snapshotQuery;
      if (table === "platform_overage_charges") return { upsert: chargeUpsert };
      throw new Error(`Unexpected table ${table}`);
    });
    const rpc = vi.fn(() => ({
      single: vi.fn(async () => ({
        data: {
          total_monitorados: 100,
          gratuitos: 100,
          disponivel_sem_custo: 0,
          preco_extra: 0.97,
          preco_extra_centavos: 97,
        },
        error: null,
      })),
    }));

    const result = await closeMonitoringOverageCharges({
      client: { from, rpc },
      cycleStart: "2026-04-01",
      cycleEnd: "2026-04-30",
    });

    expect(result.results).toEqual([expect.objectContaining({
      overage_quantity: 50,
      amount_cents: 4850,
    })]);
    expect(chargeUpsert).toHaveBeenCalledWith(expect.objectContaining({
      peak_quantity: 150,
      overage_quantity: 50,
      amount_cents: 4850,
    }), { onConflict: "tenant_id,cycle_start,cycle_end,metric" });
  });
});
