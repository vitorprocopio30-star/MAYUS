import { describe, expect, it } from "vitest";
import {
  buildManagementTermExplanation,
  extractManagementKnowledgeTermsFromText,
  findManagementKnowledgeTerm,
  listManagementKnowledgeTerms,
} from "./management-knowledge-base";

describe("management knowledge base", () => {
  it("explica termos de gestao em linguagem de escritorio", () => {
    const explanation = buildManagementTermExplanation("Explique CAC para advocacia");

    expect(explanation.found).toBe(true);
    expect(explanation.answer).toContain("Dados MAYUS necessarios");
    expect(explanation.answer).toContain("Pergunta para o dono decidir");
    expect(explanation.sources).toContain("Dados internos MAYUS - financials, CRM, Asaas, contratos, cobrancas, processos, prazos e documentos");
  });

  it("mapeia os conceitos minimos da base Gestao Juridica BR", () => {
    const slugs = listManagementKnowledgeTerms().map((term) => term.slug);

    expect(slugs).toEqual(expect.arrayContaining([
      "cac",
      "ltv",
      "margem",
      "ticket-medio",
      "conversao",
      "pipeline",
      "forecast",
      "roi",
      "cpl",
      "capacidade",
      "inadimplencia",
      "produtividade",
      "tese-lucrativa",
    ]));
  });

  it("extrai termos de um pedido livre", () => {
    const terms = extractManagementKnowledgeTermsFromText("Quero olhar CAC, margem e tese lucrativa");

    expect(terms.map((term) => term.slug)).toEqual(["cac", "margem", "tese-lucrativa"]);
    expect(findManagementKnowledgeTerm("custo por lead")?.slug).toBe("cpl");
  });
});
