import { describe, expect, it } from "vitest";
import {
  approveHermesSkillLifecycleEntry,
  assertHermesSkillCanBeUsed,
  buildPersistableHermesLifecycleProposal,
  buildHermesSkillOrMemoryProposalFromApprovedEvent,
  createHermesSkillDraft,
  proposeHermesSkillLifecycleEntry,
  revokeHermesSkillLifecycleEntry,
} from "./skill-lifecycle";
import {
  createHermesMissionTrajectory,
  recordHermesMissionApproval,
} from "../runtime/trajectory";

describe("Hermes skill lifecycle", () => {
  it("keeps a skill proposal in proposed status", () => {
    const draft = createHermesSkillDraft({
      slug: " Atendimento Comercial ",
      title: "Atendimento comercial MAYUS",
      description:
        "Aplicar abordagem consultiva sem persistir senha=valor-secreto.",
      payload: {
        api_key: "secret-key",
        owner_email: "operador@mayus.test",
      },
      createdBy: "agent-hermes",
      at: "2026-05-15T11:00:00.000Z",
    });

    const proposal = proposeHermesSkillLifecycleEntry({
      ...draft,
      proposedBy: "agent-hermes",
    });
    const persisted = JSON.stringify(proposal);

    expect(proposal.status).toBe("proposed");
    expect(proposal.approvedBy).toBeUndefined();
    expect(persisted).toContain("[redacted]");
    expect(persisted).toContain("[pii-redacted]");
    expect(persisted).not.toContain("secret-key");
    expect(persisted).not.toContain("operador@mayus.test");
    expect(persisted).not.toContain("valor-secreto");
  });

  it("creates a supervised skill or memory proposal from an approved event", () => {
    const trajectory = createHermesMissionTrajectory({
      missionId: "mission-approved-event",
      objective: "Preparar aprendizado aprovado",
    });
    const approvedTrajectory = recordHermesMissionApproval(trajectory, {
      summary: "Operador aprovou transformar o aprendizado em memoria.",
      decision: "approved",
      payload: {
        approvalId: "approval-1",
        token: "do-not-store",
      },
    });
    const approvedEvent = approvedTrajectory.events.at(-1);

    if (!approvedEvent) throw new Error("missing approval event");

    const proposal = buildHermesSkillOrMemoryProposalFromApprovedEvent({
      event: approvedEvent,
      kind: "memory",
      title: "Preferencia de atendimento",
      description: "Sempre confirmar proximo passo antes de encerrar.",
      proposedBy: "agent-hermes",
      payload: {
        observed_phone: "+55 11 98888-7777",
      },
      at: "2026-05-15T11:10:00.000Z",
    });

    expect(proposal.kind).toBe("memory");
    expect(proposal.status).toBe("proposed");
    expect(proposal.sourceEventId).toBe(approvedEvent.id);
    expect(JSON.stringify(proposal)).not.toContain("do-not-store");
    expect(JSON.stringify(proposal)).not.toContain("98888-7777");
  });

  it("builds a persistable brain memory and learning event proposal without auto-approval", () => {
    const draft = createHermesSkillDraft({
      kind: "skill",
      slug: "Atendimento com dados sensiveis",
      title: "Atendimento consultivo",
      description:
        "Nunca repetir senha=valor-secreto do cliente operador@mayus.test.",
      tenantId: "tenant-1",
      sourceEventId: "event-1",
      payload: {
        api_key: "api-secret-value",
        observed_phone: "+55 11 98888-7777",
        safe_note: "Confirmar proximo passo.",
      },
      createdBy: "agent-hermes",
      at: "2026-05-15T11:40:00.000Z",
    });

    const persistable = buildPersistableHermesLifecycleProposal(draft, {
      proposedBy: "agent-hermes",
      confidence: 88,
      at: "2026-05-15T11:41:00.000Z",
    });
    const serialized = JSON.stringify(persistable);

    expect(persistable.lifecycleEntry.status).toBe("proposed");
    expect(persistable.lifecycleEntry.approvedBy).toBeNull();
    expect(persistable.brainMemory).toMatchObject({
      tenant_id: "tenant-1",
      scope: "tenant",
      memory_type: "institutional_memory_proposal",
      source: "hermes_lifecycle",
      confidence: 0.88,
      promoted: false,
      created_by: "agent-hermes",
    });
    expect(persistable.brainMemory.value).toMatchObject({
      category: "hermes_skill_lifecycle",
      status: "proposed",
      proposed_by: "agent-hermes",
    });
    expect(persistable.learningEvent).toMatchObject({
      tenant_id: "tenant-1",
      event_type: "hermes_lifecycle_proposed",
      source_module: "agent_memory",
      created_by: "agent-hermes",
    });
    expect(persistable.learningEvent.payload).toMatchObject({
      action: "proposed",
      hermes_lifecycle_status: "proposed",
      hermes_lifecycle_kind: "skill",
    });
    expect(serialized).toContain("[redacted]");
    expect(serialized).toContain("[pii-redacted]");
    expect(serialized).not.toContain("api-secret-value");
    expect(serialized).not.toContain("valor-secreto");
    expect(serialized).not.toContain("operador@mayus.test");
    expect(serialized).not.toContain("98888-7777");
    expect(persistable.brainMemory.value.status).not.toBe("approved");
  });

  it("promotes approval to approved only through supervised approval", () => {
    const proposal = proposeHermesSkillLifecycleEntry({
      slug: "triagem-documental",
      title: "Triagem documental",
      description: "Checar documentos faltantes antes de acionar rotina.",
      proposedBy: "agent-hermes",
      at: "2026-05-15T11:20:00.000Z",
    });

    const approved = approveHermesSkillLifecycleEntry(proposal, {
      approverId: "operator-1",
      approvalEventId: "approval-2",
      at: "2026-05-15T11:21:00.000Z",
    });

    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe("operator-1");
    expect(approved.sourceEventId).toBe("approval-2");
    expect(assertHermesSkillCanBeUsed(approved)).toBe(approved);
  });

  it("requires an explicit human approver before approved status exists", () => {
    const proposal = proposeHermesSkillLifecycleEntry({
      slug: "controle-humano",
      title: "Controle humano",
      description: "Aprovacao de lifecycle precisa de operador.",
      proposedBy: "agent-hermes",
    });

    expect(() =>
      approveHermesSkillLifecycleEntry(proposal, {
        approverId: "   ",
      }),
    ).toThrow("hermes_skill_lifecycle_requires_approver");
    expect(proposal.status).toBe("proposed");
    expect(proposal.approvedBy).toBeUndefined();
  });

  it("blocks future use after a skill is revoked", () => {
    const approved = approveHermesSkillLifecycleEntry(
      proposeHermesSkillLifecycleEntry({
        slug: "followup-whatsapp",
        title: "Follow-up WhatsApp",
        description: "Sugerir proximo contato supervisionado.",
        proposedBy: "agent-hermes",
      }),
      {
        approverId: "operator-1",
      },
    );

    const revoked = revokeHermesSkillLifecycleEntry(approved, {
      reviewerId: "operator-2",
      reason: "Regra antiga com bearer old-token-value.",
      at: "2026-05-15T11:30:00.000Z",
    });

    expect(revoked.status).toBe("revoked");
    expect(revoked.revokeReason).toContain("[redacted]");
    expect(() => assertHermesSkillCanBeUsed(revoked)).toThrow(
      "hermes_skill_revoked_cannot_be_used",
    );
    expect(() => buildPersistableHermesLifecycleProposal(revoked)).toThrow(
      "hermes_skill_lifecycle_revoked_cannot_be_persisted",
    );
  });

  it("does not turn already approved entries back into persistable proposals", () => {
    const approved = approveHermesSkillLifecycleEntry(
      proposeHermesSkillLifecycleEntry({
        slug: "auditoria-humana",
        title: "Auditoria humana",
        description: "Somente usar depois de aprovacao explicita.",
        proposedBy: "agent-hermes",
      }),
      {
        approverId: "operator-1",
      },
    );

    expect(() => buildPersistableHermesLifecycleProposal(approved)).toThrow(
      "hermes_skill_lifecycle_approved_cannot_be_persisted_as_proposal",
    );
  });
});
