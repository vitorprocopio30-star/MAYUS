export type MarketingAttributionInput = {
  origin?: string | null;
  channel?: string | null;
  campaign?: string | null;
  contentId?: string | null;
  contentTitle?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
};

export type MarketingAttribution = {
  origin: string | null;
  channel: string | null;
  campaign: string | null;
  contentId: string | null;
  contentTitle: string | null;
  landingPage: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  source: string;
  hasTrackedSource: boolean;
  tags: string[];
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function slugTag(prefix: string, value: string | null) {
  if (!value) return null;
  const safeValue = value.toLowerCase().replace(/\s+/g, "-").slice(0, 48);
  return `${prefix}:${safeValue}`;
}

export function buildMarketingAttribution(input: MarketingAttributionInput): MarketingAttribution {
  const origin = cleanText(input.origin || input.utmSource);
  const channel = cleanText(input.channel || input.utmMedium);
  const campaign = cleanText(input.campaign || input.utmCampaign);
  const contentId = cleanText(input.contentId || input.utmContent);
  const contentTitle = cleanText(input.contentTitle);
  const landingPage = cleanText(input.landingPage);
  const referrer = cleanText(input.referrer);
  const utmSource = cleanText(input.utmSource);
  const utmMedium = cleanText(input.utmMedium);
  const utmCampaign = cleanText(input.utmCampaign);
  const utmTerm = cleanText(input.utmTerm);
  const utmContent = cleanText(input.utmContent);
  const hasTrackedSource = Boolean(origin || channel || campaign || contentId || landingPage || referrer || utmSource || utmMedium || utmCampaign || utmTerm || utmContent);
  const source = origin || utmSource || campaign || referrer || "marketing_untracked";
  const tags = [
    slugTag("origem", origin),
    slugTag("canal", channel),
    slugTag("campanha", campaign),
    slugTag("conteudo", contentId || contentTitle),
    hasTrackedSource ? "marketing-attribution" : "sem-atribuicao-marketing",
  ].filter(Boolean) as string[];

  return {
    origin,
    channel,
    campaign,
    contentId,
    contentTitle,
    landingPage,
    referrer,
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
    source,
    hasTrackedSource,
    tags: Array.from(new Set(tags)).slice(0, 8),
  };
}

export function buildMarketingAttributionDescription(attribution: MarketingAttribution) {
  if (!attribution.hasTrackedSource) {
    return "Atribuicao de marketing: sem origem/campanha rastreada.";
  }

  return [
    "Atribuicao de marketing:",
    attribution.origin ? `Origem: ${attribution.origin}` : null,
    attribution.channel ? `Canal: ${attribution.channel}` : null,
    attribution.campaign ? `Campanha: ${attribution.campaign}` : null,
    attribution.contentId ? `Conteudo ID: ${attribution.contentId}` : null,
    attribution.contentTitle ? `Conteudo: ${attribution.contentTitle}` : null,
    attribution.landingPage ? `Landing page: ${attribution.landingPage}` : null,
    attribution.referrer ? `Referrer: ${attribution.referrer}` : null,
    attribution.utmSource ? `UTM source: ${attribution.utmSource}` : null,
    attribution.utmMedium ? `UTM medium: ${attribution.utmMedium}` : null,
    attribution.utmCampaign ? `UTM campaign: ${attribution.utmCampaign}` : null,
    attribution.utmTerm ? `UTM term: ${attribution.utmTerm}` : null,
    attribution.utmContent ? `UTM content: ${attribution.utmContent}` : null,
  ].filter(Boolean).join("\n");
}
