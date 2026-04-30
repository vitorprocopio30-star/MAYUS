import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createGoogleDriveFolderMock,
  createGoogleDriveFolderStructureMock,
  listGoogleDriveChildrenMock,
  moveGoogleDriveFileMock,
  syncProcessDocumentsMock,
} = vi.hoisted(() => ({
  createGoogleDriveFolderMock: vi.fn(),
  createGoogleDriveFolderStructureMock: vi.fn(),
  listGoogleDriveChildrenMock: vi.fn(),
  moveGoogleDriveFileMock: vi.fn(),
  syncProcessDocumentsMock: vi.fn(),
}));

vi.mock("@/lib/services/google-drive", () => ({
  DEFAULT_PROCESS_DOCUMENT_FOLDERS: ["01-Documentos do Cliente", "02-Inicial", "03-Contestacao"],
  buildGoogleDriveFolderUrl: (id: string) => `https://drive.google.com/drive/folders/${id}`,
  buildProcessGoogleDriveFolderName: (task: { title?: string | null; process_number?: string | null }) =>
    [task.process_number, task.title].filter(Boolean).join(" - ") || "Processo sem nome",
  createGoogleDriveFolder: createGoogleDriveFolderMock,
  createGoogleDriveFolderStructure: createGoogleDriveFolderStructureMock,
  fetchGoogleDriveFolder: vi.fn(),
  isGoogleDriveFolder: (file: { mimeType?: string | null }) =>
    file.mimeType === "application/vnd.google-apps.folder",
  listGoogleDriveChildren: listGoogleDriveChildrenMock,
  moveGoogleDriveFile: moveGoogleDriveFileMock,
}));

vi.mock("@/lib/services/process-documents", () => ({
  syncProcessDocuments: syncProcessDocumentsMock,
}));
import {
  applyDriveDocumentScanActions,
  buildDriveScanPreviewPlan,
  extractCnjNumbers,
  revertDriveDocumentScanActions,
  scoreDriveFileProcessMatch,
  type DriveScanActionRecord,
  type DriveScanDiscoveredItem,
  type DriveScanProcess,
} from "./drive-document-scanner";

const process: DriveScanProcess = {
  id: "process-1",
  title: "Acao revisional bancaria",
  client_name: "Maria Silva",
  process_number: "1234567-89.2024.8.26.0100",
  drive_folder_id: "process-folder",
};

function file(overrides: Partial<DriveScanDiscoveredItem>): DriveScanDiscoveredItem {
  return {
    driveFileId: "file-1",
    parentFolderId: "root",
    parentPath: [],
    name: "documento.pdf",
    mimeType: "application/pdf",
    sizeBytes: 123,
    modifiedAt: "2026-04-28T12:00:00.000Z",
    webViewLink: "https://drive.test/file",
    itemKind: "file",
    ...overrides,
  };
}

type TableUpdate = {
  table: string;
  patch: Record<string, unknown>;
  filters: Array<[string, unknown]>;
};

type TableInsert = {
  table: string;
  payload: unknown;
};

function action(overrides: Partial<DriveScanActionRecord>): DriveScanActionRecord {
  const id = overrides.id || "action-1";

  return {
    id,
    scan_item_id: overrides.scan_item_id || `${id}-item`,
    action_type: overrides.action_type || "move_to_process_folder",
    target_process_task_id: overrides.target_process_task_id ?? "process-1",
    target_folder_label: overrides.target_folder_label ?? "02-Inicial",
    target_drive_folder_id: overrides.target_drive_folder_id ?? "process-folder",
    before_payload: overrides.before_payload || {},
    after_payload: overrides.after_payload || {},
    confidence: overrides.confidence || "high",
    status: overrides.status || "proposed",
  };
}

function makeApplySupabase(params: {
  actions: DriveScanActionRecord[];
  items?: Record<string, Record<string, unknown>>;
  processes?: Record<string, Record<string, unknown>>;
  scanRun?: Record<string, unknown>;
}) {
  const updates: TableUpdate[] = [];
  const inserts: TableInsert[] = [];
  const scanRun = {
    id: "scan-run-1",
    tenant_id: "tenant-1",
    root_folder_id: "root-folder",
    counters: { filesScanned: params.actions.length },
    brain_task_id: "brain-task-1",
    brain_run_id: "brain-run-1",
    brain_step_id: "brain-step-1",
    ...params.scanRun,
  };
  const items = params.items || Object.fromEntries(params.actions.map((scanAction) => [
    scanAction.scan_item_id,
    {
      id: scanAction.scan_item_id,
      drive_file_id: `${scanAction.id}-file`,
      parent_folder_id: "source-folder",
      parent_path: ["Entrada"],
      name: `${scanAction.id}.pdf`,
    },
  ]));
  const processes = params.processes || {
    "process-1": {
      id: "process-1",
      tenant_id: "tenant-1",
      stage_id: "stage-1",
      title: "Acao revisional bancaria",
      client_name: "Maria Silva",
      process_number: "1234567-89.2024.8.26.0100",
      drive_link: "https://drive.google.com/drive/folders/process-folder",
      drive_folder_id: "process-folder",
      drive_structure_ready: true,
    },
  };

  listGoogleDriveChildrenMock.mockImplementation(async (_accessToken: string, folderId: string) => {
    if (folderId !== "source-folder") return [];
    return Object.values(items).map((item) => ({
      id: item.drive_file_id,
      name: item.name,
      mimeType: "application/pdf",
      parents: ["source-folder"],
    }));
  });

  function makeQuery(table: string) {
    const filters: Array<[string, unknown]> = [];
    let selectedIds: string[] | null = null;
    let selectedStatuses: string[] | null = null;
    let updatePatch: Record<string, unknown> | null = null;
    let insertPayload: unknown = null;

    const query: any = {
      select: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        filters.push([column, value]);
        return query;
      }),
      in: vi.fn((column: string, value: string[]) => {
        if (column === "id") selectedIds = value;
        if (column === "status") selectedStatuses = value;
        return query;
      }),
      update: vi.fn((patch: Record<string, unknown>) => {
        updatePatch = patch;
        return query;
      }),
      insert: vi.fn((payload: unknown) => {
        insertPayload = payload;
        inserts.push({ table, payload });
        return query;
      }),
      single: vi.fn(async () => ({ data: { id: `${table}-inserted` }, error: null })),
      maybeSingle: vi.fn(async () => {
        if (table === "drive_scan_runs") return { data: scanRun, error: null };

        if (table === "drive_scan_items") {
          const itemId = filters.find(([column]) => column === "id")?.[1] as string;
          return { data: items[itemId] || null, error: null };
        }

        if (table === "process_tasks") {
          const processId = filters.find(([column]) => column === "id")?.[1] as string;
          return { data: processes[processId] || null, error: null };
        }

        return { data: null, error: null };
      }),
      then: (resolve: (value: unknown) => void) => {
        if (updatePatch) {
          updates.push({ table, patch: updatePatch, filters });
          resolve({ data: null, error: null });
          return;
        }

        if (insertPayload !== null) {
          resolve({ data: { id: `${table}-inserted` }, error: null });
          return;
        }

        if (table === "drive_scan_actions") {
          let rows = params.actions;
          if (selectedIds) rows = rows.filter((row) => selectedIds?.includes(row.id));
          if (selectedStatuses) rows = rows.filter((row) => selectedStatuses?.includes(row.status));
          resolve({ data: rows, error: null });
          return;
        }

        resolve({ data: null, error: null });
      },
    };

    return query;
  }

  return {
    supabase: {
      from: vi.fn((table: string) => makeQuery(table)),
    },
    updates,
    inserts,
  };
}

describe("drive-document-scanner", () => {
  beforeEach(() => {
    createGoogleDriveFolderMock.mockReset();
    createGoogleDriveFolderStructureMock.mockReset();
    listGoogleDriveChildrenMock.mockReset();
    moveGoogleDriveFileMock.mockReset();
    syncProcessDocumentsMock.mockReset();

    createGoogleDriveFolderMock.mockResolvedValue({
      id: "created-process-folder",
      name: "Processo criado",
      webViewLink: "https://drive.google.com/drive/folders/created-process-folder",
    });
    createGoogleDriveFolderStructureMock.mockResolvedValue({
      "01-Documentos do Cliente": { id: "folder-client-docs" },
      "02-Inicial": { id: "folder-inicial" },
      "03-Contestacao": { id: "folder-contestacao" },
    });
    moveGoogleDriveFileMock.mockImplementation(async (_accessToken: string, input: { fileId: string }) => ({
      id: input.fileId,
      name: `${input.fileId}-moved.pdf`,
    }));
    syncProcessDocumentsMock.mockResolvedValue({
      memory: {},
      structure: {},
      documents: [],
      warnings: [],
    });
  });

  it("extracts CNJ numbers from names and paths", () => {
    expect(extractCnjNumbers("Pasta 1234567-89.2024.8.26.0100 inicial.pdf")).toEqual([
      "1234567-89.2024.8.26.0100",
    ]);
  });

  it("scores exact process number matches as high confidence", () => {
    const match = scoreDriveFileProcessMatch(file({
      name: "contestacao 1234567-89.2024.8.26.0100.pdf",
      parentPath: ["Acervo antigo"],
    }), process);

    expect(match?.confidence).toBe("high");
    expect(match?.score).toBeGreaterThanOrEqual(80);
    expect(match?.signals).toContain("process_number_exact");
  });

  it("uses already loaded party and OAB context as extra safe matching signals", () => {
    const match = scoreDriveFileProcessMatch(file({
      name: "documentos Joao Comprador OAB SP 123456.pdf",
      parentPath: ["Triagem"],
    }), {
      id: "process-2",
      title: "Acao de cobranca",
      partes: { polo_ativo: "Joao Comprador", polo_passivo: "Empresa Re" },
      oab_estado: "SP",
      oab_numero: "123456",
    });

    expect(match?.confidence).toBe("medium");
    expect(match?.signals).toEqual(expect.arrayContaining(["party_name", "oab_match"]));
    expect(match?.score).toBeGreaterThanOrEqual(45);
  });

  it("plans high confidence moves without side effects", () => {
    const plan = buildDriveScanPreviewPlan({
      processes: [process],
      items: [file({
        name: "peticao inicial 1234567-89.2024.8.26.0100.pdf",
      })],
    });

    expect(plan.counters.filesScanned).toBe(1);
    expect(plan.counters.proposedActions).toBe(1);
    expect(plan.actions[0]).toMatchObject({
      actionType: "move_to_process_folder",
      targetProcessTaskId: "process-1",
      targetFolderLabel: "02-Inicial",
      confidence: "high",
      status: "proposed",
    });
  });

  it("requires review when no process can be matched", () => {
    const plan = buildDriveScanPreviewPlan({
      processes: [process],
      items: [file({
        name: "comprovante sem identificacao.pdf",
      })],
    });

    expect(plan.counters.needsReview).toBe(1);
    expect(plan.actions[0]).toMatchObject({
      actionType: "request_review",
      status: "review_required",
    });
  });

  it("marks likely duplicates for human review", () => {
    const plan = buildDriveScanPreviewPlan({
      processes: [process],
      items: [
        file({ driveFileId: "file-1", name: "sentenca 1234567-89.2024.8.26.0100.pdf", sizeBytes: 999 }),
        file({ driveFileId: "file-2", name: "sentenca 1234567-89.2024.8.26.0100.pdf", sizeBytes: 999 }),
      ],
    });

    expect(plan.counters.duplicates).toBe(2);
    expect(plan.actions.every((action) => action.actionType === "mark_duplicate")).toBe(true);
    expect(plan.actions.every((action) => action.status === "review_required")).toBe(true);
  });

  it("applies only proposed high confidence move actions and marks review/duplicate/low confidence actions as skipped", async () => {
    const actions = [
      action({ id: "apply-high", status: "proposed", confidence: "high" }),
      action({ id: "skip-medium", status: "proposed", confidence: "medium" }),
      action({ id: "skip-low", status: "proposed", confidence: "low" }),
      action({ id: "skip-review-status", status: "review_required", confidence: "high" }),
      action({ id: "skip-duplicate", action_type: "mark_duplicate", status: "proposed", confidence: "low" }),
      action({ id: "skip-request-review", action_type: "request_review", status: "proposed", confidence: "low" }),
    ];
    const { supabase, updates, inserts } = makeApplySupabase({ actions });

    const result = await applyDriveDocumentScanActions({
      tenantId: "tenant-1",
      userId: "user-1",
      accessToken: "access-token-1",
      scanRunId: "scan-run-1",
      actionIds: actions.map((item) => item.id),
      supabase,
    });

    expect(result.counters).toEqual({
      applied: 1,
      skipped: 5,
      failed: 0,
      syncedProcesses: 1,
    });
    expect(result.applied).toEqual([
      expect.objectContaining({
        actionId: "apply-high",
        processTaskId: "process-1",
        fileName: "apply-high-file-moved.pdf",
      }),
    ]);
    expect(result.skipped).toEqual(expect.arrayContaining([
      { actionId: "skip-medium", reason: "confidence_not_high" },
      { actionId: "skip-low", reason: "confidence_not_high" },
      { actionId: "skip-review-status", reason: "action_not_approved_or_proposed" },
      { actionId: "skip-duplicate", reason: "review_only_action" },
      { actionId: "skip-request-review", reason: "review_only_action" },
    ]));
    expect(moveGoogleDriveFileMock).toHaveBeenCalledTimes(1);
    expect(moveGoogleDriveFileMock).toHaveBeenCalledWith("access-token-1", {
      fileId: "apply-high-file",
      addParentId: "folder-inicial",
      removeParentIds: ["source-folder"],
    });
    expect(syncProcessDocumentsMock).toHaveBeenCalledTimes(1);
    expect(syncProcessDocumentsMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      accessToken: "access-token-1",
      task: expect.objectContaining({ id: "process-1" }),
    }));
    expect(updates.filter((entry) => entry.table === "drive_scan_actions")).toEqual(expect.arrayContaining([
      expect.objectContaining({ patch: expect.objectContaining({ status: "applied" }) }),
      expect.objectContaining({ patch: expect.objectContaining({ status: "skipped", error_message: "Confianca insuficiente para aplicacao automatica." }) }),
      expect.objectContaining({ patch: expect.objectContaining({ status: "skipped", error_message: "Acao nao estava proposta/aprovada." }) }),
      expect.objectContaining({ patch: expect.objectContaining({ status: "skipped", error_message: "Acao exige revisao humana e nao move arquivo." }) }),
    ]));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "drive_scan_runs",
        patch: expect.objectContaining({
          status: "completed_with_warnings",
          counters: expect.objectContaining({
            apply: {
              applied: 1,
              skipped: 5,
              failed: 0,
              syncedProcesses: 1,
            },
          }),
        }),
      }),
    ]));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "brain_artifacts",
        payload: expect.objectContaining({
          artifact_type: "drive_document_organization_result",
          metadata: expect.objectContaining({
            human_review_preserved: true,
            external_side_effects: true,
          }),
        }),
      }),
    ]));
  });

  it("applies a medium confidence move after explicit human approval", async () => {
    const actions = [
      action({ id: "approved-medium", status: "approved", confidence: "medium" }),
    ];
    const { supabase } = makeApplySupabase({ actions });

    const result = await applyDriveDocumentScanActions({
      tenantId: "tenant-1",
      userId: "user-1",
      accessToken: "access-token-1",
      scanRunId: "scan-run-1",
      actionIds: actions.map((item) => item.id),
      supabase,
    });

    expect(result.counters).toEqual({
      applied: 1,
      skipped: 0,
      failed: 0,
      syncedProcesses: 1,
    });
    expect(moveGoogleDriveFileMock).toHaveBeenCalledWith("access-token-1", {
      fileId: "approved-medium-file",
      addParentId: "folder-inicial",
      removeParentIds: ["source-folder"],
    });
  });

  it("treats files already in the destination folder as idempotently applied", async () => {
    const actions = [
      action({ id: "already-moved", status: "proposed", confidence: "high" }),
    ];
    const { supabase, updates } = makeApplySupabase({ actions });
    listGoogleDriveChildrenMock.mockImplementation(async (_accessToken: string, folderId: string) => {
      if (folderId === "folder-inicial") {
        return [{ id: "already-moved-file", name: "already-there.pdf", parents: ["folder-inicial"] }];
      }
      return [];
    });

    const result = await applyDriveDocumentScanActions({
      tenantId: "tenant-1",
      userId: "user-1",
      accessToken: "access-token-1",
      scanRunId: "scan-run-1",
      actionIds: actions.map((item) => item.id),
      supabase,
    });

    expect(moveGoogleDriveFileMock).not.toHaveBeenCalled();
    expect(result.counters).toEqual({
      applied: 1,
      skipped: 0,
      failed: 0,
      syncedProcesses: 1,
    });
    expect(result.applied).toEqual([
      { actionId: "already-moved", processTaskId: "process-1", fileName: "already-there.pdf" },
    ]);
    expect(updates.filter((entry) => entry.table === "drive_scan_actions")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        patch: expect.objectContaining({
          status: "applied",
          after_payload: expect.objectContaining({
            idempotent: true,
            idempotency_reason: "file_already_in_target",
          }),
        }),
      }),
    ]));
  });

  it("skips safely when the original parent no longer contains the file and the destination is not confirmed", async () => {
    const actions = [
      action({ id: "missing-original", status: "proposed", confidence: "high" }),
    ];
    const { supabase, updates } = makeApplySupabase({ actions });
    listGoogleDriveChildrenMock.mockResolvedValue([]);

    const result = await applyDriveDocumentScanActions({
      tenantId: "tenant-1",
      userId: "user-1",
      accessToken: "access-token-1",
      scanRunId: "scan-run-1",
      actionIds: actions.map((item) => item.id),
      supabase,
    });

    expect(moveGoogleDriveFileMock).not.toHaveBeenCalled();
    expect(syncProcessDocumentsMock).not.toHaveBeenCalled();
    expect(result.counters).toEqual({
      applied: 0,
      skipped: 1,
      failed: 0,
      syncedProcesses: 0,
    });
    expect(result.skipped).toEqual([
      { actionId: "missing-original", reason: "original_parent_missing" },
    ]);
    expect(updates.filter((entry) => entry.table === "drive_scan_actions")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        patch: expect.objectContaining({
          status: "skipped",
          error_message: "Arquivo nao esta mais na pasta original; confirme o destino antes de reaplicar.",
          after_payload: expect.objectContaining({
            idempotency_reason: "original_parent_missing_without_target_evidence",
          }),
        }),
      }),
    ]));
  });

  it("reverts applied move actions back to the original Drive parent without deleting memory", async () => {
    const actions = [
      action({
        id: "revert-applied",
        status: "applied" as any,
        before_payload: {
          parent_folder_id: "old-parent",
          parent_path: ["Entrada antiga"],
          name: "inicial.pdf",
        },
        after_payload: {
          moved_file_id: "revert-applied-file",
          target_drive_folder_id: "folder-inicial",
          target_folder_label: "02-Inicial",
        },
      }),
    ];
    const { supabase, updates, inserts } = makeApplySupabase({ actions });
    moveGoogleDriveFileMock.mockResolvedValueOnce({
      id: "revert-applied-file",
      name: "inicial.pdf",
    });

    const result = await revertDriveDocumentScanActions({
      tenantId: "tenant-1",
      userId: "user-1",
      accessToken: "access-token-1",
      scanRunId: "scan-run-1",
      actionIds: ["revert-applied"],
      supabase,
    });

    expect(moveGoogleDriveFileMock).toHaveBeenCalledWith("access-token-1", {
      fileId: "revert-applied-file",
      addParentId: "old-parent",
      removeParentIds: ["folder-inicial"],
    });
    expect(result.counters).toEqual({
      reverted: 1,
      skipped: 0,
      failed: 0,
    });
    expect(result.reverted).toEqual([
      {
        actionId: "revert-applied",
        fileId: "revert-applied-file",
        restoredParentFolderId: "old-parent",
      },
    ]);
    expect(updates.filter((entry) => entry.table === "drive_scan_actions")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        patch: expect.objectContaining({
          status: "reverted",
          error_message: null,
          after_payload: expect.objectContaining({
            reverted: true,
            reverted_by: "user-1",
            restored_parent_folder_id: "old-parent",
            removed_parent_folder_id: "folder-inicial",
          }),
        }),
        filters: expect.arrayContaining([["id", "revert-applied"]]),
      }),
    ]));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "drive_scan_items",
        patch: { status: "preview" },
      }),
      expect.objectContaining({
        table: "drive_scan_runs",
        patch: expect.objectContaining({
          status: "completed",
          counters: expect.objectContaining({
            revert: {
              reverted: 1,
              skipped: 0,
              failed: 0,
            },
          }),
        }),
      }),
    ]));
    expect(inserts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "brain_artifacts",
        payload: expect.objectContaining({
          artifact_type: "drive_document_organization_revert",
          metadata: expect.objectContaining({
            documents_deleted: false,
            memory_deleted: false,
            external_side_effects: true,
          }),
        }),
      }),
    ]));
  });

  it("records partial failures and syncs only processes with successfully moved files", async () => {
    const actions = [
      action({ id: "apply-ok", target_process_task_id: "process-1" }),
      action({ id: "apply-fails", target_process_task_id: "process-2" }),
    ];
    const { supabase, updates } = makeApplySupabase({
      actions,
      processes: {
        "process-1": {
          id: "process-1",
          tenant_id: "tenant-1",
          stage_id: "stage-1",
          title: "Processo ok",
          drive_folder_id: "process-folder",
          drive_link: "https://drive.google.com/drive/folders/process-folder",
          drive_structure_ready: true,
        },
        "process-2": {
          id: "process-2",
          tenant_id: "tenant-1",
          stage_id: "stage-2",
          title: "Processo com falha",
          drive_folder_id: "process-folder-2",
          drive_link: "https://drive.google.com/drive/folders/process-folder-2",
          drive_structure_ready: true,
        },
      },
    });
    moveGoogleDriveFileMock
      .mockResolvedValueOnce({ id: "apply-ok-file", name: "ok-moved.pdf" })
      .mockRejectedValueOnce(new Error("drive_move_failed"));

    const result = await applyDriveDocumentScanActions({
      tenantId: "tenant-1",
      userId: "user-1",
      accessToken: "access-token-1",
      scanRunId: "scan-run-1",
      actionIds: actions.map((item) => item.id),
      supabase,
    });

    expect(result.counters).toEqual({
      applied: 1,
      skipped: 0,
      failed: 1,
      syncedProcesses: 1,
    });
    expect(result.failed).toEqual([{ actionId: "apply-fails", error: "drive_move_failed" }]);
    expect(moveGoogleDriveFileMock).toHaveBeenCalledTimes(2);
    expect(syncProcessDocumentsMock).toHaveBeenCalledTimes(1);
    expect(syncProcessDocumentsMock).toHaveBeenCalledWith(expect.objectContaining({
      task: expect.objectContaining({ id: "process-1" }),
    }));
    expect(updates.filter((entry) => entry.table === "drive_scan_actions")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        patch: expect.objectContaining({ status: "applied" }),
        filters: expect.arrayContaining([["id", "apply-ok"]]),
      }),
      expect.objectContaining({
        patch: expect.objectContaining({ status: "failed", error_message: "drive_move_failed" }),
        filters: expect.arrayContaining([["id", "apply-fails"]]),
      }),
    ]));
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        table: "drive_scan_runs",
        patch: expect.objectContaining({
          status: "completed_with_warnings",
          error_message: "1 acao(oes) falharam.",
          counters: expect.objectContaining({
            apply: {
              applied: 1,
              skipped: 0,
              failed: 1,
              syncedProcesses: 1,
            },
          }),
        }),
      }),
    ]));
  });
});
