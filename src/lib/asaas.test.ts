import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireTenantApiKeyMock } = vi.hoisted(() => ({
  requireTenantApiKeyMock: vi.fn(),
}));

vi.mock("@/lib/integrations/server", () => ({
  requireTenantApiKey: requireTenantApiKeyMock,
}));

import { AsaasService } from "./asaas";

describe("AsaasService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    global.fetch = vi.fn();
  });

  it("busca api key do tenant via Vault", async () => {
    requireTenantApiKeyMock.mockResolvedValueOnce({ apiKey: "asaas-key" });

    await expect(AsaasService.getApiKey("tenant-1", {})).resolves.toBe("asaas-key");

    expect(requireTenantApiKeyMock).toHaveBeenCalledWith("tenant-1", "asaas");
  });

  it("retorna null quando Vault falha ao buscar chave", async () => {
    requireTenantApiKeyMock.mockRejectedValueOnce(new Error("missing key"));

    await expect(AsaasService.getApiKey("tenant-1", {})).resolves.toBeNull();
  });

  it("cria cobranca usando api key fornecida", async () => {
    vi.stubEnv("ASAAS_ENV", "production");
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: "pay-1",
      customer: "cus-1",
      status: "PENDING",
      value: 100,
    }), { status: 200 }) as any);

    const result = await AsaasService.createPayment({
      customer: "cus-1",
      billingType: "PIX",
      value: 100,
      dueDate: "2026-04-30",
    }, "asaas-key");

    expect(global.fetch).toHaveBeenCalledWith("https://api.asaas.com/v3/payments", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ access_token: "asaas-key" }),
      body: JSON.stringify({
        customer: "cus-1",
        billingType: "PIX",
        value: 100,
        dueDate: "2026-04-30",
      }),
    }));
    expect(result).toEqual(expect.objectContaining({ id: "pay-1" }));
  });

  it("extrai mensagem amigavel em erro da API", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      errors: [{ code: "invalid", description: "CPF invalido" }],
    }), { status: 400 }) as any);

    await expect(AsaasService.createPayment({
      customer: "cus-1",
      billingType: "PIX",
      value: 100,
      dueDate: "2026-04-30",
    }, "asaas-key")).rejects.toThrow("CPF invalido");
  });
});
