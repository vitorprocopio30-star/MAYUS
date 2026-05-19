import { describe, expect, it } from "vitest";
import {
  buildApprovedProposalValue,
  buildMemoryPromotionEventPayload,
  buildMemoryPromotionProposal,
  buildRejectedProposalValue,
  buildRevokedMemoryValue,
  deserializeInstitutionalMemoryValue,
  normalizeMemoryProposalRow,
  sanitizeMemoryText,
} from "./promotion";

describe("memory promotion helpers", () => {
  it("builds a sanitized supervised memory proposal", () => {
    const proposal = buildMemoryPromotionProposal({
      key: " Tom comercial ",
      value: "Atender com calma. service_role_key=super-secret-token",
      category: " Atendimento ",
      source: "office_setup",
      confidence: 87,
      evidence: { artifactId: "artifact-1" },
      proposedBy: "user-1",
    });

    expect(proposal).toMatchObject({
      memoryType: "institutional_memory_proposal",
      memoryKey: "Tom comercial",
      source: "office_setup",
      confidence: 0.87,
      value: {
        category: "atendimento",
        source_label: "office_setup",
        status: "proposed",
        proposed_by: "user-1",
      },
    });
    expect(proposal.value.text).toContain("[redacted]");
    expect(proposal.value.text).not.toContain("super-secret-token");
  });

  it("normalizes pending proposals from brain_memories", () => {
    const proposal = normalizeMemoryProposalRow({
      id: "proposal-1",
      memory_key: "Escavador",
      value: {
        text: "Nunca buscar pago sem aprovacao.",
        category: "financeiro",
        source_label: "Policy Agentica",
        status: "proposed",
      },
      source: "policy",
      confidence: "0.75",
      promoted: false,
      created_by: "user-1",
      created_at: "2026-05-15T10:00:00.000Z",
    });

    expect(proposal).toMatchObject({
      id: "proposal-1",
      key: "Escavador",
      value: "Nunca buscar pago sem aprovacao.",
      category: "financeiro",
      source: "policy",
      sourceLabel: "Policy Agentica",
      confidence: 0.75,
      status: "proposed",
      promoted: false,
    });
  });

  it("keeps approval and rejection auditable without exposing secrets", () => {
    const proposal = normalizeMemoryProposalRow({
      id: "proposal-1",
      memory_key: "Chave externa",
      value: {
        text: "Token sk-test-secretvalue1234567890 deve ficar oculto.",
        category: "integracoes",
        source_label: "Setup",
      },
      source: "setup",
      confidence: 1,
      promoted: false,
      created_by: "user-1",
      created_at: null,
    });

    const approved = buildApprovedProposalValue(proposal, {
      approverId: "admin-1",
      memoryEntryId: "memory-1",
    });
    const rejected = buildRejectedProposalValue(proposal, {
      reviewerId: "admin-1",
      reason: "Nao deve virar regra. bearer_token=secret",
    });

    expect(approved).toMatchObject({
      status: "approved",
      approved_by: "admin-1",
      memory_entry_id: "memory-1",
    });
    expect(String(approved.text)).not.toContain("sk-test-secretvalue");
    expect(String(rejected.reason)).toContain("[redacted]");
    expect(String(rejected.reason)).not.toContain("secret");
  });

  it("revokes by deactivating the memory and recording a sanitized reason", () => {
    const revoked = buildRevokedMemoryValue(
      {
        id: "memory-1",
        key: "Preferencia de atendimento",
        category: "atendimento",
        value: { text: "Cliente VIP recebe retorno em ate 1h." },
        enforced: true,
      },
      {
        reviewerId: "admin-1",
        reason: "Regra antiga com access_token=token-super-secreto.",
      },
    );

    expect(revoked).toMatchObject({
      status: "revoked",
      revoked_by: "admin-1",
      memory_entry_id: "memory-1",
      enforced_before_revocation: true,
    });
    expect(revoked.text).toBe("Cliente VIP recebe retorno em ate 1h.");
    expect(String(revoked.reason)).toContain("[redacted]");
  });

  it("sanitizes learning event payloads", () => {
    expect(sanitizeMemoryText("bearer_token=abc1234567890123456789")).toBe("[redacted]");
    expect(deserializeInstitutionalMemoryValue({ text: "  regra  " })).toBe("regra");
    expect(buildMemoryPromotionEventPayload({
      action: "revoked",
      key: "key",
      category: "financeiro",
      source: "memory_panel",
      confidence: 100,
      reason: "api_key=abc1234567890123456789",
    })).toMatchObject({
      action: "revoked",
      category: "financeiro",
      confidence: 1,
      reason: "[redacted]",
    });
  });
});
