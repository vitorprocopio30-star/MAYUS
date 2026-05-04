import { describe, expect, it, vi } from "vitest";
import { executeMayusOperatingPartnerActions } from "./mayus-operating-partner-actions";
import type { MayusOperatingPartnerDecision } from "./mayus-operating-partner";

function makeDecision(overrides: Partial<MayusOperatingPartnerDecision> = {}): MayusOperatingPartnerDecision {
  return {
    provider: "openrouter",
    model_used: "deepseek/deepseek-v4-pro",
    reply: "Entendi. Vou organizar o proximo passo.",
    intent: "sales_qualification",
    confidence: 0.9,
    risk_flags: [],
    next_action: "criar follow-up",
    conversation_state: {
      stage: "qualification",
      facts_known: ["lead com dor clara"],
      missing_information: ["decisor"],
      objections: [],
      urgency: "none",
      decision_maker: "unknown",
      documents_requested: [],
      last_customer_message: "quero entender melhor",
      last_mayus_message: null,
      next_action: "criar follow-up",
      has_mayus_introduced: true,
      conversation_summary: "lead em qualificacao",
    },
    closing_readiness: { score: 45, status: "warming", reasons: ["dor clara"] },
    support_summary: { is_existing_client: false, issue_type: "none", verified_case_reference: false, summary: "sem suporte" },
    reasoning_summary_for_team: "Lead precisa de follow-up curto.",
    actions_to_execute: [],
    requires_approval: false,
    should_auto_send: true,
    expected_outcome: "lead responde com contexto",
    ...overrides,
  };
}

describe("executeMayusOperatingPartnerActions", () => {
  it("cria tarefa de follow-up do agente e registra auditoria", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const supabase: any = {
      from: vi.fn((table: string) => {
        if (table === "user_tasks") {
          const query: any = {
            insert: vi.fn((payload: any) => {
              inserts.push({ table, payload });
              return query;
            }),
            select: vi.fn(() => query),
            single: vi.fn(async () => ({ data: { id: "task-1" }, error: null })),
          };
          return query;
        }

        return {
          insert: vi.fn(async (payload: any) => {
            inserts.push({ table, payload });
            return { error: null };
          }),
        };
      }),
    };

    const decision = makeDecision({
      actions_to_execute: [
        { type: "create_task", title: "Follow-up WhatsApp do lead", payload: { urgency: "ATENCAO" }, requires_approval: false },
      ],
    });

    const results = await executeMayusOperatingPartnerActions({
      supabase,
      tenantId: "tenant-1",
      contact: { id: "contact-1", name: "Vitor", phone_number: "5511999999999", assigned_user_id: "user-1" },
      trigger: "meta_webhook",
      actorUserId: "user-1",
      decision,
    });

    expect(results).toEqual([
      { type: "create_task", status: "executed", detail: "Tarefa de follow-up criada.", record_id: "task-1" },
    ]);
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "user_tasks",
        payload: expect.objectContaining({
          tenant_id: "tenant-1",
          assigned_to: "user-1",
          created_by_agent: "mayus_operating_partner",
          source_table: "whatsapp_contacts",
          urgency: "ATENCAO",
        }),
      }),
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          event_name: "mayus_operating_partner_action",
          payload: expect.objectContaining({
            action: expect.objectContaining({ type: "create_task" }),
            result: expect.objectContaining({ status: "executed" }),
          }),
        }),
      }),
    ]));
  });

  it("segura acao de fechamento quando exige aprovacao humana", async () => {
    const inserts: Array<{ table: string; payload: any }> = [];
    const supabase: any = {
      from: vi.fn((table: string) => ({
        insert: vi.fn(async (payload: any) => {
          inserts.push({ table, payload });
          return { error: null };
        }),
      })),
    };

    const decision = makeDecision({
      actions_to_execute: [
        { type: "mark_ready_for_closing", title: "Marcar pronto para fechamento", requires_approval: true },
      ],
    });

    const results = await executeMayusOperatingPartnerActions({
      supabase,
      tenantId: "tenant-1",
      contact: { id: "contact-1", name: "Vitor", phone_number: "5511999999999" },
      trigger: "manual",
      decision,
    });

    expect(results[0]).toEqual(expect.objectContaining({
      type: "mark_ready_for_closing",
      status: "skipped",
      detail: "Acao aguardando aprovacao humana.",
    }));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "system_event_logs",
        payload: expect.objectContaining({
          payload: expect.objectContaining({
            action: expect.objectContaining({ type: "mark_ready_for_closing" }),
            result: expect.objectContaining({ status: "skipped" }),
          }),
        }),
      }),
    ]));
  });
});
