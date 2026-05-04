export type CommercialPlaybookOfficeProfile = {
  firmName?: string | null;
  legalArea?: string | null;
  idealClient?: string | null;
  coreSolution?: string | null;
  uniqueValueProposition?: string | null;
  valuePillars?: string[] | null;
  positioningSummary?: string | null;
};

export type CommercialPlaybookStep = {
  id: string;
  order: number;
  title: string;
  objective: string;
  mayusBehavior: string;
  question: string;
};

export type CommercialObjectionMove = {
  objection: string;
  investigationQuestion: string;
  responseFrame: string;
  nextMove: string;
};

export type CommercialPlaybookModel = {
  methodName: string;
  sourceModel: string;
  officeName: string;
  legalArea: string;
  firstResponseSlaMinutes: number;
  positioning: {
    idealClient: string;
    coreSolution: string;
    uniqueValueProposition: string;
    valuePillars: string[];
  };
  steps: CommercialPlaybookStep[];
  objections: CommercialObjectionMove[];
  callAnalysisChecklist: string[];
  dailyReportSections: Array<{ id: string; label: string; detail: string }>;
  adaptationNotes: string[];
};

export type CommercialPlaybookSetupInput = CommercialPlaybookOfficeProfile & {
  templateFlavor?: "generic" | "dutra_blindagem" | string | null;
  sourceDocument?: string | null;
  notes?: string | null;
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function firstName(value?: string | null) {
  return cleanText(value)?.split(/\s+/)[0] || "tudo bem";
}

function normalizeText(value?: string | null) {
  return cleanText(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase() || "";
}

function cleanList(value?: string[] | null) {
  return (value || [])
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 5);
}

export function buildCommercialPlaybookModel(profile: CommercialPlaybookOfficeProfile = {}): CommercialPlaybookModel {
  const officeName = cleanText(profile.firmName) || "Escritorio";
  const legalArea = cleanText(profile.legalArea) || "atendimento juridico consultivo";
  const idealClient = cleanText(profile.idealClient) || `pessoas com um problema real em ${legalArea}, urgencia de decisao e abertura para diagnostico`;
  const coreSolution = cleanText(profile.coreSolution) || "diagnostico claro, plano de provas, leitura de risco e proximo passo juridico-comercial";
  const uniqueValueProposition = cleanText(profile.uniqueValueProposition)
    || `O ${officeName} conduz o cliente da duvida ate a decisao com triagem rapida, analise responsavel e orientacao comercial sem promessa de resultado.`;
  const valuePillars = cleanList(profile.valuePillars);

  return {
    methodName: "MAYUS Front Desk Comercial",
    sourceModel: "Inspirado no documento gestao-comercial-dutra-advocacia.html; adaptavel por escritorio.",
    officeName,
    legalArea,
    firstResponseSlaMinutes: 5,
    positioning: {
      idealClient,
      coreSolution,
      uniqueValueProposition,
      valuePillars: valuePillars.length > 0 ? valuePillars : [
        "Resposta em ate 5 minutos",
        "Descoberta antes de proposta",
        "Proximo passo com data, canal e responsavel",
      ],
    },
    steps: [
      {
        id: "opening",
        order: 1,
        title: "Quebra-gelo e controle",
        objective: "Responder rapido, assumir a conducao e reduzir ansiedade do lead.",
        mayusBehavior: "Cumprimenta, se apresenta como MAYUS do escritorio e explica que vai entender o caso antes de indicar caminho.",
        question: "Me conta em uma frase o que aconteceu e qual e a urgencia agora?",
      },
      {
        id: "strategic_retreat",
        order: 2,
        title: "Recuo estrategico",
        objective: "Evitar preco prematuro e promessa juridica; ganhar permissao para diagnosticar.",
        mayusBehavior: "Nao vende no escuro. Reposiciona a conversa para diagnostico e decisao segura.",
        question: "Antes de falar de valor ou caminho, posso te fazer 3 perguntas rapidas para ver se faz sentido?",
      },
      {
        id: "discovery",
        order: 3,
        title: "Descoberta",
        objective: "Mapear situacao, dor, impacto, urgencia, tentativas anteriores e documentos.",
        mayusBehavior: "Pergunta pouco, mas pergunta certo. Cada resposta deve gerar uma hipotese de qualificacao.",
        question: "O que voce ja tentou resolver e o que acontece se isso ficar parado mais um mes?",
      },
      {
        id: "decision_maker",
        order: 4,
        title: "Decisor",
        objective: "Descobrir quem decide, quem influencia e se precisa envolver outra pessoa.",
        mayusBehavior: "Inclui decisores cedo para nao perder fechamento no final.",
        question: "Essa decisao depende so de voce ou mais alguem precisa estar junto?",
      },
      {
        id: "thermometer",
        order: 5,
        title: "Termometro",
        objective: "Medir urgencia, confianca, capacidade de avanco e objecao dominante.",
        mayusBehavior: "Classifica o lead entre frio, curioso, qualificado ou pronto para reuniao/proposta.",
        question: "O que mais pesa para voce decidir agora: seguranca, prazo, valor, documentos ou falar com alguem?",
      },
      {
        id: "honesty_agreement",
        order: 6,
        title: "Acordo de sinceridade",
        objective: "Criar permissao para o lead dizer nao e para o MAYUS conduzir sem friccao.",
        mayusBehavior: "Combina clareza: se nao fizer sentido, o lead pode falar; se fizer, o proximo passo fica marcado.",
        question: "Combinado assim: se nao fizer sentido voce me fala, e se fizer eu ja te deixo com o proximo passo certo?",
      },
      {
        id: "enchantment",
        order: 7,
        title: "Encantamento",
        objective: "Traduzir o valor juridico em mudanca concreta para a vida do cliente.",
        mayusBehavior: "Usa a dor capturada, mostra custo de nao agir e conecta com a PUV do escritorio.",
        question: "Se isso for resolvido, o que muda de forma pratica na sua rotina ou no seu caixa?",
      },
      {
        id: "isolation",
        order: 8,
        title: "Isolamento de variaveis",
        objective: "Separar objecao real de desculpa: valor, confianca, tempo, decisor ou encaixe.",
        mayusBehavior: "Nao rebate primeiro; isola e depois trata.",
        question: "Se esse ponto fosse resolvido, voce estaria pronto para avancar para a analise/reuniao?",
      },
      {
        id: "transition",
        order: 9,
        title: "Transicao para proposta",
        objective: "So apresentar proximo passo depois de dor, valor e decisor estarem claros.",
        mayusBehavior: "Resume o diagnostico antes de recomendar reuniao, documentos, contrato ou cobranca.",
        question: "Pelo que voce me contou, o proximo passo correto e este. Posso organizar para voce agora?",
      },
      {
        id: "anchor",
        order: 10,
        title: "Ancoragem",
        objective: "Comparar custo de agir contra custo de esperar, sem prometer resultado.",
        mayusBehavior: "Ancora em risco, tempo, perda mensal, prova e prioridade, nao em pressao vazia.",
        question: "Quanto custa para voce deixar isso mais 30 dias sem direcao?",
      },
      {
        id: "close",
        order: 11,
        title: "Fechamento presumido",
        objective: "Converter interesse em compromisso claro: reuniao, documentos, contrato ou retorno.",
        mayusBehavior: "Assume o proximo passo quando o lead ja validou sentido e urgencia.",
        question: "Vou deixar isso encaminhado. Qual horario fica melhor para a proxima etapa?",
      },
    ],
    objections: [
      {
        objection: "Vou pensar",
        investigationQuestion: "O que exatamente voce precisa pensar: seguranca, valor, prazo, decisor ou falta de clareza?",
        responseFrame: "Pensar faz sentido, mas deixar aberto sem criterio costuma virar atraso. Vamos separar a duvida real.",
        nextMove: "Isolar a variavel e marcar retorno com data e canal.",
      },
      {
        objection: "Esta caro",
        investigationQuestion: "Quando voce fala em valor, sua duvida e preco, forma de pagamento ou seguranca do caminho?",
        responseFrame: "Preco sem diagnostico vira comparacao injusta. Primeiro o MAYUS mostra o custo de nao agir e o plano real.",
        nextMove: "Voltar para dor, impacto e prioridade antes de discutir proposta.",
      },
      {
        objection: "Preciso falar com outra pessoa",
        investigationQuestion: "Essa pessoa decide junto ou voce quer entender primeiro para explicar melhor?",
        responseFrame: "Melhor envolver quem decide para nao perder informacao no caminho.",
        nextMove: "Oferecer call curta com todos ou resumo objetivo para decisor.",
      },
      {
        objection: "Quero falar com um humano",
        investigationQuestion: "Claro. Para eu te encaminhar certo, voce quer falar sobre urgencia, documentos, valor ou estrategia?",
        responseFrame: "O MAYUS nao abandona o lead; acolhe, organiza e chama a pessoa certa.",
        nextMove: "Registrar nota interna e transferir para setor/pessoa quando necessario.",
      },
      {
        objection: "Nao sei se tenho direito",
        investigationQuestion: "Qual documento, desconto, decisao ou fato principal gerou essa duvida?",
        responseFrame: "Sem analisar o basico ninguem serio promete resultado; o primeiro passo e reduzir incerteza.",
        nextMove: "Pedir documentos minimos e propor diagnostico responsavel.",
      },
    ],
    callAnalysisChecklist: [
      "Tempo ate primeira resposta e se o lead ficou mais de 5 minutos sem retorno.",
      "Dor concreta, impacto financeiro/emocional e custo de nao agir.",
      "Urgencia, prazo, risco e documentos minimos citados.",
      "Decisor, influenciador e objecao dominante.",
      "Se houve encantamento: valor percebido antes de preco.",
      "Se houve isolamento de variavel antes de rebater objecao.",
      "Proximo passo com data, canal, responsavel e criterio de sucesso.",
    ],
    dailyReportSections: [
      { id: "executive", label: "Resumo executivo", detail: "Sinais do dia, risco operacional e foco da equipe." },
      { id: "crm", label: "Comercial e CRM", detail: "Leads parados, proximos passos e oportunidades que nao podem esfriar." },
      { id: "agenda", label: "Agenda e prazos", detail: "Tarefas do dia, urgencias e bloqueios juridicos." },
      { id: "frontdesk", label: "Front desk MAYUS", detail: "Atendimentos sem resposta, handoffs e follow-ups." },
      { id: "calls", label: "Calls e qualidade", detail: "Checklist de call, objecoes e oportunidades perdidas." },
      { id: "playbook", label: "Playbook do dia", detail: "Acoes prioritarias em estilo operacional premium." },
    ],
    adaptationNotes: [
      "Dutra usa linguagem de RMC/GRAM e Metodologia Blindagem; outros escritorios devem trocar area, promessa, provas, oferta e objecoes.",
      "O modelo estrutural e reutilizavel: resposta rapida, descoberta, decisor, termometro, encantamento, objecao e fechamento.",
      "MAYUS deve fazer o primeiro atendimento e acionar humano quando houver urgencia juridica, pedido especifico ou risco de promessa.",
    ],
  };
}

export function buildCommercialPlaybookSetup(input: CommercialPlaybookSetupInput = {}) {
  const model = buildCommercialPlaybookModel(input);
  const flavor = cleanText(input.templateFlavor) || (
    /dutra|rmc|gram|blindagem|bancario/i.test([
      input.firmName,
      input.legalArea,
      input.positioningSummary,
      input.notes,
      input.sourceDocument,
    ].filter(Boolean).join(" "))
      ? "dutra_blindagem"
      : "generic"
  );
  const dutraSpecific = flavor === "dutra_blindagem";

  return {
    ...model,
    sourceModel: dutraSpecific
      ? "Modelo Dutra Advocacia: estrutura RMC/GRAM e Metodologia Blindagem adaptada para uso interno."
      : model.sourceModel,
    adaptationNotes: [
      ...model.adaptationNotes,
      dutraSpecific
        ? "Para Dutra, manter trilhas RMC/GRAM, ancoragem em sangria financeira e GRAM como oportunidade especifica quando juridicamente aplicavel."
        : "Para outro escritorio, o usuario deve validar area, ICP, oferta, provas, objecoes e politica de preco antes de deixar o MAYUS escalar fechamento.",
    ],
  };
}

export function buildCommercialPlaybookArtifactMetadata(playbook: CommercialPlaybookModel) {
  return {
    method_name: playbook.methodName,
    source_model: playbook.sourceModel,
    office_name: playbook.officeName,
    legal_area: playbook.legalArea,
    first_response_sla_minutes: playbook.firstResponseSlaMinutes,
    positioning: playbook.positioning,
    steps: playbook.steps,
    objections: playbook.objections,
    call_analysis_checklist: playbook.callAnalysisChecklist,
    daily_report_sections: playbook.dailyReportSections,
    adaptation_notes: playbook.adaptationNotes,
    mayus_role: "first_attendant_sdr_closer_router",
    requires_human_review_for_legal_commitments: true,
    external_side_effects_policy: "MAYUS pode responder primeira triagem segura; contrato, cobranca e promessa juridica exigem governanca.",
  };
}

export function buildCommercialPlaybookReply(playbook: CommercialPlaybookModel) {
  return [
    `Skill comercial criada para ${playbook.officeName}.`,
    `SLA do primeiro atendimento: ate ${playbook.firstResponseSlaMinutes} minutos.`,
    `Metodo: ${playbook.methodName}.`,
    `Fases ativas: ${playbook.steps.map((step) => step.title).join(" -> ")}.`,
    "MAYUS atua como primeiro atendimento, qualifica, conduz descoberta, prepara fechamento e transfere quando houver pedido humano, urgencia juridica ou pessoa/setor especifico.",
  ].join("\n");
}

export function buildCommercialFirstReply(params: {
  leadName?: string | null;
  lastInboundText?: string | null;
  includeOpening?: boolean;
  profile?: CommercialPlaybookOfficeProfile | null;
}) {
  const playbook = buildCommercialPlaybookModel(params.profile || {});
  const name = firstName(params.leadName);
  const normalized = normalizeText(params.lastInboundText);
  const opening = `Oi, ${name}. Aqui e o MAYUS, assistente do ${playbook.officeName}. Vou te ajudar agora e organizar o atendimento para ninguem te deixar esperando.`;
  const includeOpening = params.includeOpening !== false;
  const withOpening = (blocks: string[]) => (includeOpening ? [opening, ...blocks] : blocks).join("\n\n");

  if (/humano|atendente|advogado|doutor|doutora|responsavel|falar com/.test(normalized)) {
    return withOpening([
      "Claro, eu posso chamar a pessoa certa. Para eu encaminhar sem te fazer repetir tudo, me diga em uma frase: o assunto e urgencia, documentos, valor ou estrategia do caso?",
    ]);
  }

  if (/valor|preco|custa|honorario|honorarios|parcel/.test(normalized)) {
    return withOpening([
      "Antes de falar em valor, eu preciso entender se o caminho faz sentido para o seu caso. Sua duvida principal hoje e seguranca, prazo, documentos ou forma de pagamento?",
    ]);
  }

  if (/vou pensar|depois|mais tarde|nao sei/.test(normalized)) {
    return withOpening([
      "Sem pressa artificial. Para eu nao te abandonar com uma duvida solta, o que falta para voce decidir: clareza do direito, confianca, tempo, valor ou falar com alguem?",
    ]);
  }

  return withOpening([
    "Me conta em uma frase o que aconteceu e qual e a urgencia. Depois eu te digo o melhor proximo passo.",
  ]);
}
