import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: vi.fn(),
}));

vi.mock("@/lib/lex/draft-factory-health", () => ({
  getDraftFactoryQueueHealth: vi.fn(),
}));

import { GET } from "./route";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { getDraftFactoryQueueHealth } from "@/lib/lex/draft-factory-health";

const getTenantSessionMock = vi.mocked(getTenantSession);
const getDraftFactoryQueueHealthMock = vi.mocked(getDraftFactoryQueueHealth);

describe("GET /api/documentos/draft-factory/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 quando a sessão não está autenticada", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const response = await GET(new NextRequest("http://localhost:3000/api/documentos/draft-factory/health"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Nao autenticado." });
  });

  it("normaliza stuck_running_minutes e retorna a saúde da fila", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    getDraftFactoryQueueHealthMock.mockResolvedValueOnce({
      generatedAt: "2026-04-20T10:00:00.000Z",
      counts: { queued: 1, running: 0, completed: 2, failed: 0, staleCompleted: 0 },
      oldestQueuedMinutes: 12,
      oldestRunningMinutes: null,
      stuckRunningCount: 0,
      repeatedFailureCount: 0,
      recentFailures: [],
      alerts: [],
    });

    const response = await GET(new NextRequest("http://localhost:3000/api/documentos/draft-factory/health?stuck_running_minutes=2"));

    expect(getDraftFactoryQueueHealthMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      stuckRunningMinutes: 5,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it("limita stuck_running_minutes ao teto de 240", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    getDraftFactoryQueueHealthMock.mockResolvedValueOnce({
      generatedAt: "2026-04-20T10:00:00.000Z",
      counts: { queued: 0, running: 1, completed: 0, failed: 0, staleCompleted: 0 },
      oldestQueuedMinutes: null,
      oldestRunningMinutes: 300,
      stuckRunningCount: 1,
      repeatedFailureCount: 0,
      recentFailures: [],
      alerts: [],
    });

    await GET(new NextRequest("http://localhost:3000/api/documentos/draft-factory/health?stuck_running_minutes=999"));

    expect(getDraftFactoryQueueHealthMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      stuckRunningMinutes: 240,
    });
  });
});
