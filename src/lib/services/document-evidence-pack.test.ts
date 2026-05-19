import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock("@/lib/brain/artifacts", () => ({
  createBrainArtifact: vi.fn(),
}));

import { createBrainArtifact } from "@/lib/brain/artifacts";
import { buildDocumentEvidencePackFromRows, persistDocumentEvidencePack } from "./document-evidence-pack";

const createBrainArtifactMock = vi.mocked(createBrainArtifact);

const processRow = {
  id: "task-1",
  title: "Acao revisional",
  client_name: "Maria Silva",
  process_number: "0000000-00.2026.8.26.0000",
  drive_link: "https://drive.test/process",
  drive_folder_id: "folder-1",
};

function documentRow(overrides: Record<string, unknown>) {
  return {
    id: "doc-1",
    drive_file_id: "drive-doc-1",
    name: "Peticao inicial.pdf",
    document_type: "inicial",
    folder_label: "02-Inicial",
    web_view_link: "https://drive.test/doc-1",
    modified_at: "2026-05-18T10:00:00.000Z",
    mime_type: "application/pdf",
    size_bytes: 1200,
    classification_status: "classified",
    extraction_status: "extracted",
    ...overrides,
  } as any;
}

function contentRow(overrides: Record<string, unknown>) {
  return {
    process_document_id: "doc-1",
    normalized_text: "Texto extraido do documento com fatos verificaveis.",
    excerpt: "Texto extraido do documento com fatos verificaveis.",
    extraction_status: "extracted",
    extraction_error: null,
    page_count: 3,
    ...overrides,
  } as any;
}

function makePersistSupabase() {
  let brainTaskInsertPayload: unknown = null;

  const supabase = {
    from: vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        insert: vi.fn((payload: unknown) => {
          if (table === "brain_tasks") brainTaskInsertPayload = payload;
          return chain;
        }),
        maybeSingle: vi.fn(async () => {
          if (table === "process_tasks") return { data: processRow, error: null };
          if (table === "process_document_memory") {
            return {
              data: {
                document_count: 2,
                sync_status: "synced",
                last_synced_at: "2026-05-18T10:30:00.000Z",
                summary_master: "Acervo sincronizado.",
                missing_documents: [],
                key_documents: [{ id: "drive-doc-1" }],
                case_brain_task_id: null,
              },
              error: null,
            };
          }

          return { data: null, error: null };
        }),
        order: vi.fn(async () => ({
          data: [
            documentRow({ id: "doc-1", drive_file_id: "drive-doc-1", folder_label: "02-Inicial" }),
            documentRow({ id: "doc-2", drive_file_id: "drive-doc-2", name: "Contestacao.pdf", folder_label: "03-Contestacao", document_type: "contestacao" }),
          ],
          error: null,
        })),
        in: vi.fn(async () => ({
          data: [
            contentRow({ process_document_id: "doc-1" }),
            contentRow({ process_document_id: "doc-2", excerpt: "Contestacao extraida." }),
          ],
          error: null,
        })),
        single: vi.fn(async () => ({ data: { id: "brain-task-created" }, error: null })),
      };

      return chain;
    }),
  };

  return { supabase, getBrainTaskInsertPayload: () => brainTaskInsertPayload };
}

describe("document evidence pack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createBrainArtifactMock.mockResolvedValue({ id: "artifact-1" } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds a ready fact citation pack from complete extracted documents", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T12:00:00.000Z"));

    const pack = buildDocumentEvidencePackFromRows({
      process: processRow,
      generatedAt: "2026-05-18T12:00:00.000Z",
      memory: {
        document_count: 3,
        sync_status: "synced",
        last_synced_at: "2026-05-18T10:30:00.000Z",
        summary_master: "Acervo completo.",
        missing_documents: [],
        key_documents: [{ id: "drive-doc-1", name: "Peticao inicial.pdf" }],
      },
      documents: [
        documentRow({ id: "doc-1", drive_file_id: "drive-doc-1", folder_label: "02-Inicial", document_type: "inicial" }),
        documentRow({ id: "doc-2", drive_file_id: "drive-doc-2", name: "Contestacao.pdf", folder_label: "03-Contestacao", document_type: "contestacao" }),
        documentRow({ id: "doc-3", drive_file_id: "drive-doc-3", name: "Contrato.pdf", folder_label: "06-Provas", document_type: "prova" }),
      ],
      contents: [
        contentRow({ process_document_id: "doc-1" }),
        contentRow({ process_document_id: "doc-2", excerpt: "Contestacao extraida." }),
        contentRow({ process_document_id: "doc-3", excerpt: "Contrato extraido." }),
      ],
    });

    expect(pack.documentMemory.freshness).toBe("fresh");
    expect(pack.citationChecklist.readyForFactCitations).toBe(true);
    expect(pack.factBasis.length).toBeGreaterThan(0);
    expect(pack.gaps).toHaveLength(0);
    expect(pack.risks).toHaveLength(0);
  });

  it("flags essential missing documents from document memory", () => {
    const pack = buildDocumentEvidencePackFromRows({
      process: processRow,
      memory: {
        document_count: 1,
        sync_status: "synced",
        last_synced_at: "2026-05-18T10:30:00.000Z",
        summary_master: "Falta contestacao.",
        missing_documents: ["03-Contestacao"],
        key_documents: [],
      },
      documents: [documentRow({})],
      contents: [contentRow({})],
      generatedAt: "2026-05-18T12:00:00.000Z",
    });

    expect(pack.gaps).toContainEqual(expect.objectContaining({
      code: "missing_document",
      severity: "high",
      label: "Documento essencial ausente: 03-Contestacao.",
    }));
    expect(pack.citationChecklist.readyForFactCitations).toBe(false);
  });

  it("flags documents without extracted text", () => {
    const pack = buildDocumentEvidencePackFromRows({
      process: processRow,
      memory: {
        document_count: 1,
        sync_status: "synced",
        last_synced_at: "2026-05-18T10:30:00.000Z",
        summary_master: "Documento ainda sem texto.",
        missing_documents: [],
        key_documents: [],
      },
      documents: [documentRow({ extraction_status: "pending" })],
      contents: [],
      generatedAt: "2026-05-18T12:00:00.000Z",
    });

    expect(pack.factBasis).toHaveLength(0);
    expect(pack.gaps).toContainEqual(expect.objectContaining({ code: "no_text", severity: "medium", documentId: "doc-1" }));
    expect(pack.risks).toContainEqual(expect.objectContaining({ code: "unextracted_sources", severity: "high" }));
    expect(pack.citationChecklist.readyForFactCitations).toBe(false);
  });

  it("identifies probable duplicate files by normalized name and size", () => {
    const pack = buildDocumentEvidencePackFromRows({
      process: processRow,
      memory: {
        document_count: 2,
        sync_status: "synced",
        last_synced_at: "2026-05-18T10:30:00.000Z",
        summary_master: "Duplicidade provavel.",
        missing_documents: [],
        key_documents: [],
      },
      documents: [
        documentRow({ id: "doc-1", drive_file_id: "drive-doc-1", name: "Contrato.pdf", size_bytes: 900 }),
        documentRow({ id: "doc-2", drive_file_id: "drive-doc-2", name: "contrato.PDF", size_bytes: 900 }),
      ],
      contents: [
        contentRow({ process_document_id: "doc-1" }),
        contentRow({ process_document_id: "doc-2" }),
      ],
      generatedAt: "2026-05-18T12:00:00.000Z",
    });

    expect(pack.risks).toContainEqual(expect.objectContaining({
      code: "probable_duplicate",
      documentIds: ["doc-1", "doc-2"],
    }));
  });

  it("flags stale document memory", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T12:00:00.000Z"));

    const pack = buildDocumentEvidencePackFromRows({
      process: processRow,
      memory: {
        document_count: 1,
        sync_status: "synced",
        last_synced_at: "2026-05-01T10:30:00.000Z",
        summary_master: "Memoria antiga.",
        missing_documents: [],
        key_documents: [],
      },
      documents: [documentRow({})],
      contents: [contentRow({})],
      generatedAt: "2026-05-18T12:00:00.000Z",
    });

    expect(pack.documentMemory.freshness).toBe("stale");
    expect(pack.gaps).toContainEqual(expect.objectContaining({ code: "memory_stale", severity: "medium" }));
    expect(pack.risks).toContainEqual(expect.objectContaining({ code: "stale_memory", severity: "medium" }));
  });

  it("flags missing document memory when the repository was not synced", () => {
    const pack = buildDocumentEvidencePackFromRows({
      process: processRow,
      memory: null,
      documents: [],
      contents: [],
      generatedAt: "2026-05-18T12:00:00.000Z",
    });

    expect(pack.documentMemory.freshness).toBe("missing");
    expect(pack.gaps).toContainEqual(expect.objectContaining({ code: "memory_missing", severity: "high" }));
    expect(pack.risks).toContainEqual(expect.objectContaining({ code: "low_document_coverage", severity: "high" }));
    expect(pack.citationChecklist.readyForFactCitations).toBe(false);
  });

  it("persists the pack as a brain artifact using a fallback brain task", async () => {
    const { supabase, getBrainTaskInsertPayload } = makePersistSupabase();

    const result = await persistDocumentEvidencePack({
      tenantId: "tenant-1",
      processTaskId: "task-1",
      userId: "user-1",
      supabase: supabase as any,
    });

    expect(getBrainTaskInsertPayload()).toEqual(expect.objectContaining({
      tenant_id: "tenant-1",
      created_by: "user-1",
      module: "documentos",
      status: "completed",
      task_input: { process_task_id: "task-1" },
    }));
    expect(createBrainArtifactMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      taskId: "brain-task-created",
      artifactType: "document_evidence_pack",
      sourceModule: "documentos",
      metadata: expect.objectContaining({
        process_task_id: "task-1",
        document_count: 2,
        evidence_pack: expect.objectContaining({
          citationChecklist: expect.objectContaining({ readyForFactCitations: true }),
        }),
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      artifactId: "artifact-1",
      brainTaskId: "brain-task-created",
      pack: expect.objectContaining({ artifactId: "artifact-1" }),
    }));
  });
});
