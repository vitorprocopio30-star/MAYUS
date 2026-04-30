import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: vi.fn(),
}));

vi.mock("@/lib/services/google-drive-tenant", () => ({
  getTenantGoogleDriveContext: vi.fn(),
}));

vi.mock("@/lib/services/drive-document-scanner", () => ({
  revertDriveDocumentScanActions: vi.fn(),
}));

import { POST } from "./route";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { getTenantGoogleDriveContext } from "@/lib/services/google-drive-tenant";
import { revertDriveDocumentScanActions } from "@/lib/services/drive-document-scanner";

const getTenantSessionMock = vi.mocked(getTenantSession);
const getTenantGoogleDriveContextMock = vi.mocked(getTenantGoogleDriveContext);
const revertDriveDocumentScanActionsMock = vi.mocked(revertDriveDocumentScanActions);

describe("POST /api/documentos/drive-scan/revert", () => {
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
      metadata: {},
    } as any);
    revertDriveDocumentScanActionsMock.mockResolvedValue({
      scanRunId: "scan-1",
      brainArtifactId: "artifact-revert-1",
      counters: { reverted: 1, skipped: 0, failed: 0 },
      reverted: [{ actionId: "action-1", fileId: "file-1", restoredParentFolderId: "old-parent" }],
      skipped: [],
      failed: [],
    } as any);
  });

  it("reverts selected applied scanner actions with the tenant Drive context", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/documentos/drive-scan/revert", {
      method: "POST",
      body: JSON.stringify({ scanRunId: "scan-1", actionIds: ["action-1", ""] }),
    }));

    expect(response.status).toBe(200);
    expect(revertDriveDocumentScanActionsMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      userId: "user-1",
      accessToken: "drive-token",
      scanRunId: "scan-1",
      actionIds: ["action-1"],
    }));
  });

  it("requires scanRunId and selected actionIds", async () => {
    const missingScan = await POST(new NextRequest("http://localhost:3000/api/documentos/drive-scan/revert", {
      method: "POST",
      body: JSON.stringify({ actionIds: ["action-1"] }),
    }));
    const missingActions = await POST(new NextRequest("http://localhost:3000/api/documentos/drive-scan/revert", {
      method: "POST",
      body: JSON.stringify({ scanRunId: "scan-1", actionIds: [] }),
    }));

    expect(missingScan.status).toBe(400);
    expect(missingActions.status).toBe(400);
    expect(revertDriveDocumentScanActionsMock).not.toHaveBeenCalled();
  });
});
