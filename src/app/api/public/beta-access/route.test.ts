import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: fromMock },
}));

import { POST } from "./route";

function insertChain(result: { error?: any } = {}) {
  return {
    insert: vi.fn(async () => ({ error: result.error ?? null })),
  };
}

function buildRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/public/beta-access", {
    method: "POST",
    headers: { "Content-Type": "application/json", "user-agent": "vitest" },
    body: JSON.stringify(body),
  });
}

describe("public beta access API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registra pedido de acesso beta como evento publico", async () => {
    const chain = insertChain();
    fromMock.mockReturnValue(chain);

    const response = await POST(buildRequest({
      name: "Marina Souza",
      email: "marina@example.com",
      phone: "",
      firmName: "Souza Advogados",
      role: "Socia",
      teamSize: "6-15",
      mainPain: "O escritorio perde follow-up e prazos entre muitas abas.",
      priority: "follow-up",
      consent: true,
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, accepted: true });
    expect(fromMock).toHaveBeenCalledWith("system_event_logs");
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      source: "public_sales",
      provider: "mayus_site",
      event_name: "beta_access_requested",
      status: "pending",
      tenant_id: null,
      payload: expect.objectContaining({
        name: "Marina Souza",
        email: "marina@example.com",
        firm_name: "Souza Advogados",
        main_pain: "O escritorio perde follow-up e prazos entre muitas abas.",
      }),
    }));
  });

  it("valida contato minimo e consentimento", async () => {
    const response = await POST(buildRequest({
      name: "M",
      email: "",
      phone: "",
      mainPain: "curto",
      consent: false,
    }));
    const json = await response.json();

    expect(response.status).toBe(422);
    expect(json.error).toBe("Dados invalidos.");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("aceita honeypot sem persistir para reduzir spam", async () => {
    const response = await POST(buildRequest({
      name: "Marina Souza",
      email: "marina@example.com",
      mainPain: "Quero testar a operacao do beta supervisionado.",
      consent: true,
      website: "spam.test",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, accepted: true });
    expect(fromMock).not.toHaveBeenCalled();
  });
});
