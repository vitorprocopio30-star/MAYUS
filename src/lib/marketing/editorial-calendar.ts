export type MarketingChannel = "blog" | "linkedin" | "instagram" | "email" | "whatsapp";
export type MarketingObjective = "awareness" | "authority" | "lead_generation" | "nurture" | "retention";
export type MarketingTone = "educational" | "direct" | "empathetic" | "premium" | "conversational";
export type MarketingFrequency = "weekly" | "biweekly" | "monthly";

export type MarketingProfile = {
  firmName: string;
  positioning: string;
  legalAreas: string[];
  audiences: string[];
  channels: MarketingChannel[];
  voiceTone: MarketingTone;
  websites: string[];
  socialProfiles: string[];
  admiredReferences: string[];
  ethicsGuardrails: string[];
};

export type ReferenceInput = {
  id: string;
  title: string;
  channel: MarketingChannel;
  legalArea?: string | null;
  audience?: string | null;
  contentType?: string | null;
  hook?: string | null;
  summary?: string | null;
  publishedAt?: string | null;
  metrics?: {
    impressions?: number | null;
    clicks?: number | null;
    saves?: number | null;
    shares?: number | null;
    leads?: number | null;
    comments?: number | null;
  } | null;
};

export type ReferencePattern = {
  channel: MarketingChannel;
  legalArea: string | null;
  audience: string | null;
  contentType: string | null;
  hookStyle: "question" | "list" | "case_based" | "warning" | "educational" | "unknown";
  score: number;
  signals: string[];
};

export type ContentIdea = {
  id: string;
  title: string;
  channel: MarketingChannel;
  legalArea: string;
  objective: MarketingObjective;
  tone: MarketingTone;
  audience: string;
  angle: string;
  guardrails: string[];
  sourcePatternIds: string[];
};

export type EditorialCalendarInput = {
  startDate: string;
  frequency: MarketingFrequency;
  style: string;
  channels: MarketingChannel[];
  legalAreas: string[];
  objectives: MarketingObjective[];
  tones: MarketingTone[];
  audiences: string[];
  references?: ReferenceInput[];
  periods?: number;
};

export type EditorialCalendarItem = ContentIdea & {
  date: string;
  status: "draft" | "approved" | "rejected" | "published";
  notes: string;
};

export type EditorialCalendarEdit = Partial<Pick<EditorialCalendarItem, "title" | "date" | "status" | "notes" | "tone" | "objective" | "audience" | "legalArea" | "channel">>;

export type MarketingAgendaTaskDraft = {
  title: string;
  description: string;
  scheduledFor: string;
  responsibleNotes: string;
  tags: string[];
};

export type MarketingCalendarDefaults = Pick<EditorialCalendarInput, "style" | "channels" | "legalAreas" | "tones" | "audiences">;

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function cleanList(values?: string[] | null) {
  return Array.from(new Set((values || []).map((value) => cleanText(value)).filter(Boolean) as string[]));
}

function normalizeKey(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function firstNonEmpty(values: string[], fallback: string) {
  return values.map((value) => cleanText(value)).find(Boolean) || fallback;
}

function dateFromIso(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error("startDate must be a valid YYYY-MM-DD date");
  }
  return date;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function intervalDays(frequency: MarketingFrequency) {
  if (frequency === "weekly") return 7;
  if (frequency === "biweekly") return 14;
  return 30;
}

function metricValue(input: ReferenceInput) {
  const metrics = input.metrics || {};
  return (
    (metrics.impressions || 0) * 0.01 +
    (metrics.clicks || 0) * 2 +
    (metrics.saves || 0) * 3 +
    (metrics.shares || 0) * 4 +
    (metrics.comments || 0) * 2 +
    (metrics.leads || 0) * 8
  );
}

function hookStyle(input: ReferenceInput): ReferencePattern["hookStyle"] {
  const hook = normalizeKey(`${input.hook || ""} ${input.title || ""}`);
  if (!hook) return "unknown";
  if (hook.includes("como") || hook.includes("por-que") || hook.includes("quando") || hook.includes("?")) return "question";
  if (/\b\d\b/.test(hook) || hook.includes("passos") || hook.includes("erros")) return "list";
  if (hook.includes("caso") || hook.includes("cliente") || hook.includes("decisao")) return "case_based";
  if (hook.includes("cuidado") || hook.includes("alerta") || hook.includes("risco") || hook.includes("evite")) return "warning";
  return "educational";
}

export function extractReferencePatterns(references: ReferenceInput[]): ReferencePattern[] {
  return references
    .map((reference) => {
      const signals: string[] = [];
      const metrics = reference.metrics || {};
      if ((metrics.leads || 0) > 0) signals.push("generated-leads");
      if ((metrics.saves || 0) + (metrics.shares || 0) >= 10) signals.push("high-intent-engagement");
      if ((metrics.clicks || 0) >= 20) signals.push("strong-click-interest");
      if (cleanText(reference.summary)) signals.push("has-content-metadata");

      return {
        channel: reference.channel,
        legalArea: cleanText(reference.legalArea),
        audience: cleanText(reference.audience),
        contentType: cleanText(reference.contentType),
        hookStyle: hookStyle(reference),
        score: Math.round(metricValue(reference)),
        signals,
      } satisfies ReferencePattern;
    })
    .sort((a, b) => b.score - a.score || a.channel.localeCompare(b.channel));
}

export function generateContentIdeas(params: {
  patterns: ReferencePattern[];
  channels: MarketingChannel[];
  legalAreas: string[];
  objectives: MarketingObjective[];
  tones: MarketingTone[];
  audiences: string[];
  style: string;
  count: number;
}): ContentIdea[] {
  const channels: MarketingChannel[] = params.channels.length ? params.channels : ["linkedin"];
  const legalAreas = params.legalAreas.length ? params.legalAreas : ["Juridico geral"];
  const objectives: MarketingObjective[] = params.objectives.length ? params.objectives : ["authority"];
  const tones: MarketingTone[] = params.tones.length ? params.tones : ["educational"];
  const audiences = params.audiences.length ? params.audiences : ["publico juridico"];
  const patterns = params.patterns.length ? params.patterns : [{
    channel: channels[0],
    legalArea: legalAreas[0],
    audience: audiences[0],
    contentType: "post",
    hookStyle: "educational",
    score: 0,
    signals: [],
  } satisfies ReferencePattern];

  return Array.from({ length: Math.max(0, params.count) }, (_, index) => {
    const pattern = patterns[index % patterns.length];
    const channel = channels.includes(pattern.channel) ? pattern.channel : channels[index % channels.length];
    const legalArea = firstNonEmpty([pattern.legalArea || "", legalAreas[index % legalAreas.length]], "Juridico geral");
    const audience = firstNonEmpty([pattern.audience || "", audiences[index % audiences.length]], "publico juridico");
    const objective = objectives[index % objectives.length];
    const tone = tones[index % tones.length];
    const style = cleanText(params.style) || "editorial";
    const angle = buildAngle(pattern.hookStyle, objective, legalArea, audience);
    const id = normalizeKey(`${channel}-${legalArea}-${objective}-${audience}-${index + 1}`) || `idea-${index + 1}`;

    return {
      id,
      title: `${legalArea}: ${angle}`,
      channel,
      legalArea,
      objective,
      tone,
      audience,
      angle: `${angle} em estilo ${style}`,
      guardrails: [
        "Use references only as performance and positioning signals.",
        "Do not reuse titles, paragraphs, proprietary examples, or distinctive framing from references.",
        "Create a new legal explanation, example, and call to action for the selected audience.",
      ],
      sourcePatternIds: [`pattern-${index % patterns.length}`],
    } satisfies ContentIdea;
  });
}

function buildAngle(hook: ReferencePattern["hookStyle"], objective: MarketingObjective, legalArea: string, audience: string) {
  if (hook === "warning") return `alerta pratico para ${audience}`;
  if (hook === "list") return `checklist original para decisao em ${legalArea}`;
  if (hook === "case_based") return `cenario hipotetico para explicar riscos e proximos passos`;
  if (hook === "question") return `resposta objetiva para uma duvida recorrente de ${audience}`;
  if (objective === "lead_generation") return `diagnostico inicial e convite para avaliacao`;
  return `guia educativo com ponto de vista proprio`;
}

export function generateEditorialCalendar(input: EditorialCalendarInput): EditorialCalendarItem[] {
  const periods = input.periods || 4;
  const startDate = dateFromIso(input.startDate);
  const patterns = extractReferencePatterns(input.references || []);
  const ideas = generateContentIdeas({
    patterns,
    channels: input.channels,
    legalAreas: input.legalAreas,
    objectives: input.objectives,
    tones: input.tones,
    audiences: input.audiences,
    style: input.style,
    count: periods,
  });

  return ideas.map((idea, index) => ({
    ...idea,
    date: toIsoDate(addDays(startDate, index * intervalDays(input.frequency))),
    status: "draft",
    notes: "Editable calendar item generated from provided metadata only.",
  }));
}

export function buildMarketingCalendarDefaults(profile: MarketingProfile | null): MarketingCalendarDefaults {
  return {
    style: cleanText(profile?.positioning) || "autoridade acessivel",
    channels: profile?.channels?.length ? profile.channels : ["linkedin"],
    legalAreas: cleanList(profile?.legalAreas).length ? cleanList(profile?.legalAreas) : ["Trabalhista", "Previdenciario"],
    tones: profile?.voiceTone ? [profile.voiceTone] : ["educational"],
    audiences: cleanList(profile?.audiences).length ? cleanList(profile?.audiences) : ["leads qualificados"],
  };
}

export function updateEditorialCalendarItem(
  calendar: EditorialCalendarItem[],
  itemId: string,
  edit: EditorialCalendarEdit,
): EditorialCalendarItem[] {
  return calendar.map((item) => {
    if (item.id !== itemId) return item;

    return {
      ...item,
      ...edit,
      title: cleanText(edit.title) || item.title,
      notes: edit.notes === undefined ? item.notes : String(edit.notes),
    };
  });
}

export function buildMarketingAgendaTaskDraft(item: EditorialCalendarItem): MarketingAgendaTaskDraft {
  if (item.status !== "approved") {
    throw new Error("Only approved marketing content can become an agenda task");
  }

  return {
    title: `Marketing: ${item.title}`,
    description: [
      `Origem: marketing_editorial_calendar`,
      `Canal: ${item.channel}`,
      `Area: ${item.legalArea}`,
      `Objetivo: ${item.objective}`,
      `Tom: ${item.tone}`,
      `Publico: ${item.audience}`,
      `Angulo: ${item.angle}`,
      item.notes ? `Notas: ${item.notes}` : null,
    ].filter(Boolean).join("\n"),
    scheduledFor: `${item.date}T09:00:00.000Z`,
    responsibleNotes: "Tarefa criada a partir de conteudo aprovado no calendario editorial do MAYUS.",
    tags: ["marketing", "editorial_calendar", item.channel, item.objective, item.legalArea].filter(Boolean),
  };
}
