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
    const tenantSelect = makeTenantSelectQuery({ id: "tenant-1", status: "trial" });
    const tenantUpdate = makeTenantUpdateQuery();
    let tenantsCalls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "system_event_logs") return logsQuery;
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
    expect(tenantUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ status: "ativo" }));
    expect(logsQuery.insert).toHaveBeenCalledWith(expect.objectContaining({ event_name: "asaas_webhook" }));
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
