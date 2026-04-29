import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock("@/lib/services/google-drive-tenant", () => ({
  getTenantGoogleDriveContext: vi.fn(),
}));

vi.mock("@/lib/services/process-documents", () => ({
  organizeProcessDocuments: vi.fn(),
}));

import { POST } from "./route";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTenantGoogleDriveContext } from "@/lib/services/google-drive-tenant";
import { organizeProcessDocuments } from "@/lib/services/process-documents";

const getTenantSessionMock = vi.mocked(getTenantSession);
const getTenantGoogleDriveContextMock = vi.mocked(getTenantGoogleDriveContext);
const organizeProcessDocumentsMock = vi.mocked(organizeProcessDocuments);
const supabaseFromMock = vi.mocked(supabaseAdmin.from);
const eventInsertMock = vi.fn(async () => ({ error: null }));

function queryResult<T>(data: T) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return chain;
}

describe("POST /api/documentos/processos/[taskId]/organize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTenantSessionMock.mockResolvedValue({
      userId: "user-1",
      tenantId: "tenant-1",
      role: "admin",
      isSuperadmin: false,
      hasFullAccess: true,
    });
    getTenantGoogleDriveContextMock.mockResolvedValue({ accessToken: "drive-token" } as any);
    supabaseFromMock.mockImplementation((table: string) => {
      if (table === "process_tasks") {
        return queryResult({
          id: "task-1",
          tenant_id: "tenant-1",
          title: "Processo de Teste",
          process_number: "0000000-00.2026.8.26.0000",
          drive_folder_id: "root-folder",
        });
      }

      if (table === "system_event_logs") {
        return { insert: eventInsertMock };
      }

      return queryResult(null);
    });
    organizeProcessDocumentsMock.mockResolvedValue({
      memory: { document_count: 3, sync_status: "synced" },
      documents: [],
      structure: {},
      warnings: [],
      organization: {
        moved: 1,
        skipped: 2,
        needsReview: 1,
        moves: [{
          driveFileId: "file-1",
          name: "contestacao.pdf",
          fromFolderLabel: "Raiz do Processo",
          toFolderLabel: "03-Contestacao",
          documentType: "contestacao",
          confidence: "high",
          reason: "Identificado como contestacao.",
        }],
      },
    } as any);
  });

  it("organizes the repository and records an audit event", async () => {
    const response = await POST(new NextRequest("http://localhost:3000/api/documentos/processos/task-1/organize", {
      method: "POST",
    }), {
      params: { taskId: "task-1" },
    });

    expect(response.status).toBe(200);
    expect(organizeProcessDocumentsMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      accessToken: "drive-token",
      task: expect.objectContaining({ id: "task-1" }),
    }));
    expect(eventInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_name: "process_document_repository_organized",
      status: "completed",
      payload: expect.objectContaining({
        process_task_id: "task-1",
        moved_count: 1,
        needs_review_count: 1,
      }),
    }));
  });
});
