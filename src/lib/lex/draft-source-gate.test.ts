import { describe, expect, it } from "vitest";
import {
  assertLegalDraftSourceGate,
  evaluateLegalDraftSourceGate,
} from "./draft-source-gate";

describe("draft source gate", () => {
  it("bloqueia aprovacao quando ha validacao externa pendente", () => {
    const decision = evaluateLegalDraftSourceGate({
      action: "approve",
      metadata: {
        citation_checklist: {
          pending_validations: ["Validar Tema 123/STJ"],
        },
      },
    });

    expect(decision.allowed).toBe(false);
    expect(decision.requiresOverride).toBe(true);
    expect(decision.sourceSummary.pendingValidationCount).toBe(1);
    expect(decision.blockedReasons[0]).toContain("validacao");
  });

  it("permite aprovacao quando as fontes estao limpas", () => {
    const decision = evaluateLegalDraftSourceGate({
      action: "approve",
      metadata: {
        used_documents: [{ id: "doc-1" }],
        validated_law_references: [{ citation: "Art. 300 do CPC", source_url: "https://example.com" }],
        validated_case_law_references: [],
        warnings: [],
      },
    });

    expect(decision.allowed).toBe(true);
    expect(decision.requiresOverride).toBe(false);
  });

  it("bloqueia publicacao premium com documento faltante ou revisao pendente", () => {
    expect(() => assertLegalDraftSourceGate({
      action: "premium_publish",
      metadata: {
        missing_documents: ["Procuração atualizada"],
        requires_human_review: true,
      },
    })).toThrow("Use override explicito");
  });

  it("libera com override humano justificado e registra a decisao", () => {
    const decision = evaluateLegalDraftSourceGate({
      action: "publish",
      metadata: {
        source_pack: {
          external_validation_gaps: ["Validar jurisprudencia"],
        },
      },
      override: {
        approved: true,
        reason: "Advogada validou manualmente no tribunal antes da publicacao.",
        actorId: "user-1",
      },
    });

    expect(decision.allowed).toBe(true);
    expect(decision.overridden).toBe(true);
    expect(decision.override).toEqual(expect.objectContaining({
      actorId: "user-1",
    }));
  });
});
