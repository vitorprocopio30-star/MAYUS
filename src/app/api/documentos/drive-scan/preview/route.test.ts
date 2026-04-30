import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: vi.fn(),
}));

vi.mock("@/lib/services/google-drive-tenant", () => ({
  getTenantGoogleDriveContext: vi.fn(),
}));

vi.mock("@/lib/services/drive-document-scanner", () => ({
  createDriveDocumentScanPreview: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { GET, POST } from "./route";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { getTenantGoogleDriveContext } from "@/lib/services/google-drive-tenant";
import { createDriveDocumentScanPreview } from "@/lib/services/drive-document-scanner";
import { supabaseAdmin } from "@/lib/supabase/admin";

const getTenantSessionMock = vi.mocked(getTenantSession);
const getTenantGoogleDriveContextMock = vi.mocked(getTenantGoogleDriveContext);
const createDriveDocumentScanPreviewMock = vi.mocked(createDriveDocumentScanPreview);
const supabaseFromMock = vi.mocked(supabaseAdmin.from);

describe("POST /api/documentos/drive-scan/preview", () => {
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
        drive_root_folder_id: "root-folder",
      },
    } as any);
    createDriveDocumentScanPreviewMock.mockResolvedValue({
      scanRunId: "scan-1",
      brainTaskId: "task-1",
      brainRunId: "run-1",
      brainArtifactId: "artifact-1",
      rootFolder: { id: "root-folder", name: "Acervo", url: "https://drive.test/root" },
      counters: {
        filesScanned: 1,
        foldersScanned: 0,
        matchedFiles: 1,
        highConfidence: 1,
        mediumConfidence: 0,
        lowConfidence: 0,
        needsReview: 0,
        duplicates: 0,
        proposedActions: 1,
      },
      items: [],
      actions: [{ id: "action-1", status: "proposed", confidence: "high" }],
      previewOnly: true,
    } as any);
    supabaseFromMock.mockImplementation(() => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(async () => ({ data: [{ id: "scan-1", status: "preview_ready" }], error: null })),
      };
      return chain;
    });
  });

  it("creates a Drive scan preview using the configured root folder", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/documentos/drive-scan/preview", {
      method: "POST",
      body: JSON.stringify({ maxDepth: 3, maxItems: 100 }),
    }));

    expect(response.status).toBe(200);
    expect(createDriveDocumentScanPreviewMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      userId: "user-1",
      accessToken: "drive-token",
      rootFolderId: "root-folder",
      maxDepth: 3,
      maxItems: 100,
    }));
  });

  it("uses the requested root folder when the user provides one", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/documentos/drive-scan/preview", {
      method: "POST",
      body: JSON.stringify({ rootFolderId: "custom-root", maxDepth: 2 }),
    }));

    expect(response.status).toBe(200);
    expect(createDriveDocumentScanPreviewMock).toHaveBeenCalledWith(expect.objectContaining({
      rootFolderId: "custom-root",
      maxDepth: 2,
    }));
  });

  it("requires a root folder when Drive has no configured root", async () => {
    getTenantGoogleDriveContextMock.mockResolvedValue({
      accessToken: "drive-token",
      metadata: {},
    } as any);

    const response = await POST(new NextRequest("http://localhost:3000/api/documentos/drive-scan/preview", {
      method: "POST",
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(400);
    expect(createDriveDocumentScanPreviewMock).not.toHaveBeenCalled();
  });

  it("lists recent Drive scan runs for the tenant", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      runs: [{ id: "scan-1", status: "preview_ready" }],
    });
    expect(supabaseFromMock).toHaveBeenCalledWith("drive_scan_runs");
  });
});
