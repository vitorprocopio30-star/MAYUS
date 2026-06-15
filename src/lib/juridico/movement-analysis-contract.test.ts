import { describe, expect, it, vi } from "vitest";
import { upsertMovementAnalysisContract } from "./movement-analysis-contract";

describe("movement analysis contract", () => {
  it("upsert por id de movimentacao com campos juridicos de contrato", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn((table: string) => {
        expect(table).toBe("legal_movement_analysis_contracts");
        return { upsert };
      }),
    };

    const row = await upsertMovementAnalysisContract({
      client,
      tenantId: "tenant-1",
      numeroCnj: "0000001-11.2026.8.26.0100",
      processMovimentacaoId: "movement-1",
      processoId: "process-1",
      payload: {
        tipo_evento: "PRAZO",
        requer_acao: true,
        acao_sugerida: "Apresentar replica",
        prazo_extraido_dias: 15,
        confianca_analise: "alta",
        polo_representado: "ativo",
        obrigacao_de_quem: "escritorio",
        confidence_reason: "Intimacao expressa ao autor.",
        review_required: false,
      },
    });

    expect(row).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      process_movimentacao_id: "movement-1",
      processo_id: "process-1",
      tipo_evento: "PRAZO",
      requer_acao: true,
      polo_representado: "ativo",
      obrigacao_de_quem: "escritorio",
      review_status: "auto_resolved",
    }));
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      process_movimentacao_id: "movement-1",
    }), { onConflict: "tenant_id,process_movimentacao_id" });
  });

  it("registra decisao humana no contrato", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn(() => ({ upsert })),
    };

    const row = await upsertMovementAnalysisContract({
      client,
      tenantId: "tenant-1",
      numeroCnj: "0000001-11.2026.8.26.0100",
      escavadorMovimentacaoId: "esc-1",
      reviewedBy: "user-1",
      reviewedAt: "2026-06-08T12:00:00.000Z",
      reviewNote: "Prazo conferido manualmente.",
      reviewStatus: "approved",
      linkedProcessTaskId: "task-1",
      payload: {
        tipo_evento: "PRAZO",
        confidence: "media",
        review_required: true,
      },
    });

    expect(row).toEqual(expect.objectContaining({
      escavador_movimentacao_id: "esc-1",
      reviewed_by: "user-1",
      review_note: "Prazo conferido manualmente.",
      review_status: "approved",
      human_decision: expect.objectContaining({
        status: "approved",
        reviewed_by: "user-1",
        reviewed_at: "2026-06-08T12:00:00.000Z",
        note: "Prazo conferido manualmente.",
      }),
      linked_process_task_id: "task-1",
    }));
    expect(upsert).toHaveBeenCalledWith(expect.any(Object), { onConflict: "tenant_id,escavador_movimentacao_id" });
  });

  it("audita e propaga falha de persistencia do contrato", async () => {
    const error = new Error("schema cache indisponivel");
    const upsert = vi.fn(async () => ({ error }));
    const insertAudit = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "legal_movement_analysis_contracts") return { upsert };
        if (table === "system_event_logs") return { insert: insertAudit };
        throw new Error(`Tabela inesperada: ${table}`);
      }),
    };

    await expect(upsertMovementAnalysisContract({
      client,
      tenantId: "tenant-1",
      numeroCnj: "0000001-11.2026.8.26.0100",
      processMovimentacaoId: "movement-1",
      auditUserId: "user-1",
      auditSource: "movement_review",
      payload: {
        tipo_evento: "PRAZO",
        confidence: "alta",
        obrigacao_de_quem: "escritorio",
      },
    })).rejects.toThrow("schema cache indisponivel");

    expect(insertAudit).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      user_id: "user-1",
      source: "movement_review",
      provider: "mayus",
      event_name: "legal_movement_analysis_contract_persist_failed",
      status: "error",
      payload: expect.objectContaining({
        numero_cnj: "0000001-11.2026.8.26.0100",
        process_movimentacao_id: "movement-1",
        error: "schema cache indisponivel",
      }),
    }));
  });
});
