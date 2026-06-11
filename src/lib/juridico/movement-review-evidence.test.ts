import { describe, expect, it } from "vitest";
import { normalizeMovementReviewEvidence } from "./movement-review-evidence";

describe("movement review evidence normalizer", () => {
  it("normaliza contrato, decisao humana, Case Brain e side effects bloqueados", () => {
    const evidence = normalizeMovementReviewEvidence({
      status: "review_required",
      origem: "heuristica",
      contract: {
        review_status: "review_required",
        audit_source: "movement_review_recovery",
        human_decision: {
          status: "review_required",
          reviewed_by: "user-1",
          justification: "Validar prazo antes de criar card.",
        },
      },
      side_effects: {
        blocked_side_effects: ["deadline_creation", "draft_factory"],
        reason: "Aguardando aprovacao humana.",
      },
      supervision_context: {
        sources_used: ["process_movimentacoes"],
        blockers: ["human_approval_required"],
        case_brain: {
          summary: "Risco de prazo fatal.",
          high_risk_count: "1",
          high_contradiction_count: 2,
          grounding_gap_count: 3,
          risks: ["prazo fatal"],
          contradictions: ["data divergente"],
          gaps: ["confirmar ciencia"],
          missing_documents: ["certidao"],
          relevant_unused_documents: ["inicial.pdf"],
        },
      },
    });

    expect(evidence.shouldRender).toBe(true);
    expect(evidence.contractStatus).toBe("review_required");
    expect(evidence.contractSource).toBe("movement_review_recovery");
    expect(evidence.decisionActor).toBe("user-1");
    expect(evidence.decisionReason).toContain("Validar prazo");
    expect(evidence.caseBrainSummary).toBe("Risco de prazo fatal.");
    expect(evidence.riskCount).toBe(1);
    expect(evidence.contradictionCount).toBe(2);
    expect(evidence.gapCount).toBe(3);
    expect(evidence.risks).toEqual(["prazo fatal"]);
    expect(evidence.missingDocuments).toEqual(["certidao"]);
    expect(evidence.unusedDocuments).toEqual(["inicial.pdf"]);
    expect(evidence.sources).toEqual(["process_movimentacoes"]);
    expect(evidence.blockers).toEqual(["human_approval_required"]);
    expect(evidence.protectedSideEffects).toEqual(["deadline_creation", "draft_factory"]);
    expect(evidence.sideEffectReason).toBe("Aguardando aprovacao humana.");
  });

  it("mantem fallback seguro quando snapshot e contrato nao existem", () => {
    const evidence = normalizeMovementReviewEvidence({});

    expect(evidence.shouldRender).toBe(false);
    expect(evidence.contractStatus).toBeNull();
    expect(evidence.caseBrainSummary).toBeNull();
    expect(evidence.risks).toEqual([]);
    expect(evidence.protectedSideEffects).toEqual([]);
  });
});
