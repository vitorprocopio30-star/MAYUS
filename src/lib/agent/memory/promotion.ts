export type MemoryPromotionInput = {
  key: unknown
  value: unknown
  category?: unknown
  source?: unknown
  sourceLabel?: unknown
  confidence?: unknown
  evidence?: unknown
  proposedBy?: string | null
}

export type MemoryPromotionProposal = {
  memoryType: "institutional_memory_proposal"
  memoryKey: string
  source: string
  confidence: number
  value: {
    text: string
    category: string
    source_label: string
    evidence?: unknown
    status: "proposed"
    proposed_by?: string | null
  }
}

export type BrainMemoryProposalRow = {
  id: string
  memory_key: string
  value: unknown
  source: string | null
  confidence: number | string | null
  promoted: boolean | null
  created_by: string | null
  created_at: string | null
  updated_at?: string | null
}

export type NormalizedMemoryProposal = {
  id: string
  key: string
  value: string
  category: string
  source: string
  sourceLabel: string
  confidence: number
  status: "proposed" | "approved" | "rejected"
  promoted: boolean
  createdBy: string | null
  createdAt: string | null
  updatedAt?: string | null
  evidence?: unknown
}

export type InstitutionalMemoryLike = {
  id: string
  key: string
  value: unknown
  category: string | null
  enforced: boolean | null
}

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/g,
  /\b(service_role|anon|api|access|refresh|bearer)[_-]?(key|token|secret)\b\s*[:=]\s*["']?[^"'\s,;]+/gi,
  /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
]

function cleanString(value: unknown, fallback = ""): string {
  if (typeof value !== "string") {
    return fallback
  }

  return value.replace(/\s+/g, " ").trim()
}

export function sanitizeMemoryText(value: unknown): string {
  let text = cleanString(value)

  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, "[redacted]")
  }

  return text.slice(0, 2000)
}

export function normalizeMemoryCategory(value: unknown): string {
  const category = cleanString(value, "geral").toLowerCase()
  return category ? category.slice(0, 80) : "geral"
}

export function normalizeMemoryConfidence(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value)

  if (!Number.isFinite(numeric)) {
    return 0.5
  }

  if (numeric > 1) {
    return Math.max(0, Math.min(1, numeric / 100))
  }

  return Math.max(0, Math.min(1, numeric))
}

export function buildMemoryPromotionProposal(input: MemoryPromotionInput): MemoryPromotionProposal {
  const memoryKey = cleanString(input.key).slice(0, 120)
  const text = sanitizeMemoryText(input.value)

  if (!memoryKey || !text) {
    throw new Error("memory_promotion_requires_key_and_value")
  }

  const source = cleanString(input.source, "agent_learning").slice(0, 80)
  const sourceLabel = cleanString(input.sourceLabel, source).slice(0, 160)
  const category = normalizeMemoryCategory(input.category)

  return {
    memoryType: "institutional_memory_proposal",
    memoryKey,
    source,
    confidence: normalizeMemoryConfidence(input.confidence),
    value: {
      text,
      category,
      source_label: sourceLabel,
      evidence: input.evidence,
      status: "proposed",
      proposed_by: input.proposedBy ?? null,
    },
  }
}

function readProposalValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return { text: sanitizeMemoryText(value) }
}

export function normalizeMemoryProposalRow(row: BrainMemoryProposalRow): NormalizedMemoryProposal {
  const value = readProposalValue(row.value)
  const status = value.status === "approved" || value.status === "rejected" ? value.status : "proposed"
  const source = cleanString(row.source, "agent_learning")

  return {
    id: row.id,
    key: cleanString(row.memory_key),
    value: sanitizeMemoryText(value.text),
    category: normalizeMemoryCategory(value.category),
    source,
    sourceLabel: cleanString(value.source_label, source),
    confidence: normalizeMemoryConfidence(row.confidence),
    status,
    promoted: Boolean(row.promoted),
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    evidence: value.evidence,
  }
}

export function serializeInstitutionalMemoryValue(value: unknown): { text: string } {
  return { text: sanitizeMemoryText(value) }
}

export function deserializeInstitutionalMemoryValue(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value) && "text" in value) {
    return sanitizeMemoryText((value as { text?: unknown }).text)
  }

  return sanitizeMemoryText(value)
}

export function buildApprovedProposalValue(
  proposal: NormalizedMemoryProposal,
  params: { approverId: string; memoryEntryId: string },
): Record<string, unknown> {
  return {
    text: proposal.value,
    category: proposal.category,
    source_label: proposal.sourceLabel,
    evidence: proposal.evidence,
    status: "approved",
    approved_by: params.approverId,
    approved_at: new Date().toISOString(),
    memory_entry_id: params.memoryEntryId,
  }
}

export function buildRejectedProposalValue(
  proposal: NormalizedMemoryProposal,
  params: { reviewerId: string; reason?: unknown },
): Record<string, unknown> {
  return {
    text: proposal.value,
    category: proposal.category,
    source_label: proposal.sourceLabel,
    evidence: proposal.evidence,
    status: "rejected",
    rejected_by: params.reviewerId,
    rejected_at: new Date().toISOString(),
    reason: sanitizeMemoryText(params.reason ?? "Rejected in memory review"),
  }
}

export function buildRevokedMemoryValue(
  entry: InstitutionalMemoryLike,
  params: { reviewerId: string; reason?: unknown },
): Record<string, unknown> {
  return {
    text: deserializeInstitutionalMemoryValue(entry.value),
    category: normalizeMemoryCategory(entry.category),
    status: "revoked",
    revoked_by: params.reviewerId,
    revoked_at: new Date().toISOString(),
    reason: sanitizeMemoryText(params.reason ?? "Revoked in memory review"),
    memory_entry_id: entry.id,
    enforced_before_revocation: Boolean(entry.enforced),
  }
}

export function buildMemoryPromotionEventPayload(input: {
  action: "proposed" | "approved" | "rejected" | "revoked"
  key: string
  category: string
  source?: string | null
  confidence?: unknown
  reason?: unknown
}): Record<string, unknown> {
  return {
    action: input.action,
    key: sanitizeMemoryText(input.key).slice(0, 120),
    category: normalizeMemoryCategory(input.category),
    source: cleanString(input.source, "memory_panel"),
    confidence: normalizeMemoryConfidence(input.confidence),
    reason: input.reason ? sanitizeMemoryText(input.reason).slice(0, 240) : undefined,
  }
}
