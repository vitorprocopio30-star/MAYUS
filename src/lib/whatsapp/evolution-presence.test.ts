import { beforeEach, describe, expect, it, vi } from "vitest";

const listTenantIntegrationsResolvedMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/integrations/server", () => ({
  listTenantIntegrationsResolved: listTenantIntegrationsResolvedMock,
}));

import { sendEvolutionPresence } from "./evolution-presence";

describe("sendEvolutionPresence", () => {
  beforeEach(() => {
    listTenantIntegrationsResolvedMock.mockReset();
    listTenantIntegrationsResolvedMock.mockResolvedValue([
      {
        provider: "evolution",
        api_key: "evo-key",
        instance_name: "https://evolution.example.com|mayus",
      },
    ]);
  });

  it("envia payload oficial da Evolution para digitando", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 201 }));

    const result = await sendEvolutionPresence({
      tenantId: "tenant-1",
      remoteJid: "5521999990000@s.whatsapp.net",
      presence: "composing",
      delayMs: 4200,
      fetcher: fetcher as any,
    });

    expect(result).toEqual({ ok: true, status: 201 });
    expect(fetcher).toHaveBeenCalledWith(
      "https://evolution.example.com/chat/sendPresence/mayus",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ apikey: "evo-key" }),
        body: JSON.stringify({
          number: "5521999990000",
          presence: "composing",
          delay: 4200,
        }),
      }),
    );
  });

  it("nao envia presence invalida para Evolution", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 201 }));

    const result = await sendEvolutionPresence({
      tenantId: "tenant-1",
      remoteJid: "5521999990000@s.whatsapp.net",
      presence: "paused",
      fetcher: fetcher as any,
    });

    expect(result).toEqual({ ok: true, skipped: true, reason: "unsupported_presence_noop" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
