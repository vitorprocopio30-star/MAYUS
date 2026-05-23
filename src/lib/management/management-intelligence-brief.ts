import type { TenantFinanceSummary } from "@/lib/finance/tenant-finance-summary";
import type { ManagementDataReadiness } from "./management-data-readiness";
import {
  extractManagementKnowledgeTermsFromText,
  listManagementKnowledgeTerms,
  type ManagementKnowledgeTerm,
} from "./management-knowledge-base";

export type ManagementIntelligenceBrief = {
  artifactType: "management_intelligence_brief";
  generatedAt: string;
  request: string | null;
  readiness: ManagementDataReadiness;
  summary: string;
  dataUsed: string[];
  gaps: string[];
  conceptCards: Array<{
    term: string;
    definition: string;
    officeExample: string;
    requiredData: string[];
    risk: string;
    ownerQuestion: string;
    sources: string[];
  }>;
  diagnosticQuestions: string[];
  scenarios: string[];
  guardrails: string[];
  nextAction: string;
};

export type BuildManagementIntelligenceBriefInput = {
  request?: string | null;
  readiness: ManagementDataReadiness;
  financeSummary?: TenantFinanceSummary | null;
  generatedAt?: string;
};

const DEFAULT_TERMS = ["pipeline", "conversao", "ticket-medio", "margem", "inadimplencia", "capacidade"];

function money(value: number) {
  return `R$ ${Math.round(value).toLocaleString("pt-BR")}`;
}

function selectTerms(request: string | null): ManagementKnowledgeTerm[] {
  const fromRequest = extractManagementKnowledgeTermsFromText(request || "");
  if (fromRequest.length > 0) return fromRequest.slice(0, 5);

  const terms = listManagementKnowledgeTerms();
  return DEFAULT_TERMS
    .map((slug) => terms.find((term) => term.slug === slug))
    .filter((term): term is ManagementKnowledgeTerm => Boolean(term));
}

export function buildManagementIntelligenceBrief(input: BuildManagementIntelligenceBriefInput): ManagementIntelligenceBrief {
  const readiness = input.readiness;
  const selectedTerms = selectTerms(input.request || null);
  const dataUsed = readiness.availableDataSources.length > 0
    ? readiness.availableDataSources
    : ["base conceitual Gestao Juridica BR"];
  const gaps = [...readiness.missingDataSources, ...readiness.blockers];

  const conceptCards = selectedTerms.map((term) => ({
    term: term.term,
    definition: term.simpleDefinition,
    officeExample: term.lawFirmExample,
    requiredData: term.requiredMayusData,
    risk: term.interpretationRisk,
    ownerQuestion: term.ownerDecisionQuestion,
    sources: term.sourceHints,
  }));

  const diagnosticQuestions = readiness.status === "blocked"
    ? [
      "Quais receitas recebidas, abertas e vencidas ja estao confiaveis no financeiro?",
      "O CRM registra origem, etapa, valor e motivo de ganho/perda?",
      "Cada processo/caso tem area, responsavel, documentos e valor vinculados?",
      "Existe reconciliacao entre proposta, contrato, cobranca, pagamento e caso aberto?",
    ]
    : [
      `Receita recebida mapeada: ${money(readiness.metrics.revenueReceived)}. Esse valor esta reconciliado com contratos e pagamentos?`,
      `Aberto/vencido mapeado: ${money(readiness.metrics.openCharges)} aberto, ${money(readiness.metrics.overdue)} vencido. O dono quer priorizar cobranca ou conversao?`,
      `Pipeline comercial mapeado: ${money(readiness.metrics.commercialPipeline)}. Quais oportunidades tem proximo compromisso real?`,
      "Quais areas consomem mais capacidade da equipe antes de justificar contratacao ou aumento de investimento?",
    ];

  const scenarios = readiness.status === "ready"
    ? [
      "Cenario de caixa: comparar recebido, vencido e forecast antes de assumir novo custo fixo.",
      "Cenario comercial: comparar origem, conversao e ticket medio antes de aumentar investimento em campanha.",
      "Cenario operacional: comparar tese, margem e capacidade antes de mudar foco de captacao.",
    ]
    : readiness.status === "partial"
      ? [
        "Cenario preliminar: usar apenas como pergunta de gestao, porque ainda ha lacunas de dados.",
        "Cenario de organizacao: priorizar reconciliacao financeiro/CRM antes de qualquer decisao forte.",
      ]
      : [
        "Sem dados suficientes, o MAYUS deve organizar financeiro, CRM e processos antes de estruturar cenarios.",
      ];

  const summary = readiness.status === "ready"
    ? "O MAYUS pode gerar um brief de inteligencia de gestao com dados reais, mantendo a decisao com o dono."
    : readiness.status === "partial"
      ? "O MAYUS pode levantar hipoteses e perguntas, mas ainda deve marcar baixa confianca por lacunas de dados."
      : "O MAYUS ainda nao deve opinar sobre gestao; primeiro precisa organizar dados financeiros, comerciais e operacionais.";

  return {
    artifactType: "management_intelligence_brief",
    generatedAt: input.generatedAt || new Date().toISOString(),
    request: input.request || null,
    readiness,
    summary,
    dataUsed,
    gaps,
    conceptCards,
    diagnosticQuestions,
    scenarios,
    guardrails: [
      "O MAYUS estrutura a decisao; quem assume o risco decide.",
      "Nao recomendar contratar, expandir, demitir, cortar equipe ou mudar preco como ordem.",
      "Toda leitura deve citar dados usados e lacunas.",
      "Marketing juridico deve respeitar limites eticos e revisao humana.",
      "Sem dados confiaveis, responder com checklist de organizacao.",
    ],
    nextAction: readiness.status === "blocked"
      ? readiness.nextOrganizationChecklist[0] || "Completar organizacao de dados antes da analise."
      : readiness.status === "partial"
        ? "Validar lacunas de dados antes de transformar hipoteses em decisao."
        : "Escolher uma decisao do dono para estruturar com numeros e cenarios.",
  };
}

export function buildManagementIntelligenceReply(brief: ManagementIntelligenceBrief) {
  const conceptLine = brief.conceptCards.length > 0
    ? `Conceitos usados: ${brief.conceptCards.map((card) => card.term).join(", ")}.`
    : "Conceitos usados: base curada Gestao Juridica BR.";

  return [
    "## Inteligencia de gestao",
    brief.summary,
    `Readiness: ${brief.readiness.status} (${brief.readiness.confidence}).`,
    `Dados usados: ${brief.dataUsed.join(", ")}.`,
    brief.gaps.length > 0 ? `Lacunas: ${brief.gaps.slice(0, 4).join("; ")}.` : "Lacunas: nenhuma critica nesta leitura.",
    conceptLine,
    `Pergunta principal: ${brief.diagnosticQuestions[0]}`,
    `Proxima acao: ${brief.nextAction}`,
    "Limite: nao executei decisao empresarial nem acao externa; isto e um brief para o dono decidir.",
  ].join("\n");
}
