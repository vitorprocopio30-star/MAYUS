import { describe, expect, it } from "vitest";

import type { EditorialCalendarItem, MarketingProfile } from "./editorial-calendar";
import {
  buildMarketingFinalDraft,
  hasReviewedMarketingFinalDraft,
  markMarketingFinalDraftReviewedInNotes,
  readMarketingFinalDraftFromNotes,
  upsertMarketingFinalDraftInNotes,
} from "./content-draft";

const profile: MarketingProfile = {
  firmName: "MAYUS Advocacia",
  positioning: "autoridade acessivel e responsavel",
  legalAreas: ["Previdenciario"],
  audiences: ["Segurados do INSS"],
  channels: ["linkedin"],
  voiceTone: "educational",
  websites: [],
  socialProfiles: [],
  admiredReferences: [],
  ethicsGuardrails: ["Nao prometer resultado"],
};

function item(overrides: Partial<EditorialCalendarItem> = {}): EditorialCalendarItem {
  return {
    id: "content-1",
    title: "Previdenciario: como revisar negativa do INSS",
    channel: "linkedin",
    legalArea: "Previdenciario",
    objective: "lead_generation",
    tone: "educational",
    audience: "Segurados do INSS",
    angle: "resposta objetiva para uma duvida recorrente de segurados do INSS",
    guardrails: ["Nao copiar referencias"],
    sourcePatternIds: ["pattern-1"],
    date: "2026-05-04",
    status: "approved",
    notes: "Aprovado para publicacao manual.",
    ...overrides,
  };
}

describe("marketing final draft", () => {
  it("generates a supervised LinkedIn final draft from approved content", () => {
    const draft = buildMarketingFinalDraft(item(), profile);

    expect(draft.format).toBe("Post LinkedIn");
    expect(draft.body).toContain("Previdenciario: como revisar negativa do INSS");
    expect(draft.body).toContain("MAYUS Advocacia");
    expect(draft.cta).toMatch(/procure orientacao juridica/i);
    expect(draft.humanApprovalRequired).toBe(true);
    expect(draft.externalSideEffectsBlocked).toBe(true);
  });

  it("adapts the structure for Instagram content", () => {
    const draft = buildMarketingFinalDraft(item({ channel: "instagram" }), profile);

    expect(draft.format).toBe("Roteiro de carrossel/legenda");
    expect(draft.body).toContain("Slide 1:");
    expect(draft.body).toContain("Legenda:");
  });

  it("blocks final drafts for non-approved content", () => {
    expect(() => buildMarketingFinalDraft(item({ status: "draft" }), profile)).toThrow(/approved or published/i);
  });

  it("always includes an ethical checklist before manual publication", () => {
    const draft = buildMarketingFinalDraft(item({ channel: "whatsapp" }), profile);

    expect(draft.format).toBe("Mensagem supervisionada");
    expect(draft.ethicalChecklist).toEqual(expect.arrayContaining([
      "Nao prometer resultado juridico.",
      "Publicacao ou envio externo exige acao humana manual.",
    ]));
  });

  it("persists and recovers the final draft inside calendar notes", () => {
    const draft = buildMarketingFinalDraft(item(), profile);
    const notes = upsertMarketingFinalDraftInNotes("Aprovado pela equipe.", draft);

    const recovered = readMarketingFinalDraftFromNotes(notes);

    expect(notes).toContain("Aprovado pela equipe.");
    expect(recovered).toEqual(draft);
  });

  it("replaces the previous saved final draft instead of duplicating it", () => {
    const firstDraft = buildMarketingFinalDraft(item({ title: "Primeiro titulo" }), profile);
    const secondDraft = buildMarketingFinalDraft(item({ title: "Segundo titulo" }), profile);
    const firstNotes = upsertMarketingFinalDraftInNotes("Notas originais", firstDraft);
    const secondNotes = upsertMarketingFinalDraftInNotes(firstNotes, secondDraft);

    expect(readMarketingFinalDraftFromNotes(secondNotes)?.title).toBe("Segundo titulo");
    expect(secondNotes.match(/MAYUS_MARKETING_FINAL_DRAFT_START/g)).toHaveLength(1);
  });

  it("marks a saved final draft as reviewed without changing its body", () => {
    const draft = buildMarketingFinalDraft(item(), profile);
    const notes = upsertMarketingFinalDraftInNotes("Notas originais", draft);
    const reviewedNotes = markMarketingFinalDraftReviewedInNotes(notes, "2026-05-04T10:00:00.000Z");
    const reviewedDraft = readMarketingFinalDraftFromNotes(reviewedNotes);

    expect(reviewedDraft?.body).toBe(draft.body);
    expect(reviewedDraft?.reviewedAt).toBe("2026-05-04T10:00:00.000Z");
  });

  it("detects whether a saved final draft is reviewed", () => {
    const draft = buildMarketingFinalDraft(item(), profile);
    const notes = upsertMarketingFinalDraftInNotes("Notas originais", draft);
    const reviewedNotes = markMarketingFinalDraftReviewedInNotes(notes, "2026-05-04T10:00:00.000Z");

    expect(hasReviewedMarketingFinalDraft(notes)).toBe(false);
    expect(hasReviewedMarketingFinalDraft(reviewedNotes)).toBe(true);
  });
});
