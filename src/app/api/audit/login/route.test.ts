import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, insertMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  insertMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: fromMock },
}));

import { POST } from "./route";

function buildRequest(body: Record<string, unknown>) {
  return new Request("http://localhost:3000/api/audit/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Vitest Browser",
      "x-forwarded-for": "203.0.113.10, 10.0.0.1",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/audit/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fromMock.mockReturnValue({ insert: insertMock });
    insertMock.mockResolvedValue({ error: null });
  });

  it("grava auditoria de login com client administrativo e payload sanitizado", async () => {
    const response = await POST(buildRequest({
      email: " advogado@example.com ",
      success: false,
      userId: "00000000-0000-0000-0000-000000000001",
      tenantId: "00000000-0000-0000-0000-000000000002",
      errorMsg: "token=abc123 senha:segredo credencial invalida",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, audit_logged: true });
    expect(fromMock).toHaveBeenCalledWith("audit_logs");
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "00000000-0000-0000-0000-000000000002",
      actor_id: "00000000-0000-0000-0000-000000000001",
      action: "LOGIN_FAILED",
      entity: "auth",
      ip_address: "203.0.113.10",
      user_agent: "Vitest Browser",
      new_data: expect.objectContaining({
        email_attempt: "advogado@example.com",
        error_message: "token=[redacted] senha=[redacted] credencial invalida",
      }),
    }));
  });

  it("nao derruba o login quando a auditoria falha", async () => {
    insertMock.mockResolvedValueOnce({ error: { message: "permission denied" } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await POST(buildRequest({
      email: "advogado@example.com",
      success: true,
      userId: "00000000-0000-0000-0000-000000000001",
      tenantId: "00000000-0000-0000-0000-000000000002",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, audit_logged: false });
    warnSpy.mockRestore();
  });
});
