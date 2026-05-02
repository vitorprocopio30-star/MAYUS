import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createServerClientMock,
  cookiesMock,
  getUserMock,
  fromMock,
  messageInserts,
  contactUpdates,
  eventInserts,
} = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  cookiesMock: vi.fn(),
  getUserMock: vi.fn(),
  fromMock: vi.fn(),
  messageInserts: [] as any[],
  contactUpdates: [] as any[],
  eventInserts: [] as any[],
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: fromMock,
  },
}));

import { DEMO_SEED_TAG } from "@/lib/demo/demo-oab-flow";
import { POST } from "./route";

function buildRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/whatsapp/execute-reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function selectQuery(result: { data: any; error: any }) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result),
  };
  return query;
}

function updateQuery(table: string) {
  const query: any = {
    eq: vi.fn(() => query),
    then: (resolve: any) => Promise.resolve({ error: null }).then(resolve),
  };
  return (payload: any) => {
    contactUpdates.push({ table, payload });
    return query;
  };
}

function configureDb(options?: {
  contact?: any;
  latestDraft?: any;
}) {
  const contact = options?.contact ?? {
    id: "contact-demo-1",
    tenant_id: "tenant-1",
    phone_number: "5511999999999",
    name: "Maria Demo",
    lead_tags: [DEMO_SEED_TAG, "Novo lead"],
    unread_count: 2,
  };

  const latestDraft = options?.latestDraft ?? null;

  fromMock.mockImplementation((table: string) => {
    if (table === "profiles") {
      return selectQuery({
        data: { tenant_id: "tenant-1", full_name: "Admin Demo" },
        error: null,
      });
    }

    if (table === "whatsapp_contacts") {
      return {
        select: vi.fn(() => selectQuery({ data: contact, error: null })),
        update: vi.fn(updateQuery(table)),
      };
    }

    if (table === "whatsapp_messages") {
      return {
        insert: vi.fn((rows: any[]) => {
          messageInserts.push(...rows);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: "message-demo-1", ...rows[0] },
                error: null,
              })),
            })),
          };
        }),
      };
    }

    if (table === "system_event_logs") {
      const query = selectQuery({
        data: latestDraft,
        error: null,
      });
      query.insert = vi.fn(async (payload: any) => {
        eventInserts.push(payload);
        return { error: null };
      });
      return query;
    }

    throw new Error(`unexpected table ${table}`);
  });
}

describe("POST /api/whatsapp/execute-reply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageInserts.length = 0;
    contactUpdates.length = 0;
    eventInserts.length = 0;
    cookiesMock.mockResolvedValue({ getAll: () => [], set: vi.fn() });
    createServerClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    configureDb();
  });

  it("exige usuario autenticado", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: null });

    const response = await POST(buildRequest({ contact_id: "contact-demo-1", text: "Oi" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Nao autorizado." });
  });

  it("executa resposta demo, registra mensagem simulada e audita evento", async () => {
    const response = await POST(buildRequest({
      contact_id: "contact-demo-1",
      text: "Oi, Maria. O MAYUS organizou seu atendimento demo.",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual(expect.objectContaining({
      success: true,
      demo: true,
      simulated: true,
    }));
    expect(messageInserts).toEqual([
      expect.objectContaining({
        tenant_id: "tenant-1",
        contact_id: "contact-demo-1",
        direction: "outbound",
        content: "Oi, Maria. O MAYUS organizou seu atendimento demo.",
        metadata: expect.objectContaining({
          demo_seed: DEMO_SEED_TAG,
          simulated: true,
          external_side_effects_blocked: true,
        }),
      }),
    ]);
    expect(contactUpdates).toEqual([
      expect.objectContaining({
        table: "whatsapp_contacts",
        payload: expect.objectContaining({ unread_count: 0 }),
      }),
    ]);
    expect(eventInserts).toEqual([
      expect.objectContaining({
        tenant_id: "tenant-1",
        event_name: "whatsapp_demo_reply_executed",
        payload: expect.objectContaining({
          contact_id: "contact-demo-1",
          demo_seed: DEMO_SEED_TAG,
          simulated: true,
        }),
      }),
    ]);
  });

  it("usa o ultimo rascunho MAYUS quando nenhum texto e enviado", async () => {
    configureDb({
      latestDraft: {
        id: "event-1",
        created_at: "2026-05-02T12:00:00.000Z",
        payload: { suggested_reply: "Resposta preparada pelo MAYUS." },
      },
    });

    const response = await POST(buildRequest({ contact_id: "contact-demo-1" }));

    expect(response.status).toBe(200);
    expect(messageInserts[0]).toEqual(expect.objectContaining({
      content: "Resposta preparada pelo MAYUS.",
      metadata: expect.objectContaining({ latest_draft_event_id: "event-1" }),
    }));
  });

  it("bloqueia execucao automatica para contato real", async () => {
    configureDb({
      contact: {
        id: "contact-real-1",
        tenant_id: "tenant-1",
        phone_number: "5511988887777",
        name: "Cliente Real",
        lead_tags: ["Novo lead"],
      },
    });

    const response = await POST(buildRequest({ contact_id: "contact-real-1", text: "Oi" }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json).toEqual(expect.objectContaining({
      requires_human_send: true,
    }));
    expect(messageInserts).toHaveLength(0);
    expect(eventInserts).toHaveLength(0);
  });
});
