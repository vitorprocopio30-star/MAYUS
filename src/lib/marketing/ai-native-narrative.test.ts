import { describe, expect, it } from "vitest";

import {
  buildDefaultMayusNarrativeBank,
  buildMayusInstagramNarrativeStrategy,
  buildMayusInstagramWeekOneCalendar,
  expandPainIntoNarrativeBatch,
  modelReferenceForMayusNarrative,
} from "./ai-native-narrative";

describe("AI-native narrative engine", () => {
  it("describes the MAYUS Instagram strategy with supervision guardrails", () => {
    const strategy = buildMayusInstagramNarrativeStrategy();

    expect(strategy.publicPositioning).toContain("AI-native");
    expect(strategy.desiredSensations).toContain("O MAYUS parece o futuro.");
    expect(strategy.allowedLanguage).toContain("sistema operacional juridico");
    expect(strategy.forbiddenLanguage).toContain("prompt secreto");
    expect(strategy.pillars.map((pillar) => pillar.id)).toEqual([
      "future_of_law",
      "real_automation",
      "build_in_public",
      "operating_systems",
      "value_delivery",
    ]);
    expect(strategy.humanApprovalRequired).toBe(true);
    expect(strategy.externalSideEffectsBlocked).toBe(true);
  });

  it("turns one operational pain into a full media batch", () => {
    const [row] = buildDefaultMayusNarrativeBank();
    const batch = expandPainIntoNarrativeBatch(row);

    expect(batch.map((item) => item.format)).toEqual([
      "reel",
      "carousel",
      "story",
      "workflow",
      "opinion",
      "demo",
    ]);
    expect(batch[0].productionNote).toContain(row.demonstration);
    expect(batch[3].title).toBe(row.deliveredAsset);
  });

  it("models a reference by mechanism without copying the original hook", () => {
    const modeled = modelReferenceForMayusNarrative({
      title: "Most businesses do not need more employees",
      hook: "They need to stop doing repetitive work manually",
      summary: "A contrast-driven AI automation video with before and after workflow.",
      channel: "instagram",
    });

    expect(modeled.detectedMechanisms).toEqual(expect.arrayContaining(["belief_break", "contrast", "simple_transformation"]));
    expect(modeled.mayusHook).not.toContain("employees");
    expect(modeled.tropicalizedAngle).toContain("advocacia brasileira");
    expect(modeled.antiCopyRules[0]).toContain("Nao repetir");
  });

  it("generates the first supervised Instagram week as editable calendar items", () => {
    const calendar = buildMayusInstagramWeekOneCalendar("2026-05-18");

    expect(calendar).toHaveLength(7);
    expect(calendar.map((item) => item.date)).toEqual([
      "2026-05-18",
      "2026-05-19",
      "2026-05-20",
      "2026-05-21",
      "2026-05-22",
      "2026-05-23",
      "2026-05-24",
    ]);
    expect(calendar.every((item) => item.channel === "instagram")).toBe(true);
    expect(calendar.every((item) => item.status === "draft")).toBe(true);
    expect(calendar[5].title).toContain("perde cliente pelo preco");
    expect(calendar[6].notes).toContain("formulario de lista beta");
    expect(calendar[0].guardrails).toContain("Modelar mecanismos de atencao sem copiar frases, roteiro ou estetica de terceiros.");
  });
});
