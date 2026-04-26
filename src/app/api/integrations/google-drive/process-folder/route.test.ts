import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  buildProcessGoogleDriveFolderNameMock,
  createGoogleDriveFolderMock,
  createGoogleDriveFolderStructureMock,
  extractGoogleDriveFolderIdMock,
  getTenantGoogleDriveContextMock,
  getTenantSessionMock,
  isGoogleDriveConfiguredMock,
  supabaseFromMock,
} = vi.hoisted(() => ({
  buildProcessGoogleDriveFolderNameMock: vi.fn((task: any) => `${task.client_name} - ${task.process_number} - ${task.title}`),
  createGoogleDriveFolderMock: vi.fn(),
  createGoogleDriveFolderStructureMock: vi.fn(),
  extractGoogleDriveFolderIdMock: vi.fn(() => null),
  getTenantGoogleDriveContextMock: vi.fn(),
  getTenantSessionMock: vi.fn(),
  isGoogleDriveConfiguredMock: vi.fn(),
  supabaseFromMock: vi.fn(),
}));

vi.mock("@/lib/auth/get-tenant-session", () => ({
  getTenantSession: getTenantSessionMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: supabaseFromMock,
  },
}));

vi.mock("@/lib/services/google-drive", () => ({
  buildProcessGoogleDriveFolderName: buildProcessGoogleDriveFolderNameMock,
  createGoogleDriveFolder: createGoogleDriveFolderMock,
  createGoogleDriveFolderStructure: createGoogleDriveFolderStructureMock,
  DEFAULT_PROCESS_DOCUMENT_FOLDERS: ["01-Documentos do Cliente", "02-Inicial"],
  extractGoogleDriveFolderId: extractGoogleDriveFolderIdMock,
  isGoogleDriveConfigured: isGoogleDriveConfiguredMock,
}));

vi.mock("@/lib/services/google-drive-tenant", () => ({
  getTenantGoogleDriveContext: getTenantGoogleDriveContextMock,
}));

import { POST } from "./route";

function buildPostRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3000/api/integrations/google-drive/process-folder", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function mockTenantSession() {
  getTenantSessionMock.mockResolvedValueOnce({
    userId: "user-1",
    tenantId: "tenant-1",
    role: "admin",
    isSuperadmin: false,
    hasFullAccess: true,
  });
}

function makeTask(overrides?: Record<string, unknown>) {
  return {
    id: "task-1",
    tenant_id: "tenant-1",
    stage_id: "stage-1",
    title: "Caso Previdenciario",
    client_name: "Maria da Silva",
    process_number: "1234567-89.2024.8.26.0100",
    drive_link: null,
    drive_folder_id: null,
    drive_structure_ready: false,
    ...overrides,
  };
}

function makeTaskSelectQuery(task: Record<string, unknown> | null, error: Error | null = null) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: task, error })),
  };
  return query;
}

function makeTaskUpdateQuery(updatedTask: Record<string, unknown> = { id: "task-1", drive_folder_id: "folder-1" }) {
  const query: any = {
    update: vi.fn(() => query),
    eq: vi.fn(() => query),
    select: vi.fn(() => query),
    single: vi.fn(async () => ({ data: updatedTask, error: null })),
  };
  return query;
}

function makeMemoryUpsertQuery() {
  return {
    upsert: vi.fn(async () => ({ error: null })),
  };
}

function mockSupabaseFlow(params: {
  task: Record<string, unknown> | null;
  updatedTask?: Record<string, unknown>;
}) {
  const taskSelect = makeTaskSelectQuery(params.task);
  const taskUpdate = makeTaskUpdateQuery(params.updatedTask);
  const memoryUpsert = makeMemoryUpsertQuery();

  supabaseFromMock.mockImplementation((table: string) => {
    if (table === "process_tasks") {
      return supabaseFromMock.mock.calls.filter(([name]) => name === "process_tasks").length === 1
        ? taskSelect
        : taskUpdate;
    }
    if (table === "process_document_memory") return memoryUpsert;
    throw new Error(`unexpected table ${table}`);
  });

  return { taskSelect, taskUpdate, memoryUpsert };
}

describe("/api/integrations/google-drive/process-folder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isGoogleDriveConfiguredMock.mockReturnValue(true);
    getTenantGoogleDriveContextMock.mockResolvedValue({
      accessToken: "access-token",
      metadata: { drive_root_folder_id: "root-folder" },
    });
    createGoogleDriveFolderStructureMock.mockResolvedValue({
      "01-Documentos do Cliente": { id: "sub-1", name: "01-Documentos do Cliente", webViewLink: "https://drive/sub-1" },
    });
  });

  it("rejeita taskId ausente", async () => {
    mockTenantSession();

    const response = await POST(buildPostRequest({}));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Processo inválido para criação de pasta." });
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it("retorna 503 quando Google Drive nao esta configurado", async () => {
    mockTenantSession();
    isGoogleDriveConfiguredMock.mockReturnValueOnce(false);

    const response = await POST(buildPostRequest({ taskId: "task-1" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Google Drive não configurado no servidor." });
  });

  it("retorna 404 quando processo nao existe", async () => {
    mockTenantSession();
    mockSupabaseFlow({ task: null });

    const response = await POST(buildPostRequest({ taskId: "task-1" }));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Processo não encontrado." });
    expect(getTenantGoogleDriveContextMock).not.toHaveBeenCalled();
  });

  it("retorna 400 quando Google Drive do tenant esta desconectado", async () => {
    mockTenantSession();
    mockSupabaseFlow({ task: makeTask() });
    getTenantGoogleDriveContextMock.mockRejectedValueOnce(new Error("GoogleDriveDisconnected"));

    const response = await POST(buildPostRequest({ taskId: "task-1" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Conecte o Google Drive em Configurações > Integrações para gerar a pasta automaticamente.",
    });
  });

  it("reaproveita pasta existente e cria estrutura documental", async () => {
    mockTenantSession();
    const task = makeTask({
      drive_link: "https://drive.google.com/drive/folders/existing-folder",
      drive_folder_id: "existing-folder",
      drive_structure_ready: true,
    });
    const { taskUpdate, memoryUpsert } = mockSupabaseFlow({ task });

    const response = await POST(buildPostRequest({ taskId: "task-1" }));

    expect(createGoogleDriveFolderMock).not.toHaveBeenCalled();
    expect(createGoogleDriveFolderStructureMock).toHaveBeenCalledWith(
      "access-token",
      "existing-folder",
      ["01-Documentos do Cliente", "02-Inicial"]
    );
    expect(taskUpdate.update).toHaveBeenCalledWith({
      drive_link: "https://drive.google.com/drive/folders/existing-folder",
      drive_folder_id: "existing-folder",
      drive_structure_ready: true,
    });
    expect(memoryUpsert.upsert).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      process_task_id: "task-1",
      drive_folder_id: "existing-folder",
      sync_status: "structured",
    }), { onConflict: "process_task_id" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      success: true,
      alreadyExists: true,
      folder: expect.objectContaining({ id: "existing-folder" }),
    }));
  });

  it("cria pasta nova sob a pasta raiz do tenant", async () => {
    mockTenantSession();
    const task = makeTask();
    mockSupabaseFlow({ task, updatedTask: { ...task, drive_folder_id: "new-folder" } });
    createGoogleDriveFolderMock.mockResolvedValueOnce({
      id: "new-folder",
      name: "Maria da Silva - 1234567-89.2024.8.26.0100 - Caso Previdenciario",
      webViewLink: "https://drive/new-folder",
    });

    const response = await POST(buildPostRequest({ taskId: "task-1" }));

    expect(createGoogleDriveFolderMock).toHaveBeenCalledWith("access-token", {
      name: "Maria da Silva - 1234567-89.2024.8.26.0100 - Caso Previdenciario",
      parentFolderId: "root-folder",
    });
    expect(createGoogleDriveFolderStructureMock).toHaveBeenCalledWith(
      "access-token",
      "new-folder",
      ["01-Documentos do Cliente", "02-Inicial"]
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      success: true,
      alreadyExists: false,
      folder: expect.objectContaining({
        id: "new-folder",
        webViewLink: "https://drive/new-folder",
      }),
    }));
  });

  it("mapeia Unauthorized para 401", async () => {
    getTenantSessionMock.mockRejectedValueOnce(new Error("Unauthorized"));

    const response = await POST(buildPostRequest({ taskId: "task-1" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Não autenticado." });
  });
});
