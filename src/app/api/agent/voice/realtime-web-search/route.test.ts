import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  getBrainAuthContextMock,
  requireTenantApiKeyMock,
} = vi.hoisted(() => ({
  getBrainAuthContextMock: vi.fn(),
  requireTenantApiKeyMock: vi.fn(),
}));

vi.mock("@/lib/brain/server", () => ({
  getBrainAuthContext: getBrainAuthContextMock,
}));

vi.mock("@/lib/integrations/server", () => ({
  requireTenantApiKey: requireTenantApiKeyMock,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/agent/voice/realtime-web-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/agent/voice/realtime-web-search", () => {
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
    vi.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({
      output: [
        {
          content: [
            {
              type: "output_text",
              text: "A pagina oficial indica operacao normal.",
              annotations: [
                {
                  type: "url_citation",
                  title: "OpenAI Status",
                  url: "https://status.openai.com/",
                },
              ],
            },
          ],
        },
      ],
    }), { status: 200 }) as any);
  });

  it("usa Responses API com web_search e devolve fontes", async () => {
    const response = await POST(request({ query: "OpenAI API esta fora do ar?" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      ok: true,
      answer: "A pagina oficial indica operacao normal.",
      sources: [{ title: "OpenAI Status", url: "https://status.openai.com/" }],
      cost: { usd: 0.01 },
    });
    const body = JSON.parse(String(vi.mocked(global.fetch).mock.calls[0]?.[1]?.body));
    expect(body.tools).toEqual([{ type: "web_search" }]);
    expect(body.tool_choice).toBe("required");
    expect(requireTenantApiKeyMock).toHaveBeenCalledWith("tenant-1", "openai");
  });
});

