import { describe, expect, it } from "vitest";
import {
  buildClientAcceptanceArtifactMetadata,
  buildClientAcceptanceRecord,
  buildClientAcceptanceSystemEventPayload,
} from "./client-acceptance";

describe("client acceptance", () => {
  it("builds acceptance audit record for proposal", () => {
    const record = buildClientAcceptanceRecord({
      clientName: "Maria Silva",
      crmTaskId: "crm-task-1",
      legalArea: "Previdenciario",
      acceptanceType: "proposta",
      acceptanceChannel: "WhatsApp",
      evidenceSummary: "Cliente respondeu que aceita a proposta.",
      amount: "4.500,00",
      acceptedAt: "2026-04-28T12:00:00.000Z",
    });

    expect(record.acceptanceType).toBe("proposal");
    expect(record.amount).toBe(4500);
    expect(record.auditStatus).toBe("recorded_pending_internal_review");
    expect(record.externalSideEffectsBlocked).toBe(true);
    expect(record.requiresHumanReview).toBe(true);
  });

  it("builds safe artifact metadata", () => {
    const record = buildClientAcceptanceRecord({
      clientName: "Ana Lead",
      acceptanceType: "contrato",
      evidenceSummary: "Aceite verbal registrado pela equipe.",
    });
    const metadata = buildClientAcceptanceArtifactMetadata(record);

    expect(metadata).toEqual(expect.objectContaining({
      client_name: "Ana Lead",
      acceptance_type: "contract",
      external_side_effects_blocked: true,
      requires_human_review: true,
    }));
    expect(JSON.stringify(metadata)).not.toMatch(/phone|email|api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });

  it("builds operational system event payload without secrets", () => {
    const record = buildClientAcceptanceRecord({
      clientName: "Bianca Indicada",
      acceptanceType: "pagamento",
      amount: 3000,
    });
    const event = buildClientAcceptanceSystemEventPayload({
      record,
      userId: "user-1",
      auditLogId: "audit-1",
    });

    expect(event).toEqual(expect.objectContaining({
      event_name: "client_acceptance_recorded",
      status: "ok",
      payload: expect.objectContaining({
        audit_log_id: "audit-1",
        user_id: "user-1",
        client_name: "Bianca Indicada",
        acceptance_type: "billing",
        amount: 3000,
      }),
    }));
    expect(JSON.stringify(event)).not.toMatch(/api_key|webhook_secret|sk_live|sk_test|sk-or-v1/i);
  });
});
