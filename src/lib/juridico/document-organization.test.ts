import { describe, expect, it } from "vitest";
import {
  buildDocumentOrganizationSummary,
  inferProcessDocumentOrganization,
  planProcessDocumentMove,
} from "./document-organization";

describe("document organization", () => {
  it("classifies old-system uploads into legal folders by filename", () => {
    expect(inferProcessDocumentOrganization({ name: "contestacao_antigo_sistema.pdf" })).toMatchObject({
      folderLabel: "03-Contestacao",
      documentType: "contestacao",
      confidence: "high",
      needsHumanReview: false,
    });

    expect(inferProcessDocumentOrganization({ name: "CNIS e PPP cliente.pdf" })).toMatchObject({
      folderLabel: "06-Provas",
      documentType: "prova",
    });
  });

  it("respects explicit folder labels when the user chooses one", () => {
    expect(inferProcessDocumentOrganization({
      name: "arquivo-sem-nome.pdf",
      folderLabel: "08-Recursos",
    })).toMatchObject({
      folderLabel: "08-Recursos",
      documentType: "recurso",
      needsHumanReview: false,
    });
  });

  it("summarizes the document inventory for the organizer response", () => {
    const summary = buildDocumentOrganizationSummary([
      {
        name: "contestacao.pdf",
        document_type: "contestacao",
        extraction_status: "extracted",
        classification_status: "classified",
        folder_label: "03-Contestacao",
      },
      {
        name: "foto.jpeg",
        document_type: "prova",
        extraction_status: "skipped",
        classification_status: "pending",
        folder_label: "06-Provas",
      },
    ]);

    expect(summary.total).toBe(2);
    expect(summary.extracted).toBe(1);
    expect(summary.pendingReviewCount).toBe(1);
    expect(summary.byFolder["03-Contestacao"]).toBe(1);
  });

  it("plans Drive moves only when confidence is sufficient", () => {
    const availableFolders = {
      "03-Contestacao": { id: "folder-contestacao" },
      "01-Documentos do Cliente": { id: "folder-cliente" },
    };

    expect(planProcessDocumentMove({
      fileId: "file-1",
      name: "contestacao_antigo_sistema.pdf",
      currentFolderId: "root",
      currentFolderLabel: "Raiz do Processo",
      availableFolders,
    })).toMatchObject({
      action: "move",
      targetFolderId: "folder-contestacao",
    });

    expect(planProcessDocumentMove({
      fileId: "file-2",
      name: "arquivo-desconhecido.bin",
      currentFolderId: "root",
      currentFolderLabel: "Raiz do Processo",
      availableFolders,
    })).toMatchObject({
      action: "review",
      reason: "low_confidence",
    });
  });
});
