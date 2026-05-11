import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { getBrainAuthContextMock } = vi.hoisted(() => ({
  getBrainAuthContextMock: vi.fn(),
}));

vi.mock("@/lib/brain/server", () => ({
  getBrainAuthContext: getBrainAuthContextMock,
}));

import { POST } from "./route";

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/agent/voice/mayus-knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/agent/voice/mayus-knowledge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBrainAuthContextMock.mockResolvedValue({
      ok: true,
      context: {
        userId: "user-1",
        tenantId: "tenant-1",
        userRole: "Administrador",
      },
    });
  });

  it("responde sobre o produto MAYUS pela base interna", async () => {
    const response = await POST(request({ question: "O que e o MAYUS?" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.answer).toContain("socio operacional de IA");
    expect(json.sources.length).toBeGreaterThan(0);
  });
});

