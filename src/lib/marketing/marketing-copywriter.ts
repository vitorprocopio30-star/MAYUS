import type { EditorialCalendarItem, MarketingChannel, MarketingObjective, MarketingProfile, ReferenceInput } from "@/lib/marketing/editorial-calendar";

export type MarketingCopywriterInput = {
  item: EditorialCalendarItem;
  profile?: Partial<MarketingProfile> | null;
  references?: ReferenceInput[] | null;
  previousContentTitles?: string[] | null;
};

export type MarketingCopywriterDraft = {
  title: string;
  channel: MarketingChannel;
  format: string;
  headline: string;
  hook: string;
  body: string;
  cta: string;
  variants: Array<{ label: string; headline: string; hook: string; cta: string }>;
  campaignSuggestion: string;
  attributionHint: {
    contentId: string;
    contentTitle: string;
    campaign: string;
  };
  ethicalChecklist: string[];
  riskFlags: string[];
  humanApprovalRequired: boolean;
  externalSideEffectsBlocked: boolean;
};

type CopyContext = {
  office: string;
  positioning: string;
  audience: string;
  legalArea: string;
  angle: string;
  objective: MarketingObjective;
  referenceSignal: string;
  hookStyle: "question" | "list" | "case" | "warning" | "educational";
};

function clean(value?: string | null) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value?: string | null) {
  return clean(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function slug(value: string) {
  return normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "conteudo-mayus";
}

function toneLabel(value?: string | null) {
  const labels: Record<string, string> = {
    educational: "educativa",
    direct: "direta",
    empathetic: "empatica",
    premium: "premium",
    conversational: "conversacional",
  };
  return labels[String(value || "")] || clean(value) || "clara";
}

function inferReferenceSignal(item: EditorialCalendarItem, references: ReferenceInput[]) {
  const sameContext = references.filter((reference) => {
    const sameChannel = reference.channel === item.channel;
    const sameArea = !reference.legalArea || normalize(reference.legalArea) === normalize(item.legalArea);
    const sameAudience = !reference.audience || normalize(reference.audience) === normalize(item.audience);
    return sameChannel && sameArea && sameAudience;
  });
  const best = (sameContext[0] || references.find((reference) => reference.channel === item.channel) || references[0]) ?? null;
  if (!best) return "formato educativo de autoridade";

  const parts = [clean(best.contentType), clean(best.hook), clean(best.summary)].filter(Boolean);
  return parts.length ? parts.join("; ") : `referencia de ${best.channel} com tema ${best.title}`;
}

function inferHookStyle(item: EditorialCalendarItem, references: ReferenceInput[]): CopyContext["hookStyle"] {
  const text = normalize(`${item.title} ${item.angle} ${references.map((reference) => reference.hook || reference.title).join(" ")}`);
  if (/cuidado|alerta|risco|evite|erro/.test(text)) return "warning";
  if (/\b\d+\b|passos|checklist|erros/.test(text)) return "list";
  if (/caso|cliente|situacao|cenario|exemplo/.test(text)) return "case";
  if (/como|quando|por que|duvida|\?/.test(text)) return "question";
  return "educational";
}

function buildContext(input: MarketingCopywriterInput): CopyContext {
  const references = input.references || [];
  return {
    office: clean(input.profile?.firmName) || "o escritorio",
    positioning: clean(input.profile?.positioning) || "orientacao juridica clara, responsavel e acessivel",
    audience: clean(input.item.audience) || clean(input.profile?.audiences?.[0]) || "publico-alvo",
    legalArea: clean(input.item.legalArea) || clean(input.profile?.legalAreas?.[0]) || "area juridica",
    angle: clean(input.item.angle) || "orientacao juridica pratica",
    objective: input.item.objective,
    referenceSignal: inferReferenceSignal(input.item, references),
    hookStyle: inferHookStyle(input.item, references),
  };
}

function objectiveCta(objective: MarketingObjective) {
  if (objective === "lead_generation") return "Organize os documentos e procure orientacao juridica individual antes de tomar a proxima decisao.";
  if (objective === "nurture") return "Salve este conteudo para revisar com calma quando precisar decidir os proximos passos.";
  if (objective === "retention") return "Se esse tema toca um caso em andamento, converse com a equipe responsavel antes de agir.";
  if (objective === "awareness") return "Compartilhe com quem precisa entender o risco antes de decidir.";
  return "Use este conteudo como ponto de partida, nao como substituto de uma analise do caso concreto.";
}

function headlineFor(context: CopyContext) {
  if (context.hookStyle === "warning") return `${context.legalArea}: o risco que ${context.audience} costuma perceber tarde demais`;
  if (context.hookStyle === "list") return `${context.legalArea}: um checklist antes de decidir`;
  if (context.hookStyle === "case") return `${context.legalArea}: um cenario comum e o que observar antes de agir`;
  if (context.hookStyle === "question") return `${context.legalArea}: uma resposta clara para uma duvida recorrente`;
  return `${context.legalArea}: orientacao pratica para decidir com mais seguranca`;
}

function hookFor(context: CopyContext) {
  if (context.hookStyle === "warning") return `Antes de agir em ${context.legalArea}, existe um risco que pode mudar a estrategia: ${context.angle}.`;
  if (context.hookStyle === "list") return `Use estes pontos como triagem inicial antes de tomar uma decisao em ${context.legalArea}.`;
  if (context.hookStyle === "case") return `Imagine uma situacao em que ${context.audience} precisa decidir rapido, mas ainda nao organizou fatos, provas e prazos.`;
  if (context.hookStyle === "question") return `A pergunta aparece com frequencia: como avaliar ${context.angle} sem cair em promessa facil?`;
  return `Uma boa decisao juridica comeca antes da acao: com contexto, documentos e clareza sobre riscos.`;
}

function complianceNote() {
  return "Conteudo informativo. Nao substitui analise individual, nao promete resultado e nao deve expor dados sensiveis ou casos reais sem autorizacao.";
}

function buildLinkedInBody(item: EditorialCalendarItem, context: CopyContext, tone: string) {
  return [
    item.title,
    "",
    headlineFor(context),
    "",
    hookFor(context),
    "",
    `Para ${context.audience}, o ponto nao e procurar uma resposta pronta. O ponto e entender se os fatos, documentos e prazos sustentam uma decisao segura.`,
    "",
    "Antes de avancar, revise:",
    "1. O que aconteceu, em ordem cronologica.",
    "2. Quais documentos ou mensagens comprovam cada fato.",
    "3. Qual prazo ou risco exige atencao imediata.",
    "4. O que ainda precisa ser confirmado por analise profissional.",
    "",
    `A comunicacao de ${context.office} segue uma linha ${tone}, baseada em ${context.positioning}.`,
    "",
    objectiveCta(item.objective),
    "",
    complianceNote(),
  ].join("\n");
}

function buildInstagramBody(item: EditorialCalendarItem, context: CopyContext) {
  return [
    `Gancho: ${headlineFor(context)}`,
    "",
    `Slide 1: ${hookFor(context)}`,
    `Slide 2: O problema central: ${context.angle}.`,
    "Slide 3: Separe fatos, documentos, conversas e datas antes de decidir.",
    "Slide 4: Evite promessas prontas. Cada caso depende de prova, prazo e contexto.",
    `Slide 5: ${objectiveCta(item.objective)}`,
    "",
    `Legenda: ${context.office} compartilha este conteudo para orientar, nao para prometer resultado. ${complianceNote()}`,
  ].join("\n");
}

function buildBlogBody(item: EditorialCalendarItem, context: CopyContext, tone: string) {
  return [
    `# ${headlineFor(context)}`,
    "",
    `Este artigo explica, de forma ${tone}, um tema recorrente para ${context.audience}: ${context.angle}.`,
    "",
    `## Por que isso importa em ${context.legalArea}`,
    "Decisoes juridicas tomadas sem contexto podem gerar perda de prazo, prova incompleta ou expectativa errada sobre o caminho possivel.",
    "",
    "## O que observar antes de agir",
    "- Linha do tempo dos fatos.",
    "- Documentos disponiveis e documentos faltantes.",
    "- Prazos, comunicacoes e urgencias.",
    "- Riscos de conclusoes genericas sem avaliacao individual.",
    "",
    `## Como ${context.office} aborda esse tema`,
    `${context.office} parte de ${context.positioning}, com explicacao clara, revisao humana e sem promessa de resultado.`,
    "",
    objectiveCta(item.objective),
    "",
    complianceNote(),
  ].join("\n");
}

function buildEmailBody(item: EditorialCalendarItem, context: CopyContext) {
  return [
    `Assunto: ${headlineFor(context)}`,
    "",
    `Ola, ${context.audience}.`,
    "",
    hookFor(context),
    "",
    "Antes de tomar uma decisao, confira se voce ja tem:",
    "- documentos principais separados;",
    "- datas e comunicacoes importantes organizadas;",
    "- clareza sobre qual risco precisa ser avaliado primeiro.",
    "",
    objectiveCta(item.objective),
    "",
    complianceNote(),
    "",
    context.office,
  ].join("\n");
}

function buildWhatsAppBody(item: EditorialCalendarItem, context: CopyContext) {
  return [
    `Oi. Uma orientacao rapida sobre ${context.legalArea}:`,
    "",
    hookFor(context),
    "",
    "Antes de decidir, organize documentos, datas e mensagens importantes.",
    "",
    objectiveCta(item.objective),
    "",
    "Mensagem informativa, sujeita a revisao humana antes de qualquer envio.",
  ].join("\n");
}

function bodyForChannel(item: EditorialCalendarItem, context: CopyContext, tone: string) {
  if (item.channel === "instagram") return { format: "Roteiro de carrossel/legenda", body: buildInstagramBody(item, context) };
  if (item.channel === "blog") return { format: "Artigo curto com SEO educativo", body: buildBlogBody(item, context, tone) };
  if (item.channel === "email") return { format: "E-mail de nutricao", body: buildEmailBody(item, context) };
  if (item.channel === "whatsapp") return { format: "Mensagem supervisionada", body: buildWhatsAppBody(item, context) };
  return { format: "Post LinkedIn", body: buildLinkedInBody(item, context, tone) };
}

function buildVariants(context: CopyContext, item: EditorialCalendarItem) {
  return [
    {
      label: "Autoridade clara",
      headline: headlineFor(context),
      hook: hookFor(context),
      cta: objectiveCta(item.objective),
    },
    {
      label: "Dor pratica",
      headline: `${context.audience}: o que verificar antes de decidir em ${context.legalArea}`,
      hook: `A decisao parece simples, mas pode depender de prova, prazo e contexto: ${context.angle}.`,
      cta: "Revise os documentos principais antes de buscar uma avaliacao individual.",
    },
    {
      label: "Checklist",
      headline: `${context.legalArea}: 4 pontos para revisar antes de agir`,
      hook: "Fatos, documentos, prazos e riscos precisam aparecer antes da conclusao.",
      cta: "Salve o checklist e use como preparacao para uma conversa juridica.",
    },
  ];
}

function riskFlags(input: MarketingCopywriterInput) {
  const text = normalize(`${input.item.title} ${input.item.angle} ${input.item.notes}`);
  const risks: string[] = [];
  if (/garant|ganh|causa ganha|resultado certo|100%/.test(text)) risks.push("Remover qualquer promessa ou garantia de resultado.");
  if (/cliente real|caso real|nome|cpf|processo/.test(text)) risks.push("Confirmar autorizacao e anonimizar dados antes de publicar.");
  if (!clean(input.profile?.positioning)) risks.push("Completar posicionamento do escritorio para calibrar voz e promessa editorial.");
  if (!input.references?.length) risks.push("Sem referencias calibradas; copy usa estrutura segura padrao.");
  return risks;
}

export function buildMarketingCopywriterDraft(input: MarketingCopywriterInput): MarketingCopywriterDraft {
  const context = buildContext(input);
  const tone = toneLabel(input.item.tone || input.profile?.voiceTone);
  const channel = bodyForChannel(input.item, context, tone);
  const campaignSuggestion = slug(`${context.legalArea}-${input.item.objective}-${input.item.channel}`);

  return {
    title: input.item.title,
    channel: input.item.channel,
    format: channel.format,
    headline: headlineFor(context),
    hook: hookFor(context),
    body: channel.body,
    cta: objectiveCta(input.item.objective),
    variants: buildVariants(context, input.item),
    campaignSuggestion,
    attributionHint: {
      contentId: slug(`${input.item.id}-${input.item.channel}`),
      contentTitle: input.item.title,
      campaign: campaignSuggestion,
    },
    ethicalChecklist: [
      "Conferir aderencia ao Provimento 205/2021 e ao Codigo de Etica da OAB antes de publicar.",
      "Nao prometer resultado juridico.",
      "Nao prometer resultado juridico, prazo de ganho ou vantagem indevida.",
      "Nao expor dados sensiveis, caso real ou documentos sem autorizacao expressa.",
      "Usar referencias apenas como sinais de formato/performance, nunca como texto copiavel.",
      "Publicacao ou envio externo exige acao humana manual.",
      "Publicacao, WhatsApp, e-mail ou campanha externa exigem acao humana manual.",
    ],
    riskFlags: riskFlags(input),
    humanApprovalRequired: true,
    externalSideEffectsBlocked: true,
  };
}

export function buildMarketingCopywriterArtifactMetadata(draft: MarketingCopywriterDraft) {
  return {
    title: draft.title,
    channel: draft.channel,
    format: draft.format,
    headline: draft.headline,
    hook: draft.hook,
    cta: draft.cta,
    campaign_suggestion: draft.campaignSuggestion,
    attribution_hint: draft.attributionHint,
    variant_count: draft.variants.length,
    risk_flags: draft.riskFlags,
    ethical_checklist: draft.ethicalChecklist,
    requires_human_approval: draft.humanApprovalRequired,
    external_side_effects_blocked: draft.externalSideEffectsBlocked,
  };
}
