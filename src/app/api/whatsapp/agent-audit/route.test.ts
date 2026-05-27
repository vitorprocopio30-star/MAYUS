import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const admin: any = { from: vi.fn() };
  return {
    admin,
    createClient: vi.fn(() => admin),
    createServerClient: vi.fn(),
    getUser: vi.fn(),
    processMedia: vi.fn(),
    processReplies: vi.fn(),
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

vi.mock("@/lib/whatsapp/media-processor", () => ({
  processPendingWhatsAppMediaBatch: mocks.processMedia,
}));

vi.mock("@/lib/whatsapp/reply-processor", () => ({
  processPendingWhatsAppRepliesBatch: mocks.processReplies,
}));

function buildRequest(search = "", init?: { method?: string; body?: unknown }) {
  return new NextRequest(`http://localhost:3000/api/whatsapp/agent-audit${search}`, {
    method: init?.method || "GET",
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
}

function profileQuery(data: unknown, error: unknown = null) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data, error })),
      })),
    })),
  };
}

function eventsQuery(data: unknown, error: unknown = null) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({ data, error })),
  };
  return query;
}

function messagesQuery(data: unknown, error: unknown = null) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(async () => ({ data, error })),
  };
  return query;
}

describe("/api/whatsapp/agent-audit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.createServerClient.mockReturnValue({ auth: { getUser: mocks.getUser } });
    mocks.processMedia.mockResolvedValue({ picked: 0, processed: 0, unsupported: 0, failed: 0, replies_prepared: 0, results: [] });
    mocks.processReplies.mockResolvedValue({ picked: 0, processed: 0, failed: 0, skipped: 0, auto_sent: 0, results: [] });
    mocks.admin.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return profileQuery({ id: "user-1", tenant_id: "tenant-1", role: "Administrador" });
      }
      if (table === "system_event_logs") {
        return eventsQuery([
          {
            id: "event-prepared",
            event_name: "whatsapp_sales_reply_prepared",
            status: "ok",
            source: "whatsapp",
            provider: "mayus",
            created_at: "2026-05-25T12:00:00.000Z",
            payload: {
              contact_id: "contact-1",
              brain_run_id: "run-1",
              skill: "support_case_status",
              route: "process_status",
              actor_context: { role: "office_operator", reason: "authorized_phone" },
              conversation_resolution: {
                type: "referenced_process",
                quality_status: "pass",
                final_response_source: "llm_repaired",
              },
              quality_check: { status: "pass", flags: [] },
              final_response_source: "llm_repaired",
              mode: "suggested_reply",
              may_auto_send: true,
              reply_text: "No processo do Bradesco, a ultima movimentacao registrada foi aguardando andamento do juizo.",
            },
          },
          {
            id: "event-repaired",
            event_name: "mayus_operating_partner_reply_repaired",
            status: "ok",
            source: "whatsapp",
            provider: "mayus",
            created_at: "2026-05-25T12:00:01.000Z",
            payload: {
              original_risk_flags: ["scripted_process_followup_question"],
              repaired_risk_flags: [],
              original_reply_preview: "Voce quer consultar andamento ou desconto/valores?",
              repaired_reply_preview: "No processo do Bradesco, a ultima movimentacao registrada foi aguardando andamento do juizo.",
              final_reply_preview: "No processo do Bradesco, a ultima movimentacao registrada foi aguardando andamento do juizo.",
              final_response_source: "llm_repaired",
            },
          },
          {
            id: "event-blocked",
            event_name: "whatsapp_reply_aborted_by_newer_message",
            status: "warning",
            source: "whatsapp",
            provider: "mayus",
            created_at: "2026-05-25T12:00:02.000Z",
            payload: {
              contact_id: "contact-2",
              reason: "newer_message_arrived_during_generation",
              reply_aborted_reason: "newer_message_arrived_during_generation",
              mode: "human_review_required",
              final_response_source: "safe_fallback",
            },
          },
        ]);
      }
      if (table === "whatsapp_messages") {
        return messagesQuery([
          {
            id: "msg-inbound",
            direction: "inbound",
            message_type: "text",
            status: "received",
            media_processing_status: null,
            created_at: "2026-05-25T11:59:00.000Z",
            metadata: {
              reply_processing_status: "pending",
              conversation_classification: { class: "process_status" },
              model_used: "openai/gpt-5.4-nano",
              final_response_source: "llm_repaired",
              brain_run_id: "run-1",
              agentic_governance: {
                openclaw_policy: { reason: "status verificado antes de responder" },
              },
            },
          },
          {
            id: "msg-outbound",
            direction: "outbound",
            message_type: "text",
            status: "sent",
            media_processing_status: null,
            created_at: "2026-05-25T12:01:00.000Z",
            metadata: {},
          },
        ]);
      }
      return {};
    });
  });

  it("retorna auditoria sanitizada para executivo do tenant", async () => {
    const { GET } = await import("./route");

    const response = await GET(buildRequest("?limit=12"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.metrics).toEqual(expect.objectContaining({
      total: 3,
      repaired: 2,
      llm_repaired: 2,
      safe_fallback: 1,
      warnings: 1,
      blocked: 1,
    }));
    expect(body.health).toEqual(expect.objectContaining({
      status: "needs_attention",
      label: "WhatsApp Operating Partner",
      queue: expect.objectContaining({
        pending_replies: 1,
        recent_messages: 2,
      }),
      latest: expect.objectContaining({
        conversation_class: "process_status",
        model_used: "openai/gpt-5.4-nano",
        brain_run_id: "run-1",
      }),
      governance: expect.objectContaining({
        sensitive_actions: "human_approval_required",
      }),
    }));
    expect(body.entries[0]).toEqual(expect.objectContaining({
      id: "event-prepared",
      contact_id: "contact-1",
      brain_run_id: "run-1",
      skill: "support_case_status",
      actor_role: "office_operator",
      conversation_type: "referenced_process",
      quality_status: "pass",
      final_response_source: "llm_repaired",
      final_reply_preview: expect.stringContaining("processo do Bradesco"),
    }));
    expect(body.entries[1]).toEqual(expect.objectContaining({
      repaired: true,
      original_reply_preview: expect.stringContaining("andamento ou desconto"),
      final_reply_preview: expect.stringContaining("processo do Bradesco"),
      quality_flags: expect.arrayContaining(["scripted_process_followup_question"]),
    }));
  });

  it("bloqueia perfil que nao e executivo", async () => {
    mocks.admin.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return profileQuery({ id: "user-1", tenant_id: "tenant-1", role: "Advogado" });
      }
      return eventsQuery([]);
    });
    const { GET } = await import("./route");

    const response = await GET(buildRequest());

    expect(response.status).toBe(403);
  });

  it("processa pendencias do tenant para executivo", async () => {
    const { POST } = await import("./route");

    const response = await POST(buildRequest("", {
      method: "POST",
      body: { action: "process_pending", limit: 7 },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.action).toBe("process_pending");
    expect(mocks.processMedia).toHaveBeenCalledWith(expect.objectContaining({
      supabase: mocks.admin,
      limit: 7,
      tenantId: "tenant-1",
    }));
    expect(mocks.processReplies).toHaveBeenCalledWith(expect.objectContaining({
      supabase: mocks.admin,
      limit: 7,
      tenantId: "tenant-1",
    }));
    expect(body.health.queue.pending_replies).toBe(1);
  });

  it("bloqueia usuario sem sessao", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { GET } = await import("./route");

    const response = await GET(buildRequest());

    expect(response.status).toBe(401);
  });
});
