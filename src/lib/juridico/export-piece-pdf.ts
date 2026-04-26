import type { ExportLegalPieceParams } from "@/lib/juridico/export-piece-docx";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_LEFT = 56;
const MARGIN_RIGHT = 56;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 64;
const BODY_FONT_SIZE = 11;
const HEADING_FONT_SIZE = 14;
const TITLE_FONT_SIZE = 16;

type PdfLine = {
  text: string;
  font: "F1" | "F2";
  size: number;
  indent: number;
  spacingBefore: number;
  spacingAfter: number;
};

function sanitizeText(value: string | null | undefined) {
  return String(value || "")
    .replace(/\r/g, "")
    .trim();
}

function stripMarkdown(text: string) {
  return String(text || "")
    .replace(/^>\s?/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1 ($2)")
    .replace(/[*_~]/g, "")
    .trim();
}

function escapePdfText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(text: string, maxChars: number) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = word;
      continue;
    }

    lines.push(word);
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function buildPdfLinesFromMarkdown(params: ExportLegalPieceParams) {
  const processMeta = [
    params.processNumber ? `Processo: ${params.processNumber}` : null,
    params.clientName ? `Cliente: ${params.clientName}` : null,
    params.template?.template_name ? `Modelo: ${params.template.template_name}` : null,
  ].filter(Boolean) as string[];

  const lines: PdfLine[] = [
    {
      text: sanitizeText(params.pieceLabel || "Peça Jurídica"),
      font: "F2",
      size: TITLE_FONT_SIZE,
      indent: 0,
      spacingBefore: 0,
      spacingAfter: 8,
    },
    {
      text: sanitizeText(params.processTitle || "Processo sem título"),
      font: "F2",
      size: BODY_FONT_SIZE,
      indent: 0,
      spacingBefore: 0,
      spacingAfter: processMeta.length > 0 ? 6 : 12,
    },
    ...processMeta.map((item) => ({
      text: item,
      font: "F1" as const,
      size: BODY_FONT_SIZE,
      indent: 0,
      spacingBefore: 0,
      spacingAfter: 4,
    })),
  ];

  if (processMeta.length > 0) {
    lines.push({ text: "", font: "F1", size: BODY_FONT_SIZE, indent: 0, spacingBefore: 0, spacingAfter: 10 });
  }

  const rawLines = params.draftMarkdown.replace(/\r/g, "").split("\n");

  for (const rawLine of rawLines) {
    const cleanLine = rawLine.trim();

    if (!cleanLine) {
      lines.push({ text: "", font: "F1", size: BODY_FONT_SIZE, indent: 0, spacingBefore: 0, spacingAfter: 6 });
      continue;
    }

    const headingMatch = cleanLine.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const title = stripMarkdown(headingMatch[2]).toUpperCase();
      lines.push({
        text: title,
        font: "F2",
        size: HEADING_FONT_SIZE,
        indent: 0,
        spacingBefore: 8,
        spacingAfter: 6,
      });
      continue;
    }

    if (/^[A-Z0-9IVXLCDM\-\s]{6,}$/.test(cleanLine) && !cleanLine.includes(".pdf")) {
      lines.push({
        text: stripMarkdown(cleanLine).toUpperCase(),
        font: "F2",
        size: HEADING_FONT_SIZE,
        indent: 0,
        spacingBefore: 8,
        spacingAfter: 6,
      });
      continue;
    }

    const orderedMatch = cleanLine.match(/^(\d+[.)-])\s+(.*)$/);
    if (orderedMatch) {
      const wrapped = wrapText(`${orderedMatch[1]} ${stripMarkdown(orderedMatch[2])}`, 88);
      wrapped.forEach((item, index) => {
        lines.push({
          text: item,
          font: "F1",
          size: BODY_FONT_SIZE,
          indent: 18,
          spacingBefore: index === 0 ? 0 : 2,
          spacingAfter: index === wrapped.length - 1 ? 4 : 0,
        });
      });
      continue;
    }

    const bulletMatch = cleanLine.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      const wrapped = wrapText(`• ${stripMarkdown(bulletMatch[1])}`, 88);
      wrapped.forEach((item, index) => {
        lines.push({
          text: item,
          font: "F1",
          size: BODY_FONT_SIZE,
          indent: 18,
          spacingBefore: index === 0 ? 0 : 2,
          spacingAfter: index === wrapped.length - 1 ? 4 : 0,
        });
      });
      continue;
    }

    const quoteMatch = cleanLine.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      const wrapped = wrapText(stripMarkdown(quoteMatch[1]), 80);
      wrapped.forEach((item, index) => {
        lines.push({
          text: item,
          font: "F1",
          size: BODY_FONT_SIZE,
          indent: 28,
          spacingBefore: index === 0 ? 2 : 0,
          spacingAfter: index === wrapped.length - 1 ? 6 : 0,
        });
      });
      continue;
    }

    const wrapped = wrapText(stripMarkdown(cleanLine), 94);
    wrapped.forEach((item, index) => {
      lines.push({
        text: item,
        font: "F1",
        size: BODY_FONT_SIZE,
        indent: 12,
        spacingBefore: index === 0 ? 0 : 2,
        spacingAfter: index === wrapped.length - 1 ? 4 : 0,
      });
    });
  }

  if (params.profile?.signature_block) {
    lines.push({ text: "", font: "F1", size: BODY_FONT_SIZE, indent: 0, spacingBefore: 0, spacingAfter: 10 });
    sanitizeText(params.profile.signature_block)
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item, index) => {
        lines.push({
          text: item,
          font: index === 0 ? "F2" : "F1",
          size: BODY_FONT_SIZE,
          indent: 0,
          spacingBefore: 0,
          spacingAfter: 4,
        });
      });
  }

  return lines;
}

function createPdfDocument(lines: PdfLine[]) {
  const contentStreams: string[] = [];
  let currentCommands: string[] = [];
  let currentY = PAGE_HEIGHT - MARGIN_TOP;
  let pageNumber = 1;

  const flushPage = () => {
    currentCommands.push(`BT /F1 9 Tf ${PAGE_WIDTH - MARGIN_RIGHT - 30} ${MARGIN_BOTTOM - 12} Td (Pag. ${pageNumber}) Tj ET`);
    contentStreams.push(currentCommands.join("\n"));
    currentCommands = [];
    currentY = PAGE_HEIGHT - MARGIN_TOP;
    pageNumber += 1;
  };

  for (const line of lines) {
    const effectiveLineHeight = Math.max(14, line.size + 4);
    currentY -= line.spacingBefore;

    if (currentY - effectiveLineHeight < MARGIN_BOTTOM) {
      flushPage();
    }

    if (line.text) {
      currentCommands.push(
        `BT /${line.font} ${line.size} Tf ${MARGIN_LEFT + line.indent} ${currentY} Td (${escapePdfText(line.text)}) Tj ET`
      );
    }

    currentY -= effectiveLineHeight + line.spacingAfter;
  }

  flushPage();

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";

  const fontHelveticaId = 3;
  const fontHelveticaBoldId = 4;
  objects[fontHelveticaId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[fontHelveticaBoldId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  let nextObjectId = 5;
  for (const stream of contentStreams) {
    const pageId = nextObjectId++;
    const contentId = nextObjectId++;
    pageObjectIds.push(pageId);
    contentObjectIds.push(contentId);
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontHelveticaId} 0 R /F2 ${fontHelveticaBoldId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`;
  }

  objects[2] = `<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (let index = 1; index < objects.length; index += 1) {
    const object = objects[index];
    if (!object) continue;
    offsets[index] = Buffer.byteLength(pdf, "utf8");
    pdf += `${index} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += "0000000000 65535 f \n";

  for (let index = 1; index < objects.length; index += 1) {
    const offset = offsets[index] || 0;
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export async function exportLegalPieceToPdf(params: ExportLegalPieceParams) {
  const lines = buildPdfLinesFromMarkdown(params);
  return createPdfDocument(lines);
}
