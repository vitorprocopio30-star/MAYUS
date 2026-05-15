import type { EditorialCalendarItem, MarketingChannel, MarketingObjective, MarketingTone } from "@/lib/marketing/editorial-calendar";

export type NarrativePillarId = "future_of_law" | "real_automation" | "build_in_public" | "operating_systems" | "value_delivery";
export type NarrativeSourceId = "lawyer_pain" | "mayus_build" | "strategy_conversation" | "behind_the_scenes" | "market_reaction" | "before_after" | "vision";
export type NarrativeMechanismId = "belief_break" | "invisible_enemy" | "contrast" | "imminent_future" | "simple_transformation" | "visual_demo";
export type NarrativeFormat = "reel" | "carousel" | "story" | "workflow" | "opinion" | "demo";

export type NarrativePillar = {
  id: NarrativePillarId;
  label: string;
  objective: string;
  desiredFeeling: string;
  examples: string[];
};

export type NarrativeContentBankRow = {
  id: string;
  pain: string;
  transformation: string;
  demonstration: string;
  insight: string;
  cta: string;
  deliveredAsset: string;
  pillar: NarrativePillarId;
  source: NarrativeSourceId;
  primaryMetric: "retention" | "saves" | "shares" | "qualified_comments" | "form_clicks" | "story_replies";
};

export type NarrativeBatchItem = {
  format: NarrativeFormat;
  title: string;
  hook: string;
  productionNote: string;
  primaryMetric: NarrativeContentBankRow["primaryMetric"];
};

export type NarrativeModeledReference = {
  sourceTitle: string;
  detectedMechanisms: NarrativeMechanismId[];
  dominantEmotion: "identification" | "tension" | "fear" | "desire" | "status" | "novelty" | "transformation" | "contrast";
  mayusHook: string;
  tropicalizedAngle: string;
  antiCopyRules: string[];
};

export type MayusInstagramNarrativeStrategy = {
  publicPositioning: string;
  categoryThesis: string;
  desiredSensations: string[];
  corePillar: string;
  allowedLanguage: string[];
  forbiddenLanguage: string[];
  pillars: NarrativePillar[];
  contentSources: Array<{ id: NarrativeSourceId; label: string; howToUse: string }>;
  funnel: Array<{ stage: "top" | "middle" | "bottom"; role: string; formats: string[]; conversion: string }>;
  validationMetrics: string[];
  humanApprovalRequired: boolean;
  externalSideEffectsBlocked: boolean;
};

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "mayus-narrative";
}

function isoDateFromStart(startDate: string, offsetDays: number) {
  const date = new Date(`${startDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error("startDate must be a valid YYYY-MM-DD date");
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function buildMayusInstagramNarrativeStrategy(): MayusInstagramNarrativeStrategy {
  return {
    publicPositioning: "Laboratorio da advocacia AI-native brasileira.",
    categoryThesis: "O MAYUS documenta a evolucao da advocacia agentica e transforma dor operacional em prova de produto supervisionado.",
    desiredSensations: [
      "Estou atrasado.",
      "Isso resolve dores reais.",
      "Eles entendem advocacia de verdade.",
      "O MAYUS parece o futuro.",
    ],
    corePillar: "Microtransformacoes operacionais: trocar feature por rotina manual que poderia funcionar melhor.",
    allowedLanguage: [
      "operacao",
      "fluxo",
      "infraestrutura",
      "AI-native",
      "inteligencia operacional",
      "escritorio moderno",
      "sistema operacional juridico",
    ],
    forbiddenLanguage: [
      "IA revolucionaria",
      "prompt secreto",
      "hack",
      "100x produtividade",
      "promessa agressiva",
      "marketing juridico generico",
    ],
    pillars: [
      {
        id: "future_of_law",
        label: "Futuro da Advocacia",
        objective: "Criar posicionamento e categoria mental.",
        desiredFeeling: "Esse perfil entende o que esta acontecendo.",
        examples: [
          "O problema nao e peca juridica, e operacao.",
          "Escritorios AI-native vao operar com outra velocidade.",
        ],
      },
      {
        id: "real_automation",
        label: "Automacoes Reais",
        objective: "Gerar impacto visual imediato com fluxos funcionando.",
        desiredFeeling: "Isso economiza tempo agora.",
        examples: [
          "Agente WhatsApp supervisionado.",
          "Resumo automatico de audio e organizacao no CRM.",
        ],
      },
      {
        id: "build_in_public",
        label: "Build in Public",
        objective: "Humanizar o beta e criar comunidade.",
        desiredFeeling: "Estou acompanhando algo importante nascer.",
        examples: [
          "O que descobrimos ao testar um agente.",
          "Quando automatizar parecia bom, mas exigiu revisao humana.",
        ],
      },
      {
        id: "operating_systems",
        label: "Sistemas Operacionais",
        objective: "Elevar o nivel intelectual do posicionamento.",
        desiredFeeling: "Isso e maior que software.",
        examples: [
          "Workflow do escritorio AI-native.",
          "Playbook de atendimento juridico supervisionado.",
        ],
      },
      {
        id: "value_delivery",
        label: "Entrega de Valor",
        objective: "Gerar reciprocidade e leads sem parecer isca.",
        desiredFeeling: "Se o gratuito ajuda, o sistema completo deve ser forte.",
        examples: [
          "Mapa operacional.",
          "SOP de follow-up.",
        ],
      },
    ],
    contentSources: [
      { id: "lawyer_pain", label: "Dores reais dos advogados", howToUse: "Cada dor vira reel, carrossel, workflow, opiniao e demo." },
      { id: "mayus_build", label: "Coisas que o MAYUS esta construindo", howToUse: "Cada feature vira demonstracao, bastidor, antes/depois e insight." },
      { id: "strategy_conversation", label: "Conversas estrategicas", howToUse: "Transformar raciocinios sobre produto e mercado em manifesto ou carrossel." },
      { id: "behind_the_scenes", label: "Erros e bastidores", howToUse: "Mostrar limites, supervisao humana e aprendizado do beta." },
      { id: "market_reaction", label: "Reacao ao mercado juridico", howToUse: "Comentar noticias pelo angulo operacional, sem virar portal." },
      { id: "before_after", label: "Transformacoes simples", howToUse: "Mostrar antes/depois visual de uma rotina manual." },
      { id: "vision", label: "Filosofia e visao", howToUse: "Defender advocacia AI-native, escritorio como sistema e operacao inteligente." },
    ],
    funnel: [
      { stage: "top", role: "Impacto e compartilhamento.", formats: ["Reels 30-60s", "carrosseis de tese"], conversion: "comentario qualificado ou visita ao perfil" },
      { stage: "middle", role: "Reciprocidade e prova de competencia.", formats: ["workflow", "SOP", "prompt", "mini agente", "mapa operacional"], conversion: "DM ou asset entregue" },
      { stage: "bottom", role: "Desejo pelo beta supervisionado.", formats: ["demo", "bastidor", "e-mail", "lista beta"], conversion: "formulario de acesso antecipado" },
    ],
    validationMetrics: [
      "retencao dos Reels",
      "salvamentos",
      "compartilhamentos",
      "comentarios qualificados",
      "cliques no formulario",
      "respostas de story",
    ],
    humanApprovalRequired: true,
    externalSideEffectsBlocked: true,
  };
}

export function buildDefaultMayusNarrativeBank(): NarrativeContentBankRow[] {
  return [
    {
      id: "lead-sem-resposta",
      pain: "Lead chega pelo WhatsApp e fica sem resposta enquanto o advogado esta em audiencia.",
      transformation: "Agente supervisionado acolhe, resume, classifica urgencia e organiza no CRM.",
      demonstration: "WhatsApp cheio -> resumo IA -> pipeline -> dashboard.",
      insight: "O problema nem sempre e preco. Muitas vezes e tempo de resposta.",
      cta: "Comente MAYUS para receber a estrutura do agente.",
      deliveredAsset: "Fluxo de atendimento WhatsApp supervisionado.",
      pillar: "real_automation",
      source: "lawyer_pain",
      primaryMetric: "qualified_comments",
    },
    {
      id: "follow-up-esquecido",
      pain: "O escritorio conversa com o lead, mas nao registra proximo passo nem retorno.",
      transformation: "MAYUS organiza cadencia, responsavel, canal e mensagem sugerida.",
      demonstration: "Lead parado -> plano de follow-up -> tarefa interna.",
      insight: "Follow-up nao e insistencia. E operacao com dono e data.",
      cta: "Comente ROTINA para receber o SOP de follow-up.",
      deliveredAsset: "SOP de follow-up juridico supervisionado.",
      pillar: "operating_systems",
      source: "lawyer_pain",
      primaryMetric: "saves",
    },
    {
      id: "prazo-na-cabeca",
      pain: "Prazos, tarefas e documentos dependem da memoria do socio.",
      transformation: "Dashboard mostra o que precisa de atencao antes da cobranca manual.",
      demonstration: "Painel MAYUS com prazos, tarefas e alertas operacionais.",
      insight: "Escritorio moderno nao pode depender de memoria individual para manter rotina viva.",
      cta: "Entre na lista beta para ver o fluxo funcionando.",
      deliveredAsset: "Mapa de rotina operacional do escritorio.",
      pillar: "future_of_law",
      source: "mayus_build",
      primaryMetric: "form_clicks",
    },
    {
      id: "documento-perdido",
      pain: "Documento importante fica perdido entre Drive, WhatsApp e pastas antigas.",
      transformation: "MAYUS organiza, sugere destino e mantem revisao humana antes de mover.",
      demonstration: "Arquivo solto -> revisao -> pasta sugerida -> trilha auditavel.",
      insight: "Automacao boa nao mexe em documento sensivel sem controle.",
      cta: "Salve para revisar a organizacao documental do escritorio.",
      deliveredAsset: "Checklist de organizacao documental supervisionada.",
      pillar: "real_automation",
      source: "before_after",
      primaryMetric: "saves",
    },
    {
      id: "movimentacao-invisivel",
      pain: "O processo movimenta e a equipe percebe tarde demais.",
      transformation: "MAYUS resume a movimentacao, cria card e aponta atencao operacional.",
      demonstration: "Movimentacao -> resumo IA -> card -> proximo passo supervisionado.",
      insight: "IA juridica nao e so escrever peca. E manter a operacao acordada.",
      cta: "Compartilhe com quem ainda acompanha processo no manual.",
      deliveredAsset: "Workflow de monitoramento processual AI-native.",
      pillar: "operating_systems",
      source: "mayus_build",
      primaryMetric: "shares",
    },
    {
      id: "conteudo-sem-fabrica",
      pain: "O escritorio quer postar, mas depende de inspiracao e improviso.",
      transformation: "MAYUS transforma dor, demo, insight, CTA e asset em banco editorial.",
      demonstration: "Dor -> transformacao -> roteiro -> calendario -> aprovacao.",
      insight: "Os grandes perfis nao inventam conteudo. Transformam pensamento em midia.",
      cta: "Comente ROTINA para receber o banco de 6 colunas.",
      deliveredAsset: "Template de banco operacional de conteudo.",
      pillar: "value_delivery",
      source: "strategy_conversation",
      primaryMetric: "qualified_comments",
    },
  ];
}

export function expandPainIntoNarrativeBatch(row: NarrativeContentBankRow): NarrativeBatchItem[] {
  return [
    {
      format: "reel",
      title: row.pain,
      hook: row.insight,
      productionNote: `Abrir com a dor visual, mostrar ${row.demonstration} e fechar com ${row.cta}.`,
      primaryMetric: "retention",
    },
    {
      format: "carousel",
      title: row.insight,
      hook: "O problema nao e a ferramenta. E a rotina manual que ficou sem dono.",
      productionNote: "Usar capa de tese, diagnostico, mecanismo, exemplo e CTA unico.",
      primaryMetric: "saves",
    },
    {
      format: "story",
      title: "Enquete de dor operacional",
      hook: row.pain,
      productionNote: "Perguntar se isso acontece hoje e direcionar respostas para a lista beta.",
      primaryMetric: "story_replies",
    },
    {
      format: "workflow",
      title: row.deliveredAsset,
      hook: row.transformation,
      productionNote: "Entregar um asset operacional curto, com revisao humana e sem promessa de resultado.",
      primaryMetric: "qualified_comments",
    },
    {
      format: "opinion",
      title: row.insight,
      hook: "Isso nao e sobre vender software. E sobre documentar a evolucao da advocacia.",
      productionNote: "Post unico ou carrossel curto com ponto de vista premium.",
      primaryMetric: "shares",
    },
    {
      format: "demo",
      title: `Antes/depois: ${row.transformation}`,
      hook: row.pain,
      productionNote: `Mostrar produto real ou fluxo mockado com dados ficticios: ${row.demonstration}.`,
      primaryMetric: "retention",
    },
  ];
}

export function modelReferenceForMayusNarrative(reference: {
  title: string;
  hook?: string | null;
  summary?: string | null;
  channel?: MarketingChannel | null;
}): NarrativeModeledReference {
  const text = `${reference.title} ${reference.hook || ""} ${reference.summary || ""}`.toLowerCase();
  const detectedMechanisms: NarrativeMechanismId[] = [];

  if (/nao e|não é|maioria|most |do not|don't|does not|need more|precisa parar|erro/.test(text)) detectedMechanisms.push("belief_break");
  if (/perdendo|risco|invisivel|ningu[eé]m percebe|aqui/.test(text)) detectedMechanisms.push("invisible_enemy");
  if (/enquanto|while|vs|versus|antes|depois|before|after/.test(text)) detectedMechanisms.push("contrast");
  if (/futuro|ja comecou|já começou|ai-native|agents|agentes/.test(text)) detectedMechanisms.push("imminent_future");
  if (/antes.*depois|manual|automatico|automático|transform/.test(text)) detectedMechanisms.push("simple_transformation");
  if (/mostra|tela|fluxo|demo|print|dashboard/.test(text)) detectedMechanisms.push("visual_demo");

  const mechanisms: NarrativeMechanismId[] = detectedMechanisms.length ? detectedMechanisms : ["belief_break"];
  const dominantEmotion = mechanisms.includes("invisible_enemy")
    ? "fear"
    : mechanisms.includes("contrast")
      ? "contrast"
      : mechanisms.includes("visual_demo")
        ? "transformation"
        : "tension";

  return {
    sourceTitle: reference.title,
    detectedMechanisms: mechanisms,
    dominantEmotion,
    mayusHook: "O problema nao e usar IA. E integrar IA na operacao do escritorio.",
    tropicalizedAngle: "Transformar o mecanismo de atencao em uma dor operacional de advocacia brasileira: WhatsApp, prazo, audiencia, documento, financeiro ou follow-up.",
    antiCopyRules: [
      "Nao repetir roteiro, frase, estetica ou traducao do conteudo de origem.",
      "Extrair apenas emocao, hook, tensao, contraste e ritmo.",
      "Criar exemplo juridico novo com dados ficticios e revisao humana.",
    ],
  };
}

export function buildMayusInstagramWeekOneCalendar(startDate: string): EditorialCalendarItem[] {
  const items: Array<{
    offset: number;
    title: string;
    channel: MarketingChannel;
    objective: MarketingObjective;
    tone: MarketingTone;
    angle: string;
    notes: string;
  }> = [
    {
      offset: 0,
      title: "O problema do escritorio nao e falta de IA. E falta de operacao.",
      channel: "instagram",
      objective: "authority",
      tone: "premium",
      angle: "Manifesto de categoria para explicar que o MAYUS documenta a advocacia AI-native, nao vende feature solta.",
      notes: "Carrossel manifesto. CTA: salve e entre na lista beta. Evitar promessa de resultado.",
    },
    {
      offset: 1,
      title: "Reel: MAYUS narrando o dashboard e o que precisa de atencao.",
      channel: "instagram",
      objective: "awareness",
      tone: "direct",
      angle: "Tela gravada com voz do MAYUS mostrando dashboard, prazos, tarefas e decisao humana.",
      notes: "Reel 30-60s. Hook nos 3 primeiros segundos. Usar dados ficticios. CTA: veja os destaques.",
    },
    {
      offset: 2,
      title: "IA juridica nao e so peticao.",
      channel: "instagram",
      objective: "authority",
      tone: "educational",
      angle: "Explicar diferenca entre chatbot, automacao e sistema que organiza a operacao com supervisao.",
      notes: "Carrossel educativo. CTA: compartilhe com socio/equipe.",
    },
    {
      offset: 3,
      title: "Story: qual dor trava mais a rotina hoje?",
      channel: "instagram",
      objective: "lead_generation",
      tone: "conversational",
      angle: "Enquete com prazos, WhatsApp, documentos e follow-up para alimentar o banco operacional.",
      notes: "Stories diarios. Registrar respostas como dores para novas pautas. CTA: responder com dor operacional.",
    },
    {
      offset: 4,
      title: "A maioria dos escritorios nao precisa contratar mais gente.",
      channel: "instagram",
      objective: "authority",
      tone: "premium",
      angle: "Quebra de crenca: antes de contratar, parar de operar manualmente e organizar fluxos.",
      notes: "Carrossel ou post unico. Evitar tom absoluto; tratar como tese operacional.",
    },
    {
      offset: 5,
      title: "O advogado acha que perde cliente pelo preco. Mas geralmente perde aqui.",
      channel: "instagram",
      objective: "lead_generation",
      tone: "direct",
      angle: "Lead sem resposta, audio ignorado e follow-up inexistente como inimigo invisivel.",
      notes: "Reel com WhatsApp cheio -> resumo IA -> pipeline -> dashboard. CTA: Comente MAYUS para receber estrutura.",
    },
    {
      offset: 6,
      title: "O que e o beta supervisionado do MAYUS?",
      channel: "instagram",
      objective: "lead_generation",
      tone: "educational",
      angle: "Post fixado explicando beta controlado, limites, revisao humana e formulario de acesso antecipado.",
      notes: "Post fixado. CTA principal: formulario de lista beta. Sem preco e sem promessa de maturidade final.",
    },
  ];

  return items.map((item, index) => ({
    id: `mayus-instagram-week-one-${index + 1}-${slug(item.title)}`,
    title: item.title,
    channel: item.channel,
    legalArea: "Operacao juridica",
    objective: item.objective,
    tone: item.tone,
    audience: "Escritorios de advocacia com 3 a 20 pessoas",
    angle: item.angle,
    guardrails: [
      "Nao prometer resultado juridico, captacao ou produtividade garantida.",
      "Usar dados ficticios em qualquer demonstracao de tela.",
      "Manter revisao humana antes de publicar, enviar DM ou acionar qualquer integracao externa.",
      "Modelar mecanismos de atencao sem copiar frases, roteiro ou estetica de terceiros.",
    ],
    sourcePatternIds: ["mayus-ai-native-narrative-plan"],
    date: isoDateFromStart(startDate, item.offset),
    status: "draft",
    notes: [
      "Origem: mayus_ai_native_narrative_engine",
      item.notes,
      "Banco de 6 colunas: dor -> transformacao -> demonstracao -> insight -> CTA -> asset entregue.",
    ].join("\n"),
  }));
}
