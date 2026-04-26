import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: vi.fn(),
}));

vi.mock("@/lib/lex/draft-versions", () => ({
  listProcessDraftVersions: vi.fn(),
  createHumanReviewedProcessDraftVersion: vi.fn(),
}));

import { GET, POST } from "./route";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { createHumanReviewedProcessDraftVersion, listProcessDraftVersions } from "@/lib/lex/draft-versions";

const getTenantSessionMock = vi.mocked(getTenantSession);
const listProcessDraftVersionsMock = vi.mocked(listProcessDraftVersions);
const createHumanReviewedProcessDraftVersionMock = vi.mocked(createHumanReviewedProcessDraftVersion);

function buildPostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/documentos/processos/task-1/minutas", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("/api/documentos/processos/[taskId]/minutas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista as versoes existentes no GET", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    listProcessDraftVersionsMock.mockResolvedValueOnce([{ id: "version-1" }] as any);

    const response = await GET(new NextRequest("http://localhost:3000/api/documentos/processos/task-1/minutas"), {
      params: { taskId: "task-1" },
    });

    expect(listProcessDraftVersionsMock).toHaveBeenCalledWith({ tenantId: "tenant-1", processTaskId: "task-1" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ versions: [{ id: "version-1" }] });
  });

  it("cria uma nova versao formal a partir da revisao humana", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    createHumanReviewedProcessDraftVersionMock.mockResolvedValueOnce({ id: "version-2", version_number: 2 } as any);

    const response = await POST(buildPostRequest({
      baseVersionId: "version-1",
      draftMarkdown: "# Contestacao\n\nTexto revisado pelo humano.",
    }), {
      params: { taskId: "task-1" },
    });

    expect(createHumanReviewedProcessDraftVersionMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      processTaskId: "task-1",
      baseVersionId: "version-1",
      draftMarkdown: "# Contestacao\n\nTexto revisado pelo humano.",
      actorId: "user-1",
      surface: "documentos",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, version: { id: "version-2", version_number: 2 } });
  });

  it("retorna 403 quando a sessao nao tem acesso formal para salvar a revisao", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new Error("Forbidden"));

    const response = await POST(buildPostRequest({
      baseVersionId: "version-1",
      draftMarkdown: "# Contestacao\n\nTexto revisado.",
    }), {
      params: { taskId: "task-1" },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Apenas administradores ou socios podem salvar uma nova versao formal da minuta.",
    });
  });

  it("retorna 409 quando nao ha alteracao material", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    createHumanReviewedProcessDraftVersionMock.mockRejectedValueOnce(
      new Error("Nenhuma alteracao material foi detectada para criar uma nova versao formal.")
    );

    const response = await POST(buildPostRequest({
      baseVersionId: "version-1",
      draftMarkdown: "# Contestacao\n\nMesmo texto.",
    }), {
      params: { taskId: "task-1" },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Nenhuma alteracao material foi detectada para criar uma nova versao formal.",
    });
  });
});
