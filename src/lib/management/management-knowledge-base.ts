export type ManagementKnowledgeArea =
  | "financeiro"
  | "marketing"
  | "vendas"
  | "comercial"
  | "operacao"
  | "analise";

export type ManagementKnowledgeTerm = {
  slug: string;
  term: string;
  aliases: string[];
  area: ManagementKnowledgeArea;
  simpleDefinition: string;
  lawFirmExample: string;
  requiredMayusData: string[];
  interpretationRisk: string;
  ownerDecisionQuestion: string;
  sourceHints: string[];
};

export type ManagementTermExplanation = {
  found: boolean;
  query: string;
  term: ManagementKnowledgeTerm | null;
  answer: string;
  sources: string[];
};

const SOURCE_HINTS = {
  smallBusiness: "Sebrae - gestao de pequenos negocios",
  crm: "HubSpot/RD Station - CRM, funil e vendas",
  media: "Google Skillshop/Think with Google e Meta Blueprint - mensuracao e midia",
  legalMarketing: "OAB/Provimento 205 - limites de marketing juridico",
  mayusData: "Dados internos MAYUS - financials, CRM, Asaas, contratos, cobrancas, processos, prazos e documentos",
};

export const MANAGEMENT_KNOWLEDGE_TERMS: ManagementKnowledgeTerm[] = [
  {
    slug: "cac",
    term: "CAC",
    aliases: ["custo de aquisicao", "custo por cliente", "custo aquisicao cliente"],
    area: "marketing",
    simpleDefinition: "Quanto o escritorio gasta para conquistar um novo cliente pagante.",
    lawFirmExample: "Se R$ 3.000 em midia e atendimento geram 10 contratos, o CAC aproximado e R$ 300 por cliente.",
    requiredMayusData: ["gastos de marketing", "origem do lead", "contratos fechados", "receita por cliente"],
    interpretationRisk: "Confundir lead com cliente pagante ou ignorar horas da equipe faz o CAC parecer menor do que realmente e.",
    ownerDecisionQuestion: "O custo para conquistar este tipo de cliente cabe na margem real do caso?",
    sourceHints: [SOURCE_HINTS.smallBusiness, SOURCE_HINTS.crm, SOURCE_HINTS.media, SOURCE_HINTS.legalMarketing, SOURCE_HINTS.mayusData],
  },
  {
    slug: "ltv",
    term: "LTV",
    aliases: ["valor de vida", "lifetime value", "valor vitalicio"],
    area: "financeiro",
    simpleDefinition: "Quanto um cliente tende a gerar de receita ao longo do relacionamento com o escritorio.",
    lawFirmExample: "Um cliente empresarial pode gerar contratos recorrentes, enquanto um caso pontual previdenciario tende a ter LTV concentrado em um unico processo.",
    requiredMayusData: ["historico de contratos", "receita recebida", "recorrencia", "custos por atendimento"],
    interpretationRisk: "Projetar recorrencia onde o escritorio ainda so tem casos pontuais transforma LTV em chute otimista.",
    ownerDecisionQuestion: "Este segmento gera relacao recorrente ou apenas um ticket unico?",
    sourceHints: [SOURCE_HINTS.smallBusiness, SOURCE_HINTS.crm, SOURCE_HINTS.mayusData],
  },
  {
    slug: "margem",
    term: "Margem",
    aliases: ["margem de lucro", "lucro", "rentabilidade"],
    area: "financeiro",
    simpleDefinition: "Parte da receita que sobra depois dos custos diretos, comissoes e despesas relevantes.",
    lawFirmExample: "Uma tese com honorarios altos pode ser pouco lucrativa se consome muitas horas, pericias, diligencias e follow-ups.",
    requiredMayusData: ["receita recebida", "custos diretos", "comissoes", "tempo ou esforco por caso"],
    interpretationRisk: "Olhar so faturamento e nao custo operacional leva o dono a priorizar tese grande, mas pouco rentavel.",
    ownerDecisionQuestion: "Depois dos custos e do tempo da equipe, esta area realmente deixa dinheiro no escritorio?",
    sourceHints: [SOURCE_HINTS.smallBusiness, SOURCE_HINTS.mayusData],
  },
  {
    slug: "ticket-medio",
    term: "Ticket medio",
    aliases: ["ticket", "valor medio", "honorarios medios"],
    area: "comercial",
    simpleDefinition: "Valor medio contratado ou recebido por cliente, caso ou tese.",
    lawFirmExample: "Se 20 contratos somam R$ 100.000, o ticket medio contratado e R$ 5.000.",
    requiredMayusData: ["propostas", "contratos", "receita recebida", "area juridica"],
    interpretationRisk: "Misturar valor contratado com valor recebido mascara inadimplencia e parcelamentos longos.",
    ownerDecisionQuestion: "O ticket medio desta area paga o custo de aquisicao e a carga operacional?",
    sourceHints: [SOURCE_HINTS.smallBusiness, SOURCE_HINTS.crm, SOURCE_HINTS.mayusData],
  },
  {
    slug: "conversao",
    term: "Conversao",
    aliases: ["taxa de conversao", "fechamento", "win rate"],
    area: "vendas",
    simpleDefinition: "Percentual de oportunidades que avancam de uma etapa para outra ou fecham contrato.",
    lawFirmExample: "Se 100 leads viram 20 consultas e 8 contratos, ha duas conversoes: lead para consulta e consulta para contrato.",
    requiredMayusData: ["CRM", "etapas do funil", "propostas", "contratos", "origem do lead"],
    interpretationRisk: "Medir so fechamento final esconde gargalos em atendimento, documentacao ou proposta.",
    ownerDecisionQuestion: "Em qual etapa o escritorio mais perde oportunidade e qual evidencia explica a perda?",
    sourceHints: [SOURCE_HINTS.crm, SOURCE_HINTS.mayusData],
  },
  {
    slug: "pipeline",
    term: "Pipeline",
    aliases: ["funil", "funil comercial", "esteira comercial"],
    area: "comercial",
    simpleDefinition: "Mapa das oportunidades abertas por etapa, valor e proximo compromisso.",
    lawFirmExample: "Leads em triagem, consulta marcada, proposta enviada, contrato pendente e cliente fechado formam o pipeline comercial.",
    requiredMayusData: ["CRM", "etapas", "valor estimado", "responsavel", "proximo passo"],
    interpretationRisk: "Pipeline sem proximo passo vira lista parada, nao previsao de receita.",
    ownerDecisionQuestion: "Quais oportunidades precisam de acao humana esta semana para nao esfriar?",
    sourceHints: [SOURCE_HINTS.crm, SOURCE_HINTS.mayusData],
  },
  {
    slug: "forecast",
    term: "Forecast",
    aliases: ["previsao", "previsao de receita", "projecao"],
    area: "financeiro",
    simpleDefinition: "Estimativa de receita futura baseada em cobrancas, contratos e oportunidades com probabilidade.",
    lawFirmExample: "Boletos vencendo, contratos assinados e propostas quentes indicam quanto pode entrar no caixa nos proximos dias.",
    requiredMayusData: ["cobrancas abertas", "vencimentos", "contratos", "CRM", "probabilidade por etapa"],
    interpretationRisk: "Tratar proposta como dinheiro certo cria falsa seguranca de caixa.",
    ownerDecisionQuestion: "Quanto do forecast e recebivel confirmado e quanto ainda depende de fechamento ou pagamento?",
    sourceHints: [SOURCE_HINTS.smallBusiness, SOURCE_HINTS.crm, SOURCE_HINTS.mayusData],
  },
  {
    slug: "roi",
    term: "ROI",
    aliases: ["retorno sobre investimento", "retorno"],
    area: "analise",
    simpleDefinition: "Relacao entre ganho obtido e investimento feito.",
    lawFirmExample: "Uma campanha de conteudo tem ROI positivo quando a receita atribuida aos clientes captados supera custo de midia, ferramentas e equipe.",
    requiredMayusData: ["investimento", "origem do lead", "contratos", "receita recebida", "custos"],
    interpretationRisk: "Atribuir todo contrato ao ultimo canal visto exagera o retorno de uma campanha.",
    ownerDecisionQuestion: "Qual receita realmente pode ser atribuida a esta iniciativa com evidencia suficiente?",
    sourceHints: [SOURCE_HINTS.smallBusiness, SOURCE_HINTS.media, SOURCE_HINTS.legalMarketing, SOURCE_HINTS.mayusData],
  },
  {
    slug: "cpl",
    term: "CPL",
    aliases: ["custo por lead", "lead cost"],
    area: "marketing",
    simpleDefinition: "Quanto custa gerar um lead, mesmo que ele ainda nao vire cliente.",
    lawFirmExample: "R$ 1.000 em campanha que gera 50 contatos tem CPL de R$ 20, antes de avaliar qualidade juridica e comercial.",
    requiredMayusData: ["gastos por campanha", "leads por origem", "qualificacao", "conversao"],
    interpretationRisk: "CPL barato pode atrair casos ruins, fora da tese ou com baixa capacidade de pagamento.",
    ownerDecisionQuestion: "Os leads baratos viram clientes bons ou so aumentam carga de triagem?",
    sourceHints: [SOURCE_HINTS.crm, SOURCE_HINTS.media, SOURCE_HINTS.legalMarketing, SOURCE_HINTS.mayusData],
  },
  {
    slug: "capacidade",
    term: "Capacidade",
    aliases: ["capacidade operacional", "capacidade produtiva", "limite da equipe"],
    area: "operacao",
    simpleDefinition: "Volume de casos, prazos, atendimentos ou entregas que a equipe consegue absorver sem perder qualidade.",
    lawFirmExample: "Faturamento subindo junto com prazo medio e tarefas atrasadas pode indicar gargalo de capacidade.",
    requiredMayusData: ["processos", "prazos", "tarefas", "responsaveis", "tempo de ciclo", "novos casos"],
    interpretationRisk: "Contratar por intuicao sem medir gargalo pode aumentar custo fixo sem resolver a etapa travada.",
    ownerDecisionQuestion: "O gargalo esta em atendimento, producao juridica, revisao, documentos ou cobranca?",
    sourceHints: [SOURCE_HINTS.smallBusiness, SOURCE_HINTS.mayusData],
  },
  {
    slug: "inadimplencia",
    term: "Inadimplencia",
    aliases: ["atraso", "cobranca vencida", "vencidos"],
    area: "financeiro",
    simpleDefinition: "Valor ou percentual de cobrancas vencidas em relacao ao que deveria entrar.",
    lawFirmExample: "Se R$ 20.000 estao abertos e R$ 5.000 vencidos, a inadimplencia sobre aberto e 25%.",
    requiredMayusData: ["cobrancas", "vencimentos", "status de pagamento", "cliente", "contrato"],
    interpretationRisk: "Misturar cobranca futura com vencida distorce urgencia e previsao de caixa.",
    ownerDecisionQuestion: "Qual parcela do caixa esperado depende de cobranca ativa ou renegociacao humana?",
    sourceHints: [SOURCE_HINTS.smallBusiness, SOURCE_HINTS.mayusData],
  },
  {
    slug: "produtividade",
    term: "Produtividade",
    aliases: ["eficiencia", "volume por pessoa", "entrega"],
    area: "operacao",
    simpleDefinition: "Relacao entre entregas relevantes e recursos usados, como pessoas, tempo e custo.",
    lawFirmExample: "Comparar minutas revisadas, prazos cumpridos e retrabalho por responsavel ajuda a enxergar produtividade real.",
    requiredMayusData: ["tarefas", "prazos", "responsaveis", "revisoes", "retrabalho", "documentos"],
    interpretationRisk: "Contar apenas quantidade incentiva pressa e pode esconder queda de qualidade juridica.",
    ownerDecisionQuestion: "A equipe esta entregando mais valor ou apenas movimentando mais tarefas?",
    sourceHints: [SOURCE_HINTS.smallBusiness, SOURCE_HINTS.mayusData],
  },
  {
    slug: "tese-lucrativa",
    term: "Tese lucrativa",
    aliases: ["area lucrativa", "rentabilidade por tese", "retorno por tese"],
    area: "analise",
    simpleDefinition: "Tese ou area juridica que combina receita, margem, conversao e carga operacional favoraveis.",
    lawFirmExample: "RMC pode converter bem e exigir menos instrucao que outra tese, mas so os dados do escritorio confirmam isso.",
    requiredMayusData: ["area juridica", "origem do lead", "conversao", "ticket", "custos", "tempo de ciclo", "resultado"],
    interpretationRisk: "Escolher tese so por volume ignora margem, capacidade e risco de qualidade.",
    ownerDecisionQuestion: "Qual tese gera melhor resultado quando receita, custo, tempo e risco sao vistos juntos?",
    sourceHints: [SOURCE_HINTS.smallBusiness, SOURCE_HINTS.crm, SOURCE_HINTS.mayusData],
  },
];

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function listManagementKnowledgeTerms() {
  return MANAGEMENT_KNOWLEDGE_TERMS.slice();
}

export function findManagementKnowledgeTerm(query: unknown) {
  const normalized = normalize(query);
  if (!normalized) return null;

  return MANAGEMENT_KNOWLEDGE_TERMS.find((term) => {
    const candidates = [term.term, term.slug, ...term.aliases].map(normalize);
    return candidates.some((candidate) => normalized === candidate || normalized.includes(candidate));
  }) || null;
}

export function extractManagementKnowledgeTermsFromText(text: unknown) {
  const normalized = normalize(text);
  if (!normalized) return [];

  return MANAGEMENT_KNOWLEDGE_TERMS.filter((term) => {
    const candidates = [term.term, term.slug, ...term.aliases].map(normalize);
    return candidates.some((candidate) => normalized.includes(candidate));
  });
}

export function buildManagementTermExplanation(query: unknown): ManagementTermExplanation {
  const originalQuery = String(query || "").trim();
  const term = findManagementKnowledgeTerm(originalQuery);

  if (!term) {
    return {
      found: false,
      query: originalQuery,
      term: null,
      answer:
        "Ainda nao encontrei esse termo na base curada de Gestao Juridica BR. Posso explicar conceitos ja mapeados como CAC, LTV, margem, ticket medio, conversao, pipeline, forecast, ROI, CPL, capacidade, inadimplencia, produtividade e tese lucrativa.",
      sources: [],
    };
  }

  return {
    found: true,
    query: originalQuery,
    term,
    answer: [
      `${term.term}: ${term.simpleDefinition}`,
      `No escritorio: ${term.lawFirmExample}`,
      `Dados MAYUS necessarios: ${term.requiredMayusData.join(", ")}.`,
      `Risco de leitura: ${term.interpretationRisk}`,
      `Pergunta para o dono decidir: ${term.ownerDecisionQuestion}`,
    ].join("\n"),
    sources: term.sourceHints,
  };
}
