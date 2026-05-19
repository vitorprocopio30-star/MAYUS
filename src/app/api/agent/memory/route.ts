// src/app/api/agent/memory/route.ts
//
// CRUD da Memória Institucional do Escritório
// GET    → lista entradas do tenant
// POST   → cria nova entrada
// PATCH  → edita key, value, category ou enforced
// DELETE → remove entrada (via query param ?id=)
//
// Acesso: apenas admin/socio
// Isolamento: tenant_id em todas as queries

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  buildApprovedProposalValue,
  buildMemoryPromotionEventPayload,
  buildMemoryPromotionProposal,
  buildRejectedProposalValue,
  buildRevokedMemoryValue,
  deserializeInstitutionalMemoryValue,
  normalizeMemoryProposalRow,
  sanitizeMemoryText,
  serializeInstitutionalMemoryValue,
} from "@/lib/agent/memory/promotion";
import {
  buildPersistableHermesLifecycleProposal,
  createHermesSkillDraft,
} from "@/lib/agent/memory/skill-lifecycle";

const ALLOWED_ROLES = ["admin", "administrador", "socio", "mayus_admin"];

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Service Client (singleton no módulo) ────────────────────────────────────

async function getAuthSession() {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch { }
        },
      },
    }
  );
  return authClient.auth.getSession();
}

async function getProfile(userId: string) {
  const { data } = await serviceClient
    .from("profiles")
    .select("role, tenant_id")
    .eq("id", userId)
    .single();
  return data;
}

function normalizeRole(role: string | null | undefined) {
  return String(role || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function authGuard() {
  const { data: { session } } = await getAuthSession();
  if (!session) return { error: "Nao autenticado.", status: 401, session: null, profile: null };

  const profile = await getProfile(session.user.id);
  if (!profile?.role || !profile?.tenant_id) {
    return { error: "Perfil nao encontrado.", status: 403, session, profile: null };
  }
  if (!ALLOWED_ROLES.includes(normalizeRole(profile.role))) {
    return { error: "Sem permissao.", status: 403, session, profile: null };
  }

  return { error: null, status: 200, session, profile };
}

// ─── Serialização de value (JSONB) ────────────────────────────────────────────

/** Frontend envia string → banco armazena como { text: "..." } */
function serializeValue(text: string): object {
  return serializeInstitutionalMemoryValue(text);
}

/** Banco retorna { text: "..." } → frontend recebe string */
function deserializeValue(jsonb: unknown): string {
  return deserializeInstitutionalMemoryValue(jsonb);
}

const SELF_CORRECTION_EVENT_TYPES = [
  "self_correction_attempted",
  "self_correction_applied",
  "self_correction_requires_approval",
  "self_correction_blocked",
  "self_correction_failed",
  "self_correction_not_available",
];

type SelfCorrectionLearningRow = {
  id: string;
  event_type: string;
  source_module: string | null;
  payload: Record<string, unknown> | null;
  created_at: string | null;
};

function readPayloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeCorrectionStatus(eventType: string, payload: Record<string, unknown>) {
  if (typeof payload.correction_status === "string") {
    return sanitizeMemoryText(payload.correction_status).slice(0, 80);
  }

  return eventType.replace("self_correction_", "").replace("applied", "corrected").slice(0, 80);
}

function normalizeSelfCorrectionRows(rows: SelfCorrectionLearningRow[]) {
  return rows.map((row) => {
    const payload = readPayloadRecord(row.payload);
    return {
      id: row.id,
      eventType: row.event_type,
      status: normalizeCorrectionStatus(row.event_type, payload),
      sourceModule: sanitizeMemoryText(row.source_module || "").slice(0, 120),
      targetModule: sanitizeMemoryText(payload.target_module || "").slice(0, 120),
      correctionKind: sanitizeMemoryText(payload.correction_kind || "").slice(0, 120),
      riskLevel: sanitizeMemoryText(payload.risk_level || "").slice(0, 40),
      recommendedAction: sanitizeMemoryText(payload.recommended_action || "").slice(0, 500),
      reason: sanitizeMemoryText(payload.reason || "").slice(0, 500),
      externalSideEffectsBlocked: payload.external_side_effects_blocked === true,
      createdAt: row.created_at,
    };
  });
}

function buildSelfCorrectionSummary(rows: SelfCorrectionLearningRow[]) {
  const recent = normalizeSelfCorrectionRows(rows);
  const byStatus = recent.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  return {
    total: recent.length,
    attempted: byStatus.attempted || 0,
    corrected: byStatus.corrected || 0,
    requiresApproval: byStatus.requires_approval || 0,
    blocked: byStatus.blocked || 0,
    failed: byStatus.failed || 0,
    notAvailable: byStatus.no_correction_available || 0,
    recent: recent.slice(0, 8),
  };
}

async function recordLearningEvent(
  tenantId: string,
  userId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  const { error } = await serviceClient
    .from("learning_events")
    .insert({
      tenant_id: tenantId,
      event_type: eventType,
      source_module: "agent_memory",
      payload,
      created_by: userId,
    });

  if (error) {
    console.warn("[Memory learning event]", error.message);
  }
}

// ─── GET /api/agent/memory ────────────────────────────────────────────────────

export async function GET() {
  const auth = await authGuard();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await serviceClient
    .from("office_institutional_memory")
    .select("id, category, key, value, enforced, created_by, created_at")
    .eq("tenant_id", auth.profile!.tenant_id)
    .order("category", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[Memory GET]", error.message);
    return NextResponse.json({ error: "Erro ao buscar memória." }, { status: 500 });
  }

  const entries = (data ?? []).map(e => ({
    ...e,
    value: deserializeValue(e.value),
  }));

  const { data: proposalRows, error: proposalError } = await serviceClient
    .from("brain_memories")
    .select("id, memory_key, value, source, confidence, promoted, created_by, created_at, updated_at")
    .eq("tenant_id", auth.profile!.tenant_id)
    .eq("scope", "tenant")
    .eq("memory_type", "institutional_memory_proposal")
    .eq("promoted", false)
    .order("created_at", { ascending: false });

  if (proposalError) {
    console.warn("[Memory proposals GET]", proposalError.message);
  }

  const proposals = (proposalRows ?? [])
    .map(normalizeMemoryProposalRow)
    .filter(proposal => proposal.status === "proposed");

  const { data: correctionRows, error: correctionError } = await serviceClient
    .from("learning_events")
    .select("id, event_type, source_module, payload, created_at")
    .eq("tenant_id", auth.profile!.tenant_id)
    .in("event_type", SELF_CORRECTION_EVENT_TYPES)
    .order("created_at", { ascending: false })
    .limit(50);

  if (correctionError) {
    console.warn("[Memory self-corrections GET]", correctionError.message);
  }

  const correctionSummary = buildSelfCorrectionSummary((correctionRows ?? []) as SelfCorrectionLearningRow[]);

  return NextResponse.json({ entries, proposals, correctionSummary });
}

// ─── POST /api/agent/memory ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await authGuard();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const { key, value, category } = body;

  if (body?.action === "propose_hermes_lifecycle" || body?.hermesLifecycle === true) {
    let persistable;

    try {
      const draft = createHermesSkillDraft({
        kind: body.kind === "memory" ? "memory" : "skill",
        slug: body.slug ?? body.key ?? body.title,
        title: body.title,
        description: body.description ?? body.value,
        tenantId: auth.profile!.tenant_id,
        sourceEventId: body.sourceEventId,
        payload: body.payload,
        createdBy: auth.session!.user.id,
      });

      persistable = buildPersistableHermesLifecycleProposal(draft, {
        proposedBy: auth.session!.user.id,
        source: body.source,
        sourceLabel: body.sourceLabel,
        confidence: body.confidence,
      });
    } catch {
      return NextResponse.json({ error: "Lifecycle Hermes exige slug, title e description validos." }, { status: 400 });
    }

    const { data, error } = await serviceClient
      .from("brain_memories")
      .insert({
        ...persistable.brainMemory,
        tenant_id: auth.profile!.tenant_id,
        created_by: auth.session!.user.id,
      })
      .select("id, memory_key, value, source, confidence, promoted, created_by, created_at, updated_at")
      .single();

    if (error) {
      console.error("[Hermes lifecycle proposal POST]", error.message);
      return NextResponse.json({ error: "Erro ao propor lifecycle Hermes." }, { status: 500 });
    }

    const normalized = normalizeMemoryProposalRow(data);
    await recordLearningEvent(
      auth.profile!.tenant_id,
      auth.session!.user.id,
      persistable.learningEvent.event_type,
      persistable.learningEvent.payload,
    );

    return NextResponse.json({
      proposal: normalized,
      lifecycleEntry: persistable.lifecycleEntry,
    }, { status: 201 });
  }

  if (body?.action === "propose" || body?.proposal === true) {
    let proposal;

    try {
      proposal = buildMemoryPromotionProposal({
        key,
        value,
        category,
        source: body.source,
        sourceLabel: body.sourceLabel,
        confidence: body.confidence,
        evidence: body.evidence,
        proposedBy: auth.session!.user.id,
      });
    } catch {
      return NextResponse.json({ error: "Proposta exige key e value validos." }, { status: 400 });
    }

    const { data, error } = await serviceClient
      .from("brain_memories")
      .insert({
        tenant_id: auth.profile!.tenant_id,
        scope: "tenant",
        memory_type: proposal.memoryType,
        memory_key: proposal.memoryKey,
        value: proposal.value,
        source: proposal.source,
        confidence: proposal.confidence,
        promoted: false,
        created_by: auth.session!.user.id,
      })
      .select("id, memory_key, value, source, confidence, promoted, created_by, created_at, updated_at")
      .single();

    if (error) {
      console.error("[Memory proposal POST]", error.message);
      return NextResponse.json({ error: "Erro ao criar proposta de memoria." }, { status: 500 });
    }

    const normalized = normalizeMemoryProposalRow(data);
    await recordLearningEvent(
      auth.profile!.tenant_id,
      auth.session!.user.id,
      "memory_promotion_proposed",
      buildMemoryPromotionEventPayload({
        action: "proposed",
        key: normalized.key,
        category: normalized.category,
        source: normalized.source,
        confidence: normalized.confidence,
      }),
    );

    return NextResponse.json({ proposal: normalized }, { status: 201 });
  }

  if (!key || typeof key !== "string" || key.trim().length === 0) {
    return NextResponse.json({ error: "key invalida ou ausente." }, { status: 400 });
  }
  if (!value || typeof value !== "string" || value.trim().length === 0) {
    return NextResponse.json({ error: "value invalido ou ausente." }, { status: 400 });
  }
  if (!category || typeof category !== "string" || category.trim().length === 0) {
    return NextResponse.json({ error: "category invalida ou ausente." }, { status: 400 });
  }

  const { data, error } = await serviceClient
    .from("office_institutional_memory")
    .insert({
      tenant_id:  auth.profile!.tenant_id,
      key:        key.trim(),
      value:      serializeValue(value),
      category:   category.trim().toLowerCase(),
      enforced:   true,
      created_by: auth.session!.user.id,
    })
    .select("id, category, key, value, enforced, created_at")
    .single();

  if (error) {
    console.error("[Memory POST]", error.message);
    return NextResponse.json({ error: "Erro ao criar entrada." }, { status: 500 });
  }

  return NextResponse.json(
    { entry: { ...data, value: deserializeValue(data.value) } },
    { status: 201 }
  );
}

// ─── PATCH /api/agent/memory ──────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const auth = await authGuard();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json();
  const { action, proposalId, entryId, key, value, category, enforced } = body;

  if (action === "approve" || action === "reject") {
    if (!proposalId || typeof proposalId !== "string") {
      return NextResponse.json({ error: "proposalId invalido ou ausente." }, { status: 400 });
    }

    const { data: proposalRow, error: proposalError } = await serviceClient
      .from("brain_memories")
      .select("id, memory_key, value, source, confidence, promoted, created_by, created_at, updated_at")
      .eq("id", proposalId)
      .eq("tenant_id", auth.profile!.tenant_id)
      .eq("scope", "tenant")
      .eq("memory_type", "institutional_memory_proposal")
      .single();

    if (proposalError || !proposalRow) {
      console.error("[Memory proposal PATCH]", proposalError?.message);
      return NextResponse.json({ error: "Proposta nao encontrada." }, { status: 404 });
    }

    const proposal = normalizeMemoryProposalRow(proposalRow);

    if (proposal.promoted || proposal.status !== "proposed") {
      return NextResponse.json({ error: "Proposta ja foi revisada." }, { status: 409 });
    }

    if (action === "reject") {
      const rejectedValue = buildRejectedProposalValue(proposal, {
        reviewerId: auth.session!.user.id,
        reason: body.reason,
      });

      const { data: rejectedRow, error } = await serviceClient
        .from("brain_memories")
        .update({ value: rejectedValue })
        .eq("id", proposalId)
        .eq("tenant_id", auth.profile!.tenant_id)
        .select("id, memory_key, value, source, confidence, promoted, created_by, created_at, updated_at")
        .single();

      if (error || !rejectedRow) {
        console.error("[Memory proposal reject]", error?.message);
        return NextResponse.json({ error: "Erro ao rejeitar proposta." }, { status: 500 });
      }

      const rejected = normalizeMemoryProposalRow(rejectedRow);
      await recordLearningEvent(
        auth.profile!.tenant_id,
        auth.session!.user.id,
        "memory_promotion_rejected",
        buildMemoryPromotionEventPayload({
          action: "rejected",
          key: rejected.key,
          category: rejected.category,
          source: rejected.source,
          confidence: rejected.confidence,
          reason: body.reason,
        }),
      );

      return NextResponse.json({ proposal: rejected });
    }

    const { data: insertedEntry, error: insertError } = await serviceClient
      .from("office_institutional_memory")
      .insert({
        tenant_id: auth.profile!.tenant_id,
        key: proposal.key,
        value: serializeValue(proposal.value),
        category: proposal.category,
        enforced: true,
        created_by: auth.session!.user.id,
      })
      .select("id, category, key, value, enforced, created_at")
      .single();

    if (insertError || !insertedEntry) {
      console.error("[Memory proposal approve insert]", insertError?.message);
      return NextResponse.json({ error: "Erro ao promover memoria." }, { status: 500 });
    }

    const approvedValue = buildApprovedProposalValue(proposal, {
      approverId: auth.session!.user.id,
      memoryEntryId: insertedEntry.id,
    });

    const { data: approvedRow, error: approveError } = await serviceClient
      .from("brain_memories")
      .update({ promoted: true, value: approvedValue })
      .eq("id", proposalId)
      .eq("tenant_id", auth.profile!.tenant_id)
      .select("id, memory_key, value, source, confidence, promoted, created_by, created_at, updated_at")
      .single();

    if (approveError || !approvedRow) {
      console.error("[Memory proposal approve update]", approveError?.message);
      return NextResponse.json({ error: "Memoria criada, mas houve erro ao auditar aprovacao." }, { status: 500 });
    }

    const approved = normalizeMemoryProposalRow(approvedRow);
    await recordLearningEvent(
      auth.profile!.tenant_id,
      auth.session!.user.id,
      "memory_promotion_approved",
      buildMemoryPromotionEventPayload({
        action: "approved",
        key: approved.key,
        category: approved.category,
        source: approved.source,
        confidence: approved.confidence,
      }),
    );

    return NextResponse.json({
      entry: { ...insertedEntry, value: deserializeValue(insertedEntry.value) },
      proposal: approved,
    });
  }

  if (action === "revoke") {
    if (!entryId || typeof entryId !== "string") {
      return NextResponse.json({ error: "entryId invalido ou ausente." }, { status: 400 });
    }

    const { data: currentEntry, error: readError } = await serviceClient
      .from("office_institutional_memory")
      .select("id, category, key, value, enforced")
      .eq("id", entryId)
      .eq("tenant_id", auth.profile!.tenant_id)
      .single();

    if (readError || !currentEntry) {
      console.error("[Memory revoke read]", readError?.message);
      return NextResponse.json({ error: "Entrada nao encontrada." }, { status: 404 });
    }

    const revocationValue = buildRevokedMemoryValue(currentEntry, {
      reviewerId: auth.session!.user.id,
      reason: body.reason,
    });

    const { data: revokedEntry, error: revokeError } = await serviceClient
      .from("office_institutional_memory")
      .update({ enforced: false })
      .eq("id", entryId)
      .eq("tenant_id", auth.profile!.tenant_id)
      .select("id, category, key, value, enforced")
      .single();

    if (revokeError || !revokedEntry) {
      console.error("[Memory revoke update]", revokeError?.message);
      return NextResponse.json({ error: "Erro ao revogar memoria." }, { status: 500 });
    }

    const { error: revocationAuditError } = await serviceClient
      .from("brain_memories")
      .insert({
        tenant_id: auth.profile!.tenant_id,
        scope: "tenant",
        memory_type: "institutional_memory_revocation",
        memory_key: currentEntry.key,
        value: revocationValue,
        source: "memory_panel",
        confidence: 1,
        promoted: false,
        created_by: auth.session!.user.id,
      });

    if (revocationAuditError) {
      console.warn("[Memory revoke audit]", revocationAuditError.message);
    }

    await recordLearningEvent(
      auth.profile!.tenant_id,
      auth.session!.user.id,
      "memory_promotion_revoked",
      buildMemoryPromotionEventPayload({
        action: "revoked",
        key: currentEntry.key,
        category: currentEntry.category,
        source: "memory_panel",
        confidence: 1,
        reason: body.reason,
      }),
    );

    return NextResponse.json({ entry: { ...revokedEntry, value: deserializeValue(revokedEntry.value) } });
  }

  if (!entryId || typeof entryId !== "string") {
    return NextResponse.json({ error: "entryId invalido ou ausente." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (key      !== undefined) updates.key      = String(key).trim();
  if (value    !== undefined) updates.value    = serializeValue(String(value));
  if (category !== undefined) updates.category = String(category).trim().toLowerCase();
  if (enforced !== undefined && typeof enforced === "boolean") updates.enforced = enforced;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar." }, { status: 400 });
  }

  const { data, error } = await serviceClient
    .from("office_institutional_memory")
    .update(updates)
    .eq("id", entryId)
    .eq("tenant_id", auth.profile!.tenant_id) // isolamento de tenant
    .select("id, category, key, value, enforced")
    .single();

  if (error || !data) {
    console.error("[Memory PATCH]", error?.message);
    return NextResponse.json({ error: "Entrada nao encontrada ou erro ao atualizar." }, { status: 404 });
  }

  return NextResponse.json({ entry: { ...data, value: deserializeValue(data.value) } });
}

// ─── DELETE /api/agent/memory?id= ────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await authGuard();
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const entryId = req.nextUrl.searchParams.get("id");

  if (!entryId) {
    return NextResponse.json({ error: "Query param ?id= ausente." }, { status: 400 });
  }

  const { error } = await serviceClient
    .from("office_institutional_memory")
    .delete()
    .eq("id", entryId)
    .eq("tenant_id", auth.profile!.tenant_id); // isolamento de tenant

  if (error) {
    console.error("[Memory DELETE]", error.message);
    return NextResponse.json({ error: "Erro ao deletar entrada." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
