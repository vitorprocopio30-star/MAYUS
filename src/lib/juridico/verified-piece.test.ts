import { beforeEach, describe, expect, it, vi } from "vitest";

const { buildDocumentEvidencePackMock, loadLatestDocumentEvidencePackArtifactMock } = vi.hoisted(() => ({
  buildDocumentEvidencePackMock: vi.fn(),
  loadLatestDocumentEvidencePackArtifactMock: vi.fn(),
}));

vi.mock("@/lib/services/document-evidence-pack", () => ({
  buildDocumentEvidencePack: buildDocumentEvidencePackMock,
  loadLatestDocumentEvidencePackArtifact: loadLatestDocumentEvidencePackArtifactMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {},
}));

import { assertDraftVerifiedAgainstCurrent, evaluateVerifiedPieceReadiness } from "./verified-piece";

const readyPack = {
  generatedAt: "2026-05-18T12:00:00.000Z",
  process: { id: "task-1", title: "Acao revisional", clientName: "Maria", processNumber: null, driveLink: null, driveFolderId: null },
  documentMemory: { freshness: "fresh", documentCount: 2, syncStatus: "synced", lastSyncedAt: "2026-05-18T10:00:00.000Z", summaryMaster: "Ok", missingDocuments: [] },
  documents: [],
  factBasis: [{ id: "doc-1", name: "Peticao inicial.pdf", documentType: "inicial", folderLabel: "02-Inicial", webViewLink: "https://drive.test/doc-1", modifiedAt: "2026-05-18T09:00:00.000Z", relevanceScore: 90 }],
  gaps: [],
  risks: [],
  citationChecklist: { readyForFactCitations: true, pendingValidations: [], factCitationBasis: ["Peticao inicial.pdf (inicial)"] },
  summary: "Pacote pronto.",
};

describe("verified-piece", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildDocumentEvidencePackMock.mockResolvedValue(readyPack);
    loadLatestDocumentEvidencePackArtifactMock.mockResolvedValue(null);
  });

  it("blocks official use when no evidence pack artifact was saved", async () => {
    const result = await evaluateVerifiedPieceReadiness({ tenantId: "tenant-1", processTaskId: "task-1" });

    expect(result.ready).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.blockReasons[0]).toContain("Salve um Pacote de Evidencias");
  });

  it("marks the piece ready when the saved pack matches the current ready repository", async () => {
    loadLatestDocumentEvidencePackArtifactMock.mockResolvedValue({ artifactId: "artifact-1", createdAt: "2026-05-18T12:00:00.000Z", pack: readyPack });

    const result = await evaluateVerifiedPieceReadiness({ tenantId: "tenant-1", processTaskId: "task-1" });

    expect(result.ready).toBe(true);
    expect(result.evidencePackArtifactId).toBe("artifact-1");
    expect(result.factBasis).toHaveLength(1);
  });

  it("blocks when the repository changed after the saved evidence pack", async () => {
    loadLatestDocumentEvidencePackArtifactMock.mockResolvedValue({ artifactId: "artifact-1", createdAt: "2026-05-18T12:00:00.000Z", pack: readyPack });
    buildDocumentEvidencePackMock.mockResolvedValue({
      ...readyPack,
      documentMemory: { ...readyPack.documentMemory, lastSyncedAt: "2026-05-18T13:00:00.000Z" },
    });

    const result = await evaluateVerifiedPieceReadiness({ tenantId: "tenant-1", processTaskId: "task-1" });

    expect(result.ready).toBe(false);
    expect(result.blockReasons).toContain("O Pacote de Evidencias salvo esta desatualizado em relacao a ultima sincronizacao documental.");
  });

  it("blocks draft metadata validated against a previous evidence pack", () => {
    expect(() => assertDraftVerifiedAgainstCurrent({
      draftMetadata: {
        verified_piece: { ready: true, status: "ready" },
        evidence_pack_artifact_id: "artifact-old",
      },
      currentSnapshot: {
        status: "ready",
        ready: true,
        requiresHumanReview: false,
        evidencePackArtifactId: "artifact-new",
        evidencePackGeneratedAt: "2026-05-18T12:00:00.000Z",
        summary: "Pacote pronto.",
        factBasis: [],
        pendingValidations: [],
        warnings: [],
        blockReasons: [],
        gaps: [],
        risks: [],
        documentMemory: null,
      },
    })).toThrow("A versao da minuta foi validada com outro Pacote de Evidencias.");
  });
});
