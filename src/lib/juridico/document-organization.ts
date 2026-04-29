import { DEFAULT_PROCESS_DOCUMENT_FOLDERS } from "@/lib/services/google-drive";

export type ProcessDocumentOrganization = {
  folderLabel: (typeof DEFAULT_PROCESS_DOCUMENT_FOLDERS)[number] | "Raiz do Processo";
  documentType: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  needsHumanReview: boolean;
};

type Rule = {
  folderLabel: ProcessDocumentOrganization["folderLabel"];
  documentType: string;
  confidence: ProcessDocumentOrganization["confidence"];
  reason: string;
  patterns: RegExp[];
};

const DOCUMENT_RULES: Rule[] = [
  {
    folderLabel: "03-Contestacao",
    documentType: "contestacao",
    confidence: "high",
    reason: "Identificado como contestacao ou defesa da parte contraria.",
    patterns: [/contesta[cç][aã]o/i, /\bdefesa\b/i],
  },
  {
    folderLabel: "02-Inicial",
    documentType: "inicial",
    confidence: "high",
    reason: "Identificado como peticao inicial ou ajuizamento.",
    patterns: [/peti[cç][aã]o\s+inicial/i, /\binicial\b/i, /ajuizamento/i],
  },
  {
    folderLabel: "05-Decisoes e Sentencas",
    documentType: "sentenca",
    confidence: "high",
    reason: "Identificado como sentenca, decisao ou liminar.",
    patterns: [/senten[cç]a/i, /decis[aã]o/i, /liminar/i, /ac[oó]rd[aã]o/i],
  },
  {
    folderLabel: "08-Recursos",
    documentType: "recurso",
    confidence: "high",
    reason: "Identificado como recurso, agravo, apelacao ou embargos.",
    patterns: [/recurso/i, /apela[cç][aã]o/i, /agravo/i, /embargos/i, /contrarraz[oõ]es/i],
  },
  {
    folderLabel: "07-Prazos e Audiencias",
    documentType: "prazo_audiencia",
    confidence: "medium",
    reason: "Identificado como audiencia, intimacao, citacao ou pauta.",
    patterns: [/audi[eê]ncia/i, /intima[cç][aã]o/i, /cita[cç][aã]o/i, /\bpauta\b/i, /mandado/i],
  },
  {
    folderLabel: "06-Provas",
    documentType: "prova",
    confidence: "medium",
    reason: "Identificado como prova, laudo, contrato, conversa ou comprovante.",
    patterns: [/prova/i, /laudo/i, /contrato/i, /comprovante/i, /extrato/i, /print/i, /whatsapp/i, /mensagem/i, /holerite/i, /ctps/i, /cnis/i, /\bppp\b/i],
  },
  {
    folderLabel: "04-Manifestacoes",
    documentType: "manifestacao",
    confidence: "medium",
    reason: "Identificado como manifestacao, replica ou peticao intermediaria.",
    patterns: [/manifesta[cç][aã]o/i, /r[eé]plica/i, /peti[cç][aã]o\s+intermedi[aá]ria/i],
  },
  {
    folderLabel: "09-Pecas Finais",
    documentType: "peca_final",
    confidence: "medium",
    reason: "Identificado como peca final, protocolo final ou arquivo pronto para entrega.",
    patterns: [/pe[cç]a\s+final/i, /vers[aã]o\s+final/i, /protocolo\s+final/i, /publicad[ao]/i],
  },
  {
    folderLabel: "01-Documentos do Cliente",
    documentType: "documento_cliente",
    confidence: "medium",
    reason: "Identificado como documento pessoal, procuracao, honorarios ou documento base do cliente.",
    patterns: [/rg\b/i, /\bcpf\b/i, /cnh/i, /comprovante\s+de\s+resid[eê]ncia/i, /procura[cç][aã]o/i, /honor[aá]rios/i, /documento\s+pessoal/i],
  },
];

function normalize(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferFromFolderLabel(folderLabel: string | null | undefined): ProcessDocumentOrganization | null {
  const normalized = normalize(folderLabel).toLowerCase();
  const folder = DEFAULT_PROCESS_DOCUMENT_FOLDERS.find((item) => normalize(item).toLowerCase() === normalized);
  if (!folder) return null;

  const rule = DOCUMENT_RULES.find((candidate) => candidate.folderLabel === folder);
  return {
    folderLabel: folder,
    documentType: rule?.documentType || "geral",
    confidence: rule?.confidence || "medium",
    reason: `Pasta informada pelo usuario: ${folder}.`,
    needsHumanReview: false,
  };
}

export function inferProcessDocumentOrganization(input: {
  name: string;
  mimeType?: string | null;
  textSample?: string | null;
  folderLabel?: string | null;
}): ProcessDocumentOrganization {
  const folderInferred = inferFromFolderLabel(input.folderLabel);
  if (folderInferred && input.folderLabel !== "Raiz do Processo") {
    return folderInferred;
  }

  const target = normalize(`${input.name} ${input.textSample || ""}`);
  for (const rule of DOCUMENT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(target))) {
      return {
        folderLabel: rule.folderLabel,
        documentType: rule.documentType,
        confidence: rule.confidence,
        reason: rule.reason,
        needsHumanReview: rule.confidence !== "high",
      };
    }
  }

  if ((input.mimeType || "").startsWith("image/")) {
    return {
      folderLabel: "06-Provas",
      documentType: "prova",
      confidence: "low",
      reason: "Arquivo de imagem tratado como prova potencial ate revisao humana.",
      needsHumanReview: true,
    };
  }

  return {
    folderLabel: "01-Documentos do Cliente",
    documentType: "documento_cliente",
    confidence: "low",
    reason: "Nao houve sinal juridico forte; arquivo enviado para documentos do cliente por seguranca.",
    needsHumanReview: true,
  };
}

export function buildDocumentOrganizationSummary(documents: Array<{
  name?: string | null;
  document_type?: string | null;
  extraction_status?: string | null;
  classification_status?: string | null;
  folder_label?: string | null;
}>) {
  const total = documents.length;
  const extracted = documents.filter((document) => document.extraction_status === "extracted").length;
  const pendingReview = documents.filter((document) =>
    document.classification_status === "pending" || document.extraction_status === "error"
  );
  const byFolder = documents.reduce<Record<string, number>>((acc, document) => {
    const folder = document.folder_label || "Sem pasta";
    acc[folder] = (acc[folder] || 0) + 1;
    return acc;
  }, {});

  return {
    total,
    extracted,
    pendingReviewCount: pendingReview.length,
    byFolder,
    pendingReview: pendingReview.slice(0, 6).map((document) => ({
      name: document.name || "Documento sem nome",
      folderLabel: document.folder_label || null,
      documentType: document.document_type || null,
      extractionStatus: document.extraction_status || null,
      classificationStatus: document.classification_status || null,
    })),
  };
}

export function planProcessDocumentMove(input: {
  fileId: string;
  name: string;
  mimeType?: string | null;
  currentFolderId?: string | null;
  currentFolderLabel: string;
  availableFolders: Record<string, { id: string } | undefined>;
}) {
  const organization = inferProcessDocumentOrganization({
    name: input.name,
    mimeType: input.mimeType,
  });
  const targetFolder = input.availableFolders[organization.folderLabel];
  const alreadyInTarget = Boolean(targetFolder?.id && input.currentFolderId === targetFolder.id);

  if (!targetFolder?.id) {
    return { action: "skip" as const, reason: "target_folder_missing", organization };
  }

  if (alreadyInTarget) {
    return { action: "skip" as const, reason: "already_in_target", organization };
  }

  if (organization.confidence === "low") {
    return { action: "review" as const, reason: "low_confidence", organization };
  }

  return {
    action: "move" as const,
    reason: organization.reason,
    organization,
    targetFolderId: targetFolder.id,
  };
}
