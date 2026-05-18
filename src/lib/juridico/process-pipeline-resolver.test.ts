import { describe, expect, it } from "vitest";
import {
  chooseFallbackLegalStage,
  chooseSemanticLegalStage,
  isMovementStage,
  resolveProcessPipelineContext,
  scoreLegalPipelineName,
} from "./process-pipeline-resolver";

const stages = [
  { id: "mov", name: "Movimentacoes" },
  { id: "docs", name: "Recolher Documentos" },
  { id: "contestacao", name: "Contestacao" },
  { id: "replica", name: "Replica" },
  { id: "recursos", name: "Recursos" },
];

function supabaseMock(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      const data = tables[table] || [];
      const query: any = {
        select: () => query,
        eq: () => query,
        order: () => query,
        limit: () => query,
        maybeSingle: async () => ({ data: data[0] || null, error: null }),
        then(resolve: (value: any) => void) {
          resolve({ data, error: null });
        },
      };
      return query;
    },
  };
}

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

  it("does not fallback to crm or sales pipelines when no legal pipeline exists", async () => {
    const result = await resolveProcessPipelineContext({
      supabase: supabaseMock({
        process_pipelines: [
          { id: "crm", name: "CRM Comercial" },
          { id: "sales", name: "Vendas" },
        ],
      }),
      tenantId: "tenant-1",
      processNumber: "0000001-11.2026.8.26.0100",
    });

    expect(result.pipelineId).toBeNull();
    expect(result.fallbackStageId).toBeNull();
  });

  it("allows process-only legal pipeline fallback", async () => {
    const result = await resolveProcessPipelineContext({
      supabase: supabaseMock({
        process_pipelines: [{ id: "processos", name: "Processos" }],
        process_stages: stages,
      }),
      tenantId: "tenant-1",
      processNumber: "0000001-11.2026.8.26.0100",
    });

    expect(result.pipelineId).toBe("processos");
    expect(result.fallbackStageId).toBe("docs");
  });
});
