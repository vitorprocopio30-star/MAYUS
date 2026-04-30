import type { EditorialCalendarItem, MarketingProfile } from "@/lib/marketing/editorial-calendar";
import { buildMarketingCopywriterDraft } from "@/lib/marketing/marketing-copywriter";

export type MarketingFinalDraft = {
  title: string;
  channelLabel: string;
  format: string;
  body: string;
  cta: string;
  headline?: string;
  hook?: string;
  variants?: Array<{ label: string; headline: string; hook: string; cta: string }>;
  campaignSuggestion?: string;
  attributionHint?: {
    contentId: string;
    contentTitle: string;
    campaign: string;
  };
  riskFlags?: string[];
  ethicalChecklist: string[];
  reviewedAt?: string | null;
  humanApprovalRequired: boolean;
  externalSideEffectsBlocked: boolean;
};

const FINAL_DRAFT_START = "[[MAYUS_MARKETING_FINAL_DRAFT_START]]";
const FINAL_DRAFT_END = "[[MAYUS_MARKETING_FINAL_DRAFT_END]]";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function objectiveCta(item: EditorialCalendarItem) {
  if (item.objective === "lead_generation") return "Se voce vive uma situacao parecida, organize seus documentos e procure orientacao juridica antes de tomar uma decisao.";
  if (item.objective === "nurture") return "Salve este conteudo para revisar com calma e compartilhe com quem precisa entender os proximos passos.";
  if (item.objective === "retention") return "Em caso de duvida sobre o seu caso, fale com a equipe responsavel antes de agir por conta propria.";
  return "Use este conteudo como ponto de partida e busque uma analise individual antes de decidir.";
}

export function buildMarketingFinalDraft(item: EditorialCalendarItem, profile?: Partial<MarketingProfile> | null): MarketingFinalDraft {
  if (item.status !== "approved" && item.status !== "published") {
    throw new Error("Only approved or published marketing content can generate a final draft");
  }

  const copy = buildMarketingCopywriterDraft({ item, profile });
  return {
    title: item.title,
    channelLabel: item.channel,
    format: copy.format,
    body: copy.body,
    cta: copy.cta || objectiveCta(item),
    headline: copy.headline,
    hook: copy.hook,
    variants: copy.variants,
    campaignSuggestion: copy.campaignSuggestion,
    attributionHint: copy.attributionHint,
    riskFlags: copy.riskFlags,
    ethicalChecklist: copy.ethicalChecklist,
    reviewedAt: null,
    humanApprovalRequired: true,
    externalSideEffectsBlocked: true,
  };
}

export function upsertMarketingFinalDraftInNotes(notes: string, draft: MarketingFinalDraft) {
  const cleanedNotes = String(notes || "")
    .replace(new RegExp(`${escapeRegex(FINAL_DRAFT_START)}[\\s\\S]*?${escapeRegex(FINAL_DRAFT_END)}`, "g"), "")
    .trim();
  const encodedDraft = encodeURIComponent(JSON.stringify(draft));
  const draftBlock = [FINAL_DRAFT_START, encodedDraft, FINAL_DRAFT_END].join("\n");

  return [cleanedNotes, draftBlock].filter(Boolean).join("\n");
}

export function readMarketingFinalDraftFromNotes(notes?: string | null): MarketingFinalDraft | null {
  const text = String(notes || "");
  const pattern = new RegExp(`${escapeRegex(FINAL_DRAFT_START)}\\s*([\\s\\S]*?)\\s*${escapeRegex(FINAL_DRAFT_END)}`, "g");
  const matches = Array.from(text.matchAll(pattern));
  const encoded = matches.at(-1)?.[1]?.trim();
  if (!encoded) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(encoded)) as Partial<MarketingFinalDraft>;
    if (!parsed.title || !parsed.format || !parsed.body || !Array.isArray(parsed.ethicalChecklist)) return null;

    return {
      title: String(parsed.title),
      channelLabel: String(parsed.channelLabel || ""),
      format: String(parsed.format),
      body: String(parsed.body),
      cta: String(parsed.cta || ""),
      headline: typeof parsed.headline === "string" ? parsed.headline : undefined,
      hook: typeof parsed.hook === "string" ? parsed.hook : undefined,
      variants: Array.isArray(parsed.variants) ? parsed.variants.map((variant: any) => ({
        label: String(variant?.label || ""),
        headline: String(variant?.headline || ""),
        hook: String(variant?.hook || ""),
        cta: String(variant?.cta || ""),
      })) : undefined,
      campaignSuggestion: typeof parsed.campaignSuggestion === "string" ? parsed.campaignSuggestion : undefined,
      attributionHint: parsed.attributionHint && typeof parsed.attributionHint === "object" ? {
        contentId: String((parsed.attributionHint as any).contentId || ""),
        contentTitle: String((parsed.attributionHint as any).contentTitle || ""),
        campaign: String((parsed.attributionHint as any).campaign || ""),
      } : undefined,
      riskFlags: Array.isArray(parsed.riskFlags) ? parsed.riskFlags.map((item) => String(item)) : undefined,
      ethicalChecklist: parsed.ethicalChecklist.map((item) => String(item)),
      reviewedAt: typeof parsed.reviewedAt === "string" ? parsed.reviewedAt : null,
      humanApprovalRequired: parsed.humanApprovalRequired !== false,
      externalSideEffectsBlocked: parsed.externalSideEffectsBlocked !== false,
    };
  } catch {
    return null;
  }
}

export function markMarketingFinalDraftReviewedInNotes(notes: string, reviewedAt = new Date().toISOString()) {
  const draft = readMarketingFinalDraftFromNotes(notes);
  if (!draft) return notes;

  return upsertMarketingFinalDraftInNotes(notes, {
    ...draft,
    reviewedAt,
  });
}

export function hasReviewedMarketingFinalDraft(notes?: string | null) {
  return Boolean(readMarketingFinalDraftFromNotes(notes)?.reviewedAt);
}
