import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { createClientMock, fromMock, openCaseFromConfirmedBillingMock } = vi.hoisted(() => {
  const localFromMock = vi.fn();

  return {
    createClientMock: vi.fn(() => ({ from: localFromMock })),
    fromMock: localFromMock,
    openCaseFromConfirmedBillingMock: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/agent/capabilities/revenue-to-case", () => ({
  openCaseFromConfirmedBilling: openCaseFromConfirmedBillingMock,
}));

import { GET, POST } from "./route";

function buildRequest(body: Record<string, unknown>, token = "webhook-token") {
  return new NextRequest("http://localhost:3000/api/webhooks/asaas", {
    method: "POST",
    headers: { "Content-Type": "application/json", "asaas-access-token": token },
    body: JSON.stringify(body),
  });
}

function makeInsertQuery() {
  return {
    insert: vi.fn(async () => ({ error: null })),
  };
}

function makeUpsertQuery() {
  return {
    upsert: vi.fn(async () => ({ error: null })),
  };
}

function makeTenantSelectQuery(tenant: Record<string, unknown> | null) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: tenant, error: null })),
  };
  return query;
}

function makeTenantUpdateQuery() {
  const query: any = {
    update: vi.fn(() => query),
    eq: vi.fn(async () => ({ error: null })),
  };
  return query;
}

describe("/api/webhooks/asaas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "webhook-token");
    openCaseFromConfirmedBillingMock.mockResolvedValue({ handled: false, reason: "not_found" });
  });

  it("ignora token invalido sem consultar banco", async () => {
    const response = await POST(buildRequest({ event: "PAYMENT_CONFIRMED" }, "wrong-token"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("registra evento ignorado em system_event_logs", async () => {
    const logsQuery = makeInsertQuery();
    fromMock.mockImplementation((table: string) => {
      if (table === "system_event_logs") return logsQuery;
      throw new Error(`unexpected table ${table}`);
    });

    const response = await POST(buildRequest({ event: "UNKNOWN", payment: { customer: "cus-1" } }));

    expect(logsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      provider: "asaas",
      event_name: "asaas_webhook_ignored",
      status: "ignored",
    }));
    expect(response.status).toBe(200);
  });

  it("pagamento confirmado chama revenue-to-case e atualiza tenant", async () => {
    openCaseFromConfirmedBillingMock.mockResolvedValueOnce({
      handled: true,
      reason: "case_opened",
      tenantId: "tenant-1",
      caseId: "case-1",
      processTaskId: "task-1",
    });
    const logsQuery = makeInsertQuery();
    const platformEventsQuery = makeUpsertQuery();
    const tenantSelect = makeTenantSelectQuery({ id: "tenant-1", status: "trial", billing_cycle: "mensal" });
    const tenantUpdate = makeTenantUpdateQuery();
    let tenantsCalls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "system_event_logs") return logsQuery;
      if (table === "platform_billing_events") return platformEventsQuery;
      if (table === "tenants") {
        tenantsCalls++;
        return tenantsCalls === 1 ? tenantSelect : tenantUpdate;
      }
      throw new Error(`unexpected table ${table}`);
    });

    const response = await POST(buildRequest({
      event: "PAYMENT_CONFIRMED",
      payment: { id: "pay-1", customer: "cus-1", value: 397 },
    }));

    expect(openCaseFromConfirmedBillingMock).toHaveBeenCalledWith({
      paymentId: "pay-1",
      customerId: "cus-1",
      paymentValue: 397,
    });
    expect(platformEventsQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      provider: "asaas",
      event_name: "PAYMENT_CONFIRMED",
      external_id: "pay-1",
      payment_id: "pay-1",
      asaas_event: "PAYMENT_CONFIRMED",
      event_type: "received",
      billing_status: "received",
      amount_cents: 39700,
      gross_amount: 397,
      status: "received",
    }), expect.objectContaining({ onConflict: "provider,event_name,external_id" }));
    expect(tenantUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ status: "ativo" }));
    expect(logsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ event_name: "asaas_webhook" }));
    expect(response.status).toBe(200);
  });

  it("registra falha revenue-to-case sem vazar erro bruto", async () => {
    openCaseFromConfirmedBillingMock.mockRejectedValueOnce(new Error("service_role_key sk_test segredo bruto"));
    const logsQuery = makeInsertQuery();
    const platformEventsQuery = makeUpsertQuery();
    const tenantSelect = makeTenantSelectQuery({ id: "tenant-1", status: "trial", billing_cycle: "mensal" });
    const tenantUpdate = makeTenantUpdateQuery();
    let tenantsCalls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "system_event_logs") return logsQuery;
      if (table === "platform_billing_events") return platformEventsQuery;
      if (table === "tenants") {
        tenantsCalls++;
        return tenantsCalls === 1 ? tenantSelect : tenantUpdate;
      }
      throw new Error(`unexpected table ${table}`);
    });

    const response = await POST(buildRequest({
      event: "PAYMENT_CONFIRMED",
      payment: { id: "pay-secret", customer: "cus-1", value: 397 },
    }));

    const insertCalls = logsQuery.insert.mock.calls as unknown as Array<[any]>;
    const errorLogPayload = insertCalls.find(([payload]) => payload.event_name === "asaas_revenue_to_case_error")?.[0];
    expect(errorLogPayload).toEqual(expect.objectContaining({
      status: "error",
      payload: expect.objectContaining({
        payment_id: "pay-secret",
        error: "Erro interno ao abrir caso automaticamente.",
        error_type: "Error",
      }),
    }));
    expect(JSON.stringify(errorLogPayload)).not.toMatch(/service_role_key|sk_test|segredo bruto/i);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("registra evento SaaS pendente sem mudar status do tenant", async () => {
    const logsQuery = makeInsertQuery();
    const platformEventsQuery = makeUpsertQuery();
    const tenantSelect = makeTenantSelectQuery({ id: "tenant-1", status: "trial", billing_cycle: "mensal" });
    fromMock.mockImplementation((table: string) => {
      if (table === "system_event_logs") return logsQuery;
      if (table === "platform_billing_events") return platformEventsQuery;
      if (table === "tenants") return tenantSelect;
      throw new Error(`unexpected table ${table}`);
    });

    const response = await POST(buildRequest({
      event: "PAYMENT_CREATED",
      payment: { id: "pay-2", customer: "cus-1", subscription: "sub-1", value: 647, dueDate: "2026-05-20" },
    }));

    expect(platformEventsQuery.upsert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      payment_id: "pay-2",
      subscription_id: "sub-1",
      event_type: "pending",
      billing_status: "pending",
      amount_cents: 64700,
      due_date: "2026-05-20",
    }), expect.objectContaining({ onConflict: "provider,event_name,external_id" }));
    expect(logsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_name: "asaas_webhook",
      payload: expect.objectContaining({ status_updated: false }),
    }));
    expect(response.status).toBe(200);
  });

  it("tenant nao encontrado registra evento de sistema", async () => {
    const logsQuery = makeInsertQuery();
    const tenantSelect = makeTenantSelectQuery(null);
    fromMock.mockImplementation((table: string) => {
      if (table === "system_event_logs") return logsQuery;
      if (table === "tenants") return tenantSelect;
      throw new Error(`unexpected table ${table}`);
    });

    const response = await POST(buildRequest({
      event: "PAYMENT_OVERDUE",
      payment: { id: "pay-1", customer: "missing-customer" },
    }));

    expect(logsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      event_name: "asaas_webhook_no_tenant",
      status: "error",
    }));
    expect(response.status).toBe(200);
  });

  it("GET retorna 405", async () => {
    const response = await GET();

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ error: "Method Not Allowed" });
  });
});
