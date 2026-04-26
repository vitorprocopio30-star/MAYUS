import { describe, expect, it } from "vitest";

import {
  filterExternalValidationReferencesForLegalArea,
  formatExternalValidationReferencesForTextarea,
  mergeExternalValidationReferencesIntoMetadata,
  parseExternalValidationReferencesFromMetadata,
  parseExternalValidationTextarea,
} from "./external-validation";

describe("external-validation", () => {
  it("faz parse de referencias externas em formato texto", () => {
    const result = parseExternalValidationTextarea({
      kind: "law",
      input: "Previdenciário, Civil | CPC, art. 300 | Tutela de urgência | https://example.com/cpc300",
    });

    expect(result.errors).toEqual([]);
    expect(result.references).toHaveLength(1);
    expect(result.references[0]).toMatchObject({
      kind: "law",
      citation: "CPC, art. 300",
      summary: "Tutela de urgência",
      sourceUrl: "https://example.com/cpc300",
      legalAreas: ["Previdenciário", "Civil"],
    });
  });

  it("sinaliza erro quando a linha nao segue o formato esperado", () => {
    const result = parseExternalValidationTextarea({
      kind: "case_law",
      input: "Tema 1102/STJ sem separadores",
    });

    expect(result.references).toEqual([]);
    expect(result.errors[0]).toContain("Linha 1");
  });

  it("faz roundtrip entre metadata e textarea", () => {
    const parsedLaw = parseExternalValidationTextarea({
      kind: "law",
      input: "* | CPC, art. 300 | Tutela de urgência | https://example.com/cpc300",
    });
    const parsedCaseLaw = parseExternalValidationTextarea({
      kind: "case_law",
      input: "Previdenciário | Tema 1102/STJ | Revisão da vida toda | https://example.com/tema1102",
    });

    const metadata = mergeExternalValidationReferencesIntoMetadata({
      metadata: { auto_draft_factory_on_case_brain_ready: true },
      lawReferences: parsedLaw.references,
      caseLawReferences: parsedCaseLaw.references,
    });

    const restored = parseExternalValidationReferencesFromMetadata(metadata);

    expect(restored.lawReferences).toHaveLength(1);
    expect(restored.caseLawReferences).toHaveLength(1);
    expect(formatExternalValidationReferencesForTextarea(restored.caseLawReferences)).toContain("Tema 1102/STJ");
    expect(metadata).toMatchObject({ auto_draft_factory_on_case_brain_ready: true });
  });

  it("filtra referencias pela area juridica do caso", () => {
    const parsed = parseExternalValidationTextarea({
      kind: "case_law",
      input: [
        "Previdenciário | Tema 1102/STJ | Revisão da vida toda | https://example.com/tema1102",
        "Trabalhista | Tema 1046/STF | Negociado sobre legislado | https://example.com/tema1046",
        "* | Súmula 7/STJ | Reexame de prova | https://example.com/sumula7",
      ].join("\n"),
    });

    const previdenciario = filterExternalValidationReferencesForLegalArea(parsed.references, "Direito Previdenciário");
    const trabalhista = filterExternalValidationReferencesForLegalArea(parsed.references, "Trabalhista");

    expect(previdenciario.map((item) => item.citation)).toEqual([
      "Tema 1102/STJ",
      "Súmula 7/STJ",
    ]);
    expect(trabalhista.map((item) => item.citation)).toEqual([
      "Tema 1046/STF",
      "Súmula 7/STJ",
    ]);
  });
});
