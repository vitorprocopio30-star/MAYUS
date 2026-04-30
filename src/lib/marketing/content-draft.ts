import type { EditorialCalendarItem, MarketingProfile } from "@/lib/marketing/editorial-calendar";

export type MarketingFinalDraft = {
  title: string;
  channelLabel: string;
  format: string;
  body: string;
  cta: string;
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

function clean(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function firmName(profile?: Partial<MarketingProfile> | null) {
  return clean(profile?.firmName) || "o escritorio";
}

function positioning(profile?: Partial<MarketingProfile> | null) {
  return clean(profile?.positioning) || "orientacao juridica clara, responsavel e acessivel";
}

function toneLabel(item: EditorialCalendarItem) {
  const labels: Record<string, string> = {
    educational: "educativo",
    direct: "direto",
    empathetic: "empatico",
    premium: "premium",
    conversational: "conversacional",
  };
  return labels[item.tone] || item.tone;
}

function objectiveCta(item: EditorialCalendarItem) {
  if (item.objective === "lead_generation") return "Se voce vive uma situacao parecida, organize seus documentos e procure orientacao juridica antes de tomar uma decisao.";
  if (item.objective === "nurture") return "Salve este conteudo para revisar com calma e compartilhe com quem precisa entender os proximos passos.";
  if (item.objective === "retention") return "Em caso de duvida sobre o seu caso, fale com a equipe responsavel antes de agir por conta propria.";
  return "Use este conteudo como ponto de partida e busque uma analise individual antes de decidir.";
}

function baseContext(item: EditorialCalendarItem, profile?: Partial<MarketingProfile> | null) {
  return {
    office: firmName(profile),
    position: positioning(profile),
    audience: clean(item.audience) || "publico-alvo",
    legalArea: clean(item.legalArea) || "area juridica",
    angle: clean(item.angle) || "orientacao juridica pratica",
    tone: toneLabel(item),
    cta: objectiveCta(item),
  };
}

function buildLinkedInDraft(item: EditorialCalendarItem, profile?: Partial<MarketingProfile> | null) {
  const context = baseContext(item, profile);
  return [
    `${item.title}`,
    "",
    `Muita gente em ${context.audience} chega a uma decisao juridica importante sem entender o risco principal: ${context.angle}.`,
    "",
    `Na pratica, em ${context.legalArea}, o primeiro passo nao deve ser prometer resultado. Deve ser organizar fatos, documentos e prazos para entender se existe caminho seguro.`,
    "",
    "Antes de agir, revise tres pontos:",
    "1. O que aconteceu e quando aconteceu.",
    "2. Quais documentos comprovam a situacao.",
    "3. Qual decisao precisa ser tomada agora e qual pode esperar.",
    "",
    `${context.office} trabalha com uma comunicacao ${context.tone}, baseada em ${context.position}.`,
    "",
    context.cta,
  ].join("\n");
}

function buildInstagramDraft(item: EditorialCalendarItem, profile?: Partial<MarketingProfile> | null) {
  const context = baseContext(item, profile);
  return [
    `Gancho: ${item.title}`,
    "",
    `Slide 1: ${context.audience}, cuidado com decisoes rapidas em ${context.legalArea}.`,
    `Slide 2: O ponto central e: ${context.angle}.`,
    "Slide 3: Separe documentos, datas e mensagens antes de pedir uma avaliacao.",
    "Slide 4: Evite conclusoes prontas. Cada caso depende de prova e contexto.",
    `Slide 5: ${context.cta}`,
    "",
    `Legenda: Conteudo educativo de ${context.office}. Nao substitui analise individual e nao promete resultado.`,
  ].join("\n");
}

function buildBlogDraft(item: EditorialCalendarItem, profile?: Partial<MarketingProfile> | null) {
  const context = baseContext(item, profile);
  return [
    `# ${item.title}`,
    "",
    `Este artigo explica, de forma ${context.tone}, um ponto recorrente para ${context.audience}: ${context.angle}.`,
    "",
    `## Por que isso importa em ${context.legalArea}`,
    "Uma decisao juridica tomada sem organizar fatos, documentos e prazos pode dificultar a avaliacao do caso e aumentar riscos desnecessarios.",
    "",
    "## O que observar antes de agir",
    "- Datas relevantes e comunicacoes importantes.",
    "- Documentos que comprovam a situacao.",
    "- Possiveis prazos ou urgencias.",
    "- Riscos de promessas ou solucoes genericas.",
    "",
    `## Como ${context.office} orienta esse tipo de tema`,
    `${context.office} parte de ${context.position}, sempre com revisao humana e sem promessa de resultado.`,
    "",
    context.cta,
  ].join("\n");
}

function buildEmailDraft(item: EditorialCalendarItem, profile?: Partial<MarketingProfile> | null) {
  const context = baseContext(item, profile);
  return [
    `Assunto: ${item.title}`,
    "",
    `Ola, ${context.audience}.`,
    "",
    `Preparamos uma orientacao curta sobre ${context.legalArea}: ${context.angle}.`,
    "",
    "Antes de tomar qualquer decisao, vale conferir:",
    "- se os documentos principais estao separados;",
    "- se existe alguma data ou prazo importante;",
    "- se a situacao precisa de analise individual.",
    "",
    context.cta,
    "",
    `${context.office}`,
  ].join("\n");
}

function buildWhatsAppDraft(item: EditorialCalendarItem, profile?: Partial<MarketingProfile> | null) {
  const context = baseContext(item, profile);
  return [
    `Oi. Passando para compartilhar uma orientacao rapida sobre ${context.legalArea}.`,
    "",
    `${context.angle}. Antes de decidir, organize documentos, datas e mensagens importantes.`,
    "",
    "Esse conteudo e informativo e nao substitui uma analise do caso concreto.",
    "",
    context.cta,
  ].join("\n");
}

function bodyForChannel(item: EditorialCalendarItem, profile?: Partial<MarketingProfile> | null) {
  if (item.channel === "instagram") return { format: "Roteiro de carrossel/legenda", body: buildInstagramDraft(item, profile) };
  if (item.channel === "blog") return { format: "Artigo curto", body: buildBlogDraft(item, profile) };
  if (item.channel === "email") return { format: "E-mail de nutricao", body: buildEmailDraft(item, profile) };
  if (item.channel === "whatsapp") return { format: "Mensagem supervisionada", body: buildWhatsAppDraft(item, profile) };
  return { format: "Post LinkedIn", body: buildLinkedInDraft(item, profile) };
}

export function buildMarketingFinalDraft(item: EditorialCalendarItem, profile?: Partial<MarketingProfile> | null): MarketingFinalDraft {
  if (item.status !== "approved" && item.status !== "published") {
    throw new Error("Only approved or published marketing content can generate a final draft");
  }

  const channel = bodyForChannel(item, profile);
  return {
    title: item.title,
    channelLabel: item.channel,
    format: channel.format,
    body: channel.body,
    cta: objectiveCta(item),
    ethicalChecklist: [
      "Revisar fatos, documentos e prazos antes de publicar.",
      "Nao prometer resultado juridico.",
      "Nao expor dados sensiveis ou caso real sem autorizacao.",
      "Publicacao ou envio externo exige acao humana manual.",
    ],
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
