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
  const upserts: Array<{ table: string; payload: any }> = [];
  const updates: Array<{ table: string; payload: any }> = [];
  const uploads: Array<{ bucket: string; path: string; body: any; options: any }> = [];
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
    upsert: (payload: any) => {
      upserts.push({ table, payload });
      return Promise.resolve({ error: null });
    },
    update: (payload: any) => {
      updates.push({ table, payload });
      return { eq: async () => ({ error: null }) };
    },
  });

  return {
    inserts,
    upserts,
    updates,
    uploads,
    supabase: {
      from: (table: string) => makeQuery(table),
      storage: {
        getBucket: async () => ({ data: { name: "brain-artifacts" }, error: null }),
        from: (bucket: string) => ({
          upload: async (path: string, body: any, options: any) => {
            uploads.push({ bucket, path, body, options });
            return { data: { path }, error: null };
          },
          createSignedUrl: async (path: string) => ({
            data: { signedUrl: `https://storage.example.com/${path}?token=signed` },
            error: null,
          }),
        }),
      },
    },
  };
}

describe("whatsapp command runtime", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    integrationMock.listTenantIntegrationsResolved.mockReset();
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ sent: true, key: { id: "msg-1" } }), { status: 200 })) as any;
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
    expect(inserts.some((item) => item.table === "system_event_logs" && item.payload.event_type === "whatsapp_internal_command_blocked")).toBe(true);
  });

  it("gera artifact e envia resposta para comando autorizado", async () => {
    const { supabase, inserts, updates, uploads } = createSupabaseMock();
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
      content: "Mayus, CRM sem proximo passo",
      contactId: "contact-1",
      source: "evolution_webhook",
    });

    expect(result).toMatchObject({
      handled: true,
      sent: true,
      intent: "crm_next_steps",
      provider: "evolution",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.evolution.example/message/sendMedia/dutra",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("mayus-playbook-premium.html"),
      }),
    );
    expect(inserts.some((item) => item.table === "brain_artifacts" && item.payload.artifact_type === "daily_playbook")).toBe(true);
    expect(inserts.some((item) => item.table === "system_event_logs" && item.payload.event_type === "whatsapp_internal_command_processed")).toBe(true);
    expect(inserts.some((item) => item.table === "whatsapp_messages" && item.payload?.[0]?.direction === "outbound")).toBe(true);
    const outbound = inserts.find((item) => item.table === "whatsapp_messages" && item.payload?.[0]?.direction === "outbound")?.payload?.[0];
    expect(outbound.content).toContain("Playbook Premium gerado");
    expect(outbound.content).toContain("arquivo HTML em anexo");
    expect(outbound.message_type).toBe("document");
    expect(outbound.media_filename).toBe("mayus-playbook-premium.html");
    expect(outbound.media_mime_type).toBe("text/html");
    expect(outbound.media_url).toContain("https://storage.example.com/tenant-1/daily_playbook/brain-artifact-1.html");
    expect(outbound.content).not.toMatch(/\/playbook\/pb_[A-Za-z0-9_-]+/);
    expect(outbound.content).not.toContain("/dashboard/mayus/playbooks/");
    expect(outbound.content).not.toContain("Acoes prioritarias:\n1.");
    const artifactInsert = inserts.find((item) => item.table === "brain_artifacts" && item.payload.artifact_type === "daily_playbook");
    expect(artifactInsert?.payload.metadata.public_share_enabled).toBe(true);
    expect(artifactInsert?.payload.metadata.public_share_token).toMatch(/^pb_[A-Za-z0-9_-]+$/);
    expect(updates.some((item) => item.table === "brain_artifacts" && item.payload.metadata.html_file_available === true)).toBe(true);
    expect(uploads.some((item) => item.bucket === "brain-artifacts" && item.path === "tenant-1/daily_playbook/brain-artifact-1.html")).toBe(true);
    expect(JSON.stringify(inserts)).not.toContain("21999990000");
  });

  it("processa setup comercial autorizado e persiste office_playbook_profile", async () => {
    const { supabase, inserts, upserts } = createSupabaseMock();
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
      content: "Mayus, configurar vendas do escritorio",
      contactId: "contact-1",
      source: "evolution_webhook",
    });

    expect(result).toMatchObject({
      handled: true,
      sent: true,
      intent: "office_playbook_setup",
      provider: "evolution",
    });
    expect(upserts).toContainEqual(expect.objectContaining({
      table: "tenant_settings",
      payload: expect.objectContaining({
        tenant_id: "tenant-1",
        ai_features: expect.objectContaining({
          office_playbook_profile: expect.objectContaining({
            status: "needs_owner_input",
            setup_session: expect.objectContaining({
              active: true,
              current_step: "main_legal_areas",
            }),
          }),
        }),
      }),
    }));
    expect(inserts.some((item) => item.table === "brain_artifacts" && item.payload.artifact_type === "daily_playbook")).toBe(false);
    expect(inserts.some((item) => item.table === "system_event_logs" && item.payload.event_type === "whatsapp_internal_command_processed")).toBe(true);
    expect(inserts.some((item) => item.table === "whatsapp_messages" && item.payload?.[0]?.content?.includes("Primeira pergunta"))).toBe(true);
  });
});
