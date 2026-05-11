export const MAYUS_REALTIME_MODEL = "gpt-realtime-2";
export const DEFAULT_MAYUS_REALTIME_VOICE = "cedar";
export const MAYUS_TTS_FALLBACK_VOICE = "onyx";
export const MAYUS_REALTIME_BRL_PER_USD = 4.9;
export const MAYUS_REALTIME_WEB_SEARCH_USD_PER_CALL = 0.01;

export const REALTIME_VOICE_OPTIONS = [
  { value: "cedar", label: "Cedar", description: "Executiva, grave e premium" },
  { value: "marin", label: "Marin", description: "Natural, fluida e conversacional" },
  { value: "alloy", label: "Alloy", description: "Neutra e equilibrada" },
  { value: "ash", label: "Ash", description: "Firme e objetiva" },
  { value: "ballad", label: "Ballad", description: "Expressiva e calma" },
  { value: "coral", label: "Coral", description: "Clara e amigavel" },
  { value: "echo", label: "Echo", description: "Direta e tecnica" },
  { value: "sage", label: "Sage", description: "SobrIa e consultiva" },
  { value: "shimmer", label: "Shimmer", description: "Leve e acolhedora" },
  { value: "verse", label: "Verse", description: "Narrativa e elegante" },
] as const;

export type MayusRealtimeVoice = typeof REALTIME_VOICE_OPTIONS[number]["value"];

export type RealtimeUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_token_details?: {
    text_tokens?: number;
    audio_tokens?: number;
  };
  output_token_details?: {
    text_tokens?: number;
    audio_tokens?: number;
  };
};

export type MayusRealtimeCostEstimate = {
  usd: number;
  brl: number;
  textInputTokens: number;
  textOutputTokens: number;
  audioInputTokens: number;
  audioOutputTokens: number;
};

const VOICE_VALUES = new Set<string>(REALTIME_VOICE_OPTIONS.map((voice) => voice.value));

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function isMayusRealtimeVoice(value: unknown): value is MayusRealtimeVoice {
  return typeof value === "string" && VOICE_VALUES.has(value);
}

export function normalizeMayusRealtimeVoice(value: unknown): MayusRealtimeVoice {
  return isMayusRealtimeVoice(value) ? value : DEFAULT_MAYUS_REALTIME_VOICE;
}

export function buildMayusRealtimeInstructions(params: {
  userName?: string | null;
  officeName?: string | null;
  selectedVoice?: string | null;
}) {
  const userName = cleanText(params.userName, "Doutor");
  const officeName = cleanText(params.officeName, "escritorio");
  const selectedVoice = normalizeMayusRealtimeVoice(params.selectedVoice);
  const now = new Date();
  const currentDate = now.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return [
    "IDENTIDADE",
    `Voce e o MAYUS AI, socio operacional de IA do ${officeName}.`,
    `Voce esta falando em tempo real com ${userName}. Trate-o como Doutor, mas nao repita Doutor em toda frase.`,
    "Voce e a presenca conversacional do MAYUS. O Brain do MAYUS continua sendo a autoridade para dados, decisoes, skills, aprovacoes e execucao.",
    `Data atual no escritorio: ${currentDate}. Use America/Sao_Paulo para interpretar hoje, amanha e proximos dias.`,
    "",
    "PERSONALIDADE",
    "Fale em portugues brasileiro, com voz executiva, premium, presente e naturalmente humana.",
    "Seja confiante, direto, respeitoso e proativo. Use calor humano sem parecer vendedor exagerado.",
    "Em voz, prefira frases curtas. Uma ideia por frase. Evite monologos.",
    "Mostre prontidao: 'Com prazer, Doutor. Vou verificar no cerebro operacional agora.'",
    "Quando houver bloqueio ou risco: 'Encontrei o caminho mais seguro. Antes de executar, preciso da sua aprovacao.'",
    `A voz selecionada e ${selectedVoice}. Ajuste o ritmo para soar calmo, firme e profissional.`,
    "",
    "GOVERNANCA",
    "Nunca invente processo, cliente, documento, prazo, tarefa, pagamento, status juridico ou resultado.",
    "Se o usuario pedir para criar tarefa, lembrete ou pendencia interna simples, use criar_tarefa_mayus.",
    "Se o usuario pedir informacao atual externa, noticia, status publico, preco, regra recente ou pesquisa na internet, use pesquisar_web_mayus e cite as fontes.",
    "Se o usuario perguntar o que e o MAYUS, o que ele faz, limites, modulos ou como usar o produto, use responder_sobre_mayus.",
    "Quando o pedido exigir dado real interno, memoria, consulta juridica, CRM, financeiro, documento, processo, acao externa ou aprovacao, chame consultar_cerebro_mayus.",
    "Nao prometa que executou algo antes da ferramenta retornar.",
    "Acoes sensiveis precisam respeitar o fluxo de aprovacao do MAYUS. Se o Brain pedir aprovacao, explique isso em voz curta.",
    "Nao use pesquisa web para responder sobre dados internos do escritorio. Nesses casos, consulte o Brain.",
    "Se nao houver base suficiente, diga que vai organizar a verificacao com seguranca e chame o Brain.",
    "Depois de receber o retorno da ferramenta, resuma em voz natural e curta, destacando proximo passo, bloqueio ou aprovacao.",
    "",
    "FRASES GUIA",
    "Com prazer, Doutor. Vou consultar o MAYUS Brain.",
    "Encontrei o ponto principal. Vou te passar de forma objetiva.",
    "Posso organizar isso como uma missao e trazer o proximo passo seguro.",
    "Antes de executar, preciso da sua aprovacao.",
  ].join("\n");
}

export const MAYUS_REALTIME_BRAIN_TOOL = {
  type: "function",
  name: "consultar_cerebro_mayus",
  description:
    "Consulta o Brain principal do MAYUS para obter dados reais, executar skills supervisionadas, organizar missoes, validar permissao e respeitar aprovacoes.",
  parameters: {
    type: "object",
    properties: {
      prompt: {
        type: "string",
        description:
          "Pedido claro que deve ser consultado ou executado pelo MAYUS Brain. Inclua contexto relevante da conversa.",
      },
      reason: {
        type: "string",
        description:
          "Motivo da chamada, como consulta de processo, status, CRM, documento, tarefa, aprovacao ou execucao supervisionada.",
      },
      conversationSummary: {
        type: "string",
        description: "Resumo curto do que o usuario acabou de pedir e do contexto falado ate agora.",
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
} as const;

export const MAYUS_REALTIME_TASK_TOOL = {
  type: "function",
  name: "criar_tarefa_mayus",
  description:
    "Cria uma tarefa interna reversivel no MAYUS para o usuario ou equipe. Nao executa envio externo, publicacao, pagamento ou alteracao juridica sensivel.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Titulo curto da tarefa interna.",
      },
      description: {
        type: "string",
        description: "Resumo objetivo da tarefa, contexto e criterio de pronto.",
      },
      urgency: {
        type: "string",
        enum: ["URGENTE", "ATENCAO", "ROTINA"],
        description: "Urgencia operacional da tarefa.",
      },
      scheduled_for: {
        type: "string",
        description: "Data/hora ISO-8601 quando a tarefa deve aparecer. Use America/Sao_Paulo.",
      },
      due_text: {
        type: "string",
        description: "Texto original de prazo dito pelo usuario, como hoje, amanha ou proxima segunda.",
      },
      client_name: {
        type: "string",
        description: "Cliente relacionado, se mencionado.",
      },
      process_number: {
        type: "string",
        description: "Numero do processo, se mencionado.",
      },
      requires_external_action: {
        type: "boolean",
        description: "True se a tarefa envolve envio externo, pagamento, protocolo, publicacao ou outra acao sensivel.",
      },
    },
    required: ["title"],
    additionalProperties: false,
  },
} as const;

export const MAYUS_REALTIME_WEB_SEARCH_TOOL = {
  type: "function",
  name: "pesquisar_web_mayus",
  description:
    "Pesquisa informacoes atuais na web usando ferramenta oficial de web search e retorna resposta curta com fontes.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Pergunta ou termo de busca atual que precisa ser confirmado na web.",
      },
      reason: {
        type: "string",
        description: "Por que a busca e necessaria.",
      },
      conversationSummary: {
        type: "string",
        description: "Resumo curto do contexto falado.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
} as const;

export const MAYUS_REALTIME_PRODUCT_TOOL = {
  type: "function",
  name: "responder_sobre_mayus",
  description:
    "Responde perguntas sobre o produto MAYUS, seus modulos, capacidades, limites e modo de operacao usando base interna curada.",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "Pergunta do usuario sobre o MAYUS.",
      },
      conversationSummary: {
        type: "string",
        description: "Resumo curto do contexto falado.",
      },
    },
    required: ["question"],
    additionalProperties: false,
  },
} as const;

export const MAYUS_REALTIME_TOOLS = [
  MAYUS_REALTIME_BRAIN_TOOL,
  MAYUS_REALTIME_TASK_TOOL,
  MAYUS_REALTIME_WEB_SEARCH_TOOL,
  MAYUS_REALTIME_PRODUCT_TOOL,
] as const;

export function estimateMayusRealtimeUsageCost(
  usage: RealtimeUsage | null | undefined,
  brlPerUsd = MAYUS_REALTIME_BRL_PER_USD
): MayusRealtimeCostEstimate {
  const textInputTokens = Math.max(0, Number(usage?.input_token_details?.text_tokens || 0));
  const audioInputTokens = Math.max(0, Number(usage?.input_token_details?.audio_tokens || 0));
  const textOutputTokens = Math.max(0, Number(usage?.output_token_details?.text_tokens || 0));
  const audioOutputTokens = Math.max(0, Number(usage?.output_token_details?.audio_tokens || 0));

  const usd =
    (textInputTokens * 4) / 1_000_000 +
    (textOutputTokens * 24) / 1_000_000 +
    (audioInputTokens * 32) / 1_000_000 +
    (audioOutputTokens * 64) / 1_000_000;

  return {
    usd,
    brl: usd * brlPerUsd,
    textInputTokens,
    textOutputTokens,
    audioInputTokens,
    audioOutputTokens,
  };
}
