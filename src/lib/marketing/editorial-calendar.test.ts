import { describe, expect, it } from "vitest";
import {
  extractReferencePatterns,
  buildMarketingCalendarDefaults,
  buildMarketingAgendaTaskDraft,
  generateContentIdeas,
  generateEditorialCalendar,
  updateEditorialCalendarItem,
  type ReferenceInput,
} from "./editorial-calendar";

const references: ReferenceInput[] = [
  {
    id: "ref-1",
    title: "3 erros que podem prejudicar uma acao trabalhista",
    channel: "linkedin",
    legalArea: "Trabalhista",
    audience: "empregados demitidos",
    contentType: "carrossel",
    hook: "3 erros comuns antes de entrar com uma acao",
    summary: "Conteudo educativo com orientacoes gerais.",
    metrics: { impressions: 1000, clicks: 30, saves: 8, shares: 5, leads: 2 },
  },
  {
    id: "ref-2",
    title: "Como revisar uma negativa do INSS?",
    channel: "blog",
    legalArea: "Previdenciario",
    audience: "segurados do INSS",
    contentType: "artigo",
    hook: "Como revisar uma negativa do INSS?",
    metrics: { impressions: 600, clicks: 12, saves: 2, shares: 1, leads: 0 },
  },
];

describe("marketing editorial calendar", () => {
  it("extracts deterministic reference patterns from provided metrics and metadata", () => {
    const patterns = extractReferencePatterns(references);

    expect(patterns).toHaveLength(2);
    expect(patterns[0]).toEqual(expect.objectContaining({
      channel: "linkedin",
      legalArea: "Trabalhista",
      audience: "empregados demitidos",
      contentType: "carrossel",
      hookStyle: "list",
    }));
    expect(patterns[0].signals).toContain("generated-leads");
    expect(patterns[0].signals).toContain("high-intent-engagement");
    expect(patterns[0].score).toBeGreaterThan(patterns[1].score);
  });

  it("generates original ideas with explicit no-copying guardrails", () => {
    const patterns = extractReferencePatterns(references);
    const ideas = generateContentIdeas({
      patterns,
      channels: ["linkedin", "blog"],
      legalAreas: ["Familia"],
      objectives: ["lead_generation"],
      tones: ["empathetic"],
      audiences: ["pais em disputa de guarda"],
      style: "premium consultivo",
      count: 2,
    });

    expect(ideas).toHaveLength(2);
    expect(ideas[0].title).not.toBe(references[0].title);
    expect(ideas[0].guardrails.join(" ")).toMatch(/Do not reuse titles, paragraphs/i);
    expect(ideas[0]).toEqual(expect.objectContaining({
      objective: "lead_generation",
      tone: "empathetic",
      channel: "linkedin",
    }));
  });

  it("generates an editable calendar from frequency, style, channel, legal area, objective, tone, and audience", () => {
    const calendar = generateEditorialCalendar({
      startDate: "2026-05-04",
      frequency: "weekly",
      style: "autoridade acessivel",
      channels: ["linkedin", "email"],
      legalAreas: ["Trabalhista", "Previdenciario"],
      objectives: ["authority", "nurture"],
      tones: ["educational", "direct"],
      audiences: ["leads qualificados", "clientes antigos"],
      references,
      periods: 3,
    });

    expect(calendar.map((item) => item.date)).toEqual(["2026-05-04", "2026-05-11", "2026-05-18"]);
    expect(calendar.every((item) => item.status === "draft")).toBe(true);
    expect(calendar[0].angle).toContain("autoridade acessivel");
    expect(calendar[0].notes).toContain("provided metadata only");
  });

  it("builds calendar defaults from the saved marketing profile", () => {
    const defaults = buildMarketingCalendarDefaults({
      firmName: "MAYUS Advocacia",
      positioning: "premium consultivo",
      legalAreas: ["Previdenciario", "Trabalhista", "Previdenciario"],
      audiences: ["segurados do INSS", "empresas"],
      channels: ["linkedin", "blog"],
      voiceTone: "premium",
      websites: ["https://example.com"],
      socialProfiles: ["https://linkedin.com/company/example"],
      admiredReferences: ["referencia local"],
      ethicsGuardrails: ["Nao prometer resultado juridico."],
    });

    expect(defaults).toEqual({
      style: "premium consultivo",
      channels: ["linkedin", "blog"],
      legalAreas: ["Previdenciario", "Trabalhista"],
      tones: ["premium"],
      audiences: ["segurados do INSS", "empresas"],
    });
  });

  it("updates a calendar item immutably while preserving untouched items", () => {
    const calendar = generateEditorialCalendar({
      startDate: "2026-05-04",
      frequency: "monthly",
      style: "objetivo",
      channels: ["blog"],
      legalAreas: ["Empresarial"],
      objectives: ["awareness"],
      tones: ["premium"],
      audiences: ["socios de pequenas empresas"],
      periods: 2,
    });

    const updated = updateEditorialCalendarItem(calendar, calendar[0].id, {
      title: "Novo tema aprovado",
      status: "approved",
      notes: "Ajustado pelo editor.",
    });

    expect(updated).not.toBe(calendar);
    expect(updated[0]).toEqual(expect.objectContaining({
      title: "Novo tema aprovado",
      status: "approved",
      notes: "Ajustado pelo editor.",
    }));
    expect(updated[1]).toBe(calendar[1]);
  });

  it("rejects a calendar item without removing it from the editable calendar", () => {
    const calendar = generateEditorialCalendar({
      startDate: "2026-05-04",
      frequency: "weekly",
      style: "consultivo",
      channels: ["linkedin"],
      legalAreas: ["Familia"],
      objectives: ["authority"],
      tones: ["empathetic"],
      audiences: ["pais em disputa"],
      periods: 1,
    });

    const updated = updateEditorialCalendarItem(calendar, calendar[0].id, {
      status: "rejected",
      notes: "Recusado: tema sensivel para esta semana.",
    });

    expect(updated).toHaveLength(1);
    expect(updated[0]).toEqual(expect.objectContaining({
      status: "rejected",
      notes: "Recusado: tema sensivel para esta semana.",
    }));
  });

  it("builds an internal agenda task draft only from approved content", () => {
    const [item] = generateEditorialCalendar({
      startDate: "2026-05-04",
      frequency: "weekly",
      style: "autoridade",
      channels: ["linkedin"],
      legalAreas: ["Previdenciario"],
      objectives: ["lead_generation"],
      tones: ["educational"],
      audiences: ["segurados do INSS"],
      periods: 1,
    });
    const [approved] = updateEditorialCalendarItem([item], item.id, { status: "approved" });

    const draft = buildMarketingAgendaTaskDraft(approved);

    expect(draft.title).toContain("Marketing:");
    expect(draft.description).toContain("marketing_editorial_calendar");
    expect(draft.scheduledFor).toBe("2026-05-04T09:00:00.000Z");
    expect(draft.tags).toEqual(expect.arrayContaining(["marketing", "editorial_calendar", "linkedin"]));
  });

  it("blocks agenda task drafts for non-approved content", () => {
    const [item] = generateEditorialCalendar({
      startDate: "2026-05-04",
      frequency: "weekly",
      style: "autoridade",
      channels: ["linkedin"],
      legalAreas: ["Previdenciario"],
      objectives: ["authority"],
      tones: ["educational"],
      audiences: ["segurados do INSS"],
      periods: 1,
    });

    expect(() => buildMarketingAgendaTaskDraft(item)).toThrow(/approved marketing content/i);
  });
});
