import { describe, expect, it } from "vitest";

import type { EditorialCalendarItem, MarketingProfile, ReferenceInput } from "./editorial-calendar";
import { buildMarketingCopywriterDraft } from "./marketing-copywriter";

const profile: MarketingProfile = {
  firmName: "MAYUS Advocacia",
  positioning: "autoridade acessivel com orientacao juridica responsavel",
  legalAreas: ["Familia"],
  audiences: ["pais em disputa de guarda"],
  channels: ["linkedin", "instagram"],
  voiceTone: "educational",
  websites: [],
  socialProfiles: [],
  admiredReferences: [],
  ethicsGuardrails: ["Nao prometer resultado"],
};

const item: EditorialCalendarItem = {
  id: "content-1",
  title: "Familia: guarda compartilhada sem decisao precipitada",
  channel: "linkedin",
  legalArea: "Familia",
  objective: "lead_generation",
  tone: "educational",
  audience: "pais em disputa de guarda",
  angle: "resposta objetiva para organizar provas e prazos antes de pedir guarda",
  guardrails: ["Nao copiar referencias"],
  sourcePatternIds: ["pattern-1"],
  date: "2026-05-04",
  status: "approved",
  notes: "Aprovado para rascunho final.",
};

const reference: ReferenceInput = {
  id: "ref-1",
  title: "3 erros em guarda compartilhada",
  channel: "linkedin",
  legalArea: "Familia",
  audience: "pais em disputa de guarda",
  contentType: "post educativo",
  hook: "3 erros antes de pedir guarda compartilhada",
  metrics: { saves: 20, shares: 8, leads: 2 },
};

describe("marketing copywriter", () => {
  it("creates responsible legal copy with attribution hints and variants", () => {
    const draft = buildMarketingCopywriterDraft({ item, profile, references: [reference] });

    expect(draft.format).toBe("Post LinkedIn");
    expect(draft.body).toContain("MAYUS Advocacia");
    expect(draft.body).toContain("Nao substitui analise individual");
    expect(draft.variants).toHaveLength(3);
    expect(draft.campaignSuggestion).toBe("familia-lead-generation-linkedin");
    expect(draft.attributionHint).toEqual(expect.objectContaining({
      contentTitle: item.title,
      campaign: "familia-lead-generation-linkedin",
    }));
    expect(draft.humanApprovalRequired).toBe(true);
    expect(draft.externalSideEffectsBlocked).toBe(true);
  });

  it("adapts the body to Instagram carousel structure", () => {
    const draft = buildMarketingCopywriterDraft({ item: { ...item, channel: "instagram" }, profile, references: [reference] });

    expect(draft.format).toBe("Roteiro de carrossel/legenda");
    expect(draft.body).toContain("Slide 1:");
    expect(draft.body).toContain("Legenda:");
  });

  it("raises risk flags for promises or real case signals", () => {
    const draft = buildMarketingCopywriterDraft({
      item: {
        ...item,
        title: "Causa ganha em guarda",
        angle: "resultado certo para cliente real com processo identificado",
      },
      profile,
      references: [],
    });

    expect(draft.riskFlags).toEqual(expect.arrayContaining([
      "Remover qualquer promessa ou garantia de resultado.",
      "Confirmar autorizacao e anonimizar dados antes de publicar.",
      "Sem referencias calibradas; copy usa estrutura segura padrao.",
    ]));
  });

  it("keeps reference material as signal instead of copying reference titles", () => {
    const draft = buildMarketingCopywriterDraft({ item, profile, references: [reference] });

    expect(draft.body).not.toContain(reference.title);
    expect(draft.ethicalChecklist).toContain("Usar referencias apenas como sinais de formato/performance, nunca como texto copiavel.");
  });
});
