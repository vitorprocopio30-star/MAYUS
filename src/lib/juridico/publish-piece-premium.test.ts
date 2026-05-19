import { beforeEach, describe, expect, it, vi } from "vitest";

const { getProcessDraftVersionByIdMock, loadDraftLearningLoopDeltaMock, evaluateVerifiedPieceReadinessMock, assertDraftVerifiedAgainstCurrentMock, uploadGoogleDriveFileMock } = vi.hoisted(() => ({
  getProcessDraftVersionByIdMock: vi.fn(),
  loadDraftLearningLoopDeltaMock: vi.fn(),
  evaluateVerifiedPieceReadinessMock: vi.fn(),
  assertDraftVerifiedAgainstCurrentMock: vi.fn(),
  uploadGoogleDriveFileMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock("@/lib/lex/draft-versions", () => ({
  getProcessDraftVersionById: getProcessDraftVersionByIdMock,
  loadDraftLearningLoopDelta: loadDraftLearningLoopDeltaMock,
}));

vi.mock("@/lib/juridico/verified-piece", () => ({
  evaluateVerifiedPieceReadiness: evaluateVerifiedPieceReadinessMock,
  assertDraftVerifiedAgainstCurrent: assertDraftVerifiedAgainstCurrentMock,
}));

vi.mock("@/lib/juridico/export-piece-docx", () => ({
  exportLegalPieceToDocx: vi.fn(),
}));

vi.mock("@/lib/juridico/export-piece-pdf", () => ({
  exportLegalPieceToPdf: vi.fn(),
}));

vi.mock("@/lib/services/google-drive", () => ({
  uploadGoogleDriveFile: uploadGoogleDriveFileMock,
  buildGoogleDriveFolderUrl: vi.fn((folderId: string) => `https://drive.test/folders/${folderId}`),
}));

import { publishLegalPiecePremium } from "./publish-piece-premium";

describe("publish-piece-premium", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    evaluateVerifiedPieceReadinessMock.mockResolvedValue({
      ready: true,
      evidencePackArtifactId: "evidence-artifact-1",
      blockReasons: [],
      pendingValidations: [],
    });
  });

  it("bloqueia publicacao premium quando a versao pertence a outro processo", async () => {
    getProcessDraftVersionByIdMock.mockResolvedValueOnce({
      id: "version-1",
      process_task_id: "task-2",
      metadata: { verified_piece: { ready: true, status: "ready" }, evidence_pack_artifact_id: "evidence-artifact-1" },
    });

    await expect(publishLegalPiecePremium({
      tenantId: "tenant-1",
      taskId: "task-1",
      accessToken: "token-1",
      pieceType: "contestacao",
      pieceLabel: "Contestacao",
      draftMarkdown: "# Contestacao",
      versionId: "version-1",
    })).rejects.toThrow("A versao da minuta nao pertence ao processo informado.");

    expect(assertDraftVerifiedAgainstCurrentMock).not.toHaveBeenCalled();
    expect(uploadGoogleDriveFileMock).not.toHaveBeenCalled();
  });
});
