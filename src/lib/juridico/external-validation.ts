export type ExternalValidationReferenceKind = "law" | "case_law";

export type ExternalValidationReference = {
  id: string;
  kind: ExternalValidationReferenceKind;
  citation: string;
  title: string;
  summary: string | null;
  sourceUrl: string | null;
  legalAreas: string[];
  authority: string | null;
  validatedAt: string | null;
};

export type ExternalValidationTextareaParseResult = {
  references: ExternalValidationReference[];
  errors: string[];
};

const LAW_METADATA_KEY = "validated_law_references";
const CASE_LAW_METADATA_KEY = "validated_case_law_references";

function normalizeText(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getString(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function buildReferenceId(kind: ExternalValidationReferenceKind, citation: string, index: number) {
  const slug = normalizeText(citation)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${kind}-${slug || "reference"}-${index + 1}`;
}

function normalizeAreas(value: string[]) {
  return Array.from(
    new Set(
      value
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function parseAreas(raw: string) {
  const normalized = raw.trim();
  if (!normalized || normalized === "*") return [] as string[];
  return normalizeAreas(normalized.split(",").map((item) => item.trim()));
}

function parseReferenceRecord(kind: ExternalValidationReferenceKind, value: unknown, index: number) {
  if (typeof value === "string") {
    const citation = value.trim();
    if (!citation) return null;
    return {
      id: buildReferenceId(kind, citation, index),
      kind,
      citation,
      title: citation,
      summary: null,
      sourceUrl: null,
      legalAreas: [],
      authority: null,
      validatedAt: null,
    } satisfies ExternalValidationReference;
  }

  if (!isRecord(value)) return null;

  const citation = getString(value, "citation") || getString(value, "title") || getString(value, "label");
  if (!citation) return null;

  const legalAreas = normalizeAreas([
    ...getStringArray(value.legal_areas),
    ...parseAreas(getString(value, "legal_area") || ""),
  ]);

  return {
    id: getString(value, "id") || buildReferenceId(kind, citation, index),
    kind,
    citation,
    title: getString(value, "title") || citation,
    summary: getString(value, "summary"),
    sourceUrl: getString(value, "source_url") || getString(value, "url"),
    legalAreas,
    authority: getString(value, "authority"),
    validatedAt: getString(value, "validated_at"),
  } satisfies ExternalValidationReference;
}

function referenceMatchesLegalArea(reference: ExternalValidationReference, legalArea: string | null | undefined) {
  if (reference.legalAreas.length === 0) return true;

  const normalizedArea = normalizeText(legalArea);
  if (!normalizedArea) return false;

  return reference.legalAreas.some((item) => {
    const normalizedItem = normalizeText(item);
    return normalizedItem === "all"
      || normalizedItem === "*"
      || normalizedItem.includes(normalizedArea)
      || normalizedArea.includes(normalizedItem);
  });
}

function parseMetadataArray(kind: ExternalValidationReferenceKind, value: unknown) {
  if (!Array.isArray(value)) return [] as ExternalValidationReference[];
  return value
    .map((item, index) => parseReferenceRecord(kind, item, index))
    .filter(Boolean) as ExternalValidationReference[];
}

export function parseExternalValidationReferencesFromMetadata(metadata: Record<string, unknown> | null | undefined) {
  return {
    lawReferences: parseMetadataArray("law", metadata?.[LAW_METADATA_KEY]),
    caseLawReferences: parseMetadataArray("case_law", metadata?.[CASE_LAW_METADATA_KEY]),
  };
}

export function filterExternalValidationReferencesForLegalArea(
  references: ExternalValidationReference[],
  legalArea: string | null | undefined
) {
  return references.filter((reference) => referenceMatchesLegalArea(reference, legalArea));
}

export function parseExternalValidationTextarea(params: {
  kind: ExternalValidationReferenceKind;
  input: string;
}) {
  const lines = String(params.input || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const references: ExternalValidationReference[] = [];
  const errors: string[] = [];

  lines.forEach((line, index) => {
    const parts = line.split("|").map((item) => item.trim());
    const [areasPart, citationPart, summaryPart, urlPart] = parts;

    if (!citationPart) {
      errors.push(`Linha ${index + 1}: use o formato areas | citacao | resumo | url.`);
      return;
    }

    references.push({
      id: buildReferenceId(params.kind, citationPart, index),
      kind: params.kind,
      citation: citationPart,
      title: citationPart,
      summary: summaryPart || null,
      sourceUrl: urlPart || null,
      legalAreas: parseAreas(areasPart || ""),
      authority: null,
      validatedAt: null,
    });
  });

  return {
    references,
    errors,
  } satisfies ExternalValidationTextareaParseResult;
}

export function formatExternalValidationReferencesForTextarea(references: ExternalValidationReference[]) {
  return references
    .map((reference) => {
      const areas = reference.legalAreas.length > 0 ? reference.legalAreas.join(", ") : "*";
      return [areas, reference.citation, reference.summary || "", reference.sourceUrl || ""].join(" | ");
    })
    .join("\n");
}

export function mergeExternalValidationReferencesIntoMetadata(params: {
  metadata: Record<string, unknown> | null | undefined;
  lawReferences: ExternalValidationReference[];
  caseLawReferences: ExternalValidationReference[];
}) {
  return {
    ...(params.metadata || {}),
    [LAW_METADATA_KEY]: params.lawReferences.map((reference) => ({
      id: reference.id,
      citation: reference.citation,
      title: reference.title,
      summary: reference.summary,
      source_url: reference.sourceUrl,
      legal_areas: reference.legalAreas,
      authority: reference.authority,
      validated_at: reference.validatedAt,
    })),
    [CASE_LAW_METADATA_KEY]: params.caseLawReferences.map((reference) => ({
      id: reference.id,
      citation: reference.citation,
      title: reference.title,
      summary: reference.summary,
      source_url: reference.sourceUrl,
      legal_areas: reference.legalAreas,
      authority: reference.authority,
      validated_at: reference.validatedAt,
    })),
  } satisfies Record<string, unknown>;
}

export function formatExternalValidationReference(reference: ExternalValidationReference) {
  return [reference.citation, reference.summary, reference.sourceUrl].filter(Boolean).join(" — ");
}
