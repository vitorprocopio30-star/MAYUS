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
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  content_id?: string | null;
  content_title?: string | null;
  landing_page?: string | null;
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
  source: string | null;
  hasTrackedSource: boolean;
  tags: string[];
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function slugTag(prefix: string, value: string | null) {
  if (!value) return null;
  const safeValue = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (!safeValue) return null;
  return `${prefix}:${safeValue}`;
}

export function buildMarketingAttribution(input: MarketingAttributionInput): MarketingAttribution {
  const rawUtmSource = cleanText(input.utmSource || input.utm_source);
  const rawUtmMedium = cleanText(input.utmMedium || input.utm_medium);
  const rawUtmCampaign = cleanText(input.utmCampaign || input.utm_campaign);
  const rawUtmTerm = cleanText(input.utmTerm || input.utm_term);
  const rawUtmContent = cleanText(input.utmContent || input.utm_content);
  const origin = cleanText(input.origin || rawUtmSource);
  const channel = cleanText(input.channel || rawUtmMedium);
  const campaign = cleanText(input.campaign || rawUtmCampaign);
  const contentId = cleanText(input.contentId || input.content_id || rawUtmContent);
  const contentTitle = cleanText(input.contentTitle || input.content_title);
  const landingPage = cleanText(input.landingPage || input.landing_page);
  const referrer = cleanText(input.referrer);
  const utmSource = rawUtmSource;
  const utmMedium = rawUtmMedium;
  const utmCampaign = rawUtmCampaign;
  const utmTerm = rawUtmTerm;
  const utmContent = rawUtmContent;
  const hasTrackedSource = Boolean(origin || channel || campaign || contentId || landingPage || referrer || utmSource || utmMedium || utmCampaign || utmTerm || utmContent);
  const source = origin || utmSource || campaign || referrer || null;
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
