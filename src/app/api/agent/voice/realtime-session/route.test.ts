import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  fromMock,
  getBrainAuthContextMock,
  requireTenantApiKeyMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  getBrainAuthContextMock: vi.fn(),
  requireTenantApiKeyMock: vi.fn(),
}));

vi.mock("@/lib/brain/server", () => ({
  brainAdminSupabase: { from: fromMock },
  getBrainAuthContext: getBrainAuthContextMock,
}));

vi.mock("@/lib/integrations/server", () => ({
  requireTenantApiKey: requireTenantApiKeyMock,
}));

import { POST } from "./route";

function request(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost:3000/api/agent/voice/realtime-session", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function selectQuery(data: Record<string, unknown> | null) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return query;
}

describe("POST /api/agent/voice/realtime-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();

    getBrainAuthContextMock.mockResolvedValue({
      ok: true,
      context: {
        userId: "user-1",
        tenantId: "tenant-1",
        userRole: "Administrador",
      },
    });
    requireTenantApiKeyMock.mockResolvedValue({ apiKey: "openai-key" });
    fromMock.mockImplementation((table: string) => {
      if (table === "profiles") return selectQuery({ full_name: "Vitor" });
      if (table === "tenants") return selectQuery({ name: "Dutra Advocacia" });
      throw new Error(`unexpected table ${table}`);
    });
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({
      value: "ek-test",
      expires_at: "2026-05-11T20:00:00.000Z",
    }), { status: 200 }) as any);
  });

  it("cria segredo efemero com persona, voz e ferramenta do MAYUS", async () => {
    const response = await POST(request({ voice: "marin" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      client_secret: "ek-test",
      model: "gpt-realtime-2",
      voice: "marin",
    });
    expect(requireTenantApiKeyMock).toHaveBeenCalledWith("tenant-1", "openai");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/realtime/client_secrets",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer openai-key",
          "OpenAI-Safety-Identifier": expect.any(String),
        }),
      })
    );
    const body = JSON.parse(String(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body));
    expect(body.session.audio.output.voice).toBe("marin");
    expect(body.session.instructions).toContain("Dutra Advocacia");
    expect(body.session.tools.map((tool: any) => tool.name)).toEqual([
      "consultar_cerebro_mayus",
      "criar_tarefa_mayus",
      "pesquisar_web_mayus",
      "responder_sobre_mayus",
    ]);
  });

  it("bloqueia usuario sem role executiva", async () => {
    getBrainAuthContextMock.mockResolvedValueOnce({
      ok: true,
      context: {
        userId: "user-1",
        tenantId: "tenant-1",
        userRole: "Advogado",
      },
    });

    const response = await POST(request({ voice: "cedar" }));

    expect(response.status).toBe(403);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("usa cedar quando a voz solicitada nao e realtime", async () => {
    const response = await POST(request({ voice: "onyx" }));
    const json = await response.json();
    const body = JSON.parse(String(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body));

    expect(response.status).toBe(200);
    expect(json.voice).toBe("cedar");
    expect(body.session.audio.output.voice).toBe("cedar");
  });

  it("retorna 400 sem chave OpenAI configurada", async () => {
    requireTenantApiKeyMock.mockResolvedValueOnce({ apiKey: null });

    const response = await POST(request({ voice: "cedar" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "OpenAI API Key nao configurada." });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
