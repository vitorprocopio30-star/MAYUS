import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/server", () => ({
  getTenantIntegrationResolved: vi.fn(),
  requireTenantApiKey: vi.fn(),
}));

import { resolveWhatsAppReplyVoiceStatus, synthesizeWhatsAppReplyAudio } from "./tts";
import { getTenantIntegrationResolved, requireTenantApiKey } from "@/lib/integrations/server";

const getTenantIntegrationResolvedMock = vi.mocked(getTenantIntegrationResolved);
const requireTenantApiKeyMock = vi.mocked(requireTenantApiKey);

function makeSupabase(aiFeatures: Record<string, any>) {
  const uploads: any[] = [];
  return {
    uploads,
    from: vi.fn((table: string) => {
      if (table === "tenant_settings") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: { ai_features: aiFeatures },
                error: null,
              })),
            })),
          })),
        };
      }
      return {};
    }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(async (path: string, bytes: Buffer, options: any) => {
          uploads.push({ path, bytes, options });
          return { error: null };
        }),
        createSignedUrl: vi.fn(async (path: string) => ({
          data: { signedUrl: `https://storage.test/${path}` },
          error: null,
        })),
      })),
    },
  };
}

describe("whatsapp tts", () => {
  afterEach(() => {
    delete process.env.ELEVENLABS_API_KEY;
    delete process.env.ELEVENLABS_VOICE_ID;
    vi.restoreAllMocks();
  });

  it("usa ElevenLabs MAYUSOrb como voz auditavel do WhatsApp", async () => {
    process.env.ELEVENLABS_API_KEY = "env-eleven-key";
    process.env.ELEVENLABS_VOICE_ID = "env-wrong-voice";
    getTenantIntegrationResolvedMock.mockResolvedValue({
      api_key: "tenant-eleven-key",
      instance_name: "voice-mayusorb",
    } as any);
    const supabase = makeSupabase({ voice_provider: "elevenlabs" });
    const fetcher = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => Buffer.from("mp3"),
    })) as any;

    const result = await synthesizeWhatsAppReplyAudio({
      supabase: supabase as any,
      tenantId: "tenant-1",
      contactId: "contact-1",
      text: "Resposta em audio do MAYUS.",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining("/text-to-speech/voice-mayusorb"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "xi-api-key": "tenant-eleven-key" }),
      }),
    );
    expect(result.provider).toBe("elevenlabs");
    expect(result.ttsProvider).toBe("elevenlabs");
    expect(result.voiceProfile).toBe("mayusorb");
    expect(result.voiceIdSource).toBe("tenant_integration");
    expect(result.audioUrl).toContain("https://storage.test/");
    expect(supabase.uploads[0].options.contentType).toBe("audio/mpeg");
  });

  it("nao finge MAYUSOrb quando ElevenLabs do tenant nao tem Voice ID", async () => {
    process.env.ELEVENLABS_API_KEY = "env-eleven-key";
    process.env.ELEVENLABS_VOICE_ID = "env-generic-voice";
    getTenantIntegrationResolvedMock.mockResolvedValue({
      api_key: "tenant-eleven-key",
      instance_name: null,
      status: "connected",
    } as any);
    const supabase = makeSupabase({ voice_provider: "elevenlabs" });
    const fetcher = vi.fn() as any;

    await expect(synthesizeWhatsAppReplyAudio({
      supabase: supabase as any,
      tenantId: "tenant-1",
      contactId: "contact-1",
      text: "Resposta em audio do MAYUS.",
      fetcher,
    })).rejects.toThrow(/Voice ID da MAYUSOrb/);

    expect(fetcher).not.toHaveBeenCalled();
  });

  it("expõe no status quando a voz real da MayusOrb esta configurada", async () => {
    getTenantIntegrationResolvedMock.mockResolvedValue({
      api_key: "tenant-eleven-key",
      instance_name: "voice-mayusorb",
    } as any);
    const supabase = makeSupabase({ voice_provider: "elevenlabs" });

    await expect(resolveWhatsAppReplyVoiceStatus({
      supabase: supabase as any,
      tenantId: "tenant-1",
    })).resolves.toEqual(expect.objectContaining({
      enabled: true,
      provider: "elevenlabs",
      displayLabel: "MayusOrb/ElevenLabs",
      voiceProfile: "mayusorb",
      voiceIdSource: "tenant_integration",
      blockedReason: null,
    }));
  });

  it("mostra OpenAI nova sem chamar isso de MayusOrb", async () => {
    requireTenantApiKeyMock.mockResolvedValue({ apiKey: "openai-key", integration: null } as any);
    const supabase = makeSupabase({});

    await expect(resolveWhatsAppReplyVoiceStatus({
      supabase: supabase as any,
      tenantId: "tenant-1",
    })).resolves.toEqual(expect.objectContaining({
      enabled: true,
      provider: "openai",
      displayLabel: "OpenAI nova",
      voiceProfile: "nova",
      voiceIdSource: null,
    }));
  });
});
