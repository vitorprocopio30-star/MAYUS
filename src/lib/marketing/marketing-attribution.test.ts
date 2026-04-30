import { describe, expect, it } from "vitest";
import { buildMarketingAttribution, buildMarketingAttributionDescription } from "./marketing-attribution";

describe("marketing attribution", () => {
  it("normalizes campaign, content and UTM signals", () => {
    const attribution = buildMarketingAttribution({
      origin: " Instagram ",
      channel: " WhatsApp ",
      campaign: " Previdenciario Abril ",
      contentId: "post-123",
      contentTitle: "Revisao do INSS",
      utmSource: "ig",
      utmMedium: "social",
    });

    expect(attribution.source).toBe("Instagram");
    expect(attribution.hasTrackedSource).toBe(true);
    expect(attribution.tags).toContain("marketing-attribution");
    expect(attribution.tags).toContain("campanha:previdenciario-abril");
    expect(buildMarketingAttributionDescription(attribution)).toContain("Campanha: Previdenciario Abril");
  });

  it("falls back to UTM data when explicit origin/channel are missing", () => {
    const attribution = buildMarketingAttribution({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "familia-search",
    });

    expect(attribution.origin).toBe("google");
    expect(attribution.channel).toBe("cpc");
    expect(attribution.campaign).toBe("familia-search");
    expect(attribution.source).toBe("google");
  });

  it("marks leads without source signals as untracked", () => {
    const attribution = buildMarketingAttribution({});

    expect(attribution.hasTrackedSource).toBe(false);
    expect(attribution.source).toBeNull();
    expect(attribution.tags).toEqual(["sem-atribuicao-marketing"]);
    expect(buildMarketingAttributionDescription(attribution)).toContain("sem origem/campanha rastreada");
  });

  it("accepts snake_case UTM fields and creates safe tags", () => {
    const attribution = buildMarketingAttribution({
      utm_source: "Meta Ads",
      utm_medium: "Paid Social",
      utm_campaign: "Família & Sucessões",
      utm_content: "criativo 01",
    });

    expect(attribution.origin).toBe("Meta Ads");
    expect(attribution.channel).toBe("Paid Social");
    expect(attribution.campaign).toBe("Família & Sucessões");
    expect(attribution.tags).toContain("campanha:familia-sucessoes");
    expect(attribution.tags).toContain("conteudo:criativo-01");
  });
});
