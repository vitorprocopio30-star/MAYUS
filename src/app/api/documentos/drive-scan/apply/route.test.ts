import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: vi.fn(),
}));

vi.mock("@/lib/services/google-drive-tenant", () => ({
  getTenantGoogleDriveContext: vi.fn(),
}));

vi.mock("@/lib/services/drive-document-scanner", () => ({
  applyDriveDocumentScanActions: vi.fn(),
}));

import { POST } from "./route";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { getTenantGoogleDriveContext } from "@/lib/services/google-drive-tenant";
import { applyDriveDocumentScanActions } from "@/lib/services/drive-document-scanner";

const getTenantSessionMock = vi.mocked(getTenantSession);
const getTenantGoogleDriveContextMock = vi.mocked(getTenantGoogleDriveContext);
const applyDriveDocumentScanActionsMock = vi.mocked(applyDriveDocumentScanActions);

describe("POST /api/documentos/drive-scan/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantSessionMock.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    getTenantGoogleDriveContextMock.mockResolvedValue({
      accessToken: "drive-token",
      metadata: {
        drive_root_folder_id: "process-root",
      },
    } as any);
    applyDriveDocumentScanActionsMock.mockResolvedValue({
      scanRunId: "scan-1",
      brainArtifactId: "artifact-result-1",
      counters: { applied: 1, skipped: 0, failed: 0, syncedProcesses: 1 },
      applied: [{ actionId: "action-1", processTaskId: "process-1", fileName: "inicial.pdf" }],
      skipped: [],
      failed: [],
      syncWarnings: [],
    } as any);
  });

  it("applies selected preview actions with the tenant Drive context", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/documentos/drive-scan/apply", {
      method: "POST",
      body: JSON.stringify({ scanRunId: "scan-1", actionIds: ["action-1"] }),
    }));

    expect(response.status).toBe(200);
    expect(applyDriveDocumentScanActionsMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      userId: "user-1",
      accessToken: "drive-token",
      scanRunId: "scan-1",
      actionIds: ["action-1"],
      processRootFolderId: "process-root",
    }));
  });

  it("requires scanRunId", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/documentos/drive-scan/apply", {
      method: "POST",
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(400);
    expect(applyDriveDocumentScanActionsMock).not.toHaveBeenCalled();
  });
});
