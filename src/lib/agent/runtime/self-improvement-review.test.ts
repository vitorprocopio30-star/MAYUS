import { describe, expect, it } from "vitest";
import { runSelfImprovementReview } from "./self-improvement-review";

function makeEvent(id: string, payload: Record<string, unknown>, eventType = "mayus_operating_partner_repair_pattern") {
  return {
    id,
    event_type: eventType,
    payload,
    created_at: "2026-05-18T10:00:00.000Z",
  };
}

function createClientMock(params: {
  events: any[];
  memories?: any[];
}) {
  const inserts: Array<{ table: string; payload: any }> = [];

  function makeSelectQuery(data: any[]) {
    const query: any = {
      select: () => query,
      eq: () => query,
      in: () => query,
      gte: () => query,
      order: () => query,
      limit: async () => ({ data, error: null }),
    };
    return query;
  }

  return {
    inserts,
    client: {
      from(table: string) {
        if (table === "learning_events") {
          return {
            ...makeSelectQuery(params.events),
            insert: async (payload: any) => {
              inserts.push({ table, payload });
              return { error: null };
            },
          };
        }
        if (table === "brain_memories") {
          return {
            ...makeSelectQuery(params.memories || []),
            insert: async (payload: any) => {
              inserts.push({ table, payload });
              return { error: null };
            },
          };
        }
        if (table === "brain_artifacts") {
          return {
            insert: async (payload: any) => {
              inserts.push({ table, payload });
              return { error: null };
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    },
  };
}

describe("runSelfImprovementReview", () => {
  it("cria proposta quando detecta 3 eventos do mesmo padrao", async () => {
    const { client, inserts } = createClientMock({
      events: [
        makeEvent("event-1", { original_risk_flags: ["foreign_language_leak"] }),
        makeEvent("event-2", { original_risk_flags: ["foreign_language_leak"] }),
        makeEvent("event-3", { original_risk_flags: ["foreign_language_leak"] }),
      ],
    });

    const result = await runSelfImprovementReview({
      supabase: client,
      tenantId: "tenant-1",
      actorId: "user-1",
      brainContext: { taskId: "task-1", runId: "run-1", stepId: "step-1" },
    });

    expect(result.proposalsCreated).toBe(1);
    expect(result.patternsDetected[0]).toEqual(expect.objectContaining({
      patternKind: "repair_foreign_language_leak",
      count: 3,
    }));
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "brain_memories",
      payload: expect.objectContaining({
        tenant_id: "tenant-1",
        memory_key: "self_improvement:repair_foreign_language_leak",
        source: "self_improvement_loop",
        promoted: false,
        value: expect.objectContaining({
          evidence: expect.objectContaining({
            correction_kind: "operating_partner_reply_repair",
            recommended_action: expect.stringContaining("Regenerar"),
            evidence_event_ids: ["event-1", "event-2", "event-3"],
          }),
        }),
      }),
    }));
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "learning_events",
      payload: expect.objectContaining({
        event_type: "self_improvement_proposals_created",
        payload: expect.objectContaining({
          correction_kinds: ["operating_partner_reply_repair"],
        }),
      }),
    }));
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "brain_artifacts",
      payload: expect.objectContaining({
        artifact_type: "self_improvement_report",
        task_id: "task-1",
      }),
    }));
  });

  it("nao cria proposta com menos de 3 eventos", async () => {
    const { client, inserts } = createClientMock({
      events: [
        makeEvent("event-1", { original_risk_flags: ["foreign_language_leak"] }),
        makeEvent("event-2", { original_risk_flags: ["foreign_language_leak"] }),
      ],
    });

    const result = await runSelfImprovementReview({ supabase: client, tenantId: "tenant-1" });

    expect(result.proposalsCreated).toBe(0);
    expect(inserts).toHaveLength(0);
  });

  it("pula padrao quando ja existe proposta recente nao rejeitada", async () => {
    const { client, inserts } = createClientMock({
      events: [
        makeEvent("event-1", { original_risk_flags: ["foreign_language_leak"] }),
        makeEvent("event-2", { original_risk_flags: ["foreign_language_leak"] }),
        makeEvent("event-3", { original_risk_flags: ["foreign_language_leak"] }),
        makeEvent("event-4", { original_risk_flags: ["foreign_language_leak"] }),
      ],
      memories: [{
        id: "memory-1",
        memory_key: "self_improvement:repair_foreign_language_leak",
        source: "self_improvement_loop",
        promoted: false,
        value: { status: "proposed" },
        created_at: new Date().toISOString(),
      }],
    });

    const result = await runSelfImprovementReview({ supabase: client, tenantId: "tenant-1" });

    expect(result.proposalsCreated).toBe(0);
    expect(result.patternsDetected[0]).toEqual(expect.objectContaining({
      skipped: true,
      skipReason: "recent_proposal_exists",
    }));
    expect(inserts).toHaveLength(0);
  });

  it("detecta inadimplencia e lead perdido como padroes separados", async () => {
    const { client } = createClientMock({
      events: [
        makeEvent("overdue-1", { delay_days_estimate: 9 }, "billing_payment_overdue"),
        makeEvent("overdue-2", { delay_days_estimate: 12 }, "billing_payment_overdue"),
        makeEvent("overdue-3", { delay_days_estimate: 18 }, "billing_payment_overdue"),
        makeEvent("lead-1", { outcome: "lost", motivo: "preco alto" }, "lead_outcome_recorded"),
        makeEvent("lead-2", { outcome: "lost", motivo: "preco alto" }, "lead_outcome_recorded"),
        makeEvent("lead-3", { outcome: "lost", motivo: "preco alto" }, "lead_outcome_recorded"),
      ],
    });

    const result = await runSelfImprovementReview({ supabase: client, tenantId: "tenant-1" });

    expect(result.proposalsCreated).toBe(2);
    expect(result.patternsDetected.map((pattern) => pattern.patternKind)).toEqual(expect.arrayContaining([
      "overdue_8_30",
      "lead_lost_motivo_preco_alto",
    ]));
  });

  it("detecta delta humano de minuta e peca aprovada como padroes juridicos", async () => {
    const { client, inserts } = createClientMock({
      events: [
        makeEvent("delta-1", { signal_categories: ["citations_enriched"] }, "human_revision_delta_recorded"),
        makeEvent("delta-2", { signal_categories: ["citations_enriched"] }, "human_revision_delta_recorded"),
        makeEvent("delta-3", { signal_categories: ["citations_enriched"] }, "human_revision_delta_recorded"),
        makeEvent("piece-1", { practice_area: "previdenciario", piece_type: "contestacao" }, "legal_piece_approved"),
        makeEvent("piece-2", { practice_area: "previdenciario", piece_type: "contestacao" }, "legal_piece_approved"),
        makeEvent("piece-3", { practice_area: "previdenciario", piece_type: "contestacao" }, "legal_piece_approved"),
      ],
    });

    const result = await runSelfImprovementReview({ supabase: client, tenantId: "tenant-1" });

    expect(result.proposalsCreated).toBe(2);
    expect(result.patternsDetected).toEqual(expect.arrayContaining([
      expect.objectContaining({
        patternKind: "draft_delta_citations_enriched",
        category: "juridico",
        count: 3,
      }),
      expect.objectContaining({
        patternKind: "piece_approved_previdenciario_contestacao",
        category: "juridico",
        count: 3,
      }),
    ]));
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "brain_memories",
      payload: expect.objectContaining({
        memory_key: "self_improvement:draft_delta_citations_enriched",
        value: expect.objectContaining({
          category: "juridico",
          evidence: expect.objectContaining({
            evidence_event_ids: ["delta-1", "delta-2", "delta-3"],
          }),
        }),
      }),
    }));
  });

  it("detecta delta humano de atendimento e suporte repetido", async () => {
    const { client } = createClientMock({
      events: [
        makeEvent("reply-1", { conversation_stage: "objection", edit_categories: ["human_edited", "objection_handled"] }, "whatsapp_human_reply_delta_recorded"),
        makeEvent("reply-2", { conversation_stage: "objection", edit_categories: ["human_edited", "objection_handled"] }, "whatsapp_human_reply_delta_recorded"),
        makeEvent("reply-3", { conversation_stage: "objection", edit_categories: ["human_edited", "objection_handled"] }, "whatsapp_human_reply_delta_recorded"),
        makeEvent("support-1", { response_mode: "handoff", handoff_reason: "case_not_identified" }, "support_case_status_resolved"),
        makeEvent("support-2", { response_mode: "handoff", handoff_reason: "case_not_identified" }, "support_case_status_resolved"),
        makeEvent("support-3", { response_mode: "handoff", handoff_reason: "case_not_identified" }, "support_case_status_resolved"),
      ],
    });

    const result = await runSelfImprovementReview({ supabase: client, tenantId: "tenant-1" });

    expect(result.proposalsCreated).toBe(2);
    expect(result.patternsDetected).toEqual(expect.arrayContaining([
      expect.objectContaining({
        patternKind: "attendance_objection_objection_handled",
        category: "atendimento",
        count: 3,
      }),
      expect.objectContaining({
        patternKind: "support_status_handoff_case_not_identified",
        category: "atendimento",
        count: 3,
      }),
    ]));
  });

  it("detecta auto-correcao falha como padrao de melhoria", async () => {
    const { client, inserts } = createClientMock({
      events: [
        makeEvent("correction-1", { correction_kind: "operating_partner_reply_repair", reason: "timeout" }, "self_correction_failed"),
        makeEvent("correction-2", { correction_kind: "operating_partner_reply_repair", reason: "timeout" }, "self_correction_failed"),
        makeEvent("correction-3", { correction_kind: "operating_partner_reply_repair", reason: "timeout" }, "self_correction_failed"),
      ],
    });

    const result = await runSelfImprovementReview({ supabase: client, tenantId: "tenant-1" });

    expect(result.proposalsCreated).toBe(1);
    expect(result.patternsDetected[0]).toEqual(expect.objectContaining({
      patternKind: "correction_failed_operating_partner_reply_repair_timeout",
      correctionKind: "operating_partner_reply_repair",
      recommendedAction: expect.stringContaining("Escalar"),
    }));
    expect(inserts).toContainEqual(expect.objectContaining({
      table: "brain_memories",
      payload: expect.objectContaining({
        memory_key: "self_improvement:correction_failed_operating_partner_reply_repair_timeout",
        source: "self_improvement_loop",
        promoted: false,
        value: expect.objectContaining({
          text: expect.stringContaining("auto-correcao operating_partner_reply_repair"),
          category: "compliance",
          source_label: "MAYUS detectou padrao",
          status: "proposed",
          evidence: expect.objectContaining({
            correction_kind: "operating_partner_reply_repair",
            recommended_action: expect.stringContaining("Escalar"),
          }),
        }),
      }),
    }));
  });
});
