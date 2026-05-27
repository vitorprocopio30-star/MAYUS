import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/server", () => ({
  getTenantIntegrationResolved: vi.fn(),
  requireTenantApiKey: vi.fn(),
}));

import { synthesizeWhatsAppReplyAudio } from "./tts";

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
    process.env.ELEVENLABS_API_KEY = "eleven-key";
    process.env.ELEVENLABS_VOICE_ID = "voice-mayusorb";
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
        headers: expect.objectContaining({ "xi-api-key": "eleven-key" }),
      }),
    );
    expect(result.provider).toBe("elevenlabs");
    expect(result.ttsProvider).toBe("elevenlabs");
    expect(result.voiceProfile).toBe("mayusorb");
    expect(result.audioUrl).toContain("https://storage.test/");
    expect(supabase.uploads[0].options.contentType).toBe("audio/mpeg");
  });
});
