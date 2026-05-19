import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: vi.fn(),
}));

vi.mock("@/lib/services/document-evidence-pack", () => ({
  buildDocumentEvidencePack: vi.fn(),
  persistDocumentEvidencePack: vi.fn(),
}));

import { GET, POST } from "./route";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { buildDocumentEvidencePack, persistDocumentEvidencePack } from "@/lib/services/document-evidence-pack";

const getTenantSessionMock = vi.mocked(getTenantSession);
const buildDocumentEvidencePackMock = vi.mocked(buildDocumentEvidencePack);
const persistDocumentEvidencePackMock = vi.mocked(persistDocumentEvidencePack);

const pack = {
  generatedAt: "2026-05-18T12:00:00.000Z",
  process: { id: "task-1", title: "Processo", clientName: "Maria", processNumber: null, driveLink: null, driveFolderId: null },
  documentMemory: { freshness: "fresh", documentCount: 1, syncStatus: "synced", lastSyncedAt: "2026-05-18T10:00:00.000Z", summaryMaster: "Ok", missingDocuments: [] },
  documents: [],
  factBasis: [],
  gaps: [],
  risks: [],
  citationChecklist: { readyForFactCitations: true, pendingValidations: [], factCitationBasis: [] },
  summary: "Pacote pronto.",
};

describe("/api/documentos/processos/[taskId]/evidence-pack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantSessionMock.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    buildDocumentEvidencePackMock.mockResolvedValue(pack as any);
    persistDocumentEvidencePackMock.mockResolvedValue({
      pack: { ...pack, artifactId: "artifact-1" },
      artifactId: "artifact-1",
      brainTaskId: "brain-task-1",
    } as any);
  });

  it("returns a computed evidence pack without persisting it", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/documentos/processos/task-1/evidence-pack"), {
      params: { taskId: "task-1" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ pack });
    expect(buildDocumentEvidencePackMock).toHaveBeenCalledWith({ tenantId: "tenant-1", processTaskId: "task-1" });
    expect(persistDocumentEvidencePackMock).not.toHaveBeenCalled();
  });

  it("persists an evidence pack artifact for full access users", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/documentos/processos/task-1/evidence-pack", {
      method: "POST",
    }), {
      params: { taskId: "task-1" },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      pack: { ...pack, artifactId: "artifact-1" },
      artifactId: "artifact-1",
      brainTaskId: "brain-task-1",
    });
    expect(getTenantSessionMock).toHaveBeenCalledWith({ requireFullAccess: true });
    expect(persistDocumentEvidencePackMock).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      processTaskId: "task-1",
      userId: "user-1",
    });
  });

  it("rejects empty task ids", async () => {
    const response = await GET(new NextRequest("http://localhost:3000/api/documentos/processos/%20/evidence-pack"), {
      params: { taskId: " " },
    });

    expect(response.status).toBe(400);
    expect(buildDocumentEvidencePackMock).not.toHaveBeenCalled();
  });

  it("maps auth failures to 401", async () => {
    getTenantSessionMock.mockRejectedValue(new Error("Unauthorized"));

    const response = await GET(new NextRequest("http://localhost:3000/api/documentos/processos/task-1/evidence-pack"), {
      params: { taskId: "task-1" },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Nao autenticado." });
  });
});
