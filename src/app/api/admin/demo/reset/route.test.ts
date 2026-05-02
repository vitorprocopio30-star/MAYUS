import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserMock,
  isSuperadminMock,
  resetDemoTenantMock,
} = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  isSuperadminMock: vi.fn(),
  resetDemoTenantMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    auth: {
      getUser: getUserMock,
    },
  },
}));

vi.mock("@/lib/auth/is-superadmin", () => ({
  isSuperadmin: isSuperadminMock,
}));

vi.mock("@/lib/demo/demo-tenant-reset", () => ({
  DEMO_RESET_CONFIRMATION: "RESET_DEMO",
  resetDemoTenant: resetDemoTenantMock,
}));

import { POST } from "./route";

function buildRequest(body: unknown, token = "token-1") {
  return new NextRequest("http://localhost:3000/api/admin/demo/reset", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/demo/reset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({
      data: { user: { id: "superadmin-1" } },
      error: null,
    });
    isSuperadminMock.mockResolvedValue(true);
    resetDemoTenantMock.mockResolvedValue({
      dryRun: true,
      tenantId: "tenant-demo",
      tenantName: "MAYUS Demo",
      preview: { totalCases: 100, heroCases: 12, volumeCases: 88 },
    });
  });

  it("exige autenticacao bearer", async () => {
    const request = new NextRequest("http://localhost:3000/api/admin/demo/reset", {
      method: "POST",
      body: JSON.stringify({ tenantId: "tenant-demo" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Nao autenticado." });
  });

  it("bloqueia usuario que nao e superadmin", async () => {
    isSuperadminMock.mockResolvedValueOnce(false);

    const response = await POST(buildRequest({ tenantId: "tenant-demo" }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Acesso negado." });
  });

  it("faz dry-run por padrao sem exigir confirmacao", async () => {
    const response = await POST(buildRequest({ tenantId: "tenant-demo" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(resetDemoTenantMock).toHaveBeenCalledWith({
      tenantId: "tenant-demo",
      actorUserId: "superadmin-1",
      dryRun: true,
    });
  });

  it("exige confirmacao textual para reset real", async () => {
    const response = await POST(buildRequest({ tenantId: "tenant-demo", dryRun: false }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Confirmacao obrigatoria para reset real. Envie confirm="RESET_DEMO".',
    });
    expect(resetDemoTenantMock).not.toHaveBeenCalled();
  });

  it("executa reset real apenas com confirmacao", async () => {
    const response = await POST(buildRequest({
      tenantId: "tenant-demo",
      dryRun: false,
      confirm: "RESET_DEMO",
    }));

    expect(response.status).toBe(200);
    expect(resetDemoTenantMock).toHaveBeenCalledWith({
      tenantId: "tenant-demo",
      actorUserId: "superadmin-1",
      dryRun: false,
    });
  });
});
