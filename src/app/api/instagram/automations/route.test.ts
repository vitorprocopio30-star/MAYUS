import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTenantSessionMock, fromMock } = vi.hoisted(() => ({
  getTenantSessionMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: getTenantSessionMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: fromMock },
}));

import { GET, POST } from "./route";
import { DELETE } from "./[id]/route";

function queryChain(result: { data?: any; error?: any } = {}) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(async () => ({ data: result.data ?? [], error: result.error ?? null })),
    upsert: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    single: vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null })),
    then: (resolve: any) => Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve),
  };
  return chain;
}

function buildRequest(body?: unknown) {
  return new NextRequest("http://localhost:3000/api/instagram/automations", {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("instagram automations API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantSessionMock.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
  });

  it("lista automacoes do tenant sem expor service role no client", async () => {
    fromMock.mockReturnValue(queryChain({
      data: [{ id: "auto-1", keyword: "mayus", response_text: "Te enviei", direct_message: "Aqui", file_url: "https://x.test/prompt", is_active: true }],
    }));

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(fromMock).toHaveBeenCalledWith("instagram_automations");
    expect(json.automations).toEqual([expect.objectContaining({ keyword: "mayus", file_url: "https://x.test/prompt" })]);
  });

  it("cria automacao normalizando palavra-chave", async () => {
    const chain = queryChain({
      data: { id: "auto-1", keyword: "mayus", response_text: "Te enviei", direct_message: "Aqui", file_url: "https://x.test/prompt", is_active: true },
    });
    fromMock.mockReturnValue(chain);

    const response = await POST(buildRequest({
      keyword: " MAYUS ",
      response_text: "Te enviei",
      direct_message: "Aqui",
      file_url: "https://x.test/prompt",
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      keyword: "mayus",
      file_url: "https://x.test/prompt",
    }), { onConflict: "tenant_id,keyword" });
    expect(json.automation).toEqual(expect.objectContaining({ id: "auto-1", keyword: "mayus" }));
  });

  it("remove automacao do tenant", async () => {
    const chain = queryChain({ data: null });
    fromMock.mockReturnValue(chain);

    const response = await DELETE(new NextRequest("http://localhost:3000/api/instagram/automations/auto-1"), {
      params: { id: "auto-1" },
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("tenant_id", "tenant-1");
    expect(chain.eq).toHaveBeenCalledWith("id", "auto-1");
    expect(json).toEqual({ ok: true });
  });
});
