import { describe, expect, it, vi } from "vitest";
import {
  buildEscavadorBudgetBlockedPayload,
  evaluateEscavadorBudget,
  registerEscavadorBudgetEvent,
} from "./escavador-budget";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

function makeThenableRows(rows: Array<Record<string, unknown>>) {
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.gte = vi.fn(() => query);
  query.ilike = vi.fn(() => query);
  query.then = (resolve: any, reject: any) => Promise.resolve({ data: rows, error: null }).then(resolve, reject);
  return query;
}

function makeTenantSettingsQuery(policy: Record<string, unknown>) {
  const query: Record<string, any> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({
    data: {
      ai_features: {
        escavador_budget_policy: policy,
      },
    },
    error: null,
  }));
  return query;
}

describe("escavador budget", () => {
  it("converte Creditos-Utilizados em custo de budget e expõe Monitoring/Finance", async () => {
    const client = {
      from: vi.fn((table: string) => {
        if (table === "tenant_settings") {
          return makeTenantSettingsQuery({
            enabled: true,
            monthly_limit_cents: 500,
            credit_cost_cents: 125,
            warn_at_ratio: 0.8,
            hard_stop: true,
          });
        }
        if (table === "api_usage_log") {
          return makeThenableRows([
            { creditos: 2 },
            { creditos: "3" },
          ]);
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    const check = await evaluateEscavadorBudget({
      tenantId: "tenant-1",
      estimatedCostCents: 100,
      client,
    });
    const payload = buildEscavadorBudgetBlockedPayload(check);

    expect(check.spentCredits).toBe(5);
    expect(check.spentCostCents).toBe(625);
    expect(check.decision.projectedCents).toBe(725);
    expect(check.allowed).toBe(false);
    expect(payload.budget).toEqual(expect.objectContaining({
      spent_credits: 5,
      spent_cost_cents: 625,
      credit_cost_cents: 125,
    }));
    expect(payload.agent_control).toEqual(expect.objectContaining({
      primary_agent_id: "monitoring_agent",
      billing_agent_id: "finance_agent",
      approval_required: true,
      paid_external_action: true,
    }));
  });

  it("registra evento sem executar busca paga e com agentes responsaveis", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === "system_event_logs") return { insert };
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    await registerEscavadorBudgetEvent({
      tenantId: "tenant-1",
      userId: "user-1",
      action: "escavador_paid_search",
      source: "monitoramento_import",
      status: "blocked",
      estimatedCostCents: 100,
      decision: {
        status: "blocked",
        projectedCents: 725,
        remainingCents: 0,
        reasons: ["Escavador: custo projetado ultrapassa o limite aprovado."],
      },
      client,
    });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      event_name: "escavador_budget_blocked",
      status: "blocked",
      payload: expect.objectContaining({
        action: "escavador_paid_search",
        agent_control: expect.objectContaining({
          primary_agent_id: "monitoring_agent",
          billing_agent_id: "finance_agent",
          approval_required: true,
        }),
      }),
    }));
  });
});
