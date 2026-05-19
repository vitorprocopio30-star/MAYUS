import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: vi.fn(),
}));

vi.mock("@/lib/services/google-drive-tenant", () => ({
  buildTenantGoogleDriveServiceRequest: vi.fn(() => new Request("https://example.com/api/integrations/google-drive/callback")),
  getTenantGoogleDriveContext: vi.fn(),
}));

vi.mock("@/lib/juridico/publish-piece-premium", () => ({
  exportLegalPieceBinary: vi.fn(),
  publishLegalPiecePremium: vi.fn(),
}));

vi.mock("@/lib/lex/draft-versions", () => ({
  getProcessDraftVersionForTask: vi.fn(),
}));

vi.mock("@/lib/juridico/verified-piece", () => ({
  evaluateVerifiedPieceReadiness: vi.fn(async () => ({ ready: true, evidencePackArtifactId: "evidence-artifact-1", blockReasons: [], pendingValidations: [] })),
  assertDraftVerifiedAgainstCurrent: vi.fn(({ draftMetadata, currentSnapshot }: any) => {
    if (!currentSnapshot?.ready) throw new Error("Peca nao verificavel.");
    if (draftMetadata?.verified_piece?.ready !== true) throw new Error("A versao da minuta nao possui snapshot verificavel pronto.");
    if (draftMetadata?.evidence_pack_artifact_id !== currentSnapshot?.evidencePackArtifactId) throw new Error("A versao da minuta foi validada com outro Pacote de Evidencias.");
  }),
}));

import { POST } from "./route";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { getTenantGoogleDriveContext } from "@/lib/services/google-drive-tenant";
import { exportLegalPieceBinary, publishLegalPiecePremium } from "@/lib/juridico/publish-piece-premium";
import { getProcessDraftVersionForTask } from "@/lib/lex/draft-versions";
import { evaluateVerifiedPieceReadiness } from "@/lib/juridico/verified-piece";

const getTenantSessionMock = vi.mocked(getTenantSession);
const getTenantGoogleDriveContextMock = vi.mocked(getTenantGoogleDriveContext);
const exportLegalPieceBinaryMock = vi.mocked(exportLegalPieceBinary);
const publishLegalPiecePremiumMock = vi.mocked(publishLegalPiecePremium);
const getProcessDraftVersionForTaskMock = vi.mocked(getProcessDraftVersionForTask);
const evaluateVerifiedPieceReadinessMock = vi.mocked(evaluateVerifiedPieceReadiness);

function buildRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/documentos/processos/task-1/exportar-peca", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/documentos/processos/[taskId]/exportar-peca", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("usa a versao salva no servidor ao publicar o artifact premium", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    getProcessDraftVersionForTaskMock.mockResolvedValueOnce({
      id: "version-1",
      workflow_status: "published",
      draft_markdown: "# Texto oficial salvo",
      piece_type: "contestacao",
      piece_label: "Contestacao Oficial",
      metadata: { verified_piece: { ready: true, status: "ready" }, evidence_pack_artifact_id: "evidence-artifact-1" },
    } as any);
    getTenantGoogleDriveContextMock.mockResolvedValueOnce({ accessToken: "token-1" } as any);
    publishLegalPiecePremiumMock.mockResolvedValueOnce({
      publication: { driveFolderLabel: "09-Pecas Finais" },
      uploadedFile: { id: "file-1" },
    } as any);

    const response = await POST(buildRequest({
      versionId: "version-1",
      draftMarkdown: "# texto adulterado no client",
      publishToDrive: true,
    }), {
      params: { taskId: "task-1" },
    });

    expect(getTenantSessionMock).toHaveBeenCalledWith({ requireFullAccess: true });
    expect(publishLegalPiecePremiumMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "task-1",
      pieceType: "contestacao",
      pieceLabel: "Contestacao Oficial",
      draftMarkdown: "# Texto oficial salvo",
      versionId: "version-1",
    }));
    expect(response.status).toBe(200);
  });

  it("bloqueia publish premium sem versao formal publicada", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    getProcessDraftVersionForTaskMock.mockResolvedValueOnce({
      id: "version-1",
      workflow_status: "approved",
      draft_markdown: "# Texto oficial salvo",
      piece_type: "contestacao",
      piece_label: "Contestacao Oficial",
      metadata: { verified_piece: { ready: true, status: "ready" }, evidence_pack_artifact_id: "evidence-artifact-1" },
    } as any);

    const response = await POST(buildRequest({
      versionId: "version-1",
      publishToDrive: true,
    }), {
      params: { taskId: "task-1" },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "A versao formal precisa estar publicada antes do artifact premium.",
    });
  });

  it("exige full access para publish premium", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new Error("Forbidden"));

    const response = await POST(buildRequest({ publishToDrive: true }), {
      params: { taskId: "task-1" },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Apenas administradores ou socios podem publicar o artifact premium.",
    });
  });

  it("usa a versao salva no servidor tambem no export de arquivo", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "advogado",
      isSuperadmin: false,
      hasFullAccess: false,
    });
    getProcessDraftVersionForTaskMock.mockResolvedValueOnce({
      id: "version-1",
      workflow_status: "draft",
      draft_markdown: "# Texto oficial do banco",
      piece_type: "contestacao",
      piece_label: "Contestacao Oficial",
      metadata: { verified_piece: { ready: true, status: "ready" }, evidence_pack_artifact_id: "evidence-artifact-1" },
    } as any);
    exportLegalPieceBinaryMock.mockResolvedValueOnce({
      buffer: new Uint8Array([1, 2, 3]),
      fileName: "contestacao.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    } as any);

    const response = await POST(buildRequest({
      versionId: "version-1",
      draftMarkdown: "# texto adulterado no client",
      format: "docx",
    }), {
      params: { taskId: "task-1" },
    });

    expect(getTenantSessionMock).toHaveBeenCalledWith({ requireFullAccess: false });
    expect(exportLegalPieceBinaryMock).toHaveBeenCalledWith(expect.objectContaining({
      draftMarkdown: "# Texto oficial do banco",
      pieceType: "contestacao",
      pieceLabel: "Contestacao Oficial",
    }));
    expect(response.status).toBe(200);
  });

  it("bloqueia export oficial quando a peca nao esta verificavel", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "advogado",
      isSuperadmin: false,
      hasFullAccess: false,
    });
    getProcessDraftVersionForTaskMock.mockResolvedValueOnce({
      id: "version-1",
      workflow_status: "published",
      draft_markdown: "# Texto oficial",
      piece_type: "contestacao",
      piece_label: "Contestacao Oficial",
      metadata: { verified_piece: { ready: true, status: "ready" }, evidence_pack_artifact_id: "evidence-artifact-1" },
    } as any);
    evaluateVerifiedPieceReadinessMock.mockResolvedValueOnce({
      ready: false,
      blockReasons: ["Salve um Pacote de Evidencias antes de aprovar, publicar ou exportar a peca oficial."],
      pendingValidations: [],
    } as any);

    const response = await POST(buildRequest({
      versionId: "version-1",
      format: "pdf",
    }), {
      params: { taskId: "task-1" },
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Peca nao verificavel.",
    });
  });

  it("bloqueia export oficial sem versao formal", async () => {
    getTenantSessionMock.mockResolvedValueOnce({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "advogado",
      isSuperadmin: false,
      hasFullAccess: false,
    });

    const response = await POST(buildRequest({
      draftMarkdown: "# Texto client-side",
      format: "docx",
    }), {
      params: { taskId: "task-1" },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Informe uma versao formal verificavel antes de exportar a peca oficial.",
    });
    expect(exportLegalPieceBinaryMock).not.toHaveBeenCalled();
  });
});
