import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  fromMock,
  updateCalls,
  insertCalls,
  exportPdfMock,
  getVersionMock,
  loadDeltaMock,
  uploadMock,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  updateCalls: [] as Array<{ table: string; payload: any }>,
  insertCalls: [] as Array<{ table: string; payload: any }>,
  exportPdfMock: vi.fn(),
  getVersionMock: vi.fn(),
  loadDeltaMock: vi.fn(),
  uploadMock: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: fromMock },
}));

vi.mock("@/lib/juridico/export-piece-pdf", () => ({
  exportLegalPieceToPdf: exportPdfMock,
}));

vi.mock("@/lib/juridico/export-piece-docx", () => ({
  exportLegalPieceToDocx: vi.fn(),
}));

vi.mock("@/lib/lex/draft-versions", () => ({
  getProcessDraftVersionById: getVersionMock,
  loadDraftLearningLoopDelta: loadDeltaMock,
}));

vi.mock("@/lib/services/google-drive", () => ({
  buildGoogleDriveFolderUrl: vi.fn((id: string) => `https://drive.google.com/drive/folders/${id}`),
  uploadGoogleDriveFile: uploadMock,
}));

import { publishLegalPiecePremium } from "./publish-piece-premium";

function chain(table: string, data: any) {
  let operation: "update" | "insert" | null = null;
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
    returns: vi.fn(async () => ({ data: Array.isArray(data) ? data : [], error: null })),
    update: vi.fn((payload: any) => {
      operation = "update";
      updateCalls.push({ table, payload });
      return query;
    }),
    insert: vi.fn((payload: any) => {
      operation = "insert";
      insertCalls.push({ table, payload });
      return query;
    }),
    then(resolve: (value: any) => void) {
      resolve({ data: operation ? data : data, error: null });
    },
  };
  return query;
}

describe("publishLegalPiecePremium", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateCalls.length = 0;
    insertCalls.length = 0;

    getVersionMock.mockResolvedValue({
      id: "version-1",
      process_task_id: "task-1",
      metadata: {
        citation_checklist: { pending_validations: ["Tema STJ"] },
      },
    });
    loadDeltaMock.mockResolvedValue({ changed: true });
    exportPdfMock.mockResolvedValue(Buffer.from("pdf"));
    uploadMock.mockResolvedValue({
      id: "drive-file-1",
      name: "contestacao-processo.pdf",
      webViewLink: "https://drive.google.com/file/d/drive-file-1/view",
      modifiedTime: "2026-06-10T12:00:00.000Z",
    });

    fromMock.mockImplementation((table: string) => {
      if (table === "process_tasks") {
        return chain(table, {
          id: "task-1",
          title: "Processo Teste",
          client_name: "Cliente Teste",
          process_number: "0000001-11.2026.8.26.0100",
          drive_link: null,
          drive_folder_id: "root-folder",
        });
      }
      if (table === "tenant_legal_profiles") return chain(table, null);
      if (table === "tenant_legal_templates") return chain(table, null);
      if (table === "tenant_legal_assets") return chain(table, []);
      if (table === "process_document_memory") {
        return chain(table, {
          folder_structure: {
            "09-Pecas Finais": {
              id: "final-folder",
              name: "09-Pecas Finais",
              webViewLink: "https://drive.google.com/drive/folders/final-folder",
            },
          },
        });
      }
      if (table === "process_draft_versions") {
        return chain(table, {
          metadata: {
            citation_checklist: { pending_validations: ["Tema STJ"] },
          },
        });
      }
      if (table === "system_event_logs") return chain(table, null);
      return chain(table, null);
    });
  });

  it("registra metadata e evento quando publish premium usa override de fonte", async () => {
    await publishLegalPiecePremium({
      tenantId: "tenant-1",
      taskId: "task-1",
      accessToken: "drive-token",
      pieceType: "contestacao",
      pieceLabel: "Contestacao",
      draftMarkdown: "# Contestacao",
      versionId: "version-1",
      actorId: "user-1",
      sourceGateOverride: {
        approved: true,
        reason: "Responsavel validou manualmente o Tema STJ antes da publicacao.",
      },
    });

    expect(updateCalls).toContainEqual(expect.objectContaining({
      table: "process_draft_versions",
      payload: expect.objectContaining({
        metadata: expect.objectContaining({
          legal_source_gate_premium_publish: expect.objectContaining({
            overridden: true,
            override_reason: "Responsavel validou manualmente o Tema STJ antes da publicacao.",
            overridden_by: "user-1",
            source_summary: expect.objectContaining({
              pendingValidationCount: 1,
            }),
          }),
        }),
      }),
    }));
    expect(insertCalls).toContainEqual(expect.objectContaining({
      table: "system_event_logs",
      payload: expect.objectContaining({
        tenant_id: "tenant-1",
        user_id: "user-1",
        event_name: "legal_piece_premium_source_gate_override",
        status: "approved_override",
      }),
    }));
  });
});
