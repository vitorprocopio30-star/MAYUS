import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: vi.fn(),
}));

vi.mock("@/lib/lex/draft-versions", () => ({
  updateProcessDraftVersionWorkflow: vi.fn(),
}));

import { PATCH } from "./route";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { updateProcessDraftVersionWorkflow } from "@/lib/lex/draft-versions";

const getTenantSessionMock = vi.mocked(getTenantSession);
const updateProcessDraftVersionWorkflowMock = vi.mocked(updateProcessDraftVersionWorkflow);

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/documentos/processos/task-1/minutas/version-1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("PATCH /api/documentos/processos/[taskId]/minutas/[versionId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 400 quando a ação é inválida", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });

    const response = await PATCH(buildRequest({ action: "noop" }), {
      params: { taskId: "task-1", versionId: "version-1" },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Acao invalida para workflow da minuta." });
  });

  it("retorna 200 quando aprova a versão com sucesso", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    updateProcessDraftVersionWorkflowMock.mockResolvedValueOnce({
      id: "version-1",
      workflow_status: "approved",
    } as any);

    const response = await PATCH(buildRequest({ action: "approve" }), {
      params: { taskId: "task-1", versionId: "version-1" },
    });

    expect(updateProcessDraftVersionWorkflowMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      processTaskId: "task-1",
      versionId: "version-1",
      action: "approve",
      actorId: "user-1",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true });
  });

  it("retorna 409 quando a versão está stale em relação ao Case Brain", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    updateProcessDraftVersionWorkflowMock.mockRejectedValueOnce(
      new Error("A versao da minuta esta desatualizada em relacao ao Case Brain atual.")
    );

    const response = await PATCH(buildRequest({ action: "publish" }), {
      params: { taskId: "task-1", versionId: "version-1" },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "A versao da minuta esta desatualizada em relacao ao Case Brain atual.",
    });
  });

  it("retorna 404 quando a versão não existe", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    updateProcessDraftVersionWorkflowMock.mockRejectedValueOnce(new Error("Versao da minuta nao encontrada."));

    const response = await PATCH(buildRequest({ action: "approve" }), {
      params: { taskId: "task-1", versionId: "version-1" },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Versao da minuta nao encontrada." });
  });

  it("retorna 403 quando a sessão não tem acesso formal", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new Error("Forbidden"));

    const response = await PATCH(buildRequest({ action: "approve" }), {
      params: { taskId: "task-1", versionId: "version-1" },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Apenas administradores ou socios podem revisar formalmente a minuta.",
    });
  });
});
