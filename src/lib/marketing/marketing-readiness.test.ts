import { describe, expect, it } from "vitest";

import type { EditorialCalendarItem, MarketingProfile, ReferenceInput } from "./editorial-calendar";
import { buildMarketingFinalDraft, markMarketingFinalDraftReviewedInNotes, upsertMarketingFinalDraftInNotes } from "./content-draft";
import { buildMarketingReadiness } from "./marketing-readiness";

const now = new Date("2026-05-04T12:00:00.000Z");

const profile: MarketingProfile = {
  firmName: "MAYUS Advocacia",
  positioning: "Autoridade acessivel para explicar riscos juridicos com clareza.",
  legalAreas: ["Previdenciario"],
  audiences: ["Segurados do INSS"],
  channels: ["linkedin", "instagram"],
  voiceTone: "educational",
  websites: ["https://example.com"],
  socialProfiles: ["https://linkedin.com/company/example"],
  admiredReferences: ["Referencia premium"],
  ethicsGuardrails: ["Nao prometer resultado juridico"],
};

const reference: ReferenceInput = {
  id: "ref-1",
  title: "Como evitar erro no pedido do INSS",
  channel: "linkedin",
  legalArea: "Previdenciario",
  audience: "Segurados do INSS",
  contentType: "post",
  hook: "Como evitar erro no pedido do INSS",
};

function item(overrides: Partial<EditorialCalendarItem>): EditorialCalendarItem {
  return {
    id: overrides.id || "item-1",
    title: overrides.title || "Previdenciario: guia educativo",
    channel: overrides.channel || "linkedin",
    legalArea: overrides.legalArea || "Previdenciario",
    objective: overrides.objective || "authority",
    tone: overrides.tone || "educational",
    audience: overrides.audience || "Segurados do INSS",
    angle: overrides.angle || "guia educativo com ponto de vista proprio",
    guardrails: overrides.guardrails || ["Nao copiar referencias"],
    sourcePatternIds: overrides.sourcePatternIds || ["pattern-1"],
    date: overrides.date || "2026-05-06",
    status: overrides.status || "draft",
    notes: overrides.notes || "Editable calendar item generated from provided metadata only.",
  };
}

describe("marketing readiness", () => {
  it("classifies an empty Marketing OS and recommends autoconfiguration", () => {
    const readiness = buildMarketingReadiness(null, now);

    expect(readiness.status).toBe("empty");
    expect(readiness.score).toBeLessThan(50);
    expect(readiness.headline).toMatch(/precisa ser configurado/i);
    expect(readiness.recommendedActions[0]).toEqual(expect.objectContaining({
      id: "complete-profile",
      href: "/dashboard/marketing/perfil",
      priority: "high",
    }));
    expect(readiness.externalSideEffectsBlocked).toBe(true);
  });

  it("classifies a partial profile and points to missing references and calendar", () => {
    const readiness = buildMarketingReadiness({
      profile: { ...profile, admiredReferences: [] },
      references: [],
      calendar: [],
    }, now);

    expect(readiness.status).toBe("partial");
    expect(readiness.checks.find((check) => check.id === "positioning")?.complete).toBe(true);
    expect(readiness.checks.find((check) => check.id === "references")?.complete).toBe(false);
    expect(readiness.recommendedActions.map((action) => action.id)).toEqual(expect.arrayContaining([
      "add-references",
      "create-calendar",
    ]));
  });

  it("detects weekly content and approved items without internal tasks", () => {
    const readiness = buildMarketingReadiness({
      profile,
      references: [reference],
      calendar: [
        item({ id: "draft-1", status: "draft", date: "2026-05-05" }),
        item({ id: "approved-1", status: "approved", date: "2026-05-07" }),
      ],
    }, now);

    expect(readiness.thisWeek.map((content) => content.id)).toEqual(["draft-1", "approved-1"]);
    expect(readiness.approvedWithoutTask.map((content) => content.id)).toEqual(["approved-1"]);
    expect(readiness.metrics.find((metric) => metric.label === "Aprovados sem tarefa")?.value).toBe(1);
    expect(readiness.recommendedActions.map((action) => action.id)).toContain("task-approved");
  });

  it("marks the Marketing OS as ready when approved content is operationalized", () => {
    const readiness = buildMarketingReadiness({
      profile,
      references: [reference],
      calendar: [
        item({ id: "published-1", status: "published", notes: "Publicado manualmente." }),
        item({ id: "approved-1", status: "approved", notes: "Origem: marketing_editorial_calendar" }),
      ],
    }, now);

    expect(readiness.status).toBe("ready");
    expect(readiness.score).toBe(100);
    expect(readiness.approvedWithoutTask).toHaveLength(0);
    expect(readiness.checks.every((check) => check.complete)).toBe(true);
  });

  it("surfaces reviewed final drafts as ready to publish", () => {
    const approved = item({ id: "approved-1", status: "approved", notes: "Origem: marketing_editorial_calendar" });
    const draft = buildMarketingFinalDraft(approved, profile);
    const reviewedNotes = markMarketingFinalDraftReviewedInNotes(
      upsertMarketingFinalDraftInNotes(approved.notes, draft),
      "2026-05-04T10:00:00.000Z",
    );
    const readiness = buildMarketingReadiness({
      profile,
      references: [reference],
      calendar: [
        { ...approved, notes: reviewedNotes },
        item({ id: "needs-review", status: "approved", notes: "Origem: marketing_editorial_calendar" }),
      ],
    }, now);

    expect(readiness.readyToPublish.map((content) => content.id)).toEqual(["approved-1"]);
    expect(readiness.needsFinalReview.map((content) => content.id)).toEqual(["needs-review"]);
    expect(readiness.metrics.find((metric) => metric.label === "Prontos para publicar")?.value).toBe(1);
    expect(readiness.metrics.find((metric) => metric.label === "Precisam revisao")?.value).toBe(1);
    expect(readiness.recommendedActions.map((action) => action.id)).toContain("publish-ready-content");
  });
});
