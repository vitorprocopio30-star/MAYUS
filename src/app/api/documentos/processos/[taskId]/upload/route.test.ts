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

vi.mock("@/lib/services/google-drive", () => ({
  DEFAULT_PROCESS_DOCUMENT_FOLDERS: [
    "01-Documentos do Cliente",
    "02-Inicial",
    "03-Contestacao",
    "04-Manifestacoes",
    "05-Decisoes e Sentencas",
    "06-Provas",
    "07-Prazos e Audiencias",
    "08-Recursos",
    "09-Pecas Finais",
  ],
  uploadGoogleDriveFile: vi.fn(),
}));

vi.mock("@/lib/services/process-documents", () => ({
  syncProcessDocuments: vi.fn(),
}));

import { POST } from "./route";
import { getTenantSession } from "@/lib/auth/get-tenant-session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getTenantGoogleDriveContext } from "@/lib/services/google-drive-tenant";
import { uploadGoogleDriveFile } from "@/lib/services/google-drive";
import { syncProcessDocuments } from "@/lib/services/process-documents";

const getTenantSessionMock = vi.mocked(getTenantSession);
const getTenantGoogleDriveContextMock = vi.mocked(getTenantGoogleDriveContext);
const uploadGoogleDriveFileMock = vi.mocked(uploadGoogleDriveFile);
const syncProcessDocumentsMock = vi.mocked(syncProcessDocuments);
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

function buildUploadRequest(files: File[], folderLabel = "auto") {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  formData.append("folderLabel", folderLabel);

  return new NextRequest("http://localhost:3000/api/documentos/processos/task-1/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/documentos/processos/[taskId]/upload", () => {
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
          drive_folder_id: "root-folder",
          drive_link: "https://drive.example/folders/root-folder",
        });
      }

      if (table === "process_document_memory") {
        return queryResult({
          folder_structure: {
            "03-Contestacao": { id: "folder-contestacao", name: "03-Contestacao", webViewLink: "" },
            "06-Provas": { id: "folder-provas", name: "06-Provas", webViewLink: "" },
            "01-Documentos do Cliente": { id: "folder-cliente", name: "01-Documentos do Cliente", webViewLink: "" },
          },
        });
      }

      if (table === "system_event_logs") {
        return { insert: eventInsertMock };
      }

      return queryResult(null);
    });
    uploadGoogleDriveFileMock
      .mockResolvedValueOnce({ id: "drive-file-1", name: "contestacao_antigo.pdf" } as any)
      .mockResolvedValueOnce({ id: "drive-file-2", name: "CNIS_cliente.pdf" } as any);
    syncProcessDocumentsMock.mockResolvedValue({
      memory: { document_count: 2 },
      documents: [],
      structure: {},
      warnings: [],
    } as any);
    eventInsertMock.mockClear();
  });

  it("uploads a batch and auto-routes each file to the inferred legal folder", async () => {
    const response = await POST(buildUploadRequest([
      new File(["contestacao"], "contestacao_antigo.pdf", { type: "application/pdf" }),
      new File(["cnis"], "CNIS_cliente.pdf", { type: "application/pdf" }),
    ]), {
      params: { taskId: "task-1" },
    });

    const body = await response.clone().json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(uploadGoogleDriveFileMock).toHaveBeenNthCalledWith(1, "drive-token", expect.objectContaining({
      name: "contestacao_antigo.pdf",
      parentFolderId: "folder-contestacao",
    }));
    expect(uploadGoogleDriveFileMock).toHaveBeenNthCalledWith(2, "drive-token", expect.objectContaining({
      name: "CNIS_cliente.pdf",
      parentFolderId: "folder-provas",
    }));
    expect(eventInsertMock).toHaveBeenCalledWith(expect.objectContaining({
      event_name: "process_document_batch_uploaded",
      status: "completed",
      payload: expect.objectContaining({
        process_task_id: "task-1",
        uploaded_count: 2,
        auto_organized: true,
      }),
    }));
    expect(body).toMatchObject({
      success: true,
      uploadedCount: 2,
      organizations: [
        { fileName: "contestacao_antigo.pdf", documentType: "contestacao" },
        { fileName: "CNIS_cliente.pdf", documentType: "prova" },
      ],
    });
  });

  it("rejects oversized batches before touching Drive", async () => {
    const files = Array.from({ length: 26 }, (_, index) => new File(["x"], `doc-${index}.pdf`));
    const response = await POST(buildUploadRequest(files), {
      params: { taskId: "task-1" },
    });

    expect(response.status).toBe(400);
    expect(uploadGoogleDriveFileMock).not.toHaveBeenCalled();
  });
});
