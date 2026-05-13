import { describe, expect, it } from "vitest";
import {
  addBusinessDaysFromSaoPaulo,
  buildBillingIdempotencyKey,
  normalizeBillingEntities,
} from "./billing-normalization";

describe("billing-normalization", () => {
  it("normaliza valor, vencimento brasileiro e tipo de cobranca", () => {
    const result = normalizeBillingEntities({
      client_name: "Maria Silva",
      amount: "1.500,50",
      vencimento: "20/05/2026",
      billing_type: "pix",
    }, { now: new Date("2026-05-12T12:00:00.000Z") });

    expect(result.errors).toEqual([]);
    expect(result.entities).toEqual(expect.objectContaining({
      nome_cliente: "Maria Silva",
      valor: "1500.5",
      vencimento: "2026-05-20",
      billing_type: "PIX",
    }));
  });

  it("usa hoje mais tres dias uteis quando vencimento nao foi informado", () => {
    const result = normalizeBillingEntities({
      nome_cliente: "Maria Silva",
      valor: "1500",
    }, { now: new Date("2026-05-15T12:00:00.000Z") });

    expect(addBusinessDaysFromSaoPaulo(3, new Date("2026-05-15T12:00:00.000Z"))).toBe("2026-05-20");
    expect(result.entities.vencimento).toBe("2026-05-20");
    expect(result.defaultedFields).toEqual(expect.arrayContaining(["vencimento", "billing_type"]));
  });

  it("bloqueia vencimento passado, hoje e valor invalido", () => {
    expect(normalizeBillingEntities({
      nome_cliente: "Maria Silva",
      valor: "0",
      vencimento: "2026-05-12",
    }, { now: new Date("2026-05-12T12:00:00.000Z") }).errors).toEqual([
      "Valor da cobranca precisa ser positivo.",
      "Data de vencimento precisa ser futura e nao pode ser hoje.",
    ]);
  });

  it("gera chave de idempotencia estavel por cliente, valor, vencimento e origem", () => {
    expect(buildBillingIdempotencyKey({
      tenantId: "tenant-1",
      clientKey: "Maria Silva",
      amount: 1500,
      dueDate: "2026-05-20",
      originKey: "crm-task-1",
    })).toBe("asaas_billing:tenant-1:maria silva:1500.00:2026-05-20:crm-task-1");
  });
});
