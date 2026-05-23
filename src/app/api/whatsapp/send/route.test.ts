import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const admin: any = { from: vi.fn() };
  return {
    admin,
    createClient: vi.fn(() => admin),
    createServerClient: vi.fn(),
    listTenantIntegrationsResolved: vi.fn(),
    getUser: vi.fn(),
    messageInserts: [] as unknown[],
    learningEventInserts: [] as unknown[],
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: vi.fn(() => []), set: vi.fn() })),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsResolved: mocks.listTenantIntegrationsResolved,
}));

function buildRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/whatsapp/send", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function querySingle(data: unknown, error: unknown = null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data, error })) })),
        maybeSingle: vi.fn(async () => ({ data, error })),
      })),
    })),
  };
}

describe("/api/whatsapp/send", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.messageInserts.length = 0;
    mocks.learningEventInserts.length = 0;
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.listTenantIntegrationsResolved.mockResolvedValue([
      {
        provider: "evolution",
        api_key: "evolution-key",
        instance_name: "http://187.77.240.109:32768|mayus-dutra",
      },
    ]);
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ key: { id: "evo-msg-1" } }), { status: 200 })) as any;
    mocks.admin.from.mockImplementation((table: string) => {
      if (table === "profiles") return querySingle({ tenant_id: "tenant-1" });
      if (table === "whatsapp_contacts") return querySingle({ id: "contact-1", phone_number: "5521999990000@s.whatsapp.net" });
      if (table === "whatsapp_messages") {
        return {
          insert: vi.fn(async (rows: unknown[]) => {
            mocks.messageInserts.push(...rows);
            return { error: null };
          }),
        };
      }
      if (table === "learning_events") {
        return {
          insert: vi.fn(async (payload: unknown) => {
            mocks.learningEventInserts.push(payload);
            return { error: null };
          }),
        };
      }

      return {};
    });
  });

  it("envia pela Evolution usando tenant da sessao e telefone do contato", async () => {
    const { POST } = await import("./route");
    const response = await POST(buildRequest({
      tenant_id: "tenant-malicioso",
      contact_id: "contact-1",
      phone_number: "+55 (11) 11111-1111",
      text: "Mensagem teste MAYUS",
    }));

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.motor).toBe("evolution");
    expect(mocks.listTenantIntegrationsResolved).toHaveBeenCalledWith("tenant-1", ["meta_cloud", "evolution"]);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://187.77.240.109:32768/message/sendText/mayus-dutra",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "evolution-key" }),
        body: JSON.stringify({ number: "5521999990000", text: "Mensagem teste MAYUS" }),
      }),
    );
    expect(mocks.messageInserts).toEqual([
      expect.objectContaining({
        tenant_id: "tenant-1",
        contact_id: "contact-1",
        direction: "outbound",
        content: "Mensagem teste MAYUS",
        status: "sent",
      }),
    ]);
    expect(mocks.learningEventInserts).toHaveLength(0);
  });

  it("registra delta humano sanitizado quando o envio manual parte de rascunho MAYUS", async () => {
    const { POST } = await import("./route");
    const response = await POST(buildRequest({
      contact_id: "contact-1",
      text: "*Equipe MAYUS*\n\nMensagem final humana mais objetiva sobre valor e proximo passo.",
      mayus_draft_context: {
        suggested_reply: "Texto sugerido completo do MAYUS sobre valor, contrato e diagnostico inicial.",
        reply_source: "operating_partner",
        model_used: "deepseek/deepseek-v4-pro",
        mode: "human_review_required",
        intent: "sales_objection",
        risk_flags: ["billing_or_contract"],
        may_auto_send: false,
        requires_human_review: true,
        conversation_state: {
          stage: "objection",
          conversation_role: "sales",
        },
        support_summary: {
          issue_type: "none",
        },
      },
    }));

    expect(response.status).toBe(200);
    expect(mocks.learningEventInserts).toHaveLength(1);
    expect(mocks.learningEventInserts[0]).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      event_type: "whatsapp_human_reply_delta_recorded",
      source_module: "whatsapp_manual_send",
      created_by: "user-1",
      payload: expect.objectContaining({
        contact_id: "contact-1",
        reply_source: "operating_partner",
        model_used: "deepseek/deepseek-v4-pro",
        intent: "sales_objection",
        conversation_stage: "objection",
        risk_flags: ["billing_or_contract"],
        requires_human_review: true,
        edit_categories: expect.arrayContaining(["human_edited", "objection_handled", "risk_reviewed"]),
        suggested_char_count: expect.any(Number),
        sent_char_count: expect.any(Number),
        token_similarity: expect.any(Number),
      }),
    }));
    const serialized = JSON.stringify(mocks.learningEventInserts[0]);
    expect(serialized).not.toContain("Texto sugerido completo");
    expect(serialized).not.toContain("Mensagem final humana");
    expect(serialized).not.toContain("Equipe MAYUS");
  });

  it("bloqueia usuario sem sessao", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await import("./route");

    const response = await POST(buildRequest({ contact_id: "contact-1", text: "Oi" }));

    expect(response.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("bloqueia contato fora do tenant autenticado", async () => {
    mocks.admin.from.mockImplementation((table: string) => {
      if (table === "profiles") return querySingle({ tenant_id: "tenant-1" });
      if (table === "whatsapp_contacts") return querySingle(null);
      return { insert: vi.fn(async () => ({ error: null })) };
    });
    const { POST } = await import("./route");

    const response = await POST(buildRequest({ contact_id: "contact-2", text: "Oi" }));

    expect(response.status).toBe(404);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
