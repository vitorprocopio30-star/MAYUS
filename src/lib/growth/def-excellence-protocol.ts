export type DefExcellenceSkillId =
  | "positioning_puv"
  | "strategic_retreat"
  | "diagnostic_discovery"
  | "pain_threshold"
  | "honesty_agreement"
  | "enchantment_bridge"
  | "variable_isolation"
  | "non_robotic_script"
  | "ethical_triggers"
  | "supervised_sparring";

export type DefExcellenceSkill = {
  id: DefExcellenceSkillId;
  label: string;
  objective: string;
  mayusBehavior: string;
  legalOfficeUse: string;
  qualityGate: string;
};

export type DefSkillMatrixInput = {
  legalArea?: string | null;
  phase?: string | null;
  channel?: string | null;
  discoveryCompleteness?: number | null;
  firmProfileCompleteness?: number | null;
};

function cleanText(value?: string | null) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text || null;
}

function normalizeText(value?: string | null) {
  return cleanText(value)
    ?.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase() || "";
}

export const DEF_EXCELLENCE_SKILLS: DefExcellenceSkill[] = [
  {
    id: "positioning_puv",
    label: "Perfil comercial e PUV",
    objective: "Definir cliente ideal, solucao central, promessa responsavel, pilares e anti-cliente antes de escalar atendimento.",
    mayusBehavior: "Investiga o posicionamento do escritorio e transforma em uma fonte de verdade reutilizavel.",
    legalOfficeUse: "Evita que cada atendente venda uma coisa diferente e reduz briga por preco.",
    qualityGate: "Nao usar discurso generico quando a PUV, cliente ideal ou anti-cliente ainda estiverem ausentes.",
  },
  {
    id: "strategic_retreat",
    label: "Recuo estrategico",
    objective: "Nao entrar em preco, contrato ou proposta antes de entender contexto e permissao do lead.",
    mayusBehavior: "Acolhe a pergunta e desloca a conversa para diagnostico com uma pergunta curta.",
    legalOfficeUse: "Protege o escritorio contra atendimento apressado, promessa juridica e lead curioso sem fit.",
    qualityGate: "Toda resposta prematura sobre valor deve isolar o motivo da pergunta antes de responder.",
  },
  {
    id: "diagnostic_discovery",
    label: "Descoberta diagnostica",
    objective: "Capturar situacao, motivacao, tentativas anteriores, urgencia, decisor, documentos e impeditivo real.",
    mayusBehavior: "Faz uma pergunta por vez e transforma respostas soltas em sinais estruturados do CRM.",
    legalOfficeUse: "Cria continuidade operacional: qualquer humano consegue assumir sem recomecar a conversa.",
    qualityGate: "Se a descoberta estiver fraca, MAYUS nao deve fechar, ofertar nem argumentar preco.",
  },
  {
    id: "pain_threshold",
    label: "Limiar de dor e decisao",
    objective: "Ajudar o lead a perceber impacto, custo de inacao e prioridade sem manipular medo.",
    mayusBehavior: "Aprofunda respostas automaticas com perguntas de impacto pratico e emocional.",
    legalOfficeUse: "Converte curiosidade em criterio de decisao, principalmente em casos parados ou normalizados pelo cliente.",
    qualityGate: "Nunca fabricar urgencia; usar apenas riscos, prazos e custos reais do caso.",
  },
  {
    id: "honesty_agreement",
    label: "Acordo de sinceridade",
    objective: "Criar um contrato conversacional: se fizer sentido avanca, se nao fizer sentido o lead pode dizer nao.",
    mayusBehavior: "Remove pressao e pede clareza para conduzir proximo passo com criterio.",
    legalOfficeUse: "Reduz sumico depois da proposta e melhora qualidade do follow-up.",
    qualityGate: "Fechamento bom deixa criterio, data, canal e responsavel; nao deixa expectativa solta.",
  },
  {
    id: "enchantment_bridge",
    label: "Ponte de encantamento",
    objective: "Conectar a dor capturada com a PUV, prova, metodo e mudanca concreta na vida do cliente.",
    mayusBehavior: "Resume o diagnostico antes de apresentar valor e usa linguagem do proprio lead.",
    legalOfficeUse: "Mostra valor juridico sem palestra tecnica e sem promessa de resultado.",
    qualityGate: "Encantamento so acontece depois de sinais suficientes de descoberta.",
  },
  {
    id: "variable_isolation",
    label: "Isolamento de variaveis",
    objective: "Separar objecao real de desculpa: preco, seguranca, tempo, decisor, prioridade ou fit.",
    mayusBehavior: "Acolhe, isola a variavel dominante e escolhe proximo movimento sem bater de frente.",
    legalOfficeUse: "Evita desconto reflexo e melhora respostas para 'vou pensar', 'esta caro' e 'preciso falar com alguem'.",
    qualityGate: "MAYUS nao rebate objecao antes de classificar o impedimento real.",
  },
  {
    id: "non_robotic_script",
    label: "Script nao robotico",
    objective: "Usar roteiro como trilho de decisao, nao como fala mecanica.",
    mayusBehavior: "Responde curto no WhatsApp, em blocos, com contexto especifico e pergunta unica.",
    legalOfficeUse: "Padroniza qualidade sem tirar naturalidade do atendimento.",
    qualityGate: "Mensagem com cara de template, muitos blocos ou perguntas em excesso deve ser reescrita.",
  },
  {
    id: "ethical_triggers",
    label: "Gatilhos eticos",
    objective: "Aplicar autoridade, especificidade, prova social, contraste e reciprocidade apenas quando houver base real.",
    mayusBehavior: "Usa gatilhos como evidencias de clareza, nao como pressao artificial.",
    legalOfficeUse: "Aumenta conversao sem ferir etica juridica nem criar promessa proibida.",
    qualityGate: "Escassez, autoridade, prova social ou resultado nunca podem ser inventados.",
  },
  {
    id: "supervised_sparring",
    label: "Sparring supervisionado",
    objective: "Treinar atendimento por simulacao, pontuar falhas e recomendar melhoria antes de colocar em producao.",
    mayusBehavior: "Analisa conversas e calls contra checklist DEF, guardrails juridicos e padrao do escritorio.",
    legalOfficeUse: "Transforma conhecimento comercial em melhoria continua da equipe.",
    qualityGate: "Toda sugestao de mudanca deve apontar comportamento observavel e proximo treino.",
  },
];

export function buildDefSkillMatrix(input: DefSkillMatrixInput = {}) {
  const phase = normalizeText(input.phase);
  const channel = normalizeText(input.channel);
  const discoveryCompleteness = Number(input.discoveryCompleteness || 0);
  const firmProfileCompleteness = Number(input.firmProfileCompleteness || 0);

  return DEF_EXCELLENCE_SKILLS.map((skill) => {
    const active = (
      skill.id === "positioning_puv" && firmProfileCompleteness < 85
    ) || (
      skill.id === "diagnostic_discovery" && (!phase || phase.includes("discover") || discoveryCompleteness < 70)
    ) || (
      skill.id === "non_robotic_script" && (!channel || channel.includes("whatsapp"))
    ) || (
      skill.id === "variable_isolation" && (phase.includes("objection") || phase.includes("closing"))
    ) || (
      skill.id !== "positioning_puv"
        && skill.id !== "diagnostic_discovery"
        && skill.id !== "non_robotic_script"
        && skill.id !== "variable_isolation"
    );

    return {
      ...skill,
      active,
      legalArea: cleanText(input.legalArea) || "atendimento juridico",
    };
  });
}

export function buildDefPromptProtocol() {
  return [
    "Protocolo MAYUS DEF de excelencia:",
    "1. Recuo: acolha a pergunta, mas nao venda no escuro.",
    "2. Descoberta: capture situacao, motivacao, tentativa anterior, urgencia, decisor, documentos e impeditivo.",
    "3. Limiar: ajude o lead a entender impacto real sem inventar urgencia.",
    "4. Encantamento: conecte diagnostico, PUV e prova responsavel antes de falar de preco.",
    "5. Isolamento: antes de rebater objecao, descubra se e valor, seguranca, tempo, decisor, prioridade ou fit.",
    "6. Fechamento: avance apenas quando houver clareza; proximo passo deve ter criterio, canal, responsavel e data.",
    "7. WhatsApp: responda em ate 2 blocos curtos, uma pergunta por vez, sem explicar metodologia.",
    "8. Etica juridica: nunca prometa resultado, invente prova social, crie escassez falsa ou envie cobranca/contrato sem governanca.",
  ].join("\n");
}

export function buildDefOfficeTrainingPlan() {
  return [
    "Treinar atendente para pedir permissao de diagnostico antes de falar de proposta.",
    "Revisar conversas onde preco apareceu cedo e marcar se houve isolamento de variavel.",
    "Criar biblioteca de perguntas por area juridica: situacao, motivacao, urgencia, prova e decisor.",
    "Auditar mensagens de WhatsApp para retirar texto institucional, excesso de perguntas e promessa juridica.",
    "Rodar sparring semanal com casos reais anonimizados e nota por descoberta, encantamento, objecao e fechamento.",
  ];
}

