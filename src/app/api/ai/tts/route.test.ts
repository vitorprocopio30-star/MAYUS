import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  adminFromMock,
  createClientMock,
  createServerClientMock,
  cookiesMock,
  getTenantIntegrationResolvedMock,
  getUserMock,
  requireTenantApiKeyMock,
} = vi.hoisted(() => {
  const localAdminFromMock = vi.fn();

  return {
    adminFromMock: localAdminFromMock,
    createClientMock: vi.fn(() => ({ from: localAdminFromMock })),
    createServerClientMock: vi.fn(),
    cookiesMock: vi.fn(),
    getTenantIntegrationResolvedMock: vi.fn(),
    getUserMock: vi.fn(),
    requireTenantApiKeyMock: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: createClientMock,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock,
}));

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

vi.mock("@/lib/integrations/server", () => ({
  getTenantIntegrationResolved: getTenantIntegrationResolvedMock,
  requireTenantApiKey: requireTenantApiKeyMock,
}));

import { GET } from "./route";

function buildRequest(query: string) {
  return new NextRequest(`http://localhost:3000/api/ai/tts${query}`);
}

function makeQuery(result: { data: any; error?: any }) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
  };
  return query;
}

function mockProfileAndSettings(params?: {
  tenantId?: string | null;
  aiFeatures?: Record<string, unknown> | null;
}) {
  const tenantId = params && "tenantId" in params ? params.tenantId : "tenant-1";
  const profileQuery = makeQuery({ data: { tenant_id: tenantId }, error: null });
  const settingsQuery = makeQuery({ data: { ai_features: params?.aiFeatures ?? {} }, error: null });

  adminFromMock.mockImplementation((table: string) => {
    if (table === "profiles") return profileQuery;
    if (table === "tenant_settings") return settingsQuery;
    throw new Error(`unexpected table ${table}`);
  });

  return { profileQuery, settingsQuery };
}

describe("GET /api/ai/tts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    global.fetch = vi.fn();

    createServerClientMock.mockReturnValue({ auth: { getUser: getUserMock } });
    cookiesMock.mockResolvedValue({ getAll: () => [], set: vi.fn() });
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mockProfileAndSettings();
  });

  it("retorna 400 sem texto", async () => {
    const response = await GET(buildRequest(""));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Texto não fornecido." });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("retorna 401 sem usuario autenticado", async () => {
    getUserMock.mockResolvedValueOnce({ data: { user: null }, error: new Error("no session") });

    const response = await GET(buildRequest("?text=ola"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Não autorizado." });
  });

  it("retorna 403 sem tenant no perfil", async () => {
    mockProfileAndSettings({ tenantId: null });

    const response = await GET(buildRequest("?text=ola"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Tenant isolado não encontrado." });
  });

  it("gera audio OpenAI usando api key resolvida via Vault", async () => {
    requireTenantApiKeyMock.mockResolvedValueOnce({ apiKey: "openai-key" });
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("audio", { status: 200 }) as any);

    const response = await GET(buildRequest("?text=ola&provider=openai&voice=alloy"));

    expect(requireTenantApiKeyMock).toHaveBeenCalledWith("tenant-1", "openai");
    expect(global.fetch).toHaveBeenCalledWith("https://api.openai.com/v1/audio/speech", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer openai-key" }),
      body: JSON.stringify({ model: "tts-1", input: "ola", voice: "alloy", speed: 1.20 }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("retorna 400 quando OpenAI nao tem chave", async () => {
    requireTenantApiKeyMock.mockResolvedValueOnce({ apiKey: null });

    const response = await GET(buildRequest("?text=ola&provider=openai"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "OpenAI API Key não configurada." });
  });

  it("gera audio ElevenLabs usando integracao resolvida do tenant", async () => {
    getTenantIntegrationResolvedMock.mockResolvedValueOnce({
      api_key: "eleven-key",
      instance_name: "voice-1",
    });
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("audio", { status: 200 }) as any);

    const response = await GET(buildRequest("?text=ola&provider=elevenlabs"));

    expect(getTenantIntegrationResolvedMock).toHaveBeenCalledWith("tenant-1", "elevenlabs");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/text-to-speech/voice-1?output_format=mp3_44100_128",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "xi-api-key": "eleven-key" }),
      })
    );
    expect(response.status).toBe(200);
  });

  it("usa provider configurado em tenant_settings quando query nao informa provider", async () => {
    mockProfileAndSettings({ aiFeatures: { voice_provider: "elevenlabs" } });
    vi.stubEnv("ELEVENLABS_API_KEY", "env-eleven-key");
    vi.stubEnv("ELEVENLABS_VOICE_ID", "env-voice");
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("audio", { status: 200 }) as any);

    const response = await GET(buildRequest("?text=ola"));

    expect(getTenantIntegrationResolvedMock).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/env-voice?"), expect.any(Object));
    expect(response.status).toBe(200);
  });

  it("retorna 400 para provider desconhecido", async () => {
    const response = await GET(buildRequest("?text=ola&provider=unknown"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Voice Provider desconhecido." });
  });
});
