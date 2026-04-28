import { describe, expect, it } from "vitest";
import { buildExternalActionPreview, buildExternalActionPreviewMetadata } from "./external-action-preview";

describe("external action preview", () => {
  it("builds blocked ZapSign preview when signer email is missing", () => {
    const preview = buildExternalActionPreview({
      actionType: "contrato zapsign",
      clientName: "Maria Silva",
      legalArea: "Previdenciario",
      crmTaskId: "crm-task-1",
    });

    expect(preview.actionType).toBe("zapsign_contract");
    expect(preview.riskLevel).toBe("high");
    expect(preview.externalSideEffectsBlocked).toBe(true);
    expect(preview.blockers).toContain("E-mail do signatario ausente para contrato.");
    expect(preview.checklist).toContain("Conferir nome e e-mail do signatario antes de gerar contrato.");
  });

  it("builds Asaas billing preview with amount", () => {
    const preview = buildExternalActionPreview({
      actionType: "cobranca asaas",
      clientName: "Ana Lead",
      amount: "4.500,00",
    });

    expect(preview.actionType).toBe("asaas_billing");
    expect(preview.amount).toBe(4500);
    expect(preview.blockers).toEqual([]);
    expect(preview.nextBestAction).toContain("aprovar explicitamente");
  });

  it("builds safe metadata without secrets or raw recipient email", () => {
    const preview = buildExternalActionPreview({
      actionType: "contrato",
      clientName: "Bianca Indicada",
      recipientEmail: "bianca@example.com",
      amount: 3000,
    });
    const metadata = buildExternalActionPreviewMetadata(preview);

    expect(metadata).toEqual(expect.objectContaining({
      action_type: "zapsign_contract",
      client_name: "Bianca Indicada",
      amount: 3000,
      preview_status: "pending_human_approval",
      external_side_effects_blocked: true,
      requires_human_approval: true,
    }));
    expect(JSON.stringify(metadata)).not.toMatch(/bianca@example\.com|api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });
});
