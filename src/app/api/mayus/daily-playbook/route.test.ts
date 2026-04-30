import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getTenantSessionMock,
  fromMock,
  inserts,
  deleteEqMock,
} = vi.hoisted(() => ({
  getTenantSessionMock: vi.fn(),
  fromMock: vi.fn(),
  inserts: [] as Array<{ table: string; payload: any }>,
  deleteEqMock: vi.fn(),
}));

function insertChain(table: string, payload: any) {
  inserts.push({ table, payload });
  const ids: Record<string, string> = {
    brain_tasks: "task-1",
    brain_runs: "run-1",
    brain_steps: "step-1",
    brain_artifacts: "artifact-1",
  };

  if (table === "system_event_logs" || table === "learning_events") {
    return Promise.resolve({ error: null });
  }

  return {
    select: vi.fn(() => ({
      single: vi.fn(async () => ({ data: { id: ids[table] }, error: null })),
    })),
  };
}

function queryChain(data: any[] | object | null = [], error: any = null) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve({ data, error })),
    maybeSingle: vi.fn(() => Promise.resolve({ data, error })),
    then: (resolve: any) => Promise.resolve({ data, error }).then(resolve),
  };
  return chain;
}

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: getTenantSessionMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: fromMock,
  },
}));

import { GET, POST } from "./route";

function buildPostRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/mayus/daily-playbook", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("mayus daily playbook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inserts.length = 0;
    getTenantSessionMock.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    deleteEqMock.mockResolvedValue({ error: null });
    fromMock.mockImplementation((table: string) => {
      if (table === "tenant_settings") {
        return queryChain({
          ai_features: {
            firm_name: "Dutra Advocacia",
            daily_playbook: {
              enabled: true,
              deliveryTime: "07:30",
              channels: ["whatsapp", "mayus_panel"],
              scope: "full",
              detailLevel: "standard",
            },
          },
        });
      }

      if (table === "crm_pipelines") {
        return queryChain([{ id: "pipeline-1" }]);
      }

      if (table === "crm_stages") {
        return queryChain([{ id: "stage-1", name: "Novo Lead", is_win: false, is_loss: false }]);
      }

      if (table === "crm_tasks") {
        return queryChain([{
          id: "crm-1",
          title: "Maria Previdenciario",
          description: "Lead pediu ajuda com aposentadoria rural.",
          tags: [],
          sector: "Previdenciario",
          stage_id: "stage-1",
          phone: "21999990000",
          created_at: "2026-04-29T10:00:00.000Z",
          data_ultima_movimentacao: null,
        }]);
      }

      if (table === "user_tasks") {
        return queryChain([{
          id: "task-1",
          title: "Prazo critico INSS",
          description: "Prazo de recurso",
          urgency: "URGENTE",
          status: "Pendente",
          scheduled_for: "2026-04-30T13:00:00.000Z",
          assigned_name_snapshot: "Equipe Juridica",
          client_name: "Maria",
          type: "Prazo",
        }]);
      }

      if (table === "brain_artifacts") {
        return {
          insert: (payload: any) => insertChain(table, payload),
          select: vi.fn(() => ({
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn(async () => ({
              data: [{
                id: "artifact-1",
                title: "Dutra Advocacia - Playbook do dia",
                metadata: { summary: "Resumo", delivery_time: "07:30", channels: ["whatsapp"], external_side_effects_blocked: true },
                created_at: "2026-04-30T10:00:00.000Z",
              }],
              error: null,
            })),
          })),
        };
      }

      if (table === "brain_tasks") {
        return {
          insert: (payload: any) => insertChain(table, payload),
          delete: vi.fn(() => ({ eq: deleteEqMock })),
        };
      }

      return {
        insert: (payload: any) => insertChain(table, payload),
      };
    });
  });

  it("rejeita requisicao sem autenticacao", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const response = await POST(buildPostRequest({}));
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({ error: "Nao autenticado." });
  });

  it("gera e persiste playbook diario com artifact e evento", async () => {
    const response = await POST(buildPostRequest({
      preferences: { deliveryTime: "08:15", channels: ["whatsapp", "mayus_panel"] },
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.playbook.title).toBe("Dutra Advocacia - Playbook do dia");
    expect(json.playbook.metrics.crmLeadsNeedingNextStep).toBe(1);
    expect(json.metadata.persistence).toBe("brain_artifact_and_system_event_logs");
    expect(inserts.some((item) => item.table === "system_event_logs" && item.payload.event_name === "daily_playbook_prepared")).toBe(true);
    expect(inserts.some((item) => item.table === "brain_artifacts" && item.payload.artifact_type === "daily_playbook")).toBe(true);
    expect(inserts.some((item) => item.table === "learning_events" && item.payload.event_type === "daily_playbook_created")).toBe(true);
    expect(JSON.stringify(inserts)).not.toContain("21999990000");
  });

  it("permite gerar sem persistir", async () => {
    const response = await POST(buildPostRequest({ persist: false }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.metadata.persistence).toBe("not_requested");
    expect(inserts).toHaveLength(0);
  });

  it("lista historico recente dos playbooks", async () => {
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.history[0]).toMatchObject({
      id: "artifact-1",
      title: "Dutra Advocacia - Playbook do dia",
      externalSideEffectsBlocked: true,
    });
  });
});
