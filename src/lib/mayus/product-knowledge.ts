type MayusKnowledgeChunk = {
  title: string;
  keywords: string[];
  content: string;
  source: string;
};

const CHUNKS: MayusKnowledgeChunk[] = [
  {
    title: "Identidade",
    keywords: ["mayus", "produto", "sistema", "operacional", "socio", "virtual", "ia"],
    source: "docs/architecture/system-overview.md",
    content:
      "MAYUS e um sistema operacional de IA para escritorios de advocacia. Ele centraliza atendimento, processos, documentos, agenda, comercial, financeiro e operacao juridica em uma camada supervisionada.",
  },
  {
    title: "Brain e execucao",
    keywords: ["brain", "cerebro", "executa", "executar", "execucao", "acao", "aprovacao", "missao", "skill"],
    source: "docs/brain/MAYUS_AGENTIC_EXECUTION_CHECKLIST.md",
    content:
      "O MAYUS Brain decide quando consultar dados reais, abrir missoes, executar skills e pedir aprovacao humana. A voz Realtime e a presenca conversacional; o Brain continua sendo a autoridade operacional.",
  },
  {
    title: "Modulos",
    keywords: ["modulo", "crm", "whatsapp", "documento", "processo", "agenda", "financeiro", "marketing"],
    source: "docs/brain/MAYUS_MASTER_BLUEPRINT.md",
    content:
      "Os modulos principais incluem MAYUS AI, WhatsApp e atendimento, CRM/Growth, processos, documentos, agenda, financeiro, marketing, auditoria e configuracoes do escritorio.",
  },
  {
    title: "Supervisao",
    keywords: ["limite", "seguranca", "humano", "supervisionado", "aprovar", "risco"],
    source: "docs/brain/MAYUS_100_PERCENT_FINAL_CHECKLIST.md",
    content:
      "Acoes sensiveis, como envio externo, publicacao, pagamento, contrato, protocolo ou decisao juridica relevante, devem passar por revisao ou aprovacao humana. O objetivo e autonomia supervisionada, nao automacao opaca.",
  },
  {
    title: "Voz e Orb",
    keywords: ["voz", "orb", "realtime", "elevenlabs", "conversa"],
    source: "docs/brain/IMPLEMENTATION-PLAN-voice-brain-execution.md",
    content:
      "O Orb e a interface visual/voz do MAYUS. ElevenLabs permanece como fallback, enquanto o Realtime oferece conversa natural, interrupcao e chamadas de ferramentas para Brain, pesquisa e tarefas.",
  },
];

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function scoreChunk(chunk: MayusKnowledgeChunk, question: string) {
  return chunk.keywords.reduce((score, keyword) => (
    question.includes(normalize(keyword)) ? score + 1 : score
  ), 0);
}

export function answerMayusProductQuestion(question: unknown) {
  const normalizedQuestion = normalize(question);
  const ranked = CHUNKS
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, normalizedQuestion) }))
    .sort((a, b) => b.score - a.score);

  const selected = ranked.some((item) => item.score > 0)
    ? ranked.filter((item) => item.score > 0).slice(0, 3).map((item) => item.chunk)
    : CHUNKS.slice(0, 4);

  const answer = [
    "O MAYUS e o socio operacional de IA do escritorio: ele organiza, consulta, executa com supervisao e mostra o proximo passo com base nos dados reais do ambiente.",
    ...selected.map((chunk) => `${chunk.title}: ${chunk.content}`),
    "Limite importante: quando a acao envolve risco juridico, financeiro, envio externo ou mudanca sensivel, o MAYUS deve preparar e pedir aprovacao antes de executar.",
  ].join("\n\n");

  return {
    answer,
    sources: Array.from(new Set(selected.map((chunk) => chunk.source))),
  };
}
