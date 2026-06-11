import { describe, expect, it } from "vitest";
import { buildDraftCaseBrainEvidence, buildDraftSourceEvidence, uniqueSourceItems } from "./legal-evidence-normalizers";

describe("legal evidence normalizers", () => {
  it("deduplica fontes e preserva links verificaveis", () => {
    expect(uniqueSourceItems([
      { name: "CNIS.pdf", web_view_link: "https://drive.test/cnis" },
      { title: "CNIS.pdf", webViewLink: "https://drive.test/cnis" },
      { citation: "Art. 300 CPC", source_url: "https://planalto.test/cpc" },
      "",
    ])).toEqual([
      { label: "CNIS.pdf", href: "https://drive.test/cnis" },
      { label: "Art. 300 CPC", href: "https://planalto.test/cpc" },
    ]);
  });

  it("normaliza evidencias de source gate a partir do metadata da minuta", () => {
    const evidence = buildDraftSourceEvidence({
      metadata: {
        used_documents: [{ name: "contestacao.pdf", web_view_link: "https://drive.test/doc" }],
        missing_documents: ["CNIS atualizado"],
        pending_validations: ["Tema STJ"],
        external_validation_gaps: ["validar jurisprudencia"],
        source_pack: {
          validated_external_sources: {
            law_references: [{ citation: "Art. 300 CPC", source_url: "https://planalto.test/cpc" }],
            case_law_references: [{ citation: "Tema 1.000 STJ", url: "https://stj.test/tema" }],
          },
        },
        relevant_unused_documents: ["laudo.pdf"],
      },
    });

    expect(evidence.documents[0]).toEqual({ label: "contestacao.pdf", href: "https://drive.test/doc" });
    expect(evidence.missingDocuments.map((item) => item.label)).toEqual(["CNIS atualizado"]);
    expect(evidence.pendingValidations.map((item) => item.label)).toEqual(["Tema STJ"]);
    expect(evidence.externalGaps.map((item) => item.label)).toEqual(["validar jurisprudencia"]);
    expect(evidence.lawReferences[0].label).toBe("Art. 300 CPC");
    expect(evidence.caseLawReferences[0].label).toBe("Tema 1.000 STJ");
    expect(evidence.relevantUnusedDocuments.map((item) => item.label)).toEqual(["laudo.pdf"]);
  });

  it("normaliza Case Brain atual/usado, snapshot e override premium", () => {
    const evidence = buildDraftCaseBrainEvidence({
      source_case_brain_task_id: "case-used",
      metadata: {
        case_brain_snapshot: {
          summary: "Resumo Case Brain",
          high_risk_count: "1",
          high_contradiction_count: 2,
          grounding_gap_count: 3,
          risks: ["risco"],
          contradictions: ["contradicao"],
          gaps: ["gap"],
          missing_documents: ["PPP"],
          relevant_unused_documents: ["laudo.pdf"],
        },
        legal_source_gate: {
          action: "approve",
          status: "blocked_pending_override",
        },
        legal_source_gate_premium_publish: {
          override_reason: "Fonte validada manualmente.",
          overridden_by: "user-1",
        },
      },
    }, "case-current");

    expect(evidence.currentCaseBrainTaskId).toBe("case-current");
    expect(evidence.sourceCaseBrainTaskId).toBe("case-used");
    expect(evidence.hasSnapshot).toBe(true);
    expect(evidence.summary).toBe("Resumo Case Brain");
    expect(evidence.highRiskCount).toBe(1);
    expect(evidence.highContradictionCount).toBe(2);
    expect(evidence.groundingGapCount).toBe(3);
    expect(evidence.risks.map((item) => item.label)).toEqual(["risco"]);
    expect(evidence.missingDocuments.map((item) => item.label)).toEqual(["PPP"]);
    expect(evidence.sourceGateStatus).toBe("blocked_pending_override");
    expect(evidence.sourceGateAction).toBe("approve");
    expect(evidence.premiumOverrideReason).toBe("Fonte validada manualmente.");
    expect(evidence.premiumOverrideActor).toBe("user-1");
  });

  it("usa fallback antigo de metadata quando source_case_brain_task_id nao existe na coluna", () => {
    const evidence = buildDraftCaseBrainEvidence({
      metadata: {
        caseBrain: { resumo: "Snapshot legado" },
        case_brain_task_id: "legacy-case",
      },
    }, null);

    expect(evidence.sourceCaseBrainTaskId).toBe("legacy-case");
    expect(evidence.summary).toBe("Snapshot legado");
    expect(evidence.hasSnapshot).toBe(true);
  });
});
