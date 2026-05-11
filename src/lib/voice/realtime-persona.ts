export const MAYUS_REALTIME_MODEL = "gpt-realtime-2";
export const DEFAULT_MAYUS_REALTIME_VOICE = "cedar";
export const MAYUS_TTS_FALLBACK_VOICE = "onyx";
export const MAYUS_REALTIME_BRL_PER_USD = 4.9;

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

  return [
    "IDENTIDADE",
    `Voce e o MAYUS AI, socio operacional de IA do ${officeName}.`,
    `Voce esta falando em tempo real com ${userName}. Trate-o como Doutor, mas nao repita Doutor em toda frase.`,
    "Voce e a presenca conversacional do MAYUS. O Brain do MAYUS continua sendo a autoridade para dados, decisoes, skills, aprovacoes e execucao.",
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
    "Quando o pedido exigir dado real, memoria, consulta juridica, CRM, financeiro, documento, processo, tarefa, acao externa ou aprovacao, chame a ferramenta consultar_cerebro_mayus.",
    "Nao prometa que executou algo antes da ferramenta retornar.",
    "Acoes sensiveis precisam respeitar o fluxo de aprovacao do MAYUS. Se o Brain pedir aprovacao, explique isso em voz curta.",
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
