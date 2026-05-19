import { beforeEach, describe, expect, it, vi } from "vitest";

const getTenantSessionMock = vi.hoisted(() => vi.fn());
const runTenantDoctorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: getTenantSessionMock,
}));

vi.mock("@/lib/setup/tenant-doctor", () => ({
  runTenantDoctor: runTenantDoctorMock,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: {
          "content-type": "application/json",
          ...(init?.headers || {}),
        },
      });
    },
  },
}));

import { GET, POST } from "./route";

function report() {
  return {
    tenantId: "tenant-1",
    ready: false,
    autoFixApplied: false,
    summary: { ok: 1, fixed: 0, warning: 1, blocked: 0 },
    checks: [],
    agenticReadiness: {
      label: "Escritorio juridico AI First supervisionado",
      overallScore: 78,
      status: "warning",
      nextBestAction: "Validar policy agentica.",
      modules: [],
      pendingQuestions: [],
      applicablePlan: [],
    },
    nextBestAction: "Validar policy agentica.",
    pendingQuestions: [],
    applicablePlan: [],
    brainTrace: null,
  };
}

describe("setup doctor route", () => {
  beforeEach(() => {
    getTenantSessionMock.mockReset();
    runTenantDoctorMock.mockReset();
    getTenantSessionMock.mockResolvedValue({ tenantId: "tenant-1", userId: "user-1" });
    runTenantDoctorMock.mockResolvedValue(report());
  });

  it("returns the agentic readiness payload on GET", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getTenantSessionMock).toHaveBeenCalledWith({ requireFullAccess: true });
    expect(runTenantDoctorMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "user-1",
      autoFix: false,
    });
    expect(body.report.agenticReadiness.overallScore).toBe(78);
    expect(JSON.stringify(body)).not.toMatch(/sk-|api_key|webhook_secret/i);
  });

  it("runs safe autofix on POST", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(runTenantDoctorMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "user-1",
      autoFix: true,
    });
  });

  it("does not leak raw internal errors", async () => {
    runTenantDoctorMock.mockRejectedValueOnce(new Error("service role sk-secret broke"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Nao foi possivel executar o doctor do tenant.");
    expect(JSON.stringify(body)).not.toContain("sk-secret");
  });
});
