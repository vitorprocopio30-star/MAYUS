import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TextRun,
} from 'docx';

type TenantLegalProfileDocx = {
  office_display_name?: string | null;
  default_font_family?: string | null;
  body_font_size?: number | null;
  title_font_size?: number | null;
  paragraph_spacing?: number | null;
  line_spacing?: number | null;
  text_alignment?: string | null;
  margin_top?: number | null;
  margin_right?: number | null;
  margin_bottom?: number | null;
  margin_left?: number | null;
  signature_block?: string | null;
  use_page_numbers?: boolean | null;
  use_header?: boolean | null;
  use_footer?: boolean | null;
};

type TenantLegalTemplateDocx = {
  piece_type: string;
  template_name?: string | null;
  template_mode?: string | null;
  template_docx_url?: string | null;
  structure_markdown?: string | null;
  guidance_notes?: string | null;
};

type TenantLegalAssetDocx = {
  asset_type: string;
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
};

export type ExportLegalPieceParams = {
  pieceLabel: string;
  pieceType: string;
  processTitle: string;
  processNumber?: string | null;
  clientName?: string | null;
  draftMarkdown: string;
  profile: TenantLegalProfileDocx | null;
  template: TenantLegalTemplateDocx | null;
  assets?: TenantLegalAssetDocx[] | null;
};

type EmbeddedAsset = {
  data: Uint8Array;
  type: 'png' | 'jpg' | 'gif';
};

function toTwip(value: number | null | undefined, fallback: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(0, Math.round(value));
}

function sanitizeText(value: string | null | undefined) {
  return String(value || '').replace(/\r/g, '').trim();
}

function stripMarkdown(text: string) {
  return text
    .replace(/^>?/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1 ($2)')
    .replace(/[*_~]/g, '')
    .trim();
}

function parseInlineRuns(text: string, font: string, size: number) {
  const content = text || '';
  const segments = content.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_)/g).filter(Boolean);

  return segments.map((segment) => {
    const isBold = (/^\*\*.*\*\*$/.test(segment) || /^__.*__$/.test(segment));
    const isItalic = (/^\*[^*].*\*$/.test(segment) || /^_[^_].*_$/.test(segment)) && !isBold;
    const cleaned = segment.replace(/^\*\*|\*\*$|^__|__$|^\*|\*$|^_|_$/g, '');

    return new TextRun({
      text: cleaned,
      bold: isBold,
      italics: isItalic,
      font,
      size,
    });
  });
}

function mapAlignment(alignment: string | null | undefined) {
  switch (sanitizeText(alignment).toLowerCase()) {
    case 'left':
    case 'esquerda':
      return AlignmentType.LEFT;
    case 'center':
    case 'centro':
      return AlignmentType.CENTER;
    case 'right':
    case 'direita':
      return AlignmentType.RIGHT;
    default:
      return AlignmentType.JUSTIFIED;
  }
}

function buildParagraphsFromMarkdown(markdown: string, profile: TenantLegalProfileDocx | null) {
  const font = sanitizeText(profile?.default_font_family) || 'Arial';
  const bodySize = Math.round((profile?.body_font_size || 11.5) * 2);
  const titleSize = Math.round((profile?.title_font_size || 12) * 2);
  const paragraphSpacing = Math.round((profile?.paragraph_spacing || 120));
  const lineSpacing = Math.round((profile?.line_spacing || 1) * 240);
  const alignment = mapAlignment(profile?.text_alignment);
  const lines = markdown.replace(/\r/g, '').split('\n');
  const paragraphs: Paragraph[] = [];
  let orderedIndex = 1;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const cleanLine = line.trim();

    if (!cleanLine) {
      orderedIndex = 1;
      paragraphs.push(
        new Paragraph({
          spacing: { after: Math.round(paragraphSpacing / 2) },
        })
      );
      continue;
    }

    const headingMatch = cleanLine.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      orderedIndex = 1;
      const level = Math.min(headingMatch[1].length, 4);
      paragraphs.push(
        new Paragraph({
          heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][level - 1],
          children: parseInlineRuns(stripMarkdown(headingMatch[2]), font, titleSize),
          spacing: { before: paragraphSpacing, after: Math.round(paragraphSpacing * 0.75) },
          alignment: AlignmentType.LEFT,
        })
      );
      continue;
    }

    if (/^[A-Z0-9IVXLCDM\-\s]{6,}$/.test(cleanLine) && !cleanLine.includes('.pdf')) {
      orderedIndex = 1;
      paragraphs.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: stripMarkdown(cleanLine), bold: true, font, size: titleSize })],
          spacing: { before: paragraphSpacing, after: Math.round(paragraphSpacing * 0.75) },
          alignment: AlignmentType.LEFT,
        })
      );
      continue;
    }

    const orderedMatch = cleanLine.match(/^\d+[.)-]\s+(.*)$/);
    if (orderedMatch) {
      paragraphs.push(
        new Paragraph({
          children: parseInlineRuns(stripMarkdown(orderedMatch[1]), font, bodySize),
          numbering: { reference: 'legal-ordered', level: 0 },
          spacing: { after: paragraphSpacing, line: lineSpacing },
          alignment,
        })
      );
      orderedIndex += 1;
      continue;
    }

    const bulletMatch = cleanLine.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      orderedIndex = 1;
      paragraphs.push(
        new Paragraph({
          children: parseInlineRuns(stripMarkdown(bulletMatch[1]), font, bodySize),
          bullet: { level: 0 },
          spacing: { after: paragraphSpacing, line: lineSpacing },
          alignment,
        })
      );
      continue;
    }

    const quoteMatch = cleanLine.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      orderedIndex = 1;
      paragraphs.push(
        new Paragraph({
          children: parseInlineRuns(stripMarkdown(quoteMatch[1]), font, bodySize),
          spacing: { before: Math.round(paragraphSpacing / 2), after: paragraphSpacing, line: lineSpacing },
          indent: { left: 560, right: 280 },
          border: {
            left: {
              style: BorderStyle.SINGLE,
              color: 'B08A3C',
              size: 8,
            },
          },
          alignment,
        })
      );
      continue;
    }

    orderedIndex = 1;
    paragraphs.push(
      new Paragraph({
        children: parseInlineRuns(stripMarkdown(cleanLine), font, bodySize),
        spacing: { after: paragraphSpacing, line: lineSpacing },
        alignment,
      })
    );
  }

  return paragraphs;
}

function buildSignatureParagraphs(signatureBlock: string | null | undefined, profile: TenantLegalProfileDocx | null) {
  const font = sanitizeText(profile?.default_font_family) || 'Arial';
  const bodySize = Math.round((profile?.body_font_size || 11.5) * 2);
  const lines = sanitizeText(signatureBlock).split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [] as Paragraph[];

  return [
    new Paragraph({ spacing: { before: 360, after: 120 } }),
    ...lines.map((line, index) => new Paragraph({
      children: [new TextRun({ text: line, font, size: bodySize, bold: index === 0 })],
      alignment: AlignmentType.LEFT,
      spacing: { after: 80, line: 240 },
    })),
  ];
}

function normalizeMimeToDocxType(mimeType: string | null | undefined, url: string | null | undefined): EmbeddedAsset['type'] | null {
  const mime = sanitizeText(mimeType).toLowerCase();
  const target = `${mime} ${sanitizeText(url).toLowerCase()}`;
  if (target.includes('png')) return 'png';
  if (target.includes('jpeg') || target.includes('jpg')) return 'jpg';
  if (target.includes('gif')) return 'gif';
  return null;
}

async function loadRemoteAsset(asset: TenantLegalAssetDocx | undefined) {
  if (!asset?.file_url) return null;

  try {
    const response = await fetch(asset.file_url);
    if (!response.ok) return null;
    const data = new Uint8Array(await response.arrayBuffer());
    const type = normalizeMimeToDocxType(asset.mime_type, asset.file_url);
    if (!type) return null;
    return { data, type } satisfies EmbeddedAsset;
  } catch {
    return null;
  }
}

function buildAssetParagraph(asset: EmbeddedAsset | null, fallbackText: string, alignment: (typeof AlignmentType)[keyof typeof AlignmentType], width: number, height: number) {
  if (!asset) {
    return new Paragraph({
      children: [new TextRun({ text: fallbackText, size: 16 })],
      alignment,
      spacing: { after: 120 },
    });
  }

  return new Paragraph({
    children: [
      new ImageRun({
        data: asset.data,
        transformation: { width, height },
        type: asset.type,
      }),
    ],
    alignment,
    spacing: { after: 120 },
  });
}

export async function exportLegalPieceToDocx(params: ExportLegalPieceParams) {
  const officeName = sanitizeText(params.profile?.office_display_name) || 'MAYUS';
  const assets = params.assets || [];
  const headerAsset = await loadRemoteAsset(assets.find((asset) => asset.asset_type === 'header'));
  const footerAsset = await loadRemoteAsset(assets.find((asset) => asset.asset_type === 'footer'));
  const header = params.profile?.use_header
    ? new Header({
        children: [
          buildAssetParagraph(headerAsset, officeName, AlignmentType.CENTER, 520, 64),
        ],
      })
    : undefined;

  const footerChildren: Paragraph[] = [];
  if (params.profile?.use_footer) {
    footerChildren.push(
      buildAssetParagraph(footerAsset, params.processTitle || params.pieceLabel, AlignmentType.CENTER, 480, 42)
    );
  }
  if (params.profile?.use_page_numbers) {
    footerChildren.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: 'Página ', size: 16 }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16 }),
        ],
      })
    );
  }

  const footer = footerChildren.length > 0 ? new Footer({ children: footerChildren }) : undefined;
  const introMeta = [
    params.processNumber ? `Processo: ${params.processNumber}` : null,
    params.clientName ? `Cliente: ${params.clientName}` : null,
    params.template?.template_name ? `Modelo: ${params.template.template_name}` : null,
  ].filter(Boolean);

  const document = new Document({
    numbering: {
      config: [
        {
          reference: 'legal-ordered',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 260 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: toTwip(params.profile?.margin_top, 1699),
              right: toTwip(params.profile?.margin_right, 1699),
              bottom: toTwip(params.profile?.margin_bottom, 1281),
              left: toTwip(params.profile?.margin_left, 1699),
            },
          },
        },
        headers: header ? { default: header } : undefined,
        footers: footer ? { default: footer } : undefined,
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: params.pieceLabel, bold: true, size: 28 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
          new Paragraph({
            children: [new TextRun({ text: params.processTitle, bold: true, size: 22 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 160 },
          }),
          ...introMeta.map((item) => new Paragraph({
            children: [new TextRun({ text: item!, size: 18 })],
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
          })),
          new Paragraph({ spacing: { after: 200 } }),
          ...buildParagraphsFromMarkdown(params.draftMarkdown, params.profile),
          ...buildSignatureParagraphs(params.profile?.signature_block, params.profile),
        ],
      },
    ],
  });

  return Packer.toBuffer(document);
}
