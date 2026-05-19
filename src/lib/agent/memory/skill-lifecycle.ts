import {
  type HermesPersistedRecord,
  type HermesTrajectoryEvent,
  isApprovedHermesTrajectoryEvent,
  sanitizeHermesPersistedRecord,
  sanitizeHermesPersistedText,
} from "../runtime/trajectory";
import {
  buildMemoryPromotionEventPayload,
  buildMemoryPromotionProposal,
} from "./promotion";

export type HermesLifecycleKind = "skill" | "memory";
export type HermesSkillLifecycleStatus =
  | "draft"
  | "proposed"
  | "approved"
  | "revoked";

export type HermesSkillLifecycleEntry = {
  id: string;
  kind: HermesLifecycleKind;
  slug: string;
  title: string;
  description: string;
  status: HermesSkillLifecycleStatus;
  version: 1;
  tenantId?: string | null;
  sourceEventId?: string | null;
  payload: HermesPersistedRecord;
  createdBy?: string | null;
  proposedBy?: string | null;
  proposedAt?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  revokedBy?: string | null;
  revokedAt?: string | null;
  revokeReason?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HermesSkillLifecycleDraftInput = {
  id?: string;
  kind?: HermesLifecycleKind;
  slug: unknown;
  title: unknown;
  description: unknown;
  tenantId?: string | null;
  sourceEventId?: string | null;
  payload?: Record<string, unknown> | null;
  createdBy?: string | null;
  at?: Date | string;
};

export type HermesSkillLifecycleProposalInput =
  HermesSkillLifecycleDraftInput & {
    proposedBy?: string | null;
  };

export type HermesLifecyclePersistableProposal = {
  lifecycleEntry: HermesSkillLifecycleEntry;
  brainMemory: {
    tenant_id: string | null;
    scope: "tenant";
    memory_type: "institutional_memory_proposal";
    memory_key: string;
    value: ReturnType<typeof buildMemoryPromotionProposal>["value"];
    source: string;
    confidence: number;
    promoted: false;
    created_by: string | null;
  };
  learningEvent: {
    tenant_id: string | null;
    event_type: "hermes_lifecycle_proposed";
    source_module: "agent_memory";
    payload: HermesPersistedRecord;
    created_by: string | null;
  };
};

export type HermesLifecyclePersistenceInput = {
  proposedBy?: string | null;
  source?: unknown;
  sourceLabel?: unknown;
  confidence?: unknown;
  at?: Date | string;
};

function toIsoDate(value?: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value;
  return new Date().toISOString();
}

function normalizeSlug(
  value: unknown,
  fallback = "hermes-reusable-learning",
): string {
  const text = sanitizeHermesPersistedText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return text || fallback;
}

function normalizeRequiredText(value: unknown, errorCode: string): string {
  const text = sanitizeHermesPersistedText(value);
  if (!text) throw new Error(errorCode);
  return text;
}

function createLifecycleId(kind: HermesLifecycleKind, slug: string): string {
  return `hermes:${kind}:${slug}`;
}

function sanitizeOptionalText(value: unknown): string | null {
  const text = sanitizeHermesPersistedText(value);
  return text || null;
}

export function createHermesSkillDraft(
  input: HermesSkillLifecycleDraftInput,
): HermesSkillLifecycleEntry {
  const kind = input.kind ?? "skill";
  const slug = normalizeSlug(input.slug);
  const title = normalizeRequiredText(
    input.title,
    "hermes_skill_lifecycle_requires_title",
  );
  const description = normalizeRequiredText(
    input.description,
    "hermes_skill_lifecycle_requires_description",
  );
  const createdAt = toIsoDate(input.at);

  return {
    id: input.id || createLifecycleId(kind, slug),
    kind,
    slug,
    title,
    description,
    status: "draft",
    version: 1,
    tenantId: input.tenantId ?? null,
    sourceEventId: input.sourceEventId ?? null,
    payload: sanitizeHermesPersistedRecord(input.payload),
    createdBy: sanitizeOptionalText(input.createdBy),
    createdAt,
    updatedAt: createdAt,
  };
}

export function proposeHermesSkillLifecycleEntry(
  input: HermesSkillLifecycleProposalInput | HermesSkillLifecycleEntry,
  params?: { at?: Date | string },
): HermesSkillLifecycleEntry {
  const base = "status" in input ? input : createHermesSkillDraft(input);

  if (base.status === "revoked") {
    throw new Error("hermes_skill_lifecycle_revoked_cannot_be_proposed");
  }
  if (base.status === "approved") {
    throw new Error("hermes_skill_lifecycle_approved_cannot_be_reproposed");
  }

  const proposedAt = toIsoDate(
    !("status" in input) ? input.at : params?.at,
  );
  const proposedBy =
    "proposedBy" in input
      ? sanitizeOptionalText(input.proposedBy ?? base.proposedBy)
      : sanitizeOptionalText(base.proposedBy);

  return {
    ...base,
    status: "proposed",
    proposedBy,
    proposedAt,
    updatedAt: proposedAt,
  };
}

export function approveHermesSkillLifecycleEntry(
  entry: HermesSkillLifecycleEntry,
  params: {
    approverId: string;
    approvalEventId?: string | null;
    at?: Date | string;
  },
): HermesSkillLifecycleEntry {
  const approverId = sanitizeHermesPersistedText(params.approverId);

  if (!approverId) {
    throw new Error("hermes_skill_lifecycle_requires_approver");
  }
  if (entry.status !== "proposed") {
    throw new Error("hermes_skill_lifecycle_requires_proposed_status");
  }

  const approvedAt = toIsoDate(params.at);

  return {
    ...entry,
    status: "approved",
    sourceEventId: params.approvalEventId ?? entry.sourceEventId ?? null,
    approvedBy: approverId,
    approvedAt,
    updatedAt: approvedAt,
  };
}

export function revokeHermesSkillLifecycleEntry(
  entry: HermesSkillLifecycleEntry,
  params: {
    reviewerId: string;
    reason?: unknown;
    at?: Date | string;
  },
): HermesSkillLifecycleEntry {
  const reviewerId = sanitizeHermesPersistedText(params.reviewerId);

  if (!reviewerId) {
    throw new Error("hermes_skill_lifecycle_requires_reviewer");
  }

  const revokedAt = toIsoDate(params.at);

  return {
    ...entry,
    status: "revoked",
    revokedBy: reviewerId,
    revokedAt,
    revokeReason: sanitizeHermesPersistedText(
      params.reason ?? "Revoked by supervised review",
    ),
    updatedAt: revokedAt,
  };
}

export function canUseHermesSkill(entry: HermesSkillLifecycleEntry): boolean {
  return entry.kind === "skill" && entry.status === "approved";
}

export function assertHermesSkillCanBeUsed(
  entry: HermesSkillLifecycleEntry,
): HermesSkillLifecycleEntry {
  if (entry.status === "revoked") {
    throw new Error("hermes_skill_revoked_cannot_be_used");
  }

  if (!canUseHermesSkill(entry)) {
    throw new Error("hermes_skill_requires_approved_status");
  }

  return entry;
}

function sanitizeLifecycleEntryForPersistence(
  entry: HermesSkillLifecycleEntry,
): HermesSkillLifecycleEntry {
  const kind = entry.kind === "memory" ? "memory" : "skill";
  const slug = normalizeSlug(entry.slug);
  const title = normalizeRequiredText(
    entry.title,
    "hermes_skill_lifecycle_requires_title",
  );
  const description = normalizeRequiredText(
    entry.description,
    "hermes_skill_lifecycle_requires_description",
  );

  return {
    ...entry,
    id: sanitizeHermesPersistedText(entry.id) || createLifecycleId(kind, slug),
    kind,
    slug,
    title,
    description,
    payload: sanitizeHermesPersistedRecord(entry.payload),
    createdBy: sanitizeOptionalText(entry.createdBy),
    proposedBy: sanitizeOptionalText(entry.proposedBy),
    approvedBy: sanitizeOptionalText(entry.approvedBy),
    revokedBy: sanitizeOptionalText(entry.revokedBy),
    revokeReason: sanitizeOptionalText(entry.revokeReason),
  };
}

function coercePersistableLifecycleProposal(
  entry: HermesSkillLifecycleEntry,
  input: HermesLifecyclePersistenceInput = {},
): HermesSkillLifecycleEntry {
  if (entry.status === "revoked") {
    throw new Error("hermes_skill_lifecycle_revoked_cannot_be_persisted");
  }

  if (entry.status === "approved") {
    throw new Error(
      "hermes_skill_lifecycle_approved_cannot_be_persisted_as_proposal",
    );
  }

  const proposedBy = sanitizeOptionalText(
    input.proposedBy ?? entry.proposedBy ?? entry.createdBy,
  );
  const proposed =
    entry.status === "draft"
      ? proposeHermesSkillLifecycleEntry(
          {
            ...entry,
            proposedBy,
          },
          { at: input.at },
        )
      : {
          ...entry,
          proposedBy: proposedBy ?? sanitizeOptionalText(entry.proposedBy),
          proposedAt: entry.proposedAt ?? toIsoDate(input.at),
          updatedAt: entry.updatedAt || entry.proposedAt || toIsoDate(input.at),
        };

  return sanitizeLifecycleEntryForPersistence({
    ...proposed,
    approvedBy: null,
    approvedAt: null,
    revokedBy: null,
    revokedAt: null,
    revokeReason: null,
  });
}

export function buildPersistableHermesLifecycleProposal(
  entry: HermesSkillLifecycleEntry,
  input: HermesLifecyclePersistenceInput = {},
): HermesLifecyclePersistableProposal {
  const lifecycleEntry = coercePersistableLifecycleProposal(entry, input);
  const proposedBy =
    sanitizeOptionalText(
      input.proposedBy ?? lifecycleEntry.proposedBy ?? lifecycleEntry.createdBy,
    ) ?? null;
  const source = sanitizeHermesPersistedText(input.source) || "hermes_lifecycle";
  const sourceLabel =
    sanitizeHermesPersistedText(input.sourceLabel) ||
    "Hermes lifecycle supervision";
  const category = `hermes_${lifecycleEntry.kind}_lifecycle`;
  const memoryKey = `${lifecycleEntry.kind}:${lifecycleEntry.slug}`;
  const evidence = sanitizeHermesPersistedRecord({
    hermes_lifecycle: {
      id: lifecycleEntry.id,
      kind: lifecycleEntry.kind,
      slug: lifecycleEntry.slug,
      title: lifecycleEntry.title,
      description: lifecycleEntry.description,
      status: lifecycleEntry.status,
      version: lifecycleEntry.version,
      tenant_id: lifecycleEntry.tenantId ?? null,
      source_event_id: lifecycleEntry.sourceEventId ?? null,
      proposed_by: lifecycleEntry.proposedBy ?? null,
      proposed_at: lifecycleEntry.proposedAt ?? null,
      created_by: lifecycleEntry.createdBy ?? null,
      created_at: lifecycleEntry.createdAt,
      updated_at: lifecycleEntry.updatedAt,
    },
    payload: lifecycleEntry.payload,
  });
  const proposal = buildMemoryPromotionProposal({
    key: memoryKey,
    value: `${lifecycleEntry.title}: ${lifecycleEntry.description}`,
    category,
    source,
    sourceLabel,
    confidence: input.confidence ?? 0.75,
    evidence,
    proposedBy,
  });
  const eventPayload = sanitizeHermesPersistedRecord({
    ...buildMemoryPromotionEventPayload({
      action: "proposed",
      key: proposal.memoryKey,
      category,
      source: proposal.source,
      confidence: proposal.confidence,
    }),
    hermes_lifecycle_id: lifecycleEntry.id,
    hermes_lifecycle_kind: lifecycleEntry.kind,
    hermes_lifecycle_status: lifecycleEntry.status,
    hermes_lifecycle_slug: lifecycleEntry.slug,
    source_event_id: lifecycleEntry.sourceEventId ?? null,
    proposed_at: lifecycleEntry.proposedAt ?? null,
  });

  return {
    lifecycleEntry,
    brainMemory: {
      tenant_id: lifecycleEntry.tenantId ?? null,
      scope: "tenant",
      memory_type: proposal.memoryType,
      memory_key: proposal.memoryKey,
      value: proposal.value,
      source: proposal.source,
      confidence: proposal.confidence,
      promoted: false,
      created_by: proposedBy,
    },
    learningEvent: {
      tenant_id: lifecycleEntry.tenantId ?? null,
      event_type: "hermes_lifecycle_proposed",
      source_module: "agent_memory",
      payload: eventPayload,
      created_by: proposedBy,
    },
  };
}

export function buildHermesSkillOrMemoryProposalFromApprovedEvent(input: {
  event: HermesTrajectoryEvent;
  kind: HermesLifecycleKind;
  slug?: unknown;
  title?: unknown;
  description?: unknown;
  proposedBy?: string | null;
  payload?: Record<string, unknown> | null;
  at?: Date | string;
}): HermesSkillLifecycleEntry {
  if (!isApprovedHermesTrajectoryEvent(input.event)) {
    throw new Error("hermes_lifecycle_requires_approved_event");
  }

  const title =
    sanitizeHermesPersistedText(input.title) ||
    `${input.kind}: ${input.event.summary}`;
  const slug = normalizeSlug(input.slug ?? title);
  const description =
    sanitizeHermesPersistedText(input.description) || input.event.summary;

  return proposeHermesSkillLifecycleEntry({
    kind: input.kind,
    slug,
    title,
    description,
    tenantId: input.event.tenantId ?? null,
    sourceEventId: input.event.id,
    proposedBy: input.proposedBy ?? null,
    at: input.at,
    payload: {
      source_event_type: input.event.type,
      source_event_summary: input.event.summary,
      source_event_payload: input.event.payload,
      ...(input.payload ?? {}),
    },
  });
}
