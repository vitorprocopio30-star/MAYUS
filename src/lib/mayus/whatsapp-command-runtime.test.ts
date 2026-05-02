import { beforeEach, describe, expect, it, vi } from "vitest";

import { handleWhatsAppInternalCommand } from "./whatsapp-command-runtime";

const integrationMock = vi.hoisted(() => ({
  listTenantIntegrationsResolved: vi.fn(),
}));

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsResolved: integrationMock.listTenantIntegrationsResolved,
}));

function createSupabaseMock() {
  const inserts: Array<{ table: string; payload: any }> = [];
  const ids: Record<string, string> = {
    brain_tasks: "brain-task-1",
    brain_runs: "brain-run-1",
    brain_steps: "brain-step-1",
    brain_artifacts: "brain-artifact-1",
  };

  const rows: Record<string, any> = {
    tenant_settings: {
      ai_features: {
        firm_name: "Dutra Advocacia",
        daily_playbook: {
          enabled: true,
          deliveryTime: "07:00",
          channels: ["whatsapp", "mayus_panel"],
          authorizedPhones: ["21999990000"],
        },
      },
    },
    crm_tasks: [
      {
        id: "crm-1",
        title: "Maria Previdenciario",
        description: "Lead pediu ajuda com aposentadoria rural.",
        sector: "Previdenciario",
        created_at: "2026-04-29T10:00:00.000Z",
        is_win: false,
        is_loss: false,
        responsavel_nome: "Dutra",
        crm_stages: { name: "Novo lead" },
        crm_contacts: { phone: "21999990000" },
      },
    ],
    user_tasks: [
      {
        id: "task-1",
        title: "Prazo critico INSS",
        urgency: "URGENTE",
        status: "pending",
        scheduled_for: "2026-04-30T13:00:00.000Z",
        assigned_name_snapshot: "Equipe Juridica",
      },
    ],
  };

  const makeQuery = (table: string): any => ({
    select: () => makeQuery(table),
    eq: () => makeQuery(table),
    in: () => makeQuery(table),
    order: () => makeQuery(table),
    limit: async () => ({ data: rows[table] || [], error: null }),
    single: async () => ({ data: rows[table] || null, error: null }),
    insert: (payload: any) => {
      inserts.push({ table, payload });

      if (ids[table]) {
        return {
          select: () => ({
            single: async () => ({ data: { id: ids[table] }, error: null }),
          }),
        };
      }

      return Promise.resolve({ data: null, error: null });
    },
  });

  return {
    inserts,
    supabase: {
      from: (table: string) => makeQuery(table),
    },
  };
}

describe("whatsapp command runtime", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    integrationMock.listTenantIntegrationsResolved.mockReset();
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sent: true }),
    })) as any;
  });

  it("bloqueia comando interno de telefone nao autorizado sem enviar resposta", async () => {
    const { supabase, inserts } = createSupabaseMock();

    const result = await handleWhatsAppInternalCommand({
      supabase,
      tenantId: "tenant-1",
      senderPhone: "21988880000",
      content: "Mayus, relatorio do escritorio",
      contactId: "contact-1",
      source: "meta_webhook",
    });

    expect(result).toMatchObject({
      handled: false,
      sent: false,
      reason: "not_authorized",
      intent: "daily_playbook",
    });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(integrationMock.listTenantIntegrationsResolved).not.toHaveBeenCalled();
    expect(inserts.some((item) => item.table === "system_event_logs" && item.payload.event_name === "whatsapp_internal_command_blocked" && item.payload.status === "warning")).toBe(true);
  });

  it("gera artifact com link publico e envia resposta para comando autorizado", async () => {
    const { supabase, inserts } = createSupabaseMock();
    integrationMock.listTenantIntegrationsResolved.mockResolvedValue([
      {
        provider: "evolution",
        api_key: "evo-key",
        instance_name: "https://api.evolution.example|dutra",
      },
    ]);

    const result = await handleWhatsAppInternalCommand({
      supabase,
      tenantId: "tenant-1",
      senderPhone: "5521999990000@s.whatsapp.net",
      content: "Mayus, relatorio do escritorio",
      contactId: "contact-1",
      source: "evolution_webhook",
    });

    expect(result).toMatchObject({
      handled: true,
      sent: true,
      intent: "daily_playbook",
      provider: "evolution",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.evolution.example/message/sendText/dutra",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(String((global.fetch as any).mock.calls[0][1].body)).toContain("https://mayus-premium-pro.vercel.app/r/playbook/");

    const artifactInsert = inserts.find((item) => item.table === "brain_artifacts" && item.payload.artifact_type === "daily_playbook");
    expect(artifactInsert?.payload.metadata.html_report_url).toContain("https://mayus-premium-pro.vercel.app/r/playbook/");
    expect(inserts.some((item) => item.table === "system_event_logs" && item.payload.event_name === "whatsapp_internal_command_processed" && item.payload.status === "ok")).toBe(true);
    expect(inserts.some((item) => item.table === "whatsapp_messages" && item.payload?.[0]?.direction === "outbound")).toBe(true);
    expect(JSON.stringify(inserts)).not.toContain("21999990000");
  });
});
