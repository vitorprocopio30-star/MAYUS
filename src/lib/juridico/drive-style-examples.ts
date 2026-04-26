import { buildTenantGoogleDriveServiceRequest, getTenantGoogleDriveContext } from '@/lib/services/google-drive-tenant';
import {
  downloadGoogleDriveFile,
  isGoogleDriveFolder,
  listGoogleDriveChildren,
} from '@/lib/services/google-drive';

type DriveFileRecord = {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
};

type StyleExampleReference = {
  id: string;
  name: string;
  modifiedAt: string | null;
  webViewLink: string | null;
  textExcerpt: string;
};

export type DriveStyleReferencePacket = {
  folderName: string | null;
  packet: string;
  warnings: string[];
  references: StyleExampleReference[];
};

const STYLE_FOLDER_HINTS = [
  'modelos e peticoes',
  'modelos e petições',
  'modelos',
  'peticoes',
  'petições',
];

const MAX_STYLE_FILES = 4;
const MAX_STYLE_CHARS_PER_FILE = 5000;

function normalizeText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getFileExtension(name: string) {
  const parts = name.toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

function shouldAttemptExtraction(name: string, mimeType: string | null | undefined) {
  const extension = getFileExtension(name);
  if ((mimeType || '').startsWith('application/vnd.google-apps')) return false;
  if ((mimeType || '').startsWith('text/')) return true;
  if ((mimeType || '') === 'application/pdf') return true;
  if ((mimeType || '') === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
  return ['txt', 'md', 'csv', 'pdf', 'docx'].includes(extension);
}

function sanitizeExtractedText(text: string | null | undefined) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractDocumentText(name: string, mimeType: string | null | undefined, bytes: Uint8Array) {
  const extension = getFileExtension(name);

  if ((mimeType || '').startsWith('text/') || ['txt', 'md', 'csv'].includes(extension)) {
    return sanitizeExtractedText(new TextDecoder('utf-8').decode(bytes));
  }

  if ((mimeType || '') === 'application/pdf' || extension === 'pdf') {
    const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buffer: Buffer) => Promise<{ text?: string }>;
    const parsed = await pdfParse(Buffer.from(bytes));
    return sanitizeExtractedText(parsed?.text || '');
  }

  if ((mimeType || '') === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || extension === 'docx') {
    const mammothModule = await import('mammoth');
    const mammoth = (mammothModule as any).default || mammothModule;
    const parsed = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return sanitizeExtractedText(parsed?.value || '');
  }

  return '';
}

function findStyleFolder(children: DriveFileRecord[]) {
  const folders = children.filter((item) => isGoogleDriveFolder(item as Pick<DriveFileRecord, 'mimeType'>));
  const normalizedFolders = folders.map((folder) => ({ folder, normalized: normalizeText(folder.name || '') }));

  for (const hint of STYLE_FOLDER_HINTS) {
    const normalizedHint = normalizeText(hint);
    const match = normalizedFolders.find((item) => item.normalized.includes(normalizedHint));
    if (match) return match.folder;
  }

  return null;
}

function scoreStyleFile(file: StyleExampleReference, normalizedPieceInput: string, normalizedFamilyLabel: string) {
  const target = normalizeText(`${file.name} ${file.textExcerpt.slice(0, 1200)}`);
  let score = 0;
  if (normalizedPieceInput && target.includes(normalizedPieceInput)) score += 10;
  if (normalizedFamilyLabel && target.includes(normalizedFamilyLabel)) score += 7;
  if (/replica|contestacao|apelacao|memoriais|embargos/.test(target)) score += 2;
  return score;
}

function buildPacket(folderName: string | null, references: StyleExampleReference[]) {
  if (references.length === 0) {
    return 'Nenhum modelo institucional do Google Drive foi carregado para esta peca.';
  }

  return [
    `Pasta institucional do Drive: ${folderName || 'MODELOS E PETICOES'}`,
    'Use os modelos abaixo como referencia obrigatoria de tom, densidade, organizacao dos capitulos, forma de impugnacao e fechamento.',
    'Nunca copie fatos, nomes, pedidos especificos ou dados concretos dos modelos. Extraia apenas estilo, estrutura, profundidade e tecnica redacional.',
    ...references.map((reference, index) => [
      `MODELO ${index + 1}`,
      `nome: ${reference.name}`,
      `modificado_em: ${reference.modifiedAt || 'nao informado'}`,
      `texto:\n${reference.textExcerpt}`,
    ].join('\n')),
  ].join('\n\n');
}

export async function loadDriveStyleReferencePacket(params: {
  tenantId: string;
  pieceInput: string;
  familyLabel: string;
}): Promise<DriveStyleReferencePacket> {
  const warnings: string[] = [];

  try {
    const driveContext = await getTenantGoogleDriveContext(buildTenantGoogleDriveServiceRequest(), params.tenantId);
    const rootFolderId = driveContext.metadata.drive_root_folder_id;
    if (!rootFolderId) {
      return {
        folderName: null,
        packet: 'Pasta raiz do Google Drive nao configurada para o tenant.',
        warnings: ['Pasta raiz do Google Drive nao configurada; o estilo institucional do Drive nao foi aplicado.'],
        references: [],
      };
    }

    const rootChildren = await listGoogleDriveChildren(driveContext.accessToken, rootFolderId);
    const styleFolder = findStyleFolder(rootChildren as DriveFileRecord[]);

    if (!styleFolder?.id) {
      return {
        folderName: null,
        packet: 'A pasta institucional de modelos do Google Drive nao foi localizada.',
        warnings: ['Pasta MODELOS E PETICOES nao localizada no Google Drive; usando apenas fallback institucional.'],
        references: [],
      };
    }

    const styleChildren = await listGoogleDriveChildren(driveContext.accessToken, styleFolder.id);
    const readableFiles = (styleChildren as DriveFileRecord[])
      .filter((item) => !isGoogleDriveFolder(item as Pick<DriveFileRecord, 'mimeType'>) && item.id && item.name && shouldAttemptExtraction(item.name, item.mimeType))
      .slice(0, 20);

    const extractedReferences = (await Promise.all(readableFiles.map(async (file) => {
      try {
        const bytes = await downloadGoogleDriveFile(driveContext.accessToken, file.id);
        const extractedText = await extractDocumentText(file.name || 'modelo', file.mimeType, bytes);
        if (!extractedText) return null;
        return {
          id: file.id,
          name: file.name || 'modelo',
          modifiedAt: file.modifiedTime || null,
          webViewLink: file.webViewLink || null,
          textExcerpt: extractedText.slice(0, MAX_STYLE_CHARS_PER_FILE),
        } satisfies StyleExampleReference;
      } catch (error: any) {
        warnings.push(`Falha ao ler modelo institucional ${file.name || file.id}: ${error?.message || 'erro desconhecido'}`);
        return null;
      }
    }))).filter(Boolean) as StyleExampleReference[];

    const normalizedPieceInput = normalizeText(params.pieceInput);
    const normalizedFamilyLabel = normalizeText(params.familyLabel);
    const references = extractedReferences
      .sort((left, right) => {
        const scoreDiff = scoreStyleFile(right, normalizedPieceInput, normalizedFamilyLabel) - scoreStyleFile(left, normalizedPieceInput, normalizedFamilyLabel);
        if (scoreDiff !== 0) return scoreDiff;
        return new Date(right.modifiedAt || 0).getTime() - new Date(left.modifiedAt || 0).getTime();
      })
      .slice(0, MAX_STYLE_FILES);

    if (references.length === 0) {
      warnings.push('Nenhum arquivo legivel foi encontrado na pasta institucional de modelos do Drive.');
    }

    return {
      folderName: styleFolder.name || null,
      packet: buildPacket(styleFolder.name || null, references),
      warnings,
      references,
    };
  } catch (error: any) {
    return {
      folderName: null,
      packet: 'Nao foi possivel carregar os modelos institucionais do Google Drive nesta geracao.',
      warnings: [error?.message || 'Falha ao carregar os modelos institucionais do Google Drive.'],
      references: [],
    };
  }
}
