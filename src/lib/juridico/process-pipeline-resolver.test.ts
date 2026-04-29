import { describe, expect, it } from "vitest";
import {
  chooseFallbackLegalStage,
  chooseSemanticLegalStage,
  isMovementStage,
  scoreLegalPipelineName,
} from "./process-pipeline-resolver";

const stages = [
  { id: "mov", name: "Movimentacoes" },
  { id: "docs", name: "Recolher Documentos" },
  { id: "contestacao", name: "Contestacao" },
  { id: "replica", name: "Replica" },
  { id: "recursos", name: "Recursos" },
];

describe("process pipeline resolver", () => {
  it("prefers legal pipelines over crm or sales pipelines", () => {
    expect(scoreLegalPipelineName("Controle Juridico")).toBeGreaterThan(scoreLegalPipelineName("CRM Comercial"));
    expect(scoreLegalPipelineName("Processos Juridicos")).toBeGreaterThan(scoreLegalPipelineName("Vendas"));
  });

  it("does not choose movement-only stages as fallback", () => {
    expect(isMovementStage("Movimentacoes")).toBe(true);
    expect(chooseFallbackLegalStage(stages)).toBe("docs");
  });

  it("chooses semantic stages from legal movement signals", () => {
    expect(chooseSemanticLegalStage(stages, ["Intimacao para apresentar replica a contestacao"])).toBe("replica");
    expect(chooseSemanticLegalStage(stages, ["Juntada de contestacao pela parte adversa"])).toBe("contestacao");
    expect(chooseSemanticLegalStage(stages, ["Sentenca publicada, avaliar recurso"])).toBe("recursos");
  });
});
