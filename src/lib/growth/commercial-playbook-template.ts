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
  playbookKey: "dutra_blindagem" | "generic_legal_sales";
  methodName: string;
  sourceModel: string;
  officeName: string;
  legalArea: string;
  firstResponseSlaMinutes: number;
  activationGreeting: string;
  tenantIsolation: {
    scope: "dutra_only" | "generic_fallback";
    reason: string;
    forbiddenOutsideScope: string[];
  };
  positioning: {
    idealClient: string;
    coreSolution: string;
    uniqueValueProposition: string;
    valuePillars: string[];
  };
  steps: CommercialPlaybookStep[];
  objections: CommercialObjectionMove[];
  intakeQuestions: string[];
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

function shortContext(value?: string | null) {
  const text = cleanText(value);
  if (!text) return null;
  return text.length > 120 ? `${text.slice(0, 117).trim()}...` : text;
}

function cleanList(value?: string[] | null) {
  return (value || [])
    .map((item) => cleanText(item))
    .filter((item): item is string => Boolean(item))
    .slice(0, 5);
}

function isDutraContext(profile: CommercialPlaybookOfficeProfile = {}) {
  const normalized = normalizeText([
    profile.firmName,
    profile.legalArea,
    profile.idealClient,
    profile.coreSolution,
    profile.uniqueValueProposition,
    profile.positioningSummary,
    ...(profile.valuePillars || []),
  ].filter(Boolean).join(" "));

  return /\bdutra\b|blindagem|rmc|gram|credcesta|bmg|gratificacao de risco|servidor publico do rj/.test(normalized);
}

function buildDutraBlindagemPlaybook(): CommercialPlaybookModel {
  return {
    playbookKey: "dutra_blindagem",
    methodName: "Metodologia Blindagem - DEF + 15 etapas",
    sourceModel: "Skill Dutra Advocacia: RMC, GRAM, Blindagem 360 e playbook comercial interno.",
    officeName: "Dutra Advocacia",
    legalArea: "RMC, cartao consignado e GRAM para servidores publicos do RJ",
    firstResponseSlaMinutes: 5,
    activationGreeting: "Bom dia, Guardiao. Qual o desafio comercial de hoje?",
    tenantIsolation: {
      scope: "dutra_only",
      reason: "Conteudo comercial, tese, persona, precificacao e linguagem pertencem ao contexto Dutra.",
      forbiddenOutsideScope: ["Dutra", "RMC", "GRAM", "Blindagem 360", "Roberto", "Dra. Camila", "Credcesta", "BMG"],
    },
    positioning: {
      idealClient: "Servidor publico do RJ, especialmente PM, Civil, Bombeiro ou Agente Penal, com desconto de RMC/cartao consignado e possivel direito ligado a GRAM.",
      coreSolution: "Blindagem 360: diagnostico do contracheque, frentes RMC, GRAM e plano tatico para parar sangramento, revisar contrato e recuperar valores quando aplicavel.",
      uniqueValueProposition: "A Dutra conduz o servidor com linguagem direta, descoberta profunda, ancoragem do prejuizo e fechamento consultivo sem culpar a vitima.",
      valuePillars: [
        "Nunca culpar o cliente: ele foi confundido por linguagem tecnica.",
        "Descoberta antes de proposta: dor, desconto, familia, decisor e urgencia.",
        "Encantamento conectado ao contracheque, batalhao, banco e sonho adiado.",
        "Preco somente apos ancoragem e isolamento de variaveis.",
        "GRAM como segunda frente somente quando juridicamente aplicavel.",
      ],
    },
    steps: [
      {
        id: "opening",
        order: 1,
        title: "Quebra-gelo com contracheque",
        objective: "Criar vinculo real usando orgao, batalhao, banco, desconto e tempo de carreira.",
        mayusBehavior: "Cumprimenta, reconhece o contexto do servidor e pergunta sobre a realidade da carreira antes de vender.",
        question: "Vi aqui o desconto no seu contracheque. Ha quanto tempo isso aparece e o que mais pesa hoje no seu salario?",
      },
      {
        id: "strategic_retreat",
        order: 2,
        title: "Recuo estrategico",
        objective: "Ganhar permissao para diagnosticar e deixar claro que nem todo caso serve para a solucao.",
        mayusBehavior: "Evita promessa e conduz para perguntas de qualificacao.",
        question: "Antes de te falar qualquer solucao, posso entender seu momento para ver se realmente faz sentido?",
      },
      {
        id: "discovery",
        order: 3,
        title: "Arsenal de descoberta",
        objective: "Mapear RMC, tentativas de cancelamento, saldo que nao cai, renda extra, familia, GRAM e dor emocional.",
        mayusBehavior: "Fala pouco, escuta muito e registra os sinais que vao virar municao no fechamento.",
        question: "Quando voce assinou isso, te explicaram que era cartao de credito ou voce entendeu que era emprestimo com parcelas fixas?",
      },
      {
        id: "decision_maker",
        order: 4,
        title: "Decisor",
        objective: "Descobrir se a decisao e individual ou envolve esposa, familia ou outro influenciador.",
        mayusBehavior: "Inclui o decisor cedo para impedir objecao mascarada no final.",
        question: "Essa decisao de resolver isso e somente sua ou voce costuma envolver alguem?",
      },
      {
        id: "thermometer",
        order: 5,
        title: "Termometro",
        objective: "Medir prioridade real de resolver agora.",
        mayusBehavior: "Se nao for 8 a 10, investiga o que falta para virar prioridade.",
        question: "De 0 a 10, qual e sua prioridade em resolver esse desconto agora?",
      },
      {
        id: "honesty_agreement",
        order: 6,
        title: "Acordo de sinceridade",
        objective: "Combinar objetividade: se nao fizer sentido, o cliente fala; se fizer, avanca.",
        mayusBehavior: "Tira pressao vazia e aumenta compromisso de decisao.",
        question: "Combinado: se nao fizer sentido voce me fala, e se fizer eu ja deixo o proximo passo organizado?",
      },
      {
        id: "enchantment",
        order: 7,
        title: "Encantamento RMC + GRAM",
        objective: "Explicar banco, juros, contrato, dano moral, devolucao, GRAM e urgencia usando a dor capturada.",
        mayusBehavior: "Conecta cada frente a um fato dito pelo servidor e evita juridiquês.",
        question: "De tudo isso, o que mais faria diferenca para voce: parar o desconto, recuperar valor, organizar a divida ou avaliar GRAM?",
      },
      {
        id: "isolation",
        order: 8,
        title: "Isolamento de variaveis",
        objective: "Separar objecao real de desculpa antes de apresentar proposta.",
        mayusBehavior: "Pergunta o que falta e confirma se aquilo e somente aquilo.",
        question: "O que falta para voce se tornar cliente hoje?",
      },
      {
        id: "anchor",
        order: 9,
        title: "Ancoragem do prejuizo",
        objective: "Mostrar custo de nao fazer nada com valor mensal, anos de desconto e janela da GRAM.",
        mayusBehavior: "Ajuda o cliente a calcular o proprio prejuizo antes de falar investimento.",
        question: "Ha quanto tempo voce paga esse valor por mes? Vamos fazer essa conta juntos.",
      },
      {
        id: "proposal",
        order: 10,
        title: "Proposta e condicao",
        objective: "Apresentar valor tabela, depois condicao especial, somente apos ancoragem.",
        mayusBehavior: "Nao antecipa preco. Mostra escopo, taxa de exito e proximos passos com clareza.",
        question: "Pelo numero de acoes mapeadas, vou te mostrar o caminho completo e a melhor forma de comecar.",
      },
      {
        id: "close",
        order: 11,
        title: "Fechamento presumido",
        objective: "Converter em agenda, documento, contrato ou pagamento quando o lead ja validou sentido.",
        mayusBehavior: "Assume o proximo passo e reduz friccao operacional.",
        question: "Vamos garantir seu inicio entao. O contrato fica no seu nome, certo?",
      },
    ],
    objections: [
      {
        objection: "Vou pensar",
        investigationQuestion: "O que exatamente voce precisa analisar melhor: seguranca, valor, decisor ou algum ponto que ficou em aberto?",
        responseFrame: "Pensar faz sentido, mas enquanto fica aberto o desconto continua e a janela da GRAM pode andar.",
        nextMove: "Isolar a variavel, retomar dor financeira e marcar proximo passo objetivo.",
      },
      {
        objection: "Nao tenho esse dinheiro",
        investigationQuestion: "Ate qual valor voce conseguiria investir para comecar sem apertar mais o mes?",
        responseFrame: "Comparar parcela com desconto mensal e custo de continuar parado, sem prometer resultado.",
        nextMove: "Recalibrar forma de pagamento ou encaminhar agenda de fechamento.",
      },
      {
        objection: "Preciso falar com minha esposa",
        investigationQuestion: "Ela decide junto ou voce quer explicar com seguranca antes?",
        responseFrame: "Evitar perda de contexto e oferecer call com os dois.",
        nextMove: "Agendar call conjunta ou enviar resumo curto para decisor.",
      },
      {
        objection: "Nao sei se tenho direito",
        investigationQuestion: "Voce tem contracheque, contrato, banco e historico do desconto para uma analise inicial?",
        responseFrame: "Ninguem serio promete sem analisar, mas os sinais do contracheque indicam se vale avancar.",
        nextMove: "Pedir documento minimo e organizar diagnostico.",
      },
      {
        objection: "Ja tentei antes",
        investigationQuestion: "O desconto chegou a parar? Qual foi a estrategia usada?",
        responseFrame: "Diferenciar tentativa generica de uma analise com contrato, contracheque, banco e tese correta.",
        nextMove: "Mapear falha anterior e propor nova leitura.",
      },
    ],
    intakeQuestions: [
      "Qual orgao, batalhao/corporacao, banco e valor do desconto aparecem no contracheque?",
      "O cliente entendeu que assinou emprestimo ou sabia que era cartao consignado?",
      "Ja tentou cancelar, pedir extrato ou negociar direto com banco?",
      "Existe GRAM no contracheque e ja houve acao anterior sobre esse tema?",
      "Quem decide a contratacao e qual objecao real apareceu?",
      "Qual pacote, condicao e forma de pagamento foram autorizados pelo escritorio para esse caso?",
    ],
    callAnalysisChecklist: [
      "Se abriu com contexto real do contracheque, orgao, banco e valor.",
      "Se nunca culpou o servidor pela assinatura.",
      "Se mapeou RMC, GRAM, renda extra, familia, decisor e prioridade.",
      "Se perguntou expectativa de um excelente escritorio antes do fechamento.",
      "Se explicou RMC/GRAM sem juridiquês e sem promessa de resultado.",
      "Se ancorou o prejuizo antes de falar preco.",
      "Se isolou a objecao antes de contornar.",
      "Se fechou proximo passo com data, canal e responsavel.",
    ],
    dailyReportSections: [
      { id: "executive", label: "Resumo executivo", detail: "Sinais comerciais, agenda e risco juridico do dia." },
      { id: "rmc", label: "RMC e descontos", detail: "Leads com contracheque, banco, desconto e potencial frente RMC." },
      { id: "gram", label: "GRAM", detail: "Oportunidades de triagem GRAM e documentos faltantes." },
      { id: "crm", label: "Comercial e CRM", detail: "Leads sem proximo passo, no-show, follow-up e fechamento." },
      { id: "agenda", label: "Agenda e prazos", detail: "Calls, documentos, retornos e tarefas criticas." },
      { id: "frontdesk", label: "Front desk MAYUS", detail: "Atendimentos sem resposta, handoffs e primeira triagem." },
      { id: "calls", label: "Calls e qualidade", detail: "Etapas puladas, objecoes e oportunidades perdidas." },
      { id: "playbook", label: "Playbook do dia", detail: "Movimentos prioritarios para o time comercial Dutra." },
    ],
    adaptationNotes: [
      "Esta skill so pode ser usada no contexto Dutra; qualquer tenant nao-Dutra deve cair no template generico.",
      "MAYUS pode vender, qualificar, marcar reuniao e organizar fechamento quando a governanca permitir IA operando.",
      "Nao prometer resultado juridico: separar tese, possibilidade, documentos e risco.",
      "Preco, condicoes e taxa de exito devem seguir configuracao validada pelo escritorio.",
    ],
  };
}

function buildGenericLegalSalesPlaybook(profile: CommercialPlaybookOfficeProfile = {}): CommercialPlaybookModel {
  const officeName = cleanText(profile.firmName) || "Escritorio";
  const legalArea = cleanText(profile.legalArea) || "atendimento juridico consultivo";
  const idealClient = cleanText(profile.idealClient) || `pessoas com um problema real em ${legalArea}, urgencia de decisao e abertura para diagnostico`;
  const coreSolution = cleanText(profile.coreSolution) || "diagnostico claro, plano de provas, leitura de risco e proximo passo juridico-comercial";
  const uniqueValueProposition = cleanText(profile.uniqueValueProposition)
    || `O ${officeName} conduz o cliente da duvida ate a decisao com triagem rapida, analise responsavel e orientacao comercial sem promessa de resultado.`;
  const valuePillars = cleanList(profile.valuePillars);

  return {
    playbookKey: "generic_legal_sales",
    methodName: "MAYUS Front Desk Comercial",
    sourceModel: "Template generico de vendas juridicas consultivas; nao contem termos proprietarios de outros tenants.",
    officeName,
    legalArea,
    firstResponseSlaMinutes: 5,
    activationGreeting: "Bom dia. Qual e o desafio comercial de hoje?",
    tenantIsolation: {
      scope: "generic_fallback",
      reason: "Fallback seguro para qualquer escritorio que ainda nao tenha playbook proprietario validado.",
      forbiddenOutsideScope: ["termos proprietarios de outro tenant", "teses nao validadas", "precificacao nao autorizada"],
    },
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
    intakeQuestions: [
      "Qual e o nome do escritorio e qual tom de voz ele usa com clientes?",
      "Qual area juridica e qual servico especifico esta sendo vendido?",
      "Quem e o cliente ideal, quais sinais qualificam o lead e quais sinais desqualificam?",
      "Qual dor concreta o cliente sente antes de contratar e qual custo de esperar?",
      "Qual tese, metodo, produto juridico ou escopo pode ser explicado com seguranca?",
      "Quais documentos minimos o MAYUS deve pedir antes de avancar?",
      "Quais provas, diferenciais, cases ou autoridades podem ser citados sem exagero?",
      "Quais promessas sao proibidas e quais frases precisam de revisao humana?",
      "Qual preco, forma de pagamento, politica de desconto e condicao especial estao autorizados?",
      "Quais objecoes mais aparecem e qual resposta aprovada para cada uma?",
      "Quando o MAYUS deve vender sozinho, marcar reuniao, abrir suporte ou chamar humano?",
      "Quais secoes o relatorio/playbook diario precisa trazer para esse escritorio?",
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
      "Cada escritorio deve validar area, promessa, provas, oferta, preco e objecoes antes de ativar operacao plena.",
      "O modelo estrutural e reutilizavel: resposta rapida, descoberta, decisor, termometro, encantamento, objecao e fechamento.",
      "MAYUS deve fazer o primeiro atendimento e acionar humano quando houver urgencia juridica, pedido especifico ou risco de promessa.",
    ],
  };
}

export function buildCommercialPlaybookModel(profile: CommercialPlaybookOfficeProfile = {}): CommercialPlaybookModel {
  return isDutraContext(profile) ? buildDutraBlindagemPlaybook() : buildGenericLegalSalesPlaybook(profile);
}

export function buildCommercialPlaybookSetup(input: CommercialPlaybookSetupInput = {}) {
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
  const model = dutraSpecific ? buildDutraBlindagemPlaybook() : buildGenericLegalSalesPlaybook(input);

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
    intake_questions: playbook.intakeQuestions,
    call_analysis_checklist: playbook.callAnalysisChecklist,
    daily_report_sections: playbook.dailyReportSections,
    adaptation_notes: playbook.adaptationNotes,
    playbook_key: playbook.playbookKey,
    activation_greeting: playbook.activationGreeting,
    tenant_isolation: playbook.tenantIsolation,
    mayus_role: "first_attendant_sdr_closer_router",
    requires_human_review_for_legal_commitments: true,
    external_side_effects_policy: "MAYUS pode responder primeira triagem segura; contrato, cobranca e promessa juridica exigem governanca.",
  };
}

export function buildCommercialPlaybookReply(playbook: CommercialPlaybookModel) {
  return [
    `Skill comercial criada para ${playbook.officeName}.`,
    `Escopo: ${playbook.tenantIsolation.scope}.`,
    `SLA do primeiro atendimento: ate ${playbook.firstResponseSlaMinutes} minutos.`,
    `Metodo: ${playbook.methodName}.`,
    `Fases ativas: ${playbook.steps.map((step) => step.title).join(" -> ")}.`,
    `Perguntas de configuracao: ${playbook.intakeQuestions.length}.`,
    "MAYUS atua como primeiro atendimento, qualifica, conduz descoberta, prepara fechamento e transfere quando houver pedido humano, urgencia juridica ou pessoa/setor especifico.",
  ].join("\n");
}

export function buildCommercialFirstReply(params: {
  leadName?: string | null;
  lastInboundText?: string | null;
  profile?: CommercialPlaybookOfficeProfile | null;
}) {
  const playbook = buildCommercialPlaybookModel(params.profile || {});
  const name = firstName(params.leadName);
  const normalized = normalizeText(params.lastInboundText);
  const context = shortContext(params.lastInboundText);
  const officeLabel = playbook.officeName === "Escritorio" ? "escritorio" : playbook.officeName;
  const opening = `Oi, ${name}. Aqui e o MAYUS, do ${officeLabel}. Vou cuidar da sua primeira triagem agora.`;

  if (playbook.playbookKey === "dutra_blindagem") {
    if (/reuni[aã]o|agenda|agendar|call|liga[cç][aã]o|telefone|marcar/.test(normalized)) {
      return [
        `Oi, ${name}. Perfeito, eu vou te ajudar a avancar com a Dutra.`,
        "Para marcar a conversa certa: voce quer analisar RMC/cartao consignado, GRAM, contracheque ou fechamento de proposta?",
        "Se puder, ja me mande o melhor periodo hoje e uma foto do contracheque para eu chegar na call sem chute.",
      ].join("\n\n");
    }

    if (/rmc|credcesta|bmg|cart[aã]o|consignado|desconto|contracheque/.test(normalized)) {
      return [
        `Oi, ${name}. Entendi o sinal de RMC/cartao consignado.`,
        "Antes de falar de valor, preciso entender a sangria: qual banco aparece no contracheque, qual valor desconta por mes e ha quanto tempo isso vem acontecendo?",
      ].join("\n\n");
    }

    if (/gram|gratifica[cç][aã]o|risco|ir|imposto/.test(normalized)) {
      return [
        `Oi, ${name}. Entendi sua duvida sobre GRAM.`,
        "Para eu qualificar certo: voce e servidor do RJ, a GRAM aparece no contracheque e voce ja entrou com alguma acao sobre esse desconto de IR?",
      ].join("\n\n");
    }
  }

  if (/humano|atendente|advogado|doutor|doutora|responsavel|falar com/.test(normalized)) {
    return [
      opening,
      "Claro, eu posso chamar a pessoa certa. Para eu encaminhar sem te fazer repetir tudo, me diga em uma frase: o assunto e urgencia, documentos, valor ou estrategia do caso?",
    ].join("\n\n");
  }

  if (/valor|preco|custa|honorario|honorarios|parcel/.test(normalized)) {
    return [
      opening,
      "Consigo te ajudar com valor, mas nao quero te passar nada no escuro. Primeiro preciso entender se faz sentido para o seu caso: sua duvida hoje e seguranca, prazo, documentos ou forma de pagamento?",
    ].join("\n\n");
  }

  if (/vou pensar|depois|mais tarde|nao sei/.test(normalized)) {
    return [
      opening,
      "Sem pressa artificial. Para eu nao te abandonar com uma duvida solta, o que falta para voce decidir: clareza do direito, confianca, tempo, valor ou falar com alguem?",
    ].join("\n\n");
  }

  return [
    opening,
    `${context ? `Vi sua mensagem sobre "${context}".` : "Vou entender seu caso antes de te direcionar."} Para eu te ajudar sem chute: o que aconteceu, quando foi e existe algum prazo ou documento importante?`,
  ].join("\n\n");
}
